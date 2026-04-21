// ============================================================
// SCENE SPACE - 太空场景
// ============================================================

import { MotionMapper } from './motion-mapper.js';
import { ObstacleMeteor } from './obstacle.js';
import { SceneBase } from './scene-base.js';

export class SceneSpace extends SceneBase {
    constructor() {
        super();
        this.stars = [];
        this.generateStars();
    }

    generateStars() {
        this.stars = [];
        for (let i = 0; i < 100; i++) {
            this.stars.push({
                x: Math.random(),
                y: Math.random(),
                size: Math.random() * 0.003 + 0.001,
                speed: Math.random() * 0.2 + 0.05,
                brightness: Math.random()
            });
        }
    }

    init(engine) {
        super.init(engine);
        this.generateStars();
    }

    update(dt) {
        super.update(dt);

        // 更新星星位置
        for (const star of this.stars) {
            star.y += star.speed * dt;
            if (star.y > 1) {
                star.y = 0;
                star.x = Math.random();
            }
        }
    }

    renderBackground(ctx, width, height) {
        // 深空背景
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(0, 0, width, height);

        // 星星
        for (const star of this.stars) {
            const x = star.x * width;
            const y = star.y * height;
            const size = star.size * Math.min(width, height);

            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness * 0.8})`;
            ctx.fill();
        }
    }

    spawnObstacle(difficultyConfig) {
        const type = difficultyConfig.types[Math.floor(Math.random() * difficultyConfig.types.length)];
        const sizeMap = {
            'small': 'small',
            'medium': 'medium',
            'large': 'large',
            'fast': 'medium',
            'random': ['small', 'medium', 'large'][Math.floor(Math.random() * 3)]
        };

        return new ObstacleMeteor({
            size: sizeMap[type] || 'medium'
        });
    }

    mapInputToPosition(inputPos, player) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.TRIPLE;
        return MotionMapper.mapToGame(inputPos, mode);
    }
}
