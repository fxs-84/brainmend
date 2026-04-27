// ============================================================
// SCENE ROAD - 公路场景
// ============================================================

import { MotionMapper } from './motion-mapper.js';
import { ObstacleVehicle } from './obstacle.js';
import { SceneBase } from './scene-base.js';

export class SceneRoad extends SceneBase {
    constructor() {
        super();
        this.roadLines = [];
        this.lineSpeed = 0.3;
        this.movementAxis = 'free';
        this.scrollDirection = 'down'; // 'down' | 'up' | 'left' | 'right'
        this.initRoadLines();
    }

    initRoadLines() {
        this.roadLines = [];
        for (let i = 0; i < 8; i++) {
            this.roadLines.push({
                y: i * 0.15,
                visible: i % 2 === 0
            });
        }
    }

    init(engine) {
        super.init(engine);
        this.initRoadLines();
    }

    update(dt) {
        super.update(dt);

        // 更新车道线
        for (const line of this.roadLines) {
            line.y += this.lineSpeed * dt;
            if (line.y > 1.2) {
                line.y = -0.1;
            }
        }
    }

    renderBackground(ctx, width, height) {
        // 天空
        const gradient = ctx.createLinearGradient(0, 0, 0, height * 0.4);
        gradient.addColorStop(0, '#1E3A5F');
        gradient.addColorStop(1, '#3B82F6');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height * 0.4);

        // 道路
        ctx.fillStyle = '#374151';
        ctx.fillRect(0, height * 0.3, width, height * 0.7);

        // 道路边缘
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(0, height * 0.3, width, 5);
        ctx.fillRect(0, height - 5, width, 5);

        // 中心线
        const centerX = width * 0.5;
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // 移动的车道线
        for (const line of this.roadLines) {
            if (!line.visible) continue;
            const y = line.y * height;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(centerX - 5, y, 10, 30);
        }
    }

    spawnObstacle(difficultyConfig) {
        // 随机选择车道
        const lane = Math.random() < 0.5 ? 0 : 1;
        const laneX = lane === 0 ? 0.3 : 0.7;

        return new ObstacleVehicle({
            x: laneX,
            lane: lane
        });
    }

    mapInputToPosition(inputPos, player) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.DUAL_PITCH_YAW;
        return MotionMapper.mapToGame(inputPos, mode);
    }
}
