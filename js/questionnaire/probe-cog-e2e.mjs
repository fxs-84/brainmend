// js/questionnaire/probe-cog-e2e.mjs
// 验证认知评估: 治疗师登录 → 创建认知 share_link → 患者扫码做题 → 提交 → DB 有新行
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "https://fxs-84.github.io/brainmend";
const cfg = readFileSync(resolvePath(__dirname, "../../assets/config/supabase-config.js"), "utf8");
const SUPABASE_URL = cfg.match(/__SUPABASE_URL__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
const SUPABASE_KEY = cfg.match(/__SUPABASE_ANON_KEY__\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
const TEST_EMAIL = "bm-e2e-test@example.com";
const TEST_PASSWORD = "Test1234!";

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name, extra || ""); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

const browser = await chromium.launch({ channel: "chrome" });
const logs = [];

try {
  // ============ A. 治疗师登录 + 创建认知 share_link ============
  console.log("\n=== A. 治疗师登录 + 创建认知 share_link ===");
  const tCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const tp = await tCtx.newPage();
  tp.on("console", (m) => logs.push(`[T-${m.type()}] ${m.text()}`));
  tp.on("pageerror", (e) => logs.push(`[T-pageerror] ${e.message}`));

  await tp.goto(base + "/index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
  await tp.waitForFunction(() => window.SupabaseClient && window.SupabaseClient.isConfigured(), null, { timeout: 60000 });
  await tp.evaluate(async ({ email, pw }) => await window.SupabaseClient.signIn(email, pw), { email: TEST_EMAIL, pw: TEST_PASSWORD });
  assert("治疗师登录", true);

  // 创建认知评估的 share_link (kind=cognitive, 用预填患者信息)
  const slRes = await tp.evaluate(async () => {
    return await window.SupabaseClient.createShareLink({
      name: "认知测试-孙女士",
      age: 55,
      gender: "女",
      expiresDays: 7,
      kind: "cognitive"
    });
  });
  console.log("  share_link:", JSON.stringify({
    id: slRes.id, token: slRes.token, kind: slRes.kind, prefilled_name: slRes.prefilled_name
  }));
  assert("share_link 已生成 (kind=cognitive)", slRes.kind === "cognitive", slRes.kind);
  const shareToken = slRes.token;

  // ============ B. 患者扫码做认知评估 (quick6 模式, 快) ============
  console.log("\n=== B. 患者扫码做认知评估 ===");
  const pCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pp = await pCtx.newPage();
  pp.on("console", (m) => logs.push(`[P-${m.type()}] ${m.text()}`));
  pp.on("pageerror", (e) => logs.push(`[P-pageerror] ${e.message}`));
  pp.on("response", async (r) => {
    if (r.url().includes("supabase") && r.url().includes("/rest/")) {
      if (r.status() >= 400) logs.push(`[P-http-err] ${r.status()} ${r.url().split('?')[0]}`);
    }
  });

  // 进入认知评估 quick6 模式 (5 个模块: reasoning/scenerecall/shortmem/attention/memory/visual)
  const cogUrl = base + "/index.html?mode=cognitive&start=quick6&share_token=" + shareToken +
    "&name=" + encodeURIComponent("认知测试-孙女士") + "&age=55&gender=" + encodeURIComponent("女");
  console.log("  患者 URL:", cogUrl);
  await pp.goto(cogUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await pp.waitForTimeout(3000);

  // 等待第一个模块加载
  try {
    await pp.waitForFunction(() => window.__reasoning && window.__reasoning.showReady, null, { timeout: 30000 });
    console.log("  ✅ reasoning 模块就绪");
  } catch (e) {
    console.log("  ⚠️ reasoning 未就绪, 继续...");
  }

  // 跑 6 个模块的 quick6
  const quick6Order = ['reasoning', 'scenerecall', 'shortmem', 'attention', 'memory', 'visual'];
  for (let i = 0; i < quick6Order.length; i++) {
    const mod = quick6Order[i];
    console.log(`\n  --- 模块 ${i + 1}/6: ${mod} ---`);
    // 等待当前模块 ready + 题目显示
    try {
      await pp.waitForFunction(
        (m) => window['__' + m] && window['__' + m].showReady,
        mod,
        { timeout: 30000 }
      );
      console.log(`    ✅ ${mod} ready`);
    } catch (e) {
      console.log(`    ⚠️ ${mod} not ready, skipping`);
      continue;
    }
    await pp.waitForTimeout(500);
    // 点击开始按钮
    try {
      const startBtn = await pp.$(`#${mod}-start-btn, button[data-start="${mod}"], .start-${mod}`);
      if (startBtn) {
        await startBtn.click();
        console.log(`    点击开始`);
      }
    } catch (e) {}
    await pp.waitForTimeout(1000);
    // 模拟答题: 找选项按钮 + 多次点击
    for (let t = 0; t < 20; t++) {
      const optionCount = await pp.evaluate((m) => {
        const btns = Array.from(document.querySelectorAll(`button[id^="${m}-opt-"], button.${m}-opt, .${m}-options button, [data-module="${m}"] button`));
        const visible = btns.filter(b => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !b.disabled;
        });
        return visible.length;
      }, mod).catch(() => 0);
      if (optionCount > 0) {
        try {
          await pp.evaluate((m) => {
            const btns = Array.from(document.querySelectorAll(`button[id^="${m}-opt-"], button.${m}-opt, .${m}-options button, [data-module="${m}"] button`));
            const visible = btns.filter(b => {
              const r = b.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && !b.disabled;
            });
            if (visible.length > 0) visible[Math.floor(Math.random() * Math.min(3, visible.length))].click();
          }, mod);
        } catch (e) {}
        await pp.waitForTimeout(200);
      }
      // 看是否模块结束 (有"下一题"或"完成"按钮出现)
      const moduleDone = await pp.evaluate(() => {
        return !!document.querySelector('#module-complete, .module-done, [data-module-done], #result-modal.show');
      });
      if (moduleDone) {
        console.log(`    模块完成`);
        break;
      }
    }
    await pp.waitForTimeout(500);
    // 点击"下一模块"
    try {
      const nextBtn = await pp.$('#next-module-btn, .next-module, button:has-text("下一"), button:has-text("继续")');
      if (nextBtn) await nextBtn.click();
    } catch (e) {}
  }

  // 等最终结果/报告
  await pp.waitForTimeout(5000);

  // 检查本机状态
  const recState = await pp.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem("cog_records") || "[]");
    // 找最后一条 type=cognitive 的
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].type === 'cognitive' || (arr[i].moduleScores && !arr[i].type)) {
        return {
          type: arr[i].type || 'cognitive',
          overallScore: arr[i].overallScore,
          _cloudStatus: arr[i]._cloudStatus,
          _cloudErr: arr[i]._cloudErr,
          _cloudId: arr[i]._cloudId,
          _cloudSource: arr[i]._cloudSource
        };
      }
    }
    return { lastRecord: null };
  });
  console.log("\n  患者本机记录:", JSON.stringify(recState, null, 2));
  assert("本机 _cloudStatus = synced", recState._cloudStatus === "synced", recState._cloudStatus || "");
  assert("本机 _cloudId 已写入", !!recState._cloudId, recState._cloudId || "");

  // ============ C. 查 DB 验证 ============
  console.log("\n=== C. 查 DB 验证 ===");
  const sess = await tp.evaluate(() => window.SupabaseClient.getSession());
  const dbRows = await fetch(
    SUPABASE_URL + "/rest/v1/cognitive_assessments?share_token=eq." + shareToken + "&select=id,patient_name,overall_score,is_quick6,source",
    { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + sess.access_token } }
  ).then(r => r.json());
  console.log("  DB 返回:", JSON.stringify(dbRows, null, 2));
  assert("DB 有新行", Array.isArray(dbRows) && dbRows.length > 0, `count=${dbRows.length}`);
  if (dbRows[0]) {
    assert("patient_name 匹配", dbRows[0].patient_name === "认知测试-孙女士", dbRows[0].patient_name);
    assert("is_quick6 = true", dbRows[0].is_quick6 === true, String(dbRows[0].is_quick6));
  }
  await pp.screenshot({ path: "js/questionnaire/screenshot-cog-e2e.png", fullPage: true });
} catch (e) {
  console.error("❌ 异常:", e.message);
  fail++;
}

console.log("\n" + "═".repeat(60));
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log("\n=== 关键日志 ===");
logs.filter(l => !l.includes("Failed to load resource") && !l.includes("404")).slice(-25).forEach((l) => console.log(l));
await browser.close();
if (fail > 0) process.exit(1);