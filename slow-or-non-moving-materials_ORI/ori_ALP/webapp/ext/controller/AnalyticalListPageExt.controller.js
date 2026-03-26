/*
 * Copyright (C) 2009-2020 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(['sap/ui/core/format/DateFormat'], function (DateFormat) {
  'use strict';
  var sControllerName = 'ui.s2p.mm.slonomo.mat.ori.ext.controller.AnalyticalListPageExt';

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

        window.location.href = "/sap/bc/ui5_ui5/sap/z_ori_mmim_slno/index.html?sap-client=300&sap-language=EN&" +
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
  });
  return sap.ui.controller(sControllerName);
});
