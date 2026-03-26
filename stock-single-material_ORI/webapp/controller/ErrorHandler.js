/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(['sap/ui/base/Object', 'sap/m/MessageBox'], function (U, M) {
  'use strict';
  return U.extend('ui.s2p.mm.stock.overview.ori.controller.ErrorHandler', {
    constructor: function (c) {
      this._oResourceBundle = c.getModel('i18n').getResourceBundle();
      this._oComponent = c;
      this._oModel = c.getModel('oMaterialData');
      this._bMessageOpen = false;
      this._sErrorText = this._oResourceBundle.getText('errorText');
      this._oModel.attachMetadataFailed(function (e) {
        var p = e.getParameters();
        this._showMetadataError(p.response);
      }, this);
      this._oModel.attachRequestFailed(function (e) {
        var p = e.getParameters();
        if (
          p.response.statusCode !== '404' ||
          (p.response.statusCode === 404 && p.response.responseText.indexOf('Cannot POST') === 0)
        ) {
          this._showServiceError(p.response);
        }
      }, this);
    },
    _showMetadataError: function (d) {
      M.error(this._sErrorText, {
        id: 'metadataErrorMessageBox',
        details: d,
        styleClass: this._oComponent.getContentDensityClass(),
        actions: [M.Action.RETRY, M.Action.CLOSE],
        onClose: function (a) {
          if (a === M.Action.RETRY) {
            this._oModel.refreshMetadata();
          }
        }.bind(this),
      });
    },
    _showServiceError: function (d) {
      if (this._bMessageOpen) {
        return;
      }
      this._bMessageOpen = true;
      M.error(this._sErrorText, {
        id: 'serviceErrorMessageBox',
        details: d,
        styleClass: this._oComponent.getContentDensityClass(),
        actions: [M.Action.CLOSE],
        onClose: function () {
          this._bMessageOpen = false;
        }.bind(this),
      });
    },
  });
});
