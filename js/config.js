// ============================================================
// CONFIG - 常量配置
// ============================================================
export const CONFIG = {
    // 缩放范围
    MIN_ZOOM: 0.3,
    MAX_ZOOM: 5,

    // 检测参数
    HOLD_THRESHOLD: 5,
    HOLD_DURATION: 3,
    DOT_RETURN_SPEED: 0.98,
    ERROR_DECAY: 0.3,
    FAIL_THRESHOLD: 25,

    // 协调性检测参数
    COORD_FAIL_THRESHOLD: 40,     // 跟踪误差失败阈值(像素)
    COORD_TRAJ_THRESHOLD: 35,    // 轨迹偏离失败阈值(像素)

    // 协调性检测轨迹
    COORD_TRAJECTORIES: ['horizontal', 'vertical', 'vertical_left', 'vertical_right', 'figure8', 'figure8_reverse'],
    COORD_SINGLE_DURATION: 2 * (2 * Math.PI / 0.42),   // 单轨迹检测：2个完整周期
    COORD_FULL_DURATION: 20,     // 全轨迹检测：每轨迹20秒
    COORD_TRAINING_DURATION: 90, // 训练模式：1分30秒

    // 轨迹参数
    INTEGRATED_DURATION: 60,      // 综合检测：60秒
    COORDINATION_DURATION: 2 * (2 * Math.PI / 0.42),   // 协调性检测：2个完整周期
    TRAJECTORY_SPEED: 0.42,

    // 颈椎正常活动范围
    // 前屈: 35-45°, 后伸: 35-45°, 旋转: 60-80°
    EXPECTED_PITCH_RANGE: 80,      // 前屈+后伸总范围约70-90°
    EXPECTED_YAW_RANGE: 140,        // 左右旋转各60-80°

    // 轨迹幅度
    HORIZONTAL_AMPLITUDE: 80,
    VERTICAL_AMPLITUDE: 85,   // 垂直幅度85对应±45°（与中间垂线等长）
    FIGURE8_AMPLITUDE_X: 120,
    FIGURE8_AMPLITUDE_Y: 85, // 8字垂直幅度也改为85

    // 颜色
    COLORS: {
        TARGET: '#B91C1C',
        TARGET_GLOW: 'rgba(185, 28, 28, 0.8)',
        TARGET_GLOW_MID: 'rgba(185, 28, 28, 0.3)',
        POSITION: '#1D4ED8',
        POSITION_GLOW: 'rgba(29, 78, 216, 0.8)',
        POSITION_GLOW_MID: 'rgba(29, 78, 216, 0.3)',
        TRAIL: 'rgba(249, 115, 22, 0.5)',
        GRID: 'rgba(0, 0, 0, 0.16)',
        CROSSHAIR: 'rgba(88, 28, 135, 0.35)',
        RING_OUTER: 'rgba(0, 0, 0, 0.1)',
        RING_INNER: 'rgba(0, 0, 0, 0.06)'
    },

    // ROM检测步骤
    ROM_STEPS: [
        { name: '前屈', instruction: '请低头到最大范围', axis: 'pitch', extreme: 'min', normal: 45 },
        { name: '后伸', instruction: '请抬头到最大范围', axis: 'pitch', extreme: 'max', normal: 45 },
        { name: '左旋', instruction: '请头向左转到最大范围', axis: 'yaw', extreme: 'min', normal: 80 },
        { name: '右旋', instruction: '请头向右转到最大范围', axis: 'yaw', extreme: 'max', normal: 80 },
        { name: '左屈', instruction: '请头向左屈到最大范围', axis: 'roll', extreme: 'min', normal: 45 },
        { name: '右屈', instruction: '请头向右屈到最大范围', axis: 'roll', extreme: 'max', normal: 45 }
    ],

    // 位置觉检测步骤（本体感觉）
    POSITION_STEPS: [
        { name: '右旋', instruction: '请闭眼，头向右转到最大范围', targetAxis: 'yaw', targetExtreme: 'max' },
        { name: '左旋', instruction: '请闭眼，头向左转到最大范围', targetAxis: 'yaw', targetExtreme: 'min' },
        { name: '后伸', instruction: '请闭眼，抬头到最大范围', targetAxis: 'pitch', targetExtreme: 'max' },
        { name: '前屈', instruction: '请闭眼，低头到最大范围', targetAxis: 'pitch', targetExtreme: 'min' },
        { name: '右屈', instruction: '请闭眼，头向右屈到最大范围', targetAxis: 'roll', targetExtreme: 'max' },
        { name: '左屈', instruction: '请闭眼，头向左屈到最大范围', targetAxis: 'roll', targetExtreme: 'min' }
    ]
};
