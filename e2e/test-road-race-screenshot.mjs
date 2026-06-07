// 公路赛车 - 干净画面截图（无 game over overlay）
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
    await page.waitForTimeout(1500);

    // 把 yaw 拉到中间 + 暂停 spawn 以拍干净画面
    await page.evaluate(() => {
        if (window.state) {
            window.state.yaw = 0;
            window.state.pitch = 0;
            window.state.roll = 0;
        }
        const eng = window.gameEngine;
        if (eng && eng.currentScene) {
            // 把玩家放中间车道
            eng.player.x = 0.5;
            eng.player.y = 0.85;
        }
    });
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(__dirname, 'road-gameplay.png') });
    console.log('截图已保存: e2e/road-gameplay.png');
    await browser.close();
})();
