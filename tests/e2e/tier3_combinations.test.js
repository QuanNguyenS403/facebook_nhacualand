'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  WORKSPACE_ROOT,
  getIctDateString,
  snapshotProductionData,
  assertProductionDataUnchanged,
  assertEnvLoaderSafeForDryRun,
  assertDataDirHonored,
  createSeededCalendar,
  createTempWorkspace,
  cleanupEmptyTmpRoot,
  runNodeCliSafe,
  runNodeSnippetSafe,
  spawnHoldLockChild,
  killChildAsync,
  generateSyntheticPng,
  startLoopbackServer,
  withHeadlessPage
} = require('./_helpers');

const governance = require('../../lib/governance');
const processLock = require('../../lib/process-lock');
const contentPlanner = require('../../lib/content-planner');

function resolveAssertInsideWorkspace() {
  return governance.assertInsideWorkspace || processLock.assertInsideWorkspace || null;
}

describe('Tier 3 — Pairwise Cross-Feature Combinations (T3.1–T3.15)', () => {
  let prodSnap;

  before(() => {
    prodSnap = snapshotProductionData();
  });

  after(() => {
    cleanupEmptyTmpRoot();
    assertProductionDataUnchanged(prodSnap, 'Tier 3 suite completion');
  });

  it('T3.1 (F6 + F7 + F8 + F3): Offline Research -> Multi-Agent Roundtable -> AI Copywriting -> Rule 5 Omnichannel Gate', async () => {
    const ws = createTempWorkspace('t3_1');
    try {
      assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js required');
      assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/agent_council.js')), true, 'services/agent_council.js required');
      assert.equal(typeof governance.evaluateOmnichannelCaptions, 'function', 'evaluateOmnichannelCaptions required');

      const out = await runNodeSnippetSafe(`
        const ra = require('./services/research_agent');
        const council = require('./services/agent_council');
        const { generatePost } = require('./services/ai_pipeline');
        const { evaluateOmnichannelCaptions } = require('./lib/governance');
        (async () => {
          const brief = await ra.conductResearch({
            topic: 'Phòng trọ có cửa sổ thoáng đón nắng và điện nước rõ ràng',
            pillar: 'P2_CHDV_TRANSPARENT_COST',
            offline: true,
            dryRun: true
          });
          const meeting = await council.runMultiAgentRoundtable({
            slot: {
              slot_id: 'slot_combo_t31',
              slot_time: '11:30',
              pillar_id: 'P2_CHDV_TRANSPARENT_COST',
              pillar_name: 'Căn Hộ Dịch Vụ Minh Bạch Chi Phí',
              format: 'OMNICHANNEL_POST',
              concept_hook: brief.painPoints[0] || 'Phòng thoáng mát minh bạch chi phí'
            },
            researchBrief: brief,
            dryRun: true
          });
          const post = await generatePost({
            topic: meeting.consensus.angle,
            pillar: meeting.consensus.pillar
          });
          const check = evaluateOmnichannelCaptions(post);
          console.log(JSON.stringify({ brief, meeting, post, check }));
        })();
      `, { tempDir: ws.tempDir });

      assert.equal(out.status, 0, out.stderr);
      const parsed = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
      assertDataDirHonored(parsed.brief.filePath, ws.paths.knowledge, 'T3.1 brief.filePath');
      assertDataDirHonored(parsed.meeting.meetingFile, ws.paths.meetings, 'T3.1 meeting.meetingFile');
      assert.equal(fs.existsSync(parsed.brief.filePath), true);
      assert.equal(fs.existsSync(parsed.meeting.meetingFile), true);
      assert.equal(parsed.meeting.phases.length, 6);
      assert.equal(parsed.check.allowed, true, `Combined pipeline copy failed Rule 5: ${JSON.stringify(parsed.check.violations)}`);
    } finally {
      ws.cleanup();
    }
  });

  it('T3.2 (F5 + F13 + F2): Singleton Process Lock blocks overlapping company_orchestrator.js --dry-run execution', async () => {
    const ws = createTempWorkspace('t3_2');
    let holder = null;
    try {
      assertEnvLoaderSafeForDryRun();
      holder = await spawnHoldLockChild(ws.paths.lockFile);

      const cliRes = await runNodeCliSafe('scripts/company_orchestrator.js', [
        '--dry-run',
        '--media', 'image',
        '--topic', 'Kiểm tra khóa tiến trình khi chạy lịch tự động'
      ], { tempDir: ws.tempDir });

      assert.equal(cliRes.status, 0, `Orchestrator should exit cleanly when blocked by lock: ${cliRes.stderr}`);
      assert.match(cliRes.stdout, /PID|đang chạy|lock|Bỏ qua/i, 'Orchestrator must report lock contention and skip run');
    } finally {
      await killChildAsync(holder?.child);
      ws.cleanup();
    }
  });

  it('T3.3 (F4 + F3 + F12): ICT Midnight crossover + Per-Platform Rate Limit + publishDirect dry-run gating', async () => {
    const ws = createTempWorkspace('t3_3');
    try {
      assertEnvLoaderSafeForDryRun();
      // 18:30 UTC on Nov 24 == 01:30 ICT on Nov 25
      const ictSameDay = new Date('2026-11-24T18:30:00.000Z');
      const maxPosts = parseInt(process.env.MAX_POSTS_PER_PLATFORM_PER_DAY || '8', 10);

      // Seed maxPosts for Facebook between 17:05Z and 17:12Z (00:05-00:12 ICT on 2026-11-25, >15m ago on SAME ICT day)
      const baseMs = Date.parse('2026-11-24T17:05:00.000Z');
      const entries = Array.from({ length: maxPosts }, (_, idx) => ({
        timestamp: new Date(baseMs + idx * 60 * 1000).toISOString(),
        platform: 'facebook',
        contentType: 'feed'
      }));
      fs.writeFileSync(ws.paths.historyFile, JSON.stringify(entries, null, 2), 'utf8');

      const fbRate = governance.checkPublishRateLimit('facebook', {
        now: ictSameDay,
        historyFile: ws.paths.historyFile
      });
      const igRate = governance.checkPublishRateLimit('instagram', {
        now: ictSameDay,
        historyFile: ws.paths.historyFile
      });
      assert.equal(fbRate.allowed, false, 'Facebook must hit ICT daily cap for 2026-11-25 ICT');
      assert.equal(fbRate.countToday ?? fbRate.dailyCount, maxPosts);
      assert.equal(igRate.allowed, true, 'Instagram must stay unblocked independently');

      const validMsg = 'Tan làm mệt nhoài chỉ mong về căn phòng sạch sẽ thoáng mát. Tối về ngủ một giấc thật sâu lấy sức mai đi làm.';
      const out = await runNodeSnippetSafe(`
        const { publishDirect } = require('./services/publish-executor');
        (async () => {
          const res = await publishDirect({
            platform: 'instagram,threads',
            contentType: 'feed',
            message: ${JSON.stringify(validMsg)},
            instagram_caption: ${JSON.stringify(validMsg)},
            threads_caption: ${JSON.stringify(validMsg)},
            dryRun: true
          });
          console.log(JSON.stringify(res));
        })();
      `, { tempDir: ws.tempDir });

      assert.equal(out.status, 0, out.stderr);
      const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
      assert.equal(res.dryRun, true);
      assert.equal(res.success, true);
      assert.deepEqual(res.successfulTargets, ['instagram', 'threads']);
      assert.ok(res.stagingReportPath, 'Expected stagingReportPath from publishDirect dry-run');
      assertDataDirHonored(res.stagingReportPath, ws.tempDir, 'T3.3 stagingReportPath');
      assert.equal(fs.existsSync(res.stagingReportPath), true);
    } finally {
      ws.cleanup();
    }
  });

  it('T3.4 (F11 + F12 + F13): FFmpeg 9:16 Reel composition + Media Quality Gate -> publishDirect dry-run reel staging', async () => {
    const ws = createTempWorkspace('t3_4');
    try {
      assertEnvLoaderSafeForDryRun();
      const hfPath = path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js');
      assert.equal(fs.existsSync(hfPath), true, 'services/hyperframes_ffmpeg.js required');
      const HyperframesFFmpeg = require('../../services/hyperframes_ffmpeg');

      const img1 = generateSyntheticPng(path.join(ws.paths.images, 'reel_a.png'));
      const img2 = generateSyntheticPng(path.join(ws.paths.images, 'reel_b.png'));
      const reelPath = path.join(ws.paths.videos, 'combo_reel.mp4');

      const composed = await HyperframesFFmpeg.composeReel({
        imagePaths: [img1, img2],
        outputPath: reelPath,
        durationSec: 4,
        aspectRatio: '9:16'
      });
      const gate = await HyperframesFFmpeg.validateMediaQuality(composed.filePath, 'video');
      assert.equal(gate.passed, true);

      const caption = 'Phòng nhỏ có cửa sổ thoáng mát, chiều về nắng rọi vào góc bàn gọn gàng. Tối nằm nghỉ ngơi nghe tiếng mưa rơi nhẹ thấy lòng bình yên.';
      const out = await runNodeSnippetSafe(`
        const { publishDirect } = require('./services/publish-executor');
        (async () => {
          const res = await publishDirect({
            platform: 'all',
            contentType: 'reel',
            message: ${JSON.stringify(caption)},
            facebook_caption: ${JSON.stringify(caption)},
            instagram_caption: ${JSON.stringify(caption)},
            threads_caption: ${JSON.stringify(caption)},
            media_url: ${JSON.stringify(composed.filePath)},
            dryRun: true
          });
          console.log(JSON.stringify(res));
        })();
      `, { tempDir: ws.tempDir });

      assert.equal(out.status, 0, out.stderr);
      const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
      assert.equal(res.dryRun, true);
      assert.equal(res.success, true);
      assert.equal(res.mediaUsed, composed.filePath);
      assert.ok(res.stagingReportPath, 'Expected stagingReportPath from reel dry-run');
      assertDataDirHonored(res.stagingReportPath, ws.tempDir, 'T3.4 stagingReportPath');
      assert.equal(fs.existsSync(res.stagingReportPath), true);
    } finally {
      ws.cleanup();
    }
  });

  it('T3.5 (F1 + F6 + F7 + F10 + F11): Workspace Isolation verified across Research, Meeting, Image & Video artifact paths', async () => {
    const ws = createTempWorkspace('t3_5');
    try {
      const assertInsideWorkspace = resolveAssertInsideWorkspace();
      assert.equal(typeof assertInsideWorkspace, 'function', 'assertInsideWorkspace required');
      assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'research_agent.js required');
      assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/agent_council.js')), true, 'agent_council.js required');
      assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js')), true, 'hyperframes_ffmpeg.js required');

      const out = await runNodeSnippetSafe(`
        const ra = require('./services/research_agent');
        const council = require('./services/agent_council');
        const imageEngine = require('./services/image_engine');
        const HyperframesFFmpeg = require('./services/hyperframes_ffmpeg');
        const path = require('path');
        (async () => {
          const brief = await ra.conductResearch({ topic: 'Phòng trọ thoáng mát', offline: true, dryRun: true });
          const meeting = await council.runMultiAgentRoundtable({
            slot: { slot_id: 's_iso', slot_time: '08:30', format: 'OMNICHANNEL_POST', concept_hook: 'Phòng thoáng sáng' },
            researchBrief: brief,
            dryRun: true
          });
          const img = await imageEngine.generateImage({
            prompt: 'Bright clean studio room',
            aspectRatio: '3:4',
            mode: 'AUTO',
            dryRun: true
          });
          const vid = await HyperframesFFmpeg.composeReel({
            imagePaths: [img.filePath || img.file_path],
            outputPath: path.join(process.env.DATA_DIR, 'videos', 'iso_reel.mp4'),
            durationSec: 3,
            aspectRatio: '9:16'
          });
          console.log(JSON.stringify({
            briefPath: brief.filePath,
            meetingPath: meeting.meetingFile,
            imagePath: img.filePath || img.file_path,
            videoPath: vid.filePath
          }));
        })();
      `, { tempDir: ws.tempDir });

      assert.equal(out.status, 0, out.stderr);
      const { briefPath, meetingPath, imagePath, videoPath } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
      for (const [label, p] of [
        ['research artifact', briefPath],
        ['meeting artifact', meetingPath],
        ['image artifact', imagePath],
        ['video artifact', videoPath]
      ]) {
        assertInsideWorkspace(p);
        assertDataDirHonored(p, ws.tempDir, label);
        assert.equal(fs.existsSync(p), true, `${label} must exist at ${p}`);
      }
    } finally {
      ws.cleanup();
    }
  });

  it('T3.6 (F3 + F12): Rule 5 Omnichannel Gate + publishDirect partial-channel violation blocks entire publish', async () => {
    const ws = createTempWorkspace('t3_6');
    try {
      assertEnvLoaderSafeForDryRun();
      const goodFb = 'Tan làm mệt nhoài dắt xe về phòng trọ chỉ mong có chỗ ngủ yên tĩnh. Sáng dậy có ánh nắng rọi vào cửa sổ là thấy đủ năng lượng.';
      const goodIg = 'Mở cửa phòng ra thấy góc nhỏ sạch sẽ gọn gàng sau giờ làm việc. Đời đi thuê chỉ mong bình yên vậy thôi.';
      const badIg = 'Phòng đẹp số 1 khu vực! Liên hệ ngay 0981 753 082 hoặc truy cập nhacualand.com chốt cọc!';

      const out = await runNodeSnippetSafe(`
        const { publishDirect } = require('./services/publish-executor');
        (async () => {
          try {
            const res = await publishDirect({
              platform: 'all',
              contentType: 'photo',
              message: ${JSON.stringify(goodFb)},
              facebook_caption: ${JSON.stringify(goodFb)},
              instagram_caption: ${JSON.stringify(badIg)},
              threads_caption: ${JSON.stringify(goodIg)},
              dryRun: true
            });
            console.log(JSON.stringify({ blocked: false, res }));
          } catch (err) {
            console.log(JSON.stringify({ blocked: true, error: err.message }));
          }
        })();
      `, { tempDir: ws.tempDir });

      assert.equal(out.status, 0, out.stderr);
      const parsed = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
      assert.equal(parsed.blocked, true, 'Invalid instagram_caption must block omnichannel publishDirect');
    } finally {
      ws.cleanup();
    }
  });

  it('T3.7 (F4 + F5 + F13): Calendar expired-slot skip + Process Lock + Orchestrator --dry-run preserves SCHEDULED status and writes manifest', async () => {
    const todayIct = getIctDateString();
    const expired = createSeededCalendar('2020-02-01');
    const today = createSeededCalendar(todayIct);
    const ws = createTempWorkspace('t3_7', {
      seedCalendar: {
        ...today,
        plan: [...expired.plan, ...today.plan],
        total_slots: expired.plan.length + today.plan.length
      }
    });

    try {
      const cliRes = await runNodeCliSafe('scripts/company_orchestrator.js', [
        '--dry-run',
        '--media', 'image'
      ], { tempDir: ws.tempDir, timeoutMs: 60000 });

      assert.equal(cliRes.status, 0, `company_orchestrator.js --dry-run failed: ${cliRes.stderr}`);
      assert.equal(fs.existsSync(ws.paths.lockFile), false, 'Process lock must be released after orchestrator dry-run');

      const afterCal = JSON.parse(fs.readFileSync(ws.paths.calendarFile, 'utf8'));
      const anyPublished = afterCal.plan.some(s => s.status === 'PUBLISHED');
      assert.equal(anyPublished, false, 'Dry-run orchestrator must NOT mark calendar slots as PUBLISHED');

      const manifests = fs.readdirSync(ws.paths.outputs).filter(f => f.endsWith('.json'));
      assert.ok(manifests.length >= 1, 'Expected dry-run staging manifest in DATA_DIR/outputs/');
      const manifest = JSON.parse(fs.readFileSync(path.join(ws.paths.outputs, manifests[0]), 'utf8'));
      assert.equal(manifest.dryRun, true);
      if (manifest.slot && manifest.slot.date) {
        assert.ok(manifest.slot.date >= todayIct, `Orchestrator picked expired slot ${manifest.slot.date}`);
      }
    } finally {
      ws.cleanup();
    }
  });

  it('T3.8 (F12 + F1): Playwright Brand Asset Guards across FB, IG, and Threads using isolated browser fixtures', async () => {
    const ws = createTempWorkspace('t3_8');
    let thServer = null;
    try {
      assertEnvLoaderSafeForDryRun();
      const metaPublisher = require('../../services/meta_playwright_publisher');
      const igPublisher = require('../../services/instagram_playwright_publisher');

      const fbOk = await withHeadlessPage(async page => {
        await page.setContent('<div role="combobox">Nhacualand</div><div role="textbox"></div>');
        return await metaPublisher.ensureTargetFanpageSelected(page);
      });
      const fbWrong = await withHeadlessPage(async page => {
        await page.setContent('<div role="combobox">QuanNguyenS Shop</div><div>Nhacualand decoy text</div>');
        return await metaPublisher.ensureTargetFanpageSelected(page);
      });
      assert.equal(fbOk.matched, true);
      assert.equal(fbWrong.matched, false);

      const igOk = await withHeadlessPage(async page => {
        await page.setContent('<nav><a href="/nhacualand/">Profile</a></nav>');
        return await igPublisher.verifyLoggedInHandle(page);
      });
      const igWrong = await withHeadlessPage(async page => {
        await page.setContent('<nav><a href="/quannguyens/">Profile</a></nav>');
        return await igPublisher.verifyLoggedInHandle(page);
      });
      assert.equal(igOk.matched, true);
      assert.equal(igWrong.matched, false);

      thServer = await startLoopbackServer('<html><body><svg aria-label="Tạo"></svg><span>Có gì mới?</span><div role="textbox" contenteditable="true"></div></body></html>');
      const thOut = await runNodeSnippetSafe(`
        const threadsPublisher = require('./services/threads_playwright_publisher');
        threadsPublisher.threadsUrl = ${JSON.stringify(thServer.url)};
        (async () => {
          const res = await threadsPublisher.publish({ message: 'Phòng sáng thoáng.', force: true, headless: true });
          console.log(JSON.stringify({ screenshotDir: threadsPublisher.screenshotDir, res }));
        })();
      `, { tempDir: ws.tempDir });
      assert.equal(thOut.status, 0, thOut.stderr);
      const thParsed = JSON.parse(thOut.stdout.trim().split(/\r?\n/).pop());
      assertDataDirHonored(thParsed.screenshotDir, ws.paths.screenshots, 'Threads screenshotDir');
      assert.equal(thParsed.res.blockedByBrandAssetGuard, true);
    } finally {
      if (thServer) await thServer.close();
      ws.cleanup();
    }
  });

  it('T3.9 (F8 + F10 + F3): ai_pipeline.generatePost -> ImageEngine.generateImage -> HyperframesFFmpeg.validateMediaQuality + Rule 5', async () => {
    const ws = createTempWorkspace('t3_9');
    try {
      assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js')), true, 'hyperframes_ffmpeg.js required');
      const out = await runNodeSnippetSafe(`
        const { generatePost } = require('./services/ai_pipeline');
        const imageEngine = require('./services/image_engine');
        const HyperframesFFmpeg = require('./services/hyperframes_ffmpeg');
        const { evaluateOmnichannelCaptions } = require('./lib/governance');
        (async () => {
          const post = await generatePost({
            topic: 'Phòng có cửa sổ sáng sủa gió tự nhiên',
            pillar: 'P1_STUDIO_LIGHT_LIVING'
          });
          const gov = evaluateOmnichannelCaptions(post);
          const img = await imageEngine.generateImage({
            prompt: post.visual_prompt,
            aspectRatio: '3:4',
            mode: 'AUTO',
            dryRun: true
          });
          const imgPath = img.filePath || img.file_path;
          const qCheck = await HyperframesFFmpeg.validateMediaQuality(imgPath, 'image');
          console.log(JSON.stringify({ gov, imgPath, qCheck }));
        })();
      `, { tempDir: ws.tempDir });

      assert.equal(out.status, 0, out.stderr);
      const { gov, imgPath, qCheck } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
      assert.equal(gov.allowed, true, `Captions failed Rule 5: ${JSON.stringify(gov.violations)}`);
      assertDataDirHonored(imgPath, ws.paths.images, 'T3.9 imagePath');
      assert.equal(qCheck.passed, true, `Image quality gate failed: ${qCheck.reason}`);
    } finally {
      ws.cleanup();
    }
  });

  it('T3.10 (F8 + F11 + F3): ai_pipeline.generateVideoScript -> VideoEngine.renderReel -> HyperframesFFmpeg.validateMediaQuality', async () => {
    const ws = createTempWorkspace('t3_10');
    try {
      assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js')), true, 'hyperframes_ffmpeg.js required');
      const out = await runNodeSnippetSafe(`
        const { generateVideoScript } = require('./services/ai_pipeline');
        const videoEngine = require('./services/video-engine');
        const HyperframesFFmpeg = require('./services/hyperframes_ffmpeg');
        (async () => {
          const script = await generateVideoScript({
            concept: 'Chiều về phòng nghỉ ngơi yên tĩnh',
            durationSeconds: 4
          });
          const reel = await videoEngine.renderReel({
            title: script.title,
            hook: script.hook_3s,
            callToAction: script.call_to_action || '',
            duration: 4,
            aspectRatio: '9:16',
            mode: 'AUTO',
            dryRun: true
          });
          const vidPath = reel.filePath || reel.file_path;
          const qCheck = await HyperframesFFmpeg.validateMediaQuality(vidPath, 'video');
          console.log(JSON.stringify({ script, reel, vidPath, qCheck }));
        })();
      `, { tempDir: ws.tempDir });

      assert.equal(out.status, 0, out.stderr);
      const { script, reel, vidPath, qCheck } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
      assert.equal(String(script.call_to_action || '').trim(), '');
      assert.equal(/nhacualand|0981/i.test(JSON.stringify(script)), false);
      assertDataDirHonored(vidPath, ws.paths.videos, 'T3.10 videoPath');
      assert.ok((reel.fileSizeBytes || reel.size_bytes) >= 300 * 1024);
      assert.equal(qCheck.passed, true, `Video quality gate failed: ${qCheck.reason}`);
    } finally {
      ws.cleanup();
    }
  });

  it('T3.11 (F13 + F5): publish_now.js --dry-run + lib/process-lock.js contention & clean lock release', async () => {
    const ws = createTempWorkspace('t3_11');
    let holder = null;
    try {
      holder = await spawnHoldLockChild(ws.paths.lockFile);
      const contended = await runNodeCliSafe('scripts/publish_now.js', [
        '--dry-run',
        '--platform', 'all',
        '--message', 'Phòng sạch sẽ thoáng mát dễ ngủ. Tối về nghỉ ngơi thoải mái.'
      ], { tempDir: ws.tempDir });
      assert.equal(fs.existsSync(ws.paths.lockFile), true, 'Holder lock must remain intact on contention');
      assert.equal(JSON.parse(fs.readFileSync(ws.paths.lockFile, 'utf8')).pid, holder.info.pid);
      const stagedFiles = fs.readdirSync(ws.paths.outputs).filter(f => f.endsWith('.json'));
      assert.equal(stagedFiles.length, 0, 'Contended publish_now.js must NOT invoke publishDirect or write staging report');
      assert.equal(
        contended.stdout.includes('"blockedByBrandAssetGuard"') || contended.stdout.includes('"DRY_RUN_MOCK"'),
        false,
        'Contended publish_now.js must exit before publishDirect instead of running dry-run publish'
      );
      const combinedOut = `${contended.stdout}\n${contended.stderr}`;
      assert.match(
        combinedOut,
        new RegExp(`PID\\s*[:#]?\\s*${holder.info.pid}|đang chạy|bỏ qua|LOCK_HELD|orchestrator\\.lock`, 'i'),
        'Contended publish_now.js must report active lock contention'
      );

      await killChildAsync(holder.child);
      holder = null;
      if (fs.existsSync(ws.paths.lockFile)) fs.unlinkSync(ws.paths.lockFile);

      const spyPreloadPath = path.join(ws.tempDir, 'lock_spy_preload.js');
      fs.writeFileSync(spyPreloadPath, `
        'use strict';
        const fs = require('fs');
        const path = require('path');
        const lockMod = require(${JSON.stringify(path.join(WORKSPACE_ROOT, 'lib/process-lock'))});
        const spyFile = path.join(process.env.DATA_DIR, 'lock_spy.json');
        const stats = { acquiredCalls: 0, lastLockFile: null, existedWhileHeld: false, releasedCalls: 0 };
        const flush = () => fs.writeFileSync(spyFile, JSON.stringify(stats), 'utf8');
        flush();
        const origAcquire = lockMod.acquireProcessLock;
        lockMod.acquireProcessLock = function spiedAcquireProcessLock(opts) {
          const res = origAcquire.call(this, opts);
          if (res && res.acquired) {
            stats.acquiredCalls += 1;
            stats.lastLockFile = res.lockFile || null;
            stats.existedWhileHeld = Boolean(res.lockFile && fs.existsSync(res.lockFile));
            flush();
            const origRelease = res.release;
            res.release = function spiedRelease(rOpts) {
              stats.releasedCalls += 1;
              flush();
              return origRelease.call(this, rOpts);
            };
          }
          return res;
        };
        process.on('exit', flush);
      `, 'utf8');

      const cleanRun = await runNodeCliSafe('scripts/publish_now.js', [
        '--dry-run',
        '--platform', 'all',
        '--message', 'Phòng sạch sẽ thoáng mát dễ ngủ. Tối về nghỉ ngơi thoải mái.'
      ], { tempDir: ws.tempDir, nodeArgs: ['-r', spyPreloadPath] });
      assert.equal(cleanRun.status, 0, cleanRun.stderr);
      const spy = JSON.parse(fs.readFileSync(path.join(ws.tempDir, 'lock_spy.json'), 'utf8'));
      assert.ok(spy.acquiredCalls >= 1, 'publish_now.js --dry-run MUST acquire singleton process lock via lib/process-lock.js');
      assert.equal(spy.existedWhileHeld, true, 'orchestrator.lock must exist on disk while publish_now.js holds the lock');
      assert.ok(spy.releasedCalls >= 1, 'publish_now.js --dry-run must release acquired lock');
      assertDataDirHonored(spy.lastLockFile, ws.tempDir, 'T3.11 publish_now.js lockFile');
      assert.equal(fs.existsSync(ws.paths.lockFile), false, 'publish_now.js --dry-run must release lock after completion');
    } finally {
      await killChildAsync(holder?.child);
      ws.cleanup();
    }
  });

  it('T3.12 (F13 + F4 + F2): run_daily.cmd UTF-8 + run_daily_hidden.vbs contract + company_orchestrator.js --dry-run Vietnamese UTF-8 topic', async () => {
    const ws = createTempWorkspace('t3_12');
    try {
      const cmdRaw = fs.readFileSync(path.join(WORKSPACE_ROOT, 'run_daily.cmd'), 'utf8');
      const vbsRaw = fs.readFileSync(path.join(WORKSPACE_ROOT, 'run_daily_hidden.vbs'), 'utf8');
      assert.match(cmdRaw, /chcp\s+65001/i);
      assert.match(cmdRaw, /cd\s+\/d\s+"D:\\Facebook"/i);
      assert.match(cmdRaw, /node\s+scripts\\company_orchestrator\.js/i);
      assert.match(vbsRaw, /run_daily\.cmd/i);

      const cliRes = await runNodeCliSafe('scripts/company_orchestrator.js', [
        '--dry-run',
        '--media', 'image',
        '--topic', 'Thuê phòng trọ sạch sẽ minh bạch điện nước cho người đi làm'
      ], { tempDir: ws.tempDir, extraEnv: { REQUIRE_HUMAN_APPROVAL: 'false' }, timeoutMs: 60000 });

      assert.equal(cliRes.status, 0, cliRes.stderr);
      assert.match(cliRes.stdout, /TỰ PHÊ DUYỆT|autonomous|Dry-Run/i);
      const outputs = fs.readdirSync(ws.paths.outputs).filter(f => f.endsWith('.json'));
      assert.ok(outputs.length >= 1);
      const manifest = JSON.parse(fs.readFileSync(path.join(ws.paths.outputs, outputs[0]), 'utf8'));
      assert.equal(manifest.dryRun, true);
    } finally {
      ws.cleanup();
    }
  });

  it('T3.13 (F1 + F13): verify_account_isolation.js executed with isolated DATA_DIR & CHROME_USER_DATA_DIR leaves production profile untouched', async () => {
    const ws = createTempWorkspace('t3_13');
    try {
      const cli = await runNodeCliSafe('scripts/verify_account_isolation.js', [], {
        tempDir: ws.tempDir,
        extraEnv: { ADMIN_EMAIL: 'quannguyentop1lux@gmail.com' },
        timeoutMs: 30000
      });
      assert.equal(cli.status, 0, cli.stderr);
      assert.match(cli.stdout, /✅\s*Phạm vi thư mục độc lập/);
      assert.match(cli.stdout, /✅\s*Email quản trị chuẩn quy định/);
      assert.match(cli.stdout, /✅\s*Khóa bảo vệ tài sản thương hiệu/);
    } finally {
      ws.cleanup();
    }
  });

  it('T3.14 (F9 + F3): Non-caption conversion architecture + 4 nhacualand.com pillars + legacy CLI hygiene', () => {
    const brand = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/brand.json'), 'utf8'));
    const catalog = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/offer_catalog.json'), 'utf8'));

    assert.equal(brand.identity_scope, 'NON_CAPTION_BIO_WEBSITE_AND_ASSET_GUARD_ONLY');
    assert.equal(catalog.caption_enabled, false);
    assert.equal(contentPlanner.BRAND_PILLARS.length, 4);

    for (const pillar of contentPlanner.BRAND_PILLARS) {
      for (const h of pillar.sample_hooks) {
        const res = governance.evaluateContent({ caption: `${h.hook}. Tối về ngủ ngon giấc.` });
        assert.equal(res.allowed, true, `Pillar ${pillar.id} hook violated Rule 5`);
      }
    }

    const imgAgentSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'scripts/run_image_agent.js'), 'utf8');
    const flowAgentSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'scripts/run_google_flow_agent.js'), 'utf8');
    assert.equal(/https?:\/\/nhacualand\.com|0981\s*753\s*082|#NhaCuaLand/i.test(imgAgentSrc), false, 'run_image_agent.js contains legacy caption leak');
    assert.equal(/https?:\/\/nhacualand\.com|0981\s*753\s*082|#NhaCuaLand/i.test(flowAgentSrc), false, 'run_google_flow_agent.js contains legacy caption leak');
  });

  it('T3.15 (F2 + F7 + F3): Roundtable + WorkOrderGateway under REQUIRE_HUMAN_APPROVAL=false vs true', async () => {
    const ws = createTempWorkspace('t3_15');
    try {
      assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/agent_council.js')), true, 'agent_council.js required');

      const autoOut = await runNodeSnippetSafe(`
        const council = require('./services/agent_council');
        const gateway = require('./services/work-order-gateway');
        (async () => {
          const meeting = await council.runMultiAgentRoundtable({
            slot: { slot_id: 's_auto', slot_time: '08:30', format: 'OMNICHANNEL_POST', concept_hook: 'Phòng sáng thoáng dễ ngủ' },
            researchBrief: { briefId: 'b_a', insights: ['Ánh sáng'], painPoints: ['Tối'], renterTips: [], domainFacts: [] },
            dryRun: true
          });
          const order = await gateway.createOrder({ topic: meeting.consensus.angle, pillar: meeting.consensus.pillar });
          console.log(JSON.stringify({ status: order.status, selfApproved: order.compliance.selfApproved, humanReq: order.human_approval_required }));
        })();
      `, { tempDir: ws.tempDir, extraEnv: { REQUIRE_HUMAN_APPROVAL: 'false' } });
      assert.equal(autoOut.status, 0, autoOut.stderr);
      const autoRes = JSON.parse(autoOut.stdout.trim().split(/\r?\n/).pop());
      assert.equal(autoRes.status, 'SELF_APPROVED_READY_TO_PUBLISH');
      assert.equal(autoRes.selfApproved, true);
      assert.equal(autoRes.humanReq, false);

      const manualOut = await runNodeSnippetSafe(`
        const gateway = require('./services/work-order-gateway');
        (async () => {
          const order = await gateway.createOrder({ topic: 'Phòng sáng thoáng dễ ngủ', pillar: 'P1_STUDIO_LIGHT_LIVING' });
          console.log(JSON.stringify({ selfApproved: order.compliance.selfApproved }));
        })();
      `, { tempDir: ws.tempDir, extraEnv: { REQUIRE_HUMAN_APPROVAL: 'true' } });
      assert.equal(manualOut.status, 0, manualOut.stderr);
      const manualRes = JSON.parse(manualOut.stdout.trim().split(/\r?\n/).pop());
      assert.equal(manualRes.selfApproved, false);
    } finally {
      ws.cleanup();
    }
  });
});
