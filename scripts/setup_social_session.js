'use strict';

/**
 * UNIFIED SESSION SETUP FOR PLAYWRIGHT (FANPAGE + INSTAGRAM + THREADS + GOOGLE FLOW/VEO)
 * Thương hiệu: Nhà Của Land (nhacualand.com) — Chỉ duy nhất tại D:\Facebook
 *
 * Mở trình duyệt Chrome với đúng Persistent Profile (`Profile 38`) để đồng bộ 1 lần duy nhất:
 * 1. Facebook Fanpage (Nhacualand) & Meta Business Suite Composer
 * 2. Instagram (@nhacualand)
 * 3. Threads (@nhacualand — threads.com)
 * 4. Google Flow / Veo & Image Studio (flow.google.com)
 * 5. Meta for Developers (developers.facebook.com/apps)
 */

require('../lib/env-loader');
const playwrightManager = require('../services/playwright_manager');

async function setupSocialSession() {
  console.log('================================================================');
  console.log('🔑 ĐỒNG BỘ TOÀN QUYỀN TRÌNH DUYỆT CHO CÔNG TY AI AGENT (1 LẦN)');
  console.log('   Phạm vi: D:\\Facebook · Thương hiệu: Nhà Của Land (nhacualand.com)');
  console.log(`   Hồ sơ: ${playwrightManager.userDataDir} [${playwrightManager.profileDirectory}]`);
  console.log('================================================================\n');

  console.log('👉 Hướng dẫn kiểm tra nhanh trên 5 tab vừa mở:');
  console.log('   1. Tab Facebook / Business Suite: Chọn quyền Quản trị viên Fanpage "Nhacualand".');
  console.log('   2. Tab Instagram: Đảm bảo đang đăng nhập tài khoản "@nhacualand".');
  console.log('   3. Tab Threads: Đảm bảo đang đăng nhập tài khoản "@nhacualand".');
  console.log('   4. Tab Google Flow / Veo: Kiểm tra không gian làm việc tạo Video & Ảnh AI.');
  console.log('   5. Đóng cửa sổ trình duyệt để lưu vĩnh viễn phiên chạy ngầm 100%!\n');

  const sessionCtx = await playwrightManager.getContext({ headless: false, preferCdp: false });
  const { context } = sessionCtx;

  const urls = [
    'https://www.facebook.com/pages/?category=your_pages',
    'https://business.facebook.com/latest/composer',
    'https://www.instagram.com/',
    'https://www.threads.com/',
    process.env.GOOGLE_FLOW_URL || 'https://flow.google.com/'
  ];

  for (const url of urls) {
    const p = await playwrightManager.newPage(context);
    await p.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  console.log('⏳ Trình duyệt đang mở. Đóng cửa sổ khi bạn hoàn tất đăng nhập...');
  context.on('close', () => {
    console.log('\n🎉 ĐÃ LƯU VĨNH VIỄN TOÀN BỘ PHIÊN TRUY CẬP VÀO D:\\Facebook!');
    console.log('🚀 AI Agent đã sẵn sàng tự động đăng bài & tạo Video/Ảnh ngầm 100%.');
    process.exit(0);
  });
}

setupSocialSession().catch(err => {
  console.error('Lỗi khởi tạo session:', err.message);
  process.exit(1);
});
