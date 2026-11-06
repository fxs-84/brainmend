(function () {
  'use strict';

  var query = new URLSearchParams(location.search);
  var sessionId = query.get('session');
  var token = query.get('token');
  var fileInput = document.getElementById('gait-mobile-file');
  var button = document.getElementById('gait-mobile-upload');
  var status = document.getElementById('gait-mobile-status');
  var info = document.getElementById('gait-mobile-file-info');
  var progress = document.getElementById('gait-mobile-progress');

  function message(text) { status.textContent = text; }
  if (!sessionId || !token) {
    message('二维码缺少上传会话，请让治疗师重新生成');
    fileInput.disabled = true;
  }
  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    button.disabled = !file || !sessionId || !token;
    info.textContent = file ? file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + ' MB' : '未选择视频';
    message('');
    progress.style.width = '0%';
  });
  button.addEventListener('click', async function () {
    var file = fileInput.files[0];
    if (!file) return;
    button.disabled = true;
    fileInput.disabled = true;
    try {
      message('正在计算原文件 SHA-256，请稍候…');
      await window.__gaitTransfer.uploadVideo({
        sessionId: sessionId,
        token: token,
        file: file,
        onProgress: function (fraction) {
          var percent = Math.round(fraction * 100);
          progress.style.width = percent + '%';
          message('正在上传原视频 · ' + percent + '%');
        }
      });
      progress.style.width = '100%';
      message('上传完成，电脑正在接收并校验。可以关闭此页面。');
    } catch (error) {
      message('上传失败：' + (error.message || String(error)));
      button.disabled = false;
      fileInput.disabled = false;
    }
  });
})();
