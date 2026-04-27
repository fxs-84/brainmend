// ============================================================
// CERVICAL ABILITY SCORER - 颈椎能力评分器
// 从游戏数据计算颈椎五维能力评估
// ============================================================

export class CervicalAbilityScorer {
    constructor() {
        // 五维能力的等级阈值
        this.LEVEL_THRESHOLDS = {
            excellent: { min: 85, name: '优秀', color: '#22c55e' },
            good: { min: 70, name: '良好', color: '#84cc16' },
            normal: { min: 55, name: '正常', color: '#eab308' },
            mild: { min: 40, name: '轻度受限', color: '#f97316' },
            moderate: { min: 0, name: '明显受限', color: '#ef4444' }
        };

        // ROM正常范围参考（度）
        this.ROM_REFERENCE = {
            flexion: 45,      // 前屈(低头)
            extension: 45,    // 后伸(抬头)
            rotation: 80,     // 旋转
            lateral: 35       // 侧屈
        };
    }

    /**
     * 计算综合颈椎能力评估
     * @param {object} recorder - HeadMotionRecorder实例
     * @param {object} gameStats - 游戏统计（得分、存活时间等）
     * @param {string} motionMode - 运动模式
     * @returns {object} 颈椎能力评估报告
     */
    calculateReport(recorder, gameStats, motionMode) {
        const stats = recorder.getStats();

        // 计算五维能力得分
        const romScore = this.calculateROMScore(stats, motionMode);
        const proprioceptionScore = this.calculateProprioceptionScore(stats, gameStats);
        const stabilityScore = this.calculateStabilityScore(stats);
        const coordinationScore = this.calculateCoordinationScore(stats, motionMode);
        const reactionScore = this.calculateReactionScore(stats, gameStats);

        // 计算综合得分
        const overallScore = Math.round(
            romScore.score * 0.25 +
            proprioceptionScore.score * 0.20 +
            stabilityScore.score * 0.20 +
            coordinationScore.score * 0.15 +
            reactionScore.score * 0.20
        );

        // 生成建议
        const recommendations = this.generateRecommendations({
            rom: romScore,
            proprioception: proprioceptionScore,
            stability: stabilityScore,
            coordination: coordinationScore,
            reaction: reactionScore
        });

        return {
            gameInfo: {
                gameTime: stats.gameTime.toFixed(0),
                motionMode: motionMode,
                finalScore: gameStats.score || 0,
                grade: gameStats.grade || 'D',
                obstaclesDodged: stats.obstaclesDodged,
                nearMisses: stats.nearMisses
            },
            abilities: {
                rom: romScore,
                proprioception: proprioceptionScore,
                stability: stabilityScore,
                coordination: coordinationScore,
                reaction: reactionScore
            },
            overall: {
                score: overallScore,
                grade: this.getOverallGrade(overallScore),
                summary: this.generateSummary(romScore, proprioceptionScore, stabilityScore, coordinationScore, reactionScore),
                recommendations: recommendations
            },
            details: {
                pitchRange: stats.pitchRange.toFixed(1),
                yawRange: stats.yawRange.toFixed(1),
                rollRange: stats.rollRange.toFixed(1),
                pitchMaxVelocity: stats.pitchMaxVelocity.toFixed(1),
                yawMaxVelocity: stats.yawMaxVelocity.toFixed(1),
                smoothness: stats.smoothness.toFixed(0),
                directionChanges: stats.directionChanges
            }
        };
    }

    /**
     * 计算活动范围(ROM)得分
     */
    calculateROMScore(stats, motionMode) {
        // 游戏中的角度范围（已归一化到约-45~45度或-90~90度）
        let pitchRange = stats.pitchRange;
        let yawRange = stats.yawRange;

        // 根据运动模式计算实际ROM
        // 映射系数：游戏坐标0.4范围 ≈ 实际角度范围
        let pitchROM, yawROM;

        switch (motionMode) {
            case 'single_pitch':
                // 单轴上下模式：pitch控制垂直移动
                // 屏幕0.4范围对应约40度
                pitchROM = pitchRange * 100;  // 假设最大值约40度
                yawROM = 0;  // 该模式不涉及yaw
                break;
            case 'single_yaw':
                // 单轴左右模式
                pitchROM = 0;
                yawROM = yawRange * 200;  // 屏幕0.4对应约80度
                break;
            case 'dual_pitch_yaw':
                // 双轴模式
                pitchROM = pitchRange * 100;
                yawROM = yawRange * 200;
                break;
            case 'triple':
                // 三轴模式
                pitchROM = pitchRange * 100;
                yawROM = yawRange * 200;
                break;
            default:
                pitchROM = pitchRange * 100;
                yawROM = yawRange * 200;
        }

        // 计算ROM得分（相对于正常参考值）
        let pitchScore = 0;
        let yawScore = 0;

        if (pitchROM > 0) {
            // 前屈+后伸约90度为满分
            pitchScore = Math.min(100, (pitchROM / 90) * 100);
        }
        if (yawROM > 0) {
            // 左右旋转约160度为满分
            yawScore = Math.min(100, (yawROM / 160) * 100);
        }

        // 综合ROM得分
        let romScore;
        if (pitchScore > 0 && yawScore > 0) {
            romScore = (pitchScore * 0.5 + yawScore * 0.5);
        } else {
            romScore = pitchScore > 0 ? pitchScore : yawScore;
        }

        return {
            score: Math.round(romScore),
            level: this.getLevel(romScore),
            pitchRange: pitchROM.toFixed(1),
            yawRange: yawROM.toFixed(1),
            pitchScore: Math.round(pitchScore),
            yawScore: Math.round(yawScore)
        };
    }

