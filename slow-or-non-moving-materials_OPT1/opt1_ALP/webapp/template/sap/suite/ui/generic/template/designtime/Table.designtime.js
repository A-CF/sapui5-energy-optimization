sap.ui.define([
		"sap/suite/ui/generic/template/designtime/utils/DesigntimeUtils",
		"sap/suite/ui/generic/template/designtime/library.designtime"
	],
	function(DesigntimeUtils) {
		"use strict";

		var oTableDesigntime = {

			/**
			 * Gets the propagated and redefined designtime for a sap.m.Table element, as presented in a list report.
			 *
			 * @param {object} oElement The current UI element which must me sap.m.Table
			 * @returns {object} designtime metadata, with embedded functions
			 * @public
			 */
			getDesigntime: function(oElement) {
				var oResourceBundle = sap.ui.getCore().getModel("i18nDesigntime").getResourceBundle();

				return {
					name: {
						singular: function() {
							return oResourceBundle.getText("FE_TABLE");
						}
					},
					links: {
						guidelines: [{
							href: "/table-overview/",
							text: function() {
								return oResourceBundle.getText("FE_TABLE_GUIDE");
							}
						}]
					},
					properties: DesigntimeUtils.getTableProperties(oElement),
					aggregations: {
						items: {
							ignore: true
						},
						infoToolbar: {
							ignore: true
						},
						columns: {
							actions: {
								// example of a change that allows moving child controls inside this aggregation
								// the changeType "moveTableColumns" has to be defined in flexibilty.js
								move: "moveTableColumns",
								add: {
									delegate: function () {
										return {
											changeType: "addTableColumn",
											changeOnRelevantContainer: true
										};
									}
								}
							}
						}
					}
				};
			}
		};

		return oTableDesigntime;
	});
