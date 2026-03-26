/* Static helper class of NavigationController used to initialize the routing of the app during startup
 * More precisely the following tasks are performed:
 * - Create routes from the pages-section of the manifest
 * - Process startup parameters
 * - Finally, initialize router
 */

sap.ui.define(["sap/ui/core/mvc/Controller",
	"sap/ui/core/mvc/XMLView",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/generic/app/util/ModelUtil",
	"sap/suite/ui/generic/template/lib/CRUDHelper",
	"sap/suite/ui/generic/template/lib/FlexibleColumnLayoutHandler",
	"sap/suite/ui/generic/template/lib/testableHelper",
	"sap/suite/ui/generic/template/js/StableIdHelper",
	"sap/m/MessageBox",
	"sap/suite/ui/generic/template/lib/FeLogger",
	"sap/ui/model/analytics/odata4analytics",
	"sap/base/util/extend",
	"sap/base/util/isEmptyObject",
	"sap/base/util/each",
    "sap/suite/ui/generic/template/lib/FeError"
], function(Controller, XMLView, Filter, FilterOperator, ModelUtil, CRUDHelper, FlexibleColumnLayoutHandler,
			testableHelper, StableIdHelper, MessageBox, FeLogger, odata4analytics, extend, isEmptyObject, each, FeError) {
		"use strict";
	var	sClassName = "lib.navigation.routingHelper";
	var oLogger = new FeLogger(sClassName).getLogger();

		var oCrossAppNavService = (sap && sap.ushell && sap.ushell.Container) ? sap.ushell.Container.getService("CrossApplicationNavigation") : (function(){
			var i = 0;
			var oResolved = {
				done: function (callback){
					callback({
						getData: function(){
							return Object.create(null);
						}	
					});
				},
				fail: function () {
				}
			};
			return {
				createEmptyAppState: function(){
					return {
						getKey: function(){
							i++;
							return "" + i;
						},
						setData: Function.prototype,
						save: function(){
							return Promise.resolve();
						}
					};
				},
				getAppState: function(){
					return oResolved;
				},
				isInitialNavigation: function(){
					return true;
				}
			};
		})();

		// creates a router target according to the spec with the given name and returns the created target
		function createTarget(oRouter, sTargetName, sHostId, sHostAggregation, oTargetControlSpec){
			var oTarget = extend({
				controlId: sHostId,
				controlAggregation: sHostAggregation				
			}, oTargetControlSpec);
			var oTargets = oRouter.getTargets();
			oTargets.addTarget(sTargetName, oTarget);
			return oTargets.getTarget(sTargetName);
		}
		
		// creates a view target as specified and returns the created target
		function createViewTarget(oRouter, sHostId, sViewName, sTargetName, sHostAggregation) {
			return createTarget(oRouter, sTargetName, sHostId, sHostAggregation, {
				viewName: sViewName
			});
		}

		function createMessagePageTargets(oNavigationControllerProxy, sTargetControlId) {
			if (oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler) {
				oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler.createMessagePageTargets(createViewTarget.bind(null,
					oNavigationControllerProxy.oRouter, sTargetControlId, "sap.suite.ui.generic.template.fragments.MessagePage"));
			} else {
				createViewTarget(oNavigationControllerProxy.oRouter, sTargetControlId, "sap.suite.ui.generic.template.fragments.MessagePage",
					"messagePage", "pages");
			}
		}
		
		function createTargetForTreeNode(oNavigationControllerProxy, oTreeNode, sHostId, sHostAggregation){
			var oTarget = createViewTarget(oNavigationControllerProxy.oRouter, sHostId, oTreeNode.sRouteName, oTreeNode.sRouteName, sHostAggregation);
			var fnRegisterTreeNodeFirstDisplay = function(){
				oNavigationControllerProxy.treeNodeFirstDisplay(oTreeNode);
				oTarget.detachDisplay(fnRegisterTreeNodeFirstDisplay);
			};
			oTarget.attachDisplay(fnRegisterTreeNodeFirstDisplay);			
		}
		
		function fnDetemineDraftForTreeNode(oNavigationControllerProxy, oTreeNode, oParentNode){
			// Source of draft information: If there is no routingSpec always "OData", otherwise the draftSpec component of routingSpec which is defaulted to "parent".
			var vDraftSpec = oTreeNode.page.routingSpec ? oTreeNode.page.routingSpec.draftSpec : "OData";
			if (vDraftSpec === undefined){ // can only happen if oTreeNode.page has a routingSpec with no (or undefined) draftSpec
				vDraftSpec = "parent";
			}
			switch (vDraftSpec){
				case "parent":
					oTreeNode.isDraft = oParentNode.isDraft;
					return;
				case "OData":
					var oDraftController = oNavigationControllerProxy.oAppComponent.getTransactionController().getDraftController();
					var oDraftContext = oDraftController.getDraftContext();
					try {
						oTreeNode.isDraft = oDraftContext.isDraftEnabled(oTreeNode.entitySet);
					} catch (oError){
						oLogger.warning("Could not determine draft info for entity set " + oTreeNode.entitySet);
						oTreeNode.isDraft = oParentNode && oParentNode.isDraft; // fall back to parent if determining of draft info fails
					} finally {
						return;
					}
			}
			oTreeNode.isDraft = vDraftSpec; // vDraftSpec should be an explicit boolean value now
		}

		/**
		 * Creates necessary routing metadata from configuration and adds it to the Router
		 * Also builds the TreeNodes strcutures in template contract (mEntityTree and mRoutingTree).
		 * Note that metamodel is already loaded when this method is called.
		 *
		 * @public
		 * @param {String} sNavigationTargetId - the navigation target ID
		 * @returns {String} sEntitySet - the root EntitySet
		 */
		function generateRoutingMetadataAndGetRootEntitySet(oNavigationControllerProxy) {
			var sTargetControlId = oNavigationControllerProxy.oTemplateContract.oNavigationHost.getId();
			var oConfig = oNavigationControllerProxy.oAppComponent.getConfig();
			if (!oConfig.pages || !oConfig.pages.length) {
				throw new FeError(sClassName, "Route Configuration missing");
			}
			if (oConfig.pages.length > 1) {
				throw new FeError(sClassName, "Currently only one Top route supported");
			}

			// create Top-Route
			// currently only one top route supported
			var oTopPage = oConfig.pages[0];

			oNavigationControllerProxy.oTemplateContract.mEntityTree = Object.create(null);
			oNavigationControllerProxy.oTemplateContract.mRoutingTree = Object.create(null);

			var oTopTreeNode = {
				sRouteName: "root",
				entitySet: oTopPage.entitySet,
				page: oTopPage,
				getPath: function(){
					return "";
				},
				level: 0,
				fCLLevel: 0,
				children: [],
				headerTitle: oNavigationControllerProxy.oAppComponent.getManifestEntry("sap.app").title,
				text: ""
			};
			
			fnDetemineDraftForTreeNode(oNavigationControllerProxy, oTopTreeNode, null);

			createRoute([], oTopPage, oTopTreeNode, null, oNavigationControllerProxy, sTargetControlId);

			createChildRoutes("root", oTopPage, 0, oTopTreeNode, oNavigationControllerProxy, sTargetControlId, oTopTreeNode.children);

			createMessagePageTargets(oNavigationControllerProxy, sTargetControlId);

			return oTopPage.entitySet;
		}

		/**
		 * Creates child route from the specified route configuration
		 *
		 * @private
		 * @param {Object} oRoute - the route configuration
		 * @param {Number} iLevel - the level
		 * @param {Object} oParentNode - the parent TreeNode (if any)
		 * @param {Array} aNodes - optional: Add the names of entity sets for the created roots to this array
		 */
		function createChildRoutes(vPredecessorTargets, oPage, iLevel, oParentNode, oNavigationControllerProxy, sTargetControlId, aNodes,
			oCommunicationObject, iParentFCLDistanceToRoot) {
			var i, iLen;
			if (oPage.pages) {
				iLen = oPage.pages.length;
				for (i = 0; i < iLen; i++) {
					createRoutes(vPredecessorTargets, oPage.pages[i], iLevel + 1, oParentNode, oNavigationControllerProxy, sTargetControlId, aNodes,
						oCommunicationObject, iParentFCLDistanceToRoot || 0);
				}
			}
		}
		
		function getEmbeddedComponentsPatternDelimiter(){
			return "---";
		}
		
		function fnHandleEmbeddedComponentPages(vPredecessorTargets, sEmbeddedComponentKey, oEmbeddedComponent, iLevel, oParentNode, oNavigationControllerProxy, sTargetControlId, aNodes,
			oCommunicationObject, iParentFCLDistanceToRoot) {
			vPredecessorTargets = oParentNode.target || vPredecessorTargets;
			var oPseudoRoot = {
				pages: oEmbeddedComponent.pages
			};
			var oPseudoParentNode = {
				entitySet: oParentNode.entitySet,
				sRouteName: oParentNode.sRouteName,
				isDraft: oParentNode.isDraft,
				embeddedComponent: sEmbeddedComponentKey,
				getPath: function(iMode){
					if (iMode === 1){
						return oParentNode.getPath(1) + "/" + sEmbeddedComponentKey;
					}
					return oParentNode.getPath(iMode);
				},
				patternDelimiter: getEmbeddedComponentsPatternDelimiter()
			};
			createChildRoutes(vPredecessorTargets, oPseudoRoot, iLevel, oPseudoParentNode, oNavigationControllerProxy, sTargetControlId, aNodes,
				oCommunicationObject, iParentFCLDistanceToRoot);
		}

		function fnHandleEmbeddedComponent(vPredecessorTargets, oTreeNode, iLevel, oNavigationControllerProxy, sTargetControlId, iParentFCLDistanceToRoot,
			sEmbeddedComponentKey, oEmbeddedComponent, sContainerId, sSectionId, sSubSectionId) {
			var oCommunicationObject = {};
			var oEmbeddedComponentInfo = {
				key: sEmbeddedComponentKey,
				definition: oEmbeddedComponent,
				componentName: oEmbeddedComponent.componentName,
				componentUsage: oEmbeddedComponent.componentUsage,
				hiddenByDefault: oEmbeddedComponent.hiddenByDefault,
				containerId: sContainerId,
				sectionId: sSectionId, // at this point in time only filled if this is a leading embedding component
				subSectionId: sSubSectionId,
				pages: oEmbeddedComponent.pages || [],
				children: [],
				communicationObject: oCommunicationObject
			};
			oTreeNode.embeddedComponents[sEmbeddedComponentKey] = oEmbeddedComponentInfo;
			if (oEmbeddedComponent.pages) {
				fnHandleEmbeddedComponentPages(vPredecessorTargets, sEmbeddedComponentKey, oEmbeddedComponent, iLevel, oTreeNode, oNavigationControllerProxy, sTargetControlId, oEmbeddedComponentInfo.children, oCommunicationObject, iParentFCLDistanceToRoot);
			}
		}

		function fnHandleEmbeddedComponents(vPredecessorTargets, oTreeNode, oPage, iLevel, oNavigationControllerProxy, sTargetControlId, iParentFCLDistanceToRoot) {
			oTreeNode.embeddedComponents = Object.create(null);
			oTreeNode.leadingComponents = Object.create(null);
			oTreeNode.facetsWithEmbeddedComponents = Object.create(null);
			if (oPage.implementingComponent) {
				fnHandleEmbeddedComponent(vPredecessorTargets, oTreeNode, iLevel, oNavigationControllerProxy, sTargetControlId, iParentFCLDistanceToRoot, "implementation", oPage.implementingComponent, "template::ImplementingComponent");
			} else if (oPage.embeddedComponents) {
				// first we analyze the grouping structure of the embedded components.
				// Note that there are three kinds of reuse components: 1. "leading" -> defining an own group of reuse components 2. "following" -> added to a group of another leading component 3. "facet" -> added to an already existing facet
				var mLeadingComponents = Object.create(null);
				var mFollowingComponents = Object.create(null);
				var sEmbeddedComponentKey;
				var oEmbeddedComponent;
				var aSiblings;
				for (sEmbeddedComponentKey in oPage.embeddedComponents) {
					oEmbeddedComponent = oPage.embeddedComponents[sEmbeddedComponentKey];
					if (!oEmbeddedComponent.leadingSectionIdOrPath || oEmbeddedComponent.leadingSectionIdOrPath === sEmbeddedComponentKey){ // this is considered as a well-defined leading component
						mLeadingComponents[sEmbeddedComponentKey] = [sEmbeddedComponentKey];
					} else if (oPage.embeddedComponents[oEmbeddedComponent.leadingSectionIdOrPath]){ // this seems to be a following component
						mFollowingComponents[sEmbeddedComponentKey] = oEmbeddedComponent.leadingSectionIdOrPath;
					} else { // a facet component
						aSiblings = oTreeNode.facetsWithEmbeddedComponents[oEmbeddedComponent.leadingSectionIdOrPath];
						if (aSiblings){
							aSiblings.push(sEmbeddedComponentKey);
						} else {
							oTreeNode.facetsWithEmbeddedComponents[oEmbeddedComponent.leadingSectionIdOrPath] = [sEmbeddedComponentKey];
						}
					}
				}
				var aInconsitencies = [];
				for (sEmbeddedComponentKey in mFollowingComponents) {
					var sLeadingComponentKey = mFollowingComponents[sEmbeddedComponentKey];
					aSiblings = mLeadingComponents[sLeadingComponentKey]; // list of reuse components belonging to the same leading component already identified (should at least contain the leading component itself)
					if (aSiblings){ // expected result
						aSiblings.push(sEmbeddedComponentKey); // add this reuse component to the list of following components of the leading component
					} else { // sEmbeddedComponentKey is a following component which points to another component which is not leading either. For robustness we consider such an inconsitent component as a group of its own.
						aInconsitencies.push(sEmbeddedComponentKey);
						delete mFollowingComponents[sEmbeddedComponentKey];
					}
				}
				for (var i = 0; i < aInconsitencies.length; i++){ // transfer all inconsistent components to the set of leading components
					mLeadingComponents[aInconsitencies[i]] = [aInconsitencies[i]];
				}
				for (sEmbeddedComponentKey in oPage.embeddedComponents) {
					oEmbeddedComponent = oPage.embeddedComponents[sEmbeddedComponentKey];
					var sSectionId = mLeadingComponents[sEmbeddedComponentKey] && StableIdHelper.getStableId({
						type: "ObjectPageSection",
						subType: "ReuseComponentSection",
						sReuseComponentName: oEmbeddedComponent.componentName,
						sReuseComponentUsage: oEmbeddedComponent.componentUsage,
						sReuseComponentId: sEmbeddedComponentKey
					});
					var sSubSectionId = StableIdHelper.getStableId({
						type: "ObjectPageSection",
						subType: "ReuseComponentSubSection",
						sReuseComponentName: oEmbeddedComponent.componentName,
						sReuseComponentUsage: oEmbeddedComponent.componentUsage,
						sReuseComponentId: sEmbeddedComponentKey
					});
					var sContainerId = StableIdHelper.getStableId({
						type: "ObjectPageSection",
						subType: "ReuseComponentContainer",
						sReuseComponentName: oEmbeddedComponent.componentName,
						sReuseComponentUsage: oEmbeddedComponent.componentUsage,
						sReuseComponentId: sEmbeddedComponentKey
					});
					fnHandleEmbeddedComponent(vPredecessorTargets, oTreeNode, iLevel, oNavigationControllerProxy, sTargetControlId, iParentFCLDistanceToRoot, sEmbeddedComponentKey,
						oEmbeddedComponent, sContainerId, sSectionId, sSubSectionId);
				}
				// Transfer information from mLeadingComponents to oTreeNode.leadingComponents.
				Object.keys(mLeadingComponents).forEach(function(sLeadingComponentKey){
					var oLeadingComponentMeta = oTreeNode.embeddedComponents[sLeadingComponentKey];
					oTreeNode.leadingComponents[sLeadingComponentKey] = {
						sectionId: oLeadingComponentMeta.sectionId,
						title: oLeadingComponentMeta.definition.groupTitle || oLeadingComponentMeta.definition.title,
						followingComponents: mLeadingComponents[sLeadingComponentKey].map(function(sFollowingKey){
							var oFollowingComponentMeta = oTreeNode.embeddedComponents[sFollowingKey];
							oFollowingComponentMeta.sectionId = oLeadingComponentMeta.sectionId;
							return oFollowingComponentMeta;
						})
					};
				});
			}
		}

		/**
		 * Creates all necessary route(s) metadata from configuration and adds it to the Router instance
		 *
		 * @private
		 * @param {Object} oRoute - the route configuration
		 * @param {Number} iLevel - the level
		 * @param {Object} oParentNode - the parent TreeNode (if any)
		 * @param {Array} aNodes - optional: Add the names of entity sets for the created roots to this array
		 */
		function createRoutes(vPredecessorTargets, oPage, iLevel, oParentNode, oNavigationControllerProxy, sTargetControlId, aNodes,
			oCommunicationObject, iParentFCLDistanceToRoot) {
			if (oPage.component) { //in case of intent there is no internal route to be created
				var iMaxColumnCountInFCL = oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler ? oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler.getMaxColumnCountInFCL() : 1;
				var iFCLDistanceToRoot = (iMaxColumnCountInFCL === 1) || (oPage.defaultLayoutType === "OneColumn") ? 0 : iParentFCLDistanceToRoot + 1;
				var oTreeNode = {
					parent: oParentNode && oParentNode.entitySet,
					parentRoute: oParentNode ? oParentNode.sRouteName : "root",
					parentEmbeddedComponent: oParentNode && oParentNode.embeddedComponent,
					entitySet: oPage.entitySet,
					navigationProperty: oPage.navigationProperty,
					level: iLevel,
					fCLLevel: iFCLDistanceToRoot >= iMaxColumnCountInFCL ?  3 : iFCLDistanceToRoot,
					children: [],
					communicationObject: oCommunicationObject,
					page: oPage,
					defaultLayoutType: oPage.defaultLayoutType,
					noKey: oPage.routingSpec && oPage.routingSpec.noKey,
					noOData: oPage.routingSpec && oPage.routingSpec.noOData,
					text: ""
				};
				fnDetemineDraftForTreeNode(oNavigationControllerProxy, oTreeNode, oParentNode);
				addPathFunctionToTreeNode(oTreeNode, oParentNode, oNavigationControllerProxy.oTemplateContract.bCreateRequestsCanonical);
				createSpecificModelForTreeNode(oTreeNode, oNavigationControllerProxy.oTemplateContract);
				var oNewRoute = createRoute(vPredecessorTargets, oPage, oTreeNode, oParentNode,
					oNavigationControllerProxy, sTargetControlId);
				var oModel = oNavigationControllerProxy.oAppComponent.getModel();
				var oEntitySet = oModel.getMetaModel().getODataEntitySet(oPage.entitySet);
				oTreeNode.semanticObject = oEntitySet && oEntitySet["com.sap.vocabularies.Common.v1.SemanticObject"] && oEntitySet["com.sap.vocabularies.Common.v1.SemanticObject"].String;
				if (aNodes) {
					aNodes.push(oPage.entitySet);
				}
				var oExistingTreeNode = oNavigationControllerProxy.oTemplateContract.mEntityTree[oPage.entitySet];
				// Expected: oExistingTreeNode is faulty. However, there are scenarios with circular page structures.
				if (!oExistingTreeNode || oExistingTreeNode.level > oTreeNode.level) {
					oNavigationControllerProxy.oTemplateContract.mEntityTree[oPage.entitySet] = oTreeNode;
				}
				addTitleInfoToTreeNode(oNavigationControllerProxy, oTreeNode, oPage);
				createChildRoutes(oNewRoute.target, oPage, iLevel, oTreeNode, oNavigationControllerProxy, sTargetControlId, oTreeNode.children, oCommunicationObject, iFCLDistanceToRoot);
				fnHandleEmbeddedComponents(oNewRoute.target, oTreeNode, oPage, iLevel, oNavigationControllerProxy, sTargetControlId, iFCLDistanceToRoot);
			}
		}

		/**
		 * Creates a Query route from the specified route and adds it to the router
		 *
		 * @private
		 * @param {Object} oRoute - the route configuration
		 */
		function createQueryRoute(oRoute, oNavigationControllerProxy) {
			var oQueryRoute = extend({}, oRoute);
			oQueryRoute.name = oRoute.name + "query";
			oQueryRoute.pattern = oRoute.pattern + "{?query}";
			oNavigationControllerProxy.oRouter.addRoute(oQueryRoute);
		}

		function addTitleInfoToTreeNode(oNavigationControllerProxy, oTreeNode, oPage) {
			if (oTreeNode.noOData) {
				oTreeNode.headerTitle = oPage.routingSpec.headerTitle;
				oTreeNode.titleIconUrl = oPage.routingSpec.titleIconUrl;
			} else {
				var oModel = oNavigationControllerProxy.oAppComponent.getModel();
				var oMetaModel = oModel.getMetaModel();
				oMetaModel.loaded().then(function() {
					var oModelEntitySet = oMetaModel.getODataEntitySet(oTreeNode.entitySet);
					var oDataEntityType = oMetaModel.getODataEntityType(oModelEntitySet.entityType);
					var oHeaderInfo = oDataEntityType["com.sap.vocabularies.UI.v1.HeaderInfo"];
					var sHeaderTitle = (oHeaderInfo && oHeaderInfo.TypeName && oHeaderInfo.TypeName.String) || "";
					if (sHeaderTitle.substr(0, 7) === "{@i18n>") {
						var sSubstr = sHeaderTitle.substring(1, sHeaderTitle.length - 1);
						var aString = sSubstr.split(">");
						sHeaderTitle = oNavigationControllerProxy.oAppComponent.getModel(aString[0]).getResourceBundle().getText(aString[1]);
					}
					oTreeNode.headerTitle = sHeaderTitle;
					var sTitleIconUrl = (oHeaderInfo && oHeaderInfo.Title && oHeaderInfo.Title.IconUrl && oHeaderInfo.Title.IconUrl.String) || "";
					oTreeNode.titleIconUrl = sTitleIconUrl;
				});
			}
		}

		function addPathFunctionToTreeNode(oTreeNode, oParentNode, bCreateRequestsCanonical){
			var sPathPattern = (oTreeNode.level === 1 || !oTreeNode.page.navigationProperty) ? oTreeNode.page.entitySet : oTreeNode.page.navigationProperty;
			var sKeySpec = oTreeNode.noKey ? "" : "({keys" + oTreeNode.level + "})";
			var sRoutePattern = sPathPattern + sKeySpec;
			var sParentRoutePattern = oParentNode && oParentNode.getPath(1);
			if (sParentRoutePattern){
				sRoutePattern = sParentRoutePattern + (oParentNode.patternDelimiter || "/") + sRoutePattern;
			}
			var sCanonicalPath;
			var sBindingPath;
			if (oTreeNode.noOData){
				var sSuffix = oTreeNode.page.routingSpec.binding ? ("/" + oTreeNode.page.routingSpec.binding) : "";
				sCanonicalPath = oParentNode.getPath(3) + sSuffix;
				sBindingPath = oParentNode.getPath(2) + sSuffix;
			} else {
				sCanonicalPath = "/" + oTreeNode.entitySet + sKeySpec;
				sBindingPath = bCreateRequestsCanonical || (!oTreeNode.page.navigationProperty || oTreeNode.level === 1) ? sCanonicalPath : oParentNode.getPath(2) + "/" + oTreeNode.page.navigationProperty + sKeySpec;
			}
			oTreeNode.getPath = function(iMode, aKeys){
				var sRet;
				switch (iMode){
					case 1:
						sRet = sRoutePattern;
						break;
					case 2:
						sRet = sBindingPath;
						break;
					case 3:
						sRet = sCanonicalPath;
					   break;
				    default:
				}
				if (aKeys){
					for (var i = 1; i <= oTreeNode.level; i++){
						sRet = sRet.replace("{keys" + i + "}", aKeys[i]);
					}
				}
				return sRet;
			};
		}
		
		function createSpecificModelForTreeNode(oTreeNode, oTemplateContract){
			oTreeNode.specificModelName = "_templPrivGlobaleODESM_" + oTreeNode.entitySet;
//			oTemplateContract.oAppComponent.setModel(oTemplateContract.oAppComponent.getModel(), oTreeNode.specificModelName); temporary disabled
			oTreeNode.bindElement = function(oElement, sBindingPath, bForSpecificModel, oEvents){
				if (bForSpecificModel){ // temporary disabled
					return;
				}
				var oComponentRegistryEntry = oTreeNode.componentId && oTemplateContract.componentRegistry[oTreeNode.componentId];
				var oNonDraftCreateContext = oComponentRegistryEntry && oComponentRegistryEntry.nonDraftCreateContext;
				if (oNonDraftCreateContext){ // non-draft create contexts cannot be bound via bindElement but must be set via setBindingContext
					oElement.setBindingContext(oNonDraftCreateContext, bForSpecificModel ? oTreeNode.specificModelName : undefined);
					return;
				}
				var oParameter = {
					createPreliminaryContext: true,
					canonicalRequest: !oTemplateContract.bCreateRequestsCanonical // either we or the framework must set the requests to be canonical
				};
				var sRootExpand = oComponentRegistryEntry && oComponentRegistryEntry.utils.getRootExpand();                         
				if (sRootExpand) {
					oParameter.expand = sRootExpand;
				}
				var oPathSpec = {
					path: sBindingPath || oTreeNode.getPath(2, oTemplateContract.oNavigationControllerProxy.getCurrentKeys(oTreeNode.level)),
					events: oEvents || {},
					parameters: oParameter,
					batchGroupId: "Changes", // get navigation controller constant?
					changeSetId: "Changes"
				};
				if (bForSpecificModel){
					oPathSpec.model = oTreeNode.specificModelName;
				}
				oElement.bindElement(oPathSpec);
			};
		}

		/**
		 * Creates and returns a route metadata from configuration
		 *
		 * @private
		 * @param {Object} oRoute - the route configuration
		 * @param {string} sOperation - the operation for which the route has to be created
		 * @param {Object} oTreeNode- the tree node representing the route
		 * @param {Object} oParentRoute - the parent route (if any)
		 * @returns {Object} the created route metadata
		 */
		function createRoute(vPredecessorTargets, oPage, oTreeNode, oParentNode, oNavigationControllerProxy, sTargetControlId) {
			oTreeNode.componentCreated = new Promise(function(fnResolve){
				oTreeNode.componentCreatedResolve = fnResolve;	
			});
			var iLevel = oTreeNode.level;
			var aPredecessorTargets = Array.isArray(vPredecessorTargets) ? vPredecessorTargets : [vPredecessorTargets];

			var oNewRoute = extend({}, oPage);
			// TODO: use only component name here?
			oNewRoute.template = oPage.component ? (oPage.component.name || oPage.component) : oPage.template;
			switch (iLevel){
				case 0:
					oTreeNode.sRouteName = "root";
					break;
				case 1:
					oTreeNode.sRouteName = oPage.entitySet;
					break;
				default:
					oTreeNode.sRouteName = oParentNode.sRouteName + "/" + (oParentNode.embeddedComponent ? oParentNode.embeddedComponent + "/" : "") + (oPage.navigationProperty || oPage.entitySet);
			}
			oNavigationControllerProxy.oTemplateContract.mRoutingTree[oTreeNode.sRouteName] = oTreeNode;
			oNewRoute.name = oTreeNode.sRouteName;
			var sHostAggregation;
			if (oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler) { // In this case the view is hosted by the FCL
				sHostAggregation = oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler.adaptRoutingInfo(oNewRoute,
					oTreeNode.sRouteName, aPredecessorTargets, oTreeNode);
			} else { // In this case the view is hosted by the NavContainer
				sHostAggregation = "pages";
				oNewRoute.target = oTreeNode.sRouteName;
			}
			createTargetForTreeNode(oNavigationControllerProxy, oTreeNode, sTargetControlId, sHostAggregation);
			
			oNewRoute.pattern = oTreeNode.getPath(1);
			oNavigationControllerProxy.oRouter.addRoute(oNewRoute);
			createQueryRoute(oNewRoute, oNavigationControllerProxy);
			return oNewRoute;
		}

		// - End methods for creating the routes

		/*
		 * Creates necessary routing info and initialises the Router
		 */
		function fnInitialiseRouting(oNavigationControllerProxy, oStartupParameters) {
			var sHash;
			if (!oNavigationControllerProxy.oHashChanger.getHash()) {
				sHash = "";
				// no route is set yet, check if start entity was passed via parameter
				if (oStartupParameters && oStartupParameters.route && oStartupParameters.route.length === 1) {
					sHash = oStartupParameters.route[0];
					oNavigationControllerProxy.navigate(sHash, true);
				}
			}
			oNavigationControllerProxy.initialize();
		}

		// - Start methods for processing the startup parameters

		function fnBuildFilters(oNavigationControllerProxy, sEntitySet, aKeys, oStartupParameters) {
			var i, iLen, sProperty, sValue, aFilters = [],
				oCompleteFilter;
			iLen = aKeys.length;
			for (i = 0; i < iLen; i++) {
				// get property from property path
				sProperty = aKeys[i].PropertyPath;
				// get value from parameter array (should have only 1)
				sValue = oStartupParameters[sProperty][0];
				aFilters.push(new Filter(sProperty, FilterOperator.EQ, sValue));
			}
			if (oNavigationControllerProxy.oAppComponent.getTransactionController().getDraftController()
				.getDraftContext().isDraftEnabled(sEntitySet)) {
				var oDraftFilter = new Filter({
					filters: [new Filter("IsActiveEntity", "EQ", false),
						new Filter("SiblingEntity/IsActiveEntity", "EQ", null)
					],
					and: false
				});
				aFilters.push(oDraftFilter);
			}
			oCompleteFilter = new Filter(aFilters, true);
			return oCompleteFilter;
		}
		/**
		 * Creates and returns path with parametrization added
		 * @private
		 * @param {Object} oDataModel for entityset
		 * @param {string} EntitySet name
		 * @param {Object} oStartupParameters - URL Parameters
		 * @returns {string} path with parametrization added
		 */
		function fnResolveParameterizedEntitySet(oDataModel, oEntitySet, oStartupParameters) {
			var path = "/" + oEntitySet;
			try {
				var o4a = new odata4analytics.Model(odata4analytics.Model.ReferenceByModel(oDataModel));
				var queryResult = o4a.findQueryResultByName(oEntitySet);
				var queryResultRequest = new odata4analytics.QueryResultRequest(queryResult);
				var parameterization = queryResult && queryResult.getParameterization();
				var bIsParamPresent = false;
				if (parameterization) {
					queryResultRequest.setParameterizationRequest(new odata4analytics.ParameterizationRequest(parameterization));
					var aParametricSet = parameterization.getAllParameterNames();
					each(aParametricSet, function() {
						if (oStartupParameters.hasOwnProperty(this)) {
							bIsParamPresent = true;
							queryResultRequest.getParameterizationRequest().setParameterValue(
								this,
								oStartupParameters[this][0]
							);
						}
					});
					// To handle Mandatory Parameter which starts without "P_" in parameter list
					for (var i = 0; i < aParametricSet.length; i++) {
						if (aParametricSet[i].startsWith("P_")) {
							var sMandatoryParameter = aParametricSet[i].substr(2);
							if (oStartupParameters.hasOwnProperty(sMandatoryParameter)) {
								bIsParamPresent = true;
								queryResultRequest.getParameterizationRequest().setParameterValue(
									aParametricSet[i],
									oStartupParameters[sMandatoryParameter][0]);
							}
						}
					}
					if (bIsParamPresent) {
						path = queryResultRequest.getURIToQueryResultEntitySet();
					}
				}
			} catch (error) {
				// Not logging an error because it will fail qunit and is not required as fall back is default
				oLogger.info(error.name + ":" + error.message );
			}
			return path;
		}

		function fnCreateReadPromise(sEntitySet, oFilters, oModel, oStartupParameters, iLevel) {

			return new Promise(function(fnResolve, fnReject) {
				// Directly reading using the entitySet as currently, Gateway cannot handle filters in case of 1..n navigation properties
				var EntitySetPath = fnResolveParameterizedEntitySet(oModel, sEntitySet, oStartupParameters);
				oModel.read(EntitySetPath, {
					filters: [oFilters],
					success: function(oResult) {
						var oRowResult = fnReadObjectProcessResults(oResult, oModel, oStartupParameters);
						// if no results returned, then return a fnResolve with status:noData.
						// if oRowResult, then return fnResolve with status:success
						// If status is not "success" then navigate to the preceding level
						if (oRowResult) {
							var sKey = oModel.getKey(oRowResult);
							if (sKey) {
								fnResolve({
									"status": "success",
									"value": sKey,
									"iLevel": iLevel
								});
							}
						}
						fnResolve({
							"status": "noData"
						});
					},
					error: function() {
						fnResolve({
							"status": "error"
						});
					}
				});
			});
		}

		/*
		 * perform a read with the specified data and trigger further initialisation of router
		 *
		 * @param {Array} aKeys - the keys used to create the filter
		 * @param {Object} oStartupParameters - object containing parameters
		 * @param {Object} oModel- the odata model instance
		 * @param {Object} oNavigationPossible - Semantic Keys and navigation property for Object pages used to check if navigation is possible
		 * @param {String} sHash - key for root Object page
		 */
		function fnReadObject(oNavigationControllerProxy, sEntitySet, aKeys, oStartupParameters, oModel, oNavigationPossible, sHash) {
			var aPromises = [],
				oPage, oPageFilter, oPagePromise;
			var oRootPagePromiseForTK = new Promise(function(fnResolve) { //Since nav via Semantic Key is not possible for Root Object Page, nav would be done via TK
				fnResolve({
					"status": "success",
					"value": sHash,
					"iLevel": 0
				});
			});
			if (aKeys && oStartupParameters && oModel) {
				if (oNavigationPossible.aNavigablePages) {
					for (var i = 0; i < oNavigationPossible.aNavigablePages.length; i++) {
						if (oNavigationPossible.aNavigablePages && oNavigationPossible.aNavigablePages[i] && oNavigationPossible.aNavigablePages[i].bNavigationWithTechnicalKeyPossible) {
							//Since nav via Semantic Key is not possible for Root Object Page, nav would be done via TK
							aPromises.push(oRootPagePromiseForTK);
							continue;
						}
						oPage = oNavigationPossible.aNavigablePages[i];
						oPageFilter = fnBuildFilters(oNavigationControllerProxy, oPage.sEntitySet, oPage.aSemanticKey, oStartupParameters);
						oPagePromise = fnCreateReadPromise(oPage.sEntitySet, oPageFilter, oModel, oStartupParameters, oPage.iLevel);
						aPromises.push(oPagePromise);
					}
				}
				return Promise.all(aPromises).then(function(aResults) {
					var aTargetKeys = [""];
					var sTargetEntitySet;
					for (var i = 0; aResults[i] && aResults[i].status === "success"; i++) {
						var aParts = aResults[i].value.split("(");
						aTargetKeys.push(aParts[1].slice(0, aParts[1].length - 1));
						sTargetEntitySet = i === 0 ? sEntitySet : oNavigationPossible.aNavigablePages[i].sEntitySet;
					}
					var oTreeNode = sTargetEntitySet ? oNavigationControllerProxy.oTemplateContract.mEntityTree[sTargetEntitySet] : oNavigationControllerProxy.oTemplateContract.mRoutingTree.root;
					var mAppStates = Object.create(null);
					if (oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler){
						oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler.adaptAppStatesForExternalNavigation(oTreeNode, mAppStates);
					}
					var oIdentity = {
						treeNode: oTreeNode,
						keys: aTargetKeys,
						appStates: mAppStates
					};

					oNavigationControllerProxy.navigateToIdentity(oIdentity, true, 1).then(function(){
						fnInitialiseRouting(oNavigationControllerProxy, oStartupParameters);
					});
				});
			}
		}

		function fnReadObjectProcessResults(oResult, oModel, oStartupParameters) {
			var oRow, i, iLength, oRowResult;
			if (oResult && oResult.results) {
				iLength = oResult.results.length;
				if (iLength === 0) {
					oRowResult = null;
				} else if (iLength === 1) {
					oRowResult = oResult.results[0];
				} else if (iLength >= 1) {
					var aDrafts = [];
					var aActive = [];
					for (i = 0; i < iLength; i++) {
						oRow = oResult.results[i];
						if (oRow && oRow.IsActiveEntity) {
							aActive.push(oRow);
						} else if (oRow && oRow.IsActiveEntity === false) {
							aDrafts.push(oRow);
						}
					}
					if (aActive.length === 0 && aDrafts.length >= 2) {
						//DraftUUID match?
						var oDraftRow;
						for (var j = 0; j < aDrafts.length; j++) {
							oDraftRow = aDrafts[j];
							if (oDraftRow.DraftUUID === (oStartupParameters.DraftUUID && oStartupParameters.DraftUUID[0])) {
								//show corresponding object
								oRowResult = oDraftRow;
								break;
							}
						}
						if (!oRowResult) {
							oRowResult = aDrafts[0];
						}
					} else if (aActive.length === 1 && aDrafts.length >= 1) {
						//no DraftUUID check
						oRowResult = aActive[0];
					}
				}
			}
			return oRowResult;
		}

		function fnCombineMode(sPreferredMode, sMode) {
			// in case of not allowed combinations of mode navigate to the List Report
			if ((sPreferredMode && sMode) || (sMode === "display")) {
				return {
					mode: "unsupported"
				};
			}

			var oResult = {
				mode: "display",
				force: "false"
			}; // historic default behavior

			oResult.mode = sMode || sPreferredMode || oResult.mode;
			oResult.force = !!sMode;

			return oResult;
		}

		function fnDefaultNavigationProcessing(oModel, oNavigationControllerProxy, sEntitySet, oStartupParameters, oMode) {
			var oStartupParametersWithEditableFor = extend({}, oStartupParameters);
			fnProcessEditableFieldFor(oModel.getMetaModel(), sEntitySet, oStartupParametersWithEditableFor);
			var oNavigationPossible = fnCheckNavigation(oModel, oNavigationControllerProxy, sEntitySet, oStartupParametersWithEditableFor, oMode);
			if (oNavigationPossible.aNavigablePages && oNavigationPossible.aNavigablePages[0] && oNavigationPossible.aNavigablePages[0].aSemanticKey &&
				oNavigationPossible.aNavigablePages[0].iLevel === 0) { // check: if navigation to Root ObjectPage is possible via SemanticKey. iLevel=0 makes sure that the page in reference is the rootObjectPage
				fnReadObject(oNavigationControllerProxy, sEntitySet, oNavigationPossible.aNavigablePages[0].aSemanticKey, oStartupParametersWithEditableFor, oModel,
					oNavigationPossible);
				// read will trigger the initialisation as needed
				return;
			} else if (oNavigationPossible.aNavigablePages && oNavigationPossible.aNavigablePages[0] && oNavigationPossible.aNavigablePages[0].bNavigationWithTechnicalKeyPossible) {
				if (oStartupParameters.IsActiveEntity && oStartupParameters.IsActiveEntity[0] === "false" &&
					oStartupParameters.DraftUUID && oStartupParameters.DraftUUID[0] !== "") {
					//3	Fiori parameter with TK call on existing draftobject but active also exists
					var aKeys = [];
					for (var i = 0; i < oNavigationPossible.aNavigablePages[0].aTechnicalKey.length; i++) {
						var sTechnicalKeyProp = oNavigationPossible.aNavigablePages[0].aTechnicalKey[i] && oNavigationPossible.aNavigablePages[0].aTechnicalKey[
							i].name;
						if (sTechnicalKeyProp === "DraftUUID" ||
							sTechnicalKeyProp === "IsActiveEntity") {
							continue;
						}
						if (oStartupParametersWithEditableFor.hasOwnProperty(sTechnicalKeyProp)) {
							aKeys.push({
								PropertyPath: sTechnicalKeyProp
							});
						}
					}
					var sHash = oModel.createKey(sEntitySet, oStartupParametersWithEditableFor);
					fnReadObject(oNavigationControllerProxy, sEntitySet, aKeys, oStartupParametersWithEditableFor, oModel, oNavigationPossible, sHash);
					// read will trigger the initialisation as needed
					return;
				}
				// Navigation via Technical Key
				var sHash = oModel.createKey(sEntitySet, oStartupParametersWithEditableFor);
				if (sHash) {
					var aKeys = [];
					for (var i = 0; i < oNavigationPossible.aNavigablePages[0].aTechnicalKey.length; i++) {
						var sTechnicalKeyProp = oNavigationPossible.aNavigablePages[0].aTechnicalKey[i] && oNavigationPossible.aNavigablePages[0].aTechnicalKey[
							i].name;
						if (sTechnicalKeyProp === "DraftUUID" ||
							sTechnicalKeyProp === "IsActiveEntity") {
							continue;
						}
						if (oStartupParametersWithEditableFor.hasOwnProperty(sTechnicalKeyProp)) {
							aKeys.push({
								PropertyPath: sTechnicalKeyProp
							});
						}
					}
					// sHash is passed in case navigation to Root Object Page is not possible via Semantic Key
					fnReadObject(oNavigationControllerProxy, sEntitySet, aKeys, oStartupParametersWithEditableFor, oModel, oNavigationPossible, sHash);
					return;
				}
			}
			fnInitialiseRouting(oNavigationControllerProxy, oStartupParameters);
		}

		function fnCheckKeys(aKeys, mParams) {
			var i, iLength, bSuccess = false,
				oKey, sKeyProperty;
			if (mParams && aKeys) {
				iLength = aKeys.length;
				for (i = 0; i < iLength; i++) {
					// assume key handling shall be successful
					bSuccess = true;
					oKey = aKeys[i];
					// Keys are located either at name (resource/entity key) or PropertyPath (SemanticKey annotation)
					sKeyProperty = oKey.name || oKey.PropertyPath;
					if (!mParams[sKeyProperty] || mParams[sKeyProperty].length > 1) {
						// if no key params or multiple key params are present set unsuccessful and break
						bSuccess = false;
						break;
					}
				}
			}
			return bSuccess;
		}

			/**
		 * Recursive function to get the semantic keys for Object Pages and TK only in case of root Object Page
		 *
		 * @private
		 * @param {Object} oModel - model of the application
		 * @param {string} oStartupParameters - parameters required to decide if LR or what level of OP to be opened
		 * @param {Object} oMode- the mode in which the application wants be opened
		 * @param {Array} aPages - the pages from manifest
		 * @param {Array} aNavigablePages - the navigable pages array as input to the recursive function
		 * @param {String} sEntitySet - the entity set of the current page for navigation
		 * @returns {Array} The pages till which the navigation can happen.
		 */

		function fnGetNavigablePages(oModel, oStartupParameters, oMode, aPages, iLevel, aNavigablePages, sEntitySet) {
			var oNavigablePageWithSemanticKey, oEntitySet, bAllowDeepLinking, oEntityType, aSemanticKey, oPage, oNavToRootPageWithTechnicalKey;

			for (var i = 0; i < aPages.length; i++) {
				oPage = aPages[i];

				// if page exists, but for the current mode is replaced by external navigation, internal navigation is not allowed
				if (oPage && oPage.navigation && oPage.navigation[oMode.mode]) {
					continue;
				}
				var sPageEntitySet = sEntitySet && iLevel === 0 ? sEntitySet : oPage.entitySet;
				oEntitySet = oModel.getMetaModel().getODataEntitySet(sPageEntitySet);
				

				// if the setting:allowDeepLinking is not true, then navigation is not possible
				bAllowDeepLinking = oPage.component && oPage.component.settings && oPage.component.settings.allowDeepLinking;

				if (!oEntitySet || !(iLevel === 0 || bAllowDeepLinking)) { // iLevel = 0 is used to identify if the current page is Root Object Page. allowDeepLinking is always true for root Object Page
					continue;
				}
				oEntityType = oModel.getMetaModel().getODataEntityType(oEntitySet.entityType);

				aSemanticKey = oEntityType["com.sap.vocabularies.Common.v1.SemanticKey"];
				oNavigablePageWithSemanticKey = {};
				oNavToRootPageWithTechnicalKey = {};
				if (aSemanticKey && fnCheckKeys(aSemanticKey, oStartupParameters)) {
					oNavigablePageWithSemanticKey["sEntitySet"] = sPageEntitySet;
					oNavigablePageWithSemanticKey["aSemanticKey"] = aSemanticKey;
					oNavigablePageWithSemanticKey["sNavigationProperty"] = oPage.navigationProperty;
					oNavigablePageWithSemanticKey["iLevel"] = iLevel; // iLevel is used to identify the Object page level in the manifest
					aNavigablePages.push(oNavigablePageWithSemanticKey);
					// TK is used for compatibility reasons only for Root Object Page
				} else if (oEntityType.key.propertyRef && (iLevel === 0) && fnCheckKeys(oEntityType.key.propertyRef, oStartupParameters)) {
						oNavToRootPageWithTechnicalKey.bNavigationWithTechnicalKeyPossible = fnCheckKeys(oEntityType.key.propertyRef, oStartupParameters);
						oNavToRootPageWithTechnicalKey.aTechnicalKey = oEntityType.key.propertyRef;
						aNavigablePages.push(oNavToRootPageWithTechnicalKey);
				}
				if (oPage.pages) { // if pages exist, recurse till deepest level is found
					fnGetNavigablePages(oModel, oStartupParameters, oMode, oPage.pages, ++iLevel, aNavigablePages);
				} else { // if the current ObjectPage does not have nested pages then we break and navigate to the page stored in current iteration. We do not check for other pages.
					break;
				}
			}
			return aNavigablePages;
		}

		function fnCheckNavigation(oModel, oNavigationControllerProxy, sEntitySet, oStartupParameters, oMode) {
			var result = {},
				aPages = [],
				aNavigablePages = [];
			// if page exists, but for the current mode is replaced by external navigation, internal navigation is not allowed
			var oConfig = oNavigationControllerProxy.oAppComponent.getConfig();
			aPages = oConfig.pages && oConfig.pages[0] && oConfig.pages[0].pages; //aPages stores all object pages at the first level i.e. level below LR
			if (!aPages) {
				return {};
			}
			aNavigablePages = fnGetNavigablePages(oModel, oStartupParameters, oMode, aPages, 0, aNavigablePages, sEntitySet);
			result.aNavigablePages = aNavigablePages;
			return result;
		}

		function fnPrepareCreate(oNavigationControllerProxy) {
			var oGlobalModel = oNavigationControllerProxy.oAppComponent.getModel("_templPrivGlobal");
			oGlobalModel.setProperty("/generic/forceFullscreenCreate", true);
		}

		function fnTransformEdmGuidParams(oModel, sEntitySet, oStartupParameters) {
			var oDataMetaModel, oEntitySet, sEntityType, oEntityType, aEntityTypeProperties, aPropertiesOfTypeGuid, i, oProperty, j, sGuid,
				iEntityTypeLength;
			if (isEmptyObject(oStartupParameters)) {
				return;
			}
			oDataMetaModel = oModel && oModel.getMetaModel();
			oEntitySet = oDataMetaModel && oDataMetaModel.getODataEntitySet(sEntitySet);
			sEntityType = oEntitySet && oEntitySet.entityType;
			oEntityType = oDataMetaModel && oDataMetaModel.getODataEntityType(sEntityType);
			aEntityTypeProperties = oEntityType && oEntityType.property;
			aPropertiesOfTypeGuid = [];
			iEntityTypeLength = aEntityTypeProperties && aEntityTypeProperties.length;
			for (i = 0; i < iEntityTypeLength; i++) {
				oProperty = aEntityTypeProperties[i];
				if (oProperty["type"] === "Edm.Guid") {
					aPropertiesOfTypeGuid.push(oProperty["name"]);
				}
			}
			//transform the Edm.Guid parameter
			for (j = 0; j < aPropertiesOfTypeGuid.length; j++) {
				if (!oStartupParameters[aPropertiesOfTypeGuid[j]]) {
					continue;
				}
				sGuid = oStartupParameters[aPropertiesOfTypeGuid[j]][0];
				sGuid = sGuid.toLowerCase().replace(/(guid')([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(')/, "$2");
				if (!sGuid.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)) {
					// assume legacy guid
					sGuid = sGuid.replace(/([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})/, "$1-$2-$3-$4-$5");
				}
				oStartupParameters[aPropertiesOfTypeGuid[j]][0] = sGuid;
			}
		}

		function getCreateParameters(oNavigationControllerProxy){
			var oInbounds = oNavigationControllerProxy.oAppComponent.getInboundParameters();
			return oInbounds ? Object.keys(oInbounds).filter(function(sParameter){
				return oInbounds[sParameter].useForCreate;
			}) : [];
		}

		function fnStartupParameters2PredefinedValuesForCreate(oNavigationControllerProxy, oStartupParameters){
			var oRet;
			var aCreateParameters = getCreateParameters(oNavigationControllerProxy);
			for (var i = 0; i < aCreateParameters.length; i++){
				var sCreateParameter = aCreateParameters[i];
				var aValues = oStartupParameters[sCreateParameter];
				if (aValues && aValues.length === 1){
					oRet = oRet || Object.create(null);
					oRet[sCreateParameter] = aValues[0];
				}
			}
			return oRet;
		}

		function fnProcessEditableFieldFor(oMetaModel, sEntitySet, oStartupParameters){
			// easiest solution to handle different possible usage of forEdit fields: provide a given value always in both fields
			// alternative solution: only check the other property at the places of usage, i.e.
			// - when checking navigable pages, check for values in the field, that is not part of semantic key
			// - when providing vlaues for SFB, check for values in the field, that is no selection field
			// pending: clarify, which solution would be better
			var oEntityType = oMetaModel.getODataEntityType(oMetaModel.getODataEntitySet(sEntitySet).entityType);
			oEntityType.property.forEach(function(oProperty){
				if (oProperty["com.sap.vocabularies.Common.v1.EditableFieldFor"]){
					// annotation property names follow their type, so PropertyPath is the right property to look at - String has to be supported for compatibility reasons
					var sKeyProperty = oProperty["com.sap.vocabularies.Common.v1.EditableFieldFor"].PropertyPath || oProperty["com.sap.vocabularies.Common.v1.EditableFieldFor"].String;
					var sForEditProperty = oProperty.name;
					// map key fields to corresponding for edit properties to provide values in SFB (without mapping in FLP)
					if (oStartupParameters[sKeyProperty] && !oStartupParameters[sForEditProperty]){
						oStartupParameters[sForEditProperty] = oStartupParameters[sKeyProperty];
					}
					// and vice versa to support navigation to object page if field is mapped in FLP (formerly recommend)
					if (oStartupParameters[sForEditProperty] && !oStartupParameters[sKeyProperty] ){
						oStartupParameters[sKeyProperty] = oStartupParameters[sForEditProperty];
					}
				}
			});
		}

		/* checks the startup parameters for triggering navigation
		 * Note: this function is only called when sEntitySet and oStartupParameters are truthy
		 */
		function fnProcessStartupParameters(oNavigationControllerProxy, sEntitySet, oStartupParameters) {
			var oManifestEntryGenricApp = oNavigationControllerProxy.oAppComponent.getConfig();
			var oModel = oNavigationControllerProxy.oAppComponent.getModel();
			// wait for the ODataMetaModel to be loaded
			oModel.attachMetadataFailed(oNavigationControllerProxy.fnInitializationResolve);
				// get all properties of type Edm.guid from the entityType and transform the strings if needed
				fnTransformEdmGuidParams(oModel, sEntitySet, oStartupParameters);
				var sPreferredMode = oStartupParameters.preferredMode && oStartupParameters.preferredMode[0];
				var sMode = oStartupParameters.mode && oStartupParameters.mode[0];
				var oMode = fnCombineMode(sPreferredMode, sMode);
				fnDetermineEntitySetForStartup(oNavigationControllerProxy, sEntitySet, oStartupParameters).then(function(sTargetEntitySet){
					sEntitySet = sTargetEntitySet;
				switch (oMode.mode) {
					case "create":
						fnPrepareCreate(oNavigationControllerProxy);
						//Added to perform intentbased navigation from 1 app to another app's creationEntitySet's create page.
						var sCreationEntitySet = (oManifestEntryGenricApp.pages[0] &&
											oManifestEntryGenricApp.pages[0].component &&
													oManifestEntryGenricApp.pages[0].component.settings &&
														oManifestEntryGenricApp.pages[0].component.settings.creationEntitySet);
							sEntitySet = sCreationEntitySet || sEntitySet;
						var oPredefinedValues = fnStartupParameters2PredefinedValuesForCreate(oNavigationControllerProxy, oStartupParameters);
						var oDraftController = oNavigationControllerProxy.oAppComponent.getTransactionController().getDraftController();
						var bIsDraft = oDraftController.getDraftContext().isDraftEnabled(sEntitySet);
						var fnInitRouter = fnInitialiseRouting.bind(null, oNavigationControllerProxy, oStartupParameters);
						if (bIsDraft) {
							//get the treenode(internal representation of page)
							var oTreeNode = oNavigationControllerProxy.oTemplateContract.mEntityTree[sEntitySet] || 
											oNavigationControllerProxy.oTemplateContract.mRoutingTree.root;
							//create component and register view in order to get oController and oApplicationController.
							oNavigationControllerProxy.prepareHostView(oTreeNode);
							var oTargets = oNavigationControllerProxy.oRouter.getTargets();
							oTargets.display(oTreeNode.sRouteName);
							var oNavigatedPromise = oTreeNode.componentCreated.then(function(oComponent) {
								var oComponentRegistryEntry = oNavigationControllerProxy.oTemplateContract.componentRegistry[oComponent.getId()];
								return oComponentRegistryEntry.viewRegistered.then(function() {
									var sRootExpand = null;
									var oController = oComponentRegistryEntry.oController;
									var oApplicationController = oNavigationControllerProxy.oTemplateContract.oAppComponent.getApplicationController();
									var bUseNewActionForCreate = (oManifestEntryGenricApp.pages[0] &&
																	oManifestEntryGenricApp.pages[0].component &&
																	oManifestEntryGenricApp.pages[0].component.settings &&
																	oManifestEntryGenricApp.pages[0].component.settings.useNewActionForCreate);
									var oParameters = {
										sRootExpand: sRootExpand,
										oController: oController,
										oApplicationController: oApplicationController,
										bUseNewActionForCreate: bUseNewActionForCreate
									};
									var oCreatePromise = CRUDHelper.create(oDraftController, sEntitySet, "/" + sEntitySet, oModel, oNavigationControllerProxy.oTemplateContract.oApplicationProxy, oPredefinedValues, oParameters);
									return oCreatePromise.then(function(oContext) {
										var mAppStates = Object.create(null);
										// if there is defaultLayoutTypeIfExternalNavigation property  in the manifest of the target application
										// set the fcl layout property from the value of defaultLayoutTypeIfExternalNavigation
										if (oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler){
											var oTreeNode = oNavigationControllerProxy.oTemplateContract.mEntityTree[sEntitySet];
											oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler.adaptAppStatesForExternalNavigation(oTreeNode, mAppStates);
										}
										oNavigationControllerProxy.navigateToSubContext(oContext, true, 4, null, mAppStates).then(fnInitRouter);
									}, function(oError) {
										fnInitRouter();
										oNavigationControllerProxy.navigateToMessagePage({
											title: oNavigationControllerProxy.oTemplateContract.getText("ST_GENERIC_ERROR_TITLE"),
											text: oError.messageText,
											description: "",
											icon: "sap-icon://message-error"
										});
									});
								});
							});
							oNavigationControllerProxy.oTemplateContract.oBusyHelper.setBusy(oNavigatedPromise, true);
						} else {
							var mAppStates = Object.create(null);
							// if there is defaultLayoutTypeIfExternalNavigation property  in the manifest of the target application
							// set the fcl layout property from the value of defaultLayoutTypeIfExternalNavigation
							if (oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler){
								var oTreeNode = oNavigationControllerProxy.oTemplateContract.mEntityTree[sEntitySet];
								oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler.adaptAppStatesForExternalNavigation(oTreeNode, mAppStates);
							}
							oNavigationControllerProxy.navigateForNonDraftCreate(sEntitySet, oPredefinedValues, null, mAppStates).then(fnInitRouter);
						}
						break;

					case "createWithContext":
						fnPrepareCreate(oNavigationControllerProxy);
						var oCreateWithContextPromise = new Promise(function(fnResolve, fnReject){
							var fnHandleError = function(oError){
								fnReject();
								fnInitialiseRouting(oNavigationControllerProxy, oStartupParameters);
								oNavigationControllerProxy.navigateToMessagePage({
									title: oNavigationControllerProxy.oTemplateContract.getText("ST_ERROR"),
									text: (oError && oError.messageText) || oNavigationControllerProxy.oTemplateContract.getText("ST_GENERIC_UNKNOWN_NAVIGATION_TARGET"),
									icon: "sap-icon://message-error",
									description: ""
								});
							};
							var oEntitySet = oModel.getMetaModel().getODataEntitySet(sEntitySet);
							var oDraftRoot = oEntitySet["com.sap.vocabularies.Common.v1.DraftRoot"];
							if (oDraftRoot && oDraftRoot.NewAction) {
								var oFunctionImport = oModel.getMetaModel().getODataFunctionImport(oDraftRoot.NewAction.String.split("/")[1]);
								var oUrlParameters = {};
								if (oFunctionImport) {
									var iLength = oFunctionImport.parameter ? oFunctionImport.parameter.length : 0;
									for (var i = 0; i < iLength; i++) {
										var oParameter = oFunctionImport.parameter[i];
										if (oParameter.mode === "In" && oStartupParameters[oParameter.name] && oStartupParameters[oParameter.name][0]) {
											oUrlParameters[oParameter.name] = oStartupParameters[oParameter.name][0];
										}
									}
									oModel.callFunction("/" + oFunctionImport.name, {
										success: function(oData, oResponse) {
											var oModelUtil = new ModelUtil(oModel);
											var oContext = oModelUtil.getContextFromResponse(oData);
											if (oContext) {
												fnResolve();
												oNavigationControllerProxy.navigateToSubContext(oContext, true, 4).then(fnInitialiseRouting.bind(null,
													oNavigationControllerProxy, oStartupParameters));
											} else {
												fnHandleError();
											}
										},
										error: fnHandleError,
										method: "POST",
										urlParameters: oUrlParameters
									});
								} else {
									fnHandleError();
								}
							} else {
								fnHandleError();
							}
						});
						oNavigationControllerProxy.oTemplateContract.oBusyHelper.setBusy(oCreateWithContextPromise, true);
						break;

					case "edit":
						// App opens with an edit view, if there is a draft...if not, creates a draft
						var oStartupParametersWithEditableFor = extend({}, oStartupParameters);
						fnProcessEditableFieldFor(oModel.getMetaModel(), sEntitySet, oStartupParametersWithEditableFor);
						var oNavigationPossible = fnCheckNavigation(oModel, oNavigationControllerProxy, sEntitySet,
								oStartupParametersWithEditableFor, oMode);
						if (oNavigationPossible.aNavigablePages && oNavigationPossible.aNavigablePages[0] &&
							(oNavigationPossible.aNavigablePages[0].bNavigationWithTechnicalKeyPossible ||
								(oNavigationPossible.aNavigablePages[0].aSemanticKey && oNavigationPossible.aNavigablePages[0].iLevel === 0))) {
							var sBindingPath = "";
							var oEditPromise;
							if (oNavigationPossible.aNavigablePages[0].bNavigationWithTechnicalKeyPossible) {
								sBindingPath = oModel.createKey(sEntitySet, oStartupParametersWithEditableFor);
								oEditPromise = CRUDHelper.edit(
									oNavigationControllerProxy.oAppComponent.getTransactionController(), sEntitySet,
									"/" + sBindingPath, oModel,
									oNavigationControllerProxy.oTemplateContract,
									oNavigationControllerProxy.fnInitializationResolve);
							} else if (oNavigationPossible.aNavigablePages && oNavigationPossible.aNavigablePages[0] && oNavigationPossible.aNavigablePages[0]
								.aSemanticKey && oNavigationPossible.aNavigablePages[0].iLevel === 0) {
								sBindingPath = "";
								oEditPromise = CRUDHelper.edit(
									oNavigationControllerProxy.oAppComponent.getTransactionController(),
									sEntitySet,
									sBindingPath, oModel,
									oNavigationControllerProxy.oTemplateContract,
									oNavigationControllerProxy.fnInitializationResolve,
									oNavigationPossible.aNavigablePages[0].aSemanticKey, oStartupParametersWithEditableFor);
							}

							oEditPromise.then(function(oResult) {
								var mAppStates = Object.create(null);
								// if there is defaultLayoutTypeIfExternalNavigation property  in the manifest of the target application
								// set the fcl layout property from the value of defaultLayoutTypeIfExternalNavigation
								if (oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler){
									var oTreeNode = oNavigationControllerProxy.oTemplateContract.mEntityTree[sEntitySet];
									oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler.adaptAppStatesForExternalNavigation(oTreeNode, mAppStates);
								}
								oNavigationControllerProxy.navigateToSubContext(oResult.context, true, 2, null, mAppStates)
									.then(function() {
										fnInitialiseRouting(oNavigationControllerProxy);
									});
							}, function(oError) {
								if (oError.lockedByUser) {
									if (!oMode.force) {
										fnDefaultNavigationProcessing(oModel, oNavigationControllerProxy, sEntitySet,
											oStartupParameters, oMode);
									} else {
										oNavigationControllerProxy.fnInitializationResolve(); // to finish busyIndicator
										// before
										oNavigationControllerProxy.navigateToMessagePage({
											title: oNavigationControllerProxy.oTemplateContract
												.getText("LOCKED_OBJECT_POPOVER_TITLE"),
											text: oNavigationControllerProxy.oTemplateContract
												.getText("LOCKED_OBJECT_POPOVER_TITLE"),
											description: oNavigationControllerProxy.oTemplateContract.getText(
												"ST_GENERIC_LOCKED_OBJECT_POPOVER_TEXT", [oError.lockedByUser]),
											icon: "sap-icon://message-error",
											replaceURL: true
										});
									}
								} else if (oError.draftAdminReadResponse) {
									fnInitialiseRouting(oNavigationControllerProxy, oStartupParameters);
									/*
									oNavigationControllerProxy.fnInitializationResolve(); // to finish busyIndicator before
									oNavigationControllerProxy
									.navigateToMessagePage({
										title: oNavigationControllerProxy.oTemplateContract
										.getText("ST_GENERIC_ERROR_TITLE"),
										text: oNavigationControllerProxy.oTemplateContract
										.getText("ST_GENERIC_ERROR_SYSTEM_UNAVAILABLE"),
										description: oNavigationControllerProxy.oTemplateContract
										.getText("ST_GENERIC_ERROR_SYSTEM_UNAVAILABLE_DESC"),
										icon: "sap-icon://message-error",
										replaceURL: true
									});*/
								} else {
									// in case user is not authorized to edit object HTTP400. Show popup and navigate to active object
									var oPopupText = oNavigationControllerProxy.oTemplateContract.getText("ST_GENERIC_ERROR_NOT_AUTORIZED_EDIT");
									MessageBox.warning(
										oPopupText, {
											onClose: function(sAction) {
												fnDefaultNavigationProcessing(
													oModel,
													oNavigationControllerProxy,
													sEntitySet,
													oStartupParameters, {
														mode: "display",
														force: false
													});
											}
										});
								}
							});
						} else {
							fnInitialiseRouting(oNavigationControllerProxy, oStartupParameters);
						}
						break;

					case "display":
						fnDefaultNavigationProcessing(oModel, oNavigationControllerProxy, sEntitySet, oStartupParameters, oMode);
						break;

					default: // including case "unsupported"
						oNavigationControllerProxy.fnInitializationResolve(); // to finish busyIndicator before showing error page
						oNavigationControllerProxy.navigateToMessagePage({
							title: oNavigationControllerProxy.oTemplateContract.getText("ST_GENERIC_ERROR_TITLE"),
							text: oNavigationControllerProxy.oTemplateContract.getText("ST_GENERIC_ERROR_TITLE"),
							description: oNavigationControllerProxy.oTemplateContract.getText("PARAMETER_COMBINATION_NOT_SUPPORTED", [sMode, sPreferredMode]),
							icon: "sap-icon://message-error",
							replaceURL: true
						});
				}
			});
		}
		// - End methods for processing the startup parameters

		// The function exposed by this class: Startup the router
		function fnStartupRouter(oNavigationControllerProxy) {
			// check the manifest.json for the flexibleColumnLayout
			var oFCLSettings = oNavigationControllerProxy.oAppComponent.getFlexibleColumnLayout();
			if (oFCLSettings) {
				oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler = new FlexibleColumnLayoutHandler(
					oNavigationControllerProxy.oTemplateContract.oNavigationHost, oNavigationControllerProxy
				);
			}
			var oHostViewPrepared = XMLView.create({
				viewName: "sap.suite.ui.generic.template.fragments.TemplateHost"
			}).then(function(oHostViewTemplate){
				oNavigationControllerProxy.createHostView = function(){
					return oHostViewTemplate.clone();	
				};				
			});
			var oModel = oNavigationControllerProxy.oAppComponent.getModel();
			var oPreparationDone = Promise.all([oHostViewPrepared, oModel.getMetaModel().loaded()]);
			oPreparationDone.then(function(){
				var sEntitySet = generateRoutingMetadataAndGetRootEntitySet(oNavigationControllerProxy);
				var oData = oNavigationControllerProxy.oAppComponent.getComponentData();
				var oStartupParameters = oData && oData.startupParameters;
				// check if there entitySet and startup parameters are present and no hash exists!
				if (sEntitySet && oStartupParameters && !oNavigationControllerProxy.oHashChanger.getHash()) {
					fnProcessStartupParameters(oNavigationControllerProxy, sEntitySet, oStartupParameters);	
				} else {
					fnInitialiseRouting(oNavigationControllerProxy);
				}
			});
		}
		
		/*This method returns a promise, which resolves to the entityset to which the navigate should happen
		* The semantic object annotation of the all the level 1 (first level) Object pages are taken and matched 
		* with the semantic object that is used for the navigation to happen, and the matich entity set is used
		* to open the object page
		*/
		function fnDetermineEntitySetForStartup(oNavigationControllerProxy, sRootEntitySet, oStartupParameters){
			return new Promise(function(fnResolve){
				var sObjectPageEntitySet = sRootEntitySet;
				var aRootObjectPage = oNavigationControllerProxy.oTemplateContract.mRoutingTree.root.children;											
				var oParsedUrlPromise =  oNavigationControllerProxy.getParsedShellHashFromFLP();	
					oParsedUrlPromise.then(function(oResults){	
					var oParsedUrl = oResults.parseShellHash(document.location.hash);
					for (var i = 0; i < aRootObjectPage.length; i++){
							if (oParsedUrl && oParsedUrl.semanticObject === oNavigationControllerProxy.oTemplateContract.mEntityTree[aRootObjectPage[i]].semanticObject){
								//sObjectPageEntitySet is used as a root here to find the intial OP page
								sObjectPageEntitySet = aRootObjectPage[i];
								break;
							}
						
					}
					fnResolve(sObjectPageEntitySet);
				});
			});
		}

		function getCrossAppNavService(){
			return oCrossAppNavService;
		}

		// Expose selected private functions to unit tests
		//
		/* eslint-disable */
		var generateRoutingMetadataAndGetRootEntitySet = testableHelper.testableStatic(generateRoutingMetadataAndGetRootEntitySet,
			"routingHelpergenerateRoutingMetadataAndGetRootEntitySet");
		var fnInitialiseRouting = testableHelper.testableStatic(fnInitialiseRouting, "routingHelper_initialiseRouting");
		var fnReadObject = testableHelper.testableStatic(fnReadObject, "routingHelper_readObject");
		var fnProcessStartupParameters = testableHelper.testableStatic(fnProcessStartupParameters, "routingHelper_processStartupParameters");
		var fnTransformEdmGuidParams = testableHelper.testableStatic(fnTransformEdmGuidParams, "routingHelper_transformStartupGuidParameters");
		/* eslint-enable */

		return {
			startupRouter: fnStartupRouter,
			readObjectProcessResults: fnReadObjectProcessResults,
			getCrossAppNavService: getCrossAppNavService,
			getEmbeddedComponentsPatternDelimiter: getEmbeddedComponentsPatternDelimiter
		};
	});
