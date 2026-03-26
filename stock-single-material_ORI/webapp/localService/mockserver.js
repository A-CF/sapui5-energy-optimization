/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(['sap/ui/core/util/MockServer'], function (M) {
  'use strict';
  var m,
    _ = 'ui/s2p/mm/stock/overview/ori/',
    a = _ + 'localService/mockdata';
  return {
    init: function () {
      var u = jQuery.sap.getUriParameters(),
        j = jQuery.sap.getModulePath(a),
        s = jQuery.sap.getModulePath(_ + 'manifest', '.json'),
        e = 'MaterialHeaders',
        E = u.get('errorType'),
        i = E === 'badRequest' ? 400 : 500,
        o = jQuery.sap.syncGetJSON(s).data,
        b = o['sap.app'].dataSources.MMIM_MATERIAL_DATA_SRV,
        c = jQuery.sap.getModulePath(_ + b.settings.localUri.replace('.xml', ''), '.xml'),
        d = /.*\/$/.test(b.uri) ? b.uri : b.uri + '/';
      m = new M({ rootUri: d });
      M.config({
        autoRespond: true,
        autoRespondAfter: u.get('serverDelay') || 1000,
      });
      m.simulate(c, { sMockdataBaseUrl: j, bGenerateMissingMockData: true });
      var r = m.getRequests(),
        R = function (g, h, k) {
          k.response = function (x) {
            x.respond(g, { 'Content-Type': 'text/plain;charset=utf-8' }, h);
          };
        };
      if (u.get('metadataError')) {
        r.forEach(function (g) {
          if (g.path.toString().indexOf('$metadata') > -1) {
            R(500, 'metadata Error', g);
          }
        });
      }
      if (E) {
        r.forEach(function (g) {
          if (g.path.toString().indexOf(e) > -1) {
            R(i, E, g);
          }
        });
      }
      r.push({
        method: 'GET',
        path: new RegExp('MatPlStockHistorys(.*)'),
        response: function (x, U) {
          jQuery.sap.log.debug('Incoming request for MatPlStockHistorys');
          var g = {
            data: {
              results: [
                {
                  Batch: '',
                  BlockedStockQuantity: '100.000',
                  CalendarDate: new Date(1475193600000),
                  CurrentStock: '200.000',
                  FiscalPeriod: '00',
                  FiscalYear: '0000',
                  GoodsReceiptBlockedStockQty: '300.000',
                  Material: 'DIMIS_MATERIAL_01',
                  PeriodType: 'D',
                  Plant: '0001',
                  PostingDate: new Date(1475193600000),
                  QualityInspectionStockQuantity: '400.000',
                  RestrictedStockQuantity: '500.000',
                  ReturnsBlockedStockQuantity: '600.000',
                  StockInTransitQuantity: '700.000',
                  TiedEmptiesStockQuantity: '800.000',
                  TransferStockPlantQuantity: '900.000',
                  TransferStockStorageLocQty: '1000.000',
                },
                {
                  Batch: '',
                  BlockedStockQuantity: '100.000',
                  CalendarDate: new Date(1502755200000),
                  CurrentStock: '200.000',
                  FiscalPeriod: '00',
                  FiscalYear: '0000',
                  GoodsReceiptBlockedStockQty: '300.000',
                  Material: 'DIMIS_MATERIAL_01',
                  PeriodType: 'D',
                  Plant: '0001',
                  PostingDate: new Date(1502755200000),
                  QualityInspectionStockQuantity: '400.000',
                  RestrictedStockQuantity: '500.000',
                  ReturnsBlockedStockQuantity: '600.000',
                  StockInTransitQuantity: '700.000',
                  TiedEmptiesStockQuantity: '800.000',
                  TransferStockPlantQuantity: '900.000',
                  TransferStockStorageLocQty: '1000.000',
                },
              ],
            },
            headers: {
              'Content-Type': 'application/json;charset=utf-8',
              DataServiceVersion: '1.0',
            },
            status: '204',
            statusText: 'No Content',
          };
          x.respond(g.status, g.headers, JSON.stringify({ d: g.data }));
          return true;
        },
      });
      var f = r[21].response;
      r[21].response = function (x, g, U) {
        var p = U.replace(/%20and%20CalendarDate%20eq%20datetime%27[0-9]{4}-[0-9]{2}-[0-9]{2}T00%3a00%3a00%27/, '');
        return f(x, g, p);
      };
      m.setRequests(r);
      m.start();
      jQuery.sap.log.info('Running the app with mock data');
    },
    getMockServer: function () {
      return m;
    },
  };
});