    /**
     * 计算位置觉得分
     */
    calculateProprioceptionScore(stats, gameStats) {
        // 位置觉通过以下指标评估：
        // 1. 位置控制精度（基于躲避精准度）
        // 2. 角度使用效率（使用的角度范围/最大可用范围）
        // 3. 位置方差（稳定性也影响位置觉）

        // 躲避精准度作为位置觉指标
        const dodgeAccuracy = gameStats.obstaclesDodged > 0
            ? Math.min(100, (gameStats.obstaclesDodged / 20) * 100)
            : 50;

        // 位置方差（越小越好）
        const posVarX = stats.positionVariance?.x || 0;
        const posVarY = stats.positionVariance?.y || 0;
        const posVarianceScore = Math.max(0, 100 - (posVarX + posVarY) * 2000);

        // 角度使用效率（使用范围占可用范围的比例，理想约30-70%）
        const pitchUsageRatio = Math.min(1, stats.pitchRange / 0.8);
        const yawUsageRatio = Math.min(1, stats.yawRange / 0.8);
        const usageScore = 100 - Math.abs(0.5 - (pitchUsageRatio + yawUsageRatio) / 2) * 100;

        // 综合位置觉得分
        const proprioceptionScore =
            dodgeAccuracy * 0.4 +
            posVarianceScore * 0.35 +
            usageScore * 0.25;

        return {
            score: Math.round(proprioceptionScore),
            level: this.getLevel(proprioceptionScore),
            dodgeAccuracy: Math.round(dodgeAccuracy),
            positionPrecision: Math.round(posVarianceScore),
            usageEfficiency: Math.round(usageScore)
        };
    }

    /**
     * 计算稳定性得分
     */
    calculateStabilityScore(stats) {
        // 稳定性指标：
        // 1. 位置方差（静态度量）
        // 2. 运动平滑度（动态度量）
        // 3. 方向变化频率

        const posVarX = stats.positionVariance?.x || 0;
        const posVarY = stats.positionVariance?.y || 0;
        const positionVarianceScore = Math.max(0, 100 - (posVarX + posVarY) * 3000);

        // 平滑度（jerk越小越好）
        const smoothnessScore = stats.smoothness || 50;

        // 方向变化频率（越少越稳定）
        const directionChangeRate = stats.gameTime > 0
            ? stats.directionChanges / stats.gameTime
            : 0;
        const directionScore = Math.max(0, 100 - directionChangeRate * 50);

        // 综合稳定性得分
        const stabilityScore =
            positionVarianceScore * 0.35 +
            smoothnessScore * 0.40 +
            directionScore * 0.25;

        return {
            score: Math.round(stabilityScore),
            level: this.getLevel(stabilityScore),
            positionStability: Math.round(positionVarianceScore),
            motionSmoothness: Math.round(smoothnessScore),
            directionStability: Math.round(directionScore)
        };
    }

    /**
     * 计算协调性得分
     */
    calculateCoordinationScore(stats, motionMode) {
        // 协调性指标：
        // 1. 多轴运动同步性（双轴/三轴模式）
        // 2. 轨迹平滑度
        // 3. 方向变化的流畅度

        // 多轴同步性（双轴/三轴模式）
        let axisSyncScore = 100;
        if (motionMode === 'dual_pitch_yaw' || motionMode === 'triple') {
            // 计算pitch和yaw运动的相位关系
            const pitchRange = stats.pitchRange || 0;
            const yawRange = stats.yawRange || 0;

            if (pitchRange > 0.1 && yawRange > 0.1) {
                // 两轴都有明显运动，计算同步性
                // 简化：用运动范围的比例来评估
                const ratio = Math.min(pitchRange, yawRange) / Math.max(pitchRange, yawRange);
                axisSyncScore = ratio * 100;
            } else if (pitchRange < 0.05 && yawRange < 0.05) {
                // 两轴都没有明显运动，可能是单轴模式
                axisSyncScore = 50;
            }
        }

        // 轨迹平滑度
        const trajectorySmoothness = stats.smoothness || 50;

        // 方向变化效率（平均每次变化的幅度）
        const directionEfficiency = stats.directionChanges > 0
            ? Math.min(100, 100 - stats.directionChanges * 2)
            : 100;

        // 综合协调性得分
        const coordinationScore =
            axisSyncScore * 0.30 +
            trajectorySmoothness * 0.40 +
            directionEfficiency * 0.30;

        return {
            score: Math.round(coordinationScore),
            level: this.getLevel(coordinationScore),
            axisSynchronization: Math.round(axisSyncScore),
            trajectorySmoothness: Math.round(trajectorySmoothness),
            directionEfficiency: Math.round(directionEfficiency)
        };
    }

