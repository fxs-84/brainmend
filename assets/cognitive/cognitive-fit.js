// === 认知评估 · 画布自适应 + 横屏引导 ===
// 所有题目按 1070×746 设计。小屏(手机)上不再直接取容器像素作为 canvas 内部分辨率,
// 而是把内部分辨率提升到不小于设计尺寸(保持容器宽高比), 再由 CSS 等比缩小显示:
//   · 布局与桌面完全一致 → 题目显示完整、双显示框不再重叠
//   · 无 letterbox, canvas 始终填满检测区
//   · 点击坐标各模块已通过 getBoundingClientRect 比例换算, 自动适配无需改动
(function(){
var COG_MIN_W = 1070, COG_MIN_H = 600;

window._cogFitCanvas = function() {
    var c = document.getElementById('cognitive-canvas');
    if (!c) return;
    var area = document.getElementById('detection-area');
    var aw = area ? area.offsetWidth : 0;
    var ah = area ? area.offsetHeight : 0;
    if (aw <= 0 || ah <= 0) return;
    var sf = Math.max(1, COG_MIN_W / aw, COG_MIN_H / ah);
    var w = Math.round(aw * sf), h = Math.round(ah * sf);
    // 相同值不重复赋值 (canvas 宽高赋值会清空位图)
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
};

function _refitIfActive() {
    var c = document.getElementById('cognitive-canvas');
    if (c && c.style.display !== 'none') window._cogFitCanvas();
}
window.addEventListener('resize', _refitIfActive);
window.addEventListener('orientationchange', function() { setTimeout(_refitIfActive, 350); });

// ---------- 竖屏 → 横屏引导 ----------
var _dismissed = false;    // 用户选了"继续竖屏"
var _snoozeUntil = 0;      // 点了"全屏并横屏"后短暂隐藏, 等待系统完成旋转
var _overlay = null;

function _isCoarseSmall() {
    var coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
                 /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    return coarse && window.innerWidth < 600;
}
function _cogActive() {
    var c = document.getElementById('cognitive-canvas');
    if (!c || c.style.display === 'none') return false;
    var rpt = document.getElementById('cog-report-overlay');
    if (rpt && rpt.style.display !== 'none') return false;
    return true;
}
function _isPortrait() { return window.innerHeight > window.innerWidth; }

// ---------- CSS 强制横屏 (orientation.lock 失败 / iOS 的兜底) ----------
// 原理: 浏览器停在竖屏时, 把 #app 容器旋转 90° 渲染,
// 布局宽度取视口高度 → 内容以横屏形态呈现, 用户横握手机即正常阅读
var _forced = false;

function _applyForceLandscape() {
    if (_forced) return;
    var app = document.getElementById('app');
    if (!app) return;
    _forced = true;
    app.style.position = 'fixed';
    app.style.left = '0';
    app.style.top = '100%';
    app.style.width = '100vh';
    app.style.height = '100vw';
    app.style.margin = '0';
    app.style.transformOrigin = 'left top';
    app.style.transform = 'rotate(-90deg)';
    document.body.style.overflow = 'hidden';
    // 隐藏 header 释放高度 (手机横屏可用高度本来就只有 ~375px)
    var hd = document.querySelector('#app header');
    if (hd) { hd.dataset.cogForcedHide = '1'; hd.style.display = 'none'; }
    setTimeout(function() { window._cogFitCanvas(); _refresh(); }, 80);
}

function _removeForceLandscape() {
    if (!_forced) return;
    _forced = false;
    var app = document.getElementById('app');
    if (app) {
        app.style.position = ''; app.style.left = ''; app.style.top = '';
        app.style.width = ''; app.style.height = ''; app.style.margin = '';
        app.style.transformOrigin = ''; app.style.transform = '';
    }
    document.body.style.overflow = '';
    var hd = document.querySelector('#app header');
    if (hd && hd.dataset.cogForcedHide) { hd.style.display = ''; delete hd.dataset.cogForcedHide; }
    setTimeout(function() { window._cogFitCanvas(); }, 80);
}

// CSS 强制横屏下的指针坐标映射 (供全局点击分发调用)
// rotate(-90deg) 且容器位于 left:0/top:100% 时:
//   内容坐标 (cx,cy) → client (cy, innerHeight-cx)
//   由 canvas 旋转后的外接矩形 R 反推布局矩形, 解出等价的"未旋转" client 坐标
window._cogMapPointer = function(px, py) {
    if (!_forced) return [px, py];
    var c = document.getElementById('cognitive-canvas');
    if (!c) return [px, py];
    var R = c.getBoundingClientRect();
    if (!R.width || !R.height) return [px, py];
    var ex = R.left + R.width  * (R.top + R.height - py) / R.height;
    var ey = R.top  + R.height * (px - R.left) / R.width;
    return [ex, ey];
};

function _refresh() {
    // 浏览器真转横了 → 摘掉 CSS 强制横屏
    if (_forced && !_isPortrait()) { _removeForceLandscape(); }
    // 退出认知评估(含报告页) → 摘掉 CSS 强制横屏
    if (_forced && !_cogActive()) { _removeForceLandscape(); }
    var need = !_forced && !_dismissed && Date.now() >= _snoozeUntil && _cogActive() && _isPortrait() && _isCoarseSmall();
    if (need) { _ensureOverlay().style.display = 'flex'; }
    else if (_overlay) { _overlay.style.display = 'none'; }
}

function _ensureOverlay() {
    if (_overlay) return _overlay;
    var st = document.createElement('style');
    st.textContent = '@keyframes cogRotHint{0%,20%{transform:rotate(0)}70%,100%{transform:rotate(90deg)}}';
    document.head.appendChild(st);
    _overlay = document.createElement('div');
    _overlay.id = 'cog-rotate-hint';
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:25000;display:none;align-items:center;justify-content:center;background:rgba(10,15,26,0.85);';
    _overlay.innerHTML =
        '<div style="text-align:center;color:#fff;padding:24px;max-width:320px;">' +
        '<div style="font-size:52px;line-height:1;animation:cogRotHint 1.6s ease-in-out infinite;">📱</div>' +
        '<div style="font-size:17px;font-weight:700;margin:14px 0 6px;">建议横屏作答</div>' +
        '<div style="font-size:13px;color:#bdc3c7;line-height:1.7;margin-bottom:18px;">认知题目在横屏下显示更完整、不重叠。<br>请旋转手机，或点击下方按钮。</div>' +
        '<button id="cog-rotate-go" style="width:100%;padding:12px;background:linear-gradient(135deg,#00D9A5,#0086FF);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">⛶ 全屏并横屏</button>' +
        '<button id="cog-rotate-skip" style="width:100%;margin-top:10px;padding:10px;background:transparent;color:#8a94a6;border:1px solid rgba(255,255,255,0.2);border-radius:10px;font-size:13px;cursor:pointer;">继续竖屏（可能显示不全）</button>' +
        '</div>';
    document.body.appendChild(_overlay);
    _overlay.querySelector('#cog-rotate-go').addEventListener('click', function() {
        _snoozeUntil = Date.now() + 4000;
        _refresh();
        try {
            var p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
            if (p && p.then) {
                p.then(function() {
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch(function() {});
                    }
                }).catch(function() {});
            }
        } catch(e) {}
        // 等待系统旋转; 1 秒后仍是竖屏 → CSS 强制横屏兜底
        setTimeout(function() {
            if (_cogActive() && _isPortrait() && !_forced) {
                _applyForceLandscape();
            }
        }, 1000);
    });
    _overlay.querySelector('#cog-rotate-skip').addEventListener('click', function() {
        _dismissed = true;
        _refresh();
    });
    return _overlay;
}

window.addEventListener('resize', _refresh);
window.addEventListener('orientationchange', function() { setTimeout(_refresh, 350); });
// 进入/退出认知评估的路径很多 (弹窗/deep-link/沙盒/返回), 用轻量轮询兜底
setInterval(_refresh, 800);
})();
