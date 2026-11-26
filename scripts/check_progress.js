'use strict';

/**
 * CLI MONITOR: CHECK PROGRESS & ASSET VAULTS (D:\Facebook)
 * Báo cáo toàn diện trạng thái 3 kênh (Meta Fanpage + Instagram + Threads),
 * kho Ảnh AI (`data/images`), kho Video Room Tour (`data/videos`), lịch tuần và bằng chứng xuất bản.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const fbApi = require('../lib/facebook-api');

async function check() {
  console.log('================================================================');
  console.log('📊 BÁO CÁO TIẾN ĐỘ CÔNG TY AI AGENT NHÀ CỦA LAND (D:\\Facebook)');
  console.log('================================================================\n');

  console.log('1. CHẾ ĐỘ VẬN HÀNH & KẾT NỐI ĐA KÊNH (FANPAGE + INSTAGRAM + THREADS):');
  console.log(`   - Chế độ tự động: ${process.env.AUTONOMOUS_MODE || 'FULL_100'} (Duyệt thủ công: ${process.env.REQUIRE_HUMAN_APPROVAL === 'true' ? 'Bật' : 'TẮT 100%'})`);
  console.log(`   - Kênh kích hoạt: ${process.env.PUBLISH_TARGETS || 'facebook,instagram,threads'}`);
  console.log(`   - Hồ sơ trình duyệt: ${process.env.CHROME_USER_DATA_DIR} [${process.env.CHROME_PROFILE_DIRECTORY || 'Profile 38'}]`);
  try {
    const tokenInfo = await fbApi.verifyToken();
    if (tokenInfo.valid) {
      console.log(`   - Meta Graph API Token: ✅ HỢP LỆ (Hạn: ${tokenInfo.expires_at})`);
      console.log(`   - Quyền Fanpage: ${tokenInfo.can_auto_publish_facebook ? '✅' : '⚠️'} | Quyền Instagram API: ${tokenInfo.can_auto_publish_instagram ? '✅' : '⚠️'}`);
    } else {
      console.log('   - Meta/IG/Threads API Token: ℹ️ Chưa nhập Token -> Đang chạy trực tiếp qua Playwright Persistent RPA.');
    }
  } catch (e) {
    console.log('   - Ghi chú API:', e.message);
  }

  console.log('\n2. KHO ẢNH AI KIẾN TRÚC 4K (data/images):');
  const imageDir = path.resolve(__dirname, '../data/images');
  if (fs.existsSync(imageDir)) {
    const imgs = fs.readdirSync(imageDir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    console.log(`   - Tổng số ảnh AI sẵn có: ${imgs.length} ảnh`);
    imgs.slice(-5).forEach(f => {
      const stat = fs.statSync(path.join(imageDir, f));
      console.log(`     * ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
    });
  } else {
    console.log('   - Chưa có ảnh nào.');
  }

  console.log('\n3. KHO VIDEO ROOM TOUR GOOGLE FLOW / VEO (data/videos):');
  const videoDir = path.resolve(__dirname, '../data/videos');
  if (fs.existsSync(videoDir)) {
    const vids = fs.readdirSync(videoDir).filter(f => f.endsWith('.mp4'));
    console.log(`   - Tổng số video Room Tour 9:16 sẵn có: ${vids.length} video`);
    vids.slice(-5).forEach(f => {
      const stat = fs.statSync(path.join(videoDir, f));
      console.log(`     * ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
    });
  }

  console.log('\n4. LỊCH NỘI DUNG TỰ ĐỘNG TRONG TUẦN (data/scheduled_calendar.json):');
  const calPath = path.resolve(__dirname, '../data/scheduled_calendar.json');
  if (fs.existsSync(calPath)) {
    const cal = JSON.parse(fs.readFileSync(calPath, 'utf8'));
    console.log(`   - Tổng số slot đã lên lịch: ${cal.plan?.length || 0} bài`);
    (cal.plan || []).slice(0, 3).forEach(p => {
      console.log(`     * [${p.day} ${p.slot_time}] ${p.format}: "${p.concept_hook}"`);
    });
  }

  console.log('\n5. NHẬT KÝ & BẰNG CHỨNG XUẤT BẢN GẦN NHẤT (data/publish_history.json):');
  const histPath = path.resolve(__dirname, '../data/publish_history.json');
  if (fs.existsSync(histPath)) {
    const hist = JSON.parse(fs.readFileSync(histPath, 'utf8'));
    console.log(`   - Tổng số lượt đăng thành công: ${hist.length} lượt`);
    hist.slice(-5).forEach(h => {
      console.log(`     * [${h.timestamp}] [${(h.platform || '').toUpperCase()}] ${h.summary} (${h.engine})`);
      if (h.proofScreenshot) console.log(`       📸 Bằng chứng: ${h.proofScreenshot}`);
    });
  }

  console.log('\n================================================================');
}

check();
