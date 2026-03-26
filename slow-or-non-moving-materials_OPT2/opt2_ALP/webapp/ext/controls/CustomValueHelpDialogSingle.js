/** 
 * Custom Value Help Dialog (Optimization 1 -> encounter layout reflows)
 * Author: Alexander Waldner
*/

sap.ui.define([
    'sap/ui/core/Control'
], function (Control) {
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
                case sap.ui.model.FilterOperator.NotContains: return "NOT(*" + v1 * "*)";
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
    return Control.extend("ui.s2p.mm.slonomo.mat.opt2.ext.controls.CustomValueHelpDialogSingle", {
        metadata: {
            properties: {
                visible: { type: "boolean", defaultValue: false }
            }
        },

        /**
         * Initializes the control and its contents
        */
        init: function () {
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
            })
            this.freeFilterInput1 = new sap.m.Input({
                placeholder: "Value"
            });
            this.freeFilterInput2 = new sap.m.Input({
                placeholder: "Value",
                enabled: (this.filterOperatorSelect.getSelectedKey() != sap.ui.model.FilterOperator.BT && this.filterOperatorSelect.getSelectedKey() != sap.ui.model.FilterOperator.NB)
            })
            var addFilterButton = new sap.m.Button({
                text: "Add",
                type:"Emphasized",
                press: function () {
                    var input1 = this.freeFilterInput1.getValue();
                    var input2 = this.freeFilterInput2.getValue();
                    if (input1 == "") {
                        return;
                    }

                    var selectedFilter = this.filterOperatorSelect.getSelectedKey();
                    var filter = new sap.m.Input({
                        value: `${selectedFilter}`,
                        enabled: false
                    });
                    var text = new sap.m.Input({
                        value: `${input1}`,
                        enabled: false
                    });

                    var token = makeTokenFromFilter(this.key, selectedFilter, input1, input2);
                    this.tempTokenInput.addToken(token);
                    this.tempTokenInput.rerender();

                    var removeFilterButton = new sap.m.Button({
                        icon: 'sap-icon://decline',
                        press: function (oEvent) {
                            this.setFilters.removeItem(filterContainer);
                            this.setFilters.rerender();

                            var token = oEvent.getSource().getCustomData()[0].getValue();
                            this.tempTokenInput.removeToken(token);
                            this.tempTokenInput.rerender();
                        }.bind(this)
                    });
                    removeFilterButton.addCustomData(new sap.ui.core.CustomData({
                        value: token
                    }));
                    var filterContainer = new sap.m.HBox({
                        items: [filter, text, removeFilterButton]
                    });
                    this.setFilters.addItem(filterContainer);
                    this.setFilters.rerender();
                    this.freeFilterInput1.setValue("");
                    this.freeFilterInput2.setValue("");
                }.bind(this)
            })
            var resetInputButton = new sap.m.Button({
                icon: "sap-icon://decline",
                press: function () {
                    this.freeFilterInput1.setValue("");
                    this.freeFilterInput2.setValue("");
                }.bind(this)
            })

            var conditionsInputContainer = new sap.m.HBox({
                items: [this.filterOperatorSelect, this.freeFilterInput1, this.freeFilterInput2, addFilterButton, resetInputButton]
            });

            var okButton = new sap.m.Button({
                text: 'OK',
                type: 'Emphasized',
                press: function() {
                    this.srcMultiInput.setTokens(this.tempTokenInput.getTokens());
                    this.srcMultiInput.rerender();
                    this.setVisible(false);
                }.bind(this)
            });

            var cancelButton = new sap.m.Button({
                text: 'Cancel',
                press: () => {
                    this.setVisible(false);
                }
            });
            this.toolbar = new sap.m.HBox({
                items: [okButton, cancelButton]
            });
            this.setFilters = new sap.m.VBox();
            this.tempTokenInput = new sap.m.MultiInput({
                showValueHelp: false,
                enabled: false
            });
            this.content = new sap.m.VBox({
                items: [this.setFilters, conditionsInputContainer, this.tempTokenInput]
            });
        },
        /**
         * Opening function
        */
        open: function (sourceMultiInput, key) {
            this.key = key;
            this.srcMultiInput = sourceMultiInput;
            this.setVisible(true);
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
            oRM.addStyle("min-width", "60%");
            oRM.addStyle("min-height", "400px");
            oRM.addStyle("max-height", "750px");
            oRM.addStyle("background", "#f7f7f7");
            oRM.addStyle("z-index", "40");
            oRM.addStyle("display", "flex");
            oRM.addStyle("flex-direction", "column");
            oRM.addStyle("border-radius", "8px");
            oRM.addStyle("border", "1px solid #6d6c6cff");
            oRM.writeStyles();
            oRM.write(">");

            oRM.write("<div");
            oRM.addStyle("flex","1");
            oRM.addStyle("padding","1rem");
            oRM.addStyle("overflow","auto");
            oRM.writeStyles();
            oRM.write(">")
            oRM.renderControl(oControl.content);
            oRM.write("</div>");
            oRM.write("<div");
            oRM.addStyle("padding","0.5rem");
            oRM.addStyle("background","#ffffffff");
            oRM.addStyle("border-top","1px solid #6d6c6cff");
            oRM.addStyle("border-radius","0 0 8px 8px");
            oRM.writeStyles();
            oRM.write(">");
            oRM.renderControl(oControl.toolbar);
            oRM.write("</div></div>");
            oRM.write("<div");
            oRM.writeClasses();
            oRM.addStyle("position", "fixed");
            oRM.addStyle("top", "0");
            oRM.addStyle("left", "0");
            oRM.addStyle("width", "100vw");
            oRM.addStyle("height", "100vh");
            oRM.addStyle("background-color", "rgba(131, 118, 118, 0.4)");
            oRM.addStyle("z-index", "30");
            oRM.writeStyles();
            oRM.write("></div>");
        }
    });
});