# Sprint 2 交接文档 — Supabase 迁移收尾

> 创建时间: 2026-08-07
> 目的: 让下一个 agent 无缝接手, 不需要重新调研

## 🎯 Sprint 2 目标

**清理历史 PII + 删除 GitHub 旧路径 + 部署收尾。**

## ✅ Sprint 0/1 已完成 (别重复做)

| 里程碑 | 状态 | 验证 |
|---|---|---|
| Supabase 项目创建 + Schema (0001-0003 SQL) | ✅ | `qnr_self_assessments` 表有数据 |
| 治疗师登录/注册 (Supabase Auth) | ✅ | 集成测试通过 |
| 创建 share_link → token | ✅ | 集成测试通过 |
| 患者扫码 → 100 题 → RPC 提交 | ✅ | Supabase 落库 |
| 治疗师列表查看报告 | ✅ | 集成测试 6/6 全过 |
| LIVE 部署 (fxs-84.github.io/brainmend) | ✅ | 集成测试 6/6 全过 |

## ✅ Sprint 3 已完成 (2026-08-07): 所有报告进 Supabase

| 里程碑 | 状态 | 验证 |
|---|---|---|
| 0004 迁移: cognitive_assessments + gait_assessments 表, share_links 加 kind 列, 2 个提交 RPC | ✅ | 用户已在 Supabase SQL Editor 执行 |
| 认知报告上云 (share_token 链路 + 本地兜底) | ✅ | e2e-cog-gait 28/28 (本地 + LIVE) |
| 步态报告上云 (+ 患者登记表单, phaseSnapshots 提交前剥离) | ✅ | 同上 |
| 治疗师工作台: 链接类型选择 (自评/认知/步态) + 三 tab 报告列表 + 详情复用渲染 | ✅ | 同上 |
| qnr 回归 | ✅ | e2e-supabase 6/6 (本地 + LIVE) |

**Sprint 3 关键文件**:
- `supabase/migrations/0004_cognitive_gait_reports.sql` (两表 + kind 列 + RPC)
- `js/questionnaire/e2e-cog-gait-integration.mjs` (认知/步态集成测试, 28 断言)
- 改动: `qnr-supabase.js` (新 submit/list 函数), `cognitive-report.js`, `gait-analysis.js`, `qnr-therapist-ui.js`, `index.html`

**Sprint 3 新教训**:
8. **GitHub Pages 到本机网络会截断 HTML** (157KB 的 index.html 尾部内联脚本丢失, 表现为全局函数时有时无)。对策: share_token 在保存时从 URL 直接解析兜底 (cognitive-report.js `_getCogShareToken` / gait-analysis.js `_getGaitShareToken`); 集成测试就绪条件必须包含**页面尾部**的脚本 (SupabaseClient), 超时自动重载
9. **git config 有 url.insteadOf 重写** (`git@github.com:` → `https://github.com/`), 交接文档里的"部署用 SSH"实际一直走的 HTTPS; github.com:443 会间歇性完全不通, push 失败就等几分钟重试
10. **创建认知链接带 start=full** 直达做题; 步态链接不带 start (步态只有一个入口)
11. **步态 phaseSnapshots (时相截图 dataURL) 上云前必须剥离**, 本地保留

**关键文件**:
- `supabase/migrations/0001_brainmend_baseline.sql` (schema)
- `supabase/migrations/0002_fix_admin_recursion.sql` (RLS 递归修复)
- `supabase/migrations/0003_fix_pgcrypto_rls.sql` (pgcrypto + RLS INSERT)
- `assets/cognitive/reports/qnr-supabase.js` (REST 客户端)
- `assets/cognitive/reports/qnr-therapist-ui.js` (治疗师 UI)
- `assets/config/supabase-config.js` (真实配置, 已提交仓库)
- `js/questionnaire/e2e-supabase-integration.mjs` (集成测试)

**Supabase 项目**: `bydijxssezoetquounqo.supabase.co`
**anon key**: `sb_publishable_4o9PiVAVZ8SQDw1HP7A0QA_fAVXFsFW`
**公开注册**: ❌ 已关闭 (2026-08-07, Dashboard → Authentication → Sign In / Up → "Allow new users to sign up"; 新治疗师需 admin 在 Dashboard 手动建号)
**固定测试账号**: `bm-e2e-test@example.com` / `Test1234!` (两个集成测试共用, 登录优先注册兜底)

---

## 🔴 任务 1 (最高优先级): 删除公开仓库的历史患者数据 — ✅ 已完成 (2026-08-07)

> 已执行 `git rm -r data/` + force push 到 main (commit `310070b`), 两个历史报告 URL 已验证 404。

**现状**: `data/reports/` 目录在公开仓库 (fxs-84/brainmend), 含**真实患者 PII**:
- `data/reports/default/2026-06-22_cog_20260622_1256.json` (付先生/42岁)
- `data/reports/default/2026-06-23_cog_20260623_1201.json`
- `data/reports/default/2026-08-05_qnr_*.json` (多份, 患者姓名/年龄/100题答案)
- `data/reports/default/2026/8/5_qnr_*.json` (斜杠日期目录)

**这些数据任何人现在都能通过 GitHub Pages 下载**:
```
https://fxs-84.github.io/brainmend/data/reports/default/2026-08-05_qnr_*.json
```

**操作**:
1. 从 git 仓库删除 `data/` 目录:
```bash
git rm -r data/
```
2. 提交 + 推送:
```bash
git add -A
git commit -m "chore(security): 删除公开仓库的历史患者数据 (迁移到 Supabase)"
git push origin deploy-qnr-cloudsync:main --force
```
3. **注意**: Pages 缓存可能有延迟, 删除后需等几分钟再验证 404

