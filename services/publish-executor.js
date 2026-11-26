'use strict';

/**
 * OMNICHANNEL AUTONOMOUS PUBLISH EXECUTOR FOR NHÀ CỦA LAND (nhacualand.com)
 * Phạm vi cô lập: Chỉ duy nhất tại D:\Facebook — Tự động hóa 100% KHÔNG CẦN DUYỆT THỦ CÔNG
 *
 * Toàn quyền xuất bản đồng bộ lên cả 3 nền tảng:
 * 1. Meta Facebook Fanpage (Graph API v21.0 + Meta Business Suite Playwright RPA)
 * 2. Instagram (Meta Business Suite Auto-Crosspost + Instagram Web Playwright RPA + IG Graph API)
 * 3. Threads (Threads Web Playwright RPA + Threads Official API)
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const fbApi = require('../lib/facebook-api');
const { evaluateContent, checkPublishRateLimit, recordPublishEvent } = require('../lib/governance');
const metaPlaywrightPublisher = require('./meta_playwright_publisher');
const instagramPlaywrightPublisher = require('./instagram_playwright_publisher');
const threadsPlaywrightPublisher = require('./threads_playwright_publisher');
const playwrightManager = require('./playwright_manager');
const imageEngine = require('./image_engine');

function parseTargetPlatforms(platformInput = 'all') {
  const raw = (platformInput || process.env.PUBLISH_TARGETS || 'all').toLowerCase().trim();
  if (raw === 'all' || raw === 'omnichannel') {
    return ['facebook', 'instagram', 'threads'];
  }
  if (raw === 'both') {
    return ['facebook', 'threads'];
  }
  const parsed = raw
    .split(',')
    .map(s => s.trim())
    .filter(s => ['facebook', 'instagram', 'threads'].includes(s));
  return parsed.length > 0 ? [...new Set(parsed)] : ['facebook', 'instagram', 'threads'];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chuẩn hóa kết quả trả về của từng nền tảng theo chuẩn thống nhất
 */
function normalizePlatformResult(platform, rawResult, defaultEngine = 'PLAYWRIGHT_RPA') {
  if (!rawResult) {
    return {
      success: false,
      platform,
      engine: defaultEngine,
      error: `Không nhận được phản hồi từ kênh ${platform}`,
      timestamp: new Date().toISOString()
    };
  }

  const success = Boolean(
    rawResult.success === true ||
    (rawResult.id && !rawResult.error) ||
    (rawResult.post_id && !rawResult.error)
  );

  return {
    success,
    platform,
    engine: rawResult.engine || defaultEngine,
    contentType: rawResult.contentType || null,
    postId: rawResult.postId || rawResult.id || rawResult.post_id || null,
    proofScreenshot: rawResult.proofScreenshot || null,
    crossPostedInstagram: Boolean(rawResult.crossPostedInstagram),
    blockedByBrandAssetGuard: Boolean(rawResult.blockedByBrandAssetGuard),
    blockedBySafetyPolicy: Boolean(rawResult.blockedBySafetyPolicy),
    error: success ? null : (rawResult.error || rawResult.reason || 'Lỗi không xác định'),
    timestamp: rawResult.timestamp || new Date().toISOString(),
    raw: rawResult
  };
}

/**
 * Xuất bản tự động trực tiếp lên 1, 2 hoặc cả 3 kênh (Facebook Fanpage + Instagram + Threads)
 */
