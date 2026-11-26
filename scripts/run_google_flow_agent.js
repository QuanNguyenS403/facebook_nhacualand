'use strict';

/**
 * CLI EXECUTOR: RUN GOOGLE FLOW / VEO VIDEO AGENT FOR NHÀ CỦA LAND (nhacualand.com)
 * Phạm vi: Chỉ duy nhất tại D:\Facebook
 *
 * Tự động tạo video Room Tour 9:16 và phân phối đồng loạt lên cả 3 kênh:
 * Meta Facebook Reels + Instagram Reels + Threads Video!
 */

require('../lib/env-loader');
const fs = require('fs');
const videoEngine = require('../services/video-engine');
const { publishDirect } = require('../services/publish-executor');

async function main() {
  const args = process.argv.slice(2);
  let prompt = 'Căn hộ studio full nội thất Nhà Của Land - Không gian sống tiện nghi, thoáng mát';
  let aspectRatio = process.env.VIDEO_DEFAULT_ASPECT_RATIO || '9:16';
  let duration = parseInt(process.env.VIDEO_DEFAULT_DURATION_SECONDS || '8', 10);
  let shouldPublish = false;
  let checkSessionOnly = false;
  let mode = 'AUTO';
  let platform = 'all';
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prompt' || args[i] === '-p') prompt = args[++i];
    else if (args[i] === '--topic' || args[i] === '-t') prompt = args[++i];
    else if (args[i] === '--aspect' || args[i] === '-a') aspectRatio = args[++i];
    else if (args[i] === '--duration' || args[i] === '-d') duration = parseInt(args[++i], 10);
    else if (args[i] === '--publish') shouldPublish = true;
    else if (args[i] === '--check-session') checkSessionOnly = true;
    else if (args[i] === '--mode' || args[i] === '-m') mode = args[++i];
    else if (args[i] === '--platform') platform = args[++i];
    else if (args[i] === '--force') force = true;
  }

  console.log('================================================================');
  console.log('🤖 NHÀ CỦA LAND AI AGENT — GOOGLE FLOW / VEO / OMNI VIDEO ENGINE');
  console.log('================================================================');

  if (checkSessionOnly) {
    const session = await videoEngine.checkGoogleFlowSession();
    console.log('\n📊 TRẠNG THÁI PHIÊN GOOGLE FLOW STUDIO:');
    console.log(`- Hồ sơ Chrome: ${session.profile}`);
    console.log(`- Gói dịch vụ: ${session.plan}`);
    console.log(`- Sẵn sàng tự động 100%: ${session.ready ? '✅ SẴN SÀNG' : '⚠️ CẦN ĐĂNG NHẬP 1 LẦN'}`);
    console.log(`- URL: ${session.url}`);
    return;
  }

  const result = await videoEngine.renderReel({
    title: prompt.slice(0, 48),
    hook: 'Không gian sống tiện nghi - An cư trọn vẹn tại Nhà Của Land',
    callToAction: 'Đặt lịch xem phòng tại nhacualand.com',
    duration,
    aspectRatio,
    mode
  });

  console.log('\n================================================================');
  console.log('🎉 TẠO VIDEO ROOM TOUR THÀNH CÔNG!');
  console.log('================================================================');
  console.log(`📁 File video: ${result.file_path}`);
  console.log(`📦 Dung lượng: ${(result.size_bytes / 1024).toFixed(1)} KB | Tỉ lệ: ${result.aspect_ratio} (${result.duration_seconds}s)`);
  console.log(`🛠️ Engine: ${result.source_engine}`);

  if (shouldPublish && result.file_path && fs.existsSync(result.file_path)) {
    console.log('\n⚡ Đang tự động xuất bản Video Room Tour lên Facebook Reels + Instagram Reels + Threads...');
    const publishRes = await publishDirect({
      platform,
      contentType: 'reel',
      media_url: result.file_path,
      message: `${prompt}\n\n🏡 Khám phá quỹ phòng trống thực tế tại: https://nhacualand.com\n📞 Hotline hỗ trợ 24/7: 0981 753 082\n\n#NhaCuaLand #ChoThuePhong #ThuePhongTro #PhongStudio #CanHoMini`,
      force
    });
    console.log('✅ KẾT QUẢ XUẤT BẢN ĐA KÊNH:');
    console.log(JSON.stringify(publishRes, null, 2));
  }
}

main().catch(err => {
  console.error('❌ Lỗi xử lý video:', err.message);
  process.exit(1);
});
