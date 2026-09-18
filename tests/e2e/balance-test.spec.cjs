// 平衡重心测试 (balance-test.html) E2E
// 仿真模式(?sim=1&dur=4&cd=3&runs=2&height=170)下注入合成摇摆数据流, 验证完整测试链路:
//   1) 仿真 50Hz 数据流解析, 页面就绪
//   2) 条件A测满2次: 卡片进度 1/2→完成, 聚合=两次均值, 指标合理
//   3) CoM 位移口径: 填身高后 resultsDisp 存在且量级与角度口径相符(h_com≈0.552×身高)
//   4) 单位切换到位移: 表头出现 cm²
//   5) 报告渲染: 表格数值、综合分、历史写入(含 runs 与 resultsDisp)
//   6) 条件B(闭眼硬地,仿真增益1.7): RMS 显著大于 A; Romberg 商行出现
//   7) 中止不产生结果; CSV 导出无异常; 无页面错误
// 用法: node tests/e2e/balance-test.spec.cjs（自起静态服务器，端口 8801）
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8801;
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
  const errors = [];
  async function runTrial(page, i, expectRuns) {
    await page.click(`.btn-start[data-i="${i}"]`);
    await page.waitForFunction(
      ([k, n]) => window.__bt.BT.phase === 'idle' && ((window.__bt.BT.runs[k] || []).length === n),
      [['eo_firm', 'ec_firm', 'eo_foam', 'ec_foam'][i], expectRuns], { timeout: 15000 });
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.goto(`http://localhost:${PORT}/balance-test.html?sim=1&dur=4&cd=3&runs=2&height=170`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__bt && window.__bt.sim.timer, null, { timeout: 5000 });
    await page.waitForTimeout(1200);

    /* ---- 1) 仿真数据流 ---- */
    const run = await page.evaluate(() => ({ hz: window.__bt.S.rateHz, runs: document.getElementById('runs').value, h: document.getElementById('height').value }));
    assert('仿真数据流运行(实测 35~60Hz)', run.hz > 35 && run.hz < 60, `${run.hz.toFixed(1)}Hz`);
    assert('URL 参数生效(runs=2, height=170)', run.runs === '2' && run.h === '170', `runs=${run.runs} h=${run.h}`);
    // 语音 spy: 包装 SpeechSynthesisUtterance 记录播报文本
    await page.evaluate(() => {
      window.__spoken = [];
      const OrigU = window.SpeechSynthesisUtterance;
      window.SpeechSynthesisUtterance = function (text) { window.__spoken.push(String(text)); return new OrigU(text); };
    });

    /* ---- 1b) 实时轨迹与严重度分级 ---- */
    const live = await page.evaluate(() => ({
      trailLen: window.__bt.liveTrail.length,
      lv0: window.__bt.swayLevel(0), lv1: window.__bt.swayLevel(1.0), lv2: window.__bt.swayLevel(2.0), lv3: window.__bt.swayLevel(5.0),
      levelText: document.getElementById('v-level').textContent,
    }));
    assert('实时轨迹缓冲持续采集(未记录也在采样)', live.trailLen > 30, `len=${live.trailLen}`);
    assert('swayLevel 分级映射正确(0→稳定,1.0→轻度,2.0→中度,5.0→重度)', live.lv0 === 0 && live.lv1 === 1 && live.lv2 === 2 && live.lv3 === 3);
    assert('当前等级显示有效', ['稳定', '轻度', '中度', '重度'].includes(live.levelText), live.levelText);

    // 阈值自定义: 改 lv1=0.2 后 0.5° 应判为轻度
    await page.evaluate(() => { const e = document.getElementById('lv1'); e.value = '0.2'; e.dispatchEvent(new Event('change')); });
    const lvCustom = await page.evaluate(() => ({ t: window.__bt.ringThresholds(), lv: window.__bt.swayLevel(0.5) }));
    assert('阈值自定义生效(lv1=0.2 → 0.5° 判轻度)', lvCustom.t[0] === 0.2 && lvCustom.lv === 1, `t=[${lvCustom.t}] lv=${lvCustom.lv}`);
    await page.evaluate(() => { const e = document.getElementById('lv1'); e.value = '0.8'; e.dispatchEvent(new Event('change')); });
    const lvDef = await page.evaluate(() => window.__bt.ringThresholds());
    assert('默认阈值 = 0.8/1.7/3.8(Biodex 常模推导)', lvDef.join(',') === '0.8,1.7,3.8', lvDef.join(','));

    /* ---- 1c) 归零 ---- */
    const z = await page.evaluate(async () => {
      const bt = window.__bt;
      bt.S.cont = { roll: 5, pitch: -3, yaw: 10 };   // 模拟连接后传感器绝对姿态偏移
      document.getElementById('btn-zero').click();
      await new Promise(r => setTimeout(r, 120));    // 等若干帧
      return { rel: { ...bt.S.rel }, zero: { ...bt.S.zero }, trailLen: bt.liveTrail.length };
    });
    assert('手动归零: 零点=当前姿态且 rel≈0', Math.abs(z.zero.roll - 5) < 0.01 && Math.abs(z.rel.roll) < 0.2 && Math.abs(z.rel.pitch) < 0.2,
      `zero=(${z.zero.roll.toFixed(2)},${z.zero.pitch.toFixed(2)}) rel=(${z.rel.roll.toFixed(2)},${z.rel.pitch.toFixed(2)})`);
    assert('归零后清空实时轨迹', z.trailLen < 30, `len=${z.trailLen}`);

    // 点击"开始"即归零: 倒计时进行中 rel 应≈0(记录开始时会再归零作为数据基准)
    await page.evaluate(() => { window.__bt.S.cont = { roll: 6, pitch: 2, yaw: -4 }; });
    await page.click('.btn-start[data-i="3"]');
    await page.waitForTimeout(400);
    const zc = await page.evaluate(() => ({ phase: window.__bt.BT.phase, rel: { ...window.__bt.S.rel }, zero: { ...window.__bt.S.zero } }));
    assert('点击开始即归零(零点捕获姿态偏移)', zc.phase === 'countdown' && Math.abs(zc.zero.roll - 6) < 0.5 && Math.abs(zc.rel.roll) < 1.2 && Math.abs(zc.rel.pitch) < 1.2,
      `rel=(${zc.rel.roll.toFixed(2)},${zc.rel.pitch.toFixed(2)}) zero.roll=${zc.zero.roll.toFixed(2)}`);
    await page.click('#btn-abort');
    await page.waitForTimeout(300);

    /* ---- 1d) 默认每条件 1 次(新页面不带 runs 参数) ---- */
    const page0 = await browser.newPage();
    await page0.goto(`http://localhost:${PORT}/balance-test.html?sim=1`, { waitUntil: 'load' });
    await page0.waitForFunction(() => window.__bt, null, { timeout: 5000 });
    const defRuns = await page0.evaluate(() => document.getElementById('runs').value);
    assert('默认每条件次数 = 1', defRuns === '1', `runs=${defRuns}`);
    await page0.close();

    /* ---- 1e) 补填身高后位移单位立即可用(回归: 改身高不重渲导致按钮死锁) ---- */
    const page1 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page1.goto(`http://localhost:${PORT}/balance-test.html?sim=1&dur=3&cd=3&runs=1`, { waitUntil: 'load' });
    await page1.waitForFunction(() => window.__bt && window.__bt.sim.timer, null, { timeout: 5000 });
    await page1.click('.btn-start[data-i="0"]');
    await page1.waitForFunction(() => window.__bt.BT.phase === 'idle' && (window.__bt.BT.runs.eo_firm || []).length === 1, null, { timeout: 15000 });
    const dis0 = await page1.evaluate(() => document.getElementById('unit-disp').disabled);
    assert('未填身高: 位移单位禁用', dis0 === true);
    await page1.evaluate(() => { const e = document.getElementById('height'); e.value = '170'; e.dispatchEvent(new Event('change')); });
    await page1.waitForTimeout(300);
    const st1 = await page1.evaluate(() => ({ dis: document.getElementById('unit-disp').disabled, mode: window.__bt.unitMode }));
    assert('补填身高后位移单位立即可用', st1.dis === false, `disabled=${st1.dis}`);
    await page1.click('#unit-disp');
    await page1.waitForTimeout(300);
    const st2 = await page1.evaluate(() => ({
      mode: window.__bt.unitMode,
      head: document.getElementById('report-table').querySelector('tr').textContent,
    }));
    assert('点击后切换到位移单位(cm² 表头)', st2.mode === 'disp' && st2.head.includes('cm²'), st2.head.slice(0, 50));
    await page1.close();

    /* ---- 2) 条件A: 第1次(1/2) ---- */
    await runTrial(page, 0, 1);
    const a1 = await page.evaluate(() => ({
      n: window.__bt.BT.runs.eo_firm.length,
      area: window.__bt.BT.runs.eo_firm[0].area,
      card: document.getElementById('res-eo_firm').textContent,
    }));
    assert('A 第1次: 卡片显示 1/2 进度', a1.card.includes('已测 1/2'), a1.card);
    assert('A 第1次: 聚合结果已存在', a1.n === 1 && a1.area > 0);

    /* ---- 3) 条件A: 第2次(完成) → 聚合=两次均值 ---- */
    await runTrial(page, 0, 2);
    const a2 = await page.evaluate(() => {
      const bt = window.__bt, runs = bt.BT.runs.eo_firm, agg = bt.BT.results.eo_firm;
      return {
        areas: runs.map(r => r.area), aggArea: agg.area, aggSpeed: agg.speed,
        n: agg.n, rms: agg.rms, peak: agg.peak, dur: agg.dur, path: agg.path,
        card: document.getElementById('res-eo_firm').textContent,
        disp: bt.BT.resultsDisp.eo_firm || null,
      };
    });
    console.log(`  A项: 两次面积=${a2.areas.map(v => v.toFixed(2)).join('/')} 均值=${a2.aggArea.toFixed(2)}deg² 均速=${a2.aggSpeed.toFixed(2)}°/s RMS=${a2.rms.toFixed(2)}° n=${a2.n}`);
    const meanArea = (a2.areas[0] + a2.areas[1]) / 2;
    assert('A 完成: 聚合面积=两次均值', Math.abs(a2.aggArea - meanArea) < 1e-9, `${a2.aggArea.toFixed(4)} vs ${meanArea.toFixed(4)}`);
    assert('A 卡片显示完成态(2次均值)', a2.card.includes('2次均值'), a2.card);
    assert('A: 样本数≥150/次', a2.n >= 150, `n=${a2.n}`);
    assert('A: 椭圆面积为正有限', isFinite(a2.aggArea) && a2.aggArea > 0.01, a2.aggArea.toFixed(3));
    assert('A: 路径/均速/RMS 为正有限', a2.path > 1 && a2.aggSpeed > 0.1 && a2.rms > 0.05);
    assert('A: 峰值速度(95分位)≥均速', a2.peak >= a2.aggSpeed * 0.99, `${a2.peak.toFixed(2)} vs ${a2.aggSpeed.toFixed(2)}`);
    assert('A: 有效时长≈4s', a2.dur > 3.4 && a2.dur < 4.6, `${a2.dur.toFixed(2)}s`);
    const spokenA = await page.evaluate(() => window.__spoken);
    assert('A(睁眼): 语音提示 = 开始记录/记录结束', spokenA.includes('开始记录') && !spokenA.includes('请闭眼，开始记录') && spokenA.includes('记录结束'),
      spokenA.join(' | '));

    /* ---- 4) CoM 位移口径 ---- */
    const hcom = 0.552 * 170;
    const expectRatio = Math.pow(hcom * Math.PI / 180, 2);   // deg²→cm² 近似比例(小角 tan≈线性)
    assert('位移指标已生成(身高170)', a2.disp && a2.disp.area > 0, a2.disp ? `area=${a2.disp.area.toFixed(2)}cm²` : 'null');
    if (a2.disp) {
      const ratio = a2.disp.area / a2.aggArea;
      assert('位移面积与角度面积比例合理(≈(h_com·π/180)²)', ratio > expectRatio * 0.8 && ratio < expectRatio * 1.3,
        `ratio=${ratio.toFixed(2)} 期望≈${expectRatio.toFixed(2)}`);
    }
    await page.click('#unit-disp');
    await page.waitForTimeout(300);
    const dispUI = await page.evaluate(() => ({
      mode: window.__bt.unitMode,
      head: document.getElementById('report-table').querySelector('tr').textContent,
    }));
    assert('切换位移单位: 表头出现 cm²', dispUI.mode === 'disp' && dispUI.head.includes('cm²'), dispUI.head.slice(0, 60));
    await page.click('#unit-deg');

    /* ---- 4b) 各条件轨迹图(mCTSIB 每阶段一图) ---- */
    const stato = await page.evaluate(() => {
      const cells = document.querySelectorAll('.stato-cell');
      const cvs = cells[0] && cells[0].querySelector('canvas');
      return {
        n: cells.length,
        firstCap: cells[0] ? cells[0].querySelector('.cap').textContent : '',
        firstDrawn: cvs ? cvs.toDataURL().length : 0,
        emptyCells: [...cells].filter(c => c.classList.contains('empty')).length,
      };
    });
    assert('报告含 4 张条件轨迹图', stato.n === 4, `cells=${stato.n}`);
    assert('A 图已绘制(画布非空)', stato.firstDrawn > 4000, `dataURL=${stato.firstDrawn}`);
    assert('A 图注含面积数值', stato.firstCap.includes('面积'), stato.firstCap);
    assert('未测条件显示占位(3 个)', stato.emptyCells === 3, `empty=${stato.emptyCells}`);

    /* ---- 5) 报告与历史 ---- */
    const rep = await page.evaluate(() => ({
      score: document.getElementById('v-score').textContent,
      tableRows: document.getElementById('report-table').querySelectorAll('tr').length,
      histItems: document.querySelectorAll('.hist-item').length,
      stored: JSON.parse(localStorage.getItem('balance-test-history-v1') || '[]')[0],
    }));
    assert('报告综合分出数', /^\d+$/.test(rep.score), `score=${rep.score}`);
    assert('报告表含表头+4条件+分级行(≥6行)', rep.tableRows >= 6, `rows=${rep.tableRows}`);
    assert('历史列表渲染 1 条', rep.histItems === 1, `items=${rep.histItems}`);
    assert('历史存会话(含2次A与身高)', rep.stored && rep.stored.runs && rep.stored.runs.eo_firm.length === 2 && rep.stored.height === 170,
      rep.stored ? `runs=${JSON.stringify(Object.keys(rep.stored.runs || {}))} h=${rep.stored.height}` : 'null');
    assert('历史存位移指标', rep.stored && rep.stored.resultsDisp && rep.stored.resultsDisp.eo_firm.area > 0);

    /* ---- 6) 条件B(闭眼,仿真增益1.7) ---- */
    await runTrial(page, 1, 1);
    const b1 = await page.evaluate(() => ({
      agg: window.__bt.BT.results.ec_firm,
      quot: document.getElementById('v-quotients').textContent,
      score: document.getElementById('v-score').textContent,
      storedKeys: Object.keys(JSON.parse(localStorage.getItem('balance-test-history-v1'))[0].results),
    }));
    console.log(`  B项(1/2): 面积=${b1.agg.area.toFixed(2)}deg² RMS=${b1.agg.rms.toFixed(2)}° (A均值面积=${a2.aggArea.toFixed(2)} RMS=${a2.rms.toFixed(2)})`);
    // 4s 短窗的椭圆面积受 ml/ap 随机相关性影响很大, 闭眼>睁眼用 RMS(与协方差无关)断言更稳
    assert('B: 闭眼摇摆显著大于睁眼(RMS,增益1.7)', b1.agg.rms > a2.rms * 1.3, `${b1.agg.rms.toFixed(2)} vs ${a2.rms.toFixed(2)}`);
    const spokenB = await page.evaluate(() => window.__spoken);
    assert('B(闭眼): 语音提示 = 请闭眼，开始记录 / 记录结束，请睁眼',
      spokenB.includes('请闭眼，开始记录') && spokenB.includes('记录结束，请睁眼'), spokenB.join(' | '));
    assert('Romberg 商行出现', b1.quot.includes('Romberg'), b1.quot.slice(0, 90));
    assert('两项综合分 < 单项A分(闭眼拉低)', +b1.score < +rep.score, `${b1.score} vs ${rep.score}`);
    assert('历史同会话合并(1个会话存2项)', b1.storedKeys.length === 2, b1.storedKeys.join(','));

    /* ---- 7) 中止不产生结果; 记录/倒计时中归零禁用 ---- */
    await page.click('.btn-start[data-i="2"]');
    await page.waitForTimeout(500);
    const zeroDisabled = await page.evaluate(() => document.getElementById('btn-zero').disabled);
    assert('倒计时/记录中归零按钮禁用', zeroDisabled === true);
    await page.click('#btn-abort');
    await page.waitForTimeout(300);
    const afterAbort = await page.evaluate(() => ({
      phase: window.__bt.BT.phase,
      cRuns: (window.__bt.BT.runs.eo_foam || []).length,
      n: window.__bt.BT.samples.length,
      zeroEnabled: !document.getElementById('btn-zero').disabled,
    }));
    assert('中止后回 idle 且无 C 数据', afterAbort.phase === 'idle' && afterAbort.cRuns === 0 && afterAbort.n === 0);
    assert('中止后归零按钮恢复可用', afterAbort.zeroEnabled);

    await page.evaluate(() => document.getElementById('btn-csv-summary').click());
    await page.waitForTimeout(300);
    assert('CSV 导出点击无页面错误', true);

    await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'balance-test-sim.png') });
    await page.close();

    assert('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    failed++;
    console.error('  ✗ 用例执行异常:', e.message);
    console.error(errors.slice(0, 5).join('\n'));
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})();
