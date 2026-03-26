/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(['sap/ui/model/json/JSONModel', 'sap/ui/Device'], function (J, D) {
  'use strict';
  return {
    createDeviceModel: function () {
      var m = new J(D);
      m.setDefaultBindingMode('OneWay');
      return m;
    },
    createFLPModel: function () {
      var g = jQuery.sap.getObject('sap.ushell.Container.getUser'),
        i = g ? g().isJamActive() : false,
        m = new J({ isShareInJamActive: i });
      m.setDefaultBindingMode('OneWay');
      return m;
    },
  };
});
