'use strict';

/**
 * UNIFIED META GRAPH API CLIENT (FACEBOOK FANPAGE + INSTAGRAM BUSINESS + THREADS API)
 * Thương hiệu: Nhà Của Land (nhacualand.com) — Chỉ duy nhất tại D:\Facebook
 *
 * Hỗ trợ xuất bản tự động 100%:
 * 1. Facebook Fanpage: Feed Post, Local/Remote Photo Post, Facebook Reels.
 * 2. Instagram Business: Photo Post, Instagram Reels, Carousel Post.
 * 3. Threads Official API: Text, Image, Video Threads.
 */

require('./env-loader');
const fs = require('fs');
const path = require('path');

let _resolvedAuthCache = null;

function getConfig() {
  const graphVersion = process.env.META_GRAPH_VERSION || process.env.FB_GRAPH_VERSION || 'v21.0';
  return {
    graphVersion,
    graphBaseUrl: `https://graph.facebook.com/${graphVersion}`,
    userId: process.env.FB_USER_ID || '',
    userToken: process.env.FB_USER_TOKEN || '',
    businessId: process.env.META_BUSINESS_ID || '',
    appId: process.env.META_APP_ID || process.env.FB_APP_ID || '',
    pageId: (_resolvedAuthCache && _resolvedAuthCache.pageId) || process.env.META_PAGE_ID || process.env.FB_PAGE_ID || '',
    pageToken: (_resolvedAuthCache && _resolvedAuthCache.pageToken) || process.env.META_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN || process.env.FB_USER_TOKEN || '',
    igBusinessId: (_resolvedAuthCache && _resolvedAuthCache.igBusinessId) || process.env.IG_BUSINESS_ACCOUNT_ID || process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_USER_ID || '',
    igToken: process.env.INSTAGRAM_ACCESS_TOKEN || (_resolvedAuthCache && _resolvedAuthCache.pageToken) || process.env.META_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN || '',
    threadsBaseUrl: process.env.THREADS_API_BASE_URL || 'https://graph.threads.net/v1.0',
    threadsUserId: process.env.THREADS_USER_ID || '',
    threadsToken: process.env.THREADS_ACCESS_TOKEN || ''
  };
}

/**
 * Tự động phân giải User Token -> Page ID & Page Access Token của Fanpage Nhacualand
 */
