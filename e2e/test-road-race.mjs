// ============================================================
// E2E Test: 公路赛车 (Road Race) - RED phase
// 验证入口/场景/控制/HUD/碰撞全链路
// ============================================================

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:5173';

const log = (msg) => console.log(`[road-race] ${msg}`);

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    // 收集 console 错误
    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

    try {
        log('1. 打开首页');
        await page.goto(BASE_URL);
        await page.waitForTimeout(500);

        log('2. 关闭 splash');
        await page.click('#splash-enter');
        await page.waitForTimeout(300);

        log('3. 进入康复游戏模式');
        await page.click('button.mode-btn[data-mode="game"]');
        await page.waitForTimeout(500);

        log('4. 验证 game-select-panel 出现');
        const panelVisible = await page.locator('#game-select-panel').isVisible();
        if (!panelVisible) {
            throw new Error('FAIL: game-select-panel 未显示');
        }
        log('   ✓ game-select-panel 可见');

        log('5. 查找 🏎️ 公路赛车 模式按钮 (RED - 当前应失败)');
        const roadBtn = page.locator('button.mode-btn[data-mode="road"]');
        const roadBtnCount = await roadBtn.count();
        if (roadBtnCount === 0) {
            throw new Error('FAIL (RED ✓): 找不到 data-mode="road" 的模式按钮');
        }
        log(`   ✓ 找到 ${roadBtnCount} 个 road 模式按钮`);

        log('6. 点击 🏎️ 公路赛车 模式');
        await roadBtn.first().click();
        await page.waitForTimeout(300);

        log('7. 验证 start 按钮存在');
        const startBtn = page.locator('#start-game-btn');
        if ((await startBtn.count()) === 0) {
            throw new Error('FAIL: 找不到 #start-game-btn');
        }

        log('8. 启动游戏');
        await startBtn.click();
        await page.waitForTimeout(2500);

        log('9. 验证 GameEngine 处于 road 模式');
        const engineState = await page.evaluate(() => {
            const eng = window.gameEngine;
            if (!eng) return { error: 'window.gameEngine 不存在' };
            return {
                sceneType: eng.currentScene && eng.currentScene.sceneType,
                roadMode: eng._roadMode === true,
                maxHealth: eng.maxHealth,
                health: eng.health,
                motionMode: eng.input ? eng.input.getMotionMode() : null
            };
        });
        log(`   engine 状态: ${JSON.stringify(engineState)}`);

        if (engineState.error) throw new Error(`FAIL: ${engineState.error}`);
        if (engineState.sceneType !== 'road') {
            throw new Error(`FAIL: sceneType 应为 'road'，实际 '${engineState.sceneType}'`);
        }
        if (engineState.roadMode !== true) {
            throw new Error(`FAIL: engine._roadMode 应为 true`);
        }
        if (engineState.maxHealth !== 3) {
            throw new Error(`FAIL: maxHealth 应为 3，实际 ${engineState.maxHealth}`);
        }
        log('   ✓ sceneType=road, _roadMode=true, maxHealth=3');

        log('10. 验证 SINGLE_YAW 模式生效');
        if (!engineState.motionMode || !engineState.motionMode.toUpperCase().includes('SINGLE_YAW')) {
            throw new Error(`FAIL: motionMode 应为 SINGLE_YAW，实际 '${engineState.motionMode}'`);
        }
        log(`   ✓ motionMode=${engineState.motionMode}`);

        log('11. 验证 3 车道布局（lanes 应为 [0.25, 0.5, 0.75]）');
        const laneInfo = await page.evaluate(() => {
            const eng = window.gameEngine;
            if (!eng || !eng.currentScene) return null;
            return {
                lanes: eng.currentScene.lanes,
                playerY: eng.player ? eng.player.y : null
            };
        });
        log(`   车道信息: ${JSON.stringify(laneInfo)}`);
        if (!laneInfo || !laneInfo.lanes || laneInfo.lanes.length !== 3) {
            throw new Error(`FAIL: 应有 3 车道，实际 ${laneInfo && laneInfo.lanes ? laneInfo.lanes.length : 'N/A'}`);
        }
        log('   ✓ 3 车道布局');

        log('12. 模拟 yaw 输入 → 验证 player.x 跟随变化');
        // 通过设置 state.yaw 模拟右转
        await page.evaluate(() => {
            if (window.state) {
                window.state.useGyroscope = true;
                window.state.yaw = 17.5;  // +17.5° → 0.5 + 0.5*0.5 = 0.75
                window.state.pitch = 0;
                window.state.roll = 0;
            }
        });
        await page.waitForTimeout(1500);
        const playerAfterYaw = await page.evaluate(() => {
            const eng = window.gameEngine;
            return {
                player: eng && eng.player ? { x: eng.player.x, y: eng.player.y } : null,
                useGyro: window.state ? window.state.useGyroscope : null,
                stateYaw: window.state ? window.state.yaw : null,
                engineState: eng ? eng.state : null
            };
        });
        log(`   调试信息: ${JSON.stringify(playerAfterYaw)}`);
        if (!playerAfterYaw.player || playerAfterYaw.player.x < 0.6) {
            throw new Error(`FAIL: 偏右 yaw 应让 player.x > 0.6，实际 ${playerAfterYaw.player && playerAfterYaw.player.x}`);
        }
        log('   ✓ yaw 控制有效');

        log('13. 等待 2 秒看障碍物生成');
        await page.waitForTimeout(2000);
        const obstacleInfo = await page.evaluate(() => {
            const eng = window.gameEngine;
            return eng ? { count: eng.obstacles.length, types: eng.obstacles.map(o => o.type) } : null;
        });
        log(`   障碍物: ${JSON.stringify(obstacleInfo)}`);

        log('14. 验证 HUD 显示 ❤️');
        const hudInfo = await page.evaluate(() => {
            const eng = window.gameEngine;
            return eng ? {
                state: eng.state,
                health: eng.health,
                maxHealth: eng.maxHealth
            } : null;
        });
        log(`   HUD: ${JSON.stringify(hudInfo)}`);
        if (!hudInfo || hudInfo.health < 1 || hudInfo.health > 3) {
            throw new Error(`FAIL: health 应在 1-3，实际 ${hudInfo && hudInfo.health}`);
        }
        // 重置 health 到 3 以便后续测试可控
        await page.evaluate(() => {
            const eng = window.gameEngine;
            if (eng) { eng.health = 3; eng.invincibleTime = 0; }
        });
        log('   ✓ 3 命 HUD');

        log('15. 模拟碰撞 → 验证 health 减 1');
        await page.evaluate(() => {
            const eng = window.gameEngine;
            if (eng && typeof eng.takeDamage === 'function') {
                eng.takeDamage();
            }
        });
        await page.waitForTimeout(500);
        const healthAfterHit = await page.evaluate(() => window.gameEngine ? window.gameEngine.health : null);
        log(`   撞后 health: ${healthAfterHit}`);
        if (healthAfterHit !== 2) {
            throw new Error(`FAIL: takeDamage 后 health 应为 2，实际 ${healthAfterHit}`);
        }
        log('   ✓ 扣命成功');

        log('16. 模拟连续 2 次扣命 → 验证 GAME OVER');
        await page.evaluate(() => {
            const eng = window.gameEngine;
            if (eng) {
                eng.invincibleTime = 0;  // 清空无敌帧
                eng.takeDamage();
                eng.invincibleTime = 0;
                eng.takeDamage();
            }
        });
        await page.waitForTimeout(500);
        const gameOverInfo = await page.evaluate(() => {
            const eng = window.gameEngine;
            return eng ? { state: eng.state, health: eng.health } : null;
        });
        log(`   终态: ${JSON.stringify(gameOverInfo)}`);
        if (!gameOverInfo || gameOverInfo.state.toUpperCase() !== 'GAMEOVER') {
            throw new Error(`FAIL: 3 命扣光后应进入 GAMEOVER，实际 ${gameOverInfo && gameOverInfo.state}`);
        }
        log('   ✓ GAME OVER 触发');

        log('17. 验证评级方法 getRoadGrade()');
        const grade = await page.evaluate(() => {
            const eng = window.gameEngine;
            return eng && typeof eng.getRoadGrade === 'function' ? eng.getRoadGrade() : null;
        });
        log(`   评级: ${JSON.stringify(grade)}`);
        if (!grade || !grade.grade) {
            throw new Error(`FAIL: getRoadGrade() 应返回评级对象`);
        }
        log(`   ✓ 评级: ${grade.grade} (躲避 ${grade.dodged})`);

        log('18. 截图存档');
        await page.screenshot({ path: path.join(__dirname, 'road-race-final.png') });

        log('19. 控制台错误检查');
        if (consoleErrors.length > 0) {
            log(`   ⚠️ 控制台错误 (${consoleErrors.length}):`);
            consoleErrors.slice(0, 5).forEach(e => log(`     - ${e}`));
        }

        log('=========================');
        log('✅ 全部检查通过！');
        log('=========================');
    } catch (err) {
        log('=========================');
        log(`❌ 测试失败: ${err.message}`);
        log('=========================');
        // 失败截图
        try {
            await page.screenshot({ path: path.join(__dirname, 'road-race-fail.png') });
            log('失败截图: e2e/road-race-fail.png');
        } catch { /* ignore */ }
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
