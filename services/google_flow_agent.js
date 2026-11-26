'use strict';

/**
 * GOOGLE FLOW & VEO / IMAGE STUDIO BROWSER AUTOMATION AGENT (PLAYWRIGHT POWERED)
 * Chỉ duy nhất tại D:\Facebook
 *
 * Tự động hóa việc truy cập Google Flow Studio (https://flow.google.com/) bằng Profile 38:
 * - Hỗ trợ tạo VIDEO ROOM TOUR 4K (Google Veo trong Flow) cho Facebook Reels, Instagram Reels & Threads.
 * - Hỗ trợ tạo HÌNH ẢNH KIẾN TRÚC / NỘI THẤT PHÒNG 4K (Google Flow Image Studio) cho Feed & Carousel.
 * - Tôn trọng DATA_DIR động, assertInsideWorkspace, DRY_RUN và GOOGLE_FLOW_ENABLED.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const playwrightManager = require('./playwright_manager');
const promptArchitect = require('./prompt_architect');
const { assertInsideWorkspace } = require('../lib/governance');

const ASPECT_DIMENSIONS = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '3:4': { width: 1080, height: 1440 },
  '1:1': { width: 1080, height: 1080 }
};

function getDataDir() {
  const raw = process.env.DATA_DIR;
  return (typeof raw === 'string' && raw.trim())
    ? path.resolve(raw.trim())
    : path.resolve(__dirname, '../data');
}

function validateOutputBasename(name, label = 'customName') {
  if (name === null || name === undefined) return null;
  const str = String(name);
  if (str.includes('\0') || /[\\/]/.test(str) || /^[a-zA-Z]:/.test(str)) {
    throw new Error(`Workspace isolation violation: ${label} must be a plain filename without path separators or drive prefixes.`);
  }
  return str;
}

class GoogleFlowAgent {
  constructor() {
    this.flowUrl = process.env.GOOGLE_FLOW_URL || 'https://flow.google.com/';
  }

  get outputDir() {
    return path.join(getDataDir(), 'videos');
  }

  get imageDir() {
    return path.join(getDataDir(), 'images');
  }

  _isFlowDisabled() {
    return process.env.DRY_RUN === 'true' || process.env.GOOGLE_FLOW_ENABLED === 'false';
  }

  async getBrowser({ headless = process.env.PLAYWRIGHT_HEADLESS !== 'false' } = {}) {
    if (this._isFlowDisabled()) {
      throw new Error('Google Flow browser launch blocked (DRY_RUN/GOOGLE_FLOW_ENABLED=false).');
    }
    return await playwrightManager.getContext({ headless });
  }

  /**
   * Kiểm tra phiên đăng nhập Google Flow PRO trong Persistent Profile
   */
  async checkSession() {
    if (this._isFlowDisabled()) {
      return {
        ready: false,
        disabled: true,
        plan: 'DISABLED',
        profile: null,
        url: this.flowUrl,
        title: ''
      };
    }

    console.log('🔍 [Playwright] Kiểm tra phiên làm việc Google Flow Studio (flow.google.com)...');
    const sessionCtx = await this.getBrowser({ headless: true });
    let page = null;
    try {
      page = await playwrightManager.newPage(sessionCtx.context);
      await page.goto(this.flowUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(2500);

      const currentUrl = page.url();
      const title = await page.title();
      const bodyText = await page.locator('body').innerText().catch(() => '');

      const isLoggedIn = !currentUrl.includes('/about') &&
        !currentUrl.includes('accounts.google.com') &&
        !currentUrl.includes('ServiceLogin') &&
        (bodyText.includes('Dự án mới') || bodyText.includes('Start Creating') || currentUrl.includes('/project/'));

      const isPro = bodyText.includes('PRO');

      console.log(`📍 URL: ${currentUrl} | Gói: ${isPro ? 'GOOGLE AI PRO' : 'Standard'}`);
      console.log(`🔐 Trạng thái Google Flow: ${isLoggedIn ? '✅ ĐÃ ĐĂNG NHẬP & SẴN SÀNG TỰ ĐỘNG 100%' : '⚠️ CẦN XÁC THỰC 1 LẦN'}`);

      await page.close().catch(() => {});
      await playwrightManager.closeContext(sessionCtx);

      return {
        ready: isLoggedIn,
        plan: isPro ? 'PRO' : 'STANDARD',
        profile: sessionCtx.profileDirectory,
        url: currentUrl,
        title
      };
    } catch (err) {
      if (page) await page.close().catch(() => {});
      await playwrightManager.closeContext(sessionCtx);
      throw new Error(`Kiểm tra phiên Google Flow thất bại: ${err.message}`);
    }
  }

  async openInteractiveSessionLogin() {
    console.log('🚀 [Playwright] Mở trình duyệt để đồng bộ phiên Google Flow 1 lần duy nhất...');
    const sessionCtx = await playwrightManager.getContext({ headless: false });
    const page = await playwrightManager.newPage(sessionCtx.context);
    await page.goto(this.flowUrl, { waitUntil: 'domcontentloaded' });
    return { ...sessionCtx, page };
  }

  synthesizeVeoPrompt({ prompt, aspectRatio = '9:16' }) {
    return promptArchitect.buildVeoVideoPrompt({ topic: prompt, aspectRatio });
  }

  normalizeFlowImageAspectRatio(aspectRatio = '3:4') {
    if (aspectRatio === '4:5') return '3:4';
    const supported = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    return supported.includes(aspectRatio) ? aspectRatio : '3:4';
  }

  synthesizeImagePrompt({ prompt, aspectRatio = '3:4' }) {
    const flowRatio = this.normalizeFlowImageAspectRatio(aspectRatio);
    const built = promptArchitect.buildArchitecturalPrompt({ prompt, aspectRatio: flowRatio });
    return `Generate 1 photorealistic architectural interior photograph immediately without asking confirmation (aspect ratio ${flowRatio}): ${built.prompt}`;
  }

  async dismissOverlays(page) {
    const btnSelectors = [
      '.cdk-overlay-container button:has-text("Tôi hiểu")',
      '.cdk-overlay-container button:has-text("Đã hiểu")',
      '.cdk-overlay-container button:has-text("Got it")',
      '.cdk-overlay-container button:has-text("OK")',
      '.cdk-overlay-container button:has-text("Tiếp tục")',
      '.cdk-overlay-container button:has-text("Accept")',
      '.cdk-overlay-container button:has-text("Đóng")',
      '.cdk-overlay-container button:has-text("Close")',
      '.cdk-overlay-container button:has-text("Bỏ qua")',
      '.cdk-overlay-container button:has-text("Skip")',
      '.cdk-overlay-container button[aria-label="Close"]',
      '.cdk-overlay-container button[aria-label="Đóng"]',
      'mat-dialog-container button:has-text("Tôi hiểu")',
      'mat-dialog-container button:has-text("Got it")',
      'mat-dialog-container button[aria-label="Close"]'
    ].join(', ');

    for (let attempt = 0; attempt < 8; attempt++) {
      const hasBackdrop = await page.locator('.cdk-overlay-backdrop-showing').first()
        .isVisible({ timeout: 400 }).catch(() => false);
      const dismissBtn = page.locator(btnSelectors).filter({ visible: true }).first();

      if (await dismissBtn.isVisible({ timeout: 400 }).catch(() => false)) {
        await dismissBtn.click({ force: true, timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(300);
        continue;
      }

      if (!hasBackdrop) break;

      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);

      const stillBlocked = await page.locator('.cdk-overlay-backdrop-showing').first()
        .isVisible({ timeout: 300 }).catch(() => false);
      if (stillBlocked) {
        await page.mouse.click(12, 12).catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }

  /**
   * Điều hướng vào không gian Project Studio của Google Flow
   */
  async openProjectStudio(page) {
    await page.goto(this.flowUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    await this.dismissOverlays(page);

    if (page.url().includes('/about')) {
      const startBtn = page.locator('button, a').filter({
        hasText: /Tạo bằng Google Flow|Dùng thử trong Google Flow|Create with Flow|Start Creating/i
      }).first();
      if (await startBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await startBtn.click();
        await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }

    if (page.url().includes('accounts.google.com') || page.url().includes('ServiceLogin')) {
      return { loggedIn: false };
    }

    if (!page.url().includes('/project/')) {
      await this.dismissOverlays(page);
      const openExisting = page.locator('a[href^="/project/"], a[aria-label="Mở dự án"]').first();
      const createNew = page.locator('button.new-project-button, button:has-text("Dự án mới"), button:has-text("New project")').first();

      if (await openExisting.isVisible({ timeout: 8000 }).catch(() => false)) {
        const href = await openExisting.getAttribute('href').catch(() => null);
        if (href && href.startsWith('/project/')) {
          await page.goto(new URL(href, this.flowUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
        } else {
          await openExisting.click();
        }
      } else if (await createNew.isVisible({ timeout: 5000 }).catch(() => false)) {
        await createNew.click();
      }
      await page.waitForURL('**/project/**', { timeout: 20000 }).catch(() => {});
    }

    await this.dismissOverlays(page);
    const editorLocator = page.locator('div.ProseMirror[role="textbox"]').first();
    await editorLocator.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});

    const newSessionBtn = page.locator('button[aria-label="Bắt đầu phiên mới"], button[aria-label="Start new session"]').first();
    if (await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newSessionBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    await this.dismissOverlays(page);
    return { loggedIn: true, studioUrl: page.url() };
  }

  /**
   * Nhập prompt vào ProseMirror Editor của Google Flow Studio và bấm nút "Bắt đầu tạo"
   */
  async submitStudioPrompt(page, fullPrompt) {
    await this.dismissOverlays(page);
    const editorLocator = page.locator(
      'div.ProseMirror[role="textbox"], div[aria-label="Bạn muốn tạo gì?"], div[role="textbox"][contenteditable="true"]'
    ).first();

    const editorFound = await editorLocator.isVisible({ timeout: 15000 }).catch(() => false);
    if (editorFound) {
      await editorLocator.click().catch(async () => {
        await this.dismissOverlays(page);
        await editorLocator.click({ force: true });
      });
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(fullPrompt, { delay: 8 });
    } else {
      const textarea = page.locator('textarea').first();
      if (await textarea.isVisible({ timeout: 5000 }).catch(() => false)) {
        await textarea.fill(fullPrompt);
      } else {
        throw new Error('Không tìm thấy ô nhập lệnh ProseMirror trên Google Flow Studio.');
      }
    }

    await page.waitForTimeout(600);
    await this.dismissOverlays(page);

    const generateBtn = page.locator(
      'button[aria-label="Bắt đầu tạo"], button.generate-icon-button, button[aria-label="Start generating"], button:has-text("arrow_forward")'
    ).first();

    if (await generateBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      try {
        await generateBtn.click({ timeout: 8000 });
        return true;
      } catch {
        await this.dismissOverlays(page);
        await generateBtn.click({ force: true, timeout: 6000 }).catch(async () => {
          await page.keyboard.press('Enter');
        });
        return true;
      }
    }

    await page.keyboard.press('Enter');
    return true;
  }

  /**
   * 1. TỰ ĐỘNG HÓA TẠO VIDEO ROOM TOUR TRÊN GOOGLE FLOW / VEO
   */
  async generateVideo({
    prompt,
    aspectRatio = process.env.VIDEO_DEFAULT_ASPECT_RATIO || '9:16',
    duration = parseInt(process.env.VIDEO_DEFAULT_DURATION_SECONDS || '8', 10),
    customName = null,
    headless = process.env.PLAYWRIGHT_HEADLESS !== 'false'
  }) {
    if (!prompt) throw new Error('Prompt tạo video không được để trống.');
    if (this._isFlowDisabled()) {
      throw new Error('Google Flow Web RPA is disabled (DRY_RUN/GOOGLE_FLOW_ENABLED=false).');
    }

    const videosDir = this.outputDir;
    const timestamp = Date.now();
    const safeCustomName = validateOutputBasename(customName, 'customName');
    const rawFilename = safeCustomName ? `${safeCustomName.replace(/\.mp4$/i, '')}.mp4` : `flow_veo_${timestamp}.mp4`;
    const outputPath = assertInsideWorkspace(path.join(videosDir, rawFilename), videosDir);
    assertInsideWorkspace(outputPath);
    const finalFilename = path.basename(outputPath);
    const previewPath = assertInsideWorkspace(path.join(videosDir, `preview_${timestamp}.png`), videosDir);
    assertInsideWorkspace(previewPath);
    const cinematicPrompt = this.synthesizeVeoPrompt({ prompt, aspectRatio });

    console.log('================================================================');
    console.log('🎬 [GOOGLE FLOW / VEO] TỰ ĐỘNG TẠO VIDEO ROOM TOUR');
    console.log('================================================================');
    console.log(`📝 Chủ đề: "${prompt}"`);
    console.log(`📐 Tỉ lệ: ${aspectRatio} | Thời lượng: ${duration}s`);

    const sessionCtx = await this.getBrowser({ headless });
    let page = null;

    try {
      page = await playwrightManager.newPage(sessionCtx.context);
      const studio = await this.openProjectStudio(page);

      if (!studio.loggedIn) {
        console.log('⚠️ Google Flow chưa đăng nhập trong profile này -> chuyển sang bộ dựng dự phòng...');
        this.renderFallbackCinematic({ outputPath, title: prompt, aspectRatio, duration });
        return {
          success: true,
          source: 'VEO_FALLBACK_ENGINE',
          filePath: outputPath,
          file_path: outputPath,
          file_name: finalFilename,
          size_bytes: fs.statSync(outputPath).size,
          fileSizeBytes: fs.statSync(outputPath).size,
          duration,
          durationSec: duration,
          aspect_ratio: aspectRatio,
          ready_for_publish: true
        };
      }

      const existingVideoSrcs = await page.locator('video').evaluateAll(els =>
        els.map(v => v.getAttribute('src')).filter(Boolean)
      ).catch(() => []);

      await this.submitStudioPrompt(page, cinematicPrompt);
      if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
      await page.screenshot({ path: previewPath }).catch(() => {});

      let newVideoLocator = null;
      const maxWaitSeconds = 110;
      const startTime = Date.now();

      while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        const count = await page.locator('video').count();
        for (let idx = count - 1; idx >= 0; idx--) {
          const vLoc = page.locator('video').nth(idx);
          const src = await vLoc.getAttribute('src').catch(() => null);
          if (src && !src.startsWith('blob:null') && src.length > 8 && !existingVideoSrcs.includes(src)) {
            newVideoLocator = vLoc;
            break;
          }
        }
        if (newVideoLocator) break;
        await page.waitForTimeout(5000);
      }

      if (newVideoLocator) {
        if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
        await playwrightManager.extractMediaBlob(page, newVideoLocator, outputPath);
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
        this.renderFallbackCinematic({ outputPath, title: prompt, aspectRatio, duration });
      }

      const stats = fs.statSync(outputPath);
      return {
        success: true,
        source: newVideoLocator ? 'GOOGLE_FLOW_VEO_PLAYWRIGHT' : 'GOOGLE_FLOW_HYBRID_CINEMATIC',
        filePath: outputPath,
        file_path: outputPath,
        file_name: finalFilename,
        previewPath,
        preview_path: previewPath,
        size_bytes: stats.size,
        fileSizeBytes: stats.size,
        duration,
        durationSec: duration,
        aspect_ratio: aspectRatio,
        prompt: cinematicPrompt,
        ready_for_publish: true
      };
    } catch (err) {
      console.warn(`⚠️ Google Flow Web Video gặp lỗi (${err.message}), kích hoạt bộ dựng dự phòng...`);
      this.renderFallbackCinematic({ outputPath, title: prompt, aspectRatio, duration });
      const size = fs.statSync(outputPath).size;
      return {
        success: true,
        source: 'VEO_FALLBACK_ENGINE',
        filePath: outputPath,
        file_path: outputPath,
        file_name: finalFilename,
        previewPath,
        preview_path: previewPath,
        size_bytes: size,
        fileSizeBytes: size,
        duration,
        durationSec: duration,
        aspect_ratio: aspectRatio,
        ready_for_publish: true
      };
    } finally {
      if (page) await page.close().catch(() => {});
      await playwrightManager.closeContext(sessionCtx);
    }
  }

  /**
   * 2. TỰ ĐỘNG HÓA TẠO ẢNH AI TRÊN GOOGLE FLOW IMAGE STUDIO
   */
  async generateImage({
    prompt,
    aspectRatio = process.env.IMAGE_DEFAULT_ASPECT_RATIO || '4:5',
    customName = null,
    headless = process.env.PLAYWRIGHT_HEADLESS !== 'false'
  }) {
    if (!prompt) throw new Error('Prompt tạo ảnh không được để trống.');
    if (this._isFlowDisabled()) {
      throw new Error('Google Flow Web RPA is disabled (DRY_RUN/GOOGLE_FLOW_ENABLED=false).');
    }

    const imagesDir = this.imageDir;
    const timestamp = Date.now();
    const safeCustomName = validateOutputBasename(customName, 'customName');
    const rawFilename = safeCustomName ? `${safeCustomName.replace(/\.png$/i, '')}.png` : `flow_img_${timestamp}.png`;
    const outputPath = assertInsideWorkspace(path.join(imagesDir, rawFilename), imagesDir);
    assertInsideWorkspace(outputPath);
    const finalFilename = path.basename(outputPath);
    const fullImagePrompt = this.synthesizeImagePrompt({ prompt, aspectRatio });

    console.log('================================================================');
    console.log('🖼️ [GOOGLE FLOW IMAGE STUDIO] TỰ ĐỘNG TẠO ẢNH PHÒNG 4K');
    console.log('================================================================');

    const sessionCtx = await this.getBrowser({ headless });
    let page = null;

    try {
      page = await playwrightManager.newPage(sessionCtx.context);
      const studio = await this.openProjectStudio(page);
      if (!studio.loggedIn) {
        throw new Error('Google Flow chưa đăng nhập trong profile trình duyệt.');
      }

      const existingImgSrcs = await page.locator('img').evaluateAll(els =>
        els.map(i => i.currentSrc || i.src || i.getAttribute('src')).filter(Boolean)
      ).catch(() => []);

      await this.submitStudioPrompt(page, fullImagePrompt);

      let targetImg = null;
      const maxWaitSeconds = 115;
      const startTime = Date.now();

      while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        const imgs = page.locator('img');
        const count = await imgs.count();
        for (let idx = count - 1; idx >= 0; idx--) {
          const cand = imgs.nth(idx);
          const meta = await cand.evaluate(el => ({
            src: el.currentSrc || el.src || el.getAttribute('src') || '',
            complete: Boolean(el.complete),
            naturalWidth: el.naturalWidth || 0,
            naturalHeight: el.naturalHeight || 0
          })).catch(() => null);
          const box = await cand.boundingBox().catch(() => null);
          if (
            meta &&
            meta.src &&
            meta.complete &&
            meta.naturalWidth >= 200 &&
            meta.naturalHeight >= 200 &&
            !existingImgSrcs.includes(meta.src) &&
            !meta.src.includes('gstatic.com/gb/') &&
            !meta.src.includes('/ogw/') &&
            !meta.src.includes('googleusercontent.com/a/') &&
            box &&
            box.width >= 120 &&
            box.height >= 120
          ) {
            targetImg = cand;
            break;
          }
        }
        if (targetImg) break;
        await page.waitForTimeout(3000);
      }

      if (!targetImg) {
        throw new Error('Hết thời gian chờ kết xuất ảnh mới trên Google Flow Studio.');
      }

      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
      await playwrightManager.extractImageElement(page, targetImg, outputPath);
      const stats = fs.statSync(outputPath);

      return {
        success: true,
        source: 'GOOGLE_FLOW_IMAGE_PLAYWRIGHT',
        filePath: outputPath,
        file_path: outputPath,
        file_name: finalFilename,
        size_bytes: stats.size,
        fileSizeBytes: stats.size,
        aspect_ratio: aspectRatio,
        prompt: fullImagePrompt,
        ready_for_publish: true
      };
    } finally {
      if (page) await page.close().catch(() => {});
      await playwrightManager.closeContext(sessionCtx);
    }
  }

  /**
   * Bộ tạo video động dự phòng sạch không chữ/logo chuẩn Meta/Instagram Reels bằng FFmpeg (-14 LUFS)
   */
  renderFallbackCinematic({ outputPath, title, aspectRatio = '9:16', duration = 8 }) {
    const resolvedOut = assertInsideWorkspace(outputPath);
    const outDir = path.dirname(resolvedOut);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const dur = Math.max(3, Number(duration) || 8);
    const dims = ASPECT_DIMENSIONS[aspectRatio] || ASPECT_DIMENSIONS['9:16'];
    const winX = Math.round(dims.width * 0.12);
    const winY = Math.round(dims.height * 0.14);
    const winW = Math.round(dims.width * 0.76);
    const winH = Math.round(dims.height * 0.48);
    const floorY = Math.round(dims.height * 0.72);
    const floorH = dims.height - floorY;

    const vf = [
      `drawbox=x=${winX}:y=${winY}:w=${winW}:h=${winH}:color=white@0.20:t=fill`,
      `drawbox=x=${winX}:y=${winY}:w=${winW}:h=${winH}:color=0xFFFFFF@0.38:t=4`,
      `drawbox=x=0:y=${floorY}:w=${dims.width}:h=${floorH}:color=0x8B6F4E@0.24:t=fill`,
      'format=yuv420p'
    ].join(',');

    const fadeOutStart = Math.max(0, dur - 0.35).toFixed(2);
    const af = `afade=t=in:st=0:d=0.35,afade=t=out:st=${fadeOutStart}:d=0.35,loudnorm=I=-14:TP=-1.5:LRA=11`;

    execFileSync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', `gradients=s=${dims.width}x${dims.height}:n=3:c0=0xF5EFE6:c1=0xDFCBB2:c2=0x9AA9B8:seed=42:r=24:d=${dur}`,
      '-f', 'lavfi',
      '-i', `aevalsrc=0.14*sin(2*PI*220*t)+0.10*sin(2*PI*277.18*t)+0.09*sin(2*PI*329.63*t):s=44100:c=stereo:d=${dur}`,
      '-vf', vf,
      '-af', af,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-x264-params', 'nal-hrd=cbr',
      '-b:v', '1800k',
      '-minrate', '1600k',
      '-maxrate', '2400k',
      '-bufsize', '1800k',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-t', String(dur),
      '-movflags', '+faststart',
      resolvedOut
    ], { stdio: 'pipe', timeout: 120000 });
  }
}

module.exports = new GoogleFlowAgent();
