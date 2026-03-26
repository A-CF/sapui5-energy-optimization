/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(
  ['ui/s2p/mm/stock/overview/opt1/controller/BaseController', 'sap/ui/model/json/JSONModel'],
  function (B, J) {
    'use strict';
    return B.extend('ui.s2p.mm.stock.overview.opt1.controller.App', {
      onInit: function () {
        var v,
          s,
          o = this.getView().getBusyIndicatorDelay();
        v = new J({ busy: true, delay: 0 });
        this.setModel(v, 'appView');
        s = function () {
          v.setProperty('/busy', false);
          v.setProperty('/delay', o);
        };
        this.getOwnerComponent().getModel('oMaterialData').metadataLoaded().then(s);
        this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
      },
    });
  }
);
