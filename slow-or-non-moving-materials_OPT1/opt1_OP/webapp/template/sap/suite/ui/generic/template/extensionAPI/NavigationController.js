sap.ui.define(["sap/ui/base/Object",
	"sap/suite/ui/generic/template/lib/FeLogger",
	"sap/base/util/extend",
	"sap/ui/model/Context"
], function(BaseObject, FeLogger, extend, Context) {
	"use strict";
	var oLogger = new FeLogger("extensionAPI.NavigationController").getLogger();
	/**
	 * API to be used for navigation in extensions of Smart Template Applications. Breakout coding can access an instance
	 * of this class via {@link sap.suite.ui.generic.template.ListReport.extensionAPI.ExtensionAPI} or
	 * {@link sap.suite.ui.generic.template.ObjectPage.extensionAPI.ExtensionAPI}. Do not instantiate yourself.
	 * @class
	 * @name sap.suite.ui.generic.template.extensionAPI.NavigationController
	 * @public
	 */

	function getMethods(oTemplateUtils, oController, oState) {

		return /** @lends sap.suite.ui.generic.template.extensionAPI.NavigationController.prototype */ {
			/**
			 * Navigates to the given intent
			 *
			 * @param {string} sOutbound The name of the outbound defined in the manifest
			 * @param {object} [mParameters] map with parameters for the navigation. If no parameters are provided, default are the parameters defined in the manifest
			 * @public
			 */
			navigateExternal: function(sOutbound, mParameters) {
				var oManifestEntry = oController.getOwnerComponent().getAppComponent().getManifestEntry("sap.app");
				var oOutbound = oManifestEntry.crossNavigation.outbounds[sOutbound];

				if (!oOutbound) {
					oLogger.error("navigateExternal: mandatory parameter 'Outbound' is missing, or different from manifest entry");
					return;
				}

				if (mParameters){
					oOutbound.parameters = mParameters;
				} else {
					// todo: evaluate parameters
				}
				oTemplateUtils.oCommonUtils.navigateExternal(oOutbound, oState);
			},
			/**
			 * Triggers a navigation to another page within the application
			 *
			 * @param {sap.ui.model.Context | String | sap.ui.model.Context[]} vContext The target context for the navigation.
			 *  vContext as String, to navigate to specified target
			 *  vContext as Array [hierarchyOfContext] target context being the last context of hierarchyOfContext
			 *  E.g to directly navigate from LR to Sub object page, the hierarchyOfContext would be [contextOfMainObjectPage, contextOfSubObjectPage]
			 *  vContext as sap.ui.model.Context if only one context has to be passed, send it as an Object instead of Array, to navigate to specified Target
			 * If the parameter is faulty (and oNavigationData does not specify a route itself) the root page of the app is considered to be the target of the application.
			 * @param {object} [oNavigationData] object containing navigation data
			 * @param {string} [oNavigationData.navigationProperty] The navigation property identifying the target of the navigation
			 * @param {boolean} [oNavigationData.replaceInHistory] If this is truthy the page navigated to will replace the current page in the browser history
			 * @public
			 */
			navigateInternal: function(vContext, oNavigationData) {
				if (vContext && oState && oState.aCreateContexts){ // vContext might have been registered for create navigation
					for (var i = 0; i < oState.aCreateContexts.length; i++){
						var oCreateContextSpec = oState.aCreateContexts[i];
						if (oCreateContextSpec.context === vContext){
							oState.aCreateContexts.splice(i, 1);
							oTemplateUtils.oServices.oApplication.navigateToNonDraftCreateContext(oCreateContextSpec);
							return;
						}
					}
				}
				var bReplace = !!(oNavigationData && oNavigationData.replaceInHistory);
				// explicit route has been configured -> virtual context
				var sRouteName = oNavigationData && oNavigationData.routeName;
				if (sRouteName){
					oTemplateUtils.oComponentUtils.navigateRoute(sRouteName, vContext, null, bReplace);
					return;
				}
				// 'normal' navigation via context
				if (!vContext || Array.isArray(vContext) || vContext instanceof Context){
					oTemplateUtils.oServices.oApplication.navigateToSubContext(vContext, bReplace, 0);
					return;
				}
				oLogger.warning("navigateToContext called without suitable context or route");
			},

			getCurrentKeys: function(){
				return oTemplateUtils.oComponentUtils.getCurrentKeys();
			}
		};
	}

	return BaseObject.extend("sap.suite.ui.generic.template.extensionAPI.NavigationController", {
		constructor: function(oTemplateUtils, oController, oState) {
			extend(this, getMethods(oTemplateUtils, oController, oState));
		}
	});
});
