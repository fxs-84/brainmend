// v12：道路障碍物家族（地刺/石头/油污/坑/锥桶）
// 验证：5 种新类可实例化 + 各自 type 标识 + scene-road spawn 出 5 种新类型 + 撞击效果差异化
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = (msg) => console.log(`[road-v12] ${msg}`);

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (err) => console.log(`pageerror: ${err.message}`));

    // 抓 Vite 真实 URL（带 ?t= 时间戳）的小工具
    const getEngineRealUrl = async () => {
        return page.evaluate(async () => {
            const res = await fetch('/js/game/engine.js', { cache: 'no-store' });
            const text = await res.text();
            return text.match(/from ['"]([^'"]*sound-manager[^'"]*)['"]/)[1];
        });
    };

    try {
        log('0. 打开页面');
        await page.goto('http://localhost:5173');
        await page.waitForTimeout(500);

        log('1. 验证 5 个新障碍物类可实例化且 type 正确');
        const classCheck = await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const expected = [
                { name: 'ObstacleSpike',   type: 'spike'   },
                { name: 'ObstacleRock',    type: 'rock'    },
                { name: 'ObstacleOil',     type: 'oil'     },
                { name: 'ObstaclePothole', type: 'pothole' },
                { name: 'ObstacleCone',    type: 'cone'    }
            ];
            const result = {};
            for (const e of expected) {
                if (typeof mod[e.name] !== 'function') {
                    result[e.name] = { exists: false };
                    continue;
                }
                const inst = new mod[e.name]({ x: 0.5, y: 0.5, speedY: 0 });
                result[e.name] = { exists: true, type: inst.type, hasCollect: typeof inst.collect === 'function' };
            }
            return result;
        });
        log(`   类检查: ${JSON.stringify(classCheck)}`);
        for (const e of ['ObstacleSpike', 'ObstacleRock', 'ObstacleOil', 'ObstaclePothole', 'ObstacleCone']) {
            if (!classCheck[e] || !classCheck[e].exists) {
                throw new Error(`FAIL: ${e} 不可实例化`);
            }
            if (classCheck[e].type !== e.replace('Obstacle', '').toLowerCase()) {
                throw new Error(`FAIL: ${e}.type 应为 '${e.replace('Obstacle', '').toLowerCase()}'，实际 '${classCheck[e].type}'`);
            }
        }
        log('   ✓ 5 个新类可实例化 + type 正确');

        log('2. 验证 5 个新类有 render() 方法（Canvas 绘制不报错）');
        const renderCheck = await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 600;
            const ctx = canvas.getContext('2d');
            const results = {};
            for (const [name, Cls] of Object.entries({
                ObstacleSpike: mod.ObstacleSpike,
                ObstacleRock: mod.ObstacleRock,
                ObstacleOil: mod.ObstacleOil,
                ObstaclePothole: mod.ObstaclePothole,
                ObstacleCone: mod.ObstacleCone
            })) {
                try {
                    const inst = new Cls({ x: 0.5, y: 0.5, speedY: 0 });
                    inst.render(ctx);
                    results[name] = { ok: true };
                } catch (err) {
                    results[name] = { ok: false, error: err.message };
                }
            }
            return results;
        });
        log(`   渲染: ${JSON.stringify(renderCheck)}`);
        for (const [name, r] of Object.entries(renderCheck)) {
            if (!r.ok) throw new Error(`FAIL: ${name}.render() 报错：${r.error}`);
        }
        log('   ✓ 5 个新类渲染不报错');

        log('3. 启动游戏');
        await page.click('#splash-enter');
        await page.waitForTimeout(300);
        await page.click('button.mode-btn[data-mode="game"]');
        await page.waitForTimeout(500);
        await page.click('button.mode-btn[data-mode="road"]');
        await page.waitForTimeout(300);
        await page.click('#start-game-btn');
        await page.waitForTimeout(1500);

        // 初始化 audio
        await page.evaluate(async () => {
            const res = await fetch('/js/game/engine.js', { cache: 'no-store' });
            const text = await res.text();
            const m = text.match(/from ['"]([^'"]*sound-manager[^'"]*)['"]/);
            const smMod = await import(m[1]);
            smMod.soundManager.init();
        });
        await page.waitForTimeout(200);

        log('4. 强制清空 + 推 1 个 spike 到玩家位置 → 撞了扣 1 血');
        const spikeTest = await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const eng = window.gameEngine;
            const healthBefore = eng.health;
            eng.obstacles.length = 0;
            eng.obstacles.push(new mod.ObstacleSpike({ x: 0.5, y: 0.85, speedY: 0 }));
            return { healthBefore };
        });
        await page.waitForTimeout(500);
        const spikeAfter = await page.evaluate(() => {
            const eng = window.gameEngine;
            return { health: eng.health, state: eng.state };
        });
        log(`   spike 撞: ${JSON.stringify(spikeTest)} → ${JSON.stringify(spikeAfter)}`);
        if (spikeAfter.health >= spikeTest.healthBefore) {
            throw new Error(`FAIL: 撞 spike 应扣血，${spikeTest.healthBefore} → ${spikeAfter.health}`);
        }
        log('   ✓ 撞 spike 扣血成功');

        log('5. 强制清空 + 推 1 个 oil → 玩家车变黑 + 减速 timer');
        const oilTest = await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const eng = window.gameEngine;
            eng.obstacles.length = 0;
            eng.obstacles.push(new mod.ObstacleOil({ x: 0.5, y: 0.85, speedY: 0 }));
            return { health: eng.health };
        });
        await page.waitForTimeout(500);
        const oilAfter = await page.evaluate(() => {
            const eng = window.gameEngine;
            const scene = eng.currentScene;
            return {
                health: eng.health,
                oilDebuffActive: scene && scene.oilDebuffTimer > 0,
                oilDebuffTimer: scene ? scene.oilDebuffTimer : null
            };
        });
        log(`   oil 撞后: ${JSON.stringify(oilAfter)}`);
        if (!oilAfter.oilDebuffActive) {
            throw new Error(`FAIL: 撞 oil 应激活减速 debuff（scene.oilDebuffTimer > 0），实际 ${oilAfter.oilDebuffTimer}`);
        }
        log('   ✓ 撞 oil 激活减速 debuff');

        log('6. 强制清空 + 推 1 个 pothole → 短颠簸 timer');
        const potholeTest = await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const eng = window.gameEngine;
            eng.obstacles.length = 0;
            eng.obstacles.push(new mod.ObstaclePothole({ x: 0.5, y: 0.85, speedY: 0 }));
            return { health: eng.health };
        });
        await page.waitForTimeout(500);
        const potholeAfter = await page.evaluate(() => {
            const eng = window.gameEngine;
            const scene = eng.currentScene;
            return {
                health: eng.health,
                bumpActive: scene && scene.bumpTimer > 0,
                bumpTimer: scene ? scene.bumpTimer : null
            };
        });
        log(`   pothole 撞后: ${JSON.stringify(potholeAfter)}`);
        if (!potholeAfter.bumpActive) {
            throw new Error(`FAIL: 撞 pothole 应激活颠簸 timer，实际 ${potholeAfter.bumpTimer}`);
        }
        log('   ✓ 撞 pothole 激活颠簸');

        log('7. 验证 scene-road 的 trySpawnObstacle 能产出 5 种新类型');
        // 跑 200 次 spawn 测试覆盖率
        const spawnDiversity = await page.evaluate(async () => {
            const mod = await import('/js/game/scene-road.js');
            const scene = new mod.SceneRoad();
            scene.init({});
            // 基类节流：timeSinceLastSpawn < 0.9s 就 return。test 模拟"开了很久"，
            // 且每次循环手动把 lastSpawnTime 拉回 1s 前，绕过 production 的节流
            scene.lastSpawnTime = -100;
            const types = new Set();
            for (let i = 0; i < 300; i++) {
                const list = [];
                scene.lastSpawnTime -= 1;  // 每次都假装"刚过 1s"，绕过 throttle
                scene.trySpawnObstacle(list, {});
                for (const o of list) {
                    if (['spike', 'rock', 'oil', 'pothole', 'cone'].includes(o.type)) {
                        types.add(o.type);
                    }
                }
            }
            return { types: [...types] };
        });
        log(`   spawn 多样性: ${JSON.stringify(spawnDiversity)}`);
        const expectedNew = ['spike', 'rock', 'oil', 'pothole', 'cone'];
        for (const t of expectedNew) {
            if (!spawnDiversity.types.includes(t)) {
                throw new Error(`FAIL: scene.trySpawnObstacle 跑了 300 次还没 spawn ${t}（配比/分支漏了）`);
            }
        }
        log('   ✓ 5 种新类型都能被 spawn');

        log('8. 截图');
        await page.evaluate(() => { window.gameEngine.gameTime = 5; });
        await page.waitForTimeout(500);
        // 强制 spawn 5 种各 1 个做截图
        await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const eng = window.gameEngine;
            eng.obstacles.length = 0;
            eng.obstacles.push(new mod.ObstacleSpike({ x: 0.10, y: 0.5, speedY: 0 }));
            eng.obstacles.push(new mod.ObstacleRock({ x: 0.23, y: 0.6, speedY: 0 }));
            eng.obstacles.push(new mod.ObstacleOil({ x: 0.36, y: 0.4, speedY: 0 }));
            eng.obstacles.push(new mod.ObstaclePothole({ x: 0.50, y: 0.7, speedY: 0 }));
            eng.obstacles.push(new mod.ObstacleCone({ x: 0.64, y: 0.3, speedY: 0 }));
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(__dirname, 'road-v12-family.png') });
        log('   ✓ 截图: e2e/road-v12-family.png');

        log('=========================');
        log('✅ v12 全部检查通过！');
        log('=========================');
    } catch (err) {
        log('=========================');
        log(`❌ 测试失败: ${err.message}`);
        log('=========================');
        try { await page.screenshot({ path: path.join(__dirname, 'road-v12-fail.png') }); } catch { /* */ }
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
