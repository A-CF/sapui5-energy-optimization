sap.ui.define([
    "sap/base/util/extend",
    "sap/base/util/deepExtend",
    "sap/ui/model/odata/AnnotationHelper",
    "sap/suite/ui/generic/template/js/StableIdHelper",
    "sap/suite/ui/generic/template/js/staticChecksHelper",
    "sap/suite/ui/generic/template/js/preparationHelper",
	"sap/suite/ui/generic/template/lib/FeLogger"], function (extend, deepExtend, AHModel, StableIdHelper, staticChecksHelper, preparationHelper, FeLogger) {
    "use strict";
    var oGlobalParameters;
    var oResult;
	var oLogger = new FeLogger("ObjectPage.Component").getLogger();
    function fnGetAnnotationWithDefaults(sAnnotationName, oAnnotation) {
        // Provide optional properties of annotation with defaults according to vocabulary
        // should best be done in metaModel itself
        // if they don't agree:
        // - move at least to a central place in our library (-> preparationHelper? MetaDataAnalyzer?)
        // - don't change original data in metaModel, but create a copy
        var oResult = extend({}, oAnnotation);
        switch (sAnnotationName) {
            case "com.sap.vocabularies.UI.v1.ReferenceFacet":
                if (!oResult["com.sap.vocabularies.UI.v1.PartOfPreview"] || oResult["com.sap.vocabularies.UI.v1.PartOfPreview"].Bool !== "false") {
                    oResult["com.sap.vocabularies.UI.v1.PartOfPreview"] = {
                        Bool: "true"
                    };
                }
                break;
            default:
                break;
        }
        return oResult;
    }

    function fnGetTargetAnnotation(oReferenceFacetContext) {
        if (!oReferenceFacetContext.getObject().Target) {
            // clarify how to deal with reference facet without target
            return undefined;
        }
        var sMetaModelPath = AHModel.resolvePath(oGlobalParameters.metaModel.getContext(oReferenceFacetContext.sPath + "/Target"));
        return sMetaModelPath && oGlobalParameters.metaModel.getContext(sMetaModelPath).getObject();
    }

    var iMissingIdCounter = 0;
    function fnGetSections(sPath, bHeaderFacet, iLevel, oParentFacet) {
        // Analysis of facets. Needs to be tolerant, as sometimes facets are defined in a way that seems to be meaningless,
        // (sometimes used just to be able to replace them in an extension, not clear, whether this is the only reason)
        // known case:
        // collection facet without any facets
        // reference facet without a target (but with an ID)
        // reference facet with a target pointing to an arbitrary string (without special characters, not pointing to sth. within the service)
        // reference facet with a target pointing to a not existing navigation property
        var aResult = [];
        var aLevelNames = ["sections", "subSections", "blocks"];
        iLevel = iLevel || 0;
        var aFacets = oGlobalParameters.metaModel.getObject(sPath);
        if (!Array.isArray(aFacets)) {
            // in case of empty collection facet, metaModel returns {} (instead of [] as would be expected)
            // for anything else, meaning would currently not be clear
            return [];
        }
        aFacets.forEach(function (oFacet, i) {
            var oFacetCurrentLevel = {
                facetId: StableIdHelper.getStableId({
                    type: "ObjectPage",
                    subType: "Facet",
                    sRecordType: oFacet.RecordType,
                    bIsHeaderFacet: bHeaderFacet,
                    sAnnotationPath: oFacet.Target && oFacet.Target.AnnotationPath,
                    sAnnotationId: oFacet.ID && oFacet.ID.String
                }),
                facetAnnotation: oFacet,
                metaModelPath: sPath + "/" + i
            };

            // as intermediate step provide id also as an object with property id to simplify switching from generating facetId during templating
            oFacetCurrentLevel.facetIdAsObject = {
                id: oFacetCurrentLevel.facetId
            };

            // oFacetCurrentLevel.parentFacetId = oParentFacet && oParentFacet.facetId;
            oFacetCurrentLevel.fallbackIdByEnumerationForRuntime = oFacetCurrentLevel.facetId || "missingStableId#" + iMissingIdCounter++;

            if (oFacet.RecordType === "com.sap.vocabularies.UI.v1.CollectionFacet") {
                var aNextLevel = fnGetSections(sPath + "/" + i + "/Facets", bHeaderFacet, iLevel + 1, oFacetCurrentLevel);
                var sNextLevel = aLevelNames[iLevel + 1] || "unsupportedNestingLevel";
                oFacetCurrentLevel[sNextLevel] = aNextLevel;
            } else if (oFacet.RecordType === "com.sap.vocabularies.UI.v1.ReferenceFacet") {
                // Id that would would be generated if no id is provided in annotations: Since in the past for some cases sections could be identified in manifest by this id
                // even if a real id was provided in annotation, we need to know this id to be able to merge also manifest settings provided there.
                // This kind of id is only defined for reference facets (and calculated by using the annotation path of the target annotation)
                oFacetCurrentLevel.fallbackIdByAnnotationPathForManifest = StableIdHelper.getStableId({
                    type: "ObjectPage",
                    subType: "Facet",
                    sRecordType: oFacet.RecordType,
                    bIsHeaderFacet: bHeaderFacet,
                    sAnnotationPath: oFacet.Target && oFacet.Target.AnnotationPath
                });

                oFacetCurrentLevel.facetAnnotation = fnGetAnnotationWithDefaults("com.sap.vocabularies.UI.v1.ReferenceFacet", oFacet);
                // oBlock describes what is actually build out of the reference facet (except the section/subsection structure). Naming comes from ObjectPageSubSections default aggregation
                // - think of whether this is the best naming here
                var oBlock = extend({}, oFacetCurrentLevel);
				
				// Todo: targetAnnotation is not really needed here (when jsut analyzing sections structure), but only later, when normalizing specific properties. Thus, it should be moved there.
				// Currently, we keep it here, as we use fnNormalizeSections on all levels (-> should be split, targetAnnotation only needed on block level)
				oBlock.targetAnnotation = fnGetTargetAnnotation(oGlobalParameters.metaModel.getContext(sPath + "/" + i));
				// if facet annotation is inconsistent, targetAnnotation would be undefined. Keep it here anyway, as extension might refer to it

                switch (iLevel) {
                    case 0:
                        // if reference facet is defined directly, it's used to create Section, SubSection and Block
                        var oSubSection = extend({}, oFacetCurrentLevel);
                        oSubSection.blocks = [oBlock];
                        oFacetCurrentLevel.subSections = [oSubSection];
                        break;
                    case 1:
                        oFacetCurrentLevel.blocks = [oBlock];
                        // incase of collection facet on top containing referencefacet , collectionfacet id is also used in the subsection
                        oFacetCurrentLevel.facetId = oParentFacet.facetId;
                        oFacetCurrentLevel.fallbackIdByEnumerationForRuntime = oParentFacet.fallbackIdByEnumerationForRuntime;
                        oFacetCurrentLevel.facetAnnotation = oParentFacet.facetAnnotation;
                        break;
                    case 2:
                        oFacetCurrentLevel.targetAnnotation = oBlock.targetAnnotation;
                        break;
                    default:
                        oLogger.warning("UnSupported Nesting of Collectionfacets");
                        break;
                }
            } else {
				oLogger.warning("UnSupported Facet annotation record type: " + oFacet.RecordType);
				// to ignore wrong facet record types, just don't add them to sections
				return;
            }
            aResult.push(oFacetCurrentLevel);
        });
        return aResult;
    }


    function fnGetNormalizedTableSettings(oSettings) {
        // for ObjectPage, unfortunately an additional settings allTableMultiSelect had been introduced, that just has the same meaning as setting
        // multiSelect on component level, but needs to be supported for compatibility
        oSettings.multiSelect = oSettings.multiSelect || oSettings.allTableMultiSelect;

        // tolerance if reference facet points to a not existent navigation property: assume no navigation, i.e. use entiyset of page
        var sTargetMetaModelPath = AHModel.gotoEntitySet(oGlobalParameters.metaModel.getContext(oSettings.metaModelPath + "/Target"));
        var sEntitySet = sTargetMetaModelPath && oGlobalParameters.metaModel.getObject(sTargetMetaModelPath).name || oGlobalParameters.leadingEntitySet;
        //					var oLineItem = preparationHelper.getAnnotation(oMetaModel, oMetaModel.getODataEntitySet(sEntitySet).entityType, oSettings.annotation, oSettings.qualifier);

        var oExtensions = oGlobalParameters.componentUtils.getExtensions();
        // todo: check, whether fallbackIdByAnnotationPathForManifest could also be used for oExtensions.Sections
        var oExtensionActions = oExtensions && oExtensions.Sections && oExtensions.Sections[oSettings.facetId] && oExtensions.Sections[oSettings.facetId].Actions;
        var oResult = preparationHelper.getNormalizedTableSettings(oGlobalParameters.metaModel, oSettings, oGlobalParameters.device, sEntitySet, oExtensionActions, oSettings.targetAnnotation);
        oResult.variantManagement = !!(oSettings.tableSettings && oSettings.tableSettings.variantManagement);
        // if selection is only needed for delete (button in toolbar), it should be only set when deletion is actually possible
        // in draft, deletion is possible only in edit case, in non-draft, only in display case
        if (oResult.onlyForDelete) {
            oResult.mode = oGlobalParameters.componentUtils.isDraftEnabled() ? "{= ${ui>/editable} ? '" + oResult.mode + "' : 'None'}"
                : "{= ${ui>/editable} ? 'None' : '" + oResult.mode + "'}";
        }
        var oEntitySet = oGlobalParameters.metaModel.getODataEntitySet(sEntitySet);
        if (oResult && oResult.createWithParameterDialog && oResult.createWithParameterDialog.fields) {
            staticChecksHelper.checkErrorforCreateWithDialog(oGlobalParameters.metaModel.getODataEntityType(oEntitySet.entityType), oResult);
            oResult.createWithParameterDialog.id = StableIdHelper.getStableId({ type: 'ObjectPageAction', subType: 'CreateWithDialog', sFacet: oSettings.facetId });
        }

        return oResult;
    }

    function fnGetNormalizedChartSettings(oSettings) {
        return {
            variantManagement: !!(oSettings.chartSettings && oSettings.chartSettings.variantManagement)
        };
    }

    function fnNormalizeSectionSettings(oFacetData) {
        // To avoid the inconsistency introduced in the past to read section settings, the framework now merges the settings coming from id generated from annotations
        // and the id framework generates thus avoid breaking the possibility to define the settings either way.
        var oMergedSectionSettings = oGlobalParameters.originalSettings.sections &&
            extend({}, oGlobalParameters.originalSettings.sections[oFacetData.facetId], oGlobalParameters.originalSettings.sections[oFacetData.fallbackIdByAnnotationPathForManifest]);

        extend(oFacetData, oMergedSectionSettings, oFacetData);
        // Prio 3: any settings on page level: Maybe only relevant depending on annotation (e.g. tableSettings only relevant for LineItem annotation)
        var oSettings = deepExtend({}, oGlobalParameters.originalSettings, oFacetData);

        /*
         *	To be checked - where is this needed?
         *
         * 					var oLoadingBehavior = oSettings && oSettings.loadingBehavior;
                            if (!oLoadingBehavior) {
                                // default LoadingBehavior
                                oSettings.loadingStrategy = "lazyLoading";
                            } else if (oLoadingBehavior.waitForViewportEnter) {
                                oSettings.loadingStrategy = oLoadingBehavior.waitForHeaderData ? "lazyLoadingAfterHeader" : "lazyLoading";
                             } else {
                                oSettings.loadingStrategy = oLoadingBehavior.waitForHeaderData ? "activateAfterHeaderDataReceived" : "activateWithBindingChange";
                             }
        */

		// specific analysis for anything defined in the annotation a reference facet is refering to
		// only needed on block level - on sections and subSections level, targetAnnotation is not defined
		// on block level, target annotation could also be undefined, if the reference facet annotation is broken (i.e. not build correctly, or refering to sth. not existentn in the service). In this case, no specific analysis is needed.
		// We would anyway not render anything for this, so there can also not be any settings that might be needed to be analyzed. However, the section, subsection or block it self is needed to provide the corresponding extension points:
		// ReplaceFacet, BeforeFacet, AfterFacet, ReplaceSubSection, BeforeSubSection, AfterSubSection, SmartFormExtension
		if (oFacetData.targetAnnotation){
			// as targetAnnotation is found, we can rely on correct facetAnnotation
			var sAnnotation = oFacetData.facetAnnotation.Target.AnnotationPath.split("@").pop().split("#")[0];
	
			switch (sAnnotation) {
			case "com.sap.vocabularies.UI.v1.LineItem":
				oFacetData.tableSettings = fnGetNormalizedTableSettings(oSettings);
				break;
			case "com.sap.vocabularies.UI.v1.Chart":
				oFacetData.chartSettings = fnGetNormalizedChartSettings(oSettings);
				break;
				//						further possibilities:
				//						case "com.sap.vocabularies.UI.v1.FieldGroup":
				//						case "com.sap.vocabularies.UI.v1.Identification":
				//						case "com.sap.vocabularies.Communication.v1.Contact":
				//						case "com.sap.vocabularies.UI.v1.DataPoint":
			default: break;
			}
		}
		
		// temporary - to be removed with sections refactoring:
		// Add all settings to flat structure used so far (but now renamed to sectionsMap to avoid mixing array and map).
		// Be aware, that this will be partly overridden: If sections/subsections are created out of a reference facet, the same facetId is used on level section, subSection and block.
		// However, the last overriding happens on block level, where all information is available (and some part, i.e. the target annotation, is added only there)
		oResult.sectionsMap[oFacetData.facetId] = oFacetData;
		// also temporary: add a property "annotation" (which contains the type of the target annotation if applicable)
		// (used in controller to retrieve info objects on startup)
		oResult.sectionsMap[oFacetData.facetId].annotation = sAnnotation;
	}

    function fnGetTemplateSpecificParameters(oComponentUtils, oMetaModel, oOriginalSettings, oDevice, sLeadingEntitySet) {
        oResult = {
            headerSections: {},
            sectionsMap: {}
        };
        oGlobalParameters = { componentUtils: oComponentUtils, metaModel : oMetaModel, device: oDevice, originalSettings: oOriginalSettings, leadingEntitySet: sLeadingEntitySet };

        var sEntitySetPath = oGlobalParameters.metaModel.getMetaContext("/" + oGlobalParameters.leadingEntitySet).getPath();
        // Object.assign(oResult.headerSections, fnGetSections(sEntitySetPath + "/com.sap.vocabularies.UI.v1.HeaderFacets", true));
        oResult.sections = fnGetSections(sEntitySetPath + "/com.sap.vocabularies.UI.v1.Facets", false);

        oResult.sections.forEach(function (oSectionData) {
            fnNormalizeSectionSettings(oSectionData);
            oSectionData.subSections.forEach(function (oSubSectionData) {
                fnNormalizeSectionSettings(oSubSectionData);
                // ignore collection facets on unsupported levels
                oSubSectionData.blocks = oSubSectionData.blocks.filter(function (oBlock) {
                    return oBlock.facetAnnotation.RecordType === "com.sap.vocabularies.UI.v1.ReferenceFacet";
                });
                oSubSectionData.blocks.forEach(function (oFormData) {
                    fnNormalizeSectionSettings(oFormData);
                });
                // segregate blocks and more blocks
                oSubSectionData.moreBlocks = oSubSectionData.blocks.filter(function (oBlock) {
                    return oBlock.facetAnnotation["com.sap.vocabularies.UI.v1.PartOfPreview"].Bool === "false";
                });
                oSubSectionData.blocks = oSubSectionData.blocks.filter(function (oBlock) {
                    return oBlock.facetAnnotation["com.sap.vocabularies.UI.v1.PartOfPreview"].Bool === "true";
                });

            });
        });

        oResult.breadCrumb = oComponentUtils.getBreadCrumbInfo();
        oResult.isSelflinkRequired = true;
        oResult.isIndicatorRequired = true;
        oResult.isSemanticallyConnected = false;
        return oResult;
    }
    return {
        getTemplateSpecificParameters: fnGetTemplateSpecificParameters
    };
});
