'use strict';

require('../lib/env-loader');
const playwrightManager = require('../services/playwright_manager');

async function checkProfiles() {
  const sessionCtx = await playwrightManager.getContext({ headless: true });
  const page = await playwrightManager.newPage(sessionCtx.context);
  try {
    await page.goto('https://www.facebook.com/pages/?category=your_pages', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const snap = await playwrightManager.extractSemanticTree(page);
    console.log(snap.slice(0, 2000));
  } finally {
    await page.close().catch(() => {});
    await playwrightManager.closeContext(sessionCtx);
  }
}

checkProfiles().catch(console.error);
