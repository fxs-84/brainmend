// 太空隧道 v2 重写验证:
//  1) 场景模块加载无报错, sceneType='tunnel'
//  2) 岩石/金币持续生成
//  3) 自动驾驶沿中心线飞行 30s 不撞毁 (路径可通行)
//  4) 路径多样性: 生成的锚点覆盖多种段落类型
//  5) 截图供人工检查视觉效果
// 用法: node tests/e2e/tunnel-v2.spec.mjs (自起静态服务器, 端口 8795)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PORT = 8795;

const server = spawn(process.execPath, ['tests/static-server.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe'
});
await new Promise(r => server.stdout.once('data', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

await page.goto(`http://localhost:${PORT}/index.html`);
await page.waitForSelector('#page2-tracking', { timeout: 15000 });
// 头动追踪 → 脑科学游戏
await page.click('#page2-tracking');
await page.waitForTimeout(500);
await page.click('.tm-card[data-tmode="game"]');
await page.waitForTimeout(1500);

// 选择"太空隧道"模式并开始
const modePicked = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('#game-select-panel button'));
  const b = btns.find(x => (x.textContent || '').includes('太空隧道'));
  if (b) { b.click(); return true; }
  return false;
});
check('游戏面板选择太空隧道模式', modePicked);
await page.waitForTimeout(400);
await page.evaluate(() => { const b = document.getElementById('start-game-btn'); if (b) b.click(); });
// 场景就绪后立即装自动驾驶 (沿车道走 + 避障转向), 避免静止撞墙
await page.waitForFunction(() => {
  const sc = window.gameEngine && window.gameEngine.currentScene;
  if (sc && sc.sceneType === 'tunnel') {
    const W = 1400, H = 900, M = Math.min(W, H);
    sc.mapInputToPosition = () => {
      const px = sc.scrollX + 0.5;
      const c = sc.getTunnelCenterY(px);
      let best = c, bestScore = -1e9;
      for (let dy = -0.16; dy <= 0.16; dy += 0.02) {
        const y = c + dy;
        if (y < 0.05 || y > 0.95) continue;
        let minD = 1e9;
        for (const rock of sc.rocks) {
          const dx = (rock.x - px) * W;
          if (Math.abs(dx) > 140) continue;
          const d = Math.hypot(dx, (rock.y - y) * H) - rock.r * M * 0.8;
          if (d < minD) minD = d;
        }
        const score = minD - Math.abs(dy) * H * 0.25; // 同等情况偏向车道中心
        if (score > bestScore) { bestScore = score; best = y; }
      }
      return { x: .5, y: best };
    };
    return true;
  }
  return false;
}, null, { timeout: 15000 });
await page.waitForTimeout(1500);

const st1 = await page.evaluate(() => {
  const eng = window.gameEngine;
  const sc = eng && eng.currentScene;
  return {
    sceneType: sc && sc.sceneType,
    rocks: sc ? sc.rocks.length : -1,
    coins: sc ? sc.coins.length : -1,
    anchors: sc ? sc.anchors.length : -1
  };
});
check('隧道场景已加载', st1.sceneType === 'tunnel', 'sceneType=' + st1.sceneType);
check('岩石已生成', st1.rocks > 10, 'rocks=' + st1.rocks);
check('金币已生成', st1.coins > 5, 'coins=' + st1.coins);
await page.screenshot({ path: path.join(ROOT, 'screenshots/tunnel-v2-1-start.png') });

// 自动驾驶: 沿隧道中心线飞 (绕过陀螺仪, 直接改 mapInputToPosition)
await page.waitForTimeout(6000);
await page.screenshot({ path: path.join(ROOT, 'screenshots/tunnel-v2-2-mid.png') });
await page.waitForTimeout(9000);
await page.screenshot({ path: path.join(ROOT, 'screenshots/tunnel-v2-3-far.png') });
await page.waitForTimeout(12000);

const st2 = await page.evaluate(() => {
  const eng = window.gameEngine;
  const sc = eng.currentScene;
  const segSet = new Set(sc._segHistory || []);
  return {
    gameTime: sc.gameTime.toFixed(1),
    rocks: sc.rocks.length,
    coins: sc.coins.length,
    segTypes: Array.from(segSet),
    state: String(eng.state).toLowerCase(),
    hitR: eng.player ? eng.player.hitboxRadius : -1,
    coinsCollected: eng.scoring ? eng.scoring.coinsCollected : -1
  };
});
check('自动驾驶 27s 未撞毁', st2.state !== 'gameover', 'state=' + st2.state + ' t=' + st2.gameTime + 's');
check('路径段落类型 ≥3 种', st2.segTypes.length >= 3, st2.segTypes.join(','));
check('金币被正常收集', st2.coinsCollected > 0, 'collected=' + st2.coinsCollected);
console.log('  [info] 27s 时 rocks=' + st2.rocks + ' coins=' + st2.coins);

const realErrors = errors.filter(e => !/favicon|net::ERR_/i.test(e));
check('无页面 JS 错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
await browser.close();
server.kill();
process.exit(fail ? 1 : 0);
