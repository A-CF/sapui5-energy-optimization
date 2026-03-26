/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(['sap/ui/core/mvc/Controller'], function (C) {
  'use strict';
  return C.extend('ui.s2p.mm.stock.overview.opt3.controller.BaseController', {
    getRouter: function () {
      return sap.ui.core.UIComponent.getRouterFor(this);
    },
    getModel: function (n) {
      return this.getView().getModel(n);
    },
    setModel: function (m, n) {
      return this.getView().setModel(m, n);
    },
    getResourceBundle: function () {
      return this.getOwnerComponent().getModel('i18n').getResourceBundle();
    },
    onShareEmailPress: function () {
      var v = this.getModel('oFrontend');
      var s = this.getResourceBundle().getText('EMAIL_SUBJECT', [v.getProperty('/MaterialName')]);
      var S = this._oNavigationService.storeInnerAppState(this._getInnerAppState());
      S.done(function (a) {
        sap.m.URLHelper.triggerEmail(null, s, document.URL);
      });
    },
  });
});
