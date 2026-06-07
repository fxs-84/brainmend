// 公路赛车 - 障碍车同框截图
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

    // 等 2.5 秒 - 此时 spawn 的车还在路上
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
        if (window.state) {
            window.state.yaw = 0;
            window.state.pitch = 0;
        }
        const eng = window.gameEngine;
        if (eng) {
            eng.player.x = 0.5;
            eng.player.y = 0.78;
        }
    });
    await page.waitForTimeout(150);

    await page.screenshot({ path: path.join(__dirname, 'road-traffic.png') });
    console.log('截图: e2e/road-traffic.png');
    await browser.close();
})();
