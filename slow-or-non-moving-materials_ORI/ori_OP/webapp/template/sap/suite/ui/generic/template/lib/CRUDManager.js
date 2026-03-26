sap.ui.define(["sap/ui/base/Object",
	"sap/ui/generic/app/util/ModelUtil",
	"sap/ui/generic/app/util/ActionUtil",
	"sap/suite/ui/generic/template/lib/MessageUtils",
	"sap/suite/ui/generic/template/lib/CRUDHelper",
	"sap/suite/ui/generic/template/lib/CacheHelper",
	"sap/suite/ui/generic/template/lib/testableHelper",
	"sap/base/util/extend",
	"sap/base/util/isEmptyObject",
	"sap/suite/ui/generic/template/lib/FeError",
	"sap/ui/model/Context",
	"sap/m/MessageBox"
			  ], function(BaseObject, ModelUtil, ActionUtil, MessageUtils, CRUDHelper, CacheHelper, testableHelper, extend, isEmptyObject, FeError, Context, MessageBox) {
		"use strict";
        var	sClassName = "lib.CRUDManager";

		var oRejectedPromise = Promise.reject();
		oRejectedPromise.catch(Function.prototype);
		function setResetModelHeader (oModel, sKey, vValue) {
			var mHeaders = oModel.getHeaders();
			var mHeadersCopy = extend({}, mHeaders);
			if (vValue === undefined) {
				delete mHeadersCopy[sKey];
			} else {
				mHeadersCopy[sKey] = vValue;
			}
			oModel.setHeaders(mHeadersCopy);
		}
		function mapToArray (mObj){
			return  Object.keys(mObj).map(function (key){
				return mObj[key];
			});
		}
		/**
		 * 
		 * @param {Array} aInput , input array
		 * @returns {Array} having entry as index from 0 to length-1 of aInput
		 */
		function getIndexArray (aInput) {
			if (aInput) {
				return aInput.map(function(input, index) {
					return index;
				});
			}
		}

		function getMethods(oController, oComponentUtils, oServices, oCommonUtils, oBusyHelper) {

			function handleError(sOperation, reject, oError, mParameters) {
				//oError is undefined in case ActionUtil popup's cancel button is clicked
				if (oError) {
					MessageUtils.handleError(sOperation, oController, oServices, oError, mParameters);
				}
				return (reject || Function.prototype)(oError);
			}

			var fnEditEntityImpl; // declare function already here, to avoid usage before declaration
			// This method is called to check about drafts of other users for the entity to be edited.
			// It returns a promise that is settled when this question has been clarified.
			// Actually there are two scenarios in which this method can be called:
			// - If oError is faulty the method is called at the beginning of the editing process. In this case this method
			//   must find out whether
			//   a) Another user possesses a locking draft for the entity -> promise is rejected
			//   b) Another user possesses a non-locking draft for the entity -> promise is resolved as described for function editEntity (see below)
			//   c) No draft exists for this object -> promise is resolved to an empty object
			// - If oError is truthy the back-end has already been called in order to create an edit draft. Thereby the preserveChange-mode was used (see below).
			//   This backend call returned the information that another user possesses a (locking or non-locking) draft for the entity.
			//   oError is the object that was returned from the backend. In this case this method must find out whether
			//   a) The corresponding draft is locking -> promise is rejected
			//   b) The corresponding draft is non-locking -> promise is resolved as described for function editEntity (see below)
			//   c) The draft has meanwhile disappeared (edge case) -> in this case the promise should also resolve as described for function editEntity. Therefore, the function is called once more.
			// In both scenarios in case a) this method is also responsible for error handling. Note that there is a subtle difference between these scenarios in this case.
			// In the second scenario the error message that should be presented to the user can be taken from oError (and thus comes from the backend)
			// In the first scenario the error message is created locally.
			function checkForForeignUserLock(oError) {
				return new Promise(function(resolve, reject) {
					var oComponent = oController.getOwnerComponent();
					// check whether Draft exists
					var oBindingContext = oComponent.getBindingContext();
					var oModel = oComponent.getModel();
					oModel.read(oBindingContext.getPath(), {
						urlParameters: {
							"$expand": "DraftAdministrativeData"
						},
						success: function(oResponseData) {
							if (!oResponseData.DraftAdministrativeData) { // no draft exists for the object at all
								if (oError) { // It seems that the draft that was responsible for producing oError has meanwhile vanished -> Restart the process (edge case)
									//return fnEditEntityImpl(false).then(resolve);
									return handleError(MessageUtils.operations.editEntity, reject, oError);
								}
								return resolve({});
							}
							if (oResponseData.DraftAdministrativeData.InProcessByUser) { // locked by other user
								var sUserDescription = oResponseData.DraftAdministrativeData.InProcessByUserDescription || oResponseData.DraftAdministrativeData
									.InProcessByUser;
								oError = oError || new FeError(oCommonUtils.getText("ST_GENERIC_DRAFT_LOCKED_BY_USER", [" ", sUserDescription]));
								return handleError(MessageUtils.operations.editEntity, reject, oError, oError);
							}
							return resolve({
								draftAdministrativeData: oResponseData.DraftAdministrativeData
							}); // draft for other user exists but is no lock anymore
						},
						error: handleError.bind(null, MessageUtils.operations.editEntity, reject)
					});
				});
			}
			/**
			* Check for Content-ID referencing across changeSet is supported or not
			*
			* @return Bool
		 	*/
			function isContentIdReferencingAllowed() {
				var oMetaModel = oController.getView().getModel().getMetaModel();
				var oEntityContainer = oMetaModel.getODataEntityContainer();
				var oBatchSupport = oEntityContainer["Org.OData.Capabilities.V1.BatchSupport"];
				if (oBatchSupport && oBatchSupport.ReferencesAcrossChangeSetsSupported && oBatchSupport.ReferencesAcrossChangeSetsSupported.Bool) {
					return oBatchSupport.ReferencesAcrossChangeSetsSupported.Bool === "true";
				}
				return false;
			}

			function expandRootIfAllowed() {
				if (isContentIdReferencingAllowed()) {
					return oComponentUtils.getRootExpand();
                }
				return null;
			}

			// This method is called in order to call method editEntity on the TransactionController. It returns a promise as described
			// in the description of method editEntity (see below).
			// Parameter oPrereadData is an object that possily contains administrative data which have already been retrieved.
			// More precisely this object is either empty or contains a property draftAdministrativeData.
			// In this second case the promise returned by this method should just resolve to oPrereadData.
			function fnCallEdit(bIsDraftEnabled, bUnconditional, oPrereadData) {
				if (oPrereadData.draftAdministrativeData) {
					return Promise.resolve(oPrereadData);
				}
				
				return new Promise(
					function(resolve, reject) {
						oServices.oTransactionController.editEntity(oController.getView().getBindingContext(), !bUnconditional, expandRootIfAllowed())
							.then(
								function(oResponse) { //success

									// The active context is invalidated as the DraftAdministrativeData of the context(the active context) has changed after draft creation.
									// This is done to keep the DraftAdministrativeData of the record updated.
									// Direct invalidation of the active context may
									//     a) lead to strange behaviour on the UI.
									//     b) lead to immediate reload of the data.
									// With modelContextChange we wait till the object page is not bound to the active context.
									if (bIsDraftEnabled) {
										var oView = oController.getView();
										var oActiveContext = oView.getBindingContext();
										var fnInvalidateActiveContext = function() {
											oActiveContext.getModel().invalidateEntry(oActiveContext);
											oView.detachEvent("modelContextChange", fnInvalidateActiveContext);
										};
										oView.attachEvent("modelContextChange", fnInvalidateActiveContext);
									}

									return resolve({
										context: oResponse.context
									});
								},
								function(oResponse) { // error handler
									if (oResponse && oResponse.response && oResponse.response.statusCode === "409" && bIsDraftEnabled && !bUnconditional) { //there might be unsaved changes
										//remove transient message associated with rc 409 in order to prevent message pop-up
										MessageUtils.removeTransientMessages();
										// var oMesssageManager = sap.ui.getCore().getMessageManager();
										// var aMessages =  oMesssageManager.getMessageModel().getData();
										// var aMessagesToBeRemoved = [];
										// for (var i = 0; i < aMessages.length; i++) {
										// 	 if (aMessages[i].getCode() === "SDRAFT_COMMON/000") {
										// 		 aMessagesToBeRemoved.push(aMessages[i]);
										// 	 }
										// }
										// if (aMessagesToBeRemoved.length > 0) {
										// 	oMesssageManager.removeMessages(aMessagesToBeRemoved);
										// }
										return checkForForeignUserLock(oResponse).then(resolve, reject);
									} else {
										handleError(MessageUtils.operations.editEntity, reject, oResponse, oResponse);
									}
								}
							);
					}
				);
			}

			// This method implements main functionality of  editEntity (see below). Only busy handling is not done in this function.
			fnEditEntityImpl = function(bUnconditional) {
				var bIsDraftEnabled = oComponentUtils.isDraftEnabled();
				var oRet;
				var oComponent = oController.getOwnerComponent();
				var oBindingContext = oComponent.getBindingContext();
				if (bIsDraftEnabled && !bUnconditional) {
					// In this case we must ensure that a non-locking draft of another user is not overwritten without notice.
					// There are two strategies for that:
					// - First read the draft administrative data in order to check for this information
					// - Call backend to create draft in a mode where every draft of another user is consideres as a lock
					// The second possibility is preferred. However it is only suitable when the OData Service supports this mode (called preserveChange-mode)
					var oDraftContext = oServices.oDraftController.getDraftContext();
					var bPreserveChanges = oDraftContext.hasPreserveChanges(oBindingContext);
					if (!bPreserveChanges) { // Must use strategy 1 -> first check for Foreign user locks then start editing
						oRet = checkForForeignUserLock().then(fnCallEdit.bind(null, true, true));
					}
				}
				// In non-draft case and in draft cases with strategy 2 call edit functionality directly
				oRet = oRet || fnCallEdit(bIsDraftEnabled, bUnconditional, {});
				if (bIsDraftEnabled) {
					oServices.oApplication.editingStarted(oBindingContext, oRet);
				}
				return oRet;
			};

			// This method is called when a user starts to edit the active entity.
			// This method deals with busy handling and sensing error messages, but not with other dialogs.
			// Parameter bUnconditional specifies whether the user has already confirmed that he is willing to overwrite other users non-locking drafts.
			// The method returns a promise.
			// The promise is rejected when the user must not edit the object (which may be caused by tecnical or semantical problems).
			// In this case error handling has been performed by this method.
			// The promise is resolved to an object with property 'draftAdministrativeData' when there exists a non-locking draft of another user (this can only be the case when bUnconditional is false)
			// In this case this property contains the draft administrative data of the non-locking draft.
			// The promise is resolved to an object with property 'context' when the editing can start.
			// In this case this property contains the context of the entity to be edited.
			function editEntity(bUnconditional) {
				if (oBusyHelper.isBusy()) {
					return oRejectedPromise;
				}
				var oRet = fnEditEntityImpl(bUnconditional);
				oBusyHelper.setBusy(oRet);
				return oRet;
			}
			
			function getDeleteEntityPromise(bIsActiveEntity, bHasActiveEntity, oContext) {
				var oRet = new Promise(
					function(resolve, reject) {
						var fnHandleSuccess = function() {
							var sEntitySet = ModelUtil.getEntitySetFromContext(oContext);
							var oDraftContext = oServices.oDraftController.getDraftContext();
							var bRoot = oDraftContext.isDraftRoot(sEntitySet);
							var iViewLevel = oComponentUtils.getViewLevel();
							var sMessageText = iViewLevel >= 2 ? oCommonUtils.getText("ITEM_DELETED") : oCommonUtils.getText("ST_GENERIC_OBJECT_DELETED");

							// replace the message only for the root.
							if (!bIsActiveEntity && bRoot) {
								sMessageText = oCommonUtils.getText(bHasActiveEntity ? "ST_GENERIC_DRAFT_WITH_ACTIVE_DOCUMENT_DELETED" : "ST_GENERIC_DRAFT_WITHOUT_ACTIVE_DOCUMENT_DELETED");
							}
							MessageUtils.showSuccessMessageIfRequired(sMessageText, oServices);
						};
						var fnHandleResponse = function (aFailedPathes){
							// If there is no failed path means it is success case
							if (aFailedPathes.length === 0) {
								fnHandleSuccess();
								resolve();
							} else {
								MessageUtils.handleError(MessageUtils.operations.deleteEntity, oController, oServices, aFailedPathes[0].oError, null);
								reject();
							}
						};
						var oDeletePromise = deleteEntities({
							pathes: [oContext.getPath()], 
							withWarningDialog: true
						});
						oDeletePromise.then(fnHandleResponse, reject);
					}
				);
				return oRet;
			}
			
			/*
			 * Deletes current OData entity. The entity can either be a
			 * non-draft document or a draft document. *
			 * Note: This method does not care for busy handling. So this has to be done by the caller.
			 * @returns {Promise} A <code>Promise</code> for asynchronous
			 *          execution
			 * @public
			 */
			function deleteEntity(){
				var oRet = new Promise(function(fnResolve, fnReject){
					var oContext = oController.getView().getBindingContext();
					var bIsActiveEntity = oServices.oDraftController.isActiveEntity(oContext);
					var bHasActiveEntity = oServices.oDraftController.hasActiveEntity(oContext);

					var oSiblingPromise = bHasActiveEntity && !bIsActiveEntity ? oServices.oApplication.getDraftSiblingPromise(oContext) : Promise.resolve();
					oSiblingPromise.then(function(oActive){
						var oDeletePromise = getDeleteEntityPromise(bIsActiveEntity, bHasActiveEntity, oContext);
						oDeletePromise.then(fnResolve, fnReject);
						if (!bIsActiveEntity) { // cancellation of a draft
							var fnTransformActiveContext = function(){
								return  { context: oActive };
							};
							var oCancellationPromise = oDeletePromise.then(fnTransformActiveContext);
							oServices.oApplication.cancellationStarted(oContext, oCancellationPromise);
						}
					}, fnReject);
				});
				return oRet;
			}
			/**
			 * 
			 * @param {Array} aPath, Array of vPaths, vPaths can be String or Number
			 * @param {Array} aDeleteResults, Array of Responses to be parsed
			 * @param {Boolean} bWithWarningDialog, flag to decied, whether to extract messages from message model or not
			 */
			
			function fnParseResponse(aPath, aResponses, bWithWarningDialog) {
				var mResult = {
					mFailed: Object.create(null),
					mSuccess: Object.create(null),
					mWarning: Object.create(null),
					aMessagesForUserDecision: []
				};
				// Filtering of Results in groups
				for (var i = 0; i < aPath.length; i++){
					var vPath = aPath[i];
					var oResult = aResponses[i];
					var oParsedResult = MessageUtils.parseError(oResult);
					var iStatusCode = parseInt(oParsedResult.httpStatusCode, 10);
					var mHttpHeaders = oResult && oResult.response && oResult.response.headers;
					if ((iStatusCode >= 200 && iStatusCode < 300) || iStatusCode === 304){
						mResult.mSuccess[vPath] = oResult;
					} else if (iStatusCode === 412 && mHttpHeaders && mHttpHeaders["preference-applied"]) { 
						// When status code is 412, with header is preferenced applied, we treat this special scenrio as 
						// warning case. A special handling of showing confirmation popup is done in this case.
						mResult.mWarning[vPath] = oResult;
					} else {
						mResult.mFailed[vPath] = oResult;
					}
				}
				if (!isEmptyObject(mResult.mWarning) && bWithWarningDialog){
					mResult.aMessagesForUserDecision = MessageUtils.getTransientMessages();
					MessageUtils.removeTransientMessages();
				}
				return mResult;
			}

			/**
			 * Deletes current OData entity. The entity can either be a non-draft document or a draft document. *
			 *
			 * @param {Object} oSettings: has following information
			 * oSettings.smartTable: smart table the entries are coming from
			 * oSettings.pathes: paths (strings) which identify the entities
			 * oSettings.bOnlyOneDraftPlusActive: this flag tells that when 2 items is request for deleteion one of 
			 * them is draft and other is active of that draft, so that we can handle 412 warning case . Currently only this
			 * scenario is supported in delete. This flag will be replace or removed when we start handling multiselect delete 
			 * with 412 scenario.
			 * @returns {Promise} A <code>Promise</code> for asynchronous execution
			 * If the Promise is rejected all necessary dialogs have been performed by this function. If the Promise is resolved
			 * it is the task of the caller to give feedback to the user.
			 * Therefore, the Promise resolves to an array which contains an entry for every failed delete request. The corresponding entry is
			 * an object with the following attributes: sPath (corresponding entry from oSettings.pathes), oError (the error response), isWarning (indicates whether delete was refused with a 412 warning)
			 * @public
			 */
			function deleteEntities(oSettings) {
				var oRet = new Promise(function(outerResolver, outerReject) {
					var mObjectsToDelete = Object.create(null);
					var mResolveInfo = Object.create(null);
					var fnPromiseFunction = function(sPath, resolveSingle, rejectSingle){
						mResolveInfo[sPath] = {
							resolve: resolveSingle,
							reject: rejectSingle
						};
					};
					for (var k = 0; k < oSettings.pathes.length; k++){
						var sPath = oSettings.pathes[k];
						mObjectsToDelete[sPath] = new Promise(fnPromiseFunction.bind(null, sPath));
					}
					oServices.oApplication.prepareDeletion(mObjectsToDelete, oSettings.suppressRefreshAllComponents);
					// Three maps of pathes to repsonses:
					var mSuccess = Object.create(null); // Collects all successfull deletions
					var mFailed = Object.create(null);  // Collects all objects that cannot be deleted at all
					var mWarning; // Contains the objectas which have been rejected with a 412 in the last attempt
					var fnDone = function(bShouldReject){ // will be called when the final result of the deletion process is known
						if (!isEmptyObject(mSuccess)){
							oServices.oApplication.markCurrentDraftAsModified();
						}
						for (var sPath in mResolveInfo){
							var oResolveInfo = mResolveInfo[sPath];
							oResolveInfo[mSuccess[sPath] ? "resolve" : "reject"]();
						}
						if (bShouldReject){
							return outerReject();
						}
						// outerResolver should be called. Build the array representing the failed requests as specified above.
						var aFailedPathes = oSettings.pathes.map(function(sPath){
							return {
								sPath: sPath, 
								oError: mFailed[sPath] || mWarning[sPath], 
								isWarning: !!mWarning[sPath]
								
							};
						}).filter(function(oErrorInfo){
							return !!oErrorInfo.oError;
						});
						outerResolver(aFailedPathes);
					};
					var fnShowConfirmationOrResolve = function(aMessagesForUserDecision){
						if (aMessagesForUserDecision.length > 0){
							var oCRUDActionHandler = oComponentUtils.getCRUDActionHandler();
							var mParameters = {messagesForUserDecison: aMessagesForUserDecision};
							oCRUDActionHandler.handleCRUDScenario(4, fnInvokeDeletion.bind(null, Object.keys(mWarning), false, false), fnDone.bind(null, true), "Delete", mParameters);
							return;
						}
						fnDone();
					};
					var fnInvokeDeletion = function(aPath, bStrict, bWithWarningDialog){ // Note that this method might be called twice: First with all objects to be deleted. Second with confirmed 412s.
						if (oSettings.suppressRefreshAllComponents && oSettings.smartTable){
							// Referesh the table with same changeset name to merge the get call with above delete action
							oCommonUtils.refreshSmartTable(oSettings.smartTable, "Changes");						
						}						
						var fnHandleResponse = function(aDeleteResults){
							var oParsedDeleteResult = fnParseResponse(aPath, aDeleteResults, bWithWarningDialog, oSettings.onlyOneDraftPlusActive);
							mFailed = extend(mFailed, oParsedDeleteResult.mFailed);
							mSuccess = extend(mSuccess, oParsedDeleteResult.mSuccess);
							mWarning = oParsedDeleteResult.mWarning;
							fnShowConfirmationOrResolve(oParsedDeleteResult.aMessagesForUserDecision);
						};
						var oDeletePromise = oServices.oTransactionController.deleteEntities(aPath, {
							bIsStrict: bStrict
						}).then(fnHandleResponse, fnHandleResponse);
						oBusyHelper.setBusy(oDeletePromise);
					};
					// We only support warning dialog in following cases:
					// 1. One items is selected from LR table( either active or draft)
					// 2. One item is selectd which is draft and its active also exist, tested by condition: oSettings.onlyOneDraftPlusActive
					// Also caller should tell specifically by flag oSettings.withWarningDialog, that they want this delete to be performed with possibility to warn
					var bWithWarningDialog = oSettings.withWarningDialog && (oSettings.pathes.length === 1 || oSettings.onlyOneDraftPlusActive);
					fnInvokeDeletion(oSettings.pathes, true, bWithWarningDialog);
				});
				return oRet;
			}
			
			function discardDraft(oContext){
				var bHasActiveEntity = oServices.oDraftController.hasActiveEntity(oContext);
				var oSiblingPromise = bHasActiveEntity ? oServices.oApplication.getDraftSiblingPromise(oContext) : Promise.resolve();
				return oSiblingPromise.then(function(oActive){
					var fnTransformActiveContext = function(){
						return  { context: oActive };
					};
					var oDeletePromise = oServices.oTransactionController.deleteEntity(oContext);
					var oCancellationPromise = oDeletePromise.then(fnTransformActiveContext);
					oServices.oApplication.cancellationStarted(oContext, oCancellationPromise);
					return oDeletePromise;
				});
			}

			/*
			 * Saves multiple Enities. Currently used only in non-draft scenario.
			 *
			 * @param {Array} aContextToBeUpdated: context path and data to be updated
			 * @returns {Promise} A <code>Promise</code> for asynchronous execution
			 * @public
			 */
			function updateMultipleEntities(aContextToBeUpdated) {
				var oRet = oServices.oTransactionController.updateMultipleEntities(aContextToBeUpdated);
				oBusyHelper.setBusy(oRet);
				return oRet;
				//currently only backend messages are shown in case of failure. Due to lack of scenario currently fallback message is not shown.
			}

			function fnGetMessagesFromContextFilter(oContextFilter, oMessageManager, bExcludeETagMessages) {
				var oMessageModel = oMessageManager.getMessageModel();
				var oMessageBinding = oMessageModel.bindList("/", null, null, [oContextFilter]); // Note: It is necessary to create this binding each time, since UI5 does not update it (because there is no change handler)
				var aRet = oMessageBinding.getCurrentContexts().map(function(oContext) {
					return oContext.getObject();
				});
				if (bExcludeETagMessages){
					aRet = aRet.filter(function(oMessage){
						return !MessageUtils.isMessageETagMessage(oMessage);	
					});
				}
				return aRet;
			}

			/**
			 * Implementation of save for non-draft entities. This method also takes care of warning sent with 412 HTTPStausCode.
			 * Will reject the caller promise if, during save backend throws error. If, backend throws warning with 412 HTTPStatusCode,
			 * it will wait for user's decision before rejecting or redoing the save.
			 * @param {Function} resolve: is resolver of caller function
			 * @param {Function} reject: is resolver of caller function
			 * @param {Object} oCreateWithDialogFilters: context filters, when we create object using Dialog in LR and save.
			 */

			function saveEntityImpl(resolve, reject, oCreateWithDialogFilters) {
				if (oBusyHelper.isBusy()) {
					reject();
					return;
				}
				// Prepare message handling by storing information which messages have been available before saving
				var oMessageManager, fnGetAndProcessMessages, aMessagesBeforeSave, mMessagesBeforeSave;
				var oContextFilter =  oCreateWithDialogFilters ? oCreateWithDialogFilters : oServices.oTemplateCapabilities.oMessageButtonHelper && oServices.oTemplateCapabilities.oMessageButtonHelper.getContextFilter(false);
				if (oContextFilter){
					oMessageManager = sap.ui.getCore().getMessageManager();
					fnGetAndProcessMessages = function(fnProcessMessage){ // This function returns all messages according to oContextFiler and allows an additional processing of the messages via fnProcessMessage
						var oMessageModel = oMessageManager.getMessageModel();
						var oMessageBinding = oMessageModel.bindList("/", null, null, [oContextFilter]); // Note: It is necessary to create this binding each time, since UI5 does not update it (because there is no change handler)
						var aContexts = oMessageBinding.getContexts();
						return aContexts.map(function(oContext){
							var oMessage = oContext.getObject();
							fnProcessMessage(oMessage);
							return oMessage;
						});
					};
					mMessagesBeforeSave = Object.create(null);
					aMessagesBeforeSave = fnGetAndProcessMessages(function(oMessage){
						mMessagesBeforeSave[oMessage.getId()] = oMessage;
					});
				}
				var oModel = oController.getView().getModel();
				// Handles the 412 Warning case.
				var fnHandleWarning = function(){
					var oCRUDActionHandler = oComponentUtils.getCRUDActionHandler();
					oCRUDActionHandler.handleCRUDScenario(4, fnSaveInternal.bind(null, false), reject, "Activate");
				};
				var fnSaveInternal = function(bStrict){
					if (bStrict) {
						setResetModelHeader(oModel, "Prefer", "handling=strict");
					} else {
						setResetModelHeader(oModel, "Prefer", "handling=lenient");
					}
					var oSubmitChange = oServices.oTransactionController.triggerSubmitChanges().then(function(oResponse) {
						setResetModelHeader(oModel, "Prefer");
						if (oMessageManager) { // clean the message model
							oMessageManager.removeMessages(aMessagesBeforeSave);
						}
						resolve(oResponse.context);
					}, function(oError) {
						var bWarningOccured = false;
						setResetModelHeader(oModel, "Prefer");
						if (oMessageManager) {
							var aNewMessages = [];
							var aAllMessages = fnGetAndProcessMessages(function(oMessage) {
								if (!mMessagesBeforeSave[oMessage.getId()]) { // if this is a new message
									oMessage.persistent = false;
									oMessage.technical = false;
									bWarningOccured = bWarningOccured || oMessage.technicalDetails.statusCode === "412" && oMessage.technicalDetails.headers["preference-applied"] === "handling=strict";
									aNewMessages.push(oMessage);
								}
							});
							// Now aAllMessages contains all messages (according to the oContextFilter) and aNewMessages only those which have been added by the current attempt to save.
							// If no new message is there (but we are in an error scenario anyway) we assume that a technical error occured that prevented the backend to test the current state.
							// Therefore, we just keep the state of the message model as it is.
							// If there is at least one new message we assume that the backend has checked the object (and found business errors). Thus, the old messages can be removed and only the new messages
							// have to stay. However, we delete all messages and then add the new ones. This ensures, that the message model gets a change event even if no message has been there before.
							// This will trigger the follow-up activities.
							if (aNewMessages.length) {
								oMessageManager.removeMessages(aAllMessages);
								oMessageManager.addMessages(aNewMessages);
								if (bWarningOccured && bStrict) {
									// If warning occured in strict mode, show the confimation popup and wait for user's decision.
									fnHandleWarning();
									return;
								}
								if (!oCreateWithDialogFilters) {
									oServices.oTemplateCapabilities.oMessageButtonHelper.showMessagePopover();
								}
							}
						}
						reject();
					});
					oBusyHelper.setBusy(oSubmitChange);
				};
				fnSaveInternal(true);
			}

			/*
			 * Saves current OData entity. Only used in non-draft scenario.
			 *
			 * @param {object} oCreateWithDialogFilters filters to handle error scenario if create with dialog enabled on LR
			 * @returns {Promise} A <code>Promise</code> for asynchronous execution
			 * @public
			 */
			function saveEntity(oCreateWithDialogFilters) {
				var oFilterForCreateWithDialog = oCreateWithDialogFilters;
				var oRet = new Promise(function(fnResolve, fnReject) {
					oServices.oApplication.performAfterSideEffectExecution(saveEntityImpl.bind(null, fnResolve, fnReject, oFilterForCreateWithDialog));
				});
				return oRet;
			}

			/*
			 * Activates a draft OData entity. Only the root entity can be activated.
			 *
			 * @returns {Promise} A <code>Promise</code> for asynchronous execution
			 * @public
			 */
			function activateDraftEntity(oCreateDialogContext, oCreateWithDialogFilter) {
				if (oBusyHelper.isBusy()) {
					return oRejectedPromise;
				}
				var oRet = new Promise(function(resolve, reject) {
					var oContext = oCreateDialogContext ? oCreateDialogContext : oController.getView().getBindingContext();
					var oContextFilter = oCreateWithDialogFilter ? oCreateWithDialogFilter : oServices.oTemplateCapabilities.oMessageButtonHelper && oServices.oTemplateCapabilities.oMessageButtonHelper.getContextFilter(true);
					var oMessageManager = sap.ui.getCore().getMessageManager();
					var bWarningOccured = false;
					var fnRemoveTransientMessages = function(aStateMessagesBeforeSave, aStateMessageAfterSave) {
						if (!aStateMessageAfterSave.length) {
							return;
						}
						// compare first message of the after save and compare it with beforesave message
						var oNewMessage = aStateMessageAfterSave[0];
						var bMessagesUnChanged = aStateMessagesBeforeSave.some(function(oOldMessage) {
							return oNewMessage === oOldMessage;
						});
						if (!bMessagesUnChanged && aStateMessageAfterSave.some(function(oMessage){
							return oMessage.type === "Error";
						})) {
							MessageUtils.removeTransientMessages();
						}
					};
					var fnHandleWarning = function(aStateMessages) {
						if (aStateMessages.some(function(oMessage){
							return oMessage.type === "Warning";
						})){
							MessageUtils.removeTransientMessages();	
						}
						bWarningOccured = true;
						var fnForceActivate = function() {
							var aStateMessagesBeforeSave = fnGetMessagesFromContextFilter(oContextFilter, oMessageManager);
							var oActivationPromise = oServices.oDraftController.activateDraftEntity(oContext, true);
							oServices.oApplication.activationStarted(oContext, oActivationPromise);
							oActivationPromise.then(function(oResponse) {
								resolve(oResponse);
								},function(oError){
									var aStateMessageAfterSave = fnGetMessagesFromContextFilter(oContextFilter, oMessageManager).filter(function(oMessage){
										// during force activation ignore state messages that are no error messages (i.e. warning). Application should have removed them anyway.
										return oMessage.type === "Error";
									});
									fnRemoveTransientMessages(aStateMessagesBeforeSave, aStateMessageAfterSave);
									MessageUtils.handleError(MessageUtils.operations.activateDraftEntity, oController, oServices, oError, null);
									reject();
								});
							oBusyHelper.setBusy(oActivationPromise);
						};
						var oCRUDActionHandler = oComponentUtils.getCRUDActionHandler();
						oCRUDActionHandler.handleCRUDScenario(4, fnForceActivate, reject, "Activate");
					};
					oServices.oApplication.getDraftSiblingPromise(oContext).then(function(oSiblingContext){
						if (oSiblingContext){
							oController.getOwnerComponent().getModel().invalidateEntry(oSiblingContext);
						}
						var aStateMessagesBeforeSave = fnGetMessagesFromContextFilter(oContextFilter, oMessageManager);
						var oActivationPromise = oServices.oDraftController.activateDraftEntity(oContext, false);
						// Prepare promise object to fetch the header of the active entity

						if (oSiblingContext) {
							var sRootExpand =  oComponentUtils.getRootExpand();
							var mParameters = {};
							if (sRootExpand && sRootExpand.length) {
								mParameters.urlParameters = {
									"$expand": sRootExpand
								};
							}
							oServices.oDraftController.fetchHeader(oSiblingContext, mParameters);
						}
						oBusyHelper.setBusy(oActivationPromise);
						oServices.oApplication.activationStarted(oContext, oActivationPromise);
						oActivationPromise.then(function(oResponse) {
							// clean the message model
							oMessageManager.removeMessages(aStateMessagesBeforeSave);
							resolve(oResponse);
						}, function(oError) {
							// When reaching this point we assume that there are messages (in the message model) which explain to the user why the activation has failed.
							// We now need to identify these messages. Moreover we need to find out which of the following possibilities to display the messages is correct:
							// 1. Show them in a confirmation popup such that the user can still decide whether he wants to ignore them or not.
							//    This can only happen when bForce is false (first call of fnActivate).
							//    Moreover, we assume that in this case no error message and at least one warning message should be displayed to the user.
							// 2. Show state messages in the message popover
							// 3. Show transient messages in the message popup
							// In case 2 and 3 it is expected that at least one of those messages is an error message.
							// Note that in case 2 and possibly also in case 1 we need to suppress the generic error message (like "An exception has occurred") 
							// which is coming as a transient message to indicate that the activation request has failed. It's done in fnRemoveTransientMessages
							// Note that case 3 has 2 subcases 
							// 3a) Some severe technical error has happened which even prevented the Preparation call to be executed successfully
							// 3b) The Preparation call was successful and did not find any reason which prevents activation. However, the call of activation failed.
							//     Note that this failure may still be because of business reasons (excluding reasons named in case 1) or technical reasons.
							// In case 3a) (and only in this case) the list of state messages in the message model will not have been updated.
							// Therefore, in case at least one state message exists in the message model we first check whether this is an instance which was already there before the backend call.
							// If this is the case we have successfully identified case 3a) and we show all transient messages.
							// If no state message is available we still cannot exclude case 3a).
							// However, we rely on the fact that in this case the following logic will treat it as case 3b) which leads to the same result.
							// Next step is checking for case 1. This is considered applicable if these conditions are true:
							// - there is at least one transient message which identifies this case (statusCode is "412")
							// If this is the case the list of messages shown to the user for confirmation consists of the following messages:
							// - all state messages
							// - In case there is no state message: all transient messages of severity warning
							// The standard transient message dialog will be suppressed in this case. In particular the generic error message named above will not be shown.
							// If case 1 is not applicable case 2 is considered applicable if at least one state message of severity error is available.
							// Also in this case the standard transient message dialog will be suppressed.
							// If none of the cases above is applicable case 3 is considered to be applicable (either b) or a) with an empty list of state messages).
							// Therefore, all existing transient messages will be shown.
							var aStateMessageAfterSave = fnGetMessagesFromContextFilter(oContextFilter, oMessageManager);
							fnRemoveTransientMessages(aStateMessagesBeforeSave, aStateMessageAfterSave);
							if (!oCreateDialogContext) {
								MessageUtils.handleError(MessageUtils.operations.activateDraftEntity, oController, oServices, oError, null, {
									"412": fnHandleWarning.bind(null, aStateMessageAfterSave)
								});
								if (!bWarningOccured){
									reject();
								}
							}
						});
					});
				});
				return oRet;
			}

			function getActionUtil(mParameters){
				return new ActionUtil(mParameters);
			}

			function callActionImpl(mParameters, oState, fnResolve, fnReject){
				if (oBusyHelper.isBusy()){
					fnReject();
					return;
				}
				var aSuccess = [];
				var aFailed = [];
				var aWarning = [];
				var bSuccess = false;
				var mAdditionalParmsData;
				var aWarningIndex = [];

				var sFunctionImportPath = mParameters.functionImportPath;
				var aCurrentContexts = mParameters.contexts || [];
				var oSourceControl = mParameters.sourceControl;
				var sFunctionImportLabel = mParameters.label;
				var sOperationGrouping = mParameters.operationGrouping;
				var oSkipProperties = mParameters.skipProperties;

				var fnObjectPageExistsForEntitySet = function(oPage, sEntitySet){
					if (oPage.pages){
						for (var i in oPage.pages){
							var oSubPage = oPage.pages[i];
							if (oSubPage.component.list != true && oSubPage.entitySet === sEntitySet){
								return true;
							} else {
								var bResult = fnObjectPageExistsForEntitySet(oSubPage, sEntitySet);
								if (bResult){
									return true;
								}
							}
						}
					}
					return false;
				};

				var fnNavigationAllowed = function(oComponent, oResponseContext){
					var oConfig = oComponent.getAppComponent().getConfig();
					if (oResponseContext && oResponseContext.sPath){
						var sResponseEntitySet = oResponseContext.sPath.split("(")[0].replace("/", "");
						return fnObjectPageExistsForEntitySet(oConfig.pages[0], sResponseEntitySet);
					}
					return false;
				};

				var fnCleanUpContext =  function(){
					// remove pending request from the last change of the model
					// actually, this should rather be done by ActionUtil itself
					if (aCurrentContexts[0]){
						var oModel = aCurrentContexts[0].oModel;
						if (oModel && oModel.hasPendingChanges()){
							oModel.resetChanges();
						}
					}
				};

				var fnActionPopUpReject = function(oError){
					// function is called, when the user cancels the action (on the popup to enter parameters - before sedning a rquest to the backend)
					fnCleanUpContext();
					fnReject(oError);
				};

				var fnShowWarningPopupIfRequired = function (aMessagesForUserDecision, fnDone){
					if (aMessagesForUserDecision.length > 0){
						var oCRUDActionHandler = oComponentUtils.getCRUDActionHandler();
						var fnBoundAction;
						if (aCurrentContexts.length === 0){
							fnBoundAction = fnInvokeAction.bind(null, false, false, aCurrentContexts); 
						} else {
							var aWarningContext = aCurrentContexts.filter(function (oContext, index){
								return aWarningIndex.includes("" + index);
							});
							fnBoundAction = fnInvokeAction.bind(null, false, false, aWarningContext);
						}
						var mParameters = {
							messagesForUserDecison: aMessagesForUserDecision,
							actionName: sFunctionImportLabel
						};
						oCRUDActionHandler.handleCRUDScenario(4, fnBoundAction, fnDone, "BOPFAction", mParameters);
						return;
					}
					fnDone();
				};

				// For now we are only supporting warning handling in case of single selection.
				var bWithWarningDialog = aCurrentContexts.length <= 1;

				var fnInvokeAction = function (bIsStrict, bWithWarningDialog, aContexts){
					if (!bIsStrict){
						// if bIsStrict is false means we are coming after accepting warnings, Thus we should be cleaning the pervious 
						// context
						fnCleanUpContext();
					}
					var oActionProcessor = getActionUtil({
						controller: oController,
						contexts: aContexts,
						applicationController: oServices.oApplicationController,
						operationGrouping: sOperationGrouping
					});
					oActionProcessor.call(sFunctionImportPath, sFunctionImportLabel, oComponentUtils.isDraftEnabled(), oSkipProperties, bIsStrict, mAdditionalParmsData).then(function(oResult){
						var oSessionParams = {};
						oSessionParams.actionLabel = sFunctionImportLabel;
						oBusyHelper.setBusy(oResult.executionPromise, null, oSessionParams);
						oResult.executionPromise.then(fnHandleResponse,fnHandleResponse);
					}, fnActionPopUpReject);

					var fnHandleResponse = function(vResponse) {
						var aResponse = Array.isArray(vResponse) ? vResponse : [vResponse];
						var aPaths = getIndexArray(aResponse);
						// We need to properly formate response in order to correctly parse it
						var aFormattedResponse = aResponse.map(function (oResp){
						    var resp = oResp.error || oResp.response;
						    if (resp){
							   resp.actionContext = oResp.actionContext;
							}
						  return resp;
						});
						// userEnteredAdditionalParams represents the parameter that user has entered in parameter dialog,
						// We get back these param in order to fill the parameter dialog, when user accepts the warning and proceeds. 
						// We do this to avoid reentering the same data again in paramater dialog.
						mAdditionalParmsData = aResponse[0].userEnteredAdditionalParams;
						var oParsedResult = fnParseResponse(aPaths, aFormattedResponse, bWithWarningDialog);
						aFailed = aFailed.concat(mapToArray(oParsedResult.mFailed));
						aSuccess = aSuccess.concat(mapToArray(oParsedResult.mSuccess));
						aWarningIndex = Object.keys(oParsedResult.mWarning);
						aWarning = mapToArray(oParsedResult.mWarning);
						fnShowWarningPopupIfRequired(oParsedResult.aMessagesForUserDecision, fnDone.bind(null, aResponse));
					};
					var fnDone = function(aResponses){	
						var aTotalResp = aFailed.concat(aSuccess.concat(aWarning));
						if (aTotalResp.length > 1){
							// case for multiple selection. Some of them may fail or throw warning, so show a hint if any warning occurs.
							var bWarningOccured = aWarning.length > 0;
							var aTotalFailed = aFailed.concat(aWarning);
							var iTotalResponse = aTotalResp.length;
							var iTotalFailed = aTotalFailed.length;
							if (iTotalFailed > 0){
								var sMessageText;
								if (iTotalResponse === iTotalFailed){
									sMessageText = oCommonUtils.getText("ST_GENERIC_NOT_PROCESSED_RECORDS_PLURAL");
								} else {
									sMessageText = oCommonUtils.getText("ST_GENERIC_NOT_PROCESSED_RECORDS", iTotalFailed, iTotalResponse);
								}
								if (bWarningOccured){
									sMessageText = sMessageText + '\n';
									if (iTotalFailed === 1){
										sMessageText = sMessageText + oCommonUtils.getText("ST_GENERIC_ACTION_WITH_WARNING_SUGGESTION_SINGULAR");
									} else {
										sMessageText = sMessageText + oCommonUtils.getText("ST_GENERIC_ACTION_WITH_WARNING_SUGGESTION_PLURAL");
									}
								}
								oBusyHelper.getUnbusy().then(function (){
									if (aFailed.length > 1){
										MessageBox.error(sMessageText);
									} else {
										MessageBox.warning(sMessageText);
									}
								});
							}
						}
						var oResponse, oResponseContext, oComponent, bNavigationAllowed;
						bSuccess = bSuccess || oActionProcessor.getExecutedSuccessfully();
						if (bSuccess){
							var oActionContext;
							if (aSuccess.length === 1 && aWarning.length === 0 && aFailed.length === 0){
								// only one context, handle as single action call
								oResponse = aSuccess[0];
								oActionContext = aResponses[0].actionContext;
							}
							oResponseContext = oResponse && oResponse.context;
							var oContextInfo;
							if (oResponseContext && oResponseContext.getObject()){
								oContextInfo = oComponentUtils.registerContext(oResponseContext);
							}
		
							oComponent = oController.getOwnerComponent();
		
							bNavigationAllowed = fnNavigationAllowed(oComponent, oResponseContext);
		
							if (bNavigationAllowed && oResponseContext && oResponseContext !== oActionContext && oResponseContext.getPath() !==
								"/undefined"){
								if (oSourceControl){
									oCommonUtils.navigateFromListItem(oResponseContext, false);
								} else {
									oServices.oApplication.navigateToSubContext(oResponseContext, false, oContextInfo.bIsDraft ? 2 * (1 + oContextInfo.bIsCreate) : 1, oContextInfo);
								}
							}
							var oTableBindingInfo = oCommonUtils.getTableBindingInfo(oSourceControl);
							var oListBinding = oTableBindingInfo && oTableBindingInfo.binding;
							if (oListBinding && oListBinding.oEntityType){
								// update the enablement of toolbar buttons
								oCommonUtils.setEnabledToolbarButtons(oSourceControl);

								// update the enablement of footer button if on the List Report
								if (oComponentUtils.isListReportTemplate()){
									oCommonUtils.setEnabledFooterButtons(oSourceControl);
								}
							}
							fnResolve(aTotalResp);
						} else {
							fnCleanUpContext();
							fnReject(aTotalResp);
						}
					};
				};
				fnInvokeAction(true, bWithWarningDialog, aCurrentContexts);
			}

			/*
			 * Calls an OData action (also called OData function import). Afterwards the message handling
			 * is triggered for the returned messages.
			 *
			 * @param {object} mParameters Parameters which are used to identify and fire action
			 * @param {array} mParameters.contexts Contexts relevant for action
			 * @param {string} mParameters.functionImportPath Path to the OData function import
			 * @param {object} [mParameters.sourceControl] Control where a navigation starts (e.g. table)
			 * @param {object} [mParameters.navigationProperty] Property to navigate after action
			 * @param {string} [mParameters.label] Text for the confirmation popup
			 *
			 * @returns {Promise} A Promise that resolves if the action has been executed successfully
			 *
			 * @public
			 */
			function callAction(mParameters, oState) {
				var oRet = new Promise(function(fnResolve, fnReject){
					oServices.oApplication.performAfterSideEffectExecution(callActionImpl.bind(null, mParameters, oState, fnResolve, fnReject));
				});
				return oRet;
			}

			/*
			 * Adds an entry to a table. Only called in draft scenarios.
			 *
			 * @param {sap.ui.table.Table|sap.m.Table|sap.ui.comp.smarttable.SmartTable} oTable The table to which an entry has been added
			 */
			function addEntry(oTable, oPredefinedValues) {
				if (!oTable) {
					throw new FeError(sClassName, "Unknown Table");
				}

				var sBindingPath = "";
				var sTableBindingPath = "";
				var sEntitySet;
				var oComponent = oController.getOwnerComponent();
				var oAppComponent = oComponent.getAppComponent();
				if (oComponent.getMetadata().getName() === "sap.suite.ui.generic.template.ListReport.Component") { // ToDo: OPAs for the inline create in object page and sub object page, as the current OPA mockserver setup has to be enhanced we have planned to do in using a internal backlog - LROPBANGALORE5-1093
					sEntitySet = (oComponent.getCreationEntitySet && oComponent.getCreationEntitySet()) || (oTable.getEntitySet && oTable.getEntitySet());
				} else {
					sEntitySet = (oComponent.getCreationEntitySet && oComponent.getCreationEntitySet()) ||  oComponent.getEntitySet();
				}
				var oEntityType, oEntitySet, oNavigationEnd, oMetaModel;
				var oView = oController.getView();
				var oModel = oView.getModel();
				var oViewContext = oView.getBindingContext();
				if (oViewContext) {
					// Detail screen
					sTableBindingPath = oCommonUtils.getTableBindingInfo(oTable).path;

					// get entityset of navigation property
					oMetaModel = oModel.getMetaModel();
					oEntitySet = oMetaModel.getODataEntitySet(sEntitySet);
					oEntityType = oMetaModel.getODataEntityType(oEntitySet.entityType);
					oNavigationEnd = oMetaModel.getODataAssociationSetEnd(oEntityType, sTableBindingPath);
					if (oNavigationEnd) {
						sEntitySet = oNavigationEnd.entitySet;
					}

					// create binding path
					sTableBindingPath = "/" + sTableBindingPath;
					sBindingPath = oComponent.getComponentContainer().getElementBinding().getPath() + sTableBindingPath;
				} else {
					// on list, support only one entityset mapped to the root component
					sBindingPath = "/" + sEntitySet;
				}

				return new Promise(function(fnResolve, fnReject) {
					// Method will be called in case the create has to be performed on a DraftEntity. For better performance Fe would check
					// whether the expand information in the PreProcessor data is stored in the localStorage. In case this is available Fe
					// will pass the expand nodes and read the newly created instance information. PreProcessor data is always stored with
					// a cache key which ensures Fe don't work with stale data
					var aCacheKeys;
					aCacheKeys = CacheHelper.getCacheKeyPartsAsyc(oModel);
					Promise.all(aCacheKeys).then(function(aKeys) {
						function fnSetBusy(oPromise) {
							oServices.oApplication.getBusyHelper().setBusy(oPromise);
						}
						var sRootExpand;
						if (isContentIdReferencingAllowed()) {
							var oKey = CacheHelper.getCacheKey(oAppComponent.getId(), sEntitySet, aKeys);
							sRootExpand = CacheHelper.readFromLocalStorage(oKey);
						} else {
							sRootExpand = null;
						}
						var oSettings = oComponentUtils.getSettings();
						//consolidated all paramers as param list was growing
						var oParameters = {
							sRootExpand: sRootExpand,
							oController: oController,
							oApplicationController: oServices.oApplicationController,
							bUseNewActionForCreate: oSettings && oSettings.useNewActionForCreate,
							fnSetBusy: fnSetBusy
						};
						var oCreatePromise = oCreatePromise = CRUDHelper.create(oServices.oDraftController,
							sEntitySet,
							sBindingPath,
							oModel,
							oServices.oApplication,
							oPredefinedValues,
							oParameters
						);

						oCreatePromise.catch(
							handleError.bind(null,
								MessageUtils.operations.addEntry,
								function(oError){
									fnReject();
									if (oError) {
										throw oError;
									}
								}
							)
						);
						oCreatePromise.then(function(oContext) {
							oServices.oApplication.markCurrentDraftAsModified();
							fnResolve(oContext);
						});
					});
				});
			}

			/* eslint-disable */
			var handleError = testableHelper.testable(handleError, "handleError");
			var getActionUtil = testableHelper.testable(getActionUtil, "getActionUtil");
			/* eslint-enable */

			return {
				editEntity: editEntity,
				deleteEntity: deleteEntity,
				deleteEntities: deleteEntities,
				saveEntity: saveEntity,
				activateDraftEntity: activateDraftEntity,
				discardDraft: discardDraft,
				callAction: callAction,
				addEntry: addEntry,
				updateMultipleEntities: updateMultipleEntities
			};
		}

		return BaseObject.extend("sap.suite.ui.generic.template.lib.CRUDManager", {
				constructor: function(oController, oComponentUtils, oServices, oCommonUtils, oBusyHelper) {
					extend(this, getMethods(oController, oComponentUtils, oServices, oCommonUtils, oBusyHelper));
				}
			});
	});
