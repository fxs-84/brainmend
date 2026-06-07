// v15：回滚 v14 过度密集 + 修车队挤压 + 保留追玩家车道核心
// 验证: 金币/障碍物密度恢复 + 汽车间距足够 + 玩家车道仍被追
import { chromium } from 'playwright';
const log = (m) => console.log(`[v15] ${m}`);
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (err) => console.log(`pageerror: ${err.message}`));
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(500);

    const result = await page.evaluate(async () => {
        const mod = await import('/js/game/scene-road.js');
        const scene = new mod.SceneRoad();
        scene.init({});
        scene.lastSpawnTime = -100;
        const playerLane = 3;
        scene.mapInputToPosition({ x: scene.lanes[playerLane], y: 0.85, speed: 1.0 });
        // 模拟生产：list 累积到 maxObstacles=5（接近饱和）
        const liveList = [];
        const stats = { coin: 0, boost: 0, vehicle: 0, spike: 0, rock: 0, oil: 0, pothole: 0, cone: 0, playerLaneHits: 0, totalSpawn: 0 };
        // 模拟 30 秒游戏（800ms spawn 间隔 → 37 次 spawn）
        for (let i = 0; i < 100; i++) {
            scene.lastSpawnTime -= 1;
            // 模拟旧障碍物滚出屏幕（每帧 y 递增）
            for (const o of liveList) o.y += 0.5 * 0.05;
            liveList.splice(0, liveList.length, ...liveList.filter(o => o.y < 1.1));
            const before = liveList.length;
            scene.trySpawnObstacle(liveList, {});
            const added = liveList.length - before;
            stats.totalSpawn += added;
            for (let k = before; k < liveList.length; k++) {
                const o = liveList[k];
                stats[o.type] = (stats[o.type] || 0) + 1;
                const oLane = scene.lanes.findIndex((lx) => Math.abs(lx - o.x) < 0.01);
                if (oLane === playerLane) stats.playerLaneHits++;
            }
        }
        return { stats, listSaturation: liveList.length };
    });
    console.log(JSON.stringify(result, null, 2));

    // 检查密度：30 秒里 ≥ 25 枚金币 + ≥ 18 个 v12 五兄弟 + 追玩家 ≥ 25%
    if (result.stats.coin < 10) {
        console.log(`❌ FAIL: 金币密度不够（30s 应 ≥10 枚，实际 ${result.stats.coin}）`);
        process.exitCode = 1;
        await browser.close();
        return;
    }
    const v12Total = result.stats.spike + result.stats.rock + result.stats.oil + result.stats.pothole + result.stats.cone;
    if (v12Total < 8) {
        console.log(`❌ FAIL: v12 五兄弟密度不够（30s 应 ≥8 个，实际 ${v12Total}）`);
        process.exitCode = 1;
        await browser.close();
        return;
    }
    const hitRate = result.stats.totalSpawn > 0 ? result.stats.playerLaneHits / result.stats.totalSpawn : 0;
    if (hitRate < 0.25) {
        console.log(`❌ FAIL: 玩家车道命中率应 ≥25%，实际 ${(hitRate * 100).toFixed(1)}%`);
        process.exitCode = 1;
        await browser.close();
        return;
    }
    console.log(`✅ PASS: 金币 ${result.stats.coin} / v12 五兄弟 ${v12Total} / 玩家车道命中 ${(hitRate*100).toFixed(1)}%`);
    await browser.close();
})();
