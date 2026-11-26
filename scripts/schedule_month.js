'use strict';

/**
 * AUTOMATED CONTENT SCHEDULE GENERATOR FOR NHÀ CỦA LAND (nhacualand.com)
 * Khởi tạo lịch nội dung tuần/tháng tự động bám sát 4 trụ cột truyền thông:
 * 1. Không gian sống & Tiện nghi phòng
 * 2. Vị trí đắc địa & Kết nối khu vực
 * 3. Bí quyết thuê phòng & An cư trọn vẹn
 * 4. Minh bạch giá thuê & Trải nghiệm cư dân
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const { generateMonthlyPlan } = require('../lib/content-planner');

function main() {
  console.log('--- KHỞI TẠO LỊCH NỘI DUNG 30 NGÀY TỰ ĐỘNG CHO NHÀ CỦA LAND (nhacualand.com) ---');
  const plan = generateMonthlyPlan(new Date(), 30);
  const outputPath = path.resolve(__dirname, '../data/scheduled_calendar.json');

  const calendarData = {
    domain: 'nhacualand.com',
    brand: 'Nhà Của Land',
    updated_at: new Date().toISOString(),
    total_slots: plan.length,
    plan: plan
  };

  fs.writeFileSync(outputPath, JSON.stringify(calendarData, null, 2), 'utf8');
  console.log(`✅ Đã lập lịch thành công cho toàn bộ ${plan.length} khung giờ vàng trong 30 ngày tới!`);
  console.log(`📁 File lưu trữ: ${outputPath}\n`);

  plan.slice(0, 10).forEach(item => {
    console.log(`[${item.date} (${item.day}) - ${item.slot_time}] [${item.format}] ${item.pillar_name}`);
    console.log(`   Hook: "${item.concept_hook}"`);
  });
  if (plan.length > 10) {
    console.log(`... và ${plan.length - 10} ngày tiếp theo đã sẵn sàng trong lịch!`);
  }
}

main();
