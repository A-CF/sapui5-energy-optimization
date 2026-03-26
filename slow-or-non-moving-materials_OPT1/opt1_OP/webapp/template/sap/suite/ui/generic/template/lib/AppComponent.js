/*
 * ! SAP UI development toolkit for HTML5 (SAPUI5)

		(c) Copyright 2009-2015 SAP SE. All rights reserved
	
 */

// ----------------------------------------------------------------------------------
// This abstract class is used as common base class for all Components implementing a Smart Template based application.
// More precisely, when generating a project for a Smart Template based App a subclass of this class is generated as root component for the project.
//
// An instance of this class represents the Smart Template Application as a whole. Note that this instance is accessible for Template developers, for Break-out developers and even for external tools (e.g. Co-pilot).
// Therefore, the set of (public) methods is reduced to a minimum.
// Note that there are two other instances that represent the application as a whole:
// - the TemplateContract is responsible for data interchange between objects on framework level. Note that no class has been modeled for the TemplateContract.
//   See documentation below for more information about TemplateContract.
// - the Application (instance of sap.suite.ui.generic.template.lib.Application) represents the App for Template developers.
//
// Note that there are additional helper classes which are instantiated once per App (during startup of this class):
// - sap.ui.generic.app.ApplicationController from Denver layer
// - NavigationController, BusyHelper, ViewDependencyHelper from namespace sap.suite.ui.generic.template.lib
// -----------------------------------------------------------------------------------------------------------------------------------------------------------------
sap.ui.define([
	"sap/ui/core/UIComponent", "sap/m/NavContainer",
	"sap/f/FlexibleColumnLayout",
	"sap/ui/model/base/ManagedObjectModel",
	"sap/ui/model/Filter", "sap/ui/model/FilterOperator", "sap/ui/model/odata/MessageScope",
	"sap/ui/model/json/JSONModel", "sap/ui/model/resource/ResourceModel",
	"sap/ui/generic/app/ApplicationController",
	"sap/suite/ui/generic/template/lib/Application",
	"sap/suite/ui/generic/template/lib/BusyHelper",
	"sap/suite/ui/generic/template/lib/DataLossHandler",
	"sap/suite/ui/generic/template/lib/navigation/NavigationController",
	"sap/suite/ui/generic/template/lib/ProcessObserver",
	"sap/suite/ui/generic/template/lib/TemplateAssembler",
	"sap/suite/ui/generic/template/lib/CRUDHelper",
	"sap/suite/ui/generic/template/lib/ViewDependencyHelper",
	"sap/suite/ui/generic/template/lib/testableHelper",
	"sap/suite/ui/generic/template/support/lib/CommonMethods",
	"sap/suite/ui/generic/template/lib/FeLogger",
	"sap/base/util/extend",
	"sap/base/util/isPlainObject",
	"sap/suite/ui/generic/template/lib/FeError"
], function(UIComponent, NavContainer, FlexibleColumnLayout, ManagedObjectModel, Filter, FilterOperator, MessageScope, JSONModel, ResourceModel, ApplicationController,
	Application, BusyHelper, DataLossHandler, NavigationController,  ProcessObserver, TemplateAssembler, CRUDHelper, ViewDependencyHelper, testableHelper,
	CommonMethods, FeLogger, extend, isPlainObject, FeError) {
	"use strict";
	var	sClassName = "lib.AppComponent";

	var oLogger = new FeLogger(sClassName).getLogger();
	ApplicationController = testableHelper.observableConstructor(ApplicationController); // make the constructor accessible for unit tests

	var DraftIndicatorState = sap.m.DraftIndicatorState; // namespace cannot be imported by sap.ui.define

	var fnRegisterAppComponent = TemplateAssembler.getRegisterAppComponent(); // Retrieve the possibility to register at TemplateAssembler

	var oRB; // initialized on demand
	function getText() { // static method used to read texts from the i18n-file in the lib folder. Should only be used when no view is available.
		oRB = oRB || new ResourceModel({
			bundleName: "sap/suite/ui/generic/template/lib/i18n/i18n"
		}).getResourceBundle();
		return oRB.getText.apply(oRB, arguments);
	}

	function compoundObserver(){
		return new ProcessObserver({ processObservers: [] });
	}

	var oMessageModel = sap.ui.getCore().getMessageManager().getMessageModel();
	var oValidationMessasageFilter = new Filter({
			path: "validation",
			operator: FilterOperator.EQ,
			value1: true
		});

	// "Constructor": oAppComponent is the instance to be created. oAppId is an id provided by the testableHelper that can be used to end the productive mode
	function getMethods(oAppComponent, oAppId) {
		
		var	oTemplateContract = { // template contract object which is used for data interchange between framework classes
			oAppComponent: oAppComponent,
			ghostapp: (function(){
				var oGenericAppManifest = oAppComponent.getManifestEntry("sap.ui.generic.app"); // in edge cases not available at this point in time -> no ghost app
				return !!(oGenericAppManifest && oGenericAppManifest.settings && oGenericAppManifest.settings.ghostapp);
			})(), // if this is true, this app should not interfere with the environment
			componentRegistry: Object.create(null),	// registry for all TemplateComponents instantiated in the context of this App
													// maps the ids of these components on an object (called registry entry)
													// The registry entries are instantiated in function fnCreateTemplateComponent of NavigationController
													// They are inserted into the registry in method setContainer of TemplateComponent,
													// which can actually be found in TemplateAssembler
													// See documentation of function getComponentRegistryEntry in TemplateAssembler for the structure of the
													// registry entries
			aRunningSideEffectExecutions: [], // an array containing Promises for running side-effect executions
			getText: getText,
			oTemplatePrivateGlobalModel: (new JSONModel()).setDefaultBindingMode("TwoWay"), // a global model that can be used for declarative binding
			                                                                                // in the whole App as named model _templPrivGlobal.
			                                                                                // In function setGlobalTemplateModels it gets initial data
			                                                                                // and is attached to oAppComponent
			aStateChangers: [], // an array of agents that modify the url in order to store their state
			                   // a state changer can be added via Application.registerStateChanger.
			oPaginatorInfo: Object.create(null),	// Maps view levels onto paginator info objects that describe the paginator info
													// that is provided for the follow-up page.
													// The paginator objects are set in function storeObjectPageNavigationRelatedInformation of CommonEventHandlers.
													// Class sap.suite.ui.generic.template.detailTemplates.PaginatorButtonsHelper evaluates (and modifies) the content.
													// Function fnAdaptPaginatorInfoAfterNavigation of NavigationController does a cleanup of the content.
			oStatePreserversAvailablePromise: Promise.resolve(),	// a Promise that is resolved when all StatePreservers that are needed on the currently active pages are available
																	// Will be updated in ComponentUtils.setStatePreserverPromise
			oValidationMessageBinding: oMessageModel.bindList("/", null, null, oValidationMessasageFilter) // a list binding that filters all validation messages
		};
		oTemplateContract.oDataLossHandler = new DataLossHandler(oTemplateContract); // an object which expose methods that can be used to bring data loss popup at app level

		// the following additional properties are added to TemplateContract later:
		// - appSettings a model representing the settings of the app (by function init()). These settings are derived from the settings section in the manifest, but also take in account the defaults.
		// - oBusyHelper (instance of BusyHelper) by function createContent
		// - fnAddSideEffectPromise function to add a promise indicating running side effects
		// - oNavigationHost (the navigation control hosting the App) by function createContent
		// - oNavigationControllerProxy an instance providing access to some internal methods of the NavigationController.
		//   It is added in the constructor of the NavigationController.
		// - sRoutingType constant describing the type of oNavigationHost ("m" = NavContainer, "f" = FlexibleColumnLayout) by function createContent
		// - function createContent adds several instances and arrays of class ProcessObserver, namely:
		//   # oNavigationObserver observes whether any navigation is currently running
		//   # aNavigationObservers only available if App runs in FCL. Contains an observer for each column.
		//   # oHeaderLoadingObserver observes whether any header data are currently loaded. It is started and stopped in ComponentUtils.
		//   # aHeaderLoadingObservers only available if App runs in FCL. Contains an observer for each column.
		//   # oPagesDataLoadedObserver observes whether header data are currently loaded or a navigation is currently running.
		// - oApplicationProxy an 'interface' provided by Application for the framework classes. It is added in the constructor of Application.
		// - oShellServicePromise a Promise that resolves to the ShellService. Added in init().
		//   Note that the following methods of the ShellService are used: setTitle, setBackNavigation, and setHierarchy.
		// - oViewDependencyHelper helper class for refreshing view content. Added in init().
		// - bCreateRequestsCanonical flag whether we need to ensure that requests are shortened to the canonical path. Added in init().
		// - mEntityTree and mRoutingTree are two maps which are initialized (generateRoutingMetadataAndGetRootEntitySet) and filled (function createRoutes) by the routingHelper,
		//   while creating the routes.
		//   They map the names of the entity sets resp. the routes onto objects (called TreeNodes) containing metadata about the target of the route for the entitySet.
		//   Note that mRoutingTree contains one entry which is not contained in mEntityTree, namely the entry for the root-route.
		//   A Treenode contains the following properties:
		//   # sRouteName: name of the route (as published to the UI5 router) -> key for mRoutingTree
		//   # page: the corresponding page section of the manifest
		//   # componentCreated: a Promise that resolves to the TemplateComponent realizing this TreeNode
		//   # componentCreatedResolve: function that resolves to the Promise above. Will be deleted after it has been called and replaced by:
		//   # componentId: Id of the TemplateComponent realizing this TreeNode, as soon as this component exists.
		//   # getPath: a function(iMode, aKeys) which returns a path needed in this view (for the root always an empty string is returned)
		//     iMode might have the following values:
		//     * 1: return the pattern which is used in the definition of the route
		//     * 2: return the binding path which is used to bind the component
		//     * 3: return the canonical path for the component (identical to the case 2, if bCreateRequestsCanonical is true)
		//     aKeys is optional. If it is faulty the result still contains the placeholders for the keys {key<n>}). Otherwise they are replaced.
		//   # parentRoute: name of the route of the parent page (if existing)
		//   # level: hierarchy level
		//   # fCLLevel: Determines in FCL cases, in which column the corresponding view will be displayed:
		//     0, 1, 2 correspond to begin, mid, and end column. 3 corresponds to end column with no FCL action buttons
		//   # defaultLayoutType: Only for FCL: an optional layout type which overrules the default from the FCL settings
		//   # children: array containing the names of the child entity sets
		//   # navigationProperty: Navigation property leading to this entity set (if existing)
		//   # entitySet: The entity set for this TreeNode -> key for  mEntityTree
		//     Note: In case the node is defined with a routingSpec the routeName contained in this routingSpec is used as (virtual) entitySet.
		//           Moreover, if hierarchy level is at least 2, the same value is also set as (virtual) navigationProperty.
		//           This is prepared by function fnNormalizeRoutingInformation in this class.
		//   # parent: name of parent entity set, if existing
		//   # embeddedComponents, leadingComponents, facetsWithEmbeddedComponents: Maps that map the ids of the embedded reuse components (resp. the facet id that contains the reuse component) defined on the corresponding page onto some metadata of these reuse components.
		//     These properties are filled in function fnHandleEmbeddedComponents.
		//   # parentEmbeddedComponent: If the TreeNode is (directly) contained in an embedded component this property contains the id of this embedded component
		//     (the id is 'implementation' for the implementing component of a canvas page). Otherwise the property is faulty.
		//   # communicationObject: For pages which are embedded via reuse components: An object which can be used for communication with other pages
		//     This object can be retrieved via method getCommunicationObject of class Application.
		//     Note that the communication object will be left empty for all TreeNodes which are not (directly or indirectly) added via a reuse component.
		//     Instance variable oGlobalObject of class Application is used for this. It is initialized on demand.
		//   # noOData: information, whether the entitySet is virtual
		//   # noKey: true, if this page does not require additional key information compared to its parent page
		//   # isDraft: information, whether this page is draft aware
		//   # semanticObject: Information of the sematicObject of the entitySet
		//   # headerTitle: Title of the corresponding page
		//   # titleIconUrl: url for the title icon of the corresponding page
		//   # specificModelName: global model name which points to the OData model but for which binding context is pointing to the object (implicitly or explicitly) shown on the corresponding page
		//   # bindElement: function(oElement, sBindingPath, bForSpecificModel, oEvents) which binds a given control to a given binding path
		//     for either the global model specified above or the default model. Events may be passed.
		//     Expands needed for this page are used as far as currently known.
		//   The following properties of oTreeNode are set and modified during the runtime of the app
		//   # selectedPath: the canonical path which was used for the last child page of this page. It is set by fnUpdateParentModelsWithContext in class NavigationController.
		//   # text: display text for the the object (implicitly or explicitly) shown on the corresponding page, if different from headerTitle. Set by function setTextForTreeNode in class NavigationController
		// - oFlexibleColumnLayoutHandler (instance of FlexibleColumnLayoutHandler) only available if App runs in FCL. Added by function fnStartupRouter of routingHelper.

		oTemplateContract.oValidationMessageBinding.attachChange(Function.prototype); // initialization step required by UI5

		var oApplicationController; // instance of sap.ui.generic.app.ApplicationController
		var oNavigationController; // instance of NavigationController
		var fnDeregister; // function to be called to deregister at TemplateContract

		// Begin: Private helper methods called in init

		// This function instantiates the global private model that can be used as named model with name  _templPrivGlobal in all views and fragments.
		// Note: Only data which is shared across more than one page should be stored in this model.
		// Data which is used on one page only should be stored in the private model of the corresponding component.
		// Moreover, only data used for declarative binding should be stored in this model.
		// Data which is global, but is only needed in javascript coding, should be stored either in oTemplateContract or as instance variable in one
		// of the global helper classes (e.g. Application).
		// The content of this model may contain several 'sections'. The section with path '/generic' is already instantiated here.
		// Currently it is the only section being used.
		// The generic section contains the three parameters found below. Moreover, it contains two subsections, namely:
		// - FCL: only used in case the App runs in FCL. In this case the FlexibleColumnLayoutHandler instantiates and maintains this subsection
		// - messagePage: is used to control the MessagePage. It is set on demand by the NavigationController.
		// Moreover, this function attaches the ui5 message model as named model to the AppComponent with name _templPrivMessage
		function setGlobalTemplateModels(){
			var oParsingSerive = sap.ushell && sap.ushell.Container && sap.ushell.Container.getService("URLParsing");
			oTemplateContract.oTemplatePrivateGlobalModel.setProperty("/generic", {
					// information whether cross app navigation is supported
					crossAppNavSupport: !!oParsingSerive && oParsingSerive.isIntentUrl(document.URL),
					// Since draft saving is done globally, there is a global state which applies to all DraftIndicators
					draftIndicatorState: DraftIndicatorState.Clear,
					// if the ShellService is unavailable some of its tasks have to be done by ourselves. Assume that this is not the case.
					shellServiceUnavailable: false,
					// experimental: not yet used
					forceFullscreenCreate: false
			});
			oAppComponent.setModel(oTemplateContract.oTemplatePrivateGlobalModel, "_templPrivGlobal");
			oTemplateContract.oShellServicePromise.catch(function(){
				// it turns out that the ShellService is not available
				oTemplateContract.oTemplatePrivateGlobalModel.setProperty("/generic/shellServiceUnavailable", true);
			});
			var oMessageModel = sap.ui.getCore().getMessageManager().getMessageModel();
			oAppComponent.setModel(oMessageModel, "_templPrivMessage");
		}

		function attachToApplicationController() {
			oTemplateContract.fnAddSideEffectPromise = function(oPromise){
				var i = 0;
				for (; oTemplateContract.aRunningSideEffectExecutions[i]; ){
					i++;
				}
				oTemplateContract.aRunningSideEffectExecutions[i] = oPromise;
				var fnRemovePromise = function(){
					oTemplateContract.aRunningSideEffectExecutions[i] = null;
				};
				oPromise.then(fnRemovePromise, fnRemovePromise);
			};

			oApplicationController.attachEvent("beforeSideEffectExecution", function (oEvent) {
				var oPromise = oEvent.getParameter("promise");
				//this is just fix/workaround to provide a standard delay of 1000 ms (1s) in case of side effect scenario
				//Ideally, we should create a mechanism which uses busy indicator public methods to set the standard delay.
				setTimeout(oTemplateContract.oBusyHelper.setBusy.bind(null, oPromise), 1000);
				oTemplateContract.fnAddSideEffectPromise(oPromise);
			});

			var oTemplatePrivateGlobal = oAppComponent.getModel("_templPrivGlobal");
			var sDraftIndicatorState = "/generic/draftIndicatorState";

			oApplicationController.attachBeforeQueueItemProcess(function (oEvent) {
				if (oEvent.draftSave) {
					oTemplatePrivateGlobal.setProperty(sDraftIndicatorState, DraftIndicatorState.Saving);
				}
			});
			oApplicationController.attachOnQueueCompleted(function () {
				if (oTemplatePrivateGlobal.getProperty(sDraftIndicatorState) === DraftIndicatorState.Saving) {
					oTemplatePrivateGlobal.setProperty(sDraftIndicatorState, DraftIndicatorState.Saved);
				}
			});
			oApplicationController.attachOnQueueFailed(function () {
				if (oTemplatePrivateGlobal.getProperty(sDraftIndicatorState) === DraftIndicatorState.Saving) {
					oTemplatePrivateGlobal.setProperty(sDraftIndicatorState, DraftIndicatorState.Clear);
				}
			});

			oTemplatePrivateGlobal.setProperty("/generic/appComponentName", oAppComponent.getMetadata().getComponentName());
		}

		// End private helper methods called in init

		// Begin: Implementation of standard lifecycle methods

		function init(){
			var oAppRegistryEntry = {
				appComponent: oAppComponent,
				oTemplateContract: oTemplateContract,
				application: new Application(oTemplateContract),
				oViewDependencyHelper: new ViewDependencyHelper(oTemplateContract)
			};
			oTemplateContract.oViewDependencyHelper = oAppRegistryEntry.oViewDependencyHelper;
			oTemplateContract.oShellServicePromise = oAppComponent.getService("ShellUIService").catch(function(){
				// fallback to old generic logic if service is not defined in manifest
				var oShellServiceFactory = sap.ui.core.service.ServiceFactoryRegistry.get("sap.ushell.ui5service.ShellUIService");
				return ((oShellServiceFactory && oShellServiceFactory.createInstance()) || Promise.reject());
			});
			oTemplateContract.oShellServicePromise.catch(function(){
				oLogger.warning("No ShellService available");
			});
			var mSettings = getConfig().settings || Object.create(null);
			oAppComponent.applySettings(mSettings);
			(UIComponent.prototype.init || Function.prototype).apply(oAppComponent, arguments);
			oTemplateContract.appSettings = new ManagedObjectModel(oAppComponent);
			oTemplateContract.oBusyHelper.setBusy(oTemplateContract.oShellServicePromise);
			fnDeregister = fnRegisterAppComponent(oAppRegistryEntry);

			var oModel = oAppComponent.getModel();
			oTemplateContract.bCreateRequestsCanonical = true;
			var oMessageScopSupportedPromise = oModel.messageScopeSupported();
			oTemplateContract.oBusyHelper.setBusy(oMessageScopSupportedPromise);
			oMessageScopSupportedPromise.then(function(bMessageScopeSupported){
				if (bMessageScopeSupported){
					oModel.setMessageScope(MessageScope.BusinessObject);
					oTemplateContract.bCreateRequestsCanonical = false; // in this scenario the creation of the canonical requests will be done by the model
				}
				// workaround until Modules Factory is available
				oApplicationController = new ApplicationController(oModel);
				setGlobalTemplateModels();
				oNavigationController = new NavigationController(oTemplateContract);

				attachToApplicationController();
				CRUDHelper.enableAutomaticDraftSaving(oTemplateContract);

				// Error handling for erroneous metadata request
				// TODO replace access to oModel.oMetadata with official API call when available (recheck after 03.2016)
				// TODO move error handling to central place (e.g. create new MessageUtil.js)
				if ( (!oModel.oMetadata || !oModel.oMetadata.isLoaded()) || oModel.oMetadata.isFailed()) {
					oModel.attachMetadataFailed(function() {
						oNavigationController.navigateToMessagePage({
							title: getText("ST_GENERIC_ERROR_TITLE"),
							text: getText("ST_GENERIC_ERROR_SYSTEM_UNAVAILABLE"),
							icon: "sap-icon://message-error",
							description: getText("ST_GENERIC_ERROR_SYSTEM_UNAVAILABLE_DESC")
						});
						/* When the application's OData service's metadata document
						 * can't be retrieved or loaded, then none of children components
						 * can load. It is therefore important to look through those components
						 * and resolve their promises to register themselves with a view. */
						for (var childComponent in oTemplateContract.componentRegistry) {
							oTemplateContract.componentRegistry[childComponent].fnViewRegisteredResolve(true);
						}
					});
				}

				// busy handling for Diagnostics Plugin
				if (oAppComponent && oAppComponent.getMetadata() && oAppComponent.getMetadata().getManifest()) {
					// Set component id to allow access to manifest even when app does not load successfully.
					CommonMethods.setAppComponent(oAppComponent);
				}
				// Application status needs to be handled here to support use cases where Diagnostics Tool gets loaded after the app itself.
				CommonMethods.setApplicationStatus(CommonMethods.mApplicationStatus.LOADING);
				// Publish event on global event bus which will trigger Diagnostics Tool plugin when plugin is loaded.
				// When plugin is not loaded already, it will check the application status at initialisation.
				CommonMethods.publishEvent("elements", "ViewRenderingStarted", {});
			});
		}

		function createContent(){
			// Method must only be called once
			if (oTemplateContract.oNavigationHost){
				return "";
			}
			if (oTemplateContract.sRoutingType === "f"){
				var oFCL = new FlexibleColumnLayout();
				oTemplateContract.oNavigationHost = oFCL;
				oTemplateContract.aNavigationObservers = [
					new ProcessObserver({
						processName: "BeginColumnNavigation",
						eventHandlers: {
							attachProcessStart: oFCL.attachBeginColumnNavigate.bind(oFCL),
							attachProcessStop: oFCL.attachAfterBeginColumnNavigate.bind(oFCL)
					}}),
					new ProcessObserver({
						processName: "MidColumnNavigation",
						eventHandlers: {
							attachProcessStart: oFCL.attachMidColumnNavigate.bind(oFCL),
							attachProcessStop: oFCL.attachAfterMidColumnNavigate.bind(oFCL)
					}}), new ProcessObserver({
						processName: "EndColumnNavigation",
						eventHandlers: {
							attachProcessStart: oFCL.attachEndColumnNavigate.bind(oFCL),
							attachProcessStop: oFCL.attachAfterEndColumnNavigate.bind(oFCL)
					}})
				];
				oTemplateContract.oNavigationObserver = new ProcessObserver({
					processObservers: oTemplateContract.aNavigationObservers
				});
				oTemplateContract.aHeaderLoadingObservers = [compoundObserver(), compoundObserver(), compoundObserver()];
			} else {
				var oNavContainer = new NavContainer({
					id: oAppComponent.getId() + "-appContent"
				});
				oTemplateContract.oNavigationHost = oNavContainer;
				oTemplateContract.oNavigationObserver = new ProcessObserver({
					processName: "Navigation",
					eventHandlers: {
						attachProcessStart: oNavContainer.attachNavigate.bind(oNavContainer),
						attachProcessStop: oNavContainer.attachAfterNavigate.bind(oNavContainer)
				}});
			}
			oTemplateContract.oHeaderLoadingObserver = new ProcessObserver({
				processObservers: oTemplateContract.aHeaderLoadingObservers || []
			});
			oTemplateContract.oPagesDataLoadedObserver = new ProcessObserver({
				processObservers: [oTemplateContract.oHeaderLoadingObserver, oTemplateContract.oNavigationObserver]
			});
			oTemplateContract.oNavigationHost.addStyleClass(oTemplateContract.oApplicationProxy.getContentDensityClass());
			oTemplateContract.oBusyHelper = new BusyHelper(oTemplateContract);
			oTemplateContract.oBusyHelper.setBusyReason("HashChange", true, true);
			oTemplateContract.oBusyHelper.getUnbusy().then(function(){
				oTemplateContract.oShellServicePromise.then(function(oShellService){
					oShellService.setBackNavigation(oTemplateContract.oApplicationProxy.onBackButtonPressed);
				});
			});
			return oTemplateContract.oNavigationHost;
		}

		function exit() {
			oTemplateContract.ghostapp = true; // the component should not perform any actions after being exited
			if (oTemplateContract.oNavigationHost) {
				oTemplateContract.oNavigationHost.destroy();
			}
			if (oApplicationController) {
				oApplicationController.destroy();
			}
			if (oNavigationController) {
				oNavigationController.destroy();
			}
			if (oTemplateContract.oValidationMessageBinding){
				oTemplateContract.oValidationMessageBinding.destroy();
			}
			CommonMethods.setAppComponent(null);
			(UIComponent.prototype.exit || Function.prototype).apply(oAppComponent, arguments);
			fnDeregister();
			testableHelper.endApp(oAppId); // end of productive App
		}

		function suspend(){
			oTemplateContract.ghostapp = true;
			oTemplateContract.oNavigationControllerProxy.suspend();
		}

		function restore(){
			oTemplateContract.ghostapp = false;
			oTemplateContract.oNavigationControllerProxy.restore();
		}

		// End: Implementation of standard lifecycle methods

		function pagesMap2Array(input) {
			var output = Object.keys(input).map(function(key) {
				var page = input[key];
				//add the key to the array for reference
				//page["id"] = key;
				//Recursive call for nested pages
				if (page.pages) {
					page.pages = pagesMap2Array(page.pages);
				}
				return input[key];
			});
			return output;
		}

		function fnNormalizePagesMapToArray(oConfig){
			//Version 1.3.0 is made only to have a map in the app. descriptor with the runtime that accepts only pages
			//Background for the map are appdescriptor variants which are based on changes on an app. descriptor
			//Arrays don't work for changes as they do not have a stable identifier besides the position (index)
			//Once we have a runtime that accepts a map we need to increase the version to higher than 1.3.0 e.g. 1.4.0
			if (oConfig._version === "1.3.0" && oConfig.pages && isPlainObject(oConfig.pages)) {
				oConfig.pages = pagesMap2Array(oConfig.pages);
			}
		}

		// This is a temporary solution. It maps routing information onto 'virtual OData information', since the implementation currently
		// derives routing information only from OData information.
		function fnNormalizeRoutingInformation(aPages, iLevel){
			if (!aPages){
				return;
			}
			for (var i = 0; i < aPages.length; i++){
				var oPage = aPages[i];
				if (oPage.routingSpec && oPage.routingSpec.noOData){
					oPage.entitySet = oPage.routingSpec.routeName;
					if (iLevel > 1){
						oPage.navigationProperty = oPage.routingSpec.routeName;
					}
				}
				fnNormalizeRoutingInformation(oPage.pages, iLevel + 1);
				if (oPage.embeddedComponents){
					for (var sComponentId in oPage.embeddedComponents){
						var oEmbeddedComponent = oPage.embeddedComponents[sComponentId];
						if (oEmbeddedComponent.pages){
							oEmbeddedComponent.pages = pagesMap2Array(oEmbeddedComponent.pages);
							fnNormalizeRoutingInformation(oEmbeddedComponent.pages, iLevel + 1);
						}
					}
				}
				if (oPage.implementingComponent && oPage.implementingComponent.pages){
					oPage.implementingComponent.pages = pagesMap2Array(oPage.implementingComponent.pages);
					fnNormalizeRoutingInformation(oPage.implementingComponent.pages, iLevel + 1);
				}
			}
		}

		function fnNormalizeRouting(oConfig){
			fnNormalizeRoutingInformation(oConfig.pages, 0);
		}

		function fnAddMissingEntitySetsToQuickVariantSelectionX(oPage) {
			if (oPage) {
				var sLeadingEntitySet = oPage.entitySet;
				var oVariants = (oPage.component && oPage.component.settings && oPage.component.settings.quickVariantSelectionX && oPage.component.settings.quickVariantSelectionX.variants) || {};
				var isDifferentEntitySets = function(oVariants) {
					for (var sKey in oVariants) {
						var oVariant = oVariants[sKey];
						if (oVariant.entitySet) {
							return true;
						}
					}
					return false;
				};
				if (isDifferentEntitySets(oVariants)) {
					for (var sKey in oVariants) {
						var oVariant = oVariants[sKey];
						if (oVariant.entitySet === undefined) {
							oVariant.entitySet = sLeadingEntitySet;
						}
					}
				}
			}
		}

		function fnNormalizeQuickVariantSelectionXEntitySets(oConfig){
			fnAddMissingEntitySetsToQuickVariantSelectionX(oConfig.pages[0]);
		}

		// handling of deprecated properties which are still supported for compatibility reasons
		function fnNormalizeSettings(oSettings){
			if (oSettings && oSettings.objectPageDynamicHeaderTitleWithVM){
				oSettings.objectPageHeaderType = oSettings.objectPageHeaderType || "Dynamic";
				oSettings.objectPageVariantManagement = oSettings.objectPageVariantManagement || "VendorLayer";
			}
		}

		var oConfig; // initialized on demand
		function getConfig() {
			if (!oConfig) {
				var oMeta = oAppComponent.getMetadata();
				oConfig = oMeta.getManifestEntry("sap.ui.generic.app");
				if (!oConfig){ // test scenario
					return Object.create(null);
				}

				fnNormalizePagesMapToArray(oConfig);
				fnNormalizeRouting(oConfig);
				fnNormalizeQuickVariantSelectionXEntitySets(oConfig);
				fnNormalizeSettings(oConfig.settings);

			}
			return oConfig;
		}

		var oInternalManifest;  // initialized on demand
		function getInternalManifest() {
			if (!oInternalManifest) {
				//We need to copy the original manifest due to read-only settings of the object
				oInternalManifest = extend({}, oAppComponent.getMetadata().getManifest());
				//Overwrite the part with our app. descriptor (see getConfig)
				oInternalManifest["sap.ui.generic.app"] = getConfig();
			}
			return oInternalManifest;
		}

		// Overriding private method _getRouterClassName of Component. We do not want to have router class derived from manifest settings, but derive it
		// from whether we use FCL or not.
		function getRouterClassName(){
			var oFCLSettings = oAppComponent.getFlexibleColumnLayout();
			oTemplateContract.sRoutingType = oFCLSettings ? "f" : "m";
			return "sap." + oTemplateContract.sRoutingType + ".routing.Router";
		}

		var oMethods = {
			init: init,
			createContent: createContent,
			exit: exit,
			suspend: suspend,
			restore: restore,
			_getRouterClassName: getRouterClassName,
			getConfig: getConfig,
			getInternalManifest: getInternalManifest,

			getTransactionController: function() {
				return oApplicationController.getTransactionController();
			},

			getApplicationController: function() {
				return oApplicationController;
			},

			/*
			 * Returns the reference to the navigation controller instance that has been created by AppComponent.
			 *
			 * @returns {sap.suite.ui.generic.template.lib.NavigationController} the navigation controller instance
			 * @public
			 */
			getNavigationController: function() {
				return oNavigationController;
			}
		};

		// Expose selected private functions to unit tests
		/* eslint-disable */
		var fnNormalizePagesMapToArray = testableHelper.testable(fnNormalizePagesMapToArray, "fnNormalizePagesMapToArray");
		getConfig = testableHelper.testable(getConfig, "getConfig");
		/* eslint-enable */

		return oMethods;
	}

	return UIComponent.extend("sap.suite.ui.generic.template.lib.AppComponent", {
		metadata: {
			config: {
				title: "SAP UI Application Component", // TODO: This should be set from App descriptor
				fullWidth: true
			},
			properties: {
				// ghostapp: a boolean property which is not used publicly but only used to identify the ghostapp
				forceGlobalRefresh: {
					type: "boolean",
					defaultValue: true
				},
				considerAnalyticalParameters: {
					type: "boolean",
					defaultValue: false
				},
				// when showDraftToggle is true, it shows the draft toggle button on both LR and OP
				showDraftToggle: {
					type: "boolean",
					defaultValue: false
				},
				objectPageHeaderType: { // possible values are "Static" and "Dynamic"
					type: "string",
					defaultValue: "Static" // "Dynamic" is preferred, but for compatibility reasons "Static" is default
				},
				objectPageVariantManagement: { // possible values are "VendorLayer" and "None"
					type: "string",
					defaultValue: "None"
				},
				flexibleColumnLayout: {
					type: "object",
					defaultValue: null
				},
				inboundParameters: {
					type: "object",
					defaultValue: null
				},
				// "tableColumnVerticalAlignment" to set the vAlign property of columnListItem for responsive tables across LR,WL and OP
				tableColumnVerticalAlignment: {
					type: "string",
					defaultValue: "Middle"
				},
				//The column layout is used by default in the SmartForm on the object page
				useColumnLayoutForSmartForm: {
					type: "boolean",
					defaultValue: true
				}
			},
			events: {
				pageDataLoaded: {}
			},
			routing: {
				config: {
					async: true,
					viewType: "XML",
					viewPath: "",
					clearTarget: false
				},
				routes: [],
				targets: []
			},
			library: "sap.suite.ui.generic.template"
		},

		suppressDataLossPopup: function() {
			return false;
		},

		constructor: function() {
			var oAppId = testableHelper.startApp(); // suppress access to private methods in productive coding
			extend(this, getMethods(this, oAppId));
			(UIComponent.prototype.constructor || Function.prototype).apply(this, arguments);
		}
	});
});
