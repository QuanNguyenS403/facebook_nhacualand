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
  assertDataDirHonored,
  createSeededCalendar,
  createTempWorkspace,
  cleanupEmptyTmpRoot,
  runNodeCliSafe,
  runNodeSnippetSafe,
  runNodeSnippetWithMockGenAi,
  spawnHoldLockChild,
  killChildAsync,
  generateSyntheticVideo,
  startLoopbackServer,
  withHeadlessPage
} = require('./_helpers');

const governance = require('../../lib/governance');
const processLock = require('../../lib/process-lock');
const contentPlanner = require('../../lib/content-planner');

function resolveAssertInsideWorkspace() {
  return governance.assertInsideWorkspace || processLock.assertInsideWorkspace || null;
}

describe('Tier 2 — Boundary & Corner-Case Verification (F1–F13)', () => {
  let prodSnap;

  before(() => {
    prodSnap = snapshotProductionData();
  });

  after(() => {
    cleanupEmptyTmpRoot();
    assertProductionDataUnchanged(prodSnap, 'Tier 2 suite completion');
  });

  // =========================================================================
  // F1 Boundaries: Strict D:\Facebook Isolation & Admin Email (7 tests)
  // =========================================================================
  describe('F1 Boundaries: Workspace Isolation & Admin Email Rejection', () => {
    it('F1.B1: assertInsideWorkspace rejects empty string, whitespace, null, and undefined', () => {
      const assertInsideWorkspace = resolveAssertInsideWorkspace();
      assert.equal(typeof assertInsideWorkspace, 'function', 'assertInsideWorkspace must be exported');

      for (const bad of ['', '   ', null, undefined]) {
        assert.throws(() => assertInsideWorkspace(bad), `Expected rejection for ${JSON.stringify(bad)}`);
      }
    });

    it('F1.B2: assertInsideWorkspace rejects sibling D:\\CSKH and prefix-trap paths (D:\\Facebook2, D:\\Facebook_backup, D:/Facebook-dev)', () => {
      const assertInsideWorkspace = resolveAssertInsideWorkspace();
      assert.equal(typeof assertInsideWorkspace, 'function', 'assertInsideWorkspace must be exported');

      assert.throws(() => assertInsideWorkspace('D:\\CSKH\\data\\publish_history.json'));
      assert.throws(() => assertInsideWorkspace('D:\\Facebook2\\data\\secret.json'));
      assert.throws(() => assertInsideWorkspace('D:\\Facebook_backup\\publish_history.json'));
      assert.throws(() => assertInsideWorkspace('D:/Facebook-dev/data/test.json'));
    });

    it('F1.B3: assertInsideWorkspace rejects relative and nested path traversal escaping D:\\Facebook', () => {
      const assertInsideWorkspace = resolveAssertInsideWorkspace();
      assert.equal(typeof assertInsideWorkspace, 'function', 'assertInsideWorkspace must be exported');

      assert.throws(() => assertInsideWorkspace(path.join(WORKSPACE_ROOT, '..', 'CSKH', 'config.json')));
      assert.throws(() => assertInsideWorkspace('..\\CSKH\\secret.txt'));
      assert.throws(() => assertInsideWorkspace('D:\\Facebook\\data\\..\\..\\CSKH\\x.json'));
    });

    it('F1.B4: assertInsideWorkspace rejects UNC network path and wrong drive-letter C:\\Facebook', () => {
      const assertInsideWorkspace = resolveAssertInsideWorkspace();
      assert.equal(typeof assertInsideWorkspace, 'function', 'assertInsideWorkspace must be exported');

      assert.throws(() => assertInsideWorkspace('\\\\fileserver\\Facebook\\data\\test.json'));
      assert.throws(() => assertInsideWorkspace('C:\\Facebook\\data\\test.json'));
    });

    it('F1.B5: assertInsideWorkspace rejects drive-relative paths (C:foo.txt, D:foo.txt)', () => {
      const assertInsideWorkspace = resolveAssertInsideWorkspace();
      assert.equal(typeof assertInsideWorkspace, 'function', 'assertInsideWorkspace must be exported');

      assert.throws(() => assertInsideWorkspace('C:foo.txt'));
      assert.throws(() => assertInsideWorkspace('D:foo.txt'));
    });

    it('F1.B6: verify_account_isolation.js flags forbidden GMKT emails (gmkt2303@gmail.com, ketoantkmg@gmail.com) and blank email', async () => {
      const ws = createTempWorkspace('f1_b6');
      try {
        for (const badEmail of ['gmkt2303@gmail.com', 'ketoantkmg@gmail.com', '']) {
          const cli = await runNodeCliSafe('scripts/verify_account_isolation.js', [], {
            tempDir: ws.tempDir,
            extraEnv: { ADMIN_EMAIL: badEmail },
            timeoutMs: 30000
          });
          assert.match(
            cli.stdout,
            /❌\s*Email quản trị chuẩn quy định/,
            `verify_account_isolation.js must fail admin email check for "${badEmail}"`
          );
        }
      } finally {
        ws.cleanup();
      }
    });

    it('F1.B7: assertInsideWorkspace normalizes mixed forward/back slashes inside D:\\Facebook', () => {
      const assertInsideWorkspace = resolveAssertInsideWorkspace();
      assert.equal(typeof assertInsideWorkspace, 'function', 'assertInsideWorkspace must be exported');

      const resolved = assertInsideWorkspace('D:/Facebook\\data/outputs/../images/sample.png');
      assert.equal(path.resolve(resolved).toLowerCase(), 'd:\\facebook\\data\\images\\sample.png');
    });
  });

  // =========================================================================
  // F2 Boundaries: Zero-Human-Approval Autonomy (5 tests)
  // =========================================================================
  describe('F2 Boundaries: Autonomy Override & Safety Gating', () => {
    it('F2.B1: evaluateContent sets selfApproved=false when REQUIRE_HUMAN_APPROVAL=true even on compliant copy', async () => {
      const ws = createTempWorkspace('f2_b1');
      try {
        const out = await runNodeSnippetSafe(`
          const { evaluateContent } = require('./lib/governance');
          const res = evaluateContent({
            caption: 'Tan làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ thoáng mát là đủ yên lòng.'
          });
          console.log(JSON.stringify(res));
        `, { tempDir: ws.tempDir, extraEnv: { REQUIRE_HUMAN_APPROVAL: 'true' } });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.allowed, true);
        assert.equal(res.selfApproved, false);
      } finally {
        ws.cleanup();
      }
    });

    it('F2.B2: normalizeCompliantMessage does NOT auto-append tags when SELF_APPROVE_CONTENT=false and keeps empty strings empty', async () => {
      const ws = createTempWorkspace('f2_b2');
      try {
        const out = await runNodeSnippetSafe(`
          const { normalizeCompliantMessage } = require('./lib/governance');
          const msg = normalizeCompliantMessage('Phòng sáng thoáng sạch sẽ. Tối về ngủ ngon.');
          const empty = normalizeCompliantMessage('   ');
          console.log(JSON.stringify({ msg, empty }));
        `, { tempDir: ws.tempDir, extraEnv: { SELF_APPROVE_CONTENT: 'false' } });

        assert.equal(out.status, 0, out.stderr);
        const { msg, empty } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(/#phongtro/.test(msg), false, 'Must not auto-append hashtags when SELF_APPROVE_CONTENT=false');
        assert.equal(empty, '');
      } finally {
        ws.cleanup();
      }
    });

    it('F2.B3: company_orchestrator.runAutonomousCycle skips live publish when AUTO_PUBLISH=false', async () => {
      const ws = createTempWorkspace('f2_b3');
      try {
        const out = await runNodeSnippetSafe(`
          const { runAutonomousCycle } = require('./scripts/company_orchestrator');
          (async () => {
            const res = await runAutonomousCycle({
              customTopic: 'Phòng sáng thoáng sạch sẽ cho người đi làm',
              mediaMode: 'image',
              dryRun: false
            });
            console.log(JSON.stringify({ published: res.published, hasMedia: Boolean(res.media) }));
          })();
        `, { tempDir: ws.tempDir, extraEnv: { AUTO_PUBLISH: 'false', DRY_RUN: 'false' } });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.published, false);
        assert.equal(res.hasMedia, true);
        assert.deepEqual(JSON.parse(fs.readFileSync(ws.paths.historyFile, 'utf8')), []);
      } finally {
        ws.cleanup();
      }
    });

    it('F2.B4: verify_account_isolation.js flags autonomy check failure when REQUIRE_HUMAN_APPROVAL=true or AUTONOMOUS_MODE=MANUAL', async () => {
      const ws = createTempWorkspace('f2_b4');
      try {
        const cli1 = await runNodeCliSafe('scripts/verify_account_isolation.js', [], {
          tempDir: ws.tempDir,
          extraEnv: { REQUIRE_HUMAN_APPROVAL: 'true' },
          timeoutMs: 30000
        });
        assert.match(cli1.stdout, /❌\s*Tự động hóa 100% không qua duyệt tay/);

        const cli2 = await runNodeCliSafe('scripts/verify_account_isolation.js', [], {
          tempDir: ws.tempDir,
          extraEnv: { AUTONOMOUS_MODE: 'MANUAL' },
          timeoutMs: 30000
        });
        assert.match(cli2.stdout, /❌\s*Tự động hóa 100% không qua duyệt tay/);
      } finally {
        ws.cleanup();
      }
    });

    it('F2.B5: DRY_RUN=true overrides AUTO_PUBLISH=true inside publishDirect (zero live calls)', async () => {
      const ws = createTempWorkspace('f2_b5');
      try {
        const validCaption = 'Tan làm mệt nhoài chỉ mong về phòng nghỉ ngơi. Phòng sạch sẽ có cửa sổ thoáng là đủ bình yên.';
        const out = await runNodeSnippetSafe(`
          const { publishDirect } = require('./services/publish-executor');
          (async () => {
            const res = await publishDirect({
              platform: 'all',
              contentType: 'feed',
              message: ${JSON.stringify(validCaption)}
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir, extraEnv: { DRY_RUN: 'true', AUTO_PUBLISH: 'true' } });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.dryRun, true);
        assert.equal(res.facebook.engine, 'DRY_RUN_MOCK');
        assert.equal(res.instagram.engine, 'DRY_RUN_MOCK');
        assert.equal(res.threads.engine, 'DRY_RUN_MOCK');
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F3 Boundaries: Deterministic Rule 5 Governance & Rate Limits (12 tests)
  // =========================================================================
  describe('F3 Boundaries: Rule 5 Governance & Rate-Limit Boundaries', () => {
    it('F3.B1: evaluateContent rejects 0-sentence and 1-sentence captions', () => {
      const zero = governance.evaluateContent({ caption: '   #phongtro #chothuephong  ' });
      const one = governance.evaluateContent({ caption: 'Phòng trọ sạch sẽ thoáng mát dễ ngủ lắm.' });
      assert.equal(zero.allowed, false, '0 sentences must be rejected');
      assert.equal(one.allowed, false, '1 sentence (<2) must be rejected');
    });

    it('F3.B2: evaluateContent accepts exact boundary 2-sentence and 4-sentence captions', () => {
      const two = 'Tan làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ có ánh sáng tự nhiên là thấy nhẹ lòng.';
      const four = 'Đi làm cả ngày ngoài đường bụi bặm mệt lắm. Về tới phòng chỉ mong mở cửa thấy chỗ ở gọn gàng sạch sẽ. Điện nước rõ ràng từng đồng từ đầu để đỡ phải lo nghĩ cuối tháng. Ngủ một giấc thật sâu lấy sức mai đi làm tiếp.';

      const res2 = governance.evaluateContent({ caption: two });
      const res4 = governance.evaluateContent({ caption: four });
      assert.equal(res2.allowed, true, `2-sentence boundary should pass: ${res2.violations.join('; ')}`);
      assert.equal(res4.allowed, true, `4-sentence boundary should pass: ${res4.violations.join('; ')}`);
    });

    it('F3.B3: evaluateContent rejects 5-sentence captions (>4 sentences)', () => {
      const five = 'Câu một nói về chuyện đi làm mệt. Câu hai kể chuyện dắt xe tìm phòng tối om. Câu ba nhắc chuyện ảnh trên mạng khác thực tế. Câu bốn mong phòng có cửa sổ sáng sủa. Câu năm chúc mọi người ngủ ngon.';
      const res = governance.evaluateContent({ caption: five });
      assert.equal(res.allowed, false, '5 sentences (>4) must be rejected');
    });

    it('F3.B4: evaluateContent rejects captions exceeding word budget (>90 words) or char budget (>450 chars)', () => {
      const longSentence1 = 'Đi thuê trọ ở thành phố lớn đôi khi gặp đủ thứ chuyện mệt mỏi từ tiền điện nước mập mờ đến chuyện giờ giấc chật chội ngõ ngách sâu hun hút khiến ai đi làm về muộn cũng thấy nản lòng và chỉ mong tìm được một nơi nghỉ ngơi bình yên.';
      const longSentence2 = 'Có những hôm trời mưa tầm tã dắt xe vào con hẻm ngập nước mà chỉ ước căn phòng nhỏ của mình đủ khô ráo sạch sẽ và yên tĩnh để có thể ngả lưng nghỉ ngơi sau tám tiếng làm việc căng thẳng ngoài công sở mỗi ngày.';
      const overBudget = `${longSentence1} ${longSentence2}`;

      const res = governance.evaluateContent({ caption: overBudget });
      assert.equal(res.allowed, false, 'Over-budget (>90 words / >450 chars) caption must be rejected');
    });

    it('F3.B5: evaluateContent rejects direct and obfuscated brand variations and @handles', () => {
      const variants = [
        'Phòng sạch sẽ thoáng mát ở nhacualand rất dễ chịu. Tối về ngủ ngon giấc.',
        'Hôm nay đi xem phòng của Nhà Của Land thấy ổn áp. Ánh sáng tự nhiên ngập tràn.',
        'Phòng này do Nha Cua Land giới thiệu nên nhìn rất thoáng. Tối về ngủ ngon giấc.',
        'Hôm nay xem phòng bên nhacualand . com thấy ổn áp lắm. Không gian gọn gàng.',
        'Mình mới dọn về phòng của N H À C Ủ A L A N D hôm qua. Rất yên tĩnh.',
        'Nhắn qua @nhacualand để hỏi thêm về phòng nhé. Phòng rất sáng thoáng.'
      ];
      for (const v of variants) {
        const res = governance.evaluateContent({ caption: v });
        assert.equal(res.allowed, false, `Brand/handle variation must be rejected: ${v}`);
      }
    });

    it('F3.B6: evaluateContent rejects URLs, Vietnamese phone numbers, and rental price strings', () => {
      const leaky = [
        'Phòng trọ sạch sẽ thoáng mát khu trung tâm. Chi tiết xem tại bit.ly/phongtro123 nhé.',
        'Xem thêm phòng trọ tại https://example.com/phong-dep ngay hôm nay. Phòng rộng rãi.',
        'Ở phòng sạch sẽ yên tĩnh lắm mọi người ơi. Gọi số 0981.753.082 để hỏi thêm nha.',
        'Tìm mãi mới ra phòng cửa sổ lớn giá chỉ 3 triệu mỗi tháng. Tối ngủ mát rượi.',
        'Phòng nhỏ gọn có gác lửng giá 500k tiền dịch vụ trọn gói. Ở rất thoải mái.'
      ];
      for (const sample of leaky) {
        const res = governance.evaluateContent({ caption: sample });
        assert.equal(res.allowed, false, `Expected URL/phone/price rejection for: ${sample}`);
      }
    });

    it('F3.B7: evaluateContent rejects ads, subtle CTAs, and superlative strings', () => {
      const subtle = [
        'Phòng sáng sủa có ban công đón gió rất mát. Bạn nào cần thì inbox ngay kẻo hết.',
        'Không gian yên tĩnh sạch sẽ phù hợp người đi làm. Đặt cọc sớm để giữ phòng nhé.',
        'Ở đây an ninh tốt nhất khu vực rồi đó. Tối về ngủ yên tâm lắm.',
        'Căn phòng sạch sẽ thoáng mát số 1 khu vực này. Chất lượng hoàn hảo nhất thành phố.'
      ];
      for (const sample of subtle) {
        const res = governance.evaluateContent({ caption: sample });
        assert.equal(res.allowed, false, `Expected CTA/superlative rejection for: ${sample}`);
      }
    });

    it('F3.B8: evaluateOmnichannelCaptions fails entire batch when only threads_caption or instagram_caption violates Rule 5', () => {
      assert.equal(typeof governance.evaluateOmnichannelCaptions, 'function', 'evaluateOmnichannelCaptions must be exported');

      const partialBadThreads = {
        facebook_caption: 'Đi làm mệt nhoài chỉ mong về căn phòng sạch sẽ thoáng mát. Ngủ một giấc sâu tới sáng là đủ vui.',
        instagram_caption: 'Cửa sổ đón nắng sớm làm căn phòng nhỏ nhẹ nhàng hơn hẳn. Ở yên bình sau giờ làm.',
        threads_caption: 'Phòng đẹp giá tốt liên hệ ngay nhacualand.com để chốt cọc liền tay.'
      };
      const res1 = governance.evaluateOmnichannelCaptions(partialBadThreads);
      assert.equal(res1.allowed, false);
      assert.equal(res1.results.facebook.allowed, true);
      assert.equal(res1.results.threads.allowed, false);

      const partialBadIg = {
        facebook_caption: 'Đi làm mệt nhoài chỉ mong về căn phòng sạch sẽ thoáng mát. Ngủ một giấc sâu tới sáng là đủ vui.',
        instagram_caption: 'Inbox ngay chốt cọc phòng số 1 hôm nay nhé. Phòng sạch sẽ.',
        threads_caption: 'Cửa sổ đón nắng sớm làm căn phòng nhỏ nhẹ nhàng hơn hẳn. Ở yên bình sau giờ làm.'
      };
      const res2 = governance.evaluateOmnichannelCaptions(partialBadIg);
      assert.equal(res2.allowed, false);
      assert.equal(res2.results.instagram.allowed, false);
    });

    it('F3.B9: evaluateContent enforces Threads 500-codepoint cap, max 2 hashtags, and banned promo hashtags', () => {
      // Body is ~370 chars (<=450 body limit, <=90 words, 2 sentences); 2 long hashtags push total > 500 codepoints
      const bodyUnder450 = 'Đi làm cả ngày mệt nhoài ngoài đường bụi bặm, chiều về tới khu trọ chỉ mong mở cửa thấy căn phòng gọn gàng sạch sẽ và có chiếc cửa sổ đón gió tự nhiên cho nhẹ đầu bớt căng thẳng. Chuyện tiền điện nước rõ ràng từng đồng theo đồng hồ riêng ngay từ ngày đầu dọn vào cũng giúp người đi làm xa quê đỡ phải lo lắng mỗi khi cuối tháng tới gần mà vẫn yên tâm ngủ ngon mỗi tối.';
      const over500Threads = `${bodyUnder450}\n\n#${'a'.repeat(70)} #${'b'.repeat(70)}`;
      const resThreads = governance.evaluateContent({ caption: over500Threads, channel: 'threads' });
      assert.equal(resThreads.allowed, false, 'Threads >500 total codepoints must be rejected');

      const tooManyTags = 'Phòng sạch thoáng dễ chịu sau giờ làm. Ngủ một giấc cho đã đời.\n\n#phongtro #chothuephong #canho';
      assert.equal(governance.evaluateContent({ caption: tooManyTags }).allowed, false, '>2 hashtags must be rejected');

      const promoTag1 = 'Phòng sạch thoáng dễ chịu sau giờ làm. Ngủ một giấc cho đã đời.\n\n#GiamGia';
      const promoTag2 = 'Phòng sạch thoáng dễ chịu sau giờ làm. Ngủ một giấc cho đã đời.\n\n#NhaCuaLand';
      assert.equal(governance.evaluateContent({ caption: promoTag1 }).allowed, false, '#GiamGia must be rejected');
      assert.equal(governance.evaluateContent({ caption: promoTag2 }).allowed, false, '#NhaCuaLand must be rejected');
    });

    it('F3.B10: evaluateContent rejects brand/CTA leakage inside title ([TITLE]) even when caption is compliant', () => {
      const cleanBody = 'Tan làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ thoáng mát là đủ yên lòng.';
      const resBrandTitle = governance.evaluateContent({ caption: cleanBody, title: 'Phòng đẹp tại Nhà Của Land' });
      const resCtaTitle = governance.evaluateContent({ caption: cleanBody, title: 'Liên hệ ngay để chốt cọc' });

      assert.equal(resBrandTitle.allowed, false);
      assert.ok(resBrandTitle.violations.some(v => v.includes('[TITLE]')));
      assert.equal(resCtaTitle.allowed, false);
      assert.ok(resCtaTitle.violations.some(v => v.includes('[TITLE]')));
    });

    it('F3.B11: checkPublishRateLimit enforces MAX_POSTS_PER_PLATFORM_PER_DAY cap using ICT date in isolated historyFile', () => {
      const ws = createTempWorkspace('f3_b11');
      try {
        const now = new Date('2026-11-24T17:30:00.000Z'); // 2026-11-25 00:30 ICT
        const maxPosts = parseInt(process.env.MAX_POSTS_PER_PLATFORM_PER_DAY || '8', 10);
        const entries = [];
        for (let i = 0; i < maxPosts; i++) {
          entries.push({
            timestamp: new Date('2026-11-24T17:05:00.000Z').toISOString(), // same ICT day 2026-11-25
            platform: 'facebook',
            contentType: 'feed'
          });
        }
        entries[entries.length - 1].timestamp = new Date(now.getTime() - 25 * 60 * 1000).toISOString();
        fs.writeFileSync(ws.paths.historyFile, JSON.stringify(entries, null, 2), 'utf8');

        const fbLimit = governance.checkPublishRateLimit('facebook', {
          now,
          historyFile: ws.paths.historyFile
        });
        assert.equal(fbLimit.allowed, false, 'Facebook should be blocked once daily cap is reached in ICT');
        assert.equal(fbLimit.countToday ?? fbLimit.dailyCount, maxPosts);
      } finally {
        ws.cleanup();
      }
    });

    it('F3.B12: checkPublishRateLimit enforces cooldown on same platform without cross-blocking other platforms', () => {
      const ws = createTempWorkspace('f3_b12');
      try {
        const now = new Date('2026-11-24T10:00:00.000Z');
        const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
        fs.writeFileSync(
          ws.paths.historyFile,
          JSON.stringify([{ timestamp: fiveMinsAgo, platform: 'facebook', contentType: 'feed' }], null, 2),
          'utf8'
        );

        const fbCheck = governance.checkPublishRateLimit('facebook', { now, historyFile: ws.paths.historyFile });
        const igCheck = governance.checkPublishRateLimit('instagram', { now, historyFile: ws.paths.historyFile });
        assert.equal(fbCheck.allowed, false, 'Same platform within cooldown must be blocked');
        assert.equal(igCheck.allowed, true, 'Independent platform must NOT be cross-blocked');
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F4 Boundaries: Timezone (Asia/Ho_Chi_Minh) & Content Calendar (5 tests)
  // =========================================================================
  describe('F4 Boundaries: ICT Midnight Crossover & Calendar Edge Cases', () => {
    it('F4.B1: getLocalDateString handles exact UTC-to-ICT midnight crossover (16:59:59Z vs 17:00:00Z)', () => {
      assert.equal(typeof governance.getLocalDateString, 'function', 'getLocalDateString must be exported');

      const beforeMidnightIct = new Date('2026-11-24T16:59:59.000Z'); // 23:59:59 ICT on Nov 24
      const exactMidnightIct = new Date('2026-11-24T17:00:00.000Z');  // 00:00:00 ICT on Nov 25
      assert.equal(governance.getLocalDateString(beforeMidnightIct, 'Asia/Ho_Chi_Minh'), '2026-11-24');
      assert.equal(governance.getLocalDateString(exactMidnightIct, 'Asia/Ho_Chi_Minh'), '2026-11-25');
    });

    it('F4.B2: getLocalDateString handles late-night UTC 23:30:00Z -> next calendar day in ICT', () => {
      assert.equal(typeof governance.getLocalDateString, 'function', 'getLocalDateString must be exported');

      const lateUtc = new Date('2026-12-31T23:30:00.000Z'); // 06:30 ICT on 2027-01-01
      assert.equal(governance.getLocalDateString(lateUtc, 'Asia/Ho_Chi_Minh'), '2027-01-01');
    });

    it('F4.B3: pickTodaySlot skips expired past-date slots in isolated DATA_DIR calendar without touching production calendar', async () => {
      const todayIct = getIctDateString();
      const expiredCal = createSeededCalendar('2020-01-01');
      const todayCal = createSeededCalendar(todayIct);
      const ws = createTempWorkspace('f4_b3', {
        seedCalendar: {
          ...todayCal,
          plan: [...expiredCal.plan, ...todayCal.plan],
          total_slots: expiredCal.plan.length + todayCal.plan.length
        }
      });
      try {
        // Test content-planner directly with isolated calendarPath
        const plannerSlot = contentPlanner.pickTodaySlot({ calendarPath: ws.paths.calendarFile });
        assert.ok(plannerSlot && plannerSlot.date >= todayIct, `content-planner returned expired slot: ${JSON.stringify(plannerSlot)}`);

        // Test company_orchestrator.pickTodaySlot(null) honoring DATA_DIR
        const out = await runNodeSnippetSafe(`
          const { pickTodaySlot } = require('./scripts/company_orchestrator');
          console.log(JSON.stringify(pickTodaySlot(null)));
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const slot = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(slot && slot.date >= todayIct, `company_orchestrator.pickTodaySlot returned expired slot: ${JSON.stringify(slot)}`);
      } finally {
        ws.cleanup();
      }
    });

    it('F4.B4: getLocalDateString and pickTodaySlot throw TypeError on invalid date or null now', () => {
      assert.throws(() => governance.getLocalDateString(null), TypeError);
      assert.throws(() => governance.getLocalDateString('not-a-date'), TypeError);
      assert.throws(() => contentPlanner.getLocalDateString(null), TypeError);
      assert.throws(() => contentPlanner.pickTodaySlot({ now: null }), TypeError);
      assert.throws(() => contentPlanner.pickTodaySlot({ now: 'invalid-date' }), TypeError);
    });

    it('F4.B5: pickTodaySlot rolls to tomorrow 08:30 when all today slots are PUBLISHED, and expirePastSlots preserves PUBLISHED', () => {
      const todayStr = '2026-11-25';
      const now = new Date('2026-11-25T05:00:00.000Z'); // 12:00 ICT 2026-11-25
      const pastSlots = contentPlanner.generateSlotsForDate('2026-11-24', 0, 0);
      pastSlots[0].status = 'PUBLISHED'; // must remain PUBLISHED
      // pastSlots[1], pastSlots[2] remain SCHEDULED -> must become EXPIRED

      const todaySlots = contentPlanner.generateSlotsForDate(todayStr, 3, 1).map(s => ({ ...s, status: 'PUBLISHED' }));
      const plan = [...pastSlots, ...todaySlots];

      contentPlanner.expirePastSlots(plan, todayStr);
      assert.equal(plan[0].status, 'PUBLISHED', 'Past PUBLISHED slot must be preserved');
      assert.equal(plan[1].status, 'EXPIRED', 'Past SCHEDULED slot must be marked EXPIRED');
      assert.equal(plan[2].status, 'EXPIRED', 'Past SCHEDULED slot must be marked EXPIRED');

      const nextSlot = contentPlanner.pickTodaySlot({ plan, now, autoExtend: true });
      assert.ok(nextSlot);
      assert.equal(nextSlot.date, '2026-11-26');
      assert.equal(nextSlot.slot_time, '08:30');
    });
  });

  // =========================================================================
  // F5 Boundaries: Singleton Process Lock Hardening (7 tests)
  // =========================================================================
  describe('F5 Boundaries: Singleton Process Lock Edge Cases', () => {
    it('F5.B1: acquireProcessLock recovers from corrupt non-JSON lock file', () => {
      const ws = createTempWorkspace('f5_b1');
      try {
        fs.writeFileSync(ws.paths.lockFile, '{corrupt_json_not_valid', 'utf8');
        const lock = processLock.acquireProcessLock({ lockFile: ws.paths.lockFile });
        assert.equal(lock.acquired, true);
        lock.release();
      } finally {
        ws.cleanup();
      }
    });

    it('F5.B2: acquireProcessLock recovers stale lock older than 30 minutes (31 min old)', async () => {
      const ws = createTempWorkspace('f5_b2');
      let holder = null;
      try {
        holder = await spawnHoldLockChild(ws.paths.lockFile);
        const thirtyOneMinsAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
        fs.writeFileSync(
          ws.paths.lockFile,
          JSON.stringify({ pid: holder.info.pid, startedAt: thirtyOneMinsAgo }, null, 2),
          'utf8'
        );

        const lock = processLock.acquireProcessLock({ lockFile: ws.paths.lockFile });
        assert.equal(lock.acquired, true, 'Lock older than default 30m must be recovered as stale');
        lock.release();
      } finally {
        await killChildAsync(holder?.child);
        ws.cleanup();
      }
    });

    it('F5.B3: acquireProcessLock blocks on fresh 1-minute-old lock held by live PID', async () => {
      const ws = createTempWorkspace('f5_b3');
      let holder = null;
      try {
        holder = await spawnHoldLockChild(ws.paths.lockFile);
        const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
        fs.writeFileSync(
          ws.paths.lockFile,
          JSON.stringify({ pid: holder.info.pid, startedAt: oneMinAgo }, null, 2),
          'utf8'
        );

        const attempt = processLock.acquireProcessLock({ lockFile: ws.paths.lockFile });
        assert.equal(attempt.acquired, false);
        assert.equal(attempt.holderPid, holder.info.pid);
      } finally {
        await killChildAsync(holder?.child);
        ws.cleanup();
      }
    });

    it('F5.B4: Failed acquireProcessLock returns a safe no-op release() that preserves holder lock', async () => {
      const ws = createTempWorkspace('f5_b4');
      let holder = null;
      try {
        holder = await spawnHoldLockChild(ws.paths.lockFile);
        const attempt = processLock.acquireProcessLock({ lockFile: ws.paths.lockFile });
        assert.equal(attempt.acquired, false);
        assert.equal(typeof attempt.release, 'function', 'Failed lock acquisition must still provide a safe no-op release()');
        attempt.release();
        assert.equal(fs.existsSync(ws.paths.lockFile), true, 'No-op release() must NOT delete another process lock');
      } finally {
        await killChildAsync(holder?.child);
        ws.cleanup();
      }
    });

    it('F5.B5: Rapid release() followed by immediate re-acquire succeeds cleanly', () => {
      const ws = createTempWorkspace('f5_b5');
      try {
        for (let i = 0; i < 5; i++) {
          const lock = processLock.acquireProcessLock({ lockFile: ws.paths.lockFile });
          assert.equal(lock.acquired, true, `Iteration ${i} should acquire lock`);
          lock.release();
          assert.equal(fs.existsSync(ws.paths.lockFile), false);
        }
      } finally {
        ws.cleanup();
      }
    });

    it('F5.B6: publish_now.js --dry-run detects active lock contention and exits cleanly without removing holder lock', async () => {
      const ws = createTempWorkspace('f5_b6');
      let holder = null;
      try {
        holder = await spawnHoldLockChild(ws.paths.lockFile);
        const cliRes = await runNodeCliSafe('scripts/publish_now.js', [
          '--dry-run',
          '--platform', 'all',
          '--message', 'Phòng sạch thoáng dễ chịu. Tối về ngủ ngon.'
        ], { tempDir: ws.tempDir });

        assert.equal(fs.existsSync(ws.paths.lockFile), true, 'Contended publish_now.js must NOT remove holder lock');
        const lockData = JSON.parse(fs.readFileSync(ws.paths.lockFile, 'utf8'));
        assert.equal(lockData.pid, holder.info.pid, 'Holder PID must remain untouched');
        const stagedFiles = fs.readdirSync(ws.paths.outputs).filter(f => f.endsWith('.json'));
        assert.equal(stagedFiles.length, 0, 'Contended publish_now.js must NOT invoke publishDirect or write staging report');
        assert.equal(
          cliRes.stdout.includes('"blockedByBrandAssetGuard"') || cliRes.stdout.includes('"DRY_RUN_MOCK"'),
          false,
          'Contended publish_now.js must exit before publishDirect instead of running dry-run publish'
        );
        const combinedOut = `${cliRes.stdout}\n${cliRes.stderr}`;
        assert.match(
          combinedOut,
          new RegExp(`PID\\s*[:#]?\\s*${holder.info.pid}|đang chạy|bỏ qua|LOCK_HELD|orchestrator\\.lock`, 'i'),
          'Contended publish_now.js must report active lock contention'
        );
      } finally {
        await killChildAsync(holder?.child);
        ws.cleanup();
      }
    });

    it('F5.B7: acquireProcessLock throws TypeError when maxAgeMs is 0, negative, or NaN', () => {
      const ws = createTempWorkspace('f5_b7');
      try {
        for (const badAge of [0, -1, NaN, Infinity]) {
          assert.throws(
            () => processLock.acquireProcessLock({ lockFile: ws.paths.lockFile, maxAgeMs: badAge }),
            TypeError,
            `Expected TypeError for maxAgeMs=${badAge}`
          );
        }
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F6 Boundaries: Autonomous Internet Research Agent (5 tests)
  // =========================================================================
  describe('F6 Boundaries: Research Agent Resilience & Offline Isolation', () => {
    it('F6.B1: conductResearch falls back cleanly when GEMINI_API_KEY is missing/blank', async () => {
      const ws = createTempWorkspace('f6_b1');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js must exist');

        const out = await runNodeSnippetSafe(`
          const ra = require('./services/research_agent');
          (async () => {
            const brief = await ra.conductResearch({
              topic: 'Kinh nghiệm xem phòng tránh ẩm mốc',
              pillar: 'P4_PHONG_TRO_REAL_ADVICE',
              offline: false,
              dryRun: true
            });
            console.log(JSON.stringify(brief));
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: '' } });

        assert.equal(out.status, 0, out.stderr);
        const brief = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(['cached_knowledge', 'offline_seed'].includes(brief.sourceMode));
        assert.ok(Array.isArray(brief.insights) && brief.insights.length > 0);
      } finally {
        ws.cleanup();
      }
    });

    it('F6.B2: conductResearch handles empty or whitespace-only topic cleanly without crashing', async () => {
      const ws = createTempWorkspace('f6_b2');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js must exist');

        const out = await runNodeSnippetSafe(`
          const ra = require('./services/research_agent');
          (async () => {
            const brief = await ra.conductResearch({ topic: '   ', offline: true, dryRun: true });
            console.log(JSON.stringify(brief));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const brief = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(brief.briefId);
        assert.ok(Array.isArray(brief.painPoints) && brief.painPoints.length > 0);
      } finally {
        ws.cleanup();
      }
    });

    it('F6.B3: HTTP 500 on nhacualand.com loopback endpoint falls back gracefully to offline_seed without crashing', async () => {
      const ws = createTempWorkspace('f6_b3');
      let server = null;
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js must exist');
        server = await startLoopbackServer((_req, res) => {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        });

        const out = await runNodeSnippetSafe(`
          const ra = require('./services/research_agent');
          (async () => {
            const brief = await ra.conductResearch({
              topic: 'Phòng sáng thoáng tránh ẩm mốc',
              pillar: 'P1_STUDIO_LIGHT_LIVING',
              siteUrl: ${JSON.stringify(server.url)},
              offline: false,
              dryRun: true
            });
            console.log(JSON.stringify(brief));
          })();
        `, {
          tempDir: ws.tempDir,
          extraEnv: { BRAND_WEBSITE: server.url, NHACUALAND_URL: server.url, GEMINI_API_KEY: '' }
        });

        assert.equal(out.status, 0, out.stderr);
        const brief = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(brief.sourceMode, 'offline_seed');
        assert.ok(Array.isArray(brief.insights) && brief.insights.length > 0);
      } finally {
        if (server) await server.close();
        ws.cleanup();
      }
    });

    it('F6.B4: Corrupt non-JSON file in DATA_DIR/knowledge/ is ignored safely without crashing conductResearch', async () => {
      const ws = createTempWorkspace('f6_b4');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js must exist');
        const todayIct = getIctDateString();
        fs.writeFileSync(path.join(ws.paths.knowledge, `research_${todayIct}_corrupt.json`), '{not-valid-json', 'utf8');

        const out = await runNodeSnippetSafe(`
          const ra = require('./services/research_agent');
          (async () => {
            const brief = await ra.conductResearch({
              topic: 'Kinh nghiệm thuê phòng',
              pillar: 'P4_PHONG_TRO_REAL_ADVICE',
              offline: true,
              dryRun: true
            });
            console.log(JSON.stringify(brief));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const brief = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(brief.briefId);
        assertDataDirHonored(brief.filePath, ws.paths.knowledge, 'F6.B4 brief.filePath');
        assert.equal(fs.existsSync(brief.filePath), true, 'F6.B4 brief.filePath must exist');
        assert.ok(Array.isArray(brief.insights) && brief.insights.length > 0, 'F6.B4 brief.insights must be non-empty');
        assert.ok(Array.isArray(brief.painPoints) && brief.painPoints.length > 0, 'F6.B4 brief.painPoints must be non-empty');
      } finally {
        ws.cleanup();
      }
    });

    it('F6.B5: conductResearch({ offline: true }) performs zero outbound HTTP requests (loopback hit count = 0)', async () => {
      const ws = createTempWorkspace('f6_b5');
      let server = null;
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/research_agent.js')), true, 'services/research_agent.js must exist');
        let hitCount = 0;
        server = await startLoopbackServer((_req, res) => {
          hitCount++;
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body>studio</body></html>');
        });

        const out = await runNodeSnippetSafe(`
          const ra = require('./services/research_agent');
          (async () => {
            const brief = await ra.conductResearch({
              topic: 'Kiểm tra chế độ offline tuyệt đối',
              siteUrl: ${JSON.stringify(server.url)},
              offline: true,
              dryRun: true
            });
            console.log(JSON.stringify(brief));
          })();
        `, {
          tempDir: ws.tempDir,
          extraEnv: { BRAND_WEBSITE: server.url, NHACUALAND_URL: server.url }
        });

        assert.equal(out.status, 0, out.stderr);
        assert.equal(hitCount, 0, `offline: true must perform 0 HTTP requests, observed ${hitCount}`);
      } finally {
        if (server) await server.close();
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F7 Boundaries: Multi-Agent Sequential Roundtable & Work Orders (5 tests)
  // =========================================================================
  describe('F7 Boundaries: Roundtable & Work Order Edge Cases', () => {
    it('F7.B1: runMultiAgentRoundtable handles null researchBrief gracefully', async () => {
      const ws = createTempWorkspace('f7_b1');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/agent_council.js')), true, 'services/agent_council.js must exist');

        const out = await runNodeSnippetSafe(`
          const council = require('./services/agent_council');
          (async () => {
            const res = await council.runMultiAgentRoundtable({
              slot: { slot_id: 'slot_null_brief', slot_time: '19:45', format: 'OMNICHANNEL_POST', concept_hook: 'Phòng yên tĩnh tối về ngủ ngon' },
              researchBrief: null,
              dryRun: true
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(res.meetingId);
        assert.equal(res.phases.length, 6);
      } finally {
        ws.cleanup();
      }
    });

    it('F7.B2: runMultiAgentRoundtable handles empty/minimal slot ({}) gracefully without crashing', async () => {
      const ws = createTempWorkspace('f7_b2');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/agent_council.js')), true, 'services/agent_council.js must exist');

        const out = await runNodeSnippetSafe(`
          const council = require('./services/agent_council');
          (async () => {
            const res = await council.runMultiAgentRoundtable({
              slot: {},
              researchBrief: null,
              dryRun: true
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(res.meetingId);
        assert.equal(res.phases.length, 6);
        assert.ok(res.consensus && res.consensus.angle);
      } finally {
        ws.cleanup();
      }
    });

    it('F7.B3: Rule5Critic phase catches/remediates when mocked Copywriter LLM draft violates Rule 5', async () => {
      const ws = createTempWorkspace('f7_b3');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/agent_council.js')), true, 'services/agent_council.js must exist');
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
                          title: 'Phòng số 1 tại Nhà Của Land',
                          hook: 'Chốt cọc ngay!',
                          body: 'Liên hệ nhacualand.com ngay.',
                          facebook_caption: 'Phòng đẹp số 1 tại nhacualand.com! Inbox ngay chốt cọc!',
                          instagram_caption: 'Gọi 0981753082 ngay.',
                          threads_caption: 'Phòng giá 3 triệu tại Nhà Của Land.',
                          visual_prompt: 'Bright studio interior'
                        })
                      };
                    }
                    return {
                      output_text: JSON.stringify({
                        title: 'Phòng sáng thoáng',
                        hook: 'Cửa sổ đón nắng mai.',
                        body: 'Đi làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ thoáng mát là thấy bình yên rồi.',
                        facebook_caption: 'Đi làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ thoáng mát là thấy bình yên rồi.',
                        instagram_caption: 'Ánh nắng sáng qua khung cửa sổ nhỏ làm căn phòng dễ chịu hơn hẳn. Tối về ngủ ngon giấc.',
                        threads_caption: 'Thuê phòng chỉ mong sạch sẽ và điện nước rõ ràng từng đồng. Vậy là đủ nhẹ đầu.',
                        call_to_action: '',
                        hashtags: ['#phongtro', '#chothuephong'],
                        visual_prompt: 'Bright clean Vietnamese rental studio room with sunlight'
                      })
                    };
                  }
                };
              }
            },
            __getCalls: () => calls
          };
        }`;

        const out = await runNodeSnippetWithMockGenAi(mockFactory, `
          const genaiMock = require('@google/genai');
          const council = require('./services/agent_council');
          (async () => {
            const res = await council.runMultiAgentRoundtable({
              slot: { slot_id: 's_critic', slot_time: '08:30', format: 'OMNICHANNEL_POST', concept_hook: 'Phòng sáng thoáng' },
              researchBrief: { briefId: 'b_critic', insights: ['Ánh sáng tự nhiên'], painPoints: ['Phòng tối'], renterTips: [], domainFacts: [] },
              dryRun: true
            });
            console.log(JSON.stringify({ res, mockCalls: genaiMock.__getCalls() }));
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: 'mock-key' } });

        assert.equal(out.status, 0, out.stderr);
        const { res, mockCalls } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assertDataDirHonored(res.meetingFile, ws.paths.meetings, 'F7.B3 meetingFile');
        assert.equal(fs.existsSync(res.meetingFile), true, 'F7.B3 meetingFile must exist');
        const meetingData = JSON.parse(fs.readFileSync(res.meetingFile, 'utf8'));
        const criticPhase = res.phases.find(p => p.role === 'Rule5Critic');
        assert.ok(criticPhase && criticPhase.decision, 'Rule5Critic phase must record its decision');
        assert.notEqual(criticPhase.passed, false, 'Rule5Critic phase must remediate/pass final result');
        assert.equal(
          /chốt cọc|0981753082|nhacualand\.com|số 1/i.test(JSON.stringify(res.consensus)),
          false,
          'Roundtable consensus must not leak Rule-5-violating draft 1 terms'
        );
        const finalCopy = res.post || res.copy || res.draft || res.workOrder?.generated || meetingData.post || meetingData.copy || meetingData.workOrder?.generated;
        if (finalCopy) {
          const govCheck = governance.evaluateOmnichannelCaptions(finalCopy);
          assert.equal(govCheck.allowed, true, `F7.B3 final copy must pass Rule 5: ${JSON.stringify(govCheck.violations)}`);
          assert.equal(
            /nhacualand|nhà cửa land|0981753082|chốt cọc|số 1|3 triệu/i.test(JSON.stringify(finalCopy)),
            false,
            'F7.B3 final copy must not retain draft-1 Rule 5 violations'
          );
        } else {
          assert.ok(res.consensus && res.consensus.angle, 'Roundtable consensus.angle required');
          const angleCheck = governance.evaluateContent({ caption: `${res.consensus.angle}. Tối về ngủ ngon.` });
          assert.equal(angleCheck.allowed, true, `F7.B3 consensus.angle failed Rule 5: ${JSON.stringify(angleCheck.violations)}`);
          if (mockCalls > 0) {
            assert.ok(mockCalls >= 2, `Expected Rule5Critic retry when LLM invoked, got ${mockCalls} call(s)`);
          }
        }
      } finally {
        ws.cleanup();
      }
    });

    it('F7.B4: work-order-gateway.createOrder returns BLOCKED_BY_POLICY when facebook_caption or instagram_caption violates Rule 5', async () => {
      const ws = createTempWorkspace('f7_b4');
      try {
        const out = await runNodeSnippetSafe(`
          const aiPipeline = require('./services/ai_pipeline');
          aiPipeline.generatePost = async () => ({
            title: 'Góc phòng',
            facebook_caption: 'Phòng sạch sẽ thoáng mát dễ ngủ lắm. Tối về nghỉ ngơi thoải mái.',
            instagram_caption: 'Inbox ngay nhacualand.com để chốt cọc giữ phòng số 1!',
            threads_caption: 'Cửa sổ đón nắng sáng dịu nhẹ. Ngủ một giấc sâu tới sáng.',
            call_to_action: ''
          });
          const gateway = require('./services/work-order-gateway');
          (async () => {
            const order = await gateway.createOrder({ topic: 'Test gateway omnichannel Rule 5 block' });
            console.log(JSON.stringify(order));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const order = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(order.status, 'BLOCKED_BY_POLICY');
        assert.equal(order.compliance.allowed, false);
      } finally {
        ws.cleanup();
      }
    });

    it('F7.B5: work-order-gateway.createOrder handles empty topic and REELS format safely without crashing', async () => {
      const ws = createTempWorkspace('f7_b5');
      try {
        const out = await runNodeSnippetSafe(`
          const gateway = require('./services/work-order-gateway');
          (async () => {
            const order = await gateway.createOrder({ topic: '', format: 'REELS_CINEMATIC_ROOM_TOUR' });
            console.log(JSON.stringify(order));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const order = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(order.id);
        assert.equal(order.human_approval_required, false);
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F8 Boundaries: AI Copywriting, Retry & Rule-5 Fallbacks (5 tests)
  // =========================================================================
  describe('F8 Boundaries: Copywriting Malformed Output & Retry Exhaustion', () => {
    it('F8.B1: ai_pipeline.generateVideoScript emits zero brand names and empty call_to_action', async () => {
      const ws = createTempWorkspace('f8_b1');
      try {
        const out = await runNodeSnippetSafe(`
          const { generateVideoScript } = require('./services/ai_pipeline');
          (async () => {
            const script = await generateVideoScript({
              concept: 'Bước vào căn phòng sáng sủa sau giờ tan làm',
              durationSeconds: 15
            });
            console.log(JSON.stringify(script));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const script = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        const serialized = JSON.stringify(script).toLowerCase();
        assert.equal(/nhacualand|nhà cửa land|nhà của land|0981/.test(serialized), false, `Video script leaked brand/phone: ${serialized}`);
        assert.equal(String(script.call_to_action || '').trim(), '', 'call_to_action must be empty under Rule 5');

        const aiPipelineSrc = fs.readFileSync(path.join(WORKSPACE_ROOT, 'services/ai_pipeline.js'), 'utf8');
        assert.equal(/Truy cập nhacualand\.com/i.test(aiPipelineSrc), false, 'ai_pipeline.js still contains hardcoded CTA "Truy cập nhacualand.com"');
      } finally {
        ws.cleanup();
      }
    });

    it('F8.B2: ai_pipeline.generatePost handles malformed non-JSON and empty output_text from mocked LLM cleanly', async () => {
      const ws = createTempWorkspace('f8_b2');
      try {
        for (const badPayload of ['not valid json at all', '']) {
          const mockFactory = `() => ({
            GoogleGenAI: class {
              constructor() {
                this.interactions = {
                  create: async () => ({ output_text: ${JSON.stringify(badPayload)} })
                };
              }
            }
          })`;

          const out = await runNodeSnippetWithMockGenAi(mockFactory, `
            const { generatePost } = require('./services/ai_pipeline');
            const { evaluateOmnichannelCaptions } = require('./lib/governance');
            (async () => {
              const post = await generatePost({ topic: 'Phòng sáng thoáng sạch sẽ', pillar: 'P1_STUDIO_LIGHT_LIVING' });
              const gov = evaluateOmnichannelCaptions(post);
              console.log(JSON.stringify({ post, gov }));
              process.exit(0);
            })();
          `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: 'mock-key' } });

          assert.equal(out.status, 0, out.stderr);
          const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
          assert.equal(res.gov.allowed, true, `Fallback after malformed LLM output must pass Rule 5`);
        }
      } finally {
        ws.cleanup();
      }
    });

    it('F8.B3: ai_pipeline.generatePost falls back to Rule-5-compliant local copy when all LLM retries fail Rule 5', async () => {
      const ws = createTempWorkspace('f8_b3');
      try {
        const mockFactory = `() => ({
          GoogleGenAI: class {
            constructor() {
              this.interactions = {
                create: async () => ({
                  output_text: JSON.stringify({
                    title: 'Nhà Của Land số 1',
                    hook: 'Chốt cọc ngay!',
                    body: 'Liên hệ nhacualand.com hotline 0981753082.',
                    facebook_caption: 'Phòng đẹp số 1 tại nhacualand.com! Gọi 0981753082 chốt cọc ngay!',
                    instagram_caption: 'Inbox ngay nhacualand.com!',
                    threads_caption: 'Giá chỉ 3 triệu tại Nhà Của Land!',
                    visual_prompt: 'Bright studio room'
                  })
                })
              };
            }
          }
        })`;

        const out = await runNodeSnippetWithMockGenAi(mockFactory, `
          const { generatePost } = require('./services/ai_pipeline');
          const { evaluateOmnichannelCaptions } = require('./lib/governance');
          (async () => {
            const post = await generatePost({ topic: 'Tan làm về phòng nghỉ ngơi', pillar: 'P3_CCM_QUIET_SECURITY' });
            const gov = evaluateOmnichannelCaptions(post);
            console.log(JSON.stringify({ post, gov }));
            process.exit(0);
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: 'mock-key' } });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.gov.allowed, true, `Post after retry exhaustion must fall back to Rule-5-clean copy, violations: ${JSON.stringify(res.gov.violations)}`);
      } finally {
        ws.cleanup();
      }
    });

    it('F8.B4: PromptArchitect.isLegacyPlaceholder detects and replaces legacy prompt strings', () => {
      const promptArchitect = require('../../services/prompt_architect');
      assert.equal(promptArchitect.isLegacyPlaceholder('Detailed English architectural interior photography prompt'), true);
      assert.equal(promptArchitect.isLegacyPlaceholder('short'), true);

      const built = promptArchitect.buildArchitecturalPrompt({
        prompt: 'Detailed English architectural interior photography prompt',
        topic: 'góc bếp nhỏ nấu ăn sạch sẽ',
        aspectRatio: '3:4'
      });
      assert.ok(built.prompt.length > 80);
      assert.equal(built.archetypeId, 'chef_compact_kitchen');
    });

    it('F8.B5: PromptArchitect handles corrupt or missing DATA_DIR/publish_history.json safely without touching production data', async () => {
      const ws = createTempWorkspace('f8_b5');
      try {
        fs.writeFileSync(ws.paths.historyFile, '{bad-json', 'utf8');
        const out1 = await runNodeSnippetSafe(`
          const promptArchitect = require('./services/prompt_architect');
          const arch = promptArchitect.selectDiverseArchetype({ topic: 'phòng thuê' });
          console.log(JSON.stringify({ id: arch.id }));
        `, { tempDir: ws.tempDir });
        assert.equal(out1.status, 0, out1.stderr);
        assert.ok(JSON.parse(out1.stdout.trim().split(/\r?\n/).pop()).id);

        fs.unlinkSync(ws.paths.historyFile);
        const out2 = await runNodeSnippetSafe(`
          const promptArchitect = require('./services/prompt_architect');
          const arch = promptArchitect.selectDiverseArchetype({ topic: 'phòng thuê' });
          console.log(JSON.stringify({ id: arch.id }));
        `, { tempDir: ws.tempDir });
        assert.equal(out2.status, 0, out2.stderr);
        assert.ok(JSON.parse(out2.stdout.trim().split(/\r?\n/).pop()).id);
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F9 Boundaries: Credibility & Non-Caption Conversion Hygiene (5 tests)
  // =========================================================================
  describe('F9 Boundaries: Offer Leak Rejection & Legacy Script Hygiene', () => {
    it('F9.B1: evaluateContent rejects every offer title and code from config/offer_catalog.json if leaked into captions', () => {
      const catalog = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'config/offer_catalog.json'), 'utf8'));
      for (const offer of catalog.active_offers) {
        const leakSamples = [
          `Phòng sạch sẽ thoáng mát. Dùng mã ${offer.code} ngay hôm nay nhé.`,
          `Phòng đẹp gọn gàng dễ ở. ${offer.title}.`
        ];
        for (const sample of leakSamples) {
          const check = governance.evaluateContent({ caption: sample });
          assert.equal(
            check.allowed,
            false,
            `Offer leak from ${offer.offer_id} MUST be rejected by Rule 5: ${sample}`
          );
        }
      }
      assert.equal(governance.evaluateContent({ caption: 'Phòng sạch sẽ thoáng mát. Đặt cọc giữ phòng để nhận voucher giảm 200.000đ nhé.' }).allowed, false);
    });

    it('F9.B2: scripts/run_image_agent.js has zero hardcoded nhacualand.com, hotline 0981, or #NhaCuaLand caption defaults', () => {
      const src = fs.readFileSync(path.join(WORKSPACE_ROOT, 'scripts/run_image_agent.js'), 'utf8');
      assert.equal(/https?:\/\/nhacualand\.com/i.test(src), false, 'run_image_agent.js must not inject https://nhacualand.com in caption');
      assert.equal(/0981\s*753\s*082/.test(src), false, 'run_image_agent.js must not inject hotline 0981 753 082');
      assert.equal(/#NhaCuaLand/i.test(src), false, 'run_image_agent.js must not inject #NhaCuaLand');
      assert.equal(/Nhà Của Land/.test(src.replace(/\/\*\*[\s\S]*?\*\//g, '')), false, 'run_image_agent.js code must not inject "Nhà Của Land" in prompts/captions');
    });

    it('F9.B3: scripts/run_google_flow_agent.js has zero hardcoded nhacualand.com, hotline 0981, or #NhaCuaLand caption/hook defaults', () => {
      const src = fs.readFileSync(path.join(WORKSPACE_ROOT, 'scripts/run_google_flow_agent.js'), 'utf8');
      assert.equal(/https?:\/\/nhacualand\.com|nhacualand\.com/i.test(src.replace(/\/\*\*[\s\S]*?\*\//g, '')), false, 'run_google_flow_agent.js must not inject nhacualand.com');
      assert.equal(/0981\s*753\s*082/.test(src), false, 'run_google_flow_agent.js must not inject hotline 0981 753 082');
      assert.equal(/#NhaCuaLand/i.test(src), false, 'run_google_flow_agent.js must not inject #NhaCuaLand');
      assert.equal(/Nhà Của Land/.test(src.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/console\.log\([^)]*\)/g, '')), false, 'run_google_flow_agent.js must not inject "Nhà Của Land" in prompts/hooks');
    });

    it('F9.B4: services/video-engine.js default callToAction is empty and free of nhacualand.com', async () => {
      const ws = createTempWorkspace('f9_b4');
      try {
        const out = await runNodeSnippetSafe(`
          const videoEngine = require('./services/video-engine');
          (async () => {
            const res = await videoEngine.renderReel({
              title: 'Góc phòng sáng thoáng',
              hook: 'Nắng sớm dịu nhẹ',
              duration: 3,
              aspectRatio: '9:16',
              dryRun: true
            });
            console.log(JSON.stringify({ call_to_action: res.call_to_action }));
          })();
        `, { tempDir: ws.tempDir });
        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(String(res.call_to_action || '').trim(), '', 'VideoEngine default call_to_action must be empty');
      } finally {
        ws.cleanup();
      }
    });

    it('F9.B5: services/google_flow_agent.js renderFallbackCinematic burns no nhacualand.com drawtext watermark', () => {
      const src = fs.readFileSync(path.join(WORKSPACE_ROOT, 'services/google_flow_agent.js'), 'utf8');
      const fnStart = src.indexOf('renderFallbackCinematic(');
      assert.ok(fnStart !== -1, 'renderFallbackCinematic must exist');
      const fnSlice = src.slice(fnStart);
      assert.equal(/nhacualand\.com/i.test(fnSlice), false, 'renderFallbackCinematic must not burn nhacualand.com watermark');
    });
  });

  // =========================================================================
  // F10 Boundaries: AI Image Studio API & Clean Fallback (5 tests)
  // =========================================================================
  describe('F10 Boundaries: Image Engine Error & Fallback Resilience', () => {
    it('F10.B1: ImageEngine falls back cleanly offline with blank GEMINI_API_KEY and GOOGLE_FLOW_ENABLED=false', async () => {
      const ws = createTempWorkspace('f10_b1');
      try {
        const out = await runNodeSnippetSafe(`
          const imageEngine = require('./services/image_engine');
          (async () => {
            const img = await imageEngine.generateImage({
              prompt: 'Bright clean studio room',
              mode: 'AUTO',
              dryRun: true
            });
            console.log(JSON.stringify(img));
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: '', GOOGLE_FLOW_ENABLED: 'false' } });

        assert.equal(out.status, 0, out.stderr);
        const img = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(img.success, true);
        assertDataDirHonored(img.filePath || img.file_path, ws.tempDir, 'offline fallback image');
      } finally {
        ws.cleanup();
      }
    });

    it('F10.B2: ImageEngine({ mode: "FLOW_WEB", dryRun: false }) with GOOGLE_FLOW_ENABLED=false fails cleanly without launching browser', async () => {
      const ws = createTempWorkspace('f10_b2');
      try {
        const out = await runNodeSnippetSafe(`
          const imageEngine = require('./services/image_engine');
          (async () => {
            try {
              const res = await imageEngine.generateImage({
                prompt: 'Studio apartment room',
                mode: 'FLOW_WEB',
                dryRun: false
              });
              console.log(JSON.stringify({ threw: false, res }));
            } catch (err) {
              console.log(JSON.stringify({ threw: true, error: err.message }));
            }
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GOOGLE_FLOW_ENABLED: 'false', GEMINI_API_KEY: '' } });

        assert.equal(out.status, 0, out.stderr);
        const parsed = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.ok(parsed.threw === true || (parsed.res && parsed.res.success === false), 'FLOW_WEB with GOOGLE_FLOW_ENABLED=false must fail cleanly without falling back to browser');
      } finally {
        ws.cleanup();
      }
    });

    it('F10.B3: Corrupt/invalid API base64 from mocked @google/genai triggers clean fallback without writing broken image', async () => {
      const ws = createTempWorkspace('f10_b3');
      try {
        const mockFactory = `() => ({
          GoogleGenAI: class {
            constructor() {
              this.interactions = {
                create: async () => ({ output_image: { data: 'not_valid_png_base64!!!' } })
              };
            }
          }
        })`;

        const out = await runNodeSnippetWithMockGenAi(mockFactory, `
          const imageEngine = require('./services/image_engine');
          (async () => {
            const res = await imageEngine.generateImage({
              prompt: 'Minimalist rental room',
              aspectRatio: '3:4',
              mode: 'AUTO'
            });
            console.log(JSON.stringify(res));
            process.exit(0);
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: 'mock-key', GOOGLE_FLOW_ENABLED: 'false' }, timeoutMs: 60000 });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        const filePath = res.filePath || res.file_path;
        assert.equal(res.success, true);
        assertDataDirHonored(filePath, ws.paths.images, 'F10.B3 fallback image filePath');
        assert.equal(fs.existsSync(filePath), true);
        const header = fs.readFileSync(filePath).subarray(0, 8);
        assert.deepEqual([...header], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'Fallback PNG must have valid PNG magic bytes');
      } finally {
        ws.cleanup();
      }
    });

    it('F10.B4: ImageEngine.extractBase64FromInteraction handles null, undefined, empty object, and empty steps', () => {
      const imageEngine = require('../../services/image_engine');
      assert.equal(imageEngine.extractBase64FromInteraction(null), null);
      assert.equal(imageEngine.extractBase64FromInteraction(undefined), null);
      assert.equal(imageEngine.extractBase64FromInteraction({}), null);
      assert.equal(imageEngine.extractBase64FromInteraction({ steps: [] }), null);
      assert.equal(imageEngine.extractBase64FromInteraction({ steps: [{ type: 'model_output', content: [] }] }), null);
    });

    it('F10.B5: Mocked @google/genai error falls back cleanly inside DATA_DIR', async () => {
      const ws = createTempWorkspace('f10_b5');
      try {
        const mockFactory = `() => ({
          GoogleGenAI: class {
            constructor() {
              this.interactions = {
                create: async () => { throw new Error('Simulated 503 API unavailable'); }
              };
            }
          }
        })`;

        const out = await runNodeSnippetWithMockGenAi(mockFactory, `
          const imageEngine = require('./services/image_engine');
          (async () => {
            const res = await imageEngine.generateImage({
              prompt: 'Sunlit clean room interior',
              aspectRatio: '3:4',
              mode: 'AUTO'
            });
            console.log(JSON.stringify(res));
            process.exit(0);
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: 'mock-key', GOOGLE_FLOW_ENABLED: 'false' }, timeoutMs: 60000 });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.success, true);
        assertDataDirHonored(res.filePath || res.file_path, ws.tempDir, 'API-error fallback image');
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F11 Boundaries: AI Video Engine, Flow RPA & Hyperframes FFmpeg (7 tests)
  // =========================================================================
  describe('F11 Boundaries: Media Quality Gate, Video Fallback & Flow Overlay', () => {
    it('F11.B1: HyperframesFFmpeg.validateMediaQuality rejects non-existent file path inside temp DATA_DIR', async () => {
      const ws = createTempWorkspace('f11_b1');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js')), true, 'services/hyperframes_ffmpeg.js must exist');
        const HyperframesFFmpeg = require('../../services/hyperframes_ffmpeg');

        const missingPath = path.join(ws.paths.outputs, '__missing_file_999.mp4');
        const res = await HyperframesFFmpeg.validateMediaQuality(missingPath, 'video');
        assert.equal(res.passed, false);
      } finally {
        ws.cleanup();
      }
    });

    it('F11.B2: HyperframesFFmpeg.validateMediaQuality rejects tiny <300KB video file', async () => {
      const ws = createTempWorkspace('f11_b2');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js')), true, 'services/hyperframes_ffmpeg.js must exist');
        const HyperframesFFmpeg = require('../../services/hyperframes_ffmpeg');

        const tinyMp4 = generateSyntheticVideo(path.join(ws.paths.videos, 'tiny.mp4'), { tinyFile: true });
        assert.ok(fs.statSync(tinyMp4).size < 300 * 1024);

        const res = await HyperframesFFmpeg.validateMediaQuality(tinyMp4, 'video');
        assert.equal(res.passed, false, 'Tiny <300KB video must fail Media Quality Gate');
      } finally {
        ws.cleanup();
      }
    });

    it('F11.B3: HyperframesFFmpeg.validateMediaQuality rejects solid-black blank video even when >=300KB', async () => {
      const ws = createTempWorkspace('f11_b3');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js')), true, 'services/hyperframes_ffmpeg.js must exist');
        const HyperframesFFmpeg = require('../../services/hyperframes_ffmpeg');

        const blackMp4 = generateSyntheticVideo(path.join(ws.paths.videos, 'black_blank.mp4'), {
          width: 1080,
          height: 1920,
          durationSec: 3,
          solidBlack: true
        });
        assert.ok(fs.statSync(blackMp4).size >= 300 * 1024, 'Synthetic black video must be >=300KB to isolate blank detection');

        const res = await HyperframesFFmpeg.validateMediaQuality(blackMp4, 'video');
        assert.equal(res.passed, false, 'Solid-black blank video must fail Media Quality Gate');
      } finally {
        ws.cleanup();
      }
    });

    it('F11.B4: HyperframesFFmpeg.validateMediaQuality rejects corrupt non-MP4 file', async () => {
      const ws = createTempWorkspace('f11_b4');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js')), true, 'services/hyperframes_ffmpeg.js must exist');
        const HyperframesFFmpeg = require('../../services/hyperframes_ffmpeg');

        const corruptMp4 = path.join(ws.paths.videos, 'corrupt.mp4');
        fs.writeFileSync(corruptMp4, Buffer.alloc(400 * 1024, 0x41));

        const res = await HyperframesFFmpeg.validateMediaQuality(corruptMp4, 'video');
        assert.equal(res.passed, false, 'Corrupt non-MP4 file must fail Media Quality Gate');
      } finally {
        ws.cleanup();
      }
    });

    it('F11.B5: VideoEngine falls back cleanly offline with blank GEMINI_API_KEY and GOOGLE_FLOW_ENABLED=false', async () => {
      const ws = createTempWorkspace('f11_b5');
      try {
        const out = await runNodeSnippetSafe(`
          const videoEngine = require('./services/video-engine');
          (async () => {
            const vid = await videoEngine.renderReel({
              title: 'Góc phòng tối giản',
              duration: 3,
              mode: 'AUTO',
              dryRun: true
            });
            console.log(JSON.stringify(vid));
          })();
        `, { tempDir: ws.tempDir, extraEnv: { GEMINI_API_KEY: '', GOOGLE_FLOW_ENABLED: 'false' } });

        assert.equal(out.status, 0, out.stderr);
        const vid = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(vid.success, true);
        assertDataDirHonored(vid.filePath || vid.file_path, ws.tempDir, 'offline fallback video');
      } finally {
        ws.cleanup();
      }
    });

    it('F11.B6: HyperframesFFmpeg.composeReel rejects empty or missing imagePaths cleanly', async () => {
      const ws = createTempWorkspace('f11_b6');
      try {
        assert.equal(fs.existsSync(path.join(WORKSPACE_ROOT, 'services/hyperframes_ffmpeg.js')), true, 'services/hyperframes_ffmpeg.js must exist');
        const HyperframesFFmpeg = require('../../services/hyperframes_ffmpeg');

        await assert.rejects(
          () => HyperframesFFmpeg.composeReel({ imagePaths: [], outputPath: path.join(ws.paths.videos, 'empty.mp4') })
        );
        await assert.rejects(
          () => HyperframesFFmpeg.composeReel({
            imagePaths: [path.join(ws.paths.images, 'does_not_exist.png')],
            outputPath: path.join(ws.paths.videos, 'missing.mp4')
          })
        );
      } finally {
        ws.cleanup();
      }
    });

    it('F11.B7: google_flow_agent.dismissOverlays dismisses CDK overlay modal on local headless HTML fixture', async () => {
      const googleFlowAgent = require('../../services/google_flow_agent');
      const dismissed = await withHeadlessPage(async page => {
        await page.setContent(`
          <html><body>
            <div class="cdk-overlay-backdrop cdk-overlay-backdrop-showing" style="position:fixed;inset:0;z-index:999;display:block"></div>
            <div class="cdk-overlay-container" style="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center">
              <button onclick="document.querySelector('.cdk-overlay-backdrop-showing').classList.remove('cdk-overlay-backdrop-showing'); document.querySelector('.cdk-overlay-container').remove();">Tôi hiểu</button>
            </div>
            <div class="ProseMirror" role="textbox" contenteditable="true"></div>
          </body></html>
        `);
        await googleFlowAgent.dismissOverlays(page);
        return await page.locator('.cdk-overlay-backdrop-showing').count();
      });
      assert.equal(dismissed, 0, 'CDK overlay backdrop must be dismissed');
    });
  });

  // =========================================================================
  // F12 Boundaries: Dual-Engine Publishers & Fail-Closed Brand Asset Guard (6 tests)
  // =========================================================================
  describe('F12 Boundaries: Fail-Closed Brand Asset Guards & Executor Rejection', () => {
    it('F12.B1: ThreadsPlaywrightPublisher fails closed when detectedHandle === null and honors DATA_DIR screenshotDir', async () => {
      const ws = createTempWorkspace('f12_b1');
      let server = null;
      try {
        // Include <svg aria-label="Tạo"></svg> so waitFor resolves immediately without 15s timeout, with ZERO @ handles
        server = await startLoopbackServer(`
          <html><body>
            <svg aria-label="Tạo"></svg>
            <div role="button">Thread mới</div>
            <span>Có gì mới?</span>
            <div role="textbox" contenteditable="true"></div>
          </body></html>
        `);
        const out = await runNodeSnippetSafe(`
          const threadsPublisher = require('./services/threads_playwright_publisher');
          threadsPublisher.threadsUrl = ${JSON.stringify(server.url)};
          (async () => {
            const res = await threadsPublisher.publish({
              message: 'Phòng sạch sẽ thoáng mát dễ ngủ.',
              force: true,
              headless: true
            });
            console.log(JSON.stringify({ screenshotDir: threadsPublisher.screenshotDir, res }));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const { screenshotDir, res } = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assertDataDirHonored(screenshotDir, ws.paths.screenshots, 'Threads screenshotDir from DATA_DIR');
        assert.equal(res.success, false);
        assert.equal(
          res.blockedByBrandAssetGuard,
          true,
          `Threads publisher MUST fail closed (blockedByBrandAssetGuard: true) when detectedHandle === null, got: ${JSON.stringify(res)}`
        );
      } finally {
        if (server) await server.close();
        ws.cleanup();
      }
    });

    it('F12.B2: InstagramPlaywrightPublisher fails closed when detectedHandle is wrong account or imposter', async () => {
      const igPublisher = require('../../services/instagram_playwright_publisher');

      const wrongAccount = await withHeadlessPage(async page => {
        await page.setContent(`
          <html><body>
            <nav><a href="/other_fashion_shop/">Trang cá nhân</a></nav>
          </body></html>
        `);
        return await igPublisher.verifyLoggedInHandle(page);
      });
      assert.equal(wrongAccount.matched, false);
      assert.equal(wrongAccount.detectedHandle, 'other_fashion_shop');

      const imposterAccount = await withHeadlessPage(async page => {
        await page.setContent(`
          <html><body>
            <nav><a href="/explore/">Explore</a><a href="/nhacualand_imposter/">Profile</a></nav>
          </body></html>
        `);
        return await igPublisher.verifyLoggedInHandle(page);
      });
      assert.equal(imposterAccount.matched, false);
    });

    it('F12.B3: MetaPlaywrightPublisher ensureTargetFanpageSelected fails closed on bodyText decoy when wrong Page is active', async () => {
      const metaPublisher = require('../../services/meta_playwright_publisher');

      const result = await withHeadlessPage(async page => {
        await page.setContent(`
          <html><body>
            <div role="combobox">SomeOtherBrandPage</div>
            <footer>Recent activity mention: Nhacualand</footer>
          </body></html>
        `);
        return await metaPublisher.ensureTargetFanpageSelected(page);
      });
      assert.equal(
        result.matched,
        false,
        'Meta Brand Asset Guard must fail closed when combobox is SomeOtherBrandPage even if bodyText contains Nhacualand decoy'
      );
    });

    it('F12.B4: publishDirect blocks omnichannel dispatch when instagram_caption or threads_caption violates Rule 5', async () => {
      const ws = createTempWorkspace('f12_b4');
      try {
        const validFb = 'Đi làm mệt nhoài chỉ mong về phòng nằm nghỉ cho đỡ đuối. Phòng sạch sẽ thoáng mát là đủ bình yên.';
        const badTh = 'Inbox ngay nhacualand.com để chốt cọc phòng số 1 hôm nay nhé!';

        const out = await runNodeSnippetSafe(`
          const { publishDirect } = require('./services/publish-executor');
          (async () => {
            try {
              const res = await publishDirect({
                platform: 'all',
                contentType: 'feed',
                message: ${JSON.stringify(validFb)},
                facebook_caption: ${JSON.stringify(validFb)},
                instagram_caption: ${JSON.stringify(validFb)},
                threads_caption: ${JSON.stringify(badTh)},
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
        assert.equal(
          parsed.blocked,
          true,
          'publishDirect must reject when threads_caption violates Rule 5 even if facebook_caption is valid'
        );
      } finally {
        ws.cleanup();
      }
    });

    it('F12.B5: InstagramPlaywrightPublisher.publish rejects missing/non-existent mediaPath without opening browser', async () => {
      const ws = createTempWorkspace('f12_b5');
      try {
        const out = await runNodeSnippetSafe(`
          const igPublisher = require('./services/instagram_playwright_publisher');
          (async () => {
            const res = await igPublisher.publish({
              contentType: 'photo',
              message: 'Phòng sạch thoáng sáng.',
              mediaPath: ${JSON.stringify(path.join(ws.paths.images, 'nonexistent_img.png'))},
              force: true,
              headless: true
            });
            console.log(JSON.stringify(res));
          })();
        `, { tempDir: ws.tempDir });

        assert.equal(out.status, 0, out.stderr);
        const res = JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
        assert.equal(res.success, false);
        assert.match(String(res.error || ''), /Ảnh|Video|Reels|media/i);
      } finally {
        ws.cleanup();
      }
    });

    it('F12.B6: MetaPlaywrightPublisher.publishViaFacebookPageDirect fails closed with blockedByBrandAssetGuard on wrong-page fixture', async () => {
      const ws = createTempWorkspace('f12_b6');
      try {
        const metaPublisher = require('../../services/meta_playwright_publisher');
        const res = await withHeadlessPage(async page => {
          await page.route('**/*', route => {
            const url = route.request().url();
            if (url.startsWith('https://www.facebook.com')) {
              return route.fulfill({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: '<html><head><title>Other Fashion Page | Facebook</title></head><body><h1>Other Fashion Page</h1><div>Chào mừng tới shop</div></body></html>'
              });
            }
            return route.abort();
          });

          return await metaPublisher.publishViaFacebookPageDirect(page, {
            contentType: 'feed',
            message: 'Phòng sạch sẽ thoáng mát dễ ngủ.',
            proofScreenshot: path.join(ws.paths.screenshots, 'fb_guard_check.png')
          });
        });

        assert.equal(res.success, false);
        assert.equal(res.blockedByBrandAssetGuard, true);
      } finally {
        ws.cleanup();
      }
    });
  });

  // =========================================================================
  // F13 Boundaries: Safe Dry-Run / Staging & 24/7 Scheduler Runners (5 tests)
  // =========================================================================
  describe('F13 Boundaries: Dry-Run CLI Rejection, Env Preservation & Batch Runners', () => {
    it('F13.B1: publish_now.js --dry-run --platform all runs safely with missing API keys and honors --dry-run even when DRY_RUN=false', async () => {
      const ws = createTempWorkspace('f13_b1');
      const wsFlag = createTempWorkspace('f13_b1_flag');
      try {
        const res = await runNodeCliSafe('scripts/publish_now.js', [
          '--dry-run',
          '--platform', 'all',
          '--type', 'feed',
          '--message', 'Tan làm mệt nhoài chỉ mong về phòng nằm nghỉ. Phòng sạch sẽ thoáng mát là đủ bình yên.'
        ], { tempDir: ws.tempDir });

        assert.equal(res.status, 0, `publish_now.js --dry-run failed: ${res.stderr}`);
        assert.match(res.stdout, /dryRun|DRY_RUN/i);

        // Sub-check: --dry-run CLI flag must force dry-run even when DRY_RUN=false & AUTO_PUBLISH=true
        const guardPath = path.join(wsFlag.tempDir, 'r4_publish_guard.js');
        fs.writeFileSync(guardPath, `
          'use strict';
          global.fetch = async (url) => {
            throw new Error('R4_GUARD: live fetch blocked under publish_now --dry-run: ' + String(url));
          };
          const pwManager = require(${JSON.stringify(path.join(WORKSPACE_ROOT, 'services/playwright_manager'))});
          pwManager.beginBatchSession = async () => {
            throw new Error('R4_GUARD: playwrightManager.beginBatchSession blocked under publish_now --dry-run');
          };
          pwManager.endBatchSession = async () => {};
          pwManager.getContext = async () => {
            throw new Error('R4_GUARD: playwrightManager.getContext blocked under publish_now --dry-run');
          };
          pwManager._launchOrAttachContext = async () => {
            throw new Error('R4_GUARD: playwrightManager._launchOrAttachContext blocked under publish_now --dry-run');
          };
          const imageEngine = require(${JSON.stringify(path.join(WORKSPACE_ROOT, 'services/image_engine'))});
          imageEngine.generateImage = async () => {
            throw new Error('R4_GUARD: live imageEngine.generateImage blocked under publish_now --dry-run');
          };
          const videoEngine = require(${JSON.stringify(path.join(WORKSPACE_ROOT, 'services/video-engine'))});
          videoEngine.renderReel = async () => {
            throw new Error('R4_GUARD: live videoEngine.renderReel blocked under publish_now --dry-run');
          };
          for (const modPath of [
            ${JSON.stringify(path.join(WORKSPACE_ROOT, 'services/meta_playwright_publisher'))},
            ${JSON.stringify(path.join(WORKSPACE_ROOT, 'services/instagram_playwright_publisher'))},
            ${JSON.stringify(path.join(WORKSPACE_ROOT, 'services/threads_playwright_publisher'))}
          ]) {
            require(modPath).publish = async () => {
              throw new Error('R4_GUARD: Playwright publisher blocked under publish_now --dry-run');
            };
          }
        `, 'utf8');

        const res2 = await runNodeCliSafe('scripts/publish_now.js', [
          '--dry-run',
          '--platform', 'all',
          '--type', 'feed',
          '--message', 'Tan làm mệt nhoài chỉ mong về phòng nằm nghỉ. Phòng sạch sẽ thoáng mát là đủ bình yên.'
        ], {
          tempDir: wsFlag.tempDir,
          extraEnv: {
            DRY_RUN: 'false',
            AUTO_PUBLISH: 'true',
            FACEBOOK_AUTO_PUBLISH: 'true',
            INSTAGRAM_AUTO_PUBLISH: 'true',
            THREADS_AUTO_PUBLISH: 'true'
          },
          nodeArgs: ['-r', guardPath]
        });

        assert.equal(res2.status, 0, `publish_now.js --dry-run ignored --dry-run flag when DRY_RUN=false: ${res2.stderr}\n${res2.stdout}`);
        const outputs = fs.readdirSync(wsFlag.paths.outputs).filter(f => f.endsWith('.json'));
        assert.ok(outputs.length >= 1, 'Expected staging report JSON in DATA_DIR/outputs when --dry-run flag is passed');
        const report = JSON.parse(fs.readFileSync(path.join(wsFlag.paths.outputs, outputs[0]), 'utf8'));
        assert.equal(report.dryRun, true, 'Staging report must record dryRun: true');
        assert.deepEqual(report.successfulTargets, ['facebook', 'instagram', 'threads']);
        assert.deepEqual(JSON.parse(fs.readFileSync(wsFlag.paths.historyFile, 'utf8')), [], 'Dry-run must NOT record live publish history');
      } finally {
        ws.cleanup();
        wsFlag.cleanup();
      }
    });

    it('F13.B2: publish_now.js --dry-run rejects Rule-5-violating --message with non-zero exit code', async () => {
      const ws = createTempWorkspace('f13_b2');
      try {
        const res = await runNodeCliSafe('scripts/publish_now.js', [
          '--dry-run',
          '--platform', 'all',
          '--type', 'feed',
          '--message', 'Phòng đẹp số 1 tại nhacualand.com! Gọi ngay 0981 753 082 để chốt cọc!'
        ], { tempDir: ws.tempDir });

        assert.notEqual(res.status, 0, 'publish_now.js --dry-run must exit non-zero on Rule-5 violation');
      } finally {
        ws.cleanup();
      }
    });

    it('F13.B3: company_orchestrator.js --dry-run skips Google Flow browser launch even when GOOGLE_FLOW_ENABLED=true', async () => {
      const ws = createTempWorkspace('f13_b3');
      try {
        const guardPath = path.join(ws.tempDir, 'r4_flow_guard.js');
        const pwPath = require.resolve('playwright', { paths: [WORKSPACE_ROOT] });
        fs.writeFileSync(guardPath, `
          'use strict';
          const fs = require('fs');
          const path = require('path');
          const logFile = path.join(process.env.DATA_DIR, 'flow_guard_log.json');
          const log = {
            flowImageCalls: 0,
            flowVideoCalls: 0,
            beginBatchCalls: 0,
            getContextCalls: 0,
            launchOrAttachCalls: 0,
            persistentLaunchCalls: 0,
            chromiumLaunchAfterLeak: 0
          };
          const writeLog = () => fs.writeFileSync(logFile, JSON.stringify(log), 'utf8');
          writeLog();

          const flowAgent = require(${JSON.stringify(path.join(WORKSPACE_ROOT, 'services/google_flow_agent'))});
          flowAgent.generateImage = async () => {
            log.flowImageCalls += 1;
            writeLog();
            throw new Error('R4_GUARD: googleFlowAgent.generateImage blocked in --dry-run');
          };
          flowAgent.generateVideo = async () => {
            log.flowVideoCalls += 1;
            writeLog();
            throw new Error('R4_GUARD: googleFlowAgent.generateVideo blocked in --dry-run');
          };

          const pwManager = require(${JSON.stringify(path.join(WORKSPACE_ROOT, 'services/playwright_manager'))});
          pwManager.beginBatchSession = async () => {
            log.beginBatchCalls += 1;
            writeLog();
            throw new Error('R4_GUARD: playwrightManager.beginBatchSession blocked in --dry-run');
          };
          pwManager.getContext = async () => {
            log.getContextCalls += 1;
            writeLog();
            throw new Error('R4_GUARD: playwrightManager.getContext blocked in --dry-run');
          };
          pwManager._launchOrAttachContext = async () => {
            log.launchOrAttachCalls += 1;
            writeLog();
            throw new Error('R4_GUARD: playwrightManager._launchOrAttachContext blocked in --dry-run');
          };

          const pw = require(${JSON.stringify(pwPath)});
          if (pw && pw.chromium) {
            pw.chromium.launchPersistentContext = async () => {
              log.persistentLaunchCalls += 1;
              writeLog();
              throw new Error('R4_GUARD: playwright.chromium.launchPersistentContext blocked in --dry-run');
            };
            const origLaunch = pw.chromium.launch.bind(pw.chromium);
            pw.chromium.launch = async (...args) => {
              if (log.flowImageCalls > 0 || log.flowVideoCalls > 0) {
                log.chromiumLaunchAfterLeak += 1;
                writeLog();
                throw new Error('R4_GUARD: playwright.chromium.launch blocked after dry-run Google Flow leak');
              }
              return await origLaunch(...args);
            };
          }
        `, 'utf8');

        const res = await runNodeCliSafe('scripts/company_orchestrator.js', [
          '--dry-run',
          '--media', 'image',
          '--topic', 'Phòng có cửa sổ thoáng đón nắng sáng'
        ], {
          tempDir: ws.tempDir,
          extraEnv: { GOOGLE_FLOW_ENABLED: 'true', GOOGLE_VEO_ENABLED: 'true', GOOGLE_IMAGE_ENABLED: 'true' },
          nodeArgs: ['-r', guardPath],
          timeoutMs: 60000
        });

        const guardLog = JSON.parse(fs.readFileSync(path.join(ws.tempDir, 'flow_guard_log.json'), 'utf8'));
        assert.equal(guardLog.flowImageCalls, 0, 'company_orchestrator --dry-run must NOT call googleFlowAgent.generateImage');
        assert.equal(guardLog.flowVideoCalls, 0, 'company_orchestrator --dry-run must NOT call googleFlowAgent.generateVideo');
        assert.equal(guardLog.beginBatchCalls, 0, 'company_orchestrator --dry-run must NOT call playwrightManager.beginBatchSession');
        assert.equal(guardLog.getContextCalls, 0, 'company_orchestrator --dry-run must NOT call playwrightManager.getContext');
        assert.equal(guardLog.launchOrAttachCalls, 0, 'company_orchestrator --dry-run must NOT call playwrightManager._launchOrAttachContext');
        assert.equal(guardLog.persistentLaunchCalls, 0, 'company_orchestrator --dry-run must NOT launch persistent Chromium profile');

        assert.equal(res.status, 0, `company_orchestrator --dry-run failed with GOOGLE_FLOW_ENABLED=true: ${res.stderr}`);
        const outputs = fs.readdirSync(ws.paths.outputs).filter(f => f.endsWith('.json'));
        assert.ok(outputs.length >= 1, 'Expected dry-run staging manifest in DATA_DIR/outputs');
        const manifest = JSON.parse(fs.readFileSync(path.join(ws.paths.outputs, outputs[0]), 'utf8'));
        assert.equal(manifest.dryRun, true);
        assert.equal(manifest.published, false);
      } finally {
        ws.cleanup();
      }
    });

    it('F13.B4: lib/env-loader.js preserves pre-set DATA_DIR & DRY_RUN=true while populating unset keys from .env', () => {
      const ws = createTempWorkspace('f13_b4');
      try {
        const probeScript = `
          process.env.DATA_DIR = ${JSON.stringify(ws.tempDir)};
          process.env.DRY_RUN = 'true';
          delete process.env.TIMEZONE;
          delete process.env.META_PAGE_ID;
          require('./lib/env-loader');
          console.log(JSON.stringify({
            DATA_DIR: process.env.DATA_DIR,
            DRY_RUN: process.env.DRY_RUN,
            TIMEZONE: process.env.TIMEZONE,
            META_PAGE_ID: process.env.META_PAGE_ID
          }));
        `;
        const stdout = execFileSync(process.execPath, ['-e', probeScript], {
          cwd: WORKSPACE_ROOT,
          encoding: 'utf8',
          timeout: 10000
        }).trim();
        const parsed = JSON.parse(stdout);
        assert.equal(parsed.DATA_DIR, ws.tempDir);
        assert.equal(parsed.DRY_RUN, 'true');
        assert.equal(parsed.TIMEZONE, 'Asia/Ho_Chi_Minh');
        assert.equal(parsed.META_PAGE_ID, '1337253129481940');
      } finally {
        ws.cleanup();
      }
    });

    it('F13.B5: run_daily.cmd preserves chcp 65001 UTF-8 and propagates %ERRORLEVEL% cleanly with run_daily_hidden.vbs', () => {
      const cmdRaw = fs.readFileSync(path.join(WORKSPACE_ROOT, 'run_daily.cmd'), 'utf8');
      const vbsRaw = fs.readFileSync(path.join(WORKSPACE_ROOT, 'run_daily_hidden.vbs'), 'utf8');

      assert.match(cmdRaw, /chcp\s+65001/i);
      assert.match(cmdRaw, /set\s+EXIT_CODE=%ERRORLEVEL%/i);
      assert.match(cmdRaw, /exit\s+\/b\s+%EXIT_CODE%/i);
      assert.match(vbsRaw, /WshShell\.Run\([^)]*,\s*0\s*,\s*True\s*\)/i);
      assert.match(vbsRaw, /WScript\.Quit\s+exitCode/i);
    });
  });
});
