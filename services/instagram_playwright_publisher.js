'use strict';

/**
 * INSTAGRAM PLAYWRIGHT AUTONOMOUS PUBLISHER
 * Thương hiệu: Nhà Của Land (nhacualand.com) — Chỉ duy nhất tại D:\Facebook
 *
 * Tự động hóa 100% đăng Ảnh (4:5 / 1:1), Carousel & Reels (9:16 MP4) lên Instagram (@nhacualand):
 * - Brand Asset Guard: Kiểm tra đúng tài khoản Instagram @nhacualand trước khi đăng để bảo vệ phân lập thương hiệu.
 * - Tự động mở hộp thoại Create / Tạo bài viết mới, tải file ảnh/video từ ổ đĩa cục bộ, xử lý bước Cắt (Original),
 *   Tiếp (Next), nhập Caption với nhịp gõ tự nhiên và bấm Chia sẻ (Share).
 * - Lưu ảnh chụp màn hình bằng chứng tại `D:\Facebook\data\screenshots\ig_proof_{timestamp}.png`.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const playwrightManager = require('./playwright_manager');
const { checkPublishRateLimit, recordPublishEvent } = require('../lib/governance');

class InstagramPlaywrightPublisher {
  constructor() {
    this.screenshotDir = path.resolve('D:/Facebook/data/screenshots');
    this.instagramUrl = 'https://www.instagram.com/';
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  async humanDelay(minMs = 800, maxMs = 2000) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(r => setTimeout(r, delay));
  }

  /**
   * Kiểm tra tài khoản Instagram đang đăng nhập trong trình duyệt
   */
  async verifyLoggedInHandle(page) {
    const expected = (process.env.BRAND_INSTAGRAM || 'nhacualand').toLowerCase().replace(/^@/, '');
    const profileHrefs = await page.locator('a[href]').evaluateAll(els =>
      els.map(e => ({
        href: e.getAttribute('href'),
        text: (e.innerText || e.getAttribute('aria-label') || '').toLowerCase()
      }))
      .filter(x => x.href && /^\/[a-zA-Z0-9._]+\/$/.test(x.href) && !['/explore/', '/reels/', '/direct/', '/popular/'].includes(x.href))
    ).catch(() => []);

    // Href đầu tiên trên thanh điều hướng bên trái của Instagram Web chính là trang cá nhân đang đăng nhập
    const navSelf = profileHrefs.find(x => x.text.includes('trang cá nhân') || x.text.includes('profile')) || profileHrefs[0];
    const detectedHandle = navSelf ? navSelf.href.replace(/\//g, '').toLowerCase() : null;

    return {
      expected,
      detectedHandle,
      matched: detectedHandle === expected
    };
  }

  async publish({
    contentType = 'photo',
    message = '',
    mediaPath = null,
    spaceArchetype = null,
    force = false,
    headless = process.env.PLAYWRIGHT_HEADLESS !== 'false'
  }) {
    console.log('================================================================');
    console.log('📸 [INSTAGRAM PUBLISHER] XUẤT BẢN TỰ ĐỘNG INSTAGRAM NHÀ CỦA LAND');
    console.log('================================================================');

    if (!mediaPath || !fs.existsSync(mediaPath)) {
      return {
        success: false,
        platform: 'instagram',
        error: 'Instagram yêu cầu bắt buộc phải có file Ảnh hoặc Video Reels hợp lệ.'
      };
    }

    if (!force) {
      const rateCheck = checkPublishRateLimit('instagram');
      if (!rateCheck.allowed) {
        console.warn(`🛑 RATE LIMIT INSTAGRAM: ${rateCheck.reason}`);
        return {
          success: false,
          platform: 'instagram',
          blockedBySafetyPolicy: true,
          reason: rateCheck.reason
        };
      }
    }

    const timestamp = Date.now();
    const proofScreenshot = path.join(this.screenshotDir, `ig_proof_${timestamp}.png`);
    const sessionCtx = await playwrightManager.getContext({ headless });

    let page = null;
    const results = {
      success: false,
      platform: 'instagram',
      contentType,
      mediaPath,
      proofScreenshot: null,
      timestamp: new Date().toISOString()
    };

    try {
      page = await playwrightManager.newPage(sessionCtx.context);

      console.log('1️⃣  Đang mở Instagram Web (instagram.com)...');
      await page.goto(this.instagramUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.locator(
        'svg[aria-label="Bài viết mới"], svg[aria-label="New post"], svg[aria-label="Tạo"], svg[aria-label="Create"], input[name="username"]'
      ).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      await this.humanDelay(1500, 2500);

      const isLoginPage = page.url().includes('accounts/login') ||
        (await page.locator('input[name="username"]').count()) > 0;
      if (isLoginPage) {
        await page.screenshot({ path: proofScreenshot }).catch(() => {});
        throw new Error('Instagram chưa đăng nhập trong Profile 38. Chạy "npm run social:session" 1 lần để đăng nhập @nhacualand.');
      }

      // Đóng popup thông báo nếu xuất hiện
      const notNowBtn = page.locator('button:has-text("Lúc khác"), button:has-text("Not Now")').first();
      if (await notNowBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await notNowBtn.click().catch(() => {});
        await this.humanDelay(600, 1000);
      }

      // Kiểm tra Brand Asset Guard
      if (process.env.STRICT_BRAND_ASSET_GUARD !== 'false') {
        const handleCheck = await this.verifyLoggedInHandle(page);
        if (!handleCheck.matched) {
          await page.screenshot({ path: proofScreenshot }).catch(() => {});
          results.proofScreenshot = proofScreenshot;
          results.blockedByBrandAssetGuard = true;
          results.detectedHandle = handleCheck.detectedHandle;
          results.reason = `Brand Asset Guard: Instagram đang đăng nhập tài khoản "@${handleCheck.detectedHandle || 'unknown'}", khác với "@${handleCheck.expected}". Đã chặn tự động để bảo vệ cô lập thương hiệu.`;
          console.warn(`🛡️ ${results.reason}`);
          return results;
        }
      }

      // 2. Bấm nút Tạo / Create (+)
      console.log('2️⃣  Đang mở hộp thoại Tạo bài viết / Reels mới trên Instagram...');
      const createBtn = page.locator(
        'svg[aria-label="Bài viết mới"], svg[aria-label="New post"], svg[aria-label="Tạo"], svg[aria-label="Create"], a:has(svg[aria-label*="Bài viết mới"]), a:has(svg[aria-label*="New post"]), a:has(svg[aria-label*="Tạo"]), a:has(svg[aria-label*="Create"])'
      ).first();

      if (await createBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
        await createBtn.click();
        await this.humanDelay(1400, 2200);
      }

      // Nếu tài khoản Chuyên nghiệp hiện submenu ("Bài viết" / "Video trực tiếp" / "Quảng cáo"), chọn đúng mục "Bài viết"
      if ((await page.locator('input[type="file"]').count()) === 0) {
        const subPostItem = page.locator(
          'a[href="#"]:has(svg[aria-label="Bài viết"]), a[href="#"]:has(svg[aria-label="Post"]), a[href="#"]:has(span:text-is("Bài viết")), a[href="#"]:has(span:text-is("Post")), span:text-is("Bài viết"), span:text-is("Post")'
        ).last();
        if (await subPostItem.isVisible({ timeout: 3500 }).catch(() => false)) {
          await subPostItem.click().catch(() => {});
          await this.humanDelay(1500, 2200);
        }
      }

      // 3. Đưa file ảnh hoặc video MP4 vào input[type="file"]
      console.log(`3️⃣  Đang tải tệp media lên Instagram: ${path.basename(mediaPath)}...`);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ state: 'attached', timeout: 12000 });
      await fileInput.setInputFiles(mediaPath);
      await this.humanDelay(4500, 6000);

      // Xử lý triệt để thông báo "Video hiện được chia sẻ dưới dạng thước phim / OK" nếu là Reels
      const okReelModal = page.getByRole('button', { name: /^OK$/i }).first();
      if (await okReelModal.isVisible({ timeout: 4000 }).catch(() => false)) {
        await okReelModal.click().catch(() => {});
        await this.humanDelay(1200, 1800);
      }

      // 4. Qua bước Cắt (Next / Tiếp lần 1) & Bộ lọc / Ảnh bìa (Next / Tiếp lần 2)
      const dialogScope = page.locator('div[role="dialog"]').first();
      for (let step = 1; step <= 2; step++) {
        // Phòng trường hợp popup OK xuất hiện trễ sau khi load video
        if (await okReelModal.isVisible({ timeout: 800 }).catch(() => false)) {
          await okReelModal.click().catch(() => {});
          await this.humanDelay(1000, 1500);
        }
        const nextBtn = page.locator('div[role="dialog"]').getByRole('button', { name: /^(Tiếp|Next)$/i }).first();
        if (await nextBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
          await nextBtn.click();
          await this.humanDelay(2000, 3000);
        }
      }

      // 5. Nhập Caption với hỗ trợ đầy đủ UTF-8 & xuống dòng
      console.log('4️⃣  Đang nhập Caption Instagram...');
      const captionBox = page.locator(
        'div[role="dialog"] div[role="textbox"][contenteditable="true"], div[aria-label*="Viết chú thích"], div[aria-label*="Write a caption"]'
      ).first();

      if (await captionBox.isVisible({ timeout: 6000 }).catch(() => false)) {
        await captionBox.click();
        await this.humanDelay(400, 800);
        const lines = String(message || '').split(/\r?\n/);
        for (let idx = 0; idx < lines.length; idx++) {
          if (lines[idx].length > 0) {
            await page.keyboard.insertText(lines[idx]);
          }
          if (idx < lines.length - 1) {
            await page.keyboard.press('Shift+Enter');
            await page.waitForTimeout(80);
          }
        }
        await page.keyboard.type(' ', { delay: 50 });
        await page.keyboard.press('Backspace');
        await this.humanDelay(1200, 1900);
      }

      // 6. Bấm Chia sẻ / Share và đợi Instagram xác nhận đã chia sẻ hoàn tất
      console.log('5️⃣  Kích hoạt nút Chia sẻ (Share)...');
      const shareBtn = page.locator('div[role="dialog"]').getByRole('button', { name: /^(Chia sẻ|Share)$/i }).first();

      if (await shareBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
        await shareBtn.click();
        console.log('   -> ⏳ Đã bấm Chia sẻ, đang đợi Instagram xử lý hoàn tất...');
        for (let waitSec = 0; waitSec < 25; waitSec++) {
          await page.waitForTimeout(1500);
          const dialogText = await page.locator('div[role="dialog"]').first().innerText().catch(() => '');
          if (/Đã chia sẻ|has been shared|shared your/i.test(dialogText)) {
            console.log('   -> ✅ INSTAGRAM XÁC NHẬN: ĐÃ CHIA SẺ THÀNH CÔNG!');
            break;
          }
        }
        await this.humanDelay(2000, 3000);
      } else {
        throw new Error('Không tìm thấy nút Chia sẻ/Share trên hộp thoại Instagram.');
      }

      await page.screenshot({ path: proofScreenshot, fullPage: false });
      recordPublishEvent({
        platform: 'instagram',
        contentType,
        message,
        mediaPath,
        spaceArchetype,
        engine: 'PLAYWRIGHT_INSTAGRAM',
        proofScreenshot
      });

      results.success = true;
      results.proofScreenshot = proofScreenshot;
      return results;
    } catch (err) {
      console.error('❌ Lỗi xuất bản Instagram:', err.message);
      if (page) {
        await page.screenshot({ path: proofScreenshot }).catch(() => {});
        results.proofScreenshot = proofScreenshot;
      }
      results.error = err.message;
      return results;
    } finally {
      if (page) await page.close().catch(() => {});
      await playwrightManager.closeContext(sessionCtx);
    }
  }
}

module.exports = new InstagramPlaywrightPublisher();