async function publishDirect({
  platform = 'all',
  contentType = 'feed',
  message = '',
  facebook_caption = null,
  instagram_caption = null,
  threads_caption = null,
  media_url = null,
  visual_prompt = null,
  spaceArchetype = null,
  link = process.env.BRAND_WEBSITE || 'https://nhacualand.com',
  force = false,
  dryRun = process.env.DRY_RUN === 'true'
}) {
  const targets = parseTargetPlatforms(platform);
  console.log(`\n================================================================`);
  console.log(`🚀 [100% AUTONOMOUS DISPATCH] XUẤT BẢN ĐA KÊNH: [${targets.join(', ').toUpperCase()}]`);
  console.log(`================================================================`);

  // 1. Tự động kiểm duyệt & tự phê duyệt nội bộ (Zero-Human-Approval)
  const primaryText = message || facebook_caption || instagram_caption || threads_caption || '';
  const check = evaluateContent({ message: primaryText });
  if (!check.allowed) {
    throw new Error(`Nội dung bị chặn bởi bộ lọc an toàn thương hiệu: ${check.violations.join('; ')}`);
  }

  const baseMessage = check.normalizedMessage;
  const fbText = evaluateContent({ message: facebook_caption || baseMessage }).normalizedMessage;
  const igText = evaluateContent({ message: instagram_caption || baseMessage }).normalizedMessage;
  const thText = evaluateContent({ message: threads_caption || baseMessage }).normalizedMessage;

  const results = {
    timestamp: new Date().toISOString(),
    autonomous: true,
    humanApprovalRequired: false,
    targets,
    contentType,
    mediaUsed: media_url || null,
    facebook: null,
    instagram: null,
    threads: null,
    success: false,
    partialSuccess: false
  };

  // Nếu ở chế độ mô phỏng DRY_RUN -> Báo cáo thành công giả lập ngay lập tức mà không gọi browser hay AI
  if (dryRun || process.env.DRY_RUN === 'true') {
    console.log('ℹ️ DRY_RUN=true: Đã mô phỏng hoàn tất toàn bộ chu trình xuất bản đa kênh.');
    results.dryRun = true;
    results.success = true;
    results.partialSuccess = true;
    for (const t of targets) {
      results[t] = normalizePlatformResult(t, {
        success: true,
        engine: 'DRY_RUN_MOCK',
        postId: `mock_${t}_${Date.now()}`
      });
    }
    results.successfulTargets = [...targets];
    results.failedTargets = [];
    return results;
  }

  let activeMedia = media_url;
  const defaultAspectRatio = process.env.IMAGE_DEFAULT_ASPECT_RATIO || '3:4';

  // 2. Nếu mục tiêu có Instagram hoặc contentType là photo nhưng chưa có file media -> Tự động tạo Ảnh AI 4K
  if ((targets.includes('instagram') || contentType === 'photo') && (!activeMedia || !fs.existsSync(activeMedia))) {
    console.log(`🖼️ [Auto-Media] Yêu cầu hình ảnh cho kênh xuất bản -> Tự động kích hoạt AI Image Engine (${defaultAspectRatio})...`);
    try {
      const generatedImg = await imageEngine.generateImage({
        prompt: visual_prompt || baseMessage.slice(0, 140),
        title: baseMessage.split('\n')[0].slice(0, 80),
        aspectRatio: defaultAspectRatio,
        mode: 'AUTO'
      });
      activeMedia = generatedImg.file_path;
      results.mediaUsed = activeMedia;
      console.log(`   -> ✅ File media sẵn sàng: ${path.basename(activeMedia)} (${generatedImg.source_engine || generatedImg.source})`);
    } catch (imgErr) {
      console.warn(`   ⚠️ Lỗi tạo ảnh AI tự động: ${imgErr.message}`);
    }
  }

  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  const tokenCapabilities = await fbApi.verifyToken().catch(() => ({ valid: false }));
  const staggerPause = () => delay(Math.floor(Math.random() * 2000) + 2500);

  await playwrightManager.beginBatchSession({ headless });
  try {
  // ── 1. XUẤT BẢN FACEBOOK FANPAGE ──────────────────────────────────────────
  if (targets.includes('facebook') && process.env.FACEBOOK_AUTO_PUBLISH !== 'false') {
    console.log('\n📌 [1/3] Đang xuất bản lên Meta Facebook Fanpage (Nhacualand)...');
    let fbSuccess = false;
    const fullFbMsg = fbText;

    // Kiểm tra giới hạn tần suất an toàn
    if (!force) {
      const rateCheck = checkPublishRateLimit('facebook');
      if (!rateCheck.allowed) {
        console.warn(`   🛑 RATE LIMIT FACEBOOK: ${rateCheck.reason}`);
        results.facebook = normalizePlatformResult('facebook', {
          success: false,
          blockedBySafetyPolicy: true,
          reason: rateCheck.reason
        });
      }
    }

    if (!results.facebook) {
      // Ưu tiên 1: Meta Graph API chính thức (Token vĩnh viễn)
      if (tokenCapabilities.valid && tokenCapabilities.can_auto_publish_facebook) {
        try {
          console.log('   ⚡ Đăng qua Meta Graph API v21.0 chính thức...');
          let apiRes = null;
          if (contentType === 'reel' && activeMedia) {
            apiRes = await fbApi.publishFacebookReel({ video_url: activeMedia, description: fullFbMsg });
          } else if ((contentType === 'photo' || activeMedia) && activeMedia && !/\.mp4$/i.test(activeMedia)) {
            apiRes = await fbApi.publishPhotoPost({ message: fullFbMsg, photo_url: activeMedia });
          } else {
            apiRes = await fbApi.publishFeedPost({ message: fullFbMsg, link });
          }

          recordPublishEvent({
            platform: 'facebook',
            contentType: activeMedia ? (/\.mp4$/i.test(activeMedia) ? 'reel' : 'photo') : contentType,
            message: fullFbMsg,
            mediaPath: activeMedia,
            spaceArchetype,
            engine: 'META_GRAPH_API'
          });

          results.facebook = normalizePlatformResult('facebook', {
            success: true,
            contentType,
            engine: 'META_GRAPH_API',
            postId: apiRes.id || apiRes.post_id,
            raw: apiRes
          });
          fbSuccess = true;
          console.log(`   -> ✅ Đăng bài Facebook Fanpage qua Meta Graph API thành công! (Post ID: ${results.facebook.postId || 'OK'})`);
        } catch (err) {
          console.warn(`   ⚠️ Meta Graph API phản hồi (${err.message}). Chuyển sang Playwright Meta Business Suite RPA...`);
        }
      }

      // Ưu tiên 2: Playwright Meta Business Suite Composer RPA
      if (!fbSuccess) {
        try {
          const mbsResult = await metaPlaywrightPublisher.publish({
            contentType: activeMedia ? (/\.mp4$/i.test(activeMedia) ? 'reel' : 'photo') : contentType,
            message: fullFbMsg,
            mediaPath: activeMedia,
            allowInstagramCrosspost: targets.includes('instagram') && process.env.INSTAGRAM_AUTO_PUBLISH !== 'false',
            spaceArchetype,
            force,
            headless
          });
          results.facebook = normalizePlatformResult('facebook', mbsResult, 'PLAYWRIGHT_FB');
        } catch (mbsErr) {
          console.error(`   ❌ Lỗi Playwright Facebook: ${mbsErr.message}`);
          results.facebook = normalizePlatformResult('facebook', { success: false, error: mbsErr.message }, 'PLAYWRIGHT_FB');
        }
      }
    }
  }

  // ── 2. XUẤT BẢN INSTAGRAM ─────────────────────────────────────────────────
  if (targets.includes('instagram') && process.env.INSTAGRAM_AUTO_PUBLISH !== 'false') {
    // Trường hợp 1: Meta Business Suite đã tự động đồng bộ đăng lên Instagram cùng Fanpage
    if (results.facebook && results.facebook.success && results.facebook.crossPostedInstagram) {
      console.log('\n📸 [2/3] Instagram (@nhacualand): ✅ Đã đồng bộ đăng trực tiếp cùng Fanpage qua Meta Business Suite (chống đăng trùng 2 lần)!');
      recordPublishEvent({
        platform: 'instagram',
        contentType: activeMedia && /\.mp4$/i.test(activeMedia) ? 'reel' : 'photo',
        message: igText,
        mediaPath: activeMedia,
        spaceArchetype,
        engine: 'META_BUSINESS_SUITE_CROSSPOST',
        proofScreenshot: results.facebook.proofScreenshot
      });
      results.instagram = normalizePlatformResult('instagram', {
        success: true,
        engine: 'META_BUSINESS_SUITE_CROSSPOST',
        proofScreenshot: results.facebook.proofScreenshot
      });
    } else {
      // Trường hợp 2: Đăng độc lập lên Instagram
      if (results.facebook) await staggerPause();
      console.log('\n📸 [2/3] Đang xuất bản lên Instagram (@nhacualand)...');

      if (!force) {
        const rateCheck = checkPublishRateLimit('instagram');
        if (!rateCheck.allowed) {
          console.warn(`   🛑 RATE LIMIT INSTAGRAM: ${rateCheck.reason}`);
          results.instagram = normalizePlatformResult('instagram', {
            success: false,
            blockedBySafetyPolicy: true,
            reason: rateCheck.reason
          });
        }
      }

      if (!results.instagram) {
        let igSuccess = false;
        const isRemoteMedia = activeMedia && /^https?:\/\//i.test(activeMedia);
        const isVideo = activeMedia && /\.mp4(\?|$)/i.test(activeMedia);

        // Thử Instagram Graph API nếu media là URL từ xa và có quyền
        if (isRemoteMedia && tokenCapabilities.valid && tokenCapabilities.can_auto_publish_instagram) {
          try {
            let apiRes = null;
            if (isVideo || contentType === 'reel') {
              apiRes = await fbApi.publishInstagramReel({ video_url: activeMedia, caption: igText });
            } else {
              apiRes = await fbApi.publishInstagramPhoto({ image_url: activeMedia, caption: igText });
            }
            recordPublishEvent({
              platform: 'instagram',
              contentType: isVideo ? 'reel' : 'photo',
              message: igText,
              mediaPath: activeMedia,
              spaceArchetype,
              engine: 'INSTAGRAM_GRAPH_API'
            });
            results.instagram = normalizePlatformResult('instagram', {
              success: true,
              engine: 'INSTAGRAM_GRAPH_API',
              postId: apiRes.id,
              raw: apiRes
            });
            igSuccess = true;
            console.log('   -> ✅ Đăng bài Instagram qua Instagram Graph API thành công!');
          } catch (err) {
            console.warn(`   ⚠️ Instagram Graph API phản hồi (${err.message}). Chuyển sang Playwright Instagram RPA...`);
          }
        }

        // Đăng qua Instagram Web Playwright Persistent RPA
        if (!igSuccess) {
          try {
            let localMedia = activeMedia;
            if (!localMedia || !fs.existsSync(localMedia)) {
              const gen = await imageEngine.generateImage({
                prompt: visual_prompt || igText.slice(0, 120),
                title: igText.split('\n')[0].slice(0, 80),
                aspectRatio: defaultAspectRatio,
                mode: 'AUTO'
              });
              localMedia = gen.file_path;
            }

            const igResult = await instagramPlaywrightPublisher.publish({
              contentType: /\.mp4$/i.test(localMedia) ? 'reel' : 'photo',
              message: igText,
              mediaPath: localMedia,
              spaceArchetype,
              force,
              headless
            });
            results.instagram = normalizePlatformResult('instagram', igResult, 'PLAYWRIGHT_INSTAGRAM');
          } catch (igErr) {
            console.error(`   ❌ Lỗi Playwright Instagram: ${igErr.message}`);
            results.instagram = normalizePlatformResult('instagram', { success: false, error: igErr.message }, 'PLAYWRIGHT_INSTAGRAM');
          }
        }
      }
    }
  }

  // ── 3. XUẤT BẢN THREADS ───────────────────────────────────────────────────
  if (targets.includes('threads') && process.env.THREADS_AUTO_PUBLISH !== 'false') {
    if (results.facebook || results.instagram) await staggerPause();
    console.log('\n🧵 [3/3] Đang xuất bản lên Threads (@nhacualand)...');
    const fullThMsg = thText;

    if (!force) {
      const rateCheck = checkPublishRateLimit('threads');
      if (!rateCheck.allowed) {
        console.warn(`   🛑 RATE LIMIT THREADS: ${rateCheck.reason}`);
        results.threads = normalizePlatformResult('threads', {
          success: false,
          blockedBySafetyPolicy: true,
          reason: rateCheck.reason
        });
      }
    }

    if (!results.threads) {
      let threadsSuccess = false;
      const isRemoteMedia = activeMedia && /^https?:\/\//i.test(activeMedia);

      // Thử Threads API chính thức nếu có Token và media URL từ xa
      if (process.env.THREADS_ACCESS_TOKEN && process.env.THREADS_USER_ID && (!activeMedia || isRemoteMedia)) {
        try {
          const thApiRes = await fbApi.publishThreadsPost({
            text: fullThMsg,
            media_url: isRemoteMedia ? activeMedia : null
          });
          recordPublishEvent({
            platform: 'threads',
            contentType: activeMedia ? 'media' : 'text',
            message: fullThMsg,
            mediaPath: activeMedia,
            spaceArchetype,
            engine: 'THREADS_GRAPH_API'
          });
          results.threads = normalizePlatformResult('threads', {
            success: true,
            engine: 'THREADS_GRAPH_API',
            postId: thApiRes.id,
            raw: thApiRes
          });
          threadsSuccess = true;
          console.log('   -> ✅ Đăng bài Threads qua Threads Official API thành công!');
        } catch (err) {
          console.warn(`   ⚠️ Threads API phản hồi (${err.message}). Chuyển sang Playwright Threads RPA...`);
        }
      }

      // Đăng qua Threads Web Playwright Persistent RPA
      if (!threadsSuccess) {
        try {
          const thResult = await threadsPlaywrightPublisher.publish({
            message: fullThMsg,
            mediaPath: activeMedia && fs.existsSync(activeMedia) ? activeMedia : null,
            spaceArchetype,
            force,
            headless
          });
          results.threads = normalizePlatformResult('threads', thResult, 'PLAYWRIGHT_THREADS');
        } catch (thErr) {
          console.error(`   ❌ Lỗi Playwright Threads: ${thErr.message}`);
          results.threads = normalizePlatformResult('threads', { success: false, error: thErr.message }, 'PLAYWRIGHT_THREADS');
        }
      }
    }
  }
  } finally {
    await playwrightManager.endBatchSession().catch(() => {});
  }

  // ── TỔNG HỢP & BÁO CÁO KẾT QUẢ ĐA KÊNH ───────────────────────────────────
  results.success = targets.length > 0 && targets.every(t => results[t] && results[t].success === true);
  results.partialSuccess = targets.some(t => results[t] && results[t].success === true);
  results.successfulTargets = targets.filter(t => results[t] && results[t].success === true);
  results.failedTargets = targets.filter(t => !results[t] || results[t].success !== true);

  console.log('\n----------------------------------------------------------------');
  console.log('📋 BÁO CÁO KẾT QUẢ XUẤT BẢN ĐA KÊNH:');
  console.log('----------------------------------------------------------------');
  for (const t of targets) {
    const res = results[t];
    const statusIcon = res && res.success ? '✅' : '❌';
    const engineInfo = res ? `[${res.engine || 'N/A'}]` : '';
    const detail = res && res.success
      ? (res.proofScreenshot ? `Bằng chứng: ${path.basename(res.proofScreenshot)}` : (res.postId ? `Post ID: ${res.postId}` : 'Thành công'))
      : (res ? res.error : 'Chưa chạy');
    console.log(`${statusIcon} ${t.toUpperCase().padEnd(10)}: ${engineInfo} ${detail}`);
  }
  console.log('----------------------------------------------------------------');
  console.log(results.success
    ? '🎉 TẤT CẢ CÁC KÊNH MỤC TIÊU ĐỀU ĐÃ XUẤT BẢN THÀNH CÔNG!'
    : (results.partialSuccess
      ? '⚠️ MỘT SỐ KÊNH ĐÃ XUẤT BẢN THÀNH CÔNG, MỘT SỐ KÊNH GẶP LỖI (Xem chi tiết ở trên).'
      : '❌ XUẤT BẢN ĐA KÊNH THẤT BẠI.'));
  console.log('================================================================\n');

  return results;
}

module.exports = {
  parseTargetPlatforms,
  publishDirect
};
