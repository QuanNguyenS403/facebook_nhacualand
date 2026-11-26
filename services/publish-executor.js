'use strict';

/**
 * OMNICHANNEL AUTONOMOUS PUBLISH EXECUTOR FOR NHÀ CỦA LAND (nhacualand.com)
 * Phạm vi cô lập: Chỉ duy nhất tại D:\Facebook — Tự động hóa 100% KHÔNG CẦN DUYỆT THỦ CÔNG
 *
 * Nâng cấp theo Master Plan:
 * - Parse kênh nghiêm ngặt (từ chối kênh lạ, chuẩn hóa facebook_fanpage -> facebook).
 * - Kiểm duyệt toàn bộ 3 biến thể caption trước khi chạy (evaluateOmnichannelCaptions).
 * - Phân loại rõ remote_url vs local_path, không sinh ảnh đè khi media là URL hợp lệ.
 * - Tách Chrome khỏi đường API (lazy-init Playwright chỉ khi thực sự cần fallback).
 * - Máy trạng thái từng tài khoản trong SQLite: QUEUED -> SUBMITTING -> VERIFIED / UNKNOWN / FAILED.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fbApi = require('../lib/facebook-api');
const {
  evaluateContent,
  evaluateOmnichannelCaptions,
  checkPublishRateLimit,
  recordPublishEvent
} = require('../lib/governance');
const { openDb, sha256 } = require('../lib/db');
const metaPlaywrightPublisher = require('./meta_playwright_publisher');
const instagramPlaywrightPublisher = require('./instagram_playwright_publisher');
const threadsPlaywrightPublisher = require('./threads_playwright_publisher');
const playwrightManager = require('./playwright_manager');
const imageEngine = require('./image_engine');

const CHANNEL_ALIASES = {
  facebook: 'facebook',
  fb: 'facebook',
  facebook_fanpage: 'facebook',
  fanpage: 'facebook',
  instagram: 'instagram',
  ig: 'instagram',
  threads: 'threads',
  th: 'threads'
};

function parseTargetPlatforms(platformInput = 'all') {
  const raw = String(platformInput || process.env.PUBLISH_TARGETS || 'all').toLowerCase().trim();
  if (!raw || raw === 'all' || raw === 'omnichannel') {
    return ['facebook', 'instagram', 'threads'];
  }
  if (raw === 'both') {
    return ['facebook', 'threads'];
  }
  const tokens = raw.split(',').map(s => s.trim()).filter(Boolean);
  const resolved = [];
  const invalid = [];
  for (const tok of tokens) {
    if (CHANNEL_ALIASES[tok]) {
      resolved.push(CHANNEL_ALIASES[tok]);
    } else {
      invalid.push(tok);
    }
  }
  if (invalid.length > 0) {
    throw new Error(`Kênh xuất bản không hợp lệ: ${invalid.join(', ')}. Chỉ hỗ trợ: facebook, instagram, threads.`);
  }
  return [...new Set(resolved)];
}

function classifyMediaInput(mediaInput) {
  if (!mediaInput || typeof mediaInput !== 'string') {
    return { kind: 'none', value: null, isVideo: false, isRemote: false, existsLocal: false };
  }
  const trimmed = mediaInput.trim();
  const isRemote = /^https?:\/\//i.test(trimmed);
  const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(trimmed);
  const existsLocal = !isRemote && fs.existsSync(trimmed);
  return {
    kind: isRemote ? 'remote_url' : (existsLocal ? 'local_path' : 'missing_local'),
    value: trimmed,
    isVideo,
    isRemote,
    existsLocal
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAmbiguousNetworkError(err) {
  if (!err) return false;
  if (err.isAmbiguous) return true;
  const msg = String(err.message || '').toLowerCase();
  return /timeout|timed out|econnreset|etimedout|epipe|socket hang up|fetch failed|502|503|504/.test(msg);
}

function upsertPublicationState({
  slotId = null,
  workOrderId = null,
  variantId,
  accountId,
  channel,
  contentVersion = 'v1',
  status,
  providerContainerId = null,
  providerPostId = null,
  permalink = null,
  engine = null,
  proofScreenshot = null,
  errorMessage = null
}) {
  try {
    const db = openDb();
    const now = new Date().toISOString();
    const pubId = `pub_${sha256(`${variantId}|${accountId}|${contentVersion}`).slice(0, 20)}`;
    db.prepare(`
      INSERT INTO publications (
        publication_id, work_order_id, slot_id, variant_id, account_id, channel,
        content_version, status, provider_container_id, provider_post_id, permalink,
        engine, proof_screenshot, error_message, attempt_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(variant_id, account_id, content_version) DO UPDATE SET
        status = excluded.status,
        provider_container_id = COALESCE(excluded.provider_container_id, publications.provider_container_id),
        provider_post_id = COALESCE(excluded.provider_post_id, publications.provider_post_id),
        permalink = COALESCE(excluded.permalink, publications.permalink),
        engine = COALESCE(excluded.engine, publications.engine),
        proof_screenshot = COALESCE(excluded.proof_screenshot, publications.proof_screenshot),
        error_message = excluded.error_message,
        attempt_count = publications.attempt_count + 1,
        updated_at = excluded.updated_at
    `).run(
      pubId,
      workOrderId,
      slotId,
      variantId,
      accountId,
      channel,
      contentVersion,
      status,
      providerContainerId,
      providerPostId,
      permalink,
      engine,
      proofScreenshot,
      errorMessage,
      now,
      now
    );

    const attemptId = `att_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO publication_attempts (
        attempt_id, publication_id, attempt_num, engine, status,
        provider_container_id, provider_post_id, error_message, started_at, finished_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attemptId,
      pubId,
      engine || 'UNKNOWN',
      status,
      providerContainerId,
      providerPostId,
      errorMessage,
      now,
      now
    );
    return pubId;
  } catch (dbErr) {
    console.warn(`⚠️ [DB] Không thể ghi publication state (${channel}): ${dbErr.message}`);
    return null;
  }
}

function getVerifiedSlotPublication(slotId, channel) {
  if (!slotId) return null;
  try {
    const db = openDb();
    return db.prepare(`
      SELECT * FROM publications
      WHERE slot_id = ? AND channel = ? AND status = 'VERIFIED'
      ORDER BY updated_at DESC LIMIT 1
    `).get(slotId, channel) || null;
  } catch (_) {
    return null;
  }
}

/**
 * Chuẩn hóa kết quả trả về của từng nền tảng theo chuẩn thống nhất
 */