async function resolvePageCredentials(forceRefresh = false) {
  if (_resolvedAuthCache && !forceRefresh) return _resolvedAuthCache;

  const cfg = getConfig();
  const candidateToken = cfg.pageToken || cfg.userToken;
  if (!candidateToken) return null;

  try {
    const dbgRes = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(candidateToken)}&access_token=${encodeURIComponent(candidateToken)}`
    );
    const dbgJson = await dbgRes.json();
    if (!dbgJson.data || !dbgJson.data.is_valid) return null;

    const info = dbgJson.data;
    const scopes = info.scopes || [];
    let resolvedPageId = cfg.pageId;
    let resolvedPageToken = candidateToken;
    let resolvedPageName = process.env.BRAND_FACEBOOK_PAGE || 'Nhacualand';
    let resolvedIgId = cfg.igBusinessId;

    if (info.type === 'PAGE' && info.profile_id) {
      resolvedPageId = info.profile_id;
    } else if (info.type === 'USER') {
      // Lấy danh sách target Page IDs từ granular_scopes hoặc /me/accounts
      const granularIds = [];
      for (const gs of info.granular_scopes || []) {
        for (const tid of gs.target_ids || []) {
          if (!granularIds.includes(tid)) granularIds.push(tid);
        }
      }

      if (resolvedPageId === info.user_id || !resolvedPageId) {
        resolvedPageId = granularIds[0] || '';
      }

      const candidatePageIds = [...new Set([resolvedPageId, ...granularIds].filter(Boolean))];
      for (const pid of candidatePageIds) {
        const pRes = await fetch(
          `${cfg.graphBaseUrl}/${pid}?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(candidateToken)}`
        );
        const pData = await pRes.json();
        if (pData && pData.id && !pData.error) {
          resolvedPageId = pData.id;
          resolvedPageName = pData.name || resolvedPageName;
          if (pData.access_token) resolvedPageToken = pData.access_token;
          if (pData.instagram_business_account && pData.instagram_business_account.id) {
            resolvedIgId = pData.instagram_business_account.id;
          }
          if (/nhacualand|nha cua land|nhà cửa land|nhà của land/i.test(resolvedPageName)) {
            break;
          }
        }
      }
    }

    _resolvedAuthCache = {
      valid: true,
      appId: info.app_id || cfg.appId,
      application: info.application || '',
      tokenType: resolvedPageToken !== candidateToken ? 'PAGE (Auto-Derived)' : info.type,
      userId: info.user_id || cfg.userId,
      pageId: resolvedPageId,
      pageName: resolvedPageName,
      pageToken: resolvedPageToken,
      igBusinessId: resolvedIgId,
      scopes,
      expiresAt: info.expires_at || 0,
      canManagePosts: scopes.includes('pages_manage_posts'),
      canPublishInstagram: scopes.includes('instagram_content_publish')
    };

    return _resolvedAuthCache;
  } catch (e) {
    return null;
  }
}

async function requestGraph(endpoint, method = 'GET', body = null, customToken = null) {
  const cfg = getConfig();
  const token = customToken || cfg.pageToken;
  const url = new URL(`${cfg.graphBaseUrl}/${endpoint}`);
  if (method === 'GET' && token) {
    url.searchParams.set('access_token', token);
  }

  const options = {
    method,
    headers: { 'Accept': 'application/json' }
  };

  if (body && method === 'POST') {
    const formData = new URLSearchParams();
    if (token) formData.append('access_token', token);
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null) {
        formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }
    options.body = formData.toString();
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const response = await fetch(url.toString(), options);
  const data = await response.json();
  if (data.error) {
    const err = new Error(`Meta Graph API Error: ${data.error.message} (Code: ${data.error.code})`);
    err.details = data.error;
    throw err;
  }
  return data;
}

/**
 * ── 1. FACEBOOK FANPAGE METHODS ──────────────────────────────────────────────
 */
async function getPageInfo() {
  await resolvePageCredentials();
  const { pageId, pageToken } = getConfig();
  if (!pageId || !pageToken) {
    throw new Error('Chưa cấu hình META_PAGE_ID hoặc META_PAGE_ACCESS_TOKEN trong .env');
  }
  return await requestGraph(`${pageId}?fields=id,name,category,link,followers_count,instagram_business_account{id,username,name}`);
}

async function publishFeedPost({ message, link = process.env.BRAND_WEBSITE || 'https://nhacualand.com' }) {
  await resolvePageCredentials();
  const { pageId, pageToken } = getConfig();
  if (!pageId || !pageToken) {
    throw new Error('Chưa cấu hình META_PAGE_ID hoặc META_PAGE_ACCESS_TOKEN');
  }
  const payload = { message };
  if (link) payload.link = link;
  return await requestGraph(`${pageId}/feed`, 'POST', payload);
}

async function publishPhotoPost({ message, photo_url }) {
  await resolvePageCredentials();
  const { graphBaseUrl, pageId, pageToken } = getConfig();
  if (!pageId || !pageToken) {
    throw new Error('Chưa cấu hình META_PAGE_ID hoặc META_PAGE_ACCESS_TOKEN');
  }

  // Hỗ trợ upload trực tiếp từ file ảnh cục bộ trên ổ đĩa D:\Facebook\data\images
  if (photo_url && !/^https?:\/\//i.test(photo_url) && fs.existsSync(photo_url)) {
    const fileBuffer = fs.readFileSync(photo_url);
    const ext = path.extname(photo_url).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const form = new FormData();
    form.append('access_token', pageToken);
    form.append('caption', message || '');
    form.append('source', new Blob([fileBuffer], { type: mime }), path.basename(photo_url));

    const res = await fetch(`${graphBaseUrl}/${pageId}/photos`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.error) throw new Error(`FB Local Photo Upload Error: ${data.error.message}`);
    return data;
  }

  return await requestGraph(`${pageId}/photos`, 'POST', {
    caption: message,
    url: photo_url
  });
}

async function publishFacebookReel({ video_url, description }) {
  const { pageId, pageToken } = getConfig();
  if (!pageId || !pageToken) {
    throw new Error('Chưa cấu hình META_PAGE_ID hoặc META_PAGE_ACCESS_TOKEN');
  }

  const init = await requestGraph(`${pageId}/video_reels`, 'POST', {
    upload_phase: 'start'
  });

  const videoId = init.video_id;
  const uploadUrl = init.upload_url || `https://rupload.facebook.com/video-upload/${getConfig().graphVersion}/${videoId}`;

  // Tải file video cục bộ hoặc URL từ xa lên rupload endpoint của Meta
  if (video_url && !/^https?:\/\//i.test(video_url) && fs.existsSync(video_url)) {
    const videoBytes = fs.readFileSync(video_url);
    await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${pageToken}`,
        'offset': '0',
        'file_size': String(videoBytes.length)
      },
      body: videoBytes
    });
  } else if (video_url && /^https?:\/\//i.test(video_url)) {
    await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${pageToken}`,
        'file_url': video_url
      }
    });
  }

  return await requestGraph(`${pageId}/video_reels`, 'POST', {
    upload_phase: 'finish',
    video_id: videoId,
    video_state: 'PUBLISHED',
    description: description
  });
}

