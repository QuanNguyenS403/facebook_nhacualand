'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
  buildSafeIsolatedEnv,
  runNodeCliSafe,
  runNodeSnippetSafe,
  spawnHoldLockChild,
  killChildAsync,
  probeMedia,
  startLoopbackServer,
  withHeadlessPage
} = require('./_helpers');

const governance = require('../../lib/governance');
const contentPlanner = require('../../lib/content-planner');

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function readJsonManifests(dir) {
  return listFilesRecursive(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ file: f, data: JSON.parse(fs.readFileSync(f, 'utf8')) }));
}

describe('Tier 4 — Real-World Workload Scenarios (Dry-Run / Staging Only, T4.1–T4.8)', () => {
  let prodSnap;

  before(() => {
    prodSnap = snapshotProductionData();
  });

  after(() => {
    cleanupEmptyTmpRoot();
    assertProductionDataUnchanged(prodSnap, 'Tier 4 suite completion');
  });

  it('T4.1: Scenario 1 — 08:30 Morning Studio Cycle (Calendar Slot -> Research -> Council -> Image -> Staging Manifest)', async () => {
    const todayIct = getIctDateString();
    const seeded = createSeededCalendar(todayIct);
    seeded.plan = [seeded.plan[0]]; // single 08:30 OMNICHANNEL_POST slot for deterministic pickup
    seeded.total_slots = 1;
    const ws = createTempWorkspace('t4_s1', { seedCalendar: seeded });

    try {
      const cliRes = await runNodeCliSafe('scripts/company_orchestrator.js', [
        '--dry-run',
        '--media', 'image'
      ], { tempDir: ws.tempDir, timeoutMs: 60000 });

      assert.equal(cliRes.status, 0, `Scenario 1 failed: ${cliRes.stderr}\n${cliRes.stdout}`);
      assert.equal(fs.existsSync(ws.paths.lockFile), false, 'Process lock must be released');

      const knowledgeFiles = readJsonManifests(ws.paths.knowledge);
      const meetingFiles = readJsonManifests(ws.paths.meetings);
      const imageFiles = listFilesRecursive(ws.paths.images);
      const manifests = readJsonManifests(ws.paths.outputs);

      assert.ok(knowledgeFiles.length >= 1, 'Expected research brief JSON in DATA_DIR/knowledge');
      assert.ok(meetingFiles.length >= 1, 'Expected roundtable meeting JSON in DATA_DIR/meetings');
      assert.ok(imageFiles.length >= 1, 'Expected generated image in DATA_DIR/images');
      assert.ok(manifests.length >= 1, 'Expected dry-run staging manifest JSON in DATA_DIR/outputs');

      const m = manifests[0].data;
      assert.equal(m.dryRun, true);
      assert.equal(m.published, false);
      assert.ok(m.post, 'Staging manifest must include generated post');
      const govCheck = governance.evaluateOmnichannelCaptions(m.post);
      assert.equal(govCheck.allowed, true, `Scenario 1 captions failed Rule 5: ${JSON.stringify(govCheck.violations)}`);

      const afterCal = JSON.parse(fs.readFileSync(ws.paths.calendarFile, 'utf8'));
      assert.equal(afterCal.plan[0].status, 'SCHEDULED', 'Dry-run must keep slot status SCHEDULED');
      assertProductionDataUnchanged(prodSnap, 'Scenario 1');
    } finally {
      ws.cleanup();
    }
  });

  it('T4.2: Scenario 2 — 19:45 9:16 Reel Room Tour Cycle with Hyperframes FFmpeg + Quality Gate', async () => {
    const todayIct = getIctDateString();
    const seeded = createSeededCalendar(todayIct);
    seeded.plan = [seeded.plan[2]]; // 19:45 REELS_CINEMATIC_ROOM_TOUR
    seeded.total_slots = 1;
    const ws = createTempWorkspace('t4_s2', { seedCalendar: seeded });

    try {
      const cliRes = await runNodeCliSafe('scripts/company_orchestrator.js', [
        '--dry-run',
        '--media', 'video'
      ], { tempDir: ws.tempDir, timeoutMs: 90000 });

      assert.equal(cliRes.status, 0, `Scenario 2 failed: ${cliRes.stderr}\n${cliRes.stdout}`);
      assert.equal(fs.existsSync(ws.paths.lockFile), false, 'Process lock must be released');

      const videoFiles = listFilesRecursive(ws.paths.videos).filter(f => f.endsWith('.mp4'));
      assert.ok(videoFiles.length >= 1, 'Expected 9:16 MP4 reel generated inside DATA_DIR/videos');

      const info = probeMedia(videoFiles[0]);
      const vStream = info.streams.find(s => s.codec_type === 'video');
      const aStream = info.streams.find(s => s.codec_type === 'audio');
      assert.ok(vStream, 'Expected valid video stream in generated reel');
      assert.ok(aStream, 'Expected valid audio stream in generated reel');
      assert.ok(vStream.height > vStream.width, `Expected vertical 9:16 video, got ${vStream.width}x${vStream.height}`);
      assert.ok(fs.statSync(videoFiles[0]).size >= 300 * 1024, 'Generated reel must pass >=300KB quality threshold');

      const manifests = readJsonManifests(ws.paths.outputs);
      assert.ok(manifests.length >= 1, 'Expected dry-run staging manifest in DATA_DIR/outputs');
      const m = manifests[0].data;
      assert.equal(m.dryRun, true);
      assert.equal(m.published, false);
      assert.ok(m.media, 'Staging manifest must include generated media');
      assert.equal(m.media.qualityPassed, true, 'Staging manifest media must report qualityPassed=true');
      assert.ok(m.post, 'Staging manifest must include generated post');
      const govCheck = governance.evaluateOmnichannelCaptions(m.post);
      assert.equal(govCheck.allowed, true, `Scenario 2 captions failed Rule 5: ${JSON.stringify(govCheck.violations)}`);
      assertProductionDataUnchanged(prodSnap, 'Scenario 2');
    } finally {
      ws.cleanup();
    }
  });

  it('T4.3: Scenario 3 — Offline/API-Outage Resilience (blank GEMINI_API_KEY + GOOGLE_FLOW_ENABLED=false)', async () => {
    const ws = createTempWorkspace('t4_s3');
    try {
      const cliRes = await runNodeCliSafe('scripts/company_orchestrator.js', [
        '--dry-run',
        '--media', 'image',
        '--topic', 'Phòng trọ tường mỏng ồn ào chỉ mong có góc yên tĩnh ngủ ngon'
      ], {
        tempDir: ws.tempDir,
        extraEnv: { GEMINI_API_KEY: '', GOOGLE_FLOW_ENABLED: 'false' },
        timeoutMs: 60000
      });

      assert.equal(cliRes.status, 0, `Scenario 3 offline fallback failed: ${cliRes.stderr}\n${cliRes.stdout}`);
      assert.equal(fs.existsSync(ws.paths.lockFile), false);
      assert.ok(listFilesRecursive(ws.paths.knowledge).length >= 1, 'Expected offline knowledge brief');
      assert.ok(listFilesRecursive(ws.paths.meetings).length >= 1, 'Expected offline meeting record');
      assert.ok(listFilesRecursive(ws.paths.images).length >= 1, 'Expected offline fallback image');

      const manifests = readJsonManifests(ws.paths.outputs);
      assert.ok(manifests.length >= 1, 'Expected dry-run staging manifest even when offline');
      const govCheck = governance.evaluateOmnichannelCaptions(manifests[0].data.post);
      assert.equal(govCheck.allowed, true, `Offline fallback captions failed Rule 5: ${JSON.stringify(govCheck.violations)}`);
      assertProductionDataUnchanged(prodSnap, 'Scenario 3');
    } finally {
      ws.cleanup();
    }
  });

  it('T4.4: Scenario 4 — Direct Omnichannel Dry-Run Staging (publish_now.js --dry-run --platform all)', async () => {
    const ws = createTempWorkspace('t4_s4');
    try {
      const validMsg = 'Xem ảnh trên mạng lung linh lắm, tới nơi phòng tối om ẩm mốc. Chỉ mong tìm được căn phòng sáng sủa sạch sẽ để tối về nghỉ ngơi.';
      const cliRes = await runNodeCliSafe('scripts/publish_now.js', [
        '--dry-run',
        '--platform', 'all',
        '--type', 'feed',
        '--message', validMsg
      ], { tempDir: ws.tempDir, timeoutMs: 45000 });

      assert.equal(cliRes.status, 0, `Scenario 4 failed: ${cliRes.stderr}\n${cliRes.stdout}`);
      assert.equal(fs.existsSync(ws.paths.lockFile), false, 'publish_now.js --dry-run must release lock');
      assert.deepEqual(JSON.parse(fs.readFileSync(ws.paths.historyFile, 'utf8')), [], 'Dry-run must NOT record live publish history');

      const manifests = readJsonManifests(ws.paths.outputs);
      assert.ok(manifests.length >= 1, 'publish_now.js --dry-run must write staging report JSON inside DATA_DIR/outputs');
      const report = manifests[0].data;
      assert.equal(report.dryRun, true);
      assert.deepEqual(report.successfulTargets, ['facebook', 'instagram', 'threads']);
      assertProductionDataUnchanged(prodSnap, 'Scenario 4');
    } finally {
      ws.cleanup();
    }
  });

  it('T4.5: Scenario 5 — Concurrent Scheduler Collision Protection + Stale Lock (>30m) Recovery', async () => {
    const ws = createTempWorkspace('t4_s5');
    let staleHolder = null;
    try {
      assertEnvLoaderSafeForDryRun();
      const scriptAbs = path.join(WORKSPACE_ROOT, 'scripts/company_orchestrator.js');
      const env = buildSafeIsolatedEnv(ws.tempDir);

      const spawnRun = () => new Promise(resolve => {
        const child = spawn(
          process.execPath,
          [scriptAbs, '--dry-run', '--media', 'image', '--topic', 'Kiểm thử chống xung đột tiến trình song song'],
          { cwd: WORKSPACE_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] }
        );
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve({ status: -1, stdout, stderr: stderr + '\nTIMEOUT' });
        }, 60000);
        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.on('close', code => {
          clearTimeout(timer);
          resolve({ status: code, stdout, stderr });
        });
      });

      // Launch runA, wait slightly so runA acquires orchestrator.lock reliably, then launch overlapping runB
      const pA = spawnRun();
      await new Promise(r => setTimeout(r, 150));
      const pB = spawnRun();
      const [runA, runB] = await Promise.all([pA, pB]);

      assert.equal(runA.status, 0, `Concurrent run A failed: ${runA.stderr}`);
      assert.equal(runB.status, 0, `Concurrent run B failed: ${runB.stderr}`);

      const combinedLogs = `${runA.stdout}\n---\n${runB.stdout}`;
      const oneSkipped = /đang chạy|Bỏ qua|holderPid|PID/i.test(combinedLogs);
      const atLeastOneCompleted = /Dry-Run|CHU TRÌNH|staging/i.test(combinedLogs);
      assert.equal(atLeastOneCompleted, true, 'At least one concurrent run must complete the dry-run cycle');
      assert.equal(oneSkipped, true, 'Overlapping run must detect active singleton lock and skip cleanly');
      assert.equal(fs.existsSync(ws.paths.lockFile), false, 'Lock file must be cleaned up after concurrent runs');

      // Sub-step 2: Stale lock (>30m) recovery
      staleHolder = await spawnHoldLockChild(ws.paths.lockFile);
      const thirtyOneMinsAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      fs.writeFileSync(
        ws.paths.lockFile,
        JSON.stringify({ pid: staleHolder.info.pid, startedAt: thirtyOneMinsAgo }, null, 2),
        'utf8'
      );

      const recoveryRun = await runNodeCliSafe('scripts/company_orchestrator.js', [
        '--dry-run',
        '--media', 'image',
        '--topic', 'Khôi phục khóa tiến trình quá hạn 31 phút'
      ], { tempDir: ws.tempDir, timeoutMs: 60000 });
      assert.equal(recoveryRun.status, 0, `Stale lock recovery run failed: ${recoveryRun.stderr}`);
      assert.equal(fs.existsSync(ws.paths.lockFile), false, 'Recovered lock must be released on exit');
      assertProductionDataUnchanged(prodSnap, 'Scenario 5');
    } finally {
      await killChildAsync(staleHolder?.child);
      ws.cleanup();
    }
  });

  it('T4.6: Scenario 6 — Cross-Channel Rule-5 Gate & Brand Asset Guard Fail-Closed Safety Net', async () => {
    const ws = createTempWorkspace('t4_s6');
    let thServer = null;
    try {
      const adCaption = 'Phòng đẹp số 1 tại nhacualand.com! Liên hệ ngay hotline 0981 753 082 chốt cọc giữ phòng hoàn hảo nhất!';

      // 1. CLI rejection via publish_now.js --dry-run
      const cliRes = await runNodeCliSafe('scripts/publish_now.js', [
        '--dry-run',
        '--platform', 'all',
        '--type', 'feed',
        '--message', adCaption
      ], { tempDir: ws.tempDir, timeoutMs: 45000 });
      assert.notEqual(cliRes.status, 0, 'publish_now.js --dry-run MUST reject promotional/branded copy with non-zero exit');

      // 2. Partial-channel rejection via publishDirect (good FB/TH, bad IG)
      const goodCaption = 'Tan làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ có cửa sổ thoáng là thấy bình yên.';
      const directOut = await runNodeSnippetSafe(`
        const { publishDirect } = require('./services/publish-executor');
        (async () => {
          try {
            await publishDirect({
              platform: 'all',
              contentType: 'feed',
              message: ${JSON.stringify(goodCaption)},
              facebook_caption: ${JSON.stringify(goodCaption)},
              instagram_caption: ${JSON.stringify(adCaption)},
              threads_caption: ${JSON.stringify(goodCaption)},
              dryRun: true
            });
            console.log(JSON.stringify({ rejected: false }));
          } catch (err) {
            console.log(JSON.stringify({ rejected: true, error: err.message }));
          }
        })();
      `, { tempDir: ws.tempDir });
      assert.equal(directOut.status, 0, directOut.stderr);
      assert.equal(JSON.parse(directOut.stdout.trim().split(/\r?\n/).pop()).rejected, true);

      // 3. Fail-closed Brand Asset Guards across FB, IG, and Threads
      const metaPublisher = require('../../services/meta_playwright_publisher');
      const igPublisher = require('../../services/instagram_playwright_publisher');

      const fbDecoy = await withHeadlessPage(async page => {
        await page.setContent('<div role="combobox">OtherShopPage</div><div>Nhacualand decoy mention</div>');
        return await metaPublisher.ensureTargetFanpageSelected(page);
      });
      assert.equal(fbDecoy.matched, false, 'FB guard must fail closed on bodyText decoy');

      const igWrong = await withHeadlessPage(async page => {
        await page.setContent('<nav><a href="/other_shop/">Trang cá nhân</a></nav>');
        return await igPublisher.verifyLoggedInHandle(page);
      });
      assert.equal(igWrong.matched, false, 'IG guard must fail closed on wrong handle');

      thServer = await startLoopbackServer('<html><body><svg aria-label="Tạo"></svg><span>Có gì mới?</span><div role="textbox" contenteditable="true"></div></body></html>');
      const thOut = await runNodeSnippetSafe(`
        const threadsPublisher = require('./services/threads_playwright_publisher');
        threadsPublisher.threadsUrl = ${JSON.stringify(thServer.url)};
        (async () => {
          const res = await threadsPublisher.publish({ message: 'Phòng sáng thoáng.', force: true, headless: true });
          console.log(JSON.stringify(res));
        })();
      `, { tempDir: ws.tempDir });
      assert.equal(thOut.status, 0, thOut.stderr);
      assert.equal(JSON.parse(thOut.stdout.trim().split(/\r?\n/).pop()).blockedByBrandAssetGuard, true);

      assertDataDirHonored(ws.tempDir, ws.tempDir);
      assertProductionDataUnchanged(prodSnap, 'Scenario 6');
    } finally {
      if (thServer) await thServer.close();
      ws.cleanup();
    }
  });

  it('T4.7: Scenario 7 — 00:15 ICT Midnight Boundary Calendar Rollover + Per-Platform Rate-Limit Reset', () => {
    const ws = createTempWorkspace('t4_s7');
    try {
      // 2026-11-24T17:15:00.000Z == 2026-11-25 00:15:00 ICT
      const nowMidnightPlus15 = new Date('2026-11-24T17:15:00.000Z');
      const nov24Slots = contentPlanner.generateSlotsForDate('2026-11-24', 0, 0);
      const nov25Slots = contentPlanner.generateSlotsForDate('2026-11-25', 3, 1);

      fs.writeFileSync(
        ws.paths.calendarFile,
        JSON.stringify({ domain: 'nhacualand.com', plan: [...nov24Slots, ...nov25Slots] }, null, 2),
        'utf8'
      );

      const picked = contentPlanner.pickTodaySlot({
        calendarPath: ws.paths.calendarFile,
        now: nowMidnightPlus15,
        persist: true
      });
      assert.ok(picked);
      assert.equal(picked.date, '2026-11-25');
      assert.equal(picked.slot_time, '08:30');

      const savedCal = JSON.parse(fs.readFileSync(ws.paths.calendarFile, 'utf8'));
      const nov24After = savedCal.plan.filter(s => s.date === '2026-11-24');
      assert.ok(nov24After.every(s => s.status === 'EXPIRED'), 'All Nov 24 ICT scheduled slots must expire at 00:15 ICT Nov 25');

      // Seed 8 Facebook posts at 2026-11-24 23:45 ICT (16:45Z — 30 mins ago, yesterday in ICT)
      const maxPosts = parseInt(process.env.MAX_POSTS_PER_PLATFORM_PER_DAY || '8', 10);
      const yesterdayHistory = Array.from({ length: maxPosts }, () => ({
        timestamp: '2026-11-24T16:45:00.000Z',
        platform: 'facebook',
        contentType: 'feed'
      }));
      fs.writeFileSync(ws.paths.historyFile, JSON.stringify(yesterdayHistory, null, 2), 'utf8');

      const rateAfterReset = governance.checkPublishRateLimit('facebook', {
        now: nowMidnightPlus15,
        historyFile: ws.paths.historyFile
      });
      assert.equal(rateAfterReset.allowed, true, 'Rate limit must reset to 0 after ICT midnight rollover');
      assert.equal(rateAfterReset.countToday ?? rateAfterReset.dailyCount, 0);
      assertProductionDataUnchanged(prodSnap, 'Scenario 7');
    } finally {
      ws.cleanup();
    }
  });

  it('T4.8: Scenario 8 — Multi-Slot Full Day (08:30, 11:30, 19:45) Dry-Run Staging Audit Trail & Isolation', async () => {
    const todayIct = getIctDateString();
    const seeded = createSeededCalendar(todayIct);
    const ws = createTempWorkspace('t4_s8', { seedCalendar: seeded });

    try {
      const slotTimes = ['08:30', '11:30', '19:45'];
      const seenManifestFiles = new Set();
      const executedSlotIds = new Set();
      for (let i = 0; i < slotTimes.length; i++) {
        const cliRes = await runNodeCliSafe('scripts/company_orchestrator.js', [
          '--dry-run',
          '--media', 'auto'
        ], { tempDir: ws.tempDir, timeoutMs: 90000 });
        assert.equal(cliRes.status, 0, `Full-day cycle ${i + 1} (${slotTimes[i]}) failed: ${cliRes.stderr}`);

        const currentManifests = readJsonManifests(ws.paths.outputs);
        const newManifests = currentManifests.filter(m => !seenManifestFiles.has(m.file));
        assert.equal(newManifests.length, 1, `Cycle ${i + 1} must emit exactly 1 new staging manifest`);
        const newManifest = newManifests[0];
        seenManifestFiles.add(newManifest.file);

        const pickedSlotId = newManifest.data.slot?.slot_id;
        assert.ok(pickedSlotId, `Cycle ${i + 1} staging manifest must include slot.slot_id`);
        assert.equal(executedSlotIds.has(pickedSlotId), false, `Slot ${pickedSlotId} was executed twice`);
        executedSlotIds.add(pickedSlotId);

        // Advance test's isolated calendar state by marking the exact executed slot_id PUBLISHED
        const cal = JSON.parse(fs.readFileSync(ws.paths.calendarFile, 'utf8'));
        const targetSlot = cal.plan.find(s => s.slot_id === pickedSlotId);
        assert.ok(targetSlot, `Picked slot ${pickedSlotId} must exist in seeded calendar`);
        targetSlot.status = 'PUBLISHED';
        fs.writeFileSync(ws.paths.calendarFile, JSON.stringify(cal, null, 2), 'utf8');
      }

      const manifests = readJsonManifests(ws.paths.outputs);
      const briefs = readJsonManifests(ws.paths.knowledge);
      const meetings = readJsonManifests(ws.paths.meetings);
      const images = listFilesRecursive(ws.paths.images);
      const videos = listFilesRecursive(ws.paths.videos).filter(f => f.endsWith('.mp4'));

      assert.equal(manifests.length, 3, `Expected 3 staging manifests for full day, got ${manifests.length}`);
      assert.equal(
        new Set(manifests.map(m => m.data.slot?.slot_id).filter(Boolean)).size,
        3,
        'Expected 3 distinct slot_ids across full-day manifests'
      );
      assert.ok(briefs.length >= 3, `Expected >=3 research briefs, got ${briefs.length}`);
      assert.ok(meetings.length >= 3, `Expected >=3 council meetings, got ${meetings.length}`);
      assert.ok(images.length >= 2, `Expected >=2 studio images, got ${images.length}`);
      assert.ok(videos.length >= 1, `Expected >=1 9:16 room tour reel, got ${videos.length}`);

      for (const m of manifests) {
        assert.equal(m.data.dryRun, true);
        assert.equal(m.data.published, false);
        const check = governance.evaluateOmnichannelCaptions(m.data.post);
        assert.equal(check.allowed, true, `Manifest ${path.basename(m.file)} failed Rule 5: ${JSON.stringify(check.violations)}`);
      }
      assertProductionDataUnchanged(prodSnap, 'Scenario 8');
    } finally {
      ws.cleanup();
    }
  });
});
