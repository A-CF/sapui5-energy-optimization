sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/core/mvc/ControllerExtension",
	"sap/ui/generic/app/navigation/service/NavError",
	"sap/ui/generic/app/navigation/service/SelectionVariant",
	"sap/ui/comp/state/UIState",
	"sap/suite/ui/generic/template/lib/FeLogger",
	"sap/base/util/deepEqual",
	"sap/base/util/extend",
	"sap/suite/ui/generic/template/lib/FeError"
], function(BaseObject, ControllerExtension, NavError, SelectionVariant, UIState, FeLogger, deepEqual, extend, FeError) {
	"use strict";

	var	sClassName = "ListReport.controller.IappStateHandler";
	var oFeLogger = new FeLogger(sClassName);
	var oLogger = oFeLogger.getLogger();
	var oLevel = oFeLogger.Level;
	// Constants which are used as property names for storing custom filter data and generic filter data
	var dataPropertyNameCustom = "sap.suite.ui.generic.template.customData",
		dataPropertyNameExtension = "sap.suite.ui.generic.template.extensionData",
		dataPropertyNameGeneric = "sap.suite.ui.generic.template.genericData";

	// variant contexts which should not lead to change the iappstate
	var aIrrelevantVariantLoadContext = ["INIT", "DATA_SUITE", "CANCEL", "RESET", "SET_VM_ID"];

	function fnNullify(oObject) {
		if (oObject) {
			for (var sProp in oObject) {
				oObject[sProp] = null;
			}
		}
	}

	function fnNotEqual(oObject1, oObject2){
		var aKeys1 = Object.keys(oObject1);
		if (aKeys1.length !== Object.keys(oObject2).length){
			return true;
		}
		for (var i = 0; i < aKeys1.length; i++){
			var sKey = aKeys1[i];
			var aPar1 = oObject1[sKey];
			var aPar2 = oObject2[sKey];
			if (aPar1.length !== aPar2.length){
				return true;
			}
			for (var j = 0; j < aPar1.length; j++){
				if (aPar1[j] !== aPar2[j]){
					return true;
				}
			}
		}
		return false;
	}

	function fnLogInfo(sMessage, vDetails){
		if (sap.ui.support) { //only if support assistant is loaded
			var iLevel = oLogger.getLevel();
			if (iLevel < oLevel.INFO) {
				oLogger.setLevel(oLevel.INFO);
			}
		}
		var sDetails;
		if (typeof vDetails === "string"){
			sDetails = vDetails;
		} else {
			sDetails = "";
			var sDelim = "";
			for (var sKey in vDetails){
				sDetails = sDetails + sDelim + sKey + ": " + vDetails[sKey];
				sDelim = "; ";
			}
		}
		oLogger.info(sMessage, sDetails, "sap.suite.ui.generic.template.ListReport.controller.IappStateHandler");
	}

	function getMethods(oState, oController, oTemplateUtils) {

		var oNavigationHandler = oTemplateUtils.oServices.oApplication.getNavigationHandler();
		var bSmartVariantManagement = oController.getOwnerComponent().getSmartVariantManagement();
		var oRealizedAppState = { // this object contains information which can be derived from url
			urlParams: {},
			selectionVariant: "",
			tableVariantId: ""
		};

		var bIgnoreFilterChange = false; // In some cases we trigger the filter change event ourselves but do not want to update the appState. Then this flag is temporarily set.
		var bDataAreShownInTable = false;
		var bIsAutoBinding;
		var autoBindingFromView;
		var oSettings = oTemplateUtils.oComponentUtils.getSettings();
		
		// Promise and its resolve function to control whether the adapt filter dialog is open 
		var fnResolveAdaptFiltersDialog;
		var oAdaptFiltersDialogOpenPromise = Promise.resolve(); // initially, the dialog is not open
		// Flag to remember whether variant was dirty when opening the dialog
		// only meaningful, when the adapt filters dialog is open
		var bDialogOpenedWithDirtyVariant = false;

		oState.oSmartFilterbar.setSuppressSelection(true);

		var getByDefaultNonVisibleCustomFilterNames = (function(){
			var aNonVisibleCustomFilterNames;
			return function(){
				aNonVisibleCustomFilterNames = aNonVisibleCustomFilterNames || oState.oSmartFilterbar.getNonVisibleCustomFilterNames();
				return aNonVisibleCustomFilterNames;
			};
		})();

		function areDataShownInTable(){
			return bDataAreShownInTable;
		}

		function getPageState() {
			var oCustomAndGenericData = {}; // object to be returned by this function

			// first determine the generic information
			// Determine information about visible custom filters
			var aVisibleCustomFieldNames = [];
			var aByDefaultNonVisibleCustomFilterNames = getByDefaultNonVisibleCustomFilterNames();
			for (var i = 0; i < aByDefaultNonVisibleCustomFilterNames.length; i++){ // loop over all custom fields which are not visible in filterbar by default
				var sName = aByDefaultNonVisibleCustomFilterNames[i];
				if (oState.oSmartFilterbar.isVisibleInFilterBarByName(sName)){ // custom field is visible in filterbar now
					aVisibleCustomFieldNames.push(sName);
				}
			}
			var oGenericData = {
				suppressDataSelection: !bDataAreShownInTable,
				visibleCustomFields: aVisibleCustomFieldNames
			};
			oCustomAndGenericData[dataPropertyNameGeneric] = oGenericData;
			if (oTemplateUtils.oComponentUtils.isDraftEnabled()) {
				var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
				oGenericData.editStateFilter = oTemplatePrivateModel.getProperty("/listReport/vDraftState");
				var bActiveStateFilter = oTemplatePrivateModel.getProperty("/listReport/activeObjectEnabled");
				oGenericData.activeStateFilter = bActiveStateFilter;
			}
			var sSelectedKeyPropertyName = oState.oMultipleViewsHandler.getSelectedKeyPropertyName();
			if (sSelectedKeyPropertyName) {
				var oTableViewData = oState.oMultipleViewsHandler.getContentForIappState();
				if (oTableViewData){
					oGenericData[sSelectedKeyPropertyName] = oTableViewData.state;
				}
			}

			// search related data is saved in both iappstate and variant, adding it to custom data here to save state of worklist
			if (oState.oWorklistData.bWorkListEnabled) {
				var sSearchString = oState.oWorklistData.oSearchField ? oState.oWorklistData.oSearchField.getValue() : "";
				var oWorklistState = {
					"searchString": sSearchString
				};
				oGenericData.Worklist = oWorklistState;
			}

			// second allow classical break-outs to add their custom state
			var oCustomData = {};
			oCustomAndGenericData[dataPropertyNameCustom] = oCustomData;
			oController.getCustomAppStateDataExtension(oCustomData);

			// thirdallow all extensions to add their custom state
			var oExtensionData; // collects all extension state information (as map extension-namespace -> state). Initialized on demand
			var bIsAllowed = true; // check for synchronous calls
			// the following function will be passed to all extensions. It gives them the possibility to provide their state as oAppState
			// Therefore, they must identify themselves via their instance of ControllerExtension.
			var fnSetAppStateData = function(oControllerExtension, oAppState){
				if (!(oControllerExtension instanceof ControllerExtension)){
					throw new FeError(sClassName, "State must always be set with respect to a ControllerExtension");
				}
				if (!bIsAllowed){
					throw new FeError(sClassName, "State must always be provided synchronously");
				}
				if (oAppState){ // faulty app-state information will not be stored
					oExtensionData = oExtensionData || Object.create(null);
					var sExtensionId = oControllerExtension.getMetadata().getNamespace(); // extension is identified by its namespace
					oExtensionData[sExtensionId] = oAppState;
				}
			};
			oController.templateBaseExtension.provideExtensionAppStateData(fnSetAppStateData);
			bIsAllowed = false;
			if (oExtensionData){
				oCustomAndGenericData[dataPropertyNameExtension] = oExtensionData;
			}

			return oCustomAndGenericData;
		}

		function getCurrentAppState() {
			/*
			 * Special handling for selection fields, for which defaults are defined: If a field is visible in the
			 * SmartFilterBar and the user has cleared the input value, the field is not included in the selection
			 * variant, which is returned by getDataSuiteFormat() of the SmartFilterBar. But since it was cleared by
			 * purpose, we have to store the selection with the value "", in order to set it again to an empty value,
			 * when restoring the selection after a back navigation. Otherwise, the default value would be set.
			 */
			var oSFBUiState = oState.oSmartFilterbar.getUiState();
			var sCurrentSelectionVariant = JSON.stringify(oSFBUiState.getSelectionVariant());
			//var sCurrentSelectionVariant = oState.oSmartFilterbar.getDataSuiteFormat();
			var oSelectionVariant = new SelectionVariant(sCurrentSelectionVariant);
			var aVisibleFields = oController.getVisibleSelectionsWithDefaults();
			for (var i = 0; i < aVisibleFields.length; i++) {
				if (!oSelectionVariant.getValue(aVisibleFields[i])) {
					oSelectionVariant.addSelectOption(aVisibleFields[i], "I", "EQ", "");
				}
			}

			//If variant is dirty and if the selection variant has id, making the same empty for the filters to be applied correctly.
			if (oController.byId('template::PageVariant') && oController.byId('template::PageVariant').currentVariantGetModified() && oSelectionVariant.getID()){
				oSelectionVariant.setID("");
			}

			/*State saving for worklist application*/
			if (oState.oWorklistData.bWorkListEnabled) {
				var oSearchField = oState.oWorklistData.oSearchField ? oState.oWorklistData.oSearchField.getValue() : "";
				oSelectionVariant.addSelectOption("Worklist.SearchField","I","EQ",oSearchField);
			}

			return {
				selectionVariant: oSelectionVariant.toJSONString(),
				tableVariantId: (!bSmartVariantManagement && oState.oSmartTable.getCurrentVariantId()) || "",
				customData: getPageState(),
				semanticDates: oSFBUiState.getSemanticDates()
			};
		}

		function fnRestoreGenericFilterState(oGenericData, bApplySearchIfConfigured) {
			var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
			if (oGenericData && oTemplateUtils.oComponentUtils.isDraftEnabled()){
				oTemplatePrivateModel.setProperty("/listReport/vDraftState", oGenericData.editStateFilter || "0");
				oTemplatePrivateModel.setProperty("/listReport/activeObjectEnabled", !!oGenericData.activeStateFilter);
				oState.oMultipleViewsHandler.restoreActiveButtonState(oGenericData);
			}
			// Restore information about visible custom filters
			var aVisibleCustomFields = oGenericData && oGenericData.visibleCustomFields;
			if (aVisibleCustomFields && aVisibleCustomFields.length > 0){
				var aItems = oState.oSmartFilterbar.getAllFilterItems();
				for (var i = 0; i < aItems.length; i++){
					var oItem = aItems[i];
					var sName = oItem.getName();
					if (aVisibleCustomFields.indexOf(sName) !== -1){
						oItem.setVisibleInFilterBar(true);
					}
				}
			}
			bDataAreShownInTable = bApplySearchIfConfigured && !(oGenericData && oGenericData.suppressDataSelection);
			// In worklist, search is called at a different place
			if (bDataAreShownInTable && !oState.oWorklistData.bWorkListEnabled){
				oState.oSmartFilterbar.search();
				//collapse header in case of bookmark or if iappstate is preserved on load of LR
				collapseLRHeaderonLoad(bDataAreShownInTable);
			}
			var sSelectedKeyPropertyName = oState.oMultipleViewsHandler.getSelectedKeyPropertyName();
			if (sSelectedKeyPropertyName && oGenericData[sSelectedKeyPropertyName]) {
				oState.oMultipleViewsHandler.restoreFromIappState(oGenericData[sSelectedKeyPropertyName]);
			}

		}

		function handleVariantIdPassedViaURLParams(oNewUrlParameters,bSmartVariantManagement) {
			if (bSmartVariantManagement) {
				var sPageVariantId = oNewUrlParameters['sap-ui-fe-variant-id'];
				if (sPageVariantId && sPageVariantId[0]) {
					oState.oSmartFilterbar.getSmartVariant().setCurrentVariantId(sPageVariantId[0]);
				}
			} else {
				var aPageVariantId = oNewUrlParameters['sap-ui-fe-variant-id'],
					aFilterBarVariantId = oNewUrlParameters['sap-ui-fe-filterbar-variant-id'],
					aChartVariantId = oNewUrlParameters['sap-ui-fe-chart-variant-id'],
					aTableVariantId = oNewUrlParameters['sap-ui-fe-table-variant-id'];

				applyControlVariantId(aFilterBarVariantId && aFilterBarVariantId[0], aChartVariantId && aChartVariantId[0], aTableVariantId && aTableVariantId[0], aPageVariantId && aPageVariantId[0]);
			}
		}
		function applyControlVariantId(sFilterBarVariantId, sChartVariantId, sTableVariantId, sPageVariantId) {
			if (sFilterBarVariantId || sPageVariantId) {
				oState.oSmartFilterbar.getSmartVariant().setCurrentVariantId(sFilterBarVariantId || sPageVariantId);
			}

			if (oState.oSmartTable && (sTableVariantId || sPageVariantId)) {
				oState.oSmartTable.attachAfterVariantInitialise(function (oEvent) {
					oState.oSmartTable.setCurrentVariantId(sTableVariantId || sPageVariantId);
				});
				// incase the control variant is already initialized
				oState.oSmartTable.setCurrentVariantId(sTableVariantId || sPageVariantId);
			}

			oState.oMultipleViewsHandler.setControlVariant(sChartVariantId, sTableVariantId, sPageVariantId);
		}

		// method is responsible for retrieving custom filter state. The corresponding extension-method has a more generic name
		// for historical reasons (change would be incompatible).
		function fnRestoreCustomFilterState(oCustomData) {
			oController.restoreCustomAppStateDataExtension(oCustomData || {});
		}

		// method is responsible for retrieving state for all extensions.
		// More precisely, oExtensionData is a map Extension-namespace -> state that has been stored by the corresponding extension.
		// This method enables each extension to restore its state accordingly.
		function fnRestoreExtensionFilterState(oExtensionData){
			if (!oExtensionData){
				return; // the app-state does not contain state information for extensions
			}
			var bIsAllowed = true; // check for synchronous calls
			// the following function will be passed to all extensions. It gives them the possibility to retrieve their state.
			// Therefore, they must identify themselves via their instance of ControllerExtension.
			var fnGetAppStateData = function(oControllerExtension){
				if (!(oControllerExtension instanceof ControllerExtension)){
					throw new FeError(sClassName, "State must always be retrieved with respect to a ControllerExtension");
				}
				var sExtensionId = oControllerExtension.getMetadata().getNamespace();
				if (!bIsAllowed){
					throw new FeError(sClassName, "State must always be restored synchronously");
				}
				return oExtensionData[sExtensionId];
			};
			oController.templateBaseExtension.restoreExtensionAppStateData(fnGetAppStateData);
			bIsAllowed = false;
		}

		// This method is responsible for restoring the data which have been stored via getPageState.
		// However, it must be taken care of data which have been stored with another (historical) format.
		// Therefore, it is checked whether oCustomAndGenericData possesses two properties with the right names.
		// If this is this case it is assumed that the data have been stored according to curreent logic. Otherwise, it is
		// assumed that the data have been stored with the current logic. Otherwise, it is assumed that the properties have been
		// stored with a logic containing only custom properties (with possible addition of _editStateFilter).
		function fnRestorePageState(oCustomAndGenericData, bApplySearchIfConfigured) {
			oCustomAndGenericData = oCustomAndGenericData || {};
			if (oCustomAndGenericData.hasOwnProperty(dataPropertyNameCustom) && oCustomAndGenericData.hasOwnProperty(dataPropertyNameGeneric)) {
				fnRestoreExtensionFilterState(oCustomAndGenericData[dataPropertyNameExtension]);
				fnRestoreCustomFilterState(oCustomAndGenericData[dataPropertyNameCustom]);
				fnRestoreGenericFilterState(oCustomAndGenericData[dataPropertyNameGeneric], bApplySearchIfConfigured);
			} else {
				// historic format. May still have property _editStateFilter which was used generically.
				if (oCustomAndGenericData._editStateFilter !== undefined) {
					fnRestoreGenericFilterState({
						editStateFilter: oCustomAndGenericData._editStateFilter
					});
					delete oCustomAndGenericData._editStateFilter;
				}
				fnRestoreCustomFilterState(oCustomAndGenericData);
			}

			// according to SFB needed to recalculate adapt filters count also for extension filters
			oState.oSmartFilterbar.fireFilterChange();
		}

		function setDataShownInTable(bDataAreShown) {
			bDataAreShownInTable = bDataAreShown;
			var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
			oTemplatePrivateModel.setProperty("/generic/bDataAreShownInTable", bDataAreShown);
		}

		// This method is called when some filters or settings are changed (bFilterOrSettingsChange = true) or the data selection for the table is triggered (bDataAreShown = true).
		// It is responsible for:
		// - triggering the creation of a new appState if neccessary
		// - setting global variable bDataAreShownInTable up to date
		function changeIappState(bFilterOrSettingsChange, bDataAreShown){
			fnLogInfo("changeIappState called", {
				bFilterOrSettingsChange: bFilterOrSettingsChange,
				bDataAreShown: bDataAreShown,
				bDataAreShownInTable: bDataAreShownInTable,
				bIgnoreFilterChange: bIgnoreFilterChange
			});
			// don't consider filter changes while the dialog is open 
			if (oState.oSmartFilterbar.isDialogOpen()){
				return;
			}
			if (bIgnoreFilterChange){
				return;
			}
			setDataShownInTable(bDataAreShown);
			
			// inform statePreserver about change already here (not just in fnStoreCurrentAppStateAndAdjustURL) to allow own handling of dealing with multiple state changes
			// overlapping each other
			// no need to check whether the state actually has changed (just pressing go again to refresh the data is no state change) - this is done by statePreserver
			oTemplateUtils.oComponentUtils.stateChanged();
		}

		/*
		The function is to add default values in Display Currency parameter if it is not there in the Selection Variant
        @param {object} Selection Variant
`		@param {object} App data
		*/
		function addDisplayCurrency(oAppData) {
			var aMandatoryFilterItems = oState.oSmartFilterbar.determineMandatoryFilterItems(),
			sDisplayCurrency;
			for (var item = 0; item < aMandatoryFilterItems.length; item++) {
				if (aMandatoryFilterItems[item].getName().indexOf("P_DisplayCurrency") !== -1) {
					if (oAppData.oDefaultedSelectionVariant.getSelectOption("DisplayCurrency") && oAppData.oDefaultedSelectionVariant.getSelectOption("DisplayCurrency")[0] && oAppData.oDefaultedSelectionVariant.getSelectOption("DisplayCurrency")[0].Low) {
						sDisplayCurrency = oAppData.oDefaultedSelectionVariant.getSelectOption("DisplayCurrency")[0].Low;
						if (sDisplayCurrency) {
							oAppData.oSelectionVariant.addParameter("P_DisplayCurrency", sDisplayCurrency);
						}
					}
					break;
				}
			}
		}

		/*
		The function checks if the Mandatory Filters are filled. Returns true if not filled
		*/
		function checkForMandatoryFilters() {
			var aMandatoryFilterItems = oState.oSmartFilterbar.determineMandatoryFilterItems();
			var filtersWithValues = oState.oSmartFilterbar.getFiltersWithValues();
			for (var i = 0; i < aMandatoryFilterItems.length; i++) {
				if (filtersWithValues.indexOf(aMandatoryFilterItems[i]) === -1) {
					return true;
				}
			}
			return false;
		}
		// This method is called asynchronously from fnParseUrlAndApplyAppState in case of external navigation (xAppState or UrlParameters) 
		// as soon as the appstate-information from the url has been parsed completely.
		// In case of initial startup or restoring from iAppState, it's called by applyState, which is in turn called from statePreserver, that
		// already takes care of not trying to apply an appstate that is not valid anymore.
		// task of this method is (now always when it's called!) to adapt the state of all relevant controls to the provided one
		function fnAdaptToAppState(oAppData, oURLParameters, sNavType){
			fnLogInfo("fnAdaptToAppState called", {
				sNavType: sNavType
			});
			oState.oSmartFilterbar.setSuppressSelection(false);
			oState.sNavType = sNavType;

			var oNewUrlParameters = oURLParameters || {};
			handleVariantIdPassedViaURLParams(oNewUrlParameters,bSmartVariantManagement);

			var sSelectionVariant =  oAppData.selectionVariant || "";
			var sTableVariantId = (!bSmartVariantManagement && oAppData.tableVariantId) || "";
			var oSelectionVariant = oAppData.oSelectionVariant || "";
			//oStartupObject to be passed to the extension where urlParameters and selectedQuickVariantSelectionKey are optional
			var oStartupObject = {
				selectionVariant: oSelectionVariant,
				urlParameters: oURLParameters,
				selectedQuickVariantSelectionKey: "",
				// incase semantic date field is present, parseNavigation returns semanticDates in stringified format and otherwise an empty object
				semanticDates: (typeof oAppData.semanticDates === "string" ? JSON.parse(oAppData.semanticDates) : oAppData.semanticDates) || {}
			};
			//Apply sort order coming from the XAppState to the smart table.
			if (sNavType !== sap.ui.generic.app.navigation.service.NavType.iAppState && oAppData.presentationVariant !== undefined) {
				oTemplateUtils.oCommonUtils.setControlSortOrder(oState, oAppData.presentationVariant);
			}
			var oSFBUiState = oState.oSmartFilterbar.getUiState();
			var oSFBSelectionVariant = new SelectionVariant(JSON.stringify(oSFBUiState.getSelectionVariant()));
			var oSFBSelectionVariantCopy = JSON.parse(JSON.stringify(oSFBSelectionVariant));
			var oSFBSemanticDates = oSFBUiState.getSemanticDates();
			var oCustomDataFromSFB = oSFBSelectionVariant.getSelectOption(dataPropertyNameCustom);
			var oGenericDataFromSFB = oSFBSelectionVariant.getSelectOption(dataPropertyNameGeneric);
			if ((oRealizedAppState.selectionVariant !== sSelectionVariant ||
				oRealizedAppState.tableVariantId !== sTableVariantId ||
				fnNotEqual(oRealizedAppState.urlParams, oNewUrlParameters)) && sNavType !== sap.ui.generic.app.navigation.service.NavType.initial) {
					var bHasOnlyDefaults = oAppData && oAppData.bNavSelVarHasDefaultsOnly;
					if ((oAppData.oSelectionVariant.getSelectOptionsPropertyNames().indexOf("DisplayCurrency") === -1) && (oAppData.oSelectionVariant.getSelectOptionsPropertyNames().indexOf("P_DisplayCurrency") === -1) && (oAppData.oSelectionVariant.getParameterNames().indexOf("P_DisplayCurrency") === -1)) {
						addDisplayCurrency(oAppData);
					}
					// if there is a navigation from external application to worklist,
					// the filters from external application should not be applied since the worklist does not show smartfilterbar
					// and there is no way for the user to modify the applied filters. Hence not applying the filters only if it is worklist
					if (!oState.oWorklistData.bWorkListEnabled) {
						// Call the extension to modify selectionVariant or semanticDates or set tab for NavType !== iAppState as iAppState would have the modified SV values
						// or saved selected tab and hence there is no need to modify them again
						if (!bHasOnlyDefaults || oState.oSmartFilterbar.isCurrentVariantStandard()) {
							// given variant has only default values (set by user in FLP), and variant (already loaded) is not user specific
							// => default values have to be added without removing existing values (but overriding them if values for the same filter exist)
							// in case of modify extension, if given variant has only default values, if these values are modified through extension,
							// then they will be replaced in the filterbar accordingly
							if (sNavType !== sap.ui.generic.app.navigation.service.NavType.iAppState) {
								oController.modifyStartupExtension(oStartupObject);
							}

							//bHasOnlyDefaults is always false in case of iAppState
							fnApplySelectionVariantToSFB(bHasOnlyDefaults ? fnMergeDefaultWithSFBVariant(oStartupObject.selectionVariant, oSFBSelectionVariant) : oStartupObject.selectionVariant, oRealizedAppState, sSelectionVariant, true, oStartupObject.semanticDates);
						} else {
							// if oAppData selection variant is not present, then use filter bar's variant
							fnAddOrRemoveCustomAndGenericData(oSFBSelectionVariant, oCustomDataFromSFB, oGenericDataFromSFB, true);
							oStartupObject.selectionVariant = oSFBSelectionVariant;
							oStartupObject.semanticDates = oSFBSemanticDates;
							oController.modifyStartupExtension(oStartupObject);
							fnAddOrRemoveCustomAndGenericData(oStartupObject.selectionVariant, oCustomDataFromSFB, oGenericDataFromSFB, false);
							// only if the extension modifies the selection variant or the semanticDates, then set it to smart filter bar again
							if (!(deepEqual(JSON.parse(JSON.stringify(oStartupObject.selectionVariant)), oSFBSelectionVariantCopy) && deepEqual(oStartupObject.semanticDates, oSFBSemanticDates))) {
								fnApplySelectionVariantToSFB(oStartupObject.selectionVariant, oRealizedAppState, sSelectionVariant, true, oStartupObject.semanticDates);
							}
						}
					}
					if (sTableVariantId !== oRealizedAppState.tableVariantId) {
						oState.oSmartTable.setCurrentVariantId(sTableVariantId);
					}
					// in case of navigation with URL parameters but no xAppState, no CustomData is provided
					oAppData.customData = oAppData.customData || {};

					if (oState.oWorklistData.bWorkListEnabled) {
						// null check done as fix for incident 1870150212
						oState.oWorklistData.oWorklistSavedData = oAppData.customData[dataPropertyNameGeneric] && oAppData.customData[dataPropertyNameGeneric]["Worklist"] ? oAppData.customData[dataPropertyNameGeneric]["Worklist"] : {};
						// restore the state of worklist from IappState
						oState.oWorklistHandler.restoreWorklistStateFromIappState();
					}
					fnRestorePageState(oAppData.customData, true);

				oRealizedAppState = {
					urlParams: oNewUrlParameters,
					selectionVariant: sSelectionVariant,
					tableVariantId: sTableVariantId
				};
			}
			// this condition is used to modify selection variant or semantic date when sNavType is initial.
			if (sNavType !== sap.ui.generic.app.navigation.service.NavType.iAppState) {
				//not moving this to a common place due to expected changes
				if (sNavType === sap.ui.generic.app.navigation.service.NavType.initial) {
					// do not expose generic and custom data through ext for modification
					fnAddOrRemoveCustomAndGenericData(oSFBSelectionVariant, oCustomDataFromSFB, oGenericDataFromSFB, true);
					oStartupObject.selectionVariant = oSFBSelectionVariant;
					oStartupObject.semanticDates = oSFBSemanticDates;
					oController.modifyStartupExtension(oStartupObject);
					// if custom or generic data exist, add it back to selection variant
					fnAddOrRemoveCustomAndGenericData(oStartupObject.selectionVariant, oCustomDataFromSFB, oGenericDataFromSFB, false);
					if (!(deepEqual(JSON.parse(JSON.stringify(oStartupObject.selectionVariant)), oSFBSelectionVariantCopy) && deepEqual(oStartupObject.semanticDates, oSFBSemanticDates))) {
						fnApplySelectionVariantToSFB(oStartupObject.selectionVariant, oRealizedAppState, sSelectionVariant, true, oStartupObject.semanticDates);
					}
				}

				oState.oMultipleViewsHandler.handleStartUpObject(oStartupObject);
			}

			// If the NavType is iAppState the question of automated data selection is already settled.
			// Otherwise it must be done now. Note that automatisms have been disabled during startup
			// However, if bDataAreShownInTable is already true, the data have already been selected and nothing needs to be done anymore.
			// This is the case in FCL scenarios, when navigating from an automatically filled list to a detail.
			// Treat Worklist differently
			if (oState.oWorklistData.bWorkListEnabled) {
				if (sNavType === "initial" && oState.oSmartFilterbar.isCurrentVariantStandard()) {
					oState.oWorklistHandler.restoreWorklistStateFromIappState();
				}
			} else if (sNavType !== sap.ui.generic.app.navigation.service.NavType.iAppState && !bDataAreShownInTable){
				// If the app is reached via cross-app navigation by UX decision the data should be shown immediately
				var bIsCrossAppNavigation = (sNavType === sap.ui.generic.app.navigation.service.NavType.xAppState
					|| sNavType === sap.ui.generic.app.navigation.service.NavType.URLParams) && !oAppData.bNavSelVarHasDefaultsOnly;

				if (oState.oSmartFilterbar.isCurrentVariantStandard()) {
					// Check if apply automatically is set by User
					bDataAreShownInTable = oState.oSmartFilterbar.getSmartVariant().bExecuteOnSelectForStandardByUser;
				} else {
					bDataAreShownInTable = oState.oSmartFilterbar.isCurrentVariantExecuteOnSelectEnabled();
				}
				var enableAutoBindingForMultiViews = oState.oMultipleViewsHandler.getOriginalEnableAutoBinding();
				var bIsMandatoryFilterNotFilled = checkForMandatoryFilters();
				var oDataLoadSettings = oSettings.dataLoadSettings;
				var sLoadBehaviour;
				if (oDataLoadSettings) {
					sLoadBehaviour = oDataLoadSettings.loadDataOnAppLaunch;
				}
				var bCrossAppOrFCL = false;
				if (bDataAreShownInTable === null || bDataAreShownInTable === undefined || oState.oSmartFilterbar.getLiveMode()) {
					bCrossAppOrFCL = bIsCrossAppNavigation || oState.bLoadListAndFirstEntryOnStartup;
					if (!bCrossAppOrFCL) {
						if ((sLoadBehaviour === null || sLoadBehaviour === undefined) && (enableAutoBindingForMultiViews !== null && enableAutoBindingForMultiViews !== undefined)) {
								bDataAreShownInTable = enableAutoBindingForMultiViews && !bIsMandatoryFilterNotFilled ? true : false;
						} else {
							bDataAreShownInTable = isDataShown(sLoadBehaviour, bIsMandatoryFilterNotFilled);
						}
					} else {
						bDataAreShownInTable = bCrossAppOrFCL;
					}
					if (!bDataAreShownInTable && oState.oSmartFilterbar.isCurrentVariantStandard() && !oState.oSmartFilterbar.getSmartVariant().bExecuteOnSelectForStandardByUser && oState.oSmartFilterbar.getSmartVariant().bExecuteOnSelectForStandardViaXML) {
						oState.oSmartFilterbar.getSmartVariant().bExecuteOnSelectForStandardViaXML = false;
						bDataAreShownInTable = false;
					}
				}
				setDataShownInTable(bDataAreShownInTable);
				if (bDataAreShownInTable) {
					oState.oSmartFilterbar.search();
					//collapse header if execute on select is checked or enableautobinding is set
					collapseLRHeaderonLoad(bDataAreShownInTable);
				}
			}

			//Set the variant to clean when the user has not altered the filters on the initial load of the app(no navigation context).
			oController.byId('template::PageVariant') && oController.byId('template::PageVariant').currentVariantSetModified(false);

			// IappState needs to be created on app launch in every scenario, irrespective of filter(s) set or load behavior of the application
			if (sNavType !== sap.ui.generic.app.navigation.service.NavType.iAppState) {
				changeIappState(true, bDataAreShownInTable);
			}
		}

		function applyState(oState){
			if (!oState) {
				return;
			}

			// enhance appData to the format needed by fnAdaptToAppState
			var oAppData = extend({
// data from appState (i.e. provided by getCurrentState, thus stored in LREP and retrieved from there, and therefore provided in oState again)
// just providing defaults				
//				customData: {}, // not necessary, as we have a fallback in fnAdaptToAppState again
//				selectionVariant: undefined,
//				tableVariantId: "",    // -> sTableVariantId, not necessary, as we have a fallback in fnAdaptToAppState again
// id for the appState in the URL - as storing and restoring from URL is task of the statePreserver, we should only be interested in the data here
// data provided with fixed values from navigationHandler in case of iAppState
//				bNavSelVarHasDefaultsOnly: false,	// -> bHasOnlyDefaults, not needed as ndefined is faulthy anyway
				oDefaultedSelectionVariant: new SelectionVariant(), // only accessed to check for P_DisplayCurrency - can this be relevant?
// data that seems to be irrelevant as we don't access them
//				presentationVariant: {}, // only accessed if navType not iAppState (intended for navigation ...)
//				valueTexts: {},
// data that needs to be derived from the other data
				// analysis of navigationHandler -> seems to be wrong. oState.selectionVariant is already stringified
				//				oSelectionVariant: new SelectionVariant(JSON.stringify(oState.selectionVariant || {}))  // -> oSelectionVariant
				oSelectionVariant: new SelectionVariant(oState && oState.selectionVariant)  // -> oSelectionVariant
// remaining: still to be analyzed which category they belong to
			}, oState
//			, {
// data that needs to be derived and override original values				
//				selectionVariant: JSON.stringify(oState.selectionVariant || {})  // -> sSelectionVariant, fallback to "" (instead of "{}")?! - immer auch oSelectionVariant verfügbar (simplification possible), sSelectionVaraint used to compare with realized appState, unteschied zwischen "" und "{}" relevant?
//			}
			);
			fnAdaptToAppState(oAppData, {} /* URLparameter are irrelevant if restoring from iAppState */, sap.ui.generic.app.navigation.service.NavType.iAppState);
		}
		
		/**
		 * This function makes a copy of smart filter bar's variant, and merges it with the user default parameters from FLP
		 * 
		 * @param {object} oDefaultParamsVariant variant with default params provided by FLP
		 * @param {object} oSFBSelectionVariant standard variant of the smart filter bar
		 * 
		 * @returns {object} a new merged selection variant with default properties taking priority.
		 */
		function fnMergeDefaultWithSFBVariant(oDefaultParamsVariant, oSFBSelectionVariant) {
			if (oDefaultParamsVariant.isEmpty()) {
				return oSFBSelectionVariant;
			}
			
			var oMergedVariant = new SelectionVariant();
			var aVariantOptions, aVariantParameters;		
			[oSFBSelectionVariant, oDefaultParamsVariant].forEach(function (oVariant) {
				// copy selection options
				aVariantOptions = oVariant.getSelectOptionsPropertyNames();
				aVariantOptions.forEach(function (sProperty) {
					oMergedVariant.removeSelectOption(sProperty);
					oMergedVariant.massAddSelectOption(sProperty, oVariant.getSelectOption(sProperty));
				});
				// copy parameters
				aVariantParameters = oVariant.getParameterNames();
				aVariantParameters.forEach(function (sParam) {
					oMergedVariant.removeParameter(sParam);
					oMergedVariant.addParameter(sParam, oVariant.getParameter(sParam));
				});
			});

			return oMergedVariant;
		}

		function fnParseUrlAndApplyAppState(){
			var oRet = new Promise(function(fnResolve){
				var oParseNavigationPromise = oNavigationHandler.parseNavigation();
				oParseNavigationPromise.done(function(oAppData, oURLParameters, sNavType){
					if (sNavType !== sap.ui.generic.app.navigation.service.NavType.iAppState) { // handled via state preserver
						// navType initial has also to be handled here, as in that case the call from state preserver happens to early (we don't even know
						// at that time, whether navtype is initial, URLparams or xAppState when started from FLP with user default values set)
						fnAdaptToAppState(oAppData, oURLParameters, sNavType);
					}
					fnResolve();
				});
				oParseNavigationPromise.fail(function(oNavError, oURLParameters, sNavType){
					/* Parsing app state has failed, so we cannot set the correct state
					 * But at least we should get into a consistent state again, so the user can continue using the app
					 */
					oLogger.warning(oNavError.getErrorCode() + "app state could not be parsed - continuing with empty state");
					fnAdaptToAppState({}, oURLParameters, sap.ui.generic.app.navigation.service.NavType.initial); // Use NavType initial, as this will enforce selection in case auto-binding is true.
					fnResolve();
				});
			});
			return oRet;
		}

		// The smart filterbar is triggering this event in order to ensure that we update all stat information within the Smart Filterbar
		// This happens in two scenarios:
		// a) The user saves the current state as a variant -> In this case the SFB needs to know what to save
		// b) The user opens the 'Adapt filters' dialog -> In this case the current state needs to be remembered by the SFB, such that they can reset to this state if the user wants to
		function onBeforeSFBVariantFetch(){
			// In scenario b) no new appstate needs to be created (this only needs to happen when the user changes some filters on the dialog and closes the dialog)
			// In scenario a) a new appstate should be written (containing the new variant name) but the filters should not be considered as being changed.
			// The creation of a new appstate will be triggered by event onAfterSFBVariantSave.
			// Conclusion: We can disconnect from the filter change event while this method is running
			bIgnoreFilterChange = true;

			// check whether variant is dirty when dialog is opened already here, because it would marked as dirty anyway in fireFilterChange
			// as this event is also called in other cases (e.g. scenario a) above), only rely the flag if the dialog is opened
			bDialogOpenedWithDirtyVariant = oController.byId('template::PageVariant') && oController.byId('template::PageVariant').currentVariantGetModified();
			
			var oFilterData = oState.oSmartFilterbar.getFilterData();
			// workaround since getFilterData() does not provide the content of the search field:
			var sSearchFieldValue, oBasicSearchField = oState.oSmartFilterbar.getBasicSearchControl();
			if (oBasicSearchField && oBasicSearchField.getValue){
				sSearchFieldValue = oBasicSearchField.getValue();
			}
			var oCurrentAppState = getCurrentAppState();
			oFilterData._CUSTOM = oCurrentAppState.customData;
			oState.oSmartFilterbar.setFilterData(oFilterData, true);
			if (sSearchFieldValue){ // the previous statement has blanked the content of the search field -> reset it to the stored value
				oBasicSearchField.setValue(sSearchFieldValue);
			}
			// according to SFB needed to update DateRangeTypes
			oState.oSmartFilterbar.fireFilterChange();
			bIgnoreFilterChange = false; // connect to the filter change event again
		}

		function onAfterSFBVariantSave(){
			changeIappState(true, bDataAreShownInTable);
		}

		function onAfterSFBVariantLoad(oEvent) {
			var sContext = oEvent.getParameter("context");
			var oData = oState.oSmartFilterbar.getFilterData(true);
			if (oData._CUSTOM !== undefined) {
				if (oState.oWorklistData.bWorkListEnabled) {
					var oCustomData = oData._CUSTOM[dataPropertyNameGeneric]["Worklist"];
					// if worklist data is saved in variant, then it should be applied to
					// searchfield and table rebinding has to be done to restore the state of the app
					oState.oSmartFilterbar.setSuppressSelection(false);
					oState.oWorklistData.oSearchField.setValue(oCustomData.searchString);
					oState.oWorklistData.oSearchField.fireSearch();
				} else {
					fnRestorePageState(oData._CUSTOM);
				}
			} else {
				// make sure that the custom data are nulled for the STANDARD variant
				var oCustomAndGenericData = getPageState();
				fnNullify(oCustomAndGenericData[dataPropertyNameCustom]);
				fnNullify(oCustomAndGenericData[dataPropertyNameGeneric]);
				fnRestorePageState(oCustomAndGenericData);
			}
			// store navigation context
			if (aIrrelevantVariantLoadContext.indexOf(sContext) < 0) {
				bDataAreShownInTable = oEvent.getParameter("executeOnSelect");
				collapseLRHeaderonLoad(bDataAreShownInTable);
				changeIappState(true, bDataAreShownInTable);
			}
			// reset is only available on the adapt filters dialog, so it makes sense to check bDialogOpenedWithDirtyVariant
			if (sContext === "RESET" && bDialogOpenedWithDirtyVariant){
				// reset on the dialog reset to the persisted version of the variant, even if cancel is used later - but does not trigger a selection
				// (even if variant is marked as execute on select)
				// Thus, as variant was dirty before, this is a change in filter, but no (current) data are shown in the table afterwards
				oAdaptFiltersDialogOpenPromise.then(changeIappState.bind(null, true, false));
			}
		}
		
		function onFiltersDialogBeforeOpen(){
			oAdaptFiltersDialogOpenPromise = new Promise(function(resolve){
				fnResolveAdaptFiltersDialog = resolve;
			});
			
		}
		
		function onFiltersDialogClosed(){
			fnResolveAdaptFiltersDialog();
			// resetting bDialogOpenedWithDirtyVariant here is of no value, as it would also be set in other cases (e.g. when saving the current state as variant)
			// i.e. it makes only sense to check the flag when the adapt filters dialog is open
		}

		function onAfterTableVariantSave() {
			if (!bSmartVariantManagement){
				changeIappState(true, bDataAreShownInTable);
			}
		}

		function onAfterApplyTableVariant() {
			if (!bSmartVariantManagement){
				changeIappState(true, bDataAreShownInTable);
			}
		}

		function isDataShown(sLoadBehaviour, bIsMandatoryFilterNotFilled) {
			var bDataLoad;
			var filtersWithValues = oState.oSmartFilterbar.getFiltersWithValues();
			switch (sLoadBehaviour) {
				case "always":
					bDataLoad = !bIsMandatoryFilterNotFilled ? true : false;
					break;
				case "never":
					bDataLoad = false;
					break;
				default:
					bDataLoad = filtersWithValues.length && !bIsMandatoryFilterNotFilled ? true : false;
			}
			return bDataLoad;
		}

		function onSmartFilterBarInitialise(){
			bIsAutoBinding = oState.oSmartTable.getEnableAutoBinding();
			oState.oSmartFilterbar.attachFiltersDialogClosed(oTemplateUtils.oComponentUtils.stateChanged);
			// clarify: do we need to attach oTemplateUtils.oComponentUtils.stateChanged here?
			// actually, it seems that filterChange event is anyway raised again by SFB after dialog is closed (with "go")
		}

		/*
		The function sets executeOnSelect to true if enableAutobinding is true
		*/
		function onSFBVariantInitialise() {
			var sLoadBehaviour;
			var oDataLoadSettings = oSettings.dataLoadSettings;
			if (oDataLoadSettings) {
				sLoadBehaviour = oDataLoadSettings.loadDataOnAppLaunch;
			}
			var multiplePropertyViewName = oState.oMultipleViewsHandler.getSelectedKeyPropertyName();
			var oMultiVieworMultiTabApp = multiplePropertyViewName === "tableTabData" || multiplePropertyViewName === "tableViewData" ? true : false;
			autoBindingFromView = oMultiVieworMultiTabApp ? false : true;
			var multiView = sLoadBehaviour === null || sLoadBehaviour === undefined ? oState.oMultipleViewsHandler.getEnableAutoBinding() : true;
			bIsAutoBinding = autoBindingFromView || multiView;
			if (bIsAutoBinding) {
				var oDataTemplate = new sap.ui.core.CustomData({key:"executeStandardVariantOnSelect", value:true});
				oState.oSmartFilterbar.addCustomData(oDataTemplate);
			}
		}

		//collapse dynamic header if data is preloaded in LR on launch
		function collapseLRHeaderonLoad(bDataAreShownInTable){
			var oTemplatePrivateModel = oController.getOwnerComponent().getModel("_templPriv");
			var bIsMandatoryFilterNotFilled = checkForMandatoryFilters();
			if (bDataAreShownInTable && bIsMandatoryFilterNotFilled) {
				// if data is supposed to be shown and there are mandatory filters, expand header
				oTemplatePrivateModel.setProperty("/listReport/isHeaderExpanded", true);
			} else if (bDataAreShownInTable) {
				// if data is shown and there are no mandatory filters, collapse header
				oTemplatePrivateModel.setProperty("/listReport/isHeaderExpanded", false);
			} else {
				// if no data is shown, expand header
				oTemplatePrivateModel.setProperty("/listReport/isHeaderExpanded", true);
			}
		}

		/* This function calls the setUiState API of smartfilterbar to set the Ui State
		 * @param  {object} oSelectionVariant -  Selection variant object
		 * @param {boolean} bReplace -  Property bReplace decides whether to replace existing filter data
                 * @param {boolean} bStrictMode - Defines the filter/parameter determination, based on the name.
		*/
		function fnSetFiltersUsingUIState(oSelectionVariant, bReplace, bStrictMode, oSemanticDates) {
			var oUiState = new UIState({
				selectionVariant : oSelectionVariant,
				semanticDates: oSemanticDates
			});
			oState.oSmartFilterbar.setUiState(oUiState, {
				replace: bReplace,
				strictMode: bStrictMode
			});
		}
		
        /*
		The function is to add / remove Custom and Generic data from the SelectOptions of SV
		@param {object} Selection Variant
		@param {object} oCustomDataFromSFB
		@param {object} oGenericDataFromSFB
		@param {boolean} bRemove
		*/
		function fnAddOrRemoveCustomAndGenericData(oSelectionVariant, oCustomDataFromSFB, oGenericDataFromSFB, bRemove) {
			// modify selection variant only if valid generic and custom data objects are available
			if (oSelectionVariant && (oCustomDataFromSFB || oGenericDataFromSFB)) {
				if (bRemove) {
					oSelectionVariant.removeSelectOption(dataPropertyNameCustom);
					oSelectionVariant.removeSelectOption(dataPropertyNameGeneric);
				} else {
					oSelectionVariant.massAddSelectOption(dataPropertyNameCustom, oCustomDataFromSFB);
					oSelectionVariant.massAddSelectOption(dataPropertyNameGeneric, oGenericDataFromSFB);
				}
			}
		}

		/**
		 * This function apply selection properties to the smart filter bar
		 * @param  {object} oSelectionVariant
		 * @param  {object} oRealizedAppState
		 * @param  {string} sSelectionVariant
		 * @return {void}
		 */
		function applySelectionProperties(oSelectionVariant, oRealizedAppState, sSelectionVariant) {
			// even when the nav type is initial, due to modifystartup extension,new fields can be added to smartfilterbar
			if (oSelectionVariant && (oRealizedAppState.selectionVariant !== sSelectionVariant || oState.sNavType === "initial")){
				var aSelectionVariantProperties = oSelectionVariant.getParameterNames().concat(
					oSelectionVariant.getSelectOptionsPropertyNames());
				for (var i = 0; i < aSelectionVariantProperties.length; i++) {
					oState.oSmartFilterbar.addFieldToAdvancedArea(aSelectionVariantProperties[i]);
				}
			}
		}

		// map property values for property with name sFirstProperty to values for property with name sSecondProperty in oSelectionVariant
		function fnAlignSelectOptions(oSelectionVariant, sFirstProperty, sSecondProperty){
			if (oSelectionVariant.getParameter(sFirstProperty) && !oSelectionVariant.getParameter(sSecondProperty)){
				oSelectionVariant.addParameter(sSecondProperty, oSelectionVariant.getParameter(sFirstProperty));
			}
			if (oSelectionVariant.getSelectOption(sFirstProperty) && !oSelectionVariant.getSelectOption(sSecondProperty)){
				var aSelectOption = oSelectionVariant.getSelectOption(sFirstProperty);
				aSelectOption.forEach(function(oSelectOption){
					oSelectionVariant.addSelectOption(sSecondProperty, oSelectOption.Sign, oSelectOption.Option, oSelectOption.Low, oSelectOption.High);
				});
			}
		}

		function fnMapEditableFieldFor(oSelectionVariant){
			var oMetaModel = oController.getOwnerComponent().getModel().getMetaModel();
			var sEntitySet = oController.getOwnerComponent().getEntitySet();
			var oEntityType = oMetaModel.getODataEntityType(oMetaModel.getODataEntitySet(sEntitySet).entityType);
			oEntityType.property.forEach(function(oProperty){
				if (oProperty["com.sap.vocabularies.Common.v1.EditableFieldFor"]){
					// annotation property names follow their type, so PropertyPath is the right property to look at - String has to be supported for compatibility reasons
					var sKeyProperty = oProperty["com.sap.vocabularies.Common.v1.EditableFieldFor"].PropertyPath || oProperty["com.sap.vocabularies.Common.v1.EditableFieldFor"].String;
					var sForEditProperty = oProperty.name;
					// map key fields to corresponding for edit properties to provide values in SFB (without mapping in FLP)
					fnAlignSelectOptions(oSelectionVariant, sKeyProperty, sForEditProperty);
					// and vice versa if field is mapped in FLP (formerly recommended), but original field used in SFB (never recommended)
					fnAlignSelectOptions(oSelectionVariant, sForEditProperty, sKeyProperty);
				}
			});
		}

		function fnApplySelectionVariantToSFB(oSelectionVariant, oRealizedAppState, sSelectionVariant, bReplace, oSemanticDates){
			fnMapEditableFieldFor(oSelectionVariant);
			if (bReplace) {
				oState.oSmartFilterbar.clearVariantSelection();
			}
			applySelectionProperties(oSelectionVariant, oRealizedAppState, sSelectionVariant);
			fnSetFiltersUsingUIState(oSelectionVariant.toJSONObject(), bReplace, /* bStrictMode = */ false, oSemanticDates);
		}

		
		return {
			areDataShownInTable: areDataShownInTable,
			setDataShownInTable: setDataShownInTable,
			parseUrlAndApplyAppState: fnParseUrlAndApplyAppState,
			changeIappState: changeIappState,
			onFiltersDialogBeforeOpen: onFiltersDialogBeforeOpen,
			onFiltersDialogClosed: onFiltersDialogClosed,
			onSmartFilterBarInitialise: onSmartFilterBarInitialise,
			onBeforeSFBVariantFetch: onBeforeSFBVariantFetch,
			onAfterSFBVariantSave: onAfterSFBVariantSave,
			onAfterSFBVariantLoad: onAfterSFBVariantLoad,
			onAfterTableVariantSave: onAfterTableVariantSave,
			onAfterApplyTableVariant: onAfterApplyTableVariant,
			onSFBVariantInitialise: onSFBVariantInitialise,
			applyState: applyState,
			getCurrentAppState: getCurrentAppState // separation of concerns - only provide state, statePreserver responsible for storing it
		};
	}

	return BaseObject.extend("sap.suite.ui.generic.template.ListReport.controller.IappStateHandler", {
		constructor: function(oState, oController, oTemplateUtils) {
			extend(this, getMethods(oState, oController, oTemplateUtils));
		}
	});
});
