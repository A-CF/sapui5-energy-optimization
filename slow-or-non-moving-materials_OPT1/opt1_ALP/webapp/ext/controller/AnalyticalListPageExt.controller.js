/*
 * Copyright (C) 2009-2020 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([
  'sap/ui/core/format/DateFormat',
  'ui/s2p/mm/slonomo/mat/opt1/ext/controls/CustomValueHelpDialog',
  'ui/s2p/mm/slonomo/mat/opt1/ext/controls/CustomExportDialog',
  'sap/ui/export/Spreadsheet'
], function (DateFormat, CustomValueHelpDialog, CustomExportDialog, Spreadsheet) {
  'use strict';
  var sControllerName = 'ui.s2p.mm.slonomo.mat.opt1.ext.controller.AnalyticalListPageExt';

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

        window.location.href = "/sap/bc/ui5_ui5/sap/z_opt1_mmim_sln/index.html?sap-client=300&sap-language=EN&" +
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
*/
