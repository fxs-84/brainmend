(function (global) {
  'use strict';

  var DB_NAME = 'brainmend-gait-v2';
  var STORE = 'workspace';

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('当前浏览器不支持 IndexedDB'));
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  async function saveDraft(session) {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(session, 'current');
      transaction.oncomplete = function () { db.close(); resolve(); };
      transaction.onerror = function () { db.close(); reject(transaction.error); };
    });
  }

  async function loadDraft() {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE, 'readonly');
      var request = transaction.objectStore(STORE).get('current');
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { reject(request.error); };
      transaction.oncomplete = function () { db.close(); };
      transaction.onerror = function () { db.close(); reject(transaction.error); };
    });
  }

  async function clearDraft() {
    var db = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete('current');
      transaction.oncomplete = function () { db.close(); resolve(); };
      transaction.onerror = function () { db.close(); reject(transaction.error); };
    });
  }

  global.__gaitStorage = {
    saveDraft: saveDraft,
    loadDraft: loadDraft,
    clearDraft: clearDraft
  };
})(window);
