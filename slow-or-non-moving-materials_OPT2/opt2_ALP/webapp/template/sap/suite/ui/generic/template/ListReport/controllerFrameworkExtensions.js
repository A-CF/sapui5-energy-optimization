sap.ui.define([ ], function() {
		"use strict";
		
		/**
		 * This class contains all extension functions that have been defined for the ListReport floorplan.
		 * @namespace sap.suite.ui.generic.template.ListReport.controllerFrameworkExtensions
		 * @public
		 */
		
		return /** @lends sap.suite.ui.generic.template.ListReport.controllerFrameworkExtensions */ {

			/**
			 *
			 * @protected
			 */
			getVisibleSelectionsWithDefaults: function() {
				// We need a list of all selection fields in the SmartFilterBar for which defaults are defined
				// (see method setSmartFilterBarDefaults) and which are currently visible.
				// This is needed by _getBackNavigationParameters in the NavigationController.
				var aVisibleFields = [];
					// if(this.oView.byId(this.sPrefix + ".DateKeyDate").getVisible()){
				// aVisibleFields.push("KeyDate");
				// }
				return aVisibleFields;
			},

			/**
			 *
			 * @protected
			 */
			onInitSmartFilterBarExtension: function(oEvent) {},
			/**
			 *
			 * @protected
			 */			
			getCustomAppStateDataExtension: function(oCustomData) {},
			/**
			 *
			 * @protected
			 */			
			restoreCustomAppStateDataExtension: function(oCustomData) {},
			/**
			 *
			 * @protected
			 */			
			onBeforeRebindTableExtension: function(oEvent) {},
			/**
			 *
			 * @protected
			 */
			onBeforeRebindChartExtension: function(oEvent) {},
			/**
			 *
			 * @protected
			 */
			adaptNavigationParameterExtension: function(oSelectionVariant, oObjectInfo) {},
			/**
			 * This method can be used to perform conditional (internal or external) navigation from different rows of the SmartTable
			 * based on the context available in the selected table record. Such custom navigation should be triggered via corresponding methods of
			 * {@link sap.suite.ui.generic.template.extensionAPI.NavigationController}.
			 * @param {sap.ui.base.Event} oEvent - The press event fired when navigating from a row in the SmartTable. It is recommended
			 * to ignore this parameter and use <code>oBindingContext</code> instead.
			 * @param {sap.ui.model.Context} oBindingContext - The context of the corresponding table row.
			 * @param {boolean} bReplaceInHistory - This parameter should be considered if the method triggers an internal navigation. Pass this
			 * parameter to <code>oNavigationData.replaceInHistory</code> in this case.
			 * @return <code>true</code> if framework navigation should be surpressed (that means: extension code has taken over navigation)
			 * @protected
			 */
			onListNavigationExtension: function(oEvent, oBindingContext, bReplaceInHistory) {},
			/**
			 *
			 * @protected
			 */
			getPredefinedValuesForCreateExtension: function(oSmartFilterBar){},
			/**
			 *
			 * @protected
			 */
			adaptTransientMessageExtension: function(){},
			/**
			 *
			 * @protected
			 */
			onSaveAsTileExtension: function(oShareInfo) {},
			/**
			 *
			 * @protected
			 */
			beforeDeleteExtension: function(oBeforeDeleteProperties) {},
			/**
			 *
			 * @protected
			 */
			modifyStartupExtension: function(oStartupObject) {}
		};
	});