(function (global) {
  'use strict';

  var BUCKET = 'gait-video-uploads';

  function configured() {
    return !!(global.__SUPABASE_URL__ && global.__SUPABASE_ANON_KEY__);
  }

  function requireConfig() {
    if (!configured()) throw new Error('Supabase 未配置，暂时无法使用扫码上传');
  }

  function headers(contentType) {
    return {
      apikey: global.__SUPABASE_ANON_KEY__,
      Authorization: 'Bearer ' + global.__SUPABASE_ANON_KEY__,
      'Content-Type': contentType || 'application/json'
    };
  }

  async function rpc(name, body) {
    requireConfig();
    var response = await global.fetch(global.__SUPABASE_URL__.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: headers(), body: JSON.stringify(body || {})
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  function one(result) {
    return Array.isArray(result) ? result[0] : result;
  }

  async function createSession(side) {
    var session = one(await rpc('create_gait_video_upload_session', { p_side: side }));
    return {
      sessionId: session.session_id,
      uploadToken: session.upload_token,
      expiresAt: session.expires_at
    };
  }

  function getSession(sessionId, token) {
    return rpc('get_gait_video_upload_session', {
      p_session_id: sessionId,
      p_upload_token: token
    }).then(one);
  }

  function buildUploadUrl(session) {
    var base = global.location.origin + global.location.pathname.replace(/[^/]*$/, '');
    var query = new URLSearchParams({
      session: session.sessionId || session.session_id,
      token: session.uploadToken || session.upload_token
    });
    return base + 'gait-upload.html?' + query.toString();
  }

  async function sha256(file) {
    var digest = await global.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function putObject(path, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new global.XMLHttpRequest();
      xhr.open('PUT', global.__SUPABASE_URL__.replace(/\/$/, '') + '/storage/v1/object/' + BUCKET + '/' + path);
      var requestHeaders = headers(file.type || 'application/octet-stream');
      requestHeaders['x-upsert'] = 'true';
      Object.keys(requestHeaders).forEach(function (name) {
        xhr.setRequestHeader(name, requestHeaders[name]);
      });
      xhr.upload.onprogress = function (event) {
        if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total);
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(xhr.responseText || ('视频上传失败：HTTP ' + xhr.status)));
      };
      xhr.onerror = function () { reject(new Error('视频上传网络中断，请重试')); };
      xhr.send(file);
    });
  }

  async function uploadVideo(input) {
    var file = input.file;
    var hash = await sha256(file);
    var path = await rpc('prepare_gait_video_upload', {
      p_session_id: input.sessionId,
      p_upload_token: input.token,
      p_file_name: file.name,
      p_content_type: file.type || 'application/octet-stream',
      p_file_size: file.size,
      p_sha256: hash
    });
    if (input.onProgress) input.onProgress(0);
    await putObject(path, file, input.onProgress);
    await rpc('complete_gait_video_upload', {
      p_session_id: input.sessionId,
      p_upload_token: input.token,
      p_file_size: file.size,
      p_sha256: hash
    });
    return { path: path, sha256: hash };
  }

  async function deleteObject(path) {
    var response = await global.fetch(global.__SUPABASE_URL__.replace(/\/$/, '') + '/storage/v1/object/' + BUCKET, {
      method: 'DELETE', headers: headers(), body: JSON.stringify({ prefixes: [path] })
    });
    if (!response.ok) throw new Error(await response.text());
  }

  async function receiveVideo(input) {
    var session = await getSession(input.sessionId, input.token);
    if (!session || session.status !== 'ready') throw new Error('手机视频尚未上传完成');
    var response = await global.fetch(global.__SUPABASE_URL__.replace(/\/$/, '') + '/storage/v1/object/' + BUCKET + '/' + session.object_path, {
      method: 'GET', headers: headers(session.content_type || 'application/octet-stream')
    });
    if (!response.ok) throw new Error(await response.text());
    var blob = await response.blob();
    var hash = await sha256(blob);
    if (hash !== session.sha256) throw new Error('手机与电脑收到的文件校验不一致，已拒绝导入');
    await deleteObject(session.object_path);
    await rpc('consume_gait_video_upload', {
      p_session_id: input.sessionId,
      p_upload_token: input.token
    });
    return {
      file: new File([blob], session.file_name || 'gait-video.mp4', {
        type: session.content_type || blob.type || 'video/mp4'
      }),
      sha256: hash,
      session: session
    };
  }

  global.__gaitTransfer = {
    configured: configured,
    createSession: createSession,
    getSession: getSession,
    buildUploadUrl: buildUploadUrl,
    sha256: sha256,
    uploadVideo: uploadVideo,
    receiveVideo: receiveVideo
  };
})(window);
