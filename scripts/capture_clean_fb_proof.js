'use strict';

const { chromium } = require('playwright');
const path = require('path');

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://www.facebook.com/1337253129481940', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  // Close login modal if present
  try {
    const closeBtn = page.locator('div[role="dialog"] [aria-label="Đóng"], div[role="dialog"] [aria-label="Close"], div[aria-label="Đóng"]').first();
    if (await closeBtn.isVisible({ timeout: 2000 })) {
      await closeBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    // ignore
  }

  const outPath = path.resolve('D:/Facebook/data/screenshots/fb_cover_clean_proof.png');
  await page.screenshot({ path: outPath });
  await browser.close();
  console.log('Saved:', outPath);
}

capture().catch(console.error);
