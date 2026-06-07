// ============================================================
// GAME UI - 游戏用户界面
// ============================================================

import { MotionMapper } from './motion-mapper.js';

export class GameUI {
    constructor(engine) {
        this.engine = engine;
        this.container = null;
        this.selectedScene = 'space';
        this.selectedMode = MotionMapper.MODES.SINGLE_YAW;
        this.selectedDifficulty = 'normal';

        // 只在不存在时插入游戏选择界面
        if (!document.getElementById('game-select-panel')) {
            document.body.insertAdjacentHTML('beforeend', this.createGameSelectHTML());
        }
        this.init();
    }

    /**
     * 创建游戏选择界面HTML
     */
    createGameSelectHTML() {
        return `
            <div id="game-select-panel" style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(15, 23, 42, 0.95);
                border: 2px solid var(--primary);
                border-radius: 16px;
                padding: 30px;
                min-width: 400px;
                color: white;
                z-index: 2000;
            ">
                <div style="display: flex; align-items: center; margin-bottom: 20px;">
                    <button id="game-back-to-menu" style="
                        background: none; border: 1px solid rgba(255,255,255,0.2);
                        border-radius: 6px; color: #9CA3AF; font-size: 13px;
                        cursor: pointer; padding: 6px 14px;
                    ">← 返回</button>
                    <h2 style="flex: 1; text-align: center; margin: 0; color: var(--primary);">
                        选择游戏
                    </h2>
                </div>

                <!-- 场景选择 -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: #9CA3AF;">场景</label>
                    <div style="display: flex; gap: 10px;">
                        <button class="scene-btn active" data-scene="space" style="
                            flex: 1; padding: 12px; border: 2px solid transparent;
                            border-radius: 8px; background: #1E293B; color: white;
                            cursor: pointer; transition: all 0.2s;
                        ">
                            🚀 太空
                        </button>
                        <button class="scene-btn" data-scene="valley" style="
                            flex: 1; padding: 12px; border: 2px solid transparent;
                            border-radius: 8px; background: #1E293B; color: white;
                            cursor: pointer; transition: all 0.2s;
                        ">
                            ✈️ 山谷飞行
                        </button>
                        <button class="scene-btn" data-scene="space3d" style="
                            flex: 1; padding: 12px; border: 2px solid transparent;
                            border-radius: 8px; background: #1E293B; color: white;
                            cursor: pointer; transition: all 0.2s;
                        ">
                            🌌 太空3D飞行
                        </button>
                    </div>
                </div>

                <!-- 运动模式选择 -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: #9CA3AF;">运动模式</label>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button class="mode-btn active" data-mode="shooting" style="
                            padding: 10px; border: 2px solid transparent;
                            border-radius: 6px; background: #1E293B; color: white;
                            cursor: pointer; text-align: left;
                        ">
                            🎯 射击模式 - 消灭敌舰
                        </button>
                        <button class="mode-btn" data-mode="nodding" style="
                            padding: 10px; border: 2px solid transparent;
                            border-radius: 6px; background: #1E293B; color: white;
                            cursor: pointer; text-align: left;
                        ">
                            🚀 太空点头 - 上下躲避吃金币
                        </button>
                        <button class="mode-btn" data-mode="tunnel" style="
                            padding: 10px; border: 2px solid transparent;
                            border-radius: 6px; background: #1E293B; color: white;
                            cursor: pointer; text-align: left;
                        ">
                            🌌 太空隧道 - 穿越小行星带
                        </button>
                        <button class="mode-btn" data-mode="road" style="
                            padding: 10px; border: 2px solid transparent;
                            border-radius: 6px; background: #1E293B; color: white;
                            cursor: pointer; text-align: left;
                        ">
                            🏎️ 公路赛车 - 左右换道躲车
                        </button>
                    </div>
                </div>

                <!-- 归零按钮 -->
                <button id="zero-gyro-btn" style="
                    width: 100%; padding: 10px; background: #374151;
                    border: none; border-radius: 8px; color: white;
                    font-size: 14px; font-weight: bold; cursor: pointer;
                    margin-bottom: 10px; transition: transform 0.1s;
                ">
                    归零校准
                </button>

                <!-- 开始按钮 -->
                <button id="start-game-btn" style="
                    width: 100%; padding: 14px; background: var(--primary);
                    border: none; border-radius: 8px; color: #0F172A;
                    font-size: 16px; font-weight: bold; cursor: pointer;
                    transition: transform 0.1s;
                ">
                    开始游戏
                </button>
            </div>
        `;
    }

