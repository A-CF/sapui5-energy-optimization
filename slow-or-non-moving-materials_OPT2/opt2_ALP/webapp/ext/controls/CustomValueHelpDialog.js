/**
 * Custom Value Help Dialog (Optimization 1 -> encounter layout reflows)
 * Author: Alexander Waldner
*/

sap.ui.define([
    'sap/ui/core/Control',
    'ui/s2p/mm/slonomo/mat/opt2/ext/controls/CustomValueHelpDialogSingle'
], function (Control, CustomValueHelpDialogSingle) {
    "use strict";

    /**
     * Function to create custom tokens
     * @param path The entity key the token should be generated for
     * @param op The operator (FilterOperator)
     * @param v1 The value of the token
     * @param v2 If necessary, a second value for the token (for between operator, for example)
     * @returns A sap.m.Token with the specified data
    */
    function makeTokenFromFilter(path, op, v1, v2) {
        var text = (() => {
            switch (op) {
                case sap.ui.model.FilterOperator.EQ: return v1;
                case sap.ui.model.FilterOperator.StartsWith: return v1 + "*";
                case sap.ui.model.FilterOperator.NotStartsWith: return "NOT(" + v1 + "*)";
                case sap.ui.model.FilterOperator.EndsWith: return "*" + v1;
                case sap.ui.model.FilterOperator.NotEndsWith: return "NOT(*" + v1 + ")";
                case sap.ui.model.FilterOperator.Contains: return "*" + v1 + "*";
                case sap.ui.model.FilterOperator.NotContains: return "!(*" + v1 * "*)";
                case sap.ui.model.FilterOperator.BT: return v1 + "..." + v2;
                case sap.ui.model.FilterOperator.NB: return "NOT(" + v1 + "..." + v2 + ")";
                case sap.ui.model.FilterOperator.GT: return ">" + v1;
                case sap.ui.model.FilterOperator.GE: return ">=" + v1;
                case sap.ui.model.FilterOperator.LT: return "<" + v1;
                case sap.ui.model.FilterOperator.LT: return "<=" + v1;
                default: return op + " " + v1
            }
        })();

        var token = new sap.m.Token({ text });
        token.data("path", path);
        token.data("op", op);
        token.data("v1", v1);
        token.data("v2", v2);
        return token;
    }
    return Control.extend("ui.s2p.mm.slonomo.mat.opt2.ext.controls.CustomValueHelpDialog", {
        metadata: {
            properties: {
                visible: { type: "boolean", defaultValue: false }
            }
        },

        /** 
         * Initializes the control and its contents
        */
        init: function () {
            this.searchString = "";
            this.filters = [];
            this.oModel = new sap.ui.model.odata.v2.ODataModel('/sap/opu/odata/sap/MMIM_SLOWORNONMOVINGMATERIAL_SRV');

            this.searchInput = new sap.m.SearchField({
                placeholder: "Search",
                search: function () {
                    this.rebindTable();
                }.bind(this)
            });
            var bindTableButton = new sap.m.Button({
                text: "Go",
                type: "Emphasized",
                press: function () {
                    this.filters.forEach(vb => {
                        var multiInput = vb.getItems()[1];
                        if (multiInput.getValue() && multiInput.getValue() != "") {
                            var token = new sap.m.Token({
                                text: `${multiInput.getValue()}*`
                            });
                            token.data("path", multiInput.getCustomData()[0].getValue());
                            token.data("op", sap.ui.model.FilterOperator.StartsWith);
                            token.data("v1", multiInput.getValue());
                            token.data("v2", "");
                            multiInput.addToken(token);
                            multiInput.setValue("");
                            multiInput.rerender();
                        }
                    });
                    this.rebindTable();
                }.bind(this)
            })
            var inputBox = new sap.m.HBox({
                items: [this.searchInput, bindTableButton]
            })

            this.table = new sap.ui.table.Table();
            this.table.attachRowSelectionChange(this.onRowSelectionChange, this);
            this.table.setVisibleRowCount(8);
            this.table.setModel(this.oModel);

            this.tempTokenInput = new sap.m.MultiInput({
                showValueHelp: false,
                valueHelpOnly: true,
                enabled: false,
                tokenUpdate: function (oEvent) {
                    var removedTokens = oEvent.getParameter("removedTokens");
                    for (var i = 0; i < removedTokens.length; i++) {
                        var token = removedTokens[i];
                        this.tempTokenInput.removeToken(token);
                        var selectedRows = this.table.getSelectedIndices();
                        for (var index of selectedRows) {
                            var row = this.table.getContextByIndex(index);
                            if (row.getProperty(this.key) === token.getKey()) {
                                this.table.removeSelectionInterval(index, index);
                            }
                        }
                    }
                    this.tempTokenInput.rerender();
                }.bind(this)
            });

            var okButton = new sap.m.Button({
                text: "OK",
                type: sap.m.ButtonType.Emphasized,
                press: function () {
                    this.multiInputToPopulate.setTokens(this.tempTokenInput.getTokens());
                    this.setVisible(false);
                }.bind(this)
            });

            var cancelButton = new sap.m.Button({
                text: "Cancel",
                press: function () {
                    this.setVisible(false);
                }.bind(this)
            });

            var multiInputBox = new sap.m.VBox({
                items: [this.tempTokenInput]
            });

            this.filterOperatorSelect = new sap.m.Select({
                items: [
                    new sap.ui.core.Item({
                        text: "contains",
                        key: sap.ui.model.FilterOperator.Contains
                    }),

                    new sap.ui.core.Item({
                        text: "equals",
                        key: sap.ui.model.FilterOperator.EQ
                    }),
                    new sap.ui.core.Item({
                        text: "between",
                        key: sap.ui.model.FilterOperator.BT
                    }),
                    new sap.ui.core.Item({
                        text: "does not contain",
                        key: sap.ui.model.FilterOperator.NotContains
                    }),
                    new sap.ui.core.Item({
                        text: "starts with",
                        key: sap.ui.model.FilterOperator.StartsWith
                    }),
                    new sap.ui.core.Item({
                        text: "ends with",
                        key: sap.ui.model.FilterOperator.EndsWith
                    }),
                    new sap.ui.core.Item({
                        text: "less than",
                        key: sap.ui.model.FilterOperator.LT
                    }),
                    new sap.ui.core.Item({
                        text: "less or equal then",
                        key: sap.ui.model.FilterOperator.LE
                    }),
                    new sap.ui.core.Item({
                        text: "greater then",
                        key: sap.ui.model.FilterOperator.GT
                    }),
                    new sap.ui.core.Item({
                        text: "greater or equal then",
                        key: sap.ui.model.FilterOperator.GE
                    }),
                    new sap.ui.core.Item({
                        text: "not contains",
                        key: sap.ui.model.FilterOperator.NotContains
                    }),
                    new sap.ui.core.Item({
                        text: "not equal",
                        key: sap.ui.model.FilterOperator.NE
                    }),
                    new sap.ui.core.Item({
                        text: "not between",
                        key: sap.ui.model.FilterOperator.NB
                    }),
                    new sap.ui.core.Item({
                        text: "not starts with",
                        key: sap.ui.model.FilterOperator.NotStartsWith
                    }),
                    new sap.ui.core.Item({
                        text: "not ends with",
                        key: sap.ui.model.FilterOperator.NotEndsWith
                    })
                ]
            });
            this.freeFilterInput1 = new sap.m.Input({
                placeholder: "Value"
            });
            this.freeFilterInput2 = new sap.m.Input({
                placeholder: "Value"
            });
            var addFilterButton = new sap.m.Button({
                text: "Add",
                type: "Emphasized",
                press: function () {
                    var input1 = this.freeFilterInput1.getValue();
                    var input2 = this.freeFilterInput2.getValue();

                    var selectedFilter = this.filterOperatorSelect.getSelectedKey();
                    var filter = new sap.m.Input({
                        value: `${selectedFilter}`,
                        enabled: false
                    });
                    var text1 = new sap.m.Input({
                        value: `${input1}`,
                        enabled: false
                    });
                    var text2 = new sap.m.Input({
                        value: `${input2}`,
                        enabled: false
                    });

                    var token = makeTokenFromFilter(this.key, selectedFilter, input1, input2);
                    this.tempTokenInput.addToken(token);
                    this.tempTokenInput.rerender();

                    var removeFilterButton = new sap.m.Button({
                        icon: 'sap-icon://decline',
                        press: function (oEvent) {
                            this.setFilterContainer.removeItem(newFilter);
                            this.setFilterContainer.rerender();

                            var token = oEvent.getSource().getCustomData()[0].getValue();
                            this.tempTokenInput.removeToken(token);
                            this.tempTokenInput.rerender();
                        }.bind(this)
                    });
                    removeFilterButton.addCustomData(new sap.ui.core.CustomData({
                        value: token
                    }));

                    var newFilter = new sap.m.HBox({
                        items: [text1, text2, filter, removeFilterButton]
                    });

                    this.setFilterContainer.addItem(newFilter);
                    this.setFilterContainer.rerender();
                    this.freeFilterInput1.setValue("");
                    this.freeFilterInput2.setValue("");
                }.bind(this)
            });
            var resetInputButton = new sap.m.Button({
                icon: "sap-icon://decline",
                press: function () {
                    this.freeFilterInput1.setValue("");
                }.bind(this)
            });

            this.setFilterContainer = new sap.m.VBox();
            var conditionsInputContainer = new sap.m.HBox({
                items: [this.filterOperatorSelect, this.freeFilterInput1, this.freeFilterInput2, addFilterButton, resetInputButton]
            });

            this.firstTabContent = new sap.m.VBox({
                items: [inputBox]
            });

            this.secondTabContent = new sap.m.VBox({
                items: [this.setFilterContainer, conditionsInputContainer]
            });

            var tabcontainer = new sap.m.IconTabBar({
                layoutData: new sap.m.FlexItemData({
                    growFactor: 1
                }),
                items: [
                    new sap.m.IconTabFilter({
                        text: "Search and Select",
                        content: [this.firstTabContent]
                    }),
                    new sap.m.IconTabFilter({
                        text: "Define Conditions",
                        content: [this.secondTabContent]
                    })
                ]
            });

            this.singleValueHelpContainer = new sap.m.VBox();

            this.content = new sap.m.VBox({
                items: [tabcontainer, multiInputBox, this.singleValueHelpContainer],
            });
            this.toolbar = new sap.m.HBox({
                items: [okButton, cancelButton]
            });
        },

        /** 
         * Handler function to react on table selection changes,
         * creates tokens and adds them to the multi-input
         * @param oEvent The click event when a row is selected
        */
        onRowSelectionChange: function (oEvent) {
            var rowIndices = oEvent.getParameter("rowIndices");
            rowIndices.forEach(rowIndex => {
                var rowSelectedOrNotSelected = oEvent.getSource().isIndexSelected(rowIndex);
                var row = this.table.getContextByIndex(rowIndex);
                if (rowSelectedOrNotSelected) {
                    if (!row) return;
                    var id = row.getProperty(this.key);
                    this.tempTokenInput.addToken(makeTokenFromFilter(this.key, sap.ui.model.FilterOperator.EQ, id, ""));
                } else {
                    var tokenToRemove = this.tempTokenInput.getTokens().find(t => t.data('v1') === row.getProperty(this.key));
                    this.tempTokenInput.removeToken(tokenToRemove);
                }
            });
            this.tempTokenInput.rerender();
        },

        /**
         * Opens the dialog and adjust the content based on the 
         * parameters
         * @param view The view the dialog resides in
         * @param multiInputToPopulate Reference to the MultiInput the value help has been opened for
         * @param key The key of the entity
         * @param entitySet The entity set in the OData service the value helper should display
         * @param fetchEntities The entities from the entitySet that should be displayed in the table
        */
        open: function (view, multiInputToPopulate, key, entitySet, fetchEntities) {
            this.oView = view;
            this.multiInputToPopulate = multiInputToPopulate;
            this.key = key;
            this.entitySet = entitySet;
            this.fetchEntities = fetchEntities;

            this.fetchEntities.forEach(entity => {
                if (entity === "MaterialName" || entity === "PlantName" || entity === "MaterialGroupName" || entity === "MaterialTypeName") return;
                if (entity === "Material") {
                    this.table.addColumn(new sap.ui.table.Column({
                        label: "Material",
                        template: new sap.m.Text({
                            text: "{MaterialName} ({Material})"
                        })
                    }));
                } else if (entity === "Plant") {
                    this.table.addColumn(new sap.ui.table.Column({
                        label: "Plant",
                        template: new sap.m.Text({
                            text: "{PlantName} ({Plant})"
                        })
                    }));
                } else if (entity === "MaterialGroup") {
                    this.table.addColumn(new sap.ui.table.Column({
                        label: "Material Group",
                        template: new sap.m.Text({
                            text: "{MaterialGroupName} ({MaterialGroup})"
                        })
                    }));
                } else if (entity === "MaterialType") {
                    this.table.addColumn(new sap.ui.table.Column({
                        label: "Material Type",
                        template: new sap.m.Text({
                            text: "{MaterialTypeName} ({MaterialType})"
                        })
                    }));
                } else {
                    this.table.addColumn(new sap.ui.table.Column({
                        label: entity,
                        template: new sap.m.Text({
                            text: `{${entity}}`
                        })
                    }));
                }
            });

            this.filters = this.fetchEntities.map((entity) => {
                var input = new sap.m.MultiInput({
                    valueHelpRequest: (oEvent) => this.valueHelpRequestSingle(oEvent),
                    tokenUpdate: (oEvent) => {
                        var removedTokens = oEvent.getParameter('removedTokens');
                        removedTokens.forEach(t => {
                            oEvent.getSource().removeToken(t);
                        });
                        oEvent.getSource().rerender();
                    }
                });
                input.addCustomData(new sap.ui.core.CustomData({
                    value: entity
                }));

                input.addValidator(function (a) {
                    if (a.text) {
                        var token = new sap.m.Token({
                            text: `${a.text}*`
                        });
                        token.data("path", this.getCustomData()[0].getValue());
                        token.data("op", sap.ui.model.FilterOperator.StartsWith);
                        token.data("v1", a.text);
                        token.data("v2", "");
                        return token;
                    }
                }.bind(input));

                return new sap.m.VBox({
                    items: [
                        new sap.m.Text({
                            text: entity
                        }),
                        input
                    ]
                })
            });
            var filterContainer = new sap.ui.layout.Grid({
                width: "100%",
                defaultSpan: "L3 M6 S12",
                hSpacing: 1,
                vSpacing: 1,
                content: [...this.filters]
            })
            this.firstTabContent.addItem(filterContainer);
            this.firstTabContent.addItem(this.table);
            this.setVisible(true);
        },
        /** 
         * Fires after rendering
        */
        onAfterRendering: function () {
            this.rebindTable();
        },
        /** 
         * Rebinds the table to the entitySet, collects all
         * specified tokens, creates filters and adds them
         * to the request 
        */
        rebindTable: function () {
            var filterOperators = [];
            this.filters.forEach((vbox) => {
                var multiInput = vbox.getItems().find(c => c instanceof sap.m.MultiInput);
                if (multiInput) {
                    multiInput.getTokens().forEach(token => {
                        filterOperators.push(new sap.ui.model.Filter({
                            path: token.data("path"),
                            operator: token.data("op"),
                            value1: token.data("v1")
                        }));
                    });
                }
            });

            this.table.bindRows({
                path: this.entitySet,
                parameters: {
                    select: this.fetchEntities.join(","),
                    custom: {
                        "sap-client": "300",
                        "search": this.searchInput.getValue(),
                        "search-focus": this.key
                    }
                },
                sorters: [
                    new sap.ui.model.Sorter("Material", false)
                ],
                filters: filterOperators,
                events: {
                    dataReceived: function () {
                        this.table.rerender()
                    }.bind(this)
                }
            });
        },
        /**
         * Control renderer
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
            oRM.addStyle("min-width", "90%");
            oRM.addStyle("min-height", "500px");
            oRM.addStyle("max-height", "750px");
            oRM.addStyle("background", "#f7f7f7");
            oRM.addStyle("z-index", "20");
            oRM.addStyle("display", "flex");
            oRM.addStyle("flex-direction", "column");
            oRM.addStyle("border-radius", "8px");
            oRM.addStyle("border", "1px solid #6d6c6cff");
            oRM.writeStyles();
            oRM.write(">");
            //Content
            oRM.write("<div");
            oRM.addStyle("flex", "1");
            oRM.addStyle("padding", "1rem");
            oRM.addStyle("overflow", "auto");
            oRM.writeStyles();
            oRM.write(">");
            oRM.renderControl(oControl.content);
            oRM.write("</div>");
            //Footer
            oRM.write("<div");
            oRM.addStyle("padding", "0.5rem");
            oRM.addStyle("display", "flex");
            oRM.addStyle("background", "#ffffffff");
            oRM.addStyle("border-top", "1px solid #6d6c6cff");
            oRM.addStyle("border-radius", "0 0 8px 8px");
            oRM.writeStyles();
            oRM.write(">");
            oRM.renderControl(oControl.toolbar);
            oRM.write("</div></div>");
            oRM.write("<div");
            /* oRM.writeClasses(); */
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
         * Handler to open a custom single value help dialog
         * @param oEvent The click event to open the dialog
        */
        valueHelpRequestSingle: function (oEvent) {
            var input = oEvent.getSource();
            var key = input.getCustomData()[0].getValue();
            var customVHDialogSingle = new CustomValueHelpDialogSingle();
            this.oView.byId('customValueHelpDialogContainer').addItem(customVHDialogSingle);
            customVHDialogSingle.open(input, key);
        }
    });
});