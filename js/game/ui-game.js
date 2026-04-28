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
                    </div>
                </div>

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
    startGame() {
        // 隐藏选择界面
        const panel = document.getElementById('game-select-panel');
        if (panel) {
            panel.style.display = 'none';
        }

        // 设置运动模式（射击模式使用 SINGLE_YAW 左右转头控制）
        const modeToSet = this.selectedMode === 'shooting' ? MotionMapper.MODES.SINGLE_YAW : this.selectedMode;
        this.engine.setMotionMode(modeToSet);

        // 设置场景
        this.setScene(this.selectedScene);

        // 开始游戏
        this.engine.start();
    }

    /**
     * 设置游戏场景
     */
    setScene(sceneName) {
        // 射击模式特殊处理
        if (this.selectedMode === 'shooting') {
            import(`./scene-space-shooting.js`).then(module => {
                const SceneClass = module.SceneSpaceShooting;
                if (SceneClass) {
                    const scene = new SceneClass();
                    this.engine.setScene(scene);
                }
            }).catch(err => {
                console.error('Failed to load shooting scene:', err);
            });
            return;
        }

        // 普通模式动态导入场景
        import(`./scene-${sceneName}.js`).then(module => {
            const SceneClass = module[`Scene${sceneName.charAt(0).toUpperCase() + sceneName.slice(1)}`];
            if (SceneClass) {
                const scene = new SceneClass();
                this.engine.setScene(scene);
            }
        }).catch(err => {
            console.error('Failed to load scene:', err);
        });
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
