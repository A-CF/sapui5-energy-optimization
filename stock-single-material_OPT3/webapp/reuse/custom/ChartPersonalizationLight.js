/** 
 * Custom control replacing the history chart dialog
 * Author: Alexander Waldner
*/
sap.ui.define([
    "sap/ui/core/Control",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/ui/table/Table",
    "sap/ui/table/Column",
    "sap/m/Label",
    "sap/m/IconTabBar",
    "sap/m/IconTabFilter",
    "sap/m/CheckBox",
    "sap/m/ColumnListItem",
    "sap/m/ObjectIdentifier"
], function (Control, Button, Text, VBox, HBox, Table, Column, Label, IconTabBar, IconTabFilter, CheckBox, ColumnListItem, ObjectIdentifier) {
    "use strict";
    return Control.extend("ui.s2p.mm.stock.overview.opt3.reuse.custom.ChartPersonalization", {
        metadata: {
            properties: {
                visible: { type: "boolean", defaultValue: false },
            }
        },
        /** 
         * Opens the dialog and rebinds the table to the entity set
         * @param func Callback function to be executed after the dialog closed
        */
        open: function (func) {
            this.closeCallback = func;
            this.setVisible(true);
            this.rebindTable();
        },
        /** 
         * Closes the dialog, returns the table instance as reference
        */
        close: function () {
            if (typeof this.closeCallback == 'function') {
                this.closeCallback({
                    getSource: () => this.table
                })
            }
            this.destroy();
        },
        /** 
         * Initialization function, sets the i18n module, and prepares the content
        */
        init: function () {
            this._i18n = new sap.ui.model.resource.ResourceModel({
                bundleUrl: jQuery.sap.getModulePath('ui.s2p.mm.stock.overview.opt3') + '/i18n/i18n.properties',
            });

            this.table = new Table({
                selectionMode: sap.ui.table.SelectionMode.None,
                columns: [
                    new Column({
                        label: new Label({ text: this._i18n.getResourceBundle().getText("TITLE_COLUMN") }),
                        template: new Text({ text: `{text}` })
                    }),
                    new Column({
                        label: new Label({ text: this._i18n.getResourceBundle().getText("VISIBLE_IN_HISTORY_COLUMN") }),
                        template: new CheckBox({
                            selected: "{HistoryChartVisible}",
                            enabled: "{enabled}",
                            select: (e) => this.onPersonalizationChartSelect(e)
                        })
                    })
                ]
            })

            var tabBar = new IconTabBar({
                items: [
                    new IconTabFilter({
                        text: this._i18n.getResourceBundle().getText("TAB_TITLE_STOCKTYP"),
                        key: "tab1",
                        content: [this.table]
                    }),
                    new IconTabFilter({
                        text: this._i18n.getResourceBundle().getText("TAB_TITLE_SAFETY_STOCK"),
                        key: "tab2",
                        content: [
                            new VBox({
                                items: [
                                    new CheckBox({ text: this._i18n.getResourceBundle().getText("CHECKBOX_PERSON_SHOW_SAFETY_STOCK"), selected: "{showSafetyStockQuantity}" }),
                                    new CheckBox({ text: this._i18n.getResourceBundle().getText("CHECKBOX_PERSON_SHOW_MINIMUM_SAFETY_STOCK"), selected: "{showMinimumSafetyStockQuantity}" })
                                ]
                            })
                        ]
                    })
                ]
            });

            var closeButton = new Button({
                text: this._i18n.getResourceBundle().getText("BUTTON_CLOSE"),
                press: () => this.setVisible(false)
            })

            this.okButton = new Button({
                text: "OK",
                press: () => {
                    this.close()
                },
                type: "Emphasized"
            })

            var hbox = new HBox({
                items: [closeButton, this.okButton]
            })

            this.content = new VBox({
                items: [tabBar, hbox]
            })
        },
        /**
         * Function executed when a checkbox is toggled, rerenders the checkbox
         * and sets the visibility for the selected/deselected stock type
         * @param oEvent Event referencing the respective checkbox 
          */
        onPersonalizationChartSelect: function (oEvent) {
            oEvent.getSource().rerender();
            var m = this.getModel();
            var columnCollection = m.getProperty('/ColumnCollection');
            this.okButton.setEnabled(this._isChartlineVisible(columnCollection));
        },
        /**
         * Detects if a chart line is visible
         * -> Retrieved from the S1 controller
         * @param columnCollection column collection with available stock types
          */
        _isChartlineVisible: function (columnCollection) {
            var i = false;
            for (var j = 0; j < columnCollection.length; j++) {
                if (
                    columnCollection[j].HistoryChartVisible === true &&
                    columnCollection[j].path !== 'StockHistoryVisible' &&
                    columnCollection[j].path !== 'NonVltdGRBlockedStockQtyVisible'
                ) {
                    i = true;
                }
            }
            return i;
        },
        /**
         * Rebinds the table to the entity set based on the available histories
          */
        rebindTable: function () {
            this.table.setModel(this.getModel());
            this.table.bindAggregation("rows", {
                path: "/ColumnCollection",
                template: new ColumnListItem({
                    visible: "{HistoryAvailable}",
                    cells: [
                        new ObjectIdentifier({ title: "{text}" }),
                        new CheckBox({ selected: "{HistoryChartVisible}" })
                    ]
                })
            });
        },
        /** 
         * Rendering function
         * @param oRM Reference to the RenderManager
         * @param oControl Reference to the control itself
        */
        renderer: function (oRM, oControl) {
            oRM.write("<div");
            oRM.writeControlData(oControl);
            oRM.addStyle("position", "fixed");
            oRM.addStyle("top", "50%");
            oRM.addStyle("left", "50%");
            oRM.addStyle("transform", "translate(-50%, -50%)");
            oRM.addStyle("min-width", "800px");
            oRM.addStyle("min-height", "500px");
            oRM.addStyle("z-index", "30");
            oRM.addStyle("display", "flex");
            oRM.addStyle("justify-content", "center");
            oRM.addStyle("align-items", "center");
            oRM.writeStyles();
            oRM.write(">");

            oRM.write("<div style='background:white;padding:24px;border-radius:8px;min-width:800px;'>");
            oRM.renderControl(oControl.content);
            oRM.write("</div></div>");
            oRM.write("<div");
            oRM.writeClasses();
            oRM.addStyle("position", "fixed");
            oRM.addStyle("top", "0");
            oRM.addStyle("left", "0");
            oRM.addStyle("width", "100vw");
            oRM.addStyle("height", "100vh");
            oRM.addStyle("background-color", "rgba(131, 118, 118, 0.4)");
            oRM.addStyle("z-index", "20");
            oRM.writeStyles();
            oRM.write("></div>");
        }
    });
});