**验证**:
```bash
curl -sI https://fxs-84.github.io/brainmend/data/reports/default/2026-08-05_qnr_1785922934536.json | head -1
# 应返回 404
```

## 🔴 任务 2: 仓库改 Private — ❌ 不执行 (2026-08-07 决定)

> **决定**: 账号是免费计划, 改 Private 会关停 GitHub Pages (LIVE 站下线), 故**保持 Public**。
> PII 风险靠任务 1 (删除 data/) 兜底; 但 **git 历史 commit 仍含 PII**, 公开仓库可挖到。
> 后续可选: 升级 Pro 后改 Private, 或重写 git 历史 (filter-repo) 后 force push。

**为什么**: 即使删了 data/, 仓库里所有历史 commit 仍含 PII (git 历史不可删除, 除非 force push 重写历史)

**操作**: GitHub → Settings → Danger Zone → Change repository visibility → **Private**

**影响**:
- ✅ github.com 浏览/API 枚举 → 封死
- ⚠️ GitHub Pages 静态文件仍公开 (Pages 有独立可见性)
- ⚠️ 患者仍能扫码做题 (不影响)
- ⚠️ 前端代码含 anon key (公开安全, RLS 保护)

## 🟡 任务 3: 删除 GitHub Contents API 上传路径 — ✅ 已完成 (2026-08-07)

**现状**: 前端仍保留 GitHub 兜底上传 (兼容旧流程), 但已无必要

**已删的**:
1. ~~`assets/cognitive/cognitive-report.js` 里的 `uploadToCloud` GitHub 实现~~ ✅ (连 `fetchCloudReports` / 云端删除 / 云端记录 tab / token 配置 UI 一并移除)
2. ~~`questionnaire.html` 里的 GitHub 兜底路径 (搜 `GH_API`)~~ ✅ (只走 Supabase, 失败标记 `no_share_token` / `supabase_not_configured` / 服务端错误)
3. ~~`index.html` 里 CloudSync 的 GitHub 相关~~ ✅ (QR 不再携带 `?token=PAT`; `_qnrSaveRecord` 回传流程仅本机保存)
4. ~~`data/reports/` 相关引用~~ ✅ (写/上传路径全删; classify.js 保留纯函数, 已无生产调用方)
5. 连带删除: `assets/cognitive/reports/cloud-sync.js`、`assets/cognitive/reports/cloud-api.js`、`tests/reports/cloud-api.test.js`、`js/questionnaire/probe-cloud-sync.mjs`、`js/questionnaire/probe-cloud-save.mjs`

**保留的**:
- `assets/cognitive/reports/qnr-supabase.js` (Supabase 客户端)
- `assets/cognitive/reports/qnr-therapist-ui.js` (治疗师 UI)
- `assets/cognitive/reports/classify.js` (纯函数: 报告分类/搜索过滤, 本地列表仍在用)

## 🟡 任务 4: 治疗师 UI 增强 (可选) — ⏭️ 跳过 (2026-08-07 用户决定)

当前治疗师工作台有: 登录/注册、创建 share_link、列表、QR 显示、撤销、报告列表

**可增强**:
- [ ] 点击报告 → 查看 16 分区详情 (复用 qnr-region-detail.js 的弹层)
- [ ] 报告页导出 PDF (复用 html2canvas + jsPDF)
- [ ] 删除报告 (软删)
- [ ] 分享链接列表翻页
- [ ] 报告搜索 (按患者名)

## 🟡 任务 5: 部署收尾 — ✅ 已完成 (2026-08-07)

1. 部署分支: `deploy-qnr-cloudsync` (force push 到 main)
2. Pages 源: main 分支
3. 验证: `node js/questionnaire/e2e-supabase-integration.mjs https://fxs-84.github.io/brainmend` → 6/6 全过

> 收尾时发现并修复: 集成测试原来用固定 `waitForTimeout(20000)` 等脚本, LIVE CDN 慢时不可靠
> (表现为 `#bm-auth-modal` 超时)。已改为 `waitForFunction` 等 `BmTherapistUI + SupabaseClient.isConfigured()` (90s 上限)。

---

## ⚠️ 关键教训 (别踩坑)

1. **supabase-config.js 必须提交进仓库** (anon key 公开安全, RLS 保护数据; 不提交则 LIVE 站 404)
2. **脚本加载顺序**: supabase-config.js 必须在 qnr-supabase.js 之前
3. **SQL 必须幂等**: drop policy if exists + create or replace (可反复跑)
4. **RPC 里 INSERT 必须显式写 therapist_id = auth.uid()** (否则 RLS with check 失败)
5. **不要用 gen_random_bytes** (pgcrypto 可能没启用), 用 gen_random_uuid()
6. **集成测试答题等待 >= 400ms** (auto-advance 280ms)
7. **部署用 SSH** (HTTPS 到 github.com 经常 Connection reset)
   ```bash
   git remote set-url origin git@github.com:fxs-84/brainmend.git
   git push origin deploy-qnr-cloudsync:main --force
   git remote set-url origin https://fxs-84@github.com/fxs-84/brainmend.git
   ```

---

## 📞 交接给下个 agent

1. 先读 `docs/SPRINT2_HANDOFF.md` (本文件)
2. 按优先级做: 任务 1 → 2 → 3 → 4 → 5
3. 每步都验证 (curl / 集成测试)
4. 完成后更新本文件状态