    /**
     * 计算反应速度得分
     */
    calculateReactionScore(stats, gameStats) {
        // 反应速度指标：
        // 1. 躲避效率（成功躲避数/总障碍物数）
        // 2. 擦肩而过次数
        // 3. 游戏存活时间

        // 躲避效率
        const dodgeRate = stats.obstaclesDodged > 0
            ? Math.min(100, stats.obstaclesDodged * 5)
            : 50;

        // 擦肩而过奖励
        const nearMissBonus = Math.min(20, stats.nearMisses * 5);

        // 存活时间奖励（每10秒奖励5分，上限20分）
        const survivalBonus = Math.min(20, Math.floor(stats.gameTime / 10) * 5);

        // 综合反应速度得分
        const reactionScore = dodgeRate + nearMissBonus + survivalBonus;

        return {
            score: Math.round(Math.min(100, reactionScore)),
            level: this.getLevel(Math.min(100, reactionScore)),
            dodgeRate: Math.round(dodgeRate),
            nearMissBonus: nearMissBonus,
            survivalBonus: survivalBonus
        };
    }

    /**
     * 获取等级
     */
    getLevel(score) {
        if (score >= 85) return this.LEVEL_THRESHOLDS.excellent;
        if (score >= 70) return this.LEVEL_THRESHOLDS.good;
        if (score >= 55) return this.LEVEL_THRESHOLDS.normal;
        if (score >= 40) return this.LEVEL_THRESHOLDS.mild;
        return this.LEVEL_THRESHOLDS.moderate;
    }

    /**
     * 获取综合评级
     */
    getOverallGrade(score) {
        if (score >= 90) return 'S';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B';
        if (score >= 60) return 'C';
        return 'D';
    }

    /**
     * 生成评估总结
     */
    generateSummary(rom, proprioception, stability, coordination, reaction) {
        const parts = [];

        if (rom.score >= 70) {
            parts.push('活动范围良好');
        } else if (rom.score < 40) {
            parts.push('活动范围明显受限');
        }

        if (proprioception.score >= 70) {
            parts.push('位置觉准确');
        } else if (proprioception.score < 40) {
            parts.push('位置觉需加强');
        }

        if (stability.score >= 70) {
            parts.push('运动稳定');
        } else if (stability.score < 40) {
            parts.push('稳定性不足');
        }

        if (coordination.score >= 70) {
            parts.push('协调性良好');
        } else if (coordination.score < 40) {
            parts.push('协调性待改善');
        }

        if (reaction.score >= 70) {
            parts.push('反应速度较快');
        } else if (reaction.score < 40) {
            parts.push('反应速度偏慢');
        }

        return parts.length > 0 ? parts.join('，') : '综合表现一般';
    }

    /**
     * 生成训练建议
     */
    generateRecommendations(abilities) {
        const recommendations = [];

        // ROM建议
        if (abilities.rom.score < 60) {
            recommendations.push('建议加强颈椎活动范围训练，如轻柔的头部旋转和倾斜练习');
        }

        // 稳定性建议
        if (abilities.stability.score < 60) {
            recommendations.push('稳定性训练：保持头部正中位，逐渐增加保持时间');
        }

        // 协调性建议
        if (abilities.coordination.score < 60) {
            recommendations.push('协调性训练：进行头部追踪移动练习，如跟随目标转动');
        }

        // 反应速度建议
        if (abilities.reaction.score < 60) {
            recommendations.push('反应速度训练：进行快速转头躲避练习，提高反应灵敏度');
        }

        // 位置觉建议
        if (abilities.proprioception.score < 60) {
            recommendations.push('本体感觉训练：闭眼状态下进行头部位置感知练习');
        }

        if (recommendations.length === 0) {
            recommendations.push('继续保持当前训练强度，定期评估以监测进步');
        }

        return recommendations;
    }
}
