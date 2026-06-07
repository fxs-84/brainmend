// v14：70% 概率 spawn 追着玩家当前车道投 → 玩家不动=必撞
import { chromium } from 'playwright';
const log = (m) => console.log(`[v14-hunt] ${m}`);
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
        // 模拟玩家站在 lane 3（中间）不动
        const playerLane = 3;
        scene.mapInputToPosition({ x: scene.lanes[playerLane], y: 0.85, speed: 1.0 });
        // 模拟真实生产：list 累积到 maxObstacles=6，spawn 完不移除（让 list 永远饱和）
        const liveList = [];
        let playerLaneHits = 0, totalSpawn = 0;
        let hitsWhen70 = 0, countWhen70 = 0;
        for (let i = 0; i < 200; i++) {
            const before = liveList.length;
            scene.lastSpawnTime -= 1;
            const before2 = liveList.length;
            scene.trySpawnObstacle(liveList, {});
            const added = liveList.length - before2;
            totalSpawn += added;
            for (let k = before2; k < liveList.length; k++) {
                const o = liveList[k];
                const oLane = scene.lanes.findIndex((lx) => Math.abs(lx - o.x) < 0.01);
                if (oLane === playerLane) playerLaneHits++;
            }
            // 模拟"撞到就消失"
            liveList.splice(0, liveList.length);  // 简化为每次清空，看纯 spawn 行为
        }
        return {
            playerLane,
            totalSpawn,
            playerLaneHits,
            hitRate: totalSpawn > 0 ? playerLaneHits / totalSpawn : 0
        };
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.hitRate < 0.30) {
        console.log(`❌ FAIL: 玩家车道命中率应 ≥30%（v14 设计目标 1.5s/威胁），实际 ${(result.hitRate*100).toFixed(1)}%`);
        process.exitCode = 1;
    } else {
        console.log(`✅ PASS: 玩家车道命中率 ${(result.hitRate*100).toFixed(1)}%（≥30% 阈值 = 平均 1.5s 一个威胁）`);
    }
    await browser.close();
})();
