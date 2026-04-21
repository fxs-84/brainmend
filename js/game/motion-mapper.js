// ============================================================
// MOTION MAPPER - 运动轴映射
// 将陀螺仪输入映射为游戏坐标
// ============================================================

export const MotionMapper = {
    // 运动模式
    MODES: {
        // 单轴模式
        SINGLE_PITCH: 'single_pitch',      // 仅低头/仰头 (Y轴)
        SINGLE_YAW: 'single_yaw',          // 仅左转/右转 (X轴)
        SINGLE_ROLL: 'single_roll',        // 仅左倾/右倾 (旋转)

        // 双轴模式
        DUAL_PITCH_YAW: 'dual_pitch_yaw',  // 低头/仰头 + 左转/右转

        // 三轴模式
        TRIPLE: 'triple'                   // 全部运动
    },

    // 模式对应的活动轴
    AXIS_MAP: {
        single_pitch: ['pitch'],
        single_yaw: ['yaw'],
        single_roll: ['roll'],
        dual_pitch_yaw: ['pitch', 'yaw'],
        triple: ['pitch', 'yaw', 'roll']
    },

    /**
     * 将陀螺仪输入映射为游戏坐标
     * @param {object} input - { pitch, yaw, roll } 范围约 -1 到 1
     * @param {string} mode - 运动模式
     * @returns {object} - { x, y } 范围 0 到 1，中心为 0.5
     */
    mapToGame(input, mode) {
        const { pitch = 0, yaw = 0, roll = 0 } = input;

        let x = 0.5;  // 默认居中
        let y = 0.5;

        switch (mode) {
            case this.MODES.SINGLE_PITCH:
                // 仅Y轴：pitch控制垂直位置
                // pitch负值=低头=屏幕上移，pitch正值=仰头=屏幕下移
                y = 0.5 - pitch * 0.4;  // 映射范围约0.1-0.9
                break;

            case this.MODES.SINGLE_YAW:
                // 仅X轴：yaw控制水平位置
                // yaw负值=左转=屏幕左移，yaw正值=右转=屏幕右移
                x = 0.5 + yaw * 0.4;
                break;

            case this.MODES.SINGLE_ROLL:
                // 仅旋转：roll控制水平位置（模拟侧倾移动）
                x = 0.5 + roll * 0.4;
                break;

            case this.MODES.DUAL_PITCH_YAW:
                // 双轴：pitch+Y，yaw=X
                x = 0.5 + yaw * 0.4;
                y = 0.5 - pitch * 0.4;
                break;

            case this.MODES.TRIPLE:
                // 三轴：pitch=Y，yaw=X，roll作为微调
                x = 0.5 + yaw * 0.4 + roll * 0.1;
                y = 0.5 - pitch * 0.4;
                break;

            default:
                x = 0.5;
                y = 0.5;
        }

        // 限制范围
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));

        return { x, y };
    },

    /**
     * 获取指定模式的活动轴
     * @param {string} mode - 运动模式
     * @returns {string[]} - 活动轴列表
     */
    getActiveAxes(mode) {
        return this.AXIS_MAP[mode] || [];
    },

    /**
     * 获取模式名称（中文）
     */
    getModeName(mode) {
        const names = {
            single_pitch: '单轴(上下)',
            single_yaw: '单轴(左右)',
            single_roll: '单轴(侧倾)',
            dual_pitch_yaw: '双轴(上下+左右)',
            triple: '三轴(综合)'
        };
        return names[mode] || mode;
    },

    /**
     * 获取所有模式
     */
    getAllModes() {
        return Object.values(this.MODES);
    },

    /**
     * 获取单轴模式列表
     */
    getSingleModes() {
        return [
            this.MODES.SINGLE_PITCH,
            this.MODES.SINGLE_YAW,
            this.MODES.SINGLE_ROLL
        ];
    },

    /**
     * 获取双轴模式列表
     */
    getDualModes() {
        return [this.MODES.DUAL_PITCH_YAW];
    },

    /**
     * 获取三轴模式列表
     */
    getTripleModes() {
        return [this.MODES.TRIPLE];
    }
};
