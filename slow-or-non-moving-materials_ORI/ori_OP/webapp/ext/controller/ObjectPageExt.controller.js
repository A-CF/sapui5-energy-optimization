/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
	"sap/chart/data/TimeDimension",
	"sap/ui/core/format/DateFormat",
	"sap/m/VBox",
	"sap/ui/model/Filter",
	"sap/suite/ui/microchart/ComparisonMicroChart",
	"sap/suite/ui/microchart/ComparisonMicroChartData",
	"sap/ui/generic/app/navigation/service/SelectionVariant"
], function (TimeDimension, DateFormat, VBox, Filter, ComparisonMicroChart, ComparisonMicroChartData, SelectionVariant) {
	"use strict";
	var sControllerName = "ui.s2p.mm.lib.slonomo.mat.ori.ext.controller.ObjectPageExt";
	sap.ui.controller(sControllerName, {
		onInit: function () {
			this._bPredictiveModelLoaded = null;
			this._bPredictData = null;
			this.extensionAPI.attachPageDataLoaded(jQuery.proxy(this.onPageLoaded, this));
		},

		onExit: function () {
			if (this._oMovementPopover) {
				this._oMovementPopover.destroy();
			}
		},

		onPageLoaded: function (oEvent) {
			// get the material base unit from header entity
			this._oMaterialBaseUnit = "";
			this._initializePredictIndicators();

			if (oEvent.context.sPath) {
				this._oMaterialBaseUnit = oEvent.context.getProperty(oEvent.context.sPath).MaterialBaseUnit;
			}

			// Workaround to bypass intent-based forwarding
			// ---
			var params = jQuery.sap.getUriParameters().mParams;
			if (params.Material && params.P_DisplayCurrency && params.P_InventoryConsumptionGroup && params.P_KeyDate && params.P_NumberOfDays && params.Plant) {
				this._oStartupParameters = params;
			} else {
				this._oStartupParameters = this.getOwnerComponent().getAppComponent() && this.getOwnerComponent().getAppComponent().getComponentData().startupParameters;
			}
			// ---
			this._sMeasureStockConsumption = this._getResourceBundle().getText("STOCK_CONSUMPTION");
			this._oNavigationService = new sap.ui.generic.app.navigation.service.NavigationHandler(this);

			var oVizFrame = this.byId("idVizFrame");
			oVizFrame.setBusy(true);

			var oStockVizFrame = this.byId("idStockVizFrame");
			oStockVizFrame.setBusy(true);

			var oBOMTable = this.byId("idBOMTable");
			var oModel = this.getView().getModel();

			var oSMIPlantVizFrame = this.byId("idSMIPlantVizFrame");
			oSMIPlantVizFrame.setBusy(true);
			// read chart entity
			if (this._oStartupParameters) {
				oModel.read(this._buildChartBindingPath(this._oStartupParameters), {
					filters: this._buildFilters(this._oStartupParameters),
					sorters: [new sap.ui.model.Sorter("YearPeriod", false)],
					success: jQuery.proxy(this._successChartDataLoad, this),
					error: jQuery.proxy(this._loadError, this),
					groupId: "idSMIChart"
				});

				// read predict entity
				oModel.read(this._buildPredictBindingPath(this._oStartupParameters), {
					filters: this._buildFilters(this._oStartupParameters),
					success: jQuery.proxy(this._successPredictModelLoad, this),
					error: jQuery.proxy(this._loadError, this),
					groupId: "idSMIChart"
				});

				// read entity for SMIPlant
				oModel.read(this._buildSMIPlantChartBindingPath(this._oStartupParameters), {
					filters: [new Filter("Material", sap.ui.model.FilterOperator.EQ, this._oStartupParameters["Material"][0])],
					success: jQuery.proxy(this._successSMIPlantModelLoad, this),
					error: jQuery.proxy(this._loadError, this)
				});

				oBOMTable.setTableBindingPath(this._buildBOMTableBindingPath(this._oStartupParameters));
				oBOMTable.rebindTable();
			}
		},


		_isLastDayOfMonth: function (dDate) {
			var dNewDate = new Date(dDate);
			var iMonth = dNewDate.getMonth();
			dNewDate.setDate(dNewDate.getDate() + 1);
			return dNewDate.getMonth() !== iMonth;
		},

		/**
		 * Gets the array of yearmonth for the last 12 months
		 * @private
		 * @return {array} aYearMonth the yearmonth array for the last 12 months
		 */
		_getTimeSeriesAxis: function (sKeyDate) {
			var oDataParser = DateFormat.getDateTimeInstance({
				pattern: "yyyy-MM-dd"
			});
			var dKeyDate = oDataParser.parse(sKeyDate);
			var oDateFormatter = DateFormat.getDateTimeInstance({
				pattern: "yyyyMM"
			});
			var aYearMonth = [];

			if (this._isLastDayOfMonth(dKeyDate)) { // if the reference date is the last day of month, include this month in the result
				dKeyDate.setDate(1); // set to the first day of month to avoid setMonth has issue 2018.01.31 -> 2018.02.31
				dKeyDate.setMonth(dKeyDate.getMonth() - 11);
			} else {
				dKeyDate.setDate(1);
				dKeyDate.setMonth(dKeyDate.getMonth() - 12);
			}

			aYearMonth.push(oDateFormatter.format(dKeyDate));
			for (var i = 1; i < 15; i++) { // include 3 more months for predict month
				dKeyDate.setMonth(dKeyDate.getMonth() + 1);
				aYearMonth.push(oDateFormatter.format(dKeyDate));
			}
			return aYearMonth;
		},

		/**
		 * loads the historical data for the chart
		 * @private
		 * @param {object} oData the loaded data from backend
		 */
		_successChartDataLoad: function (oData) {
			var aHistoricalData = [];
			var aYearMonth = this._getTimeSeriesAxis(this._oStartupParameters.P_KeyDate[0]);
			var aChartType = ["bar", "line"];
			var iMonth = 0;
			for (var i = 0; i < aYearMonth.length; i++) {
				// fill the empty data for empty year month
				if (iMonth >= oData.results.length || aYearMonth[i] !== oData.results[iMonth].YearPeriod) {
					aHistoricalData.push({
						"YearPeriod": aYearMonth[i],
						"ConsumptionToStockRatio": null,
						"PredictRatio": null,
						"MatlWrhsStkQtyInMatlBaseUnit": null,
						"CnsmpnQtyInBaseUnitOnRefDate": null,
						"NumberOfBOMUsingTheMaterial": null
					});
				} else { // use the loaded data for yearmonth
					aHistoricalData.push({
						"YearPeriod": oData.results[iMonth].YearPeriod,
						"ConsumptionToStockRatio": oData.results[iMonth].ConsumptionToStockRatio,
						"PredictRatio": null,
						"MatlWrhsStkQtyInMatlBaseUnit": oData.results[iMonth].MatlWrhsStkQtyInMatlBaseUnit,
						"CnsmpnQtyInBaseUnitOnRefDate": oData.results[iMonth].CnsmpnQtyInBaseUnitOnRefDate,
						"NumberOfBOMUsingTheMaterial": oData.results[iMonth].NumberOfBOMUsingTheMaterial
					});
					iMonth++;
				}
			}

			// set data to the stock situation chart
			this._loadStockSituationVizChart(aHistoricalData.slice(0, 12));

			// set data to the SMI chart
			if (this._bPredictiveModelLoaded === true) { // if the predict model is loaded and active
				for (var j = 0; j < this._bPredictData.length; j++) {
					if (this._bPredictData[j].YearPeriod === aHistoricalData[j + 12].YearPeriod) {
						aHistoricalData[j + 12].PredictRatio = this._bPredictData[j].ConsumptionToStockRatio;
					}
				}
				this._loadVizChart(aChartType, aHistoricalData);
			} else if (this._bPredictiveModelLoaded === false) { // if the predict model is loaded and inactive
				aHistoricalData = aHistoricalData.slice(0, 12);
				aChartType = ["bar"];
				this._loadVizChart(aChartType, aHistoricalData, true);
			} else {
				this._loadVizChart(aChartType, aHistoricalData); // if the predict model is not loaded
			}
		},

		/**
		 * loads the predict data for the SMI chart
		 * @private
		 * @param {object} oData the loaded data from backend
		 */
		_successPredictModelLoad: function (oData) {
			var oVizFrame = this.byId("idVizFrame");
			var aHistoricalData = oVizFrame.getModel() && oVizFrame.getModel().getData(); // get the historical data from chart

			if (oData.results.length === 0) { // predictive model is inactive
				this._bPredictiveModelLoaded = false;
				if (aHistoricalData) {
					aHistoricalData = aHistoricalData.slice(0, 12);
					this._loadVizChart(["bar"], aHistoricalData, true);
				}
			} else { // predictive model is active
				this._bPredictiveModelLoaded = true;
				if (aHistoricalData) {
					for (var i = 0; i < oData.results.length; i++) {
						if (oData.results[i].YearPeriod === aHistoricalData[i + 12].YearPeriod) {
							aHistoricalData[i + 12].PredictRatio = oData.results[i].ConsumptionToStockRatio;
						}
					}
					oVizFrame.getModel().setData(aHistoricalData);
				} else { // if the historical data is not loaded, save the predict data first
					this._bPredictData = oData.results;
				}
			}
		},

		/**
		 * loads the data for the SMI by Plant chart
		 * @private
		 * @param {object} oData the loaded data from backend
		 */
		_successSMIPlantModelLoad: function (oData) {
			var aData = [];
			var sCurrentPlant = this._oStartupParameters.Plant[0];
			var iCurrentPlantSMI;
			var iCurrentPlantStockQuantity;
			var sCurrentQuantityUnit;
			if (oData.results.length === 1) {
				// empty data to avoid 'no data'
				aData.push({
					Plant: "",
					PlantName: "",
					MatlWrhsStkQtyInMatlBaseUnit: 0,
					MaterialBaseUnit: "",
					ConsumptionToStockRatio: 0
				});
				iCurrentPlantSMI = oData.results[0].ConsumptionToStockRatio;
				iCurrentPlantStockQuantity = oData.results[0].MatlWrhsStkQtyInMatlBaseUnit;
				sCurrentQuantityUnit = oData.results[0].MaterialBaseUnit;
			} else {
				for (var i = 0; i < oData.results.length; i++) {
					// save the current plant info as reference line
					if (sCurrentPlant === oData.results[i].Plant) {
						iCurrentPlantSMI = oData.results[i].ConsumptionToStockRatio;
						iCurrentPlantStockQuantity = oData.results[i].MatlWrhsStkQtyInMatlBaseUnit;
						sCurrentQuantityUnit = oData.results[i].MaterialBaseUnit;
					} else {
						aData.push({
							Plant: oData.results[i].Plant,
							PlantName: oData.results[i].PlantName,
							MatlWrhsStkQtyInMatlBaseUnit: oData.results[i].MatlWrhsStkQtyInMatlBaseUnit,
							MaterialBaseUnit: oData.results[i].MaterialBaseUnit,
							ConsumptionToStockRatio: oData.results[i].ConsumptionToStockRatio
						});
					}
				}
			}
			this._loadSMIPlantVizChart(aData, iCurrentPlantSMI, iCurrentPlantStockQuantity, sCurrentQuantityUnit);
		},

		/**
		 * set the data model to SMI chart
		 * @private
		 * @param {array} aChartType the chart types 'bar' or 'line'
		 * @param {array} aChartData the chart data
		 * @param {boolean} bPredictInactive the predict model is inactive
		 */
		_loadVizChart: function (aChartType, aChartData, bPredictInactive) {
			var oVizFrame = this.byId("idVizFrame");
			//set viz properties
			oVizFrame.setVizProperties({
				legend: {
					"isScrollable": false
				},
				title: {
					"visible": false
				},
				interaction: {
					"noninteractiveMode": true
				},
				plotArea: {
					dataShape: {
						primaryAxis: aChartType
					}
				},
				timeAxis: {
					levels: ["year", "month"],
					title: {
						visible: false
					}
				}
			});
			if (bPredictInactive && oVizFrame.getFeeds().length === 3) { // remove the predict model data feed when model is inactive
				var oFeed = oVizFrame.getFeeds()[1];
				oVizFrame.removeFeed(oFeed);
				oVizFrame.setVizType("info/column");
				oFeed.destroy(); // destroy the feeds to avoid duplicate id issue
			}
			oVizFrame.getDataset().bindData({ path: "/" });
			var oModel = new sap.ui.model.json.JSONModel(aChartData);
			oVizFrame.setModel(oModel);
			oVizFrame.setBusy(false);
		},

		/**
		 * set the data model to stock situation chart
		 * @private
		 * @param {array} aChartData the chart data
		 */
		_loadStockSituationVizChart: function (aChartData) {
			var oVizFrame = this.byId("idStockVizFrame");
			var oPopOver = this.byId("idStockVizFramePopover");
			//set viz properties
			oVizFrame.setVizProperties({
				legend: {
					"isScrollable": false
				},
				title: {
					"visible": false
				},
				interaction: {
					selectability: {
						mode: "single"
					}
				},
				plotArea: {
					dataShape: {
						primaryAxis: ["bar", "line"]
					}
				},
				timeAxis: {
					levels: ["year", "month"],
					title: {
						visible: false
					}
				}
			});
			oVizFrame.getDataset().bindData({ path: "/" });
			var oModel = new sap.ui.model.json.JSONModel(aChartData);
			oVizFrame.setModel(oModel);
			oVizFrame.setBusy(false);

			oPopOver.connect(oVizFrame.getVizUid());
			oPopOver.setCustomDataControl(function (evt) {
				return this._setStockSituationPopoverData(evt);
			}.bind(this));
		},

		/**
		 * set the data model to SMI by Plant chart
		 * @private
		 * @param {array} aChartData the chart data
		 * @param {string} sCurrentPlantSMI the SMI
		 * @param {string} sCurrentPlantStockQuantity the stock quantity
		 * @param {string} sCurrentQuantityUnit the stock quantity unit
		 */
		_loadSMIPlantVizChart: function (aChartData, sCurrentPlantSMI, sCurrentPlantStockQuantity, sCurrentQuantityUnit) {
			var oVizFrame = this.byId("idSMIPlantVizFrame");
			var oPopOver = this.byId("idSMIPlantVizFramePopover");
			var oResourceBundle = this._getResourceBundle();

			// set viz scale
			oVizFrame.setVizScales(this._getChartVizScale(aChartData, sCurrentPlantSMI, sCurrentPlantStockQuantity));
			//set viz properties
			oVizFrame.setVizProperties({
				legend: {
					"isScrollable": false
				},
				title: {
					"visible": false
				},
				interaction: {
					selectability: {
						mode: "exclusive"
					}
				},
				plotArea: {
					dataShape: {
						primaryAxis: ["bar", "bar"]
					},
					referenceLine: {
						line: {
							valueAxis: [{
								value: sCurrentPlantSMI,
								visible: true,
								label: {
									text: oResourceBundle.getText("SLOW_INDICATOR") + ": " + sCurrentPlantSMI,
									visible: true
								}
							}],
							valueAxis2: [{
								value: sCurrentPlantStockQuantity,
								visible: true,
								label: {
									text: oResourceBundle.getText("STOCK_QUANTITY") + ": " + sCurrentPlantStockQuantity + " " + sCurrentQuantityUnit,
									visible: true
								}
							}]
						}
					}
				}
			});
			oVizFrame.getDataset().bindData({ path: "/" });
			var oModel = new sap.ui.model.json.JSONModel(aChartData);
			oVizFrame.setModel(oModel);
			oVizFrame.setBusy(false);

			oPopOver.connect(oVizFrame.getVizUid());
			oPopOver.setCustomDataControl(function (oEvent) {
				return this._setSMIPlantPopover(oEvent);
			}.bind(this));
			oPopOver.setActionItems([{
				type: 'action',
				text: this._getResourceBundle().getText("BUTTON_SHOW_TRANSFER_STOCK"),
				press: this.onTransferStock.bind(this)
			}]);
		},

		/**
		 * if the current plant has the min or max SMI value or Stock Quantity value, the viz scale should be changed
		 * so that the reference line can be rendered in the chart
		 * @private
		 * @param {array} aChartData the chart data
		 * @param {string} sCurrentPlantSMI the SMI
		 * @param {string} sCurrentPlantStockQuantity the stock quantity
		 * @return {object} the viz scale object
		 */
		_getChartVizScale: function (aChartData, sCurrentPlantSMI, sCurrentPlantStockQuantity) {
			var aScale = [];
			var fCurrentPlantSMI = parseFloat(sCurrentPlantSMI);
			var fCurrentPlantStockQuantity = parseFloat(sCurrentPlantStockQuantity);
			var aSMI = [fCurrentPlantSMI];
			var aStockQuantity = [fCurrentPlantStockQuantity];
			for (var i = 0; i < aChartData.length; i++) {
				aSMI.push(parseFloat(aChartData[i].ConsumptionToStockRatio));
				aStockQuantity.push(parseFloat(aChartData[i].MatlWrhsStkQtyInMatlBaseUnit));
			}

			if (fCurrentPlantSMI === Math.max.apply(null, aSMI)) {
				aScale.push({ feed: "valueAxis", type: "linear", min: "auto", max: fCurrentPlantSMI });
			} else if (fCurrentPlantSMI === Math.min.apply(null, aSMI) && fCurrentPlantSMI < 0) { // if the reference line is minium value among all and also < 0
				aScale.push({ feed: "valueAxis", type: "linear", min: fCurrentPlantSMI, max: "auto" });
			} else {
				aScale.push({ feed: "valueAxis", type: "linear", min: "auto", max: "auto" });
			}

			if (fCurrentPlantStockQuantity === Math.max.apply(null, aStockQuantity)) {
				aScale.push({ feed: "valueAxis2", type: "linear", min: "auto", max: fCurrentPlantStockQuantity });
			} else if (fCurrentPlantStockQuantity === Math.min.apply(null, aStockQuantity) && fCurrentPlantStockQuantity < 0) { // if the reference line is minium value among all and also < 0
				aScale.push({ feed: "valueAxis2", type: "linear", min: fCurrentPlantStockQuantity, max: "auto" });
			} else {
				aScale.push({ feed: "valueAxis2", type: "linear", min: "auto", max: "auto" });
			}
			return aScale;
		},

		/**
		 * Event handler for the chart data point selection. Show the navigation action button only for stock consumption measure
		 * @private
		 * @param {object} oEvent the event object
		 */
		handleDataSelect: function (oEvent) {
			var oPopOver = this.byId("idStockVizFramePopover");
			var sMeasureName = oEvent.getParameter("data")[0].data.measureNames;

			if (sMeasureName !== this._sMeasureStockConsumption) {
				oPopOver.setActionItems([]);
			} else {
				var aItems = [{
					type: 'action',
					text: this._getResourceBundle().getText("BUTTON_SHOW_MATDOC"),
					press: jQuery.proxy(this.onMatDocPress, this)
				}];
				oPopOver.setActionItems(aItems);
			}
		},

		/**
		 * Popover for stock quantity and bom usage data points
		 * @private
		 * @param {array} aSelectedItems the selected viz data points
		 * @return {object} the SimpleForm control
		 */
		_setBOMPopoverData: function (aSelectedItems) {
			var oResourceBundle = this._getResourceBundle();
			var oSimpleForm = new sap.ui.layout.form.SimpleForm({
				layout: "ResponsiveGridLayout",
				minWidth: 300,
				maxContainerCols: 2,
				editable: false,
				labelSpanL: 4,
				labelSpanM: 4,
				emptySpanL: 1,
				emptySpanM: 1,
				columnsL: 1,
				columnsM: 1
			});

			if (aSelectedItems.length === 1) {
				var sDimensionText = oResourceBundle.getText("PERIOD");

				var sDimensionValue = aSelectedItems[0].data[sDimensionText];
				oSimpleForm.addContent(new sap.m.Label({
					text: sDimensionText
				}));
				oSimpleForm.addContent(new sap.m.Text({
					text: sDimensionValue
				}));

				var sMeasureBOMUsage = oResourceBundle.getText("BOM_USAGE");
				var sMeasureStockQuantity = oResourceBundle.getText("STOCK_QUANTITY");
				var sMeasure;
				if (aSelectedItems[0].data[sMeasureStockQuantity]) {
					sMeasure = aSelectedItems[0].data[sMeasureStockQuantity];
					oSimpleForm.addContent(new sap.m.Label({
						text: sMeasureStockQuantity
					}));
					oSimpleForm.addContent(new sap.m.ObjectNumber({
						number: sMeasure,
						unit: this._oMaterialBaseUnit
					}));
				} else if (aSelectedItems[0].data[sMeasureBOMUsage]) {
					sMeasure = aSelectedItems[0].data[sMeasureBOMUsage];
					oSimpleForm.addContent(new sap.m.Label({
						text: sMeasureBOMUsage
					}));
					oSimpleForm.addContent(new sap.m.Text({
						text: sMeasure
					}));
				}
			}
			return oSimpleForm;
		},

		/**
		 * callback function for viz chart popover. The movement type distribution chart is created.
		 * @private
		 * @param {object} oEvent the event object
		 * @return {object} the VBox includes comparison micro chart
		 */
		_setStockSituationPopoverData: function (oEvent) {
			var oVizFrame = this.byId("idStockVizFrame");
			var aSelectedItems = oVizFrame.vizSelection();

			var sDimensionText = this._getResourceBundle().getText("PERIOD");
			var sPeriod = aSelectedItems[0].data[sDimensionText];

			// if the consumption data point is selected open the movement distribution popover, otherwise open the normal popover
			if (!aSelectedItems[0].data.hasOwnProperty(this._sMeasureStockConsumption)) {
				return this._setBOMPopoverData(aSelectedItems);
			} else {
				if (!this._oMovementPopover) {
					this._oMovementPopover = sap.ui.xmlfragment("ui.s2p.mm.lib.slonomo.mat.ori.ext.fragment.MovementPopover", this);
					this.getView().addDependent(this._oMovementPopover);
				}
				this._oMovementPopover.setModel(new sap.ui.model.json.JSONModel({
					Period: sPeriod,
					Movements: [],
					ChartBusy: true,
					ChartVisible: true,
					MaterialBaseUnit: this._oMaterialBaseUnit
				}), "oMovementModel");

				var oParameters = this._getStartEndDate(sPeriod);
				oParameters.P_InventoryConsumptionGroup = this._oStartupParameters.P_InventoryConsumptionGroup[0];

				var aFilters = this._buildFilters(this._oStartupParameters);
				aFilters.push(new Filter("MaterialBaseUnit", sap.ui.model.FilterOperator.EQ, this._oMaterialBaseUnit));
				// send request to the movement type entity
				this.getView().getModel().read(this._buildMovementTypeBindingPath(oParameters), {
					filters: aFilters,
					sorters: [new sap.ui.model.Sorter("MatlCnsmpnQtyInMatlBaseUnit", true)],
					success: jQuery.proxy(this._successMicroChartDataLoad, this, this._oMovementPopover),
					error: jQuery.proxy(this._loadError, this)
				});
				return this._oMovementPopover;
			}
		},

		/**
		 * callback function for SMI by plant chart popover.
		 * @private
		 * @param {object} oEvent the event object
		 * @return {object} the simple form
		 */
		_setSMIPlantPopover: function (oEvent) {
			var oResourceBundle = this._getResourceBundle();
			var oVizFrame = this.byId("idSMIPlantVizFrame");
			var aSelectedItems = oVizFrame.vizSelection();

			var oSimpleForm = new sap.ui.layout.form.SimpleForm({
				layout: "ResponsiveGridLayout",
				minWidth: 300,
				maxContainerCols: 2,
				editable: false,
				labelSpanL: 4,
				labelSpanM: 4,
				emptySpanL: 1,
				emptySpanM: 1,
				columnsL: 1,
				columnsM: 1
			});

			if (aSelectedItems.length === 1) {
				var iColumn = aSelectedItems[0].data._context_row_number;
				var sDimensionText = oResourceBundle.getText("PLANT");

				var sDimensionValue = oVizFrame.getModel().getProperty("/" + iColumn + "/PlantName") + " (" + aSelectedItems[0].data[sDimensionText] + ")";
				oSimpleForm.addContent(new sap.m.Label({
					text: sDimensionText
				}));
				oSimpleForm.addContent(new sap.m.Text({
					text: sDimensionValue
				}));

				var sMeasureSMI = oResourceBundle.getText("SLOW_INDICATOR");
				var sMeasureStockQuantity = oResourceBundle.getText("STOCK_QUANTITY");
				var sMeasure;
				if (aSelectedItems[0].data[sMeasureStockQuantity]) {
					sMeasure = aSelectedItems[0].data[sMeasureStockQuantity];
					oSimpleForm.addContent(new sap.m.Label({
						text: sMeasureStockQuantity
					}));
					oSimpleForm.addContent(new sap.m.ObjectNumber({
						number: sMeasure,
						unit: this._oMaterialBaseUnit
					}));
				} else if (aSelectedItems[0].data[sMeasureSMI]) {
					sMeasure = aSelectedItems[0].data[sMeasureSMI];
					oSimpleForm.addContent(new sap.m.Label({
						text: sMeasureSMI
					}));
					oSimpleForm.addContent(new sap.m.Text({
						text: sMeasure
					}));
				}
			}
			return oSimpleForm;
		},

		/**
		 * set the data model to comparison micro chart in Popover
		 * @private
		 * @param {object} oChart the micro chart object
		 * @param {object} oData the data results from backend request
		 */
		_successMicroChartDataLoad: function (oVBox, oData) {
			var oJsonData = oVBox.getModel("oMovementModel").getData();
			if (oData.results.length === 0) {
				oJsonData.ChartVisible = false;
			} else {
				for (var i = 0; i < oData.results.length; i++) {
					// convert string to float type
					oData.results[i].MatlCnsmpnQtyInMatlBaseUnit = parseFloat(oData.results[i].MatlCnsmpnQtyInMatlBaseUnit);
				}
				oJsonData.Movements = oData.results;
			}
			oJsonData.ChartBusy = false;
			oVBox.getModel("oMovementModel").setData(oJsonData);
		},

		/**
		 * Event handler for navigation to Transfer stock cross plant app.
		 * @private
		 */
		onTransferStock: function (oEvent) {
			var oVizFrame = this.byId("idSMIPlantVizFrame");
			var aSelectedItems = oVizFrame.vizSelection();
			var sTargetPlant;
			if (aSelectedItems.length === 1) {
				var sDimensionText = this._getResourceBundle().getText("PLANT");
				sTargetPlant = aSelectedItems[0].data[sDimensionText];
			}

			var vNavigationParameters = {
				Material: this._oStartupParameters["Material"][0],
				StartPlant: this._oStartupParameters["Plant"][0],
				TargetPlant: sTargetPlant
			};
			this._oNavigationService.navigate("Material", "transferStockCrossPlant", vNavigationParameters);
		},

		/**
		 * Event handler for navigation to Material documents overview.
		 * @private
		 * @param {object} oEvent the event object
		 */
		onMatDocPress: function (oEvent) {
			var oVizFrame = this.byId("idStockVizFrame");
			var aSelectedItems = oVizFrame.vizSelection();
			var aMovementData = sap.ui.getCore().byId("idMovementMicroChart").getModel("oMovementModel").getData().Movements;

			if (aSelectedItems.length === 1) {
				var sDimensionText = this._getResourceBundle().getText("PERIOD");
				var sPeriod = aSelectedItems[0].data[sDimensionText];
				var oParam = this._getStartEndDate(sPeriod);

				var oSelectionVariant = new SelectionVariant();
				oSelectionVariant.addSelectOption("PostingDate", "I", "BT", oParam.P_StartDate, oParam.P_EndDate);
				oSelectionVariant.addSelectOption("Material", "I", "EQ", this._oStartupParameters.Material[0]);
				oSelectionVariant.addSelectOption("Plant", "I", "EQ", this._oStartupParameters.Plant[0]);
				oSelectionVariant.addSelectOption("MaterialDocumentYear", "I", "EQ", oParam.P_Year);
				for (var i = 0; i < aMovementData.length; i++) {
					oSelectionVariant.addSelectOption("GoodsMovementType", "I", "EQ", aMovementData[i].GoodsMovementType);
				}
				// navigate to the specified app variant
				oSelectionVariant.addSelectOption("sap-ui-fe-variant-id", "I", "EQ", "id_1562763790643_168_page");
				var vNavigationParameters = oSelectionVariant.toJSONString();
				//cross navigation service
				this._oNavigationService.navigate("MaterialMovement", "displayList", vNavigationParameters);
			}
		},

		/**
		 * Event handler for navigation to the BOM apps through Smart Link. Add the parameter 'BOMComponentForEdit' that the target app needs
		 * @private
		 * @param {object} oEvent the event object
		 */
		onBeforePopoverOpens: function (oEvent) {
			var oParameters = oEvent.getParameters();
			var oSemanticAttributes = oParameters.semanticAttributes;
			var sSemanticObject = oParameters.semanticObject;
			if (sSemanticObject == "MaterialBOM") {
				for (var property in oSemanticAttributes) {
					if (oSemanticAttributes.hasOwnProperty(property)) {
						if (property === "BillOfMaterialComponent") {
							oSemanticAttributes["BOMComponentForEdit"] = oSemanticAttributes[property];
							break;
						}
					}
				}
				// hard coded parameters needed for navigation to maintain Bill of Materil app
				oSemanticAttributes["DraftUUID"] = "00000000-0000-0000-0000-000000000000";
				oSemanticAttributes["IsActiveEntity"] = "true";
				oSemanticAttributes["BillOfMaterialCategory"] = "M";
				oParameters.setSemanticAttributes(oSemanticAttributes);
			}
			oParameters.open();
		},

		/**
		 * Event handler for rebind table, filters for Material and Plant.
		 * @private
		 * @param {object} oEvent the event object
		 */
		onBeforeRebindTable: function (oEvent) {
			var oBindingParams = oEvent.getParameter("bindingParams");
			oBindingParams.filters = oBindingParams.filters.concat(this._buildFilters(this._oStartupParameters, true));
		},

		/**
		 * formats the data to year month format
		 * @private
		 * @param {object} sValue the period string
		 * @return {string} string in format like 'MMM yyyy'
		 */
		_yearMonthFormatter: function (sValue) {
			// parse the data in format "yyyymm"
			var oDateFormat = DateFormat.getDateTimeInstance({
				pattern: "yyyyMM"
			});
			var dDate = oDateFormat.parse(sValue);
			// format the data to format "MMM yyyy"
			var oYearMonthFormat = DateFormat.getDateTimeInstance({
				pattern: "MMM yyyy"
			});
			return oYearMonthFormat.format(dDate);
		},

		/**
		 * formats the popover header text
		 * @private
		 * @param {string} sValue the period string
		 * @return {string} the formatted header text
		 */
		_popoverTextFormatter: function (sValue) {
			return this._getResourceBundle().getText("POPOVER_HEADER_TEXT", sValue);
		},

		/**
		 * formats the no stock consumption text
		 * @private
		 * @param {string} sValue the period string
		 * @return {string} the formatted text
		 */
		_popoverStockConsumptionText: function (sValue) {
			return this._getResourceBundle().getText("STOCK_CONSUMPTION_TEXT", [0, sValue]);
		},

		/**
		 * concatenates the movement type text
		 * @private
		 * @param {string} sValue1 the movement type name
		 * @param {string} sValue2 the movement type
		 * @return {string} the concatenated text
		 */
		_concatenateMovementTypeText: function (sValue1, sValue2) {
			return sValue1 + " (" + sValue2 + ")";
		},

		_concatenatePlantText: function (sValue1, sValue2) {
			if (sValue1 || sValue2) {
				return sValue1 + " (" + sValue2 + ")";
			}
			return "";
		},

		/**
		 * formats the feed values
		 * @private
		 * @param {string} sValue1 the first value
		 * @param {string} sValue2 the second value
		 * @return {array} strings in array
		 */
		feedValuesFormatter: function (sValue1, sValue2) {
			if (sValue2) {
				return [sValue1, sValue2];
			}
			return [sValue1];
		},

		/**
		 * Gets the start date and end date based on the month
		 * @private
		 * @param {string} sPeriod the year month string
		 * @return {object} object includes start and end date of the month
		 */
		_getStartEndDate: function (sPeriod) {
			var oYearMonthFormat = DateFormat.getDateTimeInstance({
				pattern: "MMM yyyy"
			});
			var dFirstDay = oYearMonthFormat.parse(sPeriod);
			var dLastDay = new Date(dFirstDay.getFullYear(), dFirstDay.getMonth() + 1, 0);
			var oDateFormat = DateFormat.getDateTimeInstance({
				pattern: "yyyy-MM-dd"
			});
			return {
				P_StartDate: oDateFormat.format(dFirstDay),
				P_EndDate: oDateFormat.format(dLastDay),
				P_Year: dFirstDay.getFullYear().toString()
			};
		},

		/**
		 * generates the chart entity request using the parameters
		 * @private
		 * @return {string} the request path
		 */
		_buildChartBindingPath: function (oBindingObject) {
			var sPath = "/C_SlowOrNonMovingMatlTmeSers" + "(P_KeyDate=datetime%27" + oBindingObject.P_KeyDate[0] +
				"T00%3a00%3a00%27,P_InventoryConsumptionGroup=%27" + oBindingObject.P_InventoryConsumptionGroup[0] + "%27)/Results";
			return sPath;
		},

		/**
		 * generates the predict entity request using the parameters
		 * @private
		 * @return {string} the request path
		 */
		_buildPredictBindingPath: function (oBindingObject) {
			var sPath = "/C_SlowOrNonMovingMatlPredicted" + "(P_KeyDate=datetime%27" + oBindingObject.P_KeyDate[0] +
				"T00%3a00%3a00%27,P_InventoryConsumptionGroup=%27" + oBindingObject.P_InventoryConsumptionGroup[0] + "%27)/Results";
			return sPath;
		},

		/**
		 * generates the consumption by movement type entity request using the parameters
		 * @private
		 * @return {string} the request path
		 */
		_buildMovementTypeBindingPath: function (oBindingObject) {
			var sPath = "/C_SlowOrNonMvgMatlCnsmpnByMvt" + "(P_StartDate=datetime%27" + oBindingObject.P_StartDate + "T00%3a00%3a00%27,P_EndDate=datetime%27" + oBindingObject.P_EndDate +
				"T00%3a00%3a00%27,P_InventoryConsumptionGroup=%27" + oBindingObject.P_InventoryConsumptionGroup + "%27)/Results";
			return sPath;
		},

		/**
		 * generates the binding path for the BOM usage smart table
		 * @private
		 * @return {string} the request path
		 */
		_buildBOMTableBindingPath: function (oBindingObject) {
			var sPath = "/C_SlowOrNonMvgMatlBOMUsage" + "(P_KeyDate=datetime%27" + oBindingObject.P_KeyDate[0] + "T00%3a00%3a00%27)/Set";
			return sPath;
		},

		/**
		 * generates the binding path for the SMI plant chart
		 * @private
		 * @return {string} the request path
		 */
		_buildSMIPlantChartBindingPath: function (oBindingObject) {
			var sPath = "/C_SlowOrNonMovingMatlOPgHdr" + "(P_DisplayCurrency=%27" + oBindingObject.P_DisplayCurrency[0] + "%27,P_KeyDate=datetime%27" + oBindingObject.P_KeyDate[0] +
				"T00%3a00%3a00%27,P_InventoryConsumptionGroup=%27" + oBindingObject.P_InventoryConsumptionGroup[0] + "%27,P_NumberOfDays=" + oBindingObject.P_NumberOfDays[0] + ")/Set";
			return sPath;
		},

		/**
		 * generates the filters to the chart entity
		 * @private
		 * @return {array} the request filters
		 */
		_buildFilters: function (oBindingObject, bBOMComponent) {
			var aFilters = [];
			if (bBOMComponent) {
				aFilters.push(new Filter("BillOfMaterialComponent", sap.ui.model.FilterOperator.EQ, oBindingObject["Material"][0]));
				var aPlantFilter = [];
				aPlantFilter.push(new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, ""));
				aPlantFilter.push(new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, oBindingObject["Plant"][0]));
				var oPlantFilter = new sap.ui.model.Filter({
					filters: aPlantFilter,
					and: false
				});
				aFilters.push(oPlantFilter);
			} else {
				aFilters.push(new Filter("Material", sap.ui.model.FilterOperator.EQ, oBindingObject["Material"][0]));
				aFilters.push(new Filter("Plant", sap.ui.model.FilterOperator.EQ, oBindingObject["Plant"][0]));
			}
			return aFilters;
		},

		/**
		 * Initialize the internal predict model indicators before navigation
		 * @private
		 */
		_initializePredictIndicators: function () {
			this._bPredictiveModelLoaded = null;
			this._bPredictData = null;
		},

		/**
		 * Gets the i18n model resource bundle
		 * @private
		 * @return {object} the resource bundle object
		 */
		_getResourceBundle: function () {
			if (!this._oResourceBundle) {
				this._oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
			}
			return this._oResourceBundle;
		}
	});
	return sap.ui.controller(sControllerName);
});