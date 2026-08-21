// 第二章面板集成 E2E：主游戏选择面板 → 第二章按钮 → 启动 demo → 陀螺仪通道 → 返回菜单
// 用法：node tests/e2e/vor-ch2-panel.spec.cjs（自起静态服务器，端口 8793）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8793;
const URL = `http://localhost:${PORT}/index.html?skipvas=1&bloom=0&norender=1`;

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 512, height: 320 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    console.log('1) 面板注入');
    await page.evaluate(() => document.querySelector('.mode-btn[data-mode="game"]')?.click());
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const p = document.getElementById('game-select-panel');
      if (p) { p.style.display = 'block'; p.style.zIndex = '99999'; }
    });
    const btn = await page.waitForSelector('#game-select-panel .mode-btn[data-mode="vorch2"]', { timeout: 10000 });
    assert('面板中注入「回声编织者·第二章」按钮', !!btn,
      btn ? (await btn.textContent()).trim() : '未找到');
    const btnBg = await page.evaluate(() => {
      const b = document.querySelector('#game-select-panel .mode-btn[data-mode="vorch2"]');
      return getComputedStyle(b).backgroundColor;
    });
    assert('按钮样式与面板原生按钮一致（深 slate 卡片）', btnBg === 'rgb(30, 41, 59)', `bg=${btnBg}`);

    console.log('2) 启动 demo');
    await page.evaluate(() => {
      document.querySelector('#game-select-panel .mode-btn[data-mode="vorch2"]').click();
      document.getElementById('start-game-btn').click();
    });
    await page.waitForSelector('#vor-ch2-root', { timeout: 10000 });
    assert('demo 容器挂载（#vor-ch2-root）', true);
    assert('选择面板已隐藏', await page.evaluate(() =>
      document.getElementById('game-select-panel').style.display === 'none'));

    console.log('3) 陀螺仪通道（window.D / updateFromGyroscope 链式）');
    // 集成覆盖层：点"开始训练"（external 模式，数据走主游戏通道）
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#vor-ch2-root #ov-btns button')].find(x => x.textContent.includes('开始训练'));
      b.click();
    });
    await page.waitForFunction(() => window.__vorDemo && window.__vorDemo.pace.state === 'active', null, { timeout: 8000 });
    assert('校准后进入 Active 块', true);
    // 经主游戏同一注入通道喂 pitch
    await page.evaluate(() => {
      let phase = 0;
      window.__panelDrive = setInterval(() => {
        phase += 0.016;
        window.updateFromGyroscope({ yaw: 0, pitch: 10 * Math.sin(2 * Math.PI * 0.5 * phase), roll: 0 });
      }, 16);
    });
    await page.waitForFunction(() => Math.abs(window.__vorDemo.input.pose.pitch) > 5, null, { timeout: 8000 });
    const probe = await page.evaluate(() => ({
      pitch: window.__vorDemo.input.pose.pitch,
      cursorLeft: document.querySelector('#vor-ch2-root #hud-angle-cursor').style.left,
    }));
    assert('demo 收到主游戏通道陀螺仪数据', Math.abs(probe.pitch) > 5, `pitch=${probe.pitch.toFixed(1)}`);
    assert('HUD 角度游标随动', probe.cursorLeft !== '50%' && probe.cursorLeft !== '', `left=${probe.cursorLeft}`);
    // 链式通道连续性：连续注入 1 秒，样本应持续更新（不止一帧）
    const cont = await page.evaluate(() => new Promise(res => {
      const t0 = window.__vorDemo.input.t;
      setTimeout(() => res(window.__vorDemo.input.t > t0), 1000);
    }));
    assert('数据连续到达（链式通道未断）', cont);

    console.log('4) 返回菜单');
    await page.evaluate(() => clearInterval(window.__panelDrive));
    await page.click('#vor-ch2-back-btn');
    await page.waitForTimeout(500);
    assert('demo 容器已移除', await page.evaluate(() => !document.getElementById('vor-ch2-root')));
    assert('选择面板恢复显示', await page.evaluate(() =>
      document.getElementById('game-select-panel').style.display !== 'none'));
    assert('__vorDemo 钩子已清理', await page.evaluate(() => window.__vorDemo === null));

    console.log('5) 控制台/页面错误');
    assert('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('E2E 异常:', e); process.exit(1); });
