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
//   supabase.submitCognitiveAssessment({ shareToken, patientInfo, payload, overallScore, isQuick6 })
//   supabase.submitGaitAssessment({ shareToken, patientInfo, payload, classificationPrimary })
//   supabase.listMyAssessments() (auth)
//   supabase.listMyCognitiveAssessments() / listMyGaitAssessments() (auth)
//   supabase.listShareLinks() (auth)
//   supabase.createShareLink({ name, age, gender, expiresDays, kind }) (auth)
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

  // 患者 anon-key 提交认知报告 (走 SECURITY DEFINER RPC)
  // payload: 完整认知报告 JSON (normalizedScores/rawScores/brainRegions/riskIndex 等)
  function submitCognitiveAssessment(input) {
    var info = input.patientInfo || {};
    var body = {
      p_share_token: input.shareToken,
      p_patient_name: info.name || '',
      p_patient_age: info.age ? parseInt(info.age, 10) : null,
      p_patient_gender: info.gender || null,
      p_payload: input.payload || {},
      p_overall_score: input.overallScore != null ? input.overallScore : null,
      p_is_quick6: !!input.isQuick6
    };
    return _rest('POST', '/rest/v1/rpc/submit_cognitive_assessment', body, false)
      .then(function (id) {
        _log('submit cognitive ok, assessment_id:', id);
        return id;
      });
  }

  // 患者 anon-key 提交步态报告 (走 SECURITY DEFINER RPC)
  // payload: 完整步态报告 JSON (phaseSnapshots 截图由调用方剥离)
  function submitGaitAssessment(input) {
    var info = input.patientInfo || {};
    var body = {
      p_share_token: input.shareToken,
      p_patient_name: info.name || '',
      p_patient_age: info.age ? parseInt(info.age, 10) : null,
      p_patient_gender: info.gender || null,
      p_payload: input.payload || {},
      p_classification_primary: input.classificationPrimary || null
    };
    return _rest('POST', '/rest/v1/rpc/submit_gait_assessment', body, false)
      .then(function (id) {
        _log('submit gait ok, assessment_id:', id);
        return id;
      });
  }

  // 治疗师查询自己的认知报告 (auth)
  function listMyCognitiveAssessments(opts) {
    opts = opts || {};
    var q = '?select=*&order=submitted_at.desc&deleted_at=is.null';
    if (opts.limit) q += '&limit=' + opts.limit;
    if (opts.offset) q += '&offset=' + opts.offset;
    return _rest('GET', '/rest/v1/cognitive_assessments' + q, undefined, true);
  }

  // 患者 anon-key 提交头动追踪报告 (走 SECURITY DEFINER RPC, therapist_id = auth.uid())
  // 场景: 治疗师诊室里当面做, 不走 share_link
  // payload: { patient_name, patient_age, patient_gender, patient_id, date, overall, scores, details, vestibular, recommendations }
  function submitTrackingRecord(input) {
    var payload = input || {};
    return _rest('POST', '/rest/v1/rpc/submit_tracking_record', {
      p_payload: {
        patient_name: payload.patient_name || '',
        patient_age: payload.patient_age || null,
        patient_gender: payload.patient_gender || null,
        patient_id: payload.patient_id || null,
        date: payload.date || new Date().toISOString(),
        overall: payload.overall != null ? payload.overall : null,
        scores: payload.scores || {},
        details: payload.details || {},
        vestibular: payload.vestibular || {},
        recommendations: payload.recommendations || []
      }
    }, true)
      .then(function (id) {
        _log('submit tracking ok, assessment_id:', id);
        return id;
      });
  }

  // 治疗师查询自己的头动追踪报告 (auth)
  function listMyTrackingRecords(opts) {
    opts = opts || {};
    var q = '?select=*&order=date.desc';
    if (opts.limit) q += '&limit=' + opts.limit;
    if (opts.offset) q += '&offset=' + opts.offset;
    return _rest('GET', '/rest/v1/cervical_tracking_records' + q, undefined, true);
  }

  // 治疗师查询自己的步态报告 (auth)
  function listMyGaitAssessments(opts) {
    opts = opts || {};
    var q = '?select=*&order=submitted_at.desc&deleted_at=is.null';
    if (opts.limit) q += '&limit=' + opts.limit;
    if (opts.offset) q += '&offset=' + opts.offset;
    return _rest('GET', '/rest/v1/gait_assessments' + q, undefined, true);
  }

  // 治疗师查询自己的 share_links (auth)
  function listShareLinks(opts) {
    opts = opts || {};
    var q = '?select=*&order=created_at.desc';
    if (opts.limit) q += '&limit=' + opts.limit;
    return _rest('GET', '/rest/v1/qnr_share_links' + q, undefined, true);
  }

  // 治疗师创建 share_link (auth, 走 RPC)
  // kind: 'qnr' (自评, 默认) | 'cognitive' (认知) | 'gait' (步态)
  // 注: p_kind 是 0004 迁移新增参数; kind='qnr' 时省略以保持迁移前旧 RPC 兼容
  function createShareLink(input) {
    input = input || {};
    var body = {
      p_prefilled_name: input.name || null,
      p_prefilled_age: input.age ? parseInt(input.age, 10) : null,
      p_prefilled_gender: input.gender || null,
      p_expires_days: input.expiresDays || 30
    };
    if (input.kind && input.kind !== 'qnr') body.p_kind = input.kind;
    return _rest('POST', '/rest/v1/rpc/create_qnr_share_link', body, true);
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
    submitCognitiveAssessment: submitCognitiveAssessment,
    submitGaitAssessment: submitGaitAssessment,
    submitTrackingRecord: submitTrackingRecord,
    listMyAssessments: listMyAssessments,
    listMyCognitiveAssessments: listMyCognitiveAssessments,
    listMyGaitAssessments: listMyGaitAssessments,
    listMyTrackingRecords: listMyTrackingRecords,
    listShareLinks: listShareLinks,
    createShareLink: createShareLink,
    revokeShareLink: revokeShareLink,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    getSession: getSession
  };
})(window);