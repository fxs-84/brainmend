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
        this.movementAxis = 'free'; // 'free' | 'vertical' | 'horizontal'
        this.scrollDirection = 'down'; // 'down' | 'up' | 'left' | 'right'
        this.generateStars();
    }

    init(engine) {
        super.init(engine);
        this.generateStars();
    }

    update(dt) {
        super.update(dt);

        // 根据滚动方向更新星星
        for (const star of this.stars) {
            switch (this.scrollDirection) {
                case 'left':
                    star.x -= star.speed * dt;
                    if (star.x < 0) { star.x = 1; star.y = Math.random(); }
                    break;
                case 'right':
                    star.x += star.speed * dt;
                    if (star.x > 1) { star.x = 0; star.y = Math.random(); }
                    break;
                case 'up':
                    star.y -= star.speed * dt;
                    if (star.y < 0) { star.y = 1; star.x = Math.random(); }
                    break;
                case 'down':
                default:
                    star.y += star.speed * dt;
                    if (star.y > 1) { star.y = 0; star.x = Math.random(); }
                    break;
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

        // 根据滚动方向设置障碍物初始位置和速度
        let x, y, speedX, speedY;

        switch (this.scrollDirection) {
            case 'left':
                // 障碍物从右侧出现，向左移动
                x = 1.1;
                y = Math.random() * 0.7 + 0.15;
                speedX = -(0.1 + Math.random() * 0.1);
                speedY = (Math.random() - 0.5) * 0.03;
                break;
            case 'right':
                // 障碍物从左侧出现，向右移动
                x = -0.1;
                y = Math.random() * 0.7 + 0.15;
                speedX = 0.1 + Math.random() * 0.1;
                speedY = (Math.random() - 0.5) * 0.03;
                break;
            case 'up':
                // 障碍物从下方出现，向上移动
                x = Math.random() * 0.7 + 0.15;
                y = 1.1;
                speedX = (Math.random() - 0.5) * 0.03;
                speedY = -(0.1 + Math.random() * 0.1);
                break;
            case 'down':
            default:
                // 障碍物从上方出现，向下移动（默认）
                x = Math.random() * 0.7 + 0.15;
                y = -0.1;
                speedX = (Math.random() - 0.5) * 0.05;
                speedY = 0.1 + Math.random() * 0.05;
                break;
        }

        return new ObstacleMeteor({
            size: sizeMap[type] || 'medium',
            x: x,
            y: y,
            speedX: speedX,
            speedY: speedY
        });
    }

    mapInputToPosition(inputPos, player) {
        const mode = this.engine ? this.engine.input.getMotionMode() : MotionMapper.MODES.TRIPLE;
        return MotionMapper.mapToGame(inputPos, mode);
    }
}
