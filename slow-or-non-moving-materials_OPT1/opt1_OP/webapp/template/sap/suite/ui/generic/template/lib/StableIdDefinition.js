sap.ui.define([],function(){
	"use strict";

	// Ids for facet are constructed in a very special way, therefore the needed functions are separated here. Don't do the same for other ids!
	// Actually there are no controls using these ids directly as there id, but only as a part (i.e. as parameter sFacet)
	
	// getHeaderFacets provides the ids for facets pointed to from annotation UI.HeaderFacets 
	// In header (i.e. in display mode), ids start always with header::headerEditable::
	// In edit mode, in the section to edit the header fiels, ids start with headerEditable:: 
	function getHeaderFacetId(oParams){
		if (oParams.sAnnotationId) {
			return "headerEditable::" + oParams.sAnnotationId;
		} else {
			return (oParams.sRecordType === "com.sap.vocabularies.UI.v1.ReferenceFacet" ? "headerEditable::" + oParams.sAnnotationPath : undefined );
		}
	}
	
	function getStandardFacetId(oParams){
		return oParams.sAnnotationId || (oParams.sRecordType === "com.sap.vocabularies.UI.v1.ReferenceFacet" ? oParams.sAnnotationPath : undefined );
	}
	
	// getFacetId is only a wrapper for headerFacets (pointed to from annotation UI.HeaderFacets) and normal facets (pointed to from annotation UI.Facets)
	function getFacetId(oParams){
		return oParams.bIsHeaderFacet ? getHeaderFacetId(oParams) : getStandardFacetId(oParams);
	}
	
	return {
		parameters: ["sQuickVariantKey", "sFacet", "sSmartTableId", "sProperty", "sTarget", "sSemanticObject", "sAction", "sEntitySet", "sFacetExtensionKey", "sRecordType", "sAnnotationPath", "sAnnotationId", "sReuseComponentName", "sReuseComponentUsage", "sReuseComponentId", "bIsHeaderFacet"],
		types: {
			ListReportPage: {
				DynamicPage: {
					value: "page"
				},
				DynamicPageTitle: {},
				DynamicPageHeader: {}
			},
			ListReportTable: {
				SmartTable: {
					optionalParameters: ["sQuickVariantKey"],
					value: function(oParams){return oParams.sQuickVariantKey ? "listReport-" + oParams.sQuickVariantKey : "listReport";}
				},
				ResponsiveTable: {
					optionalParameters: ["sQuickVariantKey"],
					value: function(oParams){return oParams.sQuickVariantKey ? "responsiveTable-" + oParams.sQuickVariantKey : "responsiveTable";}
				},
				ColumnListItem: {
					optionalParameters: ["sQuickVariantKey"],
					value: function(oParams){
						return oParams.sQuickVariantKey ? "template:::ListReportTable:::QuickVariantSelectionXColumnListItem:::sQuickVariantKey::" + oParams.sQuickVariantKey
																						: "template:::ListReportTable:::ColumnListItem";
					}
				},
				GridTable: {
					optionalParameters: ["sQuickVariantKey"],
					value: function(oParams){return oParams.sQuickVariantKey ? "GridTable-" + oParams.sQuickVariantKey : "GridTable";}
				},
				AnalyticalTable: {
					optionalParameters: ["sQuickVariantKey"],
					value: function(oParams){return oParams.sQuickVariantKey ? "analyticalTable-" + oParams.sQuickVariantKey : "analyticalTable";}
				},
				TreeTable: {
					optionalParameters: ["sQuickVariantKey"],
					value: function(oParams){return oParams.sQuickVariantKey ? "TreeTable-" + oParams.sQuickVariantKey : "TreeTable";}
				}
			},
			ListReportAction: {
				Create: {
					optionalParameters: ["sQuickVariantKey"],
					value: function(oParams){return oParams.sQuickVariantKey ? "addEntry-" + oParams.sQuickVariantKey : "addEntry";}
				},
				CreateWithFilter: {
					optionalParameters: ["sQuickVariantKey"],
					value: function(oParams){return oParams.sQuickVariantKey ? "template:::ListReportAction:::CreateWithFilter:::sQuickVariantKey::" + oParams.sQuickVariantKey : "template::addEntryWithFilter";}
				},
				CreateWithDialog: {},
				CreateMenu: {
					optionalParameters: ["sQuickVariantKey"],
					value: function(oParams){return oParams.sQuickVariantKey ? "template:::ListReportAction:::CreateMenu:::sQuickVariantKey::" + oParams.sQuickVariantKey : "template::ListReport::AddEntry";}
				},
				Filter: {
					optionalParameters: ["sQuickVariantKey"]
				},
				Sort: {
					optionalParameters: ["sQuickVariantKey"]
				},
				Group: {
					optionalParameters: ["sQuickVariantKey"]
				},
				Personalize: {
					optionalParameters: ["sQuickVariantKey"]
				},
				MultiEdit: {}
			},
			QuickVariantSelectionX: {
				IconTabBar: {
					value: "template::IconTabBar"
				},
				IconTabFilter: {
					parameters: ["sQuickVariantKey"],
					value: function(oParams){return "template::IconTabFilter-" + oParams.sQuickVariantKey;}
				}
			},
			QuickVariantSelection: {
				SegmentedButton: {
					value: "template::SegmentedButton"
				},
				VariantSelect: {
					value: "template::VariantSelect"
				}
			},
			ALPTable: {
				SmartTable: {
					value: "table"
				}
			},
			ObjectPage: {
				HeaderFacet: {
					parameters: ["sRecordType"],
					optionalParameters: ["sAnnotationPath", "sAnnotationId"],
					value: function(oParams){
						if (oParams.sAnnotationId){
							return "header::headerEditable::" + oParams.sAnnotationId;
						} else {
							return (oParams.sRecordType === "com.sap.vocabularies.UI.v1.ReferenceFacet" ? "header::headerEditable::" + oParams.sAnnotationPath : undefined );
						}
					}
				},
				EditableHeaderFacet: {
					parameters: ["sRecordType"],
					optionalParameters: ["sAnnotationPath", "sAnnotationId"],
					value: getHeaderFacetId 
				},
				StandardFacet: {
					parameters: ["sRecordType"],
					optionalParameters: ["sAnnotationPath", "sAnnotationId"],
					value: getStandardFacetId
				},
				Facet: {
					parameters: ["sRecordType"],
					optionalParameters: ["bIsHeaderFacet", "sAnnotationPath", "sAnnotationId"],
					value: getFacetId
				},
				Section: {
					parameters: ["sFacet"],
					value: function(oParams){return oParams.sFacet + "::Section";}
				}
			},
			ObjectPageHeader: {
				DynamicHeaderContentFlexBox: {},
				InitialsAvatar: {},
				SnappedHeaderInitialsAvatar: {},
				HeaderTitle: {
					parameters: ["sFacet"]
				}
			},
			ObjectPageAction: {
				Create: {
					parameters: ["sFacet"],
					value: function(oParams){return oParams.sFacet + "::addEntry";}
				},
				Delete: {
					parameters: ["sFacet"],
					value: function(oParams){return oParams.sFacet + "::deleteEntry";}
				},
				Paste: {
					parameters: ["sFacet"],
					value: function(oParams){return oParams.sFacet + "::pasteEntries";}
				},
				DisplayActiveVersion: {},
				ContinueEditing: {},
				EditText: {},
				SaveAndEdit: {},
				CreateWithDialog: {
					parameters: ["sFacet"]
				}
			},
			ObjectPageSection: {
				DynamicSideContent: {
					parameters: ["sFacet"],
					value: function(oParams){return oParams.sFacet + "::DynamicSideContent";}
				},
				SideContentButton: {
					parameters: ["sFacet"],
					value: function(oParams){return oParams.sFacet + "::SideContentButton";}
				},
				BeforeFacetExtensionSection: {
					parameters: ["sEntitySet", "sFacet"],
					value: function(oParams){return "BeforeFacet::" + oParams.sEntitySet  + "::" +  oParams.sFacet + "::Section";}
				},
				BeforeFacetExtensionSubSection: {
					parameters: ["sEntitySet", "sFacet"],
					value: function(oParams){return "BeforeFacet::" + oParams.sEntitySet  + "::" +  oParams.sFacet + "::SubSection";}
				},
				BeforeFacetExtensionSectionWithKey: {
					parameters: ["sEntitySet", "sFacet", "sFacetExtensionKey"]
				},
				BeforeFacetExtensionSubSectionWithKey: {
					parameters: ["sEntitySet", "sFacet", "sFacetExtensionKey"]
				},
				AfterFacetExtensionSection: {
					parameters: ["sEntitySet", "sFacet"],
					value: function(oParams){return "AfterFacet::" + oParams.sEntitySet  + "::" +  oParams.sFacet + "::Section";}
				},
				AfterFacetExtensionSubSection: {
					parameters: ["sEntitySet", "sFacet"],
					value: function(oParams){return "AfterFacet::" + oParams.sEntitySet  + "::" +  oParams.sFacet + "::SubSection";}
				},
				AfterFacetExtensionSectionWithKey: {
					parameters: ["sEntitySet", "sFacet", "sFacetExtensionKey"]
				},
				AfterFacetExtensionSubSectionWithKey: {
					parameters: ["sEntitySet", "sFacet", "sFacetExtensionKey"]
				},
				AddressLabel: {
					parameters: ["sFacet"]
				},
				AddressValue: {
					parameters: ["sFacet"]
				},
				ReuseComponentSection: {
					parameters: ["sReuseComponentId"],
					optionalParameters: ["sReuseComponentName", "sReuseComponentUsage"],
					value: function(oParams){ return (oParams.sReuseComponentName || oParams.sReuseComponentUsage) + "::" + oParams.sReuseComponentId + "::ComponentSection"; }
				},
				ReuseComponentSubSection: {
					parameters: ["sReuseComponentId"],
					optionalParameters: ["sReuseComponentName", "sReuseComponentUsage"],
					value: function(oParams){ return (oParams.sReuseComponentName || oParams.sReuseComponentUsage) + "::" + oParams.sReuseComponentId + "::ComponentSubSection"; }
				},
				ReuseComponentContainer: {
					parameters: ["sReuseComponentId"],
					optionalParameters: ["sReuseComponentName", "sReuseComponentUsage"],
					value: function(oParams){ return (oParams.sReuseComponentName || oParams.sReuseComponentUsage) + "::" + oParams.sReuseComponentId + "::ComponentContainer"; }
				}
			},
			ObjectPageTable: {
				SmartTable: {
					parameters: ["sFacet"],
					value: function(oParams){return oParams.sFacet + "::Table";}
				},
				ColumnListItem: {
					parameters: ["sFacet"],
					value: function(oParams){return "template:::ObjectPageTable:::ColumnListItem:::sFacet::" + oParams.sFacet;}
				},
				SegmentedButton: {
					parameters: ["sFacet"]
				},
				VariantSelection: {
					parameters: ["sFacet"]
				},
				SegmentedButtonItem: {
					parameters: ["sFacet", "sQuickVariantKey"]
				},
				VariantSelectionItem: {
					parameters: ["sFacet", "sQuickVariantKey"]
				}
			},
			TableColumn: {
				DataField: {
					parameters: ["sSmartTableId", "sProperty"],
					value: function(oParams){return oParams.sSmartTableId + "-" + oParams.sProperty.replace("/", "_");}
				},
				DataFieldWithNavigationPath: {
					parameters: ["sSmartTableId", "sProperty", "sTarget"]
				},
				DataFieldWithIntentBasedNavigation: {
					parameters: ["sSmartTableId", "sProperty", "sSemanticObject", "sAction"]
				},
				DataFieldForAnnotation: {
					parameters: ["sSmartTableId", "sTarget"]
				},
				DataFieldForAction: {
					parameters: ["sSmartTableId", "sAction"]
				},
				DataFieldForIntentBasedNavigation: {
					parameters: ["sSmartTableId", "sSemanticObject", "sAction"]
				}
			},
			QuickView: {
				Avatar: {}
			},
			VisualFilterBar: {
				FilterItemMicroChart: {
					parameters: ["sProperty"]
				},
				ValueHelpButton: {
					parameters: ["sProperty"]
				},
				FilterItemContainer: {
					parameters: ["sProperty"]
				}
			},
			VisualFilterDialog: {
				FilterItemMicroChart: {
					parameters: ["sProperty"]
				},
				ValueHelpButton: {
					parameters: ["sProperty"]
				},
				FilterItemContainer: {
					parameters: ["sProperty"]
				}
			}
		}
	};
});
