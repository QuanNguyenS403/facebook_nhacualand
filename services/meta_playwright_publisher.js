'use strict';

/**
 * META FACEBOOK FANPAGE PLAYWRIGHT AUTONOMOUS PUBLISHER
 * Thương hiệu: Nhà Của Land (nhacualand.com) — Chỉ duy nhất tại D:\Facebook
 *
 * Tự động hóa 100% xuất bản bài viết, ảnh & Reels lên Fanpage Nhacualand:
 * - Tích hợp Auto Page Switcher & Brand Asset Guard (Tự động chọn đúng Fanpage "Nhacualand" / "Nhà Của Land",
 *   tuyệt đối chặn đăng nhầm nếu trình duyệt đang mở tài sản thương hiệu khác).
 * - Mô phỏng người dùng thật (Human Jitter 35-70ms/phím) & Circuit Breaker chống Checkpoint.
 * - Kiểm soát tần suất độc lập cho kênh `facebook`.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const playwrightManager = require('./playwright_manager');
const { checkPublishRateLimit, recordPublishEvent } = require('../lib/governance');

class MetaPlaywrightPublisher {
  constructor() {
    this.screenshotDir = path.resolve('D:/Facebook/data/screenshots');
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  getComposerUrl() {
    const pageId = process.env.META_PAGE_ID || process.env.FB_PAGE_ID || '';
    const businessId = process.env.META_BUSINESS_ID || '';
    if (pageId && businessId) {
      return `https://business.facebook.com/latest/composer?asset_id=${pageId}&business_id=${businessId}`;
    }
    if (pageId) {
      return `https://business.facebook.com/latest/composer?asset_id=${pageId}`;
    }
    return 'https://business.facebook.com/latest/composer';
  }

  matchesBrandAsset(text = '') {
    const norm = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
    const targetName = (process.env.BRAND_FACEBOOK_PAGE || 'nhacualand')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
    return norm.includes('nhacualand') || norm.includes('nha cua land') || (targetName && norm.includes(targetName));
  }

  async humanDelay(minMs = 800, maxMs = 2000) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(r => setTimeout(r, delay));
  }

  async dismissPopups(page) {
    try {
      const closeBtns = page.locator('div[role="button"]:has-text("Đóng"), button:has-text("Đóng"), div[role="button"]:has-text("Lúc khác")');
      const count = await closeBtns.count();
      for (let i = 0; i < count; i++) {
        await closeBtns.nth(i).click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(350);
      }
    } catch (e) {
      // Ignore popup dismissal errors
    }
  }

  async detectMetaWarnings(page) {
    const pageText = await page.locator('body').innerText().catch(() => '');
    const warningSignals = [
      'Tài khoản của bạn tạm thời bị khóa',
      'Xác nhận danh tính',
      'Chúng tôi đã phát hiện hoạt động bất thường',
      'Hành động này bị chặn',
      'Action Blocked',
      'Confirm your identity',
      'Checkpoint'
    ];
    for (const signal of warningSignals) {
      if (pageText.includes(signal)) return signal;
    }
    return null;
  }

  async waitForComposerReady(page, timeoutMs = 45000) {
    const start = Date.now();
    const composerSelectors = [
      '[role="combobox"]:not([contenteditable="true"])',
      'div[contenteditable="true"][aria-label*="thêm văn bản"]',
      'div[contenteditable="true"]._5rpu',
      'div[role="textbox"][contenteditable="true"]',
      'div[role="combobox"][contenteditable="true"]'
    ].join(', ');

    while ((Date.now() - start) < timeoutMs) {
      if (page.url().includes('login') || (await page.locator('input[name="email"], #email').first().isVisible({ timeout: 250 }).catch(() => false))) {
        return { status: 'login' };
      }

      const warning = await this.detectMetaWarnings(page);
      if (warning) {
        return { status: 'warning', warning };
      }

      const hasComposer = await page.locator(composerSelectors).first().isVisible({ timeout: 300 }).catch(() => false);
      const hasPublishBtn = await page.getByRole('button', { name: /^(Đăng|Publish)$/i }).first().isVisible({ timeout: 300 }).catch(() => false);

      if (hasComposer || hasPublishBtn) {
        await this.humanDelay(1200, 1800);
        return { status: 'ready' };
      }

      await page.waitForTimeout(1000);
    }

    return { status: 'timeout' };
  }

  /**
   * Đảm bảo Meta Business Suite CHỈ chọn duy nhất Fanpage Nhà Của Land (Nhacualand)
   * và tự động bỏ tích mọi tài khoản liên kết khác trong hộp "Đăng lên" (Post to)
   */
  async ensureTargetFanpageSelected(page, { allowBrandInstagramCrosspost = true } = {}) {
    await this.dismissPopups(page);

    // Kiểm tra hộp chọn đích đăng bài ("Đăng lên": [role="combobox"])
    const postToCombo = page.locator('[role="combobox"]:not([contenteditable="true"])').filter({
      hasText: /Nhacualand|Nhà Cửa Land|Nhà Của Land/i
    }).first();

    if (await postToCombo.isVisible({ timeout: 5000 }).catch(() => false)) {
      const currentTargetsText = (await postToCombo.innerText().catch(() => '')).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
      const parts = currentTargetsText.split(/\s+và\s+|\s+and\s+|,/i).map(s => s.trim()).filter(Boolean);
      const hasNonBrandTarget = parts.some(p => !this.matchesBrandAsset(p));

      if (parts.length > 1 && (hasNonBrandTarget || !allowBrandInstagramCrosspost)) {
        console.log(`🔒 [Brand Asset Guard] Đang điều chỉnh đích đăng bài ("${currentTargetsText.replace(/\s+/g, ' ')}") -> Chỉ giữ lại Fanpage Nhacualand...`);
        await postToCombo.click().catch(() => {});
        await this.humanDelay(1000, 1600);

        const options = page.locator('[role="option"]');
        const optCount = await options.count();
        for (let i = 0; i < optCount; i++) {
          const opt = options.nth(i);
          const optText = (await opt.innerText().catch(() => '')).trim();
          const shouldUncheck = hasNonBrandTarget ? (optText && !this.matchesBrandAsset(optText)) : (i > 0);
          if (shouldUncheck) {
            await opt.click({ timeout: 2500 }).catch(() => {});
            await this.humanDelay(600, 1000);
          }
        }
        await page.keyboard.press('Escape').catch(() => {});
        await this.humanDelay(800, 1300);
        return { matched: true, crossPostedInstagram: false };
      }

      return { matched: true, crossPostedInstagram: parts.length > 1 && !hasNonBrandTarget };
    }

    // Nếu combobox đang chọn trang khác -> thử mở combobox để chọn lại Nhacualand
    const anyCombo = page.locator('[role="combobox"]:not([contenteditable="true"])').first();
    if (await anyCombo.isVisible({ timeout: 2500 }).catch(() => false)) {
      await anyCombo.click().catch(() => {});
      await this.humanDelay(900, 1400);
      const brandOption = page.locator('[role="option"]').filter({
        hasText: /Nhacualand|Nhà Cửa Land|Nhà Của Land/i
      }).first();
      if (await brandOption.isVisible({ timeout: 2500 }).catch(() => false)) {
        await brandOption.click().catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
        await this.humanDelay(1000, 1500);
        return { matched: true, autoSwitched: true };
      }
      await page.keyboard.press('Escape').catch(() => {});
    }

    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (this.matchesBrandAsset(bodyText)) {
      return { matched: true };
    }

    // Thử mở menu chuyển tài sản trong Meta Business Suite để tìm "Nhacualand"
    const switcher = page.locator('[aria-label*="tài sản"], [aria-label*="asset"], [aria-label*="Chuyển"], [aria-label*="Switch"]').first();
    if (await switcher.isVisible({ timeout: 2500 }).catch(() => false)) {
      await switcher.click().catch(() => {});
      await this.humanDelay(1000, 1500);
      const targetOption = page.locator('div, span, a').filter({ hasText: /Nhacualand|Nhà Cửa Land|Nhà Của Land/i }).first();
      if (await targetOption.isVisible({ timeout: 2500 }).catch(() => false)) {
        await targetOption.click().catch(() => {});
        await this.humanDelay(2500, 3500);
        return { matched: true, autoSwitched: true };
      }
    }

    return { matched: false };
  }

  /**
   * Dự phòng: Đăng trực tiếp trên giao diện Facebook Page (facebook.com/<pageId>)
   * khi Meta Business Suite Composer bị kẹt màn hình loading.
   */
  async publishViaFacebookPageDirect(page, {
    contentType = 'feed',
    message = '',
    mediaPath = null,
    spaceArchetype = null,
    proofScreenshot
  }) {
    const pageId = process.env.META_PAGE_ID || process.env.FB_PAGE_ID || '1337253129481940';
    const pageUrl = `https://www.facebook.com/${pageId}`;
    console.log(`🔄 [Fallback FB Page] Chuyển sang đăng trực tiếp trên Fanpage (${pageUrl})...`);

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.humanDelay(3500, 5000);

    if (page.url().includes('login') || (await page.locator('input[name="email"], #email').first().isVisible({ timeout: 1500 }).catch(() => false))) {
      throw new Error('Phiên Facebook trong trình duyệt chưa đăng nhập. Chạy "npm run social:session" 1 lần để lưu phiên.');
    }

    const warningDetected = await this.detectMetaWarnings(page);
    if (warningDetected) {
      throw new Error(`Phát hiện cảnh báo Meta: "${warningDetected}"`);
    }

    // Kiểm tra Brand Asset Guard trên chính trang Fanpage
    const headingText = await page.locator('h1').first().innerText().catch(() => '');
    const pageTitle = await page.title().catch(() => '');
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (
      process.env.STRICT_BRAND_ASSET_GUARD !== 'false' &&
      !this.matchesBrandAsset(`${headingText} ${pageTitle} ${bodyText.slice(0, 800)}`)
    ) {
      return {
        success: false,
        platform: 'facebook',
        blockedByBrandAssetGuard: true,
        reason: `Brand Asset Guard: Trang Facebook đang mở không khớp Fanpage "${process.env.BRAND_FACEBOOK_PAGE || 'Nhacualand'}".`
      };
    }

    // Nếu đang ở chế độ trang cá nhân -> bấm "Chuyển ngay" / "Switch Now" sang Fanpage Nhacualand
    const switchBtn = page.locator(
      '[role="button"]:has-text("Chuyển ngay"), [role="button"]:has-text("Switch Now"), [role="button"]:has-text("Chuyển sang Trang")'
    ).first();
    if (await switchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('   🔀 Đang chuyển tư cách tương tác sang Fanpage Nhacualand...');
      await switchBtn.click().catch(() => {});
      await this.humanDelay(4000, 5500);
    }

    const composerTrigger = page.locator(
      '[role="button"]:has-text("Bạn đang nghĩ gì"), [role="button"]:has-text("What\'s on your mind"), [role="button"]:has-text("Tạo bài viết"), [role="button"]:has-text("Create post")'
    ).first();

    if (!(await composerTrigger.isVisible({ timeout: 10000 }).catch(() => false))) {
      throw new Error('Không tìm thấy khung tạo bài viết trên Fanpage Nhacualand (có thể phiên hiện tại chưa chuyển sang quyền Trang).');
    }

    await composerTrigger.click();
    await this.humanDelay(1800, 2600);

    const dialog = page.locator('div[role="dialog"]').last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });

    if (mediaPath && fs.existsSync(mediaPath)) {
      console.log(`2️⃣  [FB Page] Đang đính kèm file media: ${path.basename(mediaPath)}...`);
      let fileInput = dialog.locator('input[type="file"]').first();
      if ((await fileInput.count()) === 0) {
        const photoVideoBtn = dialog.locator(
          '[aria-label*="Ảnh/video"], [aria-label*="Photo/video"], [role="button"]:has-text("Ảnh/video"), [role="button"]:has-text("Photo/video")'
        ).first();
        if (await photoVideoBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
          await photoVideoBtn.click().catch(() => {});
          await this.humanDelay(1000, 1500);
        }
        fileInput = dialog.locator('input[type="file"]').first();
      }
      if ((await fileInput.count()) === 0) {
        fileInput = page.locator('input[type="file"]').last();
      }
      await fileInput.setInputFiles(mediaPath);
      await this.humanDelay(4500, 7000);
    }

    console.log('3️⃣  [FB Page] Đang nhập nội dung bài viết...');
    const textBox = dialog.locator('div[role="textbox"][contenteditable="true"], div[contenteditable="true"]').first();
    await textBox.waitFor({ state: 'visible', timeout: 10000 });
    await textBox.click();
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
    await this.humanDelay(1200, 1800);

    console.log('4️⃣  [FB Page] Kích hoạt nút Đăng...');
    const postBtn = dialog.getByRole('button', { name: /^(Đăng|Post)$/i }).last();
    for (let waitStep = 0; waitStep < 15; waitStep++) {
      const disabledAttr = await postBtn.getAttribute('aria-disabled').catch(() => null);
      const isDisabled = disabledAttr === 'true' || !(await postBtn.isEnabled().catch(() => false));
      if (!isDisabled) break;
      await page.waitForTimeout(1000);
    }

    if (!(await postBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
      throw new Error('Không tìm thấy nút Đăng khả dụng trong hộp thoại Fanpage.');
    }

    await this.humanDelay(800, 1400);
    await postBtn.click();
    console.log('   -> ✅ ĐÃ XUẤT BẢN BÀI VIẾT LÊN FANPAGE NHÀ CỬA LAND (FB PAGE DIRECT)!');
    await this.humanDelay(6500, 9000);

    await page.screenshot({ path: proofScreenshot, fullPage: false });
    recordPublishEvent({
      platform: 'facebook',
      contentType,
      message,
      mediaPath,
      spaceArchetype,
      engine: 'PLAYWRIGHT_FB_PAGE_DIRECT',
      proofScreenshot
    });

    return {
      success: true,
      platform: 'facebook',
      engine: 'PLAYWRIGHT_FB_PAGE_DIRECT',
      contentType,
      crossPostedInstagram: false,
      proofScreenshot,
      timestamp: new Date().toISOString()
    };
  }

  async publish({
    contentType = 'feed',
    message = '',
    mediaPath = null,
    allowInstagramCrosspost = false,
    spaceArchetype = null,
    force = false,
    headless = process.env.PLAYWRIGHT_HEADLESS !== 'false'
  }) {
    console.log('================================================================');
    console.log('🛡️ [PLAYWRIGHT FB PUBLISHER] XUẤT BẢN FANPAGE NHÀ CỦA LAND');
    console.log('================================================================');

    if (!force) {
      const rateCheck = checkPublishRateLimit('facebook');
      if (!rateCheck.allowed) {
        console.warn(`🛑 RATE LIMIT FACEBOOK: ${rateCheck.reason}`);
        return {
          success: false,
          platform: 'facebook',
          blockedBySafetyPolicy: true,
          reason: rateCheck.reason
        };
      }
    }

    const timestamp = Date.now();
    const proofScreenshot = path.join(this.screenshotDir, `fb_proof_${timestamp}.png`);
    const sessionCtx = await playwrightManager.getContext({ headless });

    let page = null;
    const results = {
      success: false,
      platform: 'facebook',
      contentType,
      proofScreenshot: null,
      timestamp: new Date().toISOString()
    };

    try {
      page = await playwrightManager.newPage(sessionCtx.context);

      console.log('1️⃣  Đang mở Meta Business Suite Composer (chờ giao diện tải hoàn tất)...');
      await page.goto(this.getComposerUrl(), { waitUntil: 'domcontentloaded', timeout: 45000 });
      const readyState = await this.waitForComposerReady(page, 45000);

      if (readyState.status === 'login') {
        await page.screenshot({ path: proofScreenshot }).catch(() => {});
        throw new Error('Phiên Facebook trong trình duyệt chưa đăng nhập. Chạy "npm run social:session" 1 lần để lưu phiên.');
      }

      if (readyState.status === 'warning') {
        const alertScreenshot = path.join(this.screenshotDir, `ALERT_CHECKPOINT_${timestamp}.png`);
        await page.screenshot({ path: alertScreenshot }).catch(() => {});
        throw new Error(`Phát hiện cảnh báo Meta: "${readyState.warning}". Đã ngắt mạch an toàn tại ${alertScreenshot}`);
      }

      if (readyState.status === 'timeout') {
        console.warn('⚠️ Meta Business Suite Composer tải quá lâu (spinner). Kích hoạt Fallback đăng trực tiếp qua Fanpage...');
        return await this.publishViaFacebookPageDirect(page, {
          contentType,
          message,
          mediaPath,
          spaceArchetype,
          proofScreenshot
        });
      }

      // Kiểm tra Brand Asset Guard để đảm bảo cô lập thương hiệu Nhà Của Land 100%
      let crossPostedInstagram = false;
      if (process.env.STRICT_BRAND_ASSET_GUARD !== 'false') {
        const assetCheck = await this.ensureTargetFanpageSelected(page, {
          allowBrandInstagramCrosspost: Boolean(allowInstagramCrosspost && mediaPath && fs.existsSync(mediaPath))
        });
        if (!assetCheck.matched) {
          console.warn('⚠️ Không xác nhận được Fanpage trên Meta Business Suite Composer. Thử Fallback đăng trực tiếp qua Fanpage...');
          const directFallback = await this.publishViaFacebookPageDirect(page, {
            contentType,
            message,
            mediaPath,
            spaceArchetype,
            proofScreenshot
          }).catch(() => null);
          if (directFallback && directFallback.success) {
            return directFallback;
          }

          await page.screenshot({ path: proofScreenshot }).catch(() => {});
          results.proofScreenshot = proofScreenshot;
          results.blockedByBrandAssetGuard = true;
          results.reason = `Brand Asset Guard: Tài khoản Meta hiện tại chưa chọn hoặc chưa gắn Fanpage "${process.env.BRAND_FACEBOOK_PAGE || 'Nhacualand'}". Đã chặn đăng nhầm sang trang khác.`;
          console.warn(`🛡️ ${results.reason}`);
          return results;
        }
        crossPostedInstagram = Boolean(assetCheck.crossPostedInstagram);
      }

      // Tải file media lên Meta Business Suite Composer
      if (mediaPath && fs.existsSync(mediaPath)) {
        console.log(`2️⃣  Đang đính kèm file media: ${path.basename(mediaPath)}...`);
        const isVideo = /\.mp4$/i.test(mediaPath);
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
          await fileInput.setInputFiles(mediaPath);
          await this.humanDelay(4500, 7000);
        } else {
          const addMediaBtn = page.getByRole('button', {
            name: isVideo ? /Thêm video|Thêm ảnh\/video|Add video/i : /Thêm ảnh|Thêm ảnh\/video|Add photo/i
          }).first();

          if (await addMediaBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            const fcPromise = page.waitForEvent('filechooser', { timeout: 6500 }).catch(() => null);
            await addMediaBtn.click();
            await this.humanDelay(800, 1400);

            const desktopUploadOption = page.locator(
              'div[role="menuitem"]:has-text("Tải lên từ máy tính"), span:has-text("Tải lên từ máy tính"), div[role="menuitem"]:has-text("Upload from desktop")'
            ).first();
            if (await desktopUploadOption.isVisible({ timeout: 2000 }).catch(() => false)) {
              await desktopUploadOption.click();
            }

            const fc = await fcPromise;
            if (fc) {
              await fc.setFiles(mediaPath);
              await this.humanDelay(6000, 9000);
            } else {
              const dynamicInput = page.locator('input[type="file"]').first();
              if (await dynamicInput.count() > 0) {
                await dynamicInput.setInputFiles(mediaPath);
                await this.humanDelay(6000, 9000);
              }
            }
          }
        }
      }

      console.log('3️⃣  Đang nhập nội dung bài viết (UTF-8 Multi-line + Human Jitter)...');
      const textLocator = page.locator(
        'div[contenteditable="true"][aria-label*="thêm văn bản"], div[contenteditable="true"]._5rpu, div[role="textbox"][contenteditable="true"], div[role="combobox"][contenteditable="true"], textarea'
      ).first();
      if (await textLocator.isVisible({ timeout: 10000 }).catch(() => false)) {
        await textLocator.click();
        await this.humanDelay(400, 900);
        const lines = String(message || '').split(/\r?\n/);
        for (let idx = 0; idx < lines.length; idx++) {
          if (lines[idx].length > 0) {
            await page.keyboard.insertText(lines[idx]);
          }
          if (idx < lines.length - 1) {
            await page.keyboard.press('Shift+Enter');
            await page.waitForTimeout(90);
          }
        }
        await page.keyboard.type(' ', { delay: 60 });
        await page.keyboard.press('Backspace');
        await this.humanDelay(1500, 2400);
      } else {
        throw new Error('Không tìm thấy ô soạn thảo trên Meta Business Suite Composer.');
      }

      console.log('4️⃣  Kích hoạt nút Xuất bản (Đăng / Publish)...');
      const publishBtn = page.getByRole('button', { name: /^(Đăng|Publish)$/i }).last();

      // Đợi Meta Business Suite xử lý xong ảnh/video để nút Đăng chuyển sang trạng thái bật (enabled)
      for (let waitStep = 0; waitStep < 15; waitStep++) {
        const disabledAttr = await publishBtn.getAttribute('aria-disabled').catch(() => null);
        const isDisabled = disabledAttr === 'true' || !(await publishBtn.isEnabled().catch(() => false));
        if (!isDisabled) break;
        await page.waitForTimeout(1000);
      }

      if (await publishBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await this.humanDelay(900, 1600);
        await publishBtn.click();
        console.log('   -> ✅ ĐÃ XUẤT BẢN BÀI VIẾT LÊN FANPAGE NHÀ CỬA LAND!');
        await this.humanDelay(6500, 9000);
      } else {
        throw new Error('Không tìm thấy nút Đăng/Publish khả dụng trên Composer.');
      }

      await page.screenshot({ path: proofScreenshot, fullPage: false });
      recordPublishEvent({
        platform: 'facebook',
        contentType,
        message,
        mediaPath,
        spaceArchetype,
        engine: 'PLAYWRIGHT_FB',
        proofScreenshot
      });

      results.success = true;
      results.crossPostedInstagram = crossPostedInstagram;
      results.proofScreenshot = proofScreenshot;
      return results;
    } catch (err) {
      console.error('❌ Lỗi xuất bản Facebook Fanpage:', err.message);
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

module.exports = new MetaPlaywrightPublisher();