    /**
     * 初始化UI
     */
    init(container) {
        this.container = container;

        // 绑定返回侧边栏按钮
        const backBtn = document.getElementById('game-back-to-menu');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.hideSelectPanel();
                // 清理游戏引擎
                if (window.gameEngine) window.gameEngine.cleanup();
                if (window.valleyEngine) window.valleyEngine.cleanup();
                if (window.spaceEngine) window.spaceEngine.cleanup();
                const floatingZero = document.getElementById('game-floating-zero-btn');
                if (floatingZero) floatingZero.remove();
                window.setMode('mode-select');
            });
        }

        // 绑定场景选择事件
        this.bindSceneEvents();

        // 绑定运动模式选择事件
        this.bindModeEvents();

        // 绑定归零按钮
        this.bindZeroEvent();

        // 绑定开始按钮
        this.bindStartEvent();
    }

    /**
     * 绑定场景选择事件
     */
    bindSceneEvents() {
        document.querySelectorAll('.scene-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.scene-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.borderColor = 'transparent';
                });
                btn.classList.add('active');
                btn.style.borderColor = 'var(--primary)';
                this.selectedScene = btn.dataset.scene;
                // 山谷飞行和太空3D飞行需要同步更新selectedMode
                if (btn.dataset.scene === 'valley') this.selectedMode = 'flight';
                if (btn.dataset.scene === 'space3d') this.selectedMode = 'space3d';
            });
        });
    }

    /**
     * 绑定运动模式选择事件
     */
    bindModeEvents() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mode-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.borderColor = 'transparent';
                });
                btn.classList.add('active');
                btn.style.borderColor = 'var(--primary)';
                this.selectedMode = btn.dataset.mode;
            });
        });
    }

    /**
     * 绑定归零按钮
     */
    bindZeroEvent() {
        const zeroBtn = document.getElementById('zero-gyro-btn');
        if (zeroBtn) {
            let zeroTimeout;
            zeroBtn.addEventListener('click', () => {
                // 归零校准：将当前角度设置为中立0°
                // 陀螺仪模式：state.yaw = rawYaw - yawOffset，归零需设 offset = rawYaw
                if (window.state) {
                    window.state.yawOffset = window.state.yaw + window.state.yawOffset;
                    window.state.pitchOffset = window.state.pitch + window.state.pitchOffset;
                    window.state.rollOffset = window.state.roll + window.state.rollOffset;
                    window.state.pitch = 0;
                    window.state.yaw = 0;
                    window.state.roll = 0;
                    window.state.dotX = 0;
                    window.state.dotY = 0;
                    window.state.displayDotX = 0;
                    window.state.displayDotY = 0;
                    // 归零所有引擎的EMA基线
                    if (window.gameEngine) window.gameEngine.rezero();
                    if (window.valleyEngine) window.valleyEngine.rezero();
                    if (window.spaceEngine) window.spaceEngine.rezero();
                    // 视觉反馈
                    zeroBtn.textContent = '已归零 ✓';
                    zeroBtn.style.background = '#059669';
                    if (zeroTimeout) clearTimeout(zeroTimeout);
                    zeroTimeout = setTimeout(() => {
                        zeroBtn.textContent = '归零校准';
                        zeroBtn.style.background = '#374151';
                    }, 1000);
                }
            });
        }
    }

    /**
     * 绑定开始按钮
     */
    bindStartEvent() {
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startGame();
            });
        }
    }

    /**
     * 开始游戏
     */
    async startGame() {
        // 太空3D飞行模式：先选难度再开始
        if (this.selectedScene === 'space3d' || this.selectedMode === 'flight') {
            const diff = await this._showDiffDialog();
            if (!diff) return; // 用户取消
            this.selectedDifficulty = diff;
        }

        // 隐藏选择界面
        const panel = document.getElementById('game-select-panel');
        if (panel) {
            panel.style.display = 'none';
        }

        // 创建游戏内浮动归零按钮
        this._createFloatingZeroBtn();

        // 设置场景（等待场景加载完成）
        const handledByScene = await this.setScene(this.selectedScene);

        // 山谷飞行模式由 ValleyEngine 独立管理渲染，不需要 GameEngine
        if (!handledByScene) {
            // 运动模式映射
            let modeToSet = this.selectedMode;
            if (this.selectedMode === 'shooting') modeToSet = MotionMapper.MODES.SINGLE_YAW;
            if (this.selectedMode === 'road') modeToSet = MotionMapper.MODES.YAW_PITCH_SPEED;
            if (this.selectedMode === 'nodding' || this.selectedMode === 'tunnel') modeToSet = MotionMapper.MODES.SINGLE_PITCH;
            this.engine.setMotionMode(modeToSet);
            this.engine.start();
        }
    }

    _showDiffDialog() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:5000;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = `
                <div style="background:rgba(15,23,42,0.98);border:2px solid var(--primary);border-radius:16px;padding:30px;text-align:center;color:white;min-width:300px;">
                    <h3 style="margin-bottom:20px;color:var(--primary);">选择难度</h3>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        <button data-d="easy" style="padding:14px;border:2px solid #10B981;border-radius:8px;background:#1E293B;color:#10B981;font-size:16px;font-weight:bold;cursor:pointer;">🟢 简单</button>
                        <button data-d="normal" style="padding:14px;border:2px solid #F59E0B;border-radius:8px;background:#1E293B;color:#F59E0B;font-size:16px;font-weight:bold;cursor:pointer;">🟡 普通</button>
                        <button data-d="hard" style="padding:14px;border:2px solid #EF4444;border-radius:8px;background:#1E293B;color:#EF4444;font-size:16px;font-weight:bold;cursor:pointer;">🔴 困难</button>
                    </div>
                    <button data-d="" style="margin-top:15px;padding:8px;background:transparent;border:none;color:#9CA3AF;cursor:pointer;font-size:12px;">取消</button>
                </div>`;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', (e) => {
                const d = e.target.dataset.d;
                if (d !== undefined) {
                    document.body.removeChild(overlay);
                    resolve(d || null);
                }
            });
        });
    }

    /**
     * 设置游戏场景
     */
    async setScene(sceneName) {
        // 太空隧道模式
        if (this.selectedMode === 'tunnel') {
            try {
                const module = await import('./scene-asteroid-tunnel.js');
                const scene = new module.SceneAsteroidTunnel();
                this.engine.setScene(scene);
                this.engine._noddingMode = true;
            } catch (err) { console.error('Failed to load tunnel scene:', err); }
            return;
        }

        // 太空点头模式
        if (this.selectedMode === 'nodding') {
            try {
                const module = await import(`./scene-space-nodding.js`);
                const scene = new module.SceneSpaceNodding();
                this.engine.setScene(scene);
                this.engine._noddingMode = true;
            } catch (err) { console.error('Failed to load nodding scene:', err); }
            return;
        }

        // 射击模式特殊处理
        if (this.selectedMode === 'shooting') {
            try {
                const module = await import(`./scene-space-shooting.js`);
                const SceneClass = module.SceneSpaceShooting;
                if (SceneClass) {
                    const scene = new SceneClass();
                    this.engine.setScene(scene);
                }
            } catch (err) {
                console.error('Failed to load shooting scene:', err);
            }
            return;
        }

        // 公路赛车模式
        if (this.selectedMode === 'road') {
            try {
                const module = await import('./scene-road.js');
                const scene = new module.SceneRoad();
                this.engine.setScene(scene);
            } catch (err) {
                console.error('Failed to load road scene:', err);
            }
            return;
        }

        // 太空3D飞行模式（排除山谷）
        if (sceneName === 'space3d' && this.selectedMode !== 'flight') {
            try {
                if (!window.spaceEngine) {
                    const canvas = document.getElementById('crosshair-canvas');
                    const module = await import('./space-engine.js');
                    window.spaceEngine = new module.SpaceEngine(canvas);
                    window.spaceEngine.init();
                    window.spaceEngine.onGameOver = (score, grade, info) => {
                        console.log('Space game over:', { score, grade, info });
                    };
                }
                window.spaceEngine.difficulty = this.selectedDifficulty;
                window.spaceEngine.start();
                window.spaceEngine.onEntryZero();
            } catch (err) {
                console.error('Failed to load space engine:', err);
            }
            return true;
        }

        // 山谷飞行模式特殊处理 - 使用独立的ValleyEngine
        if (this.selectedMode === 'flight' || sceneName === 'valley') {
            try {
                if (!window.valleyEngine) {
                    const canvas = document.getElementById('crosshair-canvas');
                    const module = await import(`./valley-engine.js`);
                    window.valleyEngine = new module.ValleyEngine(canvas);
                    window.valleyEngine.init();
                    window.valleyEngine.onGameOver = (score, grade, info) => {
                        console.log('Valley game over:', { score, grade, info });
                    };
                }
                window.valleyEngine.start();
                window.valleyEngine.onEntryZero();
            } catch (err) {
                console.error('Failed to load valley engine:', err);
            }
            return true; // 已由 ValleyEngine 接管
        }

        // 普通模式动态导入场景
        try {
            const module = await import(`./scene-${sceneName}.js`);
            const SceneClass = module[`Scene${sceneName.charAt(0).toUpperCase() + sceneName.slice(1)}`];
            if (SceneClass) {
                const scene = new SceneClass();
                this.engine.setScene(scene);
            }
        } catch (err) {
            console.error('Failed to load scene:', err);
        }
    }

    /**
     * 显示选择界面
     */
    showSelectPanel() {
        const panel = document.getElementById('game-select-panel');
        if (panel) {
            panel.style.display = 'block';
        }
    }

    /**
     * 隐藏选择界面
     */
    hideSelectPanel() {
        const panel = document.getElementById('game-select-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    /**
     * 更新按钮样式（高亮激活项）
     */
    updateButtonStyles() {
        document.querySelectorAll('.scene-btn').forEach(btn => {
            if (btn.dataset.scene === this.selectedScene) {
                btn.classList.add('active');
                btn.style.borderColor = 'var(--primary)';
            }
        });

        document.querySelectorAll('.mode-btn').forEach(btn => {
            if (btn.dataset.mode === this.selectedMode) {
                btn.classList.add('active');
                btn.style.borderColor = 'var(--primary)';
            }
        });
    }

    /**
     * 创建游戏内浮动归零按钮（可拖动，纠正陀螺仪漂移）
     */
    _createFloatingZeroBtn() {
        this._removeFloatingZeroBtn();

        const btn = document.createElement('button');
        btn.id = 'game-floating-zero-btn';
        btn.textContent = '⟳';
        btn.title = '归零校准（可拖动）';
        Object.assign(btn.style, {
            position: 'fixed', bottom: '36px', right: '36px', zIndex: '5001',
            width: '52px', height: '52px', borderRadius: '50%',
            background: 'rgba(55, 65, 81, 0.85)', border: '2px solid rgba(255,255,255,0.3)',
            color: '#fff', fontSize: '22px', cursor: 'grab',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
            userSelect: 'none', touchAction: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s, border-color 0.2s'
        });

        let dragging = false, startX, startY, startLeft, startTop, moved = false;

        const onStart = (e) => {
            dragging = true; moved = false;
            btn.style.cursor = 'grabbing';
            btn.style.transition = 'none';
            const pt = e.touches ? e.touches[0] : e;
            startX = pt.clientX; startY = pt.clientY;
            const r = btn.getBoundingClientRect();
            startLeft = r.left; startTop = r.top;
            e.preventDefault();
        };

        const onMove = (e) => {
            if (!dragging) return;
            const pt = e.touches ? e.touches[0] : e;
            const dx = pt.clientX - startX, dy = pt.clientY - startY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
            btn.style.left = (startLeft + dx) + 'px';
            btn.style.top = (startTop + dy) + 'px';
            btn.style.right = 'auto'; btn.style.bottom = 'auto';
        };

        const onEnd = () => {
            dragging = false;
            btn.style.cursor = 'grab';
            btn.style.transition = 'background 0.2s, border-color 0.2s';
        };

        btn.addEventListener('mousedown', onStart);
        btn.addEventListener('touchstart', onStart, { passive: false });
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchend', onEnd);

        btn.addEventListener('click', () => {
            if (moved) return;
            if (window.state) {
                window.state.yawOffset = window.state.yaw + window.state.yawOffset;
                window.state.pitchOffset = window.state.pitch + window.state.pitchOffset;
                window.state.rollOffset = window.state.roll + window.state.rollOffset;
                window.state.pitch = 0; window.state.yaw = 0; window.state.roll = 0;
                window.state.dotX = 0; window.state.dotY = 0;
                window.state.displayDotX = 0; window.state.displayDotY = 0;
            }
            if (window.gameEngine) window.gameEngine.rezero();
            if (window.valleyEngine) window.valleyEngine.rezero();
            if (window.spaceEngine) window.spaceEngine.rezero();
            btn.style.background = 'rgba(5, 150, 105, 0.9)';
            btn.style.borderColor = '#10B981';
            setTimeout(() => {
                btn.style.background = 'rgba(55, 65, 81, 0.85)';
                btn.style.borderColor = 'rgba(255,255,255,0.3)';
            }, 800);
        });

        this._floatingZeroBtn = btn;
        document.body.appendChild(btn);
    }

    _removeFloatingZeroBtn() {
        const existing = document.getElementById('game-floating-zero-btn');
        if (existing) existing.remove();
        this._floatingZeroBtn = null;
    }
}
