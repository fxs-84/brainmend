(function (global) {
  'use strict';

  var active = null;
  var qrScript = null;
  var SCRIPT_URL = document.currentScript && document.currentScript.src || global.location.href;
  var QR_LIBRARY_URL = new URL('./vendor/qrcode-generator.js', SCRIPT_URL).href;

  function loadQrLibrary() {
    if (global.qrcode) return Promise.resolve();
    if (qrScript) return qrScript;
    qrScript = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = QR_LIBRARY_URL;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('二维码组件加载失败，请检查网络')); };
      document.head.appendChild(script);
    });
    return qrScript;
  }

  function close() {
    if (active) active.cancelled = true;
    active = null;
    var overlay = document.getElementById('gait-qr-overlay');
    if (overlay) overlay.remove();
  }

  function render(side, url) {
    var overlay = document.createElement('div');
    overlay.id = 'gait-qr-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#102b27aa;display:flex;align-items:center;justify-content:center;padding:18px;';
    overlay.innerHTML = '<section style="background:#fff;border-radius:16px;padding:24px;max-width:430px;width:100%;text-align:center;box-shadow:0 20px 60px #0004">' +
      '<h3 style="margin:0 0 8px">手机扫码上传' + (side === 'left' ? '左侧' : '右侧') + '视频</h3>' +
      '<p style="color:#64748b;font-size:13px">从手机相册选择原视频，不经过聊天软件压缩。会话 30 分钟内有效。</p>' +
      '<div id="gait-qr-image" style="display:flex;justify-content:center;margin:14px 0"></div>' +
      '<div id="gait-qr-url" style="font-size:10px;color:#94a3b8;word-break:break-all">' + url + '</div>' +
      '<div id="gait-qr-status" role="status" style="margin:16px 0;color:#0f766e;font-size:14px">等待手机扫码上传…</div>' +
      '<button id="gait-qr-close" type="button" style="padding:8px 22px;border:1px solid #b8cbc6;border-radius:8px;background:#fff;cursor:pointer">取消并关闭</button></section>';
    document.body.appendChild(overlay);
    document.getElementById('gait-qr-close').addEventListener('click', close);
    return loadQrLibrary().then(function () {
      var qr = global.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      var image = document.getElementById('gait-qr-image');
      if (image) {
        image.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4 });
        var svg = image.querySelector('svg');
        svg.style.display = 'block';
        svg.style.width = '220px';
        svg.style.height = '220px';
        svg.style.maxWidth = '100%';
      }
    });
  }

  function status(text) {
    var element = document.getElementById('gait-qr-status');
    if (element) element.textContent = text;
  }

  async function open(side, handlers) {
    close();
    if (!global.__gaitTransfer.configured()) throw new Error('Supabase 未配置，无法使用扫码上传');
    var session = await global.__gaitTransfer.createSession(side);
    var url = global.__gaitTransfer.buildUploadUrl(session);
    var current = { cancelled: false, session: session };
    active = current;
    await render(side, url);
    (async function poll() {
      try {
        while (!current.cancelled) {
          var info = await global.__gaitTransfer.getSession(session.sessionId, session.uploadToken);
          if (info && info.status === 'uploading') status('手机正在上传，请保持手机页面打开…');
          if (info && info.status === 'ready') {
            status('上传完成，电脑正在下载并核对 SHA-256…');
            var received = await global.__gaitTransfer.receiveVideo(session);
            if (current.cancelled) return;
            status('原文件校验一致，正在导入…');
            await handlers.onFile(received.file, received);
            close();
            return;
          }
          await new Promise(function (resolve) { setTimeout(resolve, 1800); });
        }
      } catch (error) {
        if (current.cancelled) return;
        status('接收失败：' + (error.message || String(error)) + '。可关闭后重新生成二维码。');
        if (handlers.onError) handlers.onError(error);
      }
    })();
  }

  global.__gaitQrDesktop = { open: open, close: close };
})(window);
