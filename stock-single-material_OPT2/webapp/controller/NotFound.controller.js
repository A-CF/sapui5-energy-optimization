/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(['ui/s2p/mm/stock/overview/opt2/controller/BaseController'], function (B) {
  'use strict';
  return B.extend('ui.s2p.mm.stock.overview.opt2.controller.NotFound', {
    onLinkPressed: function () {
      this.getRouter().navTo('S1');
    },
  });
});
