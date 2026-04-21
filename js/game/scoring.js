// ============================================================
// SCORING SYSTEM - 评分系统
// ============================================================

export class ScoringSystem {
    // 评分维度权重
    static WEIGHTS = {
        survival: 0.4,      // 存活时间
        obstacleAvoid: 0.4,  // 躲避精准度
        fluidity: 0.2       // 运动流畅度
    };

    // 评级阈值
    static GRADE_THRESHOLDS = {
        S: 90,
        A: 80,
        B: 70,
        C: 60,
        D: 0
    };

    constructor() {
        this.reset();
    }

    reset() {
        this.currentScore = 0;
        this.survivalScore = 0;
        this.avoidScore = 0;
        this.fluidityScore = 0;
        this.obstaclesDodged = 0;
        this.totalObstacles = 0;
        this.nearMisses = 0;
        this.positionHistory = [];
        this.maxHistoryLength = 60;
    }

    getCurrentScore() {
        return this.currentScore;
    }

    getFinalScore() {
        const survivalPart = this.survivalScore * ScoringSystem.WEIGHTS.survival;
        const avoidPart = this.avoidScore * ScoringSystem.WEIGHTS.obstacleAvoid;
        const fluidityPart = this.fluidityScore * ScoringSystem.WEIGHTS.fluidity;
        return survivalPart + avoidPart + fluidityPart;
    }

    calculateFrameScore(player, obstacles, dt, difficultyLevel) {
        this.survivalScore += 10 * dt * difficultyLevel;

        const centerDistance = Math.sqrt(
            Math.pow(player.x - 0.5, 2) +
            Math.pow(player.y - 0.5, 2)
        );
        this.avoidScore += (1 - centerDistance * 2) * 5 * dt;

        this.positionHistory.push({ x: player.x, y: player.y });
        if (this.positionHistory.length > this.maxHistoryLength) {
            this.positionHistory.shift();
        }

        if (this.positionHistory.length >= 10) {
            const fluidity = this.calculateFluidity(this.positionHistory);
            this.fluidityScore = fluidity * 100;
        }

        this.currentScore = this.getFinalScore();
    }

    calculateFluidity(positionHistory) {
        if (positionHistory.length < 2) return 1;

        let totalChange = 0;
        for (let i = 1; i < positionHistory.length; i++) {
            const prev = positionHistory[i - 1];
            const curr = positionHistory[i];
            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            totalChange += Math.sqrt(dx * dx + dy * dy);
        }

        const avgChange = totalChange / (positionHistory.length - 1);
        const optimal = 0.01;
        const ratio = avgChange / optimal;

        if (ratio >= 1) {
            return Math.max(0, 1 - (ratio - 1) * 0.5);
        } else {
            return ratio;
        }
    }

    onCollision() {
        // 碰撞发生
    }

    onObstacleDodged() {
        this.obstaclesDodged++;
        this.avoidScore += 50;
    }

    onNearMiss() {
        this.nearMisses++;
        this.avoidScore += 20;
    }

    getGrade(score) {
        const finalScore = score || this.getFinalScore();

        if (finalScore >= ScoringSystem.GRADE_THRESHOLDS.S) return 'S';
        if (finalScore >= ScoringSystem.GRADE_THRESHOLDS.A) return 'A';
        if (finalScore >= ScoringSystem.GRADE_THRESHOLDS.B) return 'B';
        if (finalScore >= ScoringSystem.GRADE_THRESHOLDS.C) return 'C';
        return 'D';
    }

    getStats() {
        return {
            score: this.getFinalScore(),
            grade: this.getGrade(),
            obstaclesDodged: this.obstaclesDodged,
            nearMisses: this.nearMisses,
            survivalScore: this.survivalScore,
            avoidScore: this.avoidScore,
            fluidityScore: this.fluidityScore
        };
    }
}
