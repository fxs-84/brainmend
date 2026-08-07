// assets/cognitive/reports/qnr-therapist-ui.js
// brainmend 治疗师 UI (登录 + share_link 管理 + 自评报告列表)
//
// 顶层设计:
//   · 治疗师在脑优化 index.html 通过此 UI 登录 Supabase
//   · 创建 share_link → Supabase RPC → 拿 token → 生成 QR
//   · 患者扫码 → 提交到 Supabase → 治疗师可在本 UI 列表查看
//   · 依赖: SupabaseClient (assets/cognitive/reports/qnr-supabase.js)

(function (global) {
  'use strict';

  // ============ 状态栏 (固定在 index.html 顶部) ============
  function _ensureStyles() {
    if (document.getElementById('qnr-supabase-styles')) return;
    var s = document.createElement('style');
    s.id = 'qnr-supabase-styles';
    s.textContent = [
      '.bm-auth-bar { position:fixed; top:8px; right:8px; z-index:25000; display:flex; gap:8px; align-items:center; background:rgba(15,23,42,0.85); backdrop-filter:blur(8px); padding:8px 14px; border-radius:999px; box-shadow:0 4px 16px rgba(0,0,0,0.2); font-family:-apple-system,sans-serif; font-size:13px; color:#fff; }',
      '.bm-auth-bar button { padding:6px 14px; border-radius:999px; border:none; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; }',
      '.bm-auth-bar .bm-btn-primary { background:linear-gradient(135deg,#0d9488,#0284c7); color:#fff; }',
      '.bm-auth-bar .bm-btn-ghost { background:rgba(255,255,255,0.15); color:#fff; }',
      '.bm-auth-bar .bm-status-dot { width:8px; height:8px; border-radius:50%; }',
      '.bm-modal-overlay { position:fixed; inset:0; z-index:30000; background:rgba(15,23,42,0.55); display:flex; align-items:center; justify-content:center; padding:16px; }',
      '.bm-modal { background:#fff; border-radius:16px; max-width:480px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 24px 60px rgba(15,23,42,0.35); }',
      '.bm-modal h3 { padding:20px 24px 12px; margin:0; font-size:18px; color:#0f172a; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; }',
      '.bm-modal-body { padding:18px 24px; }',
      '.bm-modal-tabs { display:flex; border-bottom:1px solid #e2e8f0; }',
      '.bm-modal-tab { flex:1; padding:12px; text-align:center; cursor:pointer; font-size:14px; color:#64748b; border-bottom:2px solid transparent; }',
      '.bm-modal-tab.active { color:#0d9488; border-bottom-color:#0d9488; font-weight:600; }',
      '.bm-form-group { margin-bottom:14px; }',
      '.bm-form-group label { display:block; font-size:12px; color:#334155; margin-bottom:6px; }',
      '.bm-form-group input { width:100%; padding:10px 12px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:14px; box-sizing:border-box; }',
      '.bm-form-group input:focus { outline:none; border-color:#0d9488; }',
      '.bm-btn-block { display:block; width:100%; padding:12px; background:linear-gradient(135deg,#0d9488,#0284c7); color:#fff; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; }',
      '.bm-btn-secondary { background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; }',
      '.bm-list-item { padding:12px 16px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:10px; background:#f8fafc; }',
      '.bm-list-item-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }',
      '.bm-list-item-meta { font-size:12px; color:#64748b; }',
      '.bm-empty { padding:32px; text-align:center; color:#94a3b8; font-size:14px; }',
      '@keyframes bm-fade-in { from { opacity:0 } to { opacity:1 } }',
      '@keyframes bm-scale-in { from { transform:scale(0.92); opacity:0 } to { transform:scale(1); opacity:1 } }',
      '.bm-modal-overlay { animation:bm-fade-in 0.18s ease-out; }',
      '.bm-modal { animation:bm-scale-in 0.18s ease-out; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ============ 顶部状态栏 ============
  function renderAuthBar() {
    _ensureStyles();
    var bar = document.getElementById('bm-auth-bar');
    if (bar) bar.remove();

    var configured = global.SupabaseClient && global.SupabaseClient.isConfigured();
    var session = global.SupabaseClient ? global.SupabaseClient.getSession() : null;

    bar = document.createElement('div');
    bar.id = 'bm-auth-bar';
    bar.className = 'bm-auth-bar';

    if (!configured) {
      bar.innerHTML = '<span class="bm-status-dot" style="background:#f59e0b;"></span>' +
        '<span>云端: <b>未配置 Supabase</b> · 见 supabase/SETUP.md</span>';
      document.body.appendChild(bar);
      return;
    }

    if (session && session.user) {
      var email = session.user.email || '未知';
      bar.innerHTML =
        '<span class="bm-status-dot" style="background:#16a34a;"></span>' +
        '<span style="opacity:0.85;">' + email + '</span>' +
        '<button class="bm-btn-ghost" onclick="window.BmTherapistUI.openDashboard()">📋 我的报告</button>' +
        '<button class="bm-btn-ghost" onclick="window.BmTherapistUI.signOut()">退出</button>';
    } else {
      bar.innerHTML =
        '<span class="bm-status-dot" style="background:#16a34a;"></span>' +
        '<span style="opacity:0.85;">Supabase 已连接</span>' +
        '<button class="bm-btn-primary" onclick="window.BmTherapistUI.openAuth()">👤 治疗师登录</button>';
    }
    document.body.appendChild(bar);
  }

  // ============ 登录/注册 modal ============
  function openAuth() {
    if (!global.SupabaseClient || !global.SupabaseClient.isConfigured()) {
      alert('Supabase 未配置。请参考 supabase/SETUP.md。');
      return;
    }
    var existing = document.getElementById('bm-auth-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'bm-auth-modal';
    overlay.className = 'bm-modal-overlay';
    overlay.innerHTML =
      '<div class="bm-modal" onclick="event.stopPropagation()">' +
        '<h3>👤 治疗师登录 / 注册<span style="cursor:pointer;font-size:24px;color:#94a3b8;line-height:1;" onclick="document.getElementById(\'bm-auth-modal\').remove()">×</span></h3>' +
        '<div class="bm-modal-tabs">' +
          '<div class="bm-modal-tab active" data-tab="signin" onclick="window.BmTherapistUI.switchAuthTab(\'signin\')">登录</div>' +
          '<div class="bm-modal-tab" data-tab="signup" onclick="window.BmTherapistUI.switchAuthTab(\'signup\')">注册</div>' +
        '</div>' +
        '<div class="bm-modal-body">' +
          '<div id="bm-auth-form-signin">' +
            '<div class="bm-form-group"><label>邮箱</label><input id="bm-auth-email" type="email" placeholder="therapist@example.com" /></div>' +
            '<div class="bm-form-group"><label>密码</label><input id="bm-auth-password" type="password" placeholder="至少 6 位" /></div>' +
            '<button class="bm-btn-block" onclick="window.BmTherapistUI.doSignIn()">登 录</button>' +
          '</div>' +
          '<div id="bm-auth-form-signup" style="display:none;">' +
            '<div class="bm-form-group"><label>姓名</label><input id="bm-signup-name" type="text" placeholder="如:李医生" /></div>' +
            '<div class="bm-form-group"><label>邮箱</label><input id="bm-signup-email" type="email" placeholder="therapist@example.com" /></div>' +
            '<div class="bm-form-group"><label>密码</label><input id="bm-signup-password" type="password" placeholder="至少 6 位" /></div>' +
            '<button class="bm-btn-block" onclick="window.BmTherapistUI.doSignUp()">注 册</button>' +
          '</div>' +
          '<div id="bm-auth-msg" style="margin-top:10px;font-size:13px;color:#dc2626;"></div>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function switchAuthTab(tab) {
    document.querySelectorAll('.bm-modal-tab').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-tab') === tab);
    });
    document.getElementById('bm-auth-form-signin').style.display = tab === 'signin' ? '' : 'none';
    document.getElementById('bm-auth-form-signup').style.display = tab === 'signup' ? '' : 'none';
    var msg = document.getElementById('bm-auth-msg');
    if (msg) msg.textContent = '';
  }

  function doSignIn() {
    var email = (document.getElementById('bm-auth-email').value || '').trim();
    var pwd = document.getElementById('bm-auth-password').value || '';
    if (!email || !pwd) {
      _setAuthMsg('请填写邮箱和密码');
      return;
    }
    _setAuthMsg('登录中...', '#0284c7');
    global.SupabaseClient.signIn(email, pwd).then(function () {
      _setAuthMsg('登录成功!', '#16a34a');
      setTimeout(function () {
        var m = document.getElementById('bm-auth-modal');
        if (m) m.remove();
        renderAuthBar();
      }, 500);
    }).catch(function (err) {
      _setAuthMsg('登录失败: ' + (err.message || err));
    });
  }

  function doSignUp() {
    var name = (document.getElementById('bm-signup-name').value || '').trim();
    var email = (document.getElementById('bm-signup-email').value || '').trim();
    var pwd = document.getElementById('bm-signup-password').value || '';
    if (!email || !pwd) {
      _setAuthMsg('请填写邮箱和密码');
      return;
    }
    if (pwd.length < 6) {
      _setAuthMsg('密码至少 6 位');
      return;
    }
    _setAuthMsg('注册中...', '#0284c7');
    global.SupabaseClient.signUp(email, pwd, name).then(function (data) {
      if (data.access_token) {
        _setAuthMsg('注册成功! 已自动登录', '#16a34a');
        setTimeout(function () {
          var m = document.getElementById('bm-auth-modal');
          if (m) m.remove();
          renderAuthBar();
        }, 500);
      } else {
        _setAuthMsg('注册成功! 请去邮箱验证后登录', '#16a34a');
      }
    }).catch(function (err) {
      _setAuthMsg('注册失败: ' + (err.message || err));
    });
  }

  function _setAuthMsg(text, color) {
    var el = document.getElementById('bm-auth-msg');
    if (el) {
      el.textContent = text;
      el.style.color = color || '#dc2626';
    }
  }

  function signOut() {
    global.SupabaseClient.signOut().then(function () {
      renderAuthBar();
    });
  }

  // ============ 治疗师面板 (share_links + 自评报告) ============
  function openDashboard() {
    if (!global.SupabaseClient || !global.SupabaseClient.isConfigured()) {
      alert('Supabase 未配置');
      return;
    }
    var sess = global.SupabaseClient.getSession();
    if (!sess) { openAuth(); return; }

    var existing = document.getElementById('bm-dashboard-modal');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'bm-dashboard-modal';
    overlay.className = 'bm-modal-overlay';
    overlay.innerHTML =
      '<div class="bm-modal" style="max-width:720px;" onclick="event.stopPropagation()">' +
        '<h3>📋 治疗师工作台' +
          '<span style="cursor:pointer;font-size:24px;color:#94a3b8;line-height:1;" onclick="document.getElementById(\'bm-dashboard-modal\').remove()">×</span>' +
        '</h3>' +
        '<div class="bm-modal-body">' +
          // 创建分享链接
          '<div style="background:linear-gradient(135deg,#f0fdfa,#e0f2fe);border-radius:12px;padding:16px;margin-bottom:18px;">' +
            '<div style="font-weight:600;color:#0f172a;margin-bottom:10px;">📱 创建 QR 分享链接</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">' +
              '<input id="bm-link-name" type="text" placeholder="预填姓名 (可选)" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" />' +
              '<input id="bm-link-age" type="number" placeholder="预填年龄 (可选)" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" />' +
              '<select id="bm-link-gender" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;"><option value="">性别 (可选)</option><option>男</option><option>女</option><option>其他</option></select>' +
            '</div>' +
            '<button class="bm-btn-block" onclick="window.BmTherapistUI.createShareLink()" style="margin-bottom:6px;">+ 创建链接 (30 天有效)</button>' +
            '<div id="bm-link-result"></div>' +
          '</div>' +
          // 已有的分享链接
          '<div style="font-weight:600;color:#0f172a;margin-bottom:10px;">🔗 我的分享链接</div>' +
          '<div id="bm-link-list" style="margin-bottom:18px;">' +
            '<div class="bm-empty">加载中...</div>' +
          '</div>' +
          // 自评报告
          '<div style="font-weight:600;color:#0f172a;margin-bottom:10px;">📊 自评报告</div>' +
          '<div id="bm-report-list">' +
            '<div class="bm-empty">加载中...</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    _loadShareLinks();
    _loadAssessments();
  }

  // 加载 share_links
  function _loadShareLinks() {
    var list = document.getElementById('bm-link-list');
    if (!list) return;
    global.SupabaseClient.listShareLinks({ limit: 20 }).then(function (rows) {
      if (!rows || !rows.length) {
        list.innerHTML = '<div class="bm-empty">还没有分享链接。点击上方创建第一个。</div>';
        return;
      }
      list.innerHTML = rows.map(function (r) {
        var url = location.origin + location.pathname.replace(/[^/]*$/, '') +
          'questionnaire.html?sandbox=1&share_token=' + encodeURIComponent(r.token) +
          (r.prefilled_name ? '&name=' + encodeURIComponent(r.prefilled_name) : '') +
          (r.prefilled_age ? '&age=' + r.prefilled_age : '') +
          (r.prefilled_gender ? '&gender=' + encodeURIComponent(r.prefilled_gender) : '');
        var expired = new Date(r.expires_at) < new Date();
        var status = r.revoked ? '已撤销' : (expired ? '已过期' : '有效');
        var statusColor = r.revoked ? '#dc2626' : (expired ? '#94a3b8' : '#16a34a');
        return '<div class="bm-list-item">' +
          '<div class="bm-list-item-head">' +
            '<div><b>' + _esc(r.prefilled_name || '未指定患者') + '</b></div>' +
            '<div style="display:flex;gap:6px;align-items:center;">' +
              '<span style="font-size:11px;background:' + statusColor + ';color:#fff;padding:2px 8px;border-radius:999px;">' + status + '</span>' +
              '<span class="bm-list-item-meta">' + (r.scan_count || 0) + ' 次扫码</span>' +
            '</div>' +
          '</div>' +
          '<div class="bm-list-item-meta">token: ' + r.token.substring(0, 16) + '... · 过期: ' + new Date(r.expires_at).toLocaleString('zh-CN') + '</div>' +
          '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' +
            '<button onclick="window.BmTherapistUI.showQR(\'' + r.token + '\',\'' + _esc(r.prefilled_name || '未指定') + '\')" style="padding:5px 10px;background:#0d9488;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">📱 显示 QR</button>' +
            '<button onclick="window.BmTherapistUI.copyLink(\'' + url + '\')" style="padding:5px 10px;background:#e0f2fe;color:#0284c7;border:none;border-radius:6px;font-size:12px;cursor:pointer;">🔗 复制链接</button>' +
            (!r.revoked ? '<button onclick="window.BmTherapistUI.revokeLink(\'' + r.token + '\')" style="padding:5px 10px;background:#fef2f2;color:#dc2626;border:none;border-radius:6px;font-size:12px;cursor:pointer;">🚫 撤销</button>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      list.innerHTML = '<div class="bm-empty" style="color:#dc2626;">加载失败: ' + (err.message || err) + '</div>';
    });
  }

  // 加载自评报告
  function _loadAssessments() {
    var list = document.getElementById('bm-report-list');
    if (!list) return;
    global.SupabaseClient.listMyAssessments({ limit: 50 }).then(function (rows) {
      if (!rows || !rows.length) {
        list.innerHTML = '<div class="bm-empty">还没有自评报告。等患者扫码提交...</div>';
        return;
      }
      list.innerHTML = rows.map(function (r) {
        var sevColor = { normal:'#16a34a', mild:'#ca8a04', moderate:'#ea580c', severe:'#dc2626' };
        var sevLabel = { normal:'正常', mild:'轻度', moderate:'中度', severe:'重度' };
        return '<div class="bm-list-item">' +
          '<div class="bm-list-item-head">' +
            '<div><b>' + _esc(r.patient_name) + '</b> ' + (r.patient_age ? '· ' + r.patient_age + '岁' : '') + ' ' + (r.patient_gender || '') + '</div>' +
            '<span style="background:' + (sevColor[r.worst_severity] || '#94a3b8') + ';color:#fff;font-size:11px;padding:2px 10px;border-radius:999px;">' + (sevLabel[r.worst_severity] || '—') + ' · ' + r.percent + '%</span>' +
          '</div>' +
          '<div class="bm-list-item-meta">' + new Date(r.submitted_at).toLocaleString('zh-CN') + ' · ' + (r.source || 'qr') + '</div>' +
          '<div style="margin-top:6px;font-size:12px;color:#475569;">' + (r.burden_groups && r.burden_groups.length ? '高负担: ' + _esc(r.burden_groups.join('、')) : '无明显负担') + '</div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      list.innerHTML = '<div class="bm-empty" style="color:#dc2626;">加载失败: ' + (err.message || err) + '</div>';
    });
  }

  function createShareLink() {
    var name = document.getElementById('bm-link-name').value || '';
    var age = document.getElementById('bm-link-age').value || '';
    var gender = document.getElementById('bm-link-gender').value || '';
    var resultEl = document.getElementById('bm-link-result');
    resultEl.innerHTML = '<div style="color:#0284c7;font-size:13px;">创建中...</div>';
    global.SupabaseClient.createShareLink({
      name: name || null,
      age: age || null,
      gender: gender || null,
      expiresDays: 30
    }).then(function (link) {
      var url = location.origin + location.pathname.replace(/[^/]*$/, '') +
        'questionnaire.html?sandbox=1&share_token=' + encodeURIComponent(link.token) +
        (link.prefilled_name ? '&name=' + encodeURIComponent(link.prefilled_name) : '') +
        (link.prefilled_age ? '&age=' + link.prefilled_age : '') +
        (link.prefilled_gender ? '&gender=' + encodeURIComponent(link.prefilled_gender) : '');
      resultEl.innerHTML =
        '<div style="background:#f0fdfa;border:1px solid #6ee7b7;border-radius:8px;padding:10px;margin-top:8px;">' +
          '<div style="font-size:12px;color:#047857;margin-bottom:6px;">✅ 链接创建成功!</div>' +
          '<div style="font-size:11px;color:#475569;word-break:break-all;margin-bottom:6px;">' + url + '</div>' +
          '<button onclick="window.BmTherapistUI.showQR(\'' + link.token + '\', \'' + _esc(link.prefilled_name || '未指定') + '\')" style="padding:6px 12px;background:#0d9488;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">📱 显示二维码</button>' +
          '<button onclick="window.BmTherapistUI.copyLink(\'' + url + '\')" style="padding:6px 12px;background:#e0f2fe;color:#0284c7;border:none;border-radius:6px;font-size:12px;cursor:pointer;margin-left:6px;">🔗 复制</button>' +
        '</div>';
      _loadShareLinks();
    }).catch(function (err) {
      resultEl.innerHTML = '<div style="color:#dc2626;font-size:13px;margin-top:8px;">❌ 创建失败: ' + (err.message || err) + '</div>';
    });
  }

  function showQR(token, patientName) {
    var url = location.origin + location.pathname.replace(/[^/]*$/, '') +
      'questionnaire.html?sandbox=1&share_token=' + encodeURIComponent(token);
    var qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(url);
    var overlay = document.createElement('div');
    overlay.id = 'bm-qr-overlay';
    overlay.className = 'bm-modal-overlay';
    overlay.innerHTML =
      '<div class="bm-modal" style="max-width:360px;text-align:center;" onclick="event.stopPropagation()">' +
        '<h3>📱 ' + _esc(patientName) + '<span style="cursor:pointer;font-size:24px;color:#94a3b8;line-height:1;" onclick="document.getElementById(\'bm-qr-overlay\').remove()">×</span></h3>' +
        '<div class="bm-modal-body">' +
          '<img src="' + qrImgUrl + '" alt="QR Code" style="width:240px;height:240px;border:1px solid #e2e8f0;border-radius:8px;display:block;margin:0 auto;" />' +
          '<div style="margin-top:12px;font-size:12px;color:#64748b;word-break:break-all;">' + url + '</div>' +
          '<button onclick="window.BmTherapistUI.copyLink(\'' + url + '\')" style="margin-top:10px;padding:8px 16px;background:#0d9488;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;">🔗 复制链接</button>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function copyLink(url) {
    try {
      navigator.clipboard.writeText(url).then(function () {
        _toast('链接已复制到剪贴板');
      }).catch(function () {
        prompt('复制此链接:', url);
      });
    } catch (e) {
      prompt('复制此链接:', url);
    }
  }

  function revokeLink(token) {
    if (!confirm('确定要撤销这个分享链接?撤销后患者无法再扫码提交。')) return;
    global.SupabaseClient.revokeShareLink(token).then(function () {
      _toast('已撤销');
      _loadShareLinks();
    }).catch(function (err) {
      _toast('撤销失败: ' + (err.message || err), true);
    });
  }

  function _toast(text, isError) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:' + (isError ? '#dc2626' : '#16a34a') + ';color:#fff;padding:10px 20px;border-radius:8px;z-index:40000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ============ 暴露 API ============
  global.BmTherapistUI = {
    renderAuthBar: renderAuthBar,
    openAuth: openAuth,
    switchAuthTab: switchAuthTab,
    doSignIn: doSignIn,
    doSignUp: doSignUp,
    signOut: signOut,
    openDashboard: openDashboard,
    createShareLink: createShareLink,
    showQR: showQR,
    copyLink: copyLink,
    revokeLink: revokeLink,
    // 刷新工作台数据 (share_links + 自评报告)
    refreshDashboard: function () {
      _loadShareLinks();
      _loadAssessments();
    }
  };
})(window);