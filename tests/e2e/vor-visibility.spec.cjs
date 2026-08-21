// VOR 可见性 + 可射击性验证
// 问题1: 飞船超出射击范围导致无法射击
// 问题2: 敌舰在视野外生成，看不见造成误判
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PE: ' + e.message));

  await page.goto('http://localhost:4399/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.querySelector('.mode-btn[data-mode="game"]').click());
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    if (window.state) window.state.useGyroscope = true;
    document.querySelector('#game-select-panel .mode-btn[data-mode="vor"]').click();
    document.getElementById('start-game-btn').click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.gameEngine.invincibleTime = 1e9; });

  // 让患者持续大幅摆头（最恶劣工况：头一直在动，视野一直在变），
  // 记录每个新生成实体在【生成瞬间】的屏幕位置与可达性
  const res = await page.evaluate(async () => {
    const e = window.gameEngine;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const seenE = new Set(), seenC = new Set();
    const sides = [];
    let spawnTotal = 0, spawnOffScreen = 0, spawnUnreachable = 0, everUnreachable = 0;
    let shots = 0, kills = 0, lockedFrames = 0, frames = 0;
    const mx = 0.32;
    const unreachable = new Set();

    const origShoot = e.currentScene.playerShoot.bind(e.currentScene);
    e.currentScene.playerShoot = (x, y) => {
      const before = e.bullets.length;
      const r = origShoot(x, y);
      if (e.bullets.length > before) shots++;
      return r;
    };
    const score0 = e.score;

    for (let t = 0; t < 2600; t++) {
      // 大幅摆头：0.9 周期正弦，覆盖满量程
      const yaw = 19 * Math.sin(t / 28);
      for (let i = 0; i < 3; i++) window.updateFromGyroscope({ yaw, pitch: 0, roll: 0 });

      const shift = e._worldShift || 0;
      const check = (o, set) => {
        if (set.has(o) || o.y > -0.05) return;      // 只看刚生成(y≈-0.1)的
        set.add(o);
        spawnTotal++;
        const sx = o.x + shift;                      // 生成瞬间的屏幕 x
        if (sx < 0.02 || sx > 0.98) spawnOffScreen++;
        if (o.type !== 'coin') sides.push({ side: sx < 0.5 ? 'L' : 'R', px: e.player.x, b: e._vorBatch, sp: e._vorSpawnSide });
        if (o.x < 0.5 - mx - 1e-6 || o.x > 0.5 + mx + 1e-6) spawnUnreachable++;
      };
      for (const o of e.enemies) check(o, seenE);
      for (const o of e.obstacles) if (o.type === 'coin') { check(o, seenC); /* 金币不参与交替断言 */ }

      // 全生命周期可达性：敌舰整个下落过程都必须留在飞船够得到的世界区间内，
      // 否则会出现"看得见但永远打不掉"的情况
      for (const o of e.enemies) {
        if (!o.active || o.y < -0.05 || o.y > 1) continue;
        if ((o.x < 0.5 - mx - 1e-6 || o.x > 0.5 + mx + 1e-6) && !unreachable.has(o)) {
          unreachable.add(o); everUnreachable++;
        }
      }

      frames++;
      if (e.currentScene.targetEnemy && e.currentScene.alignmentTime > 0) lockedFrames++;

      if (e.state !== 'playing') break;
      await sleep(16);
    }
    return {
      spawnTotal, spawnOffScreen, spawnUnreachable, everUnreachable, sides,
      shots, scoreGain: e.score - score0,
      lockRatio: +(lockedFrames / frames).toFixed(3),
      state: e.state,
      alignTh: e.currentScene.alignmentThreshold,
      holdTime: e.currentScene.requiredHoldTime,
      playerY: e.currentScene.playerY,
    };
  });
  console.log('可见性/开火纪律:', JSON.stringify(res));

  await page.evaluate(() => { const c = window.gameEngine.canvas; c.style.position='fixed';c.style.left='0';c.style.top='0';c.style.zIndex='999999'; });
  await page.screenshot({ path: 'screenshots/vor-visibility.png' });

  // --- 测试 3: 视野外敌舰的边缘箭头 ---
  // 转头会把已生成的敌舰推出画面，看不见会造成误判 → 屏幕边缘要有箭头提示。
  // 差分探针：同一块左边缘区域，敌舰在视野内 vs 被推出视野外，比较像素。
  // 注意敌舰世界 x 必须留在 [0,1] 内，否则会被引擎的越界清理直接删掉，探针就失效了。
  const feed = y => page.evaluate(v => { for (let i = 0; i < 8; i++) window.updateFromGyroscope({ yaw: v, pitch: 0, roll: 0 }); }, y);
  for (let t = 0; t < 200; t++) {
    await feed(20); await page.waitForTimeout(13);
    const n = await page.evaluate(() => window.gameEngine.enemies.filter(x => x.active).length);
    if (n > 0 && t > 120) break;
  }
  const arrow = await page.evaluate(async () => {
    const e = window.gameEngine, c = e.canvas, ctx = c.getContext('2d');
    const q = e.enemies.find(x => x.active);
    if (!q) return { err: 'no enemy' };
    const frame = () => new Promise(r => requestAnimationFrame(r));
    const ay = Math.round(0.45 * c.height), ax = 14;
    const grab = () => {
      const d = ctx.getImageData(ax - 12, ay - 14, 26, 28).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      return { r: r / n, g: g / n, b: b / n };
    };
    // 其他敌舰全部移到画面内，避免它们已有的边缘箭头干扰差分
    for (const o of e.enemies) { if (o !== q && o.active) { o.x = 0.5; o.speedX = 0; o.speedY = 0; } }
    q.speedY = 0; q.speedX = 0;
    for (let i = 0; i < 6; i++) { q.y = 0.45; q.x = 0.5; await frame(); }   // 视野内
    const before = grab(), sIn = (q.x + (e._worldShift || 0)) * c.width;
    for (let i = 0; i < 6; i++) { q.y = 0.45; q.x = 0.18; await frame(); }  // 被推出左侧
    const after = grab(), sOut = (q.x + (e._worldShift || 0)) * c.width;
    return {
      shift: +(e._worldShift || 0).toFixed(3),
      screenIn: +sIn.toFixed(0), screenOut: +sOut.toFixed(0),
      stillInArray: e.enemies.includes(q),
      dR: +(after.r - before.r).toFixed(1), dB: +(after.b - before.b).toFixed(1),
    };
  });
  console.log('边缘箭头差分探针:', JSON.stringify(arrow));

  const A = [];
  const add = (n, ok, x = '') => A.push({ n, ok, x });
  add('有实体生成', res.spawnTotal > 0, 'total=' + res.spawnTotal);
  {
    // 只在玩家头位接近中线(|px-0.5|<0.2，即头动±12°内)时统计交替 —— 贴边时一侧物理上没空间，
    // 敌舰只能生成在视野内那一侧，那是正确行为；交替训练价值在中线附近。
    // 过滤截断会把批次切半造成假性 3 连，因此不用"连续同侧"断言，
    // 改用批次内断言（相邻记录同批必须同侧、跨批必须翻转），对截断免疫。
    const sd = (res.sides || []).filter(v => v && Math.abs(v.px - 0.5) < 0.2);
    let Ls = 0, Rs = 0;
    for (const v of sd) { if (v.side === 'L') Ls++; else Rs++; }
    // 窗口断言：任意连续 6 个生成内两侧都必须出现。
    // 对"过滤截断批次"免疫，对"贴边时单侧(fallback)"合理（摆头时会回中线），
    // 对"长时间单侧"敏感 —— 这才是训练要防的。
    let winBad = false;
    for (let i = 0; i + 5 < sd.length; i++) {
      const win = sd.slice(i, i + 6);
      if (!win.some(v => v.side === 'L') || !win.some(v => v.side === 'R')) { winBad = true; break; }
    }
    const all = (res.sides || []).filter(v => v);
    let aL = 0, aR = 0;
    for (const v of all) { if (v.side === 'L') aL++; else aR++; }
    add('【左右交替】整体两侧都有生成', aL > 0 && aR > 0, `L=${aL} R=${aR}`);
    add('【左右交替】中线时段两侧都有生成', Ls > 0 && Rs > 0, `L=${Ls} R=${Rs}`);
    add('【左右交替】任意6个生成内两侧都出现', !winBad,
        '序列=' + sd.map(v => v.side).slice(0, 16).join(''));
    add('【左右交替】存在左右切换', sd.length >= 2 &&
        sd.some((v, i) => i > 0 && v.side !== sd[i - 1].side));
  }
  add('【问题2】无实体在画面外生成', res.spawnOffScreen === 0,
      `画面外 ${res.spawnOffScreen}/${res.spawnTotal}`);
  add('【问题2】无实体生成在飞船够不到的位置', res.spawnUnreachable === 0,
      `生成即不可达 ${res.spawnUnreachable}/${res.spawnTotal}`);
  add('【问题2】敌舰全程都在飞船可达范围内(不会漂出去)', res.everUnreachable === 0,
      `全程曾不可达 ${res.everUnreachable}`);
  add('【问题1】锁定阈值维持原设计 0.02', res.alignTh === 0.02, 'th=' + res.alignTh);
  add('【问题1】锁定保持时间维持原设计 0.5s', res.holdTime === 0.5, 'hold=' + res.holdTime);
  // 本用例是"持续大幅摆头、完全不尝试对准"的工况，按原设计几乎不该开火 —— 这是规则生效的反向证明。
  // 摆头 42s，敌舰慢速下落时偶然扫过瞄准线的机会有限：阈值 8 次 = 每 5s 1 次。
  // 正向的开火验证（追踪对准→锁定→齐射）在 vor-fire-discipline.spec.cjs 里（0.8 次/秒）。
  add('【开火纪律】不对准时几乎不开火', res.shots <= 8, 'shots=' + res.shots);
  add('【问题2】敌舰被推出视野后，边缘出现琥珀色箭头提示',
      !arrow.err && arrow.screenOut < 0 && arrow.stillInArray && arrow.dR > 10,
      `屏幕x ${arrow.screenIn}→${arrow.screenOut}, 红通道Δ=${arrow.dR}, 蓝通道Δ=${arrow.dB}`);
  add('无 JS 错误', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n=== 断言结果 ===');
  let bad = 0;
  for (const a of A) { console.log((a.ok ? '  PASS  ' : '  FAIL  ') + a.n + (a.x ? '  [' + a.x + ']' : '')); if (!a.ok) bad++; }
  console.log(bad ? '\n失败 ' + bad + ' 项' : '\n全部通过 (' + A.length + ')');
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });
