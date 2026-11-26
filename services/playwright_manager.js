'use strict';

/**
 * PLAYWRIGHT BROWSER AUTOMATION ENGINE FOR AI AGENT COMPANY (D:\Facebook)
 *
 * Động cơ trình duyệt trung tâm cô lập 100% tại D:\Facebook:
 * - Khóa chính xác vào Persistent Profile (`CHROME_USER_DATA_DIR` + `--profile-directory=Profile 38`).
 * - Hỗ trợ Dual Mode: CDP (Port 9222) hoặc Persistent Chrome Context độc lập.
 * - Anti-Detect Stealth: Ẩn `navigator.webdriver` và giả lập môi trường tiếng Việt tự nhiên.
 * - Hỗ trợ trích xuất cả Video (Blob/HTTP MP4) và Hình ảnh (Blob/HTTP/Base64/Canvas PNG) từ Google Flow / Veo.
 */

require('../lib/env-loader');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

class PlaywrightManager {
  constructor() {
    this.chromePath = process.env.CHROME_EXECUTABLE_PATH || 'C:\\Users\\ASUS\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
    this.userDataDir = path.resolve(process.env.CHROME_USER_DATA_DIR || 'D:/Facebook/data/browser_profile');
    this.profileDirectory = process.env.CHROME_PROFILE_DIRECTORY || 'Profile 38';
    this.outputDir = path.resolve('D:/Facebook/data/videos');
    this.imageDir = path.resolve('D:/Facebook/data/images');
    this.screenshotDir = path.resolve('D:/Facebook/data/screenshots');
    this.remoteDebuggingPort = parseInt(process.env.CHROME_REMOTE_DEBUGGING_PORT || '9222', 10);
    this.defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    this._batchSession = null;
    this._batchDepth = 0;

    [this.userDataDir, this.outputDir, this.imageDir, this.screenshotDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  _isSessionAlive(session) {
    if (!session || !session.context) return false;
    try {
      session.context.pages();
      return true;
    } catch (e) {
      return false;
    }
  }

  async beginBatchSession({
    headless = process.env.PLAYWRIGHT_HEADLESS !== 'false',
    preferCdp = process.env.PLAYWRIGHT_PREFER_CDP !== 'false',
    profileDirectory = null
  } = {}) {
    this._batchDepth += 1;
    const targetProfile = profileDirectory || this.profileDirectory;
    if (this._isSessionAlive(this._batchSession) && this._batchSession.profileDirectory === targetProfile) {
      return { ...this._batchSession, isBatchShared: true };
    }
    this._batchSession = await this._launchOrAttachContext({ headless, preferCdp, profileDirectory: targetProfile });
    return { ...this._batchSession, isBatchShared: true };
  }

  async endBatchSession({ force = false } = {}) {
    if (!force && this._batchDepth > 0) {
      this._batchDepth -= 1;
    }
    if ((force || this._batchDepth <= 0) && this._batchSession) {
      const session = this._batchSession;
      this._batchSession = null;
      this._batchDepth = 0;
      await this._forceCloseContext(session);
    }
  }

  async getContext({
    headless = process.env.PLAYWRIGHT_HEADLESS !== 'false',
    preferCdp = process.env.PLAYWRIGHT_PREFER_CDP !== 'false',
    profileDirectory = null
  } = {}) {
    const targetProfile = profileDirectory || this.profileDirectory;

    if (this._batchDepth > 0 && this._isSessionAlive(this._batchSession) && this._batchSession.profileDirectory === targetProfile) {
      return { ...this._batchSession, isBatchShared: true };
    }

    return await this._launchOrAttachContext({ headless, preferCdp, profileDirectory: targetProfile });
  }

  async _launchOrAttachContext({
    headless = process.env.PLAYWRIGHT_HEADLESS !== 'false',
    preferCdp = process.env.PLAYWRIGHT_PREFER_CDP !== 'false',
    profileDirectory = null
  } = {}) {
    const targetProfile = profileDirectory || this.profileDirectory;

    if (preferCdp) {
      try {
        const browser = await chromium.connectOverCDP(`http://127.0.0.1:${this.remoteDebuggingPort}`);
        console.log(`⚡ [Playwright] Đã kết nối Chrome qua CDP (Port ${this.remoteDebuggingPort}).`);
        const contexts = browser.contexts();
        const context = contexts.length > 0 ? contexts[0] : await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: this.defaultUserAgent
        });
        return { browser, context, isAttached: true, profileDirectory: targetProfile };
      } catch (e) {
        // Port 9222 chưa chạy sẵn -> tự động khởi chạy Persistent Context
      }
    }

    console.log(`🌐 [Playwright] Mở Persistent Chrome [${this.userDataDir} | ${targetProfile}] (Headless: ${headless})...`);

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--ignore-certificate-errors',
      '--window-size=1920,1080'
    ];

    if (targetProfile) {
      launchArgs.push(`--profile-directory=${targetProfile}`);
    }

