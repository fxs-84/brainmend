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
//   supabase.submitCognitiveAssessmentDirect({ patientInfo, payload, overallScore, isQuick6 }) (auth, 治疗师直传)
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

  // ===== JWT 自动刷新 =====
  // Supabase access_token 默认 3600s (1小时) 过期; 过期后所有带 auth 请求返回 401 PGRST303
  // 方案: 401 时用 refresh_token 换新 token, 更新 localStorage, 重试原请求 (最多 1 次)
  var _refreshing = null; // 防止并发刷新

  function _isExpiredError(txt) {
    return typeof txt === 'string' &&
      (txt.indexOf('JWT expired') >= 0 ||
       txt.indexOf('JWT issued at future') >= 0 ||
       txt.indexOf('PGRST303') >= 0 ||
       // PGRST301 (No suitable key) 也可能是 key 轮换, 刷新后重试一次无害
       txt.indexOf('PGRST301') >= 0);
  }

  // 用 refresh_token 换新 token (GoTrue /auth/v1/token?grant_type=refresh_token)
  function _refreshSession() {
    var sess = _session();
    if (!sess || !sess.refresh_token) return Promise.reject(new Error('无 refresh_token, 请重新登录'));
    var url = URL.replace(/\/$/, '') + '/auth/v1/token?grant_type=refresh_token';
    var opts = {
      method: 'POST',
      headers: {
        'apikey': KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: sess.refresh_token })
    };
    return fetch(url, opts).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (txt) {
          // 刷新失败 (refresh_token 也过期) → 清 session, 让用户重新登录
          _setSession(null);
          throw new Error('刷新会话失败, 请重新登录: ' + txt.substring(0, 120));
        });
      }
      return res.json();
    }).then(function (data) {
      _setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token || sess.refresh_token,
        user: data.user || sess.user
      });
      _log('session refreshed (JWT 过期自动刷新)');
      return data;
    });
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
          // JWT 过期 → 自动刷新 → 重试一次
          if (useAuth && res.status === 401 && _isExpiredError(txt)) {
            if (!_refreshing) {
              _refreshing = _refreshSession().catch(function (e) {
                _refreshing = null;
                throw e;
              });
            }
            return _refreshing.then(function () {
              _refreshing = null;
              var opts2 = {
                method: method,
                headers: _headers(useAuth)
              };
              if (body !== undefined) opts2.body = JSON.stringify(body);
              _log('retry after refresh:', method, path);
              return fetch(url, opts2).then(function (res2) {
                if (!res2.ok) {
                  return res2.text().then(function (txt2) {
                    var msg2 = 'HTTP ' + res2.status + ': ' + (txt2 || res2.statusText);
                    _err(msg2);
                    throw new Error(msg2);
                  });
                }
                if (res2.status === 204) return null;
                return res2.json();
              });
            });
          }
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

  // 治疗师登录后直传认知报告 (本机做题, 不走 share_link; therapist_id = auth.uid())
  // RPC 由 0006 迁移提供; 未执行时调用会失败, 调用方需优雅降级
  function submitCognitiveAssessmentDirect(input) {
    var info = input.patientInfo || {};
    return _rest('POST', '/rest/v1/rpc/submit_cognitive_assessment_direct', {
      p_payload: {
        patient_name: info.name || '',
        patient_age: info.age ? parseInt(info.age, 10) : null,
        patient_gender: info.gender || null,
        payload: input.payload || {},
        overall_score: input.overallScore != null ? input.overallScore : null,
        is_quick6: !!input.isQuick6
      }
    }, true)
      .then(function (id) {
        _log('submit cognitive direct ok, assessment_id:', id);
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

  // ============ 删除 API (硬删, RLS 校验 therapist_id = auth.uid()) ============

  // 删除 share_link (硬删, 不再保留 revoked=true)
  function deleteShareLink(token) {
    return _rest('DELETE', '/rest/v1/qnr_share_links?token=eq.' + encodeURIComponent(token), undefined, true);
  }

  // 删除神经系统自评报告
  function deleteQnrAssessment(id) {
    return _rest('DELETE', '/rest/v1/qnr_self_assessments?id=eq.' + encodeURIComponent(id), undefined, true);
  }

  // 删除认知评估报告
  function deleteCognitiveAssessment(id) {
    return _rest('DELETE', '/rest/v1/cognitive_assessments?id=eq.' + encodeURIComponent(id), undefined, true);
  }

  // 删除步态报告
  function deleteGaitAssessment(id) {
    return _rest('DELETE', '/rest/v1/gait_assessments?id=eq.' + encodeURIComponent(id), undefined, true);
  }

  // 删除头动追踪报告
  function deleteTrackingRecord(id) {
    return _rest('DELETE', '/rest/v1/cervical_tracking_records?id=eq.' + encodeURIComponent(id), undefined, true);
  }

  // ============ 搜索 API (用 ilike 模糊匹配 patient_name 或 patient_age) ============

  // 神经系统自评搜索
  // 注: PostgREST 不支持 ::text 类型转换语法, age 用 cast 也不行; 改用 name/patient_gender/source ilike
  function searchMyAssessments(query, opts) {
    opts = opts || {};
    var q = '?select=*&order=submitted_at.desc';
    if (opts.limit) q += '&limit=' + opts.limit;
    if (query) {
      var esc = query.replace(/[%_]/g, '\\$&');
      q += '&or=(patient_name.ilike.*' + encodeURIComponent(esc) + '*,'
        + 'patient_gender.ilike.*' + encodeURIComponent(esc) + '*,'
        + 'source.ilike.*' + encodeURIComponent(esc) + '*)';
    }
    return _rest('GET', '/rest/v1/qnr_self_assessments' + q, undefined, true);
  }

  // 认知评估搜索
  function searchMyCognitiveAssessments(query, opts) {
    opts = opts || {};
    var q = '?select=*&order=submitted_at.desc&deleted_at=is.null';
    if (opts.limit) q += '&limit=' + opts.limit;
    if (query) {
      var esc = query.replace(/[%_]/g, '\\$&');
      q += '&or=(patient_name.ilike.*' + encodeURIComponent(esc) + '*,'
        + 'patient_gender.ilike.*' + encodeURIComponent(esc) + '*,'
        + 'source.ilike.*' + encodeURIComponent(esc) + '*)';
    }
    return _rest('GET', '/rest/v1/cognitive_assessments' + q, undefined, true);
  }

  // 步态报告搜索
  function searchMyGaitAssessments(query, opts) {
    opts = opts || {};
    var q = '?select=*&order=submitted_at.desc&deleted_at=is.null';
    if (opts.limit) q += '&limit=' + opts.limit;
    if (query) {
      var esc = query.replace(/[%_]/g, '\\$&');
      q += '&or=(patient_name.ilike.*' + encodeURIComponent(esc) + '*,'
        + 'classification_primary.ilike.*' + encodeURIComponent(esc) + '*)';
    }
    return _rest('GET', '/rest/v1/gait_assessments' + q, undefined, true);
  }

  // 头动追踪搜索
  function searchMyTrackingRecords(query, opts) {
    opts = opts || {};
    var q = '?select=*&order=date.desc';
    if (opts.limit) q += '&limit=' + opts.limit;
    if (query) {
      var esc = query.replace(/[%_]/g, '\\$&');
      q += '&or=(patient_name.ilike.*' + encodeURIComponent(esc) + '*,'
        + 'patient_gender.ilike.*' + encodeURIComponent(esc) + '*)';
    }
    return _rest('GET', '/rest/v1/cervical_tracking_records' + q, undefined, true);
  }

  // share_link 搜索
  function searchShareLinks(query) {
    var q = '?select=*&order=created_at.desc';
    if (query) {
      var esc = query.replace(/[%_]/g, '\\$&');
      q += '&or=(prefilled_name.ilike.*' + encodeURIComponent(esc) + '*,'
        + 'token.ilike.*' + encodeURIComponent(esc) + '*)';
    }
    return _rest('GET', '/rest/v1/qnr_share_links' + q, undefined, true);
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
    submitCognitiveAssessmentDirect: submitCognitiveAssessmentDirect,
    submitGaitAssessment: submitGaitAssessment,
    submitTrackingRecord: submitTrackingRecord,
    listMyAssessments: listMyAssessments,
    listMyCognitiveAssessments: listMyCognitiveAssessments,
    listMyGaitAssessments: listMyGaitAssessments,
    listMyTrackingRecords: listMyTrackingRecords,
    listShareLinks: listShareLinks,
    createShareLink: createShareLink,
    deleteShareLink: deleteShareLink,
    deleteQnrAssessment: deleteQnrAssessment,
    deleteCognitiveAssessment: deleteCognitiveAssessment,
    deleteGaitAssessment: deleteGaitAssessment,
    deleteTrackingRecord: deleteTrackingRecord,
    searchMyAssessments: searchMyAssessments,
    searchMyCognitiveAssessments: searchMyCognitiveAssessments,
    searchMyGaitAssessments: searchMyGaitAssessments,
    searchMyTrackingRecords: searchMyTrackingRecords,
    searchShareLinks: searchShareLinks,
    revokeShareLink: revokeShareLink,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    getSession: getSession
  };
})(window);