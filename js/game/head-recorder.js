// ============================================================
// HEAD MOTION RECORDER - 头部运动数据记录器
// 在游戏过程中记录头部运动数据，用于颈椎能力评估
// ============================================================

export class HeadMotionRecorder {
    constructor() {
        this.reset();
    }

    reset() {
        // 陀螺仪原始角度范围追踪
        this.pitchRange = { min: Infinity, max: -Infinity };
        this.yawRange = { min: Infinity, max: -Infinity };
        this.rollRange = { min: Infinity, max: -Infinity };

        // 角度样本（用于计算方差和均值）
        this.pitchSamples = [];
        this.yawSamples = [];
        this.rollSamples = [];

        // 速度样本（度/秒）
        this.pitchVelocity = [];
        this.yawVelocity = [];
        this.rollVelocity = [];

        // 玩家屏幕位置历史（归一化0-1）
        this.positionHistory = [];
        this.maxHistoryLength = 300;  // 约10秒@30fps

        // 躲避事件记录
        this.dodgeEvents = [];

        // 时间戳（用于计算速度）
        this.lastTimestamp = null;
        this.lastPitch = 0;
        this.lastYaw = 0;
        this.lastRoll = 0;

        // 游戏统计
        this.gameTime = 0;
        this.obstaclesDodged = 0;
        this.nearMisses = 0;
        this.collisionCount = 0;

        // 反应时间追踪
        this.reactionTimes = [];  // 秒

        // 方向变化次数（协调性指标）
        this.directionChanges = 0;
        this.lastMoveDirection = null;
    }

    /**
     * 记录一帧的头部数据
     * @param {object} gyroData - { pitch, yaw, roll } 原始陀螺仪角度
     * @param {object} playerPos - { x, y } 玩家屏幕位置（归一化0-1）
     * @param {number} dt - 时间增量（秒）
     * @param {object} obstacle - 当前障碍物信息（如果有）
     */
    recordFrame(gyroData, playerPos, dt, obstacle = null) {
        const { pitch, yaw, roll } = gyroData;
        const timestamp = this.gameTime;

        // 更新角度范围
        if (pitch < this.pitchRange.min) this.pitchRange.min = pitch;
        if (pitch > this.pitchRange.max) this.pitchRange.max = pitch;
        if (yaw < this.yawRange.min) this.yawRange.min = yaw;
        if (yaw > this.yawRange.max) this.yawRange.max = yaw;
        if (roll < this.rollRange.min) this.rollRange.min = roll;
        if (roll > this.rollRange.max) this.rollRange.max = roll;

        // 记录角度样本（每隔几帧采样一次以节省内存）
        if (this.pitchSamples.length === 0 || this.pitchSamples.length % 3 === 0) {
            this.pitchSamples.push(pitch);
            this.yawSamples.push(yaw);
            this.rollSamples.push(roll);
        }

        // 计算速度（度/秒）
        if (this.lastTimestamp !== null && dt > 0) {
            const pitchVel = Math.abs(pitch - this.lastPitch) / dt;
            const yawVel = Math.abs(yaw - this.lastYaw) / dt;
            const rollVel = Math.abs(roll - this.lastRoll) / dt;

            if (pitchVel < 500) this.pitchVelocity.push(pitchVel);  // 过滤异常值
            if (yawVel < 500) this.yawVelocity.push(yawVel);
            if (rollVel < 500) this.rollVelocity.push(rollVel);
        }

        // 记录位置历史
        this.positionHistory.push({
            x: playerPos.x,
            y: playerPos.y,
            timestamp
        });
        if (this.positionHistory.length > this.maxHistoryLength) {
            this.positionHistory.shift();
        }

        // 追踪方向变化
        const currentDir = this.getMoveDirection(playerPos);
        if (this.lastMoveDirection !== null && currentDir !== this.lastMoveDirection) {
            this.directionChanges++;
        }
        this.lastMoveDirection = currentDir;

        // 记录躲避事件（如果有障碍物在附近）
        if (obstacle) {
            this.recordDodgeEvent(obstacle, playerPos, timestamp);
        }

        this.lastTimestamp = timestamp;
        this.lastPitch = pitch;
        this.lastYaw = yaw;
        this.lastRoll = roll;
    }

    /**
     * 获取移动方向
     */
    getMoveDirection(pos) {
        if (pos.x < 0.4) return 'left';
        if (pos.x > 0.6) return 'right';
        if (pos.y < 0.4) return 'up';
        if (pos.y > 0.6) return 'down';
        return 'center';
    }

