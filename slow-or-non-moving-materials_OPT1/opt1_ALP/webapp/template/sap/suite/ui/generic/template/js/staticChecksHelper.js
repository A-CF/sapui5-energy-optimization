sap.ui.define([	"sap/suite/ui/generic/template/lib/FeError"], function(FeError) {
	"use strict";
	var	sClassName = "js.staticChecksHelper";

    // This helper class handles the  design time checks for List Report and Object Page
	// sap.suite.ui.generic.template.js.staticChecksHelper which implements the main part of the logic
	function fnCheckErrorforCreateWithDialog(oEntityType, oTableSettings, oSettings) {
        //validation in case of create dialog pop up
        var aEntityProperties = oEntityType.property;
        var oFieldObject = oTableSettings.createWithParameterDialog.fields;
        var bPropertyExists;
        if (Object.keys(oFieldObject).length > 8) {
            throw new FeError("Maximum allowed entries for create with dialog is 8, please relook in manifest.");
        } else if (oSettings && (oSettings.quickVariantSelectionX || oSettings.quickVariantSelection)) {
            throw new FeError("The feature Create With Dialog is not enabled for multiView or multiTab app, please relook in manifest.");
        } else {
            var fnHasPropertyName = function(sName, oPropertyInfo) {
                return oPropertyInfo.name === sName;
            };
            for (var sProperty in oFieldObject) {
                bPropertyExists = aEntityProperties.some(fnHasPropertyName.bind(null, oFieldObject[sProperty].path));
                if (!bPropertyExists) {
                    throw new FeError(sClassName, "property " + oFieldObject[sProperty].path + " is not part of entity type, please relook in manifest.");
                }
            }
        }
	}

	return {
		checkErrorforCreateWithDialog: fnCheckErrorforCreateWithDialog
	};
});
