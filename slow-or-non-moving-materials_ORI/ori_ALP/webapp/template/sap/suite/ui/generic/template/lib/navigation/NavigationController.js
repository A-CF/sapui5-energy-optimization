/*
 * ! SAP UI development toolkit for HTML5 (SAPUI5)

		(c) Copyright 2009-2015 SAP SE. All rights reserved
	
 */

// ------------------------------------------------------------------------------------------------------------
// This class handles inner app navigation for Smart Template based apps.
// The class exposes its services in two ways:
// 1. There is a public API providing the navigation methods navigateToRoot, navigateToContext, navigateToMessagePage, and navigateBack
//    to Template developers and even Breakout developers.
// 2. A richer object oNavigationControllerProxy is created (see constructor) which is used by the core classes of the SmartTemplate framework.
//    This object allows more detailed interaction with navigation.

// Moreover, this class is responsible for handling the route matched events occuring within a Smart Template based App.

// Within this class we differentiate between a number of different scenarios for navigation/url-changes:
// 1. A state change is a change of the url which does not lead to a new route, but just modifies the encoding of the internal state of one view in the
//    url. Whenever a route matched event occurs it is first checked, whether this corresponds to a state change.
//    If this is true, we do not consider it as a navigation and all further handling of the url within this class is stopped.
//    It is assumed that the state change is totally controlled by the component that has initiated the state change.
//    Note that agents might register themselves as possible state changers via sap.suite.ui.generic.template.lib.Application.registerStateChanger.
//    A new url is passed to the registered state changers one after the other (method isStateChange). If any of those returns true the processing
//    of the url is stopped.
// 2. Illegal urls: The user enters a url which belongs to this App but not to a legal route. This is not considered as a navigation.
// 3. Back navigation: Back navigation can be triggered by the user pressing the browser-back button (then we have no control), the user pressing the
//    back button within the App, or programmatically (e.g. after cancelling an action).
// 4. Programmatic (forward) navigation: The program logic often demands the navigation to be triggerd programmatically. Such navigation is always forwarded to
//    function fnNavigateToRoute (resp. fnNavigate  for some some legacy implementations).
//    There are a lot of specialized navigation functions which first do some analysis and then forward  to fnNavigateToRoute (resp. fnNavigate) in an appropriate way.
//    These functions may also decide that the navigation might be performed by a back navigation.
//    Note that it is also possible to navigate programmatically to the MessagePage. However, this does not change the url and is therefore not considered as navigation.
// 5. Manual navigation: The user can navigate inside the running App by modifying the url manually (more probable: by selecting a bookmark/history entry
//    which leads to some other place within the App). Note that in this case the navigation may be totally uncontrolled within the App.
// 6. Follow-up navigation: In some cases a navigation directly triggers another navigation. For the user only one navigation step is performed although the url changes several times.
//    In principle there are two scenarios for the follow-up navigation:
//    a) The url-change is performed programmatically. The target url is 'nearly' identical with a url contained in the history.
//       This means that these two urls only differ regarding query parameters representing the state of the ui
//       In this case we try to perform the navigation as a (possibly multiple) backward navigation followed by a (replacing) forward navigation.
//       The follow-up forward navigation is already prepared before the backward navigation is triggered.
//       The decision whether such a follow-up navigation is really needed will be done, when the route-matched event is processed.
//    b) The need for follow-up navigation is detected when a route-matched event is processed. In this case the url-change may have been performed programmatically
//       or manually. This case, e.g. applies when the url points to a draft which has meanwhile been activated.
// 7. Pseudo navigation: The url is not changed, but the set of views to be displayed changes. This can happen, when the message page is displayed or when the
//    user changes the size of the browser in an FCL-based App.
//
// We also use the notion of 'logical navigation steps'.
// Cases 3, 4, and 5 are considered to be logical navigation steps.
// 2 is no logical navigation step, but will be forwarded to 7 (message page displayed).
// State changes (1), follow-up navigation (6), and pseudo navigation (7) will not create a new logical navigation step. However, they will be used to update the information of the
// current logical navigation step.
//
// Moreover, we have the notion of a 'session'. A session is started when the user enters a specific app and ends when the user navigates away from it.
// However, the user might later on come back to the same session by using back navigation. In this case the state information of the session should be reactivated.
// Note, that it depends on url-parameter sap-keep-alive whether the internal state of the app is being destroyed when the user leaves a session.
// If sap-keep-alive is true the internal state will still be there when the user enters the same app once more. This is independent on whether he does this via back
// navigation (in this case the old session should be extended) or forward navigation (in this case a new session should be started).
// If sap-keep-alive is false a new instance of this class will be created  whenever the user comes to the app, be it backward or forward navigation.
// ------------------------------------------------------------------------------------------------------------
sap.ui.define(["sap/ui/base/Object",
	"sap/ui/core/ComponentContainer",
	"sap/ui/core/routing/HashChanger",
	"sap/ui/core/routing/History",
	"sap/ui/core/library",
	"sap/suite/ui/generic/template/lib/CRUDHelper",
	"sap/suite/ui/generic/template/lib/ProcessObserver",
	"sap/suite/ui/generic/template/lib/Queue",
	"sap/suite/ui/generic/template/lib/navigation/jsonHelper",
	"sap/suite/ui/generic/template/lib/navigation/routingHelper",
	"sap/suite/ui/generic/template/lib/TemplateComponent",
	"sap/suite/ui/generic/template/lib/testableHelper",
	"sap/ui/fl/ControlPersonalizationAPI",
	"sap/suite/ui/generic/template/lib/FeLogger",
	"sap/base/util/merge",
	"sap/base/util/extend",
	"sap/base/util/isEmptyObject",
	"sap/base/util/UriParameters",
	"sap/suite/ui/generic/template/lib/FeError"
], function(BaseObject, ComponentContainer, HashChanger, History, coreLibrary, CRUDHelper, ProcessObserver, Queue, jsonHelper, routingHelper,
			TemplateComponent, testableHelper, ControlPersonalizationAPI, FeLogger, merge, extend, isEmptyObject, UriParameters, FeError) {
	"use strict";
	var	sClassName = "lib.navigation.NavigationController";
	var oLogger = new FeLogger(sClassName).getLogger();
	// shortcut for sap.ui.core.routing.HistoryDirection
	var HistoryDirection = coreLibrary.routing.HistoryDirection;
	var oHistory = History.getInstance();

	function isBackwards(sDirection){
		sDirection = sDirection || oHistory.getDirection();
		return sDirection === HistoryDirection.Backwards;
	}

	var oCrossAppNavigator = routingHelper.getCrossAppNavService();
	// Definition of two appState parameter name constants for the url:
	var sAppStateForCreate = "sap-iapp-state--create"; // use this as an appState in case a non-draft create takes some parameters
	var sAppStateForHistory = "sap-iapp-state--history"; // this appState will carry the internal history information of this session

	function removeQueryInRouteName(sRouteName) {
		// remove query in sRouteName
		var checkForQuery = sRouteName.substring(sRouteName.length - 5, sRouteName.length);
		if (checkForQuery === "query") {
			return sRouteName.substring(0, sRouteName.length - 5);
		}
		return sRouteName;
	}


	// Private static methods

	// The part of the url specifying in detail the target within the App is called the hash. Note that this hash sometimes comes with a leading "/", sometimes without. Both
	// representations are equivalent. This function creates a normalized representation (always containing the leading "/"). Below this representation is called "normalized hash".
	function fnNormalizeHash(sHash) {
		if (sHash.indexOf("/") === 0){
			return sHash;
		}
		return "/" + sHash;
	}

	function fnAppStates2ParString(oAppStates){
		var sDelimiter = "";
		var sRet = "";
		var aPars = Object.keys(oAppStates).sort();
		aPars.forEach(function(sPar){
			var vValue = oAppStates[sPar];
			if (Array.isArray(vValue)){
				var aValues = vValue.sort();
				for (var i = 0; i < aValues.length; i++){
					var sValue = aValues[i];
					sRet = sRet + sDelimiter + sPar + "=" + sValue;
					sDelimiter = "&";
				}
			} else {
				sRet = sRet + sDelimiter + sPar + "=" + vValue;
				sDelimiter = "&";
			}
		});
		return sRet;
	}

	function fnConcatPathAndPars(sPath, sPars){
		sPath = sPath || "";
		// use "?" or "/?" as delimiter, depending on whether sPath already ends with a "/"
		var sDelim = (sPath.charAt(sPath.length - 1) === "/") ? "?" : "/?";
		return sPath + (sPars ? sDelim + sPars : "");
	}
	
	function fnContextToNavigationInfo(oContext){
		var sPath = oContext.getPath();
		if (sPath.lastIndexOf("/") !== 0){ // might be a deep path
			var oModel = oContext.getModel();
			var oMetaModel = oModel.getMetaModel();
			sPath = oMetaModel.oMetadata._calculateCanonicalPath(sPath);  // temporary use of private UI5 function         
		}
		// Now path should be canonical
		var aPath = sPath.split("(");
		var sEntitySet = aPath.shift().substring(1); // entity set is the first component without leading "/"
		var sRest = aPath.join("("); // concatenate the rest again in case it has contained additional (s
		var sKey = sRest.substring(0, sRest.length - 1); // remove the closing )
		return {
			entitySet: sEntitySet,
			key: sKey			
		};
	}

	// Definition of instance methods
	function getMethods(oTemplateContract, oNavigationControllerProxy) {

		// The internal history of a session (isInitialNavigation, aPreviousHashes) needs to be adjusted in three scenarios:
		// 1. sap-keep-alive is true and I am navigating to the same app again via forward navigation -> internal history must be cleared
		// 2. sap-keep-alive is true and I am coming back to the same app again via backward navigation -> internal history must be adapted
		// 3. sap-keep-alive is false and I am coming back to the same ap via backward navigation -> internal history must be restored (and adapted)
		// In case that sap-keep-alive is true, the suspend and resume lifecycle events of the app are used to perform the necessary actions.
		// aSessions is a stack that contains the necessary state information
		var aSessions = []; // only relevant id sap-keep-alive is true
		// In case sap-keep-alive is false we need to encode the history information in the url.
		// Note that we are doing this even if sap-keep-alive is true, since FLP might decide to garbage collect the app anyway.
		// In order to have the history information available in the url we create an appState object which will always be updated accordingly (fnUpdateHistoryState).
		// Moreover, it will be ensured that the corresponding key is added to the url (parametername is given by sAppStateForHistory) whenever there is a history to remember.
		var oHistoryState = oCrossAppNavigator.createEmptyAppState(oTemplateContract.oAppComponent, true);
		var sHistoryKey = oHistoryState.getKey();


		// variables representing the state of the current session
		var bIsRestoring; // Will be true if we are in the phase of restoring a session that is re-entered via back-navigation
		var oMyIntentPromise; // A promise that resolves to the current intent
		// The next two variables represent the history state of the current session.
		var isInitialNavigation; // Contains the information whether this session is the start-point of the enclosing FLP session (means there is no back within the FLP session)
		var aPreviousHashes; // The list of all logical navigation steps which have already been done within this session. In particular it can be used to built the history.
                             // The entries correspond to the previous entries of oCurrentHash (see below).
                             // The first entry represents the outside world that started the app. If the session was left via forward navigation and restored after back navigation
                             // there will also be an entry representing the external world as one logical navigation step.
		var oCurrentIdentity, oCurrentHash; // These two variables are describing the state the app has currently navigated to.
		// Structure of oCurrentIdentity:
		//   ~ treeNode : the treeNode representing the current logical route
		//   ~ keys     : array of keys for the route
		//   ~ appStates: map of app states
		// Structure of oCurrentHash:
		// ~ iHashChangeCount   : the value of this property is increased with each logical navigation step. It is used to identify the logical navigation steps. Corresponds to its index in aPreviousHashes.
		// ~ backTarget         : the hashChangeCount of the logical navigation step that will be reached via back navigation. Value of 0 means, that back will leave the app.
		// ~ hash               : the (normalized) hash of the current url
		// ~ componentsDisplayed: a map which maps routes onto a number indicating their 'display state' of the corresponding template component:
		//   * 1: Component is currently visible
		//   * 2: Component is logically shown with this url, but not physically (this applies for the end column of an FCL which has been hidden
		//      due to use of ThreeColumnsBeginExpandedEndHidden or ThreeColumnsMidExpandedEndHidden layout)
		//   * 3: Component would be shown with this url, but is hidden due to current browser size and orientation (only relevant in FCL)
		//   * 4: Component is logically shown by this route, but not by this url. This applies for second or first column in FCL whic are not shown due to
		//      the current layout on this device. On desktop this only happens, when a fullscreen layout is chosen. On other devices it might also apply to other layouts.
		//   * 5: Component is logically shown, but has been replaced by an error page.
		//   * 6: Component is logically shown, but an error page is shown in a previous column (only relevant in FCL)
		// The following properties will be added during a navigation step. The exact point in time depends on the way the navigation was actually triggered.
		// ~ identity      : the currentIdentity
		// ~ LeaveByBack   : information whether the logical navigation step was left via back functionality
		// ~ backSteps     : Only relevant when LeaveByBack is true. The number of steps back which are done back in the history. Might be left out, when value is 1.
		// ~ LeaveByReplace: information whether the logical navigation step was removed from history
		// The following properties might be added temporarily to oCurrentHash if a back/forward navigation is performed by the old navigation logic (fnNavigate)
		// ~ backwardingInfo: This property is truthy in case the logical step was left via a 'complex' back navigation.
		//                    A complex back navigation can navigate more then one step back and it can be followed by a follow-up
		//                    forward navigation (in order to adjust state)
		//                    backwardingInfo contains the following properties
		//					  * count: number of back navigations that is performed at once. Note that complex back navigations always end within the navigation history of this app.
		//				      * targetHash: The (normalized) hash that finally should be reached
		// ~ forwardingInfo:  This property is only set temporarily. It is added (in fnHandleRouteMatched) in the following case
		//                    * If oCurrentHash.backwardingInfo is truthy, a new logical navigation step is started. Therefore, a new instance for oCurrentHash
		//                      is created. Property targetHash is copied from backwardingInfo of the previous instance into
		//                      forwardingInfo of the new instance.
		//                      Moreover, properties bIsProgrammatic and bIsBack of forwardingInfo are set to true and properties componentsDisplayed and iHashChangeCount are set to the same value as
		//                      in the enclosing oCurrentHash.
		// Note that during navigation it is sometomes necessary to have access to both information (source and target identity of the navigation).
		// Therefore, adapting the values for oCurrentIdentity and oCurrentHash within the routeMatched events is done step-wise: oCurrentIdentity is adapted as early as possible (fnFillCurrentIdentity),
		// whereas oCurrentHash will be updated later. Moreover, some temporary properties are added to oCurrentIdentity for this purpose:
		// ~ preset: needed to tell routeMatched whether fnFillCurrentIdentity was already called in beforeRouteMatched
		// ~ previousIdentity, componentsDisplayed: will be later moved to currentHash

		var oRoutingOptions; // this object is truthy while a navigation is going on (not a navigation triggered by fnNavigate).
							// Properties are:
							// - mode          : as defined in fnNavigateToRoute
							// - identity      : (optional if mode is negative) the target identity of the navigation
							// - followUpNeeded: is truthy if the current navigation may not be sufficient to reach the target

		var mMessagePageParams; // Is used as a buffer for input for the message page in case that we still need to find out in which column the error needs to be displayed.
		var oLinksToUpperLayer;

		var oBeforeRouteMatchedPromise = Promise.resolve();   // Promise indicating that before route matched was processed successfully. Only relevant in FCL cases.
		var oNavigationQueue = (new Queue()).start();  // queue of externally triggered navigation requests

		// This method is called when we come back into this app. oLeaveHash represents the oCurrenthash instance that was valid when the app was left via
		// forward navigation. It is assumed that this entry has already been added to aPreviousHashes.
		// This method sets oCurrenthash to an instance that represents the external app which was navigated to and now again come back from.
		function fnComeBack(oLeaveHash){
			var iNewHashChangeCount = oLeaveHash.iHashChangeCount + 1;
			oCurrentHash = { // create a current hash that represents the external app that we have been coming from
				iHashChangeCount: iNewHashChangeCount,
				backTarget: oLeaveHash.iHashChangeCount,
				componentsDisplayed: Object.create(null),
				LeaveByBack: true,
				backSteps: 1
			};
		}

		// This function is called when a session is entered (or reentered)
		function fnInitSession(){
			oTemplateContract.oBusyHelper.setBusyReason("HashChange", true);
			mMessagePageParams = {};
			bIsRestoring = isBackwards();
			if (bIsRestoring){
				oTemplateContract.oBusyHelper.getUnbusy().then(function(){ // when handling of the navigation has finished we also have finished the restoring
					bIsRestoring = false;
				});
				oRoutingOptions = { // we already know that it was a back navigation
					mode: -1
				};
				if (aSessions.length){ // the old session can be restored from our own memory
					var oOldSession = aSessions.pop();
					isInitialNavigation = oOldSession.isInitialNavigation;
					oMyIntentPromise = oOldSession.myIntentPromise;
					aPreviousHashes = oOldSession.previousHashes;
					aPreviousHashes.push(oOldSession.currentHash);
					fnComeBack(oOldSession.currentHash);
					return; // session restored -> done
				}
			} else {
				isInitialNavigation = !oCrossAppNavigator || oCrossAppNavigator.isInitialNavigation();
			}

			// According to UShell recommendation:
			oMyIntentPromise = (sap.ushell && sap.ushell.renderers && sap.ushell.Container) ? new Promise(function(fnResolve){
				sap.ushell.Container.getServiceAsync("AppLifeCycle").then(function(oAppLifeCycle){
					var oCurrentApplication = oAppLifeCycle.getCurrentApplication();
					var fnHandleIntent = function(){
						oCurrentApplication = oCurrentApplication || oAppLifeCycle.getCurrentApplication();
						var oIntent = oCurrentApplication.getIntent();
						Promise.all([oIntent, sap.ushell.Container.getServiceAsync("URLParsing")]).then(function(aResult){
							var oIntent = aResult[0];
							var oURLParsing = aResult[1];
							oIntent.appSpecificRoute = "&/";
							var sUrl = oURLParsing.constructShellHash(oIntent);
							fnResolve("#" + sUrl);
						});
					};
					if (oCurrentApplication){
						fnHandleIntent();
					} else {
						oAppLifeCycle.attachAppLoaded(null, fnHandleIntent);
					}
				});
			}) : Promise.resolve("");
			oCurrentHash = { // The initial instance represents the time before the app was started.
				iHashChangeCount: 0,
				backTarget: 0,
				componentsDisplayed: Object.create(null)
			};

			aPreviousHashes = [];
			oRoutingOptions = null;
			oCurrentIdentity = null;
			oLinksToUpperLayer = null;
		}
		fnInitSession(); // initialize the first session

		var oTemplateComponentsAvailablePromise = Promise.resolve(); // enables to wait until all needed template components have been instantiated
		var oActivationPromise = Promise.resolve(); // Enables to wait for the end of the current activation of all components

		var oRouterBusyObserver = new ProcessObserver(); // observes the time between beforeRouteMatched and RouteMatched

		// This method is being called when a session is left with sap-keep-alive = true
		function fnSuspend(){
			var bIsBackwards = isBackwards();
			if (!bIsBackwards){ // session might be restored
				aSessions.push({
					isInitialNavigation: isInitialNavigation,
					myIntentPromise: oMyIntentPromise,
					currentHash: oCurrentHash,
					previousHashes: aPreviousHashes
				});
			}
			oMyIntentPromise = null;
			oCurrentHash = null;
			aPreviousHashes	= null;
			oCurrentIdentity = null;
			oLinksToUpperLayer = null;
			mMessagePageParams = null;
		}

		function getRootComponentPromise(){
			fnPrepareHostView(oTemplateContract.mRoutingTree.root); // Make sure that the loading of the root component starts
			return oTemplateContract.mRoutingTree.root.componentCreated;
		}

		function getAppTitle(){
			return oNavigationControllerProxy.oAppComponent.getManifestEntry("sap.app").title;
		}

		// returns a promise from FLP shell which can be resolved to get information such as semantic object, action of the application
		function getParsedShellHashFromFLP(){
			var oUshellContainer = sap.ushell && sap.ushell.Container;
			return oUshellContainer && oUshellContainer.getServiceAsync("URLParsing");
		}

		// This method returns a setHierarchyPromise.
		// When this Promise is resolved, some parameter information has been added to mAppStates
		// More precisely, the key(s) having been added are parameter names that are used to store state information of the component within the url
		// The corresponding value for such a parameter is an array that contains all possible values for this parameter
		// sPath may be faulty, which means, that the binding path for the corresponding component has not changed.
		// Otherwise sPath denotes the binding path that will be used for the component.
		// Edge case: sComponentId is faulty, then a resolved Promise is returned
		function getApplicableStateForComponentAddedPromise(sComponentId, sPath, mAppStates){
			if (!sComponentId) {
				return Promise.resolve();
			}
			var oComponentRegistryEntry = sComponentId && oTemplateContract.componentRegistry[sComponentId];
			
			// debugger
			// preliminary: LR now uses appState implementation via statepreserver and has no own implementation of getUrlParameterInfo
			// but ALP still has an own implementation
			var aPromises = [];
			
			var getUrlParameterInfo = oComponentRegistryEntry && oComponentRegistryEntry.methods.getUrlParameterInfo;
			if (getUrlParameterInfo) { // own implementation of component
				aPromises.push(oComponentRegistryEntry.viewRegistered.then(function(){
				var sPathNormalized = sPath && fnNormalizeHash(sPath); // if sPath is faulty the same holds for sPathNormalized. Otherwise sPathNormalized will be the normalized version of sPath.
				return getUrlParameterInfo(sPathNormalized, oCurrentHash.componentsDisplayed[oComponentRegistryEntry.route] === 1).then(function(mNewPars){
					extend(mAppStates, mNewPars);
				});
			}));
			}
			// standard implementation using statePreserver -> to be used for all components
			// not need to wait for viewRegistered, as statepreserver waits for reusecomponentsready
			aPromises.push(oComponentRegistryEntry.oStatePreserverPromise.then(function(oStatePreserver){
				var sPathNormalized = sPath && fnNormalizeHash(sPath); // if sPath is faulty the same holds for sPathNormalized. Otherwise sPathNormalized will be the normalized version of sPath.
				return oStatePreserver.getUrlParameterInfo(sPathNormalized, oCurrentHash.componentsDisplayed[oComponentRegistryEntry.route] === 1).then(function(mNewPars){
					extend(mAppStates, mNewPars);
				});
				
			}));
			return Promise.all(aPromises);
		}

		function getApplicableStateForIdentityAddedPromise(oTargetIdentity){
			var sComponentId = oTargetIdentity.treeNode.componentId;
			var sPath = oTargetIdentity.treeNode.getPath(2, oTargetIdentity.keys);
			var mAppStates = oTargetIdentity.appStates;
			return getApplicableStateForComponentAddedPromise(sComponentId, sPath, mAppStates);
		}

		function fnAddUrlParameterInfoForRoute(sRoute, mAppStates, sPath) {
			var oTreeNode = oTemplateContract.mRoutingTree[sRoute];
			return getApplicableStateForComponentAddedPromise(oTreeNode.componentId, sPath, mAppStates);
		}

		function fnSetTitleForComponent(isAppTitlePrefered, oTitleProvider){
			var sTitle;
			if (!isAppTitlePrefered && oTitleProvider instanceof TemplateComponent){
				var oRegistryEntry = oTitleProvider && oTemplateContract.componentRegistry[oTitleProvider.getId()];
				var fnGetTitle = oRegistryEntry && oRegistryEntry.methods.getTitle;
				sTitle = fnGetTitle && fnGetTitle();
			} else if (!isAppTitlePrefered && oTitleProvider && oTitleProvider.title){
				sTitle = oTitleProvider.title;
			}
			sTitle = sTitle || getAppTitle();

			oTemplateContract.oShellServicePromise.then(function (oShellService) {
				oShellService.setTitle(sTitle);
			}).catch(function() {
				oLogger.warning("No ShellService available");
			});
		}

		// This method is called when all views have been set to their places
		function fnAfterActivationImpl(oTitleProvider){
			var aPageDataLoadedPromises = [oTemplateContract.oPagesDataLoadedObserver.getProcessFinished(true)];
			var oActiveComponent = null;
			var iCurrentHashCount = oCurrentHash.iHashChangeCount;
			delete oCurrentIdentity.componentsDisplayed; // from now on we rely on the entry in oCurrentHash
			var maxActiveViewLevel = -1;
			for (var sComponentId in oTemplateContract.componentRegistry){
				var oRegistryEntry = oTemplateContract.componentRegistry[sComponentId];
				var oMessageButtonHelper = oRegistryEntry.oControllerUtils && oRegistryEntry.oControllerUtils.oServices.oTemplateCapabilities.oMessageButtonHelper;
				var bIsActive = oCurrentHash.componentsDisplayed[oRegistryEntry.route] === 1;
				var oTemplatePrivateModel = oRegistryEntry.utils.getTemplatePrivateModel();
				oTemplatePrivateModel.setProperty("/generic/isActive", bIsActive);
				if (bIsActive){
					aPageDataLoadedPromises.push(oRegistryEntry.oViewRenderedPromise);
					if (oRegistryEntry.viewLevel > maxActiveViewLevel){
						maxActiveViewLevel = oRegistryEntry.viewLevel;
						oActiveComponent = oRegistryEntry.oComponent;
					}
				} else {
					oRegistryEntry.utils.suspendBinding();
				}
				if (oMessageButtonHelper){
					oMessageButtonHelper.setEnabled(bIsActive);
				}
			}

			var isAppTitlePrefered = oTemplateContract.oFlexibleColumnLayoutHandler && oTemplateContract.oFlexibleColumnLayoutHandler.isAppTitlePrefered();
			fnSetTitleForComponent(isAppTitlePrefered, oTitleProvider || oActiveComponent);

			Promise.all(aPageDataLoadedPromises).then(function(){
				if (iCurrentHashCount === oCurrentHash.iHashChangeCount && isEmptyObject(mMessagePageParams)){
					oTemplateContract.oAppComponent.firePageDataLoaded();
				}
			});
		}

		// Default call
		var fnAfterActivation = fnAfterActivationImpl.bind(null, null); // do not pass a TitleProvider/forward to fnAfterActivationImpl

		function getAncestorTreeNodePath(oTreeNode, iUpToLevel){
			var aRet = [];
			for (var oNode = oTreeNode; oNode.level >= iUpToLevel; oNode = oTemplateContract.mRoutingTree[oNode.parentRoute]){
				aRet.push(oNode);
			}
			return aRet.reverse();
		}

		// Start: navigation methods

		// Allow setting the current identity by unit tests
		testableHelper.testable(function(oIdentity){
			oCurrentIdentity = oIdentity;
			aPreviousHashes.push(oCurrentHash);
			oCurrentHash = {
				backTarget: 0,
				componentsDisplayed: Object.create(null)
			};
		}, "setCurrentIdentity");

		// Allow setting the history key by unit tests
		testableHelper.testable(function(sKey){
			sHistoryKey = sKey;
		}, "setHistoryKey");

		function getCurrentIdentity(){
			return oCurrentIdentity;
		}

		function areParameterValuesEqual(vValue1, vValue2){
			if (Array.isArray(vValue1) && vValue1.length < 2){
				vValue1 = vValue1[0];
			}
			if (Array.isArray(vValue2) && vValue2.length < 2){
				vValue2 = vValue2[0];
			}
			if (Array.isArray(vValue1)){
				if (Array.isArray(vValue2)){
					if (vValue1.length === vValue2.length){
						vValue1 = vValue1.sort();
						vValue2 = vValue2.sort();
						return vValue1.every(function(sValue, i){
							return sValue === vValue2[i];
						});
					}
					return false;
				}
				return false;
			}
			return vValue2 === vValue1;
		}

		// Checks whether the specified identity is reached or another navitaion to this identity is necessary
		function isIdentityReached(oIdentity){
			// 1. check for treeNode
			if (!oCurrentIdentity || oCurrentIdentity.treeNode !== oIdentity.treeNode){
				return false;
			}
			// 2. check for keys
			for (var oAncestralNode = oIdentity.treeNode; oAncestralNode.level > 0; oAncestralNode = oTemplateContract.mRoutingTree[oAncestralNode.parentRoute]){
				if (!oAncestralNode.noKey && oIdentity.keys[oAncestralNode.level] !== oCurrentIdentity.keys[oAncestralNode.level]){
					return false;
				}
			}
			// 3. check for appStates. Note that navigation to the given identity would implicitly add a history entry, so we might need to implicitly add this entry to oIidentity.appStates in order to find equality.
			if (isEmptyObject(oCurrentIdentity.appStates)){
				return isEmptyObject(oIdentity.appStates);
			}
			var oUnion = extend(Object.create(null), oIdentity.appStates, oCurrentIdentity.appStates);
			for (var sPar in oUnion){
				var sTargetParValue = (sPar === sAppStateForHistory) ? sHistoryKey : oIdentity.appStates[sPar];
				if (!areParameterValuesEqual(sTargetParValue, oCurrentIdentity.appStates[sPar])){
					return false;
				}
			}
			return true;
		}

		// Get input for router according to the properties of an identity. Note that aKeys might have more entries then required for oTreeNode (the superfluous entries will be ignored).
		function fnGetRouterInput(oTreeNode, aKeys, mAppStates){
			var oParameters = Object.create(null);
			for (var oAncestralNode = oTreeNode; oAncestralNode.level > 0; oAncestralNode = oTemplateContract.mRoutingTree[oAncestralNode.parentRoute]){
				if (!oAncestralNode.noKey){
					oParameters["keys" + oAncestralNode.level] = aKeys[oAncestralNode.level];
				}
			}
			var bIsQuery = !isEmptyObject(mAppStates);
			var sEffectiveRoute = oTreeNode.sRouteName + (bIsQuery ? "query" : "");
			if (bIsQuery){
				oParameters["query"] = mAppStates;
			}
			return {
				route: sEffectiveRoute,
				parameters: oParameters
			};
		}

		// This method assumes that oRoutingOptions represents the target of the navigation and navigates there either via a forward- or a replace-navigation (depending on bReplace)
		function fnNavigateToRouteImpl(bReplace){
			var oRouterInput = fnGetRouterInput(oRoutingOptions.identity.treeNode, oRoutingOptions.identity.keys, oRoutingOptions.identity.appStates);
			if (!oTemplateContract.ghostapp){
				oNavigationControllerProxy.oRouter.navTo(oRouterInput.route, oRouterInput.parameters, bReplace);
			}
		}

		// This method assumes that oRoutingOptions represents the target of the navigation and sets the specified display mode for the navigation targets
		function fnSetDisplayMode(iDisplayMode){
			if (!iDisplayMode || !oRoutingOptions.identity){
				return;
			}
			var fnSet = function(bIsAlreadyVisible, oComponent, sComponentId){
				sComponentId = oComponent ? oComponent.getId() : sComponentId;
				var oRegistryEntry = oTemplateContract.componentRegistry[sComponentId];
				(oRegistryEntry.methods.presetDisplayMode || Function.prototype)(iDisplayMode, bIsAlreadyVisible);
			};
			for (var oTreeNode = oRoutingOptions.identity.treeNode; oTreeNode; oTreeNode = oTreeNode.parentRoute && oTemplateContract.mRoutingTree[oTreeNode.parentRoute]){
				if (oTreeNode.componentId){
					fnSet(oCurrentHash.componentsDisplayed[oTreeNode.sRouteName] === 1, null, oTreeNode.componentId);
				} else {
					oTreeNode.componentCreated.then(fnSet.bind(null, false));
				}
				if (oTreeNode.fCLLevel === 0 || oTreeNode.fCLLevel === 3){ // only preset additional nodes if they may be displayed within the FCL
					break;
				}
			}
		}

		//  new navigation. Should replace old navigation logic.
		//  oOptions is optional. If it is not provided we assume that oRoutingOptions is already set and should contain the correct value.
		//  However, in this case mode is taken as 1.
		//  This is the follow-up navigation scenario.
		//  properties of oOptions:
		// - identity: structure is as oCurrentIdentity (see above). Optional if mode is negative.
		//             Note that the appStates property of identity will be updated, such that the correct appState for history is contained.
		// - mode: integer. Possible values:
		//         negative value: Do as many steps back. Then (if necessary) do a replace to reach the final identity.
		//         0: forward navigation
		//         1: replace navigation
		// - displayMode: Expected mode for the target display: 0 = unknown, 1 = display, 2 = edit, 4 = add, 6 = change (edit or add)
		function fnNavigateToRoute(oOptions){
			var iMode;
			if (oOptions){
				if (oOptions.identity){
					oOptions.identity.appStates[sAppStateForHistory] = sHistoryKey;
				}
				if (oRoutingOptions || (oCurrentIdentity && oCurrentIdentity.preset)){ // still another navigation going on -> route matched will be called anyway
					if (oOptions.identity){ // reassign to the new identity if there is one. Otherwise ignore.
						oRoutingOptions = {
							identity: oOptions.identity,
							followUpNeeded: true,
							mode: oRoutingOptions ? oRoutingOptions.mode : 0
						};
						fnSetDisplayMode(oOptions.displayMode);
					}
					return;
				}
				if (oOptions.identity && isIdentityReached(oOptions.identity)){ // target identity already reached -> no navigation needed
					return;
				}
				iMode = oOptions.mode;
				oRoutingOptions = {
					identity: oOptions.identity,
					mode: iMode
				};
				fnSetDisplayMode(oOptions.displayMode);
			} else {
				iMode = 1;
			}
			// If the navigation is done by a back navigation and we have a target identity an adjustment might be needed
			oRoutingOptions.followUpNeeded = oRoutingOptions.identity && iMode < 0;
			if (oRoutingOptions.identity || (iMode === -1 && oCurrentHash.backTarget)){ // an internal navigation is going to happen
				oTemplateContract.oBusyHelper.setBusyReason("HashChange", !oTemplateContract.ghostapp);
				oNavigationQueue.stop(); // do not process any new navigation function until routeMatched has been reached
				} else { // no internal navigation because of one of the following two reasons: a) back navigation leaving the app or b) back navigation ignored by the router (because there is no back target)
					oRoutingOptions = null; // only needed in case b): Clear the information that we are currently navigating (but does not hurt in case a))
			}
			if (iMode >= 0){
				fnNavigateToRouteImpl(iMode === 1);
			} else if (!oTemplateContract.ghostapp){
				window.history.go(iMode);
			}
		}

		function setTextForTreeNode(oTreeNode, sText){
			oTreeNode.text = ((oTreeNode.headerTitle !== sText) && sText) || "";
			if (oLinksToUpperLayer && oLinksToUpperLayer.linkInfos.length > oTreeNode.level){
				oLinksToUpperLayer.adjustNavigationHierarchy();
			}
		}

		function fnCreateLinkInfoForNode(oTreeNode, aAppStatePromises){
			var mAppStates = Object.create(null);
			if (oTemplateContract.oFlexibleColumnLayoutHandler){
				oTemplateContract.oFlexibleColumnLayoutHandler.adaptBreadCrumbUrlParameters(mAppStates, oTreeNode);
			}
			var oRet = {
				treeNode: oTreeNode
			};
			var oNewIdentity = {
				treeNode: oTreeNode,
				keys: oCurrentIdentity.keys.slice(0, oTreeNode.level + 1),
				appStates: mAppStates
			};
			var sBreadCrumbLink; // will be set to the link for the bread-crumb. As it is only used for opening in another window it will not contain history information
			var oAppStatePromise = getApplicableStateForIdentityAddedPromise(oNewIdentity).then(function(){
				var oRouterInput = fnGetRouterInput(oTreeNode, oCurrentIdentity.keys, mAppStates);
				sBreadCrumbLink = oNavigationControllerProxy.oRouter.getURL(oRouterInput.route, oRouterInput.parameters);
				// Now create link for navigation menu
				mAppStates[sAppStateForHistory] = sHistoryKey; // As this link will be used within the same FLP session it should contain history information
				oRouterInput = fnGetRouterInput(oTreeNode, oCurrentIdentity.keys, mAppStates);
				oRet.fullLink = oNavigationControllerProxy.oRouter.getURL(oRouterInput.route, oRouterInput.parameters);
			});
			aAppStatePromises.push(oAppStatePromise);
			// bFullscreenEnforced = navigate to full screen (that is what mAppStates reflects right now), !bFullscreenEnforced = navigate to the best suitable layout for the target (-> mAppStates needs to be adapted)
			oRet.navigate = function(iDisplayMode, bFullscreenEnforced){
				if (oTemplateContract.oFlexibleColumnLayoutHandler && !bFullscreenEnforced){
					var oLastIdentity; // try to find the last identity in history which showed this tree node
					for (var oCandidateHash = aPreviousHashes[oCurrentHash.backTarget]; oCandidateHash.backTarget > 0 && !oLastIdentity; oCandidateHash = aPreviousHashes[oCandidateHash.backTarget]){
						if (oCandidateHash.identity.treeNode === oTreeNode){
							oLastIdentity = oCandidateHash.identity;
						}
					}
					oTemplateContract.oFlexibleColumnLayoutHandler.adaptPreferredLayout(mAppStates, oTreeNode, oLastIdentity);
				}
				oTemplateContract.oBusyHelper.setBusy(oAppStatePromise.then(function(){
					return fnNavigateToIdentity(oNewIdentity, false, iDisplayMode);
				}));
			};
			oRet.adaptBreadCrumbLink = function(oLink){
				oAppStatePromise.then(function(){
					var oGlobalHashChanger = HashChanger.getInstance();
					var sHash = oGlobalHashChanger.hrefForAppSpecificHash ? oGlobalHashChanger.hrefForAppSpecificHash(sBreadCrumbLink) : "#/" + sBreadCrumbLink;
					oLink.setHref(sHash);
				});
			};
			return oRet;
		}

		function fnLinkInfoToHierachyEntry(sCurrentIntent, oLinkInfo){
			var oRet = {
				title: oLinkInfo.treeNode.headerTitle || "",
				icon: oLinkInfo.treeNode.titleIconUrl || "",
				subtitle: oLinkInfo.treeNode.text,
				intent: sCurrentIntent + oLinkInfo.fullLink
			};
			return oRet;
		}

		function fnSetLinksToUpperLayer(){
			var aLinkInfo = [];
			var aIntentAppStatePromises = [oMyIntentPromise];
			var bIncludeSelfLink = oTemplateContract.oFlexibleColumnLayoutHandler && oTemplateContract.oFlexibleColumnLayoutHandler.hasNavigationMenuSelfLink(oCurrentIdentity);
			for (var oTreeNode = bIncludeSelfLink ? oCurrentIdentity.treeNode : oTemplateContract.mRoutingTree[oCurrentIdentity.treeNode.parentRoute]; oTreeNode; oTreeNode = oTemplateContract.mRoutingTree[oTreeNode.parentRoute]){
				var oLinkInfo = fnCreateLinkInfoForNode(oTreeNode, aIntentAppStatePromises);
				aLinkInfo[oTreeNode.level] = oLinkInfo;
			}
			var oIntentAndAllAppStatesPromise = Promise.all(aIntentAppStatePromises);
			var fnAdjustNavigationHierarchy = function(){
				oTemplateContract.oShellServicePromise.then(function(oShellService){
					oShellService.setHierarchy([]);
					oIntentAndAllAppStatesPromise.then(function(aIntent){
						var sCurrentIntent = aIntent[0];
						var aHierarchy = [];
						for (var i = aLinkInfo.length - 1; i >= 0; i--){
							aHierarchy.push(fnLinkInfoToHierachyEntry(sCurrentIntent, aLinkInfo[i]));
						}
						oShellService.setHierarchy(aHierarchy);
					});
				}).catch(function() {
					oLogger.warning("No ShellService available");
				});
			};
			oLinksToUpperLayer = {
				linkInfos: aLinkInfo,
				adjustNavigationHierarchy: fnAdjustNavigationHierarchy
			};
			fnAdjustNavigationHierarchy();
		}

		function getLinksToUpperLayers(){
			return oLinksToUpperLayer.linkInfos;
		}

		function fnFillCurrentIdentity(oEvent){
			var oPreviousIdentity = oCurrentIdentity;
			if (oRoutingOptions && oRoutingOptions.identity && !oRoutingOptions.followUpNeeded){
				oCurrentIdentity = oRoutingOptions.identity;
			} else {
				oCurrentIdentity = Object.create(null);
				var oRouteConfig = oEvent.getParameter("config");
				var sRoute = removeQueryInRouteName(oRouteConfig.name);
				oCurrentIdentity.treeNode = oTemplateContract.mRoutingTree[sRoute];
				var oArguments = oEvent.getParameter("arguments");
				oCurrentIdentity.appStates = oArguments["?query"] || Object.create(null);
				oCurrentIdentity.keys = [""];
				for (var oCurrentNode = oCurrentIdentity.treeNode; oCurrentNode.level > 0; oCurrentNode = oTemplateContract.mRoutingTree[oCurrentNode.parentRoute]){
					oCurrentIdentity.keys[oCurrentNode.level] = oCurrentNode.noKey ? "" : oArguments["keys" + oCurrentNode.level];
				}
			}
			oCurrentIdentity.previousIdentity = oPreviousIdentity;
			oCurrentIdentity.componentsDisplayed = Object.create(null);
			oCurrentIdentity.componentsDisplayed[oCurrentIdentity.treeNode.sRouteName] = 1;
			fnSetLinksToUpperLayer();
		}

		function fnNavigateByExchangingQueryParam(sQueryParam, vValue){
			var oNavPromise = oRouterBusyObserver.getProcessFinished(true).then(function(){
				var oOptions = {
					identity: {
						treeNode: oCurrentIdentity.treeNode,
						keys: oCurrentIdentity.keys,
						appStates: extend(Object.create(null), oCurrentIdentity.appStates)
					},
					mode: 1
				};
				if (Array.isArray(vValue) && vValue.length < 2){
					vValue = vValue[0];
				}
				if (vValue){
					oOptions.identity.appStates[sQueryParam] = vValue;
				} else {
					delete oOptions.identity.appStates[sQueryParam];
				}
				fnNavigateToRoute(oOptions);
			});
			oTemplateContract.oBusyHelper.setBusy(oNavPromise);
			return oNavPromise;
		}

		var oSpecialDraftCancellationInfo;

		// This method navigates to the specified context. Thereby, the entity specified by this context must either belong to a root level entity set or its parent must be part of the
		// navigation hierarchy defined by the current identity.
		// optional parameters:
		// iDisplayMode: as described in fnNavigateToRoute
		// oContextInfo: an object as specified by class ContextBookkeeping. If this parameter specified a new create draft, then we consider the current identity as entry point for this draft.
		// This might be evaluated for back navigation when the corresponding draft is canceled.
		function fnNavigateToSubContext(vContext, bReplace, iDisplayMode, oContextInfo, mAppStates){
			if (!vContext || (Array.isArray(vContext) && vContext.length === 0)){
				return fnNavigateToRoot(bReplace);
			}
			var aContext = Array.isArray(vContext) ? vContext : [vContext];
			var iCount = 0,
				oCurrentTargetIdentity;

			var oTargetPromise = new Promise(function(fnResolve, fnReject){
				var fnProcessTargetIdentity = function(){
					if (iCount == aContext.length){
						fnResolve(oCurrentTargetIdentity);
					} else {
						var oContext = aContext[iCount];
						var oTargetIdentityPromise = getTargetIdentityPromiseForContext(oCurrentTargetIdentity, oContext, true, true);
						oTargetIdentityPromise.then(function(oTargetIdentity){
							iCount++;
							oCurrentTargetIdentity = oTargetIdentity;
							fnProcessTargetIdentity();
						});
					}
				};
				fnProcessTargetIdentity();
			});
			var oRet = oTargetPromise.then(function(oTargetIdentity){
				oTargetIdentity.appStates = mAppStates || Object.create(null);
				var oAppStatePromise;
				if (oTargetIdentity.treeNode.fCLLevel === 0 || oTargetIdentity.treeNode.fCLLevel === 3){
					oAppStatePromise = getApplicableStateForIdentityAddedPromise(oTargetIdentity);
				} else {
					oAppStatePromise = oTemplateContract.oFlexibleColumnLayoutHandler.getAppStatesPromiseForNavigation(oCurrentIdentity, oTargetIdentity);
				}
				// if vContext represents a newly created create draft we store the current navigation state as the state to navigate to in case this draft will be cancelled.
				if (!bReplace && oContextInfo && oContextInfo.bIsCreate && oContextInfo.bIsDraft && !oContextInfo.bIsDraftModified){
					oSpecialDraftCancellationInfo = {
						index: aPreviousHashes.length,
						path: vContext.getPath(),
						identity: oTargetIdentity,
						displayMode: getCurrentDisplayMode()
					};
				}
				return oAppStatePromise.then(function(){
					return fnNavigateToIdentity(oTargetIdentity, bReplace, iDisplayMode);
				});
			});
			oTemplateContract.oBusyHelper.setBusy(oRet);
			return oRet;
		}

		function getSpecialDraftCancelPromise(oContext){
			if (!oSpecialDraftCancellationInfo || oSpecialDraftCancellationInfo.path !== oContext.getPath()){
				return null;
			}
			// check whether navigation was only below the draft which is cancelled
			var oTestHash;
			var fnDiffer = function(sKey, i){
				return sKey !== oTestHash.identity.keys[i];
			};
			for (var i = oSpecialDraftCancellationInfo.index + 1; i < aPreviousHashes.length; i++){
				oTestHash = aPreviousHashes[i]; // one navigation step in between
				if (!oTestHash.identity.treeNode || oTestHash.identity.treeNode.level < oSpecialDraftCancellationInfo.identity.treeNode.level || oSpecialDraftCancellationInfo.identity.keys.some(fnDiffer)){
					return null; // this was a navigation step which was not a child of the cancelled draft
				}
			}
			var iSteps = 0; // the number of steps we need to go back to come to the original object
			for (var oHash = oCurrentHash; oHash.iHashChangeCount !== oSpecialDraftCancellationInfo.index; oHash = aPreviousHashes[oHash.backTarget]){
				if (oHash.iHashChangeCount < oSpecialDraftCancellationInfo.index){
					return null; // it is not possible to get back to the target object via back navigation
				}
				iSteps--;
			}
			var oIdentityBefore = aPreviousHashes[oSpecialDraftCancellationInfo.index].identity; // this is our target object, but the appStates may have changed
			var oTargetIdentity = {
				treeNode: oIdentityBefore.treeNode,
				keys: oIdentityBefore.keys,
				appStates: Object.create(null)
			};
			var fnRet = fnNavigateToRoute.bind(null, { // this function describes the desired navigation
				identity: oTargetIdentity,
				mode: iSteps,
				displayMode: oSpecialDraftCancellationInfo.displayMode
			});
			if (oIdentityBefore.treeNode.fCLLevel === 0 || oIdentityBefore.treeNode.fCLLevel === 3){
				extend(oTargetIdentity.appStates, oIdentityBefore.appStates);
				return Promise.resolve(fnRet);
			}
			return oTemplateContract.oFlexibleColumnLayoutHandler.getSpecialDraftCancelPromise(oCurrentIdentity, oIdentityBefore, oTargetIdentity.appStates).then(function(){
				return fnRet;
			});
		}

		// This method is called, when we switch from active to inactive or the other way around
		// oSiblingContext is the target context. It is assumed that we are currently displaying its sibling (and in FCL possibly descendants of that).
		// The method returns a Promise that resolves to a function that should be used for navigating to the sibling
		function getSwitchToSiblingPromise(oSiblingContext, iDisplayMode){
			var oTarget = fnContextToNavigationInfo(oSiblingContext);
			var oTargetIdentity = { // the identity to be used for navigation. Will be filled below
					keys: ["", oTarget.key],
					appStates: Object.create(null)
			};
			var fnRet = fnNavigateToIdentity.bind(null, oTargetIdentity, true, iDisplayMode); // The navigation function the Promise which is returned will resolve to
			if (oCurrentIdentity.treeNode.level === 1){ // no child pages open -> navigation is easy
				oTargetIdentity.treeNode = oCurrentIdentity.treeNode;
				extend(oTargetIdentity.appStates, oCurrentIdentity.appStates);
				return Promise.resolve(fnRet);
			}
			var aTreeNodes = getAncestorTreeNodePath(oCurrentIdentity.treeNode, 2); // an array of the nodes from level 2 on which are currently visible
			var aSiblingKeysPromises = aTreeNodes.map(function(oTreeNode){ // an array of Promises corresponding to aTreeNodes. The Promises resolve to the keys to be used for that tree node (resp true if no key is needed and undefined if the corresponding column needs to be closed)
				if (oTreeNode.noKey){
					return Promise.resolve(true);
				}
				if (!oTreeNode.isDraft){
					return Promise.resolve(oCurrentIdentity.keys[oTreeNode.level]);
				}
				var sContextPath = oTreeNode.getPath(3, oCurrentIdentity.keys);
				var oSiblingPromise = oTemplateContract.oApplicationProxy.getSiblingPromise(sContextPath);
				return oSiblingPromise.then(function(oSiblingContext){
					var oNavTarget = oSiblingContext && fnContextToNavigationInfo(oSiblingContext);
					return oNavTarget && oNavTarget.key; // if no sibling exists for the given TreeNode (would be the case for create drafts) hierarchy ends one level above
				}, Function.prototype);
			});
			var oAllSiblingKeysPromises = Promise.all(aSiblingKeysPromises);
			return oAllSiblingKeysPromises.then(function(aKeys){
				var oTargetNode = oTemplateContract.mEntityTree[oTarget.entitySet];
				for (var j = 0; aKeys[j]; j++){
					oTargetNode = aTreeNodes[j];
					oTargetIdentity.keys.push(oTargetNode.noKey ? "" : aKeys[j]);
				}
				oTargetIdentity.treeNode = oTargetNode;
				if (oTargetNode === oCurrentIdentity.treeNode){ // no columns need to be closed -> navigate by leaving appStates as is
					extend(oTargetIdentity.appStates, oCurrentIdentity.appStates);
					return fnRet;
				}
				var oAppStatePromise = oTemplateContract.oFlexibleColumnLayoutHandler.getAppStatesPromiseForNavigation(oCurrentIdentity, oTargetIdentity);
				return oAppStatePromise.then(function(){
					return fnRet;
				});
			});
		}

		// This method returns a Promise that resolves to the information whether two identies (one from history, one which is considered as target of a new navigation) should be considered 'equivalent'.
		// If an equivalence is identified the navigation to the new identity will be implemeneted by a back navigation.
		// Note that oHistoricIdentity might be faulty (no history entry found). In this case the result is always false.
		// Otherwise the two identities are considered equivalent if
		// - They identify the same logical route
		// - They identify the same instance (note that active version and draft are considered identical)
		// - In FCL case: The layouts are considered equivalent
		function getIdentitiesEquivalentPromise(oHistoricIdentity, oNewIdentity){
			if ((oHistoricIdentity && oHistoricIdentity.treeNode) !== oNewIdentity.treeNode){
				return Promise.resolve(false);
			}
			if (oTemplateContract.oFlexibleColumnLayoutHandler && !oTemplateContract.oFlexibleColumnLayoutHandler.areIdentitiesLayoutEquivalent(oHistoricIdentity, oNewIdentity)){
				return Promise.resolve(false);
			}
			var bKeysEqual = true;
			var sCompareRoute = oHistoricIdentity.treeNode.sRouteName;
			for (var oCurrentNode = oHistoricIdentity.treeNode; oCurrentNode.level > 0; oCurrentNode = oTemplateContract.mRoutingTree[oCurrentNode.parentRoute]){
				var bKeyEqual = oCurrentNode.noKey || oHistoricIdentity.keys[oCurrentNode.level] === oNewIdentity.keys[oCurrentNode.level];
				if (!bKeyEqual && oCurrentNode.noOData){
					return Promise.resolve(false);
				}
				bKeysEqual = bKeysEqual && bKeyEqual;
				if (oCurrentNode.noOData){
					sCompareRoute = oCurrentNode.parentRoute;
				}
			}
			if (bKeysEqual){
				return Promise.resolve(true);
			}
			// If keys are not equal they may still define the same object in draft scenarios
			var oCompareNode = oTemplateContract.mRoutingTree[sCompareRoute];
			var aHistoricCompareKeys = oHistoricIdentity.keys.slice(0, oCompareNode.level + 1);
			var aNewCompareKeys = oNewIdentity.keys.slice(0, oCompareNode.level + 1);
			var sHistoricContextPath = oCompareNode.getPath(2, aHistoricCompareKeys);
			var sNewContextPath = oCompareNode.getPath(2, aNewCompareKeys);
			return oTemplateContract.oApplicationProxy.areTwoKnownPathesIdentical(sHistoricContextPath, sNewContextPath, oCompareNode.level === 1);
		}

		// Identifies a historic identity which might serve as candidate for back navigation to the specified target node
		// This is performed by going back in history. Thereby, we only get back more then one step if
		// - in FCL case: The specified target node is shown in begin column (i.e. fCLLevel === 0)
		// - in non FCL case: The specified target node is specified by the root node
		// Even in this case we only go back until we find a historic entry	 with a treeNode which has a level less or equal to oTargetNode.level (or we reach the initial entry in history).
		// If a candidate is found return an object possessing attributes candidateHash (the corresponding entry from aPreviousHashes) and candidateCount (a negative number denoting the number of steps to go back to this candidate).
		// Otherwise a faulty result is returned.
		function getCandidateForBackNavigation(oTargetNode){
			var oCandidateHash = aPreviousHashes[oCurrentHash.backTarget]; // the historic entry we consider as candidate for back navigation
			var iCandidateCount = -1; // the negative number of back steps that are needed to reach the current candidate
			if (oCandidateHash && (oTargetNode.level === 0 || (oTemplateContract.oFlexibleColumnLayoutHandler && oTargetNode.fCLLevel === 0))){
				for (; oCandidateHash.backTarget > 0 && oCandidateHash.identity.treeNode && oCandidateHash.identity.treeNode.level > oTargetNode.level; iCandidateCount--){
					oCandidateHash = aPreviousHashes[oCandidateHash.backTarget];
				}
			}
			return oCandidateHash && {
				candidateHash: oCandidateHash,
				candidateCount: iCandidateCount
			};
		}

		// This method navigates to the specified identity oNewIdentity.
		// bReplace determines whether the navigation is done via replace or forward navigation. However the navigation may also be performed as a back navigation if a suitable entry is found in the history.
		// iDisplayMode: as described in fnNavigateToRoute
		function fnNavigateToIdentity(oNewIdentity, bReplace, iDisplayMode){
			// First we check whether we want to perform the navigation via a (multiple) back navigation.
			// This is done in two steps:
			// 1. Identify a historic identity which might serve as candidate for back navigation
			// 2. Check whether this candidate is really 'equivalent' to the specified identity
			var oCandidate = getCandidateForBackNavigation(oNewIdentity.treeNode);
			// Now (asynchronously) check whether the identified historic identity is indeed 'equivalent' to the specified identity.
			var oIdentitiesEquivalentPromise = getIdentitiesEquivalentPromise(oCandidate && oCandidate.candidateHash.identity, oNewIdentity);
			var oRet = oIdentitiesEquivalentPromise.then(function(bEquivalent){ // bEquivalent tells us, whether we should do a back navigation. If yes, iCandidateCount tells us how far.
				var iMode = bEquivalent ? oCandidate.candidateCount : (0 + !!bReplace); // compute the mode as decribed in fnNavigateToRoute
				var oOptions = {
					identity: oNewIdentity,
					mode: iMode,
					displayMode: iDisplayMode
				};
				fnNavigateToRoute(oOptions);
			});
			oTemplateContract.oBusyHelper.setBusy(oRet);
			return oRet;
		}

		function fnNavigationContextNotFound(){
			if (bIsRestoring){
				return fnNavigateToRoot(true);
			}
			var oCurrentRegistryEntry = oTemplateContract.componentRegistry[oCurrentIdentity.treeNode.componentId];
			var oTemplatePrivateModel = oCurrentRegistryEntry.utils.getTemplatePrivateModel();
			var oDataLoadFailedTexts = getODataLoadFailedTexts();
			fnNavigateToMessagePage({
				title: oDataLoadFailedTexts.dataLoadFailedTitle,
				text: oDataLoadFailedTexts.dataLoadFailedText,
				description: "",
				viewLevel: oTemplatePrivateModel.getProperty("/generic/viewLevel")
			});
			return Promise.resolve();
		}

		function getODataLoadFailedTexts() {
			return {
				dataLoadFailedTitle: oTemplateContract.getText("ST_ERROR"),
				dataLoadFailedText: oTemplateContract.getText("ST_GENERIC_ERROR_LOAD_DATA_TEXT")
			};
		}

		// This method returns an object containing partial information for navigation. More precisely, the returned object contains properties treeNode and either key or navigationProperty.
		// If it is not possible to determine this result a faulty value is returned.
		// oSourceNode specifies the node relative to which the navigation should be executed.
		// oNavigationContext is an instance of sap.ui.model.Context. It identifies the target instance of the navigation. More precisely, the entity set of the navigation context determines
		// the target tree node. The data of the context determine the last entry in the keys-array of the target. The preceeding entries in the keys-array still need to be derived from another source
		// Therefore, the target tree node must be a child of oSourceNode or one of is ancestors.
		// Actually, bConsiderParentNodes specifies whether the ancestors of oSourceNode need to be considered, too.
		// If bWithNavProperty is true, then the entity set defined by oNavigationContext might not necessarily be identical to the entity set of the target node. It might be, that the entity set of the target node
		// only can be reached via a to 1-association from the entity set of oNavigationContext. However, in this case the corresponding navigation property must have been configured as property 'navigationProperty'
		// in the pages definition of the target node/page. Currently, this is only supported for the scenario that the target node has level 1.
		// If this situation turns out to be true the returned object contains a property navigationProperty which specified that navigation property. Otherwise the returned object contains a property key which specified the last entry of the keys area for navigation.
		function getTargetTreeNodeInfoForContext(oSourceNode, oNavigationContext, bWithNavProperty, bConsiderParentNodes){
			if (!oNavigationContext){
				return { // edge case: navigate to root
					treeNode: oTemplateContract.mRoutingTree.root,
					key: ""
				};
			}
			var oNavigationInfo = fnContextToNavigationInfo(oNavigationContext);
			// First check whether the entitySet in oNavigationInfo directly specifies oSourceNode or one of its children as target node
			var oTargetTreeNode = (oSourceNode.level && oSourceNode.entitySet === oNavigationInfo.entitySet) ? oSourceNode : oSourceNode.children.indexOf(oNavigationInfo.entitySet) >= 0 && oTemplateContract.mEntityTree[oNavigationInfo.entitySet];
			if (oTargetTreeNode){
				return {
					treeNode: oTargetTreeNode,
					key: oNavigationInfo.key
				};
			}
			if (bWithNavProperty){ // Check for special logic described above. Any child node of oSourceNode which specifies a to 1 association from the entity set in oNavigationContext is considered as target
				var oModel = oTemplateContract.oAppComponent.getModel();
				var oMetaModel = oModel.getMetaModel();
				var oEntitySet = oMetaModel.getODataEntitySet(oNavigationInfo.entitySet);
				var oEntityType = oMetaModel.getODataEntityType(oEntitySet.entityType);
				var sNavigationProperty; // will be set to the navigation property to be used in case there is one
				var bCanNavigateViaNavigationProperty = oSourceNode.children.some(function(sChildEntitySet){
					oTargetTreeNode = oTemplateContract.mEntityTree[sChildEntitySet];
					sNavigationProperty = oTargetTreeNode.navigationProperty;
					if (!sNavigationProperty){
						return false;
					}
					var oNavigationProperty = oMetaModel.getODataAssociationEnd(oEntityType, sNavigationProperty);
					return !!oNavigationProperty && oNavigationProperty.multiplicity.endsWith("1");
				});
				if (bCanNavigateViaNavigationProperty){ // if a navigation property has been found
					return {
						treeNode: oTargetTreeNode,
						navigationProperty: sNavigationProperty
					};
				}
			}
			if (bConsiderParentNodes && oSourceNode.level > 0){ // if no solution could be found yet recursively try the same with the parent node
				var oParentNode = oTemplateContract.mRoutingTree[oSourceNode.parentRoute];
				return getTargetTreeNodeInfoForContext(oParentNode, oNavigationContext, bWithNavProperty, true);
			}
		}

		function getTargetIdentityPromiseForContextImpl(oSourceNode, aSourceKeys, oNavigationContext, oTreeNodeInfo){
			if (oTreeNodeInfo.navigationProperty){
				return new Promise(function(fnResolve, fnReject){
					var oModel = oNavigationContext.getModel();
					oModel.createBindingContext(oTreeNodeInfo.navigationProperty, oNavigationContext, null, function(oTargetContext) { // translate the given navigation context into a navigation context fitting to the target node
						var oNavPromise = oTargetContext && getTargetIdentityPromiseForContextImpl(oSourceNode, aSourceKeys, oTargetContext, {
							treeNode: oTreeNodeInfo.treeNode,
							key: fnContextToNavigationInfo(oTargetContext).key
						}); // execute with the translated context and without navigation property
						if (oNavPromise){
							oNavPromise.then(fnResolve, fnReject);
						} else {
							fnReject();
						}
					});
				});
			}
			var aTargetKeys = aSourceKeys.slice(0, oTreeNodeInfo.treeNode.level);
			aTargetKeys.push(oTreeNodeInfo.key);
			return Promise.resolve({
				treeNode: oTreeNodeInfo.treeNode,
				keys: aTargetKeys
			});
		}

		// This method returns a Promise that resolves to a partial identity for navigation. More precisely, the object the Promise resolves to contains properties treeNode and keys, but not appStates.
		// If it is not possible to determine this result the returned Promise is rejected.
		// oSourceIdentity specifies a "source identity" for the navigation. If it is faulty this identity is considered to be identical to oCurrentIdentity. Otherwise components treeNode and keys of this object are checked.
		// Again, if one of these components is faulty it is taken from oCurrentIdentity. This combination is considered to be the source of navigation.
		// oNavigationContext is an instance of sap.ui.model.Context. It identifies the target instance of the navigation. More precisely, the entity set of the navigation context determines
		// the target tree node. The data of the context determine the last entry in the keys-array of the target. The preceeding entries in the keys-array still need to be derived from oSourceIdentity.keys
		// Therefore, the target tree node must be a child of oSourceIdentity.treeNode or one of is ancestors.
		// Actually, bConsiderParentNodes specifies whether the ancestors of oSourceIdentity.treeNode need to be considered, too.
		// If bWithNavProperty is true, then the entity set defined by oNavigationContext might not necessarily be identical to the entity set of the target node. It might be, that the entity set of the target node
		// only can be reached via a to 1-association from the entity set of oNavigationContext. However, in this case the corresponding navigation property must have been configured as property 'navigationProperty'
		// in the pages definition of the target node/page. Currently, this is only supported for the scenario that the target node has level 1.
		function getTargetIdentityPromiseForContext(oSourceIdentity, oNavigationContext, bWithNavProperty, bConsiderParentNodes){
			var oSourceNode = (oSourceIdentity && oSourceIdentity.treeNode) || (oCurrentIdentity && oCurrentIdentity.treeNode) || oTemplateContract.mRoutingTree.root;
			var aSourceKeys = (oSourceIdentity && oSourceIdentity.keys) || (oCurrentIdentity && oCurrentIdentity.keys) || [""];
			var oTreeNodeInfo = getTargetTreeNodeInfoForContext(oSourceNode, oNavigationContext, bWithNavProperty, bConsiderParentNodes);
			return oTreeNodeInfo ? getTargetIdentityPromiseForContextImpl(oSourceNode, aSourceKeys, oNavigationContext, oTreeNodeInfo) : Promise.reject();
		}

		// This function fills an appState promise for navigating to an ancestor or to a descendant of the current identity.
		// oTargetTreeNode the ancestor od descendant of the current identity
		// mAppStates: The map to be filled
		// aKeys: Only needed when navigating to a descendant. In this case it should be the keys of the target.
		// Returns a Promise that is resolved when mAppStates is filled.
		function getAppStatePromiseForUpDownNavigation(oTargetTreeNode, mAppStates, aKeys){
			var oTargetIdentity = {
				treeNode: oTargetTreeNode,
				keys: aKeys || oCurrentIdentity.keys.slice(0, oTargetTreeNode.level + 1),
				appStates: mAppStates
			};
			if (oTargetTreeNode.fCLLevel === 0 || oTargetTreeNode.fCLLevel === 3){
				return getApplicableStateForIdentityAddedPromise(oTargetIdentity);
			}
			return oTemplateContract.oFlexibleColumnLayoutHandler.getAppStatesPromiseForNavigation(oCurrentIdentity, oTargetIdentity);
		}

		// Perform the navigation after activation. oActiveContext might be faulty. In this case the navigation should take us to the root page.
		// Otherwise we should be taken to the active object page. All sub-object pages should be closed (sine it is currently not possible to keep them open reliably).
		function fnNavigateAfterActivation(oActiveContext){
			var oTargetIdentityPromise = getTargetIdentityPromiseForContext({ treeNode: oTemplateContract.mRoutingTree.root }, oActiveContext, false, true);
			var oRet = oTargetIdentityPromise.then(function(oTargetIdentity){
				oTargetIdentity.appStates = Object.create(null);
				var oOptions;
				if (oTargetIdentity.treeNode === oCurrentIdentity.treeNode){ // just reuse old appStates
					Object.assign(oTargetIdentity.appStates, oCurrentIdentity.appStates);
					oOptions = {
						identity: oTargetIdentity,
						mode: 1,
						displayMode: 1
					};
					fnNavigateToRoute(oOptions);
					return null;
				}
				// If we reach this point we know that the target node is different from the current node. There ar two possible scenarios for this:
				// 1. Close main object page according to manifest setting
				// 2. Close sub object page columns in FCL
				var oAppStatePromise = getAppStatePromiseForUpDownNavigation(oTargetIdentity.treeNode, oTargetIdentity.appStates);
				return oAppStatePromise.then(fnNavigateToIdentity.bind(null, oTargetIdentity, true, 1));
			});
			oTemplateContract.oBusyHelper.setBusy(oRet);
			return oRet;
		}

		// Assumption: oCurrentIdentity represents a view level which is higher then the view level specified by iTargetViewLevel.
		// Now all entities which have higher level are deleted -> Navigate to the last parent which still exists.
		// Preferably this is done via back navigation. If this is not possible we leave the app via one more back step (if the app has been reached via cross app navigation) or we try a cleanup and do a replace navigation.
		function fnNavigateUpAfterDeletion(iTargetViewLevel){
			var oCandidateHash; // a previous hash that might be reached via back navigation
			var iCandidateCount = 0; // the number of back steps needed to reach oCandidateHash
			for (oCandidateHash = oCurrentHash; oCandidateHash.backTarget > 0 && (!oCandidateHash.identity || !oCandidateHash.identity.treeNode || oCandidateHash.identity.treeNode.level > iTargetViewLevel); iCandidateCount++){
				oCandidateHash = aPreviousHashes[oCandidateHash.backTarget];
			}
			// Now oCandidateHash is the first entry in history which corresponds to a view level which is not higher then the target level.
			// If such history entry does not exist oCandidateHash is the first entry in history.
			// For this second case there are two subcases: iCandidateCount === 0 <-> there is no history
			// oCandidateHash.identity.treeNode.level > iTargetViewLevel <-> The loop above was ended because we came to the end of the history without detecting an entry with the target level (or lower)
			// In both subcases we would like to go back to the previous app, if it exists which means if isInitialNavigation is false.
			if (!isInitialNavigation && (iCandidateCount === 0 || !oCandidateHash.identity.treeNode || oCandidateHash.identity.treeNode.level > iTargetViewLevel)){
				window.history.go(-iCandidateCount - 1); // leave the app
				return;
			}
			var iMode = -iCandidateCount || 1; // The mode used for navigating to the target. If we found at least one step back we will do it. Otherwise we navigate via replace.
			// Now identify where we are going to navigate to
			var oTargetNode = getAncestralNode(iTargetViewLevel); // the target node to navigate to. This is just the ancestor of the current node having the target level.
			var oTargetIdentity = { // the identity we want to navigate to
				treeNode: oTargetNode,
				keys: oCurrentIdentity.keys.slice(0, oTargetNode.level + 1),
				appStates: Object.create(null) // still to be filled
			};
			// fill the app states
			var oNavigationPromise = getAppStatePromiseForUpDownNavigation(oTargetIdentity.treeNode, oTargetIdentity.appStates).then(function(){
				// appStates have been filled asynchronously.
				// Until now we have only identified the number of steps back which lead to the given target tree level. However, there might be navigation steps which
				// have stayed on the target level but only changed the FCL layout (fullscreen versus multi-column). In this case we go back until we either
				// come to a layout which is equivalent to the target layout or we would leave the target tree node.
				if (iMode < 0 && (oTargetIdentity.treeNode.fCLLevel === 1 || oTargetIdentity.treeNode.fCLLevel === 2) && oCandidateHash.identity.treeNode === oTargetIdentity.treeNode){
					for (; oCandidateHash.backTarget > 0 && !oTemplateContract.oFlexibleColumnLayoutHandler.areIdentitiesLayoutEquivalent(oCandidateHash.identity, oTargetIdentity); iMode--){
						oCandidateHash = aPreviousHashes[oCandidateHash.backTarget];
						if (oCandidateHash.identity.treeNode !== oTargetIdentity.treeNode){
							break;
						}
					}
				}
				var oOptions = {
					identity: oTargetIdentity,
					mode: iMode,
					displayMode: oTargetIdentity.treeNode.isDraft ? 6 : 1
				};
				fnNavigateToRoute(oOptions);
			});
			oTemplateContract.oBusyHelper.setBusy(oNavigationPromise);
			return oNavigationPromise;
		}

		var oPredefinedCreateContext;
		function fnNavigateForNonDraftCreate(sEntitySet, vPredefinedValues, oPredefinedContext, mAppStates){
			var oTargetTreeNode = oTemplateContract.mEntityTree[sEntitySet];
			var oRegistryEntry =  oTemplateContract.componentRegistry[oTargetTreeNode.componentId]; // might be undefined
			var sPredefinedKey;
			if (vPredefinedValues){
				var oAppState = oCrossAppNavigator.createEmptyAppState(oTemplateContract.oAppComponent);
				oAppState.setData(jsonHelper.getStringifiable(vPredefinedValues));
				oAppState.save();
				sPredefinedKey = oAppState.getKey();
			}
			// On startup (no oCurrentIdentity available yet) only a root instance can be created. Otherwise we can navigate relative to the current identity.
			var aKeys = oCurrentIdentity ? oCurrentIdentity.keys.slice(0, oTargetTreeNode.level) : [""];
			aKeys.push("-");
			mAppStates = mAppStates || Object.create(null);
			var oAppStatePromise = getAppStatePromiseForUpDownNavigation(oTargetTreeNode, mAppStates, aKeys);
			var oRet = oAppStatePromise.then(function(){
				if (sPredefinedKey){
					mAppStates[sAppStateForCreate] = sPredefinedKey;
				}
				var oIdentity = {
					treeNode: oTargetTreeNode,
					keys: aKeys,
					appStates: mAppStates
				};
				oPredefinedCreateContext = oPredefinedContext; // move to instance variable. Will be taken up in fnActivateOneComponent
				if (isIdentityReached(oIdentity)){ // page is already in create mode but wants to start create mode once more. Need to do this without navigation -> Call fnActivateOneComponent directly
					var oActivationInfo = {
						componentsDisplayed: oCurrentHash.componentsDisplayed,
						isNonDraftCreate: true
					};
					return fnActivateOneComponent("-", oActivationInfo, oRegistryEntry.oComponent);
				} else { // do a navigation
					// Replace navigation in startup, or if we are already in a create scenario on this view. In all other cases it will be forward navigation.
					var bReplace = !oCurrentIdentity || !!(oRegistryEntry && oRegistryEntry.nonDraftCreateContext);
					return fnNavigateToIdentity(oIdentity, bReplace, 4);
				}
			});
			oTemplateContract.oBusyHelper.setBusy(oRet);
			return oRet;
		}

		function fnAdaptUrlAfterNonDraftCreateSaved(oSavedContext){
			var oTargetIdentityPromise = getTargetIdentityPromiseForContext(null, oSavedContext, false, false);
			var oRet = oTargetIdentityPromise.then(function(oTargetIdentity){
				oTargetIdentity.appStates = Object.create(null);
				extend(oTargetIdentity.appStates, oCurrentIdentity.appStates);
				delete oTargetIdentity.appStates[sAppStateForCreate];
				var oOptions = {
					identity: oTargetIdentity,
					mode: 1
				};
				fnNavigateToRoute(oOptions);
			});
			oTemplateContract.oBusyHelper.setBusy(oRet);
			return oRet;
		}

		function getCurrentDisplayMode(){
			var oCurrentRegistryEntry = oTemplateContract.componentRegistry[oCurrentIdentity.treeNode.componentId];
			var oTemplatePrivateModel = oCurrentRegistryEntry.utils.getTemplatePrivateModel();
			var iDisplayMode = oTemplatePrivateModel.getProperty("/objectPage/displayMode") || 0;
			return iDisplayMode;
		}

		function fnNavigateToChildNode(oTargetTreeNode, bWithKey, sKey, bReplace, iDisplayMode){
			var aKeys = oCurrentIdentity.keys.slice(0, oTargetTreeNode.level);
			aKeys.push(bWithKey ? sKey : "");
			var mAppStates = Object.create(null);
			var oAppStatePromise = getAppStatePromiseForUpDownNavigation(oTargetTreeNode, mAppStates, aKeys);
			var oRet = oAppStatePromise.then(function(){
				var oIdentity = {
					treeNode: oTargetTreeNode,
					keys: aKeys,
					appStates: mAppStates
				};
				return fnNavigateToIdentity(oIdentity, bReplace, iDisplayMode);
			});
			oTemplateContract.oBusyHelper.setBusy(oRet);
			return oRet;
		}

		// This method allows to navigate to a child from a given tree node
		// - oTreeNode: The node from which the navigation starts. It must beidentical or an ancestor of oCurrentIdentity.treeNode
		// - sChildSpec: the (logical) navigation property which leads from oTreeNode to the target
		//   More precisely: If the target has been defined with a routingSpec sChildSpec should be the route name defined within this routingSpec
		//   Otherwise:
		//   * if oTreeNode is the root sChildSpec should be the target entity set
		//   * if oTreeNode is not the root sChildSpec should be the navigationProperty from the current identity to the child
		// - sEmbedded: if this is truthy the navigation is trigered by an embedded component which is specified by this key.
		//   In this case the children specified within this embedded component are also considered
		// - sKey: The additional key which is needed for the new hierarchy level (if the new level requires a key)
		// - bReplace: If this is truthy the navigation is done as a replace navigation
		function fnNavigateToChild(oTreeNode, sChildSpec, sEmbedded, sKey, bReplace){
			var sRouteName;
			var bWithKey = true;
			for (var i = 0; i < oTreeNode.children.length && !sRouteName; i++){
				var sChild = oTreeNode.children[i];
				var oChildNode = oTemplateContract.mEntityTree[sChild];
				if (oChildNode[oTreeNode.level ? "navigationProperty" : "sRouteName"] === sChildSpec){
					sRouteName = oChildNode.sRouteName;
					bWithKey = !oChildNode.noKey;
				}
			}
			var oEmbeddedComponent = !sRouteName && sEmbedded && oTreeNode.embeddedComponents[sEmbedded];
			if (oEmbeddedComponent){
				for (var j = 0; j < oEmbeddedComponent.pages.length && !sRouteName; j++){
					var oPage = oEmbeddedComponent.pages[j];
					if (oPage.navigationProperty === sChildSpec){
						sRouteName = oTreeNode.sRouteName + "/" + sEmbedded + "/" + sChildSpec;
						bWithKey = !(oPage.routingSpec && oPage.routingSpec.noKey);
					}
				}
			}
			if (sRouteName){
				var oTargetTreeNode = oTemplateContract.mRoutingTree[sRouteName];
				return fnNavigateToChildNode(oTargetTreeNode, bWithKey, sKey, bReplace, getCurrentDisplayMode());
			}
			return Promise.reject();
		}

		// This method allows navigation to an entity identified by a context (oNavigationContext).
		// oSourceNode identifies the source node of the navigation. It is assumed that it is identical to oCurrentIdentity.treeNode or one of its ancestors.
		// Therefore, the corresponding first elements of oCurrentIdentity.keys specify the key of the source of the navigation.
		// Check documentation of getTargetIdentityPromiseForContext for details how oSourceNode, the corresponding elements of oCurrentIdentity.keys, and oNavigationContext specify treeNode and keys of the target identity.
		// iDisplayMode: as described in fnNavigateToRoute
		// appStates of the target object will be determined according to default settings. This especially applies to the FCLLayout (in case an FCL is active)
		function fnNavigateFromNodeAccordingToContext(oSourceNode, oNavigationContext, iDisplayMode, bReplace){
			var oTargetIdentityPromise = getTargetIdentityPromiseForContext({ treeNode: oSourceNode }, oNavigationContext, true, false); // this determines treeNode and keys of the target identity
			var oRet = oTargetIdentityPromise.then(function(oTargetIdentity){
				oTargetIdentity.appStates = Object.create(null);
				var oAppStatePromise = getAppStatePromiseForUpDownNavigation(oTargetIdentity.treeNode, oTargetIdentity.appStates, oTargetIdentity.keys); // now determine the appStates of the target identity
				return oAppStatePromise.then(fnNavigateToIdentity.bind(null, oTargetIdentity, bReplace, iDisplayMode)); // navigate when all parameters have been determined
			});
			oTemplateContract.oBusyHelper.setBusy(oRet);
			return oRet;
		}

		// returns the information whether the app has started a navigation which is not yet finished.
		// Note: Only navigation using the fnNavigateToRoute option will be considered
		function isNavigating(){
			return !!oRoutingOptions;
		}

		function fnNavigateBack(iSteps){
			oLogger.info("Navigate back");
			if (oCurrentHash.backTarget && fnNormalizeHash(oHistory.getPreviousHash() || "") !== fnNormalizeHash(oCurrentHash.hash)){
				oTemplateContract.oBusyHelper.setBusyReason("HashChange", true);
			}
			// If oCurrentHash contains a forwardingInfo this back navigation is part of a complex back navigation.
			// In this case oCurrentHash already represents the target hash (which was created when the complex navigation started).
			// Otherwise oCurrentHash still represents the source hash. In this case we notify that the hash was left via back navigation.
			oCurrentHash.LeaveByBack = !oCurrentHash.forwardingInfo;
			if (oCurrentHash.LeaveByBack){
				oCurrentHash.backSteps = iSteps;
			}
			window.history.go(-iSteps);
		}

		/*
		 * Sets/Replaces the hash via the router/hash changer
		 * @param {string} sHash - the hash string
		 * @param {boolean} bReplace - whether the hash should be replaced
		 * @param {boolean} bKeepVariantId - keep variant id in URL (save/edit/cancel case)
		 */
		function fnNavigate(sHash, bReplace, iTargetLevel, bKeepVariantId) {
			var bObjectPageDynamicHeaderTitleWithVM = oTemplateContract.oAppComponent.getObjectPageHeaderType() === "Dynamic" && oTemplateContract.oAppComponent.getObjectPageVariantManagement() === "VendorLayer";
			var bVendorLayer;
			var oUriParameters = new UriParameters(window.location.href);
			if (oUriParameters.mParams["sap-ui-layer"]) {
				var aUiLayer = oUriParameters.mParams["sap-ui-layer"];
				for (var i = 0; i < aUiLayer.length; i++) {
					if (aUiLayer[i].toUpperCase() === "VENDOR") {
						bVendorLayer = true;
						break;
					}
				}
			}
			sHash = fnNormalizeHash(sHash || "");
			oLogger.info("Navigate to hash: " + sHash);
			if (sHash === oCurrentHash.hash){
				oLogger.info("Navigation suppressed since hash is the current hash");
				return; // ignore navigation that does nothing
			}
			oCurrentHash.targetHash = sHash;
			if (oCurrentHash.backTarget && fnNormalizeHash(oHistory.getPreviousHash() || "") === sHash){
				oNavigationControllerProxy.navigateBack();
				return;
			}
			var iCurrentLevel = oCurrentIdentity ? oCurrentIdentity.treeNode.level : 0;
			if (bObjectPageDynamicHeaderTitleWithVM && bVendorLayer) {
				if (!bKeepVariantId) {
					if (!oTemplateContract.oFlexibleColumnLayoutHandler) {
						ControlPersonalizationAPI.clearVariantParameterInURL();
					} else {
						if (iCurrentLevel >= iTargetLevel) {
							if (iTargetLevel === 1) {
								ControlPersonalizationAPI.clearVariantParameterInURL();
							} else if (iTargetLevel === 2) {
								var oRegistryEntry;
								for ( var sComponentId in oTemplateContract.componentRegistry) {
									if (oTemplateContract.componentRegistry[sComponentId].viewLevel === 2) {
										oRegistryEntry = oTemplateContract.componentRegistry[sComponentId];
										break;
									}
								}
								var oSubObjectPageVariantManagementControl = oRegistryEntry.oController.byId("template::ObjectPage::ObjectPageVariant");
								ControlPersonalizationAPI.clearVariantParameterInURL(oSubObjectPageVariantManagementControl);
							}
						}
					}
				}
			}
			oTemplateContract.oBusyHelper.setBusyReason("HashChange", true);
			oCurrentHash.LeaveByReplace = bReplace;
			if (bReplace) {
				oNavigationControllerProxy.oHashChanger.replaceHash(sHash);
			} else {
				oNavigationControllerProxy.oHashChanger.setHash(sHash);
			}
		}

		function fnNavigateToParStringPromise(sPath, oParStringPromise, iTargetLevel, bReplace, oBackwardingInfo, bKeepVariantId){
			var oRet = oParStringPromise.then(function(sPars){
				sPath = fnConcatPathAndPars(sPath, sPars);
				if (oBackwardingInfo){
					oCurrentHash.backwardingInfo = {
						count: oBackwardingInfo.count,
						index: oBackwardingInfo.index,
						targetHash: fnNormalizeHash(sPath)
					};
					fnNavigateBack(oBackwardingInfo.count);
				} else {
					fnNavigate(sPath, bReplace, iTargetLevel, bKeepVariantId);
				}
				return sPath;
			});
			oTemplateContract.oBusyHelper.setBusy(oRet);
			return oRet;
		}

		// Returns information whether the specified navigation should be performed by one or more back navigations.
		// If this is not the case a faulty object is returned.
		// Otherwise an object is returned which contains two attributes:
		// count: number of back steps needed
		// index: index in aPreviousHashes pointing to the corresponding target step
		function fnGetBackwardingInfoForTarget(bReplace, sPath, iTargetLevel){
			var oPreviousHash = aPreviousHashes[oCurrentHash.backTarget];
			return oPreviousHash && oPreviousHash.hash && fnNormalizeHash(oPreviousHash.hash.split("?")[0]) === fnNormalizeHash(sPath) && {
				count: 1,
				index: oCurrentHash.backTarget
			};
		}

		// Navigates to the root page. Thereby it restores the iappstate the root page was left (if we have already been there)
		function fnNavigateToRoot(bReplace) {
			if (oCurrentIdentity.treeNode.level === 0){
				return Promise.resolve();
			}
			var oTargetIdentity = {
				treeNode: oTemplateContract.mRoutingTree["root"],
				keys: [""],
				appStates: Object.create(null)
			};
			var oAppStatePromise = getApplicableStateForIdentityAddedPromise(oTargetIdentity);
			var oRet = oAppStatePromise.then(fnNavigateToIdentity.bind(null, oTargetIdentity, bReplace));
			oTemplateContract.oBusyHelper.setBusy(oRet);
			return oRet;
		}

		// This method is called before a navigation to a context is executed.
		// aTargetComponentPromises is an array of Promises. Each of these Promises will be resolved to a component which will be displayed in the target of the navigation.
		// If this component provides method presetDisplayMode this method will be called in order to preset the given displayMode for this component as early as possible.
		function fnPresetDisplayMode(aTargetComponentPromises, iDisplayMode){
			var mComponentsDisplayed = oCurrentHash.componentsDisplayed; // store the reference. fnPreset will be called asynchronously. At that point in time oCurrentHash might already represent the new logical navigation step
			var fnPreset = function(oComponent){
				var oRegistryEntry = oTemplateContract.componentRegistry[oComponent.getId()];
				(oRegistryEntry.methods.presetDisplayMode || Function.prototype)(iDisplayMode, mComponentsDisplayed[oRegistryEntry.route] === 1);
			};
			for (var i = 0; i < aTargetComponentPromises.length; i++){
				var oTargetPromise = aTargetComponentPromises[i];
				oTargetPromise.then(fnPreset);
			}
		}

		function fnNavigateToPath(sRoute, sPath, iTargetLevel, bReplace, bKeepVariantId){
			var oAppStates = {};
			var oFCLPromise = oTemplateContract.oFlexibleColumnLayoutHandler && oTemplateContract.oFlexibleColumnLayoutHandler.getFCLAppStatesPromise(sRoute, oAppStates);
			var oTargetPromise = fnAddUrlParameterInfoForRoute(sRoute, oAppStates, sPath);
			var oParStringPromise = (oFCLPromise ? Promise.all([oFCLPromise, oTargetPromise]) : oTargetPromise).then(fnAppStates2ParString.bind(null, oAppStates));
			var oBackwardingInfo = fnGetBackwardingInfoForTarget(bReplace, sPath, iTargetLevel);
			var oNavigationPromise = fnNavigateToParStringPromise(sPath, oParStringPromise, iTargetLevel, bReplace, oBackwardingInfo, bKeepVariantId);
			oTemplateContract.oBusyHelper.setBusy(oNavigationPromise);
			return oNavigationPromise;
		}

		// vTargetContext is either a string or an object. parameter sNavigationProperty is no longer used
		function fnNavigateToContext(vTargetContext, sNavigationProperty, bReplace, iDisplayMode, bKeepVariantId) {
			if (typeof vTargetContext === "string"){
				var sPath = vTargetContext;
				var sNormalizedPath = fnNormalizeHash(sPath);
				if (sNormalizedPath === "/"){
					return fnNavigateToRoot(bReplace);
				}
				var	aParts = sNormalizedPath.split("/");
				var	iTargetLevel = aParts.length - 1;
				var aTargetComponentPromises = [];
				var sRoute;
				switch (iTargetLevel){
					case 1: sRoute = aParts[1].split("(")[0];
						break;
					default:
						sRoute = "";
						var sSlash = "";
						for (var i = 0; i < iTargetLevel; i++){
							var sPart = aParts[i + 1];
							var iIndex = sPart.indexOf("(");
							if (iIndex > 0){
								sPart = sPart.substring(0, iIndex);
							}
							sRoute = sRoute + sSlash + sPart;
							sSlash = "/";
						}
						sRoute = sRoute.replace(routingHelper.getEmbeddedComponentsPatternDelimiter(), "/"); // for embedded components
				}
				fnPresetDisplayMode(aTargetComponentPromises, iDisplayMode || 0);
				return fnNavigateToPath(sRoute, sPath, iTargetLevel, bReplace, bKeepVariantId);
			}
			return fnNavigateToSubContext(vTargetContext, bReplace, iDisplayMode);
		}

		function setVisibilityOfRoute(sRoute, iVisibility){
			oCurrentHash.componentsDisplayed[sRoute] = iVisibility;
			var oTreeNode = oTemplateContract.mRoutingTree[sRoute];
			var sComponentId = oTreeNode.componentId;
			if (sComponentId){
				var oRegistryEntry = oTemplateContract.componentRegistry[sComponentId];
				var oTemplatePrivateModel = oRegistryEntry.utils.getTemplatePrivateModel();
				oTemplatePrivateModel.setProperty("/generic/isActive", iVisibility === 1);
			}
		}

		function fnTransferMessageParametersToGlobalModelAndDisplayMessage(mParameters) {
			var sEntitySet, sText, oEntitySet, oEntityType, oHeaderInfo, sIcon = null,
				oMetaModel, sDescription;
			if (mParameters) {
				sEntitySet = mParameters.entitySet;
				sText = mParameters.text;
				sIcon = mParameters.icon;
				sDescription = mParameters.description;
			}

			if (sEntitySet) {
				oMetaModel = oTemplateContract.oAppComponent.getModel().getMetaModel();
				if (oMetaModel) {
					oEntitySet = oMetaModel.getODataEntitySet(sEntitySet);
					oEntityType = oMetaModel.getODataEntityType(oEntitySet.entityType);
					oHeaderInfo = oEntityType["com.sap.vocabularies.UI.v1.HeaderInfo"];
				}
				if (oHeaderInfo && oHeaderInfo.TypeImageUrl && oHeaderInfo.TypeImageUrl.String) {
					sIcon = oHeaderInfo.TypeImageUrl.String;
				}
			}

			oTemplateContract.oTemplatePrivateGlobalModel.setProperty("/generic/messagePage", {
				text: sText,
				icon: sIcon,
				description: sDescription
			});

			if (oTemplateContract.oFlexibleColumnLayoutHandler){
				oTemplateContract.oFlexibleColumnLayoutHandler.displayMessagePage(mParameters, oCurrentHash.componentsDisplayed);
			} else {
				var oTargets = oNavigationControllerProxy.oRouter.getTargets();
				oTargets.display("messagePage");
				for (var sRoute in oCurrentHash.componentsDisplayed){ // there should only be one match
					setVisibilityOfRoute(sRoute, 5); // mark the component as being replaced by an error page
				}
			}
			fnAfterActivationImpl(mParameters);
		}

		function fnShowStoredMessage(){
			if (!isEmptyObject(mMessagePageParams)){
				var mParameters = null;
				for (var i = 0; !mParameters; i++){
					mParameters = mMessagePageParams[i];
				}
				mMessagePageParams = {};
				fnTransferMessageParametersToGlobalModelAndDisplayMessage(mParameters);
			}
		}

		function fnNavigateToMessagePage(mParameters) {
			if (oNavigationControllerProxy.oTemplateContract.oFlexibleColumnLayoutHandler){
				mParameters.viewLevel = mParameters.viewLevel || 0;
				mMessagePageParams[mParameters.viewLevel] = mParameters;
				var oLoadedFinishedPromise = Promise.all([oActivationPromise, oNavigationControllerProxy.oTemplateContract.oPagesDataLoadedObserver.getProcessFinished(true)]);
				oLoadedFinishedPromise.then(fnShowStoredMessage);
				oLoadedFinishedPromise.then(oTemplateContract.oBusyHelper.setBusyReason.bind(null, "HashChange", false));
				return;
			}
			fnTransferMessageParametersToGlobalModelAndDisplayMessage(mParameters);
			oTemplateContract.oBusyHelper.setBusyReason("HashChange", false);
		}

		// End: Navigation methods

		function getActiveComponents(){
			var aRet = [];
			var mCompentsDisplayed = oCurrentIdentity.componentsDisplayed || oCurrentHash.componentsDisplayed;
			for (var sComponentId in oTemplateContract.componentRegistry){
				var oRegistryEntry = oTemplateContract.componentRegistry[sComponentId];
				if (mCompentsDisplayed[oRegistryEntry.route] === 1){ // component is currently active
					aRet.push(sComponentId);
				}
			}
			return aRet;
		}

		function getAllComponents() {
			var aRet = [];
			for (var sComponentId in oTemplateContract.componentRegistry){
				aRet.push(sComponentId);
			}
			return aRet;
		}

		function getCurrentKeys(iViewLevel){
			return oCurrentIdentity.keys.slice(0, iViewLevel + 1);
		}

		function getActivationInfo(){
			var sComponentId = oCurrentIdentity.treeNode.componentId;
			var oRegistryEntry = oTemplateContract.componentRegistry[sComponentId];
			var bIsNonDraftCreate = !!oRegistryEntry.nonDraftCreateContext;
			if (bIsNonDraftCreate) {
				var oNewCurrentHash = Object.assign({}, oCurrentHash);
				oNewCurrentHash.isNonDraftCreate = bIsNonDraftCreate;
				return oNewCurrentHash;
			}

			return oCurrentHash;
		}


		// get the ancestral node of the current node with the given level
		function getAncestralNode(iTargetLevel){
			var oRet = oCurrentIdentity.treeNode;
			for (; oRet.level > iTargetLevel;){
				oRet = oTemplateContract.mRoutingTree[oRet.parentRoute];
			}
			return oRet;
		}
		
		// returns a Promise that resolves to the data which have been stored with the given key if this data could be retrieved. Otherwise it is rejected to null.
		// The following edge cases are also rejected: sAppStateKey is faulty, or undefined has been stored with the key (note that CrossAppNav service also might provide undefined when it cannot retrieve the data).
		function getAppStateFromShell(sAppStateKey){
			return sAppStateKey ? new Promise(function(fnResolve, fnReject){
				var oShellPromise = oCrossAppNavigator.getAppState(oTemplateContract.oAppComponent, sAppStateKey);
				oShellPromise.done(function(oWrapper){
					var oRetrievedData = oWrapper.getData();
					(oRetrievedData === undefined ? fnReject : fnResolve)(oRetrievedData);
				});
				oShellPromise.fail(fnReject.bind(null, undefined));
			}) : Promise.reject();
		}

		// Start: Handling url-changes

		/*
		 * calls onActivate on the specified view, if it exists
		 * @param {Object} oView - the view
		 * @param {string} sPath - the path in the model
		 * @param {boolean} bDelayedActivate - optional boolean flag, true if activate is (re-)triggered delayed
		 */
		function fnActivateOneComponent(sPath, oActivationInfo, oComponent) {
			var sComponentId = oComponent.getId();
			var oRegistryEntry = oTemplateContract.componentRegistry[sComponentId];
			var aKeys = getCurrentKeys(oRegistryEntry.viewLevel);
			var sRoute = oRegistryEntry.route;
			var iCurrentActivity = oActivationInfo.componentsDisplayed[sRoute];
			var bIsComponentCurrentlyActive = iCurrentActivity === 1;
			var fnPerformActivation = function(sBindingPath){
				oRegistryEntry.sCurrentBindingPath = sBindingPath;
				var fnActivate = function() {
					// Bind the model for the page itself and all its ancestors (up to level 1)
					oRegistryEntry.utils.bindComponent(oRegistryEntry.sCurrentBindingPath, bIsComponentCurrentlyActive);
					if (sComponentId === oCurrentIdentity.treeNode.componentId){
						var mAncestors = Object.create(null); // Collect all ancestor routes
						mAncestors.root = true;
						for (var oTreeNode = oCurrentIdentity.treeNode; oTreeNode.level > 0; oTreeNode = oTemplateContract.mRoutingTree[oTreeNode.parentRoute]){
							mAncestors[oTreeNode.sRouteName] = true;
							oTreeNode.bindElement(oTemplateContract.oNavigationHost, null, true);
							// Temporary solution (AncestorFeature)
							if (oTreeNode.contextTargets){
								for (var i = 0; i < oTreeNode.contextTargets.length; i++){
									var oContextTarget = oTreeNode.contextTargets[i];
									oTreeNode.bindElement(oContextTarget, null, false);
								}
							}
						}
						// Now we have done the binding of the tree node specific model for all ancestors of the current page.
						// Unbind the tree node specific models for all other pages, as tthey might use outdated binding pathes.
						for (var sRouteName in oTemplateContract.mRoutingTree) {
							if (!mAncestors[sRouteName]) {
								var oTreeNode = oTemplateContract.mRoutingTree[sRouteName];
								oTemplateContract.oNavigationHost.unbindElement(oTreeNode.specificModelName);
								// Temporary solution (AncestorFeature)
								if (oTreeNode.contextTargets) {
									oTreeNode.contextTargets.forEach(function(oContextTarget) {
										oContextTarget.unbindElement();
									});
								}
							}
						}
					}
					oRegistryEntry.utils.refreshBinding();
					oRegistryEntry.oStatePreserverPromise.then(function(oStatePreserver){
						oStatePreserver.applyAppState(sBindingPath, bIsComponentCurrentlyActive);
					});
					return (oRegistryEntry.methods.onActivate || Function.prototype)(sBindingPath, bIsComponentCurrentlyActive);
				};
				// If view is not registered yet ( == oComponentRegistryEntry.fnViewRegisteredResolve still available) perform fnActivate asyncronously, otherwise synchronosly
				var oRet = oRegistryEntry.fnViewRegisteredResolve ? oRegistryEntry.viewRegistered.then(fnActivate) : (fnActivate() || Promise.resolve());				
				return Promise.all([oRet, oRegistryEntry.viewRegistered]).then(function(){
					oRegistryEntry.aKeys = aKeys;
				});
			};
			oCurrentHash.componentsDisplayed[sRoute] = 1;
			if (oActivationInfo.isNonDraftCreate && sPath === "-"){ // this component is doing the non-draft create
				var oTreeNode = oTemplateContract.mRoutingTree[sRoute];
				var oParentNode = oTemplateContract.mRoutingTree[oTreeNode.parentRoute];
				var sParentPath = oParentNode.getPath(2, aKeys);
				var oModel = oTemplateContract.oAppComponent.getModel();
				var oParentContextPromise = sParentPath ? new Promise(function(fnResolve){
					var oParameters = {
						canonicalRequest: !oTemplateContract.bCreateRequestsCanonical // either we or the framework must set the requests to be canonical
					};
					oModel.createBindingContext(sParentPath, null, oParameters, fnResolve);
				}) : Promise.resolve();
				return oParentContextPromise.then(function(oParentContext){
					var sBindingPath = oParentContext ? oTreeNode.navigationProperty : "/" + oComponent.getEntitySet();
					// reconstruct predefined values from corresponding appState information (if possible, otherwise create without predefined values)
					var sAppStateKey = oCurrentIdentity.appStates[sAppStateForCreate];
					var oPredefinedValuesPromise = getAppStateFromShell(sAppStateKey);
					var fnCreateNonDraft = function(oPredefinedValues){
						oRegistryEntry.nonDraftCreateContext = oPredefinedCreateContext ||
							oRegistryEntry.nonDraftCreateContext ||
							CRUDHelper.createNonDraft(oParentContext, sBindingPath, oModel, oPredefinedValues, oTemplateContract.oApplicationProxy.mustRequireRequestsCanonical());
						oPredefinedCreateContext = null;
						return fnPerformActivation(oRegistryEntry.nonDraftCreateContext.getPath());
					};
					return oPredefinedValuesPromise.then(fnCreateNonDraft, fnCreateNonDraft);
				});
			}
			delete oRegistryEntry.nonDraftCreateContext;
			return fnPerformActivation(sPath);
		}

		/*
		 * calls onActivate on the specified view, if it exists. Only used in the Non-FCL case
		 * @param {Object} oView - the view
		 * @param {string} sPath - the path in the model
		 * @param {boolean} bDelayedActivate - optional boolean flag, true if activate is (re-)triggered delayed
		 */
		function fnActivateComponent(sPath, oActivationInfo, oComponent) {
			return fnActivateOneComponent(sPath, oActivationInfo, oComponent).then(fnAfterActivation);
		}

		function fnAdaptPaginatorInfoAfterNavigation(oTreeNode, bIsProgrammatic, bIsBack){
			var oNewPaginatorInfo = {};
			if (bIsProgrammatic || bIsBack){
				var iViewLevel = oTreeNode.level;
				for (var iLevel = 0; iLevel < iViewLevel; iLevel++){
					oNewPaginatorInfo[iLevel] = oTemplateContract.oPaginatorInfo[iLevel];
				}
			}
			oTemplateContract.oPaginatorInfo = oNewPaginatorInfo;
		}

		function fnGetAlternativeContextPromise(sPath){
			return oTemplateContract.oApplicationProxy.getAlternativeContextPromise(sPath);
		}

		var mRoutesToHostViews = Object.create(null);
		function fnPrepareHostView(oTreeNode){
			if (mRoutesToHostViews[oTreeNode.sRouteName]){
				return;
			}
			var oViews = oNavigationControllerProxy.oRouter.getViews();
			var oHostView = oNavigationControllerProxy.createHostView();
			mRoutesToHostViews[oTreeNode.sRouteName] = oHostView;
			oViews.setView(oTreeNode.sRouteName, oHostView);
			var oComponentContainer = oHostView.byId("host");
			fnCreateTemplateComponent(oComponentContainer, oTreeNode.sRouteName);			
		}
		
		function fnHandleBeforeRouteMatched(oEvent){
			oNavigationQueue.stop();   // hold back any other navigation until this navigation is finished (redundant if navigation was triggered via fnNavigateToRoute)
			oRouterBusyObserver.startProcess();
			fnFillCurrentIdentity(oEvent);
			fnPrepareHostView(oCurrentIdentity.treeNode);
			if (oTemplateContract.oFlexibleColumnLayoutHandler){
				oBeforeRouteMatchedPromise = oTemplateContract.oFlexibleColumnLayoutHandler.handleBeforeRouteMatched(oCurrentIdentity);
			}
		}

		// This method is called in order to update oHistoryState.
		// More precisely an object is set for this state which has the following structure:
		// - isInitialNavigation: same as instance variable of this class
		// - historicalEntries: an array which is a condensed form of aPreviousHashes (in reverse order and starting with oCurrentHash). The entries are undefined (representing bypassed events) or object with the following structure:
		//   ~ sRoutename: logical route name
		//   ~ keys:       array of keys
		//   ~ appStates:  map of appStates
		// Moreover, it is checked whether the history key in the url is correct.
		// In case a) the history key has a wrong value or
		// b) there is no history key and we have a non-empty history a new navigation to the current identity is triggered. This will automatically update the url accordingly.
		// The method returns the information whether it has triggered a navigation, since in this case folow-up activities can be postponed to the next route matched event.
		function fnUpdateHistoryState(){
			var oHistoryObject = {
				isInitialNavigation: isInitialNavigation,
				historicalEntries: []
			};
			for (var oHistoricHash = oCurrentHash; oHistoricHash.iHashChangeCount > 0; oHistoricHash = aPreviousHashes[oHistoricHash.backTarget]){
				var oIdentity = (oHistoricHash === oCurrentHash) ? oCurrentIdentity : oHistoricHash.identity;
				var oReducedIdentity = oIdentity.treeNode && {
					sRouteName: oIdentity.treeNode.sRouteName,
					keys: oIdentity.keys,
					appStates: oIdentity.appStates
				};
				oHistoryObject.historicalEntries.push(oReducedIdentity);
			}
			oHistoryState.setData(oHistoryObject);
			oHistoryState.save();
			// Now check whether the url needs to be updated
			var sHistoryKeyInUrl = oCurrentIdentity.appStates[sAppStateForHistory];
			if (sHistoryKeyInUrl === sHistoryKey || !(sHistoryKeyInUrl || oCurrentHash.backTarget || isInitialNavigation)){
				return false; // history key in url is correct or we do not have a history key in the url and still do not need it
			}
			fnNavigateToRoute({
				identity: {
					treeNode: oCurrentIdentity.treeNode,
					keys: oCurrentIdentity.keys,
					appStates: extend(Object.create(null), oCurrentIdentity.appStates)
				},
				mode: 1
			});
			return true;
		}

		// This handler is registered at the route matched event of the router. It is thus called whenever the url changes within the App (if the new url is legal)
		function fnHandleRouteMatchedImpl() {
			oRouterBusyObserver.stopProcess();
			if (oRoutingOptions && oRoutingOptions.followUpNeeded && oRoutingOptions.identity && !isIdentityReached(oRoutingOptions.identity)){
				fnNavigateToRoute(); // execute the follow-up navigation
				return;
			}
			oTemplateContract.oBusyHelper.setBusyReason("HashChange", false);
			var iViewLevel = oCurrentIdentity.treeNode.level;
			var sHash = fnNormalizeHash(oNavigationControllerProxy.oHashChanger.getHash() || "");
			oLogger.info("Route matched with hash " + sHash);
			var oPreviousHash; // will be oCurrentHash soon
			if (oCurrentHash.backwardingInfo){   // then this is the back step of a 'complex back navigation'
				// Store oCurrentHash in aPreviousHashes and create a new instance of oCurrentHash for the newly started logical navigation step
				oPreviousHash = oCurrentHash;
				oPreviousHash.identity = oCurrentIdentity.previousIdentity;
				delete oCurrentIdentity.previousIdentity;
				aPreviousHashes.push(oPreviousHash);
				var iNewHashChangeCount = oPreviousHash.iHashChangeCount + 1;
				oCurrentHash = {
					iHashChangeCount: iNewHashChangeCount,
					forwardingInfo: {
						bIsProgrammatic: true,
						bIsBack: true,
						iHashChangeCount: iNewHashChangeCount,
						targetHash: oPreviousHash.backwardingInfo.targetHash,
						componentsDisplayed: oPreviousHash.componentsDisplayed
					},
					backTarget: aPreviousHashes[oPreviousHash.backwardingInfo.index].backTarget,
					componentsDisplayed: Object.create(null)
				};
			}
			if (oCurrentHash.forwardingInfo && oCurrentHash.forwardingInfo.targetHash && oCurrentHash.forwardingInfo.targetHash !== sHash){ // This can be either, because we are processing a follow-up of a complex back navigation or we are processing a follow-up navigation to an alternative context
				oCurrentHash.hash = sHash;
				var sTargetHash = oCurrentHash.forwardingInfo.targetHash;
				delete oCurrentHash.forwardingInfo.targetHash; // the targetHash will be reached with next physical navigation step -> remove the property
				fnNavigate(sTargetHash, true);
				return; // fnHandleRouteMatched will be called with the new url, so leave further processing to that call
			}
			// State changers may identify the hash change as something which can be handled by them internally. In this case we do not need to run the whole mechanism.
			// Since isStateChange is allowed to have side-effects we call all StateChangers.
			var bIsStateChange = false;
			for (var i = 0; i < oTemplateContract.aStateChangers.length; i++){
				var oStateChanger = oTemplateContract.aStateChangers[i];
				if (oStateChanger.isStateChange(oCurrentIdentity.appStates)){
					bIsStateChange = true;
				}
			}

			if (bIsStateChange){
				oRoutingOptions = null;
				oCurrentHash.hash = sHash;
				if (!fnUpdateHistoryState()){ // if update the history state does not trigger another navigation we open the navigation queue again
					oNavigationQueue.start();
				}
				return;
			}
			// When we come here, then we can be sure that:
			// - if oCurrentHash contains a forwardingInfo, we have reached the targetHash
			// - the url-change was not triggered by a state changer.
			// At this point in time oCurrentHash may still represent the previous logical navigation step or already represent the current logical navigation step.
			// These two scenarios can be distinguished via property forwardingInfo of oCurrentHash. If this property is faulty the first option applies.
			oTemplateContract.oTemplatePrivateGlobalModel.setProperty("/generic/routeLevel", iViewLevel);
			// oActivationInfo is an object that will be passed to helper functions that deal with follow-up activities.
			// It contains the following properties:
			// - iHashChangeCount the current hashChangeCount
			// - bIsProgrammatic  information whether the logical navigation was triggered programmatically
			// - bIsBack          information whether the logical navigation step was reached by backward navigation
			// - componentsDisplayed: Map that contains information about the components currently displayed (see oCurrentHash)
			var oActivationInfo = oCurrentHash.forwardingInfo; // If there is a forwardingInfo it already provides the required properties
			delete oCurrentHash.forwardingInfo;
			if (!oActivationInfo){ // then we have to create oActivationInfo AND a new instance for oCurrentHash
				oActivationInfo = {
					componentsDisplayed: oCurrentHash.componentsDisplayed,
					isNonDraftCreate: !oCurrentIdentity.treeNode.isDraft && oCurrentIdentity.keys[oCurrentIdentity.treeNode.level] === "-"
				};
				var iPreviousHashChangeCount = oCurrentHash.iHashChangeCount;
				oActivationInfo.iHashChangeCount = iPreviousHashChangeCount + 1;
				var sDirection = oHistory.getDirection();
				if (oRoutingOptions){
					oActivationInfo.bIsProgrammatic = !!oRoutingOptions.identity;
					oActivationInfo.bIsBack = oRoutingOptions.mode < 0;
					if (oActivationInfo.bIsBack){
						oCurrentHash.backSteps = 0 - oRoutingOptions.mode;
					}
					oActivationInfo.bIsForward = !oActivationInfo.bIsBack && (sDirection === HistoryDirection.Forwards);
					oCurrentHash.LeaveByReplace = oRoutingOptions.mode === 1;
				} else {
					oActivationInfo.bIsProgrammatic = (sHash === oCurrentHash.targetHash);
					oActivationInfo.bIsBack = !!(oCurrentHash.LeaveByBack || (!oActivationInfo.bIsProgrammatic && (sDirection === HistoryDirection.Backwards)));
					oActivationInfo.bIsForward = !oActivationInfo.bIsBack && (sDirection === HistoryDirection.Forwards);
					oCurrentHash.LeaveByReplace = oActivationInfo.bIsProgrammatic && oCurrentHash.LeaveByReplace;
					if (!oActivationInfo.bIsProgrammatic && oCurrentIdentity.previousIdentity && oCurrentIdentity.previousIdentity.treeNode.level > 0 && !oCurrentIdentity.previousIdentity.treeNode.isDraft){ // a non-draft app might have left some unsaved changes which should be reset now
						var bDifferenceFound = oActivationInfo.isNonDraftCreate || oCurrentIdentity.treeNode !== oCurrentIdentity.previousIdentity.treeNode;
						for (var j = 1; !bDifferenceFound && j < oCurrentIdentity.keys.length; j++){
							bDifferenceFound = oCurrentIdentity.keys[j] !== oCurrentIdentity.previousIdentity.keys[j];
						}
						if (bDifferenceFound){ // we have navigated away from the previous (non-draft) page
							var oPreviousRegistryEntry = oTemplateContract.componentRegistry[oCurrentIdentity.previousIdentity.treeNode.componentId];
							var oUiModel = oPreviousRegistryEntry.oComponent.getModel("ui");
							if (oUiModel.getProperty("/editable")){ // and this page was in edit mode
								oPreviousRegistryEntry.utils.cancelEdit();
							}
						}
					}
				}
				oCurrentHash.LeaveByBack = oActivationInfo.bIsBack;
				oPreviousHash = oCurrentHash;
				oPreviousHash.identity = oCurrentIdentity.previousIdentity;
				delete oCurrentIdentity.previousIdentity;
				aPreviousHashes.push(oPreviousHash);
				oCurrentHash = {
					iHashChangeCount: oActivationInfo.iHashChangeCount,
					componentsDisplayed: Object.create(null)
				};
				// identify the back target
				if (oPreviousHash.LeaveByReplace){
					oCurrentHash.backTarget = oPreviousHash.backTarget; // url is replaced  -> back target remains unchanged
				} else if (oActivationInfo.bIsBack){
					var iBackTarget = oPreviousHash.backTarget;
					for (var iSteps = oPreviousHash.backSteps || 1; iSteps > 0; iSteps--){
						iBackTarget = aPreviousHashes[iBackTarget].backTarget;
					}
					oCurrentHash.backTarget = iBackTarget;
				} else {
					oCurrentHash.backTarget = iPreviousHashChangeCount;	// last url is back target
				}
			}
			oRoutingOptions = null;
			oCurrentHash.hash = sHash;

			// During back navigation the link we are navigating to might have been made obsolete during the runtime of the App. This would happen in the following cases:
			// - Link points to a draft, but the draft has been activated or cancelled meanwhile.
			// - Link points to an active entity. Meanwhile, a own draft for this active entity exists, and needs to be redirected to draft.
			// - Link points to an object which has been deleted meanwhile.
			// Whereas we cannot do anything in the third case (thus, a message page will be displayed then), in the first two cases we want to
			// automatically forward the user to the correct instance.
			// In order to achieve this, we use method fnGetAlternativeContextPromise which may provide an alternative context to navigate to.
			// However, there are two limitations for that:
			// - In general the functionality only covers activation/cancellation/draft-creation actions which have been performed within this session.
			//   These actions have been registered within class ContextBookkeeping.
			// - For hashes pointing to item level (viewLevel > 1) it is currently not possible to determine the alternative path. Therefore, the determination
			//   whether an alternative context is required is done on root object level. Thus, the root object is navigated to, if one of the cases above is
			//   discovered.
			// fnAfterAlternateContextIsFound is executed after the alternate context is found.

			var fnAfterAlternateContextIsFound = function(oAlternativeContextInfo){
				if (oAlternativeContextInfo){ // then one of the cases described above occurs
					fnNavigateToSubContext(oAlternativeContextInfo.context, true, oAlternativeContextInfo.iDisplayMode);
					return; // note that fnHandleRouteMatched will be called again
				}
				if (fnUpdateHistoryState()){ // update the history state. If this is triggering another navigation then:
					return; // note that fnHandleRouteMatched will be called again
				}
				// When we reach this point, the logical navigation step has reached its final url.
				// Now we have to adapt the state of the application
				fnAdaptPaginatorInfoAfterNavigation(oCurrentIdentity.treeNode, oActivationInfo.bIsProgrammatic, oActivationInfo.bIsBack);

				if (oTemplateContract.oFlexibleColumnLayoutHandler){
					oActivationPromise = oTemplateContract.oFlexibleColumnLayoutHandler.handleRouteMatched(oActivationInfo);
				} else {
					oActivationPromise = oCurrentIdentity.treeNode.componentCreated.then(function(oComponent){
						return fnActivateComponent(oActivationInfo.isNonDraftCreate ? "-" : oCurrentIdentity.treeNode.getPath(2, oCurrentIdentity.keys), oActivationInfo, oComponent);
					});
				}
				oTemplateContract.oBusyHelper.setBusy(oActivationPromise);
				oActivationPromise.then(oNavigationQueue.start); // when everything is processed, again start the queue for further navigation execution
			};

			if (oActivationInfo.bIsBack) {
				// sTestPath is the path for which we check, whether one of the cases described above, occurs. As discussed above we
				//  must use the path pointing to the root object.
				var oAncestralNode = getAncestralNode(1);
				var sTestPath = oAncestralNode && oAncestralNode.getPath(2, oCurrentIdentity.keys);
				oTemplateContract.oBusyHelper.setBusy(fnGetAlternativeContextPromise(sTestPath).then(fnAfterAlternateContextIsFound));
			} else {
				fnAfterAlternateContextIsFound();
			}
		}

		// This method is called from the route matched event as soon as it is ensured that the internal history is correct
		function fnRouteMatchedWithHistory(){
			// ensure that fnHandleRouteMatchedImpl is only executed when all prerequisites are fulfilled. In particular beforeRouteMatched must have been executed successfully.
			var oPrerequisitesPromise = Promise.all([oBeforeRouteMatchedPromise, oTemplateComponentsAvailablePromise.then(function(){
				return oTemplateContract.oStatePreserversAvailablePromise;
			})]);
			var oImplPromise = oPrerequisitesPromise.then(fnHandleRouteMatchedImpl, oTemplateContract.oBusyHelper.setBusyReason.bind(null, "HashChange", false));
			oTemplateContract.oBusyHelper.setBusy(oImplPromise);
			fnUpdateParentModelsWithContext();
		}

		// This method is called, when the app has been started via back navigation and restoring the history from the url has been finished.
		// Note that oHistoryObject might be faulty, which would mean that restoring the history from the url has failed.
		// In this case a 'dummy' history is created.
		function fnHistoryRestored(oHistoryObject){
			aPreviousHashes.push(oCurrentHash); // This represents the time before the app was started the first time
			var oHistoricHash; // the last hash of the previous history
			if (oHistoryObject){ // history could be recreated
				isInitialNavigation = oHistoryObject.isInitialNavigation;
				// Recreate aPreviousHashes from the old history object. Note that the order is reverse.
				for (var i = oHistoryObject.historicalEntries.length; i > 0; i--){
					var oHistoricalEntry = oHistoryObject.historicalEntries[i - 1];
					oHistoricHash = {
						iHashChangeCount: aPreviousHashes.length,
						backTarget: aPreviousHashes.length - 1
					};
					if (oHistoricalEntry){
						oHistoricHash.identity = {
							treeNode: oTemplateContract.mRoutingTree[oHistoricalEntry.sRouteName],
							keys: oHistoricalEntry.keys,
							appStates: oHistoricalEntry.appStates
						};
					}
					aPreviousHashes.push(oHistoricHash);
				}
			} else { // if history could not be reconstructed add at least one entry for the state where we have come back to
				oHistoricHash = {
					iHashChangeCount: 1,
					backTarget: 0,
					identity: oCurrentIdentity
				};
				aPreviousHashes.push(oHistoricHash);
			}
			fnComeBack(oHistoricHash); // add an entry for the external app we have come back from
			fnRouteMatchedWithHistory(); // proceed with handling the route matched event
		}

		// This handler is registered at the route matched event of the router. It is thus called whenever the url changes within the App (if the new url is legal)
		function fnHandleRouteMatched(oEvent) {
			if (bIsRestoring && !aPreviousHashes.length){ // restarted this app via back navigation without direct access to the history we have returned to
				var sPreviousHistoryKey = oCurrentIdentity.appStates[sAppStateForHistory]; // try to recreate history from url information
				var oHistoryStatePromise = getAppStateFromShell(sPreviousHistoryKey);
				oHistoryStatePromise.then(fnHistoryRestored, fnHistoryRestored);
				return; // follow up in fnHistoryRestored
			}
			fnRouteMatchedWithHistory();
		}

		// Event handler fired by router when no matching route is found
		function fnHandleBypassed() {
			oCurrentIdentity = {
				appStates: Object.create(null),
				keys: []
			};
			fnNavigateToMessagePage({
				title: oTemplateContract.getText("ST_ERROR"),
				text:  oTemplateContract.getText("ST_GENERIC_UNKNOWN_NAVIGATION_TARGET"),
				description: ""
			});
			oTemplateContract.oBusyHelper.setBusyReason("HashChange", false);
		}

		function fnUpdateParentModelsWithContext() {
			var oParentNode;
			for (var oWorkingNode = oCurrentIdentity.treeNode; oWorkingNode; oWorkingNode = oParentNode){
				var oRegistryEntry = oWorkingNode.componentId && oTemplateContract.componentRegistry[oWorkingNode.componentId];
				if (oRegistryEntry){
					var oTemplatePrivateModel = oRegistryEntry.utils.getTemplatePrivateModel();
					oTemplatePrivateModel.setProperty("/generic/currentActiveChildContext", oWorkingNode.selectedPath);
				}
				oParentNode = oTemplateContract.mRoutingTree[oWorkingNode.parentRoute];
				if (oParentNode){
					oParentNode.selectedPath = oWorkingNode.getPath(3, oCurrentIdentity.keys);
				}
			}
		}

		oNavigationControllerProxy.oRouter.attachBeforeRouteMatched(fnHandleBeforeRouteMatched);

		oNavigationControllerProxy.oRouter.attachRouteMatched(fnHandleRouteMatched);

		oNavigationControllerProxy.oRouter.attachBypassed(fnHandleBypassed);

		// End: Handling url-changes

		var aNavigationFunctions = [];
		function fnMakeNavigationFunction(sName, fnNavigationFunction){ // adds a navigation function to the NavigationControllerProxy
			oNavigationControllerProxy[sName] = fnNavigationFunction;
			aNavigationFunctions.push(sName);
		}

		function fnRouterInitialized(){ // after startup all navigation functions should run within the navigation queue
			aNavigationFunctions.forEach(function(sName){
				oNavigationControllerProxy[sName] = oNavigationQueue.makeQueuable(oNavigationControllerProxy[sName]);
			});
			oNavigationControllerProxy.routerInitialized = Function.prototype;
		}
		
		function fnTreeNodeFirstDisplay(oTreeNode){
			oTemplateComponentsAvailablePromise = Promise.all([oTemplateComponentsAvailablePromise, oTreeNode.componentCreated]);
		}
		
		function fnCreateTemplateComponent(oComponentContainer, sRoute){
			var oTreeNode = oTemplateContract.mRoutingTree[sRoute];
			var sTemplate = oTreeNode.page.component.name;
			var sEntitySet = oTreeNode.entitySet;
			var iObserverIndex = oTreeNode.fCLLevel - (oTreeNode.fCLLevel === 3 || !oTemplateContract.oFlexibleColumnLayoutHandler);
			var oNavigationObserver = iObserverIndex < 0 ? oTemplateContract.oNavigationObserver : oTemplateContract.aNavigationObservers[iObserverIndex];
			var oHeaderLoadingObserver = new ProcessObserver();
			var oLoadingObserverParent = iObserverIndex < 0 ? oTemplateContract.oHeaderLoadingObserver : oTemplateContract.aHeaderLoadingObservers[iObserverIndex];
			oLoadingObserverParent.addObserver(oHeaderLoadingObserver);
			var oPreprocessorsData = {};
			var oSettings = {
				appComponent: oTemplateContract.oAppComponent,
				isLeaf: !oTreeNode.page.pages || !oTreeNode.page.pages.length,
				entitySet: sEntitySet,
				navigationProperty: oTreeNode.navigationProperty,
				componentData: {
					registryEntry: {
						oAppComponent: oTemplateContract.oAppComponent,
						route: sRoute,
						routeConfig: oTreeNode.page,
						viewLevel: oTreeNode.level,
						routingSpec: oTreeNode.page.routingSpec,
						oNavigationObserver: oNavigationObserver,
						oHeaderLoadingObserver: oHeaderLoadingObserver,
						preprocessorsData: oPreprocessorsData
					}
				}
			};

			if (oTreeNode.page.component.settings) {
				// consider component specific settings from app descriptor
				extend(oSettings, oTreeNode.page.component.settings);
			}

			oTemplateContract.oAppComponent.runAsOwner(function(){
				var oComponentPromise = sap.ui.core.Component.create({
					name: sTemplate,
					settings: oSettings,
					handleValidation: true,
					manifest: true
				});

				oComponentPromise.then(function(oComponent) {
					oComponentContainer.setComponent(oComponent);
				});
			});
		}

		// Expose methods via NavigationController proxy
		oNavigationControllerProxy.routerInitialized = fnRouterInitialized;
		oNavigationControllerProxy.treeNodeFirstDisplay = fnTreeNodeFirstDisplay;
		oNavigationControllerProxy.navigate = fnNavigate;
		fnMakeNavigationFunction("navigateBack", fnNavigateToRoute.bind(null, {
			mode: -1
		}));
		oNavigationControllerProxy.activateOneComponent = fnActivateOneComponent;
		oNavigationControllerProxy.afterActivation = fnAfterActivation;
		oNavigationControllerProxy.addUrlParameterInfoForRoute = fnAddUrlParameterInfoForRoute;
		oNavigationControllerProxy.getApplicableStateForIdentityAddedPromise = getApplicableStateForIdentityAddedPromise;
		oNavigationControllerProxy.setVisibilityOfRoute = setVisibilityOfRoute;
		oNavigationControllerProxy.getActiveComponents = getActiveComponents;
		oNavigationControllerProxy.getAllComponents = getAllComponents;
		oNavigationControllerProxy.getRootComponentPromise = getRootComponentPromise;
		oNavigationControllerProxy.getActivationInfo = getActivationInfo;
		oNavigationControllerProxy.getCurrentKeys = getCurrentKeys;
		oNavigationControllerProxy.getAppTitle = getAppTitle;
		oNavigationControllerProxy.getParsedShellHashFromFLP = getParsedShellHashFromFLP;
		fnMakeNavigationFunction("navigateByExchangingQueryParam", fnNavigateByExchangingQueryParam);
		fnMakeNavigationFunction("navigateToSubContext", fnNavigateToSubContext);
		oNavigationControllerProxy.getSwitchToSiblingPromise = getSwitchToSiblingPromise;
		oNavigationControllerProxy.getSpecialDraftCancelPromise = getSpecialDraftCancelPromise;
		oNavigationControllerProxy.getCurrentIdentity = getCurrentIdentity;
		fnMakeNavigationFunction("navigateToIdentity", fnNavigateToIdentity);
		fnMakeNavigationFunction("navigateAfterActivation", fnNavigateAfterActivation);
		fnMakeNavigationFunction("navigateUpAfterDeletion", fnNavigateUpAfterDeletion);
		fnMakeNavigationFunction("navigateForNonDraftCreate", fnNavigateForNonDraftCreate);
		fnMakeNavigationFunction("adaptUrlAfterNonDraftCreateSaved", fnAdaptUrlAfterNonDraftCreateSaved);
		fnMakeNavigationFunction("navigateToChild", fnNavigateToChild);
		fnMakeNavigationFunction("navigateFromNodeAccordingToContext", fnNavigateFromNodeAccordingToContext);
		oNavigationControllerProxy.isNavigating = isNavigating;
		oNavigationControllerProxy.getLinksToUpperLayers = getLinksToUpperLayers;
		oNavigationControllerProxy.setTextForTreeNode = setTextForTreeNode;
		fnMakeNavigationFunction("navigationContextNotFound", fnNavigationContextNotFound);

		oNavigationControllerProxy.suspend = fnSuspend;
		oNavigationControllerProxy.restore = fnInitSession;
		oNavigationControllerProxy.prepareHostView = fnPrepareHostView;
		oNavigationControllerProxy.navigateToMessagePage = fnNavigateToMessagePage;
		oNavigationControllerProxy.getAppStateFromShell = getAppStateFromShell;
		
		// Note: Function createHostView will be added by routingHelper.
		// Allow to mock this by unit tests
		testableHelper.testable(function(fnCreateHostView){
			oNavigationControllerProxy.createHostView = fnCreateHostView;
		}, "setCreateHostView");

		// Make private function accessible to unit tests
		/* eslint-disable */
		var fnCreateTemplateComponent = testableHelper.testable(fnCreateTemplateComponent, "createTemplateComponent");
		/* eslint-enable */

		return {
			/**
			* Navigates to the root view.
			*
			* @public
			* @param {boolean} bReplace If this is true the navigation/hash will be replaced
			*/
			navigateToRoot: oNavigationQueue.makeQueuable(fnNavigateToRoot),

			/**
			 * Navigates to the specified context.
			 *
			 * @public
			 * @param {Object} oTargetContext - The context to navigate to (or null - e.g. when the navigationProperty should be appended to the current path)
			 * @param {string} sNavigationProperty - The navigation property
			 * @param {boolean} bReplace If this is true the navigation/hash will be replaced
			 */
			navigateToContext: oNavigationQueue.makeQueuable(fnNavigateToContext),
			/**
			 * Navigates to the message page and shows the specified content.
			 *
			 * @public
			 * @param {Object} mParameters - The parameters for message page
			 */
			navigateToMessagePage: fnNavigateToMessagePage,

			/**
			 * Navigate back
			 *
			 * @public
			 */
			navigateBack: function(){
				oNavigationControllerProxy.navigateBack();
			}
		};
	}

	function constructor(oNavigationController, oTemplateContract){
		var oRouter = oTemplateContract.oAppComponent.getRouter();
		var oNavigationControllerProxy = {
			oAppComponent: oTemplateContract.oAppComponent,
			oRouter: oRouter,
			oHashChanger: oRouter.getHashChanger(),
			oTemplateContract: oTemplateContract
		};

		oTemplateContract.oNavigationControllerProxy = oNavigationControllerProxy;
		var oFinishedPromise = new Promise(function(fnResolve){
			// remark: In case of inbound navigation with edit-mode and an existing draft, this promise will be resolved
			// before the initialization is actually finished.
			// This is necessary to be able to show the unsavedChanges-Dialog
			oNavigationControllerProxy.initialize = function(){
				oRouter.initialize();
				fnResolve();
				oNavigationControllerProxy.routerInitialized();
			};
			oNavigationControllerProxy.fnInitializationResolve = fnResolve; // only to make unbusy in case of errors
		});
		oTemplateContract.oBusyHelper.setBusy(oFinishedPromise);
		extend(oNavigationController, getMethods(oTemplateContract, oNavigationControllerProxy));
		routingHelper.startupRouter(oNavigationControllerProxy);
	}

	/*
	 * Handles all navigation and routing-related tasks for the application.
	 *
	 * @class The NavigationController class creates and initializes a new navigation controller with the given
	 *        {@link sap.suite.ui.generic.template.lib.AppComponent AppComponent}.
	 * @param {sap.suite.ui.generic.template.lib.AppComponent} oAppComponent The AppComponent instance
	 * @public
	 * @extends sap.ui.base.Object
	 * @version 1.84.44
	 * @since 1.30.0
	 * @alias sap.suite.ui.generic.template.lib.NavigationController
	 */
	var NavigationController = BaseObject.extend("sap.suite.ui.generic.template.lib.navigation.NavigationController", {
		metadata: {
			library: "sap.suite.ui.generic.template"
		},
		constructor: function(oTemplateContract) {
			// inherit from base object.
			BaseObject.apply(this, arguments);
			testableHelper.testableStatic(constructor, "NavigationController")(this, oTemplateContract);
		}
	});

	NavigationController._sChanges = "Changes";
	return NavigationController;
});
