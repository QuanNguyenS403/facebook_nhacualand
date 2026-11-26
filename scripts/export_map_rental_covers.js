'use strict';

/**
 * EXPORT MAP & RENTAL LOCATOR COVER PHOTOS (PURE VISUAL - NO TEXT, NO CHARACTERS)
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
    id: 'map_concept1_isometric_pins',
    title: 'Sa Bàn 3D Bản Đồ Khu Dân Cư & Ghim Định Vị Phòng Cho Thuê',
    file: path.join(IMAGES_DIR, 'rental_locator_city_map_pins.jpg'),
    focusPosition: 'center 50%'
  },
  {
    id: 'map_concept2_phone_locator_pov',
    title: 'Trải Nghiệm Khách Hàng: Định Vị Tìm Phòng Trên Bản Đồ Di Động (POV)',
    file: path.join(IMAGES_DIR, 'smartphone_rental_map_locator_pov.jpg'),
    focusPosition: 'center 48%'
  },
  {
    id: 'map_concept3_aerial_smart_grid',
    title: 'Bản Đồ Mạng Lưới Phòng Cho Thuê Thông Minh Toàn Đô Thị',
    file: path.join(IMAGES_DIR, 'proptech_city_grid_aerial_rental_map.jpg'),
    focusPosition: 'center 50%'
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

async function exportMapCovers() {
  console.log('🚀 Đang kết xuất bộ ảnh bìa Bản Đồ Định Vị Tìm Phòng (NO TEXT, PURE MAP VISUAL)...');

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

      // 1. Kích thước 1640 x 924 px (16:9 Standard)
      const page16_9 = await browser.newPage({
        viewport: { width: 1640, height: 924 },
        deviceScaleFactor: 2
      });
      await page16_9.setContent(getHtml(b64, item.focusPosition), { waitUntil: 'load' });
      const out16_9 = path.join(IMAGES_DIR, `cover_${item.id}_1640x924.png`);
      await page16_9.screenshot({ path: out16_9, type: 'png' });
      await page16_9.close();

      // 2. Kích thước 1640 x 624 px (Desktop Exact Ratio)
      const pageDesktop = await browser.newPage({
        viewport: { width: 1640, height: 624 },
        deviceScaleFactor: 2
      });
      await pageDesktop.setContent(getHtml(b64, item.focusPosition), { waitUntil: 'load' });
      const outDesktop = path.join(IMAGES_DIR, `cover_${item.id}_1640x624.png`);
      await pageDesktop.screenshot({ path: outDesktop, type: 'png' });
      await pageDesktop.close();

      console.log(`✅ Hoàn thành: ${item.title}`);
      console.log(`   - 16:9 Standard: ${out16_9}`);
      console.log(`   - Desktop Ratio: ${outDesktop}`);

      // Copy sang brain artifacts dir
      fs.copyFileSync(out16_9, path.join(BRAIN_DIR, path.basename(out16_9)));
      fs.copyFileSync(outDesktop, path.join(BRAIN_DIR, path.basename(outDesktop)));
    }

    console.log('\n🎉 Hoàn thành xuất bản bộ ảnh bìa Bản đồ định vị tìm phòng!');
  } finally {
    await browser.close().catch(() => {});
  }
}

exportMapCovers().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
