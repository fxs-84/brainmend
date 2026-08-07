// assets/cognitive/reports/qnr-supabase.js
// brainmend Supabase REST API 客户端 (神经系统自评)
//
// 设计原则:
//   · 不用 Supabase JS SDK, 直接 fetch REST (避免 100KB+ SDK + 与现有代码解耦)
//   · anon-key 提交 (RLS 校验 token + 派生 therapist_id)
//   · authenticated 查询 (RLS 校验 therapist_id = auth.uid())
//   · 配置来源: window.__SUPABASE_URL__ / __SUPABASE_ANON_KEY__
//
// API:
//   supabase.submitQnrAssessment({ token, name, age, gender, ...payload })
//   supabase.listMyAssessments() (auth)
//   supabase.listShareLinks() (auth)
//   supabase.createShareLink({ name, age, gender, expiresDays }) (auth)
//   supabase.revokeShareLink(token) (auth)
//   supabase.signIn(email, password)
//   supabase.signUp(email, password, fullName)
//   supabase.signOut()
//   supabase.getSession() / setSession(access, refresh)

(function (global) {
  'use strict';

  var URL = global.__SUPABASE_URL__ || '';
  var KEY = global.__SUPABASE_ANON_KEY__ || '';
  var DEBUG = !!global.__SUPABASE_DEBUG__;
  var SB_KEY_STORAGE = 'bm_supabase_session';

  function _log() {
    if (DEBUG && global.console) {
      global.console.log.apply(global.console, ['[supabase]'].concat([].slice.call(arguments)));
    }
  }

  function _err() {
    if (global.console) {
      global.console.error.apply(global.console, ['[supabase]'].concat([].slice.call(arguments)));
    }
  }

  function _configured() {
    if (!URL || !KEY) {
      // 未配置不算错误 (向后兼容 GitHub 兜底路径)
      return false;
    }
    if (URL.indexOf('YOUR-PROJECT-REF') >= 0 || KEY.indexOf('YOUR-ANON-KEY') >= 0) {
      return false;
    }
    return true;
  }

  function _session() {
    try {
      var raw = localStorage.getItem(SB_KEY_STORAGE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function _setSession(s) {
    try {
      if (s) localStorage.setItem(SB_KEY_STORAGE, JSON.stringify(s));
      else localStorage.removeItem(SB_KEY_STORAGE);
    } catch (e) {}
  }

  function _headers(useAuth) {
    var h = {
      'apikey': KEY,
      'Content-Type': 'application/json'
    };
    var sess = _session();
    if (useAuth && sess && sess.access_token) {
      h['Authorization'] = 'Bearer ' + sess.access_token;
    } else {
      // anon key 同时也作为 Bearer (Supabase 允许)
      h['Authorization'] = 'Bearer ' + KEY;
    }
    return h;
  }

  function _rest(method, path, body, useAuth) {
    if (! _configured()) {
      return Promise.reject(new Error('Supabase 未配置'));
    }
    var url = URL.replace(/\/$/, '') + path;
    var opts = {
      method: method,
      headers: _headers(useAuth)
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    _log(method, path, useAuth ? '(auth)' : '(anon)', body ? '(body)' : '');
    return fetch(url, opts).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (txt) {
          var msg = 'HTTP ' + res.status + ': ' + (txt || res.statusText);
          _err(msg);
          throw new Error(msg);
        });
      }
      // 204 No Content (用于 delete)
      if (res.status === 204) return null;
      return res.json();
    });
  }

  // ============ 公共 API ============

  // 患者 anon-key 提交自评 (走 SECURITY DEFINER RPC)
  function submitQnrAssessment(input) {
    var body = {
      p_share_token: input.token,
      p_patient_name: input.name,
      p_patient_age: input.age ? parseInt(input.age, 10) : null,
      p_patient_gender: input.gender || null,
      p_responses: input.responses || {},
      p_by_region: input.byRegion || {},
      p_severity_by_region: input.severityByRegion || {},
      p_affected_regions: input.affectedRegions || [],
      p_total_score: input.totalScore || 0,
      p_percent: input.percent || 0,
      p_worst_severity: input.worstSeverity || 'normal',
      p_burden_groups: input.burdenGroups || [],
      p_phone_ear: input.phoneEar || null,
      p_user_agent: navigator.userAgent || null,
      // IP 哈希 (前端只能取到自身, 此处留 null, 后端可由 RPC 函数补)
      p_ip_hash: null
    };
    return _rest('POST', '/rest/v1/rpc/submit_qnr_self_assessment', body, false)
      .then(function (id) {
        _log('submit ok, assessment_id:', id);
        return id;
      });
  }

  // 治疗师查询自己的所有自评记录 (auth)
  function listMyAssessments(opts) {
    opts = opts || {};
    var q = '?select=*&order=submitted_at.desc';
    if (opts.limit) q += '&limit=' + opts.limit;
    if (opts.offset) q += '&offset=' + opts.offset;
    return _rest('GET', '/rest/v1/qnr_self_assessments' + q, undefined, true);
  }

  // 治疗师查询自己的 share_links (auth)
  function listShareLinks(opts) {
    opts = opts || {};
    var q = '?select=*&order=created_at.desc';
    if (opts.limit) q += '&limit=' + opts.limit;
    return _rest('GET', '/rest/v1/qnr_share_links' + q, undefined, true);
  }

  // 治疗师创建 share_link (auth, 走 RPC)
  function createShareLink(input) {
    input = input || {};
    return _rest('POST', '/rest/v1/rpc/create_qnr_share_link', {
      p_prefilled_name: input.name || null,
      p_prefilled_age: input.age ? parseInt(input.age, 10) : null,
      p_prefilled_gender: input.gender || null,
      p_expires_days: input.expiresDays || 30
    }, true);
  }

  // 治疗师撤销 share_link (auth, 走 RPC)
  function revokeShareLink(token) {
    return _rest('POST', '/rest/v1/rpc/revoke_qnr_share_link', {
      p_token: token
    }, true);
  }

  // ============ Auth (Supabase GoTrue) ============

  function signIn(email, password) {
    return _rest('POST', '/auth/v1/token?grant_type=password', {
      email: email,
      password: password
    }, false).then(function (data) {
      _setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user
      });
      _log('sign in ok, user:', data.user.email);
      return data;
    });
  }

  function signUp(email, password, fullName) {
    return _rest('POST', '/auth/v1/signup', {
      email: email,
      password: password,
      data: { full_name: fullName || '' }
    }, false).then(function (data) {
      // 注册后 Supabase 通常需要邮箱验证, 但会话可能已经存在
      if (data.access_token) {
        _setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: data.user
        });
      }
      _log('sign up result:', data);
      return data;
    });
  }

  function signOut() {
    var sess = _session();
    if (!sess) return Promise.resolve();
    return _rest('POST', '/auth/v1/logout', {}, true)
      .catch(function () {})
      .finally(function () {
        _setSession(null);
      });
  }

  function getSession() { return _session(); }

  function isConfigured() { return _configured(); }

  // ============ 暴露 API ============
  global.SupabaseClient = {
    isConfigured: isConfigured,
    submitQnrAssessment: submitQnrAssessment,
    listMyAssessments: listMyAssessments,
    listShareLinks: listShareLinks,
    createShareLink: createShareLink,
    revokeShareLink: revokeShareLink,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    getSession: getSession
  };
})(window);