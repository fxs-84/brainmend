// ============================================================
// SCENE ROAD - 公路赛车场景
// 3 车道 + yaw 换道 + 玩家车绘制
// ============================================================

import { MotionMapper } from './motion-mapper.js';
import { ObstacleVehicle } from './obstacle.js';
import { SceneBase } from './scene-base.js';

const VEHICLE_COLORS = ['#EF4444', '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981'];

export class SceneRoad extends SceneBase {
    constructor() {
        super();
        this.sceneType = 'road';
        this.lanes = [0.25, 0.5, 0.75];
        this.roadLines = [];
        this.lineSpeed = 0.4;
        this.scrollDirection = 'up'; // 障碍物从远处 y=0 向玩家 y=0.85 滚来
        this.initRoadLines();
    }

    initRoadLines() {
        this.roadLines = [];
        const numDashes = 10;
        for (let i = 0; i < numDashes; i++) {
            this.roadLines.push({
                y: i * 0.12,
                visible: true
            });
        }
    }

    init(engine) {
        super.init(engine);
        this.initRoadLines();
    }

    update(dt) {
        super.update(dt);
        for (const line of this.roadLines) {
            line.y += this.lineSpeed * dt;
            if (line.y > 1.1) {
                line.y = -0.05;
            }
        }
    }

    renderBackground(ctx, width, height) {
        // 天空渐变
        const sky = ctx.createLinearGradient(0, 0, 0, height * 0.35);
        sky.addColorStop(0, '#0F172A');
        sky.addColorStop(1, '#1E40AF');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height * 0.35);

        // 远山轮廓
        ctx.fillStyle = '#1E3A5F';
        ctx.beginPath();
        ctx.moveTo(0, height * 0.35);
        ctx.lineTo(width * 0.15, height * 0.25);
        ctx.lineTo(width * 0.30, height * 0.32);
        ctx.lineTo(width * 0.50, height * 0.22);
        ctx.lineTo(width * 0.70, height * 0.30);
        ctx.lineTo(width * 0.85, height * 0.24);
        ctx.lineTo(width, height * 0.33);
        ctx.lineTo(width, height * 0.35);
        ctx.closePath();
        ctx.fill();

        // 路面
        const roadTop = height * 0.35;
        ctx.fillStyle = '#374151';
        ctx.fillRect(0, roadTop, width, height - roadTop);

        // 路面边缘 (黄色双线)
        ctx.fillStyle = '#FCD34D';
        ctx.fillRect(0, roadTop, width, 4);
        ctx.fillRect(0, height - 4, width, 4);

        // 3 车道：2 条虚线分隔（位于 lanes[0]/lanes[1] 之间 和 lanes[1]/lanes[2] 之间）
        const dashY0 = roadTop;
        const dashH = height - roadTop;
        ctx.fillStyle = '#FFFFFF';
        for (const sepX of [this.lanes[0] + 0.125, this.lanes[2] - 0.125]) {
            const xPx = sepX * width;
            for (const line of this.roadLines) {
                if (!line.visible) continue;
                const y = dashY0 + line.y * dashH;
                if (y < dashY0 - 8 || y > height + 8) continue;
                ctx.fillRect(xPx - 3, y, 6, 28);
            }
        }
    }

    spawnObstacle(difficultyConfig) {
        const laneIdx = Math.floor(Math.random() * this.lanes.length);
        const laneX = this.lanes[laneIdx];
        const color = VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)];

        return new ObstacleVehicle({
            x: laneX,
            y: -0.1,
            lane: laneIdx,
            color,
            speedY: 0.35
        });
    }

    mapInputToPosition(inputPos, player) {
        // 公路赛车：玩家 y 锁定屏幕底部，x 跟随输入（由 InputAdapter 完成的 SINGLE_YAW 映射）
        return { x: inputPos.x, y: 0.85 };
    }

    renderPlayer(ctx, playerX, playerY) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const px = playerX * width;
        const py = playerY * height;
        const carW = width * 0.075;
        const carH = height * 0.13;

        // 车体（红色）
        ctx.fillStyle = '#DC2626';
        ctx.fillRect(px - carW / 2, py - carH / 2, carW, carH);

        // 车头（深色梯形）
        ctx.fillStyle = '#991B1B';
        ctx.beginPath();
        ctx.moveTo(px - carW / 2 + 4, py - carH / 2);
        ctx.lineTo(px + carW / 2 - 4, py - carH / 2);
        ctx.lineTo(px + carW / 2 - 8, py - carH / 2 + carH * 0.15);
        ctx.lineTo(px - carW / 2 + 8, py - carH / 2 + carH * 0.15);
        ctx.closePath();
        ctx.fill();

        // 车窗（青色玻璃）
        ctx.fillStyle = '#67E8F9';
        ctx.fillRect(px - carW / 2 + 8, py - carH / 2 + carH * 0.2, carW - 16, carH * 0.4);

        // 车头灯
        ctx.fillStyle = '#FEF3C7';
        ctx.fillRect(px - carW / 2 + 4, py - carH / 2 + 2, 8, 4);
        ctx.fillRect(px + carW / 2 - 12, py - carH / 2 + 2, 8, 4);

        // 边框
        ctx.strokeStyle = '#7F1D1D';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - carW / 2, py - carH / 2, carW, carH);
    }
}
