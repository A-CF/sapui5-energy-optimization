/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(['sap/ui/core/util/MockServer'], function (M) {
  'use strict';
  var m,
    _ = 'ui/s2p/mm/stock/overview/opt2/',
    a = _ + 'localService/mockdata1';
  return {
    init: function () {
      var u = jQuery.sap.getUriParameters(),
        j = jQuery.sap.getModulePath(a),
        s = jQuery.sap.getModulePath(_ + 'manifest', '.json'),
        e = 'F_Mmim_Findmatdoc',
        E = u.get('errorType'),
        i = E === 'badRequest' ? 400 : 500,
        o = jQuery.sap.syncGetJSON(s).data,
        b = o['sap.app'].dataSources.MMIM_MATERIAL_DATA_SRV,
        c = '../localService/metadata1.xml';
      b.uri = '/sap/opu/odata/sap/MMIM_MATDOC_OV_SRV/';
      b.settings.localUri = 'localService/metadata1.xml';
      var d = /.*\/$/.test(b.uri) ? b.uri : b.uri + '/';
      j = '../localService/mockdata';
      m = new M({ rootUri: d });
      M.config({
        autoRespond: true,
        autoRespondAfter: u.get('serverDelay') || 1000,
      });
      m.simulate(c, { sMockdataBaseUrl: j, bGenerateMissingMockData: true });
      var r = m.getRequests(),
        R = function (f, g, h) {
          h.response = function (x) {
            x.respond(f, { 'Content-Type': 'text/plain;charset=utf-8' }, g);
          };
        };
      if (u.get('metadataError')) {
        r.forEach(function (f) {
          if (f.path.toString().indexOf('$metadata') > -1) {
            R(500, 'metadata Error', f);
          }
        });
      }
      if (E) {
        r.forEach(function (f) {
          if (f.path.toString().indexOf(e) > -1) {
            R(i, E, f);
          }
        });
      }
      m.start();
      jQuery.sap.log.info('Running the app with mock data');
    },
    getMockServer: function () {
      return m;
    },
  };
});
