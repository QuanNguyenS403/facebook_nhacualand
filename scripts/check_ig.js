'use strict';

require('../lib/env-loader');
const playwrightManager = require('../services/playwright_manager');

async function checkIg() {
  const sessionCtx = await playwrightManager.getContext({ headless: true });
  const page = await playwrightManager.newPage(sessionCtx.context);
  try {
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);
    console.log('Instagram Title:', await page.title(), '| URL:', page.url());
    const snap = await playwrightManager.extractSemanticTree(page);
    console.log(snap.slice(0, 1500));
  } finally {
    await page.close().catch(() => {});
    await playwrightManager.closeContext(sessionCtx);
  }
}

checkIg().catch(console.error);
