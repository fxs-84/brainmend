// ============================================================
// SCENE BASE - 场景基类
// ============================================================

export class SceneBase {
    constructor() {
        this.engine = null;
        this.obstacles = [];
        this.lastSpawnTime = 0;
        this.gameTime = 0;
    }

    /**
     * 初始化场景
     */
    init(engine) {
        this.engine = engine;
        this.obstacles = [];
        this.lastSpawnTime = 0;
        this.gameTime = 0;
    }

    /**
     * 更新场景
     */
    update(dt) {
        this.gameTime += dt;
    }

    /**
     * 渲染背景
     */
    renderBackground(ctx, width, height) {
        // 子类实现
    }

    /**
     * 尝试生成障碍物
     */
    trySpawnObstacle(obstacleList, difficultyConfig) {
        const timeSinceLastSpawn = this.gameTime - this.lastSpawnTime;

        if (obstacleList.length < difficultyConfig.maxObstacles &&
            timeSinceLastSpawn >= difficultyConfig.spawnInterval / 1000) {
            const obstacle = this.spawnObstacle(difficultyConfig);
            if (obstacle) {
                obstacleList.push(obstacle);
                this.lastSpawnTime = this.gameTime;
            }
        }
    }

    /**
     * 生成障碍物（子类实现）
     */
    spawnObstacle(difficultyConfig) {
        // 子类实现
        return null;
    }

    /**
     * 将输入映射为玩家位置
     */
    mapInputToPosition(inputPos, player) {
        return inputPos;
    }

    /**
     * 清理场景
     */
    cleanup() {
        this.obstacles = [];
    }
}