    /**
     * 记录躲避事件
     */
    recordDodgeEvent(obstacle, playerPos, timestamp) {
        const event = {
            timestamp,
            obstacleType: obstacle.type || 'unknown',
            obstacleX: obstacle.x,
            obstacleY: obstacle.y,
            playerX: playerPos.x,
            playerY: playerPos.y,
            reactionTime: this.calculateReactionTime(obstacle, timestamp)
        };
        this.dodgeEvents.push(event);
    }

    /**
     * 计算反应时间（简化版）
     */
    calculateReactionTime(obstacle, timestamp) {
        // 当障碍物进入屏幕范围时开始计时，玩家开始移动时结束
        // 这里返回从障碍物出现在有效范围到玩家开始躲避的时间
        const appearTime = timestamp - 0.5;  // 假设障碍物0.5秒前出现
        return Math.max(0.1, timestamp - appearTime);
    }

    /**
     * 更新游戏时间
     */
    updateTime(dt) {
        this.gameTime += dt;
    }

    /**
     * 记录成功躲避
     */
    recordDodge() {
        this.obstaclesDodged++;
    }

    /**
     * 记录擦肩而过
     */
    recordNearMiss() {
        this.nearMisses++;
    }

    /**
     * 记录碰撞
     */
    recordCollision() {
        this.collisionCount++;
    }

    /**
     * 获取记录的统计数据
     */
    getStats() {
        return {
            // 角度范围
            pitchRange: this.pitchRange.max - this.pitchRange.min,
            yawRange: this.yawRange.max - this.yawRange.min,
            rollRange: this.rollRange.max - this.rollRange.min,

            // 角度样本统计
            pitchMean: this.mean(this.pitchSamples),
            yawMean: this.yawSamples.length > 0 ? this.mean(this.yawSamples) : 0,
            pitchVariance: this.variance(this.pitchSamples),
            yawVariance: this.variance(this.yawSamples),

            // 速度统计
            pitchMaxVelocity: this.max(this.pitchVelocity),
            yawMaxVelocity: this.max(this.yawVelocity),
            pitchAvgVelocity: this.mean(this.pitchVelocity),
            yawAvgVelocity: this.mean(this.yawVelocity),

            // 位置统计
            positionVariance: this.positionVariance(),
            smoothness: this.calculateSmoothness(),

            // 事件统计
            gameTime: this.gameTime,
            obstaclesDodged: this.obstaclesDodged,
            nearMisses: this.nearMisses,
            collisionCount: this.collisionCount,
            dodgeCount: this.dodgeEvents.length,
            directionChanges: this.directionChanges,

            // 反应时间
            avgReactionTime: this.mean(this.reactionTimes),
            minReactionTime: this.min(this.reactionTimes)
        };
    }

    // 数学工具函数
    mean(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    variance(arr) {
        if (!arr || arr.length < 2) return 0;
        const m = this.mean(arr);
        return arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
    }

    max(arr) {
        if (!arr || arr.length === 0) return 0;
        return Math.max(...arr);
    }

    min(arr) {
        if (!arr || arr.length === 0) return Infinity;
        return Math.min(...arr);
    }

    /**
     * 计算位置方差（稳定性指标）
     */
    positionVariance() {
        if (this.positionHistory.length < 2) return { x: 0, y: 0 };

        const xArr = this.positionHistory.map(p => p.x);
        const yArr = this.positionHistory.map(p => p.y);

        return {
            x: this.variance(xArr),
            y: this.variance(yArr)
        };
    }

    /**
     * 计算运动平滑度（基于jerk）
     */
    calculateSmoothness() {
        if (this.positionHistory.length < 3) return 100;

        let totalJerk = 0;
        let count = 0;

        for (let i = 2; i < this.positionHistory.length; i++) {
            const p0 = this.positionHistory[i - 2];
            const p1 = this.positionHistory[i - 1];
            const p2 = this.positionHistory[i];

            // 计算加速度变化率（jerk）
            const ax = p2.x - 2 * p1.x + p0.x;
            const ay = p2.y - 2 * p1.y + p0.y;
            const jerk = Math.sqrt(ax * ax + ay * ay);

            totalJerk += jerk;
            count++;
        }

        if (count === 0) return 100;

        const avgJerk = totalJerk / count;
        // 将jerk转换为平滑度分数（jerk越小越平滑）
        // 典型值范围0.001-0.1
        const smoothness = Math.max(0, 100 - avgJerk * 1000);
        return Math.min(100, smoothness);
    }
}
