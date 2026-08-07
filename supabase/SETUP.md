# brainmend Supabase 接入指南

> 老板,这一步你来做最稳,我已经把所有代码准备好了。

## 🎯 目标
把所有 brainmend 数据从 GitHub Contents API 迁到 Supabase,根治患者 PII 公开暴露问题。

## 📋 操作步骤 (15 分钟)

### Step 1: 创建 Supabase 项目 (5 分钟)
1. 打开 https://supabase.com/dashboard
2. New Project → 命名 `brainmend` 或类似
3. 选最近的 Region,设一个数据库密码(妥善保存)
4. 等项目创建完成 (1-2 分钟)

### Step 2: 跑 Schema SQL (3 分钟)
1. 进入新项目的 SQL Editor
2. 复制整个文件 `supabase/migrations/0001_brainmend_baseline.sql` 的内容
3. 粘贴到 SQL Editor → Run
4. 应该看到 "Success. No rows returned" × N (每个 CREATE/INSERT)

### Step 3: 配置 API Key (2 分钟)
1. Settings → API → 复制:
   - **Project URL** (格式 `https://xxx.supabase.co`)
   - **anon public key** (JWT 字符串,以 `eyJ` 开头)
2. 复制文件 `assets/config/supabase-config.example.js` → 重命名为 `assets/config/supabase-config.js`
3. 填入 URL 和 anon key:
   ```js
   window.__SUPABASE_URL__ = 'https://你的项目.supabase.co';
   window.__SUPABASE_ANON_KEY__ = 'eyJhbGciOiJIUzI1NiI...';
   window.__SUPABASE_DEBUG__ = true;  // 调试日志
   ```
4. **不要** 把这个文件提交到 git (已在 .gitignore)

### Step 4: 验证 (5 分钟)
1. 浏览器打开 `https://你的项目.supabase.co` (Pages 站点)
2. 患者流程:扫码 → 做题 → 提交 → 应自动写入 `qnr_self_assessments` 表
3. 在 Supabase Dashboard → Table Editor → `qnr_self_assessments` 看到新记录
4. 浏览器 Console 应看到 `[supabase] POST ... submit_qnr_self_assessment (anon)` 日志

## ✅ 验证清单

| 检查项 | 预期 |
|---|---|
| `therapists` 表存在 | ✅ (SQL 跑过) |
| `qnr_share_links` 表存在 | ✅ |
| `qnr_self_assessments` 表存在 | ✅ |
| `submit_qnr_self_assessment` 函数存在 | ✅ (SQL 自动) |
| 浏览器 Console 无 Supabase 配置错误 | ✅ |
| 患者提交后 `qnr_self_assessments` 有新行 | ✅ |

## 🗑️ 清理旧路径 (后续 Sprint)

完成 Sprint 0 验证后,再做:
1. 删除 `data/reports/*.json` (仓库里已上传的患者数据)
2. 删除 GitHub 上传代码 (`_uploadToCloud` GitHub Contents API 路径)
3. 删除 GitHub PAT 流程 (扫码不再带 `?token=PAT`)
4. 改成 QR 只带 Supabase share_token (数据库生成)

## 🐛 故障排查

**症状**: 患者提交失败,Console 报 `Supabase 未配置`
- 检查 `assets/config/supabase-config.js` 是否被 `<script>` 正确加载
- 检查 anon key 是否有效 (JWT 应能解析)
- 检查 URL 是否含 `https://` 且无 `YOUR-PROJECT-REF` 占位符

**症状**: 提交 401/403
- 检查 RLS 策略是否正确创建 (用 `select * from pg_policies where tablename = 'qnr_self_assessments';`)
- 检查 share_token 是否在 `qnr_share_links` 表中存在且 `revoked = false`

**症状**: 提交成功但治疗师看不到
- 治疗师需先登录 (Supabase Auth) → 触发器自动建 `therapists` 行
- 治疗师 session 必须是创建 share_link 的那个账号

## 📞 我下一步做什么?

配置完成后告诉我,我马上做:
1. ✅ 治疗师登录 UI (邮箱密码, 调用 `signIn`)
2. ✅ 治疗师 share_link 管理 UI (创建/撤销/列表)
3. ✅ 治疗师自评报告列表 UI (从 `listMyAssessments` 读)
4. ✅ 完整 E2E 测试 + LIVE 验证
5. ✅ 部署新版到 GitHub Pages