    const hasRealChrome = fs.existsSync(this.chromePath);
    const contextOptions = {
      headless,
      viewport: { width: 1920, height: 1080 },
      locale: 'vi-VN',
      timezoneId: process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
      args: launchArgs,
      ignoreHTTPSErrors: true
    };

    if (hasRealChrome) {
      // Dùng trực tiếp User-Agent gốc của Google Chrome thật để khớp 100% với Sec-CH-UA Client Hints (tránh Meta nghi ngờ giả lập)
      contextOptions.executablePath = this.chromePath;
    } else {
      contextOptions.userAgent = this.defaultUserAgent;
    }

    const context = await chromium.launchPersistentContext(this.userDataDir, contextOptions);
    return { browser: null, context, isAttached: false, profileDirectory: targetProfile };
  }

  async _forceCloseContext({ browser, context, isAttached } = {}) {
    try {
      if (!isAttached && context) {
        await context.close().catch(() => {});
      } else if (isAttached && browser) {
        await browser.close().catch(() => {});
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  async closeContext(sessionCtx = {}) {
    if (sessionCtx && sessionCtx.isBatchShared) {
      return;
    }
    await this._forceCloseContext(sessionCtx);
  }

  async newPage(context) {
    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['vi-VN', 'vi', 'en-US', 'en']
      });
    });

    return page;
  }

  async extractSemanticTree(page) {
    if (page.locator('body').ariaSnapshot) {
      return await page.locator('body').ariaSnapshot();
    }
    return await page.content();
  }

  async takeScreenshot(page, filename = null) {
    const name = filename || `screenshot_${Date.now()}.png`;
    const fullPath = path.isAbsolute(name) ? name : path.join(this.screenshotDir, name);
    await page.screenshot({ path: fullPath, fullPage: false });
    return fullPath;
  }

  async smartClick(page, selectorOrText, timeout = 10000) {
    try {
      if (!selectorOrText.includes('[') && !selectorOrText.includes('.')) {
        const textLocator = page.getByText(selectorOrText).first();
        if (await textLocator.isVisible({ timeout: 2000 }).catch(() => false)) {
          await textLocator.click({ timeout });
          return true;
        }
      }

      const locator = page.locator(selectorOrText).first();
      await locator.waitFor({ state: 'visible', timeout });
      await locator.click();
      return true;
    } catch (err) {
      return await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          el.scrollIntoView();
          el.click();
          return true;
        }
        return false;
      }, selectorOrText);
    }
  }

  async smartFill(page, selector, text, { clear = true, delay = 10 } = {}) {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await locator.click();

    if (clear) {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await page.keyboard.press('Backspace');
    }

    if (delay > 0) {
      await page.keyboard.type(text, { delay });
    } else {
      await locator.fill(text);
    }
  }

  _isValidMediaBuffer(buffer, contentType = '') {
    if (!buffer || buffer.length < 256) return false;
    const ct = (contentType || '').toLowerCase();
    if (ct.includes('text/html') || ct.includes('application/xhtml')) return false;

    const head = buffer.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
    if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<head') || head.startsWith('{"error"')) {
      return false;
    }
    return true;
  }

  _upgradeGoogleImageUrl(src) {
    if (!src || !src.startsWith('http')) return [];
    const candidates = [];
    // Googleusercontent / Google Labs image URLs often end with =w512, =s512, =w384-h512-rw -> =s0 returns original full-res PNG/JPEG
    if (/googleusercontent\.com|ggpht\.com|labs\.google|flow\.google/i.test(src) && /=[whs]\d+[^/?#]*$/i.test(src)) {
      candidates.push(src.replace(/=[whs]\d+[^/?#]*$/i, '=s0'));
    }
    candidates.push(src);
    return [...new Set(candidates)];
  }

  _normalizeImageFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return filePath;
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') return filePath;

    try {
      const buf = fs.readFileSync(filePath);
      const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
      const isJpeg = buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
      const needFormatFix = (ext === '.png' && !isPng) || ((ext === '.jpg' || ext === '.jpeg') && !isJpeg);

      const probeJson = execFileSync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'json',
        filePath
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const stream = (JSON.parse(probeJson).streams || [])[0] || {};
      const width = stream.width || 0;

      if (!needFormatFix && width >= 1080) {
        return filePath;
      }

      const tmpOut = `${filePath}.norm${ext}`;
      const vf = width > 0 && width < 1080
        ? 'scale=1080:-2:flags=lanczos,unsharp=3:3:0.35:3:3:0.0'
        : 'null';

      execFileSync('ffmpeg', [
        '-y',
        '-i', filePath,
        '-vf', vf,
        '-frames:v', '1',
        tmpOut
      ], { stdio: 'ignore' });

      if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 2048) {
        fs.renameSync(tmpOut, filePath);
      } else if (fs.existsSync(tmpOut)) {
        fs.unlinkSync(tmpOut);
      }
    } catch (e) {
      // Giữ nguyên file gốc nếu ffmpeg không khả dụng
    }
    return filePath;
  }

  async extractMediaBlob(page, mediaSelector, destinationPath) {
    const locator = typeof mediaSelector === 'string' ? page.locator(mediaSelector).first() : mediaSelector;
    const src = await locator.evaluate(el => {
      if (el.srcset) {
        const parts = el.srcset.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
        if (parts.length > 0) return parts[parts.length - 1];
      }
      return el.currentSrc || el.src || el.getAttribute('src');
    }).catch(() => null);
    if (!src) return null;

    if (src.startsWith('data:')) {
      const metaAndData = src.split(',');
      const meta = (metaAndData[0] || '').toLowerCase();
      const base64Part = metaAndData[1];
      if (base64Part && (meta.includes('image/') || meta.includes('video/'))) {
        const buf = Buffer.from(base64Part, 'base64');
        if (this._isValidMediaBuffer(buf, meta)) {
          fs.writeFileSync(destinationPath, buf);
          return destinationPath;
        }
      }
      return null;
    }

    if (src.startsWith('http')) {
      const urlCandidates = this._upgradeGoogleImageUrl(src);

      // 1. Tải qua Playwright Authenticated Context Request (mang đầy đủ Cookie Profile 38)
      for (const candidateUrl of urlCandidates) {
        try {
          const response = await page.context().request.get(candidateUrl, {
            headers: { Referer: page.url() },
            timeout: 30000
          });
          if (response.ok()) {
            const contentType = response.headers()['content-type'] || '';
            const buf = await response.body();
            if (this._isValidMediaBuffer(buf, contentType)) {
              fs.writeFileSync(destinationPath, buf);
              return destinationPath;
            }
          }
        } catch (e) {
          // Thử candidate tiếp theo
        }
      }

      // 2. Dự phòng: Tải ngay trong ngữ cảnh trang (credentials: include)
      try {
        const inPageResult = await page.evaluate(async (targetUrl) => {
          const resp = await fetch(targetUrl, { credentials: 'include' });
          if (!resp.ok) return null;
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.includes('text/html')) return null;
          const blob = await resp.blob();
          return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({
              contentType: blob.type || contentType,
              base64: (reader.result || '').split(',')[1] || ''
            });
            reader.readAsDataURL(blob);
          });
        }, src);

        if (inPageResult && inPageResult.base64) {
          const buf = Buffer.from(inPageResult.base64, 'base64');
          if (this._isValidMediaBuffer(buf, inPageResult.contentType)) {
            fs.writeFileSync(destinationPath, buf);
            return destinationPath;
          }
        }
      } catch (e) {
        // Bỏ qua nếu bị chặn CORS
      }
      return null;
    }

    if (src.startsWith('blob:')) {
      const blobResult = await page.evaluate(async (blobUrl) => {
        const resp = await fetch(blobUrl);
        const blob = await resp.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve({
            contentType: blob.type || '',
            base64: (reader.result || '').split(',')[1] || ''
          });
          reader.readAsDataURL(blob);
        });
      }, src).catch(() => null);

      if (blobResult && blobResult.base64) {
        const buf = Buffer.from(blobResult.base64, 'base64');
        if (this._isValidMediaBuffer(buf, blobResult.contentType)) {
          fs.writeFileSync(destinationPath, buf);
          return destinationPath;
        }
      }
    }

    return null;
  }

  async extractImageElement(page, imgLocator, destinationPath) {
    // Đảm bảo ảnh đã giải mã hoàn tất trên trình duyệt trước khi trích xuất
    for (let attempt = 0; attempt < 10; attempt++) {
      const ready = await imgLocator.evaluate(
        el => Boolean(el && el.complete && el.naturalWidth >= 120 && el.naturalHeight >= 120)
      ).catch(() => false);
      if (ready) break;
      await page.waitForTimeout(500);
    }

    // Bước 1: Tải file gốc độ phân giải tối đa qua phiên đã xác thực
    try {
      const extracted = await this.extractMediaBlob(page, imgLocator, destinationPath);
      if (extracted && fs.existsSync(destinationPath) && fs.statSync(destinationPath).size > 2048) {
        return this._normalizeImageFile(destinationPath);
      }
    } catch (e) {
      // Tiếp tục sang bước 2
    }

    // Bước 2: Trích xuất lossless PNG từ HTML5 Canvas ở kích thước thật (naturalWidth x naturalHeight)
    try {
      const canvasBase64 = await imgLocator.evaluate((img) => {
        if (!img || !img.naturalWidth || !img.naturalHeight) return null;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        return dataUrl.split(',')[1] || null;
      }).catch(() => null);

      if (canvasBase64) {
        const buf = Buffer.from(canvasBase64, 'base64');
        if (this._isValidMediaBuffer(buf, 'image/png')) {
          fs.writeFileSync(destinationPath, buf);
          return destinationPath;
        }
      }
    } catch (e) {
      // Canvas bị tainted CORS -> sang bước 3
    }

    // Bước 3: Chụp trực tiếp phần tử ảnh bằng compositor của Playwright (luôn ra PNG chuẩn 100%)
    await imgLocator.scrollIntoViewIfNeeded().catch(() => {});
    await imgLocator.screenshot({ path: destinationPath, type: 'png' });
    return destinationPath;
  }
}

module.exports = new PlaywrightManager();
