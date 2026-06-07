// 公路赛车 v9 专项 - 验证金币链 + 加速道具 + pitch 控速
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = (msg) => console.log(`[road-v9] ${msg}`);

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (err) => console.log(`pageerror: ${err.message}`));

    try {
        log('启动游戏');
        await page.goto('http://localhost:5173');
        await page.waitForTimeout(500);
        await page.click('#splash-enter');
        await page.waitForTimeout(300);
        await page.click('button.mode-btn[data-mode="game"]');
        await page.waitForTimeout(500);
        await page.click('button.mode-btn[data-mode="road"]');
        await page.waitForTimeout(300);
        await page.click('#start-game-btn');
        await page.waitForTimeout(2500);

        // 1. 验证 YAW_PITCH_SPEED 模式 + speed 字段
        log('1. 验证 motionMode 与 mapToGame 返回 speed 字段');
        const speedProbe = await page.evaluate(() => {
            const eng = window.gameEngine;
            if (!eng || !eng.input) return { error: 'no engine/input' };
            // 强制让 input 用 gyroscope
            window.state.useGyroscope = true;
            window.state.yaw = 0;
            window.state.pitch = -0.5;  // 仰头 (抬头) → 应加速
            window.state.roll = 0;
            // 触发一帧
            return { mode: eng.input.getMotionMode() };
        });
        log(`   模式: ${JSON.stringify(speedProbe)}`);
        if (speedProbe.error) throw new Error(speedProbe.error);
        if (speedProbe.mode !== 'yaw_pitch_speed') {
            throw new Error(`FAIL: 应为 yaw_pitch_speed，实际 ${speedProbe.mode}`);
        }
        // 直接调用 MotionMapper 看返回 speed
        const mapResult = await page.evaluate(async () => {
            const mod = await import('/js/game/motion-mapper.js');
            return mod.MotionMapper.mapToGame({ yaw: 0, pitch: -0.5, roll: 0 }, 'yaw_pitch_speed');
        });
        log(`   mapToGame(pitch=-0.5): ${JSON.stringify(mapResult)}`);
        if (typeof mapResult.speed !== 'number') {
            throw new Error(`FAIL: mapToGame 应返回 speed 字段，实际 ${JSON.stringify(mapResult)}`);
        }
        if (mapResult.speed <= 1.0) {
            throw new Error(`FAIL: 仰头 (pitch=-0.5) 应让 speed > 1.0 加速，实际 ${mapResult.speed}`);
        }
        log(`   ✓ 仰头加速 speed=${mapResult.speed.toFixed(2)}`);

        // 2. 验证低头减速
        const mapResultDown = await page.evaluate(async () => {
            const mod = await import('/js/game/motion-mapper.js');
            return mod.MotionMapper.mapToGame({ yaw: 0, pitch: 0.5, roll: 0 }, 'yaw_pitch_speed');
        });
        log(`   mapToGame(pitch=+0.5): ${JSON.stringify(mapResultDown)}`);
        if (mapResultDown.speed >= 1.0) {
            throw new Error(`FAIL: 低头 (pitch=+0.5) 应让 speed < 1.0 减速，实际 ${mapResultDown.speed}`);
        }
        log(`   ✓ 低头减速 speed=${mapResultDown.speed.toFixed(2)}`);

        // 3. 中性 pitch=0 → speed=1.0
        const mapResultNeutral = await page.evaluate(async () => {
            const mod = await import('/js/game/motion-mapper.js');
            return mod.MotionMapper.mapToGame({ yaw: 0, pitch: 0, roll: 0 }, 'yaw_pitch_speed');
        });
        if (Math.abs(mapResultNeutral.speed - 1.0) > 0.001) {
            throw new Error(`FAIL: pitch=0 应 speed=1.0，实际 ${mapResultNeutral.speed}`);
        }
        log(`   ✓ 中性速度=1.00`);

        // 4. 验证 ObstacleBoost 工具类可用
        log('2. 验证 ObstacleBoost 类可被实例化');
        const boostOk = await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const b = new mod.ObstacleBoost({ x: 0.5, y: 0.5 });
            return { type: b.type, hasCollect: typeof b.collect === 'function' };
        });
        log(`   boost: ${JSON.stringify(boostOk)}`);
        if (boostOk.type !== 'boost') throw new Error(`FAIL: type 应为 boost，实际 ${boostOk.type}`);
        log('   ✓ ObstacleBoost 可用');

        // 5. 强制 spawn 一条金币链：直接 push 到 obstacles
        log('3. 验证金币链可见且可收集');
        const coinResult = await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const eng = window.gameEngine;
            // 强制清空再放 3 枚金币在玩家路径上
            eng.obstacles.length = 0;
            for (let i = 0; i < 3; i++) {
                eng.obstacles.push(new mod.ObstacleCoin({
                    x: 0.5, y: 0.85 - i * 0.07, speedY: 0
                }));
            }
            return { count: eng.obstacles.length, types: eng.obstacles.map(o => o.type) };
        });
        log(`   强制金币链: ${JSON.stringify(coinResult)}`);
        if (coinResult.count !== 3 || !coinResult.types.every(t => t === 'coin')) {
            throw new Error(`FAIL: 应有 3 枚 coin，实际 ${JSON.stringify(coinResult)}`);
        }
        // 让玩家吃 1 枚
        await page.waitForTimeout(500);
        const coinScore = await page.evaluate(() => {
            const eng = window.gameEngine;
            return { coins: eng.scoring.coinsCollected, score: eng.score };
        });
        log(`   吃金币后: ${JSON.stringify(coinScore)}`);
        if (coinScore.coins < 1) {
            throw new Error(`FAIL: 应收集至少 1 枚金币，实际 ${coinScore.coins}`);
        }
        log('   ✓ 金币可收集');

        // 6. 验证 boost 道具可激活 + 临时加速
        log('4. 验证 boost 道具 → 临时 lineSpeed 翻倍');
        await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const eng = window.gameEngine;
            eng.obstacles.length = 0;
            eng.obstacles.push(new mod.ObstacleBoost({ x: 0.5, y: 0.85, speedY: 0 }));
        });
        await page.waitForTimeout(500);
        const boostActive = await page.evaluate(() => {
            const eng = window.gameEngine;
            return { timer: eng.currentScene.boostTimer, speed: eng.currentScene.playerSpeed };
        });
        log(`   boost 状态: ${JSON.stringify(boostActive)}`);
        if (boostActive.timer <= 0) {
            throw new Error(`FAIL: boost 激活后 boostTimer 应 > 0，实际 ${boostActive.timer}`);
        }
        log('   ✓ boost 道具激活');

        // 7. 截图存档
        log('5. 截图');
        await page.screenshot({ path: path.join(__dirname, 'road-v9-final.png') });
        log('   ✓ 截图: e2e/road-v9-final.png');

        log('=========================');
        log('✅ v9 全部检查通过！');
        log('=========================');
    } catch (err) {
        log('=========================');
        log(`❌ 测试失败: ${err.message}`);
        log('=========================');
        try {
            await page.screenshot({ path: path.join(__dirname, 'road-v9-fail.png') });
        } catch { /* ignore */ }
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
