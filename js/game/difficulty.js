// ============================================================
// DIFFICULTY MANAGER - 难度管理器
// ============================================================

export class DifficultyManager {
    static CONFIG = {
        1: {
            spawnInterval: 2500,
            speedMultiplier: 0.8,
            maxObstacles: 3,
            types: ['small', 'medium']
        },
        2: {
            spawnInterval: 2000,
            speedMultiplier: 1.0,
            maxObstacles: 4,
            types: ['small', 'medium', 'medium']
        },
        3: {
            spawnInterval: 1500,
            speedMultiplier: 1.2,
            maxObstacles: 6,
            types: ['small', 'medium', 'large', 'medium']
        },
        4: {
            spawnInterval: 1100,
            speedMultiplier: 1.5,
            maxObstacles: 8,
            types: ['medium', 'large', 'fast', 'medium']
        },
        5: {
            spawnInterval: 800,
            speedMultiplier: 1.8,
            maxObstacles: 10,
            types: ['large', 'fast', 'random', 'fast']
        }
    };

    static LEVEL_UP_TIME = [0, 20, 45, 75, 120];

    constructor() {
        this.reset();
    }

    reset() {
        this.level = 1;
        this.timePlayed = 0;
        this.lastSpawnTime = 0;
    }

    advance(gameTime) {
        this.timePlayed = gameTime;

        for (let i = DifficultyManager.LEVEL_UP_TIME.length - 1; i >= 0; i--) {
            if (gameTime >= DifficultyManager.LEVEL_UP_TIME[i]) {
                this.level = i + 1;
                break;
            }
        }

        return this.getCurrentConfig();
    }

    getCurrentLevel() {
        return this.level;
    }

    getCurrentConfig() {
        return DifficultyManager.CONFIG[this.level] || DifficultyManager.CONFIG[1];
    }

    getSpawnInterval() {
        return this.getCurrentConfig().spawnInterval;
    }

    getSpeedMultiplier() {
        return this.getCurrentConfig().speedMultiplier;
    }

    getMaxObstacles() {
        return this.getCurrentConfig().maxObstacles;
    }

    getRandomObstacleType() {
        const types = this.getCurrentConfig().types;
        return types[Math.floor(Math.random() * types.length)];
    }

    canSpawnObstacle(currentCount, currentTime) {
        const config = this.getCurrentConfig();
        const timeSinceLastSpawn = currentTime - this.lastSpawnTime;

        return (
            currentCount < config.maxObstacles &&
            timeSinceLastSpawn >= config.spawnInterval
        );
    }

    recordSpawn(currentTime) {
        this.lastSpawnTime = currentTime;
    }

    getLevelName() {
        const names = {
            1: '简单',
            2: '普通',
            3: '困难',
            4: '专家',
            5: '大师'
        };
        return names[this.level] || '未知';
    }
}
