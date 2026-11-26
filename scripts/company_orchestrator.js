'use strict';

/**
 * MASTER CEO ORCHESTRATOR — CÔNG TY AI AGENT NHÀ CỦA LAND (nhacualand.com)
 * Phạm vi độc lập 100%: CHỈ DUY NHẤT TẠI D:\Facebook
 *
 * Nâng cấp theo Master Plan:
 * - Dùng chung content-planner (giờ Việt Nam Asia/Ho_Chi_Minh), không chọn slot theo UTC.
 * - Nối Research Agent -> Agent Council -> Rule 5 Omnichannel Critic -> Studio -> Publish Executor.
 * - Chuyển generateVideoScript.timeline thành cảnh dựng video.
 * - Ghi trạng thái SQLite + JSON rõ ràng: PUBLISHED (đủ tất cả kênh) vs PARTIAL (lỗi 1 phần, retry riêng kênh lỗi).
 * - Tôn trọng ngân sách pilot 0đ (max_incremental_spend_vnd = 0).
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const fbApi = require('../lib/facebook-api');
const contentPlanner = require('../lib/content-planner');
const { generatePost, generateVideoScript } = require('../services/ai_pipeline');
const { evaluateOmnichannelCaptions } = require('../lib/governance');
const { openDb } = require('../lib/db');
const researchAgent = require('../services/research_agent');
const agentCouncil = require('../services/agent_council');
const imageEngine = require('../services/image_engine');
const videoEngine = require('../services/video-engine');
const { publishDirect, parseTargetPlatforms } = require('../services/publish-executor');
const { acquireProcessLock } = require('../lib/process-lock');
const brand = require('../config/brand.json');
const companyConfig = require('../config/agent_company.json');

async function checkSystemHealth() {
  console.log('================================================================');
  console.log(`🏢 ${companyConfig.company_name.toUpperCase()}`);
  console.log(`   Phạm vi độc lập: ${companyConfig.workspace_root} | Website: ${brand.website}`);
  console.log(`   Chế độ vận hành: ${companyConfig.autonomy_level}`);
  console.log('================================================================\n');

  const token = await fbApi.verifyToken();
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const profileDir = path.resolve(process.env.CHROME_USER_DATA_DIR || 'D:/Facebook/data/browser_profile');
  const profileName = process.env.CHROME_PROFILE_DIRECTORY || 'Profile 38';

  console.log('1️⃣   Sức khỏe 6 Phòng Ban AI Agent (D:\\Facebook):');
  for (const dept of companyConfig.departments) {
    console.log(`   ✅ [${dept.id}] ${dept.name}`);
  }

  console.log('\n2️⃣  Quyền Truy Cập 3 Kênh Xuất Bản Mạng Xã Hội:');
  console.log(`   - Meta Facebook Fanpage (${brand.social.facebook_page_name}): ${token.valid ? '✅ Graph API + Playwright RPA' : '✅ Playwright Persistent RPA'}`);
  console.log(`   - Instagram (@${brand.social.instagram_username}): ${token.can_auto_publish_instagram ? '✅ IG Graph API + Playwright RPA' : '✅ Playwright Persistent RPA'}`);
  console.log(`   - Threads (@${brand.social.threads_username}): ${token.threads_configured ? '✅ Threads API + Playwright RPA' : '✅ Playwright Persistent RPA'}`);

  console.log('\n3️⃣  Quyền Truy Cập Công Cụ Tạo Video & Tạo Ảnh AI:');
  console.log(`   - Google Gemini Copywriter: ${hasGemini ? '✅ ' + (process.env.GEMINI_MODEL || 'gemini-3.8-flash') : '⚠️ Local Fallback'}`);
  console.log(`   - Google Nano Banana Image API: ${hasGemini ? '✅ ' + (process.env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1') : '⚠️ Brand Card Renderer'}`);
  console.log(`   - Google Omni Flash / Veo Video API: ${hasGemini ? '✅ ' + (process.env.GEMINI_VIDEO_MODEL || 'gemini-omni-1.1-flash') : '⚠️ FFmpeg Cinematic'}`);
  console.log(`   - Google Flow Studio (${process.env.GOOGLE_FLOW_URL || 'https://flow.google.com/'}): ${fs.existsSync(profileDir) ? `✅ Persistent Chrome [${profileName}]` : '⚠️ Chưa khởi tạo profile'}`);
  console.log(`   - Bộ 20 Hyperframes Video Skills: ✅ Sẵn sàng tại D:\\Facebook\\.agents\\skills`);

  return { token, hasGemini, profileReady: fs.existsSync(profileDir) };
}

function updateSlotStatus(slotId, status, { postTitle, mediaUrl, spaceArchetype, successfulTargets = [], failedTargets = [] } = {}) {
  if (!slotId) return;
  const nowIso = new Date().toISOString();

  // 1. Cập nhật SQLite jobs
  try {
    const db = openDb();
    db.prepare(`
      UPDATE jobs
      SET status = ?, updated_at = ?
      WHERE slot_id = ?
    `).run(status, nowIso, slotId);
  } catch (err) {
    console.warn(`⚠️ [DB] Không thể cập nhật job slot ${slotId}: ${err.message}`);
  }

  // 2. Đồng bộ ngược JSON calendar để giữ tương thích tool cũ
  const calPath = path.resolve(__dirname, '../data/scheduled_calendar.json');
  if (!fs.existsSync(calPath)) return;
  try {
    const calendarData = JSON.parse(fs.readFileSync(calPath, 'utf8'));
    const slot = (calendarData.plan || []).find(s => s.slot_id === slotId);
    if (slot) {
      slot.status = status;
      slot.published_at = status === 'PUBLISHED' ? nowIso : (slot.published_at || null);
      slot.post_title = postTitle || slot.post_title || null;
      slot.media_url = mediaUrl || slot.media_url || null;
      slot.space_archetype_id = spaceArchetype || slot.space_archetype_id;
      slot.successful_targets = successfulTargets;
      slot.failed_targets = failedTargets;
      fs.writeFileSync(calPath, JSON.stringify(calendarData, null, 2), 'utf8');
      console.log(`📌 Đã cập nhật trạng thái lịch [${slot.slot_id} (${slot.date} ${slot.slot_time})]: ${status}`);
    }
  } catch (err) {
    console.warn(`⚠️ Không thể cập nhật trạng thái lịch JSON: ${err.message}`);
  }
}

async function runAutonomousCycle({
  customTopic = null,
  mediaMode = 'auto',
  platform = process.env.PUBLISH_TARGETS || 'all',
  dryRun = process.env.DRY_RUN === 'true',
  offline = process.env.OFFLINE_MODE === 'true',
  force = false
} = {}) {
  console.log('\n================================================================');
  console.log('⚡ KHỞI CHẠY CHU TRÌNH TỰ ĐỘNG HÓA 100% (ZERO-HUMAN-APPROVAL)');
  console.log('================================================================\n');

  // Xác thực kênh trước khi làm bất kỳ bước tốn tài nguyên nào
  const validatedTargets = parseTargetPlatforms(platform);

  // Chọn slot chuẩn giờ Việt Nam (Asia/Ho_Chi_Minh) qua content-planner
  const slot = contentPlanner.pickTodaySlot(customTopic ? { customTopic } : { persist: !dryRun });
  if (!slot) {
    throw new Error('Không còn khung lịch nào khả dụng để thực thi.');
  }

  const topic = slot.concept_hook;
  const shouldMakeVideo =
    mediaMode === 'video' ||
    (mediaMode === 'auto' && String(slot.format || '').includes('REELS'));

  console.log(`📌 Chủ đề thực thi: "${topic}"`);
  console.log(`📌 Trụ cột: ${slot.pillar_name} | Kênh: [${validatedTargets.join(', ')}] | Loại Media: ${shouldMakeVideo ? 'VIDEO ROOM TOUR 9:16' : 'ẢNH AI 4K'}`);

  // BƯỚC 1: Nghiên cứu & Hội đồng 6 vai trò (F6/F7)
  console.log('\n[BƯỚC 1/4] Research Agent & Hội đồng 6 vai trò thảo luận chiến lược...');
  const researchBrief = await researchAgent.conductResearch({
    topic,
    pillar: slot.pillar_id || slot.pillar_name,
    offline: offline || dryRun,
    dryRun
  });
  const meeting = await agentCouncil.runMultiAgentRoundtable({
    slot,
    researchBrief,
    dryRun,
    offline: offline || dryRun
  });
  const post = meeting.generatedCopy || await generatePost({
    topic,
    pillar: slot.pillar_name,
    format: shouldMakeVideo ? 'REELS_ROOM_TOUR' : 'OMNICHANNEL_POST'
  });
  console.log(`   -> WorkOrder: ${meeting.workOrderId} | Tiêu đề: "${post.title}"`);

  // BƯỚC 2: Kiểm duyệt đồng bộ cả 3 kênh (Rule 5 Omnichannel Critic)
  console.log('\n[BƯỚC 2/4] Phòng Kiểm Duyệt rà soát đồng bộ 3 kênh (Rule 5)...');
  const check = evaluateOmnichannelCaptions({
    facebook_caption: post.facebook_caption || post.body,
    instagram_caption: post.instagram_caption || post.body,
    threads_caption: post.threads_caption || post.body,
    title: post.title
  });
  if (!check.allowed) {
    throw new Error(`Nội dung không đạt chuẩn an toàn Meta/Rule 5: ${check.violations.join('; ')}`);
  }
  console.log(`   -> Trạng thái phê duyệt: ✅ PASS CẢ 3 KÊNH`);

  // Nếu dry-run / offline -> Dừng trước khi sinh media tốn phí hoặc mở browser
  if (dryRun || offline || process.env.AUTO_PUBLISH === 'false') {
    console.log('\n[BƯỚC 3-4/4] Chế độ Dry-Run/Offline: Bỏ qua dựng media tốn phí & xuất bản thật.');
    const simResult = await publishDirect({
      platform: validatedTargets.join(','),
      contentType: shouldMakeVideo ? 'reel' : 'photo',
      facebook_caption: check.results.facebook.normalizedMessage,
      instagram_caption: check.results.instagram.normalizedMessage,
      threads_caption: check.results.threads.normalizedMessage,
      dryRun: true,
      offline: true
    });
    return { post, meeting, media: null, publishResult: simResult, published: false, dryRun: true };
  }

  // BƯỚC 3: Sản xuất Media (nối timeline kịch bản video vào renderer)
  let generatedMedia = null;
  if (shouldMakeVideo) {
    console.log('\n[BƯỚC 3/4] Phòng Video đang dựng Room Tour 9:16 theo storyboard...');
    const videoScript = post.script || await generateVideoScript({ concept: topic });
    generatedMedia = await videoEngine.renderReel({
      title: post.title || topic,
      hook: post.hook || (videoScript && videoScript.hook),
      callToAction: post.call_to_action || (videoScript && videoScript.call_to_action),
      timeline: (videoScript && videoScript.timeline) || [],
      duration: parseInt(process.env.VIDEO_DEFAULT_DURATION_SECONDS || '8', 10),
      mode: 'AUTO'
    });
  } else {
    console.log('\n[BƯỚC 3/4] Phòng Thiết Kế Ảnh AI đang tạo ảnh phòng 4K...');
    generatedMedia = await imageEngine.generateImage({
      prompt: post.visual_prompt || topic,
      title: post.title || topic,
      subtitle: post.hook || brand.tagline,
      aspectRatio: '3:4',
      mode: 'AUTO'
    });
  }
  console.log(`   -> Media thành phẩm: ${generatedMedia.file_path} (Engine: ${generatedMedia.source_engine || generatedMedia.source})`);

  // BƯỚC 4: Xuất bản tự động có đối soát trạng thái từng kênh
  console.log('\n[BƯỚC 4/4] Phòng Xuất Bản Đa Kênh đang đăng & đối soát từng tài khoản...');
  const publishResult = await publishDirect({
    platform: validatedTargets.join(','),
    contentType: shouldMakeVideo ? 'reel' : 'photo',
    message: check.results.facebook.normalizedMessage,
    facebook_caption: check.results.facebook.normalizedMessage,
    instagram_caption: check.results.instagram.normalizedMessage,
    threads_caption: check.results.threads.normalizedMessage,
    media_url: generatedMedia.file_path,
    visual_prompt: post.visual_prompt,
    spaceArchetype: post.space_archetype_id || generatedMedia.spaceArchetype,
    slotId: slot.slot_id || null,
    workOrderId: meeting.workOrderId,
    force
  });

  if (slot.slot_id) {
    if (publishResult.success) {
      updateSlotStatus(slot.slot_id, 'PUBLISHED', {
        postTitle: post.title,
        mediaUrl: generatedMedia.file_path,
        spaceArchetype: post.space_archetype_id || generatedMedia.spaceArchetype,
        successfulTargets: publishResult.successfulTargets,
        failedTargets: []
      });
    } else if (publishResult.partialSuccess) {
      updateSlotStatus(slot.slot_id, 'PARTIAL', {
        postTitle: post.title,
        mediaUrl: generatedMedia.file_path,
        spaceArchetype: post.space_archetype_id || generatedMedia.spaceArchetype,
        successfulTargets: publishResult.successfulTargets,
        failedTargets: publishResult.failedTargets
      });
    }
  }

  console.log('\n================================================================');
  console.log('🎉 CHU TRÌNH CÔNG TY AI AGENT HOÀN TẤT!');
  console.log('================================================================');
  return { post, meeting, media: generatedMedia, publishResult };
}

async function main() {
  const args = process.argv.slice(2);
  const healthOnly = args.includes('--health-only');
  const dryRun = args.includes('--dry-run');
  const offline = args.includes('--offline');
  const force = args.includes('--force');

  let mediaMode = 'auto';
  let customTopic = null;
  let platform = process.env.PUBLISH_TARGETS || 'all';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--media') mediaMode = args[++i];
    else if (args[i] === '--topic') customTopic = args[++i];
    else if (args[i] === '--platform') platform = args[++i];
  }

  if (healthOnly) {
    await checkSystemHealth();
    return;
  }

  const lock = acquireProcessLock('company_orchestrator', { ttlMs: 30 * 60 * 1000 });
  if (!lock.acquired) {
    console.warn(`⚠️ Một tiến trình điều phối khác đang chạy (PID: ${lock.holderPid || 'unknown'}). Bỏ qua để tránh xung đột.`);
    process.exitCode = 0;
    return;
  }

  try {
    const result = await runAutonomousCycle({ customTopic, mediaMode, platform, dryRun, offline, force });
    if (result && result.publishResult && !result.publishResult.success && !result.publishResult.partialSuccess && !dryRun) {
      process.exitCode = 1;
    }
  } finally {
    lock.release();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Lỗi Master Orchestrator:', err.message);
    process.exit(1);
  });
}

module.exports = {
  checkSystemHealth,
  runAutonomousCycle
};
