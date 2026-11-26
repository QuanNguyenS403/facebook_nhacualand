'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  WORKSPACE_ROOT,
  getIctDateString,
  snapshotProductionData,
  assertProductionDataUnchanged,
  assertEnvLoaderSafeForDryRun,
  assertDataDirHonored,
  createTempWorkspace,
  cleanupEmptyTmpRoot,
  runNodeCliSafe,
  runNodeSnippetSafe,
  runNodeSnippetWithMockGenAi,
  spawnHoldLockChild,
  gracefulExitChildAsync,
  killChildAsync,
  generateSyntheticVideo,
  generateSyntheticPng,
  probeMedia,
  startLoopbackServer,
  withHeadlessPage
} = require('./_helpers');

const governance = require('../../lib/governance');
const processLock = require('../../lib/process-lock');
const contentPlanner = require('../../lib/content-planner');

function resolveAssertInsideWorkspace() {
  return governance.assertInsideWorkspace || processLock.assertInsideWorkspace || null;
}

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

describe('Tier 1 — Happy-Path Feature Verification (F1–F13)', () => {
  let prodSnap;

  before(() => {
    prodSnap = snapshotProductionData();
  });

  after(() => {
    cleanupEmptyTmpRoot();
    assertProductionDataUnchanged(prodSnap, 'Tier 1 suite completion');
  });

  // =========================================================================
  // F1: Strict D:\Facebook Isolation & Admin Email (5 tests)
  // =========================================================================
  describe('F1: Strict D:\\Facebook Isolation & Admin Email', () => {
    it('F1.1: Recursive static scan of lib/, services/, scripts/, config/ and root entrypoints has zero CSKH/QuanNguyenS/gmkt/ketoantkmg refs', () => {
      const scanDirs = ['lib', 'services', 'scripts', 'config'];
      const rootFiles = ['run_daily.cmd', 'run_daily_hidden.vbs', 'package.json', '.env'];
      const forbiddenPattern = /\b(cskh|quannguyens|gmkt|ketoantkmg)\b|d:[\\/]cskh/i;
      const hits = [];

      for (const relDir of scanDirs) {
        const absDir = path.join(WORKSPACE_ROOT, relDir);
        for (const full of listFilesRecursive(absDir)) {
          const content = fs.readFileSync(full, 'utf8');
          if (forbiddenPattern.test(content)) {
            hits.push(path.relative(WORKSPACE_ROOT, full));
          }
        }
      }

      for (const relFile of rootFiles) {
        const full = path.join(WORKSPACE_ROOT, relFile);
        if (!fs.existsSync(full)) continue;
        const content = fs.readFileSync(full, 'utf8');
        if (forbiddenPattern.test(content)) {
          hits.push(relFile);
        }
      }

      assert.deepEqual(hits, [], `Forbidden external-workspace references found in: ${hits.join(', ')}`);
    });

    it('F1.2: .env and config files pin workspace to D:/Facebook and admin email to quannguyentop1lux@gmail.com', () => {
      const envRaw = fs.readFileSync(path.join(WORKSPACE_ROOT, '.env'), 'utf8');
      assert.match(envRaw, /WORKSPACE_ROOT\s*=\s*["']?D:[\\/]Facebook["']?/i);
      assert.match(envRaw, /ISOLATION_MODE\s*=\s*["']?STRICT_STANDALONE_D_FACEBOOK["']?/);
      assert.match(envRaw, /ADMIN_EMAIL\s*=\s*["']?quannguyentop1lux@gmail\.com["']?/i);

      const brand = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/brand.json'), 'utf8'));
      const runtime = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/runtime.json'), 'utf8'));
      const company = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/agent_company.json'), 'utf8'));

      assert.equal(brand.admin_email, 'quannguyentop1lux@gmail.com');
      assert.match(runtime.workspace, /^D:[\\/]Facebook$/i);
      assert.match(company.workspace_root, /^D:[\\/]Facebook$/i);
      assert.equal(company.admin_email, 'quannguyentop1lux@gmail.com');
    });

    it('F1.3: assertInsideWorkspace accepts valid paths inside D:\\Facebook', () => {
      const assertInsideWorkspace = resolveAssertInsideWorkspace();
      assert.equal(typeof assertInsideWorkspace, 'function', 'assertInsideWorkspace must be exported');

      const valid1 = assertInsideWorkspace('D:\\Facebook\\data\\images\\room.png');
      const valid2 = assertInsideWorkspace('D:/Facebook/data/knowledge/brief.json');
      const valid3 = assertInsideWorkspace('tests/.e2e_tmp/sample.json');
      assert.ok(path.resolve(valid1).toLowerCase().startsWith('d:\\facebook\\'));
      assert.ok(path.resolve(valid2).toLowerCase().startsWith('d:\\facebook\\'));
      assert.ok(path.resolve(valid3).toLowerCase().startsWith('d:\\facebook\\'));
    });

    it('F1.4: verify_account_isolation.js accepts both allowed admin emails (quannguyentop1lux & ducquan16102006)', async () => {
      const ws = createTempWorkspace('f1_4');
      try {
        for (const allowedEmail of ['quannguyentop1lux@gmail.com', 'ducquan16102006@gmail.com']) {
          const cli = await runNodeCliSafe('scripts/verify_account_isolation.js', [], {
            tempDir: ws.tempDir,
            extraEnv: { ADMIN_EMAIL: allowedEmail },
            timeoutMs: 30000
          });
          assert.equal(cli.status, 0, `verify_account_isolation.js failed for ${allowedEmail}: ${cli.stderr}`);
          assert.match(cli.stdout, /✅\s*Email quản trị chuẩn quy định/);
          assert.ok(cli.stdout.includes(allowedEmail), `Expected stdout to include ${allowedEmail}`);
        }
      } finally {
        ws.cleanup();
      }
    });

    it('F1.5: DATA_DIR isolation is honored across core modules and publishers without touching D:\\Facebook\\data\\', async () => {
      const ws = createTempWorkspace('f1_5');
      try {
        const out = await runNodeSnippetSafe(`
          const governance = require('./lib/governance');
          const processLock = require('./lib/process-lock');
          const contentPlanner = require('./lib/content-planner');
          const imageEngine = require('./services/image_engine');
          const videoEngine = require('./services/video-engine');
          const metaPub = require('./services/meta_playwright_publisher');
          const igPub = require('./services/instagram_playwright_publisher');
          const thPub = require('./services/threads_playwright_publisher');

          governance.recordPublishEvent({
            platform: 'facebook',
            contentType: 'feed',
            message: 'Phòng sạch thoáng sáng.',
            spaceArchetype: 'scandinavian_airy_studio'
          });
          const slot = contentPlanner.pickTodaySlot(null);
          const lock = processLock.acquireProcessLock();
          const lockFile = lock.lockFile;
          lock.release();

          console.log(JSON.stringify({
            lockFile,
            slotDate: slot ? slot.date : null,
            imageDir: imageEngine.outputDir,
            videoDir: videoEngine.outputDir,
            metaShots: metaPub.screenshotDir,
            igShots: igPub.screenshotDir,
            thShots: thPub.screenshotDir
          }));
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const info = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assertDataDirHonored(info.lockFile, ws.tempDir, 'processLock default lockFile');
        assertDataDirHonored(info.imageDir, ws.tempDir, 'ImageEngine.outputDir');
        assertDataDirHonored(info.videoDir, ws.tempDir, 'VideoEngine.outputDir');
        assertDataDirHonored(info.metaShots, ws.tempDir, 'MetaPlaywrightPublisher.screenshotDir');
        assertDataDirHonored(info.igShots, ws.tempDir, 'InstagramPlaywrightPublisher.screenshotDir');
        assertDataDirHonored(info.thShots, ws.tempDir, 'ThreadsPlaywrightPublisher.screenshotDir');

        const historyWritten = JSON.parse(fs.readFileSync(ws.paths.historyFile, 'utf8'));
        assert.equal(historyWritten.length, 1, 'recordPublishEvent must persist into isolated DATA_DIR/publish_history.json');
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F2: Zero-Human-Approval Autonomy (5 tests)
  // =========================================================================
  describe('F2: Zero-Human-Approval Autonomy', () => {
    it('F2.1: .env, runtime.json, policy.yaml, and agent_company.json configure FULL_100 autonomy with zero human approval', () => {
      const envRaw = fs.readFileSync(path.join(WORKSPACE_ROOT, '.env'), 'utf8');
      assert.match(envRaw, /AUTONOMOUS_MODE\s*=\s*["']?FULL_100["']?/);
      assert.match(envRaw, /REQUIRE_HUMAN_APPROVAL\s*=\s*["']?false["']?/i);
      assert.match(envRaw, /AUTO_PUBLISH\s*=\s*["']?true["']?/i);

      const runtime = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/runtime.json'), 'utf8'));
      assert.equal(runtime.autonomous_mode, 'FULL_100');
      assert.equal(runtime.require_human_approval, false);
      assert.equal(runtime.auto_publish, true);

      const policy = fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/policy.yaml'), 'utf8');
      assert.match(policy, /autonomous_mode:\s*FULL_100/);
      assert.match(policy, /human_approval_required:\s*false/);

      const company = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/agent_company.json'), 'utf8'));
      assert.equal(company.require_human_approval, false);
    });

    it('F2.2: evaluateContent sets selfApproved=true when REQUIRE_HUMAN_APPROVAL=false on compliant copy', async () => {
      const ws = createTempWorkspace('f2_2');
      try {
        const out = await runNodeSnippetSafe(`
          const { evaluateContent } = require('./lib/governance');
          const res = evaluateContent({
            caption: 'Tan làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ thoáng mát là đủ yên lòng.'
          });
          console.log(JSON.stringify(res));
        `, { tempDir: ws.tempDir, extraEnv: { REQUIRE_HUMAN_APPROVAL: 'false' } });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.allowed, true);
        assert.equal(res.selfApproved, true);
      } finally {
        ws.cleanup();
      }
    });

    it('F2.3: normalizeCompliantMessage auto-appends clean hashtags when SELF_APPROVE_CONTENT=true', async () => {
      const ws = createTempWorkspace('f2_3');
      try {
        const out = await runNodeSnippetSafe(`
          const { normalizeCompliantMessage } = require('./lib/governance');
          const outMsg = normalizeCompliantMessage('Đi làm về mở cửa thấy phòng sáng sủa gọn gàng. Ngủ một giấc tới sáng cho khỏe.');
          console.log(JSON.stringify({ outMsg }));
        `, { tempDir: ws.tempDir, extraEnv: { SELF_APPROVE_CONTENT: 'true' } });

        assert.equal(out.status, 0, out.stderr);
        const { outMsg } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.match(outMsg, /#phongtro/);
        assert.match(outMsg, /#chothuephong/);
      } finally {
        ws.cleanup();
      }
    });

    it('F2.4: work-order-gateway.createOrder autonomously sets human_approval_required=false and SELF_APPROVED_READY_TO_PUBLISH', async () => {
      const ws = createTempWorkspace('f2_4');
      try {
        const out = await runNodeSnippetSafe(`
          const gateway = require('./services/work-order-gateway');
          (async () => {
            const order = await gateway.createOrder({
              topic: 'Phòng có cửa sổ thoáng nắng cho người đi làm',
              pillar: 'P1_STUDIO_LIGHT_LIVING'
            });
            console.log(JSON.stringify(order));
          })();
        `, { tempDir: ws.tempDir, extraEnv: { REQUIRE_HUMAN_APPROVAL: 'false' } });

        assert.equal(out.status, 0, out.stderr);
        const order = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(order.human_approval_required, false);
        assert.equal(order.status, 'SELF_APPROVED_READY_TO_PUBLISH');
      } finally {
        ws.cleanup();
      }
    });

    it('F2.5: publishDirect({ dryRun: true }) reports autonomous=true and humanApprovalRequired=false', async () => {
      const ws = createTempWorkspace('f2_5');
      try {
        const validCaption = 'Tan làm mệt nhoài chỉ mong về phòng nghỉ ngơi. Phòng sạch sẽ có cửa sổ thoáng là thấy bình yên.';
        const out = await runNodeSnippetSafe(`
          const { publishDirect } = require('./services/publish-executor');
          (async () => {
            const res = await publishDirect({
              platform: 'all',
              contentType: 'feed',
              message: ${JSON.stringify(validCaption)},
              dryRun: true
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.autonomous, true);
        assert.equal(res.humanApprovalRequired, false);
        assert.equal(res.success, true);
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F3: Deterministic Rule 5 Governance (6 tests)
  // =========================================================================
  describe('F3: Deterministic Rule 5 Governance', () => {
    it('F3.1: countSentences accurately counts Vietnamese sentences ignoring trailing hashtags and whitespace', () => {
      assert.equal(typeof governance.countSentences, 'function', 'lib/governance.js must export countSentences');

      const twoSentences = 'Tan làm mệt nhoài dắt xe về phòng trọ tối om.\nChỉ mong có căn phòng sáng sủa để ngủ một giấc cho đã đời.\n\n#phongtro #chothuephong';
      const threeSentences = 'Ảnh trên mạng nhìn lung linh lắm. Đến nơi mới thấy tường ẩm mốc, hành lang bí bách. Thôi lại dắt xe đi tìm tiếp vậy. #phongtro';

      assert.equal(governance.countSentences(twoSentences), 2);
      assert.equal(governance.countSentences(threeSentences), 3);
    });

    it('F3.2: evaluateContent passes authentic 2–4 sentence plain renter pain-point caption without brand or ads', () => {
      const validCaption = [
        'Tan làm mệt phờ râu dắt xe đi xem phòng trong ngõ tối.',
        'Đi thuê trọ chỉ mong phòng sạch sẽ, có cái cửa sổ đón nắng mai.',
        'Tối về ngả lưng ngủ một giấc cho đã đời rồi mai đi cày tiếp.'
      ].join(' ');

      const res = governance.evaluateContent({ caption: validCaption, channel: 'facebook' });
      assert.equal(res.allowed, true, `Expected valid caption to pass, violations: ${res.violations.join('; ')}`);
      assert.ok(res.stats && typeof res.stats.sentenceCount === 'number', 'evaluateContent must return stats');
      assert.equal(res.stats.sentenceCount, 3);
    });

    it('F3.3: evaluateOmnichannelCaptions validates facebook_caption, instagram_caption, and threads_caption', () => {
      assert.equal(typeof governance.evaluateOmnichannelCaptions, 'function', 'lib/governance.js must export evaluateOmnichannelCaptions');

      const validBatch = {
        facebook_caption: 'Đi cày cả ngày mệt nhoài chỉ mong về phòng nằm nghỉ. Căn phòng sạch sẽ có cửa sổ thoáng là đủ thấy bình yên.',
        instagram_caption: 'Mở cửa phòng ra thấy nắng sớm rọi vào góc bàn nhỏ. Một ngày mới bắt đầu nhẹ nhàng hơn hẳn.',
        threads_caption: 'Thuê phòng sợ nhất tiền điện nước mập mờ cuối tháng. Cứ rõ ràng từng đồng từ đầu cho người đi làm dễ thở.'
      };
      const res = governance.evaluateOmnichannelCaptions(validBatch);
      assert.equal(res.allowed, true, `Expected omnichannel batch to pass: ${res.violations.join('; ')}`);
      assert.equal(res.results.facebook.allowed, true);
      assert.equal(res.results.instagram.allowed, true);
      assert.equal(res.results.threads.allowed, true);
    });

    it('F3.4: normalizeCompliantMessage strips zero-width chars, NFC-normalizes, and preserves existing tags without duplication', () => {
      const nfdWithZeroWidth = 'Pho\u0300ng sa\u0323ch se\u0303 thoa\u0301ng ma\u0301t\u200B.\uFEFF To\u0302i ve\u0302\u0300 ngu\u0309 ngon gia\u0302\u0301c.\n\n#phongtro';
      const normalized = governance.normalizeCompliantMessage(nfdWithZeroWidth);

      assert.equal(/[\u200B\uFEFF]/.test(normalized), false, 'Zero-width chars must be stripped');
      assert.equal(normalized, normalized.normalize('NFC'), 'Output must be NFC normalized');
      const matches = normalized.match(/#phongtro/g) || [];
      assert.equal(matches.length, 1, 'Existing hashtag must not be duplicated');
    });

    it('F3.5: checkPublishRateLimit allows publish under daily cap and past cooldown in isolated DATA_DIR', () => {
      const ws = createTempWorkspace('f3_5');
      try {
        const now = new Date('2026-11-24T12:00:00.000Z');
        const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
        fs.writeFileSync(
          ws.paths.historyFile,
          JSON.stringify([{ timestamp: thirtyMinsAgo, platform: 'facebook', contentType: 'feed' }], null, 2),
          'utf8'
        );

        const res = governance.checkPublishRateLimit('facebook', { now, historyFile: ws.paths.historyFile });
        assert.equal(res.allowed, true);
        assert.equal(res.countToday ?? res.dailyCount, 1);
      } finally {
        ws.cleanup();
      }
    });

    it('F3.6: Legitimate rental vocabulary (18.5m2, TP.HCM, tiền điện nước, cửa sổ 1 cánh, xà phòng) passes evaluateContent', () => {
      const realisticCaption = [
        'Đi thuê phòng 18.5m2 ở TP.HCM chỉ mong có cửa sổ 1 cánh đón gió tự nhiên.',
        'Tiền điện nước rõ ràng từng đồng và có góc giặt phơi sạch mùi xà phòng, giữ cho góc ở gọn gàng là nhẹ đầu hẳn.'
      ].join(' ');

      const res = governance.evaluateContent({ caption: realisticCaption });
      assert.equal(res.allowed, true, `Legitimate rental terms triggered false positive: ${res.violations.join('; ')}`);
      assert.equal(res.stats.sentenceCount, 2);
    });
  });

  // =========================================================================
  // F4: Timezone (Asia/Ho_Chi_Minh) & Content Calendar (5 tests)
  // =========================================================================
  describe('F4: Timezone (Asia/Ho_Chi_Minh) & Content Calendar', () => {
    it('F4.1: getLocalDateString formats dates in Asia/Ho_Chi_Minh (ICT, UTC+7)', () => {
      assert.equal(typeof governance.getLocalDateString, 'function', 'lib/governance.js must export getLocalDateString');

      const sampleUtc = new Date('2026-11-24T10:00:00.000Z'); // 17:00 ICT on 2026-11-24
      assert.equal(governance.getLocalDateString(sampleUtc, 'Asia/Ho_Chi_Minh'), '2026-11-24');

      const sampleCross = new Date('2026-11-24T18:30:00.000Z'); // 01:30 ICT on 2026-11-25
      assert.equal(governance.getLocalDateString(sampleCross, 'Asia/Ho_Chi_Minh'), '2026-11-25');
    });

    it('F4.2: content-planner.js defines 3 daily slots (08:30, 11:30, 19:45) and 4 rental pillars aligned with nhacualand.com', () => {
      assert.equal(contentPlanner.DAILY_SCHEDULE_SLOTS.length, 3);
      assert.deepEqual(
        contentPlanner.DAILY_SCHEDULE_SLOTS.map(s => s.time),
        ['08:30', '11:30', '19:45']
      );
      assert.equal(contentPlanner.BRAND_PILLARS.length, 4);

      const plan = contentPlanner.generatePlan(new Date('2026-11-24T02:00:00.000Z'), 2);
      assert.equal(plan.length, 6);
      assert.ok(plan.every(slot => slot.target_url === 'https://nhacualand.com'));
    });

    it('F4.3: generateSlotsForDate produces 08:30, 11:30, 19:45 slots with valid space_archetype_id across 4 segments', () => {
      const { SPACE_ARCHETYPES } = require('../../services/prompt_architect');
      const validIds = new Set(SPACE_ARCHETYPES.map(a => a.id));

      const seenSegments = new Set();
      for (let dayOffset = 0; dayOffset < 4; dayOffset++) {
        const slots = contentPlanner.generateSlotsForDate('2026-11-25', dayOffset * 3, dayOffset);
        assert.deepEqual(slots.map(s => s.slot_time), ['08:30', '11:30', '19:45']);
        for (const s of slots) {
          assert.ok(validIds.has(s.space_archetype_id), `Invalid space_archetype_id: ${s.space_archetype_id}`);
          if (s.segment) seenSegments.add(s.segment);
        }
      }
      assert.equal(seenSegments.size, 4, `Expected all 4 segments across rotation, got: ${[...seenSegments].join(', ')}`);
    });

    it('F4.4: pickTodaySlot picks nearest pending ICT slot for current time', () => {
      const ws = createTempWorkspace('f4_4');
      try {
        const todayStr = '2026-11-25';
        const plan = contentPlanner.generateSlotsForDate(todayStr, 0, 0);
        fs.writeFileSync(ws.paths.calendarFile, JSON.stringify({ plan }, null, 2), 'utf8');

        // 11:20 ICT == 04:20 UTC -> nearest slot is 11:30
        const midday = contentPlanner.pickTodaySlot({
          calendarPath: ws.paths.calendarFile,
          now: new Date('2026-11-25T04:20:00.000Z')
        });
        assert.equal(midday.slot_time, '11:30');

        // 19:30 ICT == 12:30 UTC -> nearest slot is 19:45
        const evening = contentPlanner.pickTodaySlot({
          calendarPath: ws.paths.calendarFile,
          now: new Date('2026-11-25T12:30:00.000Z')
        });
        assert.equal(evening.slot_time, '19:45');
      } finally {
        ws.cleanup();
      }
    });

    it('F4.5: ensureTodaySlots extends plan when today has no slots', () => {
      const pastOnly = contentPlanner.generateSlotsForDate('2020-01-01', 0, 0);
      const now = new Date('2026-11-25T01:30:00.000Z'); // 08:30 ICT 2026-11-25
      const ext = contentPlanner.ensureTodaySlots(pastOnly, { now, extendDays: 3 });

      assert.equal(ext.extended, true);
      assert.equal(ext.todayStr, '2026-11-25');
      assert.ok(ext.addedCount >= 9);
      assert.ok(ext.plan.some(s => s.date === '2026-11-25' && s.slot_time === '08:30'));
    });
  });

  // =========================================================================
  // F5: Singleton Process Lock Hardening (5 tests)
  // =========================================================================
  describe('F5: Singleton Process Lock Hardening (lib/process-lock.js)', () => {
    it('F5.1: acquireProcessLock acquires lock with current PID and release() removes lock file', () => {
      const ws = createTempWorkspace('f5_1');
      try {
        const lock = processLock.acquireProcessLock({ lockFile: ws.paths.lockFile });
        assert.equal(lock.acquired, true);
        assert.equal(typeof lock.release, 'function');
        assert.equal(fs.existsSync(ws.paths.lockFile), true);

        const data = JSON.parse(fs.readFileSync(ws.paths.lockFile, 'utf8'));
        assert.equal(data.pid, process.pid);

        lock.release();
        assert.equal(fs.existsSync(ws.paths.lockFile), false);
      } finally {
        ws.cleanup();
      }
    });

    it('F5.2: Default maxAgeMs is aligned with Task Scheduler PT30M (30 * 60 * 1000 ms)', async () => {
      const ws = createTempWorkspace('f5_2');
      let holder = null;
      try {
        const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        holder = await spawnHoldLockChild(ws.paths.lockFile);
        fs.writeFileSync(
          ws.paths.lockFile,
          JSON.stringify({ pid: holder.info.pid, startedAt: twentyMinsAgo }, null, 2),
          'utf8'
        );
        const attempt = processLock.acquireProcessLock({ lockFile: ws.paths.lockFile });
        assert.equal(
          attempt.acquired,
          false,
          'A 20-minute-old live lock must remain active when default maxAgeMs is 30 minutes (PT30M)'
        );
      } finally {
        await killChildAsync(holder?.child);
        ws.cleanup();
      }
    });

    it('F5.3: Dead-PID lock file is automatically recovered and acquired', () => {
      const ws = createTempWorkspace('f5_3');
      try {
        fs.writeFileSync(
          ws.paths.lockFile,
          JSON.stringify({ pid: 99999999, startedAt: new Date().toISOString() }, null, 2),
          'utf8'
        );
        const lock = processLock.acquireProcessLock({ lockFile: ws.paths.lockFile });
        assert.equal(lock.acquired, true);
        const payload = JSON.parse(fs.readFileSync(ws.paths.lockFile, 'utf8'));
        assert.equal(payload.pid, process.pid);
        lock.release();
      } finally {
        ws.cleanup();
      }
    });

    it('F5.4: Process lock is automatically cleaned up when holding child process exits', async () => {
      const ws = createTempWorkspace('f5_4');
      let holder = null;
      try {
        holder = await spawnHoldLockChild(ws.paths.lockFile);
        assert.equal(holder.info.acquired, true);
        assert.equal(fs.existsSync(ws.paths.lockFile), true);

        await gracefulExitChildAsync(holder.child);
        assert.equal(fs.existsSync(ws.paths.lockFile), false, 'Lock file should be removed on child exit');

        const nextLock = processLock.acquireProcessLock({ lockFile: ws.paths.lockFile });
        assert.equal(nextLock.acquired, true);
        nextLock.release();
      } finally {
        await killChildAsync(holder?.child);
        ws.cleanup();
      }
    });

    it('F5.5: acquireProcessLock() defaults to DATA_DIR/orchestrator.lock and publish_now.js --dry-run releases lock cleanly', async () => {
      const ws = createTempWorkspace('f5_5');
      try {
        const snippetOut = await runNodeSnippetSafe(`
          const { acquireProcessLock } = require('./lib/process-lock');
          const lock = acquireProcessLock();
          const lockPath = lock.lockFile;
          const existsWhileHeld = require('fs').existsSync(lockPath);
          lock.release();
          const existsAfterRelease = require('fs').existsSync(lockPath);
          console.log(JSON.stringify({ acquired: lock.acquired, lockPath, existsWhileHeld, existsAfterRelease }));
        `, { tempDir: ws.tempDir });
        assert.equal(snippetOut.status, 0, snippetOut.stderr);
        const info = JSON.parse(snippetOut.stdout.trim().split(/\r?\n/).pop());
        assert.equal(info.acquired, true);
        assert.equal(info.existsWhileHeld, true);
        assert.equal(info.existsAfterRelease, false);
        assertDataDirHonored(info.lockPath, ws.tempDir, 'default orchestrator.lock');

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

        const cliRes = await runNodeCliSafe('scripts/publish_now.js', [
          '--dry-run',
          '--platform', 'all',
          '--message', 'Tan làm mệt nhoài chỉ mong về căn phòng sạch sẽ. Ngủ một giấc sâu tới sáng là thấy khỏe.'
        ], { tempDir: ws.tempDir, nodeArgs: ['-r', spyPreloadPath] });
        assert.equal(cliRes.status, 0, cliRes.stderr);
        const spy = JSON.parse(fs.readFileSync(path.join(ws.tempDir, 'lock_spy.json'), 'utf8'));
        assert.ok(spy.acquiredCalls >= 1, 'publish_now.js --dry-run MUST acquire singleton process lock via lib/process-lock.js');
        assert.equal(spy.existedWhileHeld, true, 'orchestrator.lock must exist on disk while publish_now.js holds the lock');
        assert.ok(spy.releasedCalls >= 1, 'publish_now.js --dry-run must release acquired lock');
        assertDataDirHonored(spy.lastLockFile, ws.tempDir, 'publish_now.js lockFile');
        assert.equal(fs.existsSync(ws.paths.lockFile), false, 'publish_now.js --dry-run must release DATA_DIR/orchestrator.lock');
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F6: Autonomous Internet Research Agent (5 tests)
  // =========================================================================
  describe('F6: Autonomous Internet Research Agent', () => {
    it('F6.1: conductResearch({ offline: true, dryRun: true }) matches output contract', async () => {
      const ws = createTempWorkspace('f6_1');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js must exist');

        const out = await runNodeSnippetSafe(`
          const ra = require('./services/research_agent');
          (async () => {
            const brief = await ra.conductResearch({
              topic: 'Nỗi sợ phụ phí điện nước mập mờ khi thuê phòng trọ',
              pillar: 'P2_CHDV_TRANSPARENT_COST',
              offline: true,
              dryRun: true
            });
            console.log(JSON.stringify(brief));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, `conductResearch snippet failed: ${out.stderr}`);
        const brief = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(brief.briefId);
        assert.ok(brief.fetchedAt);
        assert.ok(['live_web', 'cached_knowledge', 'offline_seed'].includes(brief.sourceMode));
        assert.ok(Array.isArray(brief.insights) && brief.insights.length > 0);
        assert.ok(Array.isArray(brief.painPoints) && brief.painPoints.length > 0);
        assert.ok(Array.isArray(brief.renterTips));
        assert.ok(Array.isArray(brief.domainFacts));
        assert.ok(Array.isArray(brief.sources));
        assert.ok(brief.filePath);
      } finally {
        ws.cleanup();
      }
    });

    it('F6.2: conductResearch persists brief inside DATA_DIR/knowledge/ and never outside D:\\Facebook', async () => {
      const ws = createTempWorkspace('f6_2');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js must exist');

        const out = await runNodeSnippetSafe(`
          const ra = require('./services/research_agent');
          (async () => {
            const brief = await ra.conductResearch({
              topic: 'Phòng trọ có cửa sổ thoáng nắng',
              pillar: 'P1_STUDIO_LIGHT_LIVING',
              offline: true,
              dryRun: true
            });
            console.log(JSON.stringify(brief));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const brief = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assertDataDirHonored(brief.filePath, ws.paths.knowledge, 'research brief filePath');
        assert.equal(fs.existsSync(brief.filePath), true);
      } finally {
        ws.cleanup();
      }
    });

    it('F6.3: conductResearch syncs read-only from loopback nhacualand.com HTML fixture and populates domainFacts for 4 segments', async () => {
      const ws = createTempWorkspace('f6_3');
      let server = null;
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js must exist');
        let getHits = 0;
        let nonGetHits = 0;
        server = await startLoopbackServer((req, res) => {
          if (req.method === 'GET') getHits++;
          else nonGetHits++;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html><head><title>Cho thuê phòng thực tế</title></head><body>
              <h1>Phòng Studio, Căn hộ dịch vụ, Chung cư mini, Phòng trọ cao cấp</h1>
              <p>Phòng Studio cửa sổ thoáng mát đón nắng sáng.</p>
              <p>Căn hộ dịch vụ tách bếp, điện nước minh bạch theo đồng hồ riêng.</p>
              <p>Chung cư mini khóa vân tay, chỗ để xe an ninh, yên tĩnh.</p>
              <p>Phòng trọ cao cấp gần khu văn phòng và trường đại học, xem phòng ban ngày.</p>
            </body></html>
          `);
        });

        const out = await runNodeSnippetSafe(`
          const ra = require('./services/research_agent');
          (async () => {
            const brief = await ra.conductResearch({
              topic: 'Phân loại phòng cho thuê sáng thoáng minh bạch chi phí',
              pillar: 'P2_CHDV_TRANSPARENT_COST',
              siteUrl: ${JSON.stringify(server.url)},
              offline: false,
              dryRun: true
            });
            console.log(JSON.stringify(brief));
          })();
        `, {
          tempDir: ws.tempDir,
          extraEnv: { BRAND_WEBSITE: server.url, NHACUALAND_URL: server.url }
        });

        assert.equal(out.status, 0, out.stderr);
        assert.equal(nonGetHits, 0, 'Site sync must be strictly read-only (GET only)');
        assert.ok(getHits >= 1, 'Expected at least 1 read-only GET to loopback site');
        const brief = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(Array.isArray(brief.domainFacts) && brief.domainFacts.length > 0);
        const joined = brief.domainFacts.join(' ').toLowerCase();
        assert.match(joined, /studio|căn hộ dịch vụ|chung cư mini|phòng trọ/i);
      } finally {
        if (server) await server.close();
        ws.cleanup();
      }
    });

    it('F6.4: conductResearch reuses recent brief in DATA_DIR/knowledge/ (sourceMode=cached_knowledge)', async () => {
      const ws = createTempWorkspace('f6_4');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js must exist');
        const todayIct = getIctDateString();
        const seededBrief = {
          briefId: 'brief_cached_test',
          fetchedAt: new Date().toISOString(),
          date: todayIct,
          topic: 'Kinh nghiệm xem phòng tránh ẩm mốc ban ngày',
          pillar: 'P4_PHONG_TRO_REAL_ADVICE',
          sourceMode: 'live_web',
          insights: ['Nên đi xem phòng vào ban ngày để kiểm tra ánh sáng và độ ẩm tường'],
          painPoints: ['Ảnh trên mạng sáng sủa nhưng thực tế tối om ẩm mốc'],
          renterTips: ['Kiểm tra vòi nước và góc trần nhà tắm trước khi thuê'],
          domainFacts: ['Phòng trọ cao cấp có cửa sổ thoáng khí'],
          sources: ['cached']
        };
        fs.writeFileSync(
          path.join(ws.paths.knowledge, `research_${todayIct}_cached.json`),
          JSON.stringify(seededBrief, null, 2),
          'utf8'
        );

        const out = await runNodeSnippetSafe(`
          const ra = require('./services/research_agent');
          (async () => {
            const brief = await ra.conductResearch({
              topic: 'Kinh nghiệm xem phòng tránh ẩm mốc ban ngày',
              pillar: 'P4_PHONG_TRO_REAL_ADVICE',
              offline: false,
              dryRun: true
            });
            console.log(JSON.stringify(brief));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const brief = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(brief.sourceMode, 'cached_knowledge');
        assert.ok(brief.insights.length > 0);
      } finally {
        ws.cleanup();
      }
    });

    it('F6.5: Returned insights, painPoints, and renterTips are free of Rule-5 ads, CTAs, phones, or brand leaks', async () => {
      const ws = createTempWorkspace('f6_5');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js must exist');
        const out = await runNodeSnippetSafe(`
          const ra = require('./services/research_agent');
          (async () => {
            const brief = await ra.conductResearch({
              topic: 'Tan làm về phòng nghỉ ngơi yên tĩnh',
              pillar: 'P3_CCM_QUIET_SECURITY',
              offline: true,
              dryRun: true
            });
            console.log(JSON.stringify(brief));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const brief = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        const combined = [...brief.insights, ...brief.painPoints, ...brief.renterTips].join(' ').toLowerCase();
        assert.equal(/nhacualand|nhà cửa land|nhà của land|0981|inbox ngay|chốt cọc|số 1/.test(combined), false, `Research text leaked ad/brand terms: ${combined}`);
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F7: Multi-Agent Sequential Roundtable & Work Orders (5 tests)
  // =========================================================================
  describe('F7: Multi-Agent Sequential Roundtable & Work Orders', () => {
    it('F7.1: agent_council.runMultiAgentRoundtable executes sequential 6-phase meeting', async () => {
      const ws = createTempWorkspace('f7_1');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/agent_council.js')), true, 'services/agent_council.js must exist');

        const out = await runNodeSnippetSafe(`
          const council = require('./services/agent_council');
          (async () => {
            const result = await council.runMultiAgentRoundtable({
              slot: {
                slot_id: 'slot_test_0830',
                slot_time: '08:30',
                pillar_id: 'P1_STUDIO_LIGHT_LIVING',
                pillar_name: 'Phòng Studio Thoáng Sáng',
                format: 'OMNICHANNEL_POST',
                concept_hook: 'Phòng có cửa sổ đón nắng sớm giúp tinh thần thoải mái sau giờ làm'
              },
              researchBrief: {
                briefId: 'brief_test',
                insights: ['Người đi thuê ưu tiên ánh sáng tự nhiên và sự yên tĩnh'],
                painPoints: ['Phòng bí bách không cửa sổ'],
                renterTips: ['Xem phòng vào ban ngày để kiểm tra ánh sáng'],
                domainFacts: ['Studio và CHDV có cửa sổ thoáng']
              },
              dryRun: true
            });
            console.log(JSON.stringify(result));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, `runMultiAgentRoundtable failed: ${out.stderr}`);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(res.meetingId);
        assert.ok(res.workOrderId);
        assert.ok(res.consensus && res.consensus.pillar && res.consensus.angle && res.consensus.channelStrategy && res.consensus.mediaType);
        assert.deepEqual(
          res.phases.map(p => p.role),
          ['Researcher', 'Strategist', 'Copywriter', 'Rule5Critic', 'MediaDirector', 'PublisherCoordinator']
        );
      } finally {
        ws.cleanup();
      }
    });

    it('F7.2: runMultiAgentRoundtable persists meeting record inside DATA_DIR/meetings/', async () => {
      const ws = createTempWorkspace('f7_2');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/agent_council.js')), true, 'services/agent_council.js must exist');

        const out = await runNodeSnippetSafe(`
          const council = require('./services/agent_council');
          (async () => {
            const result = await council.runMultiAgentRoundtable({
              slot: {
                slot_id: 'slot_test_1130',
                slot_time: '11:30',
                pillar_id: 'P2_CHDV_TRANSPARENT_COST',
                pillar_name: 'Minh Bạch Chi Phí',
                format: 'OMNICHANNEL_POST',
                concept_hook: 'Rõ ràng tiền điện nước ngay từ ngày đầu ký hợp đồng'
              },
              researchBrief: { briefId: 'b1', insights: ['Minh bạch chi phí'], painPoints: ['Phụ phí ẩn'], renterTips: [], domainFacts: [] },
              dryRun: true
            });
            console.log(JSON.stringify(result));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assertDataDirHonored(res.meetingFile, ws.paths.meetings, 'meeting record meetingFile');
        assert.equal(fs.existsSync(res.meetingFile), true);
      } finally {
        ws.cleanup();
      }
    });

    it('F7.3: phases timestamps are monotonically non-decreasing across all 6 sequential roles', async () => {
      const ws = createTempWorkspace('f7_3');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/agent_council.js')), true, 'services/agent_council.js must exist');
        const out = await runNodeSnippetSafe(`
          const council = require('./services/agent_council');
          (async () => {
            const result = await council.runMultiAgentRoundtable({
              slot: { slot_id: 'slot_seq', slot_time: '08:30', format: 'OMNICHANNEL_POST', concept_hook: 'Phòng sáng thoáng sạch sẽ' },
              researchBrief: { briefId: 'b_seq', insights: ['Ánh sáng tự nhiên'], painPoints: ['Ngột ngạt'], renterTips: [], domainFacts: [] },
              dryRun: true
            });
            console.log(JSON.stringify(result.phases));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const phases = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(phases.length, 6);
        for (let i = 0; i < phases.length; i++) {
          const ts = Date.parse(phases[i].timestamp);
          assert.ok(Number.isFinite(ts), `Phase ${i} missing valid ISO timestamp`);
          if (i > 0) {
            const prevTs = Date.parse(phases[i - 1].timestamp);
            assert.ok(ts >= prevTs, `Phase ${i} timestamp went backwards (${phases[i].timestamp} < ${phases[i - 1].timestamp})`);
          }
        }
      } finally {
        ws.cleanup();
      }
    });

    it('F7.4: work-order-gateway.createOrder succeeds for OMNICHANNEL_POST & REELS_ROOM_TOUR and supports getOrder/listOrders', async () => {
      const ws = createTempWorkspace('f7_4');
      try {
        const out = await runNodeSnippetSafe(`
          const gateway = require('./services/work-order-gateway');
          (async () => {
            const postOrder = await gateway.createOrder({
              topic: 'Phòng có cửa sổ thoáng nắng',
              pillar: 'P1_STUDIO_LIGHT_LIVING',
              format: 'OMNICHANNEL_POST'
            });
            const reelOrder = await gateway.createOrder({
              topic: 'Góc phòng yên tĩnh sau giờ làm',
              pillar: 'P3_CCM_QUIET_SECURITY',
              format: 'REELS_CINEMATIC_ROOM_TOUR'
            });
            const fetched = gateway.getOrder(postOrder.id);
            const all = gateway.listOrders();
            console.log(JSON.stringify({ postOrder, reelOrder, fetchedId: fetched?.id, total: all.length }));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.postOrder.status, 'SELF_APPROVED_READY_TO_PUBLISH');
        assert.equal(res.reelOrder.status, 'SELF_APPROVED_READY_TO_PUBLISH');
        assert.equal(res.fetchedId, res.postOrder.id);
        assert.ok(res.total >= 2);
      } finally {
        ws.cleanup();
      }
    });

    it('F7.5: consensus.mediaType aligns with slot.format (REELS -> video vs OMNICHANNEL_POST -> image)', async () => {
      const ws = createTempWorkspace('f7_5');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/agent_council.js')), true, 'services/agent_council.js must exist');
        const out = await runNodeSnippetSafe(`
          const council = require('./services/agent_council');
          (async () => {
            const imgMeeting = await council.runMultiAgentRoundtable({
              slot: { slot_id: 's_img', slot_time: '08:30', format: 'OMNICHANNEL_POST', concept_hook: 'Phòng sáng' },
              researchBrief: { briefId: 'b1', insights: ['Ánh sáng'], painPoints: ['Phòng tối'], renterTips: [], domainFacts: [] },
              dryRun: true
            });
            const vidMeeting = await council.runMultiAgentRoundtable({
              slot: { slot_id: 's_vid', slot_time: '19:45', format: 'REELS_CINEMATIC_ROOM_TOUR', concept_hook: 'Về phòng nghỉ ngơi' },
              researchBrief: { briefId: 'b2', insights: ['Yên tĩnh'], painPoints: ['Ồn ào'], renterTips: [], domainFacts: [] },
              dryRun: true
            });
            console.log(JSON.stringify({ imgType: imgMeeting.consensus.mediaType, vidType: vidMeeting.consensus.mediaType }));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const { imgType, vidType } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.match(String(imgType), /image|photo/i);
        assert.match(String(vidType), /video|reel/i);
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F8: AI Copywriting, Retry & Rule-5 Fallbacks (5 tests)
  // =========================================================================
  describe('F8: AI Copywriting, Retry & Rule-5 Fallbacks', () => {
    it('F8.1: ai_pipeline.generatePost emits Rule-5-compliant 3-channel fallback offline', async () => {
      const ws = createTempWorkspace('f8_1');
      try {
        const out = await runNodeSnippetSafe(`
          const { generatePost } = require('./services/ai_pipeline');
          const { evaluateOmnichannelCaptions } = require('./lib/governance');
          (async () => {
            const post = await generatePost({
              topic: 'Tan làm mệt mỏi về phòng trọ chỉ mong có chỗ ngủ yên tĩnh',
              pillar: 'Nỗi Lòng Người Đi Thuê'
            });
            const gov = evaluateOmnichannelCaptions(post);
            console.log(JSON.stringify({ post, gov }));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const parsed = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(parsed.post.facebook_caption);
        assert.ok(parsed.post.instagram_caption);
        assert.ok(parsed.post.threads_caption);
        assert.equal(parsed.gov.allowed, true, `Fallback copy failed Rule 5: ${JSON.stringify(parsed.gov.violations)}`);
      } finally {
        ws.cleanup();
      }
    });

    it('F8.2: PromptArchitect produces clean architectural and video prompts free of brand/ad leakage', () => {
      const promptArchitect = require('../../services/prompt_architect');
      const imgPrompt = promptArchitect.buildArchitecturalPrompt({
        topic: 'Phòng trọ có cửa sổ thoáng đón nắng sáng',
        title: 'Phòng Sáng Thoáng',
        aspectRatio: '3:4'
      });
      const vidPrompt = promptArchitect.buildVeoVideoPrompt({
        topic: 'Room tour phòng ngủ tối giản',
        title: 'Góc Phòng Nhỏ',
        hook: 'Ánh sáng tự nhiên',
        aspectRatio: '9:16'
      });

      const combined = `${imgPrompt.prompt} ${vidPrompt}`.toLowerCase();
      assert.ok(imgPrompt.prompt.length > 40);
      assert.ok(vidPrompt.length > 40);
      assert.equal(/nhacualand|nhà cửa land|nhà của land|0981/i.test(combined), false);
    });

    it('F8.3: ai_pipeline.generatePost produces varied non-repetitive Rule-5-compliant fallbacks across distinct topics', async () => {
      const ws = createTempWorkspace('f8_3');
      try {
        const out = await runNodeSnippetSafe(`
          const { generatePost } = require('./services/ai_pipeline');
          const { evaluateOmnichannelCaptions } = require('./lib/governance');
          (async () => {
            const topics = [
              'Đi xem phòng ban ngày kiểm tra cửa sổ ánh sáng tự nhiên',
              'Tiền điện nước phụ phí minh bạch cuối tháng',
              'Tường cách âm tốt tối về ngủ ngon sau giờ làm',
              'Góc bếp nhỏ gọn tự nấu ăn tiết kiệm chi phí'
            ];
            const posts = [];
            for (const topic of topics) {
              const p = await generatePost({ topic, pillar: 'Đời Sống Đi Thuê' });
              const gov = evaluateOmnichannelCaptions(p);
              posts.push({ fb: p.facebook_caption, allowed: gov.allowed, violations: gov.violations });
            }
            console.log(JSON.stringify(posts));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const posts = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(posts.every(p => p.allowed), `All fallback posts must pass Rule 5: ${JSON.stringify(posts)}`);
        const uniqueFb = new Set(posts.map(p => p.fb.trim()));
        assert.ok(uniqueFb.size >= 2, `Expected varied non-repetitive fallbacks across 4 topics, got only ${uniqueFb.size} unique copy`);
      } finally {
        ws.cleanup();
      }
    });

    it('F8.4: ai_pipeline.generatePost retries when first mocked LLM draft violates Rule 5 and accepts compliant second draft', async () => {
      const ws = createTempWorkspace('f8_4');
      try {
        const mockFactory = `() => {
          let calls = 0;
          return {
            GoogleGenAI: class {
              constructor() {
                this.interactions = {
                  create: async () => {
                    calls += 1;
                    if (calls === 1) {
                      return {
                        output_text: JSON.stringify({
                          title: 'Phòng số 1 tại nhacualand.com',
                          hook: 'Inbox ngay chốt cọc!',
                          body: 'Phòng đẹp hoàn hảo nhất tại Nhà Của Land.',
                          facebook_caption: 'Inbox ngay nhacualand.com để chốt cọc phòng số 1 hôm nay!',
                          instagram_caption: 'Gọi 0981753082 xem phòng ngay.',
                          threads_caption: 'Phòng đẹp giá 3 triệu tại Nhà Của Land.',
                          visual_prompt: 'Bright studio apartment interior with sunlight'
                        })
                      };
                    }
                    return {
                      output_text: JSON.stringify({
                        title: 'Góc phòng sáng sủa sau giờ làm',
                        hook: 'Mở cửa ra thấy nắng chiều nhẹ nhàng.',
                        body: 'Tan làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ có cửa sổ thoáng là thấy bình yên rồi.',
                        facebook_caption: 'Tan làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ có cửa sổ thoáng là thấy bình yên rồi.',
                        instagram_caption: 'Ánh nắng nhẹ qua khung cửa sổ nhỏ làm căn phòng dễ chịu hơn hẳn. Tối về ngủ một giấc thật sâu.',
                        threads_caption: 'Đi thuê phòng chỉ cần sạch sẽ và tiền điện nước rõ ràng. Vậy là đủ nhẹ đầu cả tháng rồi.',
                        call_to_action: '',
                        hashtags: ['#phongtro', '#chothuephong'],
                        visual_prompt: 'Sunlit clean minimalist rental room with wide window and warm oak desk'
                      })
                    };
                  }
                };
              }
            },
            __getCallCount: () => calls
          };
        }`;

        const out = await runNodeSnippetWithMockGenAi(mockFactory, `
          const genaiMock = require('@google/genai');
          const { generatePost } = require('./services/ai_pipeline');
          const { evaluateOmnichannelCaptions } = require('./lib/governance');
          (async () => {
            const post = await generatePost({ topic: 'Phòng có cửa sổ sáng thoáng', pillar: 'P1_STUDIO_LIGHT_LIVING' });
            const gov = evaluateOmnichannelCaptions(post);
            console.log(JSON.stringify({ calls: genaiMock.__getCallCount(), post, gov }));
            process.exit(0);
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: 'mock-test-key' } });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(res.calls >= 2, `Expected Rule-5 retry to invoke LLM >=2 times, got ${res.calls}`);
        assert.equal(res.gov.allowed, true, `Accepted post must pass Rule 5: ${JSON.stringify(res.gov.violations)}`);
        assert.equal(/nhacualand/i.test(res.post.facebook_caption), false);
      } finally {
        ws.cleanup();
      }
    });

    it('F8.5: PromptArchitect.selectDiverseArchetype avoids recent spaceArchetypes in DATA_DIR/publish_history.json & all 15 archetypes are brand/ad-free', async () => {
      const ws = createTempWorkspace('f8_5');
      try {
        const { SPACE_ARCHETYPES } = require('../../services/prompt_architect');
        assert.ok(SPACE_ARCHETYPES.length >= 15);
        for (const arch of SPACE_ARCHETYPES) {
          const text = `${arch.name} ${arch.corePrompt}`.toLowerCase();
          assert.equal(/nhacualand|nhà cửa land|nhà của land|0981/.test(text), false, `Archetype ${arch.id} leaked brand/phone`);
        }

        const recentThree = SPACE_ARCHETYPES.slice(0, 3).map(a => a.id);
        fs.writeFileSync(
          ws.paths.historyFile,
          JSON.stringify(recentThree.map(id => ({ spaceArchetype: id, platform: 'facebook', timestamp: new Date().toISOString() })), null, 2),
          'utf8'
        );

        const out = await runNodeSnippetSafe(`
          const promptArchitect = require('./services/prompt_architect');
          const picks = [];
          for (let i = 0; i < 80; i++) {
            picks.push(promptArchitect.selectDiverseArchetype({ topic: 'chủ đề chung không khớp từ khóa' }).id);
          }
          console.log(JSON.stringify({ picks, recent: ${JSON.stringify(recentThree)} }));
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const { picks, recent } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        for (const p of picks) {
          assert.equal(recent.includes(p), false, `selectDiverseArchetype picked recent archetype "${p}" from DATA_DIR/publish_history.json`);
        }
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F9: Rule-5-Compliant Credibility & Non-Caption Conversion (5 tests)
  // =========================================================================
  describe('F9: Rule-5-Compliant Credibility & Non-Caption Conversion', () => {
    it('F9.1: config/brand.json enforces NON_CAPTION_BIO_WEBSITE_AND_ASSET_GUARD_ONLY scope, false caption_policy flags, and clean persona', () => {
      const brand = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/brand.json'), 'utf8'));
      assert.equal(brand.identity_scope, 'NON_CAPTION_BIO_WEBSITE_AND_ASSET_GUARD_ONLY');
      assert.equal(brand.caption_policy.allow_brand_name, false);
      assert.equal(brand.caption_policy.allow_website_or_hotline, false);
      assert.equal(brand.caption_policy.allow_offers_or_cta, false);
      assert.equal(brand.caption_policy.allow_prices, false);
      assert.equal(brand.caption_policy.allow_superlatives, false);
      assert.deepEqual(brand.hashtags, ['#phongtro', '#chothuephong']);
      assert.ok(brand.persona && brand.persona.role && brand.persona.tone);
    });

    it('F9.2: config/offer_catalog.json disables social captions (DISABLED_BY_RULE_5) and marks all offers caption_eligible=false', () => {
      const catalog = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/offer_catalog.json'), 'utf8'));
      assert.equal(catalog.caption_enabled, false);
      assert.equal(catalog.social_caption_policy, 'DISABLED_BY_RULE_5');
      assert.equal(catalog.usage_scope, 'WEBSITE_AND_DIRECT_INQUIRY_ONLY_NEVER_SOCIAL_CAPTIONS');
      assert.ok(Array.isArray(catalog.active_offers) && catalog.active_offers.length >= 1);
      for (const offer of catalog.active_offers) {
        assert.equal(offer.caption_eligible, false, `Offer ${offer.offer_id} must have caption_eligible=false`);
      }
    });

    it('F9.3: content-planner.js covers all 4 nhacualand.com segments with Rule-5-clean sample hooks', () => {
      const segments = contentPlanner.BRAND_PILLARS.map(p => p.segment);
      assert.deepEqual(segments, ['Phòng Studio', 'Căn hộ dịch vụ', 'Chung cư mini', 'Phòng trọ cao cấp']);

      for (const pillar of contentPlanner.BRAND_PILLARS) {
        for (const item of pillar.sample_hooks) {
          const text = `${item.hook}. Tối về ngủ một giấc thật sâu là nhẹ lòng.`;
          const check = governance.evaluateContent({ caption: text });
          assert.equal(check.allowed, true, `Hook in ${pillar.id} violated Rule 5: ${check.violations.join('; ')}`);
        }
      }
    });

    it('F9.4: brand.json social profile URLs align with nhacualand.com while generated captions contain zero URLs/brands/offers', async () => {
      const brand = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/brand.json'), 'utf8'));
      assert.equal(brand.website, 'https://nhacualand.com');
      assert.match(brand.social.facebook_url, /nhacualand/i);
      assert.match(brand.social.instagram_url, /nhacualand/i);
      assert.match(brand.social.threads_url, /@nhacualand/i);

      const ws = createTempWorkspace('f9_4');
      try {
        const out = await runNodeSnippetSafe(`
          const { generatePost } = require('./services/ai_pipeline');
          const { evaluateOmnichannelCaptions } = require('./lib/governance');
          (async () => {
            const post = await generatePost({ topic: 'Tách bếp và phòng ngủ cho đỡ ám mùi đồ ăn', pillar: 'P2_CHDV_TRANSPARENT_COST' });
            console.log(JSON.stringify({ post, gov: evaluateOmnichannelCaptions(post) }));
          })();
        `, { tempDir: ws.tempDir });
        assert.equal(out.status, 0, out.stderr);
        const { post, gov } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(gov.allowed, true);
        const allCaptions = `${post.facebook_caption} ${post.instagram_caption} ${post.threads_caption}`.toLowerCase();
        assert.equal(/nhacualand|voucher|nhacualand200|freewifi6t|cleanmovein|https?:\/\//.test(allCaptions), false);
      } finally {
        ws.cleanup();
      }
    });

    it('F9.5: Authentic transparent-cost and renter pain-point copy passes evaluateOmnichannelCaptions', () => {
      const authenticCopy = {
        facebook_caption: 'Đi thuê căn hộ dịch vụ điều cần nhất là rõ ràng tiền điện nước ngay từ đầu. Cuối tháng khỏi phải giật mình vì mấy khoản phụ phí mập mờ.',
        instagram_caption: 'Xem ảnh trên mạng một đằng, tới nơi phòng ẩm mốc tối om thì nản lắm. Cứ đi xem ban ngày thấy cửa sổ sáng thoáng mới yên tâm.',
        threads_caption: 'Tan làm mệt phờ râu chỉ mong về phòng yên tĩnh ngủ một giấc cho đã đời. Sáng mai lại có sức đi cày tiếp.'
      };
      const res = governance.evaluateOmnichannelCaptions(authenticCopy);
      assert.equal(res.allowed, true, `Authentic copy failed Rule 5: ${res.violations.join('; ')}`);
    });
  });

  // =========================================================================
  // F10: AI Image Studio API & Clean Fallback (5 tests)
  // =========================================================================
  describe('F10: AI Image Studio API & Clean Fallback', () => {
    it('F10.1: ImageEngine.generateImage({ dryRun: true }) produces clean output with success=true and dryRun=true', async () => {
      const ws = createTempWorkspace('f10_1');
      try {
        const out = await runNodeSnippetSafe(`
          const imageEngine = require('./services/image_engine');
          (async () => {
            const res = await imageEngine.generateImage({
              prompt: 'Sunlit minimalist studio room with window and wooden desk',
              aspectRatio: '3:4',
              mode: 'AUTO',
              dryRun: true
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        const filePath = res.filePath || res.file_path;
        assertDataDirHonored(filePath, ws.tempDir, 'ImageEngine generated filePath');
        assert.equal(res.success, true);
        assert.equal(res.dryRun, true);
        assert.equal(fs.existsSync(filePath), true);
      } finally {
        ws.cleanup();
      }
    });

    it('F10.2: Generated PNG passes PNG magic-byte header and exact pixel dimensions (3:4, 4:5, 1:1) via ffprobe', async () => {
      const ws = createTempWorkspace('f10_2');
      try {
        const ratios = [
          { aspectRatio: '3:4', width: 1080, height: 1440 },
          { aspectRatio: '4:5', width: 1080, height: 1350 },
          { aspectRatio: '1:1', width: 1080, height: 1080 }
        ];
        const out = await runNodeSnippetSafe(`
          const imageEngine = require('./services/image_engine');
          (async () => {
            const results = [];
            for (const ar of ['3:4', '4:5', '1:1']) {
              const res = await imageEngine.generateImage({
                prompt: 'Clean sunlit rental studio room interior',
                aspectRatio: ar,
                mode: 'AUTO',
                dryRun: true
              });
              results.push({ ar, filePath: res.filePath || res.file_path });
            }
            console.log(JSON.stringify(results));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const results = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        for (const expected of ratios) {
          const item = results.find(r => r.ar === expected.aspectRatio);
          assert.ok(item && fs.existsSync(item.filePath));
          assertDataDirHonored(item.filePath, ws.paths.images, `F10.2 ${expected.aspectRatio} filePath`);
          const header = fs.readFileSync(item.filePath).subarray(0, 8);
          assert.deepEqual(
            [...header],
            [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
            `Expected valid PNG signature for ${expected.aspectRatio}`
          );
          const info = probeMedia(item.filePath);
          const vStream = info.streams.find(s => s.codec_type === 'video');
          assert.equal(vStream.width, expected.width, `Width mismatch for ${expected.aspectRatio}`);
          assert.equal(vStream.height, expected.height, `Height mismatch for ${expected.aspectRatio}`);
        }
      } finally {
        ws.cleanup();
      }
    });

    it('F10.3: Offline fallback image renderer produces clean visual without branded sales poster or hotline overlays', async () => {
      const ws = createTempWorkspace('f10_3');
      try {
        const out = await runNodeSnippetSafe(`
          const imageEngine = require('./services/image_engine');
          (async () => {
            const res = await imageEngine.generateImage({
              prompt: 'Bright clean studio room with natural window light',
              title: 'Góc phòng sáng sủa',
              aspectRatio: '3:4',
              mode: 'AUTO',
              dryRun: false
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: '', GOOGLE_FLOW_ENABLED: 'false' } });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        const filePath = res.filePath || res.file_path;
        assert.equal(res.success, true);
        assert.equal(fs.existsSync(filePath), true);
        assert.ok(fs.statSync(filePath).size > 10 * 1024, 'Fallback image must be non-trivial PNG');
        const engineName = String(res.source || res.engine || '');
        assert.equal(/BRAND_CARD/i.test(engineName), false, `Fallback engine must not be branded sales poster card: ${engineName}`);

        const imgSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'services/image_engine.js'), 'utf8');
        assert.equal(/NHÀ CỦA LAND|Đặt lịch xem phòng|nhacualand\.com/.test(imgSrc), false, 'image_engine.js fallback must not render branded sales overlay text');
      } finally {
        ws.cleanup();
      }
    });

    it('F10.4: Mocked @google/genai verifies ImageEngine API call uses current response_format ({ type: "image", aspect_ratio, image_size })', async () => {
      const ws = createTempWorkspace('f10_4');
      try {
        // 1x1 valid PNG base64
        const tinyPng = generateSyntheticPng(path.join(ws.paths.images, 'seed_1x1.png'), { width: 64, height: 64 });
        const tinyB64 = fs.readFileSync(tinyPng).toString('base64');

        const mockFactory = `() => {
          const captured = [];
          return {
            GoogleGenAI: class {
              constructor() {
                this.interactions = {
                  create: async (params) => {
                    captured.push(params);
                    return {
                      output_image: { data: ${JSON.stringify(tinyB64)} }
                    };
                  }
                };
              }
            },
            __getCaptured: () => captured
          };
        }`;

        const out = await runNodeSnippetWithMockGenAi(mockFactory, `
          const genaiMock = require('@google/genai');
          const imageEngine = require('./services/image_engine');
          (async () => {
            const res = await imageEngine.generateImage({
              prompt: 'Sunlit studio room with balcony',
              aspectRatio: '3:4',
              imageSize: '2K',
              mode: 'API'
            });
            console.log(JSON.stringify({ captured: genaiMock.__getCaptured(), res }));
            process.exit(0);
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: 'mock-key', GOOGLE_FLOW_ENABLED: 'false' }, timeoutMs: 60000 });

        assert.equal(out.status, 0, out.stderr);
        const { captured, res } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(captured.length >= 1, 'Expected @google/genai interactions.create to be called');
        const reqParams = captured[0];
        assert.equal(reqParams.response_modalities, undefined, 'ImageEngine must NOT pass deprecated response_modalities');
        assert.equal(reqParams.response_mime_type, undefined, 'ImageEngine must NOT pass deprecated response_mime_type');
        assert.equal(reqParams.generation_config?.image_config, undefined, 'ImageEngine must NOT pass deprecated generation_config.image_config');
        const imgFmt = Array.isArray(reqParams.response_format)
          ? reqParams.response_format.find(f => f && f.type === 'image')
          : reqParams.response_format;
        assert.deepEqual(
          { type: imgFmt?.type, aspect_ratio: imgFmt?.aspect_ratio, image_size: imgFmt?.image_size },
          { type: 'image', aspect_ratio: '3:4', image_size: '2K' },
          'ImageEngine must pass current @google/genai@^2.31.0 ImageResponseFormat'
        );
        assertDataDirHonored(res.filePath || res.file_path, ws.tempDir, 'API image output');
      } finally {
        ws.cleanup();
      }
    });

    it('F10.5: ImageEngine resolves generated filePath inside DATA_DIR/images', async () => {
      const ws = createTempWorkspace('f10_5');
      try {
        const out = await runNodeSnippetSafe(`
          const imageEngine = require('./services/image_engine');
          (async () => {
            const res = await imageEngine.generateImage({
              prompt: 'Minimalist bedroom with oak floor',
              aspectRatio: '4:5',
              mode: 'AUTO',
              dryRun: true
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assertDataDirHonored(res.filePath || res.file_path, ws.paths.images, 'ImageEngine filePath inside DATA_DIR/images');
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F11: AI Video Engine, Flow RPA & Hyperframes FFmpeg (5 tests)
  // =========================================================================
  describe('F11: AI Video Engine, Flow RPA & Hyperframes FFmpeg', () => {
    it('F11.1: HyperframesFFmpeg.validateMediaQuality passes a valid >=300KB 9:16 MP4', async () => {
      const ws = createTempWorkspace('f11_1');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js')), true, 'services/hyperframes_ffmpeg.js must exist');
        const HyperframesFFmpeg = require('../../services/hyperframes_ffmpeg');

        const validVideo = generateSyntheticVideo(path.join(ws.paths.videos, 'valid_9x16.mp4'), {
          width: 1080,
          height: 1920,
          durationSec: 3
        });
        const check = await HyperframesFFmpeg.validateMediaQuality(validVideo, 'video');
        assert.equal(check.passed, true, `Expected valid video to pass quality gate: ${check.reason}`);
        assert.ok(check.metrics);
      } finally {
        ws.cleanup();
      }
    });

    it('F11.2: HyperframesFFmpeg.composeReel produces a valid 9:16 MP4 with -14 LUFS normalization in temp DATA_DIR', async () => {
      const ws = createTempWorkspace('f11_2');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js')), true, 'services/hyperframes_ffmpeg.js must exist');
        const HyperframesFFmpeg = require('../../services/hyperframes_ffmpeg');

        const img1 = generateSyntheticPng(path.join(ws.paths.images, 'frame1.png'), { width: 1080, height: 1440 });
        const img2 = generateSyntheticPng(path.join(ws.paths.images, 'frame2.png'), { width: 1080, height: 1440 });
        const outVideo = path.join(ws.paths.videos, 'composed_reel.mp4');

        const res = await HyperframesFFmpeg.composeReel({
          imagePaths: [img1, img2],
          outputPath: outVideo,
          durationSec: 4,
          aspectRatio: '9:16'
        });

        assertDataDirHonored(res.filePath, ws.tempDir, 'composed reel');
        assert.equal(fs.existsSync(res.filePath), true);
        assert.ok(res.fileSizeBytes >= 300 * 1024, `Composed reel too small: ${res.fileSizeBytes}`);
        assert.equal(res.lufsNormalized, true);

        const probed = probeMedia(res.filePath);
        const videoStream = probed.streams.find(s => s.codec_type === 'video');
        assert.equal(videoStream.width, 1080);
        assert.equal(videoStream.height, 1920);
      } finally {
        ws.cleanup();
      }
    });

    it('F11.3: VideoEngine.renderReel({ dryRun: true }) produces clean 9:16 output with qualityPassed=true in isolated DATA_DIR', async () => {
      const ws = createTempWorkspace('f11_3');
      try {
        const out = await runNodeSnippetSafe(`
          const videoEngine = require('./services/video-engine');
          (async () => {
            const res = await videoEngine.renderReel({
              title: 'Góc phòng sáng sủa sau giờ làm',
              hook: 'Ánh nắng nhẹ bên khung cửa sổ',
              duration: 4,
              aspectRatio: '9:16',
              mode: 'AUTO',
              dryRun: true
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        const filePath = res.filePath || res.file_path;
        assertDataDirHonored(filePath, ws.tempDir, 'VideoEngine generated filePath');
        assert.equal(res.success, true);
        assert.equal(res.dryRun, true);
        assert.equal(res.qualityPassed, true);
      } finally {
        ws.cleanup();
      }
    });

    it('F11.4: Mocked @google/genai in veo_video_engine verifies current response_format ({ type: "video", aspect_ratio, resolution })', async () => {
      const ws = createTempWorkspace('f11_4');
      try {
        const sampleMp4 = generateSyntheticVideo(path.join(ws.paths.videos, 'seed_mock.mp4'), {
          width: 1080,
          height: 1920,
          durationSec: 2
        });

        const mockFactory = `() => {
          const fs = require('fs');
          const captured = [];
          return {
            GoogleGenAI: class {
              constructor() {
                this.interactions = {
                  create: async (params) => {
                    captured.push(params);
                    return {
                      id: 'mock_vid_int_1',
                      output_video: { data: fs.readFileSync(${JSON.stringify(sampleMp4)}).toString('base64') }
                    };
                  }
                };
              }
            },
            __getCaptured: () => captured
          };
        }`;

        const out = await runNodeSnippetWithMockGenAi(mockFactory, `
          const genaiMock = require('@google/genai');
          const veoEngine = require('./services/veo_video_engine');
          (async () => {
            const res = await veoEngine.createRealisticVideo({
              prompt: 'Smooth room tour of sunlit studio apartment',
              aspectRatio: '9:16',
              resolution: '1080p',
              duration: 4,
              mode: 'API'
            });
            console.log(JSON.stringify({ captured: genaiMock.__getCaptured(), res }));
            process.exit(0);
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: 'mock-key', GOOGLE_FLOW_ENABLED: 'false' }, timeoutMs: 60000 });

        assert.equal(out.status, 0, out.stderr);
        const { captured, res } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(captured.length >= 1, 'Expected @google/genai interactions.create to be called for video');
        const reqParams = captured[0];
        assert.equal(reqParams.response_modalities, undefined, 'veo_video_engine must NOT pass deprecated response_modalities');
        assert.equal(reqParams.response_mime_type, undefined, 'veo_video_engine must NOT pass deprecated response_mime_type');
        assert.equal(reqParams.generation_config?.video_config?.aspect_ratio, undefined, 'generation_config.video_config must NOT contain invalid aspect_ratio');
        assert.equal(reqParams.generation_config?.video_config?.resolution, undefined, 'generation_config.video_config must NOT contain invalid resolution');
        assert.equal(reqParams.generation_config?.video_config?.duration, undefined, 'generation_config.video_config must NOT contain invalid duration');
        const vidFmt = Array.isArray(reqParams.response_format)
          ? reqParams.response_format.find(f => f && f.type === 'video')
          : reqParams.response_format;
        assert.ok(vidFmt && vidFmt.type === 'video', 'veo_video_engine must pass response_format with type: "video"');
        assert.equal(vidFmt.aspect_ratio, '9:16');
        assert.equal(vidFmt.resolution, '1080p');
        if (vidFmt.duration !== undefined) {
          assert.match(String(vidFmt.duration), /^(?:[3-9]|1[0-5])s$/, 'VideoResponseFormat.duration must be google-duration string 3s-15s');
        }
        assertDataDirHonored(res.filePath || res.file_path, ws.tempDir, 'Veo API video output');
      } finally {
        ws.cleanup();
      }
    });

    it('F11.5: VideoEngine.renderReel produces preview PNG, audio stream, empty call_to_action, and honors DATA_DIR/videos', async () => {
      const ws = createTempWorkspace('f11_5');
      try {
        const out = await runNodeSnippetSafe(`
          const videoEngine = require('./services/video-engine');
          (async () => {
            const res = await videoEngine.renderReel({
              title: 'Phòng sáng thoáng cuối tuần',
              hook: 'Nắng sớm bên khung cửa sổ',
              duration: 4,
              aspectRatio: '9:16',
              mode: 'AUTO',
              dryRun: true
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        const filePath = res.filePath || res.file_path;
        const previewPath = res.previewPath || res.preview_snapshot;

        assertDataDirHonored(filePath, ws.paths.videos, 'VideoEngine video inside DATA_DIR/videos');
        assert.equal(String(res.call_to_action || '').trim(), '', 'call_to_action must be empty');
        assert.ok(previewPath && fs.existsSync(previewPath), `Expected preview PNG snapshot to exist, got: ${previewPath}`);
        assertDataDirHonored(previewPath, ws.tempDir, 'VideoEngine previewPath');

        const info = probeMedia(filePath);
        const vStream = info.streams.find(s => s.codec_type === 'video');
        const aStream = info.streams.find(s => s.codec_type === 'audio');
        assert.ok(vStream && vStream.height > vStream.width, 'Expected 9:16 vertical video stream');
        assert.ok(aStream, 'Expected audio stream in rendered reel');
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F12: Dual-Engine Publishers & Fail-Closed Brand Asset Guard (5 tests)
  // =========================================================================
  describe('F12: Dual-Engine Publishers & Fail-Closed Brand Asset Guard', () => {
    it('F12.1: Brand identity configuration pins Facebook Nhacualand (1337253129481940), IG @nhacualand, Threads @nhacualand', () => {
      const envRaw = fs.readFileSync(path.join(WORKSPACE_ROOT, '.env'), 'utf8');
      assert.match(envRaw, /META_PAGE_ID\s*=\s*["']?1337253129481940["']?/);
      assert.match(envRaw, /BRAND_FACEBOOK_PAGE\s*=\s*["']?Nhacualand["']?/);
      assert.match(envRaw, /BRAND_INSTAGRAM\s*=\s*["']?nhacualand["']?/);
      assert.match(envRaw, /BRAND_THREADS\s*=\s*["']?nhacualand["']?/);
      assert.match(envRaw, /STRICT_BRAND_ASSET_GUARD\s*=\s*["']?true["']?/i);

      const brand = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/brand.json'), 'utf8'));
      assert.equal(brand.social.facebook_page_name, 'Nhacualand');
      assert.equal(brand.social.instagram_username, 'nhacualand');
      assert.equal(brand.social.threads_username, 'nhacualand');
    });

    it('F12.2: Facebook MetaPlaywrightPublisher Brand Asset Guard matches Nhacualand combobox fixture', async () => {
      const metaPublisher = require('../../services/meta_playwright_publisher');
      const result = await withHeadlessPage(async page => {
        await page.setContent(`
          <html>
            <body>
              <div role="combobox">Nhacualand</div>
              <div role="textbox" contenteditable="true"></div>
            </body>
          </html>
        `);
        return await metaPublisher.ensureTargetFanpageSelected(page);
      });
      assert.equal(result.matched, true);
    });

    it('F12.3: Instagram and Threads Brand Asset Guards match @nhacualand on local HTML fixtures', async () => {
      const igPublisher = require('../../services/instagram_playwright_publisher');
      const threadsPublisher = require('../../services/threads_playwright_publisher');

      const igCheck = await withHeadlessPage(async page => {
        await page.setContent(`
          <html><body>
            <nav>
              <a href="/explore/">Explore</a>
              <a href="/nhacualand/">Trang cá nhân</a>
            </nav>
          </body></html>
        `);
        return await igPublisher.verifyLoggedInHandle(page);
      });
      assert.equal(igCheck.matched, true);
      assert.equal(igCheck.detectedHandle, 'nhacualand');

      const thCheck = await withHeadlessPage(async page => {
        await page.setContent(`
          <html><body>
            <header>
              <nav><a href="/@nhacualand">Profile</a></nav>
            </header>
          </body></html>
        `);
        return await threadsPublisher.verifyThreadsAccount(page);
      });
      assert.equal(thCheck.matched, true);
      assert.equal(thCheck.detectedHandle, 'nhacualand');
    });

    it('F12.4: publishDirect succeeds against loopback Graph API mock for FB, IG, and Threads without hitting live Meta URLs', async () => {
      const ws = createTempWorkspace('f12_4');
      let server = null;
      try {
        const hitPaths = [];
        server = await startLoopbackServer((req, res) => {
          hitPaths.push(`${req.method} ${req.url.split('?')[0]}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (req.url.includes('debug_token')) {
            res.end(JSON.stringify({
              data: {
                is_valid: true,
                type: 'PAGE',
                profile_id: '1337253129481940',
                scopes: ['pages_manage_posts', 'instagram_content_publish']
              }
            }));
          } else if (req.url.includes('status_code')) {
            res.end(JSON.stringify({ status_code: 'FINISHED' }));
          } else {
            res.end(JSON.stringify({ id: `loopback_post_${hitPaths.length}` }));
          }
        });

        const caption = 'Tan làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ có cửa sổ thoáng là thấy nhẹ lòng.';
        const out = await runNodeSnippetSafe(`
          const origFetch = global.fetch;
          const loopbackBase = ${JSON.stringify(server.url)};
          global.fetch = async (input, init) => {
            const urlStr = typeof input === 'string' ? input : input.url;
            const parsed = new URL(urlStr);
            if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
              if (!parsed.hostname.includes('facebook.com')) {
                throw new Error('R4_GUARD: Blocked non-loopback external request: ' + urlStr);
              }
              const rewritten = loopbackBase + parsed.pathname + parsed.search;
              return origFetch(rewritten, init);
            }
            return origFetch(input, init);
          };

          // Prevent fallback to live Playwright or local image overwrite during Graph API loopback test
          const playwrightManager = require('./services/playwright_manager');
          playwrightManager.beginBatchSession = async () => ({
            browser: null, context: null, isAttached: false, isBatchShared: true
          });
          playwrightManager.endBatchSession = async () => {};
          playwrightManager._launchOrAttachContext = async () => {
            throw new Error('R4_GUARD: Playwright _launchOrAttachContext blocked in Graph API loopback test');
          };
          playwrightManager.getContext = async () => {
            throw new Error('R4_GUARD: Playwright fallback blocked in Graph API loopback test');
          };
          for (const mod of [
            './services/meta_playwright_publisher',
            './services/instagram_playwright_publisher',
            './services/threads_playwright_publisher'
          ]) {
            require(mod).publish = async () => {
              throw new Error(\`R4_GUARD: \${mod}.publish blocked in Graph API loopback test\`);
            };
          }
          const imageEngine = require('./services/image_engine');
          imageEngine.generateImage = async () => {
            throw new Error('R4_GUARD: Remote media_url must not be overwritten with local image generation');
          };

          const { publishDirect } = require('./services/publish-executor');
          (async () => {
            const res = await publishDirect({
              platform: 'all',
              contentType: 'photo',
              message: ${JSON.stringify(caption)},
              facebook_caption: ${JSON.stringify(caption)},
              instagram_caption: ${JSON.stringify(caption)},
              threads_caption: ${JSON.stringify(caption)},
              media_url: ${JSON.stringify(`${server.url}/mock_room.jpg`)},
              dryRun: false
            });
            console.log(JSON.stringify(res));
          })();
        `, {
          tempDir: ws.tempDir,
          extraEnv: {
            DRY_RUN: 'false',
            AUTO_PUBLISH: 'true',
            FACEBOOK_AUTO_PUBLISH: 'true',
            INSTAGRAM_AUTO_PUBLISH: 'true',
            THREADS_AUTO_PUBLISH: 'true',
            META_PAGE_ID: '1337253129481940',
            META_PAGE_ACCESS_TOKEN: 'mock_fb_token',
            IG_BUSINESS_ACCOUNT_ID: '17841400000000001',
            INSTAGRAM_ACCESS_TOKEN: 'mock_ig_token',
            THREADS_USER_ID: '26000000000000001',
            THREADS_ACCESS_TOKEN: 'mock_th_token',
            THREADS_API_BASE_URL: `${server.url}/v1.0`
          }
        });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.success, true, `Expected loopback Graph API publishDirect to succeed: ${JSON.stringify(res)}`);
        assert.deepEqual(res.successfulTargets, ['facebook', 'instagram', 'threads']);
        assert.equal(res.facebook?.engine, 'META_GRAPH_API');
        assert.equal(res.instagram?.engine, 'INSTAGRAM_GRAPH_API');
        assert.equal(res.threads?.engine, 'THREADS_GRAPH_API');
        assert.ok(hitPaths.length >= 3, `Expected >=3 loopback API calls, got ${hitPaths.length}`);
      } finally {
        if (server) await server.close();
        ws.cleanup();
      }
    });

    it('F12.5: MetaPlaywrightPublisher unchecks non-brand page in multi-target combobox and all 3 publishers honor DATA_DIR/screenshots', async () => {
      const ws = createTempWorkspace('f12_5');
      try {
        const metaPublisher = require('../../services/meta_playwright_publisher');
        const check = await withHeadlessPage(async page => {
          await page.setContent(`
            <html><body>
              <div role="combobox">Nhacualand, OtherFashionPage</div>
              <div role="listbox" style="display:block">
                <div role="option" data-clicked="false" onclick="this.dataset.clicked='true'">Nhacualand</div>
                <div role="option" data-clicked="false" onclick="this.dataset.clicked='true'">OtherFashionPage</div>
              </div>
              <div role="textbox" contenteditable="true"></div>
            </body></html>
          `);
          const res = await metaPublisher.ensureTargetFanpageSelected(page, { allowBrandInstagramCrosspost: false });
          const otherClicked = await page.locator('[role="option"]').nth(1).getAttribute('data-clicked');
          const brandClicked = await page.locator('[role="option"]').nth(0).getAttribute('data-clicked');
          return { res, otherClicked, brandClicked };
        });
        assert.equal(check.res.matched, true);
        assert.equal(check.res.crossPostedInstagram, false);
        assert.equal(check.otherClicked, 'true', 'Non-brand option must be clicked/unchecked');
        assert.equal(check.brandClicked, 'false', 'Brand option Nhacualand must remain checked');

        const dirOut = await runNodeSnippetSafe(`
          const metaPub = require('./services/meta_playwright_publisher');
          const igPub = require('./services/instagram_playwright_publisher');
          const thPub = require('./services/threads_playwright_publisher');
          console.log(JSON.stringify({
            meta: metaPub.screenshotDir,
            ig: igPub.screenshotDir,
            th: thPub.screenshotDir
          }));
        `, { tempDir: ws.tempDir });
        assert.equal(dirOut.status, 0, dirOut.stderr);
        const dirs = JSON.parse(dirOut.stdout.trim().split(/\r?\n/).pop());
        assertDataDirHonored(dirs.meta, ws.paths.screenshots, 'Meta screenshotDir');
        assertDataDirHonored(dirs.ig, ws.paths.screenshots, 'IG screenshotDir');
        assertDataDirHonored(dirs.th, ws.paths.screenshots, 'Threads screenshotDir');
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F13: Safe Dry-Run / Staging & 24/7 Scheduler Runners (5 tests)
  // =========================================================================
  describe('F13: Safe Dry-Run / Staging & 24/7 Scheduler Runners', () => {
    it('F13.1: run_daily.cmd and run_daily_hidden.vbs are aligned for D:\\Facebook headless execution', () => {
      const cmdRaw = fs.readFileSync(path.join(WORKSPACE_ROOT, 'run_daily.cmd'), 'utf8');
      const vbsRaw = fs.readFileSync(path.join(WORKSPACE_ROOT, 'run_daily_hidden.vbs'), 'utf8');

      assert.match(cmdRaw, /chcp\s+65001/i);
      assert.match(cmdRaw, /cd\s+\/d\s+"D:\\Facebook"/i);
      assert.match(cmdRaw, /node\s+scripts\\company_orchestrator\.js/i);
      assert.match(vbsRaw, /WshShell\.CurrentDirectory\s*=\s*"D:\\Facebook"/i);
      assert.match(vbsRaw, /D:\\Facebook\\run_daily\.cmd/i);
    });

    it('F13.2: Windows Task Scheduler \\Nhacualand_Daily_{0830,1130,1945} tasks match 08:30, 11:30, 19:45 with PT30M & IgnoreNew', () => {
      const expectedTasks = [
        { name: '\\Nhacualand_Daily_0830', time: 'T08:30:00' },
        { name: '\\Nhacualand_Daily_1130', time: 'T11:30:00' },
        { name: '\\Nhacualand_Daily_1945', time: 'T19:45:00' }
      ];

      for (const task of expectedTasks) {
        const xml = execFileSync('schtasks', ['/query', '/tn', task.name, '/xml'], {
          encoding: 'utf8',
          timeout: 10000
        });
        assert.ok(xml.includes(task.time), `${task.name} missing StartBoundary ${task.time}`);
        assert.ok(xml.includes('<ExecutionTimeLimit>PT30M</ExecutionTimeLimit>'), `${task.name} missing PT30M`);
        assert.ok(xml.includes('<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>'), `${task.name} missing IgnoreNew`);
        assert.ok(xml.includes('run_daily_hidden.vbs'), `${task.name} missing run_daily_hidden.vbs action`);
        assert.ok(xml.includes('<WorkingDirectory>D:\\Facebook</WorkingDirectory>'), `${task.name} missing D:\\Facebook working directory`);
      }
    });

    it('F13.3: lib/env-loader.js preserves pre-set DRY_RUN=true, AUTO_PUBLISH=false, GOOGLE_FLOW_ENABLED=false, and DATA_DIR', () => {
      const verified = assertEnvLoaderSafeForDryRun();
      assert.equal(verified.DRY_RUN, 'true');
      assert.equal(verified.AUTO_PUBLISH, 'false');
      assert.equal(verified.GOOGLE_FLOW_ENABLED, 'false');
      assert.equal(verified.GOOGLE_VEO_ENABLED, 'false');
      assert.equal(verified.GOOGLE_IMAGE_ENABLED, 'false');
      assert.equal(verified.GEMINI_API_KEY, '');
      assert.ok(verified.DATA_DIR);
    });

    it('F13.4: publishDirect({ platform: "all", dryRun: true }) stages omnichannel output inside DATA_DIR/outputs/', async () => {
      const ws = createTempWorkspace('f13_4');
      try {
        const validCaption = 'Tan làm mệt nhoài chỉ mong mở cửa thấy căn phòng sạch sẽ thoáng mát. Tối về ngủ một giấc cho đã đời ngày mai đi làm tiếp.';
        const out = await runNodeSnippetSafe(`
          const { publishDirect } = require('./services/publish-executor');
          (async () => {
            const res = await publishDirect({
              platform: 'all',
              contentType: 'feed',
              message: ${JSON.stringify(validCaption)},
              facebook_caption: ${JSON.stringify(validCaption)},
              instagram_caption: ${JSON.stringify(validCaption)},
              threads_caption: ${JSON.stringify(validCaption)},
              dryRun: true
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.dryRun, true);
        assert.equal(res.success, true);
        assert.deepEqual(res.successfulTargets, ['facebook', 'instagram', 'threads']);
        assert.deepEqual(res.failedTargets, []);
        assert.ok(res.stagingReportPath, 'publishDirect({ dryRun: true }) should write stagingReportPath inside DATA_DIR');
        assertDataDirHonored(res.stagingReportPath, ws.paths.outputs, 'stagingReportPath');
        assert.equal(fs.existsSync(res.stagingReportPath), true);
      } finally {
        ws.cleanup();
      }
    });

    it('F13.5: company_orchestrator.js --dry-run --media image and publish_now.js --dry-run --auto-image write staging artifacts strictly inside DATA_DIR', async () => {
      const ws1 = createTempWorkspace('f13_5_orch');
      const ws2 = createTempWorkspace('f13_5_pub');
      try {
        const orchRes = await runNodeCliSafe('scripts/company_orchestrator.js', [
          '--dry-run',
          '--media', 'image',
          '--topic', 'Phòng có cửa sổ thoáng sáng dễ chịu'
        ], { tempDir: ws1.tempDir, timeoutMs: 60000 });
        assert.equal(orchRes.status, 0, orchRes.stderr);
        assert.ok(listFilesRecursive(ws1.paths.outputs).length >= 1, 'company_orchestrator --dry-run must write staging output in DATA_DIR/outputs');
        assert.ok(listFilesRecursive(ws1.paths.images).length >= 1, 'company_orchestrator --dry-run --media image must write image in DATA_DIR/images');

        const pubRes = await runNodeCliSafe('scripts/publish_now.js', [
          '--dry-run',
          '--auto-image',
          '--platform', 'all',
          '--message', 'Tan làm mệt nhoài chỉ mong về phòng nghỉ ngơi. Phòng sạch sẽ có ánh sáng tự nhiên là đủ thấy bình yên.'
        ], { tempDir: ws2.tempDir, timeoutMs: 60000 });
        assert.equal(pubRes.status, 0, pubRes.stderr);
        assert.ok(listFilesRecursive(ws2.paths.images).length >= 1, 'publish_now --dry-run --auto-image must write image in DATA_DIR/images');
        assert.ok(listFilesRecursive(ws2.paths.outputs).length >= 1, 'publish_now --dry-run --auto-image must write staging output in DATA_DIR/outputs');
      } finally {
        ws1.cleanup();
        ws2.cleanup();
      }
    });
  });
});
