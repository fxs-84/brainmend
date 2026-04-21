// ============================================================
// STATE - 应用状态
// ============================================================
const createState = () => ({
    // 当前模式
    mode: 'integrated',
    isRunning: false,

    // 陀螺仪数据
    pitch: 0,
    yaw: 0,
    roll: 0,

    // 光点位置
    dotX: 0,
    dotY: 0,

    // 目标点位置（替换 window.targetX/Y）
    targetX: 0,
    targetY: 0,

    // 角度偏移量（归零用）
    pitchOffset: 0,
    yawOffset: 0,
    rollOffset: 0,

    // 采集的ROM点
    collectedPoints: [],

    // ROM检测状态
    romStepIndex: 0,
    romResults: {},
    romIsWaitingForZero: false,

    // 位置觉检测状态
    positionStepIndex: 0,
    positionResults: [],
    positionIsRunning: false,
    positionInitialPitch: 0,
    positionInitialYaw: 0,
    positionInitialRoll: 0,

    // 角度系数（动态计算以匹配实际显示范围）
    yawCoefficient: 0.8,
    pitchCoefficient: 0.53,

    // 检测状态
    holdTime: 0,
    error: 0,

    // 综合检测结果
    integratedResults: {
        positionScore: 0,
        stabilityScore: 0,
        romScore: 0
    },

    // 进度
    progress: 0,
    lastAnnouncedProgress: -1,  // TTS播报进度追踪
    testDuration: CONFIG.INTEGRATED_DURATION,

    // 缩放
    zoomFactor: 1,

    // 评分结果
    results: {
        position: 0,
        stability: 0,
        rom: 0,
        coordination: 0
    },

    // 轨迹类型
    trajectoryType: 'horizontal',

    // 轨迹
    trail: [],
    maxTrailLength: 200,
    // 完整轨迹（保存检测全过程）
    fullTrail: [],
    maxFullTrailLength: 3600,  // 60秒 * 60fps

    // ROM 范围
    romRange: { pitch: { min: 0, max: 0 }, yaw: { min: 0, max: 0 } },

    // 十字准星偏移

    // 输入模式切换
    useGyroscope: false,
    crosshairOffsetX: 0,
    crosshairOffsetY: 0,
    isDraggingCrosshair: false,
    lastDragX: 0,
    lastDragY: 0,

    // 误差追踪
    lastError: 0,
    coordFailTime: 0,

    // 协调性检测评分
    coordScores: null,  // { tracking: [], trajectory: [], smoothness: [] }
    coordMode: 'single',  // 'single' | 'full'
    coordCurrentTrajectoryIndex: 0,  // 当前轨迹索引（全模式）
    coordFullScores: []  // 全模式：存储各轨迹的评分
});

const state = createState();
