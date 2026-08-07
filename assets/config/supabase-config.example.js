// assets/config/supabase-config.example.js
// Supabase 项目配置 (模板)
// 真实配置: 复制此文件为 supabase-config.js 并填入实际值
// git 会忽略 supabase-config.js (见 .gitignore)

// Supabase 项目 URL (格式: https://<project-ref>.supabase.co)
window.__SUPABASE_URL__ = 'https://YOUR-PROJECT-REF.supabase.co';

// Supabase anon key (公开, 用于浏览器端 anon-key 调用 RLS 受保护的数据)
// 获取: Supabase Dashboard → Settings → API → Project API keys → anon public
window.__SUPABASE_ANON_KEY__ = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR-ANON-KEY-HERE';

// 启用调试日志
window.__SUPABASE_DEBUG__ = true;