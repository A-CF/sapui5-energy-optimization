/** 
 * Custom Export Dialog
 * Author: Alexander Waldner
*/

sap.ui.define([
    "sap/ui/core/Control"
], function (Control) {
    return Control.extend("ui.s2p.mm.slonomo.mat.opt2.ext.controls.CustomExportDialog", {
        metadata: {
            properties: {
                title: { type: "string", defaultValue: "Export as..." },
                visible: { type: "boolean", defaultValue: false }
            }
        },
        /**
         * Initializes the control and its contents
        */
        init: function () {
            this.fileNameText = new sap.m.Text({
                text: "File Name:"
            });
            this.filename = new sap.m.Input({
                placeholder: 'File Name',
                value: 'Export'
            });
            this.checkbox1 = new sap.m.CheckBox({
                text: "Zellen mit mehreren Werten aufteilen",
                select: function (oEvent) {
                    oEvent.getSource().rerender()
                }
            });
            this.checkbox2 = new sap.m.CheckBox({
                text: "Mit Filtereinstellung",
                select: function (oEvent) {
                    oEvent.getSource().rerender()
                }
            });

            this.okButton = new sap.m.Button({
                text: "Export",
                type: "Emphasized",
                press: function () {
                    if(!this.filename.getValue() || this.filename.getValue() == ''){
                        return;
                    }
                    this.callbackFn(this.filename.getValue(), this.checkbox2.getSelected(), this.checkbox1.getSelected());
                    this.setVisible(false);
                }.bind(this)
            });
            this.cancelButton = new sap.m.Button({
                text: "Cancel",
                press: () => { this.setVisible(false) }
            });
            this.buttonBox = new sap.m.HBox({
                items: [this.okButton, this.cancelButton]
            });
            this.content = new sap.m.VBox({
                items: [this.fileNameText, this.filename, this.checkbox1, this.checkbox2, this.buttonBox],
            });

        },
        /**
         * Opening function
         * @param callbackFn Callback function to be executed after the dialog is closed
          */
        open: function (callbackFn) {
            if (callbackFn) {
                this.callbackFn = callbackFn;
            }
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
            oRM.addStyle("min-width", "500px");
            oRM.addStyle("min-height", "150px");
            oRM.addStyle("max-height", "750px");
            oRM.addStyle("background", "#f7f7f7");
            oRM.addStyle("z-index", "9999");
            oRM.addStyle("display", "flex");
            oRM.addStyle("justify-content", "center");
            oRM.addStyle("align-items", "center");
            oRM.addStyle("border-radius", "8px");
            oRM.addStyle("border", "1px solid #6d6c6cff");
            oRM.writeStyles();
            oRM.write(">");

            oRM.write("<div");
            oRM.addStyle("flex","1");
            oRM.addStyle("padding","1rem");
            oRM.addStyle("overflow","auto");
            oRM.writeStyles();
            oRM.write(">");
            oRM.renderControl(oControl.content);
            oRM.write("</div>");
            oRM.write("<div")
            oRM.addStyle("padding","0.5rem");
            oRM.addStyle("background","#ffffffff");
            oRM.addStyle("border-top","1px solid #6d6c6cff");
            oRM.addStyle("border-radius","0 0 8px 8px");
            oRM.writeStyles();
            oRM.write(">")
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
            oRM.addStyle("z-index", "9998");
            oRM.writeStyles();
            oRM.write("></div>");
        },
    })
})