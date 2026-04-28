const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleMessages = [];
  const errors = [];

  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  console.log('Opening http://localhost:3002...');
  await page.goto('http://localhost:3002', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Page loaded.');

  // Take initial screenshot
  await page.screenshot({ path: 'C:/Users/Lenovo/cervical-spine-rehab-game/test-screenshots/01-initial.png' });

  // Click "康复游戏" button
  const rehabButton = page.locator('button:has-text("康复游戏")');
  const buttonCount = await rehabButton.count();
  console.log(`Found ${buttonCount} "康复游戏" button(s)`);

  if (buttonCount > 0) {
    await rehabButton.first().click();
    console.log('Clicked "康复游戏" button');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'C:/Users/Lenovo/cervical-spine-rehab-game/test-screenshots/02-after-click.png' });

    // Check for game select panel
    const gameSelectPanel = page.locator('#game-select-panel, .game-select-panel, [id*="game"][id*="select"]');
    const panelVisible = await gameSelectPanel.isVisible().catch(() => false);
    console.log(`Game select panel visible: ${panelVisible}`);

    // Check for canvas
    const canvases = page.locator('canvas');
    const canvasCount = await canvases.count();
    console.log(`Found ${canvasCount} canvas element(s)`);

    if (canvasCount > 0) {
      const canvasVisible = await canvases.first().isVisible();
      console.log(`Canvas visible: ${canvasVisible}`);
    }

    // Check for scene buttons (太空/公路/接球)
    const spaceButton = page.locator('button:has-text("太空")');
    const roadButton = page.locator('button:has-text("公路")');
    const catchButton = page.locator('button:has-text("接球")');
    console.log(`Space button: ${await spaceButton.count() > 0}`);
    console.log(`Road button: ${await roadButton.count() > 0}`);
    console.log(`Catch button: ${await catchButton.count() > 0}`);

    await page.screenshot({ path: 'C:/Users/Lenovo/cervical-spine-rehab-game/test-screenshots/03-game-panel.png' });
  }

  console.log('\n--- Console Messages ---');
  consoleMessages.forEach(m => console.log(`[${m.type}] ${m.text}`));

  console.log('\n--- Errors ---');
  errors.forEach(e => console.log(`ERROR: ${e}`));

  await browser.close();
})();
