sap.ui.define([
	"sap/ui/base/Object",
	"sap/suite/ui/generic/template/js/StableIdHelper",
    "sap/suite/ui/generic/template/lib/MessageUtils",
    "sap/base/util/extend",
    "sap/suite/ui/generic/template/lib/testableHelper",
    "sap/suite/ui/generic/template/lib/CRUDHelper"
], function(BaseObject, StableIdHelper, MessageUtils, extend, testableHelper, CRUDHelper) {
	"use strict";

	// This helper class handles creation using dialog in the List Report
	// In case the create with dialog is enabled in List Report it instantiates an instance of
	// sap.suite.ui.generic.template.Listreport.controller.CreateWithDialogHandler which implements the main part of the logic
	// This class only contains the glue code which is used to adapt the services provided by  generic class to the requirements of the List Report

	// oState is used as a channel to transfer data to the controller and back
	// oController is the controller of the enclosing ListReport
	// oTemplateUtils are the template utils as passed to the controller implementation
	function getMethods(oState, oController, oTemplateUtils) {

        var oDialog, oTable;

        function fnGetFilterForCurrentState() {
            return {
                "aFilters": [
                    {
                        sPath: "fullTarget",
                        sOperator: "StartsWith",
                        oValue1: oDialog.getBindingContext().getPath()
                    },
                    {
                        sPath: "target",
                        sOperator: "EQ",
                        oValue1: "/" + oController.getOwnerComponent().getEntitySet()
                    }]
            };
        }

        function fnRemoveOldMessageFromModel() {
            var oContextFilter = fnGetFilterForCurrentState(oDialog);
            var oMessageModel = sap.ui.getCore().getMessageManager().getMessageModel();
            if (oContextFilter) {
                var oMessageBinding = oMessageModel.bindList("/", null, null, [oContextFilter]); // Note: It is necessary to create  binding each time, since UI5 does not update it (because there is no change handler)
                var aContexts = oMessageBinding.getContexts();
                if (aContexts.length) {
                    var aErrorToBeRemoved = [];
                    for (var oContext in aContexts) {
                        aErrorToBeRemoved.push(aContexts[oContext].getObject());
                    }
                    sap.ui.getCore().getMessageManager().removeMessages(aErrorToBeRemoved); //to remove error state from field
                }
            }
        }

        function fnCancelPopUpDialog() {
            oDialog.close();
            if (oTemplateUtils.oComponentUtils.isDraftEnabled()) {
                oTemplateUtils.oServices.oCRUDManager.discardDraft(oDialog.getBindingContext());
            } else {
                fnRemoveOldMessageFromModel(oDialog);
                oController.getView().getModel().deleteCreatedEntry(oDialog.getBindingContext());
            }
            oDialog.setBindingContext(null);
        }

        function fnSavePopUpDialog(oEvent) {
            var bMessageModelContainsError = false;
            var oFilter;
            var oSmartForm = oDialog && oDialog.getContent && oDialog.getContent() && oDialog.getContent()[0];
            var oCheckPromise = oSmartForm ? oSmartForm.check() : Promise.resolve();
            oCheckPromise.then(function(){
                 // client side error processing
                var aModelData = sap.ui.getCore().getMessageManager().getMessageModel().getData();
                bMessageModelContainsError = aModelData.some(function(oErrorInfo) {
                    return oErrorInfo.type === "Error" && oErrorInfo.validation;
                });
                if (!bMessageModelContainsError && oTemplateUtils.oComponentUtils.isDraftEnabled()) { //Draft save
                    var oCRUDActionHandler = oTemplateUtils.oComponentUtils.getCRUDActionHandler();
                    oFilter = fnGetFilterForCurrentState(oDialog);
                    oCRUDActionHandler.handleCRUDScenario(1, fnActivateImpl.bind(null, oFilter));
                } else if (!bMessageModelContainsError) {   //non-draft save
                    oTemplateUtils.oCommonEventHandlers.submitChangesForSmartMultiInput();
                    oFilter = fnGetFilterForCurrentState(oDialog);
                    var oSaveEntityPromise = oTemplateUtils.oServices.oCRUDManager.saveEntity(oFilter);
                    oSaveEntityPromise.then(function () {
                        oDialog.close();
                        if (oState && oState.oSmartTable) {
                            if (oState.refreshModel){
                                oState.refreshModel();
                            } else {
                                oTemplateUtils.oCommonUtils.refreshModel(oState.oSmartTable);
                            }
                            oTemplateUtils.oCommonUtils.refreshSmartTable(oState.oSmartTable);
                            MessageUtils.showSuccessMessageIfRequired(oTemplateUtils.oCommonUtils.getText("OBJECT_CREATED"), oTemplateUtils.oServices);
                        } else {
                            oTemplateUtils.oCommonUtils.refreshModel(oTable);
                            oTemplateUtils.oCommonUtils.refreshSmartTable(oTable);
                            MessageUtils.showSuccessMessageIfRequired(oTemplateUtils.oCommonUtils.getContextText("ITEM_CREATED", oTable.getId()), oTemplateUtils.oServices);
                        }
                        fnRemoveOldMessageFromModel(oDialog);
                        oDialog.setBindingContext(null);
                    });
                    var oEvent1 = {
                        saveEntityPromise: oSaveEntityPromise
                    };
                    oTemplateUtils.oComponentUtils.fire(oController, "AfterSave", oEvent1);
                }
            });
        }

        function fnActivateImpl(oCreateWithDialogFilter) {	//activate draft entity
            var oActivationPromise = oTemplateUtils.oServices.oCRUDManager.activateDraftEntity(oDialog.getBindingContext(), oCreateWithDialogFilter);
            oActivationPromise.then(function (oResponse) {
                if (oResponse && oResponse.response && oResponse.response.statusCode === "200") {
                    oDialog.close();
                    oDialog.setBindingContext(null);
                    MessageUtils.showSuccessMessageIfRequired(oTemplateUtils.oCommonUtils.getText("OBJECT_CREATED"), oTemplateUtils.oServices);
                    oTemplateUtils.oCommonUtils.refreshSmartTable(oState.oSmartTable);
                }
            }, Function.prototype);
            var oEvent = {
                activationPromise: oActivationPromise
            };
            oTemplateUtils.oComponentUtils.fire(oController, "AfterActivate", oEvent);
        }

        function fnCreateWithDialog(oCreateWithDialog, oEventSource) {
            oDialog = oCreateWithDialog;
            var oSmartFilterbar = oState.oSmartFilterbar;
            oTable = oTemplateUtils.oCommonUtils.getOwnerControl(oEventSource);
            oTable = oTemplateUtils.oCommonUtils.isSmartTable(oTable) ? oTable : oTable.getParent();
            var oModel = new sap.ui.model.json.JSONModel();
            oModel.setProperty("/title", oTemplateUtils.oCommonUtils.getContextText("CREATE_DIALOG_TITLE", oTable.getId()));
            oDialog.setModel(oModel,"localModel");
            oDialog.setEscapeHandler(fnCancelPopUpDialog);
            if (oTemplateUtils.oComponentUtils.isDraftEnabled()) {	//Create Dialog load for draft apps
                oTemplateUtils.oCommonEventHandlers.addEntry(oEventSource, false, oSmartFilterbar, false, false, true).then(
                    function (oTargetInfo) {
                        oTemplateUtils.oServices.oApplication.registerContext(oTargetInfo);
                        oDialog.setBindingContext(oTargetInfo);
                        oDialog.open();
                    });
            } else {	//create dialog for non-draft apps.
                var oParentContext = oTable.getParent().getBindingContext();
                var sPath = oParentContext ? oTable.getTableBindingPath() : '/' + oTable.getEntitySet();
                var oNewContext = CRUDHelper.createNonDraft(oParentContext, sPath, oDialog.getModel());
                oDialog.setBindingContext(oNewContext);
                oDialog.open();
            }
        }

        /* eslint-disable */
        var fnActivateImpl = testableHelper.testable(fnActivateImpl, "fnActivateImpl");
        var fnRemoveOldMessageFromModel = testableHelper.testable(fnRemoveOldMessageFromModel, "fnRemoveOldMessageFromModel");
        var fnGetFilterForCurrentState = testableHelper.testable(fnGetFilterForCurrentState, "fnGetFilterForCurrentState");
        /* eslint-enable */

		// public instance methods
		return {
            onCancelPopUpDialog: fnCancelPopUpDialog,
            onSavePopUpDialog: fnSavePopUpDialog,
            createWithDialog: fnCreateWithDialog
		};
	}

	return BaseObject.extend("sap.suite.ui.generic.template.lib.CreateWithDialogHandler", {
		constructor: function(oState, oController, oTemplateUtils) {
			extend(this, getMethods(oState, oController, oTemplateUtils));
		}
	});
});
