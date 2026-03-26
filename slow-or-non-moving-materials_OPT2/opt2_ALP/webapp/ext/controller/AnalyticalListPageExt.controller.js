/*
 * Copyright (C) 2009-2020 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
  'sap/ui/core/format/DateFormat',
  'ui/s2p/mm/slonomo/mat/opt2/ext/controls/CustomValueHelpDialog',
  'ui/s2p/mm/slonomo/mat/opt2/ext/controls/CustomExportDialog',
  'sap/ui/export/Spreadsheet',
  'external/Chartjs'
], function (DateFormat, CustomValueHelpDialog, CustomExportDialog, Spreadsheet, Chart) {
  'use strict';
  var sControllerName = 'ui.s2p.mm.slonomo.mat.opt2.ext.controller.AnalyticalListPageExt';

  /**
   * Groups the rows according to the selected dimensions and calculates the y-values
   * @param rows The dataset retrieved from the OData service
   * @param dimensions The keys and compound keys of the selected dimensions (logical 'group by')
   * @param y_values The keys of the y-values 
  */
  function groupSum(rows, dimensions, y_values) {
    var resMap = new Map();
    for (var row of rows) {
      var key = dimensions.map(d => String(row[d.primary])).join("|");
      if (!resMap.has(key)) {
        var base = {};
        dimensions.forEach(dimension => {
          if (!dimension.secondary) {
            base[dimension.primary] = row[dimension.primary];
          } else {
            base[dimension.primary] = `${row[dimension.primary]} (${row[dimension.secondary]})`;
          }
          y_values.forEach(y => {
            base[y.key] = 0;
            base[y.unit] = row[y.unit];
          });
          resMap.set(key, base);
        });
      }
      var o = resMap.get(key);
      y_values.forEach(y => {
        o[y.key] += Number(row[y.key]) || 0;
      })
    }
    return Array.from(resMap.values());
  }

  /**
   * Retrieves the service metadata to detect available dimensions and measures in the entitySet
   * @param model The OData model to read the metadata from
   * @param entitySet The name of the entity set the dimensions and measures should be retrieved from
  */
  async function getDimsFromAnnotations(model, entitySet) {
    await model.metadataLoaded();
    var mm = model.getServiceMetadata();

    let et;
    for (var ch of mm.dataServices.schema) {
      var ec = (ch.entityContainer || [])[0];
      var es = ec.entitySet.find(e => e.name === entitySet);
      if (es) {
        et = ch.entityType.find(t => t.name === es.entityType.split('.').pop()); break;
      }
    }
    var dims = [];
    var measures = [];
    (et.property || []).forEach(p => {
      var ext = Object.fromEntries((p.extensions || []).map(e => [e.name, e.value]));
      if (ext["aggregation-role"] == "dimension") {
        dims.push({ key: p.name, text: ext["label"] || p.name, secondProp: ext["text"] || null, unit: ext["unit"] || null });
      }
      if (ext["aggregation-role"] == "measure") {
        measures.push({ key: p.name, text: ext["label"] || p.name, unit: ext["unit"] || null });
      }
    });
    return { dims, measures }

  }
  sap.ui.controller(sControllerName, {
    onInitSmartFilterBarExtension: function (oEvent) {
      this._oSmartFilterBar = oEvent.getSource();
      var oFilterItem = this._getFilterItemFromFilterBar('$Parameter.P_NumberOfDays');
      if (oFilterItem) {
        var oFilterField = sap.ui.getCore().byId(oFilterItem._sControlId);
        oFilterField.attachChange(function (event) {
          var sValue = event.getParameter('value');
          if (isNaN(sValue) || parseInt(sValue, 10) < 0) {
            event.getSource().setValueState(sap.ui.core.ValueState.Error);
          }
        });
      }

      // Add token to Slow-Moving Indicator Input
      var token = new sap.m.Token({
        text: "=0.0"
      });
      token.data('path', 'ConsumptionToStockRatio');
      token.data('op', sap.ui.model.FilterOperator.EQ);
      token.data('v1', 0.0);
      this._getFilterItemFromFilterBar("ConsumptionToStockRatio").getControl().addToken(token);

      // Add token validator to each input, required for rebindExtension
      this._oSmartFilterBar.getFilterGroupItems().forEach(i => {
        var control = i.getControl();
        if (control instanceof sap.m.MultiInput) {
          control.addValidator(function (a) {
            if (a.suggestionObject) {
              var item = a.suggestionObject;
              var token = new sap.m.Token({
                text: item.getText()
              });
              token.data("path", this.getCustomData()[0].getValue());
              token.data("op", sap.ui.model.FilterOperator.EQ);
              token.data("v1", item.getText());
              token.data("v2", "");
              return token;
            }
          }.bind(control));
        }
      });

      /* var filtersPerGroup = {};
      this.byId('template::SmartFilterBar').getFilterGroupItems().forEach(item => {
        var groupKey = item.getGroupName() || "BASIC";
        var group = item.getGroupTitle() || groupKey;
        if (!filtersPerGroup[groupKey]) {
          filtersPerGroup[groupKey] = { title: group, keys: [] }
        }
        filtersPerGroup[groupKey].keys.push(item.getName());
      });
      console.log(filtersPerGroup); */
    },

    /**
     * Sets the app default parameter values
     * @param {object} oStartupObject the start selection variant object
     */
    modifyStartupExtension: function (oStartupObject) {
      var oSelectionVariant = oStartupObject.selectionVariant;
      if (
        !oSelectionVariant.getSelectOption('ConsumptionToStockRatio') &&
        !oSelectionVariant.getParameter('ConsumptionToStockRatio')
      ) {
        oSelectionVariant.addSelectOption('ConsumptionToStockRatio', 'I', 'EQ', '0');
      }
      if (!oSelectionVariant.getSelectOption('P_NumberOfDays') && !oSelectionVariant.getParameter('P_NumberOfDays')) {
        oSelectionVariant.addParameter('P_NumberOfDays', '90');
      }
      if (
        !oSelectionVariant.getSelectOption('P_InventoryConsumptionGroup') &&
        !oSelectionVariant.getParameter('P_InventoryConsumptionGroup')
      ) {
        oSelectionVariant.addParameter('P_InventoryConsumptionGroup', '000');
      }
    },

    _getFilterItemFromFilterBar: function (sFilterItemName) {
      var aFilterItems = this._oSmartFilterBar.getAllFilterItems();
      for (var i = 0; i < aFilterItems.length; i++) {
        if (aFilterItems[i].getName() == sFilterItemName) {
          return aFilterItems[i];
        }
      }
    },

    /**
     * Gets the value-key object that pass to objectpage
     * @private
     * @param {object} oBindingObject the binding object of the selected line item in table
     * @return {object} oParams the parameters that save the key value pairs
     */
    _getKeysForNavigation: function (oBindingObject) {
      var aObjectPageKeys = ['Material', 'Plant'];
      var oParams = {};
      var aFilterData = this._oSmartFilterBar.getFilterData();

      var oDateInputFormat = DateFormat.getDateTimeInstance({
        pattern: 'yyyy-MM-dd',
      });
      oParams = {
        P_DisplayCurrency: aFilterData['$Parameter.P_DisplayCurrency'],
        P_InventoryConsumptionGroup: aFilterData['$Parameter.P_InventoryConsumptionGroup'],
        P_KeyDate: oDateInputFormat.format(aFilterData['$Parameter.P_KeyDate']),
        P_NumberOfDays: aFilterData['$Parameter.P_NumberOfDays'].toString(),
      };
      for (var i = 0; i < aObjectPageKeys.length; i++) {
        // pass the value of key to object page, if it exists in the binding context
        if (oBindingObject[aObjectPageKeys[i]]) {
          oParams[aObjectPageKeys[i]] = oBindingObject[aObjectPageKeys[i]];
        } else if (aFilterData[aObjectPageKeys[i]]) {
          // pass the value if it exists in the filter
          var aFilter = aFilterData[aObjectPageKeys[i]];
          if (aFilter.items.length > 0) {
            oParams[aObjectPageKeys[i]] = aFilter.items[0].key;
          } else if (aFilter.ranges.length > 0 && !aFilter.ranges[0].exclude && aFilter.ranges[0].operation === 'EQ') {
            oParams[aObjectPageKeys[i]] = aFilter.ranges[0].value1;
          }
        }
      }
      return oParams;
    },

    /**
     * Trigger the external navigation to object page
     * @param {object} oEvent the event object
     * @return {boolean} true or false
     */
    onListNavigationExtension: function (oEvent) {
      var oBindingContext = oEvent.getSource().getBindingContext();
      var oObject = oBindingContext.getObject();

      var oParams = this._getKeysForNavigation(oObject);

      if (oParams.Material && oParams.Plant) {

        // --- Workaround for intent-based routing ---

        /* var oNavigationController = this.extensionAPI.getNavigationController();
        oNavigationController.navigateExternal('SlowOrNonMovingDetailPage', oParams); */

        window.location.href = "/sap/bc/ui5_ui5/sap/z_opt2_mmim_sln/index.html?sap-client=300&sap-language=EN&" +
          `Material=${oParams.Material}&` +
          `P_DisplayCurrency=${oParams.P_DisplayCurrency}&` +
          `P_InventoryConsumptionGroup=${oParams.P_InventoryConsumptionGroup}&` +
          `P_KeyDate=${oParams.P_KeyDate}&` +
          `P_NumberOfDays=${oParams.P_NumberOfDays}&` +
          `Plant=${oParams.Plant}` +
          "#/C_SlowOrNonMovingMatlOPgHdrSet(" +
          `P_DisplayCurrency='${oParams.P_DisplayCurrency}',` +
          `P_KeyDate=datetime'${oParams.P_KeyDate}T00%253A00%253A00',` +
          `P_NumberOfDays=${oParams.P_NumberOfDays},` +
          `P_InventoryConsumptionGroup='${oParams.P_InventoryConsumptionGroup}',` +
          `Material='${oParams.Material}',Plant='${oParams.Plant}')`
        // ---
      } else {
        var sMsg = this.getView().getModel('i18n').getResourceBundle().getText('navigationMessage');
        sap.m.MessageToast.show(sMsg);
      }
      return true;
    },

    /** 
     * Handler for custom value help requests
     * @param oEvent The button click event fired through a value help request
    */
    onOpenCustomValueHelpDialog: function (oEvent) {
      var multiInputToPopulate = oEvent.getSource();
      var key = multiInputToPopulate.getCustomData()[0].getValue();
      var fetchEntities = [];
      var entitySet = '';

      // Cover cases for different fields
      if (key === "Plant") {
        fetchEntities = ["Plant", "PlantName", "Country", "CityCode", "CityName", "StreetName", "HouseNumber"];
        entitySet = "/I_MatlDocPlantVH"
      } else if (key === "Material") {
        fetchEntities = ["Material", "MaterialName", "Plant", "PlantName", "MaterialGroup", "MaterialGroupName", "MaterialType", "MaterialTypeName"];
        entitySet = "/I_MatlDocMaterialVH"
      } else if (key === "StorageLocation") {
        fetchEntities = ["StorageLocation", "StorageLocationName", "Plant", "PlantName"];
        entitySet = "/I_MatlDocStorageLocationVH"
      } else if (key === "ProductGroup") {
        fetchEntities = ["ProductGroup", "ProductGroup_Text"];
        entitySet = "/I_ProductGroupVH"
      } else if (key === "ProductType") {
        entitySet = "/I_ProductTypeVH"
        fetchEntities = ["ProductType", "ProductType_Text"];
      } else if (key === "ProductCategory") {
        entitySet = "/I_ProductCategoryVH"
        fetchEntities = ["ProductCategory", "ProductCategory_Text"];
      } else if (key === "ProductGroup") {
        entitySet = "/I_ProductGroupVH"
        fetchEntities = ["ProductGroup", "ProductGroup_Text"];
      } else if (key === "MaterialGroup") {
        entitySet = "/I_ProductGroupVH"
        key = "ProductGroup";
        fetchEntities = ["ProductGroup", "ProductGroup_Text"]
      } else if (key === "MaterialType") {
        entitySet = "/I_ProductTypeVH"
        key = "ProductType";
        fetchEntities = ["ProductType", "ProductType_Text", "ProductTypeCode"]
      } else if (key === "SpecialStockIdfgSupplier") {
        entitySet = "/I_MatlDocStockIdfgSupplierVH"
        fetchEntities = ["SpecialStockIdfgSupplier", "SupplierName"]
      } else if (key === "SpecialStockIdfgSalesOrder") {
        entitySet = "/I_MatlDocStkIdfgSlsOrdVH"
        fetchEntities = ["SpecialStockIdfgSalesOrder", "SalesOrganization"]
      } else if (key === "SpecialStockIdfgSalesOrderItem") {
        entitySet = "/I_MatlDocStkIdfgSlsOrdItmVH"
        fetchEntities = ["SpecialStockIdfgSalesOrder", "SpecialStockIdfgSalesOrderItem", "SalesOrganization"]
      } else if (key === "WBSElementExternalID") {
        entitySet = "/I_MatlDocStockIdfgWBSVH"
        fetchEntities = ["SpecialStockIdfgWBSElement", "WBSElement", "WBSElementExternalID"]
      } else if (key === "SpecialStockIdfgCustomer") {
        entitySet = "/I_MatlDocStockIdfgCustomerVH"
        fetchEntities = ["SpecialStockIdfgCustomer", "CustomerName"]
      } else if (key === "SpecialStockIdfgStockOwner") {
        entitySet = "/I_MatlDocStockIdfgOwnerVH"
        fetchEntities = ["SpecialStockIdfgStockOwner", "SupplierName"]
      } else if (key === "InventorySpecialStockType") {
        entitySet = "/I_MatlDocInvtrySpclStkTypeVH"
        fetchEntities = ["InventorySpecialStockType", "InventorySpecialStockTypeName"]
      } else if (key === "InventoryStockType") {
        entitySet = "/I_MatlDocInvtryStkTypeVH"
        fetchEntities = ["InventoryStockType", "InventoryStockTypeName"]
      }

      // Attach dialog to container and open it
      var dialog = new CustomValueHelpDialog();
      this.byId("customValueHelpDialogContainer").addItem(dialog);
      dialog.open(this, multiInputToPopulate, key, entitySet, fetchEntities);
    },

    /** 
     * ALP extension: TableRebindExtension
     * Used to push filters of custom value help dialog into filter params
     * @param oEvent The beforeRebind event
    */
    onBeforeRebindTableExtension: function (oEvent) {
      var bindingParams = oEvent.getParameter("bindingParams");
      this.byId('template::SmartFilterBar').getFilterGroupItems().forEach(i => {
        var control = i.getControl();
        if (control instanceof sap.m.MultiInput) {
          control.getTokens().forEach(token => {
            bindingParams.filters.push(new sap.ui.model.Filter({
              path: token.data("path"),
              operator: token.data("op"),
              value1: token.data("v1"),
              value2: token.data("v2")
            }));
          });
        }
      });
      /* var bindingParams = oEvent.getParameter("bindingParams");
      this.filterCollection.forEach(filter => {
        filter.field.getTokens().forEach(token => {
          bindingParams.filters.push(new sap.ui.model.Filter({
            path: token.data("path"),
            operator: token.data("op"),
            value1: token.data("v1")
          }));
        });
      }); */

      // Enable button, if table has populated data
      var table = this.byId('analyticalTable');
      var exportButton = this.byId('exportButton');
      exportButton.setEnabled(false);

      var params = oEvent.getParameter('bindingParams');
      params.events = params.events || {};
      params.events.dataReceived = () => {
        var rowsBinding = table.getBinding('rows');
        exportButton.setEnabled(!!rowsBinding && rowsBinding.getLength() > 0);
      }
    },

    /** 
     * ALP extension: ChartRebindExtension
     * Used to push filters of custom value help dialog into filter params,
     * same as for table
     * @param oEvent The beforeRebind event
    */
    onBeforeRebindChartExtension: function (oEvent) {
      var bindingParams = oEvent.getParameter("bindingParams");
      this.byId('template::SmartFilterBar').getFilterGroupItems().forEach(i => {
        var control = i.getControl();
        if (control instanceof sap.m.MultiInput) {
          control.getTokens().forEach(token => {
            bindingParams.filters.push(new sap.ui.model.Filter({
              path: token.data("path"),
              operator: token.data("op"),
              value1: token.data("v1"),
              value2: token.data("v2")
            }));
          });
        }
      });
    },

    /** 
     * Handler for custom export dialog requests
    */
    onCustomExportDialogOpen: function () {
      // Attaches export dialog to container and opens it
      var exportDialogContainer = this.byId("customExportDialogContainer");
      var exportDialog = new CustomExportDialog();
      exportDialogContainer.addItem(exportDialog);
      exportDialog.open((fileName, filterAssign, splitColumns) => this.onExcelExport(fileName, filterAssign, splitColumns));
    },
    /** 
     * Spreadsheet export function
     * @param fileName The filename the user inserted
     * @param filterAssign Boolean whether the filter configuration should be appended
     * @param splitColumns Boolean whether compound columns should be splitted
    */
    onExcelExport: function (fileName, filterAssign, splitColumns) {
      if (typeof fileName !== 'string') {
        fileName = 'Export';
      }
      var tableRef = this.byId('analyticalTable');
      var oBinding = tableRef.getBinding('rows');
      var columns = [];
      tableRef.getColumns().map(function (col) {
        var colData = col.data('p13nData');
        if (colData.additionalProperty) {
          if (splitColumns) {
            columns.push({
              label: col.data('p13nData').leadingProperty,
              property: col.data('p13nData').leadingProperty
            });
            columns.push({
              label: `${col.data('p13nData').additionalProperty} (2)`,
              property: col.data('p13nData').additionalProperty
            });
          } else {
            columns.push({
              label: col.data('p13nData').leadingProperty,
              property: [col.data('p13nData').leadingProperty, col.data('p13nData').additionalProperty],
              template: `{0} ({1})`
            });
          }
        } else {
          columns.push({
            label: col.data('p13nData').leadingProperty,
            property: col.data('p13nData').leadingProperty
          });
        }
      });

      var workbook = { columns: columns };
      if (filterAssign) {
        workbook.context = workbook.context || {};
        workbook.context.title = 'Hallo';
        workbook.context.metainfo = this.buildFilters();

      }

      var sheet = new Spreadsheet({
        workbook: workbook,
        dataSource: oBinding,
        fileName: `${fileName}.xlsx`,
        showProgress: false
      });

      sheet.build().finally(function () { sheet.destroy() });
    },

    /** 
     * Helper function for spreadsheet export to add the filter
     * configuration, retrieves it from the filter bar
    */
    buildFilters: function () {
      var filterBar = this.byId('template::SmartFilterBar');
      var filters = filterBar.getFilterData();
      var res = [];
      Object.keys(filters).forEach((filterKey) => {
        if (filterKey == '_CUSTOM') {
          return
        }
        var test = filters[filterKey];
        res.push({
          key: filterKey,
          value: String(typeof test === 'object' ? JSON.stringify(test) : test)
        })
      });

      filters = filterBar.getFilterGroupItems().forEach(i => {
        if (i.getControl() instanceof sap.m.MultiInput) {
          var tokens = i.getControl().getTokens();
          tokens.forEach(token => {
            res.push({
              key: token.data('path'),
              value: `${token.data('op')} ${token.data('v1')}`
            })
          })
        }
      });

      return [{ name: "Filter Settings", items: res }]

    },

    /** 
     * Handler function to realize dropdown menu for export split button
     * @param oEvent The button click event
    */
    openExportMenu: function (oEvent) {
      if (!this.actionSheet) {
        this.actionSheet = new sap.m.Menu({
          items: [
            new sap.m.MenuItem({
              text: "Export",
              press: function () {
                this.onExcelExport()
              }.bind(this)
            }),
            new sap.m.MenuItem({
              text: "Export as...",
              press: function () {
                this.onCustomExportDialogOpen()
              }.bind(this)
            })
          ]
        });
      }

      this.actionSheet.openBy(oEvent.getSource());
    },

    /** 
     * Function for multi input value suggestions,
     * retrieves the entity key and reads the data
     * @param oEvent Input event from the multi input
    */
    suggestCustom: function (oEvent) {
      var multiInput = oEvent.getSource();
      var key = multiInput.getCustomData()[0].getValue();
      var suggestValue = (oEvent.getParameter('suggestValue') || '').trim();

      multiInput.bindAggregation('suggestionItems', {
        path: `/I_MatlDoc${key}VH`,
        filters: suggestValue ? [new sap.ui.model.Filter(key, sap.ui.model.FilterOperator.StartsWith, suggestValue)] : [],
        length: 10,
        template: new sap.ui.core.ListItem({
          text: `{${key}}`,
          key: `{${key}}`
        })
      });
    },

    /** 
     * Additional onInit function to get chart dimensions/measures and
     * set state variables
    */
    onInit: function () {
      var customChartModel = new sap.ui.model.json.JSONModel({
        'chartBound': false
      });
      this.getView().setModel(customChartModel, 'customChart');

      getDimsFromAnnotations(this.getOwnerComponent().getModel(), 'C_SlowOrNonMovingMatlQryResults').then(({ dims, measures }) => {
        this.availableChartDimensions = dims;
        this.availableChartMeasures = measures;
        this.groupBy = dims.filter(dim => dim.key === 'Plant');
        this.chartMeasures = measures.filter(measure => measure.key === 'StockValueInDisplayCurrency');
        this.byId('selectedDims').addItem(new sap.m.Text({
          text: dims.find(dim => dim.key === 'Plant').text
        }));
      });

      this.chartType = 'bar';
      this.chartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        animation: false
      };
      this.multipleScalesY = false;
      this.multipleScalesX = false;

      var html = this.byId('chartContainer');
      html.setContent('<canvas id=\'chartJsDiv\' style=\'width:100%; max-height:150px;\'></canvas>');
      this.extModel = this.getOwnerComponent().getModel();

      //this.groupBy = ["Plant"];
      var smartFilterBar = this.byId('template::SmartFilterBar');
      smartFilterBar.attachSearch(function () {
        this.renderChart();
      }.bind(this));
      this.showChartLegend = true;
    },

    /** 
     * Handler for view change (split-chart-table)
     * @param e The click event that switches the view
    */
    viewSelectionChange: function (e) {
      var selectedKey = e.getParameter('item').getKey();
      this.getView().getModel('_templPriv').setProperty('/alp/contentView', selectedKey);

      var canvas = document.getElementById('chartJsDiv');
      console.log(selectedKey)
      canvas.style.maxHeight = selectedKey === 'chart' ? "400px" : "150px";
      canvas.style.height = selectedKey === 'chart' ? "400px" : "150px";
      if (this.chart) {
        this.chart.resize();
      }
    },

    /** 
     * Handler for change chart type, opens an action sheet
     * @param oEvent The click event that opens the action sheet 
    */
    handleChartTypeSelect: function (oEvent) {
      var chartTypeActionSheet = new sap.m.ActionSheet({
        showCancelButton: false
      });
      chartTypeActionSheet.addButton(new sap.m.Button({
        icon: "sap-icon://horizontal-bar-chart",
        text: "Bar Chart",
        press: function () {
          this.chartType = 'bar';
          this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            indexAxis: 'y'
          };
          this.renderChart();
        }.bind(this)
      }));
      chartTypeActionSheet.addButton(new sap.m.Button({
        icon: "sap-icon://bar-chart",
        text: "Column Chart",
        press: function () {
          this.chartType = 'bar';
          this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false
          };
          this.renderChart();
        }.bind(this)
      }));
      chartTypeActionSheet.addButton(new sap.m.Button({
        icon: "sap-icon://line-chart",
        text: "Line Chart",
        press: function () {
          this.chartType = 'line';
          this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false
          };
          this.renderChart();
        }.bind(this)
      }));
      chartTypeActionSheet.addButton(new sap.m.Button({
        icon: "sap-icon://pie-chart",
        text: "Pie Chart",
        press: function () {
          this.chartType = 'pie';
          this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false
          };
          this.renderChart();
        }.bind(this)
      }));
      chartTypeActionSheet.addButton(new sap.m.Button({
        icon: "sap-icon://donut-chart",
        text: "Donut Chart",
        press: function () {
          this.chartType = 'doughnut';
          this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false
          };
          this.renderChart();
        }.bind(this)
      }));
      chartTypeActionSheet.addButton(new sap.m.Button({
        icon: "sap-icon://horizontal-bullet-chart",
        text: "Bullet Chart",
        press: function () {
          this.chartType = 'bar';
          this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            indexAxis: 'y'
          };
          this.renderChart();
        }.bind(this)
      }));
      chartTypeActionSheet.addButton(new sap.m.Button({
        icon: "sap-icon://vertical-bullet-chart",
        text: "Vertical Bullet Chart",
        press: function () {
          this.chartType = 'bar';
          this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false
          };
          this.renderChart();
        }.bind(this)
      }));
      chartTypeActionSheet.addButton(new sap.m.Button({
        icon: "sap-icon://horizontal-stacked-chart",
        text: "Stacked Bar Chart",
        press: function () {
          this.chartType = 'bar';
          this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            indexAxis: 'y',
            scales: {
              x: {
                stacked: true
              },
              y: {
                stacked: true
              }
            }
          };
          this.renderChart();
        }.bind(this)
      }));
      chartTypeActionSheet.addButton(new sap.m.Button({
        icon: "sap-icon://vertical-stacked-chart",
        text: "Stacked Column Chart",
        press: function () {
          this.chartType = 'bar';
          this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
              x: {
                stacked: true
              },
              y: {
                stacked: true
              }
            }
          };
          this.renderChart();
        }.bind(this)
      }));

      if (this.chartMeasures.length > 1) {
        chartTypeActionSheet.addButton(new sap.m.Button({
          icon: "sap-icon://horizontal-combination-chart",
          text: "Combined Column Line Chart",
          press: function () {
            this.chartType = 'column-line';
            this.chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              animation: false
            };
            this.renderChart();
          }.bind(this)
        }));
        chartTypeActionSheet.addButton(new sap.m.Button({
          icon: "sap-icon://vertical-stacked-chart",
          text: "Column Chart with 2 Y-Axes",
          press: function () {
            this.chartType = 'bar';
            this.chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              animation: false
            };
            this.multipleScalesY = true;
            this.renderChart();
          }.bind(this)
        }));
        chartTypeActionSheet.addButton(new sap.m.Button({
          icon: "sap-icon://horizontal-bar-chart",
          text: "Bar Chart with 2 X-Axes",
          press: function () {
            this.chartType = 'bar';
            this.chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              indexAxis: 'y'
            };
            this.multipleScalesX = true;
            this.renderChart();
          }.bind(this)
        }));
        chartTypeActionSheet.addButton(new sap.m.Button({
          icon: "sap-icon://line-chart",
          text: "Line Chart with 2 Y-Axes",
          press: function () {
            this.chartType = 'line';
            this.chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              animation: false
            };
            this.multipleScalesY = true;
            this.renderChart();
          }.bind(this)
        }));
        chartTypeActionSheet.addButton(new sap.m.Button({
          icon: "sap-icon://horizontal-stacked-chart",
          text: "Stacked Bar Chart with 2 X-Axes",
          press: function () {
            this.chartType = 'bar';
            this.chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              indexAxis: 'y',
              scales: {
                x: {
                  stacked: true
                },
                y: {
                  stacked: true
                }
              }
            };
            this.multipleScalesX = true;
            this.renderChart();
          }.bind(this)
        }));
        chartTypeActionSheet.addButton(new sap.m.Button({
          icon: "sap-icon://vertical-stacked-chart",
          text: "Stacked Column Chart with 2 Y-Axes",
          press: function () {
            this.chartType = 'bar';
            this.chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              scales: {
                x: {
                  stacked: true
                },
                y: {
                  stacked: true
                }
              }
            };
            this.multipleScalesY = true;
            this.renderChart();
          }.bind(this)
        }));
        chartTypeActionSheet.addButton(new sap.m.Button({
          icon: "sap-icon://horizontal-combination-chart",
          text: "Combined Column Line Chart with 2 Y-Axes",
          press: function () {
            this.chartType = 'column-line';
            this.chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              animation: false
            };
            this.multipleScalesY = true;
            this.renderChart();
          }.bind(this)
        }));
        chartTypeActionSheet.addButton(new sap.m.Button({
          icon: "sap-icon://horizontal-combination-chart",
          text: "Combined Bar Line Chart with 2 X-Axes",
          press: function () {
            this.chartType = 'column-line';
            this.chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              indexAxis: 'y'
            };
            this.multipleScalesX = true;
            this.renderChart();
          }.bind(this)
        }));
        chartTypeActionSheet.addButton(new sap.m.Button({
          icon: "sap-icon://horizontal-combination-chart",
          text: "Combined Stacked Line Chart with 2 Y-Axes",
          press: function () {
            this.chartType = 'bar';
            this.chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              animation: false
            };
            this.multipleScalesY = true;
            this.renderChart();
          }.bind(this)
        }));
        chartTypeActionSheet.addButton(new sap.m.Button({
          icon: "sap-icon://horizontal-combination-chart",
          text: "Horizontal Combined Stacked Line Chart with 2 X-Axes",
          press: function () {
            this.chartType = 'bar';
            this.chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              indexAxis: 'y'
            };
            this.multipleScalesX = true;
            this.renderChart();
          }.bind(this)
        }));
      }

      chartTypeActionSheet.openBy(oEvent.getSource());
    },

    /** 
     * Handler for the dimension select, opens an action sheet
     * @param oEvent The click event to open the action sheet
    */
    handleClickChartDrillDown: function (oEvent) {
      if (!this.chartActionSheet) {
        this.chartActionSheet = new sap.m.ActionSheet({
          showCancelButton: false
        });
      }
      this.getChartActionSheetButtons();
      this.chartActionSheet.openBy(oEvent.getSource());
    },

    /** 
     * Handler for measure select, opens an action sheet
     * @param oEvent The click event to open the action sheet
    */
    handleClickMeasureSelect: function (oEvent) {
      if (!this.chartMeasureSheet) {
        this.chartMeasureSheet = new sap.m.ActionSheet({
          showCancelButton: false
        });
      }
      this.getChartMeasuresActionSheetButtons();
      this.chartMeasureSheet.openBy(oEvent.getSource());
    },
    /** 
     * Helper function to retrieve all available dimensions and add buttons to the action sheet
    */
    getChartActionSheetButtons: function () {
      this.chartActionSheet.destroyButtons();
      this.availableChartDimensions.forEach(dim => {
        var t = new sap.m.Button({
          text: dim.text,
          press: this.onDimensionChoose.bind(this)
        });
        t.data("key", dim.key);
        this.chartActionSheet.addButton(t);
      });
    },
    /** 
     * Helper function to retrieve all available measures and add buttons to the action sheet
    */
    getChartMeasuresActionSheetButtons: function () {
      this.chartMeasureSheet.destroyButtons();
      this.availableChartMeasures.forEach(measure => {
        var t = new sap.m.Button({
          text: measure.text,
          press: this.onMeasureChoose.bind(this)
        });
        t.data("key", measure.key);
        this.chartMeasureSheet.addButton(t);
      });
    },

    /** 
     * Handler to choose chart dimensions
     * @param oEvent The click event emitted when a dimension on the action sheet is selected
    */
    onDimensionChoose: function (oEvent) {
      var key = oEvent.getSource().data("key");
      var dimToAdd = this.availableChartDimensions.find(dim => dim.key === key);
      if (!this.groupBy.includes(dimToAdd)) {
        this.groupBy.push(dimToAdd);
      } else {
        var temp = this.groupBy.filter(dim => dim.key != key);
        if (temp.length == 0) {
          return
        } else {
          this.groupBy = temp;
        }
      }
      this.rerenderLinkBar();
      this.renderChart();
    },

    /** 
     * Handler to choose chart measures
     * @param oEvent The click event emitted when a measure on the action sheet is selected
    */
    onMeasureChoose: function (oEvent) {
      var key = oEvent.getSource().data("key");
      var measureToAdd = this.availableChartMeasures.find(measure => measure.key === key);
      if (!this.chartMeasures.includes(measureToAdd)) {
        this.chartMeasures.push(measureToAdd);
      } else {
        var temp = this.chartMeasures.filter(measure => measure.key != key);
        if (temp.length == 0) {
          return
        } else {
          this.chartMeasures = temp;
        }
      }
      this.renderChart();
    },

    /** 
     * Renders the link bar above the chart that shows the currently selected dimensions
    */
    rerenderLinkBar: function () {
      var dimsBox = this.byId('selectedDims');
      dimsBox.destroyItems();

      if (!this.groupBy) return;
      if (this.groupBy.length > 1) {
        var link = new sap.m.Link({
          text: this.groupBy[0].text,
          press: this.dimLinkSelect.bind(this)
        });
        link.addStyleClass('sapUiTinyMarginBeginEnd');
        link.data('dimKey', this.groupBy[0].key);
        dimsBox.addItem(link);

        this.groupBy.slice(1, this.groupBy.length - 1).forEach(dim => {
          dimsBox.addItem(new sap.m.Text({ text: "/" }));
          var link = new sap.m.Link({
            text: dim.text,
            press: this.dimLinkSelect.bind(this)
          });
          link.addStyleClass('sapUiTinyMarginBeginEnd');
          link.data('dimKey', dim.key);
          dimsBox.addItem(link);
        });

        dimsBox.addItem(new sap.m.Text({ text: "/" }));
        var text = new sap.m.Text({
          text: this.groupBy[this.groupBy.length - 1].text
        });
        text.addStyleClass('sapUiTinyMarginBeginEnd');
        dimsBox.addItem(text);

      } else {
        dimsBox.addItem(new sap.m.Text({
          text: this.groupBy[0].text
        }));
      }
    },

    /** 
     * Handler for dimension select in the link bar
     * @param oEvent The click event emitted when a link in the link bar is selected
    */
    dimLinkSelect: function (oEvent) {
      var dimKey = oEvent.getSource().data('dimKey');
      var i = this.groupBy.findIndex(dim => dim.key === dimKey);
      this.groupBy = this.groupBy.slice(0, i + 1);
      this.rerenderLinkBar();
      this.renderChart();
    },

    /** 
     * Handler for legend toggling
     * @param oEvent The click event to toggle the chart legend
    */
    toggleLegend: function (oEvent) {
      this.showChartLegend = oEvent.getSource().getPressed();
      this.chart.options.plugins.legend.display = this.showChartLegend;
      this.chart.update();
    },

    /** 
     * Main function for chart rendering,
     * collects filters from FilterBar, reads the data and 
     * generates a chart based on the configuration and the chart
     * type selection
    */
    renderChart: function () {
      var filterBar = this.byId('template::SmartFilterBar');
      var filterData = filterBar.getFilterData();

      var filters = [];
      var params = [];
      Object.keys(filterData).forEach(filterKey => {
        var filterValue = filterData[filterKey];
        if (filterKey != "_CUSTOM") {
          if (typeof filterValue === "number" || typeof filterValue === "boolean") {
            params.push({
              key: filterKey.split('$Parameter.')[1],
              value: filterValue
            });
          } else if (filterValue instanceof Date) {
            var tempDate = filterValue.toISOString().slice(0, 10);
            params.push({
              key: filterKey.split('$Parameter.')[1],
              value: `datetime%27${tempDate}T00%3a00%3a00%27`
            });
          } else {
            params.push({
              key: filterKey.split('$Parameter.')[1],
              value: `%27${filterValue}%27`
            });
          }
        }
      });

      filterBar.getFilterGroupItems().forEach(item => {
        item.getControl().getTokens().forEach(token => {
          if (token.data('v2')) {
            filters.push(
              new sap.ui.model.Filter(token.data('path'), token.data('op'), token.data('v1'), token.data('v2'))
            );
          } else {
            filters.push(
              new sap.ui.model.Filter(token.data('path'), token.data('op'), token.data('v1'))
            );
          }
        });
      });

      var entity = "/C_SlowOrNonMovingMatlQry("
      params.forEach((param, i) => {
        entity = entity + param.key + "=" + param.value;
        if (i != params.length - 1) {
          entity = entity + ","
        }
      });
      entity += ")/Results"

      var selection = this.groupBy.map(dim => {
        return dim.secondProp ? `${dim.key},${dim.secondProp}` : dim.key
      }).join(",") + "," + this.chartMeasures.map(measure => {
        return measure.unit ? `${measure.key},${measure.unit}` : measure.key
      });

      this.extModel.read(entity, {
        filters: filters,
        urlParameters: {
          "$select": selection
        },
        success: function ({ results }) {
          var grouped = groupSum(results, this.groupBy.map(dim => {
            return {
              primary: dim.secondProp ? dim.secondProp : dim.key,
              secondary: dim.secondProp ? dim.key : null
            }
          }), this.chartMeasures.map(measure => {
            return {
              key: measure.key,
              unit: measure.unit
            }
          }));

          var x_values = grouped.map(l => this.groupBy.map(d => l[d.secondProp ? d.secondProp : d.key]));
          /* var borderColors =  new Array(x_values.length).fill('black');
          var borderWidths =  new Array(x_values.length).fill(2); */
          var pivot = false;
          var y_data = this.chartMeasures.map((measure) => {
            var y = grouped.map(l => l[measure.key]);
            var unit = grouped.length >= 1 ? grouped[0][measure.unit] : null;

            var res = {
              label: `${measure.text} ${unit ? `(${unit})` : ""}`,
              data: y,
              /* borderColor: borderColors,
              borderWidth: borderWidths */
            }

            if (this.chartType === 'column-line') {
              res.type = pivot ? 'line' : 'bar';
              pivot = true;
            }

            if (this.multipleScalesY) {
              res.yAxisID = this.chartMeasures.indexOf(measure) % 2 == 0 ? 'leftY' : 'rightY'
            }
            if (this.multipleScalesX) {
              res.xAxisID = this.chartMeasures.indexOf(measure) % 2 == 0 ? 'topX' : 'bottomX'
            }

            return res;
          });

          if (this.chart) {
            this.chart.destroy();
          }

          this.chartOptions.plugins = {
            legend: {
              display: this.showChartLegend,
              position: 'bottom',
              align: 'start'
            }
          };

          this.chartOptions.onClick = (evt, elements) => {
            /* if(elements.length > 0) {
              var index = elements[0].index;
              var datasetIndex = elements[0].datasetIndex;
              
              var dataset = this.chart.data.datasets[datasetIndex];
              dataset.borderColor = Array(dataset.data.length).fill('gray');
              dataset.borderWidth = Array(dataset.data.length).fill(2);

              dataset.borderColor[index] = 'black';
              dataset.borderWidth[index] = 3;
              this.chart.update();
            } */
          }

          if (this.multipleScalesY) {
            if (!this.chartOptions.scales) {
              this.chartOptions.scales = {
                leftY: {
                  type: 'linear',
                  position: 'left',
                  grid: {
                    display: false
                  }
                },
                rightY: {
                  type: 'linear',
                  position: 'right'
                }
              }
            } else {
              this.chartOptions.scales.leftY = {
                type: 'linear',
                position: 'left',
                stacked: true,
                grid: {
                  display: false
                }
              }
              this.chartOptions.scales.rightY = {
                type: 'linear',
                position: 'right',
                stacked: true
              }
            }
            this.multipleScalesY = false;
          }

          if (this.multipleScalesX) {
            if (!this.chartOptions.scales) {
              this.chartOptions.scales = {
                topX: {
                  type: 'linear',
                  position: 'top'
                },
                bottomX: {
                  type: 'linear',
                  position: 'bottom'
                }
              }
            } else {
              this.chartOptions.scales.topX = {
                type: 'linear',
                position: 'top',
                stacked: true
              }
              this.chartOptions.scales.bottomX = {
                type: 'linear',
                position: 'bottom',
                stacked: true
              }
            }
            this.multipleScalesX = false;
          }

          this.getView().getModel('customChart').setProperty('/chartBound', true);
          this.chart = new Chart(document.getElementById('chartJsDiv'), {
            type: this.chartType,
            data: {
              labels: x_values,
              datasets: y_data
            },
            options: this.chartOptions
          });

        }.bind(this),
        error: function () {
          this.getView().getModel('customChart').setProperty('/chartBound', false);
        }
      });
    }
  });
  return sap.ui.controller(sControllerName);
});

/** 
 * This list contains all adjustments made to the template library in order to
 * provide the required changes:
 * 
 * OPT1:
 * - AnalyticalListPage/view/fragments/SmartFilterBar: added VBox container to
 * host the custom dialogs, introduced a MultiInput as custom control to be able
 * to configure the valueHelpRequest handler
 * - AnalyticalListPage/view/fragments/DetailSmartTable: disabled Excel export
 * - AnalyticalListPage/view/fragments/SmartTableToolbar: added custom excel 
 * export splitbutton and VBox container to host the custom export dialog
 * 
 * OPT2:
 * - AnalyticalListPage/view/fragments/SmartChart: Commented out SmartChart, added custom OverflowToolbar
 * with required functionality (as in original version), added HTML element to add chartjs canvas
*/
