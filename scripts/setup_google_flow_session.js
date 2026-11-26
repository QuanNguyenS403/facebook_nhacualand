'use strict';

/**
 * GOOGLE FLOW / VEO SESSION SETUP & VERIFICATION
 * 
 * Script hỗ trợ thiết lập phiên đăng nhập vĩnh viễn cho Google Flow:
 * - Mở trình duyệt Chrome với profile kiên định `D:\Facebook\data\browser_profile`.
 * - Điều hướng tới `https://flow.google.com/`.
 * - Sau khi người dùng đăng nhập 1 lần duy nhất, toàn bộ Cookie, Token và LocalStorage
 *   sẽ được lưu vĩnh viễn trong máy.
 * - Mọi lần tạo video sau đó, AI Agent sẽ tự động chạy ngầm (headless) mà không cần hỏi lại.
 */

const googleFlowAgent = require('../services/google_flow_agent');

async function setup() {
  console.log('================================================================');
  console.log('🔑 THIẾT LẬP PHIÊN LÀM VIỆC TỰ ĐỘNG CHO GOOGLE FLOW & VEO');
  console.log('================================================================\n');

  console.log('1. Đang kiểm tra phiên hiện tại...');
  try {
    const session = await googleFlowAgent.checkSession();
    if (session.ready) {
      console.log('🎉 Phiên làm việc Google Flow ĐÃ SẴN SÀNG! AI Agent có thể tự động tạo video ngầm.');
      return;
    }
  } catch (e) {
    console.log('   Chưa có phiên đăng nhập hợp lệ.');
  }

  console.log('\n2. Đang mở trình duyệt để bạn đăng nhập Google 1 LẦN DUY NHẤT...');
  console.log('👉 Cửa sổ Chrome sẽ xuất hiện trên màn hình.');
  console.log('👉 Hãy đăng nhập tài khoản Google của bạn tại trang Google Flow.');
  console.log('👉 Khi đã vào được giao diện Flow, bạn chỉ cần đóng cửa sổ trình duyệt.');
  console.log('👉 Từ đó về sau, AI Agent sẽ hoàn toàn tự động thực thi khi bạn ra lệnh.\n');

  const { browser, page } = await googleFlowAgent.openInteractiveSessionLogin();

  // Lắng nghe điều hướng để thông báo khi đăng nhập thành công
  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (!url.includes('/about') && !url.includes('accounts.google.com') && !url.includes('ServiceLogin')) {
        console.log('🎉 XÁC NHẬN THÀNH CÔNG: Đã đăng nhập vào Google Flow!');
        console.log('💾 Phiên làm việc đã được lưu vĩnh viễn vào profile hệ thống.');
      }
    }
  });
}

setup().catch(err => {
  console.error('Lỗi thiết lập:', err.message);
});
