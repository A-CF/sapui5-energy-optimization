/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
jQuery.sap.declare('ui.s2p.mm.stock.overview.opt3.view.CustomPanel');
sap.m.P13nPanel.extend('ui.s2p.mm.stock.overview.opt3.view.CustomPanel', {
  constructor: function (i, s) {
    sap.m.P13nPanel.apply(this, arguments);
  },
  metadata: {
    library: 'sap.m',
    aggregations: {
      content: {
        type: 'sap.m.Table',
        multiple: false,
        singularName: 'content',
      },
    },
  },
  renderer: function (r, c) {
    if (!c.getVisible()) {
      return;
    }
    r.renderControl(c.getContent());
  },
});