function normalizePlatformResult(platform, rawResult, defaultEngine = 'PLAYWRIGHT_RPA') {
  if (!rawResult) {
    return {
      success: false,
      status: 'FAILED',
      platform,
      engine: defaultEngine,
      error: `Không nhận được phản hồi từ kênh ${platform}`,
      timestamp: new Date().toISOString()
    };
  }

  const isUnknown = rawResult.status === 'UNKNOWN';
  const success = !isUnknown && Boolean(
    rawResult.success === true ||
    (rawResult.id && !rawResult.error) ||
    (rawResult.post_id && !rawResult.error)
  );

  return {
    success,
    status: isUnknown ? 'UNKNOWN' : (success ? 'VERIFIED' : 'FAILED'),
    platform,
    engine: rawResult.engine || defaultEngine,
    contentType: rawResult.contentType || null,
    postId: rawResult.postId || rawResult.id || rawResult.post_id || null,
    containerId: rawResult.containerId || rawResult.video_id || null,
    permalink: rawResult.permalink || null,
    proofScreenshot: rawResult.proofScreenshot || null,
    crossPostedInstagram: Boolean(rawResult.crossPostedInstagram),
    blockedByBrandAssetGuard: Boolean(rawResult.blockedByBrandAssetGuard),
    blockedBySafetyPolicy: Boolean(rawResult.blockedBySafetyPolicy),
    error: success ? null : (rawResult.error || rawResult.reason || (isUnknown ? 'UNKNOWN_RECONCILE_REQUIRED' : 'Lỗi không xác định')),
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
  slotId = null,
  workOrderId = null,
  link = process.env.BRAND_WEBSITE || 'https://nhacualand.com',
  force = false,
  dryRun = process.env.DRY_RUN === 'true',
  offline = process.env.OFFLINE_MODE === 'true'
}) {
  const targets = parseTargetPlatforms(platform);
  console.log(`\n================================================================`);
  console.log(`🚀 [100% AUTONOMOUS DISPATCH] XUẤT BẢN ĐA KÊNH: [${targets.join(', ').toUpperCase()}]`);
  console.log(`================================================================`);

  // 1. Kiểm duyệt toàn bộ biến thể caption theo từng kênh trước khi thực thi
  const primaryText = message || facebook_caption || instagram_caption || threads_caption || '';
  const omniCheck = evaluateOmnichannelCaptions({
    facebook_caption: targets.includes('facebook') ? (facebook_caption || primaryText) : primaryText,
    instagram_caption: targets.includes('instagram') ? (instagram_caption || primaryText) : primaryText,
    threads_caption: targets.includes('threads') ? (threads_caption || primaryText) : primaryText
  });
  if (!omniCheck.allowed) {
    throw new Error(`Nội dung bị chặn bởi bộ lọc an toàn thương hiệu: ${omniCheck.violations.join('; ')}`);
  }

  const fbText = omniCheck.results.facebook.normalizedMessage;
  const igText = omniCheck.results.instagram.normalizedMessage;
  const thText = omniCheck.results.threads.normalizedMessage;
  const contentHash = sha256(`${fbText}|${igText}|${thText}|${media_url || ''}`).slice(0, 16);

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

  // Chế độ mô phỏng DRY_RUN / offline -> không gọi AI, không mở Chrome, không ghi DB/lịch thật
  if (dryRun || offline || process.env.DRY_RUN === 'true') {
    console.log('ℹ️ DRY_RUN/OFFLINE: Đã mô phỏng hoàn tất chu trình kiểm duyệt & xuất bản đa kênh (không ghi ra ngoài).');
    results.dryRun = true;
    results.offline = Boolean(offline);
    results.success = true;
    results.partialSuccess = true;
    for (const t of targets) {
      results[t] = normalizePlatformResult(t, {
        success: true,
        engine: offline ? 'OFFLINE_MOCK' : 'DRY_RUN_MOCK',
        postId: `mock_${t}_${Date.now()}`
      });
    }
    results.successfulTargets = [...targets];
    results.failedTargets = [];
    return results;
  }

  let activeMedia = media_url;
  let mediaInfo = classifyMediaInput(activeMedia);
  const defaultAspectRatio = process.env.IMAGE_DEFAULT_ASPECT_RATIO || '3:4';

  // 2. Chỉ sinh ảnh thay thế khi thực sự thiếu media hoặc local file bị mất (KHÔNG đè khi là remote_url hợp lệ)
  if ((targets.includes('instagram') || contentType === 'photo') && (mediaInfo.kind === 'none' || mediaInfo.kind === 'missing_local')) {
    console.log(`🖼️ [Auto-Media] Yêu cầu hình ảnh cho kênh xuất bản -> Tự động kích hoạt AI Image Engine (${defaultAspectRatio})...`);
    try {
      const generatedImg = await imageEngine.generateImage({
        prompt: visual_prompt || fbText.slice(0, 140),
        title: fbText.split('\n')[0].slice(0, 80),
        aspectRatio: defaultAspectRatio,
        mode: 'AUTO'
      });
      activeMedia = generatedImg.file_path;
      mediaInfo = classifyMediaInput(activeMedia);
      results.mediaUsed = activeMedia;
      console.log(`   -> ✅ File media sẵn sàng: ${path.basename(activeMedia)} (${generatedImg.source_engine || generatedImg.source})`);
    } catch (imgErr) {
      console.warn(`   ⚠️ Lỗi tạo ảnh AI tự động: ${imgErr.message}`);
    }
  }

  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  const tokenCapabilities = await fbApi.verifyToken().catch(() => ({ valid: false }));
  const staggerPause = () => delay(Math.floor(Math.random() * 2000) + 2500);

  let browserStarted = false;
  const ensureBrowserSession = async () => {
    if (!browserStarted) {
      await playwrightManager.beginBatchSession({ headless });
      browserStarted = true;
    }
  };

  try {
    // ── 1. XUẤT BẢN FACEBOOK FANPAGE ──────────────────────────────────────────
    if (targets.includes('facebook') && process.env.FACEBOOK_AUTO_PUBLISH !== 'false') {
      const existingFb = getVerifiedSlotPublication(slotId, 'facebook');
      if (existingFb && !force) {
        console.log(`\n📌 [1/3] Facebook: ✅ Đã VERIFIED trước đó (${existingFb.provider_post_id || existingFb.publication_id}), bỏ qua gửi trùng.`);
        results.facebook = normalizePlatformResult('facebook', {
          success: true,
          engine: existingFb.engine || 'IDEMPOTENT_SKIP',
          postId: existingFb.provider_post_id,
          permalink: existingFb.permalink
        });
      } else {
        console.log('\n📌 [1/3] Đang xuất bản lên Meta Facebook Fanpage (Nhacualand)...');
        let fbHandled = false;
        const accountId = process.env.META_PAGE_ID || 'nhacualand_fb';
        const variantId = `var_fb_${contentHash}`;

        if (!force) {
          const rateCheck = checkPublishRateLimit('facebook');
          if (!rateCheck.allowed) {
            console.warn(`   🛑 RATE LIMIT FACEBOOK: ${rateCheck.reason}`);
            results.facebook = normalizePlatformResult('facebook', {
              success: false,
              blockedBySafetyPolicy: true,
              reason: rateCheck.reason
            });
            fbHandled = true;
          }
        }

        if (!fbHandled && tokenCapabilities.valid && tokenCapabilities.can_auto_publish_facebook) {
          upsertPublicationState({
            slotId, workOrderId, variantId, accountId, channel: 'facebook',
            contentVersion: contentHash, status: 'SUBMITTING', engine: 'META_GRAPH_API'
          });
          try {
            console.log('   ⚡ Đăng qua Meta Graph API chính thức...');
            let apiRes = null;
            if ((contentType === 'reel' || mediaInfo.isVideo) && activeMedia) {
              apiRes = await fbApi.publishFacebookReel({ video_url: activeMedia, description: fbText });
            } else if ((contentType === 'photo' || activeMedia) && activeMedia && !mediaInfo.isVideo) {
              apiRes = await fbApi.publishPhotoPost({ message: fbText, photo_url: activeMedia });
            } else {
              apiRes = await fbApi.publishFeedPost({ message: fbText, link });
            }

            const postId = apiRes.id || apiRes.post_id || apiRes.video_id || null;
            upsertPublicationState({
              slotId, workOrderId, variantId, accountId, channel: 'facebook',
              contentVersion: contentHash, status: 'VERIFIED',
              providerContainerId: apiRes.video_id || null,
              providerPostId: postId, engine: 'META_GRAPH_API'
            });
            recordPublishEvent({
              platform: 'facebook',
              contentType: activeMedia ? (mediaInfo.isVideo ? 'reel' : 'photo') : contentType,
              message: fbText,
              mediaPath: activeMedia,
              spaceArchetype,
              engine: 'META_GRAPH_API',
              remote_post_id: postId,
              slot_id: slotId,
              account_id: accountId,
              status: 'VERIFIED'
            });

            results.facebook = normalizePlatformResult('facebook', {
              success: true,
              contentType,
              engine: 'META_GRAPH_API',
              postId,
              containerId: apiRes.video_id || null,
              raw: apiRes
            });
            fbHandled = true;
            console.log(`   -> ✅ Đăng bài Facebook Fanpage qua Meta Graph API thành công! (Post ID: ${postId || 'OK'})`);
          } catch (err) {
            if (isAmbiguousNetworkError(err)) {
              console.warn(`   ⚠️ Lỗi mạng/timeout sau khi gọi Meta Graph API (${err.message}). Ghi UNKNOWN để đối soát, KHÔNG gửi trùng qua Chrome.`);
              upsertPublicationState({
                slotId, workOrderId, variantId, accountId, channel: 'facebook',
                contentVersion: contentHash, status: 'UNKNOWN',
                providerContainerId: err.video_id || null,
                engine: 'META_GRAPH_API', errorMessage: err.message
              });
              results.facebook = normalizePlatformResult('facebook', {
                status: 'UNKNOWN',
                engine: 'META_GRAPH_API',
                containerId: err.video_id || null,
                error: err.message
              });
              fbHandled = true;
            } else {
              console.warn(`   ⚠️ Meta Graph API phản hồi (${err.message}). Chuyển sang Playwright Meta Business Suite RPA...`);
            }
          }
        }

        if (!fbHandled) {
          try {
            await ensureBrowserSession();
            const mbsResult = await metaPlaywrightPublisher.publish({
              contentType: activeMedia ? (mediaInfo.isVideo ? 'reel' : 'photo') : contentType,
              message: fbText,
              mediaPath: activeMedia,
              allowInstagramCrosspost: targets.includes('instagram') && process.env.INSTAGRAM_AUTO_PUBLISH !== 'false',
              spaceArchetype,
              force,
              headless
            });
            results.facebook = normalizePlatformResult('facebook', mbsResult, 'PLAYWRIGHT_FB');
            upsertPublicationState({
              slotId, workOrderId, variantId, accountId, channel: 'facebook',
              contentVersion: contentHash,
              status: results.facebook.success ? 'VERIFIED' : 'FAILED',
              providerPostId: results.facebook.postId,
              engine: results.facebook.engine,
              proofScreenshot: results.facebook.proofScreenshot,
              errorMessage: results.facebook.error
            });
          } catch (mbsErr) {
            console.error(`   ❌ Lỗi Playwright Facebook: ${mbsErr.message}`);
            results.facebook = normalizePlatformResult('facebook', { success: false, error: mbsErr.message }, 'PLAYWRIGHT_FB');
            upsertPublicationState({
              slotId, workOrderId, variantId, accountId, channel: 'facebook',
              contentVersion: contentHash, status: 'FAILED',
              engine: 'PLAYWRIGHT_FB', errorMessage: mbsErr.message
            });
          }
        }
      }
    }

    // ── 2. XUẤT BẢN INSTAGRAM ─────────────────────────────────────────────────
    if (targets.includes('instagram') && process.env.INSTAGRAM_AUTO_PUBLISH !== 'false') {
      const existingIg = getVerifiedSlotPublication(slotId, 'instagram');
      const accountId = process.env.IG_BUSINESS_ACCOUNT_ID || 'nhacualand_ig';
      const variantId = `var_ig_${contentHash}`;

      if (existingIg && !force) {
        console.log(`\n📸 [2/3] Instagram: ✅ Đã VERIFIED trước đó (${existingIg.provider_post_id || existingIg.publication_id}), bỏ qua gửi trùng.`);
        results.instagram = normalizePlatformResult('instagram', {
          success: true,
          engine: existingIg.engine || 'IDEMPOTENT_SKIP',
          postId: existingIg.provider_post_id
        });
      } else if (results.facebook && results.facebook.success && results.facebook.crossPostedInstagram) {
        console.log('\n📸 [2/3] Instagram (@nhacualand): ✅ Đã đồng bộ đăng cùng Fanpage qua Meta Business Suite!');
        upsertPublicationState({
          slotId, workOrderId, variantId, accountId, channel: 'instagram',
          contentVersion: contentHash, status: 'VERIFIED',
          engine: 'META_BUSINESS_SUITE_CROSSPOST',
          proofScreenshot: results.facebook.proofScreenshot
        });
        recordPublishEvent({
          platform: 'instagram',
          contentType: mediaInfo.isVideo ? 'reel' : 'photo',
          message: igText,
          mediaPath: activeMedia,
          spaceArchetype,
          engine: 'META_BUSINESS_SUITE_CROSSPOST',
          proofScreenshot: results.facebook.proofScreenshot,
          slot_id: slotId,
          account_id: accountId,
          status: 'VERIFIED'
        });
        results.instagram = normalizePlatformResult('instagram', {
          success: true,
          engine: 'META_BUSINESS_SUITE_CROSSPOST',
          proofScreenshot: results.facebook.proofScreenshot
        });
      } else {
        if (results.facebook) await staggerPause();
        console.log('\n📸 [2/3] Đang xuất bản lên Instagram (@nhacualand)...');
        let igHandled = false;

        if (!force) {
          const rateCheck = checkPublishRateLimit('instagram');
          if (!rateCheck.allowed) {
            console.warn(`   🛑 RATE LIMIT INSTAGRAM: ${rateCheck.reason}`);
            results.instagram = normalizePlatformResult('instagram', {
              success: false,
              blockedBySafetyPolicy: true,
              reason: rateCheck.reason
            });
            igHandled = true;
          }
        }

        if (!igHandled && mediaInfo.isRemote && tokenCapabilities.valid && tokenCapabilities.can_auto_publish_instagram) {
          upsertPublicationState({
            slotId, workOrderId, variantId, accountId, channel: 'instagram',
            contentVersion: contentHash, status: 'SUBMITTING', engine: 'INSTAGRAM_GRAPH_API'
          });
          try {
            let apiRes = null;
            if (mediaInfo.isVideo || contentType === 'reel') {
              apiRes = await fbApi.publishInstagramReel({ video_url: activeMedia, caption: igText });
            } else {
              apiRes = await fbApi.publishInstagramPhoto({ image_url: activeMedia, caption: igText });
            }
            const igPostId = apiRes.id || null;
            upsertPublicationState({
              slotId, workOrderId, variantId, accountId, channel: 'instagram',
              contentVersion: contentHash, status: 'VERIFIED',
              providerPostId: igPostId, engine: 'INSTAGRAM_GRAPH_API'
            });
            recordPublishEvent({
              platform: 'instagram',
              contentType: mediaInfo.isVideo ? 'reel' : 'photo',
              message: igText,
              mediaPath: activeMedia,
              spaceArchetype,
              engine: 'INSTAGRAM_GRAPH_API',
              remote_post_id: igPostId,
              slot_id: slotId,
              account_id: accountId,
              status: 'VERIFIED'
            });
            results.instagram = normalizePlatformResult('instagram', {
              success: true,
              engine: 'INSTAGRAM_GRAPH_API',
              postId: igPostId,
              raw: apiRes
            });
            igHandled = true;
            console.log('   -> ✅ Đăng bài Instagram qua Instagram Graph API thành công!');
          } catch (err) {
            if (isAmbiguousNetworkError(err)) {
              console.warn(`   ⚠️ Timeout/lỗi mạng Instagram API (${err.message}). Ghi UNKNOWN để đối soát.`);
              upsertPublicationState({
                slotId, workOrderId, variantId, accountId, channel: 'instagram',
                contentVersion: contentHash, status: 'UNKNOWN',
                engine: 'INSTAGRAM_GRAPH_API', errorMessage: err.message
              });
              results.instagram = normalizePlatformResult('instagram', {
                status: 'UNKNOWN',
                engine: 'INSTAGRAM_GRAPH_API',
                error: err.message
              });
              igHandled = true;
            } else {
              console.warn(`   ⚠️ Instagram Graph API phản hồi (${err.message}). Chuyển sang Playwright Instagram RPA...`);
            }
          }
        }

        if (!igHandled) {
          try {
            if (!mediaInfo.existsLocal) {
              throw new Error(mediaInfo.isRemote
                ? 'Media là URL từ xa nhưng IG Graph API chưa khả dụng; không tự sinh ảnh thay thế.'
                : 'Thiếu file media cục bộ hợp lệ để đăng Instagram qua Playwright.');
            }
            await ensureBrowserSession();
            const igResult = await instagramPlaywrightPublisher.publish({
              contentType: mediaInfo.isVideo ? 'reel' : 'photo',
              message: igText,
              mediaPath: activeMedia,
              spaceArchetype,
              force,
              headless
            });
            results.instagram = normalizePlatformResult('instagram', igResult, 'PLAYWRIGHT_INSTAGRAM');
            upsertPublicationState({
              slotId, workOrderId, variantId, accountId, channel: 'instagram',
              contentVersion: contentHash,
              status: results.instagram.success ? 'VERIFIED' : 'FAILED',
              providerPostId: results.instagram.postId,
              engine: results.instagram.engine,
              proofScreenshot: results.instagram.proofScreenshot,
              errorMessage: results.instagram.error
            });
          } catch (igErr) {
            console.error(`   ❌ Lỗi Instagram: ${igErr.message}`);
            results.instagram = normalizePlatformResult('instagram', { success: false, error: igErr.message }, 'PLAYWRIGHT_INSTAGRAM');
            upsertPublicationState({
              slotId, workOrderId, variantId, accountId, channel: 'instagram',
              contentVersion: contentHash, status: 'FAILED',
              engine: 'PLAYWRIGHT_INSTAGRAM', errorMessage: igErr.message
            });
          }
        }
      }
    }

    // ── 3. XUẤT BẢN THREADS ───────────────────────────────────────────────────
    if (targets.includes('threads') && process.env.THREADS_AUTO_PUBLISH !== 'false') {
      const existingTh = getVerifiedSlotPublication(slotId, 'threads');
      const accountId = process.env.THREADS_USER_ID || 'nhacualand_threads';
      const variantId = `var_th_${contentHash}`;

      if (existingTh && !force) {
        console.log(`\n🧵 [3/3] Threads: ✅ Đã VERIFIED trước đó (${existingTh.provider_post_id || existingTh.publication_id}), bỏ qua gửi trùng.`);
        results.threads = normalizePlatformResult('threads', {
          success: true,
          engine: existingTh.engine || 'IDEMPOTENT_SKIP',
          postId: existingTh.provider_post_id
        });
      } else {
        if (results.facebook || results.instagram) await staggerPause();
        console.log('\n🧵 [3/3] Đang xuất bản lên Threads (@nhacualand)...');
        let thHandled = false;

        if (!force) {
          const rateCheck = checkPublishRateLimit('threads');
          if (!rateCheck.allowed) {
            console.warn(`   🛑 RATE LIMIT THREADS: ${rateCheck.reason}`);
            results.threads = normalizePlatformResult('threads', {
              success: false,
              blockedBySafetyPolicy: true,
              reason: rateCheck.reason
            });
            thHandled = true;
          }
        }

        if (!thHandled && process.env.THREADS_ACCESS_TOKEN && process.env.THREADS_USER_ID && (!activeMedia || mediaInfo.isRemote)) {
          upsertPublicationState({
            slotId, workOrderId, variantId, accountId, channel: 'threads',
            contentVersion: contentHash, status: 'SUBMITTING', engine: 'THREADS_GRAPH_API'
          });
          try {
            const thApiRes = await fbApi.publishThreadsPost({
              text: thText,
              media_url: mediaInfo.isRemote ? activeMedia : null
            });
            const thPostId = thApiRes.id || null;
            upsertPublicationState({
              slotId, workOrderId, variantId, accountId, channel: 'threads',
              contentVersion: contentHash, status: 'VERIFIED',
              providerPostId: thPostId, engine: 'THREADS_GRAPH_API'
            });
            recordPublishEvent({
              platform: 'threads',
              contentType: activeMedia ? 'media' : 'text',
              message: thText,
              mediaPath: activeMedia,
              spaceArchetype,
              engine: 'THREADS_GRAPH_API',
              remote_post_id: thPostId,
              slot_id: slotId,
              account_id: accountId,
              status: 'VERIFIED'
            });
            results.threads = normalizePlatformResult('threads', {
              success: true,
              engine: 'THREADS_GRAPH_API',
              postId: thPostId,
              raw: thApiRes
            });
            thHandled = true;
            console.log('   -> ✅ Đăng bài Threads qua Threads Official API thành công!');
          } catch (err) {
            if (isAmbiguousNetworkError(err)) {
              console.warn(`   ⚠️ Timeout/lỗi mạng Threads API (${err.message}). Ghi UNKNOWN để đối soát.`);
              upsertPublicationState({
                slotId, workOrderId, variantId, accountId, channel: 'threads',
                contentVersion: contentHash, status: 'UNKNOWN',
                engine: 'THREADS_GRAPH_API', errorMessage: err.message
              });
              results.threads = normalizePlatformResult('threads', {
                status: 'UNKNOWN',
                engine: 'THREADS_GRAPH_API',
                error: err.message
              });
              thHandled = true;
            } else {
              console.warn(`   ⚠️ Threads API phản hồi (${err.message}). Chuyển sang Playwright Threads RPA...`);
            }
          }
        }

        if (!thHandled) {
          try {
            await ensureBrowserSession();
            const thResult = await threadsPlaywrightPublisher.publish({
              message: thText,
              mediaPath: mediaInfo.existsLocal ? activeMedia : null,
              spaceArchetype,
              force,
              headless
            });
            results.threads = normalizePlatformResult('threads', thResult, 'PLAYWRIGHT_THREADS');
            upsertPublicationState({
              slotId, workOrderId, variantId, accountId, channel: 'threads',
              contentVersion: contentHash,
              status: results.threads.success ? 'VERIFIED' : 'FAILED',
              providerPostId: results.threads.postId,
              engine: results.threads.engine,
              proofScreenshot: results.threads.proofScreenshot,
              errorMessage: results.threads.error
            });
          } catch (thErr) {
            console.error(`   ❌ Lỗi Playwright Threads: ${thErr.message}`);
            results.threads = normalizePlatformResult('threads', { success: false, error: thErr.message }, 'PLAYWRIGHT_THREADS');
            upsertPublicationState({
              slotId, workOrderId, variantId, accountId, channel: 'threads',
              contentVersion: contentHash, status: 'FAILED',
              engine: 'PLAYWRIGHT_THREADS', errorMessage: thErr.message
            });
          }
        }
      }
    }
  } finally {
    if (browserStarted) {
      await playwrightManager.endBatchSession().catch(() => {});
    }
  }

  // ── TỔNG HỢP & BÁO CÁO KẾT QUẢ ĐA KÊNH ───────────────────────────────────
  results.success = targets.length > 0 && targets.every(t => results[t] && results[t].success === true);
  results.partialSuccess = !results.success && targets.some(t => results[t] && results[t].success === true);
  results.successfulTargets = targets.filter(t => results[t] && results[t].success === true);
  results.failedTargets = targets.filter(t => !results[t] || results[t].success !== true);
  results.unknownTargets = targets.filter(t => results[t] && results[t].status === 'UNKNOWN');

  console.log('\n----------------------------------------------------------------');
  console.log('📋 BÁO CÁO KẾT QUẢ XUẤT BẢN ĐA KÊNH:');
  console.log('----------------------------------------------------------------');
  for (const t of targets) {
    const res = results[t];
    const statusIcon = res && res.success ? '✅' : (res && res.status === 'UNKNOWN' ? '⏳' : '❌');
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
      ? '⚠️ XUẤT BẢN MỘT PHẦN (PARTIAL) — CÁC KÊNH LỖI SẼ ĐƯỢC THỬ LẠI RIÊNG.'
      : '❌ XUẤT BẢN ĐA KÊNH THẤT BẠI.'));
  console.log('================================================================\n');

  return results;
}

module.exports = {
  parseTargetPlatforms,
  classifyMediaInput,
  publishDirect
};
