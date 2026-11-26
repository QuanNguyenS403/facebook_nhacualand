const pm = require('../services/playwright_manager');
const fs = require('fs');
const path = require('path');

async function cleanInstagram(page) {
  console.log('\n--- [1] Checking Instagram (@nhacualand) ---');
  try {
    await page.goto('https://www.instagram.com/nhacualand/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const postLinks = await page.locator('a[href*="/reel/"], a[href*="/p/"]').all();
    console.log(`Found ${postLinks.length} posts on Instagram profile.`);

    if (postLinks.length > 0) {
      // Click the first post
      await postLinks[0].click();
      await page.waitForTimeout(3000);

      // Check caption or content
      const dialog = page.locator('div[role="dialog"]').first();
      const text = await dialog.innerText().catch(() => '');
      console.log('Dialog snippet:', text.slice(0, 100).replace(/\n/g, ' '));

      if (text.includes('Đi cày cả ngày') || text.includes('ban công') || text.includes('phòng sạch')) {
        console.log('Black reel detected! Proceeding to delete...');
        
        // Find options (...) button
        const moreBtn = dialog.locator('svg[aria-label*="Tùy chọn"], svg[aria-label*="Options"], svg[aria-label*="More"]').first();
        if (await moreBtn.isVisible().catch(() => false)) {
          await moreBtn.click();
        } else {
          // Fallback to button with svg
          const btns = dialog.locator('div[role="button"]:has(svg), button:has(svg)');
          await btns.nth(1).click();
        }
        await page.waitForTimeout(2000);

        // Click Delete button in action sheet
        const delOption = page.locator('button').filter({ hasText: /^Xóa$|^Delete$/i }).first();
        if (await delOption.isVisible().catch(() => false)) {
          console.log('Clicking action menu "Xóa"...');
          await delOption.click();
          await page.waitForTimeout(2000);

          // Confirmation dialog appears (topmost dialog)
          const confirmDialog = page.locator('div[role="dialog"]').last();
          const confirmBtn = confirmDialog.locator('button').filter({ hasText: /^Xóa$|^Delete$/i }).first();
          if (await confirmBtn.isVisible().catch(() => false)) {
            console.log('Clicking confirm "Xóa"...');
            await confirmBtn.click();
            await page.waitForTimeout(4000);
            console.log('Instagram post deleted successfully!');
          }
        }
      } else {
        console.log('Post does not match black reel text. Leaving as is.');
        await page.keyboard.press('Escape');
      }
    }
  } catch (err) {
    console.error('Error cleaning Instagram:', err.message);
  }
}

async function cleanThreads(page) {
  console.log('\n--- [2] Checking Threads (@nhacualand) ---');
  try {
    await page.goto('https://www.threads.com/@nhacualand', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Look for posts containing the text
    const posts = await page.locator('div[data-pressable-container="true"], article, div[role="article"]').all();
    console.log(`Found ${posts.length} thread containers.`);

    let deleted = false;
    for (const post of posts) {
      const text = await post.innerText().catch(() => '');
      if (text.includes('Đi cày cả ngày') || text.includes('phòng sạch sẽ ngập nắng')) {
        console.log('Target thread post found! Snippet:', text.slice(0, 60));
        // Find 3 dots menu inside this post
        const moreBtn = post.locator('div[role="button"]:has(svg), button:has(svg)').last();
        await moreBtn.click();
        await page.waitForTimeout(2000);

        // Click Xóa / Delete
        const delMenu = page.locator('div[role="menuitem"], button, div[role="button"]').filter({ hasText: /^Xóa$|^Delete$/i }).first();
        if (await delMenu.isVisible().catch(() => false)) {
          console.log('Clicking menu "Xóa"...');
          await delMenu.click();
          await page.waitForTimeout(2000);

          // Confirmation popup
          const confirmBtn = page.locator('div[role="dialog"] button, div[role="button"]').filter({ hasText: /^Xóa$|^Delete$/i }).last();
          if (await confirmBtn.isVisible().catch(() => false)) {
            console.log('Confirming delete on Threads...');
            await confirmBtn.click();
            await page.waitForTimeout(3000);
            console.log('Threads post deleted successfully!');
            deleted = true;
            break;
          }
        }
      }
    }
    if (!deleted) {
      console.log('No matching black post found on Threads or already deleted.');
    }
  } catch (err) {
    console.error('Error cleaning Threads:', err.message);
  }
}

async function cleanFacebook(page) {
  console.log('\n--- [3] Checking Facebook Page ---');
  try {
    await page.goto('https://www.facebook.com/nhacualand', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Look for posts containing the text
    const postLocator = page.locator('div[role="feed"] div[role="article"], div[data-ad-preview="message"]');
    const count = await postLocator.count();
    console.log(`Facebook feed items: ${count}`);

    const bodyText = await page.innerText('body');
    if (bodyText.includes('Đi cày cả ngày')) {
      console.log('Detected black reel text on Facebook Page body!');
      // Find the specific post article
      const articles = await page.locator('div[role="article"]').all();
      for (const article of articles) {
        const text = await article.innerText().catch(() => '');
        if (text.includes('Đi cày cả ngày')) {
          console.log('Found article! Looking for action menu...');
          const moreBtn = article.locator('div[aria-label*="Hành động"], div[aria-label*="Actions"], div[aria-label*="Khác"], div[aria-haspopup="menu"]').first();
          if (await moreBtn.isVisible().catch(() => false)) {
            await moreBtn.click();
            await page.waitForTimeout(2000);
            const delItem = page.locator('div[role="menuitem"]').filter({ hasText: /Chuyển vào thùng rác|Xóa|Delete|Move to trash/i }).first();
            if (await delItem.isVisible().catch(() => false)) {
              console.log('Clicking move to trash / delete on FB...');
              await delItem.click();
              await page.waitForTimeout(2000);
              const confirmBtn = page.locator('div[role="dialog"] div[aria-label*="Chuyển"], div[role="dialog"] div[aria-label*="Xóa"], div[role="dialog"] button').filter({ hasText: /Chuyển|Xóa|Move|Delete/i }).first();
              if (await confirmBtn.isVisible().catch(() => false)) {
                await confirmBtn.click();
                await page.waitForTimeout(3000);
                console.log('Facebook black reel moved to trash!');
              }
            }
          }
          break;
        }
      }
    } else {
      console.log('No matching black post found on Facebook feed.');
    }
  } catch (err) {
    console.error('Error cleaning Facebook:', err.message);
  }
}

(async () => {
  const ctx = await pm.getContext({ headless: true });
  const page = await pm.newPage(ctx.context);
  try {
    await cleanInstagram(page);
    await cleanThreads(page);
    await cleanFacebook(page);
  } finally {
    await page.close();
    await pm.closeContext(ctx);
  }
})();
