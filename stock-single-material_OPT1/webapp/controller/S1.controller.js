/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(
  [
    'ui/s2p/mm/stock/overview/opt1/controller/BaseController',
    'sap/ui/model/json/JSONModel',
    'ui/s2p/mm/stock/overview/opt1/model/formatter',
    'sap/ui/model/Filter',
    'sap/ui/model/FilterOperator',
    'sap/ui/core/format/NumberFormat',
    'sap/m/MessageToast',
    'ui/s2p/mm/stock/overview/opt1/reuse/materialmaster/controller/ValueHelpController',
    'sap/ui/generic/app/navigation/service/NavigationHandler',
    'sap/viz/ui5/format/ChartFormatter',
    'sap/viz/ui5/api/env/Format',
    'ui/s2p/mm/stock/overview/opt1/reuse/custom/LightDialog',
    'ui/s2p/mm/stock/overview/opt1/reuse/custom/ChartPersonalizationLight',
    'ui/s2p/mm/stock/overview/opt1/reuse/custom/HistoryChartLight'

  ],
  function (B, J, f, F, b, N, M, V, c, C, d, LightDialog, ChartPersonalizationLight, HistoryChartLight) {
    'use strict';
    return B.extend('ui.s2p.mm.stock.overview.opt1.controller.S1', {
      formatter: f,
      onInit: function () {
        var t = this;
        this._toggleBusy(true);
        if (!jQuery.support.touch) {
          this.getView().addStyleClass('sapUiSizeCompact');
        } else {
          this.getView().byId('MaterialInput').setWidth('100%');
          this.getView().byId('idReportingDate').setWidth('20%');
          this.getView().byId('idTableSearch').setWidth('20%');
        }
        var p = { container: 'ui.s2p.mm.stock.overview.opt1', item: 'app' };
        this._oNavigationService = new sap.ui.generic.app.navigation.service.NavigationHandler(this);
        var s = sap.ui.core.Component.getOwnerIdFor(this.getView());
        this._oComponentData = sap.ui.component(s).getComponentData();
        var S = jQuery.sap.getUriParameters().get('sap-mmim-testmode');
        if (!(S && parseInt(S) > 0)) {
          if (
            this._oComponentData &&
            this._oComponentData.startupParameters &&
            this._oComponentData.startupParameters.sap_mmim_testmode
          ) {
            S = this._oComponentData.startupParameters.sap_mmim_testmode[0];
          }
        }
        if (S && parseInt(S) > 0) {
          var a = '/sap/opu/odata/sap/MMIM_EXTERNALTEST_SRV';
          var T = new sap.ui.model.odata.ODataModel(a, true);
          var o = {};
          o.AverageProcessingDuration = '' + parseInt(S);
          o.CreatedByUser = '';
          var e = '/TestModeSet';
          T.create(
            e,
            o,
            null,
            function (D, r) { },
            function (E) {
              var j = JSON.parse(E.response.body);
            }
          );
        }
        this.oCrossAppNav =
          sap.ushell && sap.ushell.Container && sap.ushell.Container.getService('CrossApplicationNavigation');
        if (this.oCrossAppNav) {
          this._oPersonalizer = sap.ushell.Container.getService('Personalization').getPersonalizer(p);
        }
        this._initData().finally(
          function () {
            if (this.oCrossAppNav) {
              var i = new Array();
              var I = '#Material-manageStock';
              i.push(I);
              var g = '#Material-transferStock';
              i.push(g);
              var h = '#MaterialMovement-displayList';
              i.push(h);
              var j = '#Material-displayFactSheet';
              i.push(j);
              var k = '#Material-transferStockCrossPlant';
              i.push(k);
              var l = '#Material-displayStockMultipleMaterials';
              i.push(l);
              var m = 'MaterialMovement-displayFactSheet?MaterialDocument=4900020559&MaterialDocumentYear=2017';
              i.push(m);
              var n = '#Material-displayMatlSerialNumberList';
              i.push(n);
              var q = this.oCrossAppNav
                .isIntentSupported(i)
                .done(function (x) {
                  if (x) {
                    t._isIntentSupported.ManageStock = x[I].supported || false;
                    t._isIntentSupported.TransferStock = x[g].supported || false;
                    t._isIntentSupported.ManageMatDoc = x[h].supported || false;
                    t._isIntentSupported.transferStockCrossPlant = x[k].supported || false;
                    t._isIntentSupported.MultipleStockAllowed = x[l].supported || false;
                    t._isIntentSupported.DisplayMatDoc = x[m].supported || false;
                    t._isIntentSupported.DisplaySerNumAllowed = x[n].supported || false;
                    t._isIntentSupported.MaterialDisplay = x[j].supported || false;
                    if (t.getView().getModel('oFrontend')) {
                      t.getView().getModel('oFrontend').setProperty('/MaterialLinkActive', x[j].supported);
                      t.getView()
                        .getModel('oFrontend')
                        .setProperty('/ManageStockAllowed', t._isIntentSupported.ManageStock);
                      t.getView()
                        .getModel('oFrontend')
                        .setProperty('/TransferStockAllowed', t._isIntentSupported.TransferStock);
                      t.getView()
                        .getModel('oFrontend')
                        .setProperty('/ManageMatDocAllowed', t._isIntentSupported.ManageMatDoc);
                      t.getView()
                        .getModel('oFrontend')
                        .setProperty('/TransferStockCrossPlantAllowed', t._isIntentSupported.transferStockCrossPlant);
                      t.getView()
                        .getModel('oFrontend')
                        .setProperty('/MultipleStockAllowed', t._isIntentSupported.MultipleStockAllowed);
                      t.getView()
                        .getModel('oFrontend')
                        .setProperty('/DisplaySerNumAllowed', t._isIntentSupported.DisplaySerNumAllowed);
                    }
                  }
                })
                .fail(function () {
                  jQuery.sap.log.error('Reading intent data failed.');
                });
            }
            var r = this.getOwnerComponent().getModel('oMaterialData');
            this.getView().setModel(r, 'oMaterialData');
            this._oValueHelpController = new V();
            this._oValueHelpController.init(r);
            var u;
            if (
              this._oComponentData &&
              this._oComponentData.startupParameters &&
              this._oComponentData.startupParameters.Material
            ) {
              u = this._oComponentData.startupParameters.Material[0];
            } else {
              u = jQuery.sap.getUriParameters().get('Material');
            }
            this._oMessagePopover = new sap.m.MessagePopover({
              items: {
                path: 'message>/',
                template: new sap.m.MessagePopoverItem({
                  longtextUrl: '{message>descriptionUrl}',
                  type: '{message>type}',
                  title: '{message>message}',
                }),
              },
            });
            this.getView().setModel(sap.ui.getCore().getMessageManager().getMessageModel(), 'message');
            this.getView().addDependent(this._oMessagePopover);
            this.getView().getModel('message').attachMessageChange(null, this._onMessageChange, this);
            var A = 'idApplSettingsBtn';
            var v = sap.ui.getCore().byId(A);
            if (v !== undefined) {
              v.destroy();
            }
            if (sap.ushell) {
              var R = sap.ushell.Container.getRenderer('fiori2');
              var w = {
                controlType: 'sap.m.Button',
                oControlProperties: {
                  id: A,
                  text: this.getResourceBundle().getText('SETTINGS_TITLE'),
                  icon: 'sap-icon://user-settings',
                  press: jQuery.proxy(function () {
                    this.handlePersoButtonPressed();
                  }, this),
                },
                bIsVisible: true,
                bCurrentState: true,
                bIsFirst: true,
              };
              R.addUserAction(w);
            }
            if (u) {
              this._setMaterial2InputField(u);
            } else {
              this._oNavigationService.parseNavigation().done(function (x, y, z) {
                if (x && x.customData && x.customData.Material) {
                  var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
                    pattern: 'dd.MM.yyyy',
                  });
                  t.getView().byId('MaterialInput').setValue(x.customData.Material);
                  t.getView().byId('idUnitOfMeasure').setValue(x.customData.AlternativeUnit);
                  t.getView().byId('idReportingDate').setDateValue(D.parse(x.customData.ReportingDate));
                  t._loadMaterial(
                    x.customData.Material,
                    x.customData.AlternativeUnit,
                    x.customData.ReportingDate,
                    x.customData
                  );
                }
              });
              this._toggleBusy(false);
            }
          }.bind(this)
        );
      },
      onCopilot: function (e) {
        var v = sap.ui.getCore().byId('idHistoryLineChart');
        var s = v.vizSelection();
        if ((s.length === 1 && s[0].data.Type !== 'total') || e.getParameter('id') === 'idBtnCopilot') {
          var h = v.getModel();
          var m;
          var a;
          if (s.length > 0 && s[0].data.MatDoc) {
            m = s[0].data.MatDoc.split('/')[0];
            var p = h.getProperty('/PerDayHistoryData');
            for (var i = 0; i < p.length; i++) {
              if (p[i].MatDocAndItem === s[0].data.MatDoc) {
                a = p[i].MaterialDocumentYear;
              }
            }
          }
          var t = this;
          var g = e.getSource();
          if (!this._oCopilotPopover) {
            this._oCopilotPopover = sap.ui.xmlfragment('ui.s2p.mm.stock.overview.opt1.view.CoPilotChatPopover', this);
            this.getView().addDependent(this._oCopilotPopover);
            jQuery.sap.syncStyleClass('sapUiSizeCompact', this.getView(), this._oCopilotPopover);
          }
          sap.cp.ui.services.CopilotApi.getChats().then(function (j) {
            t._aCopilotChats = j;
            var k = [];
            var o = {};
            for (var i = 0; i < t._aCopilotChats.length; i++) {
              o = {};
              o.title = t._aCopilotChats[i].getProperties().title;
              o.createdOn = t._aCopilotChats[i].getProperties().createdOn;
              o.guid = t._aCopilotChats[i].getProperties().guid;
              k.push(o);
            }
            var l = new sap.ui.model.json.JSONModel({
              MaterialDocument: m,
              MaterialDocumentYear: a,
              Chats: k,
            });
            l.setDefaultBindingMode(sap.ui.model.BindingMode.OneWay);
            t._oCopilotPopover.setModel(l);
            t._oCopilotPopover.openBy(g);
          });
        }
      },
      handleAddtoCopilotChat: function (e) {
        this._oCopilotPopover.close();
        var s = e.getSource().getBindingContext().getObject().guid;
        var a = null;
        for (var i = 0; i < this._aCopilotChats.length; i++) {
          if (this._aCopilotChats[i].getProperties().guid === s) {
            a = i;
          }
        }
        if (a !== null) {
          var t = this;
          var o = {};
          if (e.getSource().getParent().getModel().getProperty('/MaterialDocument') !== undefined) {
            o = new sap.ui.model.Context(
              new sap.ui.model.odata.v2.ODataModel('/sap/opu/odata/sap/MMIM_MATDOC_OV_SRV/', {
                annotationURI:
                  "/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/Annotations(TechnicalName='MMIM_MATDOC_OV_ANNO_MDL',Version='0001')/$value/",
              }),
              "/F_Mmim_Findmatdoc(MaterialDocument='" +
              e.getSource().getParent().getModel().getProperty('/MaterialDocument') +
              "',MaterialDocumentYear='" +
              e.getSource().getParent().getModel().getProperty('/MaterialDocumentYear') +
              "',MaterialDocumentItem='0001',StockChangeType='05',StockChangeContext='%20')"
            );
          } else {
            o = new sap.ui.model.Context(
              new sap.ui.model.odata.v2.ODataModel('/sap/opu/odata/sap/MD_PRODUCT_OP_SRV/', {
                annotationURI:
                  "/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/Annotations(TechnicalName='MD_PRODUCT_OP_ANNO_MDL',Version='0001')/$value/",
              }),
              "/C_ProductObjPg('" + t.getView().getModel('oFrontend').getProperty('/Material') + "')"
            );
          }
          this._oNavigationService.storeInnerAppState(this._getInnerAppState(), true).done(function (A) {
            t._aCopilotChats[a].addObjectFromContext(o).then(function (O) {
              M.show(t.getResourceBundle().getText('SUCCESS_MESSAGE_COPILOT'));
            });
          });
        }
      },
      onSmartLinkNavigation: function (e) {
        var p = e.getParameters();
        var o = this.getView().getModel('oFrontend');
        var m = o.getProperty('/Material');
        var a = { Material: m };
        p.setSemanticAttributes(a, 'Material');
        this._oNavigationService.storeInnerAppState(this._getInnerAppState(), true).done(function (A) {
          p.setAppStateKey(A);
        });
        p.open();
      },
      onNavigationTargetsObtainedMainAndAction: function (e) {
        var o = this.getView().getModel('oFrontend');
        var m = o.getProperty('/Material');
        e.getParameters().show(m);
      },
      onDrillDown: function (e) {
        var o = this.getView().getModel('oFrontend');
        var D = o.getProperty('/DrillDownState');
        switch (D) {
          case 'FiscalPeriod':
            this._loadHistoryData();
            break;
          case 'Day':
            this._loadDayHistoryData();
            break;
          case 'PerDay':
            break;
        }
      },
      onDrillUp: function (e) {
        var o = this.getView().getModel('oFrontend');
        var D = o.getProperty('/DrillDownState');
        switch (D) {
          case 'FiscalPeriod':
            break;
          case 'Day':
            var v = sap.ui.getCore().byId('idHistoryLineChart');
            var h = v.getModel();
            var p = h.getProperty('/Plant');
            var s = h.getProperty('/Batch');
            var S = h.getProperty('/StorageLocation');
            var a = function createEventObject(g, i, j) {
              var k = {};
              var l = {};
              var m = function (P) {
                var q = P;
                var r = {};
                r.getValue = function () {
                  return q;
                };
                return r;
              };
              var n = [];
              n[0] = m(g);
              n[1] = m(i);
              n[2] = m(j);
              l.getCustomData = function () {
                return n;
              };
              k.getSource = function () {
                return l;
              };
              return k;
            };
            this.handleHistoryChartDisplay(a(p, s, S));
            break;
          case 'PerDay':
            this._loadHistoryData();
            break;
        }
      },
      onChartPersonalizationPress: function (e) {
        var p = new sap.ui.model.json.JSONModel();
        p.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
        var P = {};
        P.ColumnCollection = [];
        P.ColumnCollection = this._oPersonalizedDataContainer.ColumnCollection;
        P.showSafetyStockQuantity = this._oPersonalizedDataContainer.showSafetyStockQuantity;
        P.showMinimumSafetyStockQuantity = this._oPersonalizedDataContainer.showMinimumSafetyStockQuantity;
        p.setData(JSON.parse(JSON.stringify(P)));
        p.setProperty(
          '/personalizationEnabled',
          this.getView().getModel('oFrontend').getProperty('/personalizationEnabled')
        );
        //this._oChartPersDialog.setModel(p);
        var a = p.getProperty('/ColumnCollection');
        //this._oChartPersDialog.getButtons()[0].setEnabled(this._isChartlineVisible(a));
        var v = sap.ui.getCore().byId('newVizFrame');
        var h = v.getModel();
        var s = h.getProperty('/Plant');
        var g = h.getProperty('/Batch');
        var S = h.getProperty('/StorageLocation');
        var I = {};
        var j = this.getView().getModel('oFrontend').getProperty('/Items');
        for (var i = 0; i < j.length; i++) {
          if (j[i].Plant === s && j[i].Batch === g && j[i].StorageLocation === S) {
            I = j[i];
          }
        }
        /* var o = sap.ui.getCore().byId('idTabSafetyStockPerso');
        if (I.StorageLocation === '') {
          o.setVisible(true);
        } else {
          o.setVisible(false);
        } */
        this.oPersChartDialog = new ChartPersonalizationLight();
        this.oPersChartDialog.setModel(p);
        this.byId("dialogHostPersonalization").addItem(this.oPersChartDialog);
        var t = this;
        this.oPersChartDialog.open(function (r) {
          t.onChartPersonalizationOK(r)
        });
        //this._oChartPersDialog.open();
      },
      onPersonalizationChartCancel: function (e) {
        this._oChartPersDialog.close()
      },
      onPersonalizationChartSelect: function (e) {
        var m = this._oChartPersDialog.getModel();
        var a = m.getProperty('/ColumnCollection');
        this._oChartPersDialog.getButtons()[0].setEnabled(this._isChartlineVisible(a));
      },
      _isChartlineVisible: function (a) {
        var i = false;
        for (var j = 0; j < a.length; j++) {
          if (
            a[j].HistoryChartVisible === true &&
            a[j].path !== 'StockHistoryVisible' &&
            a[j].path !== 'NonVltdGRBlockedStockQtyVisible'
          ) {
            i = true;
          }
        }
        return i;
      },
      onOpenLightDialog: function () {
        if (!this.oLightDialog) {
          this.oLightDialog = new LightDialog();
          this.byId("dialogHost").addItem(this.oLightDialog);
        }
        var p = {};
        var t = this;
        var m = this.getView().byId('MaterialInput').getValue();
        if (m.length > 0) {
          p.Material = m;
        }
        this.oLightDialog.open(p,function (r) {
          t._handleValueHelpCallback(r);
        });
      },
      onChartPersonalizationOK: function (e) {
        var a = e.getSource().getModel().getProperty('/ColumnCollection');
        this._oPersonalizedDataContainer.ColumnCollection = a;
        this._oPersonalizedDataContainer.showSafetyStockQuantity = e
          .getSource()
          .getModel()
          .getProperty('/showSafetyStockQuantity');
        this._oPersonalizedDataContainer.showMinimumSafetyStockQuantity = e
          .getSource()
          .getModel()
          .getProperty('/showMinimumSafetyStockQuantity');
        var o = this.getView().getModel('oFrontend');
        var D = o.getProperty('/DrillDownState');
        if (D === 'FiscalPeriod' || D === 'Day') {
          var v = sap.ui.getCore().byId('newVizFrame');
          var h = v.getModel();
          var p = h.getProperty('/Plant');
          var s = h.getProperty('/Batch');
          var S = h.getProperty('/StorageLocation');
          switch (D) {
            case 'FiscalPeriod':
              var g = function createEventObject(P, i, j) {
                var e = {};
                var k = {};
                var l = function (n) {
                  var q = n;
                  var r = {};
                  r.getValue = function () {
                    return q;
                  };
                  return r;
                };
                var m = [];
                m[0] = l(P);
                m[1] = l(i);
                m[2] = l(j);
                k.getCustomData = function () {
                  return m;
                };
                e.getSource = function () {
                  return k;
                };
                return e;
              };
              this.handleHistoryChartDisplay(g(p, s, S));
              break;
            case 'Day':
              this._displayHistoryChart(p, s, S);
              break;
          }
        }
        if (this._oPersonalizer) {
          this._executePersonalizationSave();
        }
        //this._oChartPersDialog.close();
      },
      _loadDayHistoryData: function (I) {
        var _ = '/sap/opu/odata/sap/MMIM_MATDOC_OV_SRV/';
        if (!this._oMatdocModel) {
          this._oMatdocModel = new sap.ui.model.odata.v2.ODataModel(_, {
            defaultCountMode: sap.ui.model.odata.CountMode.Inline,
          });
          sap.ui.getCore().getMessageManager().registerMessageProcessor(this._oMatdocModel);
          var t = this;
          var m = this._oMatdocModel
            .getMetaModel()
            .loaded()
            .then(function (E) {
              var G = t._oMatdocModel
                .getMetaModel()
                .getODataEntityType('MMIM_MATDOC_OV_SRV.F_Mmim_FindmatdocType').property;
              var L = [];
              for (var i = 0; i < G.length; i++) {
                L[G[i].name] = G[i]['sap:label'];
              }
              t._MatDocLabel = L;
            });
        }
        var v = sap.ui.getCore().byId('newVizFrame');
        var s = v.vizSelection();
        var a;
        var S = 0;
        var e;
        var g;
        var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
          pattern: 'yyyy-MM-dd',
        });
        if (s.length === 1) {
          var o = sap.ui.core.format.DateFormat.getDateTimeInstance({
            pattern: 'dd.MM.yy',
          });
          a = D.format(new Date(s[0].data.PostingDate));
          for (var i = 0; i < this._aColumnCollectionPrototype.length; i++) {
            if (s[0].data[this._aColumnCollectionPrototype[i].text] !== undefined) {
              S = this._aColumnCollectionPrototype[i].StockTypeKey;
              e = this._aColumnCollectionPrototype[i].text;
              g = this._aColumnCollectionPrototype[i].key;
            }
          }
        } else if (I) {
          var o = sap.ui.core.format.DateFormat.getDateTimeInstance({
            pattern: 'dd.MM.yyyy',
          });
          var h = o.parse(I.HistoryCalendarDate);
          a = D.format(h);
          S = I.StockTypeKey;
          for (var i = 0; i < this._aColumnCollectionPrototype.length; i++) {
            if (this._aColumnCollectionPrototype[i].StockTypeKey === S) {
              e = this._aColumnCollectionPrototype[i].text;
              g = this._aColumnCollectionPrototype[i].key;
            }
          }
        }
        if (a) {
          var k = [];
          var l = new sap.ui.model.Sorter('CreationTime', false);
          k.push(l);
          l = new sap.ui.model.Sorter('MaterialDocument', false);
          k.push(l);
          l = new sap.ui.model.Sorter('MaterialDocumentItem', false);
          k.push(l);
          var n = [];
          var H = v.getModel();
          var p = H.getProperty('/Plant');
          var q = H.getProperty('/Batch');
          var r = this.getView().getModel('oFrontend');
          var u = r.getProperty('/Material');
          var w = H.getProperty('/StorageLocation');
          var x;
          var y = this.getView().getModel('oFrontend').getProperty('/Items');
          for (var i = 0; i < y.length; i++) {
            if (y[i].Plant === p && y[i].Batch === q && y[i].StorageLocation === w) {
              for (var j = 0; j < y[i].DayHistoryData[g].length; j++) {
                var z = y[i].DayHistoryData[g][j].PostingDate;
                if (D.format(z) === a) {
                  x = y[i].DayHistoryData[g][j].StockQuantity;
                }
              }
            }
          }
          n.push(new sap.ui.model.Filter('Material', sap.ui.model.FilterOperator.EQ, u));
          n.push(new sap.ui.model.Filter('Batch', sap.ui.model.FilterOperator.EQ, q));
          n.push(new sap.ui.model.Filter('StockChangeType', sap.ui.model.FilterOperator.EQ, '05'));
          n.push(
            new sap.ui.model.Filter({
              filters: [
                new sap.ui.model.Filter('Plant', sap.ui.model.FilterOperator.EQ, p),
                new sap.ui.model.Filter('IssuingOrReceivingPlant', sap.ui.model.FilterOperator.EQ, p),
              ],
              and: false,
            })
          );
          n.push(
            new sap.ui.model.Filter({
              filters: [
                new sap.ui.model.Filter('InventoryStockType', sap.ui.model.FilterOperator.EQ, S),
                new sap.ui.model.Filter('IssuingOrReceivingStockType', sap.ui.model.FilterOperator.EQ, S),
              ],
              and: false,
            })
          );
          n.push(new sap.ui.model.Filter('PostingDate', sap.ui.model.FilterOperator.EQ, a));
          if (w !== undefined && w !== '') {
            n.push(
              new sap.ui.model.Filter({
                filters: [
                  new sap.ui.model.Filter('StorageLocation', sap.ui.model.FilterOperator.EQ, w),
                  new sap.ui.model.Filter('IssuingOrReceivingStorageLoc', sap.ui.model.FilterOperator.EQ, w),
                ],
                and: false,
              })
            );
          }
          v.setBusy(true);
          var A = new sap.ui.model.Filter({ filters: n, and: true });
          this._oMatdocModel.read('/F_Mmim_Findmatdoc', {
            filters: [A],
            sorters: k,
            success: jQuery.proxy(this._successDayHistoryLoad, this, a, x, e, S),
            error: jQuery.proxy(this._loadError, this),
          });
        }
      },
      onVizFrameSelectData: function (e) {
        var v = e.getSource();
        var D = sap.ui.getCore().byId('newDrillDown');
        var o = this.getView().getModel('oFrontend');
        var s = o.getProperty('/DrillDownState');
        if (s === 'Day') {
          if (v.vizSelection().length === 1) {
            D.setEnabled(true);
            D.setTooltip();
          } else {
            D.setEnabled(false);
            D.setTooltip(this.getResourceBundle().getText('TOOLTIP_DRILLDOWN_BTN'));
          }
        }
      },
      onVizFrameDeselectData: function (e) {
        var v = e.getSource();
        var D = sap.ui.getCore().byId('newDrillDown');
        var o = this.getView().getModel('oFrontend');
        var s = o.getProperty('/DrillDownState');
        if (s === 'Day') {
          if (v.vizSelection().length === 1) {
            D.setEnabled(true);
            D.setTooltip();
          } else {
            D.setEnabled(false);
            D.setTooltip(this.getResourceBundle().getText('TOOLTIP_DRILLDOWN_BTN'));
          }
        }
      },
      _successDayHistoryLoad: function (p, e, s, S, D, r) {
        var P = sap.ui.getCore().byId('newChartContainerPopover');
        var v = sap.ui.getCore().byId('newVizFrame');
        v.setBusy(false);
        v.destroyDataset().destroyFeeds();
        v.setVizType('waterfall');
        v.setUiConfig({ applicationSet: 'fiori' });
        var o = v.getModel();
        var a = o.getProperty('/Plant');
        var g = o.getProperty('/Batch');
        var h = o.getProperty('/StorageLocation');
        var j = e;
        for (var i = 0; i < D.results.length; i++) {
          D.results[i].StockQuantity = parseInt(D.results[i].QuantityInEntryUnit);
          if (D.results[i].IssuingOrReceivingPlant === '') {
            if (D.results[i].DebitCreditCode === 'H') {
              D.results[i].StockQuantity *= -1;
            }
          } else {
            if (D.results[i].IssuingOrReceivingStockType === D.results[i].InventoryStockType) {
              if (D.results[i].Plant === D.results[i].IssuingOrReceivingPlant) {
                if (h === '') {
                  D.results[i].StockQuantity *= 0;
                } else {
                  if (D.results[i].StorageLocation === D.results[i].IssuingOrReceivingStorageLoc) {
                  } else {
                    if (D.results[i].StorageLocation === h) {
                      D.results[i].StockQuantity *= D.results[i].DebitCreditCode === 'H' ? -1 : 1;
                    } else {
                      D.results[i].StockQuantity *= D.results[i].DebitCreditCode === 'H' ? 1 : -1;
                    }
                  }
                }
              } else {
                if (D.results[i].Plant === a) {
                  D.results[i].StockQuantity *= D.results[i].DebitCreditCode === 'H' ? -1 : 1;
                } else {
                  D.results[i].StockQuantity *= D.results[i].DebitCreditCode === 'H' ? 1 : -1;
                }
              }
            } else {
              if (D.results[i].InventoryStockType === S) {
                D.results[i].StockQuantity *= D.results[i].DebitCreditCode === 'H' ? -1 : 1;
              } else {
                D.results[i].StockQuantity *= D.results[i].DebitCreditCode === 'H' ? 1 : -1;
              }
            }
          }
          j = j - D.results[i].StockQuantity;
        }
        var H = [];
        var k = {};
        k.MatDoc = this.getResourceBundle().getText('START_OF_DAY_PERDAY_HISTORY_CHART');
        k.MatDocItem = '';
        k.MatDocAndItem = k.MatDoc;
        k.Type = 'total';
        k.PostingDate = p;
        k.StockQuantity = j;
        H.push(k);
        for (var i = 0; i < D.results.length; i++) {
          if (
            D.results[i].Plant === D.results[i].IssuingOrReceivingPlant &&
            D.results[i].InventoryStockType === D.results[i].IssuingOrReceivingStockType &&
            h === ''
          ) {
            k = {};
            k.MatDoc = D.results[i].MaterialDocument;
            k.MatDocItem = D.results[i].MaterialDocumentItem;
            k.MatDocAndItem = k.MatDoc + '/' + k.MatDocItem + '-';
            k.CreatedByUser = D.results[i].CreatedByUser;
            k.CreatedByUserDescription = D.results[i].CreatedByUserDescription;
            k.GoodsMovementType = D.results[i].GoodsMovementType;
            k.GoodsMovementTypeName = D.results[i].GoodsMovementTypeName;
            k.GoodsMovementReasonCode = D.results[i].GoodsMovementReasonCode;
            k.GoodsMovementReasonName = D.results[i].GoodsMovementReasonName;
            k.GoodsMovementType = D.results[i].GoodsMovementType;
            k.GoodsMovementTypeName = D.results[i].GoodsMovementTypeName;
            k.MaterialDocumentYear = D.results[i].MaterialDocumentYear;
            k.AccountingDocumentTypeName = D.results[i].AccountingDocumentTypeName;
            k.AccountingDocumentType = D.results[i].AccountingDocumentType;
            k.Type = 'null';
            k.PostingDate = D.results[i].PostingDate;
            k.StockQuantity = parseInt(D.results[i].QuantityInEntryUnit) * -1;
            H.push(k);
            k = {};
            k.MatDoc = D.results[i].MaterialDocument;
            k.MatDocItem = D.results[i].MaterialDocumentItem;
            k.MatDocAndItem = k.MatDoc + '/' + k.MatDocItem + '+';
            k.CreatedByUser = D.results[i].CreatedByUser;
            k.CreatedByUserDescription = D.results[i].CreatedByUserDescription;
            k.GoodsMovementType = D.results[i].GoodsMovementType;
            k.GoodsMovementTypeName = D.results[i].GoodsMovementTypeName;
            k.GoodsMovementReasonCode = D.results[i].GoodsMovementReasonCode;
            k.GoodsMovementReasonName = D.results[i].GoodsMovementReasonName;
            k.GoodsMovementType = D.results[i].GoodsMovementType;
            k.GoodsMovementTypeName = D.results[i].GoodsMovementTypeName;
            k.MaterialDocumentYear = D.results[i].MaterialDocumentYear;
            k.AccountingDocumentTypeName = D.results[i].AccountingDocumentTypeName;
            k.AccountingDocumentType = D.results[i].AccountingDocumentType;
            k.Type = 'null';
            k.PostingDate = D.results[i].PostingDate;
            k.StockQuantity = parseInt(D.results[i].QuantityInEntryUnit);
            H.push(k);
          } else {
            k = {};
            k.MatDoc = D.results[i].MaterialDocument;
            k.MatDocItem = D.results[i].MaterialDocumentItem;
            k.MatDocAndItem = k.MatDoc + '/' + k.MatDocItem;
            k.CreatedByUser = D.results[i].CreatedByUser;
            k.CreatedByUserDescription = D.results[i].CreatedByUserDescription;
            k.GoodsMovementType = D.results[i].GoodsMovementType;
            k.GoodsMovementTypeName = D.results[i].GoodsMovementTypeName;
            k.GoodsMovementReasonCode = D.results[i].GoodsMovementReasonCode;
            k.GoodsMovementReasonName = D.results[i].GoodsMovementReasonName;
            k.GoodsMovementType = D.results[i].GoodsMovementType;
            k.GoodsMovementTypeName = D.results[i].GoodsMovementTypeName;
            k.MaterialDocumentYear = D.results[i].MaterialDocumentYear;
            k.AccountingDocumentTypeName = D.results[i].AccountingDocumentTypeName;
            k.AccountingDocumentType = D.results[i].AccountingDocumentType;
            k.Type = 'null';
            k.PostingDate = D.results[i].PostingDate;
            k.StockQuantity = D.results[i].StockQuantity;
            H.push(k);
          }
        }
        k = {};
        k.MatDoc = this.getResourceBundle().getText('END_OF_DAY_PERDAY_HISTORY_CHART');
        k.MatDocItem = '';
        k.MatDocAndItem = k.MatDoc;
        k.Type = 'total';
        k.PostingDate = p;
        k.StockQuantity = e;
        H.push(k);
        var l = sap.ui.core.format.DateFormat.getDateTimeInstance({
          pattern: 'yyyy-MM-dd',
        });
        var m = sap.ui.core.format.DateFormat.getDateInstance({
          style: 'long',
        });
        var n = new sap.ui.model.json.JSONModel({
          PerDayHistoryData: H,
          Plant: a,
          Batch: g,
          StorageLocation: h,
          CalendarDate: p,
          StockTypeKey: S,
        });
        var q = new sap.viz.ui5.data.FlattenedDataset({
          dimensions: [
            { name: 'Type', value: '{Type}' },
            { name: 'MatDoc', value: '{MatDocAndItem}' },
          ],
          measures: [{ name: 'StockQuantity', value: '{StockQuantity}' }],
          data: { path: '/PerDayHistoryData' },
        });
        v.setVizProperties({
          plotArea: {
            dataLabel: { formatString: 'u', visible: true },
            window: {
              start: {
                categoryAxis: {
                  MatDoc: this.getResourceBundle().getText('START_OF_DAY_PERDAY_HISTORY_CHART'),
                },
              },
              end: {
                categoryAxis: {
                  MatDoc: this.getResourceBundle().getText('END_OF_DAY_PERDAY_HISTORY_CHART'),
                },
              },
            },
            referenceLine: { line: { valueAxis: [] } },
          },
          general: { layout: { padding: 0.04 } },
          valueAxis: {
            title: {
              visible: true,
              text: this.getResourceBundle().getText('YAXIS_HISTORY_CHART'),
            },
            label: { formatString: 'u' },
          },
          categoryAxis: {
            title: {
              visible: true,
              text: this.getResourceBundle().getText('TITLE_PERDAY_HISTORY_CHART_XAXIS', [s, m.format(l.parse(p))]),
            },
          },
          legend: {
            title: { visible: false },
            label: {
              text: {
                negativeValue: this.getResourceBundle().getText('STOCK_DECREASING_DOCUMENT'),
                positiveValue: this.getResourceBundle().getText('STOCK_INCREASING_DOCUMENT'),
              },
            },
          },
          title: { visible: false },
          interaction: { selectability: { mode: 'single' } },
        });
        v.setDataset(q);
        v.setModel(n);
        var t = new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: 'categoryAxis',
          type: 'Dimension',
          values: ['MatDoc'],
        }),
          u = new sap.viz.ui5.controls.common.feeds.FeedItem({
            uid: 'valueAxis',
            type: 'Measure',
            values: ['StockQuantity'],
          }),
          w = new sap.viz.ui5.controls.common.feeds.FeedItem({
            uid: 'waterfallType',
            type: 'Dimension',
            values: ['Type'],
          });
        v.addFeed(t);
        v.addFeed(u);
        v.addFeed(w);
        // IMPORTANT!
        this.lightHistoryChart.chartContainer.rerender();
        var x = this;
        P.setCustomDataControl(function (I) {
          return x._setCustomData(I, x);
        });
        P.connect(v.getVizUid());
        var y = sap.ui.getCore().byId('idChartContainer');
        var z = sap.ui.getCore().byId('idBtnDrillDown');
        var A = sap.ui.getCore().byId('idBtnDrillUp');
        var E = this.getView().getModel('oFrontend');
        z.setEnabled(false);
        E.setProperty('/DrillDownState', 'PerDay');
        y.setShowPersonalization(false);
        var T = sap.ui.getCore().byId('idTxtChartContainerDrillDown');
        T.setVisible(false);
        /* this._oHistoryChartDialog.open(); */
        var G = {};
        G.onAfterRendering = function (I) {
          this.focus();
          this.removeEventDelegate(G);
        }.bind(A);
        A.addEventDelegate(G);
      },
      _setCustomData: function (e, t) {
        var v = sap.ui.getCore().byId('idHistoryLineChart');
        var s = v.vizSelection();
        var h = v.getModel();
        var o = t.getView().getModel('oFrontend');
        var p = sap.ui.getCore().byId('idHistoryLineChartPopOver');
        var I = [];
        var a;
        if (s.length === 1) {
          if (s[0].data.Type !== 'total') {
            a = this.getView().getModel('oFrontend').getProperty('/CopilotActive');
            if (a) {
              I = [
                {
                  type: 'action',
                  text: t.getResourceBundle().getText('BUTTON_SHOW_MATDOC'),
                  press: jQuery.proxy(t.onMatDocPress, t),
                },
                {
                  type: 'action',
                  text: t.getResourceBundle().getText('BUTTON_SHOW_COPILOT'),
                  press: jQuery.proxy(t.onCopilot, t),
                },
              ];
            } else {
              I = [
                {
                  type: 'action',
                  text: t.getResourceBundle().getText('BUTTON_SHOW_MATDOC'),
                  press: jQuery.proxy(t.onMatDocPress, t),
                },
              ];
            }
            p.setActionItems(I);
            p.connect(v.getVizUid());
            var H = h.getProperty('/PerDayHistoryData');
            var g;
            if (H !== undefined) {
              for (var i = 0; i < H.length; i++) {
                if (H[i].MatDocAndItem === s[0].data.MatDoc) {
                  g = H[i];
                }
              }
              var S = new sap.ui.layout.form.SimpleForm({
                layout: 'ResponsiveGridLayout',
                minWidth: 300,
                maxContainerCols: 2,
                editable: false,
                labelSpanL: 4,
                labelSpanM: 4,
                emptySpanL: 1,
                emptySpanM: 1,
                columnsL: 1,
                columnsM: 1,
              });
              S.addContent(new sap.m.Label({ text: t._MatDocLabel['MaterialDocument'] }));
              S.addContent(new sap.m.Text({ text: g.MatDoc }));
              S.addContent(
                new sap.m.Label({
                  text: t._MatDocLabel['MaterialDocumentItem'],
                })
              );
              S.addContent(new sap.m.Text({ text: g.MatDocItem }));
              S.addContent(
                new sap.m.Label({
                  text: t._MatDocLabel['MaterialDocumentYear'],
                })
              );
              S.addContent(new sap.m.Text({ text: g.MaterialDocumentYear }));
              S.addContent(new sap.m.Label({ text: t._MatDocLabel['CreatedByUser'] }));
              S.addContent(
                new sap.m.Text({
                  text: g.CreatedByUserDescription + ' (' + g.CreatedByUser + ')',
                })
              );
              S.addContent(
                new sap.m.Label({
                  text: t._MatDocLabel['GoodsMovementTypeName'],
                })
              );
              S.addContent(
                new sap.m.Text({
                  text: g.GoodsMovementTypeName + ' (' + g.GoodsMovementType + ')',
                })
              );
              S.addContent(
                new sap.m.Label({
                  text: t._MatDocLabel['AccountingDocumentType'],
                })
              );
              S.addContent(
                new sap.m.Text({
                  text: g.AccountingDocumentTypeName + ' (' + g.AccountingDocumentType + ')',
                })
              );
              S.addContent(
                new sap.m.Label({
                  text: t._MatDocLabel['QuantityInEntryUnit'],
                })
              );
              S.addContent(
                new sap.m.ObjectNumber({
                  number: s[0].data.StockQuantity,
                  unit: o.getProperty('/AlternativeUnit'),
                })
              );
            }
          } else {
            p.setActionItems();
            p.connect(v.getVizUid());
            var S = new sap.ui.layout.form.SimpleForm({
              layout: 'ResponsiveGridLayout',
              minWidth: 300,
              maxContainerCols: 2,
              editable: false,
              labelSpanL: 4,
              labelSpanM: 4,
              emptySpanL: 1,
              emptySpanM: 1,
              columnsL: 1,
              columnsM: 1,
            });
            S.addContent(new sap.m.Label({ text: t._MatDocLabel['QuantityInEntryUnit'] }));
            S.addContent(
              new sap.m.ObjectNumber({
                number: s[0].data.StockQuantity,
                unit: o.getProperty('/AlternativeUnit'),
              })
            );
          }
        }
        return S;
      },
      onMatDocPress: function (e) {
        var v = sap.ui.getCore().byId('idHistoryLineChart');
        var s = v.vizSelection();
        if (this._isIntentSupported.DisplayMatDoc) {
          if (s.length === 1 && s[0].data.Type !== 'total') {
            var h = v.getModel();
            var m = s[0].data.MatDoc.split('/')[0];
            var a;
            var p = h.getProperty('/PerDayHistoryData');
            for (var i = 0; i < p.length; i++) {
              if (p[i].MatDocAndItem === s[0].data.MatDoc) {
                a = p[i].MaterialDocumentYear;
              }
            }
            var P = { MaterialDocument: m, MaterialDocumentYear: a };
            var I = this._getInnerAppState();
            this._oHistoryChartDialog.close();
            this._oHistoryChartDialog.destroy();
            this._oNavigationService.navigate('MaterialMovement', 'displayFactSheet', P, I);
          }
        }
      },
      _setInitChartState: function (i) {
        var D = i.DrillDownState;
        var o = this.getView().getModel('oFrontend');
        var s = o.getProperty('/DrillDownState');
        if (D !== s) {
          switch (s) {
            case undefined:
              o.setProperty('/DrillDownState', s);
              var a = function createEventObject(p, e, S) {
                var E = {};
                var g = {};
                var h = function (P) {
                  var k = P;
                  var l = {};
                  l.getValue = function () {
                    return k;
                  };
                  return l;
                };
                var j = [];
                j[0] = h(p);
                j[1] = h(e);
                j[2] = h(S);
                g.getCustomData = function () {
                  return j;
                };
                E.getSource = function () {
                  return g;
                };
                return E;
              };
              this.handleHistoryChartDisplay(a(i.HistoryPlant, i.HistoryBatch, i.HistoryStorageLocation), i);
              break;
            case 'FiscalPeriod':
              this._loadHistoryData(i);
              break;
            case 'Day':
              this._loadDayHistoryData(i);
              break;
            case 'PerDay':
              break;
          }
        }
      },
      _loadHistoryData: function (I) {
        var v = sap.ui.getCore().byId('newVizFrame');
        var h = v.getModel();
        var p = h.getProperty('/Plant');
        var s = h.getProperty('/Batch');
        var S = h.getProperty('/StorageLocation');
        var a = this.getView().getModel('oFrontend').getProperty('/Items');
        var l = false;
        for (var i = 0; i < a.length; i++) {
          if (a[i].Plant === p && a[i].Batch === s && a[i].StorageLocation === S) {
            if (a[i].DayHistoryData != undefined) {
              l = true;
            }
          }
        }
        if (!l) {
          var o = this.getView().getModel('oFrontend');
          var m = o.getProperty('/Material');
          var r = o.getProperty('/ReportingDate');
          var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
            pattern: 'yyyy-MM-dd',
            UTC: 'true',
          });
          var R = D.format(r) + 'T00:00:00';
          var e = this.getView().getModel('oMaterialData');
          if (!e) {
            e = this.getOwnerComponent().getModel('oMaterialData');
          }
          var g = [];
          g.push(new sap.ui.model.Filter('Material', sap.ui.model.FilterOperator.EQ, m));
          g.push(new sap.ui.model.Filter('Batch', sap.ui.model.FilterOperator.EQ, s));
          g.push(new sap.ui.model.Filter('Plant', sap.ui.model.FilterOperator.EQ, p));
          g.push(new sap.ui.model.Filter('CalendarDate', sap.ui.model.FilterOperator.EQ, R));
          g.push(new sap.ui.model.Filter('PeriodType', sap.ui.model.FilterOperator.EQ, 'D'));
          v.setBusy(true);
          if (S) {
            g.push(new sap.ui.model.Filter('StorageLocation', sap.ui.model.FilterOperator.EQ, S));
            e.read('/MatStorLocStockHiss', {
              filters: g,
              success: jQuery.proxy(this._successHistoryLoad, this, I),
              error: jQuery.proxy(this._loadError, this),
            });
          } else {
            e.read('/MatPlStockHistorys', {
              filters: g,
              success: jQuery.proxy(this._successHistoryLoad, this, I),
              error: jQuery.proxy(this._loadError, this),
            });
          }
        } else {
          this._displayHistoryChart(p, s, S);
        }
      },
      _successHistoryLoad: function (I, D, r) {
        var v = sap.ui.getCore().byId('newVizFrame');
        var o = v.getModel();
        v.setBusy(false)
        var s = o.getProperty('/StorageLocation');
        var p = o.getProperty('/Plant');
        var a = o.getProperty('/Batch');
        var H = {};
        var e = sap.ui.core.format.DateFormat.getDateTimeInstance({
          pattern: 'dd.MM.yyyy',
          UTC: 'true',
        });
        var g = sap.ui.core.format.DateFormat.getDateTimeInstance({
          pattern: 'dd.MM.yyyy',
        });
        for (var q = 0; q < this._aColumnCollectionPrototype.length; q++) {
          if (this._aColumnCollectionPrototype[q].key) {
            H[this._aColumnCollectionPrototype[q].key] = [];
            for (var k = 0; k < D.results.length; k++) {
              var h = {};
              h.StockQuantity = D.results[k][this._aColumnCollectionPrototype[q].key];
              if (h.StockQuantity === undefined) {
                h.StockQuantity = '0';
              }
              h.PostingDate = g.parse(e.format(new Date(D.results[k].PostingDate)));
              H[this._aColumnCollectionPrototype[q].key].push(h);
            }
            H[this._aColumnCollectionPrototype[q].key] = this._supplementDayHistoryData(
              H[this._aColumnCollectionPrototype[q].key]
            );
          }
        }
        var j = this.getView().getModel('oFrontend').getProperty('/Items');
        for (var i = 0; i < j.length; i++) {
          if (j[i].Plant === p && j[i].Batch === a && j[i].StorageLocation === s) {
            j[i].DayHistoryData = H;
          }
        }
        this.getView().getModel('oFrontend').setProperty('/Items', j);
        this._displayHistoryChart(p, a, s);
        if (I !== undefined) {
          this._setInitChartState(I);
        }
      },
      _displayHistoryChart: function (p, s, S) {
        var P = sap.ui.getCore().byId('newChartContainerPopover');
        var v = sap.ui.getCore().byId('newVizFrame');
        v.destroyDataset().destroyFeeds();
        v.setVizType('timeseries_line');
        v.setUiConfig({ applicationSet: 'fiori' });
        P.setActionItems();
        P.setCustomDataControl(null);
        P.connect(v.getVizUid());
        var I = {};
        var a = this.getView().getModel('oFrontend').getProperty('/Items');
        for (var i = 0; i < a.length; i++) {
          if (a[i].Plant === p && a[i].Batch === s && a[i].StorageLocation === S) {
            I = a[i];
          }
        }
        var D = new sap.viz.ui5.data.FlattenedDataset({
          dimensions: [{ name: 'PostingDate', value: '{PostingDate}', dataType: 'date' }],
          measures: [],
          data: { path: '/HistoryData' },
        });
        var o = sap.ui.core.format.DateFormat.getDateInstance({
          style: 'long',
        });
        var e = this._getVisibleColumnsInHistoryChart();
        var h = [];
        var H = {};
        var g = [];
        var j = [];
        var k = '';
        var L = '';
        var t = '';
        if (I.StorageLocation === '') {
          if (s == '') {
            t = this.getResourceBundle().getText('TITLE_HISTORY_CHART_PLANT', [I.PlantName]);
          } else {
            t = this.getResourceBundle().getText('TITLE_HISTORY_CHART_PLANT_BATCH', [I.PlantName, s]);
          }
        } else {
          if (s == '') {
            t = this.getResourceBundle().getText('TITLE_HISTORY_CHART_STORAGE_LOCATION', [
              I.PlantName,
              I.StorageLocationName,
            ]);
          } else {
            t = this.getResourceBundle().getText('TITLE_HISTORY_CHART_STORAGE_LOCATION_BATCH', [
              I.PlantName,
              s,
              I.StorageLocationName,
            ]);
          }
        }
        for (var l = 0; l < e.length; l++) {
          D.addMeasure(
            new sap.viz.ui5.data.MeasureDefinition({
              name: e[l].text,
              value: '{' + e[l].path.substr(0, e[l].path.length - 7) + '}',
            })
          );
          j.push('' + e[l].text);
          g.push();
        }
        for (var m = 0; m < I.DayHistoryData[e[0].key].length; m++) {
          H = {};
          for (var l = 0; l < e.length; l++) {
            H[e[l].path.substr(0, e[l].path.length - 7)] = I.DayHistoryData[e[l].key][m].StockQuantity;
            H.PostingDate = I.DayHistoryData[e[l].key][m].PostingDate;
            if (m === 0) {
              k = H.PostingDate;
            }
            if (m === I.DayHistoryData[e[0].key].length - 1) {
              L = H.PostingDate;
            }
          }
          h.push(H);
        }
        var n = new sap.ui.model.json.JSONModel({
          HistoryData: h,
          Title: t,
          Batch: s,
          StorageLocation: S,
          Plant: p,
        });
        v.setDataset(D);
        v.setModel(n);
        var q = {
          general: { layout: { padding: 0.04 } },
          valueAxis: {
            title: {
              visible: true,
              text: this.getResourceBundle().getText('YAXIS_HISTORY_CHART'),
            },
            label: { formatString: 'u' },
          },
          timeAxis: {
            title: {
              visible: true,
              text: this.getResourceBundle().getText('TITLE_DAY_HISTORY_CHART', [o.format(k), o.format(L)]),
            },
            levels: ['year', 'month', 'day', 'week', 'quarter'],
          },
          plotArea: {
            dataLabel: { visible: false },
            window: { start: k, end: L },
          },
          legend: { title: { visible: true } },
          title: { visible: false },
          interaction: { selectability: { mode: 'single' } },
        };
        q.plotArea.referenceLine = { line: { valueAxis: [] } };
        if (I.StorageLocation == '') {
          if (this._oPersonalizedDataContainer.showSafetyStockQuantity) {
            q.plotArea.referenceLine.line.valueAxis.push({
              value: parseFloat(I.SafetyStockQuantity),
              label: {
                text: this.getResourceBundle().getText('SAFETY_STOCK_LABEL'),
                visible: true,
              },
            });
          }
          if (this._oPersonalizedDataContainer.showMinimumSafetyStockQuantity) {
            q.plotArea.referenceLine.line.valueAxis.push({
              value: parseFloat(I.MinimumSafetyStockQuantity),
              label: {
                text: this.getResourceBundle().getText('MINIMUM_SAFETY_STOCK_LABEL'),
                visible: true,
              },
            });
          }
        }
        v.setVizProperties(q)
        var r = new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: 'timeAxis',
          type: 'Dimension',
          values: ['PostingDate'],
        });
        v.addFeed(r);
        var u = new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: 'valueAxis',
          type: 'Measure',
          values: j,
        });
        v.addFeed(u);
        // IMPORTANT!
        this.lightHistoryChart.chartContainer.rerender();
        var w = this;
        P.setCustomDataControl(function (G) {
          return w._setCustomDataDayAndFiscalPeriodScreen(G, w);
        });
        P.connect(v.getVizUid());
        this.lightHistoryChart.setModel(n);
        this._oHistoryChartDialog.setModel(n);
        var x = sap.ui.getCore().byId('newDrillDown');
        var y = sap.ui.getCore().byId('newDrillUp');
        var z = this.getView().getModel('oFrontend');
        z.setProperty('/DrillDownState', 'Day');
        y.setEnabled(true);
        x.setEnabled(false);
        x.setTooltip(this.getResourceBundle().getText('TOOLTIP_DRILLDOWN_BTN'));
        var A = sap.ui.getCore().byId('newChartContainer');
        var T = sap.ui.getCore().byId('newDrillDownText');
        T.setVisible(true);
        A.setShowPersonalization(true);
        //this._oHistoryChartDialog.open();
        var E = {};
        E.onAfterRendering = function (G) {
          this.focus();
          this.removeEventDelegate(E);
        }.bind(y);
        y.addEventDelegate(E);
      },
      _setCustomDataDayAndFiscalPeriodScreen: function (e, t) {
        var v = sap.ui.getCore().byId('idHistoryLineChart');
        var s = v.vizSelection();
        var o = t.getView().getModel('oFrontend');
        var D = o.getProperty('/DrillDownState');
        var a = sap.ui.core.format.DateFormat.getDateInstance({
          style: 'long',
        });
        if (s.length === 1) {
          var S = new sap.ui.layout.form.SimpleForm({
            layout: 'ResponsiveGridLayout',
            minWidth: 300,
            maxContainerCols: 2,
            editable: false,
            labelSpanL: 4,
            labelSpanM: 4,
            emptySpanL: 1,
            emptySpanM: 1,
            columnsL: 1,
            columnsM: 1,
          });
          var l;
          var T;
          if (D === 'FiscalPeriod') {
            l = t.getResourceBundle().getText('HISTORY_CHART_POPOVER_FISCALPERIOD');
            T = s[0].data.FiscalPeriod;
          } else if (D === 'Day') {
            l = t.getResourceBundle().getText('HISTORY_CHART_POPOVER_POSTINGDATE');
            T = a.format(new Date(s[0].data.PostingDate));
          }
          S.addContent(new sap.m.Label({ text: l }));
          S.addContent(new sap.m.Text({ text: T }));
          var g;
          var h;
          for (var i = 0; i < t._aColumnCollectionPrototype.length; i++) {
            if (s[0].data[t._aColumnCollectionPrototype[i].text] !== undefined) {
              g = t._aColumnCollectionPrototype[i].text;
              h = s[0].data[t._aColumnCollectionPrototype[i].text];
            }
          }
          S.addContent(new sap.m.Label({ text: g }));
          S.addContent(
            new sap.m.ObjectNumber({
              number: h,
              unit: o.getProperty('/AlternativeUnit'),
            })
          );
        }
        return S;
      },
      _supplementDayHistoryData: function (s) {
        var a = [];
        var e = {};
        var g = new Date(s[0].PostingDate);
        var l = new Date(s[0].PostingDate);
        for (var i = 0; i < s.length; i++) {
          if (g > new Date(s[i].PostingDate)) {
            g = new Date(s[i].PostingDate);
          }
          if (l < new Date(s[i].PostingDate)) {
            l = new Date(s[i].PostingDate);
          }
        }
        var h = new Date(g);
        for (h; h <= l; h.setDate(h.getDate() + 1)) {
          e = {};
          e.StockQuantity = '0';
          e.PostingDate = new Date(h);
          for (var i = 0; i < s.length; i++) {
            if (
              new Date(s[i].PostingDate).getDate() === h.getDate() &&
              new Date(s[i].PostingDate).getMonth() === h.getMonth() &&
              new Date(s[i].PostingDate).getYear() === h.getYear()
            ) {
              e = s[i];
            }
          }
          a.push(e);
        }
        return a;
      },
      onMessagesButtonPress: function (e) {
        var m = e.getSource();
        this._oMessagePopover.toggle(m);
      },
      onAfterRendering: function () {
        if (this._MessageShown !== undefined && this._MessageShown === false) {
          this._oMessagePopover.openBy(this.getView().byId('idMessageIndicator'));
          this._MessageShown = true;
        }
        var o = this.byId('idDataContainer');
        o._oFullScreenButton.attachPress(
          function () {
            this.setEnableScroll(this.getFullScreen());
          }.bind(o)
        );
      },
      _onMessageChange: function (o) {
        if (this.getView().byId('idPage').getMessagesIndicator().getDomRef() !== null) {
          this._oMessagePopover.openBy(this.getView().byId('idMessageIndicator'));
        } else {
          this._MessageShown = false;
        }
      },
      onNavBack: function () {
        var h = sap.ui.core.routing.History.getInstance(),
          p = h.getPreviousHash();
        var o = sap.ushell && sap.ushell.Container && sap.ushell.Container.getService('CrossApplicationNavigation');
        if (p !== undefined || !o.isInitialNavigation()) {
          o.backToPreviousApp();
        } else {
          if (window.history.length > 0) {
            o.backToPreviousApp();
          } else {
            o.toExternal({ target: { shellHash: '#' } });
          }
        }
      },
      onShareInJamPress: function () {
        var s = this._oNavigationService.storeInnerAppState(this._getInnerAppState());
        s.done(function (a) {
          var v = this.getModel('oFrontend');
          var S = sap.ui.getCore().createComponent({
            name: 'sap.collaboration.components.fiori.sharing.dialog',
            settings: {
              object: {
                id: document.URL,
                share: v.getProperty('/shareOnJamTitle'),
              },
            },
          });
          S.open();
        });
      },
      onExit: function () {
        if (sap.m.InstanceManager.hasOpenPopover()) {
          sap.m.InstanceManager.closeAllPopovers();
        }
        if (sap.m.InstanceManager.hasOpenDialog()) {
          sap.m.InstanceManager.closeAllDialogs();
        }
        this.getView().getModel('message').detachMessageChange(this._onMessageChange, this);
        if (sap.ui.getCore().byId('idHistoryLineChartPopOver')) {
          sap.ui.getCore().byId('idHistoryLineChartPopOver').destroy();
        }
      },
      _toggleBusy: function (i) {
        this.getView().byId('idPlantStorageLocationTable').setBusy(i);
        this.getView().byId('idPlantStorageLocationTable').setBusyIndicatorDelay(0);
      },
      _getInitFrontend: function () {
        return {
          selectedMaterial: '',
          personalizationEnabled: true,
          AlternativeUnitIsVisible: false,
          CurrentStockVisible: true,
          BlockedStockQuantityVisible: true,
          GoodsReceiptBlockedStockQtyVisible: true,
          NonVltdGRBlockedStockQtyVisible: false,
          QualityInspectionStockQuantityVisible: true,
          RestrictedStockQuantityVisible: true,
          ReturnsBlockedStockQuantityVisible: true,
          StockInTransitQuantityVisible: true,
          TiedEmptiesStockQuantityVisible: true,
          TransferStockPlantQuantityVisible: true,
          TransferStockStorageLocQtyVisible: true,
          StockHistoryVisible: true,
          WarehouseStorageBinVisible: false,
          BatchOnHeaderVisible: false,
          BatchOnPlantVisible: false,
          BatchOnMaterialVisible: false,
          BatchOnItemVisible: false,
          LoadAllButtonVisible: false,
          PlantVisible: false,
          shareOnJamTitle: this.getResourceBundle().getText('appDescription'),
          shareSendEmailSubject: '',
          selectedStockLabelText: this.getResourceBundle().getText('STOCK_BY_PLANT_LABEL'),
          MaterialLinkActive: false,
          ManageStockAllowed: false,
          TransferStockAllowed: false,
          ManageMatDocAllowed: false,
          TransferStockCrossPlantAllowed: false,
          MultipleStockAllowed: false,
          ManageStockEnabled: false,
          TransferStockEnabled: false,
          ManageMatDocEnabled: false,
          TransferStockCrossPlantEnabled: false,
          MultipleStockEnabled: false,
          ReportingDate: new Date(),
          Items: [],
          visible: false,
          CopilotActive: false,
        };
      },
      _initData: function () {
        var p = new Promise(
          function (r, a) {
            this._iconExpand = 'sap-icon://slim-arrow-right';
            this._iconExpandToolTip = this.getResourceBundle().getText('TOOLTIP_EXPAND_BUTTON');
            this._iconCollapse = 'sap-icon://slim-arrow-down';
            this._iconCollapseToolTip = this.getResourceBundle().getText('TOOLTIP_COLLAPSE_BUTTON');
            var s = this._getInitFrontend();
            var o = new sap.ui.model.json.JSONModel(s);
            o.setSizeLimit(1000);
            this.getView().setModel(o, 'oFrontend');
            this.getView().byId('idReportingDate').setDateValue(s.ReportingDate);
            this._PlantStorageLocations = [];
            this._isIntentSupported = {
              ManageStock: false,
              TransferStock: false,
              ManageMatDoc: false,
              MaterialDisplay: false,
              TransferStockCrossPlantAllowed: false,
              MultipleStockAllowed: false,
              DisplayMatDoc: false,
              DisplaySerNumAllowed: false,
            };
            this._aCopilotChats = [];
            var e = [
              {
                text: this.getResourceBundle().getText('UNRESTRICTED_USE_TABLE_COLUMN_TEXT'),
                path: 'CurrentStockVisible',
                key: 'CurrentStock',
                visible: true,
                enabled: true,
                HistoryVisible: true,
                HistoryEnabled: true,
                HistoryChartVisible: true,
                HistoryAvailable: true,
                StockTypeKey: '01',
              },
              {
                text: this.getResourceBundle().getText('BLOCKED_STOCK_TABLE_COLUMN_TEXT'),
                path: 'BlockedStockQuantityVisible',
                key: 'BlockedStockQuantity',
                visible: true,
                enabled: true,
                HistoryVisible: true,
                HistoryEnabled: true,
                HistoryChartVisible: true,
                HistoryAvailable: true,
                StockTypeKey: '07',
              },
              {
                text: this.getResourceBundle().getText('QUALITY_STOCK_TABLE_COLUMN_TEXT'),
                path: 'QualityInspectionStockQuantityVisible',
                key: 'QualityInspectionStockQuantity',
                visible: true,
                enabled: true,
                HistoryVisible: false,
                HistoryEnabled: true,
                HistoryChartVisible: true,
                HistoryAvailable: true,
                StockTypeKey: '02',
              },
              {
                text: this.getResourceBundle().getText('RESTRICTED_STOCK_TABLE_COLUMN_TEXT'),
                path: 'RestrictedStockQuantityVisible',
                key: 'RestrictedStockQuantity',
                visible: true,
                enabled: true,
                HistoryVisible: false,
                HistoryEnabled: true,
                HistoryChartVisible: true,
                HistoryAvailable: true,
                StockTypeKey: '08',
              },
              {
                text: this.getResourceBundle().getText('RETURNS_STOCK_TABLE_COLUMN_TEXT'),
                path: 'ReturnsBlockedStockQuantityVisible',
                key: 'ReturnsBlockedStockQuantity',
                visible: true,
                enabled: true,
                HistoryVisible: false,
                HistoryEnabled: true,
                HistoryChartVisible: true,
                HistoryAvailable: true,
                StockTypeKey: '03',
              },
              {
                text: this.getResourceBundle().getText('IN_TRANSIT_STOCK_TABLE_COLUMN_TEXT'),
                path: 'StockInTransitQuantityVisible',
                key: 'StockInTransitQuantity',
                visible: true,
                enabled: true,
                HistoryVisible: false,
                HistoryEnabled: true,
                HistoryChartVisible: true,
                HistoryAvailable: true,
                StockTypeKey: '06',
              },
              {
                text: this.getResourceBundle().getText('TIED_EMPTIES_STOCK_TABLE_COLUMN_TEXT'),
                path: 'TiedEmptiesStockQuantityVisible',
                key: 'TiedEmptiesStockQuantity',
                visible: true,
                enabled: true,
                HistoryVisible: false,
                HistoryEnabled: true,
                HistoryChartVisible: true,
                HistoryAvailable: true,
                StockTypeKey: '09',
              },
              {
                text: this.getResourceBundle().getText('TRANSFER_PLANT_STOCK_TABLE_COLUMN_TEXT'),
                path: 'TransferStockPlantQuantityVisible',
                key: 'TransferStockPlantQuantity',
                visible: true,
                enabled: true,
                HistoryVisible: false,
                HistoryEnabled: true,
                HistoryChartVisible: true,
                HistoryAvailable: true,
                StockTypeKey: '05',
              },
              {
                text: this.getResourceBundle().getText('TRANSFER_STLOC_STOCK_TABLE_COLUMN_TEXT'),
                path: 'TransferStockStorageLocQtyVisible',
                key: 'TransferStockStorageLocQty',
                visible: true,
                enabled: true,
                HistoryVisible: false,
                HistoryEnabled: true,
                HistoryChartVisible: true,
                HistoryAvailable: true,
                StockTypeKey: '04',
              },
              {
                text: this.getResourceBundle().getText('GR_BLOCKED_STOCK_TABLE_COLUMN_TEXT'),
                path: 'GoodsReceiptBlockedStockQtyVisible',
                key: 'GoodsReceiptBlockedStockQty',
                visible: true,
                enabled: true,
                HistoryVisible: false,
                HistoryEnabled: true,
                HistoryChartVisible: true,
                HistoryAvailable: true,
                StockTypeKey: '10',
              },
              {
                text: this.getResourceBundle().getText('NON_VAL_GR_BLOCKED_STOCK_TABLE_COLUMN_TEXT'),
                path: 'NonVltdGRBlockedStockQtyVisible',
                key: 'NonVltdGRBlockedStockQty',
                visible: false,
                enabled: true,
                HistoryVisible: false,
                HistoryEnabled: false,
                HistoryChartVisible: false,
                HistoryAvailable: false,
                StockTypeKey: '',
              },
              {
                text: this.getResourceBundle().getText('STOCK_HISTORY_TABLE_COLUMN_TEXT'),
                path: 'StockHistoryVisible',
                visible: true,
                enabled: true,
                HistoryVisible: false,
                HistoryEnabled: false,
                HistoryChartVisible: false,
                HistoryAvailable: false,
                StockTypeKey: '',
              },
            ];
            this._aColumnCollectionPrototype = [];
            var t = this;
            var m = this.getOwnerComponent()
              .getModel('oMaterialData')
              .getMetaModel()
              .loaded()
              .then(
                function (D) {
                  var v = true;
                  var g = t
                    .getOwnerComponent()
                    .getModel('oMaterialData')
                    .getMetaModel()
                    .getODataEntityType('MMIM_MATERIAL_DATA_SRV.MaterialPlant').property;
                  for (var i = 0; i < e.length; i++) {
                    v = true;
                    for (var j = 0; j < g.length; j++) {
                      if (e[i].key === g[j].name && g[j]['sap:visible']) {
                        v = JSON.parse(g[j]['sap:visible']);
                      }
                    }
                    if (v === true) {
                      t._aColumnCollectionPrototype.push(e[i]);
                    } else {
                      t.getView()
                        .getModel('oFrontend')
                        .setProperty('/' + e[i].path, false);
                    }
                  }
                  t._oPersonalizedDataContainer = {
                    expandAllStorageLocationsOnLoad: true,
                    hideEmptyColumnsOnLoad: false,
                    hideEmptyRowsOnLoad: false,
                    hideChartColumnOnLoad: false,
                    showSafetyStockQuantity: true,
                    showMinimumSafetyStockQuantity: true,
                    ColumnCollection: JSON.parse(JSON.stringify(t._aColumnCollectionPrototype)),
                  };
                  t._oPersonalizedDataContainer.loadedData = JSON.parse(JSON.stringify(t._aColumnCollectionPrototype));
                  t._historicStockValuesLoaded = false;
                  if (t._oPersonalizer) {
                    var P = t._oPersonalizer
                      .getPersData()
                      .done(function (h) {
                        if (h) {
                          if (h.ColumnCollection) {
                            for (var k = 0; k < h.ColumnCollection.length; k++) {
                              for (var l = 0; l < t._oPersonalizedDataContainer.ColumnCollection.length; l++) {
                                if (
                                  t._oPersonalizedDataContainer.ColumnCollection[l].key === h.ColumnCollection[k].key
                                ) {
                                  t._oPersonalizedDataContainer.ColumnCollection[l].visible =
                                    h.ColumnCollection[k].visible;
                                  t._oPersonalizedDataContainer.ColumnCollection[l].enabled = true;
                                  t._oPersonalizedDataContainer.ColumnCollection[l].HistoryVisible =
                                    h.ColumnCollection[k].HistoryVisible;
                                  if (h.ColumnCollection[k].HistoryChartVisible !== undefined) {
                                    t._oPersonalizedDataContainer.ColumnCollection[l].HistoryChartVisible =
                                      h.ColumnCollection[k].HistoryChartVisible;
                                  }
                                }
                              }
                            }
                          }
                          if (h.expandAllStorageLocationsOnLoad !== undefined) {
                            t._oPersonalizedDataContainer.expandAllStorageLocationsOnLoad =
                              h.expandAllStorageLocationsOnLoad;
                          }
                          if (h.hideEmptyColumnsOnLoad !== undefined) {
                            t._oPersonalizedDataContainer.hideEmptyColumnsOnLoad = h.hideEmptyColumnsOnLoad;
                          }
                          if (h.hideEmptyRowsOnLoad !== undefined) {
                            t._oPersonalizedDataContainer.hideEmptyRowsOnLoad = h.hideEmptyRowsOnLoad;
                          }
                          if (h.hideChartColumnOnLoad !== undefined) {
                            t._oPersonalizedDataContainer.hideChartColumnOnLoad = h.hideChartColumnOnLoad;
                          }
                          if (h.showSafetyStockQuantity !== undefined) {
                            t._oPersonalizedDataContainer.showSafetyStockQuantity = h.showSafetyStockQuantity;
                          }
                          if (h.showMinimumSafetyStockQuantity !== undefined) {
                            t._oPersonalizedDataContainer.showMinimumSafetyStockQuantity =
                              h.showMinimumSafetyStockQuantity;
                          }
                          t._oPersonalizedDataContainer.loadedData = JSON.parse(
                            JSON.stringify(t._oPersonalizedDataContainer.ColumnCollection)
                          );
                          t._transferColumn2Frontend(t._oPersonalizedDataContainer.ColumnCollection);
                        }
                        r();
                      })
                      .fail(function () {
                        jQuery.sap.log.error('Reading personalization data failed.');
                        a();
                      });
                  } else {
                    r();
                  }
                },
                function () {
                  jQuery.sap.log.error('Metadata model loading failed.');
                  a();
                }
              );
          }.bind(this)
        );
        return p;
      },
      handleInputChangeEvent: function (e) {
        var m = e.getParameters().value.toUpperCase();
        var a = '';
        var r = this.getView().byId('idReportingDate').getValue();
        this._loadMaterial(m, a, r);
      },
      handleMaterialHelp: function (e) {
        var t = this;
        var p = {};
        // Bug?
        //p.SupplierDataOfMaterial = true;
        p.SupplierDataOfMaterial = false;
        var m = this.getView().byId('MaterialInput').getValue();
        if (m.length > 0) {
          p.Material = m;
        }
        this._oValueHelpController.displayValueHelpMaterialGeneral(p, function (r) {
          t._handleValueHelpCallback(r);
        });
      },
      _handleValueHelpCallback: function (r) {
        if (r.selected === true) {
          this._setMaterial2InputField(r.Material);
        }
      },
      handleMaterialSuggest: function (e) {
        var t = e.getParameter('suggestValue').trim();
        var o = {};
        var O = [];
        O.push(new sap.ui.model.Filter('Material', sap.ui.model.FilterOperator.Contains, t));
        O.push(new sap.ui.model.Filter('MaterialName', sap.ui.model.FilterOperator.Contains, t));
        o = new sap.ui.model.Filter(O, false);
        e.getSource().getBinding('suggestionItems').filter(o);
      },
      _loadMaterial: function (m, a, r, i) {
        var s = m;
        var t = this;
        var p = '';
        if (s) {
          requestAnimationFrame(() => this._toggleBusy(true));
          sap.ui.getCore().getMessageManager().removeAllMessages();
          var j = this.getView().getModel('oFrontend').getData();
          j.BaseUnit = '';
          j.BaseUnitName = '';
          j.Material = '';
          j.MaterialName = '';
          j.MaterialType = '';
          j.MaterialTypeName = '';
          j.Items = [];
          j.chartCurrentStock = [];
          j.chartBlockedStock = [];
          j.MaterialLinkActive = this._isIntentSupported.MaterialDisplay;
          t._PlantStorageLocations = [];
          t._aStockValuesStorageLocations = [];
          this.getView().getModel('oFrontend').setProperty('/visible', true);
          var o = this.getView().getModel('oMaterialData');
          if (!o) {
            o = this.getOwnerComponent().getModel('oMaterialData');
          }
          var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
            pattern: 'dd.MM.yyyy',
          });
          var e = [];
          e.push(new sap.ui.model.Filter('Material', sap.ui.model.FilterOperator.EQ, m));
          if (a !== '') {
            e.push(new sap.ui.model.Filter('AlternativeUnit', sap.ui.model.FilterOperator.EQ, a));
          }
          var E;
          if (
            this._oPersonalizedDataContainer !== undefined &&
            this._oPersonalizedDataContainer.hideChartColumnOnLoad
          ) {
            E =
              'Material2Plants/MaterialPlant2MatPlSpecial,Material2Plants/Plant2StorLocs/MatStorLoc2MatStorLocSpecial,Material2Auoms';
          } else {
            E =
              'Material2Plants/MatPlant2MatPlantStockHistory,Material2Plants/MaterialPlant2MatPlSpecial,Material2Plants/Plant2StorLocs/MatStorLoc2MatStorLocStockHis,Material2Plants/Plant2StorLocs/MatStorLoc2MatStorLocSpecial,Material2Auoms';
          }
          if (r !== '') {
            var R = D.parse(r, true);
            if (R !== null) {
              e.push(new sap.ui.model.Filter('CalendarDate', sap.ui.model.FilterOperator.EQ, R));
              o.read('/MaterialHeaders', {
                urlParameters: { $expand: E },
                filters: e,
                success: jQuery.proxy(this._successMaterialLoad, this, j, i),
                error: jQuery.proxy(this._loadError, this),
              });
            } else {
              requestAnimationFrame(() => this._toggleBusy(false));
              this.getView().byId('idReportingDate').focus();
            }
          } else {
            o.read('/MaterialHeaders', {
              urlParameters: { $expand: E },
              filters: e,
              success: jQuery.proxy(this._successMaterialLoad, this, j, i),
              error: jQuery.proxy(this._loadError, this),
            });
          }
        }
      },
      _successMaterialLoad: function (s, I, D, r) {
        var t = this;
        var T = true;
        var h = r.headers['sap-message'];
        if (h) {
          var e = JSON.parse(h);
          if (e.code !== 'MM/109') {
            T = false;
          }
        }
        if (T === false) {
          this._loadError(null, this);
        } else {
          this._oValueHelpController.setBufferForMaterialAUOM(D);
          var P = '';
          var g = '';
          if (I !== undefined && I.Plant !== undefined && I.Plant !== '') {
            P = I.Plant;
          } else {
            if (
              this._oComponentData &&
              this._oComponentData.startupParameters &&
              this._oComponentData.startupParameters.Plant
            ) {
              P = this._oComponentData.startupParameters.Plant[0];
            } else {
              P = jQuery.sap.getUriParameters().get('Plant');
            }
          }
          if (I !== undefined && I.Batch !== undefined && I.Batch !== '') {
            g = I.Batch;
          } else {
            if (
              this._oComponentData &&
              this._oComponentData.startupParameters &&
              this._oComponentData.startupParameters.Batch
            ) {
              g = this._oComponentData.startupParameters.Batch[0];
            } else {
              g = jQuery.sap.getUriParameters().get('Batch');
            }
          }
          s.LoadAllButtonVisible = false;
          s.BaseUnit = D.results[0].BaseUnit;
          s.BaseUnitName = D.results[0].BaseUnitName;
          if (D.results[0].AlternativeUnit === '') {
            s.AlternativeUnit = D.results[0].BaseUnitName;
          } else {
            s.AlternativeUnit = D.results[0].AlternativeUnit;
          }
          var n = this._oValueHelpController.getNumberOfAUOM(D.results[0].Material);
          s.AlternativeUnitIsVisible = false;
          if (n > 1) {
            s.AlternativeUnitIsVisible = true;
          }
          s.Material = D.results[0].Material;
          s.MaterialName = D.results[0].MaterialName;
          s.MaterialType = D.results[0].MaterialType;
          s.MaterialTypeName = D.results[0].MaterialTypeName;
          s.DefinitionOfBatchLevel = D.results[0].DefinitionOfBatchLevel;
          s.WarehouseStorageBinVisible = false;
          s.BatchOnHeaderVisible = false;
          s.BatchOnPlantVisible = false;
          s.BatchOnMaterialVisible = false;
          s.BatchOnItemVisible = false;
          switch (s.DefinitionOfBatchLevel) {
            case '0':
              s.BatchOnPlantVisible = true;
              s.BatchOnItemVisible = true;
              break;
            case '1':
              s.BatchOnMaterialVisible = true;
              s.BatchOnItemVisible = true;
              break;
            case '2':
              s.BatchOnItemVisible = true;
              break;
            default:
              break;
          }
          if (g !== '' && g !== null) {
            s.Batch = g;
            s.BatchOnHeaderVisible = true;
            s.BatchOnItemVisible = false;
            s.LoadAllButtonVisible = true;
          }
          if (P !== '' && P !== null) {
            s.Plant = P;
            s.PlantVisible = true;
            s.LoadAllButtonVisible = true;
          } else {
            s.PlantVisible = false;
          }
          s.maxFractionDigits = '3';
          if (this._oPersonalizedDataContainer.hideEmptyColumnsOnLoad == true) {
            s.CurrentStockVisible = false;
            s.BlockedStockQuantityVisible = false;
            s.GoodsReceiptBlockedStockQtyVisible = false;
            s.NonVltdGRBlockedStockQtyVisible = false;
            s.QualityInspectionStockQuantityVisible = false;
            s.RestrictedStockQuantityVisible = false;
            s.ReturnsBlockedStockQuantityVisible = false;
            s.StockInTransitQuantityVisible = false;
            s.TiedEmptiesStockQuantityVisible = false;
            s.TransferStockPlantQuantityVisible = false;
            s.TransferStockStorageLocQtyVisible = false;
          } else {
            s.CurrentStockVisible = this.getView().getModel('oFrontend').getProperty('/CurrentStockVisible');
            s.BlockedStockQuantityVisible = this.getView()
              .getModel('oFrontend')
              .getProperty('/BlockedStockQuantityVisible');
            s.GoodsReceiptBlockedStockQtyVisible = this.getView()
              .getModel('oFrontend')
              .getProperty('/GoodsReceiptBlockedStockQtyVisible');
            s.NonVltdGRBlockedStockQtyVisible = this.getView()
              .getModel('oFrontend')
              .getProperty('/NonVltdGRBlockedStockQtyVisible');
            s.QualityInspectionStockQuantityVisible = this.getView()
              .getModel('oFrontend')
              .getProperty('/QualityInspectionStockQuantityVisible');
            s.RestrictedStockQuantityVisible = this.getView()
              .getModel('oFrontend')
              .getProperty('/RestrictedStockQuantityVisible');
            s.ReturnsBlockedStockQuantityVisible = this.getView()
              .getModel('oFrontend')
              .getProperty('/ReturnsBlockedStockQuantityVisible');
            s.StockInTransitQuantityVisible = this.getView()
              .getModel('oFrontend')
              .getProperty('/StockInTransitQuantityVisible');
            s.TiedEmptiesStockQuantityVisible = this.getView()
              .getModel('oFrontend')
              .getProperty('/TiedEmptiesStockQuantityVisible');
            s.TransferStockPlantQuantityVisible = this.getView()
              .getModel('oFrontend')
              .getProperty('/TransferStockPlantQuantityVisible');
            s.TransferStockStorageLocQtyVisible = this.getView()
              .getModel('oFrontend')
              .getProperty('/TransferStockStorageLocQtyVisible');
          }
          if (this._oPersonalizedDataContainer.hideChartColumnOnLoad == true) {
            s.StockHistoryVisible = false;
          } else {
            s.StockHistoryVisible = true;
          }
          var u = {};
          s.Items = [];
          for (var i = 0; i < D.results[0].Material2Plants.results.length; i++) {
            if (
              P === null ||
              g === null ||
              (D.results[0].Material2Plants.results[i].Plant === P &&
                D.results[0].Material2Plants.results[i].Batch === g)
            ) {
              u = {};
              u.Plant = D.results[0].Material2Plants.results[i].Plant;
              u.PlantName = D.results[0].Material2Plants.results[i].PlantName;
              u.StorageLocation = '';
              u.StorageLocationName = '';
              u.SafetyStockQuantity = D.results[0].Material2Plants.results[i].SafetyStockQuantity;
              u.MinimumSafetyStockQuantity = D.results[0].Material2Plants.results[i].MinimumSafetyStockQuantity;
              u.Batch = D.results[0].Material2Plants.results[i].Batch;
              if (s.BatchOnHeaderVisible == true) {
                s.Batch = D.results[0].Material2Plants.results[i].Batch;
              }
              u.BlockedStockQuantity = D.results[0].Material2Plants.results[i].BlockedStockQuantity;
              if (u.BlockedStockQuantity != 0 && this._isColumnAvailable('BlockedStockQuantity')) {
                s.BlockedStockQuantityVisible = true;
              }
              u.CurrentStock = D.results[0].Material2Plants.results[i].CurrentStock;
              if (u.CurrentStock != 0 && this._isColumnAvailable('CurrentStock')) {
                s.CurrentStockVisible = true;
              }
              u.GoodsReceiptBlockedStockQty = D.results[0].Material2Plants.results[i].GoodsReceiptBlockedStockQty;
              if (u.GoodsReceiptBlockedStockQty != 0 && this._isColumnAvailable('GoodsReceiptBlockedStockQty')) {
                s.GoodsReceiptBlockedStockQtyVisible = true;
              }
              u.NonVltdGRBlockedStockQty = D.results[0].Material2Plants.results[i].NonVltdGRBlockedStockQty;
              if (u.NonVltdGRBlockedStockQty != 0 && this._isColumnAvailable('NonVltdGRBlockedStockQty')) {
                s.NonVltdGRBlockedStockQtyVisible = true;
              }
              u.QualityInspectionStockQuantity = D.results[0].Material2Plants.results[i].QualityInspectionStockQuantity;
              if (u.QualityInspectionStockQuantity != 0 && this._isColumnAvailable('QualityInspectionStockQuantity')) {
                s.QualityInspectionStockQuantityVisible = true;
              }
              u.RestrictedStockQuantity = D.results[0].Material2Plants.results[i].RestrictedStockQuantity;
              if (u.RestrictedStockQuantity != 0 && this._isColumnAvailable('RestrictedStockQuantity')) {
                s.RestrictedStockQuantityVisible = true;
              }
              u.ReturnsBlockedStockQuantity = D.results[0].Material2Plants.results[i].ReturnsBlockedStockQuantity;
              if (u.ReturnsBlockedStockQuantity != 0 && this._isColumnAvailable('ReturnsBlockedStockQuantity')) {
                s.ReturnsBlockedStockQuantityVisible = true;
              }
              u.StockInTransitQuantity = D.results[0].Material2Plants.results[i].StockInTransitQuantity;
              if (u.StockInTransitQuantity != 0 && this._isColumnAvailable('StockInTransitQuantity')) {
                s.StockInTransitQuantityVisible = true;
              }
              u.TiedEmptiesStockQuantity = D.results[0].Material2Plants.results[i].TiedEmptiesStockQuantity;
              if (u.TiedEmptiesStockQuantity != 0 && this._isColumnAvailable('TiedEmptiesStockQuantity')) {
                s.TiedEmptiesStockQuantityVisible = true;
              }
              u.TransferStockPlantQuantity = D.results[0].Material2Plants.results[i].TransferStockPlantQuantity;
              if (u.TransferStockPlantQuantity != 0 && this._isColumnAvailable('TransferStockPlantQuantity')) {
                s.TransferStockPlantQuantityVisible = true;
              }
              u.TransferStockStorageLocQty = D.results[0].Material2Plants.results[i].TransferStockStorageLocQty;
              if (u.TransferStockStorageLocQty != 0 && this._isColumnAvailable('TransferStockStorageLocQty')) {
                s.TransferStockStorageLocQtyVisible = true;
              }
              u.ButtonIcon = this._iconExpand;
              u.ButtonIconToolTip = this._iconExpandToolTip;
              u.ButtonVisible = true;
              u.PlantVisible = true;
              u.StorageLocationVisible = false;
              u.ItemCounter = 0;
              u.SpecialBlockedStockQuantityVisible = false;
              u.SpecialCurrentStockVisible = false;
              u.SpecialGoodsReceiptBlockedStockQtyVisible = false;
              u.SpecialNonVltdGRBlockedStockQtyVisible = false;
              u.SpecialQualityInspectionStockQuantityVisible = false;
              u.SpecialRestrictedStockQuantityVisible = false;
              u.SpecialReturnsBlockedStockQuantityVisible = false;
              u.SpecialStockInTransitQuantityVisible = false;
              u.SpecialTiedEmptiesStockQuantityVisible = false;
              u.SpecialTransferStockPlantQuantityVisible = false;
              u.SpecialTransferStockStorageLocQtyVisible = false;
              var v = 1;
              var S = {};
              this._PlantStorageLocations[
                D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
              ] = [];
              this._aStockValuesStorageLocations[
                D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
              ] = [];
              for (var j = 0; j < D.results[0].Material2Plants.results[i].Plant2StorLocs.results.length; j++) {
                S = {};
                S.SpecialBlockedStockQuantityVisible = false;
                S.SpecialCurrentStockVisible = false;
                S.SpecialGoodsReceiptBlockedStockQtyVisible = false;
                S.SpecialNonVltdGRBlockedStockQtyVisible = false;
                S.SpecialQualityInspectionStockQuantityVisible = false;
                S.SpecialRestrictedStockQuantityVisible = false;
                S.SpecialReturnsBlockedStockQuantityVisible = false;
                S.SpecialStockInTransitQuantityVisible = false;
                S.SpecialTiedEmptiesStockQuantityVisible = false;
                S.SpecialTransferStockPlantQuantityVisible = false;
                S.SpecialTransferStockStorageLocQtyVisible = false;
                S.StorageLocation = D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].StorageLocation;
                S.StorageLocationName =
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].StorageLocationName;
                S.WarehouseStorageBin =
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].WarehouseStorageBin;
                if (S.WarehouseStorageBin !== '') {
                  s.WarehouseStorageBinVisible = true;
                }
                S.Batch = D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].Batch;
                S.BlockedStockQuantity =
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].BlockedStockQuantity;
                S.CurrentStock = D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].CurrentStock;
                S.QualityInspectionStockQuantity =
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].QualityInspectionStockQuantity;
                S.RestrictedStockQuantity =
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].RestrictedStockQuantity;
                S.ReturnsBlockedStockQuantity =
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].ReturnsBlockedStockQuantity;
                if (
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].StockInTransitQuantity === undefined
                ) {
                  S.StockInTransitQuantity = 0;
                  S.StockInTransitQuantityVisible = false;
                }
                if (
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].TiedEmptiesStockQuantity ===
                  undefined
                ) {
                  S.TiedEmptiesStockQuantity = 0;
                  S.TiedEmptiesStockQuantityVisible = false;
                }
                if (
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].TransferStockPlantQuantity ===
                  undefined
                ) {
                  S.TransferStockPlantQuantity = 0;
                  S.TransferStockPlantQuantityVisible = false;
                }
                if (
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].GoodsReceiptBlockedStockQty ===
                  undefined
                ) {
                  S.GoodsReceiptBlockedStockQty = 0;
                  S.GoodsReceiptBlockedStockQtyVisible = false;
                }
                if (
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].NonVltdGRBlockedStockQty ===
                  undefined
                ) {
                  S.NonVltdGRBlockedStockQty = 0;
                  S.NonVltdGRBlockedStockQtyVisible = false;
                }
                S.TransferStockStorageLocQty =
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].TransferStockStorageLocQty;
                S.ItemCounter = v;
                v++;
                S.PlantStorageLocationSpecial = {};
                var w = {};
                for (
                  var o = 0;
                  o <
                  D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].MatStorLoc2MatStorLocSpecial.results
                    .length;
                  o++
                ) {
                  w = {};
                  if (
                    !S.PlantStorageLocationSpecial[
                    D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].MatStorLoc2MatStorLocSpecial
                      .results[o].AssignmentReference
                    ]
                  ) {
                    S.PlantStorageLocationSpecial[
                      D.results[0].Material2Plants.results[i].Plant2StorLocs.results[
                        j
                      ].MatStorLoc2MatStorLocSpecial.results[o].AssignmentReference
                    ] = [];
                  }
                  w.InventorySpecialStockType =
                    D.results[0].Material2Plants.results[i].Plant2StorLocs.results[
                      j
                    ].MatStorLoc2MatStorLocSpecial.results[o].InventorySpecialStockType;
                  w.InventorySpecialStockTypeName =
                    D.results[0].Material2Plants.results[i].Plant2StorLocs.results[
                      j
                    ].MatStorLoc2MatStorLocSpecial.results[o].InventorySpecialStockTypeName;
                  w.Quantity =
                    D.results[0].Material2Plants.results[i].Plant2StorLocs.results[
                      j
                    ].MatStorLoc2MatStorLocSpecial.results[o].Quantity;
                  w.AlternativeUnit = D.results[0].AlternativeUnit;
                  S.PlantStorageLocationSpecial[
                    D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].MatStorLoc2MatStorLocSpecial
                      .results[o].AssignmentReference
                  ].push(w);
                }
                for (var p = 0; p < this._aColumnCollectionPrototype.length; p++) {
                  var x = this._getSpecialStocksStorageLocation4StockType(
                    this._aColumnCollectionPrototype[p].key,
                    S,
                    null
                  );
                  if (x.length > 0) {
                    S['Special' + this._aColumnCollectionPrototype[p].key + 'Visible'] = true;
                  }
                }
                S.RowIsEmpty = this._CheckEmptyRow(S);
                this._PlantStorageLocations[
                  D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                ].push(S);
                this._aStockValuesStorageLocations[
                  D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                ][S.StorageLocation] = {};
                this._aStockValuesStorageLocations[
                  D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                ][S.StorageLocation]['maxYValue'] = 1;
                if (this._oPersonalizedDataContainer.hideChartColumnOnLoad) {
                  continue;
                }
                var H = null;
                this._aStockValuesStorageLocations[
                  D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                ][S.StorageLocation].HistoryData = {};
                for (var q = 0; q < this._aColumnCollectionPrototype.length; q++) {
                  if (this._aColumnCollectionPrototype[q].key) {
                    this._aStockValuesStorageLocations[
                      D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                    ][S.StorageLocation].HistoryData[this._aColumnCollectionPrototype[q].key] = [];
                    for (
                      var l = 0;
                      l <
                      D.results[0].Material2Plants.results[i].Plant2StorLocs.results[j].MatStorLoc2MatStorLocStockHis
                        .results.length;
                      l++
                    ) {
                      H = {};
                      H.StockQuantity =
                        D.results[0].Material2Plants.results[i].Plant2StorLocs.results[
                          j
                        ].MatStorLoc2MatStorLocStockHis.results[l][this._aColumnCollectionPrototype[q].key];
                      if (H.StockQuantity === undefined) {
                        H.StockQuantity = '0';
                      }
                      H.FiscalYear =
                        D.results[0].Material2Plants.results[i].Plant2StorLocs.results[
                          j
                        ].MatStorLoc2MatStorLocStockHis.results[l].FiscalYear;
                      H.FiscalPeriod =
                        D.results[0].Material2Plants.results[i].Plant2StorLocs.results[
                          j
                        ].MatStorLoc2MatStorLocStockHis.results[l].FiscalPeriod;
                      this._aStockValuesStorageLocations[
                        D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                      ][S.StorageLocation].HistoryData[this._aColumnCollectionPrototype[q].key].push(H);
                    }
                    this._aStockValuesStorageLocations[
                      D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                    ][S.StorageLocation].HistoryData[this._aColumnCollectionPrototype[q].key] =
                      this._supplementHistoryData(
                        this._aStockValuesStorageLocations[
                          D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                        ][S.StorageLocation].HistoryData[this._aColumnCollectionPrototype[q].key]
                      );
                    this._aStockValuesStorageLocations[
                      D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                    ][S.StorageLocation]['chart' + this._aColumnCollectionPrototype[q].key] = [];
                    this._aStockValuesStorageLocations[
                      D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                    ][S.StorageLocation]['chart' + this._aColumnCollectionPrototype[q].key] = this._convert2MicroChart(
                      this._aStockValuesStorageLocations[
                        D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                      ][S.StorageLocation].HistoryData[this._aColumnCollectionPrototype[q].key]
                    )[0];
                    this._aStockValuesStorageLocations[
                      D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                    ][S.StorageLocation]['maxYValue'] = this._maxYValue(
                      this._aStockValuesStorageLocations[
                      D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                      ][S.StorageLocation]['chart' + this._aColumnCollectionPrototype[q].key],
                      this._aStockValuesStorageLocations[
                      D.results[0].Material2Plants.results[i].Plant + D.results[0].Material2Plants.results[i].Batch
                      ][S.StorageLocation]['maxYValue']
                    );
                  }
                }
              }
              u.chartMaxYValue = 1;
              u.HistoryData = {};
              if (!this._oPersonalizedDataContainer.hideChartColumnOnLoad) {
                for (var q = 0; q < this._aColumnCollectionPrototype.length; q++) {
                  if (this._aColumnCollectionPrototype[q].key) {
                    u.HistoryData[this._aColumnCollectionPrototype[q].key] = [];
                    for (
                      var k = 0;
                      k < D.results[0].Material2Plants.results[i].MatPlant2MatPlantStockHistory.results.length;
                      k++
                    ) {
                      H = {};
                      H.StockQuantity =
                        D.results[0].Material2Plants.results[i].MatPlant2MatPlantStockHistory.results[k][
                        this._aColumnCollectionPrototype[q].key
                        ];
                      if (H.StockQuantity === undefined) {
                        H.StockQuantity = '0';
                      }
                      H.FiscalYear =
                        D.results[0].Material2Plants.results[i].MatPlant2MatPlantStockHistory.results[k].FiscalYear;
                      H.FiscalPeriod =
                        D.results[0].Material2Plants.results[i].MatPlant2MatPlantStockHistory.results[k].FiscalPeriod;
                      u.HistoryData[this._aColumnCollectionPrototype[q].key].push(H);
                    }
                    u.HistoryData[this._aColumnCollectionPrototype[q].key] = this._supplementHistoryData(
                      u.HistoryData[this._aColumnCollectionPrototype[q].key]
                    );
                    u['chart' + this._aColumnCollectionPrototype[q].key] = this._convert2MicroChart(
                      u.HistoryData[this._aColumnCollectionPrototype[q].key]
                    )[0];
                    u.chartMaxYValue = this._maxYValue(
                      u['chart' + this._aColumnCollectionPrototype[q].key],
                      u.chartMaxYValue
                    );
                  }
                }
              }
              u.MaterialPlant2MatPlSpecial = {};
              var y = {};
              for (
                var l = 0;
                l < D.results[0].Material2Plants.results[i].MaterialPlant2MatPlSpecial.results.length;
                l++
              ) {
                y = {};
                if (
                  !u.MaterialPlant2MatPlSpecial[
                  D.results[0].Material2Plants.results[i].MaterialPlant2MatPlSpecial.results[l].AssignmentReference
                  ]
                ) {
                  u.MaterialPlant2MatPlSpecial[
                    D.results[0].Material2Plants.results[i].MaterialPlant2MatPlSpecial.results[l].AssignmentReference
                  ] = [];
                }
                y.InventorySpecialStockType =
                  D.results[0].Material2Plants.results[i].MaterialPlant2MatPlSpecial.results[
                    l
                  ].InventorySpecialStockType;
                y.InventorySpecialStockTypeName =
                  D.results[0].Material2Plants.results[i].MaterialPlant2MatPlSpecial.results[
                    l
                  ].InventorySpecialStockTypeName;
                y.Quantity = D.results[0].Material2Plants.results[i].MaterialPlant2MatPlSpecial.results[l].Quantity;
                y.AlternativeUnit = D.results[0].AlternativeUnit;
                u.MaterialPlant2MatPlSpecial[
                  D.results[0].Material2Plants.results[i].MaterialPlant2MatPlSpecial.results[l].AssignmentReference
                ].push(y);
              }
              for (var m = 0; m < this._aColumnCollectionPrototype.length; m++) {
                var x = this._getSpecialStocksPlant4StockType(this._aColumnCollectionPrototype[m].key, u);
                if (x.length > 0) {
                  u['Special' + this._aColumnCollectionPrototype[m].key + 'Visible'] = true;
                }
              }
              u.RowIsEmpty = this._CheckEmptyRow(u);
              s.Items.push(u);
            }
          }
          this._historicStockValuesLoaded = true;
          this.getView().bindElement({
            path: "/MaterialHeaders(Material='" + encodeURIComponent(s.Material).replace(/'/g, "''") + "')",
            model: 'oMaterialData',
          });
        }
        if (!this._oPersonalizedDataContainer.hideChartColumnOnLoad) {
          this._updateMicroChartArray(s.Items);
        }
        this.getView().getModel('oFrontend').setData(s);
        this.getView().byId('idPlantStorageLocationTable').removeSelections(true);
        this.getView().byId('idPlantStorageLocationTable').getBinding('items').filter([]);
        this.getView().byId('idTableSearch').setValue('');
        if (I === undefined) {
          if (this._oPersonalizedDataContainer.expandAllStorageLocationsOnLoad === true) {
            this.expandAllStorageLocations();
          }
        } else {
          var z = function createEventObject(P, g) {
            var E = {};
            var R = {};
            R.Plant = P;
            R.Batch = g;
            R.data = function (U) {
              switch (U) {
                case 'Plant':
                  return this.Plant;
                case 'Batch':
                  return this.Batch;
              }
            };
            E.getSource = function () {
              return R;
            };
            return E;
          };
          var E = {};
          for (var a = 0; a < I.ExpandedItems.length; a++) {
            E = z(I.ExpandedItems[a].Plant, I.ExpandedItems[a].Batch);
            this.handleToggleItem(E);
          }
        }
        if (this._oPersonalizedDataContainer.hideEmptyColumnsOnLoad == false) {
          this._transferColumn2Frontend(this._oPersonalizedDataContainer.ColumnCollection);
        } else {
          for (var i = 0; i < this._oPersonalizedDataContainer.ColumnCollection.length; i++) {
            this._oPersonalizedDataContainer.ColumnCollection[i].filledColumn = this.getView()
              .getModel('oFrontend')
              .getProperty('/' + this._oPersonalizedDataContainer.ColumnCollection[i].path);
          }
        }
        var A = this.getView().byId('idStockOverviewStackedBar');
        if (!this.oPopOver) {
          this.oPopOver = new sap.viz.ui5.controls.Popover();
        }
        if (this.oPopOver) {
          A.destroyDataset().destroyFeeds();
          var G = [];
          if (s.BatchOnMaterialVisible === true) {
            G.push({
              name: this.getResourceBundle().getText('BATCH_LABEL'),
              value: '{oFrontend>Batch}',
            });
          }
          G.push({
            name: this.getResourceBundle().getText('PLANT_TABLE_COLUMN_TEXT'),
            value: '{oFrontend>Plant}',
          });
          if (s.BatchOnPlantVisible === true) {
            G.push({
              name: this.getResourceBundle().getText('BATCH_LABEL'),
              value: '{oFrontend>Batch}',
            });
          }
          G.push({
            name: this.getResourceBundle().getText('STORAGE_LOCATION_TABLE_COLUMN_TEXT'),
            value: '{oFrontend>StorageLocation}',
          });
          var K = new sap.viz.ui5.data.FlattenedDataset({
            dimensions: G,
            measures: [],
            data: { path: 'oFrontend>/Items' },
          });
          this._setVisibleMeasures2Dataset(K);
          A.setDataset(K);
          var L = C.getInstance();
          L.registerCustomFormatter('floatMinFraction3', function (R) {
            var U = sap.ui.core.format.NumberFormat.getFloatInstance({
              minFractionDigits: 3,
            });
            return U.format(R);
          });
          d.numericFormatter(L);
          A.setVizProperties({
            plotArea: {
              dataLabel: { visible: true, formatString: 'floatMinFraction3' },
            },
            legend: { title: { visible: false } },
            title: {
              visible: true,
              text: this.getResourceBundle().getText('STOCK_BY_PLANT_LABEL'),
            },
            interaction: { selectability: { mode: 'exclusive' } },
            valueAxis: {
              label: { unitFormatType: 'MetricUnits' },
              title: {
                text:
                  this.getResourceBundle().getText('REPORTING_DATE_TEXT', [
                    this.getView().byId('idReportingDate').getValue(),
                  ]) +
                  ' / ' +
                  this.getResourceBundle().getText('UNIT_OF_MEASURE_TEXT', [s.AlternativeUnit]),
              },
            },
          });
          var O = this._getPrimaryFeed();
          var Q = this._getFeedAxis();
          A.addFeed(O);
          A.addFeed(Q);
          this.oPopOver.connect(A.getVizUid());
        }
        requestAnimationFrame(() => this._toggleBusy(false));
        if (this._oPersonalizedDataContainer.hideEmptyRowsOnLoad == true) {
          this.getView()
            .byId('idPlantStorageLocationTable')
            .getBinding('items')
            .filter(new sap.ui.model.Filter('RowIsEmpty', sap.ui.model.FilterOperator.EQ, false));
        }
        if (I !== undefined) {
          this._setInitChartState(I);
        }
        if (sap.cp && sap.cp.ui.services && sap.cp.ui.services.CopilotApi) {
          sap.cp.ui.services.CopilotApi.getChats().then(function (R) {
            t._aCopilotChats = R;
          });
          this.getView().getModel('oFrontend').setProperty('/CopilotActive', true);
        }
      },
      _CheckEmptyRow: function (i) {
        var e = true;
        if (
          i.BlockedStockQuantity != 0 ||
          i.CurrentStock != 0 ||
          i.GoodsReceiptBlockedStockQty != 0 ||
          i.NonVltdGRBlockedStockQty != 0 ||
          i.QualityInspectionStockQuantity != 0 ||
          i.RestrictedStockQuantity != 0 ||
          i.ReturnsBlockedStockQuantity != 0 ||
          i.StockInTransitQuantity != 0 ||
          i.TiedEmptiesStockQuantity != 0 ||
          i.TransferStockPlantQuantity != 0 ||
          i.TransferStockStorageLocQty != 0
        ) {
          e = false;
        }
        if (i.PlantStorageLocationSpecial !== undefined) {
          $.each(i.PlantStorageLocationSpecial, function (k, o) {
            $.each(o, function (a, g) {
              $.each(g, function (K, v) {
                if (K === 'Quantity' && v != 0) {
                  e = false;
                }
              });
            });
          });
        }
        if (i.MaterialPlant2MatPlSpecial !== undefined) {
          $.each(i.MaterialPlant2MatPlSpecial, function (k, o) {
            $.each(o, function (a, g) {
              $.each(g, function (K, v) {
                if (K === 'Quantity' && v != 0) {
                  e = false;
                }
              });
            });
          });
        }
        return e;
      },
      _loadError: function (e) {
        this._setBtnEnablement(false);
        this._handleOdataError(e, this);
        var v = sap.ui.getCore().byId('idHistoryLineChart');
        if (v !== undefined) {
          v.setBusy(false);
        }
      },
      _isColumnAvailable: function (s) {
        var v = false;
        var i = 0;
        while (v === false && i < this._aColumnCollectionPrototype.length) {
          if (this._aColumnCollectionPrototype[i].key === s) {
            v = true;
          } else {
            i++;
          }
        }
        return v;
      },
      handleLoadAllPressed: function (e) {
        var m = this.getView().byId('MaterialInput').getValue();
        var a = this.getView().byId('idUnitOfMeasure').getValue();
        var r = this.getView().byId('idReportingDate').getValue();
        this._loadMaterial(m, a, r, {
          Plant: null,
          Batch: null,
          ExpandedItems: [],
        });
      },
      handleAUoMHelp: function (e) {
        var m = this.getView().byId('MaterialInput').getValue().toUpperCase();
        var t = this;
        var p = {};
        p.Material = m;
        this._oValueHelpController.displayValueHelpAUOM4Material(
          p,
          function (r) {
            t._handleValueHelpAUOMCallback(r);
          },
          t
        );
      },
      _handleValueHelpAUOMCallback: function (r) {
        var m = {};
        if (r.selected === true) {
          m = this.getView().getModel('oFrontend');
          m.setProperty('/AlternativeUnit', r.AUoM);
          var s = this.getView().byId('MaterialInput').getValue().toUpperCase();
          var a = r.AUoM;
          var R = this.getView().byId('idReportingDate').getValue();
          this._loadMaterial(s, a, R);
        }
      },
      handleTableSearch: function (e) {
        var j = this.getView().getModel('oFrontend').getData();
        var v = e.getParameter('query');
        var t = this.getView().byId('idPlantStorageLocationTable');
        var o = {};
        var a = [];
        var E = [];
        if (this._oPersonalizedDataContainer.hideEmptyRowsOnLoad === true) {
          E = new sap.ui.model.Filter('RowIsEmpty', sap.ui.model.FilterOperator.EQ, false);
        }
        if (v.length > 0) {
          a.push(new sap.ui.model.Filter('Plant', sap.ui.model.FilterOperator.Contains, v));
          a.push(new sap.ui.model.Filter('PlantName', sap.ui.model.FilterOperator.Contains, v));
          if (j.DefinitionOfBatchLevel !== '') {
            a.push(new sap.ui.model.Filter('Batch', sap.ui.model.FilterOperator.Contains, v));
          }
          o = new sap.ui.model.Filter(a, false);
          if (this._oPersonalizedDataContainer.hideEmptyRowsOnLoad === true) {
            var g = [];
            g.push(E);
            g.push(o);
            var h = new sap.ui.model.Filter(g, true);
            t.getBinding('items').filter(h);
          } else {
            t.getBinding('items').filter(o);
          }
        } else {
          t.getBinding('items').filter(E);
        }
      },
      handleToggleItem: function (e) {
        var p = e.getSource().data('Plant');
        var s = e.getSource().data('Batch');
        var j = this.getView().getModel('oFrontend').getData();
        var T = 0;
        var I = 0;
        var o = {};
        for (var t = 0; t < j.Items.length; t++) {
          if (j.Items[t].Plant === p && j.Items[t].Batch === s && j.Items[t].StorageLocationVisible === false) {
            T = t;
          }
        }
        if (j.Items[T].ButtonIcon === this._iconExpand) {
          j.Items[T].ButtonIcon = this._iconCollapse;
          j.Items[T].ButtonIconToolTip = this._iconCollapseToolTip;
          for (var i = 0; i < this._PlantStorageLocations[p + s].length; i++) {
            o = {};
            o.Plant = p;
            o.PlantName = '';
            o.Batch = s;
            o.BlockedStockQuantity = this._PlantStorageLocations[p + s][i].BlockedStockQuantity;
            o.CurrentStock = this._PlantStorageLocations[p + s][i].CurrentStock;
            o.GoodsReceiptBlockedStockQty = this._PlantStorageLocations[p + s][i].GoodsReceiptBlockedStockQty;
            o.NonVltdGRBlockedStockQty = this._PlantStorageLocations[p + s][i].NonVltdGRBlockedStockQty;
            o.QualityInspectionStockQuantity = this._PlantStorageLocations[p + s][i].QualityInspectionStockQuantity;
            o.RestrictedStockQuantity = this._PlantStorageLocations[p + s][i].RestrictedStockQuantity;
            o.ReturnsBlockedStockQuantity = this._PlantStorageLocations[p + s][i].ReturnsBlockedStockQuantity;
            o.StockInTransitQuantity = this._PlantStorageLocations[p + s][i].StockInTransitQuantity;
            o.TiedEmptiesStockQuantity = this._PlantStorageLocations[p + s][i].TiedEmptiesStockQuantity;
            o.TransferStockPlantQuantity = this._PlantStorageLocations[p + s][i].TransferStockPlantQuantity;
            o.TransferStockStorageLocQty = this._PlantStorageLocations[p + s][i].TransferStockStorageLocQty;
            o.StockInTransitQuantityVisible = this._PlantStorageLocations[p + s][i].StockInTransitQuantityVisible;
            o.TiedEmptiesStockQuantityVisible = this._PlantStorageLocations[p + s][i].TiedEmptiesStockQuantityVisible;
            o.TransferStockPlantQuantityVisible =
              this._PlantStorageLocations[p + s][i].TransferStockPlantQuantityVisible;
            o.GoodsReceiptBlockedStockQtyVisible =
              this._PlantStorageLocations[p + s][i].GoodsReceiptBlockedStockQtyVisible;
            o.NonVltdGRBlockedStockQtyVisible = this._PlantStorageLocations[p + s][i].NonVltdGRBlockedStockQtyVisible;
            o.RowIsEmpty = this._PlantStorageLocations[p + s][i].RowIsEmpty;
            o.StorageLocation = this._PlantStorageLocations[p + s][i].StorageLocation;
            o.StorageLocationName = this._PlantStorageLocations[p + s][i].StorageLocationName;
            o.WarehouseStorageBin = this._PlantStorageLocations[p + s][i].WarehouseStorageBin;
            o.ItemCounter = this._PlantStorageLocations[p + s][i].ItemCounter;
            o.HistoryData = this._aStockValuesStorageLocations[p + s][o.StorageLocation].HistoryData;
            if (this._historicStockValuesLoaded) {
              for (var q = 0; q < this._aColumnCollectionPrototype.length; q++) {
                o['chart' + this._aColumnCollectionPrototype[q].key] =
                  this._aStockValuesStorageLocations[p + s][o.StorageLocation][
                  'chart' + this._aColumnCollectionPrototype[q].key
                  ];
              }
              o.chartMaxYValue = this._aStockValuesStorageLocations[p + s][o.StorageLocation]['maxYValue'];
            }
            o.ButtonIcon = '';
            o.ButtonVisible = false;
            o.PlantVisible = false;
            o.StorageLocationVisible = true;
            o.SpecialBlockedStockQuantityVisible =
              this._PlantStorageLocations[p + s][i].SpecialBlockedStockQuantityVisible;
            o.SpecialCurrentStockVisible = this._PlantStorageLocations[p + s][i].SpecialCurrentStockVisible;
            o.SpecialGoodsReceiptBlockedStockQtyVisible =
              this._PlantStorageLocations[p + s][i].SpecialGoodsReceiptBlockedStockQtyVisible;
            o.SpecialNonVltdGRBlockedStockQtyVisible =
              this._PlantStorageLocations[p + s][i].SpecialNonVltdGRBlockedStockQtyVisible;
            o.SpecialQualityInspectionStockQuantityVisible =
              this._PlantStorageLocations[p + s][i].SpecialQualityInspectionStockQuantityVisible;
            o.SpecialRestrictedStockQuantityVisible =
              this._PlantStorageLocations[p + s][i].SpecialRestrictedStockQuantityVisible;
            o.SpecialReturnsBlockedStockQuantityVisible =
              this._PlantStorageLocations[p + s][i].SpecialReturnsBlockedStockQuantityVisible;
            o.SpecialStockInTransitQuantityVisible =
              this._PlantStorageLocations[p + s][i].SpecialStockInTransitQuantityVisible;
            o.SpecialTiedEmptiesStockQuantityVisible =
              this._PlantStorageLocations[p + s][i].SpecialTiedEmptiesStockQuantityVisible;
            o.SpecialTransferStockPlantQuantityVisible =
              this._PlantStorageLocations[p + s][i].SpecialTransferStockPlantQuantityVisible;
            o.SpecialTransferStockStorageLocQtyVisible =
              this._PlantStorageLocations[p + s][i].SpecialTransferStockStorageLocQtyVisible;
            o.PlantStorageLocationSpecial = this._PlantStorageLocations[p + s][i].PlantStorageLocationSpecial;
            j.Items.splice(++T, 0, o);
          }
        } else {
          j.Items[T].ButtonIcon = this._iconExpand;
          j.Items[T].ButtonIconToolTip = this._iconExpandToolTip;
          for (var i = 0; i < j.Items.length; i++) {
            if (j.Items[i].Plant === p && j.Items[i].Batch === s && j.Items[i].StorageLocationVisible === true) {
              I++;
            }
          }
          j.Items.splice(T + 1, I);
        }
        this.getView().getModel('oFrontend').setData(j);
      },
      handleSpecialStockLinkPressed: function (e) {
        var p = e.getSource().data('Plant');
        var s = e.getSource().data('StorageLocation');
        var S = e.getSource().data('StockType');
        if (!this._oPopover) {
          this._oPopover = sap.ui.xmlfragment('ui.s2p.mm.stock.overview.opt1.view.SpecialStockPopover', this);
          this.getView().addDependent(this._oPopover);
          this._oPopoverModel = new sap.ui.model.json.JSONModel();
          this._oPopoverModel.setDefaultBindingMode(sap.ui.model.BindingMode.OneWay);
          this._oPopover.setModel(this._oPopoverModel, 'SpecialStocks');
          jQuery.sap.syncStyleClass('sapUiSizeCompact', this.getView(), this._oPopover);
        }
        var a = [];
        if (s === '') {
          a = this._getSpecialStocksPlant4StockType(
            S,
            e.getSource().getParent().getBindingContext('oFrontend').getObject()
          );
        } else {
          a = this._getSpecialStocksStorageLocation4StockType(
            S,
            e.getSource().getParent().getBindingContext('oFrontend').getObject()
          );
        }
        var g = '';
        for (var i = 0; i < this._aColumnCollectionPrototype.length; i++) {
          if (this._aColumnCollectionPrototype[i].key === S) {
            g = this._aColumnCollectionPrototype[i].text;
          }
        }
        var n = sap.m.ListType.Navigation;
        if (this._isIntentSupported.MultipleStockAllowed === false) {
          n = sap.m.ListType.Inactive;
        }
        var h = '';
        if (this.getView().getModel('oFrontend').getProperty('/DefinitionOfBatchLevel') !== '') {
          h = e.getSource().data('Batch');
        }
        this._oPopoverModel.setData({
          SpecialStocks: a,
          StockTypeName: g,
          Plant: p,
          StorageLocation: s,
          Batch: h,
          StockType: S,
          Navigation2MultiStockEnabled: n,
        });
        this._oPopover.openBy(e.getSource());
      },
      handleCloseButton: function (e) {
        this._oPopover.close();
      },
      handleNav2MultiStockViaSpecialStockPressed: function (e) {
        var o = e.getSource().getBindingContext('SpecialStocks').getObject();
        var p = {
          Material: this.getView().getModel('oFrontend').getProperty('/Material'),
          Plant: this._oPopoverModel.getProperty('/Plant'),
        };
        if (this._oPopoverModel.getProperty('/StorageLocation') !== '') {
          p.StorageLocation = this._oPopoverModel.getProperty('/StorageLocation');
        }
        if (this._oPopoverModel.getProperty('/Batch') !== '') {
          p.Batch = this._oPopoverModel.getProperty('/Batch');
        }
        if (this.getView().byId('idReportingDate').getValue() !== '') {
          var r = this.getView().getModel('oFrontend').getProperty('/ReportingDate');
          var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
            pattern: 'yyyy-MM-dd',
            UTC: 'true',
          });
          p.CalendarDate = D.format(r);
        }
        p.InventorySpecialStockType = o.InventorySpecialStockType;
        var i = this._getInnerAppState();
        this._oNavigationService.navigate('Material', 'displayStockMultipleMaterials', p, i);
      },
      handlePersoButtonPressed: function (e) {
        if (!this._oPersDialog) {
          this._oPersDialog = sap.ui.xmlfragment('ui.s2p.mm.stock.overview.opt1.view.personalization', this);
          this.getView().addDependent(this._oPersDialog);
        }
        var p = new sap.ui.model.json.JSONModel();
        p.setData(JSON.parse(JSON.stringify(this._oPersonalizedDataContainer)));
        p.setProperty(
          '/personalizationEnabled',
          this.getView().getModel('oFrontend').getProperty('/personalizationEnabled')
        );
        this._oPersDialog.setModel(p);
        this._oPersDialog.open();
      },
      handlePersonalizationSave: function (e) {
        var m = this._oPersDialog.getModel();
        this._oPersonalizedDataContainer = m.getData();
        if (this._oPersonalizer) {
          var o = this.getView().getModel('oFrontend');
          o.setProperty('/personalizationEnabled', false);
          if (this._oPersonalizedDataContainer.hideChartColumnOnLoad) {
            o.setProperty('/StockHistoryVisible', false);
          } else {
            o.setProperty('/StockHistoryVisible', true);
          }
          if (!this._oPersonalizedDataContainer.hideEmptyColumnsOnLoad) {
            this._oPersonalizedDataContainer.ColumnCollection = JSON.parse(
              JSON.stringify(this._oPersonalizedDataContainer.loadedData)
            );
            this._transferColumn2Frontend(this._oPersonalizedDataContainer.ColumnCollection);
          } else {
            this._setHideEmptyColumns();
          }
          if (this._oPersonalizedDataContainer.hideEmptyRowsOnLoad === true) {
            this.getView()
              .byId('idPlantStorageLocationTable')
              .getBinding('items')
              .filter(new sap.ui.model.Filter('RowIsEmpty', sap.ui.model.FilterOperator.EQ, false));
          } else {
            this.getView().byId('idPlantStorageLocationTable').getBinding('items').filter([]);
          }
          if (!this._oPersonalizedDataContainer.hideChartColumnOnLoad) {
            this._updateMicroChart();
          }
          this._executePersonalizationSave();
          this._oPersDialog.close();
        }
      },
      _executePersonalizationSave: function () {
        var o = this.getView().getModel('oFrontend');
        var s = this._oPersonalizer
          .setPersData(this._oPersonalizedDataContainer)
          .done(function () {
            o.setProperty('/personalizationEnabled', true);
          })
          .fail(function () {
            jQuery.sap.log.error('Writing personalization data failed.');
            o.setProperty('/personalizationEnabled', true);
          });
      },
      _transferColumn2Frontend: function (a) {
        for (var i = 0; i < a.length; i++) {
          if (a[i].enabled === true) {
            this.getView()
              .getModel('oFrontend')
              .setProperty('/' + a[i].path, a[i].visible);
          }
        }
        var v = this.getView().byId('idStockOverviewStackedBar');
        if (v) {
          var D = v.getDataset();
          if (D != null) {
            this._setVisibleMeasures2Dataset(D);
            v.destroyFeeds();
            v.addFeed(this._getPrimaryFeed());
            v.addFeed(this._getFeedAxis());
          }
        }
      },
      _setHideEmptyColumns: function () {
        var a = this._oPersonalizedDataContainer.ColumnCollection;
        var I = this.getView().getModel('oFrontend').getProperty('/Items');
        var v;
        var i = 0;
        var s = '';
        for (var j = 0; j < a.length; j++) {
          if (a.path != 'StockHistoryVisible') {
            v = false;
            i = 0;
            s = a[j].path.substr(0, a[j].path.length - 7);
            while (i < I.length && v == false) {
              if (parseFloat(I[i][s]) != 0.0) {
                v = true;
              }
              i++;
            }
            a[j].visible = v;
            a[j].filledColumn = v;
          }
        }
        this._oPersonalizedDataContainer.ColumnCollection = a;
        this._transferColumn2Frontend(a);
      },
      _getVisibleColumnsMinusStockHistory: function () {
        var a = [];
        for (var i = 0; i < this._oPersonalizedDataContainer.ColumnCollection.length; i++) {
          if (
            this._oPersonalizedDataContainer.ColumnCollection[i].path !== 'StockHistoryVisible' &&
            this._oPersonalizedDataContainer.ColumnCollection[i].visible === true
          ) {
            a.push(this._oPersonalizedDataContainer.ColumnCollection[i]);
          }
        }
        return a;
      },
      _getVisibleColumnsInMicroChart: function () {
        var a = [];
        var I = [];
        for (var i = 0; i < this._oPersonalizedDataContainer.ColumnCollection.length; i++) {
          if (this._oPersonalizedDataContainer.ColumnCollection[i].path !== 'StockHistoryVisible') {
            if (this._oPersonalizedDataContainer.ColumnCollection[i].HistoryVisible === true) {
              a.push(this._oPersonalizedDataContainer.ColumnCollection[i]);
            } else {
              I.push(this._oPersonalizedDataContainer.ColumnCollection[i]);
            }
          }
        }
        return [a, I];
      },
      _getVisibleColumnsInHistoryChart: function () {
        var a = [];
        for (var i = 0; i < this._oPersonalizedDataContainer.ColumnCollection.length; i++) {
          if (
            this._oPersonalizedDataContainer.ColumnCollection[i].path !== 'StockHistoryVisible' &&
            this._oPersonalizedDataContainer.ColumnCollection[i].HistoryChartVisible === true
          ) {
            a.push(this._oPersonalizedDataContainer.ColumnCollection[i]);
          }
        }
        return a;
      },
      _updateMicroChart: function () {
        var i = this.getView().getModel('oFrontend').getProperty('/Items');
        this._updateMicroChartArray(i);
        this.getView().getModel('oFrontend').setProperty('/Items', i);
      },
      _updateMicroChartArray: function (i) {
        var m = this._getVisibleColumnsInMicroChart();
        for (var j = 0; j < i.length; j++) {
          i[j]['microchartTooltip'] = '';
          for (var k = 0; k < m[0].length; k++) {
            var a = this._convert2MicroChart(i[j].HistoryData[m[0][k].key]);
            i[j]['chart' + m[0][k].key] = a[0];
            i[j]['microchartTooltip'] = i[j]['microchartTooltip'] + '\n' + m[0][k].text + ':';
            i[j]['microchartTooltip'] += a[1];
          }
          for (var l = 0; l < m[1].length; l++) {
            i[j]['chart' + m[1][l].key] = [];
          }
        }
      },
      _setVisibleMeasures2Dataset: function (D) {
        D.destroyMeasures();
        var a = this._getVisibleColumnsMinusStockHistory();
        for (var i = 0; i < a.length; i++) {
          D.addMeasure(
            new sap.viz.ui5.data.MeasureDefinition({
              name: a[i].text,
              value: '{oFrontend>' + a[i].path.substr(0, a[i].path.length - 7) + '}',
            })
          );
        }
      },
      _getVisibleColumnTexts: function () {
        var a = [];
        var e = this._getVisibleColumnsMinusStockHistory();
        for (var i = 0; i < e.length; i++) {
          a.push(e[i].text);
        }
        return a;
      },
      _getPrimaryFeed: function () {
        return new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: 'primaryValues',
          type: 'Measure',
          values: this._getVisibleColumnTexts(),
        });
      },
      _getFeedAxis: function () {
        var v = [];
        if (this.getView().getModel('oFrontend').getProperty('/BatchOnMaterialVisible') === true) {
          v.push(this.getResourceBundle().getText('BATCH_LABEL'));
        }
        v.push(this.getResourceBundle().getText('PLANT_TABLE_COLUMN_TEXT'));
        if (this.getView().getModel('oFrontend').getProperty('/BatchOnPlantVisible') === true) {
          v.push(this.getResourceBundle().getText('BATCH_LABEL'));
        }
        v.push(this.getResourceBundle().getText('STORAGE_LOCATION_TABLE_COLUMN_TEXT'));
        return new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: 'axisLabels',
          type: 'Dimension',
          values: v,
        });
      },
      handlePersonalizationAbort: function (e) {
        this._oPersDialog.close();
      },
      handleColumnSettingsPressed: function (e) {
        if (!this._oColumnSettingsDialog) {
          this._oColumnSettingsDialog = sap.ui.xmlfragment('ui.s2p.mm.stock.overview.opt1.view.column_setting', this);
          this.getView().addDependent(this._oColumnSettingsDialog);
          jQuery.sap.syncStyleClass('sapUiSizeCompact', this.getView(), this._oColumnSettingsDialog);
        }
        var p = new sap.ui.model.json.JSONModel();
        p.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
        var P = {};
        P.ColumnCollection = [];
        if (this._oPersonalizedDataContainer.hideEmptyColumnsOnLoad) {
          for (var i = 0; i < this._oPersonalizedDataContainer.ColumnCollection.length; i++) {
            if (this._oPersonalizedDataContainer.ColumnCollection[i].filledColumn === true) {
              P.ColumnCollection.push(this._oPersonalizedDataContainer.ColumnCollection[i]);
            }
          }
        } else {
          P.ColumnCollection = this._oPersonalizedDataContainer.ColumnCollection;
        }
        p.setData(JSON.parse(JSON.stringify(P)));
        p.setProperty(
          '/personalizationEnabled',
          this.getView().getModel('oFrontend').getProperty('/personalizationEnabled')
        );
        this._oColumnSettingsDialog.setModel(p);
        var a = p.getProperty('/ColumnCollection');
        this._oColumnSettingsDialog.getButtons()[0].setEnabled(this._isColumnVisible(a));
        this._oColumnSettingsDialog.open();
      },
      handleColumnSettingsClose: function (e) {
        this._oColumnSettingsDialog.close();
      },
      handleColumnSettingsSelect: function (e) {
        var p = e.getSource().getBindingContext().getPath();
        if (e.getParameter('selected') === false) {
          e.getSource()
            .getBindingContext()
            .getModel()
            .setProperty(p + '/HistoryVisible', false);
          e.getSource()
            .getBindingContext()
            .getModel()
            .setProperty(p + '/HistoryEnabled', false);
        } else {
          if (
            e
              .getSource()
              .getBindingContext()
              .getModel()
              .getProperty(p + '/key') !== undefined
          ) {
            e.getSource()
              .getBindingContext()
              .getModel()
              .setProperty(p + '/HistoryEnabled', true);
          }
        }
        var a = e.getSource().getBindingContext().getModel().getProperty('/ColumnCollection');
        this._oColumnSettingsDialog.getButtons()[0].setEnabled(this._isColumnVisible(a));
      },
      _isColumnVisible: function (a) {
        var i = false;
        for (var j = 0; j < a.length; j++) {
          if (a[j].visible === true && a[j].path !== 'StockHistoryVisible') {
            i = true;
          }
        }
        return i;
      },
      handleColumnSettingsOk: function (e) {
        var r = false;
        var a = e.getSource().getModel().getProperty('/ColumnCollection');
        if (this._oPersonalizedDataContainer.hideEmptyColumnsOnLoad) {
          for (var i = 0; i < a.length; i++) {
            for (var j = 0; j < this._oPersonalizedDataContainer.ColumnCollection.length; j++) {
              if (this._oPersonalizedDataContainer.ColumnCollection[j].key === a[i].key) {
                this._oPersonalizedDataContainer.ColumnCollection[j].visible = a[i].visible;
                this._oPersonalizedDataContainer.ColumnCollection[j].enabled = a[i].enabled;
                this._oPersonalizedDataContainer.ColumnCollection[j].HistoryVisible = a[i].HistoryVisible;
              }
            }
          }
        } else {
          this._oPersonalizedDataContainer.ColumnCollection = a;
        }
        for (var i = 0; i < this._oPersonalizedDataContainer.ColumnCollection.length; i++) {
          if (this._oPersonalizedDataContainer.ColumnCollection[i].path === 'StockHistoryVisible') {
            if (
              this._oPersonalizedDataContainer.hideChartColumnOnLoad &&
              this._oPersonalizedDataContainer.ColumnCollection[i].visible
            ) {
              r = true;
            }
            this._oPersonalizedDataContainer.hideChartColumnOnLoad =
              !this._oPersonalizedDataContainer.ColumnCollection[i].visible;
          }
          this._oPersonalizedDataContainer.loadedData[i].visible =
            this._oPersonalizedDataContainer.ColumnCollection[i].visible;
          this._oPersonalizedDataContainer.loadedData[i].enabled =
            this._oPersonalizedDataContainer.ColumnCollection[i].enabled;
          this._oPersonalizedDataContainer.loadedData[i].HistoryVisible =
            this._oPersonalizedDataContainer.ColumnCollection[i].HistoryVisible;
        }
        this._transferColumn2Frontend(this._oPersonalizedDataContainer.ColumnCollection);
        if (r) {
          this._loadMaterial(
            this.getView().byId('MaterialInput').getValue(),
            this.getView().byId('idUnitOfMeasure').getValue(),
            this.getView().byId('idReportingDate').getValue()
          );
        } else if (!this._oPersonalizedDataContainer.hideChartColumnOnLoad) {
          this._updateMicroChart();
        }
        if (this._oPersonalizer) {
          this._executePersonalizationSave();
        }
        this._oColumnSettingsDialog.close();
      },
      handleColumnSettingsReset: function (e) {
        var a = e.getSource().getModel().getProperty('/ColumnCollection');
        for (var i = 0; i < a.length; i++) {
          a[i].visible = true;
        }
        e.getSource().getModel().setProperty('/ColumnCollection', a);
        this._oColumnSettingsDialog.close();
      },
      handleHistoryChartDisplay: function (e, I) {
        var a = e.getSource().getCustomData();
        // Case: Open first time
        var attachFunc = false;
        var fireEvent = false;
        if (!this.lightHistoryChart) {
          this.lightHistoryChart = new HistoryChartLight({
            caller: this
          });
          this.byId("dialogHostHistory").addItem(this.lightHistoryChart);
          this.lightHistoryChart.open();
          attachFunc = true;
          // Case: Personalization change
        } else if (this.lightHistoryChart.getVisible()) {
          this.lightHistoryChart.fireReady();
          this.lightHistoryChart.chartContainer.rerender();
          // Case: re-open
        } else {
          this.lightHistoryChart.open();
          attachFunc = true;
          fireEvent = true;
        }

        if (attachFunc) {
          this.lightHistoryChart.attachReady(function () {
            var p = sap.ui.getCore().byId('newChartContainerPopover');
            var v = sap.ui.getCore().byId('newVizFrame');
            v.destroyDataset().destroyFeeds();
            v.setVizType('line');
            v.setUiConfig({ applicationSet: 'fiori' });
            p.setActionItems();
            p.setCustomDataControl(null);
            p.connect(v.getVizUid());
            var P;
            var s;
            var S;
            P = a[0].getValue();
            s = a[1].getValue();
            S = a[2].getValue();
            var o = {};
            var g = this.getView().getModel('oFrontend').getProperty('/Items');
            for (var i = 0; i < g.length; i++) {
              if (g[i].Plant === P && g[i].Batch === s && g[i].StorageLocation === S) {
                o = g[i];
              }
            }
            var D = new sap.viz.ui5.data.FlattenedDataset({
              dimensions: [{ name: 'FiscalPeriod', value: '{FiscalPeriod}' }],
              measures: [],
              data: { path: '/HistoryData' },
            });
            var h = this._getVisibleColumnsInHistoryChart();
            var H = [];
            var j = {};
            var k = [];
            var n = '';
            var L = '';
            var q = '';
            var r = '';
            var t = '';
            if (o.StorageLocation === '') {
              if (s == '') {
                t = this.getResourceBundle().getText('TITLE_HISTORY_CHART_PLANT', [o.PlantName]);
              } else {
                t = this.getResourceBundle().getText('TITLE_HISTORY_CHART_PLANT_BATCH', [o.PlantName, s]);
              }
            } else {
              if (s == '') {
                t = this.getResourceBundle().getText('TITLE_HISTORY_CHART_STORAGE_LOCATION', [
                  o.PlantName,
                  o.StorageLocationName,
                ]);
              } else {
                t = this.getResourceBundle().getText('TITLE_HISTORY_CHART_STORAGE_LOCATION_BATCH', [
                  o.PlantName,
                  s,
                  o.StorageLocationName,
                ]);
              }
            }
            for (var l = 0; l < h.length; l++) {
              D.addMeasure(
                new sap.viz.ui5.data.MeasureDefinition({
                  name: h[l].text,
                  value: '{' + h[l].path.substr(0, h[l].path.length - 7) + '}',
                })
              );
              k.push('' + h[l].text);
            }
            for (var m = 0; m < 12; m++) {
              j = {};
              for (var l = 0; l < h.length; l++) {
                j[h[l].path.substr(0, h[l].path.length - 7)] = o.HistoryData[h[l].key][m].StockQuantity;
                j.FiscalPeriod = o.HistoryData[h[l].key][m].FiscalPeriod;
                j.FiscalYear = o.HistoryData[h[l].key][m].FiscalYear;
                if (m === 0) {
                  q = j.FiscalPeriod;
                  n = j.FiscalYear;
                }
                if (m === 11) {
                  r = j.FiscalPeriod;
                  L = j.FiscalYear;
                }
              }
              H.push(j);
            }
            var u = new sap.ui.model.json.JSONModel({
              HistoryData: H,
              Title: t,
              CopilotActive: this.getView().getModel('oFrontend').getProperty('/CopilotActive'),
              CopilotEnabled: false,
              Batch: s,
              StorageLocation: S,
              Plant: P,
            });
            if (this._aCopilotChats.length > 0) {
              u.setProperty('/CopilotEnabled', true);
            }
            v.setDataset(D);
            v.setModel(u);
            var w = {
              general: { layout: { padding: 0.04 } },
              valueAxis: {
                title: {
                  visible: true,
                  text: this.getResourceBundle().getText('YAXIS_HISTORY_CHART'),
                },
                label: { formatString: 'u' },
              },
              categoryAxis: {
                title: {
                  visible: true,
                  text: this.getResourceBundle().getText('XAXIS_HISTORY_CHART', [n, q, L, r]),
                },
              },
              plotArea: {
                dataLabel: { formatString: 'datalabelFormat', visible: false },
              },
              legend: { title: { visible: true } },
              title: { visible: false },
              interaction: { selectability: { mode: 'exclusive' } },
            };
            w.plotArea.referenceLine = { line: { valueAxis: [] } };
            if (o.StorageLocation == '') {
              if (this._oPersonalizedDataContainer.showSafetyStockQuantity) {
                w.plotArea.referenceLine.line.valueAxis.push({
                  value: parseFloat(o.SafetyStockQuantity),
                  label: {
                    text: this.getResourceBundle().getText('SAFETY_STOCK_LABEL'),
                    visible: true,
                  },
                });
              }
              if (this._oPersonalizedDataContainer.showMinimumSafetyStockQuantity) {
                w.plotArea.referenceLine.line.valueAxis.push({
                  value: parseFloat(o.MinimumSafetyStockQuantity),
                  label: {
                    text: this.getResourceBundle().getText('MINIMUM_SAFETY_STOCK_LABEL'),
                    visible: true,
                  },
                });
              }
            }
            v.setVizProperties(w);
            var x = new sap.viz.ui5.controls.common.feeds.FeedItem({
              uid: 'categoryAxis',
              type: 'Dimension',
              values: ['FiscalPeriod'],
            });
            v.addFeed(x);
            var y = new sap.viz.ui5.controls.common.feeds.FeedItem({
              uid: 'valueAxis',
              type: 'Measure',
              values: k,
            });
            v.addFeed(y);
            this.lightHistoryChart.setModel(u);
            var z = this;
            p.setCustomDataControl(function (Q) {
              return z._setCustomDataDayAndFiscalPeriodScreen(Q, z);
            });
            var A = sap.ui.getCore().byId('newChartContainer');
            A.setShowPersonalization(true);

            var E = this.getView().getModel('oFrontend');
            E.setProperty('/DrillDownState', 'FiscalPeriod');
            var G = sap.ui.getCore().byId('newDrillDown');
            var K = sap.ui.getCore().byId('newDrillUp');
            G.setEnabled(true);
            K.setEnabled(false);
            G.setTooltip();
            var T = sap.ui.getCore().byId('newDrillDownText');
            T.setVisible(false);
            if (I !== undefined) {
              this._setInitChartState(I);
            }
            var O = {};
            O.onAfterRendering = function () {
              this.focus();
              this.removeEventDelegate(O);
            }.bind(G);
            G.addEventDelegate(O);

          }.bind(this))
          attachFunc = false;
        }
        if (fireEvent) {
          this.lightHistoryChart.fireReady();
          fireEvent = false;
        }
      },
      handleHistoryChartClose: function (e) {
        this.lightHistoryChart.destroy();
      },
      onAddColumnsItem: function (e) {
        var a = e.getSource().getModel().getProperty('/ColumnCollection');
        var I = e.getParameters('newItem').newItem;
        var g = I.getIndex();
        var v = I.getVisible();
        var s = I.getColumnKey();
        var h = null;
        for (var i = 0; i < a.length; i++) {
          if (a[i].path == s) {
            h = i;
          }
        }
        if (g != undefined) {
          if (h !== null) {
            if (g == a.length - 1) {
              a.push(a[h]);
            } else {
              if (h - g == -1) {
                g++;
              }
              a.splice(g, 0, a[h]);
            }
            if (g < h) {
              a.splice(++h, 1);
            } else {
              a.splice(h, 1);
            }
          }
        } else {
          a[h].visible = v;
        }
        e.getSource().getModel().setProperty('/ColumnCollection', a);
      },
      handleTableSelectionChange: function (e) {
        var E;
        if (e.getParameters().selected === true) {
          var a = e.getSource().getSelectedContexts(true);
          this.getView().getModel('oFrontend').setProperty('/SelectedPlant', a[0].getObject('Plant'));
          this.getView()
            .getModel('oFrontend')
            .setProperty('/SelectedStorageLocation', a[0].getObject('StorageLocation'));
          this.getView().getModel('oFrontend').setProperty('/SelectedBatch', a[0].getObject('Batch'));
          E = true;
        } else {
          E = false;
        }
        this._setBtnEnablement(E);
      },
      handleBookmarkBeforePress: function () {
        var t = this;
        this._oNavigationService.storeInnerAppState(this._getInnerAppState()).done(function (a) {
          var e = '';
          e =
            (t.oCrossAppNav &&
              t.oCrossAppNav.hrefForExternal({
                target: {
                  semanticObject: 'Material',
                  action: 'displayStockOverview',
                },
                params: { 'sap-iapp-state': [a] },
              })) ||
            '';
          t.getView().byId('idButtonShareTile').setCustomUrl(e);
        });
      },
      _setBtnEnablement: function (e) {
        if (this._isIntentSupported.TransferStock === true) {
          this.getView().getModel('oFrontend').setProperty('/TransferStockEnabled', e);
        }
        if (this._isIntentSupported.ManageStock === true) {
          this.getView().getModel('oFrontend').setProperty('/ManageStockEnabled', e);
        }
        if (this._isIntentSupported.ManageMatDoc === true) {
          this.getView().getModel('oFrontend').setProperty('/ManageMatDocEnabled', e);
        }
        if (this._isIntentSupported.MultipleStockAllowed === true) {
          this.getView().getModel('oFrontend').setProperty('/MultipleStockEnabled', e);
        }
        if (this._isIntentSupported.transferStockCrossPlant === true) {
          this.getView().getModel('oFrontend').setProperty('/TransferStockCrossPlantEnabled', e);
        }
      },
      _getInnerAppState: function () {
        var s = { customData: {} };
        s.customData.Material = this.getModel('oFrontend').getProperty('/Material');
        s.customData.AlternativeUnit = this.getView().byId('idUnitOfMeasure').getValue();
        s.customData.ReportingDate = '';
        if (this.getView().byId('idReportingDate').getValue() !== '') {
          s.customData.ReportingDate = this.getView().byId('idReportingDate').getValue();
        }
        if (
          this._oComponentData &&
          this._oComponentData.startupParameters &&
          this._oComponentData.startupParameters.Plant
        ) {
          s.customData.Plant = this._oComponentData.startupParameters.Plant[0];
        }
        if (
          this._oComponentData &&
          this._oComponentData.startupParameters &&
          this._oComponentData.startupParameters.Batch
        ) {
          s.customData.Batch = this._oComponentData.startupParameters.Batch[0];
        }
        s.customData.ExpandedItems = [];
        var I = this.getModel('oFrontend').getProperty('/Items');
        var o;
        for (var i = 0; i < I.length; i++) {
          if (I[i].ButtonIcon === this._iconCollapse && I[i].StorageLocationVisible === false) {
            o = {};
            o.Plant = I[i].Plant;
            o.Batch = I[i].Batch;
            s.customData.ExpandedItems.push(o);
          }
        }
        var v = sap.ui.getCore().byId('idHistoryLineChart');
        if (v !== undefined && this._oHistoryChartDialog !== undefined && this._oHistoryChartDialog.isOpen() === true) {
          var h = v.getModel();
          var D = this.getModel('oFrontend').getProperty('/DrillDownState');
          s.customData.DrillDownState = D;
          s.customData.HistoryPlant = h.getProperty('/Plant');
          s.customData.HistoryStorageLocation = h.getProperty('/StorageLocation');
          s.customData.HistoryBatch = h.getProperty('/Batch');
          if (h.getProperty('/CalendarDate') !== undefined) {
            var a = sap.ui.core.format.DateFormat.getDateTimeInstance({
              pattern: 'dd.MM.yyyy',
            });
            var e = sap.ui.core.format.DateFormat.getDateTimeInstance({
              pattern: 'yyyy-MM-dd',
            });
            s.customData.HistoryCalendarDate = a.format(e.parse(h.getProperty('/CalendarDate')));
            s.customData.StockTypeKey = h.getProperty('/StockTypeKey');
          }
        }
        return s;
      },
      _setInnerAppState: function (s) { },
      _handleOdataError: function (e, t) {
        if (!t) {
          t = this;
        }
        t._toggleBusy(false);
        t.getView().getModel('message').fireMessageChange();
      },
      handleNav2TransferStock: function (e) {
        var p = {
          Material: this.getView().getModel('oFrontend').getProperty('/Material'),
          Plant: this.getView().getModel('oFrontend').getProperty('/SelectedPlant'),
        };
        if (this.getView().getModel('oFrontend').getProperty('/DefinitionOfBatchLevel') !== '') {
          p.Batch = this.getView().getModel('oFrontend').getProperty('/SelectedBatch');
        }
        var i = this._getInnerAppState();
        this._oNavigationService.navigate('Material', 'transferStock', p, i);
      },
      handleNav2TransferStockCrossPlant: function (e) {
        var p = {
          Material: this.getView().getModel('oFrontend').getProperty('/Material'),
        };
        var i = this._getInnerAppState();
        this._oNavigationService.navigate('Material', 'transferStockCrossPlant', p, i);
      },
      handleNav2ManageStock: function (e) {
        var p = {
          sap_mmim_apptype: 'manage',
          Material: this.getView().getModel('oFrontend').getProperty('/Material'),
          Plant: this.getView().getModel('oFrontend').getProperty('/SelectedPlant'),
        };
        if (this.getView().getModel('oFrontend').getProperty('/DefinitionOfBatchLevel') !== '') {
          p.Batch = this.getView().getModel('oFrontend').getProperty('/SelectedBatch');
        }
        var i = this._getInnerAppState();
        this._oNavigationService.navigate('Material', 'manageStock', p, i);
      },
      handleNav2MaterialDocuments: function (e) {
        var p = {
          Material: this.getView().getModel('oFrontend').getProperty('/Material'),
          Plant: this.getView().getModel('oFrontend').getProperty('/SelectedPlant'),
        };
        if (this.getView().getModel('oFrontend').getProperty('/SelectedStorageLocation') !== '') {
          p.StorageLocation = this.getView().getModel('oFrontend').getProperty('/SelectedStorageLocation');
        }
        if (
          this.getView().getModel('oFrontend').getProperty('/DefinitionOfBatchLevel') !== '' &&
          this.getView().getModel('oFrontend').getProperty('/SelectedBatch') !== ''
        ) {
          p.Batch = this.getView().getModel('oFrontend').getProperty('/SelectedBatch');
        }
        var i = this._getInnerAppState();
        this._oNavigationService.navigate('MaterialMovement', 'displayList', p, i);
      },
      handleNav2StockMultipleMaterials: function (e) {
        var p = {
          Material: this.getView().getModel('oFrontend').getProperty('/Material'),
          Plant: this.getView().getModel('oFrontend').getProperty('/SelectedPlant'),
        };
        if (this.getView().getModel('oFrontend').getProperty('/SelectedStorageLocation') !== '') {
          p.StorageLocation = this.getView().getModel('oFrontend').getProperty('/SelectedStorageLocation');
        }
        if (
          this.getView().getModel('oFrontend').getProperty('/DefinitionOfBatchLevel') !== '' &&
          this.getView().getModel('oFrontend').getProperty('/SelectedBatch') !== ''
        ) {
          p.Batch = this.getView().getModel('oFrontend').getProperty('/SelectedBatch');
        }
        if (this.getView().byId('idReportingDate').getValue() !== '') {
          var r = this.getView().getModel('oFrontend').getProperty('/ReportingDate');
          var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
            pattern: 'yyyy-MM-dd',
            UTC: 'true',
          });
          p.CalendarDate = D.format(r);
        }
        var i = this._getInnerAppState();
        this._oNavigationService.navigate('Material', 'displayStockMultipleMaterials', p, i);
      },
      handleDisplayMaterialLinkPress: function (e) {
        var p = {
          Material: this.getView().getModel('oFrontend').getProperty('/Material'),
        };
        var i = this._getInnerAppState();
        this._oNavigationService.navigate('Material', 'displayFactSheet', p, i);
      },
      _setLocalHash: function () {
        var h = sap.ui.core.routing.HashChanger.getInstance();
        var H = h.getHash();
        if (H.indexOf('key/') == -1) {
          H += 'key/' + this.getView().getModel('oFrontend').getProperty('/Material');
          h.replaceHash(H);
        }
      },
      _setMaterial2InputField: function (m) {
        var o = this.getView().byId('MaterialInput');
        o.setValue(m);
        o.fireChangeEvent(m);
      },
      _getSpecialStocksPlant4StockType: function (s, i) {
        var S = [];
        if (i.MaterialPlant2MatPlSpecial[s]) {
          S = i.MaterialPlant2MatPlSpecial[s];
        }
        return S;
      },
      _getSpecialStocksStorageLocation4StockType: function (s, S) {
        var a = [];
        if (S.PlantStorageLocationSpecial[s]) {
          a = S.PlantStorageLocationSpecial[s];
        }
        return a;
      },
      _supplementHistoryData: function (s) {
        var a = [];
        var e = {};
        var g = 0;
        var h = 0;
        for (var i = 0; i < s.length; i++) {
          if (a.length == 0) {
            a.push(s[i]);
          } else {
            while (j(s[i], a[a.length - 1]) == false) {
              e = {};
              e.StockQuantity = '0';
              g = parseInt(a[a.length - 1].FiscalPeriod);
              h = parseInt(a[a.length - 1].FiscalYear);
              if (g == 12) {
                g = 1;
                h++;
              } else {
                g++;
              }
              e.FiscalPeriod = '' + g;
              if (e.FiscalPeriod.length == 1) {
                e.FiscalPeriod = '0' + e.FiscalPeriod;
              }
              e.FiscalYear = '' + h;
              a.push(e);
            }
            a.push(s[i]);
          }
        }
        return a;
        function j(S, E) {
          if (parseInt(S.FiscalYear) == parseInt(E.FiscalYear)) {
            if (parseInt(S.FiscalPeriod) == parseInt(E.FiscalPeriod) + 1) {
              return true;
            } else {
              return false;
            }
          } else {
            if (
              parseInt(S.FiscalPeriod) == 1 &&
              parseInt(E.FiscalPeriod) == 12 &&
              parseInt(S.FiscalYear) == parseInt(E.FiscalYear) + 1
            ) {
              return true;
            } else {
              return false;
            }
          }
        }
      },
      _convert2MicroChart: function (h) {
        var H = [];
        var s = 0;
        var m = '';
        var i = {};
        for (var l = 0; l < h.length; l++) {
          s = Math.round(h[l].StockQuantity);
          i = { x: l, y: s };
          H.push(i);
          m += ' ' + i['y'].toString();
        }
        return [H, m];
      },
      _maxYValue: function (h, m) {
        var i = m;
        for (var l = 0; l < h.length; l++) {
          if (h[l].y > m) {
            i = h[l].y;
          }
        }
        return i;
      },
      concatenateNameIdFormatter: function (v, i) {
        if (v) {
          v = v + ' (' + i + ')';
          return v;
        } else {
          return null;
        }
      },
      handleExpandButtonPressed: function (e) {
        this.expandAllStorageLocations();
      },
      handleNavButtonPress: function (e) {
        window.history.back();
      },
      handleCollapseButtonPressed: function (e) {
        this.collapseAllStorageLocations(false);
      },
      expandAllStorageLocations: function () {
        var s = this.getView().getModel('oFrontend').getData();
        var I = {};
        var t = 0;
        for (var p in this._PlantStorageLocations) {
          for (var i = 0; i < s.Items.length; i++) {
            if (s.Items[i].Plant + s.Items[i].Batch === p) {
              if (s.Items[i].PlantVisible === true && s.Items[i].ButtonIcon === this._iconCollapse) {
                break;
              }
              if (s.Items[i].PlantVisible === true && s.Items[i].ButtonIcon === this._iconExpand) {
                t = i;
                s.Items[i].ButtonIcon = this._iconCollapse;
                s.Items[i].ButtonIconToolTip = this._iconCollapseToolTip;
                for (var j = 0; j < this._PlantStorageLocations[p].length; j++) {
                  I = {};
                  I.Plant = s.Items[i].Plant;
                  I.PlantName = s.Items[i].PlantName;
                  I.Batch = s.Items[i].Batch;
                  I.BlockedStockQuantity = this._PlantStorageLocations[p][j].BlockedStockQuantity;
                  I.CurrentStock = this._PlantStorageLocations[p][j].CurrentStock;
                  I.GoodsReceiptBlockedStockQty = this._PlantStorageLocations[p][j].GoodsReceiptBlockedStockQty;
                  I.NonVltdGRBlockedStockQty = this._PlantStorageLocations[p][j].NonVltdGRBlockedStockQty;
                  I.QualityInspectionStockQuantity = this._PlantStorageLocations[p][j].QualityInspectionStockQuantity;
                  I.RestrictedStockQuantity = this._PlantStorageLocations[p][j].RestrictedStockQuantity;
                  I.ReturnsBlockedStockQuantity = this._PlantStorageLocations[p][j].ReturnsBlockedStockQuantity;
                  I.StockInTransitQuantity = this._PlantStorageLocations[p][j].StockInTransitQuantity;
                  I.TiedEmptiesStockQuantity = this._PlantStorageLocations[p][j].TiedEmptiesStockQuantity;
                  I.TransferStockPlantQuantity = this._PlantStorageLocations[p][j].TransferStockPlantQuantity;
                  I.TransferStockStorageLocQty = this._PlantStorageLocations[p][j].TransferStockStorageLocQty;
                  I.StockInTransitQuantityVisible = this._PlantStorageLocations[p][j].StockInTransitQuantityVisible;
                  I.TiedEmptiesStockQuantityVisible = this._PlantStorageLocations[p][j].TiedEmptiesStockQuantityVisible;
                  I.TransferStockPlantQuantityVisible =
                    this._PlantStorageLocations[p][j].TransferStockPlantQuantityVisible;
                  I.GoodsReceiptBlockedStockQtyVisible =
                    this._PlantStorageLocations[p][j].GoodsReceiptBlockedStockQtyVisible;
                  I.NonVltdGRBlockedStockQtyVisible = this._PlantStorageLocations[p][j].NonVltdGRBlockedStockQtyVisible;
                  I.RowIsEmpty = this._PlantStorageLocations[p][j].RowIsEmpty;
                  I.StorageLocation = this._PlantStorageLocations[p][j].StorageLocation;
                  I.StorageLocationName = this._PlantStorageLocations[p][j].StorageLocationName;
                  I.WarehouseStorageBin = this._PlantStorageLocations[p][j].WarehouseStorageBin;
                  I.ItemCounter = this._PlantStorageLocations[p][j].ItemCounter;
                  I.ButtonIcon = '';
                  I.ButtonVisible = false;
                  I.PlantVisible = false;
                  I.StorageLocationVisible = true;
                  I.SpecialBlockedStockQuantityVisible =
                    this._PlantStorageLocations[p][j].SpecialBlockedStockQuantityVisible;
                  I.SpecialCurrentStockVisible = this._PlantStorageLocations[p][j].SpecialCurrentStockVisible;
                  I.SpecialGoodsReceiptBlockedStockQtyVisible =
                    this._PlantStorageLocations[p][j].SpecialGoodsReceiptBlockedStockQtyVisible;
                  I.SpecialNonVltdGRBlockedStockQtyyVisible =
                    this._PlantStorageLocations[p][j].SpecialNonVltdGRBlockedStockQtyyVisible;
                  I.SpecialQualityInspectionStockQuantityVisible =
                    this._PlantStorageLocations[p][j].SpecialQualityInspectionStockQuantityVisible;
                  I.SpecialRestrictedStockQuantityVisible =
                    this._PlantStorageLocations[p][j].SpecialRestrictedStockQuantityVisible;
                  I.SpecialReturnsBlockedStockQuantityVisible =
                    this._PlantStorageLocations[p][j].SpecialReturnsBlockedStockQuantityVisible;
                  I.SpecialStockInTransitQuantityVisible =
                    this._PlantStorageLocations[p][j].SpecialStockInTransitQuantityVisible;
                  I.SpecialTiedEmptiesStockQuantityVisible =
                    this._PlantStorageLocations[p][j].SpecialTiedEmptiesStockQuantityVisible;
                  I.SpecialTransferStockPlantQuantityVisible =
                    this._PlantStorageLocations[p][j].SpecialTransferStockPlantQuantityVisible;
                  I.SpecialTransferStockStorageLocQtyVisible =
                    this._PlantStorageLocations[p][j].SpecialTransferStockStorageLocQtyVisible;
                  I.PlantStorageLocationSpecial = this._PlantStorageLocations[p][j].PlantStorageLocationSpecial;
                  I.HistoryData = this._aStockValuesStorageLocations[p][I.StorageLocation].HistoryData;
                  if (this._historicStockValuesLoaded) {
                    for (var q = 0; q < this._aColumnCollectionPrototype.length; q++) {
                      I['chart' + this._aColumnCollectionPrototype[q].key] =
                        this._aStockValuesStorageLocations[p][I.StorageLocation][
                        'chart' + this._aColumnCollectionPrototype[q].key
                        ];
                    }
                    I.chartMaxYValue = this._aStockValuesStorageLocations[p][I.StorageLocation]['maxYValue'];
                  }
                  s.Items.splice(++t, 0, I);
                }
              }
            }
          }
        }
        this.getView().getModel('oFrontend').setData(s);
      },
      collapseAllStorageLocations: function () {
        var j = this.getView().getModel('oFrontend').getData();
        for (var i = 0; i < j.Items.length; i++) {
          if (j.Items[i].PlantVisible == true) {
            j.Items[i].ButtonIcon = this._iconExpand;
            j.Items[i].ButtonIconToolTip = this._iconExpandToolTip;
          }
          if (j.Items[i].StorageLocationVisible == true) {
            var I = {};
            I.Plant = j.Items[i].Plant;
            I.PlantName = j.Items[i].PlantName;
            I.PlantVisible = false;
            I.StorageLocation = j.Items[i].StorageLocation;
            I.StorageLocationName = j.Items[i].StorageLocationName;
            I.BlockedStockQuantity = j.Items[i].BlockedStockQuantity;
            I.CurrentStock = j.Items[i].CurrentStock;
            I.GoodsReceiptBlockedStockQty = j.Items[i].GoodsReceiptBlockedStockQty;
            I.NonVltdGRBlockedStockQty = j.Items[i].NonVltdGRBlockedStockQty;
            I.QualityInspectionStockQuantity = j.Items[i].QualityInspectionStockQuantity;
            I.RestrictedStockQuantity = j.Items[i].RestrictedStockQuantity;
            I.ReturnsBlockedStockQuantity = j.Items[i].ReturnsBlockedStockQuantity;
            I.StockInTransitQuantity = j.Items[i].StockInTransitQuantity;
            I.TiedEmptiesStockQuantity = j.Items[i].TiedEmptiesStockQuantity;
            I.TransferStockPlantQuantity = j.Items[i].TransferStockPlantQuantity;
            I.TransferStockStorageLocQty = j.Items[i].TransferStockStorageLocQty;
            j.Items.splice(i, 1);
            i--;
          }
        }
        this.getView().getModel('oFrontend').setData(j);
      },
      handleReportingDateChanged: function (e) {
        var m = this.getView().byId('MaterialInput').getValue().toUpperCase();
        var a = this.getView().byId('idUnitOfMeasure').getValue();
        var v = sap.ui.core.ValueState.None;
        if (e.getParameter('valid') === false) {
          v = sap.ui.core.ValueState.Error;
          e.getSource().setValueState(v);
        } else {
          e.getSource().setValueState(v);
          var r = e.getParameters().value;
          if (r !== '') {
            this.getView()
              .getModel('oFrontend')
              .setProperty('/selectedStockLabelText', this.getResourceBundle().getText('STOCK_BY_PLANT_LABEL'));
          } else {
            this.getView()
              .getModel('oFrontend')
              .setProperty('/selectedStockLabelText', this.getResourceBundle().getText('ACTUAL_STOCK_BY_PLANT_LABEL'));
          }
          var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
            pattern: 'dd.MM.yyyy',
            UTC: 'true',
          });
          this.getView().getModel('oFrontend').setProperty('/ReportingDate', D.parse(r));
          this._loadMaterial(m, a, r);
        }
      },
      handleViewSettingsDialogButtonPressed: function (e) {
        if (!this._oSettingsDialog) {
          this._oSettingsDialog = sap.ui.xmlfragment('ui.s2p.mm.stock.overview.opt1.view.settings', this);
          this.getView().addDependent(this._oSettingsDialog);
        }
        this._oSettingsDialog.open();
      },
      handleConfirm: function (e) {
        var v = this.getView();
        var t = v.byId('idPlantStorageLocationTable');
        var p = e.getParameters();
        var o = t.getBinding('items');
        var s = [];
        var P = p.sortItem.getKey();
        var D = p.sortDescending;
        s.push(new sap.ui.model.Sorter(P, D));
        s.push(new sap.ui.model.Sorter('ItemCounter', false));
        o.sort(s);
      },
    });
  }
);
