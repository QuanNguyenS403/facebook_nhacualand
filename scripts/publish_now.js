'use strict';

/**
 * CLI EXECUTOR: PUBLISH NOW OMNICHANNEL FOR NHÀ CỦA LAND (nhacualand.com)
 * Phạm vi: Chỉ duy nhất tại D:\Facebook
 *
 * Xuất bản tức thì hoàn toàn tự động 100% lên:
 * - Meta Facebook Fanpage (`--platform facebook`)
 * - Instagram (`--platform instagram`)
 * - Threads (`--platform threads`)
 * - Cả 3 nền tảng đồng thời (`--platform all` — MẶC ĐỊNH!)
 */

require('../lib/env-loader');
const { publishDirect } = require('../services/publish-executor');
const imageEngine = require('../services/image_engine');
const videoEngine = require('../services/video-engine');

async function main() {
  const args = process.argv.slice(2);
  let contentType = 'feed';
  let message = 'Đi cày cả ngày mệt phờ, về mở cửa thấy góc phòng sạch sẽ ngập nắng là mọi mệt mỏi tan biến. Chỉ mong tối về ngủ một giấc cho đã đời ngày mai đi làm tiếp. #phongtro #chothuephong';
  let mediaUrl = null;
  let platform = process.env.PUBLISH_TARGETS || 'all';
  let force = false;
  let autoImage = false;
  let autoVideo = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' || args[i] === '-t') contentType = args[++i];
    else if (args[i] === '--message' || args[i] === '-m') message = args[++i];
    else if (args[i] === '--media' || args[i] === '-f') mediaUrl = args[++i];
    else if (args[i] === '--platform' || args[i] === '-p') platform = args[++i];
    else if (args[i] === '--force') force = true;
    else if (args[i] === '--auto-image') autoImage = true;
    else if (args[i] === '--auto-video') autoVideo = true;
  }

  if (autoVideo && !mediaUrl) {
    const vid = await videoEngine.renderReel({ title: message.slice(0, 48) });
    mediaUrl = vid.file_path;
    contentType = 'reel';
  } else if (autoImage && !mediaUrl) {
    const img = await imageEngine.generateImage({ prompt: message.slice(0, 120), title: message.slice(0, 65) });
    mediaUrl = img.file_path;
    contentType = 'photo';
  }

  console.log('================================================================');
  console.log('🚀 NHÀ CỦA LAND — XUẤT BẢN TỰ ĐỘNG 100% (FANPAGE + IG + THREADS)');
  console.log('================================================================');
  console.log(`📌 Kênh đích: ${platform.toUpperCase()}`);
  console.log(`📝 Định dạng: ${contentType.toUpperCase()}`);
  console.log(`💬 Nội dung: "${message.slice(0, 120)}..."`);
  if (mediaUrl) console.log(`🎬 File Media: ${mediaUrl}`);
  console.log('----------------------------------------------------------------\n');

  const res = await publishDirect({
    platform,
    contentType,
    message,
    media_url: mediaUrl,
    force
  });

  console.log('\n🎉 KẾT QUẢ XUẤT BẢN ĐA KÊNH:');
  console.log(JSON.stringify(res, null, 2));
}

main()
  .then(() => {
    process.exitCode = 0;
    const drainTimer = setTimeout(() => process.exit(0), 500);
    if (drainTimer.unref) drainTimer.unref();
  })
  .catch(err => {
    console.error('❌ Lỗi xuất bản:', err.message);
    process.exit(1);
  });
