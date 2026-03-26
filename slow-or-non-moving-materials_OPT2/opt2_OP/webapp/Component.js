/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
// Added shim to provide the Chart.js library
sap.ui.loader.config({
  paths: {
    "external/Chartjs": "https://cdn.jsdelivr.net/npm/chart"
  },
  shim: {
    "external/Chartjs": {
      amd: true,
      exports: "Chart"
    }
  }
});
sap.ui.define(["sap/suite/ui/generic/template/lib/AppComponent"], function (AppComponent) {
	return AppComponent.extend("ui.s2p.mm.lib.slonomo.mat.opt2.Component", {
		metadata: {
			"manifest": "json"
		}
	});
});