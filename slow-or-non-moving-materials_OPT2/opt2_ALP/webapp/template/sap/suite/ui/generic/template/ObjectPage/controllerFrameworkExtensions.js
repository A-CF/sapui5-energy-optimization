sap.ui.define([ ], function() {
		"use strict";
		
		/**
		 * This class contains all extension functions that have been defined for the ObjectPage floorplan.
		 * @namespace sap.suite.ui.generic.template.ObjectPage.controllerFrameworkExtensions
		 * @public
		 */
		
		return /** @lends sap.suite.ui.generic.template.ObjectPage.controllerFrameworkExtensions */ {

			/**
			 *
			 * @protected
			 */
			adaptNavigationParameterExtension: function(oSelectionVariant, oObjectInfo) {},
			/**
			 * This method can be used to influence the data retrieval for tables on the object page.
			 * @param oEvent {sap.ui.base.Event} the {@link sap.ui.comp.smarttable.SmartTable.prototype.event:beforeRebindTable}  event. Use <code>getSource()</code> to retrieve the
			 * {@link sap.ui.comp.smarttable.SmartTable} for which the event was triggered. Use parameter <i>bindingParams</i> to get access to the binding parameters.
			 * @protected
			 */
			onBeforeRebindTableExtension: function(oEvent) {},
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
			provideCustomStateExtension: function(oState){},
			/**
			 *
			 * @protected
			 */
			applyCustomStateExtension: function(oState, bIsSameAsLast){},
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
			beforeDeleteExtension: function() {},
			/**
			 *
			 * @protected
			 */
			beforeSaveExtension: function() {},
			/**
			 *
			 * @protected
			 */
			beforeLineItemDeleteExtension: function(oBeforeLineItemDeleteProperties) {}
		};
	});