(function (global) {
  'use strict';

  var BASE_URL = new URL('./vendor/ffmpeg/', document.currentScript && document.currentScript.src || global.location.href).href;
  var ffmpegPromise = null;

  function loadFfmpeg() {
    if (ffmpegPromise) return ffmpegPromise;
    ffmpegPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = BASE_URL + 'ffmpeg.js';
      script.onload = function () {
        var ffmpeg = new global.FFmpegWASM.FFmpeg();
        ffmpeg.load({
          coreURL: BASE_URL + 'ffmpeg-core.js',
          wasmURL: BASE_URL + 'ffmpeg-core.wasm'
        }).then(function () { resolve(ffmpeg); }, reject);
      };
      script.onerror = function () { reject(new Error('软件解码组件加载失败，请检查网络后重试')); };
      document.head.appendChild(script);
    });
    ffmpegPromise.catch(function () { ffmpegPromise = null; });
    return ffmpegPromise;
  }

  async function transcodeVideo(file, onProgress) {
    var ffmpeg = await loadFfmpeg();
    var progressListener = null;
    if (onProgress) {
      progressListener = function (event) {
        if (event && isFinite(event.progress)) onProgress(Math.max(0, Math.min(1, event.progress)));
      };
      ffmpeg.on('progress', progressListener);
    }
    var input = new Uint8Array(await file.arrayBuffer());
    await ffmpeg.writeFile('input.mp4', input);
    var exitCode;
    try {
      exitCode = await ffmpeg.exec([
        '-i', 'input.mp4',
        '-map', '0:v:0', '-an',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-threads', '1',
        '-movflags', '+faststart', 'output.mp4'
      ]);
      if (exitCode !== 0) throw new Error('软件转码失败，FFmpeg 退出状态：' + exitCode);
      var data = await ffmpeg.readFile('output.mp4');
      var bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      var name = (file.name || 'gait-video').replace(/\.[^.]+$/, '') + '-h264.mp4';
      return new File([bytes], name, { type: 'video/mp4' });
    } finally {
      if (progressListener) ffmpeg.off('progress', progressListener);
      await ffmpeg.deleteFile('input.mp4').catch(function () {});
      await ffmpeg.deleteFile('output.mp4').catch(function () {});
    }
  }

  global.__gaitTranscode = { transcodeVideo: transcodeVideo };
})(window);
