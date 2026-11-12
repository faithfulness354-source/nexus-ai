import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';

const BASE = process.env.KIDVERSE_URL || 'http://localhost:8081';

async function main() {
  const browser = await chromium.launch({
    executablePath: '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  const bodyText = await page.locator('body').innerText();
  const checks = {
    brand: bodyText.includes('KidVerse AI'),
    sunny: bodyText.includes('Sunny'),
    comet: bodyText.includes('Comet'),
    nova: bodyText.includes('Nova'),
  };

  await page.screenshot({ path: '/tmp/kv-launcher.png', fullPage: true });

  // Click Sunny profile
  await page.getByText('Sunny', { exact: true }).click();
  await page.waitForTimeout(1200);
  const realmText = await page.locator('body').innerText();
  checks.storyHub = realmText.includes('StorySprout');
  await page.screenshot({ path: '/tmp/kv-story-hub.png', fullPage: true });

  // Start first world
  const world = page.getByText('Sunny Meadow Trail');
  if (await world.count()) {
    await world.click();
    await page.waitForTimeout(2000);
  }
  const playText = await page.locator('body').innerText();
  checks.play =
    playText.includes('Tap to talk') ||
    playText.includes('Read aloud') ||
    playText.includes('Glowbug') ||
    playText.includes('meadow');
  await page.screenshot({ path: '/tmp/kv-play.png', fullPage: true });

  // Parent gate via home
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByText('Parent', { exact: true }).click();
  await page.waitForTimeout(800);
  const gateVisible = await page.getByText('Parent Gate').count();
  checks.parentGate = gateVisible > 0;
  if (checks.parentGate) {
    await page.locator('input').fill('1234');
    await page.getByText('Unlock', { exact: true }).click();
    await page.waitForTimeout(1200);
    const parentText = await page.locator('body').innerText();
    checks.parentDash = parentText.includes('Parent Dashboard') || parentText.includes('Zero-PII');
    await page.screenshot({ path: '/tmp/kv-parent.png', fullPage: true });
  }

  writeFileSync('/tmp/kv-smoke.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
  await browser.close();

  const failed = Object.entries(checks).filter(([, v]) => !v);
  if (failed.length || errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
