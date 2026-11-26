'use strict';

/**
 * TEST AI CONTENT PIPELINE FOR NHÀ CỦA LAND (nhacualand.com)
 * Kiểm thử tạo bài viết tự động với Google Gemini AI
 */

const { generatePost, generateVideoScript } = require('../services/ai_pipeline');

async function main() {
  console.log('--- ĐANG KIỂM THỬ AI PIPELINE NHÀ CỦA LAND (nhacualand.com) ---');
  try {
    const post = await generatePost({
      topic: 'Căn hộ Studio full nội thất ngập tràn ánh nắng tự nhiên',
      pillar: 'Không Gian Sống & Tiện Nghi Phòng Thuê',
      format: 'FEED_POST'
    });
    console.log('✅ KẾT QUẢ TẠO BÀI VIẾT TỰ ĐỘNG THÀNH CÔNG:');
    console.log(JSON.stringify(post, null, 2));

    console.log('\n--- KIỂM THỬ KỊCH BẢN VIDEO ROOM TOUR ---');
    const script = await generateVideoScript({
      concept: 'Room tour căn hộ mini có gác lửng thoáng mát gần trường đại học',
      durationSeconds: 20
    });
    console.log('✅ KẾT QUẢ TẠO KỊCH BẢN VIDEO THÀNH CÔNG:');
    console.log(JSON.stringify(script, null, 2));
  } catch (err) {
    console.error('LỖI KHI GỌI AI PIPELINE:', err.message);
  }
}

main();
