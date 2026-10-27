// Captures before/after screenshots for the client report into reports/evidence/.
// "Before fix" shots replay the original app (backup/app.js.orig) by routing /app.js to it.
// Usage: node reports/capture-evidence.js   (starts and stops its own server)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, 'evidence');
const originalApp = path.join(root, 'backup', 'app.js.orig');
const baseURL = 'http://127.0.0.1:3000';

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(baseURL)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Mock DCS server did not start');
}

async function journeyToBoarded(page) {
  await page.getByTestId('lookup-button').click();
  await page.getByTestId('complete-checkin').click();
  await page.getByTestId('seat-12a').click();
  await page.getByTestId('baggage-weight').fill('20');
  await page.getByTestId('validate-baggage').click();
  await page.getByTestId('generate-boarding-pass').click();
  await page.getByTestId('board-passenger').click();
}

// DCS-001 repro: regenerate the boarding pass after boarding, then board again.
async function duplicateBoardingAttempt(page) {
  await journeyToBoarded(page);
  await page.getByTestId('generate-boarding-pass').click();
  await page.getByTestId('board-passenger').click();
}

async function shot(browser, name, { useOriginalApp = false } = {}, steps) {
  const page = await browser.newPage({ viewport: { width: 620, height: 1400 }, deviceScaleFactor: 2 });
  if (useOriginalApp) await page.route('**/app.js', (route) => route.fulfill({ path: originalApp, contentType: 'text/javascript' }));
  await page.goto(baseURL);
  await steps(page);
  await page.locator('#boarding-panel').screenshot({ path: path.join(outDir, `${name}.png`) });
  await page.close();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const server = spawn(process.execPath, ['server.js'], { cwd: root, stdio: 'ignore' });
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 620, height: 1400 }, deviceScaleFactor: 2 });
    await page.goto(baseURL);
    await journeyToBoarded(page);
    await page.locator('#boarding-pass-panel').screenshot({ path: path.join(outDir, 'happy-path-boarding-pass.png') });
    await page.close();

    await shot(browser, 'dcs-001-before-fix', { useOriginalApp: true }, duplicateBoardingAttempt);
    await shot(browser, 'dcs-001-after-fix', {}, duplicateBoardingAttempt);
    await browser.close();
    console.log(`Evidence saved to ${outDir}`);
  } finally {
    server.kill();
  }
})().catch((err) => { console.error(err); process.exit(1); });
