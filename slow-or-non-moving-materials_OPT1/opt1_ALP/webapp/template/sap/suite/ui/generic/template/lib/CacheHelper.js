/*
* SAP UI development toolkit for HTML5 (SAPUI5)

		(c) Copyright 2009-2015 SAP SE. All rights reserved
	
*/
sap.ui.define([
	"sap/suite/ui/generic/template/lib/FeLogger"
], function(FeLogger) {
    "use strict";

	var oFeLogger = new FeLogger("lib.CacheHelper");
	var oLogger = oFeLogger.getLogger();
	var oLevel = oFeLogger.Level;
	oLogger.setLevel(oLevel.ALL);

    var S_TIMESTAMP_SEPARATOR = "####";

    var oCacheHelper = {
        writeToLocalStorage: function(oKey, sValue) {
            try {
                if (window.localStorage) {
                    window.localStorage.removeItem(oKey.key);
                    sValue = oKey.timestamp + S_TIMESTAMP_SEPARATOR + sValue;
                    window.localStorage.setItem(oKey.key, sValue);
                    return true;
                }
            } catch (e) {
                oLogger.error("Locale Storage access resulted into an error");
            }
            return false;
        },

        readFromLocalStorage: function(oKey) {
            var sValue;
            if (window.localStorage) {
                sValue = window.localStorage.getItem(oKey.key);
                if (sValue) {
                    var aParticles = sValue.split(S_TIMESTAMP_SEPARATOR);
                    sValue = aParticles[0] === oKey.timestamp ? aParticles[1] : undefined;
                }
            }

            return sValue;
        },

        getCacheKeyPartsAsyc: function (oModel) {
            var aCacheKeys = [];
            var pGetMetadataLastModified = oModel.metadataLoaded().then(function(mParams) {
                var sCacheKey;
                if (mParams && mParams.lastModified) {
                    sCacheKey = new Date(mParams.lastModified).getTime() + "";
                } else {
                    oLogger.warning("TemplateComponent: no valid cache key segment last modification date provided by the OData Model");
                    sCacheKey = new Date().getTime() + ""; //to keep the application working the current timestamp is used
                }
                return sCacheKey;
            });
            aCacheKeys.push(pGetMetadataLastModified);

            var pGetAnnotationsLastModified = oModel.annotationsLoaded().then(function(mParams) {
                var iCacheKey = 0;
                if (mParams) {
                    for (var i = 0; i < mParams.length; i++) {
                        if (mParams[i].lastModified) {
                            var iLastModified = new Date(mParams[i].lastModified).getTime();
                            if (iLastModified > iCacheKey) {
                                iCacheKey = iLastModified;
                            }
                        } else {
                            oLogger.warning("TemplateComponent: no valid cache key segment last modification date provided by OData annotations");
                            iCacheKey = new Date().getTime() + ""; //to keep the application working the current timestamp is used
                        }
                    }
                }
                if (iCacheKey === 0) {
                    oLogger.warning("TemplateComponent: no valid cache key segment last modification date provided by OData annotations");
                    iCacheKey = new Date().getTime(); //to keep the application working the current timestamp is used
                }

                return iCacheKey + "";
            });
            aCacheKeys.push(pGetAnnotationsLastModified);

            return aCacheKeys;
        },

        getCacheKey: function(sAppId, sEntitySet, aKeys) {
            return {
                key: sAppId + "-" + sEntitySet,
                timestamp: aKeys.join("-")
            };
        },

        writeToLocalStorageAsync: function(sAppId, sEntitySet, aKeyPromises, sContent) {
            return Promise.all(aKeyPromises).then(function(aKeys) {
                var oKey = this.getCacheKey(sAppId, sEntitySet, aKeys);
                this.writeToLocalStorage(oKey, sContent);
            }.bind(this));
        }
    };

    return oCacheHelper;

});
