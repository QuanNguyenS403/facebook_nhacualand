'use strict';

/**
 * CLI EXECUTOR: AUTONOMOUS AI IMAGE GENERATOR (GOOGLE NANO BANANA 2.1 + GOOGLE FLOW STUDIO)
 * Thương hiệu: Nhà Của Land (nhacualand.com) — Chỉ duy nhất tại D:\Facebook
 *
 * Cách dùng:
 *   node scripts/run_image_agent.js --prompt "Phòng studio ban công ngập nắng ấm cúng"
 *   node scripts/run_image_agent.js --prompt "Căn hộ mini 1PN nội thất gỗ" --aspect 4:5 --publish
 *   node scripts/run_image_agent.js --prompt "Phòng trọ cao cấp có gác lửng" --mode FLOW_WEB
 */

require('../lib/env-loader');
const fs = require('fs');
const imageEngine = require('../services/image_engine');
const { publishDirect } = require('../services/publish-executor');

async function main() {
  const args = process.argv.slice(2);
  let prompt = 'Căn hộ studio full nội thất Nhà Của Land đón ánh sáng tự nhiên từ ban công';
  let aspectRatio = process.env.IMAGE_DEFAULT_ASPECT_RATIO || '4:5';
  let imageSize = process.env.IMAGE_DEFAULT_SIZE || '2K';
  let mode = 'AUTO';
  let shouldPublish = false;
  let platform = 'all';
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prompt' || args[i] === '-p') prompt = args[++i];
    else if (args[i] === '--aspect' || args[i] === '-a') aspectRatio = args[++i];
    else if (args[i] === '--size' || args[i] === '-s') imageSize = args[++i];
    else if (args[i] === '--mode' || args[i] === '-m') mode = args[++i];
    else if (args[i] === '--publish') shouldPublish = true;
    else if (args[i] === '--platform') platform = args[++i];
    else if (args[i] === '--force') force = true;
  }

  console.log('================================================================');
  console.log('🎨 NHÀ CỦA LAND AI AGENT — TẠO ẢNH AI (NANO BANANA + GOOGLE FLOW)');
  console.log('================================================================');

  const result = await imageEngine.generateImage({
    prompt,
    title: prompt,
    aspectRatio,
    imageSize,
    mode
  });

  console.log('\n🎉 TẠO ẢNH THÀNH CÔNG:');
  console.log(`📁 Đường dẫn ảnh: ${result.file_path}`);
  console.log(`📦 Dung lượng: ${(result.size_bytes / 1024).toFixed(1)} KB | Tỉ lệ: ${result.aspect_ratio}`);
  console.log(`🛠️ Động cơ thực thi: ${result.source}`);

  if (shouldPublish && result.file_path && fs.existsSync(result.file_path)) {
    console.log('\n⚡ Tự động xuất bản ảnh lên Meta Fanpage + Instagram + Threads...');
    const pubRes = await publishDirect({
      platform,
      contentType: 'photo',
      media_url: result.file_path,
      message: `${prompt}\n\n🏡 Xem danh sách phòng thật giá thật tại: https://nhacualand.com\n📞 Hotline: 0981 753 082\n\n#NhaCuaLand #ChoThuePhong #PhongStudio #CanHoDichVu`,
      force
    });
    console.log(JSON.stringify(pubRes, null, 2));
  }
}

main().catch(err => {
  console.error('❌ Lỗi tạo ảnh AI:', err.message);
  process.exit(1);
});

