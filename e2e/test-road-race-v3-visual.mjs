// v3 视觉验证：强制 spawn 多辆障碍车 + 等待尾气累积
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
    await page.waitForTimeout(800);

    // 强制 spawn 5 辆车，分布在不同车道、不同 y 位置
    await page.evaluate(() => {
        if (window.state) {
            window.state.yaw = 0;
            window.state.pitch = 0;
        }
        const eng = window.gameEngine;
        if (eng) {
            eng.player.x = 0.5;
            eng.player.y = 0.85;

            const scene = eng.currentScene;
            if (scene && scene.spawnObstacle) {
                // 5 辆车分散在屏幕
                const positions = [
                    { lane: 0, y: 0.15 },
                    { lane: 1, y: 0.35 },
                    { lane: 3, y: 0.25 },
                    { lane: 4, y: 0.5 },
                    { lane: 2, y: 0.6 }
                ];
                for (const pos of positions) {
                    const ob = scene.spawnObstacle();
                    ob.x = scene.lanes[pos.lane];
                    ob.y = pos.y;
                    eng.obstacles.push(ob);
                }
            }
        }
    });

    // 等 0.8 秒让尾气累积，但车不至于全跑掉
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(__dirname, 'road-v3-traffic.png') });
    console.log('截图: e2e/road-v3-traffic.png');

    // 再等 0.5 秒拍第二张
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(__dirname, 'road-v3-traffic-2.png') });
    console.log('截图: e2e/road-v3-traffic-2.png');

    await browser.close();
})();
