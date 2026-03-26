sap.ui.define(["sap/base/util/deepExtend",	"sap/suite/ui/generic/template/lib/FeError"], function(deepExtend, FeError) {
	"use strict";
	var	sClassName = "js.preparationHelper";

	function getNormalizedTableSettings(oMetaModel, oOriginalSettings, Device, sEntitySet, oExtensionActions, aLineItem){
		var oSettings = deepExtend({}, oOriginalSettings);
		// 1. map boolean settings gridTable and treeTable to tableType
		oSettings.tableType = oSettings.tableType || (oSettings.gridTable ? "GridTable" : undefined);
		oSettings.tableType = oSettings.tableType || (oSettings.treeTable ? "TreeTable" : undefined);

		// 2. map flat settings to structured ones
		oSettings.tableSettings = oSettings.tableSettings || {};
		oSettings.tableSettings.type = oSettings.tableSettings.type || oSettings.tableType;
		oSettings.tableSettings.multiSelect = (oSettings.tableSettings.multiSelect === undefined ? oSettings.multiSelect : oSettings.tableSettings.multiSelect);

		// 3. set defaults, as suggested in Component.js
		oSettings.tableSettings.selectAll = (oSettings.tableSettings.selectAll === undefined ? false : oSettings.tableSettings.selectAll);
		oSettings.tableSettings.inlineDelete = !!oSettings.tableSettings.inlineDelete;
		oSettings.tableSettings.multiSelect = !!oSettings.tableSettings.multiSelect;
		oSettings.tableSettings.selectionLimit = oSettings.tableSettings.selectionLimit || 200;

		var oEntitySet = oMetaModel.getODataEntitySet(sEntitySet);
		var oEntityType = oMetaModel.getODataEntityType(oEntitySet.entityType);

		// 4. determine type
		if (Device.system.phone) {
			oSettings.tableSettings.type = "ResponsiveTable";
		} else if (sEntitySet){
			oSettings.tableSettings.type = oSettings.tableSettings.type || (oEntityType["sap:semantics"] === "aggregate" ? "AnalyticalTable" : "ResponsiveTable");
			if (oSettings.tableSettings.type === "AnalyticalTable" && !(oEntityType["sap:semantics"] === "aggregate")){
				oSettings.tableSettings.type = "GridTable";
			}
		}

		// check for invalid combinations
		if (oSettings.tableSettings.multiSelect && oSettings.tableSettings.inlineDelete) {
			throw new FeError(sClassName, "Both inlineDelete and multiSelect options for table are not possible");
		}

		if (oSettings.tableSettings.type !== "ResponsiveTable" && oSettings.tableSettings.inlineDelete) {
			throw new FeError(sClassName, "InlineDelete property is not supported for " + oSettings.tableSettings.type + " type table");
		}

		oSettings.tableSettings.mode = (oSettings.tableSettings.multiSelect ? "MultiSelect" : "SingleSelectLeft");
		oSettings.tableSettings.onlyForDelete = true;

		// LineItem should be an Array, but this is not ensured in case of wrong annotations
		if (Array.isArray(aLineItem) && aLineItem.find(function(oRecord) {
				return !(oRecord.Inline && oRecord.Inline.Bool) &&
						(oRecord.RecordType === "com.sap.vocabularies.UI.v1.DataFieldForAction"
						|| (oRecord.RecordType === "com.sap.vocabularies.UI.v1.DataFieldForIntentBasedNavigation" && oRecord.RequiresContext && oRecord.RequiresContext.Bool));
			})) {
			oSettings.tableSettings.onlyForDelete = false;
		}
		for (var sAction in oExtensionActions){
			if (oExtensionActions[sAction].requiresSelection !== false){
				oSettings.tableSettings.onlyForDelete = false;
				break;
			}
		}

		if (oSettings.tableSettings.onlyForDelete && oEntitySet["Org.OData.Capabilities.V1.DeleteRestrictions"] && oEntitySet["Org.OData.Capabilities.V1.DeleteRestrictions"].Deletable && oEntitySet["Org.OData.Capabilities.V1.DeleteRestrictions"].Deletable.Bool === "false"){
			oSettings.tableSettings.mode = "None";
			oSettings.tableSettings.onlyForDelete = false;
		}

		if (oSettings.tableSettings.type !== "ResponsiveTable"){
			if (oSettings.tableSettings.mode === "SingleSelectLeft"){
				oSettings.tableSettings.mode = "Single";
			} else if (oSettings.tableSettings.mode === "MultiSelect"){
				oSettings.tableSettings.mode = "MultiToggle";
			}
		}

		if (oSettings.tableSettings.inlineDelete){
			oSettings.tableSettings.mode = "Delete";
			oSettings.tableSettings.onlyForDelete = true;
		}

		// 5. remove deprecated settings (to avoid new code to rely on them)
		delete oSettings.gridTable;
		delete oSettings.treeTable;
		delete oSettings.tableType;
		delete oSettings.multiSelect;
		return oSettings.tableSettings;
	}

	function getAnnotation(oMetaModel, sEntityType, sAnnotation, sQualifier){
		var aParts = [sAnnotation];
		if (sQualifier) {
			aParts.push(sQualifier);
		}
		var sFullAnnotation = aParts.join("#");
		return oMetaModel.getODataEntityType(sEntityType)[sFullAnnotation];
	}

	function getLineItemFromVariant(oMetaModel, sEntityType, sQualifier){
		function getObject(sPath){
			if (sPath[0] !== "/"){
				// relative path - add path of annotation target, i.e. EntityType
				sPath = oMetaModel.getODataEntityType(sEntityType, true) + "/" + sPath;
			}
			// assumption: absolute paths in annotations are equal to corresponding paths in metaModel
			// any "@" are removed in the metaModel
			return oMetaModel.getObject(sPath.replace(/@/g, ""));
		}

		function getPresentationVariant(oSelectionPresentationVariant){
			// PresentationVariant must be defined (according to vocabulary) either via "Path" or inline (i.e. Path is not defined).
			// For compatibilty, just ignore if not provided (leading to fallback to use LineItem without qualifier)  
			return oSelectionPresentationVariant.PresentationVariant && oSelectionPresentationVariant.PresentationVariant.Path ? getObject(oSelectionPresentationVariant.PresentationVariant.Path) : oSelectionPresentationVariant.PresentationVariant;
		}

		function getLineItem(oPresentationVariant){
			// Visualizations must be defined (according to vocabulary)
			// however, this is not given at least in all demokit apps (presenetationVariant consisting only of sortOrder)
			var oVisualization = oPresentationVariant.Visualizations && oPresentationVariant.Visualizations.find(function(oVisualization){
				return oVisualization.AnnotationPath.includes("com.sap.vocabularies.UI.v1.LineItem");
			});
			return oVisualization && getObject(oVisualization.AnnotationPath);
		}

		// Qualifier could be for a SelectionPresentationVariant or for a PresentationVariant. SelectionPresentationVariant has precendence
		// check for SelectionPresentationVariant with given qualifier
		var oSelectionPresentationVariant = getAnnotation(oMetaModel, sEntityType,  "com.sap.vocabularies.UI.v1.SelectionPresentationVariant", sQualifier);

		// if found, use PresentationVariant given by that SelectionPresentationVariant, otherwise check for PresentationVariant with given qualifier
		var oPresentationVariant = oSelectionPresentationVariant ? getPresentationVariant(oSelectionPresentationVariant) : getAnnotation(oMetaModel, sEntityType, "com.sap.vocabularies.UI.v1.PresentationVariant", sQualifier);

		// if found, use Lineitem given by that PresentationVariant, otherwise use default LineItem (without qualifier - sQualifier is not interpreted as being the qualifier for the LineItem itself!)

		// according to vocabulary, "A reference to `UI.Lineitem` should always be part of the collection"
		// however this is not given for existing applications - in that case fall back to default LineItem as if no PresentationVariant was given
		return oPresentationVariant && getLineItem(oPresentationVariant) || getAnnotation(oMetaModel, sEntityType, "com.sap.vocabularies.UI.v1.LineItem");
	}


	return {
		getNormalizedTableSettings: getNormalizedTableSettings,
		getAnnotation: getAnnotation,
		getLineItemFromVariant: getLineItemFromVariant
	};
});
