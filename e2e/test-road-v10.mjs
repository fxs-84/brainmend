// v10 远景运动专项：3 个时间点截图证明天空/云/山在变
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = (msg) => console.log(`[road-v10] ${msg}`);

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

        // 1. 时间点 A (t=0)：白天 + 山相位 0
        log('1. 抓 t=0 截图（白天）');
        const t0 = await page.evaluate(() => {
            const eng = window.gameEngine;
            return {
                gameTime: eng.gameTime,
                clouds: eng.currentScene.clouds ? eng.currentScene.clouds.length : 0,
                phases: eng.currentScene.mountainPhases ? [...eng.currentScene.mountainPhases] : null
            };
        });
        log(`   状态: ${JSON.stringify(t0)}`);
        if (t0.clouds !== 4) throw new Error(`FAIL: 应有 4 朵云，实际 ${t0.clouds}`);
        if (!t0.phases || t0.phases.length !== 3) throw new Error(`FAIL: 应有 3 层山 phase`);
        await page.screenshot({ path: path.join(__dirname, 'road-v10-t0.png') });
        log('   ✓ t0 截图');

        // 2. 等 2s 看云移动 + 山相位推进
        log('2. 等 2s 后查 cloud 位置变化');
        await page.waitForTimeout(2000);
        const t1 = await page.evaluate(() => {
            const eng = window.gameEngine;
            return {
                gameTime: eng.gameTime,
                clouds: eng.currentScene.clouds.map(c => c.x.toFixed(3)),
                phases: eng.currentScene.mountainPhases.map(p => p.toFixed(3))
            };
        });
        log(`   状态: ${JSON.stringify(t1)}`);
        if (t1.gameTime - t0.gameTime < 1.5) {
            throw new Error(`FAIL: 时间应推进，实际 ${t1.gameTime - t0.gameTime}`);
        }
        await page.screenshot({ path: path.join(__dirname, 'road-v10-t1.png') });
        log('   ✓ t1 截图');

        // 3. 强制跳到 15s（黄昏）→ 45s（夜晚）→ 截图对比
        log('3. 跳到 gameTime=15s（黄昏）');
        await page.evaluate(() => {
            window.gameEngine.gameTime = 15;
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(__dirname, 'road-v10-dusk.png') });
        log('   ✓ 黄昏截图');

        log('4. 跳到 gameTime=40s（夜晚）');
        await page.evaluate(() => {
            window.gameEngine.gameTime = 40;
        });
        await page.waitForTimeout(500);
        const nightState = await page.evaluate(() => {
            const eng = window.gameEngine;
            return { gameTime: eng.gameTime, dayPhase: (eng.gameTime % 60) / 60 };
        });
        log(`   状态: ${JSON.stringify(nightState)}`);
        await page.screenshot({ path: path.join(__dirname, 'road-v10-night.png') });
        log('   ✓ 夜晚截图');

        // 4. 验证山的 phase 在每个时刻都推进了
        log('5. 验证山相位累计推进');
        await page.evaluate(() => { window.gameEngine.gameTime = 0; });
        await page.waitForTimeout(1500);
        const t2 = await page.evaluate(() => {
            const eng = window.gameEngine;
            return { phases: eng.currentScene.mountainPhases.map(p => p.toFixed(3)) };
        });
        log(`   t=1.5s 后 phases: ${JSON.stringify(t2)}`);
        if (parseFloat(t2.phases[2]) <= parseFloat(t0.phases[2])) {
            throw new Error(`FAIL: 近山相位应推进，t0=${t0.phases[2]} t2=${t2.phases[2]}`);
        }
        log('   ✓ 山相位累计推进');

        // 5. 验证抬头加速 → 云和山都快
        log('6. 验证 pitch 抬头 → 山和云都加速');
        await page.evaluate(() => {
            window.state.useGyroscope = true;
            window.state.pitch = -0.8;  // 大幅仰头
            window.state.yaw = 0;
            window.state.roll = 0;
        });
        const beforeFast = await page.evaluate(() => [...window.gameEngine.currentScene.mountainPhases]);
        await page.waitForTimeout(1000);
        const afterFast = await page.evaluate(() => [...window.gameEngine.currentScene.mountainPhases]);
        const advanceFast = afterFast.map((p, i) => parseFloat((p - beforeFast[i]).toFixed(3)));
        log(`   1s 抬头状态下相位推进: ${JSON.stringify(advanceFast)}`);
        if (advanceFast[2] < 0.05) {
            throw new Error(`FAIL: 抬头 1s 后近山相位应推进 > 0.05，实际 ${advanceFast[2]}`);
        }
        log('   ✓ 抬头加速时远景动得更快');

        // 6. 关闭
        log('7. 重置 + 截图最终态');
        await page.evaluate(() => {
            window.state.pitch = 0;
            window.gameEngine.gameTime = 8;
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(__dirname, 'road-v10-final.png') });

        log('=========================');
        log('✅ v10 远景运动全部检查通过！');
        log('=========================');
    } catch (err) {
        log('=========================');
        log(`❌ 测试失败: ${err.message}`);
        log('=========================');
        try { await page.screenshot({ path: path.join(__dirname, 'road-v10-fail.png') }); } catch { /* */ }
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
