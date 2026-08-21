// VOR 会话上报（5.3）：独立轻量 Supabase REST 直连 + localStorage 兜底
// 复用 brainmend 现有模式（qnr-supabase.js）：不用 SDK，anon-key 提交走 SECURITY DEFINER RPC，
// therapist_id 由 RPC 内 auth.uid() 派生，RLS 保护。RPC 为 0007 迁移草案（submit_vor_session）。
// 未配置后端 / 网络失败时写入 localStorage 待传队列，联网后 flushPending() 补传。

const PENDING_KEY = 'vor_pending_sessions';
const MAX_PENDING = 5;

function _configured() {
  const url = globalThis.__SUPABASE_URL__;
  const key = globalThis.__SUPABASE_ANON_KEY__;
  if (!url || !key) return false;
  if (url.indexOf('YOUR-PROJECT-REF') >= 0 || key.indexOf('YOUR-ANON-KEY') >= 0) return false;
  return true;
}

function _pending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _queue(body) {
  try {
    const arr = _pending();
    arr.push(body);
    while (arr.length > MAX_PENDING) arr.shift(); // 淘汰最旧
    localStorage.setItem(PENDING_KEY, JSON.stringify(arr));
  } catch { /* QuotaExceededError：静默放弃（最坏丢一条未上传记录） */ }
}

function _buildBody({ token, session }) {
  const s = session || {};
  return {
    p_share_token: token || null,
    p_chapter: s.chapter ?? 1,
    p_fixation_mode: s.fixation_mode || 'inferred',
    p_difficulty_tier: s.difficulty_tier || 'base',
    p_started_at: s.start_time || new Date().toISOString(),
    p_duration_sec: s.duration_sec || 0,
    p_active_duration_sec: s.active_duration_sec || 0,
    p_symptom_vas: s.symptom_vas || { pre: null, post: null },
    p_summary: s.summary || {},
    p_details: {
      training_blocks: s.training_blocks || [],
      head_pose: s.head_pose || [],
      alpha_rms: s.alpha_rms || [],
      fixation_loss_events: s.fixation_loss_events || [],
      out_of_range_events: s.out_of_range_events || [],
      device_gaps: s.device_gaps || [],
    },
    p_allow_share_anon: false,
  };
}

// 提交单条会话；返回 {ok:true,id} 或 {queued:true}（已入待传队列）
export async function submitVorSession({ token, session }) {
  const body = _buildBody({ token, session });
  if (!_configured()) {
    _queue(body);
    return { queued: true };
  }
  try {
    const url = globalThis.__SUPABASE_URL__.replace(/\/$/, '') + '/rest/v1/rpc/submit_vor_session';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: globalThis.__SUPABASE_ANON_KEY__,
        Authorization: 'Bearer ' + globalThis.__SUPABASE_ANON_KEY__,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const id = res.status === 204 ? null : await res.json();
    return { ok: true, id };
  } catch {
    _queue(body);
    return { queued: true };
  }
}

// 补传所有待传队列；返回成功补传数
export async function flushPending() {
  if (!_configured()) return 0;
  const arr = _pending();
  if (!arr.length) return 0;
  let ok = 0;
  for (const body of arr) {
    try {
      const url = globalThis.__SUPABASE_URL__.replace(/\/$/, '') + '/rest/v1/rpc/submit_vor_session';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: globalThis.__SUPABASE_ANON_KEY__,
          Authorization: 'Bearer ' + globalThis.__SUPABASE_ANON_KEY__,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) ok++;
    } catch { /* 保留该条，下次再试 */ }
  }
  // 移除已成功补传的条数（按顺序前 ok 条）
  try {
    const remain = arr.slice(ok);
    if (remain.length) localStorage.setItem(PENDING_KEY, JSON.stringify(remain));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
  return ok;
}

// 暴露全局（供调试 / 现有页面集成）
if (typeof window !== 'undefined') {
  window.__vorSupabase = { submitVorSession, flushPending, isConfigured: _configured };
}
