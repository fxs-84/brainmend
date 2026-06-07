// v11：pitch 灵敏 + 引擎/金币/boost 音效
// 关键：Vite 给 module URL 加 ?t=... 时间戳，必须 import 同一个 URL 才能 patch 同一实例
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = (msg) => console.log(`[road-v11] ${msg}`);

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (err) => console.log(`pageerror: ${err.message}`));

    try {
        log('0. 先打开页面（让 import 路径能解析）');
        await page.goto('http://localhost:5173');
        await page.waitForTimeout(500);

        // 关键辅助：用 Vite 解析后的真实 URL（带 ?t=...）import 模块
        const setupPatch = async (browserUrl) => {
            return page.evaluate(async (bUrl) => {
                // 从 engine.js 抓 import URL（Vite 加了 ?t=...）
                const res = await fetch(bUrl, { cache: 'no-store' });
                const text = await res.text();
                const m = text.match(/from ['"]([^'"]*sound-manager[^'"]*)['"]/);
                if (!m) throw new Error('找不到 sound-manager URL');
                const realUrl = m[1];
                const smMod = await import(realUrl);
                window._sm = smMod.soundManager;
                window._calls = [];
                window._sm.playBoost = function() { window._calls.push('boost'); };
                window._sm.playCoin = function() { window._calls.push('coin'); };
                return realUrl;
            }, browserUrl);
        };

        log('1. 验证 v11 灵敏度（pitch=±0.4 已接近极值）');
        const sensitivity = await page.evaluate(async () => {
            const mod = await import('/js/game/motion-mapper.js');
            return {
                neg04: mod.MotionMapper.mapToGame({ pitch: -0.4, yaw: 0, roll: 0 }, 'yaw_pitch_speed').speed,
                pos04: mod.MotionMapper.mapToGame({ pitch: 0.4, yaw: 0, roll: 0 }, 'yaw_pitch_speed').speed,
                neg02: mod.MotionMapper.mapToGame({ pitch: -0.2, yaw: 0, roll: 0 }, 'yaw_pitch_speed').speed,
                pos02: mod.MotionMapper.mapToGame({ pitch: 0.2, yaw: 0, roll: 0 }, 'yaw_pitch_speed').speed,
                neg01: mod.MotionMapper.mapToGame({ pitch: -0.1, yaw: 0, roll: 0 }, 'yaw_pitch_speed').speed,
                pos01: mod.MotionMapper.mapToGame({ pitch: 0.1, yaw: 0, roll: 0 }, 'yaw_pitch_speed').speed
            };
        });
        log(`   灵敏度: ${JSON.stringify(sensitivity)}`);
        if (sensitivity.neg04 < 1.5) {
            throw new Error(`FAIL: pitch=-0.4 应 speed≥1.5，实际 ${sensitivity.neg04}`);
        }
        if (sensitivity.pos04 > 0.5) {
            throw new Error(`FAIL: pitch=+0.4 应 speed≤0.5，实际 ${sensitivity.pos04}`);
        }
        log('   ✓ 灵敏度提升：±0.4 已接近极值，不再需要极端仰头');

        log('2. 验证 soundManager 三个新方法存在');
        const soundApi = await page.evaluate(async () => {
            const mod = await import('/js/game/sound-manager.js');
            const sm = mod.soundManager;
            return {
                hasPlayBoost: typeof sm.playBoost === 'function',
                hasSetRPM: typeof sm.setEngineRPM === 'function',
                hasStartHum: typeof sm.startEngineHum === 'function',
                hasStopHum: typeof sm.stopEngineHum === 'function',
                hasPlayCoin: typeof sm.playCoin === 'function'
            };
        });
        log(`   API: ${JSON.stringify(soundApi)}`);
        for (const [k, v] of Object.entries(soundApi)) {
            if (!v) throw new Error(`FAIL: soundManager.${k} 缺失`);
        }
        log('   ✓ 5 个音效方法都存在');

        log('3. 启动游戏 + 手动初始化 audio（headless 通常不会自动 init）');
        await page.click('#splash-enter');
        await page.waitForTimeout(300);
        await page.click('button.mode-btn[data-mode="game"]');
        await page.waitForTimeout(500);
        await page.click('button.mode-btn[data-mode="road"]');
        await page.waitForTimeout(300);
        await page.click('#start-game-btn');
        await page.waitForTimeout(1500);

        // 用 Vite 真实 URL 初始化 audio（关键！）
        await page.evaluate(async () => {
            const res = await fetch('/js/game/engine.js', { cache: 'no-store' });
            const text = await res.text();
            const m = text.match(/from ['"]([^'"]*sound-manager[^'"]*)['"]/);
            const realUrl = m[1];
            const smMod = await import(realUrl);
            smMod.soundManager.init();
        });
        await page.waitForTimeout(200);

        const engineState = await page.evaluate(async () => {
            const res = await fetch('/js/game/engine.js', { cache: 'no-store' });
            const text = await res.text();
            const m = text.match(/from ['"]([^'"]*sound-manager[^'"]*)['"]/);
            const realUrl = m[1];
            const smMod = await import(realUrl);
            return {
                initialized: smMod.soundManager.isInitialized,
                audioContextState: smMod.soundManager.audioContext ? smMod.soundManager.audioContext.state : null
            };
        });
        log(`   引擎音状态: ${JSON.stringify(engineState)}`);
        if (!engineState.initialized) {
            throw new Error(`FAIL: 手动 init() 后应 isInitialized=true`);
        }
        log('   ✓ 引擎音已初始化');

        log('4. 模拟撞金币 → 验证 playCoin 被调用');
        const realUrl = await setupPatch('/js/game/engine.js');
        log(`   Vite URL: ${realUrl}`);

        await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const eng = window.gameEngine;
            eng.obstacles.length = 0;
            eng.obstacles.push(new mod.ObstacleCoin({ x: 0.5, y: 0.85, speedY: 0 }));
        });
        await page.waitForTimeout(500);
        const coinCalls = await page.evaluate(() => window._calls);
        log(`   calls: ${JSON.stringify(coinCalls)}`);
        if (!coinCalls.includes('coin')) {
            throw new Error(`FAIL: 吃金币应触发 playCoin，实际 calls=${JSON.stringify(coinCalls)}`);
        }
        log('   ✓ playCoin 触发');

        log('5. 模拟撞 boost → 验证 playBoost 被调用');
        await page.evaluate(async () => {
            const mod = await import('/js/game/obstacle.js');
            const eng = window.gameEngine;
            window._calls.length = 0;
            eng.obstacles.length = 0;
            eng.obstacles.push(new mod.ObstacleBoost({ x: 0.5, y: 0.85, speedY: 0 }));
        });
        await page.waitForTimeout(500);
        const boostCalls = await page.evaluate(() => window._calls);
        log(`   calls: ${JSON.stringify(boostCalls)}`);
        if (!boostCalls.includes('boost')) {
            throw new Error(`FAIL: 吃 boost 应触发 playBoost，实际 calls=${JSON.stringify(boostCalls)}`);
        }
        log('   ✓ playBoost 触发');

        log('6. 验证 setEngineRPM 实际改变频率');
        const rpmTest = await page.evaluate(async () => {
            // 拿到 engine 用的同一个 soundManager 实例
            const res = await fetch('/js/game/engine.js', { cache: 'no-store' });
            const text = await res.text();
            const m = text.match(/from ['"]([^'"]*sound-manager[^'"]*)['"]/);
            const realUrl = m[1];
            const smMod = await import(realUrl);
            const sm = smMod.soundManager;
            // 暂停游戏让 engine loop 不再覆盖 setEngineRPM
            const eng = window.gameEngine;
            const wasRunning = eng.isRunning;
            if (eng.pause) eng.pause(); else eng.running = false;
            // 启动引擎音
            sm.startEngineHum();
            await new Promise(r => setTimeout(r, 100));
            if (!sm._engineOsc) return { error: 'no engine osc after start' };
            const f0 = sm._engineOsc.frequency.value;
            sm.setEngineRPM(1.8);
            await new Promise(r => setTimeout(r, 400));
            const f1 = sm._engineOsc.frequency.value;
            sm.setEngineRPM(0.3);
            await new Promise(r => setTimeout(r, 400));
            const f2 = sm._engineOsc.frequency.value;
            return { f0, f1, f2 };
        });
        log(`   频率: ${JSON.stringify(rpmTest)}`);
        if (rpmTest.error) throw new Error(rpmTest.error);
        if (rpmTest.f1 <= rpmTest.f0) {
            throw new Error(`FAIL: 加速应让频率升高，f0=${rpmTest.f0} f1=${rpmTest.f1}`);
        }
        if (rpmTest.f2 >= rpmTest.f1) {
            throw new Error(`FAIL: 减速应让频率降低，f1=${rpmTest.f1} f2=${rpmTest.f2}`);
        }
        log('   ✓ RPM 频率随 speed 联动');

        log('7. 触发 GAME OVER → 验证引擎音停止');
        await page.evaluate(async () => {
            const eng = window.gameEngine;
            // 直接调用 setState(GAMEOVER) 触发清理逻辑（更确定性，绕过 PAUSED 状态）
            const { GameState } = await import('/js/game/engine.js');
            eng.setState(GameState.GAMEOVER);
        });
        await page.waitForTimeout(500);
        const afterGO = await page.evaluate(async () => {
            const res = await fetch('/js/game/engine.js', { cache: 'no-store' });
            const text = await res.text();
            const m = text.match(/from ['"]([^'"]*sound-manager[^'"]*)['"]/);
            const realUrl = m[1];
            const smMod = await import(realUrl);
            return { hasEngineOsc: !!smMod.soundManager._engineOsc };
        });
        log(`   GAME OVER 后 _engineOsc: ${JSON.stringify(afterGO)}`);
        if (afterGO.hasEngineOsc) {
            throw new Error(`FAIL: GAME OVER 后应停引擎音（_engineOsc=null）`);
        }
        log('   ✓ GAME OVER 停止引擎音');

        log('8. 截图');
        await page.screenshot({ path: path.join(__dirname, 'road-v11-final.png') });

        log('=========================');
        log('✅ v11 全部检查通过！');
        log('=========================');
    } catch (err) {
        log('=========================');
        log(`❌ 测试失败: ${err.message}`);
        log('=========================');
        try { await page.screenshot({ path: path.join(__dirname, 'road-v11-fail.png') }); } catch { /* */ }
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
