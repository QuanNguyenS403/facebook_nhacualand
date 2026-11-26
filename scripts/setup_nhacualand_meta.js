'use strict';

/**
 * CONFIGURATION HELPER: SETUP NHACUALAND META FANPAGE, INSTAGRAM, THREADS & AI ENVIRONMENT
 * Phạm vi: Chỉ duy nhất tại D:\Facebook
 *
 * Cách dùng:
 *   node scripts/setup_nhacualand_meta.js --app-id <ID> --app-secret <SECRET> --page-id <PAGE_ID> --token <PAGE_TOKEN>
 *   node scripts/setup_nhacualand_meta.js --ig-id <IG_BUSINESS_ID> --ig-token <IG_TOKEN>
 *   node scripts/setup_nhacualand_meta.js --threads-user <USER_ID> --threads-token <THREADS_TOKEN>
 *   node scripts/setup_nhacualand_meta.js --gemini-key <GEMINI_API_KEY>
 */

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');

function updateEnvVar(content, varName, value) {
  const regex = new RegExp(`^${varName}=.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${varName}=${value}`);
  }
  return `${content}\n${varName}=${value}`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('--- CẤU HÌNH ĐA KÊNH META FANPAGE + INSTAGRAM + THREADS + AI (NHÀ CỦA LAND) ---');
    console.log('Cách dùng:');
    console.log('  node scripts/setup_nhacualand_meta.js --app-id <ID> --page-id <PAGE_ID> --token <PAGE_TOKEN>');
    console.log('  node scripts/setup_nhacualand_meta.js --ig-id <IG_BUSINESS_ID> --ig-token <IG_TOKEN>');
    console.log('  node scripts/setup_nhacualand_meta.js --threads-user <USER_ID> --threads-token <THREADS_TOKEN>');
    console.log('  node scripts/setup_nhacualand_meta.js --gemini-key <GEMINI_API_KEY>');
    return;
  }

  if (!fs.existsSync(envPath)) {
    console.error('❌ Không tìm thấy file .env tại:', envPath);
    return;
  }

  let envContent = fs.readFileSync(envPath, 'utf8');

  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    const val = args[i + 1];
    if (!val) continue;

    if (key === '--app-id') {
      envContent = updateEnvVar(envContent, 'META_APP_ID', val);
      envContent = updateEnvVar(envContent, 'FB_APP_ID', val);
      console.log(`✅ Đã cập nhật META_APP_ID = ${val}`);
      i++;
    } else if (key === '--app-secret') {
      envContent = updateEnvVar(envContent, 'META_APP_SECRET', val);
      console.log('✅ Đã cập nhật META_APP_SECRET = ***');
      i++;
    } else if (key === '--business-id') {
      envContent = updateEnvVar(envContent, 'META_BUSINESS_ID', val);
      console.log(`✅ Đã cập nhật META_BUSINESS_ID = ${val}`);
      i++;
    } else if (key === '--page-id') {
      envContent = updateEnvVar(envContent, 'META_PAGE_ID', val);
      envContent = updateEnvVar(envContent, 'FB_PAGE_ID', val);
      console.log(`✅ Đã cập nhật META_PAGE_ID = ${val}`);
      i++;
    } else if (key === '--token' || key === '--page-token') {
      envContent = updateEnvVar(envContent, 'META_PAGE_ACCESS_TOKEN', val);
      envContent = updateEnvVar(envContent, 'FB_PAGE_TOKEN', val);
      console.log(`✅ Đã cập nhật META_PAGE_ACCESS_TOKEN = ${val.slice(0, 14)}...`);
      i++;
    } else if (key === '--ig-id') {
      envContent = updateEnvVar(envContent, 'IG_BUSINESS_ACCOUNT_ID', val);
      envContent = updateEnvVar(envContent, 'INSTAGRAM_USER_ID', val);
      console.log(`✅ Đã cập nhật IG_BUSINESS_ACCOUNT_ID = ${val}`);
      i++;
    } else if (key === '--ig-token') {
      envContent = updateEnvVar(envContent, 'INSTAGRAM_ACCESS_TOKEN', val);
      console.log(`✅ Đã cập nhật INSTAGRAM_ACCESS_TOKEN = ${val.slice(0, 14)}...`);
      i++;
    } else if (key === '--threads-user') {
      envContent = updateEnvVar(envContent, 'THREADS_USER_ID', val);
      console.log(`✅ Đã cập nhật THREADS_USER_ID = ${val}`);
      i++;
    } else if (key === '--threads-token') {
      envContent = updateEnvVar(envContent, 'THREADS_ACCESS_TOKEN', val);
      console.log(`✅ Đã cập nhật THREADS_ACCESS_TOKEN = ${val.slice(0, 14)}...`);
      i++;
    } else if (key === '--gemini-key') {
      envContent = updateEnvVar(envContent, 'GEMINI_API_KEY', val);
      console.log(`✅ Đã cập nhật GEMINI_API_KEY = ${val.slice(0, 12)}...`);
      i++;
    }
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('🎉 Đã cập nhật cấu hình D:\\Facebook\\.env thành công!');
}

main();
