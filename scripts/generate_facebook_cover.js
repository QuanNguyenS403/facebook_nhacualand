'use strict';

/**
 * GENERATE FACEBOOK FANPAGE COVER PHOTOS
 * Thương hiệu: Nhà Của Land (nhacualand.com)
 * Hotline: 0981 753 082
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const brand = require('../config/brand.json');

const OUTPUT_DIR = path.resolve(__dirname, '../data/images');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Helper: load image as base64 data URI
function getBase64Image(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).replace('.', '') || 'jpeg';
  const data = fs.readFileSync(filePath).toString('base64');
  return `data:image/${ext};base64,${data}`;
}

const studioImgBase64 = getBase64Image(path.join(OUTPUT_DIR, 'luxury_vietnamese_studio_apartment.jpg'));
const loftImgBase64 = getBase64Image(path.join(OUTPUT_DIR, 'luxury_vietnamese_mezzanine_loft.jpg'));

// -------------------------------------------------------------
// TEMPLATE 1: FLAGSHIP LUXURY STUDIO (1640 x 924 - Dual Safe-Zone)
// -------------------------------------------------------------
function getTemplate1Html() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1640px;
    height: 924px;
    font-family: 'Plus Jakarta Sans', 'Montserrat', -apple-system, sans-serif;
    position: relative;
    overflow: hidden;
    background-color: #061B24;
    color: #FFFFFF;
  }

  /* Background Real Estate Photo */
  .bg-image {
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background-image: url('${studioImgBase64}');
    background-size: cover;
    background-position: center right;
    z-index: 1;
  }

  /* Multi-stage High-End Gradient Overlay */
  .gradient-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, 
      rgba(4, 18, 25, 0.96) 0%, 
      rgba(6, 26, 36, 0.92) 38%, 
      rgba(9, 41, 56, 0.75) 60%, 
      rgba(13, 92, 117, 0.25) 85%, 
      rgba(0, 0, 0, 0.15) 100%
    );
    z-index: 2;
  }

  .accent-glow-top {
    position: absolute;
    top: -120px;
    left: 200px;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 122, 0, 0.25) 0%, rgba(255, 122, 0, 0) 70%);
    z-index: 3;
    pointer-events: none;
  }

  .accent-glow-teal {
    position: absolute;
    bottom: -150px;
    right: 350px;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(13, 92, 117, 0.4) 0%, rgba(13, 92, 117, 0) 70%);
    z-index: 3;
    pointer-events: none;
  }

  /* Safe-zone container for 100% mobile and desktop compliance */
  /* Facebook cuts ~150px top & bottom on desktop, and profile pic overlaps bottom left */
  .content-wrapper {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 130px 90px 140px 110px; /* Safe zone vertical padding */
  }

  .main-grid {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 100%;
  }

  /* Left Brand & Information Column */
  .left-col {
    max-width: 880px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .brand-header-badge {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.18);
    padding: 10px 22px;
    border-radius: 50px;
    align-self: flex-start;
  }

  .brand-logo-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #FF7A00 0%, #FF9E42 100%);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(255, 122, 0, 0.4);
  }

  .brand-logo-icon svg {
    width: 18px;
    height: 18px;
    fill: #FFFFFF;
  }

  .brand-header-text {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: #FFB366;
  }

  .brand-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 64px;
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -0.5px;
    color: #FFFFFF;
    text-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }

  .brand-title span {
    background: linear-gradient(135deg, #FF9E42 0%, #FF7A00 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .brand-slogan {
    font-size: 24px;
    font-weight: 600;
    line-height: 1.4;
    color: #CBE6EF;
    max-width: 780px;
  }

  /* Category pills */
  .category-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 4px;
  }

  .cat-pill {
    background: rgba(13, 92, 117, 0.55);
    border: 1px solid rgba(13, 92, 117, 0.9);
    padding: 8px 18px;
    border-radius: 30px;
    font-size: 15px;
    font-weight: 600;
    color: #E2F4FA;
    letter-spacing: 0.3px;
    backdrop-filter: blur(8px);
  }

  /* Core 4 USPs / Values */
  .usp-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px 20px;
    margin-top: 8px;
    max-width: 820px;
  }

  .usp-item {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 12px 18px;
    border-radius: 14px;
    backdrop-filter: blur(10px);
  }

  .usp-check {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #2B8A3E;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(43, 138, 62, 0.4);
  }

  .usp-check svg {
    width: 14px;
    height: 14px;
    fill: #FFFFFF;
  }

  .usp-text {
    font-size: 16px;
    font-weight: 600;
    color: #F0F6F9;
  }

  /* Bottom Action & Contact Ribbon */
  .action-ribbon {
    display: flex;
    align-items: center;
    gap: 24px;
    margin-top: 14px;
  }

  .cta-hotline-btn {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    background: linear-gradient(135deg, #FF7A00 0%, #E66600 100%);
    color: #FFFFFF;
    padding: 16px 32px;
    border-radius: 16px;
    box-shadow: 0 8px 25px rgba(255, 122, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.25);
  }

  .cta-icon {
    width: 28px;
    height: 28px;
    background: rgba(255, 255, 255, 0.25);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cta-icon svg {
    width: 16px;
    height: 16px;
    fill: #FFFFFF;
  }

  .cta-content {
    display: flex;
    flex-direction: column;
  }

  .cta-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #FFE5CC;
  }

  .cta-phone {
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 0.5px;
    line-height: 1.1;
  }

  .web-domain-pill {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.12);
    border: 1.5px solid rgba(255, 255, 255, 0.35);
    padding: 14px 28px;
    border-radius: 16px;
    backdrop-filter: blur(12px);
  }

  .web-icon svg {
    width: 22px;
    height: 22px;
    fill: #7CD4FD;
  }

  .web-domain-text {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #FFFFFF;
  }

  /* Right floating badge / Trust Mark */
  .right-col {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 20px;
    align-self: flex-end;
    margin-bottom: 30px;
  }

  .trust-card {
    background: rgba(4, 20, 28, 0.72);
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 20px;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
    max-width: 320px;
  }

  .trust-header {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #FFB366;
    font-size: 14px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .trust-title {
    font-size: 20px;
    font-weight: 800;
    color: #FFFFFF;
    line-height: 1.3;
  }

  .trust-desc {
    font-size: 14px;
    color: #B5D5E0;
    line-height: 1.45;
  }
</style>
</head>
<body>
  <div class="bg-image"></div>
  <div class="gradient-overlay"></div>
  <div class="accent-glow-top"></div>
  <div class="accent-glow-teal"></div>

  <div class="content-wrapper">
    <div class="main-grid">
      <!-- Left Column -->
      <div class="left-col">
        <div class="brand-header-badge">
          <div class="brand-logo-icon">
            <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
          </div>
          <span class="brand-header-text">HỆ THỐNG CHO THUÊ BẤT ĐỘNG SẢN CHUYÊN NGHIỆP</span>
        </div>

        <h1 class="brand-title">NHÀ CỦA LAND <span>.COM</span></h1>

        <div class="brand-slogan">
          Hệ thống Căn hộ dịch vụ, Studio & Phòng trọ cao cấp hàng đầu
        </div>

        <div class="category-bar">
          <div class="cat-pill">🏠 Căn Hộ Dịch Vụ 1-2PN</div>
          <div class="cat-pill">🛋️ Phòng Studio Full Đồ</div>
          <div class="cat-pill">🏢 Chung Cư Mini</div>
          <div class="cat-pill">✨ Phòng Gác Lửng Cao Cấp</div>
        </div>

        <div class="usp-grid">
          <div class="usp-item">
            <div class="usp-check">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            </div>
            <div class="usp-text">100% Ảnh Thật · Giá Niêm Yết Minh Bạch</div>
          </div>
          <div class="usp-item">
            <div class="usp-check">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            </div>
            <div class="usp-text">Full Nội Thất · Xách Vali Vào Ở Ngay</div>
          </div>
          <div class="usp-item">
            <div class="usp-check">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            </div>
            <div class="usp-text">Khóa Vân Tay · An Ninh & Camera 24/7</div>
          </div>
          <div class="usp-item">
            <div class="usp-check">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            </div>
            <div class="usp-text">Giờ Giấc Tự Do · PCCC Đạt Chuẩn</div>
          </div>
        </div>

        <!-- Call To Action -->
        <div class="action-ribbon">
          <div class="cta-hotline-btn">
            <div class="cta-icon">
              <svg viewBox="0 0 24 24"><path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
            </div>
            <div class="cta-content">
              <span class="cta-label">Hotline / Zalo Xem Phòng</span>
              <span class="cta-phone">${brand.hotline}</span>
            </div>
          </div>

          <div class="web-domain-pill">
            <div class="web-icon">
              <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            </div>
            <span class="web-domain-text">nhacualand.com</span>
          </div>
        </div>
      </div>

      <!-- Right Column: Glassmorphic Badge -->
      <div class="right-col">
        <div class="trust-card">
          <div class="trust-header">
            <span>⚡ HỖ TRỢ NHANH CHÓNG</span>
          </div>
          <div class="trust-title">Duyệt & Xem Phòng Trực Tiếp Miễn Phí</div>
          <div class="trust-desc">
            Đội ngũ tư vấn tận tâm, cam kết thông tin chuẩn xác 100%, bảo đảm quyền lợi khách thuê với hợp đồng pháp lý rõ ràng.
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// -------------------------------------------------------------
// TEMPLATE 2: DUAL ARCHITECTURAL SHOWCASE (1640 x 924)
// Studio + Mezzanine Loft side-by-side with Modern Brand Ribbon
// -------------------------------------------------------------
function getTemplate2Html() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1640px;
    height: 924px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    position: relative;
    overflow: hidden;
    background-color: #061A23;
    color: #FFFFFF;
  }

  /* Dual Split Background */
  .split-bg {
    position: absolute;
    inset: 0;
    display: flex;
    z-index: 1;
  }

  .bg-left {
    width: 50%;
    height: 100%;
    background-image: url('${studioImgBase64}');
    background-size: cover;
    background-position: center;
    position: relative;
  }

  .bg-right {
    width: 50%;
    height: 100%;
    background-image: url('${loftImgBase64}');
    background-size: cover;
    background-position: center;
    position: relative;
  }

  /* Dark luxury scrim over both photos */
  .bg-left::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(6, 26, 36, 0.94) 0%, rgba(8, 38, 51, 0.86) 60%, rgba(13, 92, 117, 0.5) 100%);
  }

  .bg-right::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(225deg, rgba(6, 26, 36, 0.85) 0%, rgba(10, 42, 56, 0.75) 50%, rgba(6, 26, 36, 0.92) 100%);
  }

  .center-divider {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 2px;
    background: linear-gradient(180deg, transparent 0%, rgba(255,122,0,0.6) 30%, rgba(255,255,255,0.8) 50%, rgba(13,92,117,0.8) 70%, transparent 100%);
    z-index: 3;
  }

  .glow-center {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 700px;
    height: 700px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(13, 92, 117, 0.35) 0%, rgba(13, 92, 117, 0) 70%);
    z-index: 2;
  }

  /* Safe Zone Content (padding keeps everything in safe region) */
  .safe-container {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    padding: 155px 90px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* Top Bar */
  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .brand-badge {
    display: flex;
    align-items: center;
    gap: 16px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 12px 26px;
    border-radius: 50px;
    backdrop-filter: blur(16px);
  }

  .brand-badge-name {
    font-family: 'Montserrat', sans-serif;
    font-size: 26px;
    font-weight: 900;
    letter-spacing: 1px;
    color: #FFFFFF;
  }

  .brand-badge-name span {
    color: #FF7A00;
  }

  .top-right-tag {
    font-size: 16px;
    font-weight: 700;
    color: #FFB366;
    letter-spacing: 2px;
    text-transform: uppercase;
    background: rgba(255, 122, 0, 0.15);
    border: 1px solid rgba(255, 122, 0, 0.4);
    padding: 10px 22px;
    border-radius: 50px;
    backdrop-filter: blur(10px);
  }

  /* Center Stage */
  .center-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin: auto 0;
    gap: 18px;
  }

  .main-heading {
    font-family: 'Montserrat', sans-serif;
    font-size: 58px;
    font-weight: 900;
    line-height: 1.15;
    text-transform: uppercase;
    letter-spacing: -0.5px;
    text-shadow: 0 6px 30px rgba(0,0,0,0.6);
  }

  .main-heading .highlight {
    background: linear-gradient(135deg, #FFB366 0%, #FF7A00 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .sub-heading {
    font-size: 24px;
    font-weight: 500;
    color: #D3EAF2;
    max-width: 950px;
    line-height: 1.4;
  }

  /* Feature Grid 4 columns */
  .feature-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    width: 100%;
    max-width: 1420px;
  }

  .feat-card {
    background: rgba(7, 30, 41, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 16px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    backdrop-filter: blur(12px);
  }

  .feat-icon {
    font-size: 26px;
    flex-shrink: 0;
  }

  .feat-texts {
    display: flex;
    flex-direction: column;
  }

  .feat-title {
    font-size: 16px;
    font-weight: 800;
    color: #FFFFFF;
  }

  .feat-sub {
    font-size: 13px;
    color: #A3CAD6;
  }

  /* Bottom Bar */
  .bottom-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 10px;
  }

  .contact-group {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .hotline-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    background: linear-gradient(135deg, #FF7A00 0%, #E66600 100%);
    padding: 14px 28px;
    border-radius: 14px;
    box-shadow: 0 8px 24px rgba(255, 122, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .hotline-num {
    font-size: 24px;
    font-weight: 900;
    color: #FFFFFF;
    letter-spacing: 0.5px;
  }

  .website-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.1);
    border: 1.5px solid rgba(255, 255, 255, 0.3);
    padding: 14px 26px;
    border-radius: 14px;
    font-size: 22px;
    font-weight: 800;
    color: #FFFFFF;
    backdrop-filter: blur(12px);
  }

  .guarantee-badge {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 17px;
    font-weight: 700;
    color: #7CD4FD;
    background: rgba(13, 92, 117, 0.4);
    border: 1px solid rgba(13, 92, 117, 0.7);
    padding: 12px 24px;
    border-radius: 50px;
  }
</style>
</head>
<body>
  <div class="split-bg">
    <div class="bg-left"></div>
    <div class="bg-right"></div>
  </div>
  <div class="center-divider"></div>
  <div class="glow-center"></div>

  <div class="safe-container">
    <div class="top-bar">
      <div class="brand-badge">
        <span class="brand-badge-name">NHÀ CỦA LAND <span>.COM</span></span>
      </div>
      <div class="top-right-tag">
        ✦ UY TÍN · TẬN TÂM · MINH BẠCH
      </div>
    </div>

    <div class="center-stage">
      <h1 class="main-heading">
        HỆ THỐNG PHÒNG TRỌ & CĂN HỘ <span class="highlight">CHO THUÊ CHUYÊN NGHIỆP</span>
      </h1>
      <div class="sub-heading">
        Tìm phòng ưng ý, an cư trọn vẹn — Không gian sống hiện đại, an ninh & đầy đủ tiện nghi
      </div>

      <div class="feature-bar">
        <div class="feat-card">
          <div class="feat-icon">📸</div>
          <div class="feat-texts">
            <span class="feat-title">100% Ảnh Thật</span>
            <span class="feat-sub">Giá minh bạch, không phí ẩn</span>
          </div>
        </div>
        <div class="feat-card">
          <div class="feat-icon">🛋️</div>
          <div class="feat-texts">
            <span class="feat-title">Full Nội Thất</span>
            <span class="feat-sub">Phòng Studio & Căn hộ dịch vụ</span>
          </div>
        </div>
        <div class="feat-card">
          <div class="feat-icon">🔒</div>
          <div class="feat-texts">
            <span class="feat-title">Khóa Vân Tay</span>
            <span class="feat-sub">Camera an ninh, PCCC đạt chuẩn</span>
          </div>
        </div>
        <div class="feat-card">
          <div class="feat-icon">⏰</div>
          <div class="feat-texts">
            <span class="feat-title">Giờ Giấc Tự Do</span>
            <span class="feat-sub">Bạn bè, người thân thăm thoải mái</span>
          </div>
        </div>
      </div>
    </div>

    <div class="bottom-bar">
      <div class="contact-group">
        <div class="hotline-btn">
          <span>📞 Hotline:</span>
          <span class="hotline-num">${brand.hotline}</span>
        </div>
        <div class="website-btn">
          <span>🌐</span>
          <span>nhacualand.com</span>
        </div>
      </div>

      <div class="guarantee-badge">
        <span>✓ Hỗ Trợ Xem Phòng Trực Tiếp Miễn Phí</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// -------------------------------------------------------------
// TEMPLATE 3: DESKTOP EXACT RATIO (1640 x 624 - 820x312 standard)
// -------------------------------------------------------------
function getTemplate3Html() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1640px;
    height: 624px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    position: relative;
    overflow: hidden;
    background-color: #061B24;
    color: #FFFFFF;
  }

  .bg-image {
    position: absolute;
    top: 0;
    right: 0;
    width: 65%;
    height: 100%;
    background-image: url('${studioImgBase64}');
    background-size: cover;
    background-position: center right;
    z-index: 1;
  }

  .gradient-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, 
      #061A24 0%, 
      #072432 35%, 
      rgba(7, 36, 50, 0.95) 45%, 
      rgba(9, 45, 62, 0.72) 62%, 
      rgba(13, 92, 117, 0.2) 85%, 
      rgba(0,0,0,0.2) 100%
    );
    z-index: 2;
  }

  .glow-accent {
    position: absolute;
    top: -100px;
    left: 200px;
    width: 450px;
    height: 450px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 122, 0, 0.28) 0%, rgba(255, 122, 0, 0) 70%);
    z-index: 3;
  }

  .content-wrapper {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 55px 80px;
  }

  .top-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .brand-pill {
    background: linear-gradient(135deg, #FF7A00 0%, #FF9933 100%);
    color: #FFFFFF;
    font-weight: 800;
    font-size: 15px;
    letter-spacing: 1.5px;
    padding: 8px 18px;
    border-radius: 50px;
    text-transform: uppercase;
  }

  .sub-tag {
    color: #A3CAD6;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .middle-row {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 900px;
  }

  .title {
    font-family: 'Montserrat', sans-serif;
    font-size: 54px;
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -0.5px;
  }

  .title span {
    color: #FF7A00;
  }

  .features-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .feature-chip {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 8px 18px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    color: #E2F4FA;
    backdrop-filter: blur(8px);
  }

  .bottom-row {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .hotline-box {
    display: flex;
    align-items: center;
    gap: 12px;
    background: linear-gradient(135deg, #FF7A00 0%, #E66600 100%);
    padding: 14px 26px;
    border-radius: 14px;
    box-shadow: 0 6px 20px rgba(255, 122, 0, 0.4);
  }

  .hotline-box .phone {
    font-size: 22px;
    font-weight: 900;
    letter-spacing: 0.5px;
  }

  .domain-box {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.25);
    padding: 12px 24px;
    border-radius: 14px;
    font-size: 22px;
    font-weight: 800;
  }

  .usp-inline {
    margin-left: auto;
    font-size: 16px;
    font-weight: 600;
    color: #7CD4FD;
    background: rgba(13, 92, 117, 0.45);
    border: 1px solid rgba(13, 92, 117, 0.8);
    padding: 10px 22px;
    border-radius: 50px;
  }
</style>
</head>
<body>
  <div class="bg-image"></div>
  <div class="gradient-overlay"></div>
  <div class="glow-accent"></div>

  <div class="content-wrapper">
    <div class="top-row">
      <div class="brand-pill">NHÀ CỦA LAND</div>
      <div class="sub-tag">HỆ THỐNG PHÒNG TRỌ & CĂN HỘ CHO THUÊ CHUYÊN NGHIỆP</div>
    </div>

    <div class="middle-row">
      <h1 class="title">TÌM PHÒNG ƯNG Ý <span>— AN CƯ TRỌN VẸN</span></h1>
      <div class="features-row">
        <div class="feature-chip">✓ 100% Ảnh Thật · Giá Minh Bạch</div>
        <div class="feature-chip">✓ Căn Hộ Dịch Vụ & Studio Đón Nắng</div>
        <div class="feature-chip">✓ Full Nội Thất · Vân Tay 24/7</div>
      </div>
    </div>

    <div class="bottom-row">
      <div class="hotline-box">
        <span>📞 Hotline/Zalo:</span>
        <span class="phone">${brand.hotline}</span>
      </div>
      <div class="domain-box">
        <span>🌐 nhacualand.com</span>
      </div>
      <div class="usp-inline">
        ✨ Xem phòng thực tế miễn phí 24/7
      </div>
    </div>
  </div>
</body>
</html>`;
}

// -------------------------------------------------------------
// MAIN RENDER ENGINE
// -------------------------------------------------------------
async function run() {
  console.log('🚀 Khởi động Playwright Render Engine cho Ảnh Bìa Fanpage Nhà Của Land...');

  const launchOpts = { headless: true };
  const chromePath = 'C:\\Users\\ASUS\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;

  const browser = await chromium.launch(launchOpts);

  try {
    // 1. Template 1: Flagship Luxury Studio (1640 x 924)
    console.log('📸 [1/3] Đang kết xuất Concept 1: Flagship Luxury Studio (1640x924 Dual Safe-Zone)...');
    const page1 = await browser.newPage({
      viewport: { width: 1640, height: 924 },
      deviceScaleFactor: 2 // 2x Retina sharpness
    });
    await page1.setContent(getTemplate1Html(), { waitUntil: 'networkidle' });
    const outPath1 = path.join(OUTPUT_DIR, 'nhacualand_cover_concept1_flagship.png');
    await page1.screenshot({ path: outPath1, type: 'png' });
    await page1.close();
    console.log(`✅ Đã tạo Concept 1: ${outPath1}`);

    // 2. Template 2: Dual Showcase (1640 x 924)
    console.log('📸 [2/3] Đang kết xuất Concept 2: Dual Showcase Studio & Mezzanine Loft (1640x924)...');
    const page2 = await browser.newPage({
      viewport: { width: 1640, height: 924 },
      deviceScaleFactor: 2
    });
    await page2.setContent(getTemplate2Html(), { waitUntil: 'networkidle' });
    const outPath2 = path.join(OUTPUT_DIR, 'nhacualand_cover_concept2_dual.png');
    await page2.screenshot({ path: outPath2, type: 'png' });
    await page2.close();
    console.log(`✅ Đã tạo Concept 2: ${outPath2}`);

    // 3. Template 3: Desktop Exact Ratio (1640 x 624)
    console.log('📸 [3/3] Đang kết xuất Concept 3: Desktop Exact Banner Ratio (1640x624)...');
    const page3 = await browser.newPage({
      viewport: { width: 1640, height: 624 },
      deviceScaleFactor: 2
    });
    await page3.setContent(getTemplate3Html(), { waitUntil: 'networkidle' });
    const outPath3 = path.join(OUTPUT_DIR, 'nhacualand_cover_concept3_desktop.png');
    await page3.screenshot({ path: outPath3, type: 'png' });
    await page3.close();
    console.log(`✅ Đã tạo Concept 3: ${outPath3}`);

    console.log('\n🎉 Hoàn thành thiết kế toàn bộ 3 phiên bản Ảnh bìa Fanpage Nhà Của Land!');
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch(err => {
  console.error('❌ Lỗi kết xuất ảnh bìa:', err);
  process.exit(1);
});
