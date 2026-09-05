// 《回声编织者》第二章《沉默的钟楼·垂直 VOR》demo 装配（镜像第一章 demo.js）
// 俯仰轴版：头上下点头、眼盯光球，固定场景下靶环在上方/下方滑动，套住光球即命中
// bootVorCh2(opts) → api；stop() 完整清理（循环/音频/DOM/订阅）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HeadPoseSource } from './input/HeadPoseSource.js';
import { BleImuSource } from './input/BleImuSource.js';
import { SignalChain } from './core/SignalChain.js';
import { VorQualityEvaluator } from './core/VorQualityEvaluator.js';
import { TrainingPaceController } from './core/TrainingPaceController.js';
import { TargetDrill } from './core/TargetDrill.js';
import { Metronome } from './core/Metronome.js';
import { Ch2ClockTower } from './chapters/Ch2ClockTower.js';
import { HUD } from './hud-ch2.js';
import { SymptomCheck } from './core/SymptomCheck.js';
import { SessionRecorder } from './core/SessionRecorder.js';
import { submitVorSession, flushPending } from './vorSupabase.js';

export function bootVorCh2({
  container = document.body,
  mode = null,               // 'ble' | 'device' | 'keyboard' | 'auto' | 'external'，null=显示选择覆盖层
  integrated = false,        // 嵌入主游戏面板时：无 BLE 按钮（蓝牙由主游戏 UI 负责）
  gyroFeed = null,           // 嵌入模式：() => ({yaw,pitch,roll}|null)，16ms 轮询
  onExit = null,             // 结束/返回回调（默认 location.reload）
  overrides = {},            // {blocks, active, rest}（旧接口，保留兼容）
  skipSymptomCheck = false,  // 跳过训练前后 VAS 评分（仅测试/键盘演示）
} = {}) {
  // 治疗师处方透传（5.2）：URL 参数覆盖附录 A 默认值；token 用于 patient_ref 派生 + 上报
  const qs = new URLSearchParams(location.search);
  const rx = {
    token: qs.get('token') || overrides.token || '',
    freq: qs.get('freq') != null ? parseFloat(qs.get('freq')) : null,
    amp: qs.get('amp') != null ? parseFloat(qs.get('amp')) : null,
    active: qs.get('active') != null ? parseInt(qs.get('active'), 10) : null,
    rest: qs.get('rest') != null ? parseInt(qs.get('rest'), 10) : null,
    blocks: qs.get('blocks') != null ? parseInt(qs.get('blocks'), 10) : null,
    dailyLimit: qs.get('limit') != null ? parseInt(qs.get('limit'), 10) : null,
    skipVas: skipSymptomCheck || qs.get('skipvas') === '1',
  };
  const CFG = {
    amp: rx.amp ?? overrides.amp ?? 10,   // 颈椎屈伸保守幅度（第一章 yaw 为 15）
    freq: rx.freq ?? overrides.freq ?? 0.5,
    yawLimit: 20, pitchLimit: 15,
    activeSec: rx.active ?? overrides.active ?? 20,
    restSec: rx.rest ?? overrides.rest ?? 10,
    blocks: rx.blocks ?? overrides.blocks ?? 12,
    dailyLimitMin: rx.dailyLimit ?? overrides.dailyLimitMin ?? 20,
    token: rx.token,
    skipVas: rx.skipVas,
    segs: 12,                           // 12 齿轮（每 100 能量修复 1 个，见 addEnergy）
  };

  // --- 挂载点 ---
  const mount = document.createElement('div');
  mount.id = 'vor-ch2-root';
  mount.style.cssText = 'position:fixed;inset:0;z-index:1500;background:#0c0a08;';
  container.appendChild(mount);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  mount.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);

  // 泛光（4.1.6）：UnrealBloomPass 克制强度（只让光球/火花/轨迹发光，避免全屏高亮闪烁）；
  // FPS 过低自动关（6.3 降级链第一级），保住判定稳定性
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.78);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const keepBloom = qs.get('keepbloom') === '1';  // 演示/截图时强制保留泛光（跳过 FPS 降级）
  const noRender = qs.get('norender') === '1';    // E2E 逻辑验证：跳过像素渲染，消除软渲染性能对判定/锚定的干扰
  let useComposer = qs.get('bloom') !== '0';      // 泛光默认开；?bloom=0 可关；低性能设备 FPS 低自动降级关

  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', onResize);

  // --- 模块装配（第二章：判定轴 = pitch）---
  const input = new HeadPoseSource();
  // 判定窗口取 max(0.5s, 1 个完整周期)：0.5Hz 时 0.5s 窗口只覆盖 1/4 周期会误超阈值
  const chain = new SignalChain({ winSec: Math.max(0.5, 1 / CFG.freq), axis: 'pitch' });
  const evaluator = new VorQualityEvaluator({ amp: CFG.amp, freq: CFG.freq, axis: 'pitch' });
  const ch2 = new Ch2ClockTower(scene, camera);
  const metronome = new Metronome();
  const hud = new HUD(mount);
  const vas = new SymptomCheck(mount);
  const recorder = new SessionRecorder({ chapter: 2, token: CFG.token });

  // 与现有游戏同一注入通道（外部 IMU 桥 / E2E 均可直接调用）
  // 注意链式调用原实现：主游戏 bundle 的 D 状态也由它更新，直接覆盖会断掉嵌入模式的数据
  const prevInject = window.updateFromGyroscope;
  window.updateFromGyroscope = (o) => {
    input.setPose(o);
    try { prevInject && prevInject(o); } catch { /* 主游戏未加载时忽略 */ }
  };

  // 嵌入模式的外部数据轮询（读主游戏的 window.D，与其 BLE 管道共用）
  const feedTimer = gyroFeed ? setInterval(() => {
    const p = gyroFeed();
    if (p) input.setPose(p);
  }, 16) : null;

  const ble = new BleImuSource(
    (p) => input.setPose(p),
    (s) => { const el = mount.querySelector('#ble-status'); if (el) el.textContent = s; },
  );

  const exit = onExit || (() => location.reload());
  let rafId = 0;
  let finished = false;
  let preVas = null;

  // 单日有效训练剂量（3.4.5）：localStorage 按日期累计 active 秒
  function dailyKey() { return 'vor_daily_active_' + new Date().toISOString().slice(0, 10); }
  function dailyUsedSec() { try { return parseInt(localStorage.getItem(dailyKey()) || '0', 10); } catch { return 0; } }
  function dailyAddSec(sec) { try { localStorage.setItem(dailyKey(), String(dailyUsedSec() + Math.round(sec))); } catch {} }

  // 结束前收尾：症状判定 → 数据落地 → 上报 → 剂量累计
  function finalizeAndReport(ev) {
    const summaryExtra = {
      hits: drill.stats.hits, onBeat: drill.stats.onBeat,
      bestCombo: drill.stats.bestCombo, repaired: ch2.repaired,
    };
    if (ev) {
      summaryExtra.symptom_escalation = !!(ev.stop);
      summaryExtra.symptom_downgrade = !!(ev.downgrade);
      if (ev.manual) summaryExtra.aborted_by_unwell = true;
    }
    const session = recorder.finalize(summaryExtra);
    dailyAddSec(session.active_duration_sec);
    const upload = recorder.toUploadJSON();
    submitVorSession({ token: CFG.token, session: upload }).catch(() => {});
    flushPending().catch(() => {});
    return session;
  }

  async function finish(title, sub, { askVas = false, manualAbort = false } = {}) {
    if (finished) return;
    finished = true;
    metronome.stop();
    pace.paused = true;
    ch2.setGolden();

    // 症状闭环：正常训练结束才问 post VAS；"我不舒服"等同 >2 分，直接终止
    if (askVas && !CFG.skipVas) {
      try {
        const post = await vas.collect();
        const ev = SymptomCheck.evaluate(preVas, post);
        recorder.setSymptom(preVas, post);
        finalizeAndReport(ev);
        if (ev.stop) {
          sub = '症状较训练前明显加重，请立即休息。<br>若持续不适，请咨询医生，今日停止训练。';
        } else if (ev.downgrade) {
          sub += '<br>（症状略加重，下次训练建议降低强度）';
        }
      } catch { /* 弹层被销毁等异常：按无加重收尾 */ }
    } else {
      recorder.setSymptom(preVas, null);
      finalizeAndReport({ manual: manualAbort, stop: manualAbort });
    }
    hud.showOverlay(title, sub, [{ label: integrated ? '返回菜单' : '重新开始', primary: true, onClick: () => { stop(); exit(); } }]);
  }

  const pace = new TrainingPaceController({
    activeSec: CFG.activeSec, restSec: CFG.restSec, blocks: CFG.blocks,
    onChange: (s) => {
      recorder.blockEnd(); // 结算上一块（首次为空操作）
      hud.setBlock(s, pace.block, CFG.blocks);
      if (s === 'active') {
        recorder.blockStart(pace.block, 'active', { activeSec: CFG.activeSec, freq: CFG.freq });
        metronome.start(CFG.freq);
        input.endRestRecal();
      } else if (s === 'rest') {
        recorder.blockStart(pace.block, 'rest');
        metronome.stop();
        // Rest 块：准静止 1.5s 自动重校准零点（yaw+pitch 双轴同时消漂移，玩家零操作）
        input.beginRestRecal(() => hud.floatText('已回中', '#7fdc8c'));
      } else if (s === 'done') {
        metronome.stop();
        finish('训练结束',
          `命中 <b>${drill.stats.hits}</b> 次（节拍命中 ${drill.stats.onBeat}，最佳连击 x${drill.stats.bestCombo}），` +
          `修复齿轮 ${ch2.repaired}/${CFG.segs}。`, { askVas: true });
      } else {
        metronome.stop();
      }
    },
  });

  // --- 能量：命中 +20（节拍命中 +30），完美周期再 +10；每 100 能量修复 1 齿轮 ---
  // （与第一章同款经济：修复只绑完美周期时，真人点头 quality≥0.85 太难达成，永远修不动——实测反馈）
  let energy = 0;
  function addEnergy(n, flashColor) {
    if (finished) return;
    energy += n;
    if (flashColor) ch2.flash(flashColor);
    while (energy >= 100 && ch2.repaired < CFG.segs) {
      energy -= 100;
      ch2.repairSegment();
      metronome.chime([523, 659, 784, 1047], 0.11, 0.40); // 修复：长尾大三和弦钟声
      const wp = new THREE.Vector3();
      ch2.burst(ch2.orbWorldPos(wp), 24, 1.4);
      hud.floatText(`修复齿轮 ${ch2.repaired}/${CFG.segs}`, '#9fd8ff');
    }
    if (ch2.repaired >= CFG.segs) {
      pace.stop();
      ch2.ringBell();   // 修复完成：全部齿轮咬合 + 钟摆满幅 + 铜铃敲响
      metronome.chime([523, 659, 784, 1047], 0.14, 0.60);
      finish('钟楼苏醒！',
        `12 个齿轮全部咬合，沉睡的铜钟再次敲响！<br>` +
        `命中 ${drill.stats.hits} 次 · 节拍命中 ${drill.stats.onBeat} · 最佳连击 x${drill.stats.bestCombo}`, { askVas: true });
    }
    ch2.setEnergy(energy / 100);
  }

  // --- 靶心命中（核心玩法：点头到目标方位 = 击中，上下交替 = 垂直 VOR 往复）---
  const drill = new TargetDrill({ amp: CFG.amp });
  ch2.setTargetDelta(drill.bearing);
  drill.onSpawn(({ bearing }) => ch2.setTargetDelta(bearing));
  drill.onHit(({ onBeat, combo }) => {
    const wp = new THREE.Vector3();
    ch2.burst(ch2.orbWorldPos(wp), onBeat ? 40 : 25, onBeat ? 2.0 : 1.4);
    // 命中 = 全部压到低中频（节拍是 1760/1320 高音，命中绝不能到那个层），跟节拍"分层"
    metronome.punch(110, 0.25, 0.12);                    // 极低频鼓点（110Hz，<节拍最低 1320Hz）
    metronome.noise(0.10, 0.20);                          // 噪声爆裂（HP 200 LP 2500，全低中频）
    // 取消 click 脆击——之前 1568Hz 跟节拍 1760/1320 同层听感糊；现在不要这个
    if (onBeat) {
      metronome.chime([1760, 1976, 2349], 0.06, 0.50);    // 节拍命中奖励：长尾高音钟声（>节拍）
      if (combo >= 2) hud.floatText(`节拍连击 x${combo}`, '#ffd977');
    }
    addEnergy(onBeat ? 30 : 20, onBeat ? 0xffd977 : 0x7fdc8c);
  });

  // --- 周期质量（底层数据 + 完美奖励）；转向小火花（每秒约 1 次的即时反馈）---
  evaluator.onCycle((c) => {
    if (c.perfect) {
      recorder.perfectCycle();
      addEnergy(10, 0xffd977);
      hud.floatText(`完美周期 ${(c.quality * 100).toFixed(0)}%`, '#ffd977');
    }
  });
  evaluator.onTurn(() => {
    const wp = new THREE.Vector3();
    ch2.burst(ch2.orbWorldPos(wp), 6, 0.8);
  });

  // --- 启动流程 ---
  async function begin(m) {
    if (m === 'ble') {
      try {
        await ble.connect();          // 必须在用户手势里调用（按钮点击）
      } catch (e) {
        hud.showOverlay('蓝牙连接失败', e.message, [
          { label: '重试', primary: true, onClick: () => begin('ble') },
          { label: '返回', onClick: () => { stop(); exit(); } },
        ]);
        return;
      }
    }
    if (m === 'device') await input.enableSensors();
    if (m === 'keyboard') input.enableKeyboard();
    try { await navigator.wakeLock?.request('screen'); } catch { /* 不支持则忽略 */ }
    hud.showOverlay('校准中', '保持头部正中、目视光球，静止 <b>2</b> 秒…');
    input.startCalibration(2.0, () => {
      // 校准完成后才开始自动摆动：校准时若在动，零漂会测成非零均值，破坏周期符号校验
      if (m === 'auto') input.enableAuto(CFG.amp, CFG.freq, 'pitch');
      hud.hideOverlay(); pace.start();
    });
  }

  if (mode) {
    begin(mode);
  } else {
    hud.showOverlay('回声编织者 · 第二章（垂直 VOR）',
      '佩戴头戴陀螺仪，坐在显示器前（约一臂距离），座椅固定无滑轮。<br>' +
      '<b>上方/下方</b>会交替出现<b>目标环</b>：<b>点头/抬头</b>把它<b>套进光球并保持</b>即命中，' +
      '踩着节拍命中可连击。完美周期积攒修复，唤醒钟楼 12 个齿轮（每 3 完美周期修复 1 个）。<br>' +
      (integrated ? '陀螺仪：使用本页面顶部的蓝牙连接（与主游戏共用）。<br>' : '') +
      '<span id="ble-status" style="opacity:.75"></span>',
      integrated
        ? [
            { label: '开始训练', primary: true, onClick: () => begin('external') },
            { label: '键盘演示（↑ ↓）', onClick: () => begin('keyboard') },
            { label: '自动摆动演示', onClick: () => begin('auto') },
          ]
        : [
            { label: '连接头戴陀螺仪', primary: true, onClick: () => begin('ble') },
            { label: '键盘演示（↑ ↓）', onClick: () => begin('keyboard') },
            { label: '自动摆动演示', onClick: () => begin('auto') },
          ]);
  }

  hud.el.unwell.onclick = () =>
    finish('已停止训练', '请休息。若头晕/恶心持续，请停止今日训练并咨询医生。', { manualAbort: true });

  // 切后台自动暂停
  const onVisibility = () => {
    if (document.hidden && !finished && pace.state !== 'idle') {
      pace.paused = true; metronome.stop();
      hud.showOverlay('已暂停', '回到页面后点击继续。', [{
        label: '继续', primary: true,
        onClick: () => {
          hud.hideOverlay(); pace.paused = false;
          if (pace.state === 'active') metronome.start(CFG.freq);
        },
      }]);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  // --- 主循环 ---
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  function tick() {
    rafId = requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;                     // dt 钳制

    input.update(dt);
    const pose = input.pose;
    // 第二章垂直 VOR: 抬头低头 = roll (不是 pitch), 用 pose.roll 替代 pose.pitch
    chain.push(pose.yaw, pose.roll, pose.t);
    const sig = chain.update(pose.t);

    const judging = pace.state === 'active' && !pace.paused && !input.calibrating;
    evaluator.update({
      yaw: pose.yaw, pitch: pose.roll,          // pitch 字段装 roll (抬头低头=roll)
      wyaw: sig.omega.yaw, wpitch: sig.omega.pitch,
      alphaRMS: sig.alphaRMS, valid: sig.valid && judging, t: pose.t,
    });
    // 会话数据记录（3.6）：60Hz 头姿 + Active 块 αRMS
    recorder.pushPose(pose.yaw, pose.roll, input.raw.roll);
    if (judging) recorder.addAlpha(sig.alphaRMS);
    // 毛刺惩罚（4.1.4）：平滑度掉线 → 齿轮火花变大 + 金属摩擦声（连 3 次整体闪红）
    if (judging && ch2.setSmooth(sig.valid && evaluator.isSmooth)) metronome.grind();
    // 靶心命中：仅 Active 块判定；靶心方位 = 最新周期中线 ± amp（自动吸收陀螺仪漂移）
    const ds = judging
      ? drill.update(dt, pose.roll, metronome.nearestBeatDelta(), evaluator.lastCycle?.midline ?? 0)
      : { err: 0, hold: 0 };
    ch2.setTargetLock(ds.hold);
    pace.update(dt);
    ch2.update(dt);

    // 固定场景模式（实测反馈：世界随头反扫不真实）——相机固定不转，场景静止；
    // 光球仍是相机子节点钉屏幕中心，只有靶环按"头相对目标的俯仰角差"纵向滑动：
    // 头越接近目标方位，靶环越滑向中心，与光球重合即命中（判定链只看角度，不受影响）
    ch2.setTargetDelta(drill.bearing - pose.roll);

    hud.setAngle(pose.roll, CFG.pitchLimit, CFG.amp);
    hud.setLamp(evaluator.isSmooth, sig.alphaRMS, evaluator.threshold, judging);
    hud.setProgress(ch2.repaired, CFG.segs, drill.stats.hits, drill.stats.combo);

    if (!noRender) {
      if (useComposer) composer.render(); else renderer.render(scene, camera);
    } else {
      scene.updateMatrixWorld(true);   // E2E 不渲染但保持矩阵最新（orbScreenY/propScreenY 的 project 用）
    }
    // FPS 自适应降级（6.3）：帧率持续过低 → 整个绕过后处理（降级链第一级，保住判定）
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 1) {
      const fps = fpsN / fpsAcc;
      if (fps < 18 && useComposer && !keepBloom) useComposer = false;
      fpsAcc = 0; fpsN = 0;
    }
  }
  tick();

  function stop() {
    cancelAnimationFrame(rafId);
    metronome.stop();
    if (feedTimer) clearInterval(feedTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('resize', onResize);
    ble.disconnect();
    hud.destroy();
    vas.destroy();
    composer.dispose();
    renderer.dispose();
    mount.remove();
    if (window.updateFromGyroscope && prevInject) window.updateFromGyroscope = prevInject;
    if (window.__vorDemo === api) window.__vorDemo = null;
  }

  // --- E2E / 调试钩子 ---
  const api = {
    CFG, input, chain, evaluator, pace, ch2, ble, drill, stop, recorder, vas,
    orbScreenY() { const v = new THREE.Vector3(); ch2.orb.getWorldPosition(v); v.project(camera); return v.y; },
    propScreenY() { const v = new THREE.Vector3(); ch2.probeProp.getWorldPosition(v); v.project(camera); return v.y; },
    ringScreenY() { const v = new THREE.Vector3(); ch2.target.getWorldPosition(v); v.project(camera); return v.y; },
  };
  window.__vorDemo = api;
  return api;
}
