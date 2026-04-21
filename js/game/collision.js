// ============================================================
// COLLISION DETECTOR - 碰撞检测
// ============================================================

export const CollisionDetector = {
    // 碰撞形状
    SHAPES: {
        CIRCLE: 'circle',
        AABB: 'aabb'
    },

    /**
     * 检测玩家与障碍物是否碰撞
     * @param {object} player - 玩家 { x, y, hitboxRadius }
     * @param {object} obstacle - 障碍物
     * @param {HTMLCanvasElement} canvas - 画布
     * @returns {boolean}
     */
    checkPlayerObstacle(player, obstacle, canvas) {
        if (!player || !obstacle) return false;

        const playerX = player.x * canvas.width;
        const playerY = player.y * canvas.height;
        const playerRadius = player.hitboxRadius * Math.min(canvas.width, canvas.height);

        const obstacleX = obstacle.x * canvas.width;
        const obstacleY = obstacle.y * canvas.height;
        const obstacleRadius = obstacle.radius * Math.min(canvas.width, canvas.height);

        return this.circleCollision(
            playerX, playerY, playerRadius,
            obstacleX, obstacleY, obstacleRadius
        );
    },

    /**
     * 圆形碰撞检测
     */
    circleCollision(x1, y1, r1, x2, y2, r2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < (r1 + r2);
    },

    /**
     * AABB碰撞检测
     */
    aabbCollision(a, b) {
        return !(
            a.x + a.width < b.x ||
            b.x + b.width < a.x ||
            a.y + a.height < b.y ||
            b.y + b.height < a.y
        );
    },

    /**
     * 点是否在圆内
     */
    pointInCircle(px, py, cx, cy, r) {
        const dx = px - cx;
        const dy = py - cy;
        return (dx * dx + dy * dy) < (r * r);
    },

    /**
     * 检测玩家是否在安全区域
     */
    checkPlayerSafe(player, safeZone) {
        const px = player.x;
        const py = player.y;

        return (
            px >= safeZone.x &&
            px <= safeZone.x + safeZone.width &&
            py >= safeZone.y &&
            py <= safeZone.y + safeZone.height
        );
    }
};