/**
 * ── 2. INSTAGRAM BUSINESS GRAPH API METHODS ──────────────────────────────────
 */
async function resolveIgBusinessId() {
  const cfg = getConfig();
  if (cfg.igBusinessId) return cfg.igBusinessId;
  if (cfg.pageId && cfg.pageToken) {
    const info = await requestGraph(`${cfg.pageId}?fields=instagram_business_account{id,username}`, 'GET', null, cfg.pageToken);
    if (info.instagram_business_account?.id) {
      return info.instagram_business_account.id;
    }
  }
  throw new Error('Chưa cấu hình IG_BUSINESS_ACCOUNT_ID hoặc Fanpage chưa liên kết Instagram Business');
}

async function getInstagramInfo() {
  const cfg = getConfig();
  if (!cfg.igToken) throw new Error('Chưa cấu hình INSTAGRAM_ACCESS_TOKEN hoặc META_PAGE_ACCESS_TOKEN');
  const igId = await resolveIgBusinessId();
  return await requestGraph(
    `${igId}?fields=id,username,name,followers_count,media_count,profile_picture_url`,
    'GET',
    null,
    cfg.igToken
  );
}

async function waitForIgContainerReady(creationId, token, maxAttempts = 20) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await requestGraph(`${creationId}?fields=status_code,status`, 'GET', null, token);
    if (!status.status_code || status.status_code === 'FINISHED' || status.status_code === 'PUBLISHED') {
      return status;
    }
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Instagram Media Container thất bại (${status.status_code}): ${status.status || ''}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  return { status_code: 'TIMEOUT_PROCEED' };
}

async function publishInstagramPhoto({ image_url, caption }) {
  const cfg = getConfig();
  if (!cfg.igToken) throw new Error('Chưa cấu hình INSTAGRAM_ACCESS_TOKEN');
  if (!image_url || !/^https?:\/\//i.test(image_url)) {
    throw new Error('Instagram Graph API yêu cầu public HTTPS image_url (chuyển sang Playwright RPA cho file cục bộ).');
  }
  const igId = await resolveIgBusinessId();

  const container = await requestGraph(`${igId}/media`, 'POST', {
    image_url,
    caption
  }, cfg.igToken);

  await waitForIgContainerReady(container.id, cfg.igToken, 10);
  return await requestGraph(`${igId}/media_publish`, 'POST', {
    creation_id: container.id
  }, cfg.igToken);
}

async function publishInstagramReel({ video_url, caption, share_to_feed = true }) {
  const cfg = getConfig();
  if (!cfg.igToken) throw new Error('Chưa cấu hình INSTAGRAM_ACCESS_TOKEN');
  if (!video_url || !/^https?:\/\//i.test(video_url)) {
    throw new Error('Instagram Graph API yêu cầu public HTTPS video_url (chuyển sang Playwright RPA cho file MP4 cục bộ).');
  }
  const igId = await resolveIgBusinessId();

  const container = await requestGraph(`${igId}/media`, 'POST', {
    media_type: 'REELS',
    video_url,
    caption,
    share_to_feed
  }, cfg.igToken);

  await waitForIgContainerReady(container.id, cfg.igToken, 25);
  return await requestGraph(`${igId}/media_publish`, 'POST', {
    creation_id: container.id
  }, cfg.igToken);
}

async function publishInstagramCarousel({ media_urls = [], caption = '' }) {
  const cfg = getConfig();
  if (!cfg.igToken) throw new Error('Chưa cấu hình INSTAGRAM_ACCESS_TOKEN');
  const igId = await resolveIgBusinessId();

  const children = [];
  for (const url of media_urls) {
    const isVideo = /\.mp4(\?|$)/i.test(url);
    const item = await requestGraph(`${igId}/media`, 'POST', {
      is_carousel_item: true,
      ...(isVideo ? { media_type: 'VIDEO', video_url: url } : { image_url: url })
    }, cfg.igToken);
    await waitForIgContainerReady(item.id, cfg.igToken, 15);
    children.push(item.id);
  }

  const carousel = await requestGraph(`${igId}/media`, 'POST', {
    media_type: 'CAROUSEL',
    children: children.join(','),
    caption
  }, cfg.igToken);

  await waitForIgContainerReady(carousel.id, cfg.igToken, 15);
  return await requestGraph(`${igId}/media_publish`, 'POST', {
    creation_id: carousel.id
  }, cfg.igToken);
}

