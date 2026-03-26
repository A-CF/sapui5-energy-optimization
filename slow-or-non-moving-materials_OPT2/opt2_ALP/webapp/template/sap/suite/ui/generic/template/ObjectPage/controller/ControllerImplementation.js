sap.ui.define([
	"sap/ui/core/mvc/ControllerExtension",
	"sap/m/MessageBox",
	"sap/m/plugins/DataStateIndicator",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/ui/generic/app/navigation/service/SelectionVariant",
	"sap/suite/ui/generic/template/lib/testableHelper",
	"sap/suite/ui/generic/template/detailTemplates/detailUtils",
	"sap/suite/ui/generic/template/ObjectPage/controller/SideContentHandler",
	"sap/suite/ui/generic/template/ObjectPage/extensionAPI/ExtensionAPI",
	"sap/suite/ui/generic/template/js/AnnotationHelper",
	"sap/m/Table",
	"sap/ui/layout/DynamicSideContent",
	"sap/suite/ui/generic/template/lib/ShareUtils",
	"sap/ui/dom/jquery/Selectors",
	"sap/suite/ui/generic/template/lib/FeLogger",
	"sap/suite/ui/generic/template/ObjectPage/controller/MultipleViewsHandler",
	"sap/suite/ui/generic/template/lib/MessageUtils",
	"sap/ui/events/KeyCodes",
	"sap/base/util/merge",
	"sap/ui/model/FilterProcessor",
	"sap/suite/ui/generic/template/js/StableIdHelper",
	"sap/ui/core/Element",
	"sap/uxap/ObjectPageSubSection",
	"sap/ui/core/MessageType",
	"sap/base/util/extend",
	"sap/base/util/UriParameters",
	"sap/base/util/isEmptyObject",
	"sap/ui/dom/getFirstEditableInput",
	"sap/ui/dom/jquery/Focusable",
	"sap/suite/ui/generic/template/lib/FeError",
	"sap/suite/ui/generic/template/lib/CreateWithDialogHandler"
], function(ControllerExtension, MessageBox, DataStateIndicator, Filter, Sorter, SelectionVariant, testableHelper, detailUtils, SideContentHandler,
		ExtensionAPI, AnnotationHelper, ResponsiveTable, DynamicSideContent, ShareUtils, Selectors, FeLogger, MultipleViewsHandler,
			MessageUtils, KeyCodes, merge, FilterProcessor, StableIdHelper, Element, ObjectPageSubSection, MessageType, extend, UriParameters, isEmptyObject, getFirstEditableInput, Focusable, FeError, CreateWithDialogHandler) {
	"use strict";
	var	sClassName = "ObjectPage.controller.ControllerImplementation";
	var oLogger = new FeLogger(sClassName).getLogger();
	var DEFAULT_GROWING_THRESHOLD = 20;
	var SECTION_WEIGHT = 10;

	// contains all the helper objects which can be accessed across helper or extension methods of OP floorplan
	var oState = {};

	// Scroll the specified object page to top
	function fnScrollObjectPageToTop(oObjectPage){
		oObjectPage.setSelectedSection(null);
	}

	function fnIsSmartTableWithInlineCreate(oSmartTable) {
		return oSmartTable.data("inlineCreate") === "true";
	}

	function getAllSubSectionBlocks(oSubSection) {
		var aAllBlocks =  oSubSection.getBlocks().concat(oSubSection.getMoreBlocks()).concat(oSubSection.getActions());
		return aAllBlocks;
	}

	function fnSetPropertyBindingInternalType(oBinding, sInternalType) {
		if (oBinding.getBindings) { // composite Binding
			var aBindings = oBinding.getBindings();
			for (var i = 0; i < aBindings.length; i++) {
				fnSetPropertyBindingInternalType(aBindings[i], sInternalType);
			}
		} else {
			var oType = oBinding.getType();
			oBinding.setType(oType, sInternalType);
		}
	}

	// regular expression for ?
	var rPath = /[A-Za-z].*[A-Za-z]/;

	var oMethods = {
		getMethods: function(oViewProxy, oTemplateUtils, oController) {

			var oBase = detailUtils.getControllerBase(oViewProxy, oTemplateUtils, oController);
			oViewProxy.oController = oController; //Controller attached to ViewProxy so that it's available wherever oViewProxy is accessed
			var oObjectPage;  // the object page, initialized in onInit
			var oSideContentHandler = new SideContentHandler(oController, oTemplateUtils, oTemplateUtils.oComponentUtils.stateChanged); // handles all task connected with SideContent
			var oMultipleViewsHandler;
			var oCreateWithDialogHandler;
			var bFocusAtTop;
			var bSubOPCreate;
			var nFCLActionFlag; // set if FCL_Action buttons fullscreen or exit full screen clicked

			// current state
			var mTablesWithMessagesToDataStateIndicators = Object.create(null); //used by functions fnDataStateFilter and fnRegisterForEditableChange
			var sSectionId = null;  // id of the last section that was navigated to
			var aSubSections = []; //Array containing all SubSections of the current ObjectPage
			var sSelectedSubSectionId = null; //Selected SubSections Id
			var oStateAppliedAfterBindPromise = null; // Promise telling, whether app state has been applied. Will be created in onInit and recreated when component is rebound
											// any asynchronous actions triggered by applying the state are not considered - promise is resolved as soon, as synchronous
											// processing is completed
			var fnStateAppliedAfterBindResolve = null; // resolve function for oStateAppliedAfterBindPromise

			// This represents the global state of object page. There are different things, for which object page sub-sections might be waiting for,
			// We use this variable to check whether those things have completed or not. This state can only be changed by method fnHandleStateChangeForAllSubSections,
			// this method changes the flag of state and trigger a side-effect to tell all the subsections that if they are listening for any state value, they can
			// update themselves.
			// This state is reset in every rebind cycle and set appropriatly whenever some events happen like, headerdata available, stateApplied, layoutFinished.
			// currently structre of this state looks like
			// oWaitForState = {
			// 	bLayoutFinished: boolean,
			// 	bStateApplied: boolean,
			// 	bRebindCompleted :boolean
			// };
			var oWaitForState;
			// If this flag is set to false, it will activate the binding of all subsections which are currenlty
			// not is viewport, and their waitForState has set. If any of the parameter of their waitForState is
			// still not set, it will not activate their bindings. Useful, when we want to find target of messages
			// and want when someone opens messagepopover, because their targets need not to be in viewport, thus we
			// need to activate those subsections.
			var bWaitForViewPort;

			// end state

			function adjustAndProvideBindingParamsForSmartTableOrChart(oEvent){
				var oBindingParams = oEvent.getParameter("bindingParams");
				oBindingParams.parameters = oBindingParams.parameters || {};
				oBindingParams.parameters.usePreliminaryContext = true;
				oBindingParams.parameters.bCanonicalRequest = oTemplateUtils.oServices.oApplication.mustRequireRequestsCanonical();
				oBindingParams.parameters.batchGroupId = "facets";
				return oBindingParams;
			}

			// Implementation of Save for the draft case
			function onActivateImpl() {
				oLogger.info("Activate object", "sap.suite.ui.generic.template.ObjectPage.controller.ControllerImplementation");
				var oActivationPromise = oTemplateUtils.oServices.oCRUDManager.activateDraftEntity();
				var oUIModel = oObjectPage.getModel("ui");
				var bCreateMode = oUIModel.getProperty("/createMode");
				oActivationPromise.then(function(oResponse) {
					fnDetachPasteHandlers();
					// when the message model contains at least one transient message this will be shown at the end of the busy session. Otherwise we show a generic success message.
					if (bCreateMode) {
						MessageUtils.showSuccessMessageIfRequired(oTemplateUtils.oCommonUtils.getText("OBJECT_CREATED"), oTemplateUtils.oServices);
					} else {
						MessageUtils.showSuccessMessageIfRequired(oTemplateUtils.oCommonUtils.getText("OBJECT_SAVED"), oTemplateUtils.oServices);
					}
					// it's not enough to set root to dirty: Scenario: subitem has been displayed (active document), then changed (draft) and shall be
					// displayed again after activation - now data has to be read again
					// therefore we set all pages to dirty, excluding the current one (here the active data is already returned by the function import)
					var oComponent = oController.getOwnerComponent();
					oTemplateUtils.oServices.oViewDependencyHelper.setAllPagesDirty([oComponent.getId()]);
					oTemplateUtils.oServices.oViewDependencyHelper.unbindChildren(oComponent);
					// Draft activation is a kind of cross navigation -> invalidate paginator info
					oTemplateUtils.oServices.oApplication.invalidatePaginatorInfo();
					var bNavToListOnSave = oComponent.getNavToListOnSave();
					oTemplateUtils.oServices.oApplication.navigateAfterActivation(!bNavToListOnSave && oResponse.context);
				}, Function.prototype);
				var oEvent = {
					activationPromise: oActivationPromise
				};
				oTemplateUtils.oComponentUtils.fire(oController, "AfterActivate", oEvent);
			}
			// Implementation of save for the non-draft case
			function onSaveImpl(bStayInEdit) {
				var oView = oController.getView();
				var oModel = oView.getModel();
				var isModelDirty = oModel.hasPendingChanges(true); // set to true, to check deferred requests as well.
				var oPendingChanges = oModel.getPendingChanges();
				var mPendingChangesToContextInfo = Object.create(null);
				if (oPendingChanges){
					for (var sProperty in oPendingChanges) {
						if (oPendingChanges.hasOwnProperty(sProperty)) {
							var oPendingContext = oModel.getContext("/" + sProperty); // Currently there's no other option than using the private ODataModel#getContext API according to BCP 1980351206
							mPendingChangesToContextInfo[sProperty] = {
								context: oPendingContext,
								change: oPendingChanges[sProperty]
							};
						}
					}
				}
				oTemplateUtils.oCommonEventHandlers.submitChangesForSmartMultiInput();
				var oSaveEntityPromise = oTemplateUtils.oServices.oCRUDManager.saveEntity();
				oSaveEntityPromise.then(function(oContext) {
					if (!bStayInEdit){
						var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
						oTemplatePrivateModel.setProperty("/objectPage/displayMode", 1);
						//	switch to display mode
						oViewProxy.setEditable(false);
					}
					performAfterSaveOperations(oContext, oView, isModelDirty, mPendingChangesToContextInfo, bStayInEdit);
				});
				var oEvent = {
					saveEntityPromise: oSaveEntityPromise
				};
				oTemplateUtils.oComponentUtils.fire(oController, "AfterSave", oEvent);
			}

			//common flow for Save and Save-continue Edit (Non draft)
			function performAfterSaveOperations(oContext, oView, bSomethingWasChanged, mPendingChangesToContextInfo, bStayInEdit) {
				var oUIModel = oObjectPage.getModel("ui");
				var bCreateMode = oUIModel.getProperty("/createMode");
				var oComponent = oController.getOwnerComponent();
				oTemplateUtils.oServices.oViewDependencyHelper.setParentToDirty(oComponent, oComponent.getEntitySet(), 1);
				oTemplateUtils.oServices.oViewDependencyHelper.unbindChildren(oComponent);
				var bNavToListOnSave = oComponent.getNavToListOnSave();
				var bStayOnPage = !bNavToListOnSave || bStayInEdit;

				if (bStayOnPage){
					if (bCreateMode){ // UI5 has adapted the binding context of the view, however, the url (and internal information) needs to be adapted
						oTemplateUtils.oComponentUtils.adaptUrlAfterNonDraftCreateSaved(oView.getBindingContext(), bStayInEdit);
					}
					fnSetFocusableElementOnObjectPage(oObjectPage);
				} else {
					oViewProxy.navigateUp();
				}
				var sSuccessMessageKey;
				if (bCreateMode){
					sSuccessMessageKey = "OBJECT_CREATED";
				} else {
					sSuccessMessageKey = bSomethingWasChanged ? "OBJECT_SAVED" : "OBJECT_NOT_MODIFIED";
				}
				MessageUtils.showSuccessMessageIfRequired(oTemplateUtils.oCommonUtils.getText(sSuccessMessageKey), oTemplateUtils.oServices);

				for (var sProperty in mPendingChangesToContextInfo) {
					var oInfo = mPendingChangesToContextInfo[sProperty];
					var oCurrentContext = oInfo.context;
					var oPendingChangesPerContext = oInfo.change;
					var aSourceProperties = Object.keys(oPendingChangesPerContext) || [];

					/*	The OData model returns also a __metadata object with the canonical URL and further
					 information. As we don't want to check if sideEffects are annotated for this
					 property we remove it from the pending changes
					 */
					var iMetaDataIndex = aSourceProperties.indexOf("__metadata");
					if (iMetaDataIndex > -1) {
						aSourceProperties.splice(iMetaDataIndex, 1);
					}
					oTemplateUtils.oServices.oApplicationController.executeSideEffects(oCurrentContext, aSourceProperties);
				}
			}

			function onSaveAndContinueEdit(oEvent) {
				var sButtonId = oEvent.getSource().getId();
				onSave("SaveAndContEdit", sButtonId);
			}

			// Save of draft and non-draft case. Forwards either to onActivateImpl (draft) or onSaveImpl (non-draft) or onSaveAndContinueEditImpl (non draft, save and continue edit)
			function onSave(sSaveCase, sBtnId){
				var fnStartSaveOperation = function(sSaveCase, sBtnId){
					var iScenario;
					var fnImpl;
					var sButtonId;
					if (oTemplateUtils.oComponentUtils.isDraftEnabled()){
						iScenario = 1;
						fnImpl = onActivateImpl;
						sButtonId = "activate";
					} else {
						iScenario = 3;
						if (sSaveCase === "SaveAndContEdit") {
							fnImpl = onSaveImpl.bind(null, true);
							sButtonId = sBtnId;
						} else {
							fnImpl = onSaveImpl.bind(null, false);
							sButtonId = "save";
						}
					}
					var oCRUDActionHandler = oTemplateUtils.oComponentUtils.getCRUDActionHandler();
					oTemplateUtils.oCommonUtils.executeIfControlReady(oCRUDActionHandler.handleCRUDScenario.bind(null, iScenario, fnImpl), sButtonId);
				};
				var oBeforeSavePromise = Promise.resolve(oController.beforeSaveExtension());
				oBeforeSavePromise.then(fnStartSaveOperation.bind(null, sSaveCase, sBtnId), jQuery.noop());
			}

			function fnAdaptBindingParamsForInlineCreate(oEvent) {
				if (fnIsSmartTableWithInlineCreate(oEvent.getSource())) {
					var oBindingParams = oEvent.getParameter("bindingParams");
					if (oBindingParams.filters && oBindingParams.filters.length) {
						/*
						 * Add a new filter condition to always show all items that are just created. In case we are in a draft,
						 * that just means to add "or HasActiveEntity = false". For active documents however, that condition
						 * would always be true. Thus, we have to add
						 * "or (HasActiveEntity = false and IsActiveEntity = false)".
						 * However, this condition is not evaluated correctly by gateway, so we have to transform it to
						 * (IsActvieEntity = true and x) or (Is ActvieEntity = false and (x or HasActvieEntity = false)),
						 * where x is the condition provided by the user
						 */
						var oUserFilter = FilterProcessor.groupFilters(oBindingParams.filters);
						if (!oEvent.getParameter("messageFilterActive")) {
							oBindingParams.filters = new Filter({
								filters: [
									new Filter({
										filters: [
											new Filter({
												path: "IsActiveEntity",
												operator: "EQ",
												value1: true
											}), oUserFilter
										],
										and: true
									}),
									new Filter({
										filters: [
											new Filter({
												path: "IsActiveEntity",
												operator: "EQ",
												value1: false
											}), new Filter({
												filters: [
													oUserFilter, new Filter({
														path: "HasActiveEntity",
														operator: "EQ",
														value1: false
													})
												],
												and: false
											})
										],
										and: true
									})
								],
								and: false
							});
						} else {
							oBindingParams.filters = oUserFilter;
						}
					}
					var fnGroup = oBindingParams.sorter[0] && oBindingParams.sorter[0].getGroupFunction();
					var fnGroupExtended = fnGroup && function(oContext) {
						var oObject = oContext.getObject();
						if (oObject.IsActiveEntity || oObject.HasActiveEntity) {
							var oRet = extend({}, fnGroup(oContext));
							oRet.key = oRet.key.charAt(0) === "§" ? "§" + oRet.key : oRet.key;
							return oRet;
						}
						return {
							key: "§",
							text: oTemplateUtils.oCommonUtils.getText("NEW_ENTRY_GROUP")
						};
					};
					//read the custom data of the smart table set by manifest flag "disableDefaultInlineCreateSort"
					if (oEvent.getSource().data("disableInlineCreateSort") === "false") {
						oBindingParams.sorter.unshift(new Sorter("HasActiveEntity", false, fnGroupExtended));
					}
				}
			}

			function getObjectHeader() {
				return oObjectPage.getHeaderTitle();
			}

			function onShareObjectPageActionButtonPressImpl(oButton) {
				var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
				var oFragmentController = {
					shareEmailPressed: function() {
						var sEmailSubject = oTemplatePrivateModel.getProperty("/objectPage/headerInfo/objectTitle");
						var sObjectSubtitle = oTemplatePrivateModel.getProperty("/objectPage/headerInfo/objectSubtitle");
						if (sObjectSubtitle) {
							sEmailSubject = sEmailSubject + " - " + sObjectSubtitle;
						}
						var emailBody = document.URL.replace(/\(/g, '%28').replace(/\)/g, '%29');//on 2nd Object Page the last closing Parenthesis was not being included in the link
						sap.m.URLHelper.triggerEmail(null, sEmailSubject, emailBody);
					},

					shareJamPressed: function() {
						ShareUtils.openJamShareDialog(oTemplatePrivateModel.getProperty("/objectPage/headerInfo/objectTitle") + " " + oTemplatePrivateModel.getProperty("/objectPage/headerInfo/objectSubtitle"));
					},

					getModelData: function() {
						return {
							serviceUrl: "",
							title: oTemplatePrivateModel.getProperty("/objectPage/headerInfo/objectTitle"),
							subtitle: oTemplatePrivateModel.getProperty("/objectPage/headerInfo/objectSubtitle"),
							customUrl: ShareUtils.getCustomUrl()
						};
					}
				};

				ShareUtils.openSharePopup(oTemplateUtils.oCommonUtils, oButton, oFragmentController);
			}

			function getRelatedAppsSheet() {
				return oTemplateUtils.oCommonUtils.getDialogFragmentAsync(
					"sap.suite.ui.generic.template.ObjectPage.view.fragments.RelatedAppsSheet", {
						buttonPressed: function(oEvent) {
							var oButton = oEvent.getSource();
							var oButtonsContext = oButton.getBindingContext("buttons");
							var oLink = oButtonsContext.getProperty("link");
							var oParam = oButtonsContext.getProperty("param");
							var str = oLink.intent;
							var sSemanticObject = str.split("#")[1].split("-")[0];
							var sAction = str.split("-")[1].split("?")[0].split("~")[0];
							var oTarget = {
								semanticObject: sSemanticObject,
								action: sAction,
								parameters: oParam
							};
							oTemplateUtils.oServices.oDataLossHandler.performIfNoDataLoss(function () {
								var oContext = oController.getView().getBindingContext();
								oTemplateUtils.oCommonEventHandlers.onRelatedAppNavigation(oTarget, oContext);
							}, Function.prototype);
						}
					}, "buttons");
			}

			var fnDeleteConfirmationOnDelete;

			function getObjectPageDeleteDialog() {
				fnDeleteConfirmationOnDelete = function(oEvent) {
					var oDialog = oEvent.getSource().getParent();
					var oBusyHelper = oTemplateUtils.oServices.oApplication.getBusyHelper();
					if (oBusyHelper.isBusy()) {
						return;
					}
					var oComponent = oController.getOwnerComponent();
					var oTemplPrivGlobal = oComponent.getModel("_templPrivGlobal");
					var oObjPage = { objectPage: { currentEntitySet: oComponent.getProperty("entitySet") } };
					oTemplPrivGlobal.setProperty("/generic/multipleViews", oObjPage);
					var oDeleteEntityPromise = oTemplateUtils.oServices.oCRUDManager.deleteEntity();
					var sPath = oComponent.getBindingContext().getPath();
					var mObjectsToDelete = Object.create(null);
					mObjectsToDelete[sPath] = oDeleteEntityPromise;

					var oDeleteEvent = {
						deleteEntityPromise: oDeleteEntityPromise
					};
					oTemplateUtils.oComponentUtils.fire(oController, "AfterDelete", oDeleteEvent);
					oDialog.close();
				};

				return oTemplateUtils.oCommonUtils.getDialogFragmentAsync("sap.suite.ui.generic.template.ObjectPage.view.fragments.TableDeleteConfirmation", {
					onCancel: function(oEvent) {
						var oDialog = oEvent.getSource().getParent();
						oDialog.close();
					},
					// to be called within a function to asure that fnDeleteConfirmationOnDelete contains correct coding (see below function getTableDeleteDialog)
					onDelete: function(oEvent) {
						fnDeleteConfirmationOnDelete(oEvent);
					}
				}, "delete", Function.prototype, true);
			}


			function onDeleteImpl() {
				var isSubObjectPage;
				var oBusyHelper = oTemplateUtils.oServices.oApplication.getBusyHelper();
				if (oBusyHelper.isBusy()) {
					return;
				}
				var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
				var sObjectTitle = (oTemplatePrivateModel.getProperty("/objectPage/headerInfo/objectTitle") || "").trim();
				var sObjectSubtitle = oTemplatePrivateModel.getProperty("/objectPage/headerInfo/objectSubtitle");
				var iViewLevel = oTemplateUtils.oComponentUtils.getViewLevel();
				var isSubObjectPage = iViewLevel > 1;

				var oDialogParameter = {};
				oDialogParameter.title = oTemplateUtils.oCommonUtils.getText("ST_GENERIC_DELETE_TITLE");
				oDialogParameter.text = oTemplateUtils.oCommonEventHandlers.getDeleteText(sObjectTitle, sObjectSubtitle, !isSubObjectPage, isSubObjectPage);

				// ensure to have a Promise (even if extension returns sth. different)
				var oBeforeDeleteExtensionPromise = Promise.resolve(oController.beforeDeleteExtension());
				oBeforeDeleteExtensionPromise.then(function(oExtensionResult) {
					extend(oDialogParameter, oExtensionResult);

					// get Delete Confirmation Popup fragment
					getObjectPageDeleteDialog().then(function (oDialog) {
						var oDeleteDialogModel = oDialog.getModel("delete");
						oDeleteDialogModel.setData(oDialogParameter);
						oDialog.open();
					});
				},
				/*
				 * In case the Promise returned from extension is rejected, don't show a popup and don't execute
				 * deletion. If extension needs an asynchronous step (e.g. backend request) to determine special text
				 * that could fail, it should use securedExecution. Then error messages from backend are shown by
				 * busyHelper automatically.
				 */
				Function.prototype);
			}

			// BEGIN - Functions related to the copy-paste from Excel

			function fnOnBeforeSmartTablePaste(oEvent) {
				var aColumnData = oEvent.getParameter("columnInfos");
				//Remove the ignored fields(not visible in the table and actions) from the column data
				var index = aColumnData && aColumnData.length - 1;

				while (index >= 0) {
					if (aColumnData[index].ignore) {
						aColumnData.splice(index, 1);
					}
					index -= 1;
				}
				//Using seperate loops to work on the array without ignored fields.
				var aUnsupportedColumns = aColumnData.reduce(function(aColumns, oColumn) {
					// Data formats for which paste is not yet supported.
					if (!oColumn.type && !oColumn.customParseFunction) {
						aColumns.push(oColumn);
					}
					return aColumns;
				}, []);

				if (aUnsupportedColumns.length > 0) {
					//Appropriate messages for columns with unsupported data formats.
					var sUnsupportedFormatError = oTemplateUtils.oCommonUtils.getText("DATA_PASTE_UNSUPPORTED_FORMAT_MESSAGE");
					MessageBox.show(sUnsupportedFormatError, {
						icon: MessageBox.Icon.ERROR,
						title: oTemplateUtils.oCommonUtils.getText("ST_ERROR"),
						actions: [sap.m.MessageBox.Action.CLOSE]
					});
				}
			}

			function fnOnSmartTablePaste(oEvent) {
				var aParsedData;
				var oSmartTable = oEvent.getSource();
				var sSmartTableId = oSmartTable.getId();
				var sAddEntryId = sSmartTableId.split("::Table")[0] + "::addEntry";
				var oAddEntry = oController.byId(sAddEntryId); //Instance of the Create button
				if (!oAddEntry) {
					//Do not allow paste if the table doesn't allow new records to be added (non-draft apps)
					return;
				}
				var oResult = oEvent.getParameter("result");
				if (oResult) {
					if (oResult.errors) {
						var aErrorMessages = oResult.errors.map(function(oElement) {
							return oElement.message;
						});
						var sPasteError = oTemplateUtils.oCommonUtils.getText("DATA_PASTE_ERROR_MESSAGE", [aErrorMessages.length]);
						var sErrorCorrection = oTemplateUtils.oCommonUtils.getText("DATA_PASTE_ERROR_CORRECTION_MESSAGE");
						var sNote = oTemplateUtils.oCommonUtils.getText("DATA_PASTE_ERROR_CORRECTION_NOTE");
						//Push correction  message and note message to the aErrorMessages
						aErrorMessages.unshift("");//To show space b/w the short text and detail text
						aErrorMessages.unshift(sNote);
						aErrorMessages.unshift(sErrorCorrection);
						MessageBox.show(sPasteError, {
							icon: MessageBox.Icon.ERROR,
							title: oTemplateUtils.oCommonUtils.getText("ST_ERROR"),
							actions: [sap.m.MessageBox.Action.CLOSE],
							details: aErrorMessages.join("<br>")
						});
					} else if (oResult.parsedData) {
						aParsedData = oResult.parsedData;
						if (aParsedData && aParsedData.length) {
							var iParsedDataLength = aParsedData.length;
							var bIgnoreTableRefresh;
							var oAddEntryPromise, aAddEntryPromises = [];
							var DraftSavedState = sap.m.DraftIndicatorState.Saved; //Indicator for the footer

							for (var i = 0; i < iParsedDataLength; i++) {
								bIgnoreTableRefresh = i < iParsedDataLength - 1; //Flag to overcome multiple table refreshs when records are pasted.
								oAddEntryPromise = oTemplateUtils.oCommonEventHandlers.addEntry(oAddEntry, true, undefined, aParsedData[i], bIgnoreTableRefresh);
								aAddEntryPromises.push(oAddEntryPromise);
							}

							Promise.all(aAddEntryPromises).then(function() {
								//After the records are added, show a draft saved indicator on the footer
								var oOwnerComponent = oController.getOwnerComponent();
								var oAppComponent = oOwnerComponent.getAppComponent();
								var oTemplatePrivateGlobal = oAppComponent.getModel("_templPrivGlobal");
								oTemplatePrivateGlobal.setProperty("/generic/draftIndicatorState", DraftSavedState);
							});
						}
					}
				}
			}

			/*
				Function to detach the paste handlers once the user is out of edit mode.
				We do not want to initialize the paste functionality when the object page is in display mode.
			*/
			function fnDetachPasteHandlers() {
				//To-DO: Evaluate if there's a better way of doing this. Refactor if required.
				var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
				var aPasteAttachedTables = oTemplatePrivateModel.getProperty("/objectPage/aPasteAttachedTables");
				var index = aPasteAttachedTables.length;
				var sFacet;
				var oControl;
				while (index >= 0) {
					sFacet = aPasteAttachedTables[index];
					oControl = oController.byId(sFacet + "::Table");
					if (oControl && oControl.isA("sap.ui.comp.smarttable.SmartTable") && oControl.hasListeners("paste")) {
						oControl.detachBeforePaste(fnOnBeforeSmartTablePaste);
						oControl.detachPaste(fnOnSmartTablePaste);
						aPasteAttachedTables.splice(index, 1);
					}
					index -= 1;
				}
			}

			// END - Functions related to the copy-paste from Excel

			function onDelete(oEvent) {
				oTemplateUtils.oCommonUtils.executeIfControlReady(onDeleteImpl,"delete");
			}

			// This method is called when editing of an entity has started and the corresponding context is available
			// oResult is the target context for navigation in edit state.
			// bContinueEditing is to navigate to the context directly.
			//  - bContinueEditing faulty: User has pressed the 'Edit' button (draft and non-draft scenario)
			//  - bContinueEditing truthy: User has pressed the 'Continue Editing' button (only draft scenario)
			function fnStartEditing(oResult, bContinueEditing) {
				var oDraft, oContext;
				if (oResult) {
					oContext = oResult.context || oResult;
					if (oTemplateUtils.oServices.oDraftController.getDraftContext().hasDraft(oContext)) {
						oTemplateUtils.oServices.oViewDependencyHelper.setRootPageToDirty();
						oDraft = oContext.context || oContext;
					}
				}
				if (oDraft) {
					// navigate to draft
					// is a kind of cross navigation -> invalidate paginator info
					oTemplateUtils.oServices.oApplication.invalidatePaginatorInfo();
					oTemplateUtils.oServices.oApplication.switchToDraft(oDraft);
				} else {
					var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
					oTemplatePrivateModel.setProperty("/objectPage/displayMode", 2);
					fnSetFocusableElementOnObjectPage(oObjectPage);
				}
				//set Editable independent of the fact that the instance is a draft or not
				oViewProxy.setEditable(true);
			}

			var fnExpiredLockDialog;  // declare function already here, to avoid usage before declaration
			// This method is called when the user decides to edit an entity.
			// Parameter bUnconditional contains the information, whether the user has already confirmed to discard unsaved changes of another user(discard other user's draft), or whether this is still open
			function fnEditEntity(bUnconditional) {
				// For all other values apart from boolean we consider it to be false.
				bUnconditional = !!bUnconditional && typeof bUnconditional === "boolean";
				oTemplateUtils.oServices.oCRUDManager.editEntity(bUnconditional).then(function(oEditInfo) {
					if (oEditInfo.draftAdministrativeData) {
						fnExpiredLockDialog(oEditInfo.draftAdministrativeData.CreatedByUserDescription || oEditInfo.draftAdministrativeData.CreatedByUser);
					} else {
						fnStartEditing(oEditInfo.context, false);
					}
				});
			}

			// This method is called when the user wants to edit an entity, for which a non-locking draft of another user exists.
			// The method asks the user, whether he wants to continue editing anyway. If this is the case editing is triggered.
			// sCreatedByUser is the name of the user possessing the non-locking draft
			fnExpiredLockDialog = function(sCreatedByUser) {
				var oUnsavedChangesDialog;
				oTemplateUtils.oCommonUtils.getDialogFragmentAsync(
					"sap.suite.ui.generic.template.ObjectPage.view.fragments.UnsavedChangesDialog", {
						onEdit: function() {
							oUnsavedChangesDialog.close();
							fnEditEntity(true);
						},
						onCancel: function() {
							oUnsavedChangesDialog.close();
						}
					}, "Dialog").then(function (oFragment) {
						oUnsavedChangesDialog = oFragment;
						var oDialogModel = oUnsavedChangesDialog.getModel("Dialog");
						var sDialogContentText = oTemplateUtils.oCommonUtils.getText("DRAFT_LOCK_EXPIRED", [sCreatedByUser]);
						oDialogModel.setProperty("/unsavedChangesQuestion", sDialogContentText);
						oUnsavedChangesDialog.open();
					});
			};

			function getSelectionVariant() {
				// oTemplateUtils, oController
				// if there is no selection we pass an empty one with the important escaping of ", passing "" or
				// null...was not possible
				// "{\"SelectionVariantID\":\"\"}";
				var sResult = "{\"SelectionVariantID\":\"\"}";

				/*
				 * rules don't follow 1:1 association, only header entity type fields don't send fields with empty
				 * values also send not visible fields remove Ux fields (e.g. UxFcBankStatementDate) send all kinds of
				 * types String, Boolean, ... but stringify all types
				 */

				var oComponent = oController.getOwnerComponent();
				var sEntitySet = oComponent.getEntitySet();
				var model = oComponent.getModel();
				var oMetaModel = model.getMetaModel();
				var oEntitySet = oMetaModel.getODataEntitySet(sEntitySet);
				var oEntityType = oMetaModel.getODataEntityType(oEntitySet.entityType);
				var aAllFieldsMetaModel = oEntityType.property;

				//collect the names of attributes to be deleted
				//objects with existing sap:field-control -> mapped to com.sap.vocabularies.Common.v1.FieldControl attribute
				//e.g. ProductForEdit_fc field control fields shouldn't be transferred
				var aFieldsToBeIgnored = [];
				for (var x in aAllFieldsMetaModel) {
					var controlname = aAllFieldsMetaModel[x]["com.sap.vocabularies.Common.v1.FieldControl"] &&
						aAllFieldsMetaModel[x]["com.sap.vocabularies.Common.v1.FieldControl"].Path;
					if (controlname && aFieldsToBeIgnored.indexOf(controlname) < 0) {
						aFieldsToBeIgnored.push(controlname);
					}
				}

				var context = oController.getView().getBindingContext();
				var object = context.getObject();

				var oSelectionVariant = new SelectionVariant();
				for (var i in aAllFieldsMetaModel) {
					var type = aAllFieldsMetaModel[i].type;
					var name = aAllFieldsMetaModel[i].name;
					var value = object[aAllFieldsMetaModel[i].name];

					if (aFieldsToBeIgnored.indexOf(name) > -1) {
						continue;
					}

					if (name && (value || type === "Edm.Boolean")) { // also if boolean is false this must be sent
						if (type === "Edm.Time" && value.ms !== undefined) { // in case of Time an object is returned
							value = value.ms;
						}
						if (typeof value !== "string") {
							try {
								value = value.toString();
							} catch (e) {
								value = value + "";
							}
						}
						oSelectionVariant.addParameter(name, value);
					}
				}

				sResult = oSelectionVariant.toJSONString();
				return sResult;
			}

			function fnIsEntryDeletable(oContext, oSmartTable) {
				var bDeletable = true;
				var oModel = oSmartTable.getModel();
				//Since the introduction of the property "placeToolbarinTable", the hierarchy of toolbar is changed. To adjust this property the below condition is added
				oSmartTable = oSmartTable instanceof ResponsiveTable ? oSmartTable.getParent() : oSmartTable;
				var oDeleteRestrictions = oTemplateUtils.oCommonUtils.getDeleteRestrictions(oSmartTable);
				var sDeletablePath = oDeleteRestrictions && oDeleteRestrictions.Deletable && oDeleteRestrictions.Deletable.Path;
				if (sDeletablePath) {
					bDeletable = oModel.getProperty(sDeletablePath, oContext);
				}
				return bDeletable;
			}

			var fnTableDeleteConfirmationOnDelete;
			/**
			 * Return an instance of the DeleteConfirmation fragment
			 *
			 * @param {sap.ui.comp.smarttable.SmartTable} oSmartTable - smart table object
			 * @param {array} aContexts - array of selected items in the table
			 * @param {string} sUiElementId - id of table
			 * @returns {sap.m.Dialog} The Delete Confirmation Dialog
			 * @private
			 */
			function getTableDeleteDialog(oSmartTable, aContexts, sUiElementId) {
				var aPath = [];
				fnTableDeleteConfirmationOnDelete = function(oEvent) {
					var oBusyHelper = oTemplateUtils.oServices.oApplication.getBusyHelper();
					var oDialog = oEvent.getSource().getParent();
					aPath = [];
					var iSuccessfullyDeletedCount;
					var iFailedToDeleteCount;
					var oEntity = oController.getView().getModel().getObject(aContexts[0].getPath());
					for (var i = 0; i < aContexts.length; i++) {
						// check if item is deletable
						if (fnIsEntryDeletable(aContexts[i], oSmartTable)) {
							aPath.push(aContexts[i].getPath());
						}
					}
					var oDeletePromise = oTemplateUtils.oServices.oCRUDManager.deleteEntities({ pathes: aPath });
					oBusyHelper.setBusy(oDeletePromise);
					oTemplateUtils.oServices.oApplicationController.executeSideEffects(oSmartTable.getBindingContext(), [], [oSmartTable.getTableBindingPath()]);
					oDeletePromise.then(function(aFailedPath) {
						oTemplateUtils.oCommonUtils.refreshSmartTable(oSmartTable);
						if (oEntity.IsActiveEntity === false) {
							iFailedToDeleteCount = 0;
						} else {
							iFailedToDeleteCount = aFailedPath.length;
						}
						iSuccessfullyDeletedCount = aPath.length - iFailedToDeleteCount;
						var sMessage = "";
						if (iSuccessfullyDeletedCount > 0) {
							if (oTemplateUtils.oCommonUtils.isUiTable(oSmartTable.getTable())) {
								//The UI table uses indices for selection.
								//When an index is removed(record deletion), another row gets the selected index and stays selected.
								//Since the selection is not affected when an item is removed from the binding, the selection has to be cleared explicitly.
								var oSelectionPlugin = oSmartTable.getTable().getPlugin("sap.ui.table.plugins.SelectionPlugin");
								if (oSelectionPlugin){
									oSelectionPlugin.clearSelection();
								}
							}
							//CASE: Records have been deleted successfully
							if (iSuccessfullyDeletedCount > 1) {
								//CASE: Multiple records successfully deleted
								sMessage = oTemplateUtils.oCommonUtils.getContextText("DELETE_SUCCESS_PLURAL_WITH_COUNT", oSmartTable.getId(), null, [iSuccessfullyDeletedCount]);
							} else {
								if (iFailedToDeleteCount > 0) {
									//CASE: One record successfully deleted with some records failed to delete
									sMessage = oTemplateUtils.oCommonUtils.getContextText("DELETE_SUCCESS_WITH_COUNT", oSmartTable.getId(), null, [iSuccessfullyDeletedCount]);
								} else {
									//CASE: Only one record was selected for delete & operation completed successfully
									sMessage = oTemplateUtils.oCommonUtils.getContextText("ITEM_DELETED", oSmartTable.getId());
								}
							}
						}

						if (iFailedToDeleteCount > 0) {
							if (iFailedToDeleteCount > 1) {
								//CASE: Failed to delete multiple records
								sMessage += sMessage && sMessage + "\n";
								sMessage += oTemplateUtils.oCommonUtils.getContextText("DELETE_ERROR_PLURAL_WITH_COUNT", oSmartTable.getId(), null,  [iFailedToDeleteCount]);
							} else {
								if (iSuccessfullyDeletedCount > 0) {
									//CASE: There is record failed for delete but some records got deleted succefully
									sMessage += "\n";
									sMessage += oTemplateUtils.oCommonUtils.getContextText("DELETE_ERROR_WITH_COUNT", oSmartTable.getId(), null, [iFailedToDeleteCount]);
								} else {
									//CASE: Only one record was selected for delete & operation failed to execute
									sMessage += oTemplateUtils.oCommonUtils.getContextText("DELETE_ERROR", oSmartTable.getId());
								}
							}
						}

						if (sMessage) {
							if (iFailedToDeleteCount > 0) {
								//CASE: Error messages are show more prominent
								MessageBox.error(sMessage);
							} else {
								//CASE: Only success message and shown as a Message Toast
								MessageUtils.showSuccessMessageIfRequired(sMessage, oTemplateUtils.oServices);
							}
						}
					});

					// This object will be consumed by Application Developer via attachAfterLineItemDelete extension API
					var oAfterLineItemDeleteProperties = {
						deleteEntitiesPromise: oDeletePromise,
						sUiElementId: sUiElementId,
						aContexts: aContexts
					};
					oTemplateUtils.oComponentUtils.fire(oController, "AfterLineItemDelete", oAfterLineItemDeleteProperties);
					oDialog.close();
				};

				return oTemplateUtils.oCommonUtils.getDialogFragmentAsync("sap.suite.ui.generic.template.ObjectPage.view.fragments.TableDeleteConfirmation", {
					onCancel: function(oEvent) {
						var oDialog = oEvent.getSource().getParent();
						oDialog.close();
					},
					// to be called within a function to asure that fnTableDeleteConfirmationOnDelete contains correct coding (see above function getObjectPageDeleteDialog)
					onDelete: function(oEvent) {
						fnTableDeleteConfirmationOnDelete(oEvent);
					}
				}, "delete", Function.prototype, true);
			}

			function fnDeleteEntries(oButton) {
				var oSmartTable = oTemplateUtils.oCommonUtils.getOwnerControl(oButton); //returns a sap.m.table
				if (!oTemplateUtils.oCommonUtils.isSmartTable(oSmartTable)) {
					oSmartTable = oSmartTable.getParent();
				}
				var aContexts = oTemplateUtils.oCommonUtils.getSelectedContexts(oSmartTable);
				var sUiElementId = oButton.getParent().getParent().getId();
				fnDeleteEntriesImpl(oSmartTable, aContexts, sUiElementId);
			}

			function fnDeleteEntriesImpl(oSmartTable, aContexts, sUiElementId) {
				if (aContexts.length === 0) {
					MessageBox.error(oTemplateUtils.oCommonUtils.getText("ST_GENERIC_NO_ITEM_SELECTED"), {
						styleClass: oTemplateUtils.oCommonUtils.getContentDensityClass()
					});
					return;
				}

				var aPath = [];
				var sTableMode;
				var aNonDeletableContext = [];
				if ("getMode" in oSmartTable.getTable()) {
					sTableMode = oSmartTable.getTable().getMode();
				}
				for (var i = 0; i < aContexts.length; i++) {
					// check if item is deletable
					if (fnIsEntryDeletable(aContexts[i], oSmartTable)) {
						aPath.push(aContexts[i].getPath());
					} else {
						aNonDeletableContext.push(aContexts[i]);
					}
				}

				var oDialogParameter = {};
				oDialogParameter.undeletableCount = 0;
				oDialogParameter.tableMode = sTableMode;
				if (aContexts.length > 1) {
					oDialogParameter.title = oTemplateUtils.oCommonUtils.getText("ST_GENERIC_DELETE_TITLE_WITH_COUNT", [aContexts.length]);
					oDialogParameter.text = oTemplateUtils.oCommonUtils.getContextText("DELETE_SELECTED_ITEMS", oSmartTable.getId());

				} else {
					oDialogParameter.title = oTemplateUtils.oCommonUtils.getText("ST_GENERIC_DELETE_TITLE");
					oDialogParameter.text = oTemplateUtils.oCommonEventHandlers.getSelectedItemContextForDeleteMessage(oSmartTable, aContexts[0], true);
				}

				if (aNonDeletableContext.length > 0 ) {
					oDialogParameter.undeletableText = oTemplateUtils.oCommonUtils.getContextText("DELETE_UNDELETABLE_ITEMS", oSmartTable.getId(), null,
						[aNonDeletableContext.length, aContexts.length]);
					if (sTableMode === 'Delete') {
						oDialogParameter.undeletableCount = aNonDeletableContext.length;
						oDialogParameter.undeletableText = undefined;
						oDialogParameter.text = oTemplateUtils.oCommonUtils.getText("DELETE_UNDELETABLE_ITEM");
					}
				}

				var oBeforeLineItemDeleteProperties = {
						sUiElementId: sUiElementId,
						aContexts: aContexts
				};
				// ensure to have a Promise (even if extension returns sth. different)
				var oBeforeLineItemDeleteExtensionPromise = Promise.resolve(oController.beforeLineItemDeleteExtension(oBeforeLineItemDeleteProperties));
				oBeforeLineItemDeleteExtensionPromise.then(function(oExtensionResult) {
					extend(oDialogParameter, oExtensionResult);
					// get Delete Confirmation Popup fragment
					getTableDeleteDialog(oSmartTable, aContexts, sUiElementId).then(function (oDialog) {
						if (!aNonDeletableContext.length) {
							oDialogParameter.undeletableText = undefined;
						}
						var oDeleteDialogModel = oDialog.getModel("delete");
						oDeleteDialogModel.setData(oDialogParameter);
						oDialog.open();
					});
				},
				/*
				 * In case the Promise returned from extension is rejected, don't show a popup and don't execute
				 * deletion. If extension needs an asynchronous step (e.g. backend request) to determine special text
				 * that could fail, it should use securedExecution. Then error messages from backend are shown by
				 * busyHelper automatically.
				 */
				Function.prototype);
			}

			function getImageDialog() {
				var oImageDialog = oController.byId("imageDialog");
				var oImageDialogPromise = oImageDialog ? Promise.resolve(oImageDialog) : oTemplateUtils.oCommonUtils.getDialogFragmentAsync(
					"sap.suite.ui.generic.template.ObjectPage.view.fragments.ImageDialog", {
						onImageDialogClose: function() {
							oImageDialog.close();
						}
					}, "headerImage");
				oImageDialogPromise.then(function (oDialog) {
					oImageDialog = oDialog;
				});
				return oImageDialogPromise;
			}

			function fnAttachDynamicHeaderStateChangeHandler() {
				var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
				oTemplatePrivateModel.setProperty("/objectPage/isHeaderExpanded", true);

				var oObjectPageDynamicHeaderTitle = oController.getView().byId("template::ObjectPage::ObjectPageHeader");
				oObjectPageDynamicHeaderTitle.attachStateChange(function(oEvent) {
					var bExpanded = oEvent.getParameter("isExpanded");
					oTemplatePrivateModel.setProperty("/objectPage/isHeaderExpanded", bExpanded);
				});
			}

			// This function will be called in onInit. It ensures that the /objectPage/headerInfo/ segment of the template private model will be updated.
			// Note that this segment was added in onInit defined in ComponentBase in sap.suite.ui.generic.template.detailTemplates.detailUtils.
			// according to the content of the corresponding customData.
			// Note that there is a special logic which ensures a fallback title which is derived from i18n-properties will	be used in createMode when no title can be derived from the OData model.
			// This fallback does not apply, when the title is a constant anyway.
			function fnEnsureTitleTransfer() {
				var sDefaultObjectTitleForCreated; // initialized on demand
				var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
				var fnCreateChangeHandlerForTitle = function(sKey) { // This function produces the change handler which will be added to the binding of the customData for key sKey.
					return function(oEvent) { // the change handler which will be applied to the property binding
						var oBinding = oEvent.getSource();
						var sValue = oBinding.getExternalValue();
						oTemplatePrivateModel.setProperty("/objectPage/headerInfo/" + sKey, sValue);
						if (sKey === "objectTitle"){
							oTemplateUtils.oComponentUtils.setText(sValue);
							if (!sValue){ // If no value for the title can be derived from the binding we have to check whether we are in create mode
								var oHeaderDataAvailablePromise = oTemplateUtils.oComponentUtils.getHeaderDataAvailablePromise();
								oHeaderDataAvailablePromise.then(function(oContext) { // evaluation must be postponed, until property createMode in the ui model has been set accordingly
									sValue = oBinding.getExternalValue();
									if (sValue) {
										return; // If meanwhile a value has been determined, ignore this asynchronous call
									}
									var oView = oController.getView();
									var oObject = oContext.getObject();
									var oUiModel = oView.getModel("ui");
									var bCreateMode = oUiModel.getProperty("/createMode");
									if (bCreateMode && oObject && (oObject.IsActiveEntity === undefined || oObject.IsActiveEntity === false || oObject.HasActiveEntity === false)) {
										sDefaultObjectTitleForCreated = sDefaultObjectTitleForCreated || oTemplateUtils.oCommonUtils.getText("NEW_OBJECT");
										oTemplatePrivateModel.setProperty("/objectPage/headerInfo/objectTitle", sDefaultObjectTitleForCreated);
										oTemplateUtils.oComponentUtils.setText(sDefaultObjectTitleForCreated);
									}
								});
							}
						}
					};
				};
				// Loop over customData and attach changeHandler (if necesary)
				oObjectPage.getCustomData().forEach(function(oCustomDataElement) {
					var sKey = oCustomDataElement.getKey();
					if (sKey === "objectTitle" || sKey === "objectSubtitle") { // check for the two properties handled in the headerInfo segment
						var oBinding = oCustomDataElement.getBinding("value");
						// UI5 does not gurantee the binding to be already available at this point in time.
						// If the binding is not available, we access the binding info as a fallback
						var oBindingInfo = !oBinding && oCustomDataElement.getBindingInfo("value");
						if (!oBinding && !oBindingInfo) { // constant -> No change handler needed, but the value must be transfered to the template private model once
							oTemplatePrivateModel.setProperty("/objectPage/headerInfo/" + sKey, oCustomDataElement.getValue());
							return; // done
						}
						var fnChangeHandler = fnCreateChangeHandlerForTitle(sKey); // Now we have the change handler
						// Moreover, the internal type of the binding must be changed from "any" (default for the value-property of the CustomData) to "string"
						if (oBinding) { // If the binding is already available we attach the change handler to the binding
							oBinding.attachChange(fnChangeHandler);
							fnSetPropertyBindingInternalType(oBinding, "string");
						} else { // otherwise the binding info will be enhanced accordingly -> binding will already be created with the corresponding change-handler
							oBindingInfo.events = {
								change: fnChangeHandler
							};
							for (var i = 0; i < oBindingInfo.parts.length; i++) {
								oBindingInfo.parts[i].targetType = "string";
							}
						}
					}
				});
			}

			function onBreadCrumbUrlPressed(oEvent) {
				oEvent.preventDefault();
				var oInfoObject = oTemplateUtils.oCommonUtils.getControlInformation(oEvent, null, true);
				if (oInfoObject){ // link not ready
					oTemplateUtils.oServices.oDataLossHandler.performIfNoDataLoss(oInfoObject.navigate, Function.prototype);
				}
			}
			function isPositionable(aControlIds) {
				return !!(aControlIds && oTemplateUtils.oCommonUtils.getPositionableControlId(aControlIds));
			}

			// Function to get group title of a message. Messages are grouped based on section names, means it will return the section name,
			// to which a message belongs to. If a messages does not belong to any of section a default group name is returned
			function getGroupTitle(aControlIds) {
				var sGenericMessageGroupTitle = "";
				for (var i = 0; i < aControlIds.length; i++) {
					if (isPositionable([aControlIds[i]])) {
						var oControl = Element.registry.get(aControlIds[i]);
						return getSectionNameRecursively(oControl);
					}
				}
				//default group name
				if (oController && oController.getOwnerComponent() && oController.getOwnerComponent().getModel("i18n")) {
					sGenericMessageGroupTitle = oController.getOwnerComponent().getModel("i18n").getResourceBundle().getText("GENERIC_MESSAGE_GROUP_NAME");
				}
				return sGenericMessageGroupTitle;
			}
			function getSectionNameRecursively(oControl) {
				if (!oControl) {
					return "";
				}
				if (oControl instanceof sap.uxap.ObjectPageSection) {
					return oControl.getTitle();
				} else {
					return getSectionNameRecursively(oControl.getParent());
				}
			}
			// Returns rank of any particular section, lower number(rank) means it will come first in messagePopover
			function getSectionRank(sectionTitle){
				var aSections = oObjectPage.getSections();
				for (var i = 0; i < aSections.length; i++) {
					if (aSections[i].getTitle() === sectionTitle) {
						return i + 1;
					}
				}
				//if section tilte is Other messages, we return a high number(rank), which ensures
				//that messages belonging to this section always come later in messagePopover
				return 9999999;
			}
			var oMessageSorter = new sap.ui.model.Sorter("msg>");

			// This function returns bias value based on the type of message
			function getBiasForMessageType(sMessageType){
				switch (sMessageType) {
					case MessageType.Error: return 1;
					case MessageType.Warning: return 2;
					case MessageType.Success: return 3;
					case MessageType.Information: return 4;
					case MessageType.None: return 5;
					default: return 6;
				}
			}
			// Sorting is done based on the loaction of control, like in which section control is present
			oMessageSorter.fnCompare = function (msgObj1, msgObj2) {
				// The SECTION_WEIGHT is added along with the bias for message type to sort messages according to their type in the same section
				// First the messages should be sort by their sections, this is taken care by SECTION_WEIGHT (along with section rank to provide different ranks)
				// Then messges in the same section is sorted by the message type, this is taken care by bias added for that message
				// Messges in the same section should come in order - Error, Warning, Success, Information
				var rankA = getSectionRank(getGroupTitle(msgObj1.controlIds)) * SECTION_WEIGHT + getBiasForMessageType(msgObj1.type);
				var rankB = getSectionRank(getGroupTitle(msgObj2.controlIds)) * SECTION_WEIGHT + getBiasForMessageType(msgObj2.type);
				if (rankA < rankB) {
					return -1;
				}
				if (rankA > rankB) {
					return 1;
				}
				return 0;
			};

			/* Begin of functions dealing with subsections (in particular lazy loading and refreshing of subsections) */

			function fnChangeBindingContext(vTarget, oSubSection){
				oLogger.info("Set binding context to " + vTarget, "Subsection: " + oSubSection.getId(), "sap.suite.ui.generic.template.ObjectPage.controller.ControllerImplementation");
				var aAllBlocks = getAllSubSectionBlocks(oSubSection);
				// Setting and resetting binding context at subSection level is not good, because subsections appear in the
				// tab bar of object page. Thus if, let's say subSection is hidden and we don't set proper binding conntext
				// it will still be visible in the tab-bar. Thus setting binding context on blocks of subsection is good.
				aAllBlocks.forEach(function(oBlock) {
					oBlock.setBindingContext(vTarget);
				});
			}

			function getSubSectionLoadingBehavior(bLayoutFinished, bEnteredToViewPort, bStateApplied,bRebindCompleted, activeHandler, inActiveHandler) {
				var loadingBehavior = {
					bWaitForViewportEnter: bEnteredToViewPort,
					waitFor: {
						bLayoutFinished: bLayoutFinished,
						bStateApplied: bStateApplied,
						bRebindCompleted: bRebindCompleted
					},
					activeHandler: activeHandler || function(oSubSection, oSubSectionInfoObj) {
						if (getAllSubSectionBlocks(oSubSection).length && getAllSubSectionBlocks(oSubSection)[0].getBindingContext() === null) {
							fnChangeBindingContext(undefined, oSubSection);
							oSubSectionInfoObj.refresh(null, true, true);
						}
					},
					inActiveHandler: inActiveHandler || function(oSubSection, oSubSectionInfoObj) {
						fnChangeBindingContext(null, oSubSection);
					}
				};
				return loadingBehavior;
			}
			function reuseComponentActiveHandler (oSubSection) {
				var oComponentContainer = oSubSection.getBlocks()[0];
				oTemplateUtils.oComponentUtils.onVisibilityChangeOfReuseComponent(true, oComponentContainer);
			}
			function reuseComponentInactiveHandler (oSubSection) {
				var oComponentContainer = oSubSection.getBlocks()[0];
				oTemplateUtils.oComponentUtils.onVisibilityChangeOfReuseComponent(false, oComponentContainer);
			}

			var mSubSectionLoadingStrategies = {
				lazyLoading: getSubSectionLoadingBehavior(false, true, false, true),
				lazyLoadingAfterHeader: getSubSectionLoadingBehavior(true, true, false, true),
				// In this strategy the criteria of lazyLoading is only Header data. We don't see the visibility change
				// of subsection, as soon as header data is received, we activate section binding.
				activateAfterHeaderDataReceived: getSubSectionLoadingBehavior(true, false,false, true),
				// In is the last strategy, where we not at all lazyLoad subsection. We activate it as soon as binding
				// Context changes
				activateWithBindingChange: getSubSectionLoadingBehavior(false,false, false,true),
				reuseComponent: getSubSectionLoadingBehavior(true, true, false, true, reuseComponentActiveHandler, reuseComponentInactiveHandler)
			};
			// Refresh a given block. This only affects the smart tables in the block.
			// Two scenarios for this function distinguished by parameter bForceRefresh:
			// If the parameter is false the call is coming from the refreshBinding-method in the Component. In this scenario mRefreshInfos might be used to
			// reduce the set of SmartTables which need to be refreshed.
			// Moreover, in this scenario executing the side-effects will be included.
			// If the parameter is true the call is coming from activating the block due to lazy loading.
			// In this scenario mRefreshInfos is ignored and no side-effects will be executed.
			function fnRefreshBlock(mRefreshInfos, bForceRefresh, bNoMessageRefresh, oBlock) {
				if (oBlock instanceof DynamicSideContent) {
					oBlock = oBlock.getMainContent()[0];
				} else if (!oBlock.getContent) { // dummy-blocks need not to be refreshed
					return;
				}
				oBlock.getContent().forEach(function(oContent) {
					if (oTemplateUtils.oCommonUtils.isSmartTable(oContent)) {
						if (bForceRefresh || mRefreshInfos[oContent.getEntitySet()]) {
							if (oContent.isInitialised()) {
								oTemplateUtils.oCommonUtils.refreshSmartTable(oContent, null, bNoMessageRefresh);
							} else {
								oContent.attachInitialise(oTemplateUtils.oCommonUtils.refreshSmartTable.bind(null, oContent, null, bNoMessageRefresh));
							}

							if (!bForceRefresh) {
								oTemplateUtils.oServices.oApplicationController.executeSideEffects(oController.getOwnerComponent().getBindingContext(), [], [oContent.getTableBindingPath()]);
							}
						}
					}
				});
			}

			// Unified access to the info object for a subsection
			// The following two methods are contained in the info object:
			// - refresh(mRefreshInfos, bForceRefresh): A function that is used to refresh the subsection. For more detials see documentation of
			//   fnRefreshBlock which does the same for the blocks contained in the subsection
			// - strategyForVisibilityChange(bIsGettingVisible, oSubSection, oSubSectionInfoObject): Function that is used to deal with lazy loading.
			//   See description of function fnLazyLoad for more details.
			function getSubSectionInfoObject(oSubSection){
				return oTemplateUtils.oCommonUtils.getControlInformation(oSubSection);
			}

			function fnInitSubSectionInfoObject(oSubSection){
				aSubSections.push(oSubSection);
				oTemplateUtils.oCommonUtils.getControlInformation(oSubSection, function(oSubSectionInfoObject, aCategories){
					// First construct the refresh function
					var aAllBlocks = getAllSubSectionBlocks(oSubSection);
					// ensure that the corresponding InfoObject is initialized if the first block is a SideContent
					oSideContentHandler.initSideContentInfoObject(aAllBlocks[0]);
					oSubSectionInfoObject.refresh = function(mRefreshInfos, bForceRefresh, bNoMessageRefresh){
						var fnMyRefreshBlock = fnRefreshBlock.bind(null, mRefreshInfos, bForceRefresh, bNoMessageRefresh);
						aAllBlocks.forEach(fnMyRefreshBlock);
					};

					// Now determine property strategyForVisibilityChange of the info object
					var sLoadingStrategy = oTemplateUtils.oCommonUtils.getElementCustomData(oSubSection).loadingStrategy;
					var oLoadingStrategy = mSubSectionLoadingStrategies[sLoadingStrategy];
					oSubSectionInfoObject.loadingStrategy = oLoadingStrategy || getSubSectionLoadingBehavior(false, false, false, false, Function.prototype, Function.prototype);
					aCategories.push("subSection");
					if (!oSubSectionInfoObject.loadingStrategy.bWaitForViewportEnter) {
						aCategories.push("subSectionNotWaitingForViewPort");
					}
				});
			}

			/* End of functions dealing with subsections (in particular lazy loading and refreshing of subsections) */

            function fnGetVisibleControls(aControls){
				var aVisibleControls = [];
				for (var i = 0; i < aControls.length; i++) {
					if (aControls[i].getVisible()) {
						aVisibleControls.push(aControls[i]);
					}
				}
				return aVisibleControls;
			}

			/**
			 *
			 * @param {Object} oSection - Optional
			 * If oSection is provided then it returns true, if that section has only one subsection.
			 * If oSection is not provided then it returns true, if OP has only one section with one subsection.
			 */
			function fnIsSingleSectionOrSubsectionVisible(oSection) {
				var aAvailableControls = oSection ? oSection.getSubSections() : oObjectPage.getSections();
				var aVisibleControls = fnGetVisibleControls(aAvailableControls);
				return aVisibleControls.length === 1 && !!(oSection || fnIsSingleSectionOrSubsectionVisible(aVisibleControls[0]));
			}

			/**
			 * For UI tables the smart table is kept within the grid layout of ObjectPageSubSection hence we iterate to
			 * find the exact layout type.
			 * If Grid layout is found, apply/remove sGridExpandClass style based on bSetFitContainer value.
			 * If ObjectPageSubSection layout is found, apply/remove sFitContainerClass style and
			 * set fit container of smartTable based on bSetFitContainer value and break the loop.
			 * @param {object} oSmartTable - instance of smart table
			 * @param {boolean} bSetFitContainer
			 */
			function fnHandleUITableExpand(oSmartTable, bSetFitContainer) {
				var oParent = oSmartTable.getParent();
				var sGridExpandClass = "sapSmartTemplatesObjectPageSubSectionGridExpand", sFitContainerClass = "sapUxAPObjectPageSubSectionFitContainer";
				while (oParent) {
					if (oParent.isA("sap.ui.layout.Grid")) {
						bSetFitContainer ? oParent.addStyleClass(sGridExpandClass) : oParent.removeStyleClass(sGridExpandClass);
					} else if (oParent.isA("sap.uxap.ObjectPageSubSection")) {
						bSetFitContainer ? oParent.addStyleClass(sFitContainerClass) : oParent.removeStyleClass(sFitContainerClass);
						oSmartTable.setFitContainer(bSetFitContainer);
						// when ObjectPageSubSection found exit loop and function returns
						return null;
					} else {
						oLogger.warning("Unexpected parent " + oParent.toString() + " in fnHandleUiTableExpand method");
					}
					oParent = oParent.getParent();
				}
			}

			/**
			 * Function "fnSetSizeCondensedCssClass" add/remove condensed class.
			 * If "bCondensedTableLayout" or "bSetFitContainer" is false, or table already has condensed class then simply return.
			 * If "bSetFitContainer" is true and compact class is set on body then add condensed class, else remove condensed class.
			 * @param {Object} oTableInfoObject - info. about table
			 * @param {Object} oTable - sap.ui.table instance
			 */
			function fnSetSizeCondensedCssClass(oTableInfoObject, oTable) {
				var sCompactClass = "sapUiSizeCompact", sCondensedClass = "sapUiSizeCondensed", oBody;
				oBody = document.body;
				if (!oTableInfoObject.bCondensedTableLayout || !(oTableInfoObject.bSetFitContainer || oTable.hasStyleClass("sapUiSizeCondensed"))) {
					return null;
				} else if (oTableInfoObject.bSetFitContainer && oBody.classList.contains(sCompactClass)) {
					oTable.addStyleClass(sCondensedClass);
				} else {
					oTable.removeStyleClass(sCondensedClass);
				}
			}

			function fnSetGrowingThresholdAndCondensedCssClass(oSmartTable, oTable, oTableInfoObject) {
				if (oTable.isA("sap.m.Table")) {
					oTable.setGrowingThreshold(oTableInfoObject.growingThreshold);
					oTable.setGrowingScrollToLoad(oTableInfoObject.bGrowingScrollOnLoad);
				} else if (oTable.isA("sap.ui.table.Table")) {
					fnHandleUITableExpand(oSmartTable, oTableInfoObject.bSetFitContainer);
					fnSetSizeCondensedCssClass(oTableInfoObject, oTable);
				}
			}

			function fnApplyTableThresholdValueAndCssClass(oSmartTable, oTable, sCurrentFacet) {
				var oTableInfoObject = {
					growingThreshold: 10,
					bSetFitContainer: false,
					bGrowingScrollOnLoad: false
				};
				// Adding condensedClass as a styleClass to sap.ui.table
				var oObjectPageSettings = oController.getOwnerComponent().mProperties;
				oTableInfoObject.bCondensedTableLayout = oObjectPageSettings.condensedTableLayout;
				if (oObjectPageSettings && oObjectPageSettings.sections) {
					var oSection = oObjectPageSettings.sections[sCurrentFacet];
					if (oSection && oSection.hasOwnProperty("condensedTableLayout")) {
						oTableInfoObject.bCondensedTableLayout = oSection.condensedTableLayout;
					}
				}
				var oParent;
				if (oObjectPage.getUseIconTabBar()) {
					oParent = oTable.getParent();
					while (oParent && oParent.sParentAggregationName !== "sections") {
						oParent = oParent.getParent();
					}
				}
				// Setting growing threshold to 25 in case of responsive table and 1 section
				if (fnIsSingleSectionOrSubsectionVisible(oParent)) {
					oTableInfoObject.growingThreshold = DEFAULT_GROWING_THRESHOLD;
					oTableInfoObject.bGrowingScrollOnLoad = true;
					oTableInfoObject.bSetFitContainer = true;
				}
				fnSetGrowingThresholdAndCondensedCssClass(oSmartTable, oTable, oTableInfoObject);
			}

			/**
			 * Function for handling the navigation of sections using shortcut
			 * @param {Boolean} bForward - direction of switching of the tabs forward or backward
			 */
			function fnOnSwitchTabs(bForward) {
				// filterout the header section and invisible section
				var aSections = oObjectPage.getSections().filter(function(oSection) {
					return (oSection.getTitle() === "Header" || !oSection._bInternalVisible) ? false : true;
				});
				var oNextSection;
				for (var i = 0; i < aSections.length; i++) {
					var oSwitchingItem = aSections[i];
					var sSwitchingItemKey = oSwitchingItem.getId();
					var sCurrentKey = oObjectPage.getSelectedSection();
					if (sSwitchingItemKey === sCurrentKey) {
						// based on the direction, select the next section
						oNextSection = (bForward) ? aSections[(i + 1 === aSections.length) ? 0 : i + 1] : aSections[(i === 0) ? aSections.length - 1 : i - 1];
						var sSectionId = oNextSection.getId();
						oObjectPage.setSelectedSection(sSectionId);
						fnSectionChanged();
						break;
					}
				}
			}

			/**
			 * Handles whenever selected section is changed
			 */
			function fnSectionChanged() {
				oTemplateUtils.oComponentUtils.stateChanged();
			}

			// Add the information derived from the UI:Hidden annotation for one line item to either aStaticHiddenColumns or mColumnKeyToDynamicHiddenPath, or none.
			function fnAnalyzeColumnHideInfoForLineItem(aStaticHiddenColumns, mColumnKeyToDynamicHiddenPath, oMetaModel, oEntityType, oLineItem){
				var sColumnKey = AnnotationHelper.createP13NColumnKey(oLineItem);
				var vExpression = AnnotationHelper.getBindingForHiddenPath(oLineItem);
				if (vExpression === "{= !${} }") {
					aStaticHiddenColumns.push(sColumnKey);
				}
				if (typeof (vExpression) === "string") {
					var sPath = vExpression.match(rPath) && vExpression.match(rPath)[0];
					if (sPath && sPath.indexOf("/") > 0 && oEntityType.navigationProperty) {
						var sParentEntitySet = oController.getOwnerComponent().getEntitySet();
						var sFirstNavigationProperty = sPath.split("/", 1)[0];
						if (oMetaModel.getODataAssociationSetEnd(oEntityType, sFirstNavigationProperty).entitySet === sParentEntitySet) {
							mColumnKeyToDynamicHiddenPath[sColumnKey] = sPath.split("/").slice(1).join("/");
						}
					}
				} else if (!vExpression){
					aStaticHiddenColumns.push(sColumnKey);
				}
			}

			/**
			 * Get the display mode of Object page
			 *
			 * @param {Object} oObjectPage Object page
			 * @return {String} Returns Object page mode
			 */
			function fnGetObjectPageMode(oObjectPage) {
				var oUIModel = oObjectPage.getModel("ui");
				var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
				var displayMode = oTemplatePrivateModel.getProperty("/objectPage/displayMode");
				var bCreateMode = oUIModel.getProperty("/createMode") || displayMode === 4;
				var bisEditable = oUIModel.getProperty("/editable") || displayMode === 2;
				var sPageMode;
				if (bCreateMode) {
					sPageMode = "Create";
				} else if (bisEditable) {
					sPageMode = "Edit";
				} else {
					sPageMode = "Display";
				}
				return sPageMode;
			}

			/**
			 * Checks if Object page mode is "Display" then return first focusable header button,
			 * else if bFocusAtTop is true return firstEditableInupt,
			 * else return firstEditableInput of the current selected section if found else first focusable element.
			 * If no focusable element found then check for firstEditableInupt or first focusable element in next visible section.
			 *
			 * @param {Object} oObjectPage Object page
			 * @param {String} sMode Object page mode (Display or Create or Edit)
			 * @return Returns focusable element, otherwise undefined
			 */
			function fnGetFocusableElementOnObjectPage(oObjectPage, sMode) {
				if (sMode === "Display") {
					var oObjectHeader = oObjectPage.getHeaderTitle();
					var aActions = oObjectHeader.getActions();
					if (aActions && aActions.length) {
						for (var i = 0; i < aActions.length; i++) {
							if (aActions[i].getVisible && aActions[i].getVisible() && aActions[i].getEnabled && aActions[i].getEnabled()) {
								return aActions[i];
							}
						}
					}
				} else {
					var sSectionSelected = oObjectPage.getSelectedSection();
					var bIconTabBar = oObjectPage.getUseIconTabBar();
					if (bFocusAtTop === true && bIconTabBar !== true) {
						oObjectPage.setSelectedSection(null);
						return getFirstEditableInput(oObjectPage.getDomRef());
					}
					var oFirstFocusableElement;
					var fnGetFocusableElementOnSection = function (oSection) {
						var oSectionDomRef = oSection.getDomRef();
						oObjectPage.setSelectedSection(oSection);
						oFirstFocusableElement = getFirstEditableInput(oSectionDomRef);
						if (oFirstFocusableElement && oFirstFocusableElement.type !== "checkbox") {
							return oFirstFocusableElement;
						}
						return Focusable(oSectionDomRef).firstFocusableDomRef();
					};
					var aSections = oObjectPage.getSections();
					var sNextSectionId;
					for (var i = 0; i < aSections.length; i++) {
						if (aSections[i].getVisible() && ((aSections[i].getId() === sSectionSelected) || sNextSectionId)) {
							sNextSectionId = aSections[i + 1] ? aSections[i + 1].getId() : undefined;
							oFirstFocusableElement = fnGetFocusableElementOnSection(aSections[i]);
							if (oFirstFocusableElement) {
								break;
							}
						}
					}
					return oFirstFocusableElement;
				}
			}

			/**
			 * Set focus on focusable element returned by function fnGetFocusableElementOnObjectPage.
			 * @param {Object} oObjectPage Object page
			 */
			function fnSetFocusableElementOnObjectPage (oObjectPage) {
				var oTemplatePrivateGlobalModel = oController.getOwnerComponent().getModel("_templPrivGlobal");
				var nFCLActionFlag = oTemplatePrivateGlobalModel.getProperty("/generic/FCL/FCLActionButton");
				//If FCL Actions Full Screen or Exit Full Screen is clicked then do not reset focus
				if (!nFCLActionFlag) {
					var sPageMode = fnGetObjectPageMode(oObjectPage);
					if (document.readyState == 'complete') {
						setTimeout(function () {
							var oFirstFocusableElement = fnGetFocusableElementOnObjectPage(oObjectPage, sPageMode);
							if (oFirstFocusableElement) {
								oFirstFocusableElement.focus();
							}
						}, 0);
					}
				}
			}

			// This method is called in the initialization phase of the specified SmartTable.
			// It handles everything which can be done regarding hiding columns at this point in time.
			// This is:
			// - Check for columns which are hidden statically or dynamically
			// - Immediately hide the columns which are statically hidden
			//    Note: This is actually a side effect of this function called implicitly via getSmartTableInfoObject.
			//          Therefore, it is essential that getSmartTableInfoObject is called during initialization
			// - Add a columnHideInfos object to the specified info object. The columnHideInfos object
			//   contains information about the columns which are statically and which are dynamically hidden.
			//   In this case the category 'smartTableWithColumnHide' will be set for this info object. This will be used by
			//   oViewProxy.applyHeaderContextToSmartTablesDynamicColumnHide.
			//   Note: this is another side-effect of this function.
			function fnHandleSmartTableColumnHideAtInit(oSmartTable, oSmartTableInfoObject, aCategories, oMetaModel, oEntityType, aLineItems){
				var aStaticHiddenColumns = []; // list of keys of columns that are always hidden
				var mColumnKeyToDynamicHiddenPath = Object.create(null); // map of column keys to pathes that determine whether the column is shown
				for (var i = 0; i < aLineItems.length; i++) {
					var oLineItem = aLineItems[i];
					fnAnalyzeColumnHideInfoForLineItem(aStaticHiddenColumns, mColumnKeyToDynamicHiddenPath, oMetaModel, oEntityType, oLineItem);
				}
				if (!isEmptyObject(mColumnKeyToDynamicHiddenPath) || aStaticHiddenColumns.length){ // if there is at least one column with hide info we store this analysis in the info object
					oSmartTableInfoObject.columnHideInfos = {
						staticHiddenColumns: aStaticHiddenColumns,
						columnKeyToHiddenPath: mColumnKeyToDynamicHiddenPath
					};
					aCategories.push("smartTableWithColumnHide"); // Make sure that the smart table can be identified as one having hide info
				}
			}


			// not the intended way. Better way: get the id of the subsection by using StableIdHelper, information needed to build the id should be available at the control
			// unfortunately, facet id is not yet transformed to be build by the new stable id concept...
			function findSubSection(oControl){
				return oControl instanceof ObjectPageSubSection ? oControl : oControl.getParent && findSubSection(oControl.getParent());
			}



			// callback function that initializes the info object for a SmartTable
			function fnInitSmartTableInfoObject(oSmartTableInfoObject, aCategories, oSmartTable){
				aCategories.push("smartTable");
				oSmartTableInfoObject.subSection = findSubSection(oSmartTable);
				if (oSmartTable.getUseVariantManagement()) {
					aCategories.push("smartControlWithVariantManagement");
					getSubSectionInfoObject(oSmartTableInfoObject.subSection).loadingStrategy.waitFor.bStateApplied = true;
					oSmartTableInfoObject.afterVariantInitialisePromise = new Promise(function(resolve){
						oSmartTableInfoObject.afterVariantInitialiseResolve = resolve;
					});
				}
				// prepare some metadata
				//Since the introduction of the property "placeToolbarinTable", the hierarchy of toolbar is changed. To adjust this property the below condition is added
				oSmartTable = oTemplateUtils.oCommonUtils.isMTable(oSmartTable) ? oSmartTable.getParent() : oSmartTable;
				var oMetaModel = oController.getOwnerComponent().getModel().getMetaModel();
				var oEntitySet = oMetaModel.getODataEntitySet(oSmartTable.getEntitySet());
				var oEntityType = oMetaModel.getODataEntityType(oEntitySet.entityType);
				var aLineItems = oEntityType["com.sap.vocabularies.UI.v1.LineItem"];
				var aCustomData = oSmartTable.getCustomData();
				for (var i = 0; i < aCustomData.length; i++) {
					if (aCustomData[i].getKey() === "lineItemQualifier") {
						aLineItems = oEntityType["com.sap.vocabularies.UI.v1.LineItem#" + aCustomData[i].getValue()];
						break;
					}
				}
				// add information about hidden columns
				fnHandleSmartTableColumnHideAtInit(oSmartTable, oSmartTableInfoObject, aCategories, oMetaModel, oEntityType, aLineItems || []);
			}

			// Unified access to the info object for SmartTables. Note that the info object will be initialized in onTableInit (actually this has side-effects).
			// Currently the following optional attributes are stored in the info object:
			// - columnHideInfos: See fnHandleSmartTableColumnHideAtInit for more details
			// - searchField: Reference to the search field that belongs to this table. This attribute will be set, when the search field is first touched by the user
			//   (when the info object for the search field is initialized).
			function getSmartTableInfoObject(oSmartTable){
				return oTemplateUtils.oCommonUtils.getControlInformation(oSmartTable, fnInitSmartTableInfoObject);
			}

			function informVariantSelectionChanged(oEvent) {
				// Notify statePreserver to ensure an appState is created when user selects another variant (onAfterTableVariantApply) or saves the current variant (onAfterTableVariantSave).
				// During initialization or when switching objects, variant is set to default, which triggers onAfterTableVariantApply as well. At this point in time, no appState should be written
				var oInfoObject;
				var oControl = oEvent.getSource();
				if (oTemplateUtils.oCommonUtils.isSmartTable(oControl)) {
					oInfoObject = getSmartTableInfoObject(oControl);
				} else if (oTemplateUtils.oCommonUtils.isSmartChart(oControl)) {
					oInfoObject = getSmartChartInfoObject(oControl);
				}

				if (!fnStateAppliedAfterBindResolve && !oInfoObject.afterVariantInitalisedResolve && !oInfoObject.bApplyingVariantFromState) {
					oTemplateUtils.oComponentUtils.stateChanged();
				}
			}

			//Callback function that initializes the info object of SmartChart
			function fnInitSmartChartInfoObject(oSmartChartInfoObject, aCategories, oSmartChart){
				aCategories.push("smartChart");
				if (oSmartChart && oSmartChart.getUseVariantManagement()) {
					aCategories.push("smartControlWithVariantManagement");
					oSmartChartInfoObject.afterVariantInitialisePromise = new Promise(function(resolve){
						oSmartChartInfoObject.afterVariantInitialiseResolve = resolve;
					});
				}
			}
			//Access to SmartChart info object that will be called in onChartInit
			function getSmartChartInfoObject(oSmartChart){
				return oTemplateUtils.oCommonUtils.getControlInformation(oSmartChart, fnInitSmartChartInfoObject);
			}

			/* Begin: Functions dealing with the search field on tables */

			// callback function that initializes the info object for a search field. Will be called when the search field is touched by the user for the first time.
			function fnInitSearchFieldInfoObject(oSearchFieldInfoObject, aCategories, oSearchField){
				aCategories.push("searchField");
				var oTable = oTemplateUtils.oCommonUtils.isMTable(oSearchField.getParent().getParent()) ? oSearchField.getParent().getParent().getParent() : oSearchField.getParent().getParent() ;
				oSearchFieldInfoObject.table = oTable;
				var oSmartTableInfoObject = getSmartTableInfoObject(oTable);
				oSmartTableInfoObject.searchField = oSearchField;
			}

			// Unified access to the info object for a search field.
			// This info object contains the following attributes:
			// - table: the SmartTable instance the search field belongs to
			// - searchString: The search string provided by this search field (Note that this might differ from the content of the field, since the user might change the
			//   content of the search field without triggering a search)
			function getSearchFieldInfoObjectForEvent(oEvent){
				return oTemplateUtils.oCommonUtils.getControlInformation(oEvent, fnInitSearchFieldInfoObject);
			}

			// Event handler for the live change of search fields
			// Its only task is to ensure that the info object for the search field is created as soon as the user enters the first character.
			// This is needed to ensure that fnClearSearchField (see below) also affects search fields that contain values without search having been triggered.
			function onSearchLiveChange(oEvent){
				getSearchFieldInfoObjectForEvent(oEvent);
			}

			// a search field in one of the tables is used to trigger a search.
			function onSearchObjectPage(oEvent) {
				var oSearchFieldInfoObject = getSearchFieldInfoObjectForEvent(oEvent);
				oSearchFieldInfoObject.searchString = oEvent.getSource().getValue();
				oSearchFieldInfoObject.table.rebindTable();
			}

			// Callback function used in the implementation of fnClearSearchField. This function clears one search field.
			function fnClearSearchField(oSearchFieldInfoObject, oSearchField){
				oSearchField.setValue("");
				if (oSearchFieldInfoObject.searchString){
					oSearchFieldInfoObject.searchString = "";
					oSearchFieldInfoObject.table.rebindTable();
				}
			}

			// set back the content of all search fields
			function fnClearSearchFields(){
				oTemplateUtils.oCommonUtils.executeForAllInformationObjects("searchField", fnClearSearchField);
			}

			/* End: Functions dealing with the search field on tables */

			//Accepts row context object and returns the index of Grid Table row
			function getGridTableRowIndexFromContext(oContext, oTable){
				var sRowPath = oContext.getPath();
				var bTrue = true;
				for (var iRowIndex = 0; bTrue; iRowIndex++){
					var oRowContext = oTable.getContextByIndex(iRowIndex); //Get the row context for each row starting from first
					var sCurrentPath = oRowContext && oRowContext.getPath();
					if (sCurrentPath === sRowPath) {  //Check to find the row that matches with new row context by comparing path
						return iRowIndex; //Row found. No further iterations required
					} else if (!oRowContext) {
						return -1; //Row not found. Return -1 to indicate
					}
				}
			}

			//Accepts row context in Grid Table and returns the Grid table row
			function getGridTableRow(oContext, oTable){
				var iFirstVisibleRowIndex = oTable.getFirstVisibleRow();
				var iVisibleRowCount = oTable.getVisibleRowCount();
				var sRowPath = oContext.getPath();
				for (var i = 0; i < iVisibleRowCount; i++) {
					if (oTable.getContextByIndex(iFirstVisibleRowIndex + i).getPath() === sRowPath){
						return oTable.getRows()[i];
					}
				}
			}

			//function to set focus on the new row added
			function setFocusOnTableRow(oSmartTable, oNewContext) {
				var oTable = oSmartTable.getTable();
				if (oTemplateUtils.oCommonUtils.isMTable(oTable)){
					return; // Currently we set focus for grid tables only
				}
				function setFocusOnTableRowImpl() {
					var iRowIndex = getGridTableRowIndexFromContext(oNewContext, oTable);
					//If row found
					if (iRowIndex !== -1) {
						oTable.setFirstVisibleRow(iRowIndex);//Make the Table row visible. This does not ensure position of row in the visible view port
						//setTimeout being a macrotask ensures event has propagated at all levels and screen has rendered with changes
						setTimeout(function () {
							var oTableRow = getGridTableRow(oNewContext, oTable);
							var firstEditableInputElement = oTableRow && getFirstEditableInput(oTableRow.getDomRef());
							if (firstEditableInputElement) {
								firstEditableInputElement.focus();
							}
						}, 0);
					}
				}
				oSmartTable.attachEventOnce("dataReceived", setFocusOnTableRowImpl);
			}

			//Calls addEntry method for Inline create and handles response
			function addEntryForInlineCreate(oEventSource, oSmartTable) {
				oTemplateUtils.oCommonEventHandlers.addEntry(oEventSource, true).then(setFocusOnTableRow.bind(null, oSmartTable));
			}

			// Expose selected private functions to unit tests
			/* eslint-disable */
			testableHelper.testable(setFocusOnTableRow, "setFocusOnTableRow");
			testableHelper.testable(getGridTableRow, "getGridTableRow");
			testableHelper.testable(getGridTableRowIndexFromContext, "getGridTableRowIndexFromContext");
			/* eslint-enable */

			function addEntryImpl(oPredefinedValues, oButton) {
				var oSmartTable = oTemplateUtils.oCommonUtils.getOwnerControl(oButton);
				// After adding the "placeToolbarinTable", the hierarchy of toolbar is changed. To adjust this property, below condition is added
				oSmartTable = oTemplateUtils.oCommonUtils.isMTable(oSmartTable) ? oSmartTable.getParent() : oSmartTable;
				var bSuppressNavigation = fnIsSmartTableWithInlineCreate(oSmartTable);
				//if not inline Create set a flag bSubOPCreate to notify it as a SubObject Page creation
				if (!bSuppressNavigation) {
					bFocusAtTop = false;
					bSubOPCreate = true;
				}
				if (!oButton.data("CrossNavigation") && bSuppressNavigation) {
					addEntryForInlineCreate(oButton, oSmartTable);
					return;
				}
				oTemplateUtils.oCommonUtils.processDataLossConfirmationIfNonDraft(function() {
					oTemplateUtils.oCommonEventHandlers.addEntry(oButton, false);
				}, Function.prototype, oBase.state);
			}

			function fnAddEntry(sFacetId) {
				var sIdForAddButton = StableIdHelper.getStableId({
					type: "ObjectPageAction",
					subType: "Create",
					sFacet: sFacetId
				});
				var sIdForCreateWithDialog = StableIdHelper.getStableId({
					type: "ObjectPageAction",
					subType: "CreateWithDialog",
					sFacet: sFacetId
				});
				
				if (sIdForCreateWithDialog && oController.byId(sIdForCreateWithDialog)) {
					var oFacet = oController.getOwnerComponent().mProperties && oController.getOwnerComponent().mProperties.sections[sFacetId];
					var oFields =  oFacet && oFacet.tableSettings && oFacet.tableSettings.createWithParameterDialog && oFacet.tableSettings.createWithParameterDialog.fields;
				}
				if (!!oFields && !isEmptyObject(oFields)) {
					oController.byId(sIdForCreateWithDialog).setVisible(true);
					oTemplateUtils.oCommonUtils.executeIfControlReady(oCreateWithDialogHandler.createWithDialog.bind(null, oController.byId(sIdForCreateWithDialog)), sIdForAddButton);
				} else {
					oTemplateUtils.oCommonUtils.executeIfControlReady(addEntryImpl.bind(null, undefined), sIdForAddButton);
				}
			}

			// This function is called by the DataStateIndicator plugin for each message that is considered to
			// belong to this table.
			// It returns a boolean value that indicates whether the message should be shown in the message strip belonging to the table.
			// This is the case exactly if the object page is in edit mode.
			// Note that the table (and the DataStateIndicator) are stored in mTablesWithMessagesToDataStateIndicators.
			// This is done to ensure that the corresponding DataStateIndicator can be refreshed via the logic implemented in fnRegisterForEditableChange
			// when the edit/display mode is changing
			function fnDataStateFilter(oMessage, oTable){
				// Register table and its DataStateIndicator in mTablesWithMessagesToDataStateIndicators
				var sTableId = oTable.getId();
				if (!mTablesWithMessagesToDataStateIndicators[sTableId]){ // If table is already registered ignore registration step
					var aDependents = oTable.getDependents();
					aDependents.some(function(oDependent){ // search for the DataStateIndicator
						if (oDependent instanceof DataStateIndicator){ // DataStateIndicator has been found
							mTablesWithMessagesToDataStateIndicators[sTableId] = oDependent; // register
							return true; // no need to search further
						}
					});
				}
				var oUIModel = oObjectPage.getModel("ui");
				return oUIModel.getProperty("/editable");
			}

			// This function is called in onInit. It ensures that all necessary actions are taken care of when edit mode changes.
			// This is currently to ensure that all DataStateIndicators which have been registered in mTablesWithMessagesToDataStateIndicators are triggered to refresh.
			function fnRegisterForEditableChange(){
				var oUIModel = oController.getOwnerComponent().getModel("ui");
				oUIModel.bindProperty("/editable").attachChange(function(){
					var mLastTablesWithMessages = mTablesWithMessagesToDataStateIndicators;
					mTablesWithMessagesToDataStateIndicators = Object.create(null); // Start with a new registration list. Refresh will ensure that it will be filled again correctly.
					for (var sKey in mLastTablesWithMessages){
						var oDataStateIndicator = mLastTablesWithMessages[sKey];
						oDataStateIndicator.refresh();
					}
				});
			}

			function setNoDataTextIfRequired(oSmartTable) {
				var sSmartTableId = oSmartTable.getId();
				var sNoDataText = "";
				var mSmartTableConfig = {search:false, filter:false};
				var oSmartTableVariant = oSmartTable.fetchVariant();
				if (oSmartTableVariant && oSmartTableVariant.filter && oSmartTableVariant.filter.filterItems.length > 0) {
					mSmartTableConfig.filter = true;
				}
				var aSearchControl = oSmartTable.getToolbar().getContent().filter(function(oControl){return oControl.sId === oSmartTable.getToolbar().getId() + '::SearchField';});
				if (aSearchControl.length > 0 && aSearchControl[0].getValue().trim() !== "") {
					mSmartTableConfig.search = true;
				}
				if (mSmartTableConfig.search || mSmartTableConfig.filter) {
					sNoDataText = oTemplateUtils.oCommonUtils.getContextText("NOITEMS_SMARTTABLE_WITH_FILTER", sSmartTableId);
				} else {
					sNoDataText = oTemplateUtils.oCommonUtils.getContextText("NOITEMS_SMARTTABLE", sSmartTableId);
				}
				oSmartTable.setNoData(sNoDataText);
			}

			function setNoDataChartTextIfRequired(oSmartChart) {
				var filters = [];
				if (oSmartChart.fetchVariant() && oSmartChart.fetchVariant().filter && oSmartChart.fetchVariant().filter.filterItems) {
					filters = oSmartChart.fetchVariant().filter.filterItems;
				}
				var sSmartChartId = oSmartChart.getId();
				var sNoDataText = "";
				var mSmartChartConfig = {
					search: false,
					filter: false
				};
				if (filters && filters.length){
					mSmartChartConfig.filter = true;
				}
				var aSearchControl = oSmartChart.getToolbar().getContent().filter(function (oControl) {
					return oControl.sId === oSmartChart.getToolbar().getId() + '::SearchField';
				});
				if (aSearchControl.length > 0 && aSearchControl[0].getValue().trim() !== "") {
					mSmartChartConfig.search = true;
				}
				if (mSmartChartConfig.search || mSmartChartConfig.filter) {
					sNoDataText = oTemplateUtils.oCommonUtils.getContextText("NOITEMS_SMARTCHART_WITH_FILTER", sSmartChartId);
				} else {
					sNoDataText = oTemplateUtils.oCommonUtils.getContextText("NOITEMS_SMARTCHART", sSmartChartId);
				}
				oSmartChart.getChartAsync().then(function (chart) {
					chart.setCustomMessages({
						NO_DATA: sNoDataText
					});
				});
			}

			// Begin: Filling the viewProxy with functions provided for the TemplateComponent to be called on the view

			oViewProxy.refreshFacets = function(mRefreshInfos) {
				var fnRefreshSubSection = function(oSubSection) {
					var oSubSectionInfoObject = getSubSectionInfoObject(oSubSection);
					oSubSectionInfoObject.refresh(mRefreshInfos, false);
				};
				oObjectPage.getSections().forEach(function(oSection) {
					oSection.getSubSections().forEach(fnRefreshSubSection);
				});
			};

			oViewProxy.onComponentActivate = oBase.onComponentActivate;

			oViewProxy.getCurrentState = function() {
				var oRet = Object.create(null);
				// Store information, which section is currently selected
				if (sSectionId) {
					oRet.section = {
						data: sSectionId,
						lifecycle: {
							permanent: true,
							pagination: true
						}
					};
				}

				if (sSelectedSubSectionId) {
					oRet.subSection = {
						data: sSelectedSubSectionId,
						lifecycle: {
							permanent: true,
							pagination: true
						}
					};
				}

				var mSmartControlVariants = {};
				oTemplateUtils.oCommonUtils.executeForAllInformationObjects("smartControlWithVariantManagement", function (oSmartControlInfoObject, oSmartControl) {
					mSmartControlVariants[oSmartControl.getId()] = oSmartControl.getCurrentVariantId();
				});
				if (!isEmptyObject(mSmartControlVariants)) {
					oRet.smartControlVariants = {
						data: mSmartControlVariants,
						lifecycle: {
							session: true,
							permanent: true,
							page: false,
							pagination: false
						}
					};
				}

				oRet.sideContent = oSideContentHandler.getCurrentState(); // add information about side content
				oRet.multipleViews = oMultipleViewsHandler.getCurrentState(); // add information about multipleviews
				// Now store state from application extensions
				var oCustomState = Object.create(null);
				oController.provideCustomStateExtension(oCustomState);
				for (var sCustomKey in oCustomState) {
					oRet["$custom$" + sCustomKey] = oCustomState[sCustomKey];
				}
				// Now store state from adaptation extensions
				var bIsAllowed = true; // check for synchronous calls
				var fnSetExtensionStateData = function (oControllerExtension, oExtensionState) {
					if (!(oControllerExtension instanceof ControllerExtension)){
						throw new FeError(sClassName, "State must always be set with respect to a ControllerExtension");
					}
					if (!bIsAllowed){
						throw new FeError(sClassName, "State must always be provided synchronously");
					}
					var sExtensionId = oControllerExtension.getMetadata().getNamespace(); // extension is identified by its namespace
					if (oExtensionState) {
						for (var sExtensionKey in oExtensionState) {
							oRet["$extension$" + sExtensionId + "$" + sExtensionKey] = oExtensionState[sExtensionKey];
						}
					}
				};
				oController.templateBaseExtension.provideExtensionStateData(fnSetExtensionStateData);
				bIsAllowed = false;

				return oRet;
			};
			function resetWaitForState() {
				oWaitForState = {
					bLayoutFinished: false,
					bStateApplied: false,
					bRebindCompleted :false
				};
				bWaitForViewPort = true;
			}
			function setWaitForState(sPropName) {
				oWaitForState[sPropName] = true;
				fnHandleStateChangeForAllSubSections();
			}

			function checkGlobalWaitState(oStrategy) {
				var allGlobalStateSet = true;
				for (var sProperty in oStrategy.waitFor) {
					if (oStrategy.waitFor[sProperty] && !oWaitForState[sProperty]) {
						allGlobalStateSet = false;
						break;
					}
				}
				return allGlobalStateSet;
			}
			// This methods deals with the state change, on which loading of any object page subsection depends.
			// If all the states are set, for which subsection is waiting, it will activate the sub section.
			function fnHandleStateChangeForAllSubSections() {
				var sCategory = bWaitForViewPort ?  "subSectionNotWaitingForViewPort" : "subSection";
				oTemplateUtils.oCommonUtils.executeForAllInformationObjects(sCategory, function(oSubSectionInfoObj, oSubSection) {
					// Checking whether a subSection Entered into view port or not is something local state compared to global state. Thus it is tested seperate to
					// to global state
					var bExecuteNow = checkGlobalWaitState(oSubSectionInfoObj.loadingStrategy);
					if (bExecuteNow) {
						oSubSectionInfoObj.loadingStrategy.activeHandler(oSubSection, oSubSectionInfoObj);
					}
				});
				// trigger visibility change event for currently visible subsection so that they can update themselves
				// if they are waiting for any state change.
				if (bWaitForViewPort) {
					oObjectPage._triggerVisibleSubSectionsEvents();
				}
			}
			// Helper functions for applyState that are called when this has finished to set the layout
			function resolveStateApplied() {
				if (fnStateAppliedAfterBindResolve){
					fnStateAppliedAfterBindResolve(); // trigger whatever has been waiting for the state to be applied
					fnStateAppliedAfterBindResolve = null; // ensure, that a new Promise is created when component is rebound
					setWaitForState("bStateApplied");
				}
			}
			function fnLayoutFinished(){
				setWaitForState("bLayoutFinished");

			}

			function fnScrollUp(){
				fnScrollObjectPageToTop(oObjectPage);
				fnLayoutFinished();
			}

			oViewProxy.applyState = function(oState, bIsSameAsLast) {
				// originally, applyState was only called when HeaderData was available, as HeaderData was always used to determine bIsSameAsLast
				// now, in some cases bIsSameAsLast can be determined earlier, however, we don't know, whether any extensions implicitly rely on header data being available
				// therefore, call extensions only after oHeaderDataAvailablePromise is resolved
				var oHeaderDataAvailablePromise = oTemplateUtils.oComponentUtils.getHeaderDataAvailablePromise() || Promise.resolve();
				oHeaderDataAvailablePromise.then(function(){
					var oFCLFocusableAction = null;
					var oCustomState = Object.create(null);
					var mExtensionState = Object.create(null);
					for (var sKey in oState) {
						if (sKey.indexOf("$custom$") === 0) {
							oCustomState[sKey.substring(8)] = oState[sKey];
						} else if (sKey.indexOf("$extension$") === 0) {
							var sExtensionId = sKey.substring(11,sKey.indexOf("$", 11));//get the extensionID from sKey
							var oExtensionState = mExtensionState[sExtensionId];
							if (!oExtensionState) {
								oExtensionState = Object.create(null);
								mExtensionState[sExtensionId] = oExtensionState;
							}
							var sExtensionKey = sKey.substring(sKey.indexOf("$", 11) + 1, sKey.length);//get the extensionKey from sKey
							oExtensionState[sExtensionKey] = oState[sKey];
						}
					}
					oController.applyCustomStateExtension(oCustomState, bIsSameAsLast);
					var bIsAllowed = true;
					var fnGetExtensionStateData = function (oControllerExtension) {
						if (!(oControllerExtension instanceof ControllerExtension)){
							throw new FeError(sClassName, "State must always be retrieved with respect to a ControllerExtension");
						}
						if (!bIsAllowed){
							throw new FeError(sClassName, "State must always be restored synchronously");
						}
						var sExtensionId = oControllerExtension.getMetadata().getNamespace(); // extension is identified by its namespace

						return mExtensionState[sExtensionId];
					};
					oController.templateBaseExtension.restoreExtensionStateData(fnGetExtensionStateData, bIsSameAsLast);
					bIsAllowed = false;
					var oOwnerComponent =  oController.getOwnerComponent();
					var sHeaderType = oOwnerComponent.getAppComponent().getObjectPageHeaderType();
					var oTemplatePrivateGlobalModel = oOwnerComponent.getModel("_templPrivGlobal");
					nFCLActionFlag = oTemplatePrivateGlobalModel.getProperty("/generic/FCL/FCLActionButton");
					//If FCL Action Full Screen is clicked set focus on Exit Full Screen and vice versa
					if (nFCLActionFlag === 1) {
						var oObjectHeader = oObjectPage.getHeaderTitle();
						var aActions = (sHeaderType === "Dynamic" ? oObjectHeader.getNavigationActions() : oObjectHeader.getActions());
						if (aActions && aActions.length) {
							for (var i = 0; i < aActions.length; i++) {
								if (aActions[i].getId && aActions[i].getId().indexOf("template::FCLActionButtons") > 0) {
									var aFCLActions = aActions[i].getItems();
									for (var j = 0; j < aFCLActions.length; j++) {
										//check which Action button among Full Screen or Exit Full Screen is visible and set focus to it
										if ((aFCLActions[j].getId().toUpperCase().indexOf("FULLSCREEN") > 0) && aFCLActions[j].getVisible && aFCLActions[j].getVisible()) {
											oFCLFocusableAction = aFCLActions[j];
										}
									}
								}
							}
						}
						setTimeout(function () {
							oTemplatePrivateGlobalModel.setProperty("/generic/FCL/FCLActionButton",0);
							nFCLActionFlag = oTemplatePrivateGlobalModel.getProperty("/generic/FCL/FCLActionButton");
							if (oFCLFocusableAction) {
								oFCLFocusableAction.focus();
							}
						}, 0);
					}
				});

				// restore sideContent: display of sideContent depends on browser size, and resizing could have happened between last display of object page and now
				// => therefore, state has to be applied explicitly even if we are on the some object as the last time
				oSideContentHandler.applyState(oState.sideContent, bIsSameAsLast);
				oMultipleViewsHandler.applyState(oState.multipleViews, bIsSameAsLast);

				// restore the smart table/chart variant
				oTemplateUtils.oCommonUtils.executeForAllInformationObjects("smartControlWithVariantManagement", function(oSmartControlInfoObject, oSmartControl){
					var sVariantId;
					if (oState.smartControlVariants && oState.smartControlVariants[oSmartControl.getId()] !== undefined) {
						sVariantId = oState.smartControlVariants[oSmartControl.getId()];
					} else {
						if (oTemplateUtils.oCommonUtils.isSmartTable(oSmartControl)) {
							sVariantId = oTemplateUtils.oCommonUtils.getSmartTableDefaultVariant(oSmartControl);
						} else if (oTemplateUtils.oCommonUtils.isSmartChart(oSmartControl)) {
							sVariantId = oTemplateUtils.oCommonUtils.getSmartChartDefaultVariant(oSmartControl);
						}
					}

					oSmartControlInfoObject.afterVariantInitialisePromise.then(function(){
						if (oSmartControl.getCurrentVariantId() !== sVariantId || !bIsSameAsLast) {
							oSmartControlInfoObject.bApplyingVariantFromState = true;
							oSmartControl.setCurrentVariantId(sVariantId);
							oSmartControlInfoObject.bApplyingVariantFromState = false;
						}
					});
				});

				// remaining things: clear search field (not really in appState) and scroll position (would be less exact) should not be applied, if we are on the same object as before
				// don't move other things (exactly stored in appState) here: if opening third column in FCL, then changing these in second column, and then using browser back, the (old) appState would not be applied correct
				if (bIsSameAsLast) {
					if (sSectionId !== (oState.section || "")) {
						oTemplateUtils.oComponentUtils.stateChanged();
					}
					resolveStateApplied();
					fnLayoutFinished();
					return;  // rely on the fact that the state needs not to be adapted, since view is like we left it
				}

				// On object change all search fields should be cleared
				fnClearSearchFields();

				// scroll to the specified section/subsection or to top is no section is specified
				if (oState.section) {
					sSectionId = oState.section;
					oLogger.info("Restoring Selected Section: " + sSectionId, "sap.suite.ui.generic.template.ObjectPage.controller.ControllerImplementation");
					oObjectPage.setSelectedSection(sSectionId);
					if (oState.subSection) {
						var oSubSection;
						aSubSections.some(function(oCurrentSubSection) {
							if (oCurrentSubSection.getId() === oState.subSection) {
								oSubSection = oCurrentSubSection;
								return true;
							}
							return false;
						});

						if (oSubSection) {
							oSubSection.getParent().setSelectedSubSection(oSubSection);
						}

						sSelectedSubSectionId = oState.subSection;
						oLogger.info("Restoring Selected Subsection: " + sSelectedSubSectionId, "sap.suite.ui.generic.template.ObjectPage.controller.ControllerImplementation");
					}
					fnLayoutFinished();
				} else {
					// if no section is specified, scroll to top. In case of editable header fields, "top" depends on whether we are on a draft or an active object,
					// therefore we need to wait for HeaderDataAvailablePromise
					Promise.all([
						oHeaderDataAvailablePromise,
						oTemplateUtils.oComponentUtils.getNavigationFinishedPromise()
					]).then(fnScrollUp);
					sSectionId = "";
				}
				resolveStateApplied();
			};

			oViewProxy.beforeRebind = function(oWaitForPromise) {

				resetWaitForState();
				oWaitForPromise.then(function() {
					setWaitForState("bRebindCompleted");
				});
				if (!fnStateAppliedAfterBindResolve){
					// renew Promise to control, whether app state has been applied
					oStateAppliedAfterBindPromise = new Promise(function(resolve){
						fnStateAppliedAfterBindResolve = resolve;
					});
				}
				oTemplateUtils.oCommonUtils.executeForAllInformationObjects("subSection", function(oInfoObject, oSubSection) {
					oInfoObject.loadingStrategy.inActiveHandler(oSubSection);
				});
			};

			oViewProxy.afterRebind = function() {
				oLogger.info("Call of _triggerVisibleSubSectionsEvents", "", "sap.suite.ui.generic.template.ObjectPage.controller.ControllerImplementation (afterRebind)");
				oObjectPage._triggerVisibleSubSectionsEvents();
			};

			// Loops over all SmartTables with dynamically hidden columns and adapts hiding the columns on the specified context
			// Moreover, ensures that the hiding columns will be adapted on any change of the context (which influences this hiding)
			oViewProxy.applyHeaderContextToSmartTablesDynamicColumnHide = function(oContext){
				var oModel = oContext.getModel();
				// Two scenarios for calling this function:
				// 1. bFirstTimeForContext = New context has been retrieved for this page -> Derive hiding columns for the specified SmartTable
				//                           and register for all relevant updates on that context so that we call the same function with
				// 2. !bFirstTimeForContext = adapt to the change
				var fnExecuteDynamicColumnHide = function(bFirstTimeForContext, oSmartTableInfoObject, oSmartTable){
					// if columns are hidden only statically, no need to refresh hiding here
					if (isEmptyObject(oSmartTableInfoObject.columnHideInfos.columnKeyToHiddenPath)) {
						return;
					}
					var aHiddenColumns = oSmartTableInfoObject.columnHideInfos.staticHiddenColumns.slice(); // start with a copy of the list of statically hidden columns
					// Now add the dynamiccaly hidden columns if applicable
					var fnOnChange = bFirstTimeForContext && fnExecuteDynamicColumnHide.bind(null, false, oSmartTableInfoObject, oSmartTable);
					for (var sColumnKey in oSmartTableInfoObject.columnHideInfos.columnKeyToHiddenPath){
						var sPath = oSmartTableInfoObject.columnHideInfos.columnKeyToHiddenPath[sColumnKey];
						if (oContext.getProperty(sPath)){
							aHiddenColumns.push(sColumnKey);
						}
						if (fnOnChange){
							var oPropertyBinding = oModel.bindProperty(sPath, oContext);
							oPropertyBinding.attachChange(fnOnChange);
						}
					}
					oSmartTable.deactivateColumns(aHiddenColumns); // Note: This will replace the set of hidden columns defined last time
				};
				oTemplateUtils.oCommonUtils.executeForAllInformationObjects("smartTableWithColumnHide", fnExecuteDynamicColumnHide.bind(null, true));
			};

			// End: Filling the viewProxy with functions provided for the TemplateComponent to be called on the view.
			// Note that one last member is added to the viewProxy in onInit, since it is only available at this point in time.

			// Expose selected private functions to unit tests
			/* eslint-disable */
			var fnEditEntity = testableHelper.testable(fnEditEntity, "editEntity");
			var fnIsEntryDeletable = testableHelper.testable(fnIsEntryDeletable, "isEntryDeletable");
			var onActivateImpl = testableHelper.testable(onActivateImpl, "onActivateImpl");
			var onSaveImpl = testableHelper.testable(onSaveImpl, "onSaveImpl");
			testableHelper.testable(function (){return oStateAppliedAfterBindPromise;}, "getStateAppliedPromise");
			/* eslint-enable */

			// Generation of Event Handlers
			var oControllerImplementation = {
				onInit: function() {
					oObjectPage = oController.byId("objectPage");
					fnRegisterForEditableChange();
					var oComponent = oController.getOwnerComponent();
					// create Promise to control, whether app state has been applied
					oStateAppliedAfterBindPromise = new Promise(function(resolve){
						fnStateAppliedAfterBindResolve = resolve;
					});
					// reset Wait for state
					resetWaitForState();
					// Initialize info objects for the sub sections. This allows to iterate over them via oTemplateUtils.oCommonUtils.executeForAllInformationObjects.
					var aSections = oObjectPage.getSections();
					for (var k = 0; k < aSections.length; k++) {
						var oSection = aSections[k];
						var aSubSections = oSection.getSubSections();
						aSubSections.forEach(fnInitSubSectionInfoObject);
					}

					// Create and bind breadcrumbs
					var oTitle = getObjectHeader();
					var oAppComponent = oComponent.getAppComponent();
					var bIsObjectPageDynamicHeaderTitleUsed = oAppComponent.getObjectPageHeaderType() === "Dynamic";
					oViewProxy.aBreadCrumbs = oTitle && (bIsObjectPageDynamicHeaderTitleUsed ? oTitle.getBreadcrumbs().getLinks() : oTitle.getBreadCrumbsLinks()); // If ObjectPageDynamicHeaderTitle is used then oTitle.getBreadcrumbs().getLinks() is used
					(oViewProxy.aBreadCrumbs || []).forEach(function(oLink, i){
						oTemplateUtils.oComponentUtils.registerAncestorTitleUpdater(oLink, "text", i + 1);
					});
					if (bIsObjectPageDynamicHeaderTitleUsed) {
						fnAttachDynamicHeaderStateChangeHandler();
					}
					var fnDisableLazyLoading = function () {
						bWaitForViewPort = false;
						fnHandleStateChangeForAllSubSections();
					};
					oBase.onInit(null, fnDisableLazyLoading, oMessageSorter, getGroupTitle);
					fnEnsureTitleTransfer();
					oTemplateUtils.oCommonUtils.executeGlobalSideEffect();

					oObjectPage.attachEvent("subSectionEnteredViewPort", function(oEvent) {
						var oSubSection = oEvent.getParameter("subSection");
						oLogger.info("Viewport entered ", "Subsection: " + oSubSection.getId(), "sap.suite.ui.generic.template.ObjectPage.controller.ControllerImplementation");

						var oSubSectionInfoObj = getSubSectionInfoObject(oSubSection);
						var oStrategy = oSubSectionInfoObj.loadingStrategy;
						var bExecuteNow = checkGlobalWaitState(oSubSectionInfoObj.loadingStrategy);
						if (bExecuteNow) {
							oStrategy.activeHandler(oSubSection, oSubSectionInfoObj);
						}
					});

					oCreateWithDialogHandler = new CreateWithDialogHandler(oState, oController, oTemplateUtils);
					oState.oCreateWithDialogHandler = oCreateWithDialogHandler;
					oMultipleViewsHandler = new MultipleViewsHandler(oController, oTemplateUtils, oTemplateUtils.oComponentUtils.stateChanged);
					oState.oMultipleViewsHandler = oMultipleViewsHandler;
					var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
					oTemplatePrivateModel.setProperty("/objectPage/aPasteAttachedTables", []);
					oTemplatePrivateModel.setProperty("/objectPage/mHandleEnabledTableToolbar", []);
					// after PageDataLoaded event is fired call fnSetFocusableElementOnObjectPage to set the focus on focusable element of Object page
					oTemplateUtils.oComponentUtils.attach(oController, "PageDataLoaded", function(oEvent) {
						if (oObjectPage && !nFCLActionFlag) {
							var sOPMode = fnGetObjectPageMode(oObjectPage);
							//if mode="Create" and if its not a Sub-Object page creation set bFocusAtTop to true
							if (sOPMode === "Create" && bSubOPCreate !== true) {
								bFocusAtTop = true;
							} else if ((oTemplateUtils.oComponentUtils.isDraftEnabled() && sOPMode === "Create" && bSubOPCreate === true) || (!oTemplateUtils.oComponentUtils.isDraftEnabled() && sOPMode === "Display" && bSubOPCreate === true)) {
								bSubOPCreate = false; //unset the bSubOPCreate flag if already set
							}
							fnSetFocusableElementOnObjectPage(oObjectPage);
						}
					});

					// initialize InfoObjects for tables and charts (at least for charts, chartInit seems to be too late to ensure correct restoring of variants from appstate)
					var oSectionSettings = oTemplateUtils.oComponentUtils.getParameterModelForTemplating().getObject("/templateSpecific/sectionsMap");
					for (var sId in oSectionSettings){
						switch (oSectionSettings[sId].annotation){
						case "com.sap.vocabularies.UI.v1.LineItem":
							var oSmartTable = oController.byId(StableIdHelper.getStableId({type: "ObjectPageTable", subType: "SmartTable", sFacet: oSectionSettings[sId].facetId}));
							if (oSmartTable){
								getSmartTableInfoObject(oSmartTable);
							}
							break;
						case "com.sap.vocabularies.UI.v1.Chart":
							var oSmartChart = oController.byId(oSectionSettings[sId].facetId + "::Chart"); // preliminary
							if (oSmartChart){ // preliminary
								getSmartChartInfoObject(oSmartChart);
							}
							break;
						}
					}

				},

				handlers: {

					/*
					 * Called to toggle between Display Active Version and Continue Editing buttons in the Draft Root.
					 *
					 * @param  {oSource, bHasDraftEntity}
					 * oSource : {sap.uxap.ObjectPageHeaderActionButton} : The Event source. The Button That triggers the request to navigate to active or draft version.
					 * bHasDraftEntity : {boolean} : To specify if the current context has draft.
					 *
					 */
					onEditAndActiveToggle: function(oSource, bHasDraftEntity) {
						oTemplateUtils.oServices.oApplication.performAfterSideEffectExecution(function() {
							var oBusyHelper = oTemplateUtils.oServices.oApplication.getBusyHelper();
							if (oBusyHelper.isBusy()) {
								return; // Ignore user interaction while the app is busy.
							}
							// Getting the sibling context to navigate.
							var oContext = oSource.getBindingContext();
							var oSiblingContextPromise = oTemplateUtils.oServices.oApplication.getDraftSiblingPromise(oContext);
							oBusyHelper.setBusy(oSiblingContextPromise.then(function(oSiblingContext) {
								if (bHasDraftEntity) {
									oLogger.info("Navigating to draft entity", "sap.suite.ui.generic.template.ObjectPage.controller.ControllerImplementation");
									fnStartEditing(oSiblingContext, true);
								} else {
									oLogger.info("Navigating to active entity", "sap.suite.ui.generic.template.ObjectPage.controller.ControllerImplementation");
									oTemplateUtils.oServices.oApplication.navigateToSubContext(oSiblingContext, true, 1);
								}
								// After the navigation, the soruce button becomes invisible.
								// As a result, the foucs moves to the next button(if this next button is visible) in the toolbar.
								// If the this next button is not visible, then focus shifts to body.
								// To maintain consistency, we move the focus to the dom-body.
								Selectors(':focus').blur();
							}));
						});
					},

					onAfterVariantInitialise: function(oEvent){
						var oControl = oEvent.getSource();
						var oInfoObject;
						if (oTemplateUtils.oCommonUtils.isSmartTable(oControl)) {
							oInfoObject = getSmartTableInfoObject(oControl);
						} else if (oTemplateUtils.oCommonUtils.isSmartChart(oControl)) {
							oInfoObject = getSmartChartInfoObject(oControl);
						}
						if (oInfoObject.afterVariantInitialiseResolve){
							oInfoObject.afterVariantInitialiseResolve();
							delete oInfoObject.afterVariantInitialiseResolve;
						}
					},

					onAfterVariantSave: function(oEvent) {
						informVariantSelectionChanged(oEvent);
					},

					onAfterVariantApply: function(oEvent) {
						informVariantSelectionChanged(oEvent);
					},

					addEntry: fnAddEntry,


					onCancelCreateWithPopUpDialog: function() {
						oCreateWithDialogHandler.onCancelPopUpDialog();
					},
					onSaveCreateWithPopUpDialog : function(oEvent) {
						oCreateWithDialogHandler.onSavePopUpDialog(oEvent);
					},

					submitChangesForSmartMultiInput: function() {
						if (oTemplateUtils.oComponentUtils.isDraftEnabled()) {
							oTemplateUtils.oCommonEventHandlers.submitChangesForSmartMultiInput();
						}
					},
					contextEditableChanged : function(oEvent){
						var oSmartField = oEvent.getSource();
						var oSFEditableBinding =  oSmartField.getBindingInfo('editable');
						if ( oSFEditableBinding && oSFEditableBinding.binding && oSFEditableBinding.binding.getValue && !oSFEditableBinding.binding.getValue() ) {
							oSmartField.setEditable(false);
						}
					},

					deleteEntry: function (oEvent) {
						var oListItem = oEvent.getParameter('listItem');
						var oListItemContext = oListItem.getBindingContext();
						var oSmartTable = oTemplateUtils.oCommonUtils.getOwnerControl(oEvent.getSource());
						if (!oTemplateUtils.oCommonUtils.isSmartTable(oSmartTable)) {
							oSmartTable = oSmartTable.getParent();
						}
						var aContexts = [oListItemContext];
						var sUiElementId = oEvent.getSource().getId();
						fnDeleteEntriesImpl(oSmartTable, aContexts, sUiElementId);
					},

					deleteEntries: function (sFacetId) {
						var sIdForDeleteButton = StableIdHelper.getStableId({
							type: "ObjectPageAction",
							subType: "Delete",
							sFacet: sFacetId
						});
						oTemplateUtils.oCommonUtils.executeIfControlReady(fnDeleteEntries, sIdForDeleteButton);
					},

					onSelectionChange: function(oEvent) {
						var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
						var mHandleEnabledTableToolbar = oTemplatePrivateModel.getProperty("/objectPage/mHandleEnabledTableToolbar");
						// Add the id of the table (only if its not present) for which we have to handle enablement of toolbar button.
						// One specific scenario is when we cancel OP in non draft. Selection is lost but toolbar buttons are enabled.
						if (!mHandleEnabledTableToolbar[oEvent.getSource().getId()]) {
							mHandleEnabledTableToolbar[oEvent.getSource().getId()] = true;
						}
						oTemplateUtils.oCommonUtils.setEnabledToolbarButtons(oEvent.getSource());
					},

					// selectionChange for MultiSelectionPlugin
					onMultiSelectionChange: function (oEvent) {
						oTemplateUtils.oCommonEventHandlers.onMultiSelectionChange(oEvent);
					},

					//Cancel event for draft and non draft case
					onCancel: function(oEvent) {
						var oCancelButton = oEvent.getSource();
						var oCancelPromise = oBase.state.onCancel(oCancelButton);
						oCancelPromise.then(function(){
							fnDetachPasteHandlers();
							// for non draft apps call fnSetFocusableElementOnObjectPage after Cancel
							if (!oTemplateUtils.oComponentUtils.isDraftEnabled()) {
								fnSetFocusableElementOnObjectPage(oObjectPage);
								var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
								var mHandleEnabledTableToolbar = oTemplatePrivateModel.getProperty("/objectPage/mHandleEnabledTableToolbar");
								for (var sButtonId in mHandleEnabledTableToolbar) {
									if (mHandleEnabledTableToolbar[sButtonId]) {
										oTemplateUtils.oCommonUtils.setEnabledToolbarButtons(oController.byId(sButtonId));
										delete mHandleEnabledTableToolbar[sButtonId];
									}
								}
							}
						});
					},

					onContactDetails: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onContactDetails(oEvent);
					},
					onSmartFieldInitialise: function(oEvent) {
						var sViewId = this.getView().getId();
						oTemplateUtils.oCommonEventHandlers.onSmartFieldInitialise(oEvent, sViewId);
					},
					onPressDraftInfo: function(oEvent) {
						var oBindingContext = oController.getView().getBindingContext();
						var oLockButton = sap.ui.getCore().byId(
							oEvent.getSource().getId() + (oEvent.getId() === "markChangesPress" ? "-changes" : "-lock"));

						oTemplateUtils.oCommonUtils.showDraftPopover(oBindingContext, oLockButton);
					},
					onPressDraftInfoObjectPageDynamicHeaderTitle: function(oEvent) {
						var oBindingContext = oController.getView().getBindingContext();
						var oLockButton = oController.byId("template::ObjectPage::ObjectMarkerObjectPageDynamicHeaderTitle");
						oTemplateUtils.oCommonUtils.showDraftPopover(oBindingContext, oLockButton);
					},

					onShareObjectPageActionButtonPress: function(oEvent) {
						oTemplateUtils.oCommonUtils.executeIfControlReady(onShareObjectPageActionButtonPressImpl, "template::Share");
					},

					onRelatedApps: function(oEvent) {
						var oButton, oURLParsing, oParsedUrl, oViewBindingContext, oAppComponent, oXApplNavigation, oLinksDeferred;
						var oActionSheet, oButtonsModel, oUshellContainer, sCurrentSemObj, sCurrentAction;
						var aSemanticObjects = [];
						oButton = oEvent.getSource();
						oUshellContainer = sap.ushell && sap.ushell.Container;
						oURLParsing = oUshellContainer && oUshellContainer.getService("URLParsing");
						oParsedUrl = oURLParsing.parseShellHash(
							document.location.hash);
						sCurrentSemObj = oParsedUrl.semanticObject;
						sCurrentAction = oParsedUrl.action;
						oViewBindingContext = oController.getView && oController.getView().getBindingContext();
						var oSettings = oTemplateUtils.oComponentUtils.getSettings();

						var oMetaModel = oController.getOwnerComponent().getModel().getMetaModel();

						var oEntity = oViewBindingContext.getObject();
						var sEntityType = oEntity.__metadata.type;
						var oDataEntityType = oMetaModel.getODataEntityType(sEntityType);
						var aSemKey = oDataEntityType["com.sap.vocabularies.Common.v1.SemanticKey"];
						var oParam = {};
						// var oSemKeyParam = {};
						if (aSemKey && aSemKey.length > 0) {
							for (var j = 0; j < aSemKey.length; j++) {
								var sSemKey = aSemKey[j].PropertyPath;
								if (!oParam[sSemKey]) {
									oParam[sSemKey] = oEntity[sSemKey];
								}
							}
						} else {
							// Fallback if no SemanticKey
							for (var k in oDataEntityType.key.propertyRef) {
								var sObjKey = oDataEntityType.key.propertyRef[k].name;
								if (!oParam[sObjKey]) {
									oParam[sObjKey] = oEntity[sObjKey];
								}
							}
						}

						oAppComponent = oController.getOwnerComponent().getAppComponent();
						oXApplNavigation = oUshellContainer && oUshellContainer.getService("CrossApplicationNavigation");

						if (oSettings.relatedAppsSettings && Object.keys(oSettings.relatedAppsSettings).length > 0) {
							// from the parsed url
							var aCurrentSemanticObject = [
								{ semanticObject: sCurrentSemObj }
							];
							aSemanticObjects.push(aCurrentSemanticObject);

							// from the manifest
							for (var i = 0; i < Object.keys(oSettings.relatedAppsSettings).length; i++) {
								// to make sure that no duplicate entry is added
								if (oSettings.relatedAppsSettings[i].semanticObject !== sCurrentSemObj) {
									aCurrentSemanticObject = [
										{ semanticObject: oSettings.relatedAppsSettings[i].semanticObject }
									];
									aSemanticObjects.push(aCurrentSemanticObject);
								}
							}

							oLinksDeferred = oXApplNavigation.getLinks(aSemanticObjects);
						} else {
							oLinksDeferred = oXApplNavigation.getLinks({
								semanticObject: sCurrentSemObj,
								params: oParam,
								ui5Component: oAppComponent
							});
						}

						getRelatedAppsSheet().then(function (oFragment) {
							oActionSheet = oFragment;
							oButtonsModel = oActionSheet.getModel("buttons");
							oButtonsModel.setProperty("/buttons", []);
							oActionSheet.openBy(oButton);
							oLinksDeferred.done(function(aLinks) {
								var aButtons = [], aAllLinks = [], relatedAppSettings;
								var aSemanticObjectUnavailableActions = oDataEntityType["com.sap.vocabularies.Common.v1.SemanticObjectUnavailableActions"];
								var aUnavailableActions = [];
								if (aSemanticObjectUnavailableActions) {
									for (var i = 0; i < aSemanticObjectUnavailableActions.length; i++) {
										aUnavailableActions.push(aSemanticObjectUnavailableActions[i].String);
									}
								}

								for (var i = 0; i < oDataEntityType.property.length; i++) {
									if (oDataEntityType.property[i]["com.sap.vocabularies.Common.v1.SemanticObjectUnavailableActions"]) {
										var len = oDataEntityType.property[i]["com.sap.vocabularies.Common.v1.SemanticObjectUnavailableActions"].length;
										for (var j = 0; j < len; j++) {
											aUnavailableActions.push(oDataEntityType.property[i]["com.sap.vocabularies.Common.v1.SemanticObjectUnavailableActions"][j].String);
										}
									}
								}

								relatedAppSettings = oTemplateUtils.oComponentUtils.getSettings().relatedAppsSettings;
								if (relatedAppSettings && Object.keys(relatedAppSettings).length > 0) {
									for (var i = 0; i < aLinks.length; i++) {
										for (var j = 0; j < aLinks[i].length; j++) {
											for (var k = 0; k < aLinks[i][j].length; k++) {
												aAllLinks.push(aLinks[i][j][k]);
											}
										}
									}
									aLinks = aAllLinks;
								}

								// Sorting the related app links alphabetically to align with Navigation Popover in List Report - BCP(1770251716)
								aLinks.sort(function(oLink1, oLink2) {
									if (oLink1.text < oLink2.text) {
										return -1;
									}
									if (oLink1.text > oLink2.text) {
										return 1;
									}
									return 0;
								});

								// filter current semanticObject-action
								for (var i = 0; i < aLinks.length; i++) {
									var oLink = aLinks[i];
									var sIntent = oLink.intent;
									var sSemanticObject = sIntent.split("-")[0].split("#")[1];
									var sAction = sIntent.split("-")[1].split("?")[0];
									if ((sSemanticObject === sCurrentSemObj ? sAction !== sCurrentAction : true) && aUnavailableActions.indexOf(sAction) == -1) {
										aButtons.push({
											enabled: true, // used in declarative binding
											text: oLink.text, // used in declarative binding
											link: oLink, // used by the event handler
											param: oParam
											// used by the event handler
										});
									}
								}
								if (aButtons.length === 0) {
									aButtons.push({
										enabled: false, // used in declarative binding
										text: oTemplateUtils.oCommonUtils.getText("NO_RELATED_APPS")
										// used in declarative binding
									});
								}
								oButtonsModel.setProperty("/buttons", aButtons);
							});
						});
					},
					onEdit: function(oEvent) {
						var oEditButton = oController.byId("edit");
						var oObjectPage = oController.byId("objectPage");
						var sSectionSelected = oObjectPage.getSelectedSection();
						var aObjectPageSections = oObjectPage.getSections() || [];
						// To set flag bFocusAtTop = true, if scroll position is initial and the selected section is the first visible section else bFocusAtTop = false
						for (var i = 0; i < aObjectPageSections.length; i++) {
							if (aObjectPageSections[i].getVisible() && aObjectPageSections[i]._bInternalVisible !== false) {
								if (aObjectPageSections[i].getId() === sSectionSelected) {
									bFocusAtTop = true;
								} else {
									bFocusAtTop = false;
								}
								break;
							}
						}
						if (oEditButton.data("CrossNavigation")) {
							// intent based navigation
							oTemplateUtils.oCommonEventHandlers.onEditNavigateIntent(oEditButton);
							return;
						}
						oTemplateUtils.oCommonUtils.executeIfControlReady(fnEditEntity,"edit");
					},
					onSave: onSave,
					onSaveAndContinueEdit: onSaveAndContinueEdit,
					onSmartFieldUrlPressed: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onSmartFieldUrlPressed(oEvent, oBase.state);
					},
					onBreadCrumbUrlPressed: onBreadCrumbUrlPressed,
					onDelete: onDelete,
					onCallActionFromToolBar: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onCallActionFromToolBar(oEvent, oBase.state);
					},
					onCallAction: function(sAction, sLabel, sInvocationGrouping) {
						oTemplateUtils.oServices.oApplication.performAfterSideEffectExecution(function(){
							var oBindingContext = oController.getView().getBindingContext();
							if (oBindingContext) {
								//var oEventSource = oEvent.getSource();
								oTemplateUtils.oCommonUtils.processDataLossConfirmationIfNonDraft(function() {
									var oComponent = oController.getOwnerComponent();
									var sEntitySet = oComponent.getEntitySet();
									var mParameters = {
										functionImportPath: sAction,
										contexts: [oBindingContext],
										sourceControl: "",
										label: sLabel,
										operationGrouping: sInvocationGrouping
									};
									oTemplateUtils.oServices.oCRUDManager.callAction(mParameters).then(function(aResponses) {
										var oResponse = aResponses && aResponses[0];
										if (oResponse && oResponse.response && oResponse.response.context && (!oResponse.actionContext || oResponse.actionContext && oResponse.response.context.getPath() !== oResponse.actionContext.getPath())) {
											// set my parent page to dirty
											oTemplateUtils.oServices.oViewDependencyHelper.setParentToDirty(oComponent, sEntitySet, 1);
										}
									});
								}, Function.prototype, oBase.state, "Proceed");
							}
						}, true);
					},
					onDataFieldForIntentBasedNavigation: function(oEvent) {
						oEvent = merge({}, oEvent);
						oTemplateUtils.oServices.oApplication.performAfterSideEffectExecution(function(){
							oTemplateUtils.oCommonUtils.processDataLossConfirmationIfNonDraft(function(){
								oTemplateUtils.oCommonEventHandlers.onDataFieldForIntentBasedNavigation(oEvent, oBase.state);
							});
						}, true);
					},
					onDataFieldWithIntentBasedNavigation: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onDataFieldWithIntentBasedNavigation(oEvent, oBase.state);
					},
					onDataFieldWithNavigationPath: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onDataFieldWithNavigationPath(oEvent);
					},
					onChartInit: function(oEvent) {
						var oSmartChart = oEvent.getSource();
						getSmartChartInfoObject(oSmartChart); // initialize the info object for SmartChart
						oSmartChart.getChartAsync().then(function(oChart){
							var fnOnSelectionChange = oController._templateEventHandlers.onSelectionChange;
							oChart.attachSelectData(fnOnSelectionChange).attachDeselectData(fnOnSelectionChange);
							oTemplateUtils.oCommonUtils.checkToolbarIntentsSupported(oSmartChart);
						});
					},
					onDataRequested: function(sId){
						oLogger.info("Data requested", "SmartTable: " + sId, "sap.suite.ui.generic.template.ObjectPage.controller.ControllerImplementation");
						oMultipleViewsHandler.onDataRequested(sId);
					},
					onDataReceived: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onDataReceived(oEvent);
					},
					onBeforeRebindDetailTable: function(oEvent) {
						var oSmartTable = oEvent.getSource();
						// Attach dataRecieved event
						oEvent.mParameters.bindingParams.events["dataReceived"] = setNoDataTextIfRequired.bind(null, oSmartTable);
						// Set data loading text when data is loading
						oSmartTable.setNoData(oTemplateUtils.oCommonUtils.getText("WAITING_SMARTTABLE"));
						var oBindingParams = adjustAndProvideBindingParamsForSmartTableOrChart(oEvent);
						// add the content of the search field to the search if necessary
						var oSmartTableInfoObject = getSmartTableInfoObject(oSmartTable);
						var oSearchField = oSmartTableInfoObject.searchField;
						if (oSearchField){ // note that in this case the info object for the search field surely exists
							var oSearchFieldInfoObject = oTemplateUtils.oCommonUtils.getControlInformation(oSearchField);
							if (oSearchFieldInfoObject.searchString){
								oBindingParams.parameters.custom = {
									search: oSearchFieldInfoObject.searchString
								};
							}
						}

						oTemplateUtils.oCommonEventHandlers.onBeforeRebindTable(oEvent, {
							ensureExtensionFields: oController.templateBaseExtension.ensureFieldsForSelect,
							addExtensionFilters: oController.templateBaseExtension.addFilters,
							isFieldControlRequired:true,
							isPopinWithoutHeader: true,
							isDataFieldForActionRequired: true,
							isFieldControlsPathRequired: true,
							isMandatoryFiltersRequired: true
						});
						oController.onBeforeRebindTableExtension(oEvent);
						oMultipleViewsHandler.onRebindContentControl(oSmartTable.getId(), oBindingParams);
						fnAdaptBindingParamsForInlineCreate(oEvent);
						if (oTemplateUtils.oCommonUtils.isAnalyticalTable(oSmartTable.getTable())) {
							oBindingParams.parameters.entitySet = oSmartTable.getEntitySet();
						}
					},
					onListNavigate: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onListNavigate(oEvent, oBase.state);
					},
					onBeforeSemanticObjectLinkPopoverOpens: function(oEvent) {
						var oEventParameters = oEvent.getParameters();
						var sSelectionVariant = getSelectionVariant();
						oTemplateUtils.oCommonUtils.semanticObjectLinkNavigation(oEventParameters, sSelectionVariant, oController);
					},

					onBeforeSemanticObjectLinkNavigationCallback: function() {
						return new Promise(function(resolve) {
							oTemplateUtils.oServices.oDataLossHandler.performIfNoDataLoss(function () {
								resolve(true);
							}, function() {
								resolve(false);
							});
						});
					},

					onSemanticObjectLinkNavigationPressed: function(oEvent) {
						var oEventParameters = oEvent.getParameters();
						var oEventSource = oEvent.getSource();
						oTemplateUtils.oCommonEventHandlers.onSemanticObjectLinkNavigationPressed(oEventSource, oEventParameters);
					},

					onSemanticObjectLinkNavigationTargetObtained: function(oEvent) {
						var oEventParameters = oEvent.getParameters();
						var oEventSource = oEvent.getSource(); //set on semanticObjectController
						oTemplateUtils.oCommonEventHandlers.onSemanticObjectLinkNavigationTargetObtained(oEventSource, oEventParameters, oBase.state);
						//fnOnSemanticObjectLinkNavigationTargetObtained(oEvent);
					},
					onSemanticObjectLinkNavigationTargetObtainedSmartLink: function(oEvent) {
						var oEventParameters, oEventSource;
						oEventParameters = oEvent.getParameters();
						oEventSource = oEvent.getSource(); //set on smart link
						// set on smart table
						while (oEventSource.getMetadata().getName() !== "sap.ui.comp.smarttable.SmartTable" && oEventSource.getParent()) {
							oEventSource = oEventSource.getParent();
						}
						oTemplateUtils.oCommonEventHandlers.onSemanticObjectLinkNavigationTargetObtained(oEventSource, oEventParameters, oBase.state);
					},
					onHeaderImagePress: function(oEvent) {
						if (oEvent.getSource().getSrc() === "") {
							return;
						}
						var sId = oEvent.getSource().getId();
						var sSource = oEvent.getSource().getSrc();
						getImageDialog().then(function (oImageDialog) {
							oImageDialog.addAriaLabelledBy(sId);
							var oImageDialogModel = oImageDialog.getModel("headerImage");
							oImageDialogModel.setProperty("/src", sSource);
							if (sap.ui.Device.system.phone) {
								oImageDialog.setProperty("stretch", true);
							}
							oImageDialog.open();
						});
					},
					sectionChange: fnSectionChanged,
					onSwitchTabs:  fnOnSwitchTabs,
					onInlineDataFieldForAction: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onInlineDataFieldForAction(oEvent, oBase.state);
					},
					onInlineDataFieldForIntentBasedNavigation: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onInlineDataFieldForIntentBasedNavigation(oEvent.getSource(), oBase.state);
					},
					onDeterminingDataFieldForAction: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onDeterminingDataFieldForAction(oEvent);
					},
					onBeforeRebindChart: function(oEvent) {
						adjustAndProvideBindingParamsForSmartTableOrChart(oEvent);
						var oSmartChart = oEvent.getSource();
						setNoDataChartTextIfRequired(oSmartChart);
						oSmartChart.getChartAsync().then(function(oChart){
							oSmartChart.oModels = oChart.oPropagatedProperties.oModels;
						});
						var oCallbacks = {
							ensureExtensionFields: Function.prototype, // needs further clarification
							addExtensionFilters: oController.templateBaseExtension.addFilters,
							isFieldControlRequired: true,
							isMandatoryFiltersRequired: true
						};
						oTemplateUtils.oCommonUtils.onBeforeRebindTableOrChart(oEvent, oCallbacks);
					},
					// forward handlers for side content related events to SideContentHandler
					onToggleDynamicSideContent: oSideContentHandler.onToggleDynamicSideContent,
					sideContentBreakpointChanged: oSideContentHandler.sideContentBreakpointChanged,

					onTableInit: function(oEvent, sCurrentFacet) {
						var oSmartTable = oEvent.getSource();
						oSmartTable.setEnableDataStateFiltering(true);
						var oTable = oSmartTable.getTable();
						var oInfoObject = getSmartTableInfoObject(oSmartTable);
						if (oInfoObject.columnHideInfos) {
							// initially hide all columns which are statically hidden
							oSmartTable.deactivateColumns(oInfoObject.columnHideInfos.staticHiddenColumns);
						}
						oTemplateUtils.oCommonUtils.checkToolbarIntentsSupported(oSmartTable);
						// this event gets fired when the visibilty of any subsection changes or incase of Icon tab bar mode when a different tab is selected
						oObjectPage.attachEvent("subSectionVisibilityChange", function(oEvent) {
							if (oTable.isA("sap.m.Table") || oTable.isA("sap.ui.table.Table")) {
								fnApplyTableThresholdValueAndCssClass(oSmartTable, oTable, sCurrentFacet);
							}
						});
						if (fnIsSmartTableWithInlineCreate(oSmartTable) && !oSmartTable.data("CrossNavigation")) {
							oTable.addEventDelegate({
								// CTRL + ENTER Shortcut to add an entry for tables with inline support.
								onkeyup: function(oEvent) {
									if (oEvent.ctrlKey && oEvent.keyCode === KeyCodes.ENTER && oSmartTable.getEditable()) {
										addEntryForInlineCreate(oSmartTable, oSmartTable);
										oEvent.preventDefault();
										oEvent.setMarked();
									}
								}
							});
						}

						var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
						if (fnIsSmartTableWithInlineCreate(oSmartTable)){
							oTable.addEventDelegate({
								//Attach paste handlers for tables in edit mode
								onAfterRendering: function(oEvent) {
									var aPasteAttachedTables;
									if (oSmartTable.getEditable() && !oSmartTable.hasListeners("paste")) {
										oSmartTable.attachBeforePaste(fnOnBeforeSmartTablePaste);
										oSmartTable.attachPaste(fnOnSmartTablePaste);
										aPasteAttachedTables = oTemplatePrivateModel.getProperty("/objectPage/aPasteAttachedTables");
										if (aPasteAttachedTables) {
											aPasteAttachedTables.push(sCurrentFacet);
										}
									}
								}
							});
						}
					},
					onPasteButtonPress: function(oEvent) {
						var sMessage = oTemplateUtils.oCommonUtils.getText("DATA_PASTE_ACTION_MESSAGE");
						MessageBox.information(sMessage);
					},
					onSearchObjectPage: onSearchObjectPage,
					onSearchLiveChange: onSearchLiveChange,
					onSmartTablePaste: fnOnSmartTablePaste,
					onUITableExpand: fnHandleUITableExpand,
					onSingleSectionOrSubsectionVisible: fnIsSingleSectionOrSubsectionVisible,
					dataStateFilter: fnDataStateFilter
				},
				formatters: {
					sideContentActionButtonText: oSideContentHandler.formatSideContentActionButtonText,

					setNoDataTextForSmartTable: function(sSmartTableId) {
						if (oTemplateUtils.oCommonUtils && sSmartTableId) {
							var sNoDataText = oTemplateUtils.oCommonUtils.getContextText("WAITING_SMARTTABLE", sSmartTableId);
							if (sNoDataText !== "WAITING_SMARTTABLE") {
								return sNoDataText;
							}
							return "";
						}
					},

					setVMVisibilityForVendor: function() {
						var oUriParameters = new UriParameters(window.location.href);
						if (oUriParameters.mParams["sap-ui-layer"]) {
							var aUiLayer = oUriParameters.mParams["sap-ui-layer"];
							for (var i = 0; i < aUiLayer.length; i++) {
								if (aUiLayer[i].toUpperCase() === "VENDOR"){
									return true;
								}
							}
						}
						return false;
					},

					/*
						Formats the Text to be shown in the segmented button used for multple views in object page tables
					*/
					formatItemTextForMultipleView: function(oItem) {
						return oItem && oMultipleViewsHandler ? oMultipleViewsHandler.formatItemTextForMultipleView(oItem) : "";
					}
				},
				extensionAPI: new ExtensionAPI(oTemplateUtils, oController, oBase, oState)
			};

			oControllerImplementation.handlers = extend(oBase.handlers, oControllerImplementation.handlers);

			return oControllerImplementation;
		}
	};
	return oMethods;
});
