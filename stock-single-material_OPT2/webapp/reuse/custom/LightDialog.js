/** 
 * Custom control replacing the value help dialog
 * Author: Alexander Waldner
*/

sap.ui.define([
    "sap/ui/core/Control",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/ui/comp/filterbar/FilterBar",
    "sap/ui/comp/filterbar/FilterGroupItem",
    "sap/m/MultiInput",
    "sap/m/SearchField",
    "sap/ui/table/Table",
    "sap/ui/table/Column",
    "sap/m/Label",
    "sap/ui/comp/providers/TokenParser"
], function (Control, Button, Text, VBox, FilterBar, FilterGroupItem, MultiInput, Input, Table, Column, Label, TokenParser) {
    "use strict";
    return Control.extend("ui.s2p.mm.stock.overview.opt2.reuse.custom.LightDialog", {
        metadata: {
            properties: {
                visible: { type: "boolean", defaultValue: false }
            }
        },
        /** 
         * Opening function, sets the dialog visibility state
         * @param param Material input
         * @param func Callback function to execute after dialog is closed
        */
        open: function (param, func) {
            this.closeCallback = func;
            this.setVisible(true);
            if (param && param.Material) {
                this.materialSearchValue = param.Material;
            }
        },
        /** 
         * Function executed after the control is rendered,
         * inserts the material search value, if present
        */
        onAfterRendering: function () {
            if (this.materialSearchValue) {
                this.materialInput.setValue(this.materialSearchValue);
                this.materialInput.rerender()
                this.searchMaterial();
            }
        },
        /** 
         * Closing function, executes the callback function and destroys the control
        */
        close: function () {
            if (typeof this.closeCallback === "function") {
                this.closeCallback();
            }
            this.setVisible(false);
            this.destroy();
        },
        /** 
         * Initialization function, sets the OModel, i18n module, and prepares the content
        */
        init: function () {
            this.oModel = new sap.ui.model.odata.ODataModel('/sap/opu/odata/sap/MMIM_MATERIAL_DATA_SRV', true);
            this._i18n = new sap.ui.model.resource.ResourceModel({
                bundleUrl: jQuery.sap.getModulePath('ui.s2p.mm.stock.overview.opt2.reuse.materialmaster') + '/i18n/i18n.properties',
            });

            var mat = new MultiInput(this.createMultiInputConfig("Material"))
            var tokenParser = new TokenParser();
            tokenParser.addKeyField({
                key: mat.getName(),
                label: mat.getName(),
                type: 'string',
                displayFormat: mat.getName().indexOf('Name') !== -1 ? '' : 'UpperCase',
            });
            tokenParser.setDefaultOperation('EQ');
            tokenParser.associateInput(mat);

            var matnam = new MultiInput(this.createMultiInputConfig("MaterialName"))
            tokenParser.addKeyField({
                key: matnam.getName(),
                label: matnam.getName(),
                type: 'string',
                displayFormat: matnam.getName().indexOf('Name') !== -1 ? '' : 'UpperCase',
            });
            tokenParser.setDefaultOperation('EQ');
            tokenParser.associateInput(matnam);

            var plant = new MultiInput(this.createMultiInputConfig("Plant"))
            tokenParser.addKeyField({
                key: plant.getName(),
                label: plant.getName(),
                type: 'string',
                displayFormat: plant.getName().indexOf('Name') !== -1 ? '' : 'UpperCase',
            });
            tokenParser.setDefaultOperation('EQ');
            tokenParser.associateInput(plant);

            var plantname = new MultiInput(this.createMultiInputConfig("PlantName"));
            tokenParser.addKeyField({
                key: plantname.getName(),
                label: plantname.getName(),
                type: 'string',
                displayFormat: plantname.getName().indexOf('Name') !== -1 ? '' : 'UpperCase',
            });
            tokenParser.setDefaultOperation('EQ');
            tokenParser.associateInput(plantname);

            this.materialInput = new Input({
                width: "75%",
                search: (e) => this.onMaterialSearch(e)
            })

            var filterBar = new FilterBar({
                filterBarExpanded: true,
                showClearButton: true,
                showRestoreButton: true,
                advancedMode: true,
                search: this.searchMaterial.bind(this),
                filterItems: [
                    new FilterGroupItem({
                        groupName: "gn1",
                        name: "Material",
                        label: this._i18n.getResourceBundle().getText("LABEL_MATERIAL_COL"),
                        control: mat
                    }),
                    new FilterGroupItem({
                        groupName: "gn1",
                        name: "MaterialName",
                        label: this._i18n.getResourceBundle().getText("LABEL_MATERIALNAME_COL1"),
                        control: matnam
                    }),
                    new FilterGroupItem({
                        groupName: "gn1",
                        name: "Plant",
                        label: this._i18n.getResourceBundle().getText("LABEL_PLANT_COL"),
                        control: plant
                    }),
                    new FilterGroupItem({
                        groupName: "gn1",
                        name: "PlantName",
                        label: this._i18n.getResourceBundle().getText("LABEL_PLANT_NAME_COL"),
                        control: plantname
                    })
                ]
            });

            var materialHeaders = [
                { label: this._i18n.getProperty('LABEL_MATERIAL_COL'), template: 'Material' },
                { label: this._i18n.getProperty('LABEL_MATERIALNAME_COL1'), template: 'MaterialName' },
                { label: this._i18n.getProperty('LABEL_BATCH_COL'), template: 'Batch' },
                { label: this._i18n.getProperty('LABEL_PLANT_COL'), template: 'Plant' },
                { label: this._i18n.getProperty('LABEL_PLANT_NAME_COL'), template: 'PlantName' },
                { label: this._i18n.getProperty('LABEL_MATERIALTYPE_COL'), template: 'MaterialType' },
                { label: this._i18n.getProperty('LABEL_MATERIALTYPENAME_COL1'), template: 'MaterialTypeName' },
                { label: this._i18n.getProperty('LABEL_PRODUCTHIERARCHY_COL'), template: 'ProductHierarchy' },
            ]

            this.resultTable = new Table({
                id: "materialSelectTable",
                selectionBehavior: sap.ui.table.SelectionBehavior.Row,
                selectionMode: sap.ui.table.SelectionMode.Single,
            });
            this.resultTable.setModel(this.oModel);
            materialHeaders.forEach((header) => {
                this.resultTable.addColumn(new Column({
                    label: new Label({ text: header.label }),
                    template: new Text({ text: `{${header.template}}` })
                }))
            })
            this.resultTable.setVisibleRowCount(8);

            this.resultTable.attachRowSelectionChange(function (oEvent) {
                var rowIndex = oEvent.getParameter("rowIndex");
                var oContext = this.resultTable.getContextByIndex(rowIndex);
                var selectedData = oContext?.getObject();

                var res = {};
                if (typeof this.closeCallback === "function" && selectedData.Material) {
                    res.selected = true;
                    res.Material = selectedData.Material;
                    res.MaterialName = selectedData.MaterialName;
                    res.Batch = selectedData.Batch;
                    res.Plant = selectedData.Plant;
                    res.PlantName = selectedData.PlantName;
                    this.closeCallback(res);
                } else {
                    res.selected = false;
                    this.closeCallback(res);
                }
                this.setVisible(false);
            }.bind(this));

            var closeButton = new Button({
                text: "Close",
                press: () => this.setVisible(false)
            });

            this.dialogContent = new VBox({
                items: [this.materialInput, filterBar, this.resultTable, closeButton]
            });

            this.filters = [];
        },
        /** 
         * Search handler function, executes searchMaterial()
         * @param e Event, reference to the search field
        */
        onMaterialSearch: function (e) {
            this.materialSearchValue = e.getParameter("query");
            this.searchMaterial();
        },
        /** 
         * Main function for material search, rebinds the table to the
         * dataset
        */
        searchMaterial: function () {
            this.resultTable.bindRows({
                path: "/I_InvtryMgmtMatlMstrVH",
                parameters: {
                    custom: {
                        "sap-client": "300",
                        "search": this.materialSearchValue || "",
                        "search-focus": "Material"
                    }
                },
                filters: this.filters,
                events: {
                    dataReceived: function () {
                        this.resultTable.rerender()
                    }.bind(this)
                }
            });
        },
        /** 
         * Rendering function
         * @param oRM Reference to the RenderManager
         * @param oControl Reference to the control itself
        */
        renderer: function (oRM, oControl) {
            if (!oControl.getVisible()) return;
            oRM.write("<div");
            oRM.writeControlData(oControl);
            oRM.addStyle("position", "fixed");
            oRM.addStyle("top", "50%");
            oRM.addStyle("left", "50%");
            oRM.addStyle("margin", "auto");
            oRM.addStyle("transform", "translate(-50%, -50%)");
            oRM.addStyle("min-width", "75%");
            oRM.addStyle("min-height", "500px");
            oRM.addStyle("background", "#fff");
            oRM.addStyle("z-index", "20");
            oRM.addStyle("display", "flex");
            oRM.addStyle("justify-content", "center");
            oRM.addStyle("align-items", "center");
            oRM.addStyle("border-radius", "8px");
            oRM.writeStyles();
            oRM.write(">");

            oRM.write("<div style='padding:24px;'>");
            oRM.renderControl(oControl.dialogContent);
            oRM.write("</div></div>");
            oRM.write("<div");
            oRM.writeClasses();
            oRM.addStyle("position", "fixed");
            oRM.addStyle("top", "0");
            oRM.addStyle("left", "0");
            oRM.addStyle("width", "100vw");
            oRM.addStyle("height", "100vh");
            oRM.addStyle("background-color", "rgba(131, 118, 118, 0.4)");
            oRM.addStyle("z-index", "10");
            oRM.writeStyles();
            oRM.write("></div>");
        },
        /** 
         * Creates a config for the multi input fields with token handler
         * @param fieldKey Key of the entity
         * @returns MultiInputConfig
        */
        createMultiInputConfig: function (fieldKey) {
            return {
                width: "100%",
                showValueHelp: false,
                tokenUpdate: function (oEvent) {
                    var tokens = oEvent.getSource().getTokens();
                    var v;
                    for (var i = 0; i < tokens.length; i++) {
                        if (oEvent.getParameter("type") == "removed") {
                            var token = tokens[i].data().range;
                            this.filters = this.filters.filter((filter) => {
                                return filter.oValue1 !== token.value1;
                            });
                            oEvent.getSource().removeToken(tokens[i]);
                        } else {
                            oEvent.getSource().addToken(tokens[i]);
                            var range = tokens[i].data().range;
                            if (range.exclude) {
                                if (range.operation === 'Empty') {
                                    this.filters.push(new sap.ui.model.Filter(fieldKey, sap.ui.model.FilterOperator.NE, ''));
                                } else {
                                    this.filters.push(new sap.ui.model.Filter(fieldKey, sap.ui.model.FilterOperator.NE, range.value1));
                                }
                            } else {
                                if (range.operation === 'Empty') {
                                    this.filters.push(new sap.ui.model.Filter(fieldKey, sap.ui.model.FilterOperator.EQ, ''));
                                } else {
                                    if (range.operation !== sap.ui.model.FilterOperator.BT) {
                                        v = undefined;
                                    } else {
                                        v = range.value2;
                                    }
                                    this.filters.push(new sap.ui.model.Filter(fieldKey, range.operation, range.value1, v));
                                }
                            }
                        }
                    }
                    oEvent.getSource().rerender();
                }.bind(this)
            };
        }
    });
});
