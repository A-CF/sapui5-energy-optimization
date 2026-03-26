/*
 * Copyright (C) 2009-2021 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([], function () {
  'use strict';
  return {
    concatenateNameIdFormatter: function (v, V) {
      if (v) {
        v = v + ' (' + V + ')';
        return v;
      } else {
        return null;
      }
    },
  };
});
