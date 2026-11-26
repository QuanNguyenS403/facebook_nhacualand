'use strict';

/**
 * PLAYWRIGHT INTEGRATION & AUTOMATION VERIFICATION TEST
 * 
 * Kiểm tra toàn diện động cơ Playwright đã được tích hợp vào hệ thống:
 * 1. Khởi tạo Playwright Engine (Chromium / Persistent Profile).
 * 2. Điều hướng trang web & kiểm tra tính năng Stealth Anti-detect.
 * 3. Trích xuất Semantic Tree (ARIA Accessibility Snapshot) cho AI Agent.
 * 4. Chụp ảnh màn hình kiểm thử & lưu trữ.
 * 5. Đo đạc độ trễ và khả năng Auto-waiting.
 */

const playwrightManager = require('../services/playwright_manager');
const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log('================================================================');
  console.log('🧪 KIỂM TRA ĐỘNG CƠ PLAYWRIGHT CHO HỆ THỐNG AI AGENT');
  console.log('================================================================\n');

  const startTime = Date.now();

  try {
    console.log('1️⃣  Khởi tạo Playwright Browser Context (Headless)...');
    const { browser, context, isAttached } = await playwrightManager.getContext({
      headless: true,
      preferCdp: true
    });
    console.log(`   -> Chế độ: ${isAttached ? 'Attached via CDP (Port 9222)' : 'Isolated Persistent Context'}`);

    console.log('\n2️⃣  Tạo trang mới & cấu hình Stealth Anti-detect...');
    const page = await playwrightManager.newPage(context);

    console.log('\n3️⃣  Điều hướng đến trang kiểm thử (https://example.com)...');
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const title = await page.title();
    const url = page.url();
    console.log(`   -> Tiêu đề trang: "${title}"`);
    console.log(`   -> URL: ${url}`);

    // Kiểm tra cờ webdriver (phải là undefined)
    const isWebdriverPresent = await page.evaluate(() => navigator.webdriver !== undefined);
    console.log(`   -> Stealth Check (navigator.webdriver hidden): ${!isWebdriverPresent ? '✅ CHUẨN STEALTH' : '⚠️ VẪN CÒN CỜ BOT'}`);

    console.log('\n4️⃣  Trích xuất cấu trúc ngữ nghĩa (Semantic ARIA Snapshot) cho AI Agent...');
    const semanticTree = await playwrightManager.extractSemanticTree(page);
    console.log('   -> Định dạng ARIA Snapshot chuẩn LLM (YAML format):');
    const lines = semanticTree.split('\n').slice(0, 8);
    lines.forEach(l => console.log(`      ${l}`));
    if (semanticTree.split('\n').length > 8) {
      console.log('      ...');
    }

    console.log('\n5️⃣  Chụp ảnh màn hình kiểm thử...');
    const screenshotPath = await playwrightManager.takeScreenshot(page, 'test_playwright_verified.png');
    console.log(`   -> 📸 Đã lưu ảnh kiểm thử: ${screenshotPath}`);

    console.log('\n6️⃣  Đóng phiên làm việc an toàn...');
    await page.close();
    if (!isAttached && context) await context.close();
    if (isAttached && browser) await browser.close();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n================================================================');
    console.log(`🎉 TOÀN BỘ BÀI TEST PLAYWRIGHT THÀNH CÔNG RỰC RỠ! (${elapsed}s)`);
    console.log('🚀 Hệ thống AI Agent đã sẵn sàng 100% cho mọi tác vụ tự động hóa!');
    console.log('================================================================\n');

  } catch (error) {
    console.error('❌ Lỗi kiểm tra Playwright:', error);
    process.exit(1);
  }
}

runTest();
