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
                <h2 style="text-align: center; margin-bottom: 20px; color: var(--primary);">
                    选择游戏
                </h2>

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
                        <button class="scene-btn" data-scene="road" style="
                            flex: 1; padding: 12px; border: 2px solid transparent;
                            border-radius: 8px; background: #1E293B; color: white;
                            cursor: pointer; transition: all 0.2s;
                        ">
                            🛣️ 公路
                        </button>
                        <button class="scene-btn" data-scene="ball" style="
                            flex: 1; padding: 12px; border: 2px solid transparent;
                            border-radius: 8px; background: #1E293B; color: white;
                            cursor: pointer; transition: all 0.2s;
                        ">
                            ⚽ 接球
                        </button>
                        <button class="scene-btn" data-scene="valley" style="
                            flex: 1; padding: 12px; border: 2px solid transparent;
                            border-radius: 8px; background: #1E293B; color: white;
                            cursor: pointer; transition: all 0.2s;
                        ">
                            ✈️ 山谷飞行
                        </button>
                    </div>
                </div>

                <!-- 运动模式选择 -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: #9CA3AF;">运动模式</label>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button class="mode-btn active" data-mode="single_yaw" style="
                            padding: 10px; border: 2px solid transparent;
                            border-radius: 6px; background: #1E293B; color: white;
                            cursor: pointer; text-align: left;
                        ">
                            单轴 - 左右转头
                        </button>
                        <button class="mode-btn" data-mode="single_pitch" style="
                            padding: 10px; border: 2px solid transparent;
                            border-radius: 6px; background: #1E293B; color: white;
                            cursor: pointer; text-align: left;
                        ">
                            单轴 - 上下点头
                        </button>
                        <button class="mode-btn" data-mode="single_roll" style="
                            padding: 10px; border: 2px solid transparent;
                            border-radius: 6px; background: #1E293B; color: white;
                            cursor: pointer; text-align: left;
                        ">
                            单轴 - 侧倾
                        </button>
                        <button class="mode-btn" data-mode="dual_pitch_yaw" style="
                            padding: 10px; border: 2px solid transparent;
                            border-radius: 6px; background: #1E293B; color: white;
                            cursor: pointer; text-align: left;
                        ">
                            双轴 - 上下+左右
                        </button>
                        <button class="mode-btn" data-mode="triple" style="
                            padding: 10px; border: 2px solid transparent;
                            border-radius: 6px; background: #1E293B; color: white;
                            cursor: pointer; text-align: left;
                        ">
                            三轴 - 综合模式
                        </button>
                        <button class="mode-btn" data-mode="shooting" style="
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
                        <button class="mode-btn" data-mode="flight" style="
                            padding: 10px; border: 2px solid transparent;
                            border-radius: 6px; background: #1E293B; color: white;
                            cursor: pointer; text-align: left;
                        ">
                            ✈️ 山谷飞行 - 全面姿态控制
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
        // 隐藏选择界面
        const panel = document.getElementById('game-select-panel');
        if (panel) {
            panel.style.display = 'none';
        }

        // 设置场景（等待场景加载完成）
        const handledByScene = await this.setScene(this.selectedScene);

        // 山谷飞行模式由 ValleyEngine 独立管理渲染，不需要 GameEngine
        if (!handledByScene) {
            // 运动模式映射
            let modeToSet = this.selectedMode;
            if (this.selectedMode === 'shooting') modeToSet = MotionMapper.MODES.SINGLE_YAW;
            if (this.selectedMode === 'nodding') modeToSet = MotionMapper.MODES.SINGLE_PITCH;
            this.engine.setMotionMode(modeToSet);
            this.engine.start();
        }
    }

    /**
     * 设置游戏场景
     */
    async setScene(sceneName) {
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

        // 山谷飞行模式特殊处理 - 使用独立的ValleyEngine
        if (this.selectedMode === 'flight' || sceneName === 'valley') {
            try {
                if (!window.valleyEngine) {
                    const canvas = document.getElementById('crosshair-canvas');
                    const module = await import(`./valley-engine.js`);
                    window.valleyEngine = new module.ValleyEngine(canvas);
                    window.valleyEngine.init();
                    window.valleyEngine.onScoreUpdate = (score) => {
                        const el = document.getElementById('game-score');
                        if (el) el.textContent = '分数: ' + score;
                    };
                    window.valleyEngine.onGameOver = (score, grade, info) => {
                        console.log('Valley game over:', { score, grade, info });
                    };
                }
                window.valleyEngine.start();
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
}
