'use strict';

/**
 * UTILITY: MINT PERMANENT NEVER-EXPIRING META PAGE TOKEN & CONFIGURE .ENV (NHÀ CỬA LAND)
 * Phạm vi: Chỉ duy nhất tại D:\Facebook
 *
 * Cách dùng:
 *   1. Đúc Page Token VĨNH VIỄN từ User Token 1 giờ + App Secret:
 *      node scripts/set_token.js "<USER_TOKEN_1_GIO>" --secret "<APP_SECRET>"
 *   2. Nạp trực tiếp Page/System User Token có sẵn:
 *      node scripts/set_token.js "<META_TOKEN>"
 */

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');

function upsertEnvKey(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  }
  return `${content.trimEnd()}\n${key}=${value}\n`;
}

async function exchangeForLongLivedUserToken({ appId, appSecret, shortToken, graphVersion = 'v21.0' }) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortToken);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error || !data.access_token) {
    throw new Error(`Không thể quy đổi Long-Lived Token: ${data.error ? data.error.message : 'Không nhận được access_token'}`);
  }
  return data.access_token;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Cách dùng:');
    console.log('  node scripts/set_token.js "<USER_TOKEN_1_GIO>" --secret "<APP_SECRET>"   (Đúc Token VĨNH VIỄN)');
    console.log('  node scripts/set_token.js "<META_PAGE_OR_SYSTEM_TOKEN>"                  (Nạp trực tiếp Token)');
    process.exit(1);
  }

  let mode = 'facebook';
  let inputToken = null;
  let appSecret = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threads') {
      mode = 'threads';
      inputToken = args[++i];
    } else if (args[i] === '--instagram' || args[i] === '--ig') {
      mode = 'instagram';
      inputToken = args[++i];
    } else if (args[i] === '--secret' || args[i] === '--app-secret') {
      appSecret = args[++i];
    } else if (!args[i].startsWith('--') && !inputToken) {
      inputToken = args[i];
    }
  }

  if (!inputToken || inputToken.length < 15) {
    console.error('❌ Token không hợp lệ hoặc quá ngắn.');
    process.exit(1);
  }

  let envContent = fs.readFileSync(envPath, 'utf8');

  if (mode === 'threads') {
    envContent = upsertEnvKey(envContent, 'THREADS_ACCESS_TOKEN', inputToken);
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Đã cập nhật THREADS_ACCESS_TOKEN vào D:\\Facebook\\.env!');
    return;
  }

  if (mode === 'instagram') {
    envContent = upsertEnvKey(envContent, 'INSTAGRAM_ACCESS_TOKEN', inputToken);
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Đã cập nhật INSTAGRAM_ACCESS_TOKEN vào D:\\Facebook\\.env!');
    return;
  }

  require('../lib/env-loader').loadEnv();
  const graphVersion = process.env.META_GRAPH_VERSION || 'v21.0';
  let activeUserOrPageToken = inputToken;

  // Nếu có truyền --secret <APP_SECRET>, tự động quy đổi User Token 1h -> Long-Lived User Token 60 ngày -> Page Token VĨNH VIỄN!
  const effectiveSecret = appSecret || process.env.META_APP_SECRET || '';
  if (effectiveSecret) {
    let appId = process.env.META_APP_ID || '2891158041271095';
    let tokenType = 'USER';
    try {
      const dbg = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(inputToken)}`
      ).then(r => r.json());
      if (dbg.data) {
        if (dbg.data.app_id) appId = dbg.data.app_id;
        if (dbg.data.type) tokenType = dbg.data.type;
      }
    } catch (e) {
      // Giữ appId từ .env
    }

    if (tokenType === 'PAGE') {
      console.log('ℹ️ Token được cung cấp là Page Access Token trực tiếp. Bỏ qua bước quy đổi User Token.');
      activeUserOrPageToken = inputToken;
    } else {
      try {
        console.log(`🔄 Đang quy đổi User Token 1 giờ sang Long-Lived Token (App ID: ${appId})...`);
        activeUserOrPageToken = await exchangeForLongLivedUserToken({
          appId,
          appSecret: effectiveSecret,
          shortToken: inputToken,
          graphVersion
        });
        console.log('✅ Đã quy đổi thành công Long-Lived User Token (60 ngày) -> Đang đúc Page Access Token VĨNH VIỄN...');
      } catch (exchangeErr) {
        console.warn(`⚠️ Quy đổi User Token gặp lỗi (${exchangeErr.message}). Sẽ sử dụng trực tiếp Token này...`);
        activeUserOrPageToken = inputToken;
      }
    }
  }

  envContent = upsertEnvKey(envContent, 'FB_USER_TOKEN', activeUserOrPageToken);
  envContent = upsertEnvKey(envContent, 'META_PAGE_ACCESS_TOKEN', activeUserOrPageToken);
  fs.writeFileSync(envPath, envContent, 'utf8');

  delete require.cache[require.resolve('../lib/env-loader')];
  delete require.cache[require.resolve('../lib/facebook-api')];
  require('../lib/env-loader').loadEnv();
  const fbApi = require('../lib/facebook-api');
  const resolved = await fbApi.resolvePageCredentials(true);

  if (resolved && resolved.valid) {
    if (resolved.appId) envContent = upsertEnvKey(envContent, 'META_APP_ID', resolved.appId);
    if (resolved.userId) envContent = upsertEnvKey(envContent, 'FB_USER_ID', resolved.userId);
    if (resolved.pageId) envContent = upsertEnvKey(envContent, 'META_PAGE_ID', resolved.pageId);
    if (resolved.pageToken) envContent = upsertEnvKey(envContent, 'META_PAGE_ACCESS_TOKEN', resolved.pageToken);
    if (resolved.igBusinessId) envContent = upsertEnvKey(envContent, 'INSTAGRAM_ACCOUNT_ID', resolved.igBusinessId);
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`🎉 Đã đúc & lưu Page Token cho Fanpage "${resolved.pageName}" (ID: ${resolved.pageId}) vào D:\\Facebook\\.env!`);
  }

  delete require.cache[require.resolve('../lib/env-loader')];
  delete require.cache[require.resolve('../lib/facebook-api')];
  require('../lib/env-loader').loadEnv();
  const finalApi = require('../lib/facebook-api');
  const verifyResult = await finalApi.verifyToken();
  console.log('\n📊 KẾT QUẢ XÁC THỰC TOKEN CUỐI CÙNG:');
  console.log(JSON.stringify(verifyResult, null, 2));
}

main().catch(err => {
  console.error('❌ Lỗi thiết lập Token:', err.message);
  process.exit(1);
});
