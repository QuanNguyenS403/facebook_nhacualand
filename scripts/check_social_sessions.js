'use strict';

/**
 * LIVE SESSION & BRAND ASSET DIAGNOSTICS (GOOGLE FLOW/VEO + FANPAGE + INSTAGRAM + THREADS)
 * Phạm vi: Chỉ duy nhất tại D:\Facebook — Sử dụng Persistent Profile 38
 */

require('../lib/env-loader');
const playwrightManager = require('../services/playwright_manager');
const fbApi = require('../lib/facebook-api');

async function checkSessions() {
  console.log('================================================================');
  console.log('🔍 KIỂM TRA PHIÊN TRUY CẬP THỰC TẾ (GRAPH API + PLAYWRIGHT)');
  console.log(`   Profile: ${playwrightManager.userDataDir} [${playwrightManager.profileDirectory}]`);
  console.log('================================================================\n');

  const tokenStatus = await fbApi.verifyToken().catch(() => ({ valid: false }));
  if (tokenStatus.valid) {
    console.log(`0. Meta Graph API Token:      ✅ ĐÃ XÁC THỰC (App: ${tokenStatus.application || tokenStatus.app_id} | Page: ${tokenStatus.page_name} [${tokenStatus.page_id}])`);
  }

  const expectedIg = (process.env.BRAND_INSTAGRAM || 'nhacualand').toLowerCase().replace(/^@/, '');
  const expectedTh = (process.env.BRAND_THREADS || 'nhacualand').toLowerCase().replace(/^@/, '');

  const sessionCtx = await playwrightManager.getContext({ headless: true });
  const page = await playwrightManager.newPage(sessionCtx.context);

  try {
    // 1. Google Flow / Veo & Image Studio
    const flowUrlTarget = process.env.GOOGLE_FLOW_URL || 'https://flow.google.com/';
    await page.goto(flowUrlTarget, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
    await page.waitForTimeout(2500);
    const flowUrl = page.url();
    const flowText = await page.locator('body').innerText().catch(() => '');
    const flowReady = !flowUrl.includes('/about') && !flowUrl.includes('accounts.google.com') && !flowUrl.includes('ServiceLogin');
    const flowPlan = flowText.includes('PRO') ? 'GOOGLE AI PRO' : 'Standard';
    console.log(`1. Google Flow / Veo & Image: ${flowReady ? `✅ ĐÃ ĐĂNG NHẬP (${flowPlan})` : '⚠️ CẦN ĐĂNG NHẬP'}`);

    // 2. Meta Facebook Fanpage
    await page.goto('https://www.facebook.com/pages/?category=your_pages', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
    await page.waitForTimeout(2500);
    const fbLoginCount = await page.locator('input[name="email"], #email').count();
    const fbText = await page.locator('body').innerText().catch(() => '');
    const fbReady = fbLoginCount === 0 && !page.url().includes('login');
    const hasNhacualandPage = /nhacualand|nhà cửa land|nhà của land/i.test(fbText) || Boolean(tokenStatus.valid && tokenStatus.page_id);
    console.log(`2. Meta Facebook Fanpage:     ${fbReady ? '✅ ĐÃ ĐĂNG NHẬP FB' : '⚠️ CHƯA ĐĂNG NHẬP'} | Fanpage Nhacualand (${process.env.META_PAGE_ID || ''}): ${hasNhacualandPage ? '✅ ĐÃ KẾT NỐI TRỰC TIẾP' : 'ℹ️ Chờ gắn/chọn Page Nhacualand'}`);

    // 3. Instagram
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
    await page.waitForTimeout(2500);
    const igLoginCount = await page.locator('input[name="username"]').count();
    const igReady = igLoginCount === 0 && !page.url().includes('accounts/login');
    const igHrefs = await page.locator('a[href]').evaluateAll(els =>
      els.map(e => e.getAttribute('href')).filter(h => h && /^\/[a-zA-Z0-9._]+\/$/.test(h) && !['/explore/', '/reels/', '/direct/', '/popular/'].includes(h))
    ).catch(() => []);
    const activeIgHandle = igHrefs[0] ? igHrefs[0].replace(/\//g, '').toLowerCase() : null;
    const igMatched = activeIgHandle === expectedIg;
    console.log(`3. Instagram:                 ${igReady ? (igMatched ? `✅ ĐÃ KẾT NỐI (@${expectedIg})` : `ℹ️ Đã đăng nhập nhưng chưa chuyển sang @${expectedIg} (Brand Guard đang bảo vệ)`) : '⚠️ CHƯA ĐĂNG NHẬP'}`);

    // 4. Threads
    await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
    await page.waitForTimeout(2500);
    const thHrefs = await page.locator('nav a[href*="@"], header a[href*="@"], a[href^="/@"]').evaluateAll(els =>
      els.map(e => e.getAttribute('href'))
    ).catch(() => []);
    const activeThHandle = thHrefs[0] ? thHrefs[0].replace(/^.*@/, '').replace(/\/.*$/, '').toLowerCase() : null;
    const thMatched = activeThHandle === expectedTh;
    console.log(`4. Threads (threads.com):     ${thMatched ? `✅ ĐÃ KẾT NỐI (@${expectedTh})` : 'ℹ️ Chờ đăng nhập @' + expectedTh}`);

    console.log('\n================================================================');
    return { tokenStatus, flowReady, fbReady, hasNhacualandPage, igReady, igMatched, thMatched };
  } finally {
    await page.close().catch(() => { });
    await playwrightManager.closeContext(sessionCtx);
  }
}

checkSessions().catch(err => {
  console.error('Lỗi kiểm tra phiên:', err.message);
  process.exit(1);
});
