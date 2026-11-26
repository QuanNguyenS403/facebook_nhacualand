'use strict';

const fbApi = require('../lib/facebook-api');

async function main() {
  console.log('--- KIỂM TRA TRẠNG THÁI META GRAPH API TOKEN ---');
  try {
    const info = await fbApi.verifyToken();
    console.log('Kết quả kiểm tra Token:');
    console.log(JSON.stringify(info, null, 2));

    if (info.valid) {
      console.log('\nKiểm tra tài khoản Instagram Business:');
      try {
        const igInfo = await fbApi.getInstagramInfo();
        console.log('Thông tin Instagram:', JSON.stringify(igInfo, null, 2));
      } catch (e) {
        console.log('Chưa đọc được Instagram:', e.message);
      }
    }
  } catch (err) {
    console.error('Lỗi khi kiểm tra token:', err.message);
  }
}

main();
