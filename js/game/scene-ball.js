// ============================================================
// SCENE BALL - 接球场景
// ============================================================

import { MotionMapper } from './motion-mapper.js';
import { ObstacleBall } from './obstacle.js';
import { SceneBase } from './scene-base.js';

export class SceneBall extends SceneBase {
    constructor() {
        super();
    }

    renderBackground(ctx, width, height) {
        // 草地背景
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#22C55E');
        gradient.addColorStop(1, '#16A34A');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // 球场线条
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;

        // 中线
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // 中圈
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 50, 0, Math.PI * 2);
        ctx.stroke();
    }

    spawnObstacle(difficultyConfig) {
        const colors = ['#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];

        return new ObstacleBall({
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }

    mapInputToPosition(inputPos, player) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.TRIPLE;
        return MotionMapper.mapToGame(inputPos, mode);
    }
}
