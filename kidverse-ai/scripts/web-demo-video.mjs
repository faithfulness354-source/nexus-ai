import { chromium } from 'playwright-core';

const BASE = process.env.KIDVERSE_URL || 'http://localhost:8081';

async function main() {
  const browser = await chromium.launch({
    executablePath: '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: '/tmp/kv-video', size: { width: 1280, height: 900 } },
  });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);

  await page.getByText('Sunny', { exact: true }).click();
  await page.waitForTimeout(1000);
  await page.getByText('Sunny Meadow Trail').click();
  await page.waitForTimeout(2500);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByText('Comet', { exact: true }).click();
  await page.waitForTimeout(1200);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.getByText('Parent', { exact: true }).click();
  await page.waitForTimeout(600);
  await page.locator('input').fill('1234');
  await page.getByText('Unlock', { exact: true }).click();
  await page.waitForTimeout(1800);

  await context.close();
  await browser.close();
  console.log('video recorded under /tmp/kv-video');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
