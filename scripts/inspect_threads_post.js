const pm = require('../services/playwright_manager');

(async () => {
  const ctx = await pm.getContext({ headless: true });
  const page = await pm.newPage(ctx.context);
  try {
    await page.goto('https://www.threads.com/@nhacualand/post/DfbwcPyD9TA', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'D:/Facebook/data/screenshots/threads_inspect_post.png' });
    console.log('Saved screenshot of post page.');

    const buttons = await page.locator('div[role="button"], button').evaluateAll(els => 
      els.map(el => ({
        text: el.innerText.trim(),
        aria: el.getAttribute('aria-label'),
        svgAria: el.querySelector('svg')?.getAttribute('aria-label')
      })).filter(x => x.text || x.aria || x.svgAria)
    );
    console.log('Interactive elements:', JSON.stringify(buttons, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await page.close();
    await pm.closeContext(ctx);
  }
})();
