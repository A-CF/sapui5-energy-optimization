/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.loader.config({
  paths: {
    "external/Plotly": "https://cdn.plot.ly/plotly-3.0.1.min",
    "external/Chartjs": "https://cdn.jsdelivr.net/npm/chart"
  },
  shim: {
    "external/Chartjs": {
      amd: true,
      exports: "Chart"
    }
  }
});

sap.ui.define(
  [
    'sap/ui/core/UIComponent',
    'sap/ui/Device',
    'ui/s2p/mm/stock/overview/opt2/model/models',
    'ui/s2p/mm/stock/overview/opt2/controller/ErrorHandler',
  ],
  function (U, D, m, E) {
    'use strict';
    return U.extend('ui.s2p.mm.stock.overview.opt2.Component', {
      metadata: { manifest: 'json' },
      init: function () {
        U.prototype.init.apply(this, arguments);
        this._oErrorHandler = new E(this);
        this.setModel(m.createDeviceModel(), 'device');
        this.setModel(m.createFLPModel(), 'FLP');
        this.getRouter().initialize();
      },
      destroy: function () {
        this._oErrorHandler.destroy();
        U.prototype.destroy.apply(this, arguments);
      },
      getContentDensityClass: function () {
        if (this._sContentDensityClass === undefined) {
          if (jQuery(document.body).hasClass('sapUiSizeCozy') || jQuery(document.body).hasClass('sapUiSizeCompact')) {
            this._sContentDensityClass = '';
          } else if (!D.support.touch) {
            this._sContentDensityClass = 'sapUiSizeCompact';
          } else {
            this._sContentDensityClass = 'sapUiSizeCozy';
          }
        }
        return this._sContentDensityClass;
      },
    });
  }
);
