const pm = require('../services/playwright_manager');

(async () => {
  const ctx = await pm.getContext({ headless: true });
  const page = await pm.newPage(ctx.context);
  try {
    console.log('Navigating to https://www.threads.com/@nhacualand ...');
    await page.goto('https://www.threads.com/@nhacualand', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Look for posts
    const postLinks = await page.locator('a[href*="/post/"]').all();
    console.log(`Found ${postLinks.length} post links.`);

    for (const link of postLinks) {
      const href = await link.getAttribute('href');
      console.log('Inspecting post:', href);
      if (href) {
        const fullUrl = href.startsWith('http') ? href : `https://www.threads.com${href}`;
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);

        const body = await page.innerText('body');
        if (body.includes('Đi cày cả ngày') || body.includes('phòng sạch')) {
          console.log('Target post confirmed! Looking for action menu...');
          
          // Action button (3 dots) on Threads post page
          const moreBtn = page.locator('svg[aria-label*="Xem thêm"], svg[aria-label*="More"], svg[aria-label*="Tùy chọn"]').first();
          if (await moreBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await moreBtn.click({ force: true });
          } else {
            // Find any 3 dots button near top right of the thread
            const btns = page.locator('div[role="button"]:has(svg)');
            const count = await btns.count();
            for (let i = 0; i < count; i++) {
              const b = btns.nth(i);
              const svg = b.locator('svg');
              if (await svg.isVisible().catch(() => false)) {
                await b.click({ force: true });
                await page.waitForTimeout(1000);
                const menu = page.locator('div[role="menuitem"], div[role="menu"]');
                if (await menu.isVisible().catch(() => false)) break;
              }
            }
          }
          await page.waitForTimeout(2000);

          const delOption = page.locator('div[role="menuitem"], button, div[role="button"]').filter({ hasText: /^Xóa$|^Delete$/i }).first();
          if (await delOption.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('Clicking Xóa in menu...');
            await delOption.click({ force: true });
            await page.waitForTimeout(2000);

            const confirmBtn = page.locator('div[role="dialog"] button, div[role="dialog"] div[role="button"]').filter({ hasText: /^Xóa$|^Delete$/i }).last();
            if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
              console.log('Confirming delete on Threads...');
              await confirmBtn.click({ force: true });
              await page.waitForTimeout(4000);
              console.log('Successfully deleted target post from Threads!');
            }
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await page.close();
    await pm.closeContext(ctx);
  }
})();
