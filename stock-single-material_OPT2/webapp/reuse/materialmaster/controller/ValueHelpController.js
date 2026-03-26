/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define(
  [
    'sap/ui/core/mvc/Controller',
    'sap/ui/comp/valuehelpdialog/ValueHelpDialog',
    'sap/m/GroupHeaderListItem',
    'sap/m/MessageToast',
    'sap/ui/comp/filterbar/FilterBar',
    'sap/m/ColumnListItem',
    'sap/m/Label',
    'sap/m/SearchField',
    'sap/ui/model/Filter',
    'sap/ui/model/FilterOperator',
    'sap/ui/model/type/String',
    'sap/m/Token',
    'sap/ui/comp/providers/TokenParser',
  ],
  function (C, V, G, M, F, a, L, S, b, c, t, T, d) {
    'use strict';
    return C.extend('ui.s2p.mm.stock.overview.opt2.reuse.materialmaster.controller.ValueHelpController', {
      init: function (m) {
        if (m) {
          this._oModel = m;
        } else {
          this._oModel = new sap.ui.model.odata.ODataModel('/sap/opu/odata/sap/MMIM_MATERIAL_DATA_SRV', true);
        }
        this._oMaterialHelp = {};
        this._oAUOMHelp = {};
        this._oPlantHelp = {};
        this._oStorageLocationHelp = {};
        this.MaterialPlantBatch = {};
        this._i18n = new sap.ui.model.resource.ResourceModel({
          bundleUrl: jQuery.sap.getModulePath('ui.s2p.mm.stock.overview.opt2.reuse.materialmaster') + '/i18n/i18n.properties',
        });
        this._NumberFormatter = sap.ui.core.format.NumberFormat.getFloatInstance({ style: 'short' });
        //this.initMaterialGeneralValueHelpDialog();
      },
      initMaterialGeneralValueHelpDialog: function () {
        this.oMaterialGeneralValueHelpDialog = sap.ui.xmlfragment(
          'ui.s2p.mm.stock.overview.opt2.reuse.materialmaster.fragments.selectMaterial',
          this
        );
        //this.getView().addDependent(this.oMaterialGeneralValueHelpDialog);
        // Set basic search
        this.oMaterialGeneralValueHelpDialog.getFilterBar().setBasicSearch(
          new S({
            id: 'idSearch',
            value: '',
            showSearchButton: true,
            search: function (E) {
              if (!E.getParameter('clearButtonPressed')) {
                this.oMaterialGeneralValueHelpDialog.getFilterBar().search();
              }
            }.bind(this),
          })
        );

        // Set select material ID
        this.currentSelectMaterialId = {};
        var materialHeaders = [
          { label: this._i18n.getProperty('LABEL_MATERIAL_COL'), template: 'Material' },
          { label: this._i18n.getProperty('LABEL_MATERIALNAME_COL1'), template: 'MaterialName' },
          { label: this._i18n.getProperty('LABEL_BATCH_COL'), template: 'Batch' },
          { label: this._i18n.getProperty('LABEL_PLANT_COL'), template: 'Plant' },
          { label: this._i18n.getProperty('LABEL_PLANT_NAME_COL'), template: 'PlantName' },
          { label: this._i18n.getProperty('LABEL_MATERIALTYPE_COL'), template: 'MaterialType' },
          { label: this._i18n.getProperty('LABEL_MATERIALTYPENAME_COL1'), template: 'MaterialTypeName' },
          { label: this._i18n.getProperty('LABEL_PRODUCTHIERARCHY_COL'), template: 'ProductHierarchy' },
        ]

        // Initialize models
        var k = new sap.ui.model.json.JSONModel();
        k.setData({ cols: [...materialHeaders] })
        this.oMaterialGeneralValueHelpDialog.setModel(k, 'columns');
        this.oMaterialGeneralValueHelpDialog.setModel(this._i18n, 'i18n');
        this.oMaterialGeneralValueHelpDialog.setModel(this._oModel);

        this.oMaterialGeneralValueHelpDialog.attachAfterClose(function () {
          var h = this.oMaterialGeneralValueHelpDialog.getModel('columns');
          h.setData({ cols: [...materialHeaders] });
        }.bind(this))

        var I = this.oMaterialGeneralValueHelpDialog.getFilterBar().getFilterGroupItems();
        for (var i = 0; i < I.length; i++) {
          if (I[i].getVisibleInFilterBar() && I[i].getControl() instanceof sap.m.MultiInput) {
            this._addTokenValidator(I[i].getControl());
            if (sap.ui.Device.system.phone) {
              var _ = {
                onBeforeRendering: function () {
                  if (this.getValue()) {
                    this._validateCurrentText(true);
                  }
                },
              };
              I[i].getControl().addEventDelegate(_, I[i].getControl());
            }
          }
        }
      },
      exit: function () {
        if (this._oAUOMDialog) {
          this._oAUOMDialog.destroy();
        }
        if (this._oPlantDialog) {
          this._oPlantDialog.destroy();
        }
        if (this._oStorageLocationDialog) {
          this._oStorageLocationDialog.destroy();
        }
        if (this.oMaterialGeneralValueHelpDialog) {
          this.oMaterialGeneralValueHelpDialog.destroy();
        }
        this._oMaterialHelp = {};
        this._oAUOMHelp = {};
        this._oPlantHelp = {};
        this._oStorageLocationHelp = {};
        this.MaterialPlantBatch = {};
        this._oModel = null;
      },
      onMaterialFilterBarSearch: function (e) {
        var s = sap.ui.getCore().byId('idSearch');
        var f = s.getValue();
        var w = false;
        var v;
        var g = e.getParameter('selectionSet');
        var h = g.reduce(function (r, o) {
          if (o instanceof sap.m.MultiInput && o.getTokens().length > 0) {
            var I = [];
            var E = [];
            for (var i = 0; i < o.getTokens().length; i++) {
              var R = o.getTokens()[i].data().range;
              if (R.exclude) {
                if (R.operation === 'Empty') {
                  E.push(new b(R.keyField, c.NE, ''));
                } else {
                  E.push(new b(R.keyField, c.NE, R.value1));
                }
              } else {
                if (R.operation === 'Empty') {
                  I.push(new b(R.keyField, c.EQ, ''));
                } else {
                  if (R.operation !== c.BT) {
                    v = undefined;
                  } else {
                    v = R.value2;
                  }
                  I.push(new b(R.keyField, R.operation, R.value1, v));
                }
              }
            }
            if (I.length) {
              r.push(new b(I, false));
            }
            if (E.length) {
              r.push(new b(E, true));
            }
          } else if (o instanceof sap.m.CheckBox) {
            w = o.getSelected();
          }
          return r;
        }, []);
        this._bRebindTableForSearch(w, f, this._aSettingFilters.concat(h));
      },
      onFilterValueHelpRequested: function (e) {
        var m = e.getSource();
        var n = m.getName();
        var N = m.getLabels()[0].getText();
        var f = this;
        this._oFilterConditionTabValueHelp = new sap.ui.comp.valuehelpdialog.ValueHelpDialog({
          title: N,
          supportRanges: true,
          supportRangesOnly: true,
          displayFormat: m.getName().indexOf('Name') !== -1 ? '' : 'UpperCase',
          ok: function (E) {
            var g = E.getParameter('tokens');
            if (m.getValue()) {
              m.setValue('');
            }
            m.setTokens(g);
            f._oFilterConditionTabValueHelp.close();
          },
          cancel: function () {
            f._oFilterConditionTabValueHelp.close();
          },
          afterClose: function () {
            f._oFilterConditionTabValueHelp.destroy();
          },
        });
        this._oFilterConditionTabValueHelp.setRangeKeyFields([
          { label: N, key: n, type: 'string', typeInstance: new t() },
        ]);
        this._oFilterConditionTabValueHelp.setTokens(m.getTokens());
        this._oFilterConditionTabValueHelp.open();
      },
      _addTokenValidator: function (m) {
        var o = new d();
        o.addKeyField({
          key: m.getName(),
          label: m.getName(),
          type: 'string',
          displayFormat: m.getName().indexOf('Name') !== -1 ? '' : 'UpperCase',
        });
        o.setDefaultOperation('EQ');
        o.associateInput(m);
      },
      _getMaterialValueHelpSettingFilters: function (p) {
        var s = p.Plant || '';
        var f = [];
        if (s.length > 0) {
          f.push(new sap.ui.model.Filter('Plant', sap.ui.model.FilterOperator.EQ, s));
        }
        if (p.BatchWithoutDeletionFlag) {
          var B = [];
          B.push(new sap.ui.model.Filter('BatchIsMarkedForDeletion', sap.ui.model.FilterOperator.EQ, false));
          B.push(new sap.ui.model.Filter('BatIsMrkdForDeltnInPlnt', sap.ui.model.FilterOperator.EQ, false));
          var o = new sap.ui.model.Filter({ filters: B, and: true });
          f.push(o);
        }
        if (p.BatchNotExpired) {
          var e = [];
          var g = new Date();
          var D = sap.ui.core.format.DateFormat.getDateTimeInstance({ pattern: 'yyyy-MM-dd' });
          var P = [];
          P.push(new sap.ui.model.Filter('ShelfLifeExpirationDate', sap.ui.model.FilterOperator.LT, '1900-01-01'));
          P.push(new sap.ui.model.Filter('ShelfLifeExpirationDate', sap.ui.model.FilterOperator.GE, D.format(g)));
          var h = new sap.ui.model.Filter({ filters: P, and: false });
          e.push(h);
          var r = [];
          r.push(new sap.ui.model.Filter('RootBatShelfLifeExprtnDte', sap.ui.model.FilterOperator.LT, '1900-01-01'));
          r.push(new sap.ui.model.Filter('RootBatShelfLifeExprtnDte', sap.ui.model.FilterOperator.GE, D.format(g)));
          var R = new sap.ui.model.Filter({ filters: r, and: false });
          e.push(R);
          f.push(new sap.ui.model.Filter({ filters: e, and: true }));
        }
        return f;
      },
      displayValueHelpMaterialGeneral: function (p, f) {
        var r = {};
        var s = p.Material || '';
        var e = p.SupplierDataOfMaterial && true;
        var g = s || '';
        this._aSettingFilters = this._getMaterialValueHelpSettingFilters(p);
        this.oMaterialGeneralValueHelpDialog.attachOk(
          function (l) {
            this.currentSelectMaterialId = l.getParameter('tokens')[0]
            requestAnimationFrame(function () {
              var l = this.currentSelectMaterialId;
              var R = l.data();
              this.oMaterialGeneralValueHelpDialog.close();
              var n = R.row.Material;
              var q = R.row.MaterialName;
              var B = R.row.Batch;
              var u = R.row.Plant;
              var v = R.row.PlantName;
              if (n) {
                r = {};
                r.selected = true;
                r.Material = n;
                r.MaterialName = q;
                r.Batch = B;
                r.Plant = u;
                r.PlantName = v;
                f(r);
              } else {
                r = {};
                r.selected = false;
                f(r);
              }
            }.bind(this))
          }.bind(this)
        );
        this.oMaterialGeneralValueHelpDialog.attachCancel(
          function (E) {
            requestAnimationFrame(function () {
              this.oMaterialGeneralValueHelpDialog.close();
              r = {};
              r.selected = false;
              f(r);
            }.bind(this))
          }.bind(this)
        );
        var bs = sap.ui.getCore().byId(
          this.oMaterialGeneralValueHelpDialog.getFilterBar().getBasicSearch()
        )
        if (bs.getValue() != g) {
          bs.setValue(g);
        }
        if (e) {
          var h = this.oMaterialGeneralValueHelpDialog.getModel('columns');
          var x = h.getProperty('/cols');
          x.push({ label: this._i18n.getProperty('LABEL_SUP_COL'), template: 'Supplier' });
          x.push({ label: this._i18n.getProperty('LABEL_SUP_NAME_COL'), template: 'SupplierName' });
          h.setData({ cols: x });
        } else {
          var o = sap.ui.getCore().byId('idSupplierFilter');
          o.setVisibleInFilterBar(false);
        }
        if (p.Plant) {
          var P = sap.ui.getCore().byId('idPlantFilter');
          var j = sap.ui.getCore().byId('idPlantNameFilter');
          P.setVisibleInFilterBar(false);
          j.setVisibleInFilterBar(false);
        }
        if (g) {
          this._bRebindTableForSearch(false, g, this._aSettingFilters);
        }
        requestAnimationFrame(() => this.oMaterialGeneralValueHelpDialog.open());
      },
      _bRebindTableForSearch: function (u, s, f) {
        var p = {};
        var m = '/I_InvtryMgmtMatlMstrVH';
        var A = '';
        if (u) {
          m = '/I_InvtryMgmtSuplrInfoRecdVH';
        }
        var o = this.oMaterialGeneralValueHelpDialog.getTable();
        var e = this.oMaterialGeneralValueHelpDialog.getModel('columns').getProperty('/cols');
        if (o.bindRows) {
          A = 'rows';
        }
        if (o.bindItems) {
          A = 'items';
        }
        if (s) {
          p.custom = { search: s };
        }
        if (o.bindRows) {
          o.bindAggregation(A, { path: m, parameters: p, filters: f });
          var B = o.getBinding('rows');
          var g = function () {
            var r = /\((.+?)\)/g;
            var h = o.getTitle().getText();
            var i;
            if (r.test(h)) {
              i = h.replace(r, '(' + B.getLength() + ')');
            } else {
              i = h + ' (' + B.getLength() + ')';
            }
            o.setTitle(i);
            B.detachChange(g);
          };
          B.attachChange(g);
        }
        if (o.bindItems) {
          o.setFixedLayout(false);
          o.bindAggregation(A, {
            path: m,
            factory: function () {
              return new a({
                cells: e.map(function (h) {
                  return new L({ text: '{' + h.template + '}' });
                }),
              });
            },
            parameters: p,
            filters: f,
          });
        }
        o.setBusy(true);
        o.getBinding(A).attachDataReceived(function (D) {
          if (D.getParameter('data') && D.getParameter('data').results.length === 0) {
            this.oMaterialGeneralValueHelpDialog.TableStateDataFilled();
          }
          o.setBusy(false);
        }, this);
      },
      displayValueHelpPlant4Material: function (p, f, o) {
        var r = {};
        var e = this;
        var g = function confirmFunction(E) {
          r = {};
          r.selected = true;
          var j = E.getParameter('selectedContexts');
          if (j.length) {
            r.Plant = j[0].getObject().Plant;
            r.PlantName = j[0].getObject().PlantName;
          }
          E.getSource().getBinding('items').filter([]);
          e._oPlantDialog.detachConfirm(g);
          e._oPlantDialog.detachCancel(h);
          f.call(o, r);
        };
        var h = function cancelFunction(E) {
          E.getSource().getBinding('items').filter([]);
          r = {};
          r.selected = false;
          e._oPlantDialog.detachConfirm(g);
          e._oPlantDialog.detachCancel(h);
          f.call(o, r);
        };
        if (!this._oPlantDialog) {
          this._oPlantDialog = sap.ui.xmlfragment('ui.s2p.mm.stock.overview.opt2.reuse.materialmaster.fragments.selectPlant', this);
          this._oPlantDialog.setModel(this._i18n, 'i18n');
          o.getView().addDependent(this._oPlantDialog);
          jQuery.sap.syncStyleClass('sapUiSizeCompact', o.getView(), this._oPlantDialog);
        }
        this._oPlantDialog.attachConfirm(g);
        this._oPlantDialog.attachCancel(h);
        if (!this._oPlantHelp[p.Material]) {
          this._oPlantHelp[p.Material] = new sap.ui.model.json.JSONModel({ PlantCollection: [] });
          var i = [];
          i.push(new sap.ui.model.Filter('Material', sap.ui.model.FilterOperator.EQ, p.Material));
          this._oModel.read('/MaterialPlantHelps', {
            filters: i,
            success: jQuery.proxy(this._successPlantLoad, this, p),
            error: jQuery.proxy(this._loadError, this, null),
          });
        }
        this._oPlantDialog.setModel(this._oPlantHelp[p.Material], 'oPlantCollection');
        this._oPlantDialog.open();
      },
      displayValueHelpAUOM4Material: function (p, f, o) {
        var r = {};
        var e = this;
        var g = function confirmFunction(E) {
          r = {};
          r.selected = true;
          var j = E.getParameter('selectedContexts');
          if (j.length) {
            r.AUoM = j[0].getObject().AUoM;
            r.AUoMName = j[0].getObject().AUoMName;
            r.Numerator = j[0].getObject().Numerator;
            r.Denominator = j[0].getObject().Denominator;
            r.IsDerived = j[0].getObject().IsDerived;
            r.BaseUnit = j[0].getObject().BaseUnit;
            r.IsBaseUnit = j[0].getObject().IsBaseUnit;
          }
          E.getSource().getBinding('items').filter([]);
          e._oAUOMDialog.detachConfirm(g);
          e._oAUOMDialog.detachCancel(h);
          f.call(o, r);
        };
        var h = function cancelFunction(E) {
          E.getSource().getBinding('items').filter([]);
          r = {};
          r.selected = false;
          e._oAUOMDialog.detachConfirm(g);
          e._oAUOMDialog.detachCancel(h);
          f.call(o, r);
        };
        if (!this._oAUOMDialog) {
          this._oAUOMDialog = sap.ui.xmlfragment('ui.s2p.mm.stock.overview.opt2.reuse.materialmaster.fragments.selectAUoM', this);
          this._oAUOMDialog.setModel(this._i18n, 'i18n');
          o.getView().addDependent(this._oAUOMDialog);
          jQuery.sap.syncStyleClass('sapUiSizeCompact', o.getView(), this._oAUOMDialog);
        }
        this._oAUOMDialog.attachConfirm(g);
        this._oAUOMDialog.attachCancel(h);
        if (!this._oAUOMHelp[p.Material]) {
          this._oAUOMHelp[p.Material] = new sap.ui.model.json.JSONModel({ AUoMCollection: [] });
          this._oAUOMHelp[p.Material].setProperty('/GroupingIsRequiredForUoM', false);
          var i = [];
          i.push(new sap.ui.model.Filter('Material', sap.ui.model.FilterOperator.EQ, p.Material));
          this._oModel.read('/MaterialAuoms', {
            filters: i,
            success: jQuery.proxy(this._successAUOMLoad, this, p),
            error: jQuery.proxy(this._loadError, this, null),
          });
        }
        this._oAUOMDialog.setModel(this._oAUOMHelp[p.Material], 'oAUoMCollection');
        this._sortAUOMs(this._oAUOMHelp[p.Material].getProperty('/GroupingIsRequiredForUoM'));
        this._oAUOMDialog.open();
      },
      displayValueHelpStorageLocation4Material: function (p, f, o) {
        var r = [];
        var e = this;
        var g = function confirmFunction(E) {
          var l = E.getParameter('selectedContexts');
          if (l.length) {
            for (var i = 0; i < l.length; i++) {
              r.push({
                selected: true,
                Plant: l[i].getObject().Plant,
                PlantName: l[i].getObject().PlantName,
                StorageLocation: l[i].getObject().StorageLocation,
                StorageLocationName: l[i].getObject().StorageLocationName,
                StorageBin: l[i].getObject().WarehouseStorageBin,
                BlockedStockQuantity: l[i].getObject().BlockedStockQuantity,
                CurrentStock: l[i].getObject().CurrentStock,
                QualityInspectionStockQuantity: l[i].getObject().QualityInspectionStockQuantity,
                ReturnsBlockedStockQuantity: l[i].getObject().ReturnsBlockedStockQuantity,
                TransferStockStorageLocQty: l[i].getObject().TransferStockStorageLocQty,
                RestrictedStockQuantity: l[i].getObject().RestrictedStockQuantity,
                InventorySpecialStockType: {},
              });
            }
          }
          e._oStorageLocationDialog.detachConfirm(g);
          e._oStorageLocationDialog.detachCancel(h);
          if (p.AllowMultipleSelection) {
            var A = E.getParameter('selectedItems').length === E.getSource().getItems().length;
            var D = E.getSource().getAggregation('_dialog');
            var s = D && D.getSubHeader() && D.getSubHeader().getContentMiddle()[0].getValue() === '';
            f.call(o, r, A && s);
          } else {
            f.call(o, r[0]);
          }
        };
        var h = function cancelFunction(E) {
          E.getSource().getBinding('items').filter([]);
          e._oStorageLocationDialog.detachConfirm(g);
          e._oStorageLocationDialog.detachCancel(h);
          f.call(o, { selected: false });
        };
        if (!this._oStorageLocationDialog) {
          this._oStorageLocationDialog = sap.ui.xmlfragment(
            'ui.s2p.mm.stock.overview.opt2.reuse.materialmaster.fragments.selectStorageLocation',
            this
          );
          this._oStorageLocationDialog.setModel(this._i18n, 'i18n');
          o.getView().addDependent(this._oStorageLocationDialog);
          jQuery.sap.syncStyleClass('sapUiSizeCompact', o.getView(), this._oStorageLocationDialog);
        }
        var m = sap.ui.getCore().byId('idStockChart');
        m.removeAllData();
        for (var j = 0; j < p.DisplayedStockTypes.length; j++) {
          m.addData(
            new sap.suite.ui.microchart.ComparisonMicroChartData({
              color: 'Good',
              displayValue: '{oStorageLocationCollection>' + p.DisplayedStockTypes[j] + '_Dis' + '}',
              value: '{oStorageLocationCollection>' + p.DisplayedStockTypes[j] + '_Int' + '}',
              title: '{i18n>STORAGELOCATION_VALUE_HELP_CHART_TITLE_' + p.DisplayedStockTypes[j].toUpperCase() + '}',
            })
          );
        }
        this._oStorageLocationDialog.attachConfirm(g);
        this._oStorageLocationDialog.attachCancel(h);
        this.fillBufferForMaterialStorLocHelps(p);
        if (p.StartBatch) {
          if (this.MaterialPlantBatch[p.Material][p.Plant]) {
            var k = this._getMinMaxOfDisplayedStocks(
              this.MaterialPlantBatch[p.Material][p.Plant][p.StartBatch].getProperty('/StorageLocationCollection'),
              p.DisplayedStockTypes
            );
            this.MaterialPlantBatch[p.Material][p.Plant][p.StartBatch].setProperty('/minValue', k.minValue);
            this.MaterialPlantBatch[p.Material][p.Plant][p.StartBatch].setProperty('/maxValue', k.maxValue);
            this._oStorageLocationDialog.setModel(
              this.MaterialPlantBatch[p.Material][p.Plant][p.StartBatch],
              'oStorageLocationCollection'
            );
          } else {
            var k = this._getMinMaxOfDisplayedStocks(
              this.MaterialPlantBatch[p.Material][p.Plant]['Derived'].getProperty('/StorageLocationCollection'),
              p.DisplayedStockTypes
            );
            this.MaterialPlantBatch[p.Material][p.Plant]['Derived'].setProperty('/minValue', k.minValue);
            this.MaterialPlantBatch[p.Material][p.Plant]['Derived'].setProperty('/maxValue', k.maxValue);
            this._oStorageLocationDialog.setModel(
              this.MaterialPlantBatch[p.Material][p.Plant]['Derived'],
              'oStorageLocationCollection'
            );
          }
        } else if (p.TargetBatch) {
          if (this.MaterialPlantBatch[p.Material][p.Plant][p.TargetBatch]) {
            var k = this._getMinMaxOfDisplayedStocks(
              this.MaterialPlantBatch[p.Material][p.Plant][p.TargetBatch].getProperty('/StorageLocationCollection'),
              p.DisplayedStockTypes
            );
            this.MaterialPlantBatch[p.Material][p.Plant][p.TargetBatch].setProperty('/minValue', k.minValue);
            this.MaterialPlantBatch[p.Material][p.Plant][p.TargetBatch].setProperty('/maxValue', k.maxValue);
            this._oStorageLocationDialog.setModel(
              this.MaterialPlantBatch[p.Material][p.Plant][p.TargetBatch],
              'oStorageLocationCollection'
            );
          } else {
            var k = this._getMinMaxOfDisplayedStocks(
              this.MaterialPlantBatch[p.Material][p.Plant]['Derived'].getProperty('/StorageLocationCollection'),
              p.DisplayedStockTypes
            );
            this.MaterialPlantBatch[p.Material][p.Plant]['Derived'].setProperty('/minValue', k.minValue);
            this.MaterialPlantBatch[p.Material][p.Plant]['Derived'].setProperty('/maxValue', k.maxValue);
            this._oStorageLocationDialog.setModel(
              this.MaterialPlantBatch[p.Material][p.Plant]['Derived'],
              'oStorageLocationCollection'
            );
          }
        } else {
          var k = this._getMinMaxOfDisplayedStocks(
            this._oStorageLocationHelp[p.Material][p.Plant].getProperty('/StorageLocationCollection'),
            p.DisplayedStockTypes
          );
          this._oStorageLocationHelp[p.Material][p.Plant].setProperty('/minValue', k.minValue);
          this._oStorageLocationHelp[p.Material][p.Plant].setProperty('/maxValue', k.maxValue);
          this._oStorageLocationDialog.setModel(
            this._oStorageLocationHelp[p.Material][p.Plant],
            'oStorageLocationCollection'
          );
        }
        this._sortStorageLocations(
          this._oStorageLocationHelp[p.Material][p.Plant].getProperty('/GroupingIsRequiredForStorageLocation')
        );
        if (p.ShowStandardLocationOnly === true) {
          this._oStorageLocationDialog
            .getBinding('items')
            .filter(new sap.ui.model.Filter('StorLocAutoCreationIsAllowed', sap.ui.model.FilterOperator.EQ, false));
        } else if (p.ShowDeriveLocationOnly === true) {
          this._oStorageLocationDialog
            .getBinding('items')
            .filter(new sap.ui.model.Filter('StorLocAutoCreationIsAllowed', sap.ui.model.FilterOperator.EQ, true));
        } else {
          this._oStorageLocationDialog.getBinding('items').filter();
        }
        if (p.AllowMultipleSelection) {
          this._oStorageLocationDialog.setMultiSelect(true);
          if (p.ShowDeriveLocationOnly === true) {
            p.filters.push(
              new sap.ui.model.Filter('StorLocAutoCreationIsAllowed', sap.ui.model.FilterOperator.EQ, true)
            );
          }
          this._oStorageLocationFilters = p.filters;
          if (p.filters.length > 0) {
            this._oStorageLocationDialog
              .getBinding('items')
              .filter(new sap.ui.model.Filter({ filters: p.filters, and: true }));
          }
        }
        this._oStorageLocationDialog.open();
      },
      fillBufferForMaterialStorLocHelps: function (p) {
        var e = this;
        if (p.resetBuffer && p.resetBuffer === true) {
          this._oStorageLocationHelp = {};
          this.MaterialPlantBatch = {};
        }
        if (!this._oStorageLocationHelp[p.Material]) {
          this._oStorageLocationHelp[p.Material] = {};
        }
        if (p.MaterialIsBatchManaged === true) {
          if (!this.MaterialPlantBatch[p.Material]) {
            this.MaterialPlantBatch[p.Material] = {};
          }
          if (!this.MaterialPlantBatch[p.Material][p.Plant]) {
            this.MaterialPlantBatch[p.Material][p.Plant] = {};
          }
          var B;
          if (p.StartBatch) {
            B = p.StartBatch;
          } else {
            B = p.TargetBatch;
          }
        }
        this._oStorageLocationHelp[p.Material][p.Plant] = new sap.ui.model.json.JSONModel({
          StorageLocationCollection: [],
        });
        this._oStorageLocationHelp[p.Material][p.Plant].setProperty('/GroupingIsRequiredForStorageLocation', false);
        if (p.MaterialIsBatchManaged === true && B) {
          this.MaterialPlantBatch[p.Material][p.Plant][B] = new sap.ui.model.json.JSONModel({
            StorageLocationCollection: [],
          });
        }
        var f = [];
        f.push(new sap.ui.model.Filter('Material', sap.ui.model.FilterOperator.EQ, p.Material));
        f.push(new sap.ui.model.Filter('Plant', sap.ui.model.FilterOperator.EQ, p.Plant));
        if (p.MaterialIsBatchManaged !== undefined) {
          f.push(
            new sap.ui.model.Filter('MaterialIsBatchManaged', sap.ui.model.FilterOperator.EQ, p.MaterialIsBatchManaged)
          );
        }
        if (p.StorLocAutoCreationIsAllowed !== undefined) {
          f.push(
            new sap.ui.model.Filter(
              'StorLocAutoCreationIsAllowed',
              sap.ui.model.FilterOperator.EQ,
              p.StorLocAutoCreationIsAllowed
            )
          );
        } else {
          f.push(new sap.ui.model.Filter('StorLocAutoCreationIsAllowed', sap.ui.model.FilterOperator.EQ, false));
        }
        var P = new Promise(function (r, g) {
          e._oModel.read('/MaterialStorLocHelps', {
            filters: f,
            success: jQuery.proxy(e._successStorageLocationLoad, e, p, r),
            error: jQuery.proxy(e._loadError, e, g),
          });
        });
        return P;
      },
      fillBufferForMaterialExpanded: function (m, p, o) {
        if (!this._oMaterialHelp[m.Material]) {
          var f = [];
          f.push(new sap.ui.model.Filter('Material', sap.ui.model.FilterOperator.EQ, m.Material));
          var e = 'Material2Auoms,Material2PlantsHelps/MaterialPlant2StorLocsHelps';
          this._oModel.read('/MaterialHeaders', {
            urlParameters: { $expand: e },
            filters: f,
            success: jQuery.proxy(this._successMaterialExpandedLoad, this, m, p, o),
            error: jQuery.proxy(this._loadError, this, null),
          });
        }
      },
      getBufferOfMaterial: function (m) {
        var r = {};
        if (this._oMaterialHelp[m]) {
          r.Material = JSON.parse(JSON.stringify(this._oMaterialHelp[m].getData()));
        }
        if (this._oPlantHelp[m]) {
          r.Plant = JSON.parse(JSON.stringify(this._oPlantHelp[m].getData()));
        }
        if (this._oAUOMHelp[m]) {
          r.AUoM = JSON.parse(JSON.stringify(this._oAUOMHelp[m].getData()));
        }
        if (r.Plant) {
          r.StorageLocation = {};
          for (var i = 0; i < r.Plant.PlantCollection.length; i++) {
            r.StorageLocation[r.Plant.PlantCollection[i].Plant] = {};
            r.StorageLocation[r.Plant.PlantCollection[i].Plant] = JSON.parse(
              JSON.stringify(this._oStorageLocationHelp[m][r.Plant.PlantCollection[i].Plant].getData())
            );
          }
        }
        return r;
      },
      clearBuffer: function () {
        this._oMaterialHelp = {};
        this._oPlantHelp = {};
        this._oAUOHelp = {};
        this._oStorageLocationHelp = {};
      },
      validateMasterData: function (m, u, p, s, f, o) {
        if (this._oMaterialHelp[m]) {
          this._validateBuffer({ Material: m, UoM: u, Plant: p, StorageLocation: s }, f, o);
        } else {
          this.fillBufferForMaterialExpanded({ Material: m, UoM: u, Plant: p, StorageLocation: s }, f, o);
        }
      },
      _validateBuffer: function (m, f, o) {
        var r = { bMaterialIsValid: false, bUoMIsValid: false, bPlantIsValid: false, bStorageLocationIsValid: false };
        var e = false;
        if (this._oMaterialHelp[m.Material]) {
          var g = this._oMaterialHelp[m.Material].getProperty('/Material');
          if (g === m.Material) {
            e = true;
          }
          r.bMaterialIsValid = e;
        }
        if (e === false) {
          f.call(o, r);
          return;
        }
        var u = false;
        var A = [];
        A = this._oAUOMHelp[m.Material].getProperty('/AUoMCollection');
        if (m.UoM || '') {
          for (var i = 0; i < A.length; i++) {
            if (A[i].AUoM === m.UoM) {
              u = true;
            }
          }
        }
        r.bUoMIsValid = u;
        var p = false;
        var P = [];
        P = this._oPlantHelp[m.Material].getProperty('/PlantCollection');
        if (m.Plant || '') {
          for (var h = 0; h < P.length; h++) {
            if (P[h].Plant === m.Plant) {
              p = true;
            }
          }
        }
        r.bPlantIsValid = p;
        if (p === false) {
          r.bStorageLocationIsValid = false;
          f.call(o, r);
          return;
        }
        var s = false;
        var j = [];
        j = this._oStorageLocationHelp[m.Material][m.Plant].getProperty('/StorageLocationCollection');
        if (m.StorageLocation || '') {
          for (var k = 0; k < j.length; k++) {
            if (j[k].StorageLocation === m.StorageLocation) {
              s = true;
            }
          }
        }
        r.bStorageLocationIsValid = s;
        f.call(o, r);
        return;
      },
      fillBufferForMaterialAUOM: function (m) {
        if (!this._oAUOMHelp[m]) {
          this._oAUOMHelp[m] = new sap.ui.model.json.JSONModel({ AUoMCollection: [] });
          this._oAUOMHelp[m].setProperty('/GroupingIsRequiredForUoM', false);
          var f = [];
          f.push(new sap.ui.model.Filter('Material', sap.ui.model.FilterOperator.EQ, m));
          var p = {};
          p.Material = m;
          this._oModel.read('/MaterialAuoms', {
            filters: f,
            success: jQuery.proxy(this._successAUOMLoad, this, p),
            error: jQuery.proxy(this._loadError, this, null),
          });
        }
      },
      getNumberOfAUOM: function (m) {
        if (this._oAUOMHelp[m]) {
          var A = [];
          A = this._oAUOMHelp[m].getProperty('/AUoMCollection');
          return A.length;
        }
      },
      _handlePlantSearch: function (e) {
        var v = e.getParameter('value');
        var o = [];
        var f = {};
        o.push(new sap.ui.model.Filter('Plant', sap.ui.model.FilterOperator.Contains, v));
        o.push(new sap.ui.model.Filter('PlantName', sap.ui.model.FilterOperator.Contains, v));
        f = new sap.ui.model.Filter(o, false);
        var B = e.getSource().getBinding('items');
        B.filter(f);
      },
      _handleAUoMSearch: function (e) {
        var v = e.getParameter('value');
        var o = [];
        var f = {};
        o.push(new sap.ui.model.Filter('AUoM', sap.ui.model.FilterOperator.Contains, v));
        o.push(new sap.ui.model.Filter('AUoMName', sap.ui.model.FilterOperator.Contains, v));
        var B = e.getSource().getBinding('items');
        f = new sap.ui.model.Filter(o, false);
        B.filter(f);
      },
      _handleStorageLocationSearch: function (e) {
        var o = [];
        var f = [];
        var v = e.getParameter('value');
        o.push(new sap.ui.model.Filter('StorageLocation', sap.ui.model.FilterOperator.Contains, v));
        o.push(new sap.ui.model.Filter('StorageLocationName', sap.ui.model.FilterOperator.Contains, v));
        var B = e.getSource().getBinding('items');
        if (this._oStorageLocationFilters && this._oStorageLocationFilters.length > 0) {
          f = f.concat(this._oStorageLocationFilters);
        }
        f.push(new sap.ui.model.Filter(o, false));
        B.filter(new sap.ui.model.Filter(f, true));
      },
      _loadError: function (r, e) {
        M.show(this._i18n.getProperty('ERROR_MESSAGE'));
        if (r) {
          r();
        }
      },
      _successPlantLoad: function (p, D) {
        var P = [];
        for (var i = 0; i < D.results.length; i++) {
          var I = {};
          I.Plant = D.results[i].Plant;
          I.PlantName = D.results[i].PlantName;
          if (I.PlantName === '') {
            I.PlantName = 'Plant ' + I.Plant;
          }
          P.push(I);
        }
        this._oPlantHelp[p.Material].setProperty('/PlantCollection', P);
      },
      _successStorageLocationLoad: function (p, r, D) {
        var s = [];
        var g;
        if (p.MaterialIsBatchManaged === true) {
          this._setBufferForMaterialPlantBatch(D);
        }
        for (var i = 0; i < D.results.length; i++) {
          if (p.ShowDerivedLocationOnly && !D.results[i].StorLocAutoCreationIsAllowed) {
            continue;
          }
          var I = {};
          I.StorageLocation = D.results[i].StorageLocation;
          I.StorageLocationName = D.results[i].StorageLocationName;
          I.StorageLocationWithId = I.StorageLocationName + ' (' + I.StorageLocation + ')';
          I.StorLocAutoCreationIsAllowed = D.results[i].StorLocAutoCreationIsAllowed;
          I.Batch = D.results[i].Batch;
          if (I.StorLocAutoCreationIsAllowed === false) {
            I.StorageLocationStockChartvisible = true;
          } else {
            I.StorageLocationStockChartvisible = false;
          }
          I.WarehouseStorageBin = D.results[i].WarehouseStorageBin;
          if (I.WarehouseStorageBin) {
            I.WarehouseStorageBinText = this._i18n.getProperty('WAREHOUSESTORAGEBIN') + ': ' + I.WarehouseStorageBin;
          } else {
            I.WarehouseStorageBinText = '';
          }
          I.BaseUnit = D.results[i].BaseUnit;
          I.BlockedStockQuantity_Dis =
            this._NumberFormatter.format(D.results[i].BlockedStockQuantity, I.BaseUnit) + ' ';
          I.CurrentStock_Dis = this._NumberFormatter.format(D.results[i].CurrentStock, I.BaseUnit) + ' ';
          I.QualityInspectionStockQuantity_Dis =
            this._NumberFormatter.format(D.results[i].QualityInspectionStockQuantity, I.BaseUnit) + ' ';
          I.ReturnsBlockedStockQuantity_Dis =
            this._NumberFormatter.format(D.results[i].ReturnsBlockedStockQuantity, I.BaseUnit) + ' ';
          I.TransferStockStorageLocQty_Dis =
            this._NumberFormatter.format(D.results[i].TransferStockStorageLocQty, I.BaseUnit) + ' ';
          I.RestrictedStockQuantity_Dis =
            this._NumberFormatter.format(D.results[i].RestrictedStockQuantity, I.BaseUnit) + ' ';
          I.BlockedStockQuantity_Int = parseFloat(D.results[i].BlockedStockQuantity);
          I.CurrentStock_Int = parseFloat(D.results[i].CurrentStock);
          I.QualityInspectionStockQuantity_Int = parseFloat(D.results[i].QualityInspectionStockQuantity);
          I.ReturnsBlockedStockQuantity_Int = parseFloat(D.results[i].ReturnsBlockedStockQuantity);
          I.TransferStockStorageLocQty_Int = parseFloat(D.results[i].TransferStockStorageLocQty);
          I.RestrictedStockQuantity_Int = parseFloat(D.results[i].RestrictedStockQuantity);
          I.BlockedStockQuantity = D.results[i].BlockedStockQuantity;
          I.CurrentStock = D.results[i].CurrentStock;
          I.QualityInspectionStockQuantity = D.results[i].QualityInspectionStockQuantity;
          I.ReturnsBlockedStockQuantity = D.results[i].ReturnsBlockedStockQuantity;
          I.TransferStockStorageLocQty = D.results[i].TransferStockStorageLocQty;
          I.RestrictedStockQuantity = D.results[i].RestrictedStockQuantity;
          if (I.StorageLocationName === '') {
            I.StorageLocationName = 'StorageLocation ' + I.StorageLocation;
          }
          s.push(I);
        }
        this._oStorageLocationHelp[p.Material][p.Plant].setProperty('/StorageLocationCollection', s);
        if (p.ShowDerivedLocationOnly) {
          g = false;
        } else {
          g = this._determineGroupingRequired(s);
        }
        this._oStorageLocationHelp[p.Material][p.Plant].setProperty('/GroupingIsRequiredForStorageLocation', g);
        this._sortStorageLocations(
          this._oStorageLocationHelp[p.Material][p.Plant].getProperty('/GroupingIsRequiredForStorageLocation')
        );
        if (r) {
          r(s);
        }
      },
      _getGroupHeader: function (g) {
        if (g.key === true) {
          return new G({ title: this._i18n.getProperty('VALUE_HELP_GROUP_DERIVED'), upperCase: false });
        } else {
          return new G({ title: this._i18n.getProperty('VALUE_HELP_GROUP_STANDARD'), upperCase: false });
        }
      },
      _determineGroupingRequired: function (e) {
        var g = false;
        for (var i = 0; i < e.length; i++) {
          if (e[i].StorLocAutoCreationIsAllowed === true) {
            g = true;
          }
        }
        return g;
      },
      _getMinMaxOfDisplayedStocks: function (e, D) {
        var m = { minValue: 0.0, maxValue: 0.0 };
        for (var i = 0; i < D.length; i++) {
          for (var j = 0; j < e.length; j++) {
            if (e[j][D[i] + '_Int'] > m.maxValue) {
              m.maxValue = e[j][D[i] + '_Int'];
            }
            if (e[j][D[i] + '_Int'] < m.minValue) {
              m.minValue = e[j][D[i] + '_Int'];
            }
          }
        }
        return m;
      },
      _sortStorageLocations: function (g) {
        if (this._oStorageLocationDialog && this._oStorageLocationDialog.getBinding('items')) {
          var s = [];
          if (g === true) {
            var o = new sap.ui.model.Sorter('StorLocAutoCreationIsAllowed', false, true);
          } else {
            var o = new sap.ui.model.Sorter('StorLocAutoCreationIsAllowed', false, false);
          }
          s.push(o);
          o = new sap.ui.model.Sorter('StorageLocationName', false);
          s.push(o);
          o = new sap.ui.model.Sorter('StorageLocation', false);
          s.push(o);
          this._oStorageLocationDialog.getBinding('items').sort(s);
        }
      },
      _determineGroupingRequiredUoM: function (e) {
        var g = false;
        for (var i = 0; i < e.length; i++) {
          if (e[i].IsDerived === true) {
            g = true;
          }
        }
        return g;
      },
      _sortAUOMs: function (g) {
        if (this._oAUOMDialog && this._oAUOMDialog.getBinding('items')) {
          var s = [];
          if (g === true) {
            var o = new sap.ui.model.Sorter('IsDerived', false, true);
          } else {
            var o = new sap.ui.model.Sorter('IsDerived', false, false);
          }
          s.push(o);
          o = new sap.ui.model.Sorter('IsBaseUnit', true, false);
          s.push(o);
          o = new sap.ui.model.Sorter('AUoMName', false);
          s.push(o);
          this._oAUOMDialog.getBinding('items').sort(s);
        }
      },
      _successAUOMLoad: function (p, D) {
        var A = [];
        for (var i = 0; i < D.results.length; i++) {
          var I = {};
          I.AUoM = D.results[i].AlternativeUnit;
          I.AUoMName = D.results[i].AlternativeUnitName;
          if (I.AUoMName === '') {
            I.AUoMName = I.AlternativeUnit;
          }
          I.Numerator = D.results[i].Numerator;
          I.Denominator = D.results[i].Denominator;
          I.IsDerived = D.results[i].IsDerived;
          I.IsBaseUnit = D.results[i].IsBaseUnit;
          I.BaseUnit = D.results[0].AlternativeUnit;
          if (I.IsBaseUnit === true) {
            I.RatioToBaseUnit = this._i18n.getProperty('BASEUNITOFMEASURE_NO_RATIO');
          } else {
            I.RatioToBaseUnit =
              D.results[i].Denominator + ' ' + I.AUoM + ' = ' + D.results[i].Numerator + ' ' + I.BaseUnit;
          }
          A.push(I);
        }
        this._oAUOMHelp[p.Material].setProperty('/AUoMCollection', A);
        var g = this._determineGroupingRequiredUoM(A);
        this._oAUOMHelp[p.Material].setProperty('/GroupingIsRequiredForUoM', g);
        this._sortAUOMs(this._oAUOMHelp[p.Material].getProperty('/GroupingIsRequiredForUoM'));
      },
      _successMaterialExpandedLoad: function (m, f, o, D) {
        var p = {};
        p.Material = m.Material;
        if (D.results.length !== 0) {
          this._oMaterialHelp[m.Material] = new sap.ui.model.json.JSONModel();
          this._oMaterialHelp[m.Material].setProperty('/BaseUnit', D.results[0].BaseUnit);
          this._oMaterialHelp[m.Material].setProperty('/BaseUnitName', D.results[0].BaseUnitName);
          this._oMaterialHelp[m.Material].setProperty('/Material', D.results[0].Material);
          this._oMaterialHelp[m.Material].setProperty('/MaterialName', D.results[0].MaterialName);
          this._oMaterialHelp[m.Material].setProperty('/MaterialType', D.results[0].MaterialType);
          this._oMaterialHelp[m.Material].setProperty('/MaterialTypeName', D.results[0].MaterialTypeName);
          this._oMaterialHelp[m.Material].setProperty('/DefinitionOfBatchLevel', D.results[0].DefinitionOfBatchLevel);
          if (D.results[0].DefinitionOfBatchLevel !== '') {
            this._oMaterialHelp[m.Material].setProperty('/BatchVisible', true);
          } else {
            this._oMaterialHelp[m.Material].setProperty('/BatchVisible', false);
          }
          this._oMaterialHelp[m.Material].setProperty('/Expanded', true);
          this._oAUOMHelp[m.Material] = new sap.ui.model.json.JSONModel({ AUoMCollection: [] });
          this._oAUOMHelp[m.Material].setProperty('/GroupingIsRequiredForUoM', false);
          this._successAUOMLoad(p, D.results[0].Material2Auoms);
          this._oPlantHelp[m.Material] = new sap.ui.model.json.JSONModel({ PlantCollection: [] });
          this._successPlantLoad(p, D.results[0].Material2PlantsHelps);
          if (!this._oStorageLocationHelp[m.Material]) {
            this._oStorageLocationHelp[m.Material] = {};
          }
          for (var P = 0; P < D.results[0].Material2PlantsHelps.results.length; P++) {
            p.Plant = D.results[0].Material2PlantsHelps.results[P].Plant;
            this._oStorageLocationHelp[m.Material][p.Plant] = new sap.ui.model.json.JSONModel({
              StorageLocationCollection: [],
            });
            this._oStorageLocationHelp[m.Material][p.Plant].setProperty('/GroupingIsRequiredForStorageLocation', false);
            this._successStorageLocationLoad(
              p,
              null,
              D.results[0].Material2PlantsHelps.results[P].MaterialPlant2StorLocsHelps
            );
          }
        }
        this._validateBuffer(m, f, o);
      },
      setBufferForMaterialAUOM: function (D) {
        if (D) {
          this._oAUOMHelp[D.results[0].Material] = new sap.ui.model.json.JSONModel({ AUoMCollection: [] });
          this._oAUOMHelp[D.results[0].Material].setProperty('/GroupingIsRequiredForUoM', false);
          var p = {};
          p.Material = D.results[0].Material;
          var A = [];
          for (var i = 0; i < D.results[0].Material2Auoms.results.length; i++) {
            var I = {};
            I.AUoM = D.results[0].Material2Auoms.results[i].AlternativeUnit;
            I.AUoMName = D.results[0].Material2Auoms.results[i].AlternativeUnitName;
            if (I.AUoMName === '') {
              I.AUoMName = D.results[0].Material2Auoms.results[i].AlternativeUnit;
            }
            I.Numerator = D.results[0].Material2Auoms.results[i].Numerator;
            I.Denominator = D.results[0].Material2Auoms.results[i].Denominator;
            I.IsDerived = D.results[0].Material2Auoms.results[i].IsDerived;
            I.IsBaseUnit = D.results[0].Material2Auoms.results[i].IsBaseUnit;
            I.BaseUnit = D.results[0].Material2Auoms.results[0].AlternativeUnit;
            if (I.IsBaseUnit === true) {
              I.RatioToBaseUnit = this._i18n.getProperty('BASEUNITOFMEASURE_NO_RATIO');
            } else {
              I.RatioToBaseUnit =
                D.results[0].Material2Auoms.results[i].Denominator +
                ' ' +
                I.AUoM +
                ' = ' +
                D.results[0].Material2Auoms.results[i].Numerator +
                ' ' +
                I.BaseUnit;
            }
            A.push(I);
          }
          this._oAUOMHelp[p.Material].setProperty('/AUoMCollection', A);
          var g = this._determineGroupingRequiredUoM(A);
          this._oAUOMHelp[p.Material].setProperty('/GroupingIsRequiredForUoM', g);
          this._sortAUOMs(this._oAUOMHelp[p.Material].getProperty('/GroupingIsRequiredForUoM'));
        }
      },
      _setBufferForMaterialPlantBatch: function (D) {
        if (D && D.results.length > 0) {
          var m = D.results[0].Material;
          var p = D.results[0].Plant;
          var o = {};
          this.aStorageLocation = {};
          for (var i = 0; i < D.results.length; i++) {
            var I = {};
            I.StorageLocation = D.results[i].StorageLocation;
            I.StorageLocationName = D.results[i].StorageLocationName;
            I.StorageLocationWithId = I.StorageLocationName + ' (' + I.StorageLocation + ')';
            if (I.StorageLocationName === '') {
              I.StorageLocationName = 'StorageLocation ' + I.StorageLocation;
            }
            I.Batch = D.results[i].Batch;
            I.StorLocAutoCreationIsAllowed = D.results[i].StorLocAutoCreationIsAllowed;
            if (I.StorLocAutoCreationIsAllowed === false) {
              I.StorageLocationStockChartvisible = true;
            } else {
              I.StorageLocationStockChartvisible = false;
            }
            I.WarehouseStorageBin = D.results[i].WarehouseStorageBin;
            if (I.WarehouseStorageBin) {
              I.WarehouseStorageBinText = this._i18n.getProperty('WAREHOUSESTORAGEBIN') + ': ' + I.WarehouseStorageBin;
            } else {
              I.WarehouseStorageBinText = '';
            }
            I.BaseUnit = D.results[i].BaseUnit;
            I.BlockedStockQuantity_Dis =
              this._NumberFormatter.format(D.results[i].BlockedStockQuantity, I.BaseUnit) + ' ';
            I.CurrentStock_Dis = this._NumberFormatter.format(D.results[i].CurrentStock, I.BaseUnit) + ' ';
            I.QualityInspectionStockQuantity_Dis =
              this._NumberFormatter.format(D.results[i].QualityInspectionStockQuantity, I.BaseUnit) + ' ';
            I.ReturnsBlockedStockQuantity_Dis =
              this._NumberFormatter.format(D.results[i].ReturnsBlockedStockQuantity, I.BaseUnit) + ' ';
            I.TransferStockStorageLocQty_Dis =
              this._NumberFormatter.format(D.results[i].TransferStockStorageLocQty, I.BaseUnit) + ' ';
            I.RestrictedStockQuantity_Dis =
              this._NumberFormatter.format(D.results[i].RestrictedStockQuantity, I.BaseUnit) + ' ';
            I.BlockedStockQuantity_Int = parseFloat(D.results[i].BlockedStockQuantity);
            I.CurrentStock_Int = parseFloat(D.results[i].CurrentStock);
            I.QualityInspectionStockQuantity_Int = parseFloat(D.results[i].QualityInspectionStockQuantity);
            I.ReturnsBlockedStockQuantity_Int = parseFloat(D.results[i].ReturnsBlockedStockQuantity);
            I.TransferStockStorageLocQty_Int = parseFloat(D.results[i].TransferStockStorageLocQty);
            I.RestrictedStockQuantity_Int = parseFloat(D.results[i].RestrictedStockQuantity);
            I.BlockedStockQuantity = D.results[i].BlockedStockQuantity;
            I.CurrentStock = D.results[i].CurrentStock;
            I.QualityInspectionStockQuantity = D.results[i].QualityInspectionStockQuantity;
            I.ReturnsBlockedStockQuantity = D.results[i].ReturnsBlockedStockQuantity;
            I.TransferStockStorageLocQty = D.results[i].TransferStockStorageLocQty;
            I.RestrictedStockQuantity = D.results[i].RestrictedStockQuantity;
            if (D.results[i].Batch) {
              if (!this.MaterialPlantBatch[m]) {
                this.MaterialPlantBatch[m] = {};
              }
              if (!this.MaterialPlantBatch[m][p]) {
                this.MaterialPlantBatch[m][p] = {};
              }
              if (!this.MaterialPlantBatch[m][p][D.results[i].Batch]) {
                this.MaterialPlantBatch[m][p][D.results[i].Batch] = new sap.ui.model.json.JSONModel({
                  StorageLocationCollection: [],
                });
              }
              var s = this.MaterialPlantBatch[m][p][D.results[i].Batch].getProperty('/StorageLocationCollection');
              s.push(I);
              this.MaterialPlantBatch[m][p][D.results[i].Batch].setProperty('/StorageLocationCollection', s);
            }
            o[I.StorageLocation] = JSON.parse(JSON.stringify(I));
            o[I.StorageLocation].Batch = '';
            o[I.StorageLocation].BlockedStockQuantity = '0.000';
            o[I.StorageLocation].BlockedStockQuantity_Dis = '0.000';
            o[I.StorageLocation].BlockedStockQuantity_Int = 0;
            o[I.StorageLocation].CurrentStock = '0.000';
            o[I.StorageLocation].CurrentStock_Dis = '0.000';
            o[I.StorageLocation].CurrentStock_Int = 0;
            o[I.StorageLocation].QualityInspectionStockQuantity = '0.000';
            o[I.StorageLocation].QualityInspectionStockQuantity_Dis = '0.000';
            o[I.StorageLocation].QualityInspectionStockQuantity_Int = 0;
            o[I.StorageLocation].RestrictedStockQuantity = '0.000';
            o[I.StorageLocation].RestrictedStockQuantity_Dis = '0.000';
            o[I.StorageLocation].RestrictedStockQuantity_Int = 0;
            o[I.StorageLocation].ReturnsBlockedStockQuantity = '0.000';
            o[I.StorageLocation].ReturnsBlockedStockQuantity_Dis = '0.000';
            o[I.StorageLocation].ReturnsBlockedStockQuantity_Int = 0;
            o[I.StorageLocation].TransferStockStorageLocQty = '0.000';
            o[I.StorageLocation].TransferStockStorageLocQty_Dis = '0.000';
            o[I.StorageLocation].TransferStockStorageLocQty_Int = 0;
            o[I.StorageLocation].StorageBin = '';
            o[I.StorageLocation].StorLocAutoCreationIsAllowed = true;
            o[I.StorageLocation].StorageLocationStockChartvisible = false;
          }
          if (!this.MaterialPlantBatch[m]) {
            this.MaterialPlantBatch[m] = {};
          }
          if (!this.MaterialPlantBatch[m][p]) {
            this.MaterialPlantBatch[m][p] = {};
          }
          for (var B in this.MaterialPlantBatch[m][p]) {
            var e = this.MaterialPlantBatch[m][p][B].getProperty('/StorageLocationCollection');
            var f = JSON.parse(JSON.stringify(o));
            for (var i = 0; i < e.length; i++) {
              f[e[i].StorageLocation] = e[i];
            }
            var g = Object.values(f);
            this.MaterialPlantBatch[m][p][B].setProperty('/StorageLocationCollection', g);
          }
          this.MaterialPlantBatch[m][p]['Derived'] = new sap.ui.model.json.JSONModel({
            StorageLocationCollection: Object.values(o),
          });
        }
      },
      onCostCenterFilterBarSearch: function (e) {
        var v = e.getParameter('value');
        var f;
        var g = [];
        g.push(new sap.ui.model.Filter('key', sap.ui.model.FilterOperator.Contains, v));
        g.push(new sap.ui.model.Filter('text', sap.ui.model.FilterOperator.Contains, v));
        f = new sap.ui.model.Filter({ filters: g, and: false });
        var B = e.getSource().getBinding('items');
        B.filter([f]);
      },
      displayValueHelpCostCenter4Plant: function (p, f) {
        this._oCostCenterDialog = sap.ui.xmlfragment(
          'ui.s2p.mm.stock.overview.opt2.reuse.materialmaster.fragments.selectCostCenter',
          this
        );
        this._oCostCenterDialog.setModel(this._i18n, 'i18n');
        this._oCostCenterDialog.setModel(p.oJsonModel);
        this._oCostCenterDialog.attachConfirm(
          function (e) {
            var r = {};
            r.CostCenter = e.getParameter('selectedItem').getTitle();
            f(r);
            this._oCostCenterDialog.destroy();
            this._oCostCenterDialog = null;
          }.bind(this)
        );
        this._oCostCenterDialog.attachCancel(
          function (e) {
            this._oCostCenterDialog.destroy();
            this._oCostCenterDialog = null;
          }.bind(this)
        );
        this._oCostCenterDialog.open();
      },
    });
  }
);
