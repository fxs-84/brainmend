// GLB 截图自检：启动 viewer.html 加载每个 GLB，等加载完截图
const { chromium } = require('playwright');

(async () => {

const FILES = ['spaceship', 'enemy', 'scene-prop'];

for (const f of FILES) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CE: ' + m.text()); });

  await page.goto('http://localhost:4399/tools/glb/viewer.html?file=' + f + '.glb', { waitUntil: 'load' });

  // 等模型加载完（info 文本里不再含 "Loading" 或 "%"）
  let info = '';
  for (let t = 0; t < 80; t++) {
    info = await page.evaluate(() => document.getElementById('info').textContent);
    if (info && !/Loading|\d+%/i.test(info)) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(600); // 让 OrbitControls damping 收敛 + 帧稳定

  const shot = 'assets/3d/screenshots/' + f + '.png';
  await page.screenshot({ path: shot });

  console.log(f, '|', info, '|', 'errors=' + errors.length, '|', shot);
  if (errors.length) console.log('   ', errors.slice(0, 3).join(' | '));
  await browser.close();
}
console.log('done');
})().catch(e=>{console.error(e);process.exit(1);});