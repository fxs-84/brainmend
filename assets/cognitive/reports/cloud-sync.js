// assets/cognitive/reports/cloud-sync.js
// 神经系统自评 · 云端可靠保存层
//
// 设计目标 (核心需求: 不能因网络原因丢数据):
//   1. localStorage 写入永远先于云端上传 (本地优先)
//   2. 云端 PUT 用指数退避重试 (3 次: 0s / 3s / 10s)
//   3. AbortController 15s 超时, 防止请求挂死
//   4. navigator.sendBeacon 兜底 (页面关闭时也能投递, 不保证成功但优于丢弃)
//   5. online / visibilitychange 事件触发后台重试
//   6. 失败记录入队 (cog_records 持久化), 后续加载页面自动重试
//
// API:
//   saveReportReliably(record): Promise<{ ok, error?, attempts?, sha? }>
//   flushPendingReports(): void   // 扫描 cog_records 中未同步的记录, 逐个重试
//   onPendingChange(cb): void     // 队列变化订阅 (UI 状态行用)
//
// 依赖:
//   - window._uploadToCloud (cognitive-report.js 暴露, 单次 PUT 包装)
//   - localStorage.cog_records (现有记录存储)
//   - navigator.onLine, online/visibilitychange 事件

(function (global) {
  'use strict';

  // ============ 常量 ============
  var MAX_ATTEMPTS = 3;                  // 总尝试次数 (含首次)
  var RETRY_DELAYS_MS = [0, 3000, 10000]; // 退避: 第1次立刻, 第2次3s, 第3次10s
  var REQUEST_TIMEOUT_MS = 15000;        // 单次 PUT 超时
  var STORAGE_KEY = 'cog_records';
  var FLUSH_INTERVAL_MS = 30000;         // 后台扫描周期: 30s
  var FLUSH_FLAG_KEY = '__qnrFlushScheduled__';

  // ============ 内部状态 ============
  var _pendingListeners = [];
  var _flushing = false; // 防止并发 flush

  // ============ 工具函数 ============
  function _readRecords() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function _writeRecords(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
    catch (e) {}
  }
  function _findRecord(id) {
    var arr = _readRecords();
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function _updateRecord(id, mutator) {
    var arr = _readRecords();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) {
        mutator(arr[i]);
        _writeRecords(arr);
        _notifyPendingChange();
        return arr[i];
      }
    }
    return null;
  }

  function _notifyPendingChange() {
    try {
      var pending = _listPending();
      _pendingListeners.forEach(function (cb) {
        try { cb(pending); } catch (e) {}
      });
    } catch (e) {}
  }

  function _listPending() {
    return _readRecords().filter(function (r) {
      return r && r.id && !r._cloudId && r._cloudErr !== 'no_token';
    });
  }

  // ============ 单次 PUT (带超时) ============
  function _putOnce(record) {
    return new Promise(function (resolve) {
      if (!global._uploadToCloud) {
        resolve({ ok: false, error: 'no_uploader' });
        return;
      }
      // _uploadToCloud 内部没有 timeout, 我们用 Promise.race 加一层超时保护
      var done = false;
      var timeoutId = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ ok: false, error: 'timeout' });
      }, REQUEST_TIMEOUT_MS);
      try {
        Promise.resolve(global._uploadToCloud(record)).then(function (res) {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          resolve(res || { ok: false, error: 'no_response' });
        }, function (err) {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          resolve({ ok: false, error: String((err && err.message) || err || 'unknown') });
        });
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        resolve({ ok: false, error: String((e && e.message) || e || 'unknown') });
      }
    });
  }

  // ============ sendBeacon 兜底 (浏览器关闭时也能投递) ============
  // sendBeacon 的限制: Content-Type 强制 text/plain, 接收端按字符串处理
  // GitHub Contents API 不支持, 所以这里用 sendBeacon 把"待同步清单"投到一个轻量端点
  // 实际场景中, GitHub Contents API 不支持 sendBeacon, 我们改用 pagehide + beforeunload 做最后一次尝试
  function _bestEffortFlush() {
    try {
      var pending = _listPending();
      if (!pending.length) return;
      // 尝试一次普通 fetch (不带超时, 因为 sendBeacon 不支持自定义 headers/body 编码)
      // 如果浏览器正要关闭, 这个 fetch 大概率也会被丢弃 — 但至少给了它一次机会
      if (pending.length && global._uploadToCloud) {
        // 不 await, 不阻塞 unload
        pending.forEach(function (rec) {
          try { Promise.resolve(global._uploadToCloud(rec)); } catch (e) {}
        });
      }
    } catch (e) {}
  }

  // ============ 核心: 可信赖保存 ============
  //   流程: 标记 pending → 立即写入 localStorage → 尝试上传 (重试) → 标记 synced / 失败入队
  function saveReportReliably(record) {
    if (!record || !record.id) {
      return Promise.resolve({ ok: false, error: 'invalid_record' });
    }
    // 1. 标记 pending 状态
    _updateRecord(record.id, function (r) {
      r._cloudStatus = 'pending';   // UI 状态行用
      delete r._cloudErr;
    });
    _notifyPendingChange();

    // 2. 立即保存 localStorage (这一步永远不会失败, 只要用户没清缓存)
    try {
      var arr = _readRecords();
      var exists = false;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === record.id) { exists = true; break; }
      if (!exists) {
        arr.unshift(record);
        if (arr.length > 100) arr = arr.slice(0, 100);
        _writeRecords(arr);
      }
    } catch (e) {}

    // 3. 上传云端 (指数退避重试)
    return _retryUpload(record).then(function (result) {
      if (result.ok) {
        _updateRecord(record.id, function (r) {
          r._cloudId = result.sha;
          r._cloudStatus = 'synced';
          delete r._cloudErr;
        });
      } else {
        _updateRecord(record.id, function (r) {
          r._cloudErr = result.error || 'unknown';
          r._cloudStatus = 'failed';
          r._cloudAttempts = (r._cloudAttempts || 0) + result.attempts;
        });
      }
      _notifyPendingChange();
      return result;
    });
  }

  function _retryUpload(record) {
    return new Promise(function (resolve) {
      var attempt = 0;
      var lastResult = null;
      function tryOnce() {
        _updateRecord(record.id, function (r) { r._cloudStatus = 'syncing'; });
        _notifyPendingChange();
        _putOnce(record).then(function (res) {
          attempt++;
          lastResult = res;
          if (res && res.ok) {
            resolve({ ok: true, sha: res.sha, attempts: attempt });
            return;
          }
          // 不可重试的错误: 401/403/422/422(no_token) → 直接放弃
          var err = (res && res.error) || 'unknown';
          if (_isFatalError(err)) {
            resolve({ ok: false, error: err, attempts: attempt });
            return;
          }
          if (attempt >= MAX_ATTEMPTS) {
            resolve({ ok: false, error: err, attempts: attempt });
            return;
          }
          // 等待下一次重试
          var delay = RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
          setTimeout(tryOnce, delay);
        });
      }
      tryOnce();
    });
  }

  function _isFatalError(err) {
    if (!err) return false;
    var s = String(err);
    if (s === 'no_token' || s === 'no_uploader' || s === 'bad_response') return true;
    if (/^HTTP (401|403|404|422)(\b|:)/.test(s)) return true;
    return false;
  }

  // ============ 后台 flush: 扫描未同步记录, 逐个重试 ============
  function flushPendingReports() {
    if (_flushing) return;
    _flushing = true;
    try {
      var pending = _listPending();
      if (!pending.length) { _flushing = false; return; }
      var queue = pending.slice();
      function next() {
        if (!queue.length) { _flushing = false; _notifyPendingChange(); return; }
        var rec = queue.shift();
        // 已同步 (其他标签页抢先成功) → 跳过
        var fresh = _findRecord(rec.id);
        if (!fresh || fresh._cloudId) { next(); return; }
        saveReportReliably(rec).then(next, next);
      }
      next();
    } catch (e) {
      _flushing = false;
    }
  }

  function _scheduleFlush() {
    if (global[FLUSH_FLAG_KEY]) return;
    global[FLUSH_FLAG_KEY] = true;
    // 节流: 多次触发合并成一次
    setTimeout(function () {
      global[FLUSH_FLAG_KEY] = false;
      try { flushPendingReports(); } catch (e) {}
    }, 1500);
  }

  function _installBackgroundHooks() {
    // 网络恢复 → 重试
    global.addEventListener('online', _scheduleFlush);
    // 切回前台 → 重试
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') _scheduleFlush();
    });
    global.addEventListener('focus', _scheduleFlush);
    // 页面卸载 → 最后一次尝试
    global.addEventListener('pagehide', _bestEffortFlush);
    global.addEventListener('beforeunload', _bestEffortFlush);
    // 定时扫描 (兜底, 处理遗漏事件)
    setInterval(function () { try { flushPendingReports(); } catch (e) {} }, FLUSH_INTERVAL_MS);
  }

  // ============ 订阅 ============
  function onPendingChange(cb) {
    _pendingListeners.push(cb);
    // 立即回调一次 (初始状态)
    try { cb(_listPending()); } catch (e) {}
  }

  // ============ 暴露 API ============
  global.CloudSync = {
    saveReportReliably: saveReportReliably,
    flushPendingReports: flushPendingReports,
    onPendingChange: onPendingChange,
    listPending: _listPending,
    _installBackgroundHooks: _installBackgroundHooks,
  };
})(window);
