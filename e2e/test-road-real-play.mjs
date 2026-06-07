// 真实游戏条件 - 模拟玩家 dodge，看 5 辆+ 车道车流密度
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(500);
    await page.click('#splash-enter');
    await page.waitForTimeout(300);
    await page.click('button.mode-btn[data-mode="game"]');
    await page.waitForTimeout(500);
    await page.click('button.mode-btn[data-mode="road"]');
    await page.waitForTimeout(300);
    await page.click('#start-game-btn');

    // 等 4 秒，spawn 出 4-5 辆车
    await page.waitForTimeout(4000);

    // 模拟玩家 dodge - 在 lane 1/3/5 之间循环转
    for (let i = 0; i < 6; i++) {
        const targetYaw = i % 2 === 0 ? -25 : 25;
        await page.evaluate((yaw) => {
            if (window.state) {
                window.state.yaw = yaw;
            }
        }, targetYaw);
        await page.waitForTimeout(700);
    }

    const info = await page.evaluate(() => {
        const eng = window.gameEngine;
        const scene = eng?.currentScene;
        return {
            obstacleCount: eng?.obstacles?.length,
            obstaclePositions: eng?.obstacles?.map(o => ({ x: o.x, y: o.y, type: o.type })),
            health: eng?.health,
            state: eng?.state,
            gameTime: eng?.gameTime,
        };
    });
    console.log('dodge 中状态:', JSON.stringify(info, null, 2));

    await page.screenshot({ path: path.join(__dirname, 'road-real-8s.png') });
    console.log('截图: e2e/road-real-8s.png');

    // 再继续 dodge 4 秒
    for (let i = 0; i < 6; i++) {
        const targetYaw = i % 2 === 0 ? 25 : -25;
        await page.evaluate((yaw) => {
            if (window.state) {
                window.state.yaw = yaw;
            }
        }, targetYaw);
        await page.waitForTimeout(700);
    }

    const info2 = await page.evaluate(() => {
        const eng = window.gameEngine;
        return {
            obstacleCount: eng?.obstacles?.length,
            obstaclePositions: eng?.obstacles?.map(o => ({ x: o.x, y: o.y, type: o.type })),
            health: eng?.health,
            state: eng?.state,
            gameTime: eng?.gameTime,
        };
    });
    console.log('dodge 8s 后:', JSON.stringify(info2, null, 2));
    await page.screenshot({ path: path.join(__dirname, 'road-real-12s.png') });
    console.log('截图: e2e/road-real-12s.png');

    await browser.close();
})();
