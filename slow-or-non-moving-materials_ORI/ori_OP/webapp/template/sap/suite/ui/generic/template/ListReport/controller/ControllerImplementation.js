/* global window */
sap.ui.define([
	"sap/ui/model/Filter",
	"sap/suite/ui/generic/template/ListReport/extensionAPI/ExtensionAPI",
	"sap/suite/ui/generic/template/listTemplates/listUtils",
	"sap/suite/ui/generic/template/ListReport/controller/IappStateHandler",
	"sap/suite/ui/generic/template/ListReport/controller/MultipleViewsHandler",
	"sap/suite/ui/generic/template/ListReport/controller/WorklistHandler",
	"sap/suite/ui/generic/template/lib/ShareUtils",
	"sap/suite/ui/generic/template/lib/FeLogger",
	"sap/base/util/ObjectPath",
	"sap/suite/ui/generic/template/js/StableIdHelper",
	"sap/base/util/deepExtend",
	"sap/suite/ui/generic/template/lib/CreateWithDialogHandler",
	"sap/suite/ui/generic/template/listTemplates/semanticDateRangeTypeHelper",
	"sap/suite/ui/generic/template/ListReport/controller/MultiEditHandler"
], function(Filter, ExtensionAPI, listUtils, IappStateHandler, MultipleViewsHandler,
		        WorklistHandler, ShareUtils, FeLogger, ObjectPath, StableIdHelper, deepExtend, CreateWithDialogHandler, SemanticDateRangeHelper, MultiEditHandler) {
	"use strict";

	var oLogger = new FeLogger("ListReport.controller.ControllerImplementation").getLogger();
	var oMethods = {
		getMethods: function(oViewProxy, oTemplateUtils, oController) {
			/**
			 * contains instance attributes that are shared with helper classes:
			 * oSmartFilterbar, oSmartTable, oIappStateHandler, oMultipleViewsHandler, bLoadListAndFirstEntryOnStartup, oWorklistData, oWorklistHandler, sNavType
			 * and functions updateControlOnSelectionChange and (from oIappStateHandler) getCurrentAppState.
			 * Initialized in onInit.
			 * Note: in multiple views multiple tables mode oSmartTable will be switched to the smart control responsible for the current tab on each tab change.
			 * In this case oSmartTable may even be a SmartChart.
			 */
			var oState = {};

			oState.oWorklistData = {
				bWorkListEnabled: false,
				bVariantDirty: true
			}; //object which saves worklist related data

			var oFclProxy;

			var aWaitingForDisplayNextObjectInfo = null;

			// -- Begin of methods that are used in onInit only
			function fnSetIsLeaf() {
				var oComponent = oController.getOwnerComponent();
				var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
				oTemplatePrivateModel.setProperty("/listReport/isLeaf", oComponent.getIsLeaf());
			}

			function onSmartFilterBarInitialise(oEvent) {
				oController.onInitSmartFilterBarExtension(oEvent);
				oController.templateBaseExtension.onInitSmartFilterBar(oEvent);
				oState.oIappStateHandler.onSmartFilterBarInitialise();
			}

			var fnStartUpResolve;
			var oStartUpPromise = new Promise(function(resolve){
				fnStartUpResolve = resolve;
			});
			oStartUpPromise.then(function() {
				fnStartUpResolve = null;
			});

			var onSmartFilterBarInitialized;
			var oSmartFilterBarInitializedPromise = new Promise(function(fnResolve){
				onSmartFilterBarInitialized = fnResolve;
			});

			function onFilterChange() {
				if (!fnStartUpResolve) {
					oState.oIappStateHandler.changeIappState(true, false);
				}
			}

			// oControl is either a SmartTable or a SmartChart
			function fnUpdateControlOnSelectionChange(oControl) {
				oTemplateUtils.oCommonUtils.setEnabledToolbarButtons(oControl);
				if (!oTemplateUtils.oCommonUtils.isSmartChart(oControl)) { //Chart does not have footer buttons
					oTemplateUtils.oCommonUtils.setEnabledFooterButtons(oControl);
				}
			}

			function fnRegisterToChartEvents(oEvent) {
				var oSmartChart;
				oSmartChart = oEvent.getSource();
				oSmartChart.getChartAsync().then(function(oChart){
					//attach to the selectData event of the sap.chart.Chart
					oChart.attachSelectData(fnUpdateControlOnSelectionChange.bind(null, oSmartChart));
					oChart.attachDeselectData(fnUpdateControlOnSelectionChange.bind(null, oSmartChart));
				});
			}

			function fnOnSemanticObjectLinkNavigationPressed(oEvent) {
				var oEventParameters = oEvent.getParameters();
				var oEventSource = oEvent.getSource();
				oTemplateUtils.oCommonEventHandlers.onSemanticObjectLinkNavigationPressed(oEventSource, oEventParameters);
			}

			function fnOnSemanticObjectLinkNavigationTargetObtained(oEvent) {
				var oEventParameters, oEventSource;
				oEventParameters = oEvent.getParameters();
				oEventSource = oEvent.getSource();	//set on semanticObjectController
				oTemplateUtils.oCommonEventHandlers.onSemanticObjectLinkNavigationTargetObtained(oEventSource, oEventParameters, oState, undefined, undefined);
			}

			function fnOnSemanticObjectLinkNavigationTargetObtainedSmartLink(oEvent) {
				var oMainNavigation, sTitle, oCustomData, sDescription, oEventParameters, oEventSource;
				oMainNavigation = oEvent.getParameters().mainNavigation;
				oEventParameters = oEvent.getParameters();
				oEventSource = oEvent.getSource(); //set on smart link
				if (oMainNavigation) {
					sTitle = oEventSource.getText && oEventSource.getText();
					oCustomData = oTemplateUtils.oCommonUtils.getCustomData(oEvent);
					if (oCustomData && oCustomData["LinkDescr"]) {
						sDescription = oCustomData["LinkDescr"];
						oMainNavigation.setDescription(sDescription);
					}
				}
				oEventSource = oState.oSmartTable; //set on smart table
				oTemplateUtils.oCommonEventHandlers.onSemanticObjectLinkNavigationTargetObtained(oEventSource, oEventParameters, oState, sTitle, oMainNavigation);
				//oEventParameters.show(sTitle, oMainNavigation, undefined, undefined);
			}

			function getItemInTable(sContextPath) {
				var aItems = oViewProxy.getItems();
				for (var i = 0; i < aItems.length; i++) {
					if (!sContextPath || aItems[i].getBindingContextPath() === sContextPath) {
						return aItems[i];
					}
				}
			}

			function fnNavigateToListItemProgrammatically(oItem){
				oTemplateUtils.oCommonEventHandlers.onListNavigate(oItem, oState, undefined, true);
			}

			function addEntryImpl(oPredefinedValues, oButton) {
				  oTemplateUtils.oCommonUtils.processDataLossConfirmationIfNonDraft(function() {
					    oTemplateUtils.oCommonEventHandlers.addEntry(oButton, false, oState.oSmartFilterbar, oPredefinedValues);
				  }, Function.prototype, oState);
			}

			function addEntry(sVariantKey) {
				var sIdForCreateButton = StableIdHelper.getStableId({
					type: "ListReportAction",
					subType: "Create",
					sQuickVariantKey : sVariantKey
				});
				var sIdForCreationDialog = StableIdHelper.getStableId({
					type: "ListReportAction",
					subType: "CreateWithDialog"
				});
				if (sIdForCreationDialog && oController.byId(sIdForCreationDialog)) {
					oController.byId(sIdForCreationDialog).setVisible(true);
					oTemplateUtils.oCommonUtils.executeIfControlReady(oState.oCreateWithDialogHandler.createWithDialog.bind(null, oController.byId(sIdForCreationDialog)), sIdForCreateButton);
				} else {
					oTemplateUtils.oCommonUtils.executeIfControlReady(addEntryImpl.bind(null, undefined), sIdForCreateButton);
				}
			}

			function addEntryWithFilters(oEvent) {
				var oCreateWithFilters = oController.getOwnerComponent().getCreateWithFilters();
				var sStrategy = oCreateWithFilters.strategy || "extension";
				var oPredefinedValues;
				switch (sStrategy) {
					case "extension":
						oPredefinedValues = oController.getPredefinedValuesForCreateExtension(oState.oSmartFilterbar);
						break;
					default:
						oLogger.error(sStrategy + " is not a valid strategy to extract values from the SmartFilterBar");
						return;
				}
				addEntryImpl(oPredefinedValues, oEvent.getSource());
			}

			function fnDeleteEntries(oEvent) {
				var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
				var bDeleteEnabled = oTemplatePrivateModel.getProperty("/listReport/deleteEnabled");
				// Shortcut Key: Don't trigger the shortcut if the delete button is disabled
				if (bDeleteEnabled) {
					oTemplateUtils.oCommonEventHandlers.deleteEntries(oEvent);
				}
			}

			function fnAddEditStateFilter(aFilters){
				if (!oTemplateUtils.oComponentUtils.isDraftEnabled()){
					return;
				}
				var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
				var vDraftState = oTemplatePrivateModel.getProperty("/listReport/vDraftState");
				switch (vDraftState) {
					case "1": // Unchanged
						// IsActiveDocument and siblingEntity eq null
						aFilters.push(new Filter("IsActiveEntity", "EQ", true));
						aFilters.push(new Filter("HasDraftEntity", "EQ", false));
						break;
					case "2": // Draft
						aFilters.push(new Filter("IsActiveEntity", "EQ", false));
						break;
					case "3": // Locked
						aFilters.push(new Filter("IsActiveEntity", "EQ", true));
						aFilters.push(new Filter("SiblingEntity/IsActiveEntity", "EQ", null));
						aFilters.push(new Filter("DraftAdministrativeData/InProcessByUser", "NE", ""));
						break;
					case "4": // Unsaved changes
						aFilters.push(new Filter("IsActiveEntity", "EQ", true));
						aFilters.push(new Filter("SiblingEntity/IsActiveEntity", "EQ", null));
						aFilters.push(new Filter("DraftAdministrativeData/InProcessByUser", "EQ", ""));
						break;
					default: // All
						var bOnlyActiveObjects = oTemplatePrivateModel.getProperty("/listReport/activeObjectEnabled");
						if (bOnlyActiveObjects) {
							aFilters.push(new Filter("IsActiveEntity", "EQ", true));
						} else {
							var oOwnMultiFilter = new Filter({
								filters: [new Filter("IsActiveEntity", "EQ", false),
								          new Filter("SiblingEntity/IsActiveEntity", "EQ", null)
								],
								and: false
								});
							if (aFilters[0] && aFilters[0].aFilters) {
								var oSmartTableMultiFilter = aFilters[0];
								aFilters[0] = new Filter([oSmartTableMultiFilter, oOwnMultiFilter], true);
							} else {
								aFilters.push(oOwnMultiFilter);
							}
						}
						break;
				}
			}

		    function onShareListReportActionButtonPressImpl(oButton) {
		        var oFragmentController = {
		            shareEmailPressed: function() {
		                var sSubject = oTemplateUtils.oCommonUtils.getText("EMAIL_HEADER", [ oTemplateUtils.oServices.oApplication.getAppTitle() ]);
		                sap.m.URLHelper.triggerEmail(null, sSubject, document.URL);
		            },

		            shareJamPressed: function() {
		                ShareUtils.openJamShareDialog(oTemplateUtils.oServices.oApplication.getAppTitle());
		            },

		            getDownloadUrl: function() {
		                var oTable = oState.oSmartTable.getTable();
		                var oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
		                return oBinding && oBinding.getDownloadUrl() || "";
		            },

		            getServiceUrl: function() {
						var sServiceUrl = "";
						var oPageSettings = oTemplateUtils.oComponentUtils.getSettings();
						var useDateRange = oState.oSmartFilterbar && oState.oSmartFilterbar.getUseDateRangeType();

						/*
							Logic to decide which type of tile should be created if manifest configuration for semantic date range is defined.
							Case 1: useDateRange: true => Static tile should always be created
							case 2: selectedValues is defined under dateSettings => loop through all the date range properites [present in the Semantic Date range helper method]
									in the leading entity set and if any of the filter's value is filled in the SFB, then Static tile should be created, and otherwise dynamic
									tile.
							Case 3: selectedValues is not defined under dateSettings => Same as case 2 but the loop only runs on the fields mentioned in the manifest.
						*/

						if (!useDateRange && SemanticDateRangeHelper.isServiceUrlAllowedBySemanticDateRangeFilter(oPageSettings, oState.oSmartFilterbar)) {
							sServiceUrl = oFragmentController.getDownloadUrl();
							if (sServiceUrl) {
								sServiceUrl += "&$top=0&$inlinecount=allpages";
							}
						}

		                var oShareInfo = {
		                    serviceUrl: sServiceUrl
		                };
						oController.onSaveAsTileExtension(oShareInfo);

		                return oShareInfo.serviceUrl;
		            },

		            getModelData: function() {
		                var fnGetUser = ObjectPath.get("sap.ushell.Container.getUser");
		                var oOwnerComponent = oController.getOwnerComponent();
		                var oAppComponent = oOwnerComponent.getAppComponent();
		                var oMetadata = oAppComponent.getMetadata();
		                var oUIManifest = oMetadata.getManifestEntry("sap.ui");
		                var sIcon = (oUIManifest && oUIManifest.icons && oUIManifest.icons.icon) || "";
		                var oAppManifest = oMetadata.getManifestEntry("sap.app");
		                var sTitle = (oAppManifest && oAppManifest.title) || "";

		                return {
		                    serviceUrl: oFragmentController.getServiceUrl(),
		                    icon: sIcon,
		                    title: sTitle,
		                    isShareInJamActive: !!fnGetUser && fnGetUser().isJamActive(),
		                    customUrl: ShareUtils.getCustomUrl()
		                };
					}
		        };

		        ShareUtils.openSharePopup(oTemplateUtils.oCommonUtils, oButton, oFragmentController);

		        // workaround for focus loss issue for AddBookmarkButton ("save as tile" button)
		        var oShareButton = this.getView().byId("template::Share");
		        var oBookmarkButton = this.getView().byId("bookmarkButton");
		        oBookmarkButton.setBeforePressHandler(function() {
		            // set the focus to share button
								oShareButton.focus();
						});
			}

			function setNoDataTextIfRequired(oSmartTable) {
				var sSmartTableId = oSmartTable.getId();
				var oSmartFilterbar = oState.oSmartFilterbar;
				var sNoDataText = "";
				var filters = [];
				if (oSmartTable.fetchVariant() && oSmartTable.fetchVariant().filter && oSmartTable.fetchVariant().filter.filterItems) {
					filters = oSmartTable.fetchVariant().filter.filterItems;
				}
				var mSmartTableConfig = {
					search: !!oSmartFilterbar.getBasicSearchValue(),
					filter: !!(filters.length || oSmartFilterbar.retrieveFiltersWithValues().length)
				};
				if (mSmartTableConfig.search || mSmartTableConfig.filter) {
					sNoDataText = oTemplateUtils.oCommonUtils.getContextText("NOITEMS_LR_SMARTTABLE_WITH_FILTER", sSmartTableId);
				} else {
					sNoDataText = oTemplateUtils.oCommonUtils.getContextText("NOITEMS_LR_SMARTTABLE", sSmartTableId);
				}
				oSmartTable.setNoData(sNoDataText);
			}

			function setNoDataChartTextIfRequired(oSmartChart) {
				var sSmartChartId = oSmartChart.getId();
				var oSmartFilterbar = oState.oSmartFilterbar;
				var filters = [];
				if (oSmartChart.fetchVariant() && oSmartChart.fetchVariant().filter && oSmartChart.fetchVariant().filter.filterItems) {
					filters = oSmartChart.fetchVariant().filter.filterItems;
				}
				var sNoDataText = "";
				var mSmartChartConfig = {
					search: !!oSmartFilterbar.getBasicSearchValue(),
					filter: !!(filters.length || oSmartFilterbar.retrieveFiltersWithValues().length)
				};
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

			// Generation of Event Handlers
			return {
				onInit: function() {
					// check if worklist is enabled
					var oAppComponent = oController.getOwnerComponent().getAppComponent();
					var oManifestEntryGenricApp = oAppComponent.getConfig();
					oState.oWorklistData.bWorkListEnabled = !!oManifestEntryGenricApp.pages[0].component.settings && oManifestEntryGenricApp.pages[0].component.settings.isWorklist;
					oState.oSmartFilterbar = oController.byId("listReportFilter");
					oState.oSmartTable = oController.byId("listReport");
					// Make the fnUpdateControlOnSelectionChange function available for others via the oState object
					oState.updateControlOnSelectionChange = fnUpdateControlOnSelectionChange;
					oFclProxy = oTemplateUtils.oComponentUtils.getFclProxy();
					oState.bLoadListAndFirstEntryOnStartup = oFclProxy.isListAndFirstEntryLoadedOnStartup();
					oState.oMultipleViewsHandler = new MultipleViewsHandler(oState, oController, oTemplateUtils);
					oState.oCreateWithDialogHandler = new CreateWithDialogHandler(oState, oController, oTemplateUtils);
					oState.oWorklistHandler = new WorklistHandler(oState, oController, oTemplateUtils);
					oState.oIappStateHandler = new IappStateHandler(oState, oController, oTemplateUtils);
					oState.oMultiEditHandler = new MultiEditHandler(oState, oController, oTemplateUtils);
					oState.oIappStateHandler.onSFBVariantInitialise();
					// gets the custom search field of worklist and saves it in oState.
					if (oState.oWorklistData.bWorkListEnabled) {
						oState.oWorklistHandler.fetchAndSaveWorklistSearchField();
					}
					var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
					oTemplatePrivateModel.setProperty("/generic/bDataAreShownInTable", false);
					//set a property for the state of LR table. At this state data have never been requested for LR table. Later once data is recieved for LR table we will set it to true.
					oTemplatePrivateModel.setProperty("/listReport/firstSelection", false);

					// Initialise headerExpanded property to true as a fix for incident 1770402849. Text of toggle filter button depends on this value.
					oTemplatePrivateModel.setProperty("/listReport/isHeaderExpanded", true);

					// set property for enable/disable of the Delete button
					oTemplatePrivateModel.setProperty("/listReport/deleteEnabled", false);

					// Set property for enable/disable of the Multi Edit button
					var sIdForMultiEditButton = StableIdHelper.getStableId({
						type: "ListReportAction",
						subType: "MultiEdit"
					});
					oTemplatePrivateModel.setProperty("/generic/controlProperties/" + sIdForMultiEditButton, { enabled: false });

					// initialization of data related to active objects toggle and edit state dropdown
					if (oTemplateUtils.oComponentUtils.isDraftEnabled()){
						oTemplatePrivateModel.setProperty("/listReport/activeObjectEnabled", false);
						oTemplatePrivateModel.setProperty("/listReport/vDraftState", "0");
					}

					// initialise the message trip in LR to be hidden on load
					oTemplatePrivateModel.setProperty("/listReport/multipleViews/msgVisibility", false);

					// Give component access to some methods
					oViewProxy.getSmartTable = function(){
						return oState.oSmartTable;
					};
					oViewProxy.getItems = function() {
						var oTable = oState.oSmartTable.getTable();
						if (oTemplateUtils.oCommonUtils.isUiTable(oTable)) {
							return oTable.getRows();
						}
						return oTable.getItems();
					};
					oViewProxy.displayNextObject = function(aOrderObjects) {
						return new Promise(function(resolve, reject) {
							aWaitingForDisplayNextObjectInfo = {
								aWaitingObjects: aOrderObjects,
								resolve: resolve,
								reject: reject
							};
						});
					};

					oViewProxy.onComponentActivate = function() {
						// only relevant for cross app navigation case - not in iAppState case or initial startup (these are handled in oViewProxy.applyState)
						oSmartFilterBarInitializedPromise.then(function(){
							var oAppStatePromise = oState.oIappStateHandler.parseUrlAndApplyAppState();
							oAppStatePromise.then(fnStartUpResolve);
						});
					};
					oViewProxy.refreshBinding = function(bUnconditional, mEntitySets) {
						if (oState.oIappStateHandler.areDataShownInTable()) { // only if data are currently shown a refresh needs to be triggered
							if (oState.oMultipleViewsHandler.refreshOperation(2, null, !bUnconditional && mEntitySets)){
								return; // multiple views handler has done the job
							}
							if (bUnconditional || mEntitySets[oState.oSmartTable.getEntitySet()]){
								oTemplateUtils.oCommonUtils.refreshModel(oState.oSmartTable);
								oTemplateUtils.oCommonUtils.refreshSmartTable(oState.oSmartTable);
							}
						}
					};

					oViewProxy.getCurrentState = function(){
						return {
							permanentState: {
								data: oState.oIappStateHandler.getCurrentAppState(),
								lifecycle: {permanent: true}
							}
						};
					};

					oViewProxy.applyState = function(oViewState){
						// Currently, settling the question whether data should be loaded immediately in case of initial load can only
						// be handled after SFB is initialized (in case the default or standard variant has executeOnSelect set to true).
						// Therefore, applying the state is postponed (should be only relevant in case of navType initial).
						// Ideally, this should be handled in iAppStateHandler

						// If user default values are set in FLP (=> navtype xAppState), applying (initial) state here at activation of component
						// would break logic to set executeOnSelect flag for standard variant.
						// For the time being:
						// - postpone call to applyState until after starting up, i.e. make sure the parseUrlAndApplyState happens first
						// - only call applyState if a state is provided (i.e. navType is iAppState)
						//   => no need to wait for oSmartFilterBarInitializedPromise here, as starting up is anyway only reset afterwards
						// - reenable applying initial state after navigation parsed (for the case that no default values are set)

						// Todo:
						// - move startup logic completely to iAppStateHandler
						// - revisit logic to set executeOnSelect flag

						oStartUpPromise.then(function(){
							oState.oIappStateHandler.applyState(oViewState.permanentState);
						});
					};

					fnSetIsLeaf();

					oController.byId("template::FilterText").attachBrowserEvent("click", function() {
						oController.byId("page").setHeaderExpanded(true);
					});
				},

				handlers: {
					addEntry: addEntry,
					addEntryWithFilters: addEntryWithFilters,
					deleteEntries: fnDeleteEntries,
					deleteEntry: function (oEvent) {
						oTemplateUtils.oCommonEventHandlers.deleteEntry(oEvent);
					},
					updateTableTabCounts: function() {
						oState.oMultipleViewsHandler.fnUpdateTableTabCounts();
					},
					onCancelCreateWithPopUpDialog: function() {
						oState.oCreateWithDialogHandler.onCancelPopUpDialog();
					},
					onSaveCreateWithPopUpDialog : function(oEvent) {
						oState.oCreateWithDialogHandler.onSavePopUpDialog(oEvent);
					},
					onSelectionChange: function(oEvent) {
						var oTable = oEvent.getSource();
						fnUpdateControlOnSelectionChange(oTable);
					},
					onMultiSelectionChange: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onMultiSelectionChange(oEvent);
					},
					onSmartFieldUrlPressed: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onSmartFieldUrlPressed(oEvent, oState);
					},
					onContactDetails: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onContactDetails(oEvent);
					},
					onSmartFilterBarInitialise: onSmartFilterBarInitialise,
					onSmartFilterBarInitialized: onSmartFilterBarInitialized,

					onBeforeSFBVariantFetch: function() {
						oState.oIappStateHandler.onBeforeSFBVariantFetch();
					},

					onAfterSFBVariantSave: function() {
						oState.oIappStateHandler.onAfterSFBVariantSave();
					},

					onAfterSFBVariantLoad: function(oEvent) {
						oState.oIappStateHandler.onAfterSFBVariantLoad(oEvent);
					},
					onDataRequested: function() {
						oState.oMultipleViewsHandler.onDataRequested();
					},
					onDataReceived: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onDataReceived(oEvent);
						if (aWaitingForDisplayNextObjectInfo) {
							var oItem;
							var bSuccess = false;
							for (var i = 0; i < aWaitingForDisplayNextObjectInfo.aWaitingObjects.length && !bSuccess; i++) {
								oItem = getItemInTable(aWaitingForDisplayNextObjectInfo.aWaitingObjects[i]);
								if (oItem) {
									fnNavigateToListItemProgrammatically(oItem);
									aWaitingForDisplayNextObjectInfo.resolve();
									bSuccess = true;
								}
							}
							if (!bSuccess) {
								oItem = getItemInTable();
								if (oItem) {
									fnNavigateToListItemProgrammatically(oItem);
									aWaitingForDisplayNextObjectInfo.resolve();
								} else {
									aWaitingForDisplayNextObjectInfo.reject();
								}
							}
							aWaitingForDisplayNextObjectInfo = null;
							return;
						}

						var oTable = oEvent.getSource().getTable();
						oFclProxy.handleDataReceived(oTable, fnNavigateToListItemProgrammatically);
						var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
						oTemplatePrivateModel.setProperty("/listReport/firstSelection", true);
						oState.oIappStateHandler.setDataShownInTable(true);
					},
					// it is a workaround for the time being till SmartChart fired an Event DataRequested; then it has to be changed
					onSmartChartDataReceived: function() {
						oState.oMultipleViewsHandler.onDataRequested();
					},
					onBeforeRebindTable: function(oEvent) {
						var oSmartTable = oEvent.getSource();
						setNoDataTextIfRequired(oSmartTable);
						//in table tabs case oEvent.bindingParams.filters do not contain the values from the SmartFilterbar so far but it will contain filters
						//which can be set directly on the table under 'settings'
						// we have to remember these filters in order to exclude them later for counts
						var oBindingParams = oEvent.getParameters().bindingParams;
						oState.oMultipleViewsHandler.aTableFilters =  deepExtend({}, oBindingParams.filters);
						// initial filters from smarttable, a copy
						var aFiltersFromSmartTable = oBindingParams.filters.slice(0);
						oTemplateUtils.oCommonEventHandlers.onBeforeRebindTable(oEvent, {
							determineSortOrder: oState.oMultipleViewsHandler.determineSortOrder,
							ensureExtensionFields: oController.templateBaseExtension.ensureFieldsForSelect,
							addTemplateSpecificFilters: fnAddEditStateFilter,
							addExtensionFilters: oController.templateBaseExtension.addFilters,
							resolveParamaterizedEntitySet: oState.oMultipleViewsHandler.resolveParameterizedEntitySet,
							isFieldControlRequired: false,
							isPopinWithoutHeader: true,
							isDataFieldForActionRequired: true,
							isFieldControlsPathRequired: true,
							isMandatoryFiltersRequired: true
						});
						oController.onBeforeRebindTableExtension(oEvent);
						oState.oMultipleViewsHandler.onRebindContentControl(oBindingParams, aFiltersFromSmartTable);
						listUtils.handleErrorsOnTableOrChart(oTemplateUtils, oEvent);
					},
					onListNavigate: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onListNavigate(oEvent, oState);
					},
					onCallActionFromToolBar: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onCallActionFromToolBar(oEvent, oState);
					},
					onDataFieldForIntentBasedNavigation: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onDataFieldForIntentBasedNavigation(oEvent, oState);
					},
					onDataFieldWithIntentBasedNavigation: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onDataFieldWithIntentBasedNavigation(oEvent, oState);
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
					onBeforeSemanticObjectLinkPopoverOpens: function(oEvent) {
						var oSmartControl = oEvent.getSource();
						var oEventParameters = oEvent.getParameters();
						var oSelectionVariant = oState.oSmartFilterbar.getUiState().getSelectionVariant();
						//In case of Multiple View Applications, the filter context URL needs to be adjusted as the selected tab's context could be different from that of the filter context.
						if (oState.oSmartFilterbar.getEntitySet() !== oSmartControl.getEntitySet()) {
							oSelectionVariant.FilterContextUrl = oTemplateUtils.oServices.oApplication.getNavigationHandler().constructContextUrl(oSmartControl.getEntitySet(), oSmartControl.getModel());
						}
						var sSelectionVariant = JSON.stringify(oSelectionVariant);
						oTemplateUtils.oCommonUtils.semanticObjectLinkNavigation(oEventParameters, sSelectionVariant, oController);
					},
					onSemanticObjectLinkNavigationPressed: fnOnSemanticObjectLinkNavigationPressed,
					onSemanticObjectLinkNavigationTargetObtained: fnOnSemanticObjectLinkNavigationTargetObtained,
					onSemanticObjectLinkNavigationTargetObtainedSmartLink: fnOnSemanticObjectLinkNavigationTargetObtainedSmartLink,
					onDraftLinkPressed: function(oEvent) {
						var oButton = oEvent.getSource();
						var oBindingContext = oButton.getBindingContext();
						oTemplateUtils.oCommonUtils.showDraftPopover(oBindingContext, oButton);
					},
					onAssignedFiltersChanged: function(oEvent) {
						if (oEvent.getSource()) {
							oController.byId("template::FilterText").setText(oEvent.getSource().retrieveFiltersWithValuesAsText());
						}
					},
					onFilterChange: onFilterChange,
					onFiltersDialogBeforeOpen: function(){
						oState.oIappStateHandler.onFiltersDialogBeforeOpen();
					},
					onFiltersDialogClosed: function(){
						oState.oIappStateHandler.onFiltersDialogClosed();
					},

					// the search is automatically performed by the SmartTable
					// so we only need to
					// - ensure that all cached data for the object pages are refreshed, too
					// - update our internal state (data are shown in table)
					onSearchButtonPressed: function() {
						oTemplateUtils.oCommonUtils.refreshModel(oState.oSmartTable);
						oState.oIappStateHandler.changeIappState(false, true);
					},
					onAfterTableVariantSave: function() {
						oState.oIappStateHandler.onAfterTableVariantSave();
					},
					onAfterApplyTableVariant: function() {
						if (!fnStartUpResolve) {
							oState.oIappStateHandler.onAfterApplyTableVariant();
						}
					},
					onAfterChartVariantSave: function(oEvent) {
						oState.oIappStateHandler.onAfterTableVariantSave();
					},
					onAfterApplyChartVariant: function(oEvent) {
						if (!fnStartUpResolve) {
							oState.oIappStateHandler.onAfterApplyTableVariant();
						}
					},
					onBeforeRebindChart: function(oEvent) {
						var oSmartChart = oEvent.getSource();
						setNoDataChartTextIfRequired(oSmartChart);
						//in table tabs case oEvent.bindingParams.filters do not contain the values from the SmartFilterbar so far but it will contain filters
						//which can be set directly on the table under 'settings'
						// we have to remember these filters in order to exclude them later for counts
						var oBindingParams = oEvent.getParameters().bindingParams;
						oState.oMultipleViewsHandler.aTableFilters =  deepExtend({}, oBindingParams.filters);
						var aFiltersFromSmartChart = oBindingParams.filters.slice(0);
						var oCallbacks = {
							setBindingPath: oSmartChart.setChartBindingPath.bind(oSmartChart),
							ensureExtensionFields: Function.prototype, // needs further clarification
							addTemplateSpecificFilters: fnAddEditStateFilter,
							addExtensionFilters: oController.templateBaseExtension.addFilters,
							resolveParamaterizedEntitySet: oState.oMultipleViewsHandler.resolveParameterizedEntitySet,
							isFieldControlRequired: false,
							isMandatoryFiltersRequired: true
						};
						oTemplateUtils.oCommonUtils.onBeforeRebindTableOrChart(oEvent, oCallbacks, oState.oSmartFilterbar);

						// add custom filters
						oController.onBeforeRebindChartExtension(oEvent);
						oState.oMultipleViewsHandler.onRebindContentControl(oBindingParams, aFiltersFromSmartChart);
						listUtils.handleErrorsOnTableOrChart(oTemplateUtils, oEvent);
					},
					onChartInitialized: function(oEvent) {
						fnRegisterToChartEvents(oEvent);
						oTemplateUtils.oCommonUtils.checkToolbarIntentsSupported(oEvent.getSource());
					},
					onSelectionDetailsActionPress: function(oEvent) {
						oState.oMultipleViewsHandler.onDetailsActionPress(oEvent);
					},

					// ---------------------------------------------
					// END store navigation context
					// ---------------------------------------------

                    onShareListReportActionButtonPress: function(oEvent) {
						oTemplateUtils.oCommonUtils.executeIfControlReady(onShareListReportActionButtonPressImpl, "template::Share");
					},
					onInlineDataFieldForAction: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onInlineDataFieldForAction(oEvent, oState);
					},
					onInlineDataFieldForIntentBasedNavigation: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onInlineDataFieldForIntentBasedNavigation(oEvent.getSource(), oState);
					},
					onDeterminingDataFieldForAction: function(oEvent) {
						oTemplateUtils.oCommonEventHandlers.onDeterminingDataFieldForAction(oEvent, oState.oSmartTable);
					},
					onDeterminingDataFieldForIntentBasedNavigation: function(oEvent) {
						var oButton = oEvent.getSource();
						oTemplateUtils.oCommonEventHandlers.onDeterminingDataFieldForIntentBasedNavigation(oButton, oState.oSmartTable.getTable(), oState);
					},

					// Note: In the multiple view multi tables mode this will be called once for each SmartTable
					onTableInit: function(oEvent) {
						var oSmartTable = oEvent.getSource(); // do not use oState.oSmartTable, since this is not reliable in the multiple view multi tables mode
						oTemplateUtils.oCommonUtils.checkToolbarIntentsSupported(oSmartTable);
					},
					//search function called in worklist light version of LR
					onSearchWorkList: function(oEvent) {
						oState.oWorklistHandler.performWorklistSearch(oEvent);
					},
					// functions for sort, filter group in table header in worklist light
					onWorkListTableSettings: function(oEvent) {
						oState.oWorklistHandler.openWorklistPersonalisation(oEvent);
					},
					// event handler for active objects state toggle button
					onActiveButtonPress: function(oEvent) {
						var oPageVariant = oController.byId("template::PageVariant");
						var oTemplatePrivateModel = oTemplateUtils.oComponentUtils.getTemplatePrivateModel();
						var bActiveStateFilter = oTemplatePrivateModel.getProperty("/listReport/activeObjectEnabled");
						oTemplatePrivateModel.setProperty("/listReport/activeObjectEnabled", !bActiveStateFilter);
						oPageVariant.currentVariantSetModified(true);
						oState.oSmartFilterbar.search();
						oState.oIappStateHandler.changeIappState(true,true);
					},
					onMultiEditButtonPress: function() {
						oState.oMultiEditHandler.onMultiEditButtonPress();
					}
				},
				formatters: {
					formatDraftType: function(oDraftAdministrativeData, bIsActiveEntity, bHasDraftEntity) {
						if (oDraftAdministrativeData && oDraftAdministrativeData.DraftUUID) {
							if (!bIsActiveEntity) {
								return sap.m.ObjectMarkerType.Draft;
							} else if (bHasDraftEntity) {
								return oDraftAdministrativeData.InProcessByUser ? sap.m.ObjectMarkerType.Locked : sap.m.ObjectMarkerType.Unsaved;
							}
						}
						return sap.m.ObjectMarkerType.Flagged;
					},

					formatDraftVisibility: function(oDraftAdministrativeData, bIsActiveEntity) {
						if (oDraftAdministrativeData && oDraftAdministrativeData.DraftUUID) {
							if (!bIsActiveEntity) {
								return sap.m.ObjectMarkerVisibility.TextOnly; //for Draft mode only the text will be shown
							}
						}
						return sap.m.ObjectMarkerVisibility.IconAndText; //Default text and icon
					},

					formatDraftLineItemVisible: function(oDraftAdministrativeData, bActiveStateObject, sSelectedEditStateFilter) {
						if (oDraftAdministrativeData && oDraftAdministrativeData.DraftUUID) {
							if (sSelectedEditStateFilter === "0" && bActiveStateObject) {
								return false;
							}
							return true;
						}
						return false;
					},

					// Returns full user name or ID of owner of a draft with status "unsaved changes" or "locked" in the format "by full name" or "by UserId"
					// If the user names and IDs are not maintained we display for example "locked by another user"
					formatDraftOwner: function(oDraftAdministrativeData, bHasDraftEntity) {
						var sDraftOwnerDescription = "";
						if (oDraftAdministrativeData && oDraftAdministrativeData.DraftUUID && bHasDraftEntity) {
							var sUserDescription = oDraftAdministrativeData.InProcessByUserDescription || oDraftAdministrativeData.InProcessByUser || oDraftAdministrativeData.LastChangedByUserDescription || oDraftAdministrativeData.LastChangedByUser;
							if (sUserDescription) {
								sDraftOwnerDescription = oTemplateUtils.oCommonUtils.getText("ST_DRAFT_OWNER", [sUserDescription]);
							} else {
								sDraftOwnerDescription = oTemplateUtils.oCommonUtils.getText("ST_DRAFT_ANOTHER_USER");
							}
						}
						return sDraftOwnerDescription;
					},

					formatItemTextForMultipleView: function(oItem) {
						return oState.oMultipleViewsHandler ? oState.oMultipleViewsHandler.formatItemTextForMultipleView(oItem) : "";
					},
					formatMessageStrip: function(aIgnoredFilters, sSelectedKey) {
						return oState.oMultipleViewsHandler ? oState.oMultipleViewsHandler.formatMessageStrip(aIgnoredFilters, sSelectedKey) : "";
					}
				},

				extensionAPI: new ExtensionAPI(oTemplateUtils, oController, oState)
			};
		}
	};
	return oMethods;
});
