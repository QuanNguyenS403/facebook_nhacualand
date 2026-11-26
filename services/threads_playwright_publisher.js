'use strict';

/**
 * THREADS PLAYWRIGHT AUTONOMOUS PUBLISHER
 * Thương hiệu: Nhà Của Land (nhacualand.com) — Chỉ duy nhất tại D:\Facebook
 *
 * Tự động hóa 100% xuất bản bài viết, hình ảnh & video lên Threads (@nhacualand):
 * - Kết nối trực tiếp `https://www.threads.com/` qua Persistent Profile 38.
 * - Brand Asset Guard: Xác thực phiên đăng nhập và tài khoản @nhacualand trước khi đăng.
 * - Kiểm soát tần suất độc lập cho kênh `threads`.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const playwrightManager = require('./playwright_manager');
const { checkPublishRateLimit, recordPublishEvent } = require('../lib/governance');

class ThreadsPlaywrightPublisher {
  constructor() {
    this.screenshotDir = path.resolve('D:/Facebook/data/screenshots');
    this.threadsUrl = 'https://www.threads.com/';
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  async humanDelay(minMs = 800, maxMs = 2000) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(r => setTimeout(r, delay));
  }

  async verifyThreadsAccount(page) {
    const expected = (process.env.BRAND_THREADS || 'nhacualand').toLowerCase().replace(/^@/, '');
    const navHrefs = await page.locator('nav a[href*="@"], header a[href*="@"], a[href^="/@"]').evaluateAll(els =>
      els.map(e => e.getAttribute('href')).filter(Boolean)
    ).catch(() => []);

    if (navHrefs.length === 0) {
      return { expected, detectedHandle: null, matched: false };
    }
    const handle = navHrefs[0].replace(/^.*@/, '').replace(/\/.*$/, '').toLowerCase();
    return { expected, detectedHandle: handle, matched: handle === expected };
  }

  async publish({
    message = '',
    mediaPath = null,
    spaceArchetype = null,
    headless = process.env.PLAYWRIGHT_HEADLESS !== 'false',
    force = false
  }) {
    console.log('================================================================');
    console.log('🧵 [THREADS PUBLISHER] XUẤT BẢN TỰ ĐỘNG THREADS NHÀ CỦA LAND');
    console.log('================================================================');

    if (!force) {
      const rateCheck = checkPublishRateLimit('threads');
      if (!rateCheck.allowed) {
        console.warn(`🛑 RATE LIMIT THREADS: ${rateCheck.reason}`);
        return {
          success: false,
          platform: 'threads',
          blockedBySafetyPolicy: true,
          reason: rateCheck.reason
        };
      }
    }

    const timestamp = Date.now();
    const proofScreenshot = path.join(this.screenshotDir, `threads_proof_${timestamp}.png`);
    const sessionCtx = await playwrightManager.getContext({ headless });

    let page = null;
    const results = {
      success: false,
      platform: 'threads',
      proofScreenshot: null,
      timestamp: new Date().toISOString()
    };

    try {
      page = await playwrightManager.newPage(sessionCtx.context);

      console.log('1️⃣  Đang mở Threads (threads.com)...');
      await page.goto(this.threadsUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.locator(
        'svg[aria-label="Tạo"], svg[aria-label="Create"], a[href*="/@"], a[href*="login"], button:has-text("Đăng nhập")'
      ).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      await this.humanDelay(1500, 2500);

      const loginBtnVisible = await page.locator('a[href*="login"], button:has-text("Đăng nhập"), a:has-text("Đăng nhập"), a:has-text("Log in")').first()
        .isVisible({ timeout: 2500 }).catch(() => false);
      const navCreateBtn = page.locator(
        '[role="button"]:has(svg[aria-label="Tạo"]), [role="button"]:has(svg[aria-label="Create"]), svg[aria-label="Tạo"], svg[aria-label="Create"]'
      ).first();
      const threadMoiBtn = page.locator(
        '[role="button"]:has-text("Thread mới"), [role="link"]:has-text("Thread mới"), a:has-text("Thread mới"), [role="button"]:has(svg[aria-label="Thread mới"])'
      ).first();
      const inlinePrompt = page.getByText(/^(Có gì mới\?|Bắt đầu chuỗi bài viết\.\.\.|What's new\?)$/i).first();

      const hasComposeTrigger =
        (await navCreateBtn.isVisible({ timeout: 3000 }).catch(() => false)) ||
        (await threadMoiBtn.isVisible({ timeout: 2000 }).catch(() => false)) ||
        (await inlinePrompt.isVisible({ timeout: 2000 }).catch(() => false));

      if (loginBtnVisible && !hasComposeTrigger) {
        await page.screenshot({ path: proofScreenshot }).catch(() => {});
        results.proofScreenshot = proofScreenshot;
        results.error = 'Phiên Threads (@nhacualand) chưa đăng nhập trong Profile 38. Chạy "npm run social:session" 1 lần để lưu phiên.';
        console.warn(`⚠️ ${results.error}`);
        return results;
      }

      if (process.env.STRICT_BRAND_ASSET_GUARD !== 'false') {
        const acct = await this.verifyThreadsAccount(page);
        if (acct.detectedHandle && !acct.matched) {
          await page.screenshot({ path: proofScreenshot }).catch(() => {});
          results.proofScreenshot = proofScreenshot;
          results.blockedByBrandAssetGuard = true;
          results.detectedHandle = acct.detectedHandle;
          results.reason = `Brand Asset Guard: Threads đang đăng nhập "@${acct.detectedHandle}", khác với "@${acct.expected}". Đã chặn tự động để bảo vệ cô lập thương hiệu.`;
          console.warn(`🛡️ ${results.reason}`);
          return results;
        }
      }

      console.log('2️⃣  Đang mở hộp thoại soạn bài trên Threads...');
      if (await inlinePrompt.isVisible({ timeout: 2500 }).catch(() => false)) {
        await inlinePrompt.click();
        await this.humanDelay(2200, 3200);
      } else if (await threadMoiBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
        await threadMoiBtn.click();
        await this.humanDelay(2200, 3200);
      } else if (await navCreateBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
        await navCreateBtn.click();
        await this.humanDelay(2200, 3200);
      }

      const textBox = page.locator(
        'div[data-lexical-editor="true"][contenteditable="true"], div[contenteditable="true"][aria-label*="soạn bài viết"], div[role="textbox"][contenteditable="true"], div[contenteditable="true"]'
      ).last();

      if (!(await textBox.isVisible({ timeout: 12000 }).catch(() => false))) {
        // Thử click nhắc lại vào vùng placeholder bên trong modal nếu Lexical đang lazy-load
        const modalPlaceholder = page.locator('[aria-label*="soạn bài viết mới"]').last();
        if (await modalPlaceholder.isVisible({ timeout: 2000 }).catch(() => false)) {
          await modalPlaceholder.click().catch(() => {});
          await this.humanDelay(1500, 2200);
        }
      }

      if (!(await textBox.isVisible({ timeout: 6000 }).catch(() => false))) {
        throw new Error('Không tìm thấy ô nhập bài viết Threads. Vui lòng đảm bảo đã đăng nhập @nhacualand.');
      }

      // Giới hạn độ dài Threads < 500 code points để không vượt ngưỡng ký tự của Threads
      const codePoints = [...String(message || '')];
      const threadsText = codePoints.length > 485 ? `${codePoints.slice(0, 480).join('')}...` : codePoints.join('');

      console.log('3️⃣  Đang nhập nội dung Threads...');
      await textBox.click();
      await this.humanDelay(400, 800);
      const lines = threadsText.split(/\r?\n/);
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
      await this.humanDelay(1000, 1600);

      if (mediaPath && fs.existsSync(mediaPath)) {
        console.log(`4️⃣  Đang đính kèm media lên Threads: ${path.basename(mediaPath)}...`);
        const dialogFileInput = page.locator('input[type="file"]').last();
        if (await dialogFileInput.count() > 0) {
          await dialogFileInput.setInputFiles(mediaPath);
        } else {
          const attachBtn = page.locator(
            '[role="button"]:has(svg[aria-label*="Đính kèm"]), [role="button"]:has(svg[aria-label*="Attach"]), svg[aria-label*="Đính kèm"], svg[aria-label*="Attach"]'
          ).last();
          if (await attachBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            const fcPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
            await attachBtn.click();
            const fc = await fcPromise;
            if (fc) {
              await fc.setFiles(mediaPath);
            }
          }
        }

        // Chờ preview ảnh/video xuất hiện trong hộp thoại và quá trình tải lên hoàn tất
        const isVideo = /\.mp4$/i.test(mediaPath);
        await this.humanDelay(isVideo ? 8000 : 4500, isVideo ? 11000 : 6500);
        for (let w = 0; w < 15; w++) {
          const uploadingCount = await page.locator('div[role="dialog"] [role="progressbar"]').count().catch(() => 0);
          if (uploadingCount === 0) break;
          await page.waitForTimeout(1000);
        }
      }

      console.log('5️⃣  Kích hoạt nút Đăng (Post)...');
      // Chọn chính xác nút "Đăng"/"Post" nằm bên trong hộp thoại div[role="dialog"]
      const dialogLocator = page.locator('div[role="dialog"]').last();
      const postBtn = (await dialogLocator.count()) > 0
        ? dialogLocator.getByRole('button', { name: /^(Đăng|Post)$/i }).last()
        : page.getByRole('button', { name: /^(Đăng|Post)$/i }).last();

      for (let waitStep = 0; waitStep < 12; waitStep++) {
        const disabledAttr = await postBtn.getAttribute('aria-disabled').catch(() => null);
        if (disabledAttr !== 'true') break;
        await page.waitForTimeout(1000);
      }

      if (await postBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
        await this.humanDelay(800, 1400);
        await postBtn.click();
        console.log('   -> ⏳ Đã bấm Đăng, đang đợi Threads tải lên và xác nhận "Đã đăng"...');
        let confirmed = false;
        for (let waitSec = 0; waitSec < 35; waitSec++) {
          await page.waitForTimeout(1500);
          const bodyText = await page.locator('body').innerText().catch(() => '');
          if (/Đã đăng|Posted/i.test(bodyText)) {
            console.log('   -> ✅ THREADS XÁC NHẬN: ĐÃ ĐĂNG THÀNH CÔNG!');
            confirmed = true;
            break;
          }
        }
        if (!confirmed) {
          await this.humanDelay(5000, 7000);
        } else {
          await this.humanDelay(1500, 2500);
        }
      } else {
        throw new Error('Không tìm thấy nút Đăng/Post trên Threads.');
      }

      await page.screenshot({ path: proofScreenshot, fullPage: false });
      recordPublishEvent({
        platform: 'threads',
        contentType: mediaPath ? 'media' : 'text',
        message: threadsText,
        mediaPath,
        spaceArchetype,
        engine: 'PLAYWRIGHT_THREADS',
        proofScreenshot
      });

      results.success = true;
      results.proofScreenshot = proofScreenshot;
      return results;
    } catch (err) {
      console.error('❌ Lỗi xuất bản Threads:', err.message);
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

module.exports = new ThreadsPlaywrightPublisher();