/**
 * ── 3. THREADS OFFICIAL API METHODS ──────────────────────────────────────────
 */
async function publishThreadsPost({ text, media_url = null }) {
  const { threadsBaseUrl, threadsUserId, threadsToken } = getConfig();
  if (!threadsUserId || !threadsToken) {
    throw new Error('Chưa cấu hình THREADS_USER_ID hoặc THREADS_ACCESS_TOKEN');
  }
  if (media_url && !/^https?:\/\//i.test(media_url)) {
    throw new Error('Threads Graph API yêu cầu public HTTPS media_url (chuyển sang Playwright RPA cho file cục bộ).');
  }

  const createUrl = `${threadsBaseUrl}/${threadsUserId}/threads`;
  const isVideo = media_url && /\.mp4(\?|$)/i.test(media_url);
  const containerParams = new URLSearchParams({
    media_type: media_url ? (isVideo ? 'VIDEO' : 'IMAGE') : 'TEXT',
    text: text,
    access_token: threadsToken
  });
  if (media_url) {
    containerParams.set(isVideo ? 'video_url' : 'image_url', media_url);
  }

  const createRes = await fetch(createUrl, { method: 'POST', body: containerParams });
  const createData = await createRes.json();
  if (createData.error) throw new Error(`Threads API Error: ${createData.error.message}`);

  const creationId = createData.id;
  if (isVideo) {
    await new Promise(r => setTimeout(r, 8000));
  }

  const publishUrl = `${threadsBaseUrl}/${threadsUserId}/threads_publish`;
  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: threadsToken
  });

  const publishRes = await fetch(publishUrl, { method: 'POST', body: publishParams });
  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(`Threads Publish Error: ${publishData.error.message}`);

  return publishData;
}

/**
 * ── 4. TOKEN & PERMISSION DIAGNOSTICS ────────────────────────────────────────
 */
async function verifyToken() {
  const cfg = getConfig();
  if (!cfg.pageToken) {
    return {
      valid: false,
      configured: false,
      instagram_configured: !!(cfg.igBusinessId && cfg.igToken),
      threads_configured: !!(cfg.threadsUserId && cfg.threadsToken),
      message: 'Chưa cấu hình Graph API Token trong .env (Đang kích hoạt Playwright Persistent Browser RPA làm động cơ chính 100%).'
    };
  }

  try {
    const resolved = await resolvePageCredentials(true);
    if (!resolved) {
      const url = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(cfg.pageToken)}&access_token=${encodeURIComponent(cfg.pageToken)}`;
      const res = await fetch(url);
      const data = await res.json();
      return { valid: false, configured: true, error: data.error || 'Token không hợp lệ hoặc đã hết hạn' };
    }

    return {
      valid: true,
      configured: true,
      app_id: resolved.appId,
      type: resolved.tokenType,
      application: resolved.application,
      user_id: resolved.userId,
      page_id: resolved.pageId,
      page_name: resolved.pageName,
      ig_business_account_id: resolved.igBusinessId || null,
      expires_at: resolved.expiresAt === 0 ? 'Vĩnh viễn (Never Expires)' : new Date(resolved.expiresAt * 1000).toISOString(),
      scopes: resolved.scopes,
      can_auto_publish_facebook: resolved.canManagePosts,
      can_auto_publish_instagram: resolved.canPublishInstagram,
      threads_configured: !!(cfg.threadsUserId && cfg.threadsToken),
      publish_engine_facebook: resolved.canManagePosts ? 'META_GRAPH_API_DIRECT' : 'PLAYWRIGHT_MBS_PERSISTENT_RPA (Zero-Bot-Block)',
      publish_engine_instagram: resolved.canPublishInstagram ? 'INSTAGRAM_GRAPH_API_DIRECT' : 'PLAYWRIGHT_INSTAGRAM_PERSISTENT_RPA',
      publish_engine_threads: (cfg.threadsUserId && cfg.threadsToken) ? 'THREADS_API_DIRECT' : 'PLAYWRIGHT_THREADS_PERSISTENT_RPA'
    };
  } catch (err) {
    return { valid: false, configured: true, error: err.message };
  }
}

module.exports = {
  getConfig,
  resolvePageCredentials,
  requestGraph,
  getPageInfo,
  publishFeedPost,
  publishPhotoPost,
  publishFacebookReel,
  resolveIgBusinessId,
  getInstagramInfo,
  publishInstagramPhoto,
  publishInstagramReel,
  publishInstagramCarousel,
  publishThreadsPost,
  verifyToken
};
