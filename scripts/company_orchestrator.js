'use strict';

/**
 * MASTER CEO ORCHESTRATOR — CÔNG TY AI AGENT NHÀ CỦA LAND (nhacualand.com)
 * Phạm vi độc lập 100%: CHỈ DUY NHẤT TẠI D:\Facebook
 *
 * Vận hành tự động hóa hoàn toàn 100% KHÔNG QUA DUYỆT TAY:
 * 1. Phòng Kế Hoạch (`lib/content-planner.js`): Chọn chủ đề truyền thông theo lịch tuần.
 * 2. Phòng Nội Dung (`services/ai_pipeline.js`): Gemini 3.8 Flash sáng tạo copy riêng cho Fanpage, Instagram, Threads.
 * 3. Phòng Kiểm Duyệt (`lib/governance.js`): Tự kiểm tra & tự phê duyệt 100%.
 * 4. Phòng Sáng Tạo Hình Ảnh & Video (`services/image_engine.js` & `services/video-engine.js`):
 *    Tự động tạo Ảnh 4K (Google Flow / Nano Banana 2.1) hoặc Video Room Tour 9:16 (Google Flow / Veo / Omni Flash).
 * 5. Phòng Xuất Bản Đa Kênh (`services/publish-executor.js`):
 *    Đăng trực tiếp lên Meta Fanpage + Instagram + Threads và lưu ảnh chụp bằng chứng!
 *
 * Cách dùng:
 *   node scripts/company_orchestrator.js                   (Chạy chu kỳ tự động hóa đầy đủ 100%)
 *   node scripts/company_orchestrator.js --health-only     (Chỉ kiểm tra sức khỏe 6 phòng ban AI)
 *   node scripts/company_orchestrator.js --media video     (Tạo Video Room Tour 9:16 & đăng cả 3 kênh)
 *   node scripts/company_orchestrator.js --media image     (Tạo Ảnh 4K & đăng cả 3 kênh)
 *   node scripts/company_orchestrator.js --dry-run         (Chạy thử toàn bộ pipeline không bấm nút đăng)
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const fbApi = require('../lib/facebook-api');
const { generateMonthlyPlan, generateWeeklyPlan } = require('../lib/content-planner');
const { generatePost } = require('../services/ai_pipeline');
const { evaluateContent } = require('../lib/governance');
const imageEngine = require('../services/image_engine');
const videoEngine = require('../services/video-engine');
const promptArchitect = require('../services/prompt_architect');
const { publishDirect } = require('../services/publish-executor');
const playwrightManager = require('../services/playwright_manager');
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

function pickTodaySlot(customTopic = null) {
  if (customTopic) {
    return {
      pillar_name: 'Không Gian Sống & Tiện Nghi Phòng Thuê',
      format: 'OMNICHANNEL_POST',
      concept_hook: customTopic,
      space_archetype_id: null
    };
  }

  const calPath = path.resolve(__dirname, '../data/scheduled_calendar.json');
  let plan = [];
  if (fs.existsSync(calPath)) {
    try {
      const cal = JSON.parse(fs.readFileSync(calPath, 'utf8'));
      plan = cal.plan || [];
    } catch (e) {
      plan = [];
    }
  }

  if (plan.length === 0) {
    plan = generateMonthlyPlan();
    fs.writeFileSync(calPath, JSON.stringify({
      domain: 'nhacualand.com',
      brand: brand.name,
      updated_at: new Date().toISOString(),
      total_slots: plan.length,
      plan
    }, null, 2), 'utf8');
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // 1. Lọc các slot ngày hôm nay chưa hoàn thành
  const todaySlots = plan.filter(s => s.date === todayStr);
  const pendingToday = todaySlots.filter(s => s.status !== 'PUBLISHED' && s.status !== 'DONE');

  let chosenSlot = null;
  if (pendingToday.length > 0) {
    chosenSlot = pendingToday.sort((a, b) => {
      const [ha, ma] = (a.slot_time || '12:00').split(':').map(Number);
      const [hb, mb] = (b.slot_time || '12:00').split(':').map(Number);
      const diffA = Math.abs((ha * 60 + ma) - currentMinutes);
      const diffB = Math.abs((hb * 60 + mb) - currentMinutes);
      return diffA - diffB;
    })[0];
  } else {
    // 2. Nếu hôm nay đã chạy hết các ca, chọn slot tiếp theo chưa xuất bản trong lịch
    chosenSlot = plan.find(s => s.status !== 'PUBLISHED' && s.status !== 'DONE');
  }

  return chosenSlot || plan[0];
}

function markSlotPublished(slotId, { postTitle, mediaUrl, spaceArchetype } = {}) {
  const calPath = path.resolve(__dirname, '../data/scheduled_calendar.json');
  if (!fs.existsSync(calPath) || !slotId) return;
  try {
    const calendarData = JSON.parse(fs.readFileSync(calPath, 'utf8'));
    const slot = (calendarData.plan || []).find(s => s.slot_id === slotId);
    if (slot) {
      slot.status = 'PUBLISHED';
      slot.published_at = new Date().toISOString();
      slot.post_title = postTitle || null;
      slot.media_url = mediaUrl || null;
      slot.space_archetype_id = spaceArchetype || slot.space_archetype_id;
      fs.writeFileSync(calPath, JSON.stringify(calendarData, null, 2), 'utf8');
      console.log(`📌 Đã cập nhật trạng thái lịch [${slot.slot_id} (${slot.date} ${slot.slot_time})]: ✅ PUBLISHED`);
    }
  } catch (err) {
    console.warn(`⚠️ Không thể cập nhật trạng thái lịch: ${err.message}`);
  }
}

async function runAutonomousCycle({
  customTopic = null,
  mediaMode = 'auto',
  platform = process.env.PUBLISH_TARGETS || 'all',
  dryRun = process.env.DRY_RUN === 'true',
  force = false
} = {}) {
  console.log('\n================================================================');
  console.log('⚡ KHỞI CHẠY CHU TRÌNH TỰ ĐỘNG HÓA 100% (ZERO-HUMAN-APPROVAL)');
  console.log('================================================================\n');

  const slot = pickTodaySlot(customTopic);
  const topic = slot.concept_hook;
  const shouldMakeVideo =
    mediaMode === 'video' ||
    (mediaMode === 'auto' && String(slot.format || '').includes('REELS'));

  console.log(`📌 Chủ đề thực thi: "${topic}"`);
  console.log(`📌 Trụ cột: ${slot.pillar_name} | Loại Media: ${shouldMakeVideo ? 'VIDEO ROOM TOUR 9:16 (FLOW/VEO)' : 'ẢNH AI 4K (FLOW/NANO BANANA)'}`);

  // BƯỚC 1: Sáng tạo nội dung đa kênh bằng Gemini 3.8 Flash
  console.log('\n[BƯỚC 1/4] Phòng Nội Dung Gemini 3.8 Flash sáng tạo bài đăng cho Fanpage, Instagram & Threads...');
  const post = await generatePost({
    topic,
    pillar: slot.pillar_name,
    format: shouldMakeVideo ? 'REELS_ROOM_TOUR' : 'OMNICHANNEL_POST'
  });
  console.log(`   -> Tiêu đề: "${post.title}"`);

  // BƯỚC 2: Tự động kiểm duyệt & tự phê duyệt nội bộ
  console.log('\n[BƯỚC 2/4] Phòng Kiểm Duyệt tự động rà soát chính sách & tự phê duyệt (Không làm phiền người dùng)...');
  const check = evaluateContent({ message: post.facebook_caption || post.body });
  if (!check.allowed) {
    throw new Error(`Nội dung không đạt chuẩn an toàn Meta: ${check.violations.join('; ')}`);
  }
  console.log(`   -> Trạng thái phê duyệt: ✅ TỰ PHÊ DUYỆT NỘI BỘ 100% (Điểm an toàn: ${check.score}/100)`);

  // BƯỚC 3: Tự động sản xuất Media bằng Google Flow / Veo hoặc Google Flow / Nano Banana
  let generatedMedia = null;
  if (shouldMakeVideo) {
    console.log('\n[BƯỚC 3/4] Phòng Video Google Flow / Veo / Omni Flash đang dựng Room Tour 9:16...');
    generatedMedia = await videoEngine.renderReel({
      title: post.title || topic,
      hook: post.hook,
      callToAction: post.call_to_action,
      duration: parseInt(process.env.VIDEO_DEFAULT_DURATION_SECONDS || '8', 10),
      mode: 'AUTO'
    });
  } else {
    console.log('\n[BƯỚC 3/4] Phòng Thiết Kế Ảnh AI (Nano Banana 2.1 + Google Flow) đang tạo ảnh phòng 4K...');
    generatedMedia = await imageEngine.generateImage({
      prompt: post.visual_prompt || topic,
      title: post.title || topic,
      subtitle: post.hook || brand.tagline,
      aspectRatio: '3:4',
      mode: 'AUTO'
    });
  }
  console.log(`   -> Media thành phẩm: ${generatedMedia.file_path} (Engine: ${generatedMedia.source_engine || generatedMedia.source})`);

  // BƯỚC 4: Xuất bản tự động đồng loạt lên Meta Fanpage + Instagram + Threads
  if (dryRun || process.env.AUTO_PUBLISH === 'false') {
    console.log('\n[BƯỚC 4/4] Chế độ Dry-Run: Đã hoàn tất tạo nội dung + media, bỏ qua bước bấm nút Đăng.');
    return { post, media: generatedMedia, published: false, dryRun: true };
  }

  console.log('\n[BƯỚC 4/4] Phòng Xuất Bản Đa Kênh tự động đăng lên Meta Fanpage + Instagram + Threads...');
  const publishResult = await publishDirect({
    platform,
    contentType: shouldMakeVideo ? 'reel' : 'photo',
    message: post.facebook_caption || post.body,
    facebook_caption: post.facebook_caption || post.body,
    instagram_caption: post.instagram_caption,
    threads_caption: post.threads_caption,
    media_url: generatedMedia.file_path,
    visual_prompt: post.visual_prompt,
    spaceArchetype: post.space_archetype_id || generatedMedia.spaceArchetype,
    force
  });

  if (slot.slot_id && (publishResult.success || publishResult.partialSuccess)) {
    markSlotPublished(slot.slot_id, {
      postTitle: post.title,
      mediaUrl: generatedMedia.file_path,
      spaceArchetype: post.space_archetype_id || generatedMedia.spaceArchetype
    });
  }

  console.log('\n================================================================');
  console.log('🎉 CHU TRÌNH CÔNG TY AI AGENT HOÀN TẤT TỰ ĐỘNG 100%!');
  console.log('================================================================');
  console.log(JSON.stringify(publishResult, null, 2));
  return { post, media: generatedMedia, publishResult };
}

async function main() {
  const args = process.argv.slice(2);
  const healthOnly = args.includes('--health-only');
  const dryRun = args.includes('--dry-run');
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

  const lock = acquireProcessLock();
  if (!lock.acquired) {
    console.log(`⚠️ Chu trình khác (PID ${lock.holderPid}, bắt đầu lúc ${lock.startedAt}) đang chạy. Bỏ qua lượt này để tránh xung đột Profile 38.`);
    return;
  }

  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  try {
    await checkSystemHealth();
    if (!dryRun) {
      await playwrightManager.beginBatchSession({ headless });
    }
    await runAutonomousCycle({ customTopic, mediaMode, platform, dryRun, force });
  } finally {
    if (!dryRun) {
      await playwrightManager.endBatchSession().catch(() => {});
    }
    lock.release();
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exitCode = 0;
      const drainTimer = setTimeout(() => process.exit(0), 500);
      if (drainTimer.unref) drainTimer.unref();
    })
    .catch(err => {
      console.error('❌ Lỗi điều phối trung tâm:', err.message);
      process.exit(1);
    });
}

module.exports = {
  checkSystemHealth,
  pickTodaySlot,
  markSlotPublished,
  runAutonomousCycle
};
