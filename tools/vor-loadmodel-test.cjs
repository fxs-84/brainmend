// 验证 GLTFLoader 接入管线：loadModel 加载现有 glb，确认不报错、模型挂进光球
// 用法：node tools/vor-loadmodel-test.cjs（自起静态服务器，端口 8795）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');
const PORT = 8795;
(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'tests', 'static-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  await new Promise(r => server.stdout.once('data', r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.error('PAGEERROR:', e.message));
    await page.goto(`http://localhost:${PORT}/vor.html?skipvas=1&mode=keyboard&blocks=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__vorDemo, null, { timeout: 10000 });
    const r = await page.evaluate(async () => {
      try {
        const before = window.__vorDemo.ch1.segments.length;
        const m = await window.__vorDemo.ch1.loadModel('./models/car-sedan-blue-v3.glb', { scale: 0.5 });
        let meshes = 0; m.traverse(o => { if (o.isMesh) meshes++; });
        return { ok: true, meshes, segsBefore: before, segsAfter: window.__vorDemo.ch1.segments.length, inOrb: m.parent === window.__vorDemo.ch1.orb };
      } catch (e) { return { ok: false, err: e.message }; }
    });
    if (r.ok) {
      console.log(`✓ loadModel 加载成功：网格 ${r.meshes} 个，挂进光球=${r.inOrb}，segments ${r.segsBefore}→${r.segsAfter}（car 无 wing_seg，保持原 20）`);
    } else {
      console.log(`✗ loadModel 失败：${r.err}`);
    }
    process.exitCode = r.ok ? 0 : 1;
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error('异常:', e); process.exit(1); });
