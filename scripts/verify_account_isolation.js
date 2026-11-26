'use strict';

/**
 * NHÀ CỦA LAND — STANDALONE WORKSPACE & ENVIRONMENT ISOLATION AUDITOR
 * Phạm vi kiểm toán: CHỈ DUY NHẤT TẠI D:\Facebook (100% Standalone)
 *
 * Xác minh 4 tiêu chuẩn bắt buộc:
 * 1. Cô lập vật lý & cấu hình 100% trong D:\Facebook (không tham chiếu thư mục ngoài, đúng email mặc định).
 * 2. Chế độ tự động hóa 100% không cần duyệt tay (AUTONOMOUS_MODE=FULL_100, REQUIRE_HUMAN_APPROVAL=false).
 * 3. Sẵn sàng toàn quyền truy cập 3 kênh xuất bản: Meta Fanpage, Instagram, Threads.
 * 4. Sẵn sàng toàn quyền công cụ sáng tạo AI: Google Flow / Veo Video & Google Flow / Nano Banana Image.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const playwrightManager = require('../services/playwright_manager');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

async function auditStandaloneEnvironment() {
  console.log('================================================================');
  console.log('🛡️  KIỂM TOÁN CÔ LẬP & QUYỀN HẠN CÔNG TY AI AGENT (D:\\Facebook)');
  console.log('    Thương hiệu: Nhà Của Land (https://nhacualand.com)');
  console.log('================================================================\n');

  const checks = [];

  // 1. Kiểm tra cấu hình cô lập & chế độ tự động 100% trong .env
  const adminEmail = process.env.ADMIN_EMAIL || '';
  const emailAllowed = ['quannguyentop1lux@gmail.com', 'ducquan16102006@gmail.com'].includes(adminEmail);
  const isFullAutonomous =
    process.env.AUTONOMOUS_MODE === 'FULL_100' &&
    process.env.AUTO_PUBLISH === 'true' &&
    process.env.REQUIRE_HUMAN_APPROVAL === 'false' &&
    process.env.DRY_RUN === 'false';

  const targets = (process.env.PUBLISH_TARGETS || '').split(',').map(s => s.trim());
  const allChannelsEnabled =
    targets.includes('facebook') &&
    targets.includes('instagram') &&
    targets.includes('threads');

  const allAiToolsEnabled =
    !!process.env.GEMINI_API_KEY &&
    process.env.GOOGLE_FLOW_ENABLED === 'true' &&
    process.env.GOOGLE_VEO_ENABLED === 'true' &&
    process.env.GOOGLE_IMAGE_ENABLED === 'true';

  checks.push({
    name: 'Phạm vi thư mục độc lập (D:\\Facebook)',
    pass: WORKSPACE_ROOT.toLowerCase() === 'd:\\facebook',
    detail: WORKSPACE_ROOT
  });
  checks.push({
    name: 'Email quản trị chuẩn quy định',
    pass: emailAllowed,
    detail: adminEmail || 'Chưa đặt'
  });
  checks.push({
    name: 'Tự động hóa 100% không qua duyệt tay',
    pass: isFullAutonomous,
    detail: `AUTONOMOUS_MODE=${process.env.AUTONOMOUS_MODE}, AUTO_PUBLISH=${process.env.AUTO_PUBLISH}, REQUIRE_HUMAN_APPROVAL=${process.env.REQUIRE_HUMAN_APPROVAL}`
  });
  checks.push({
    name: 'Toàn quyền 3 kênh (Meta Fanpage + Instagram + Threads)',
    pass: allChannelsEnabled,
    detail: `PUBLISH_TARGETS=${process.env.PUBLISH_TARGETS}`
  });
  checks.push({
    name: 'Toàn quyền AI Video & Image (Google Flow / Veo / Nano Banana)',
    pass: allAiToolsEnabled,
    detail: `Text=${process.env.GEMINI_MODEL} | Image=${process.env.GEMINI_IMAGE_MODEL} | Video=${process.env.GEMINI_VIDEO_MODEL} | Flow=${process.env.GOOGLE_FLOW_URL}`
  });

  // 2. Kiểm tra Persistent Chrome Profile (Profile 38)
  console.log('🔍 Đang kiểm tra Persistent Chrome Profile & Cookies thực tế...');
  let cookieSummary = { fbUid: null, igUid: null, threadsCookies: 0, googleFlowAuth: false };

  try {
    const sessionCtx = await playwrightManager.getContext({ headless: true, preferCdp: false });
    const cookies = await sessionCtx.context.cookies([
      'https://www.facebook.com',
      'https://www.instagram.com',
      'https://www.threads.com',
      'https://www.threads.net',
      'https://flow.google.com',
      'https://accounts.google.com'
    ]);

    cookieSummary = {
      fbUid: cookies.find(c => c.name === 'c_user' && c.domain.includes('facebook'))?.value || null,
      igUid: cookies.find(c => c.name === 'ds_user_id' && c.domain.includes('instagram'))?.value || null,
      threadsCookies: cookies.filter(c => c.domain.includes('threads')).length,
      googleFlowAuth: cookies.some(c => (c.name === 'SID' || c.name === '__Secure-1PSID') && c.domain.includes('google'))
    };

    await playwrightManager.closeContext(sessionCtx);
  } catch (err) {
    console.warn(`   ⚠️ Không đọc được cookies trực tiếp (có thể trình duyệt đang mở): ${err.message}`);
  }

  checks.push({
    name: `Persistent Chrome Profile [${process.env.CHROME_PROFILE_DIRECTORY || 'Profile 38'}]`,
    pass: fs.existsSync(playwrightManager.userDataDir),
    detail: `Google Flow Auth: ${cookieSummary.googleFlowAuth ? 'SẴN SÀNG' : 'Chưa lưu'} | FB Session UID: ${cookieSummary.fbUid || 'Chưa lưu'} | IG Session UID: ${cookieSummary.igUid || 'Chưa lưu'} | Threads Cookies: ${cookieSummary.threadsCookies}`
  });

  checks.push({
    name: 'Khóa bảo vệ tài sản thương hiệu (Brand Asset Guard)',
    pass: process.env.STRICT_BRAND_ASSET_GUARD !== 'false',
    detail: `Chỉ xuất bản lên tài sản khớp thương hiệu "${process.env.BRAND_FACEBOOK_PAGE}" / "@${process.env.BRAND_INSTAGRAM}" / "@${process.env.BRAND_THREADS}"`
  });

  console.log('\n----------------------------------------------------------------');
  console.log('📋 KẾT QUẢ KIỂM TOÁN HỆ THỐNG CÔNG TY AI AGENT:');
  console.log('----------------------------------------------------------------');
  let allPass = true;
  for (const item of checks) {
    if (!item.pass) allPass = false;
    console.log(`${item.pass ? '✅' : '❌'} ${item.name}`);
    console.log(`   └─ ${item.detail}`);
  }
  console.log('----------------------------------------------------------------');
  console.log(allPass
    ? '🎉 HỆ THỐNG ĐẠT CHUẨN 100%: ĐỘC LẬP TUYỆT ĐỐI TẠI D:\\Facebook & SẴN SÀNG TỰ ĐỘNG HÓA!'
    : '⚠️ VUI LÒNG KIỂM TRA CÁC MỤC ĐÁNH DẤU Ở TRÊN.');
  console.log('================================================================\n');
}

auditStandaloneEnvironment().catch(err => {
  console.error('Lỗi kiểm toán:', err);
  process.exit(1);
});
