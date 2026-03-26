sap.ui.define(["sap/ui/base/Object",
	"sap/ui/model/base/ManagedObjectModel",
	"sap/suite/ui/generic/template/lib/FeLogger",
	"sap/suite/ui/generic/template/js/AnnotationHelper",
	"sap/suite/ui/generic/template/lib/CRUDActionHandler",
	"sap/base/util/extend",
	"sap/base/util/isEmptyObject",
	"sap/suite/ui/generic/template/lib/FeError"
	], function(BaseObject, ManagedObjectModel, FeLogger, AnnotationHelper, CRUDActionHandler, extend, isEmptyObject, FeError) {
	"use strict";
	var	sClassName = "lib.ComponentUtils";
	var oLogger = new FeLogger(sClassName).getLogger();
	var CONTEXT_FAILED = {
		isPreliminary: function(){
			return false;
		}
	};  // constant indicating that reading failed

	function getMethods(oComponent, oComponentRegistryEntry) {

		// oTreeNode contains the routing information about this component
		var oTreeNode = oComponentRegistryEntry.oTemplateContract.mRoutingTree[oComponentRegistryEntry.route];
		
		// This promise if resolved when the element binding for the header data have been read. Note that the promise
		// stored in this variable is replaced each time the function fnRebindHeaderData is called, unless the last Promise has not been resolved, yet.
		// Thus, the promise always represents the loading of the currently relevant header data.
		var oHeaderDataAvailablePromise;

		var fnHeaderDataAvailableResolve; // function to resolve the Promise (or null if it is resolved)
		
		var fnCallOnBindingChange; // method to be called when the binding change event is caught

		var oContextToAdaptTo;  // a context for an element binding that is still waiting to be analyzed

		var fnBusyResolve;
		var bIsDataLoading = false;
		var sLogicalBindingPath;   // the path the component is currently bound to logically (it might be a long path)

		var aCurrentKeys = [];

		var bNextNonDraftInEditMode = false;

		// Registry for the event handling facility (see fnAttach, fnDetach, and fnFire)
		var aEventHandlerRegistry = [];

		function getTemplatePrivateModel() {
			return oComponent.getModel("_templPriv");
		}

		function getViewLevel(){
			return oTreeNode.level;
		}

		function getPreprocessorsData(){
			return oComponentRegistryEntry.preprocessorsData;
		}

		function getRootExpand(){
			var oPreprocessorsData = getPreprocessorsData();
			if (oPreprocessorsData && oPreprocessorsData.rootContextExpand) {
					return oPreprocessorsData.rootContextExpand.join(',');
			}
		}

		function getParameterModelForTemplating(){
			return oComponentRegistryEntry.oParameterModel; // prepared by method createXMLView() in TemplateComponent
		}

		function fnAttach(sTemplate, sEvent, fnFunction) {
			if (typeof fnFunction !== "function") {
				throw new FeError(sClassName, "Event handler must be a function");
			}
			aEventHandlerRegistry.push({
				template: sTemplate,
				event: sEvent,
				handler: fnFunction
			});
		}

		function fnDetach(sTemplate, sEvent, fnFunction) {
			for (var i = aEventHandlerRegistry.length; i--; ) {
				if (aEventHandlerRegistry[i].handler === fnFunction && aEventHandlerRegistry[i].event === sEvent && aEventHandlerRegistry[i].template ===
					sTemplate) {
					aEventHandlerRegistry.splice(i, 1);
				}
			}
		}

		function fnFire(sTemplate, sEvent, oEvent) {
			for (var i = 0; i < aEventHandlerRegistry.length; i++) {
				if (aEventHandlerRegistry[i].event === sEvent && aEventHandlerRegistry[i].template === sTemplate) {
					aEventHandlerRegistry[i].handler(oEvent);
				}
			}
		}

		function getTemplateName(oController) {
			return oController.getMetadata().getName();
		}

		function isComponentActive(){
			return oComponentRegistryEntry.oApplication.isComponentActive(oComponent);
		}

		// returns a Promise that is already resolved if we are not in a navigation process for the container for this component. Otherwise it is resolved when the navigation process has finished.
		function getNavigationFinishedPromise(){
			return oComponentRegistryEntry.oNavigationObserver.getProcessFinished(true);
		}

		function fnPageDataLoadedOnNavigation(oContext, bCallReuseCallbacks){
			var oNavigationFinishedPromise = getNavigationFinishedPromise();
			oNavigationFinishedPromise.then(function() {
				if (isComponentActive()){
					if (bCallReuseCallbacks){
						fnCallPathUnchangedReuseCallbacks(true);
					}

					fnFire(getTemplateName(oComponentRegistryEntry.oController), "PageDataLoaded", {
						context: oContext
					});

					if (isDraftEnabled()) {
						// FE requests the DraftSibling on this occasion as the expectation is that UI is interactive
						// and following operations are completed
						// 	1. Header & Section data requests are completed
						// 	2. Navigation is completed
						// 	3. All the listners registered on the PageDataLoaded event is notified
						// FE request the sibling entity details in a promise and UI thread continue without waiting for the response.
						var oActiveEntity = oContext.getObject();
						if (!oActiveEntity.IsActiveEntity) {
							// Try getting the sibling entity only if the context is draft context
							oComponentRegistryEntry.oApplication.getDraftSiblingPromise(oContext);
						}
					}
				}
			});
		}

		function fnPreparePageDataLoaded() {
			oHeaderDataAvailablePromise.then(function(oContext) {
				if (oContext) {
					fnPageDataLoadedOnNavigation(oContext);
				}
			});
		}

		function fnStartBusy(){
			oComponentRegistryEntry.oHeaderLoadingObserver.startProcess();
			if (!fnBusyResolve){
				var oBusyPromise = new Promise(function(fnResolve){
					fnBusyResolve = fnResolve;
				});
				oComponentRegistryEntry.oApplication.getBusyHelper().setBusy(oBusyPromise);
			}
		}

		// creates a new oHeaderDataAvailablePromise if the old one was already resolved
		function fnNewDataAvailablePromise(){
			if (!fnHeaderDataAvailableResolve) { // the current HeaderDataAvailablePromise was already resolved -> create a new one
				oHeaderDataAvailablePromise = new Promise(function(fnResolve) {
					fnHeaderDataAvailableResolve = fnResolve;
				});
			}
		}
		if (oTreeNode.getPath(3)) {
		  fnNewDataAvailablePromise();
		} else {
		  oHeaderDataAvailablePromise = Promise.resolve();
		}

		function fnDataRequested(oEvent) {
			oLogger.info("Request header data", oEvent.getSource().getPath(), "Class sap.suite.ui.generic.template.lib.ComponentUtils");
			bIsDataLoading = true;
			fnNewDataAvailablePromise();
			if (!oComponent.getComponentContainer().getElementBinding().isSuspended()) {
				fnStartBusy();
			}
		}

		function fnEndBusy(){
			if (fnBusyResolve){
				fnBusyResolve();
				fnBusyResolve = null;
			}
			oComponentRegistryEntry.oHeaderLoadingObserver.stopProcess();
		}

		function getReadContext(oEvent){
			var oRet = oEvent.getSource().getBoundContext();
			if (oRet) {
				return oRet;
			}
			if (oComponent.getComponentContainer().getElementBinding().isSuspended()) {
				oRet = null;
			} else {
				oRet = CONTEXT_FAILED;
			}
			fnUnbind();
			return oRet;
		}

		function fnNavigateToDataLoadedFailedPage(){
			oComponentRegistryEntry.oTemplateContract.oNavigationControllerProxy.navigationContextNotFound();
		}

		function fnAdaptToContext(){
			bIsDataLoading = false;
			if (!oContextToAdaptTo){
				return;
			}
			if (oContextToAdaptTo === CONTEXT_FAILED){
				fnNavigateToDataLoadedFailedPage();
				fnUnbind();
			} else if (!oComponent.getComponentContainer().getElementBinding().isSuspended()) {
				var oBindingContext = oComponent.getBindingContext();
				var oContextInfo = registerContext(oBindingContext);
				var bIsEditable = oContextInfo.bIsDraft || bNextNonDraftInEditMode;
				var iDisplayMode;
				if (bIsEditable){
					bNextNonDraftInEditMode = false;
					iDisplayMode = oContextInfo.bIsCreate ? 4 : 2;
				} else {
					iDisplayMode = 1;
				}
				var oTemplatePrivateModel = getTemplatePrivateModel();
				oTemplatePrivateModel.setProperty("/objectPage/displayMode", iDisplayMode);
				var oUIModel = oComponent.getModel("ui");
				oUIModel.setProperty("/enabled", true);
				oUIModel.setProperty("/createMode", oContextInfo.bIsCreate);
				oUIModel.setProperty("/editable", bIsEditable);
				(oComponentRegistryEntry.methods.updateBindingContext || Function.prototype)(oBindingContext);
				if (fnHeaderDataAvailableResolve) {
					fnHeaderDataAvailableResolve(oContextToAdaptTo);
				}
			} else {
				return;
			}
			fnHeaderDataAvailableResolve = null;
			oContextToAdaptTo = null;
		}

		function fnDataReceived(oEvent){
			oLogger.info("Received header data", oEvent.getSource().getPath(), "Class sap.suite.ui.generic.template.lib.ComponentUtils");
			fnCallOnBindingChange();
			fnEndBusy();
			if (bIsDataLoading){ // otherwise this has already been handled by the Change-Handler
				oContextToAdaptTo = getReadContext(oEvent);
			}
			fnAdaptToContext();
		}

		function fnChange(oEvent) {
			fnCallOnBindingChange();
			var oContext = getReadContext(oEvent);
			if (oContext && oContext.isPreliminary()){
				return;
			}
			oContextToAdaptTo = oContext;
			fnAdaptToContext();
			oComponentRegistryEntry.oHeaderLoadingObserver.stopProcess();
		}

		// Note: This method is called by fnBindComponent only.
		// Therefore it is ensured, that oComponentRegistryEntry.viewRegistered is already resolved, when this method is called.
		function fnRebindHeaderData(sBindingPath) {
			oComponentRegistryEntry.oHeaderLoadingObserver.startProcess();
			var oBindingIsAvailablePromise = new Promise(function(fnResolve){
				fnCallOnBindingChange = fnResolve;
			});
			fnNewDataAvailablePromise();
			//In case the component needs to prepare anything
			if (oComponentRegistryEntry.methods.beforeRebind) {
				oComponentRegistryEntry.methods.beforeRebind(oBindingIsAvailablePromise);
			}
			oContextToAdaptTo = null;
			oTreeNode.bindElement(oComponent.getComponentContainer(), sBindingPath, false, {
				dataRequested: fnDataRequested,
				dataReceived: fnDataReceived,
				change: fnChange
			});
			sLogicalBindingPath = sBindingPath;
			//In case the component needs to reset anything
			if (oComponentRegistryEntry.methods.afterRebind) {
				oComponentRegistryEntry.methods.afterRebind();
			}
		}

		function fnUnbind(){
			fnNewDataAvailablePromise(); // old HeadrDataAvailablePromise points to outdated data
			var oComponentContainer = oComponent.getComponentContainer();
			oComponentContainer.unbindElement();
			oComponentContainer.setBindingContext();
			sLogicalBindingPath = null;
			oContextToAdaptTo = null;
			bIsDataLoading = false;
			fnEndBusy();
		}

		// Refreshes the content of aCurrentKeys and returns whether this was necessary.
		function fnCompareKeysAndStoreNewOnes(){
			var aNewKeys = getCurrentKeys();
			var bNoDifferenz = (aNewKeys.length === aCurrentKeys.length);
			for (var i = 0; i < aNewKeys.length && bNoDifferenz; i++){
				bNoDifferenz = aNewKeys[i] === aCurrentKeys[i];
			}
			aCurrentKeys = aNewKeys;
			return !bNoDifferenz;
		}

		function fnCallPathUnchangedReuseCallbacks(bUnconditional){
			oComponentRegistryEntry.reuseComponentsReady.then(function(mReuseComponentProxies){
				for (var sKey in mReuseComponentProxies){
					mReuseComponentProxies[sKey].pathUnchangedCallBack(bUnconditional);
				}
			});
		}

		function fnExecuteForAllReuseComponents(mReuseComponentProxies, fnFunction){
			var oRet = Object.create(null);
			for (var sKey in mReuseComponentProxies){
				var oProxy = mReuseComponentProxies[sKey];
				oRet[sKey] = fnFunction(oProxy, sKey);
			}
			return oRet;
		}

		function fnSetInitialVisibilityOfEmbeddedComponents(){
			var oTemplatePrivateModel = getTemplatePrivateModel();
			for (var sKey in oTreeNode.embeddedComponents){
				var bHiddenByDefault = !!oTreeNode.embeddedComponents[sKey].definition.hiddenByDefault;
				oTemplatePrivateModel.setProperty("/generic/embeddedComponents/" + sKey + "/hidden", bHiddenByDefault);
			}
		}

		// Note: This method is called by TemplateComponent.onActivate. The definition can be found in class TemplateAssembler.
		// There it is ensured that oComponentRegistryEntry.viewRegistered is already resolved, when this method is called.
		function fnBindComponent(sBindingPath, bIsComponentCurrentlyActive) {
			var bAreKeysDifferent = fnCompareKeysAndStoreNewOnes();
			if (bAreKeysDifferent && !bIsComponentCurrentlyActive){
				fnSetInitialVisibilityOfEmbeddedComponents();
			}
			if (!sBindingPath){
				if (oComponentRegistryEntry.routingSpec && oComponentRegistryEntry.routingSpec.noOData){
					fnPageDataLoadedOnNavigation(null, bAreKeysDifferent);
				}
				return;
			}
			var oComponentContainer = oComponent.getComponentContainer();
			if (!oComponentContainer){
				return;
			}
			var oUIModel = oComponent.getModel("ui");
			var bIsNonDraftCreate = !!oComponentRegistryEntry.nonDraftCreateContext;
			if (bIsNonDraftCreate) {
				var oBindingContext = oComponentContainer.getBindingContext();
				if (oBindingContext === oComponentRegistryEntry.nonDraftCreateContext){
					return; // page is already in correct state
				}
				oUIModel.setProperty("/enabled", true);
				oUIModel.setProperty("/editable", true);
				oUIModel.setProperty("/createMode", true);
				fnUnbind(); // unbind if bound to another context or an element binding
				if (fnHeaderDataAvailableResolve){
					fnHeaderDataAvailableResolve(oComponentRegistryEntry.nonDraftCreateContext);
					fnHeaderDataAvailableResolve = null;
				} else {
					oHeaderDataAvailablePromise = Promise.resolve(oComponentRegistryEntry.nonDraftCreateContext);
				}
				fnPreparePageDataLoaded();
				if (oComponentRegistryEntry.methods.beforeRebind) {
					oComponentRegistryEntry.methods.beforeRebind(oHeaderDataAvailablePromise);
				}
				oComponentContainer.setBindingContext(oComponentRegistryEntry.nonDraftCreateContext);
				Promise.all([oComponentRegistryEntry.oViewRenderedPromise, oComponentRegistryEntry.viewRegistered]).then(fnCallPathUnchangedReuseCallbacks.bind(null, true));
				if (oComponentRegistryEntry.methods.afterRebind) {
					oComponentRegistryEntry.methods.afterRebind();
				}			
			} else {
				var oElementBinding = oComponentContainer.getElementBinding();
				if (oElementBinding){
					if (sLogicalBindingPath === sBindingPath) {
						/*
						* component is already bound to this object - no rebound to avoid that 1:1, 1:N and expands are read
						* again
						*/
						if (oElementBinding.isSuspended()) {
							oElementBinding.resume();
							fnAdaptToContext();
						}
						if (bIsDataLoading){
							fnStartBusy();
						}
						oComponentRegistryEntry.oApplication.getBusyHelper().getUnbusy().then(fnCallPathUnchangedReuseCallbacks.bind(null, bAreKeysDifferent && oComponentRegistryEntry.routingSpec.noOData));
						if (!bIsComponentCurrentlyActive){
							fnPreparePageDataLoaded();
						}
						if (!bIsComponentCurrentlyActive && !isDraftEnabled()){ // in non-draft case: even if this object has been left in edit mode we now return to display mode, since the changes have already been discarded
							oUIModel.setProperty("/editable", false);
						}
						oUIModel.setProperty("/enabled", true);
						return;
					} else if (!bIsComponentCurrentlyActive){
						fnUnbind();
					}
				}
				// the following properties will be adapted by the change event of the binding
				oUIModel.setProperty("/enabled", false);
				oUIModel.setProperty("/editable", false);
				oUIModel.setProperty("/createMode", false);
				// and read the header data if necessary
				fnRebindHeaderData(sBindingPath);

				fnPreparePageDataLoaded();
			}
		}

		// This method can be called in two scenarios:
		// a) Cancel of a draft -> oDiscardPromise will tell when cancellation has been performed successfully
		// b) Explicit or implicit leaving of a non-draft edit scenario -> oDiscardpromise is faulty
		// Note: In case b) it is not clear whether we are in edit mode at all
		// It cleans up th model, resets property editable in ui-model and fires cancel event
		// Note: In non-draft case we might be leaving an edit scenario which is not reflected by ui>/editable.
		// This would be the case if application has implemented its own edit logic and only informs us via an unsavedDataCheckFunction.
		// If this is the case bEnforceCancelEvent will be true.
		// Conclusion: the Cancel event is triggered if ui>/editable is true (we know that we are in edit mode) or when bEnforceCancelEvent is true (dataloss has been confirmed).
		function fnCancelEdit(oDiscardPromise, bEnforceCancelEvent){
			var oEvent = {};
			if (oDiscardPromise){
				oEvent.discardPromise = oDiscardPromise;
			}
			var oModel = oComponent.getModel();
			if (oModel.hasPendingChanges()) {
				var oView = oComponentRegistryEntry.oController.getView();
				oView.setBindingContext(null);
				oModel.resetChanges();
				oView.setBindingContext();
			}
			var oUiModel = oComponent.getModel("ui");
			if (bEnforceCancelEvent || oUiModel.getProperty("/editable")){ // might be false in case b)
				delete oComponentRegistryEntry.nonDraftCreateContext; // throw away old non-draft create context if there was one
				oUiModel.setProperty("/editable", false);
				if (oDiscardPromise){
					oDiscardPromise.catch(function(){
						oUiModel.setProperty("/editable", true); // if cancellation of draft failed -> stay in edit mode
					});
				} else {
					var oTemplatePrivateModel = getTemplatePrivateModel();
					oTemplatePrivateModel.setProperty("/objectPage/displayMode", 1);
				}
				fnFire(getTemplateName(oComponentRegistryEntry.oController), "AfterCancel", oEvent);
			}
		}

		function getNonDraftCreatePromise(sEntitySet, oPredefinedValues){
			return isDraftEnabled() ? null : oComponentRegistryEntry.oTemplateContract.oNavigationControllerProxy.navigateForNonDraftCreate(sEntitySet, oPredefinedValues);
		}

		function fnAdaptUrlAfterNonDraftCreateSaved(oSavedContext, bStayInEdit){
			bNextNonDraftInEditMode = bStayInEdit;
			oComponentRegistryEntry.oTemplateContract.oNavigationControllerProxy.adaptUrlAfterNonDraftCreateSaved(oSavedContext);
		}

		function fnRefreshBindingUnconditional(){
			var oElementBinding = oComponent.getComponentContainer().getElementBinding();
			if (oElementBinding) {
				oComponent.getModel().invalidateEntry(oElementBinding.getBoundContext());
				if (oElementBinding.isSuspended()){ // component is currently invisible
					fnUnbind();
				} else { // component is currently visible
					oElementBinding.refresh(true); // trigger reload of data
				}
			}
		}

		function fnRefreshBinding(bUnconditional) {
			bUnconditional = bUnconditional || oComponent.getIsRefreshRequired();
			if (bUnconditional || !isEmptyObject(oComponentRegistryEntry.mRefreshInfos)) {
				(oComponentRegistryEntry.methods.refreshBinding || Function.prototype)(bUnconditional, oComponentRegistryEntry.mRefreshInfos);
				oComponent.setIsRefreshRequired(false);
				oComponentRegistryEntry.mRefreshInfos = Object.create(null);
			}
			fnCallPathUnchangedReuseCallbacks(bUnconditional);
		}

		function fnMessagesRefresh(){
			var oModel = oComponent.getModel();
			var oParameters = {
				canonicalRequest: !oComponentRegistryEntry.oTemplateContract.bCreateRequestsCanonical, // either we or the framework must set the requests to be canonical
				batchGroupId: "facets",
				updateAggregatedMessages: true
			};
			oModel.read(sLogicalBindingPath, oParameters);
		}

		// This function will be called before any draft transfer (that is edit/cancel/save in a draft base app is called).
		// oTransferEnded is a Promise that will be resolved/rejected as soon as this draft transfer has finished sucessfully/unsuccessfully
		function onBeforeDraftTransfer(oTransferEnded){
			if (isDraftEnabled()){
				var oComponentContainer = oComponent.getComponentContainer();
				var oElementBinding = oComponentContainer.getElementBinding();
				if (oElementBinding && !oElementBinding.isSuspended()){
					oElementBinding.suspend(); // suspend the binding to supress any refresh operation which is done during the activation process
					oTransferEnded.catch(function(){ // if the transfer process has failed the binding needs to be reactivated, since it is now active again
						oElementBinding.resume();
					});
				}
			}
		}

		function fnSuspendBinding(){
			var oComponentContainer = oComponent.getComponentContainer();
			if (oComponentRegistryEntry.nonDraftCreateContext){
				oComponentContainer.setBindingContext();
				delete oComponentRegistryEntry.nonDraftCreateContext;
				return;
			}
			var oElementBinding = oComponentContainer.getElementBinding();
			if (oElementBinding && !oElementBinding.isSuspended()){ // suspend element bindings of inactive components
				// if there are validation messages remove the binding. This also removes the validation messages, such that they are not visible on the next page
				if (oComponentRegistryEntry.oTemplateContract.oValidationMessageBinding.getLength()){
					fnUnbind();
				} else {
					oElementBinding.suspend();
				}
				fnEndBusy();
			}
		}

		function registerContext(oContext){
			var iViewLevel = getViewLevel();
			return oComponentRegistryEntry.oApplication.registerContext(oContext, iViewLevel, oComponent.getEntitySet());
		}

		// Helper method for getBreadCrumbInfo. Only used if oTreeNode.level is at least 2.
		function fnBuildBreadCrumbInfo(oAncestorNode){
			if (oAncestorNode.level < 2){
				return [oAncestorNode.entitySet];
			}
			var oParentNode = oComponentRegistryEntry.oTemplateContract.mRoutingTree[oAncestorNode.parentRoute];
			var aRet = fnBuildBreadCrumbInfo(oParentNode);
			if (oAncestorNode !== oTreeNode){ // Do not add a self-reference
				aRet.push(oAncestorNode.navigationProperty ? aRet[oParentNode.level - 1] + "/" + oAncestorNode.navigationProperty : oAncestorNode.entitySet);
			}
			return aRet;
		}

		// Returns an array of strings containing info for bread-crumb
		function getBreadCrumbInfo(){
			return oTreeNode.level < 2 ? [] : fnBuildBreadCrumbInfo(oTreeNode);
		}
		
		function fnRegisterAncestorTitleUpdater(oControl, sProperty, iAncestorLevel){
			var oAncestorNode;
			for (oAncestorNode = oTreeNode; oAncestorNode.level > iAncestorLevel;){
				oAncestorNode = oComponentRegistryEntry.oTemplateContract.mRoutingTree[oAncestorNode.parentRoute];
			}
			var oPropertiesModel = new ManagedObjectModel(oControl);
			oPropertiesModel.bindProperty("/" + sProperty).attachChange(function(oEvent){
				var sTitle = oEvent.getSource().getValue();
				oComponentRegistryEntry.oTemplateContract.oNavigationControllerProxy.setTextForTreeNode(oAncestorNode, sTitle);
			});
			// Temporary solution (AncestorFeature)
			oAncestorNode.contextTargets = oAncestorNode.contextTargets || [];
			oAncestorNode.contextTargets.push(oControl);
		}

		function getCurrentKeys(){
			return oComponentRegistryEntry.oApplication.getCurrentKeys(getViewLevel());
		}

		function getCommunicationObject(iLevel){
			return oComponentRegistryEntry.oApplication.getCommunicationObject(oComponent, iLevel);
		}

		function fnNavigateRoute(sRouteName, sKey, sEmbeddedKey, bReplace){
			oComponentRegistryEntry.oTemplateContract.oNavigationControllerProxy.navigateToChild(oTreeNode, sRouteName, sEmbeddedKey, sKey, bReplace);
		}

		function fnNavigateAccordingToContext(oNavigationContext, iDisplayMode, bReplace){
			oComponentRegistryEntry.oTemplateContract.oNavigationControllerProxy.navigateFromNodeAccordingToContext(oTreeNode, oNavigationContext, iDisplayMode, bReplace);
		}

		function getTitle(){
			return oTreeNode.headerTitle;
		}

		// set the object title into the tree node
		function setText(sText){
			oComponentRegistryEntry.oTemplateContract.oNavigationControllerProxy.setTextForTreeNode(oTreeNode, sText);
		}

		function isDraftEnabled() {
			return oTreeNode.isDraft;
		}

		function isODataBased(){
			return !(oComponentRegistryEntry.routingSpec && oComponentRegistryEntry.routingSpec.noOData);
		}

		// Returns whether state messages should be supressed when reading tables or charts
		// This is true, if message scope has been set to BusinessObject, which is true exactly when oTemplateContract.bCreateRequestsCanonical was set to false
		function getNoStateMessagesForTables(){
			return !oComponentRegistryEntry.oTemplateContract.bCreateRequestsCanonical;
		}

		function getHeaderDataAvailablePromise(){
			return oHeaderDataAvailablePromise;
		}

		// get the paginator info relevant for me
		function getPaginatorInfo(){
			return oComponentRegistryEntry.oTemplateContract.oPaginatorInfo[getViewLevel() - 1];
		}

		// set the paginator info. This is done either for the children (when navigating to an item) or for my own level
		// (this is used to modify the paginator buttons, when they are used for navigation).
		function setPaginatorInfo(oPaginatorInfo, bForChildren){
			var iViewLevel = getViewLevel();
			if (!bForChildren){
				iViewLevel--;
			}
			oComponentRegistryEntry.oTemplateContract.oPaginatorInfo[iViewLevel] = oPaginatorInfo;
		}

		function onVisibilityChangeOfReuseComponent(bIsGettingVisible, oComponentContainer){
			oComponentRegistryEntry.reuseComponentsReady.then(function(mReuseComponentProxies){
				var oEmbeddedComponent = oComponentContainer.getComponentInstance();
				for (var sReuseComponentId in mReuseComponentProxies){
					if (oEmbeddedComponent === mReuseComponentProxies[sReuseComponentId].component){
						var oTemplatePrivateModel = getTemplatePrivateModel();
						oTemplatePrivateModel.setProperty("/generic/embeddedComponents/" + sReuseComponentId + "/isInVisibleArea", bIsGettingVisible);
						return;
					}
				}
			});
		}

		
		function fnStateChanged(){
			return oComponentRegistryEntry.oStatePreserverPromise.then(function(oStatePreserver){
				return oStatePreserver.stateChanged();
			});
		}

		// Adds a property oStatePreserverPromise to the oComponentRegistryEntry. This is a Promise that resolves to the StatePreserver instance that is used for this component.
		// It uses the getCurrentState and applyState methods which are already available in the oComponentRegistryEntry and adds functionality for the Reuse Components.
		oComponentRegistryEntry.oStatePreserverPromise = oComponentRegistryEntry.reuseComponentsReady.then(function(mReuseComponentProxies){
			var oStatePreserverSettings = oComponentRegistryEntry.methods.getStatePreserverSettings && oComponentRegistryEntry.methods.getStatePreserverSettings();
			if (!oStatePreserverSettings){ // temporarily we allow floorplans which do not need a StatePreserver
				// provide dummy implementations for StatePreserver methods expected by some framework functions
				return {
					getUrlParameterInfo: function (){return Promise.resolve({});},
					applyAppState: Function.prototype,
					stateChanged: Function.prototype
				};				
			}
			// determine the page specific app state name. 
			var sAppStateName = "sap-iapp-state" + (oTreeNode.level ===  0 ? "" : "-" +  oTreeNode.entitySet);
			var oSettings = extend({
				appStateName: encodeURI(sAppStateName),
				getCurrentState: function(){
					var oRet = oComponentRegistryEntry.methods.getCurrentState ? oComponentRegistryEntry.methods.getCurrentState() : Object.create(null);
					var fnAddReuseInfo = function(oProxy, sKey){
						if (oProxy.component.stGetCurrentState){
							var oTempState = oProxy.component.stGetCurrentState();
							for (var sCustomKey in oTempState){
								oRet["$embeddedComponent$" + sKey.length + "$" + sKey + "$" + sCustomKey] = oTempState[sCustomKey];
							}
						}
					};
					fnExecuteForAllReuseComponents(mReuseComponentProxies, fnAddReuseInfo);
					return oRet;
				},
				applyState: function(oState, bIsSameAsLast){
					var oViewState = Object.create(null);
					var oEmbeddedStates = Object.create(null);
					for (var sKey in oState){
						if (sKey.indexOf("$embeddedComponent$") === 0){ // entry belongs to a reuse component
							var sInnerKey = sKey.substring(19); // strip the prefix
							var iOffset = sInnerKey.indexOf("$");
							var iEmbeddedKeyLength = Number(sInnerKey.substring(0, iOffset));
							var sEmbeddedKey = sInnerKey.substring(iOffset + 1, iOffset + iEmbeddedKeyLength + 1);
							var oEmbeddedState = oEmbeddedStates[sEmbeddedKey];
							if (!oEmbeddedState){
								oEmbeddedState = Object.create(null);
								oEmbeddedStates[sEmbeddedKey] = oEmbeddedState;
							}
							var sCustomKey = sInnerKey.substring(iOffset + iEmbeddedKeyLength + 2);
							oEmbeddedState[sCustomKey] = oState[sKey];
						} else {
							oViewState[sKey] = oState[sKey];
						}
					}
					(oComponentRegistryEntry.methods.applyState || Function.prototype)(oViewState, bIsSameAsLast);
					var fnApplyReuseInfo = function(oProxy, sMyKey){
						if (oProxy.component.stApplyState){
							oProxy.component.stApplyState(oEmbeddedStates[sMyKey] || Object.create(null), bIsSameAsLast);
						}
					};
					Promise.all([oComponentRegistryEntry.oViewRenderedPromise, oHeaderDataAvailablePromise]).then(fnExecuteForAllReuseComponents.bind(null, mReuseComponentProxies, fnApplyReuseInfo));
				},
				oComponent: oComponent
			}, oStatePreserverSettings);
			var oStatePreserver = oComponentRegistryEntry.oApplication.getStatePreserver(oSettings);
			oComponentRegistryEntry.oApplication.registerStateChanger(oStatePreserver.getAsStateChanger());
			return oStatePreserver;
		});
		oComponentRegistryEntry.oTemplateContract.oStatePreserversAvailablePromise = Promise.all([oComponentRegistryEntry.oTemplateContract.oStatePreserversAvailablePromise, oComponentRegistryEntry.oStatePreserverPromise]);

		function getFclProxy() {
			var oFlexibleColumnLayoutHandler = oComponentRegistryEntry.oTemplateContract.oFlexibleColumnLayoutHandler;
			return oFlexibleColumnLayoutHandler ? oFlexibleColumnLayoutHandler.getFclProxy(oTreeNode) : {
				handleDataReceived: oTreeNode.level ? null : Function.prototype,
				isListAndFirstEntryLoadedOnStartup: oTreeNode.level ? null : Function.prototype,
				isNextObjectLoadedAfterDelete: Function.prototype
			};
		}

		// returns the settings from the manifest
		function getSettings(){
			return oTreeNode.page.component.settings || {};
		}

		// returns the extensions defined in manifest for this component
		function getExtensions(){
			var oManifest = oComponent.getAppComponent().getManifestEntry("sap.ui5");
			var oExtensions = oManifest.extends && oManifest.extends.extensions && oManifest.extends.extensions["sap.ui.controllerExtensions"];
			oExtensions = oExtensions && oExtensions[oComponent.getTemplateName()];
			oExtensions = oExtensions && oExtensions["sap.ui.generic.app"];
			return oExtensions && oExtensions[oComponent.getEntitySet()];
		}

		function fnRegisterUnsavedDataCheckFunction(fnHasUnsavedData){
			oComponentRegistryEntry.aUnsavedDataCheckFunctions = oComponentRegistryEntry.aUnsavedDataCheckFunctions || [];
			oComponentRegistryEntry.aUnsavedDataCheckFunctions.push(fnHasUnsavedData);
		}

		// This method is called when the FCL layout has changed from the last time this component was displayed to the current display of this component
		function fnLayoutChanged(sLastLayout, sCurrentLayout){
			if (oComponentRegistryEntry.methods.getTableForChildContext){
				var oTemplatePrivateModel = getTemplatePrivateModel();
				var sCurrentChildContext = oTemplatePrivateModel.getProperty("/generic/currentActiveChildContext");
				var oSmartTable = sCurrentChildContext && oComponentRegistryEntry.methods.getTableForChildContext(sCurrentChildContext);
				if (oSmartTable){
					var oTable = oSmartTable.getTable();
					if (oComponentRegistryEntry.oControllerUtils.oCommonUtils.isMTable(oTable)){ // currently only mTable is supported
						var aItems = oTable.getItems();
						for (var i = 0; i < aItems.length; i++){
							var oListItem = aItems[i];
							if (oListItem.getBindingContextPath() === sCurrentChildContext){
								oTable.scrollToIndex(i);
								break;
							}
						}
					}
				}
			}
		}
		
		var oCRUDActionHandler; // initialized on demand
		function getCRUDActionHandler(){
			oCRUDActionHandler = oCRUDActionHandler || new CRUDActionHandler(oComponentRegistryEntry.oTemplateContract, oComponentRegistryEntry.oController, oComponentRegistryEntry.oControllerUtils.oCommonUtils);
			return oCRUDActionHandler;
		}
		//Executes floorplan specific logic after invokeActions is executed and Promise is available
		function executeAfterInvokeActionFromExtensionAPI(oState) {
			if (oComponentRegistryEntry.methods.executeAfterInvokeActionFromExtensionAPI) {
				oComponentRegistryEntry.methods.executeAfterInvokeActionFromExtensionAPI(oState, oComponentRegistryEntry.oControllerUtils.oCommonUtils);
			}
		}
		//Executes floorplan specific logic before invokeActions is executed
		function executeBeforeInvokeActionFromExtensionAPI(oState) {
			if (oComponentRegistryEntry.methods.executeBeforeInvokeActionFromExtensionAPI) {
				oComponentRegistryEntry.methods.executeBeforeInvokeActionFromExtensionAPI(oState, oComponentRegistryEntry.oControllerUtils.oCommonUtils);
			}
		}

		return {
			getBusyHelper: function() {
				return oComponentRegistryEntry.oApplication.getBusyHelper();
			},

			attach: function(oController, sEvent, fnFunction) {
				fnAttach(getTemplateName(oController), sEvent, fnFunction);
			},
			detach: function(oController, sEvent, fnFunction) {
				fnDetach(getTemplateName(oController), sEvent, fnFunction);
			},
			fire: function(oController, sEvent, oEvent) {
				fnFire(getTemplateName(oController), sEvent, oEvent);
			},

			// temporary solution
			isListReportTemplate: function(){
				return AnnotationHelper.isListReportTemplate(oComponentRegistryEntry.routeConfig);
			},

			getPreprocessorsData: getPreprocessorsData,
			getRootExpand: getRootExpand,
			getParameterModelForTemplating: getParameterModelForTemplating,
			bindComponent: fnBindComponent,
			cancelEdit: fnCancelEdit,
			getNonDraftCreatePromise: getNonDraftCreatePromise,
			adaptUrlAfterNonDraftCreateSaved: fnAdaptUrlAfterNonDraftCreateSaved,
			refreshBinding: fnRefreshBinding,
			refreshBindingUnconditional: fnRefreshBindingUnconditional,
			suspendBinding: fnSuspendBinding,
			messagesRefresh: fnMessagesRefresh,
			getTemplatePrivateModel: getTemplatePrivateModel,
			registerContext: registerContext,
			getViewLevel: getViewLevel,
			getBreadCrumbInfo: getBreadCrumbInfo,
			registerAncestorTitleUpdater: fnRegisterAncestorTitleUpdater,
			getCurrentKeys: getCurrentKeys,
			getCommunicationObject: getCommunicationObject,
			navigateRoute: fnNavigateRoute,
			navigateAccordingToContext: fnNavigateAccordingToContext,
			getTitle: getTitle,
			setText: setText,
			onBeforeDraftTransfer: onBeforeDraftTransfer,
			isDraftEnabled: isDraftEnabled,
			isODataBased: isODataBased,
			getNoStateMessagesForTables: getNoStateMessagesForTables,
			isComponentActive: isComponentActive,
			navigateToDataLoadedFailedPage: fnNavigateToDataLoadedFailedPage,
			getHeaderDataAvailablePromise: getHeaderDataAvailablePromise,
			getPaginatorInfo: getPaginatorInfo,
			setPaginatorInfo: setPaginatorInfo,
			onVisibilityChangeOfReuseComponent: onVisibilityChangeOfReuseComponent,
			getNavigationFinishedPromise: getNavigationFinishedPromise,
			stateChanged: fnStateChanged,
			unbind: fnUnbind,
			getFclProxy: getFclProxy,
			getSettings: getSettings,
			getExtensions: getExtensions,
			registerUnsavedDataCheckFunction: fnRegisterUnsavedDataCheckFunction,
			layoutChanged: fnLayoutChanged,
			getCRUDActionHandler: getCRUDActionHandler,
			executeAfterInvokeActionFromExtensionAPI: executeAfterInvokeActionFromExtensionAPI,
			executeBeforeInvokeActionFromExtensionAPI: executeBeforeInvokeActionFromExtensionAPI
		};
	}

	return BaseObject.extend("sap.suite.ui.generic.template.lib.ComponentUtils", {
		constructor: function(oComponent, oComponentRegistryEntry) {
			extend(this, getMethods(oComponent, oComponentRegistryEntry));
		}
	});
});
