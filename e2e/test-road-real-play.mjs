// 真实游戏条件 - 不 force-spawn，看实际生成
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

    // 等 8 秒，跨过 1-2 个 spawn 周期
    await page.waitForTimeout(8000);

    const info = await page.evaluate(() => {
        const eng = window.gameEngine;
        const scene = eng?.currentScene;
        return {
            obstacleCount: eng?.obstacles?.length,
            obstaclePositions: eng?.obstacles?.map(o => ({ x: o.x, y: o.y, type: o.type })),
            lanes: scene?.lanes,
            gameTime: eng?.gameTime,
            level: eng?.difficulty?.getCurrentLevel(),
            difficultyConfig: eng?.difficulty?.getCurrentConfig(),
            lastSpawnTime: scene?.lastSpawnTime,
            sceneGameTime: scene?.gameTime,
        };
    });
    console.log('真实游戏 8s 后状态:', JSON.stringify(info, null, 2));

    await page.screenshot({ path: path.join(__dirname, 'road-real-8s.png') });
    console.log('截图: e2e/road-real-8s.png');

    // 再等 4 秒看 spawn 节奏
    await page.waitForTimeout(4000);
    const info2 = await page.evaluate(() => ({
        obstacleCount: window.gameEngine?.obstacles?.length,
        obstaclePositions: window.gameEngine?.obstacles?.map(o => ({ x: o.x, y: o.y, type: o.type })),
    }));
    console.log('12s 后:', JSON.stringify(info2, null, 2));
    await page.screenshot({ path: path.join(__dirname, 'road-real-12s.png') });
    console.log('截图: e2e/road-real-12s.png');

    await browser.close();
})();
