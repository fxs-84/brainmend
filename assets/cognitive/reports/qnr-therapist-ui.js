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
      '.bm-auth-bar { position:fixed; bottom:16px; right:16px; z-index:25000; display:flex; gap:8px; align-items:center; background:rgba(15,23,42,0.85); backdrop-filter:blur(8px); padding:8px 14px; border-radius:999px; box-shadow:0 4px 16px rgba(0,0,0,0.2); font-family:-apple-system,sans-serif; font-size:13px; color:#fff; }',
      // 收起态: 44px 圆形 FAB, 只显示图标, 不遮内容
      '.bm-auth-bar:not(.expanded) { width:44px; height:44px; padding:0; justify-content:center; cursor:pointer; }',
      '.bm-auth-bar:not(.expanded) .bm-bar-detail, .bm-auth-bar:not(.expanded) .bm-bar-collapse { display:none; }',
      '.bm-auth-bar .bm-bar-detail { display:contents; }',
      '.bm-auth-bar .bm-fab-icon { font-size:20px; line-height:1; }',
      '.bm-auth-bar .bm-bar-collapse { background:none; border:none; color:#94a3b8; font-size:16px; cursor:pointer; padding:0 2px; line-height:1; }',
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

  // ============ 状态栏 (右下角 FAB, 默认收起不遮内容, 点击展开) ============
  function renderAuthBar() {
    _ensureStyles();
    var old = document.getElementById('bm-auth-bar');
    var wasExpanded = old && old.classList.contains('expanded');
    if (old) old.remove();

    var configured = global.SupabaseClient && global.SupabaseClient.isConfigured();
    var session = global.SupabaseClient ? global.SupabaseClient.getSession() : null;

    var bar = document.createElement('div');
    bar.id = 'bm-auth-bar';
    bar.className = 'bm-auth-bar' + (wasExpanded ? ' expanded' : '');
    bar.title = configured ? '治疗师入口 (点击展开)' : '云端未配置 (点击展开)';

    var dot = configured ? '#16a34a' : '#f59e0b';
    var detail;
    if (!configured) {
      detail = '<span>云端: <b>未配置 Supabase</b> · 见 supabase/SETUP.md</span>';
    } else if (session && session.user) {
      var email = session.user.email || '未知';
      detail =
        '<span style="opacity:0.85;">' + email + '</span>' +
        '<button class="bm-btn-ghost" onclick="window.BmTherapistUI.openDashboard()">📋 我的报告</button>' +
        '<button class="bm-btn-ghost" onclick="window.BmTherapistUI.signOut()">退出</button>';
    } else {
      detail =
        '<span style="opacity:0.85;">Supabase 已连接</span>' +
        '<button class="bm-btn-primary" onclick="window.BmTherapistUI.openAuth()">👤 治疗师登录</button>';
    }
    bar.innerHTML =
      '<span class="bm-status-dot" style="background:' + dot + ';"></span>' +
      '<span class="bm-bar-detail">' + detail + '</span>' +
      '<button class="bm-bar-collapse" title="收起" ' +
        'onclick="event.stopPropagation();document.getElementById(\'bm-auth-bar\').classList.remove(\'expanded\')">×</button>';
    // 收起态点击整条 = 展开
    bar.addEventListener('click', function () {
      if (!bar.classList.contains('expanded')) bar.classList.add('expanded');
    });
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
  // opts: { kind?: 'qnr'|'cognitive'|'gait', tab?: 'create'|'reports'|'links' }
  function openDashboard(opts) {
    opts = opts || {};
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
    var initialKind = opts.kind || 'qnr';
    overlay.innerHTML =
      '<div class="bm-modal" style="max-width:720px;" onclick="event.stopPropagation()">' +
        '<h3>📋 治疗师工作台' +
          '<span style="cursor:pointer;font-size:24px;color:#94a3b8;line-height:1;" onclick="document.getElementById(\'bm-dashboard-modal\').remove()">×</span>' +
        '</h3>' +
        '<div class="bm-modal-body">' +
          // 创建分享链接
          '<div style="background:linear-gradient(135deg,#f0fdfa,#e0f2fe);border-radius:12px;padding:16px;margin-bottom:18px;">' +
            '<div style="font-weight:600;color:#0f172a;margin-bottom:10px;">📱 创建 QR 分享链接</div>' +
            '<div style="margin-bottom:8px;">' +
              '<select id="bm-link-kind" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;background:#fff;">' +
                '<option value="qnr"' + (initialKind === 'qnr' ? ' selected' : '') + '>📋 神经系统自评 (100 题)</option>' +
                '<option value="gait"' + (initialKind === 'gait' ? ' selected' : '') + '>🚶 步态分析</option>' +
              '</select>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">' +
              '<input id="bm-link-name" type="text" placeholder="预填姓名 (可选)" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" />' +
              '<input id="bm-link-age" type="number" placeholder="预填年龄 (可选)" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" />' +
              '<select id="bm-link-gender" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;"><option value="">性别 (可选)</option><option>男</option><option>女</option><option>其他</option></select>' +
            '</div>' +
            '<button class="bm-btn-block" onclick="window.BmTherapistUI.createShareLink()" style="margin-bottom:6px;">+ 创建链接 (30 天有效)</button>' +
            '<div id="bm-link-result"></div>' +
          '</div>' +
          // 已有的分享链接 (带搜索框)
          '<div style="font-weight:600;color:#0f172a;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
            '<span>🔗 我的分享链接</span>' +
            '<input id="bm-link-search" type="text" placeholder="🔍 搜索患者/token" style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;width:180px;outline:none;" />' +
          '</div>' +
          '<div id="bm-link-list" style="margin-bottom:18px;">' +
            '<div class="bm-empty">加载中...</div>' +
          '</div>' +
          // 患者报告 (自评 / 认知 / 步态 / 头动追踪) + 搜索框
          '<div style="font-weight:600;color:#0f172a;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
            '<span>📊 患者报告</span>' +
            '<input id="bm-report-search" type="text" placeholder="🔍 搜索患者姓名/年龄" style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;width:180px;outline:none;" />' +
          '</div>' +
          '<div class="bm-modal-tabs" style="margin-bottom:12px;">' +
            '<div class="bm-modal-tab active" data-rtab="qnr" onclick="window.BmTherapistUI.switchReportTab(\'qnr\')">自评</div>' +
            '<div class="bm-modal-tab" data-rtab="cognitive" onclick="window.BmTherapistUI.switchReportTab(\'cognitive\')">认知</div>' +
            '<div class="bm-modal-tab" data-rtab="gait" onclick="window.BmTherapistUI.switchReportTab(\'gait\')">步态</div>' +
            '<div class="bm-modal-tab" data-rtab="tracking" onclick="window.BmTherapistUI.switchReportTab(\'tracking\')">头动追踪</div>' +
          '</div>' +
          '<div id="bm-report-list">' +
            '<div class="bm-empty">加载中...</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    _shareLinksQuery = '';
    _reportQuery = '';
    _loadShareLinks('');
    // 只加载当前 tab 的报告 (直接调 _loadAssessments 会与后续 tab 切换产生异步竞态)
    switchReportTab(_currentReportTab);
    // 搜索框 (share_link)
    var linkSearch = document.getElementById('bm-link-search');
    if (linkSearch) {
      var debounce;
      linkSearch.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          _shareLinksQuery = linkSearch.value.trim();
          _loadShareLinks(_shareLinksQuery);
        }, 200);
      });
    }
    // 搜索框 (报告)
    var reportSearch = document.getElementById('bm-report-search');
    if (reportSearch) {
      var debounce2;
      reportSearch.addEventListener('input', function () {
        clearTimeout(debounce2);
        debounce2 = setTimeout(function () {
          _reportQuery = reportSearch.value.trim();
          switchReportTab(_currentReportTab);
        }, 200);
      });
    }
  }

  var _shareLinksQuery = '';
  var _reportQuery = '';

  // ============ 类型化链接 (qnr=自评 / cognitive=认知 / gait=步态) ============
  var KIND_LABEL = { qnr: '自评', cognitive: '认知', gait: '步态' };

  // 按类型生成患者扫码链接
  function _buildLinkUrl(kind, link) {
    var base = location.origin + location.pathname.replace(/[^/]*$/, '');
    var suffix =
      (link.prefilled_name ? '&name=' + encodeURIComponent(link.prefilled_name) : '') +
      (link.prefilled_age ? '&age=' + link.prefilled_age : '') +
      (link.prefilled_gender ? '&gender=' + encodeURIComponent(link.prefilled_gender) : '');
    var token = encodeURIComponent(link.token);
    if (kind === 'cognitive') return base + 'index.html?mode=cognitive&start=full&share_token=' + token + suffix;
    if (kind === 'gait') return base + 'index.html?mode=gait&share_token=' + token + suffix;
    return base + 'questionnaire.html?sandbox=1&share_token=' + token + suffix;
  }

  // 加载 share_links
  function _loadShareLinks(query) {
    var list = document.getElementById('bm-link-list');
    if (!list) return;
    var promise = query
      ? global.SupabaseClient.searchShareLinks(query)
      : global.SupabaseClient.listShareLinks({ limit: 50 });
    promise.then(function (rows) {
      if (!rows || !rows.length) {
        list.innerHTML = '<div class="bm-empty">' + (query ? '没有匹配 "' + _esc(query) + '" 的分享链接' : '还没有分享链接。点击上方创建第一个。') + '</div>';
        return;
      }
      list.innerHTML = rows.map(function (r) {
        var kind = r.kind || 'qnr';
        var url = _buildLinkUrl(kind, r);
        var expired = new Date(r.expires_at) < new Date();
        var status = r.revoked ? '已撤销' : (expired ? '已过期' : '有效');
        var statusColor = r.revoked ? '#dc2626' : (expired ? '#94a3b8' : '#16a34a');
        return '<div class="bm-list-item">' +
          '<div class="bm-list-item-head">' +
            '<div><span style="font-size:11px;background:#e0f2fe;color:#0284c7;padding:2px 8px;border-radius:999px;margin-right:6px;">' + (KIND_LABEL[kind] || kind) + '</span><b>' + _esc(r.prefilled_name || '未指定患者') + '</b></div>' +
            '<div style="display:flex;gap:6px;align-items:center;">' +
              '<span style="font-size:11px;background:' + statusColor + ';color:#fff;padding:2px 8px;border-radius:999px;">' + status + '</span>' +
              '<span class="bm-list-item-meta">' + (r.scan_count || 0) + ' 次扫码</span>' +
            '</div>' +
          '</div>' +
          '<div class="bm-list-item-meta">token: ' + r.token.substring(0, 16) + '... · 过期: ' + new Date(r.expires_at).toLocaleString('zh-CN') + '</div>' +
          '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' +
            '<button onclick="window.BmTherapistUI.showQR(\'' + r.token + '\',\'' + _esc(r.prefilled_name || '未指定') + '\',\'' + kind + '\')" style="padding:5px 10px;background:#0d9488;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">📱 显示 QR</button>' +
            '<button onclick="window.BmTherapistUI.copyLink(\'' + url + '\')" style="padding:5px 10px;background:#e0f2fe;color:#0284c7;border:none;border-radius:6px;font-size:12px;cursor:pointer;">🔗 复制链接</button>' +
            '<button onclick="window.BmTherapistUI.deleteShareLinkConfirm(\'' + r.token + '\')" style="padding:5px 10px;background:#fef2f2;color:#dc2626;border:none;border-radius:6px;font-size:12px;cursor:pointer;">🗑 删除</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      list.innerHTML = '<div class="bm-empty" style="color:#dc2626;">加载失败: ' + (err.message || err) + '</div>';
    });
  }

  // 统一确认删除 (带确认, 防止误删)
  function _confirmDelete(message, onYes) {
    if (!confirm(message)) return;
    onYes();
  }

  // 删除 share_link (硬删)
  function deleteShareLinkConfirm(token) {
    _confirmDelete('确认删除这个分享链接? 删除后患者扫码将无法再提交报告。', function () {
      global.SupabaseClient.deleteShareLink(token).then(function () {
        _toast('✅ 链接已删除');
        _loadShareLinks(_shareLinksQuery);
      }).catch(function (err) {
        _toast('删除失败: ' + (err.message || err), true);
      });
    });
  }

  // 加载自评报告 (支持搜索)
  function _loadAssessments() {
    var list = document.getElementById('bm-report-list');
    if (!list) return;
    if (_currentReportTab !== 'qnr') return; // 异步返回时 tab 已切换, 丢弃过期结果
    var promise = _reportQuery ? global.SupabaseClient.searchMyAssessments(_reportQuery, { limit: 50 }) : global.SupabaseClient.listMyAssessments({ limit: 50 });
    promise.then(function (rows) {
      _qnrRows = rows || [];
      if (!rows || !rows.length) {
        list.innerHTML = '<div class="bm-empty">' + (_reportQuery ? '没有匹配 "' + _esc(_reportQuery) + '" 的自评报告' : '还没有自评报告。等患者扫码提交...') + '</div>';
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
          '<div class="bm-list-item-meta" style="cursor:pointer;" onclick="window.BmTherapistUI.openQnrReport(\'' + r.id + '\')">' + new Date(r.submitted_at).toLocaleString('zh-CN') + ' · ' + (r.source || 'qr') + ' · 点击查看报告</div>' +
          '<div style="margin-top:6px;font-size:12px;color:#475569;display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="cursor:pointer;flex:1;" onclick="window.BmTherapistUI.openQnrReport(\'' + r.id + '\')">' + (r.burden_groups && r.burden_groups.length ? '高负担: ' + _esc(r.burden_groups.join('、')) : '无明显负担') + '</span>' +
            '<button onclick="event.stopPropagation();window.BmTherapistUI.deleteQnrConfirm(\'' + r.id + '\')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:13px;padding:2px 6px;" title="删除报告">🗑 删除</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      list.innerHTML = '<div class="bm-empty" style="color:#dc2626;">加载失败: ' + (err.message || err) + '</div>';
    });
  }

  // 删除自评报告 (确认 modal)
  function deleteQnrConfirm(id) {
    if (!confirm('确认删除这份神经系统自评报告? 删除后无法恢复。')) return;
    global.SupabaseClient.deleteQnrAssessment(id).then(function () {
      _toast('✅ 报告已删除');
      _loadAssessments();
    }).catch(function (err) {
      _toast('删除失败: ' + (err.message || err), true);
    });
  }

  // ============ 报告 tab (自评 / 认知 / 步态) ============
  var _currentReportTab = 'qnr';
  var _qnrRows = [];
  var _cogRows = [];
  var _gaitRows = [];

  function switchReportTab(tab) {
    _currentReportTab = tab;
    document.querySelectorAll('[data-rtab]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-rtab') === tab);
    });
    var list = document.getElementById('bm-report-list');
    if (list) list.innerHTML = '<div class="bm-empty">加载中...</div>';
    if (tab === 'cognitive') _loadCognitiveAssessments();
    else if (tab === 'gait') _loadGaitAssessments();
    else if (tab === 'tracking') _loadTrackingRecords();
    else _loadAssessments();
  }

  // 加载头动追踪报告 (云端 cervical_tracking_records, 支持搜索)
  var _trackingRows = [];
  function _loadTrackingRecords() {
    var list = document.getElementById('bm-report-list');
    if (!list) return;
    if (_currentReportTab !== 'tracking') return; // 异步返回时 tab 已切换, 丢弃过期结果
    var promise = _reportQuery ? global.SupabaseClient.searchMyTrackingRecords(_reportQuery, { limit: 50 }) : global.SupabaseClient.listMyTrackingRecords({ limit: 50 });
    promise.then(function (rows) {
      _trackingRows = rows || [];
      if (!_trackingRows.length) {
        list.innerHTML = '<div class="bm-empty">' + (_reportQuery ? '没有匹配 "' + _esc(_reportQuery) + '" 的头动追踪报告' : '还没有头动追踪报告。等治疗师做完保存...') + '</div>';
        return;
      }
      list.innerHTML = _trackingRows.map(function (r) {
        var overall = r.overall != null ? r.overall : 0;
        var overallColor = overall >= 80 ? '#16a34a' : (overall >= 60 ? '#ca8a04' : (overall >= 40 ? '#ea580c' : '#dc2626'));
        return '<div class="bm-list-item">' +
          '<div class="bm-list-item-head">' +
            '<div style="cursor:pointer;flex:1;min-width:0;" onclick="window.BmTherapistUI.openTrackingReport(\'' + r.id + '\')">' +
              '<b>' + _esc(r.patient_name || '匿名') + '</b> ' + (r.patient_age ? '· ' + r.patient_age + '岁' : '') + ' ' + (r.patient_gender || '') +
            '</div>' +
            '<div style="display:flex;gap:6px;align-items:center;">' +
              '<span style="background:' + overallColor + ';color:#fff;font-size:11px;padding:2px 10px;border-radius:999px;">综合 ' + overall + ' 分</span>' +
              '<button onclick="event.stopPropagation();window.BmTherapistUI.deleteTrackingConfirm(\'' + r.id + '\')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:13px;padding:2px 6px;" title="删除报告">🗑 删除</button>' +
            '</div>' +
          '</div>' +
          '<div class="bm-list-item-meta" style="cursor:pointer;" onclick="window.BmTherapistUI.openTrackingReport(\'' + r.id + '\')">' + new Date(r.date).toLocaleString('zh-CN') + ' · 头动追踪 · 点击查看报告</div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      list.innerHTML = '<div class="bm-empty" style="color:#dc2626;">加载失败: ' + (err.message || err) + '</div>';
    });
  }

  // 删除头动追踪报告
  function deleteTrackingConfirm(id) {
    if (!confirm('确认删除这份头动追踪报告? 删除后无法恢复。')) return;
    global.SupabaseClient.deleteTrackingRecord(id).then(function () {
      _toast('✅ 报告已删除');
      _loadTrackingRecords();
    }).catch(function (err) {
      _toast('删除失败: ' + (err.message || err), true);
    });
  }

  // 头动追踪报告详情 — 原版「颈椎功能综合评估报告」渲染 (window.renderFullReport)
  // 数据契约照抄 bundle 的 window._viewRecord: 字段写到 window.state 上再渲染
  function openTrackingReport(id) {
    var rec = null;
    for (var i = 0; i < _trackingRows.length; i++) {
      if (_trackingRows[i].id === id) { rec = _trackingRows[i]; break; }
    }
    if (!rec) { alert('记录未找到,请刷新列表'); return; }
    // 关掉工作台 modal (避免遮挡)
    var dash = document.getElementById('bm-dashboard-modal');
    if (dash) dash.remove();

    // 原版渲染器可用 → 走原版报告页 (#view-report 全页替换, 页脚"返回"恢复)
    if (typeof global.renderFullReport === 'function' && global.state) {
      try {
        _renderTrackingFullReport(rec);
        return;
      } catch (e) {
        console.error('[therapist-ui] renderFullReport 失败, 降级简化视图', e);
      }
    }
    // 回退: #result-modal 简化视图 (bundle 未加载等异常)
    _renderTrackingFallback(rec);
  }

  // 原版渲染: 与 bundle _viewRecord 相同的字段装配
  function _renderTrackingFullReport(rec) {
    var details = rec.details || {};
    // 新记录带完整 assessment; 旧记录 (无 assessment) 用 Gt 同款逻辑重建最小 assessment
    var assessment = details.assessment || _rebuildTrackingAssessment(rec);
    // #page2 (首页) 层级高于 #view-report (z-2000), 会盖住报告 — 渲染前隐藏, 关闭时恢复
    var page2 = document.getElementById('page2');
    if (page2) page2.style.display = 'none';
    _wrapCloseFullReport();
    var st = global.state;
    st._reportSource = 'saved';
    st._savedAssessment = assessment;
    st.clientInfo = {
      name: rec.patient_name || '匿名',
      gender: rec.patient_gender || '',
      age: rec.patient_age || '',
      id: rec.patient_id || ''
    };
    if (rec.date) {
      var d = new Date(rec.date);
      st.clientInfo._reportDate = d.toLocaleDateString('zh-CN');
      st.clientInfo._reportTime = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    st.positionResults =
      (assessment.vestibularFunction && assessment.vestibularFunction.details && assessment.vestibularFunction.details.positionResults) ||
      (details.position && details.position.results) || [];
    st.romResults =
      (assessment.cervicalFunction && assessment.cervicalFunction.details && assessment.cervicalFunction.details.romResults) ||
      (details.rom && details.rom.angles) || {};
    st.coordFullScores = details.coordFullScores || [];
    // ⚠️ 渲染器 (Nf) 对空 coordTrails 会回退读 localStorage 本地轨迹 — 显式给空数组 key 阻止错配
    var trails = details.coordTrails;
    st.coordTrails = (trails && Object.keys(trails).length) ? trails : { horizontal: [], vertical: [], figure8: [] };
    st.trail = details.trail || [];
    st.testDuration = details.testDuration || 10;
    st.reportFindings = assessment.findings || [];
    st.brainRegions = assessment.brainRegions || [];
    st.reportRecommendations = assessment.recommendations || rec.recommendations || [];
    global.renderFullReport(st);
  }

  // 包装 bundle 的 closeFullReport: 报告页"返回"时恢复 #page2 (只包一次)
  function _wrapCloseFullReport() {
    if (global.__bmCloseWrapped) return;
    global.__bmCloseWrapped = true;
    if (typeof global.closeFullReport !== 'function') return;
    var origClose = global.closeFullReport;
    global.closeFullReport = function () {
      var r = origClose.apply(this, arguments);
      try {
        var p2 = document.getElementById('page2');
        if (p2) p2.style.display = '';
      } catch (e) {}
      return r;
    };
  }

  // 旧格式记录 (details.assessment 缺失) → 重建最小 assessment
  // (与 bundle Gt() 同逻辑; 缺数据的 section 渲染器自己会显示"数据不足")
  function _rebuildTrackingAssessment(rec) {
    var scores = rec.scores || {};
    var vest = rec.vestibular || {};
    return {
      cervicalCurvature: {
        available: !!scores.rom,
        riskScore: scores.rom ? Math.round((1 - scores.rom / 100) * 100) : 0,
        score: scores.rom || 0,
        interpretation: '颈椎曲度评估',
        indicators: [],
        pattern: null
      },
      vestibularFunction: {
        score: vest.score || scores.stability || 50,
        interpretation: vest.assessment || '前庭功能评估',
        details: {
          stabilityScore: vest.score || scores.stability || 50,
          smoothnessAvg: vest.smoothness || 50,
          trackingAvg: vest.tracking || 50,
          positionErrorAvg: vest.positionError || 5
        }
      },
      cervicalFunction: {
        score: rec.overall || 50,
        interpretation: '颈椎功能评估',
        details: {
          romScore: scores.rom || 50,
          positionScore: scores.position || 50,
          coordinationScore: scores.coordination || 50
        }
      },
      findings: [],
      brainRegions: [],
      recommendations: rec.recommendations || [],
      symptomCorrelations: { cervicalCurvature: {}, vestibular: {}, cervicalFunction: {} }
    };
  }

  // 回退: #result-modal 简化视图 (renderFullReport 不可用时)
  function _renderTrackingFallback(rec) {
    var modal = document.getElementById('result-modal');
    if (!modal) { alert('报告 modal 未加载,请刷新页面'); return; }

    // 把云端数据塞进 #result-modal 的对应字段 (完全复用原版样式)
    var scores = rec.scores || {};
    var overallEl = document.getElementById('overall-score');
    var levelEl = document.getElementById('overall-level');
    if (overallEl) overallEl.textContent = rec.overall != null ? rec.overall : '--';
    if (levelEl) {
      var ov = rec.overall || 0;
      levelEl.textContent = ov >= 80 ? '优秀' : (ov >= 60 ? '良好' : (ov >= 40 ? '一般' : '需关注'));
    }
    // 5 项明细
    var scoreMap = [
      ['position', 'result-position', 'bar-position'],
      ['stability', 'result-stability', 'bar-stability'],
      ['rom', 'result-rom', 'bar-rom'],
      ['coordination', 'result-coordination', 'bar-coordination']
    ];
    scoreMap.forEach(function (m) {
      var v = scores[m[0]];
      var valEl = document.getElementById(m[1]);
      var barEl = document.getElementById(m[2]);
      if (valEl) valEl.textContent = v != null ? v : '--';
      if (barEl) barEl.style.width = (v != null ? Math.max(0, Math.min(100, v)) : 0) + '%';
    });
    // 前庭功能评估
    var vest = rec.vestibular || {};
    var vestResult = document.getElementById('vestibular-result');
    var vestRec = document.getElementById('vestibular-recommendation');
    var vestBox = document.getElementById('vestibular-assessment');
    if (vestResult) vestResult.textContent = vest.result || '-';
    if (vestRec) vestRec.textContent = vest.recommendation || '-';
    if (vestBox) vestBox.style.display = (vest.result || vest.recommendation) ? '' : 'none';
    // 训练建议
    var sugBox = document.getElementById('rehab-suggestions');
    var sugContent = document.getElementById('rehab-suggestions-content');
    var recs = rec.recommendations || [];
    if (sugBox) sugBox.style.display = recs.length ? '' : 'none';
    if (sugContent) {
      sugContent.innerHTML = recs.map(function (r) {
        return '<div style="margin-bottom:4px;">• ' + _esc(typeof r === 'string' ? r : (r.text || JSON.stringify(r))) + '</div>';
      }).join('');
    }
    // 隐藏"保存数据"按钮 (云端数据已存, 不需要再存)
    var saveBtn = document.getElementById('save-patient-btn');
    if (saveBtn) saveBtn.style.display = 'none';
    // 标题改为患者姓名 (原版是"检测完成")
    var titleEl = modal.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = '🎯 ' + (rec.patient_name || '匿名') + ' · 头动追踪报告';
    var subEl = modal.querySelector('.modal-subtitle');
    if (subEl) subEl.textContent = new Date(rec.date).toLocaleString('zh-CN') + ' · 云端存档';

    modal.classList.add('show');
    // 原版 .modal z-index=1000 太低, 被其他 overlay 遮住; 提高到 50000
    modal.style.zIndex = '50000';
  }

  // 加载认知报告 (支持搜索)
  function _loadCognitiveAssessments() {
    var list = document.getElementById('bm-report-list');
    if (!list) return;
    if (_currentReportTab !== 'cognitive') return; // 异步返回时 tab 已切换, 丢弃过期结果
    var promise = _reportQuery ? global.SupabaseClient.searchMyCognitiveAssessments(_reportQuery, { limit: 50 }) : global.SupabaseClient.listMyCognitiveAssessments({ limit: 50 });
    promise.then(function (rows) {
      _cogRows = rows || [];
      if (!_cogRows.length) {
        list.innerHTML = '<div class="bm-empty">' + (_reportQuery ? '没有匹配 "' + _esc(_reportQuery) + '" 的认知报告' : '还没有认知报告。等患者扫码提交...') + '</div>';
        return;
      }
      list.innerHTML = _cogRows.map(function (r) {
        return '<div class="bm-list-item">' +
          '<div class="bm-list-item-head">' +
            '<div style="cursor:pointer;flex:1;min-width:0;" onclick="window.BmTherapistUI.openCognitiveReport(\'' + r.id + '\')">' +
              '<b>' + _esc(r.patient_name) + '</b> ' + (r.patient_age ? '· ' + r.patient_age + '岁' : '') + ' ' + (r.patient_gender || '') +
            '</div>' +
            '<div style="display:flex;gap:6px;align-items:center;">' +
              '<span style="background:#7c3aed;color:#fff;font-size:11px;padding:2px 10px;border-radius:999px;">' + (r.is_quick6 ? '⚡6项' : '📊12项') + (r.overall_score != null ? ' · ' + r.overall_score + '分' : '') + '</span>' +
              '<button onclick="event.stopPropagation();window.BmTherapistUI.deleteCognitiveConfirm(\'' + r.id + '\')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:13px;padding:2px 6px;" title="删除报告">🗑 删除</button>' +
            '</div>' +
          '</div>' +
          '<div class="bm-list-item-meta" style="cursor:pointer;" onclick="window.BmTherapistUI.openCognitiveReport(\'' + r.id + '\')">' + new Date(r.submitted_at).toLocaleString('zh-CN') + ' · 点击查看报告</div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      list.innerHTML = '<div class="bm-empty" style="color:#dc2626;">加载失败: ' + (err.message || err) + '</div>';
    });
  }

  // 删除认知报告
  function deleteCognitiveConfirm(id) {
    if (!confirm('确认删除这份认知评估报告? 删除后无法恢复。')) return;
    global.SupabaseClient.deleteCognitiveAssessment(id).then(function () {
      _toast('✅ 报告已删除');
      _loadCognitiveAssessments();
    }).catch(function (err) {
      _toast('删除失败: ' + (err.message || err), true);
    });
  }

  // 加载步态报告 (支持搜索)
  function _loadGaitAssessments() {
    var list = document.getElementById('bm-report-list');
    if (!list) return;
    if (_currentReportTab !== 'gait') return; // 异步返回时 tab 已切换, 丢弃过期结果
    var promise = _reportQuery ? global.SupabaseClient.searchMyGaitAssessments(_reportQuery, { limit: 50 }) : global.SupabaseClient.listMyGaitAssessments({ limit: 50 });
    promise.then(function (rows) {
      _gaitRows = rows || [];
      if (!_gaitRows.length) {
        list.innerHTML = '<div class="bm-empty">' + (_reportQuery ? '没有匹配 "' + _esc(_reportQuery) + '" 的步态报告' : '还没有步态报告。等患者扫码提交...') + '</div>';
        return;
      }
      list.innerHTML = _gaitRows.map(function (r) {
        return '<div class="bm-list-item">' +
          '<div class="bm-list-item-head">' +
            '<div style="cursor:pointer;flex:1;min-width:0;" onclick="window.BmTherapistUI.openGaitReport(\'' + r.id + '\')">' +
              '<b>' + _esc(r.patient_name) + '</b> ' + (r.patient_age ? '· ' + r.patient_age + '岁' : '') + ' ' + (r.patient_gender || '') +
            '</div>' +
            '<div style="display:flex;gap:6px;align-items:center;">' +
              '<span style="background:#0f7b6c;color:#fff;font-size:11px;padding:2px 10px;border-radius:999px;">' + _esc(r.classification_primary || '—') + '</span>' +
              '<button onclick="event.stopPropagation();window.BmTherapistUI.deleteGaitConfirm(\'' + r.id + '\')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:13px;padding:2px 6px;" title="删除报告">🗑 删除</button>' +
            '</div>' +
          '</div>' +
          '<div class="bm-list-item-meta" style="cursor:pointer;" onclick="window.BmTherapistUI.openGaitReport(\'' + r.id + '\')">' + new Date(r.submitted_at).toLocaleString('zh-CN') + ' · 点击查看报告</div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      list.innerHTML = '<div class="bm-empty" style="color:#dc2626;">加载失败: ' + (err.message || err) + '</div>';
    });
  }

  // 删除步态报告
  function deleteGaitConfirm(id) {
    if (!confirm('确认删除这份步态报告? 删除后无法恢复。')) return;
    global.SupabaseClient.deleteGaitAssessment(id).then(function () {
      _toast('✅ 报告已删除');
      _loadGaitAssessments();
    }).catch(function (err) {
      _toast('删除失败: ' + (err.message || err), true);
    });
  }

  // 认知报告详情: 优先调原版 renderReport (12模块+雷达+脑区图), 无 rawScores 时降级
  function openCognitiveReport(id) {
    var rec = null;
    for (var i = 0; i < _cogRows.length; i++) { if (_cogRows[i].id === id) { rec = _cogRows[i]; break; } }
    if (!rec) { alert('记录未找到,请刷新列表'); return; }
    var dash = document.getElementById('bm-dashboard-modal');
    if (dash) dash.remove();
    var overlay = document.getElementById('cog-report-overlay');
    if (!overlay) { alert('报告容器未加载'); return; }

    var payload = rec.payload || {};
    var rawScores = payload.rawScores;
    var isQuick6 = !!rec.is_quick6;
    var patientInfo = {
      name: rec.patient_name,
      age: rec.patient_age,
      gender: rec.patient_gender,
      id: rec.patient_id || ''
    };
    var reportTime = rec.submitted_at ? new Date(rec.submitted_at).toLocaleString('zh-CN') : '';

    if (rawScores && typeof global.renderReport === 'function') {
      // 顶层设计: 走原版完整渲染 (12 模块 + 雷达 + 脑区图 + 风险评估)
      // renderReport 是 IIFE 内的私有函数, 但 cognitive-report.js 提供 window.renderReport 入口
      window._lastCogRecord = {
        patientInfo: patientInfo,
        isQuick6: isQuick6,
        date: rec.submitted_at ? rec.submitted_at.substring(0, 10) : '',
        time: rec.submitted_at ? rec.submitted_at.substring(11, 19) : '',
        overallScore: rec.overall_score,
        rawScores: rawScores
      };
      try {
        global.renderReport(rawScores, [], isQuick6, reportTime, patientInfo);
      } catch (e) {
        console.error('[therapist-ui] renderReport 失败, 降级:', e);
        _renderCogFallback(rec, patientInfo, reportTime, isQuick6);
      }
    } else {
      // 降级: 云端 payload 没 rawScores (旧数据/简化数据) → 简化视图
      _renderCogFallback(rec, patientInfo, reportTime, isQuick6);
    }

    overlay.style.display = 'block';
    overlay.style.zIndex = '50000';
    var page2 = document.getElementById('page2');
    if (page2) page2.style.display = 'none';
    var footer = document.getElementById('cog-report-footer');
    if (footer) footer.style.display = '';
    var recNav = document.getElementById('cog-record-nav');
    if (recNav) recNav.style.display = 'none';
  }

  // 简化视图降级 (云端数据无 rawScores 时)
  function _renderCogFallback(rec, patientInfo, reportTime, isQuick6) {
    var nav = document.getElementById('cog-report-nav');
    var body = document.getElementById('cog-report-body');
    if (nav) {
      nav.innerHTML = '<div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:6px 12px;border-radius:6px;font-size:13px;">🧠 认知评估报告 · 云端存档</div>';
    }
    var payload = rec.payload || {};
    var moduleScores = payload.moduleScores || {};
    var moduleLabels = {
      reasoning: '推理能力', scenerecall: '场景回忆', shortmem: '短暂视觉记忆',
      attention: '注意力测试', memory: '文字记忆', visual: '视觉记忆',
      planning: '规划能力', flex: '变通能力', language: '语言理解',
      memorg: '记忆组织提取', inhibition: '自制力 (Stroop)', observation: '观察能力'
    };
    var modOrder = ['reasoning','scenerecall','shortmem','attention','memory','visual','planning','flex','language','memorg','inhibition','observation'];
    var modRows = modOrder.map(function (k) {
      var s = moduleScores[k];
      var v = s && (s.score != null ? s.score : (s.correct || 0));
      var color = v >= 80 ? '#16a34a' : (v >= 60 ? '#ca8a04' : (v >= 40 ? '#ea580c' : '#dc2626'));
      var pct = Math.max(0, Math.min(100, v || 0));
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px 8px;margin:0 -8px;border-top:1px solid #f1f5f9;border-radius:6px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;color:#0f172a;">' + (moduleLabels[k] || k) + '</div>' +
          '<div style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;margin-top:4px;"><div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:3px;"></div></div>' +
        '</div>' +
        '<span style="flex:0 0 auto;font-size:13px;font-weight:700;color:' + color + ';min-width:48px;text-align:right;">' + (v != null ? v + ' 分' : '--') + '</span>' +
      '</div>';
    }).join('');
    var ov = rec.overall_score != null ? rec.overall_score : '--';
    var ovColor = rec.overall_score >= 80 ? '#16a34a' : (rec.overall_score >= 60 ? '#ca8a04' : '#dc2626');
    var html =
      '<div style="background:#fff;border-radius:12px;padding:18px 20px;margin-bottom:14px;border-left:4px solid #7c3aed;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
        '<div>' +
          '<div style="font-size:18px;font-weight:700;color:#0f172a;">' + _esc(patientInfo.name || '未知') + ' 的认知评估 <span style="font-size:12px;color:#94a3b8;font-weight:400;">' + _esc(patientInfo.gender || '') + (patientInfo.age ? ' · ' + patientInfo.age + '岁' : '') + '</span></div>' +
          '<div style="font-size:12px;color:#94a3b8;margin-top:2px;">' + reportTime + ' · ' + (isQuick6 ? '⚡ 快速测试 (6项)' : '📊 完整测试 (12项)') + ' · 云端存档</div>' +
        '</div>' +
        '<span style="background:' + ovColor + ';color:#fff;font-size:14px;font-weight:700;padding:6px 16px;border-radius:999px;">综合 ' + ov + ' 分</span>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;margin-bottom:12px;">' +
        '<div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:10px;">🧩 各模块得分</div>' +
        modRows +
      '</div>' +
      '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:12px 16px;font-size:12px;color:#92400e;line-height:1.7;">⚠️ 本评估用于一般健康教育, 结果属于评估提示, 不等同于医学诊断。如结果异常或症状持续, 请到正规医疗机构进一步评估。</div>';
    if (body) body.innerHTML = html;
  }

  // 步态报告详情: 复用 __gaitReport.renderReport 渲染到弹层 (phaseSnapshots 提交时已剥离, 报告会自动降级)
  function openGaitReport(id) {
    var rec = null;
    for (var i = 0; i < _gaitRows.length; i++) { if (_gaitRows[i].id === id) { rec = _gaitRows[i]; break; } }
    if (!rec || !rec.payload) return;
    var existing = document.getElementById('bm-gait-detail-modal');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'bm-gait-detail-modal';
    overlay.className = 'bm-modal-overlay';
    overlay.innerHTML =
      '<div class="bm-modal" style="max-width:720px;" onclick="event.stopPropagation()">' +
        '<h3>🚶 ' + _esc(rec.patient_name || '步态报告') +
          '<span style="cursor:pointer;font-size:24px;color:#94a3b8;line-height:1;" onclick="document.getElementById(\'bm-gait-detail-modal\').remove()">×</span>' +
        '</h3>' +
        '<div class="bm-modal-body" id="bm-gait-detail-body"></div>' +
      '</div>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    var body = document.getElementById('bm-gait-detail-body');
    if (global.__gaitReport && typeof global.__gaitReport.renderReport === 'function') {
      try {
        global.__gaitReport.renderReport(rec.payload, body);
        return;
      } catch (e) {
        console.error('[therapist-ui] gait renderReport 失败, 降级 JSON 视图', e);
      }
    }
    // 降级: JSON 详情
    body.innerHTML = '<pre style="font-size:11px;color:#334155;white-space:pre-wrap;word-break:break-all;background:#f8fafc;padding:12px;border-radius:8px;max-height:60vh;overflow:auto;">' +
      _esc(JSON.stringify(rec.payload, null, 2)) + '</pre>';
  }

  function createShareLink() {
    var name = document.getElementById('bm-link-name').value || '';
    var age = document.getElementById('bm-link-age').value || '';
    var gender = document.getElementById('bm-link-gender').value || '';
    var kindEl = document.getElementById('bm-link-kind');
    var kind = kindEl ? kindEl.value : 'qnr';
    var resultEl = document.getElementById('bm-link-result');
    resultEl.innerHTML = '<div style="color:#0284c7;font-size:13px;">创建中...</div>';
    global.SupabaseClient.createShareLink({
      name: name || null,
      age: age || null,
      gender: gender || null,
      expiresDays: 30,
      kind: kind
    }).then(function (link) {
      var url = _buildLinkUrl(kind, link);
      resultEl.innerHTML =
        '<div style="background:#f0fdfa;border:1px solid #6ee7b7;border-radius:8px;padding:10px;margin-top:8px;">' +
          '<div style="font-size:12px;color:#047857;margin-bottom:6px;">✅ ' + (KIND_LABEL[kind] || '') + '链接创建成功!</div>' +
          '<div style="font-size:11px;color:#475569;word-break:break-all;margin-bottom:6px;">' + url + '</div>' +
          '<button onclick="window.BmTherapistUI.showQR(\'' + link.token + '\', \'' + _esc(link.prefilled_name || '未指定') + '\', \'' + kind + '\')" style="padding:6px 12px;background:#0d9488;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">📱 显示二维码</button>' +
          '<button onclick="window.BmTherapistUI.copyLink(\'' + url + '\')" style="padding:6px 12px;background:#e0f2fe;color:#0284c7;border:none;border-radius:6px;font-size:12px;cursor:pointer;margin-left:6px;">🔗 复制</button>' +
        '</div>';
      _loadShareLinks();
    }).catch(function (err) {
      resultEl.innerHTML = '<div style="color:#dc2626;font-size:13px;margin-top:8px;">❌ 创建失败: ' + (err.message || err) + '</div>';
    });
  }

  // 自评报告详情: 从已缓存的 _qnrRows 取 (listMyAssessments select=* 已含 by_region 等 JSON 字段),
// 转 rec 格式, 复用 index.html 上的 _qnrRenderCloud
  function openQnrReport(id) {
    var rec = null;
    for (var i = 0; i < _qnrRows.length; i++) {
      if (_qnrRows[i].id === id) { rec = _qnrRows[i]; break; }
    }
    if (!rec) { alert('记录未找到,请刷新列表'); return; }
    // 关掉工作台 modal (报告以 cog-report-overlay 全屏显示)
    var dash = document.getElementById('bm-dashboard-modal');
    if (dash) dash.remove();
    // groupDefs/regionDefs 从预加载的 __qnrData 取
    var dataMod = window.__qnrData || {};
    var groupDefs = dataMod.REGION_GROUPS || [];
    var regionDefs = dataMod.BRAIN_REGION_DEFS || [];
    var items = rec.responses || {};
    var formatted = {
      patientInfo: { name: rec.patient_name, age: rec.patient_age, gender: rec.patient_gender, id: '' },
      date: rec.submitted_at ? rec.submitted_at.substring(0, 10) : '',
      time: rec.submitted_at ? rec.submitted_at.substring(11, 16) : '',
      type: 'questionnaire',
      overallScore: rec.percent,
      qnr: {
        byRegion: rec.by_region || {},
        severityByRegion: rec.severity_by_region || {},
        affectedRegions: rec.affected_regions || [],
        total: rec.total_score,
        percent: rec.percent,
        worstSeverity: rec.worst_severity,
        burdenGroups: rec.burden_groups || [],
        phoneEar: rec.phone_ear,
        groupDefs: groupDefs,
        regionDefs: regionDefs,
        items: items
      }
    };
    // 优先调 index.html 的 _qnrRenderCloud (已暴露, 等价于 _qnrRenderReport)
    if (typeof window._qnrRenderCloud === 'function') {
      window._qnrRenderCloud(formatted);
      return;
    }
    // 降级: 自渲染
    _renderQnrReportFallback(formatted);
  }

  // 自评报告渲染降级 (BmTherapistUI 模式下, 没有 index.html 的 _qnrRenderCloud)
  function _renderQnrReportFallback(rec) {
    var d = rec.qnr || {};
    var p = rec.patientInfo || {};
    var overlay = document.createElement('div');
    overlay.id = 'bm-qnr-detail-modal';
    overlay.className = 'bm-modal-overlay';
    overlay.style.cssText = 'z-index:35000;align-items:flex-start;padding:20px;overflow:auto;';
    overlay.innerHTML =
      '<div class="bm-modal" style="max-width:720px;text-align:left;" onclick="event.stopPropagation()">' +
        '<h3>📋 ' + _esc(p.name || '患者') + ' · 神经系统自评报告 ' +
          '<span style="cursor:pointer;font-size:24px;color:#94a3b8;float:right;line-height:1;" onclick="document.getElementById(\'bm-qnr-detail-modal\').remove()">×</span>' +
        '</h3>' +
        '<div class="bm-modal-body" id="bm-qnr-detail-body"></div>' +
      '</div>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    var body = document.getElementById('bm-qnr-detail-body');
    // 简洁列表视图
    var html = '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">' + (rec.date || '') + ' ' + (rec.time || '') + ' · 100题 · 严重度: ' + _esc(d.worstSeverity || 'normal') + ' · 得分: ' + (d.percent != null ? d.percent : 0) + '%</div>';
    if (d.burdenGroups && d.burdenGroups.length) {
      html += '<div style="background:#fff7ed;padding:8px 12px;border-radius:8px;margin-bottom:12px;color:#9a3412;">高负担区: ' + _esc(d.burdenGroups.join('、')) + '</div>';
    }
    (d.groupDefs || []).forEach(function(g){
      html += '<div style="background:#f8fafc;border-radius:8px;padding:10px;margin-bottom:8px;"><b>' + _esc(g.label) + '</b><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:8px;">';
      g.regionIds.forEach(function(rid){
        var def = (d.regionDefs || []).find(function(x){ return x.id === rid; });
        if (!def) return;
        var score = d.byRegion[rid] || 0;
        var max = Math.ceil((d.items ? Object.keys(d.items).filter(function(k){ return parseInt(k) >= def.range[0] && parseInt(k) <= def.range[1] && parseInt(k) !== 46; }).length : 0) * 4);
        var sev = d.severityByRegion[rid] || 'normal';
        var sevColor = { normal:'#16a34a', mild:'#ca8a04', moderate:'#ea580c', severe:'#dc2626' };
        html += '<div style="background:#fff;padding:6px;border-radius:6px;font-size:12px;"><div>' + _esc(def.label) + '</div><div style="color:#64748b;">' + score + ' / ' + max + ' 分</div><div style="display:inline-block;background:' + sevColor[sev] + ';color:#fff;padding:1px 8px;border-radius:8px;font-size:10px;">' + _esc(sev) + '</div></div>';
      });
      html += '</div></div>';
    });
    body.innerHTML = html + '<div style="margin-top:14px;font-size:11px;color:#94a3b8;">提示: 从 index.html 进入可看完整 PDF 导出</div>';
  }

  function showQR(token, patientName, kind) {
    var url = _buildLinkUrl(kind || 'qnr', { token: token });
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
    switchReportTab: switchReportTab,
    openCognitiveReport: openCognitiveReport,
    openGaitReport: openGaitReport,
    openQnrReport: openQnrReport,
    openTrackingReport: openTrackingReport,
    deleteQnrConfirm: deleteQnrConfirm,
    deleteCognitiveConfirm: deleteCognitiveConfirm,
    deleteGaitConfirm: deleteGaitConfirm,
    deleteTrackingConfirm: deleteTrackingConfirm,
    deleteShareLinkConfirm: deleteShareLinkConfirm,
    // 刷新工作台数据 (share_links + 当前 tab 的报告)
    refreshDashboard: function () {
      _loadShareLinks();
      switchReportTab(_currentReportTab);
    }
  };
})(window);