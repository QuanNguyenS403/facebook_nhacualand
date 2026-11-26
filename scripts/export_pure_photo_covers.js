'use strict';

/**
 * EXPORT PURE ARCHITECTURAL REALISTIC COVERS FOR FACEBOOK (NO TEXT, NO LOGO, NO OVERLAYS)
 * Thương hiệu: Nhà Của Land (nhacualand.com)
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const IMAGES_DIR = path.resolve(__dirname, '../data/images');
const BRAIN_DIR = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\63c3b465-fb32-425e-92e8-53bb6fcc1296';

function toBase64Uri(filePath) {
  const ext = path.extname(filePath).replace('.', '') || 'jpeg';
  const data = fs.readFileSync(filePath).toString('base64');
  return `data:image/${ext};base64,${data}`;
}

const sources = [
  {
    id: 'option1_studio_overview',
    title: 'Toàn Cảnh Studio Ban Công Sáng & Góc Bếp Tiện Nghi',
    file: path.join(IMAGES_DIR, 'luxury_vietnamese_studio_apartment.jpg'),
    focusPosition: 'center 45%'
  },
  {
    id: 'option2_move_in_welcome',
    title: 'Chìa Khóa Trao Tay & Không Gian Sẵn Sàng Dọn Vào Ở',
    file: path.join(IMAGES_DIR, 'vietnamese_studio_move_in_ready.jpg'),
    focusPosition: 'center 50%'
  },
  {
    id: 'option3_duplex_mezzanine_loft',
    title: 'Căn Hộ Dịch Vụ Duplex Gác Lửng Sang Trọng Hoàng Hôn',
    file: path.join(IMAGES_DIR, 'luxury_vietnamese_mezzanine_loft.jpg'),
    focusPosition: 'center 45%'
  }
];

function getHtml(base64Data, focusPosition = 'center center') {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
  .img-container {
    width: 100%;
    height: 100%;
    background-image: url('${base64Data}');
    background-size: cover;
    background-position: ${focusPosition};
    background-repeat: no-repeat;
  }
</style>
</head>
<body>
  <div class="img-container"></div>
</body>
</html>`;
}

async function exportCovers() {
  console.log('🚀 Đang kết xuất bộ ảnh bìa thực tế 100% PURE PHOTOGRAPHY (KHÔNG CHỮ, KHÔNG LOGO)...');

  const launchOpts = { headless: true };
  const chromePath = 'C:\\Users\\ASUS\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;

  const browser = await chromium.launch(launchOpts);

  try {
    for (const item of sources) {
      if (!fs.existsSync(item.file)) {
        console.warn(`⚠️ Không tìm thấy file: ${item.file}`);
        continue;
      }

      const b64 = toBase64Uri(item.file);

      // 1. Kích thước 1640 x 924 px (Tỉ lệ 16:9 tiêu chuẩn tối ưu cho Mobile & Full View)
      const page16_9 = await browser.newPage({
        viewport: { width: 1640, height: 924 },
        deviceScaleFactor: 2
      });
      await page16_9.setContent(getHtml(b64, item.focusPosition), { waitUntil: 'load' });
      const out16_9 = path.join(IMAGES_DIR, `cover_real_${item.id}_1640x924.png`);
      await page16_9.screenshot({ path: out16_9, type: 'png' });
      await page16_9.close();

      // 2. Kích thước 1640 x 624 px (Tỉ lệ 2.63:1 chuyên biệt cho Desktop Facebook)
      const pageDesktop = await browser.newPage({
        viewport: { width: 1640, height: 624 },
        deviceScaleFactor: 2
      });
      await pageDesktop.setContent(getHtml(b64, item.focusPosition), { waitUntil: 'load' });
      const outDesktop = path.join(IMAGES_DIR, `cover_real_${item.id}_1640x624.png`);
      await pageDesktop.screenshot({ path: outDesktop, type: 'png' });
      await pageDesktop.close();

      console.log(`✅ Hoàn thành: ${item.title}`);
      console.log(`   - 16:9 Standard: ${out16_9}`);
      console.log(`   - Desktop Ratio: ${outDesktop}`);

      // Copy sang brain artifacts dir
      fs.copyFileSync(out16_9, path.join(BRAIN_DIR, path.basename(out16_9)));
      fs.copyFileSync(outDesktop, path.join(BRAIN_DIR, path.basename(outDesktop)));
    }

    console.log('\n🎉 Đã hoàn thành xuất bản toàn bộ ảnh bìa thực tế không chữ!');
  } finally {
    await browser.close().catch(() => {});
  }
}

exportCovers().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
