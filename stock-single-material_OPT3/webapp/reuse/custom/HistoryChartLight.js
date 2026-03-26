/** 
 * Custom control replacing the history chart dialog
 * Author: Alexander Waldner
*/

sap.ui.define([
    "sap/ui/core/Control",
    "sap/suite/ui/commons/ChartContainer",
    "sap/suite/ui/commons/ChartContainerContent",
    "sap/m/OverflowToolbar",
    "sap/m/Button",
    "sap/m/ToolbarSpacer",
    "sap/suite/ui/commons/ChartContainerToolbarPlaceholder",
    "sap/m/Text",
    "sap/m/VBox"

], function (Control, ChartContainer, ChartContainerContent, OverflowToolbar, Button, ToolbarSpacer, ChartContainerToolbarPlaceholder, Text, VBox) {
    "use strict";
    return Control.extend("ui.s2p.mm.stock.overview.opt3.reuse.custom.HistoryChartLight", {
        metadata: {
            properties: {
                visible: { type: "boolean", defaultValue: false },
                caller: { type: "object" }
            },
            events: {
                ready: {}
            }
        },
        /** 
         * Opens the dialog
        */
        open: function () {
            this.setVisible(true);
        },
        /** 
         * Closes the dialog
        */
        close: function () {
            this.setVisible(false);
        },
        /** 
         * Function executed after the control is rendered, fires the
         * ready event that renders the chart
        */
        onAfterRendering: function () {
            this.fireReady();
        },
        /** 
         * Initialization function, sets the i18n module
        */
        init: function () {
            this._i18n = new sap.ui.model.resource.ResourceModel({
                bundleUrl: jQuery.sap.getModulePath('ui.s2p.mm.stock.overview.opt3') + '/i18n/i18n.properties',
            });
        },
        /** 
         * Function executed before the control is rendered,
         * calls initContent() to initialize the content
        */
        onBeforeRendering: function () {
            if (!this.contentInitialized) {
                this.initContent();
                this.contentInitialized = true;
            }
        },
        /** 
         * Initializes the content and sets the control up
        */
        initContent: function () {
           this.plotlyChartContainer= new VBox({
                id: "historyChartPlotly",
                width: "100%",
                height: "100%"
            })
            this.chartContainer = new ChartContainer({
                id: "newChartContainer",
                content: new ChartContainerContent({
                    icon: "sap-icon://vertical-bar-chart",
                    content: this.plotlyChartContainer
                }),
                personalizationPress: () => this.getCaller().onChartPersonalizationPress(),
                contentChange: () => this.getCaller().attachContentChange(),
                showFullScreen: true,
                showPersonalization: true,
                autoAdjustHeight: true,
                showLegend: true,
                toolbar: new OverflowToolbar({
                    content: [
                        new Text({ id: "newDrillDownText", text: this._i18n.getResourceBundle().getText("TOOLTIP_DRILLDOWN_BTN"), visible: false }),
                        new ToolbarSpacer({ id: "toolbarSpacer1" }),
                        new Button({ id: "newDrillDown", icon: "sap-icon://drill-down", type: "Transparent", press: () => this.getCaller().onDrillDown() }),
                        new Button({ id: "newDrillUp", icon: "sap-icon://drill-up", type: "Transparent", press: () => this.getCaller().onDrillUp() }),
                        new Button({ id: "newCopilot", icon: "sap-icon://co", type: "Transparent", press: () => this.getCaller().onCopilot() }),
                        new ChartContainerToolbarPlaceholder({ id: "toolbarPlaceholder1" })
                    ]
                })
            })

            var closeButton = new Button({
                text: this._i18n.getResourceBundle().getText("BUTTON_CLOSE"),
                press: () => this.close()
            })

            var persChartHost = new VBox({ id: "persChartHost" })
            this.content = new VBox({
                items: [this.chartContainer, closeButton, persChartHost]
            })
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
            oRM.addStyle("width", "1000px");
            oRM.addStyle("height", "500px");
            oRM.addStyle("z-index", "10");
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
            oRM.addStyle("z-index", "5");
            oRM.writeStyles();
            oRM.write("></div>");
        }
    })
})
