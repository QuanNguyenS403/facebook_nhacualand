'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const envLoader = require('../../lib/env-loader');
const governance = require('../../lib/governance');
const processLock = require('../../lib/process-lock');
const contentPlanner = require('../../lib/content-planner');
const { SPACE_ARCHETYPES } = require('../../services/prompt_architect');

const ROOT_DIR = path.resolve(__dirname, '../..');
const BRAND_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'config/brand.json'), 'utf8'));
const OFFER_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'config/offer_catalog.json'), 'utf8'));

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nhacualand-m1-'));
}

describe('M1 — lib/governance.js (Rule 5, ICT Timezone, Rate Limit & Isolation)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('countSentences & normalizeCompliantMessage', () => {
    it('counts 2-4 Vietnamese/Latin sentences accurately and ignores trailing hashtags, decimals, and abbreviations', () => {
      const sample = 'Phòng rộng 18.5m2 ở TP.HCM có cửa sổ thoáng lắm.\nĐiện nước rõ ràng như Q.1, P.2 hay các quận khác, đồ đạc v.v. đều ngăn nắp! Tối về ngủ một giấc đã đời…\n#phongtro #chothuephong';
      assert.equal(governance.countSentences(sample), 3);

      const decimalsAndMillions = 'Căn phòng 2.5m trần cao thoáng mát. Tiền điện nước tính theo đồng hồ 3.000.000 hay hơn đều ghi rõ từng tháng.';
      assert.equal(governance.countSentences(decimalsAndMillions), 2);

      assert.equal(governance.countSentences('Phòng có bàn ghế, tủ lạnh v.v. Tối về gọn gàng lắm.'), 2);
      assert.equal(governance.countSentences('Phòng sạch sẽ lắm. Ngủ ngon.#phongtro #chothuephong'), 2);
      assert.equal(governance.countSentences('Phòng thoáng mát quá!#phongtro'), 1);
    });

    it('strips zero-width characters, NFC-normalizes, and does NOT append hashtags to empty strings', () => {
      assert.equal(governance.normalizeCompliantMessage(''), '');
      assert.equal(governance.normalizeCompliantMessage('   \n\t  '), '');
      assert.equal(governance.normalizeCompliantMessage('\u200B\uFEFF'), '');

      const normalized = governance.normalizeCompliantMessage('Phòng\u200B sạch sẽ lắm. Tối về ngủ ngon.');
      assert.ok(!normalized.includes('\u200B'));
      assert.ok(normalized.includes('#phongtro #chothuephong'));
    });
  });

  describe('evaluateContent (Rule 5 positive & adversarial negative cases)', () => {
    it('approves a compliant 2-4 sentence everyday renter caption with legitimate words (tiền điện nước, 18.5m2, hàng ngày, cửa sổ)', () => {
      const caption = 'Tan làm mệt nhoài dắt xe đi tìm phòng trọ trong ngõ mà nản. Phòng 18.5m2 ở TP.HCM có cửa sổ 1 cánh thoáng mát, tiền điện nước minh bạch để hàng ngày đi làm về nghỉ ngơi cho thoải mái. Chỉ mong tối về ngủ một giấc cho đã đời sau 6 tháng vất vả.';
      const res = governance.evaluateContent({ caption, channel: 'facebook' });
      assert.equal(res.allowed, true, `Expected allowed, got violations: ${res.violations.join(' | ')}`);
      assert.equal(res.selfApproved, true);
      assert.equal(res.score, 100);
      assert.equal(res.stats.sentenceCount, 3);
      assert.equal(res.stats.hashtagCount, 2);
      assert.ok(res.stats.wordCount <= 90);
      assert.ok(res.stats.charCount <= 450);

      const allowedIteration2Cases = [
        'Hôm qua mới xem phòng ở ngõ nhỏ Q.1 mà thấy ẩm mốc tối om. Tối về chỉ mong tìm được chỗ sạch sẽ để ngủ ngon.',
        'Phòng tắm sạch không có mùi xà phòng nồng nặc. Tối về nằm nghỉ nghe tiếng mưa rơi nhẹ nhàng.',
        'Mỗi tối lau dọn để giữ cho phòng luôn thoáng mát. Ngủ một giấc tới sáng rất khỏe.',
        'Phòng 18.5m2 ở 3 tầng trên có cửa sổ 1 cánh thoáng mát. Ở đây 6 tháng rồi, đồng hồ 1.200 vẫn rõ ràng.',
        'Phòng ở gần nhà của Lan đứng đợi xe buýt rất tiện. Điều cần nhất là tối về có chỗ ngủ yên tĩnh.',
        'Nỗi sợ lớn nhất lúc đi thuê phòng là tiền điện nước mập mờ. Giá trị của sự rõ ràng là ở chỗ đó.',
        'Phòng sạch sẽ thoáng mát ở TP.HCM có đầy đủ bàn ghế, tủ lạnh v.v. Tối về chỉ mong ngủ một giấc thật sâu.',
        'Tầng 2. Có nắng sáng chiếu qua cửa sổ rộng 18.5m2. Phòng sạch.Có gió mát rất dễ chịu.',
        'Phòng thoáng.Co ban công nhỏ.'
      ];
      for (const text of allowedIteration2Cases) {
        const check = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(check.allowed, true, `Expected allowed for "${text}", got: ${check.violations.join(' | ')}`);
      }

      const missingSpaceCo = governance.evaluateContent({
        caption: 'Phòng thoáng.Co ban công nhỏ.',
        channel: 'facebook'
      });
      assert.equal(missingSpaceCo.allowed, true);
      assert.equal(missingSpaceCo.stats.sentenceCount, 2);
    });

    it('rejects 1-sentence and 5-sentence captions', () => {
      const oneSentence = governance.evaluateContent({
        caption: 'Tan làm về chỉ mong có căn phòng sạch sẽ thoáng mát để ngủ một giấc.'
      });
      assert.equal(oneSentence.allowed, false);
      assert.ok(oneSentence.violations.some(v => v.includes('2 đến 4 câu')));

      const fiveSentences = governance.evaluateContent({
        caption: 'Câu một rất ngắn. Câu hai cũng ngắn. Câu ba bình thường. Câu bốn đi làm về. Câu năm là hết rồi.'
      });
      assert.equal(fiveSentences.allowed, false);
      assert.ok(fiveSentences.violations.some(v => v.includes('2 đến 4 câu')));
    });

    it('rejects captions exceeding 90 words, 450 body chars, or 500 Threads codepoints', () => {
      const longWords = Array.from({ length: 48 }, () => 'phòng sạch').join(' ');
      const over90Words = governance.evaluateContent({
        caption: `${longWords}. Tối về ngủ một giấc rất ngon.`
      });
      assert.equal(over90Words.allowed, false);
      assert.ok(over90Words.violations.some(v => v.includes('90 từ')));

      const longWordChars = 'a'.repeat(230);
      const over450Chars = governance.evaluateContent({
        caption: `Phòng này ${longWordChars}. Không gian kia ${longWordChars}.`
      });
      assert.equal(over450Chars.allowed, false);
      assert.ok(over450Chars.violations.some(v => v.includes('450 ký tự')));

      // Body <= 450 chars (445 chars) + 2 clean hashtags (62 chars) => 507 total codepoints (allowed on FB, rejected on Threads > 500)
      const threadsBoundaryPayload = `Phòng thoáng lắm. ${'x'.repeat(426)}. #phongtrongungonthoangmatmoingay #chothuephongthoangmatmoingay`;
      const fbWithinBody = governance.evaluateContent({
        caption: threadsBoundaryPayload,
        channel: 'facebook'
      });
      assert.equal(fbWithinBody.allowed, true, `Expected FB allowed, got: ${fbWithinBody.violations.join(' | ')}`);

      const threadsRes = governance.evaluateContent({
        caption: threadsBoundaryPayload,
        channel: 'threads'
      });
      assert.equal(threadsRes.allowed, false);
      assert.ok(threadsRes.violations.some(v => v.includes('Threads') && v.includes('500')));
    });

    it('rejects >2 hashtags and brand/promo hashtags', () => {
      const tooManyTags = governance.evaluateContent({
        caption: 'Phòng có cửa sổ thoáng mát. Tối về ngủ ngon lắm. #phongtro #chothuephong #saigon'
      });
      assert.equal(tooManyTags.allowed, false);
      assert.ok(tooManyTags.violations.some(v => v.includes('Tối đa 2 hashtag')));

      const promoTag = governance.evaluateContent({
        caption: 'Phòng có cửa sổ thoáng mát. Tối về ngủ ngon lắm. #GiamGia #Voucher'
      });
      assert.equal(promoTag.allowed, false);
      assert.ok(promoTag.violations.some(v => v.includes('Hashtag')));

      const adversarialTag = governance.evaluateContent({
        caption: 'Phòng có cửa sổ thoáng mát. Tối về ngủ ngon lắm. #lienhe #giatot'
      });
      assert.equal(adversarialTag.allowed, false);
      assert.ok(adversarialTag.violations.some(v => v.includes('Hashtag')));

      for (const ctaTag of [
        '#chotngay', '#chotphong', '#datphong', '#nhanhtay', '#xemphongngay',
        '#linkbio', '#vaobio', '#datlich', '#giuphong', '#thuengay', '#cmtngay', '#chaothue', '#giahoi',
        '#chot\u2061ngay'
      ]) {
        const res = governance.evaluateContent({
          caption: `Phòng sạch sẽ thoáng mát. Ngủ ngon.${ctaTag}`
        });
        assert.equal(res.allowed, false, `Expected CTA hashtag blocked: ${ctaTag}`);
        assert.ok(res.violations.some(v => v.includes('Hashtag')));
      }
    });

    it('blocks all brand names including zero-width, NFKC, diacritic-folded, separator, leetspeak, Cyrillic homoglyphs, I-lookalike, alpha-suffixed, and @handles', () => {
      const brandVariants = [
        'Phòng ở nhacualand sạch sẽ lắm. Tối về ngủ rất ngon.',
        'Bên Nhà Của Land có phòng thoáng. Đi làm về rất dễ chịu.',
        'Bên Nhà Cửa Land phòng mát mẻ. Tối về ngủ ngon.',
        'Xem thêm ở nhacualand.com nha. Tối về ngủ ngon.',
        'Bên N\u200Bhà Củ\u200Ba Land thoáng lắm. Ngủ một giấc đã đời.',
        'Bên nha cua land phòng sạch. Tối về nghỉ ngơi.',
        'Bên nha.cua.land hay nha-cua-land cũng vậy. Tối về ngủ ngon.',
        'Nhắn nh4cu4l4nd hoặc nh4_cu4_l4nd xem sao. Tối về ngủ ngon.',
        'Nhắn @nhacualand để hỏi thêm nhé. Phòng sạch thoáng lắm.',
        'Xem thêm ở (@phongtro_hcm) nhé. Phòng sạch sẽ lắm.',
        'Nhắn IG:@phongtro_hcm nhé. Phòng thoáng mát lắm.',
        'Bên nha cua land24h có phòng thoáng lắm. Tối về ngủ ngon.',
        'Phòng sạch sẽ thoáng mát. Ghé nh\u0430cu\u0430l\u0430nd nhé.',
        'Phòng sạch sẽ thoáng mát. Ghé nh\u0430 cu\u0430 l\u0430nd nhé.',
        'Phòng sạch sẽ thoáng mát. Ghé nha cua Iand nhé.',
        'Phòng sạch sẽ thoáng mát. Ghé nha cua landvn nhé.',
        'Phòng sạch sẽ thoáng mát. Ghé n\u04BBa cua land nhé.',
        'Phòng sạch sẽ thoáng mát. Ghé nha cua \u04CFand nhé.',
        'Phòng sạch sẽ thoáng mát. Ghé nha cua lan\u0501 nhé.',
        'Phòng sạch sẽ thoáng mát. Ghé nh\u03B1 cu\u03B1 l\u03B1nd nhé.',
        'Phòng sạch sẽ thoáng mát. Ghé \u03B7hacualand nhé.',
        'Phòng sạch sẽ lắm. Ởnhàcủa land thoáng mát.'
      ];
      for (const variant of brandVariants) {
        const res = governance.evaluateContent({ caption: variant });
        assert.equal(res.allowed, false, `Expected brand variant blocked: ${variant}`);
      }
    });

    it('blocks URLs, domains, Vietnamese phone numbers, ads/CTAs, prices, superlatives, and banned titles', () => {
      const blockedCases = [
        'Xem ảnh tại https://example.com nhé. Phòng thoáng mát lắm.',
        'Vào phongtro[dot]vn xem thử đi. Phòng sáng sủa lắm.',
        'Gọi 0981 753 082 hoặc +84 981 753 082 để hỏi. Phòng sạch sẽ.',
        'Ai cần thì inbox hoặc nhắn zalo mình nhé. Phòng thoáng lắm.',
        'Nhanh tay đặt cọc giữ phòng kẻo hết. Xem phòng ngay hôm nay.',
        'Có voucher giảm giá cho người mới thuê. Miễn phí cọc tháng đầu.',
        'Chính chủ cho thuê gấp căn hộ mini. Phòng thoáng sáng lắm.',
        'Phòng giá chỉ 3tr mỗi tháng thôi. Hoặc 200k tiền điện nước.',
        'Chỉ từ 3.5 triệu/tháng là có chỗ ở. Hoặc 200.000đ tiền dọn.',
        'Phòng sạch thoáng chỉ 3tr5/tháng thôi. Tối về ngủ ngon.',
        'Phòng sạch thoáng chỉ 3tr5 thôi nhé. Tối về ngủ ngon.',
        'Phòng studio tầm 2tr8/th thôi. Ngủ một giấc đã.',
        'Căn hộ mini tầm 4trieu5 mỗi tháng. Phòng sạch sẽ.',
        'Phòng trọ cao cấp khoảng 3cu5 nha. Tối về ngủ ngon.',
        'Ai thích thì giữ chỗ sớm kẻo hết phòng nha. Tối ngủ ngon.',
        'Mời xem phòng trống hôm nay nha. Phòng sạch sẽ thoáng mát lắm.',
        'Cuối tháng xả phòng trống rồi đây. Ai cần cứ ghé xem.',
        'Đây là nơi uy tín nhất và tốt nhất khu này. Chất lượng số 1.',
        'Không gian hoàn hảo nhất, đẳng cấp nhất, hàng đầu thành phố. Chuyên nghiệp nhất luôn.',
        'Gọi ngay (0981) 753 082 hoặc (+84) 981 753 082 để hỏi. Phòng thoáng mát.',
        'Phòng rộng rãi giá 3.500.000 mỗi tháng thôi. Tối về ngủ ngon.',
        'Phòng sạch sẽ gia thue 3000 mỗi tháng nha. Ngủ rất yên tĩnh.',
        'Ai thích thì nhanh tay chốt ngay kẻo hết. Vào bio xem thêm nhé.',
        'Phòng chất lượng nhất, hiện đại nhất, đảm bảo 100% như hình. Tối về ngủ ngon.',
        'Phòng sạch sẽ thoáng mát. Số ０９８１ ７５３ ０８２ nhé.',
        'Phòng sạch sẽ thoáng mát. Số 0981/753/082 nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep[.]com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem t.co/abc123 nhé.',
        'Phòng sạch sẽ thoáng mát. Xem x.com/abc nhé.',
        'Phòng sạch sẽ thoáng mát. Xem bit.do/abc123 nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền nhà giá: 3.500.000 nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền nhà 3.500.000/tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Ai cần cmt ngay nhé.',
        'Phòng sạch sẽ thoáng mát. Ai cần comment ngay nhé.',
        'Phòng sạch sẽ thoáng mát. Không gian tuyệt vời nhất khu này.',
        'Phòng sạch sẽ thoáng mát. Chất lượng s\u043E 1 khu này.',
        'Phòng sạch sẽ thoáng mát. Nơi này s\u043E m\u043Et luôn.',
        'Phòng sạch sẽ thoáng mát. Xem site.i\u043E nhé.',
        'Phòng sạch sẽ thoáng mát. Xem site.m\u0435 nhé.',
        'Phòng sạch sẽ thoáng mát. Xem site.\u0441\u043E nhé.',
        'Phòng sạch sẽ thoáng mát. Gọi 0981\u034F753\u034F082 nhé.',
        'Phòng sạch sẽ thoáng mát. Ai cần C\u2061mt ngay nhé.',
        'Phòng sạch sẽ thoáng mát. Xem t.\u2061co/abc123 nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền rác 500\u034Fđ nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 3500000/tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 3.500.000/thg nhé.',
        'Phòng sạch sẽ thoáng mát. Gọi +84/981/753/082 nhé.',
        'Phòng sạch sẽ thoáng mát. Gọi 0981\u2013753\u2013082 nhé.',
        'Phòng sạch sẽ thoáng mát. Xem youtu.be/abc123 nhé.',
        'Phòng sạch sẽ thoáng mát. Xem lnkd.in/abc nhé.',
        'Phòng sạch sẽ thoáng mát. Xem s.id/abc nhé.',
        'Phòng sạch sẽ thoáng mát. Xem nha.house nhé.',
        'Phòng sạch sẽ thoáng mát. Xem room.app nhé.',
        'Phòng sạch sẽ thoáng mát. Xem Example.COM nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongtro.vn nhé.',
        'Phòng sạch sẽ thoáng mát. Gọi 0981_753_082 nhé.',
        'Phòng sạch sẽ thoáng mát. Gọi 0981,753,082 nhé.',
        'Phòng ma giá rẻ bất ngờ. Đừng tin nhé.',
        'Cảnh giác phòng ma lừa cọc. Đi xem trực tiếp cho chắc.'
      ];

      for (const text of blockedCases) {
        const res = governance.evaluateContent({ caption: text });
        assert.equal(res.allowed, false, `Expected blocked: ${text}`);
      }

      const bannedTitle = governance.evaluateContent({
        caption: 'Tan làm về phòng thoáng mát là vui rồi. Tối ngủ một giấc cho đã.',
        title: 'Nhà Của Land ưu đãi số 1'
      });
      assert.equal(bannedTitle.allowed, false);
      assert.ok(bannedTitle.violations.some(v => v.startsWith('[TITLE]')));
    });

    it('blocks offer_catalog promo codes/phrases, spaced domain evasions, and rent/price phrasings with zero false positives', () => {
      // 1. F9.B1: offer_catalog.json promo codes & general promo phrases
      for (const offer of OFFER_CONFIG.active_offers) {
        const codeLeak = governance.evaluateContent({
          caption: `Phòng sạch sẽ thoáng mát. Dùng mã ${offer.code} ngay hôm nay nhé.`
        });
        assert.equal(codeLeak.allowed, false, `Expected offer code blocked: ${offer.code}`);

        const standaloneCodeLeak = governance.evaluateContent({
          caption: `Phòng sạch sẽ thoáng mát. Nhắc tới ${offer.code} là biết rồi.`
        });
        assert.equal(standaloneCodeLeak.allowed, false, `Expected standalone offer code blocked: ${offer.code}`);

        const titleLeak = governance.evaluateContent({
          caption: `Phòng đẹp gọn gàng dễ ở. ${offer.title}.`
        });
        assert.equal(titleLeak.allowed, false, `Expected offer title blocked: ${offer.title}`);
      }

      const promoRejections = [
        'Phòng sạch sẽ thoáng mát. Dùng mã SALE50 ngay hôm nay nhé.',
        'Phòng sạch sẽ thoáng mát. Nhập mã GIAM100K khi dọn vào.',
        'Phòng sạch sẽ thoáng mát. Có mã ưu đãi cho người mới.',
        'Phòng sạch sẽ thoáng mát. Nhận mã giảm cho tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Miễn phí dịch vụ tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Miễn phí wifi tốc độ cao.',
        'Phòng sạch sẽ thoáng mát. Code: WELCOME2026 nhé.',
        'Phòng sạch sẽ thoáng mát. Nhắc tới FREE WIFI 6T là biết rồi.',
        'Phòng sạch sẽ thoáng mát. Nhắc tới CLEAN MOVE IN là biết rồi.',
        'Phòng sạch sẽ thoáng mát. Code: welcome2026 nhé.',
        'Phòng sạch sẽ thoáng mát. Mã: giam200k nhé.',
        'Phòng sạch sẽ thoáng mát. Free wifi tốc độ cao tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Free dịch vụ vệ sinh cho người mới.',
        'Phòng sạch sẽ thoáng mát. Tặng 1 tháng tiền phòng cho bạn dọn vào.',
        'Phòng sạch sẽ thoáng mát. Miễn 100% tiền cọc khi dọn vào.',
        'Phòng sạch sẽ thoáng mát. Giảm 50% tháng đầu cho sinh viên.'
      ];
      for (const text of promoRejections) {
        const res = governance.evaluateContent({ caption: text });
        assert.equal(res.allowed, false, `Expected promo phrase blocked: ${text}`);
      }

      // 2. Spaced domain evasions
      const spacedDomainRejections = [
        'Phòng sạch sẽ thoáng mát. Xem phongdep . com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem example . vn nhé.',
        'Phòng sạch sẽ thoáng mát. Xem site . com . vn nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem site . io nhé.',
        'Phòng sạch sẽ thoáng mát. Xem site . co . uk nhé.',
        'Phòng sạch sẽ thoáng mát. Xem bit . ly/phongtro nhé.',
        'Phòng sạch sẽ thoáng mát. Xem t . co/abc nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. io nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. io/abc nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. me nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. co nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. Com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem a . vn nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep [ . ] com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep。com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep.ıo nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep chấm com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep dot com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . c o m nhé.'
      ];
      for (const text of spacedDomainRejections) {
        const res = governance.evaluateContent({ caption: text });
        assert.equal(res.allowed, false, `Expected spaced domain blocked: ${text}`);
      }

      // 3. Price / rent amount phrasings
      const rentPriceRejections = [
        'Phòng sạch sẽ thoáng mát. Tiền phòng 3.500.000 mỗi tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 3,500,000 hàng tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 3500000 tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Thuê 3.500.000/thg nhé.',
        'Phòng sạch sẽ thoáng mát. Thuê 3500000 mỗi tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Giá 3,500,000/tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Chỉ 3.500.000 vnđ thôi nhé.',
        'Phòng sạch sẽ thoáng mát. Ở đây 3.500.000 mỗi tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng chỉ có 3500000 thôi.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 3.5M/tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Chỉ 3500/tháng thôi nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 3 500 000 mỗi tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Giá thuê ba triệu rưỡi mỗi tháng.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 3.500.000 đồng mỗi tháng.',
        'Phòng sạch sẽ thoáng mát. Giá 5000 đồng.',
        'Phòng sạch sẽ thoáng mát. Chỉ 500.000 dong mỗi tháng.',
        'Phòng sạch sẽ thoáng mát. Tiền rác 200.000đ.'
      ];
      for (const text of rentPriceRejections) {
        const res = governance.evaluateContent({ caption: text });
        assert.equal(res.allowed, false, `Expected rent/price phrasing blocked: ${text}`);
      }

      // 4. Negative checks: legitimate captions MUST remain allowed (zero false positives)
      const safeCaptions = [
        'Phòng thoáng.Co ban công nhỏ.',
        'Phòng sạch sẽ. Có cửa sổ.',
        'Phòng thoáng mát. Con đường yên tĩnh.',
        'Phòng mới. Do tự lau dọn nên sạch.',
        'Ở một mình. In hóa đơn điện rõ ràng.',
        'Phòng thoáng. Co ban công nhỏ.',
        'Phòng thoáng. Do trời mưa nên mát.',
        'Phòng thoáng. In hình lên tường rất đẹp.',
        'Phòng tầng 3 thoáng mát. Cửa sổ đón nắng sáng.',
        'Ở 2 người thoải mái. Cuối tháng về quê đỡ nhớ nhà.',
        'Đi thuê 2 năm rồi mới tìm được phòng ưng ý. Ở đây 6 tháng rồi vẫn thoải mái.',
        'Thuê 1 phòng nhỏ cho đỡ tốn. Tiền điện nước cuối tháng đều ghi rõ.',
        'Phòng có cửa vân tay và dùng mã khóa riêng. Tối về rất yên tâm.',
        'Đóng tiền điện qua mã QR rõ ràng. Không lo mập mờ cuối tháng.',
        'Phòng mà có cửa sổ thoáng thì tối về ngủ ngon lắm. Ai đi làm xa cũng mong vậy.',
        'Phòng mà sạch sẽ gọn gàng là thấy nhẹ người rồi. Đi làm về chỉ muốn nghỉ ngơi.',
        'Phòng mã P102 có cửa sổ hướng đông rất thoáng. Tối về ngủ ngon.',
        'Nhà trọ có 3 đồng hồ điện riêng cho từng tầng. Cuối tháng tự kiểm tra cho yên tâm.',
        'Thuê phòng ở tầng 2 thoáng mát lắm. Có 2 đồng hồ điện nước tách riêng từng phòng.',
        'Phòng có 1 đồng hồ nước riêng cho từng phòng. Rất minh bạch.',
        'Phòng đi 2 dòng điện tách điều hòa và đèn. Dùng cả ngày cũng ổn định.',
        'Ghi rõ 2 dòng tiền điện nước cuối tháng. Tối về rất yên tâm.',
        'Ở khu 2 đông người đi làm lắm. Nhưng tối về đóng cửa lại rất yên.',
        'Hai đứa 2 đồng nghiệp thuê chung phòng nhỏ. Tối về ngủ ngon.',
        'Phòng sạch.Cơm tối tự nấu ở góc bếp nhỏ. Ngủ rất ngon.',
        'Ở một mình cho yên tĩnh. VN mùa mưa tìm phòng khô ráo cực lắm.',
        'Phòng sạch sẽ là mừng rồi. TOP những điều cần xem là cửa sổ và nước.',
        'Cuối tháng chốt số điện rõ ràng. APP ghi chỉ số nhìn phát biết ngay.',
        'Phòng thoáng . do mở cửa sổ cả ngày.',
        'Phòng nhỏ thôi . to quá lại tốn công dọn.',
        'Góc bếp gọn gàng . be bé nhưng đủ nấu.',
        'Chiều ngồi ban công . ly trà đá là đủ.',
        'Tiền điện cuối tháng . in giấy gửi từng phòng.',
        'Ở tầng 1 tháng nào cũng thoáng mát. Tối về nghỉ ngơi thoải mái.'
      ];
      for (const text of safeCaptions) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, true, `False positive on safe caption "${text}": ${res.violations.join(' | ')}`);
      }
    });

    it('Iteration 5: allows Vietnamese renter phrases (500m, tăng mà, dùng mà, nhận mà, chỉ tự, chị Tư, đang cập nhật, đọc quyển, 2 cũ, 2k, . App/. Top/. me/. co) while blocking new promos, spaced/TitleCase/Unicode-dot domains, prices, and hotlines', () => {
      const mustAllow = [
        'Đi bộ ra bến xe chỉ 500m thôi. Sáng đi làm đỡ tốn tiền xe ôm.',
        'Trọ cách công ty chỉ có 300m thôi. Trưa chạy về nghỉ ngơi chút rồi chiều làm tiếp.',
        'Chiều ngang phòng chỉ 3m nhưng sắp xếp gọn. Tối về ngủ một giấc rất ngon.',
        'Tiền điện mùa nóng tự nhiên tăng mà không hiểu lý do. Cuối tháng nhìn hóa đơn giật cả mình.',
        'Đồ ít dùng mà cứ để bừa ra thì phòng chật lắm. Dọn gọn lại nhìn thoáng hẳn.',
        'Phòng nhỏ nhưng nhận mà thấy sạch sẽ thơm tho là mừng rồi. Tối về ngủ ngon tới sáng.',
        'Ở một mình nên mọi thứ trong phòng chỉ tự lo lấy. Gọn gàng sạch sẽ là thấy nhẹ người.',
        'Hỏi thăm chị Tư hàng xóm xem ngõ có hay ngập mưa không. Tìm kỹ một chút cho đỡ khổ về sau.',
        'Chủ nhà đang cập nhật lại bảng điện nước từng phòng cho rõ. Ai đi làm thuê cũng thích sự minh bạch vậy.',
        'Tối về đọc quyển sách nhỏ bên cửa sổ rồi ngủ một giấc. Cuộc sống xa quê chỉ mong yên bình vậy thôi.',
        'Tầng 2 cũ rồi nên tường hơi thấm lúc trời mưa. Đi xem phòng nhớ kiểm tra kỹ góc tường.',
        'Tối về nằm xem phim. App ghi chỉ số điện nước nhìn phát biết ngay cuối tháng đỡ lo.',
        'Ở đây yên tĩnh nha. Top những điều mình thích là cửa sổ sáng.',
        'Phòng sạch lắm nha. App ghi chỉ số điện nước nhìn phát biết ngay.',
        'Ngõ nhỏ có cây me. me rụng lá đầy sân nhưng rất mát và yên tĩnh.',
        'Phòng hướng tây mùa đông hơi lạnh. co người lại trong chăn ấm ngủ một giấc đã đời.',
        'Mấy bạn 2k mới ra trường lên thành phố đi làm thuê trọ. Chỉ mong tìm được phòng sạch sẽ không ẩm mốc.',
        'Phòng thoáng . Có nắng sáng chiếu qua cửa sổ. Ngủ rất ngon.'
      ];
      for (const text of mustAllow) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, true, `Expected allowed for "${text}", got: ${res.violations.join(' | ')}`);
      }

      const mustBlock = [
        // Promos & offer codes
        'Phòng sạch sẽ thoáng mát. Giảm ngay 20% khi dọn vào.',
        'Phòng sạch sẽ thoáng mát. Tặng ngay 1 tháng cho sinh viên.',
        'Phòng sạch sẽ thoáng mát. Miễn phí 100% tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Miễn phí 1 tháng tiền phòng nhé.',
        'Phòng sạch sẽ thoáng mát. Free 1 tháng đầu cho sinh viên.',
        'Phòng sạch sẽ thoáng mát. Free 2 tuần đầu dọn vào.',
        'Phòng sạch sẽ thoáng mát. Tặng 2 tuần trải nghiệm nhé.',
        'Phòng sạch sẽ thoáng mát. Dùng mã FREEWIFI6T cho tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Tặng mã GIAM50 khi dọn vào.',
        'Phòng sạch sẽ thoáng mát. Dung ma GIAM50 khi don vao.',
        'Phòng sạch sẽ thoáng mát. Chỉ từ 3 triệu cho người đi làm.',
        'Phòng sạch sẽ thoáng mát. Chỉ từ hôm nay nhận ưu đãi.',
        'Phòng sạch sẽ thoáng mát. Không gian đẳng cấp nhất khu này.',
        'Phòng sạch sẽ thoáng mát. Tiện ích độc quyền cho người thuê.',
        // Spaced / TitleCase / ALLCAPS / Unicode-dot domains
        'Phòng sạch sẽ thoáng mát. Xem Phongdep. Com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem PHONGDEP. COM nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. Vn nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. Io nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. Me nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. Co nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep . Co nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . a p p nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . t o p nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep (chấm) com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep {.} com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep <.> com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep\u00B7com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep\u2027com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep\u2219com nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep\u22C5com nhé.',
        // Rent / price phrasings
        'Phòng sạch sẽ thoáng mát. Tầm 3.5M là ở được rồi.',
        'Phòng sạch sẽ thoáng mát. Khoảng 3.5M nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 3.5m/tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Chỉ 3500 mỗi tháng thôi.',
        'Phòng sạch sẽ thoáng mát. Mỗi tháng 3500000 thôi.',
        'Phòng sạch sẽ thoáng mát. Bốn triệu rưỡi là vừa tầm.',
        'Phòng sạch sẽ thoáng mát. Giá tầm ba triệu tám nhé.',
        'Phòng sạch sẽ thoáng mát. Giá 2 củ thôi nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 2 củ rưỡi.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng chỉ 5k gửi xe.',
        'Phòng sạch sẽ thoáng mát. Tiền điện 4k mỗi số.',
        'Phòng sạch sẽ thoáng mát. Giá 200k tiền dọn.',
        'Phòng sạch sẽ thoáng mát. Phí dịch vụ 50k/tháng.',
        // Phones & hotlines
        'Phòng sạch sẽ thoáng mát. Số 0981*753*082 nhé.',
        'Phòng sạch sẽ thoáng mát. Số 0981|753|082 nhé.',
        'Phòng sạch sẽ thoáng mát. Gọi 1900 1234 nhé.',
        'Phòng sạch sẽ thoáng mát. Gọi 1800 567890 nhé.'
      ];
      for (const text of mustBlock) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, false, `Expected blocked for "${text}"`);
      }
    });

    it('Iteration 6: allows everyday Vietnamese phrases (giữ phòng sạch/khô/thoáng, nhận mã wifi, nhập mã thang máy, tầm 2k/2k3, chậm để, tăng gói, chia sẻ vào bài, Bách Khoa. App, cọc 1 tháng) while blocking Iteration 5 stress-test bypasses', () => {
      const mustAllow = [
        'Ở trọ một mình cố gắng giữ phòng sạch sẽ gọn gàng. Tối đi làm về nhìn đỡ mệt hẳn.',
        'Mùa mưa nhớ đóng cửa sổ giữ phòng khô ráo, tránh ẩm mốc tường. Tối về ngủ ngon.',
        'Mở cửa sổ buổi sáng để giữ phòng luôn thoáng mát cả ngày. Chiều về đỡ ngột ngạt.',
        'Cách giữ phòng trọ sạch sẽ mùa mưa rất đơn giản. Tối về chịu khó lau khô sàn.',
        'Đi xem phòng nhớ nhận mã wifi từ chủ nhà để kiểm tra sóng trong phòng có mạnh không. Tối làm việc đỡ bực mình.',
        'Về phòng nhập mã thang máy lên tầng 4 rất tiện và an toàn. Tối đi làm khuya đỡ lo.',
        'Phòng này toàn mấy bạn tầm 2k ở với nhau nên khá yên tĩnh. Đi làm về ai cũng muốn nghỉ ngơi.',
        'Mấy bạn 2k3 mới ra trường đi làm thuê trọ cùng nhau. Tối về chỉ mong chỗ ngủ yên tĩnh.',
        'Đồ ăn nấu xong đừng để chậm để lâu trong phòng dễ có mùi. Dọn gọn lại nhìn thoáng hẳn.',
        'Mạng yếu quá nên tự tăng gói cước lên cho ổn định làm việc buổi tối. Phòng yên tĩnh làm việc rất tập trung.',
        'Kinh nghiệm đi xem phòng trọ mình chia sẻ vào bài này cho các bạn mới lên phố. Xem kỹ ánh sáng và nước trước nhé.',
        'Gần đại học Bách Khoa. App ghi chỉ số điện nước nhìn phát biết ngay cuối tháng đỡ lo.',
        'Thuê phòng ở đây chỉ cọc 1 tháng thôi. Tiền điện nước cuối tháng đều có đồng hồ riêng.',
        'Hỏi kỹ điều khoản cọc 1 tháng trước khi dọn vào ở. Mọi thứ rõ ràng thì ở mới yên tâm.'
      ];
      for (const text of mustAllow) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, true, `Expected allowed for "${text}", got: ${res.violations.join(' | ')}`);
      }

      const mustBlock = [
        // Keeping "giữ phòng" CTA blocked
        'Phòng sạch sẽ thoáng mát. Ai ưng thì cọc giữ phòng sớm nhé.',
        'Phòng sạch sẽ thoáng mát. Nhắn trước giữ phòng kẻo hết.',
        'Phòng sạch sẽ thoáng mát. Ai thích thì giữ phòng ngay hôm nay.',
        // Promos / Sales / CTAs
        'Phòng sạch sẽ thoáng mát. Giảm sâu 20% tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Giảm mạnh 30% cho sinh viên nhé.',
        'Phòng sạch sẽ thoáng mát. Sale 50% tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Flash sale phòng đẹp hôm nay nhé.',
        'Phòng sạch sẽ thoáng mát. Đang có deal tốt cho sinh viên nhé.',
        'Phòng sạch sẽ thoáng mát. Săn deal phòng đẹp cuối tuần nhé.',
        'Phòng sạch sẽ thoáng mát. Booking xem phòng cuối tuần nhé.',
        'Phòng sạch sẽ thoáng mát. Hoàn tiền 100% nếu không ưng ý nhé.',
        'Phòng sạch sẽ thoáng mát. Tặng nửa tháng tiền phòng nhé.',
        'Phòng sạch sẽ thoáng mát. Miễn cọc tháng đầu cho sinh viên nhé.',
        'Phòng sạch sẽ thoáng mát. Chỗ này 0 cọc cho sinh viên mới.',
        'Phòng sạch sẽ thoáng mát. Chấm để nhận thông tin chi tiết nhé.',
        'Phòng sạch sẽ thoáng mát. Nhớ chia sẻ vào 10 nhóm nhé.',
        // Prices
        'Phòng sạch sẽ thoáng mát. Tiền phòng khoảng 3.5m nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền điện 3k5 một số nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền nước 4k5 một khối nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền ăn 35k5 một phần.',
        'Phòng sạch sẽ thoáng mát. Phí gửi xe 2k5 một lượt.',
        'Phòng sạch sẽ thoáng mát. Cọc 500.000 nhé.',
        // Phones / Hotlines / Superlatives / Domains
        'Phòng sạch sẽ thoáng mát. Số 0981\u2010753\u2010082 nhé.',
        'Phòng sạch sẽ thoáng mát. Gọi 1900 123 456 nhé.',
        'Phòng sạch sẽ thoáng mát. Không gian chuẩn 5 sao luôn.',
        'Phòng sạch sẽ thoáng mát. Đảm bảo uy tín khi ở đây.',
        'Phòng sạch sẽ thoáng mát. Cam kết 100% như hình nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p [.] c o m nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep.click nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep.vip nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. Top nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep. App nhé.'
      ];
      for (const text of mustBlock) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, false, `Expected blocked for "${text}"`);
      }
    });

    it('Iteration 7: resolves Challenger Iter 6 Vietnamese false positives (giữ phòng vệ sinh/bếp/thông thoáng/bừa bộn, thuê ngày, chỉ từ chối, nhập mã bãi xe) and closes dotted utility prices, promo discounts, free-month offers, CTAs, and Reviewer minor cases', () => {
      const mustAllow = [
        // Contextual "giữ phòng" cleaning/maintenance/ventilation phrases
        'Cố gắng giữ phòng vệ sinh sạch sẽ và khô ráo mỗi cuối tuần. Có làm vậy thì mùa mưa mới không bị mùi ẩm khó chịu.',
        'Giữ phòng bếp gọn gàng sau khi nấu ăn để tránh gián kiến. Mình ở trọ một mình nên tự dọn chút cho thoải mái.',
        'Mở hé cửa sổ ban ngày để giữ phòng thông thoáng, bớt ngột ngạt. Tối về bật quạt nhẹ là ngủ một giấc tới sáng.',
        'Đừng giữ phòng bừa bộn cuối tuần dọn lại cho gọn. Tối nằm ngủ thấy dễ chịu hẳn.',
        'Tự giữ phòng ngủ thoáng mát vào mùa hè rất quan trọng. Ngủ sâu giấc hơn hẳn.',
        // "thuê ngày" (daily wage labor) vs "thuê ngay"
        'Đi làm thuê ngày tăng ca tới tối mịt mới lết xác về tới phòng trọ. Chỉ cần mở cửa thấy mát mẻ, đặt lưng xuống ngủ ngon là đủ lấy lại sức.',
        // "chỉ từ chối" / non-promo "chỉ từ" compounds
        'Đừng chỉ từ chối mấy phòng nhỏ mà bỏ qua ánh sáng tự nhiên. Phòng vừa đủ ở nhưng sáng sủa lúc nào cũng dễ chịu hơn phòng rộng mà tối om.',
        'Chỉ từ lúc dọn vào ở một mình mới thấy tầm quan trọng của cửa sổ thoáng. Tối về nghe tiếng mưa nhẹ rất bình yên.',
        // Access/building code phrases & non-price numbers
        'Về đến tòa nhà chỉ cần nhập mã bãi xe hoặc quẹt thẻ từ là xong. Không phải đứng ngoài cổng chờ mở khóa lúc trời mưa gió.',
        'Nhận mã xác nhận gửi xe ở bảo vệ rất nhanh gọn. Tối đi làm về muộn không phải chờ đợi lâu.',
        'Phòng có điều hòa 9000BTU chạy rất êm ban đêm. Tối về ngủ một giấc tới sáng.',
        'Nhà trọ có 3 đồng hồ điện riêng cho từng tầng. Cuối tháng tự kiểm tra cho yên tâm.',
        'Sắp xếp đồ đạc theo cách chốt đơn giản gọn nhẹ cho đỡ chật. Phòng nhỏ nhưng nhìn vẫn thoáng.',
        'Mùa mưa đừng để đồ ẩm chậm khô trong phòng dễ có mùi. Mở cửa sổ cho thoáng là đỡ ngay.'
      ];
      for (const text of mustAllow) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, true, `Expected allowed for "${text}", got: ${res.violations.join(' | ')}`);
      }

      const mustBlock = [
        // Contextual "giữ phòng" booking/deposit/urgency/CTA cases
        'Phòng sạch sẽ thoáng mát. Cọc giữ phòng đẹp nhé.',
        'Phòng sạch sẽ thoáng mát. Cọc giữ phòng nhé.',
        'Phòng sạch sẽ thoáng mát. Giữ phòng ngay kẻo lỡ.',
        'Phòng sạch sẽ thoáng mát. Giữ phòng kẻo hết nhé.',
        'Phòng sạch sẽ thoáng mát. Giữ phòng cho bạn cuối tuần nhé.',
        'Phòng sạch sẽ thoáng mát. Chuyển khoản giữ phòng trước nhé.',
        // "thuê ngay" CTA
        'Phòng sạch sẽ thoáng mát. Thuê ngay phòng đẹp hôm nay.',
        'Phòng sạch sẽ thoáng mát. Cho thuê ngay căn hộ mini.',
        // Dotted per-unit utility prices & Reviewer Minor 1 ("tiền phòng 2k5")
        'Phòng sạch sẽ thoáng mát. Tiền điện 4.000/số theo đồng hồ.',
        'Phòng sạch sẽ thoáng mát. Tiền điện 3.500 một số nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền điện 4.000 theo đồng hồ.',
        'Phòng sạch sẽ thoáng mát. Tiền nước 20.000/khối theo đồng hồ.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 2k5 mỗi ngày.',
        // Promotional discounts, free-month offers, sale month-1, and sales CTAs
        'Phòng sạch sẽ thoáng mát. Giảm hẳn 20% tháng đầu cho bạn nào dọn vào.',
        'Phòng sạch sẽ thoáng mát. Giảm tới 30% tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Chiết khấu 10% khi đóng tiền trước.',
        'Phòng sạch sẽ thoáng mát. Chiết khấu ngay khi đóng cả năm.',
        'Phòng sạch sẽ thoáng mát. Tặng tháng đầu khi ký hợp đồng dài hạn.',
        'Phòng sạch sẽ thoáng mát. Tặng tháng đầu tiên khi dọn vào.',
        'Phòng sạch sẽ thoáng mát. Tặng hẳn 1 tháng cho người thuê mới.',
        'Phòng sạch sẽ thoáng mát. Sale tháng đầu 50% nhé.',
        'Phòng sạch sẽ thoáng mát. Book phòng hôm nay để nhận nhiều phần quà.',
        'Phòng sạch sẽ thoáng mát. Book lịch xem phòng cuối tuần nhé.',
        'Phòng sạch sẽ thoáng mát. Ai ưng thì chốt đơn luôn trong hôm nay.',
        'Phòng sạch sẽ thoáng mát. Chốt đơn nhanh kẻo lỡ nhé.',
        'Phòng sạch sẽ thoáng mát. Chấm bài để nhận thông tin chi tiết nhé.'
      ];
      for (const text of mustBlock) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, false, `Expected blocked for "${text}"`);
      }
    });

    it('Iteration 8: fixes Challenger Iter 7 Vietnamese false positives (già 70 tuổi, tham gia 3 buổi, đội giá 2 lần, chốt ngày, nhận ngày, mà giảm, chỉ từ 15m2/2 tiếng/5 giờ, nhập mã vào cửa, lấy mã mở tủ, thuê phòng 2026) and closes non-tiền utility fees, spelled-out/subsidy promos, spaced domains, CTAs, and superlatives', () => {
      const mustAllow = [
        // 1. "già 70 tuổi", "tham gia 3 buổi", "đội giá 2 lần"
        'Ông chủ nhà già 70 tuổi rồi mà sáng nào cũng tự quét sân sạch sẽ. Ở trọ gặp người tử tế vậy thấy ấm lòng hẳn.',
        'Trước khi chuyển trọ mình tham gia 3 buổi dọn đồ phụ bạn mới thấy chọn phòng gần chỗ làm đỡ cực cỡ nào. Tối về ngủ sớm rất khỏe.',
        'Ở khu cũ tiền điện cứ bị đội giá 2 lần so với đồng hồ nhà nước nên mình nản lắm. Chuyển qua chỗ tính đúng giá thấy nhẹ đầu hẳn.',
        // 2. "chốt ngày", "nhận ngày", "mà giảm"
        'Cuối tháng chủ nhà chốt ngày ghi điện nước rõ ràng cho từng phòng. Người đi làm như mình đỡ phải thắc mắc hay lo tính nhầm.',
        'Cuối tuần nhận ngày nghỉ hiếm hoi để dọn dẹp lại góc phòng cho thoáng mát. Tối về nằm đọc sách thấy nhẹ đầu.',
        'Phòng có cửa sổ đón gió tự nhiên vừa thoáng khí mà giảm được hẳn tiền bật điều hòa. Tối ngủ dậy không bị khô họng.',
        // 3. "chỉ từ 15m2", "chỉ từ 2 tiếng", "chỉ từ 5 giờ"
        'Ở một mình phòng chỉ từ 15m2 là đủ gọn gàng rồi. Quan trọng là có cửa sổ sáng và nhà vệ sinh khô ráo.',
        'Nhiều hôm kẹt xe chỉ từ 2 tiếng ngoài đường đã thấy rã rời. Về tới phòng trọ sạch mát chỉ muốn đặt lưng ngủ một giấc.',
        'Con hẻm này chỉ từ 5 giờ chiều là bắt đầu mát mẻ, bớt nắng gắt. Ngồi ngoài ban công hóng gió rất dễ chịu.',
        // 4. "nhập mã vào cửa", "lấy mã mở tủ", "thuê phòng 2026", and non-superlative context checks
        'Khu trọ lắp khóa điện tử nên về khuya chỉ cần nhập mã vào cửa rất tiện. Không phải gọi người mở cổng lúc nửa đêm.',
        'Tòa nhà có tủ giao hàng riêng, đi làm về chỉ cần lấy mã mở tủ nhận đồ. Sống một mình thấy tiện hơn hẳn.',
        'Đi thuê phòng 2026 giờ ai cũng ưu tiên chỗ có cửa sổ thoáng và điện nước minh bạch. Ở thoải mái mới làm việc tốt được.',
        'Phòng có cửa từ nên về khuya nhập mã mở cửa rất nhanh. Tối ngủ yên tĩnh không bị làm phiền.',
        'Tủ giao hàng riêng chỉ cần lấy mã nhận đồ rất tiện. Sống một mình thấy gọn gàng hẳn.',
        'Ở đây 6 tháng rồi, đồng hồ 1.200 vẫn rõ ràng. Phòng có điều hòa 9000BTU chạy êm lắm.',
        'Phòng tầng 1 dùng 100% nước máy sạch sẽ. Tối về nghỉ ngơi rất yên tâm.'
      ];
      for (const text of mustAllow) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, true, `Expected allowed for "${text}", got: ${res.violations.join(' | ')}`);
      }

      const mustBlock = [
        // Regression checks for FP fixes (true violations must stay blocked)
        'Phòng sạch sẽ thoáng mát. Giá 5000 nhé.',
        'Phòng sạch sẽ thoáng mát. gia thue 3000 nha.',
        'Phòng sạch sẽ thoáng mát. Giá 500.000 nhé.',
        'Phòng sạch sẽ thoáng mát. giá 3tr nhé.',
        'Phòng sạch sẽ thoáng mát. Ai ưng thì chốt ngay nhé.',
        'Phòng sạch sẽ thoáng mát. Ai cần thì nhắn ngay nhé.',
        'Phòng sạch sẽ thoáng mát. Nhập mã giảm giá nhé.',
        'Phòng sạch sẽ thoáng mát. Chỉ từ 3.5 triệu nhé.',
        'Phòng sạch sẽ thoáng mát. Chỉ từ 300k nhé.',
        'Phòng sạch sẽ thoáng mát. Chỉ từ 3500/tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Chỉ từ hôm nay nhé.',
        'Phòng sạch sẽ thoáng mát. Thuê phòng 2026/tháng nhé.',
        // 1. Non-"tiền" dotted utility/service fees
        'Phòng sạch sẽ thoáng mát. Phí dịch vụ 150.000 nhé.',
        'Phòng sạch sẽ thoáng mát. Phí gửi xe 120.000 nhé.',
        'Phòng sạch sẽ thoáng mát. Phí quản lý 200.000 nhé.',
        'Phòng sạch sẽ thoáng mát. Phí vệ sinh 100.000 nhé.',
        'Phòng sạch sẽ thoáng mát. Điện 3.800 theo đồng hồ nhé.',
        'Phòng sạch sẽ thoáng mát. Nước 18.000 theo đồng hồ nhé.',
        'Phòng sạch sẽ thoáng mát. Wifi 100.000 tốc độ cao nhé.',
        'Phòng sạch sẽ thoáng mát. Rác 30.000 một phòng nhé.',
        'Phòng sạch sẽ thoáng mát. Gửi xe 120.000 có bảo vệ trông.',
        // 2. Spelled-out / multi-word / subsidy promos
        'Phòng sạch sẽ thoáng mát. Tặng một tháng tiền phòng cho sinh viên nhé.',
        'Phòng sạch sẽ thoáng mát. Miễn phí một tháng đầu tiên khi dọn vào.',
        'Phòng sạch sẽ thoáng mát. Free một tháng cho người mới thuê nhé.',
        'Phòng sạch sẽ thoáng mát. Giảm lên đến 30% cho bạn nào dọn vào.',
        'Phòng sạch sẽ thoáng mát. Giảm trực tiếp 20% tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Giảm tiền phòng 20% tháng đầu cho sinh viên.',
        'Phòng sạch sẽ thoáng mát. Sale lên đến 50% tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Hỗ trợ 50% tiền phòng tháng đầu cho sinh viên.',
        'Phòng sạch sẽ thoáng mát. Hỗ trợ 1 tháng tiền nhà cho bạn dọn vào sớm.',
        'Phòng sạch sẽ thoáng mát. Dọn vào ở ngay không cần cọc trước nhé.',
        'Phòng sạch sẽ thoáng mát. Sinh viên dọn vào không mất cọc tháng đầu.',
        // 3. Spaced domains
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . s h o p nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . l a n d nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . s t o r e nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . o n l i n e nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . h o u s e nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . i n f o nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . b i z nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . me nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p . co nhé.',
        // 4. CTAs & Superlatives
        'Phòng sạch sẽ thoáng mát. Comment bên dưới để nhận thông tin phòng nhé.',
        'Phòng sạch sẽ thoáng mát. Để lại bình luận nếu bạn đang tìm phòng nhé.',
        'Phòng sạch sẽ thoáng mát. Hẹn lịch xem phòng cuối tuần này nhé.',
        'Phòng sạch sẽ thoáng mát. Chấm hóng thông tin phòng trống nhé.',
        'Phòng sạch sẽ thoáng mát. Chấm nhẹ bên dưới để nhận thông tin nhé.',
        'Phòng sạch sẽ thoáng mát. Chất lượng top 1 khu vực này luôn.',
        'Phòng sạch sẽ thoáng mát. Chính chủ 100% không qua trung gian.'
      ];
      for (const text of mustBlock) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, false, `Expected blocked for "${text}"`);
      }

      const titleFeeLeak = governance.evaluateContent({
        caption: 'Phòng sạch sẽ thoáng mát. Tối về ngủ ngon giấc.',
        title: 'Phí dịch vụ 150.000'
      });
      assert.equal(titleFeeLeak.allowed, false);
      assert.ok(titleFeeLeak.violations.some(v => v.startsWith('[TITLE]')));
    });

    it('Iteration 9: fixes Challenger Iter 8 Vietnamese false positives (đánh giá chỉ/hơi/tốt, tham gia chỉ, già chỉ/hơi/tốt, pre-2020 calendar years with punctuation) and closes unitless dotted promos, không cọc, spaced-label/spoken/new TLDs, CTAs, spelled monthly rent, superlatives, and Reviewer minor cases', () => {
      const mustAllow = [
        // 1. Diacritic/context disambiguation on giá chỉ/hời/tốt (7 Challenger Iter 8 FPs + safe variants)
        'Đi thuê phòng đừng đánh giá chỉ qua vài tấm ảnh lung linh trên mạng. Tới xem trực tiếp ban ngày mới biết phòng có ẩm mốc hay tối om không.',
        'Nhiều bạn sinh viên tham gia chỉ để đỡ tiền dọn phòng phụ nhau lúc mới lên phố. Tìm được chung cư mini tường cách âm ổn định ngủ ngon tới sáng.',
        'Ông chủ nhà già chỉ ở một mình tầng trệt nên khu trọ lúc nào cũng yên ắng. Tối về ngủ một giấc sâu tới sáng.',
        'Mới nhìn qua hình đã vội đánh giá hơi sớm, tới nơi xem kỹ góc tường và cửa sổ mới chắc ăn. Phòng nhỏ nhưng thoáng khí vẫn dễ ở hơn phòng rộng mà bí.',
        'Chú bảo vệ già hơi khó tính chuyện giờ giấc nhưng tối nào cũng đi kiểm tra khóa cổng kỹ càng. Ở một mình gặp người có tâm vậy thấy yên tâm hơn hẳn.',
        'Hàng xóm khu trọ này ai cũng đánh giá tốt về sự yên tĩnh sau 10 giờ tối. Người đi làm ca đêm về nghỉ ngơi không bị làm phiền.',
        'Bác chủ nhà già tốt bụng lắm, hỏng cái vòi nước nhắn một câu là sáng hôm sau thợ tới sửa liền. Ở xa quê gặp chủ nhà tử tế là mừng nhất.',
        'Phòng cũ mà giá hơi cao so với mặt bằng chung. Đi xem thêm vài nơi khác cho chắc.',
        // 2. Historical calendar years (19xx, 200x-2019) including trailing comma/period
        'Đi thuê phòng từ 2019 đến giờ mới thấm cảnh chuyển trọ giữa trời mưa. Chọn được căn hộ dịch vụ khô ráo có máy giặt riêng đỡ cực biết bao nhiêu.',
        'Đi thuê phòng từ 2019. Giờ mới tìm được chỗ sạch sẽ thoáng mát.',
        'Hồi mới lên thành phố thuê trọ từ 2018, mình từng dính phòng bí bách không có cửa sổ. Giờ cứ phải có khe thoáng mới ở nổi.',
        'Đi thuê phòng từ 1999, hồi đó phòng trọ còn đơn sơ lắm. Giờ tìm chỗ sáng sủa sạch sẽ thấy đỡ hẳn.',
        'Thuê trọ từ 2008 đến giờ mới thấy khu nào yên tĩnh vậy. Tối về ngủ một giấc tới sáng.',
        // 3. Edge-case safety checks for new promo/domain/CTA rules
        'Chủ nhà hỗ trợ sửa ống nước rất nhanh khi phòng có sự cố. Ở một mình gặp chủ nhà có tâm thấy yên tâm.',
        'Phòng có người hỗ trợ 24/7 khi mất điện hay hỏng khóa. Ở một mình đỡ lo hẳn.',
        'Đến cuối tháng là chấm dứt cảnh lo tiền điện nước mập mờ rồi. Phòng có đồng hồ riêng rõ ràng lắm.',
        'Đọc bình luận của mọi người đi trước mới rút ra nhiều kinh nghiệm xem phòng. Tới xem ban ngày cho chắc ăn.'
      ];
      for (const text of mustAllow) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, true, `Expected allowed for "${text}", got: ${res.violations.join(' | ')}`);
      }

      const mustBlock = [
        // Regression checks for tone-sensitive giá ad phrases & price-tagged historical years
        'Phòng sạch sẽ thoáng mát. Giá chỉ 2tr thôi nhé.',
        'Phòng sạch sẽ thoáng mát. Phòng giá tốt nhất khu vực.',
        'Phòng sạch sẽ thoáng mát. Tìm được phòng giá hời quá.',
        'Phòng sạch sẽ thoáng mát. Thuê phòng từ 2018/tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Thuê trọ từ 2019k nhé.',
        // 1. Unitless dotted/numeric promos, trailing punctuation, and direct không cọc / ko cọc
        'Phòng sạch sẽ thoáng mát. Giảm 500.000 khi dọn vào tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Dọn vào tháng đầu được giảm 500.000.',
        'Phòng sạch sẽ thoáng mát. Giảm ngay 500.000 cho sinh viên nhé.',
        'Phòng sạch sẽ thoáng mát. Tặng 500.000 tiền chuyển trọ cho bạn mới.',
        'Phòng sạch sẽ thoáng mát. Tặng 500.000.',
        'Phòng sạch sẽ thoáng mát. Hỗ trợ 500.000 tiền dọn vào tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Hỗ trợ 500.000, dọn vào ở ngay.',
        'Phòng sạch sẽ thoáng mát. Hỗ trợ 500.000.',
        'Phòng sạch sẽ thoáng mát. Giảm 500.000 cho người mới thuê nhé.',
        'Phòng sạch sẽ thoáng mát. Hỗ trợ 500.000 khi dọn vào nhé.',
        'Phòng sạch sẽ thoáng mát. Chỉ từ 300.000.',
        'Phòng sạch sẽ thoáng mát. Chỉ từ 3000.',
        'Phòng sạch sẽ thoáng mát. Dọn vào ở ngay không cọc tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Cho thuê phòng không cọc cho sinh viên nhé.',
        'Phòng sạch sẽ thoáng mát. Dọn vào ở ko cọc luôn nhé.',
        // 2. Spaced-label + unspaced TLD, spoken dot + spaced TLD, and .pro/.link/.rent/.live/.page TLDs
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p.shop nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p.land nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p.app nhé.',
        'Phòng sạch sẽ thoáng mát. Xem p h o n g d e p.top nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep chấm s h o p nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep.pro nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep.link nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep.rent nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep.live nhé.',
        'Phòng sạch sẽ thoáng mát. Xem phongdep.page nhé.',
        // 3. CTAs, spelled-out monthly rent, Vietnamese superlatives, and reversed 100% chính chủ
        'Phòng sạch sẽ thoáng mát. Còn 1 phòng duy nhất, dọn vào ở ngay hôm nay.',
        'Phòng sạch sẽ thoáng mát. Còn một phòng duy nhất cho người đi làm.',
        'Phòng sạch sẽ thoáng mát. Nhắn riêng cho mình để lấy địa chỉ xem phòng.',
        'Phòng sạch sẽ thoáng mát. Ai cần tìm phòng thì bình luận nhé.',
        'Phòng sạch sẽ thoáng mát. Chốt sớm nhận phòng ngay trong ngày nhé.',
        'Phòng sạch sẽ thoáng mát. Ai thích thì chốt sớm kẻo hết nhé.',
        'Phòng sạch sẽ thoáng mát. Nhận phòng ngay hôm nay không cần chờ đợi.',
        'Phòng sạch sẽ thoáng mát. Mỗi tháng ba triệu thôi là có chỗ ở.',
        'Phòng sạch sẽ thoáng mát. Đây là lựa chọn đáng sống nhất khu này.',
        'Phòng sạch sẽ thoáng mát. Tiện nghi bậc nhất dành cho người đi làm.',
        'Phòng sạch sẽ thoáng mát. Cam kết giá mềm nhất khu vực.',
        'Phòng sạch sẽ thoáng mát. Phòng 100% chính chủ không qua môi giới.'
      ];
      for (const text of mustBlock) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, false, `Expected blocked for "${text}"`);
      }
    });

    it('Iteration 10: closes Challenger Iter 9 bypasses (3m5/3M5 shorthand, dotted bớt/lì xì/hoàn promos, trả góp tiền cọc) and Reviewer Iter 9 minor cases (không mất phí cọc, trả giá chỉ) while preserving safe room dimensions and everyday phrases', () => {
      const mustAllow = [
        // Safe Vietnamese room dimensions (3m5, 1m2, 3m2, 18m2)
        'Phòng rộng 3m5 dài 4m nên kê giường và bàn làm việc thoải mái. Tối về có chỗ nghỉ ngơi dễ chịu.',
        'Ban công rộng 1m2 đủ phơi đồ và đón nắng sáng. Tối về ngồi hóng gió rất dễ chịu.',
        'Trần cao 3m2 nên phòng rất thoáng khí và đỡ nóng vào buổi trưa. Ngủ một giấc tới sáng rất khỏe.',
        'Đi thuê phòng 18m2 ở một mình cho gọn gàng sạch sẽ. Điện nước có đồng hồ riêng rõ ràng.',
        // Safe everyday phrases using bớt / hoàn / trả giá chỉ
        'Chủ nhà bớt ồn hơn trước nên khu trọ yên tĩnh hẳn. Tối đi làm về ngủ ngon giấc.',
        'Mở cửa sổ buổi tối là trời bớt nóng hơn rồi. Ở phòng thoáng gió thấy nhẹ người hẳn.',
        'Hoàn tất thủ tục gọn nhẹ rồi dọn đồ vào ở ngay cuối tuần. Phòng sạch sẽ thoáng mát lắm.',
        'Đừng trả giá chỉ để mất thời gian, xem kỹ điện nước trước khi thuê. Phòng thoáng mát là ổn.'
      ];
      for (const text of mustAllow) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, true, `Expected allowed for "${text}", got: ${res.violations.join(' | ')}`);
      }

      const mustBlock = [
        // 3m5 / 3M5 million-VND price shorthand
        'Phòng sạch sẽ thoáng mát. Giá 3m5 một tháng thôi.',
        'Phòng sạch sẽ thoáng mát. Thuê 3m5/tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Tiền phòng 3M5 nhé.',
        'Phòng sạch sẽ thoáng mát. Tầm 3m5 một tháng thôi.',
        // Dotted VND promo amounts (bớt, lì xì, hoàn) & installment deposit
        'Phòng sạch sẽ thoáng mát. Bớt ngay 500.000 cho bạn nào dọn vào sớm.',
        'Phòng sạch sẽ thoáng mát. Lì xì 500.000 tiền nhà tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Hoàn 500.000 tiền cọc tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Hoàn tiền 500.000 cho sinh viên tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Trả góp tiền cọc trong hai tháng nhé.',
        // Reviewer Iter 9 minor: không mất phí cọc
        'Phòng sạch sẽ thoáng mát. Không mất phí cọc tháng đầu.'
      ];
      for (const text of mustBlock) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, false, `Expected blocked for "${text}"`);
      }
    });

    it('Iteration 11: resolves 8m2/9m2/8m2-per-person & Bớt-một-ngày FPs while closing Iter 10 3m5/3M5, cho/được/Free/Miễn promos, deposit-free, and installment bypasses without breaking room dimensions/distances or everyday phrases', () => {
      const mustAllow = [
        // Small room areas & per-person area (8m2, 9m2, 8m2/người)
        'Đi thuê phòng 8m2 nhỏ gọn cho một người ở tiết kiệm. Có cửa sổ thông gió là thấy dễ chịu rồi.',
        'Mới ra trường nên thuê phòng 9m2 ở tạm cho gần chỗ làm. Phòng sạch sẽ sáng sủa là ổn.',
        'Sinh viên đi thuê trọ 8m2 chỉ cần đủ kê chiếc giường đơn và bàn học. Quan trọng là an ninh tốt.',
        'Ở ghép 8m2/người chật lắm. Tìm phòng rộng hơn cho thoải mái ngủ nghỉ.',
        'Phòng nhỏ chỉ 9m2 nhưng gọn gàng sạch sẽ lắm. Tối đi làm về ngủ ngon giấc.',
        // Room dimensions & distances with 3m5 / 3m2 / 500m
        'Phòng rộng tầm 3m5 dài 4m nên kê giường rất thoải mái. Tối về ngủ một giấc ngon lành.',
        'Phòng rộng khoảng 3m5 nên đặt bàn làm việc dễ dàng. Sáng mở cửa đón nắng rất dịu.',
        'Phòng rộng, tầm 3m5, dài 4m nên kê tủ quần áo gọn lắm. Buổi tối yên tĩnh dễ ngủ.',
        'Phòng tầm 3m5 x 4m vừa đủ cho một người đi làm. Tối về nghỉ ngơi thoải mái.',
        'Chiều ngang phòng chỉ 3m5 nhưng bố trí rất gọn gàng. Có cửa sổ lớn đón gió mát.',
        'Trần cao tầm 3m2 nên phòng rất thoáng khí. Trưa nắng cũng đỡ oi bức nhiều.',
        'Phòng cách ngã tư 3m5 thôi nên đi làm rất tiện. Hẻm yên tĩnh và sạch sẽ.',
        'Phòng cách ngã tư tầm 3m5 nên sáng đi làm không mất nhiều thời gian. Khu này an ninh tốt.',
        'Phòng cách cầu thang khoảng 3m5 nên đi lại rất tiện. Buổi tối khu trọ yên tĩnh lắm.',
        'Phòng cách chợ chỉ 500m nên chiều đi làm về ghé mua đồ nấu cơm rất tiện. Khu trọ yên tĩnh.',
        // Everyday Vietnamese phrases (bớt, miễn sao, hỗ trợ, không trả cọc, chưa cọc, trả góp xe máy/điện thoại)
        'Bớt một ngày tìm trọ vất vả rồi. Cuối tuần này mình dọn vào phòng mới sạch sẽ.',
        'Tối về nghe nhạc bớt cho đỡ buồn sau ngày làm việc mệt nhoài. Phòng yên tĩnh dễ ngủ.',
        'Miễn sao phòng sạch sẽ thoáng mát là được. Tối đi làm về có chỗ nghỉ ngơi thoải mái.',
        'Khu trọ hỗ trợ 2 người ở chung một phòng cho tiết kiệm. Có gác lửng gọn gàng sạch sẽ.',
        'Chủ nhà hỗ trợ sửa ống nước rất nhanh khi bị rò rỉ. Ở lâu dài thấy yên tâm hẳn.',
        'Người đi làm thuê trọ sợ nhất là chủ nhà không trả cọc khi chuyển đi. Ở đâu minh bạch mới yên tâm.',
        'Mới đi xem phòng thôi chứ chưa cọc đâu. Phải kiểm tra kỹ điện nước và cửa sổ trước đã.',
        'Trả góp chiếc xe máy cũ mỗi tháng cũng nặng gánh rồi. Chỉ mong tìm được phòng thoáng mát yên tĩnh.',
        'Đang trả góp điện thoại nên cố gắng tiết kiệm từng đồng. Tối về phòng sạch sẽ ngủ ngon là vui.'
      ];
      for (const text of mustAllow) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, true, `Expected allowed for "${text}", got: ${res.violations.join(' | ')}`);
      }

      const mustBlock = [
        // Class A: 3m5 / 3M5 price shorthands & m2 price shorthands
        'Phòng sạch sẽ thoáng mát. Tầm 3m5 thôi là ở thoải mái.',
        'Phòng sạch sẽ thoáng mát. Khoảng 3m5 nhé mọi người.',
        'Phòng sạch sẽ thoáng mát. Chỉ 3m5 thôi mà đủ tiện nghi.',
        'Phòng sạch sẽ thoáng mát. Từ 3m5 nhé các bạn sinh viên.',
        'Phòng sạch sẽ thoáng mát. Mỗi tháng 3m5 thôi, ở rất yên tĩnh.',
        'Phòng sạch sẽ thoáng mát. Hàng tháng 3m5 nhé mọi người.',
        'Phòng sạch sẽ thoáng mát. Mỗi tháng 3M5 thôi nhé.',
        'Phòng sạch sẽ thoáng mát. Tầm 3m5 thôi nhé.',
        'Phòng sạch sẽ thoáng mát. Giảm 3m5 tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Giảm 3M5 tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Chỉ từ 3m5 mỗi tháng.',
        'Phòng sạch sẽ thoáng mát. Thuê 3m2/người nhé.',
        'Phòng sạch sẽ thoáng mát. Giá 3m2 nhé mọi người.',
        'Phòng sạch sẽ thoáng mát. Tầm 3m5, dài hạn nhé.',
        // Class B: Promo modifiers (cho/được), Free/Miễn dotted VND, Bớt tháng
        'Phòng sạch sẽ thoáng mát. Bớt cho 500.000 tiền nhà tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Lì xì cho 500.000 khi dọn vào ở.',
        'Phòng sạch sẽ thoáng mát. Hoàn cho 500.000 tiền cọc tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Giảm cho 500.000 khi ký hợp đồng.',
        'Phòng sạch sẽ thoáng mát. Giảm được 500.000 khi dọn vào sớm.',
        'Phòng sạch sẽ thoáng mát. Tặng cho 500.000 tiền chuyển trọ.',
        'Phòng sạch sẽ thoáng mát. Free 500.000 tiền phòng tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Miễn 500.000 tiền nhà tháng đầu.',
        'Phòng sạch sẽ thoáng mát. Bớt ngay 1 tháng. Tối về ngủ ngon.',
        'Phòng sạch sẽ thoáng mát. Bớt 1 tháng tiền phòng cho người mới.',
        // Class C: Deposit-free & installment phrasings
        'Phòng sạch sẽ thoáng mát. Không đóng cọc tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Không cần đóng cọc khi dọn vào.',
        'Phòng sạch sẽ thoáng mát. Không phải đóng cọc đâu nhé.',
        'Phòng sạch sẽ thoáng mát. Miễn đóng cọc cho sinh viên.',
        'Phòng sạch sẽ thoáng mát. Chưa cần cọc tháng đầu đâu.',
        'Phòng sạch sẽ thoáng mát. Khỏi đóng cọc tháng đầu nhé.',
        'Phòng sạch sẽ thoáng mát. Cọc trả góp trong hai tháng nhé.',
        'Phòng sạch sẽ thoáng mát. Góp tiền cọc làm hai đợt nhé.',
        'Phòng sạch sẽ thoáng mát. Cho trả góp tiền điện máy lạnh.',
        'Phòng sạch sẽ thoáng mát. Trả góp tiền thuê phòng trong hai tháng.'
      ];
      for (const text of mustBlock) {
        const res = governance.evaluateContent({ caption: text, channel: 'facebook' });
        assert.equal(res.allowed, false, `Expected blocked for "${text}"`);
      }
    });
  });

  describe('evaluateOmnichannelCaptions', () => {
    it('passes when all 3 channels comply and fails closed if any single channel violates Rule 5', () => {
      const clean = 'Tan làm mệt nhoài về đến phòng là chỉ muốn ngả lưng. Phòng thoáng có chút nắng sớm nhìn đỡ ngột ngạt hơn hẳn.';
      const passRes = governance.evaluateOmnichannelCaptions({
        facebook_caption: clean,
        instagram_caption: clean,
        threads_caption: clean
      });
      assert.equal(passRes.allowed, true);
      assert.equal(passRes.violations.length, 0);

      const failIg = governance.evaluateOmnichannelCaptions({
        facebook_caption: clean,
        instagram_caption: 'Chỉ có một câu ngắn ngủi thôi.',
        threads_caption: clean
      });
      assert.equal(failIg.allowed, false);
      assert.ok(failIg.violations.some(v => v.startsWith('[INSTAGRAM]')));
    });
  });

  describe('getLocalDateString & checkPublishRateLimit (ICT midnight + Math.floor cooldown)', () => {
    it('converts UTC timestamps accurately to Asia/Ho_Chi_Minh YYYY-MM-DD and throws on invalid dates', () => {
      assert.equal(governance.getLocalDateString(new Date('2026-11-24T16:59:59.000Z'), 'Asia/Ho_Chi_Minh'), '2026-11-24');
      assert.equal(governance.getLocalDateString(new Date('2026-11-24T17:00:00.000Z'), 'Asia/Ho_Chi_Minh'), '2026-11-25');
      assert.equal(governance.getLocalDateString(new Date('2026-11-24T23:30:00.000Z'), 'Asia/Ho_Chi_Minh'), '2026-11-25');
      assert.throws(() => governance.getLocalDateString('not-a-date'), TypeError);
      assert.throws(() => governance.getLocalDateString(null), TypeError);
    });

    it('counts daily posts using ICT local date across midnight boundary and enforces Math.floor cooldown', () => {
      const historyFile = path.join(tmpDir, 'history.json');
      // 1 post at 23:30 ICT on 2026-11-24 (16:30 UTC Nov 24)
      // 1 post at 00:30 ICT on 2026-11-25 (17:30 UTC Nov 24)
      // Unsorted order to prove max timestamp is computed rather than assuming sorted array
      fs.writeFileSync(historyFile, JSON.stringify([
        { timestamp: '2026-11-24T17:30:00.000Z', platform: 'facebook' },
        { timestamp: '2026-11-24T16:30:00.000Z', platform: 'facebook' }
      ]), 'utf8');

      // Check at 01:00 ICT on 2026-11-25 (18:00 UTC Nov 24) -> only 1 post today in ICT!
      const afterMidnight = governance.checkPublishRateLimit('facebook', {
        historyFile,
        now: '2026-11-24T18:00:00.000Z',
        timeZone: 'Asia/Ho_Chi_Minh'
      });
      assert.equal(afterMidnight.allowed, true);
      assert.equal(afterMidnight.dailyCount, 1);
      assert.equal(afterMidnight.countToday, 1);
      assert.equal(afterMidnight.waitMinutes, 0);
      assert.equal(afterMidnight.cooldownRemainingMinutes, 0);

      // Cooldown Math.floor edge: 14m 31s after 17:30:00Z => 17:44:31Z must be BLOCKED
      const blockedAt14m31s = governance.checkPublishRateLimit('facebook', {
        historyFile,
        now: '2026-11-24T17:44:31.000Z',
        timeZone: 'Asia/Ho_Chi_Minh'
      });
      assert.equal(blockedAt14m31s.allowed, false);
      assert.equal(blockedAt14m31s.cooldownRemainingMinutes, 1);
      assert.equal(blockedAt14m31s.waitMinutes, 1);
      assert.equal(blockedAt14m31s.countToday, 1);
      assert.equal(blockedAt14m31s.dailyCount, 1);

      // Exactly 15m 00s after 17:30:00Z => 17:45:00Z must be ALLOWED
      const allowedAt15m00s = governance.checkPublishRateLimit('facebook', {
        historyFile,
        now: '2026-11-24T17:45:00.000Z',
        timeZone: 'Asia/Ho_Chi_Minh'
      });
      assert.equal(allowedAt15m00s.allowed, true);
      assert.equal(allowedAt15m00s.countToday, 1);
      assert.equal(allowedAt15m00s.waitMinutes, 0);
    });

    it('warns and fails safe when publish history JSON is corrupt or non-array, and recordPublishEvent recovers non-array JSON', () => {
      const historyFile = path.join(tmpDir, 'corrupt.json');
      fs.writeFileSync(historyFile, '{bad json', 'utf8');
      const warnings = [];
      const origWarn = console.warn;
      console.warn = (msg) => warnings.push(String(msg));
      try {
        const res = governance.checkPublishRateLimit('facebook', { historyFile });
        assert.equal(res.allowed, true);
        assert.equal(res.dailyCount, 0);
        assert.equal(res.countToday, 0);
        assert.equal(res.waitMinutes, 0);
        assert.ok(warnings.length >= 1);
      } finally {
        console.warn = origWarn;
      }

      const objectHistoryFile = path.join(tmpDir, 'nested', 'obj_history.json');
      fs.mkdirSync(path.dirname(objectHistoryFile), { recursive: true });
      fs.writeFileSync(objectHistoryFile, JSON.stringify({ unexpected: true }), 'utf8');
      governance.recordPublishEvent({ platform: 'threads', message: 'Recovered entry' }, { historyFile: objectHistoryFile });
      const written = JSON.parse(fs.readFileSync(objectHistoryFile, 'utf8'));
      assert.equal(Array.isArray(written), true);
      assert.equal(written.length, 1);
      assert.equal(written[0].platform, 'threads');
    });

    it('falls back to safe defaults on non-numeric rate-limit env vars and validates opts.now even when historyFile is absent', () => {
      const missingHistory = path.join(tmpDir, 'nonexistent_history.json');
      assert.throws(
        () => governance.checkPublishRateLimit('facebook', { historyFile: missingHistory, now: 'not-a-valid-date' }),
        TypeError
      );
      assert.throws(
        () => governance.checkPublishRateLimit('facebook', { historyFile: missingHistory, now: null }),
        TypeError
      );

      const historyFile = path.join(tmpDir, 'env_fallback_history.json');
      const nowIso = '2026-11-25T10:00:00.000Z';
      const entries = [];
      for (let i = 0; i < 8; i++) {
        entries.push({
          timestamp: new Date(Date.parse('2026-11-25T01:00:00.000Z') + i * 20 * 60 * 1000).toISOString(),
          platform: 'facebook'
        });
      }
      fs.writeFileSync(historyFile, JSON.stringify(entries), 'utf8');

      const origMax = process.env.MAX_POSTS_PER_PLATFORM_PER_DAY;
      const origCooldown = process.env.RATE_LIMIT_COOLDOWN_MINUTES;
      process.env.MAX_POSTS_PER_PLATFORM_PER_DAY = 'abc';
      process.env.RATE_LIMIT_COOLDOWN_MINUTES = 'not-a-number';
      try {
        const res = governance.checkPublishRateLimit('facebook', { historyFile, now: nowIso });
        assert.equal(res.allowed, false);
        assert.equal(res.countToday, 8);
        assert.ok(res.reason.includes('8'));

        const historyCooldown = path.join(tmpDir, 'cooldown_fallback_history.json');
        fs.writeFileSync(historyCooldown, JSON.stringify([
          { timestamp: '2026-11-25T09:50:00.000Z', platform: 'instagram' }
        ]), 'utf8');
        const cooldownRes = governance.checkPublishRateLimit('instagram', { historyFile: historyCooldown, now: nowIso });
        assert.equal(cooldownRes.allowed, false);
        assert.equal(cooldownRes.waitMinutes, 5);
      } finally {
        if (origMax === undefined) delete process.env.MAX_POSTS_PER_PLATFORM_PER_DAY;
        else process.env.MAX_POSTS_PER_PLATFORM_PER_DAY = origMax;
        if (origCooldown === undefined) delete process.env.RATE_LIMIT_COOLDOWN_MINUTES;
        else process.env.RATE_LIMIT_COOLDOWN_MINUTES = origCooldown;
      }
    });
  });

  describe('assertInsideWorkspace', () => {
    it('allows valid paths inside D:\\Facebook (case-insensitive & relative) and blocks escapes', () => {
      assert.equal(
        governance.assertInsideWorkspace('D:\\Facebook\\data\\publish_history.json'),
        'D:\\Facebook\\data\\publish_history.json'
      );
      assert.equal(
        governance.assertInsideWorkspace('d:\\facebook\\DATA\\test.json'),
        'd:\\facebook\\DATA\\test.json'
      );
      assert.equal(
        governance.assertInsideWorkspace('data/sample.json'),
        'D:\\Facebook\\data\\sample.json'
      );

      const badPaths = [
        '',
        '   ',
        'D:\\Facebook\\data\\bad\0file.json',
        'D:\\CSKH\\orders.json',
        '..\\CSKH\\orders.json',
        'D:\\Facebook2\\secret.json',
        'C:\\Windows\\System32\\cmd.exe',
        '\\\\server\\share\\file.txt',
        '//server/share/file.txt',
        'D:relative_on_drive.txt'
      ];
      for (const bad of badPaths) {
        assert.throws(() => governance.assertInsideWorkspace(bad), `Expected rejection for: ${bad}`);
      }
    });

    it('detects Windows junction/symlink escaping outside workspace root', () => {
      const sandboxRoot = path.join(tmpDir, 'ws_root');
      const outsideDir = path.join(tmpDir, 'outside_cskh');
      fs.mkdirSync(sandboxRoot, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });
      fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret', 'utf8');

      const linkPath = path.join(sandboxRoot, 'escape_link');
      let linkCreated = false;
      try {
        fs.symlinkSync(outsideDir, linkPath, 'junction');
        linkCreated = true;
      } catch {
        linkCreated = false;
      }

      if (linkCreated) {
        assert.throws(
          () => governance.assertInsideWorkspace(path.join(linkPath, 'secret.txt'), sandboxRoot),
          /Workspace isolation violation/
        );
      }
    });
  });
});

describe('M1 — lib/process-lock.js (PT30M Singleton Lock)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exports DEFAULT_MAX_AGE_MS = 30 minutes and validates isPidAlive strictly', () => {
    assert.equal(processLock.DEFAULT_MAX_AGE_MS, 30 * 60 * 1000);
    assert.equal(processLock.isPidAlive(process.pid), true);
    assert.equal(processLock.isPidAlive(99999999), false);
    for (const invalid of [0, -1, NaN, Infinity, -Infinity, 12.5, '123', null, undefined]) {
      assert.equal(processLock.isPidAlive(invalid), false, `Expected false for ${String(invalid)}`);
    }
  });

  it('acquires atomically with token, blocks same-process re-acquisition, and releases cleanly with zero listener leak', () => {
    const lockFile = path.join(tmpDir, 'test.lock');

    const first = processLock.acquireProcessLock({ lockFile });
    assert.equal(first.acquired, true);
    assert.ok(first.token);

    const diskLock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    assert.equal(diskLock.pid, process.pid);
    assert.equal(diskLock.token, first.token);
    assert.ok(diskLock.startedAt);

    // Same-process contention must NOT steal/overwrite its own active lock, and provides safe no-op release()
    const second = processLock.acquireProcessLock({ lockFile });
    assert.equal(second.acquired, false);
    assert.equal(second.holderPid, process.pid);
    assert.equal(second.reason, 'LOCK_HELD');
    assert.equal(typeof second.release, 'function');
    assert.deepEqual(second.release(), { released: false, reason: 'NOT_OWNER' });
    assert.equal(fs.existsSync(lockFile), true);
    assert.equal(JSON.parse(fs.readFileSync(lockFile, 'utf8')).token, first.token);

    // Idempotent double release
    const rel1 = first.release();
    assert.equal(rel1.released, true);
    assert.equal(fs.existsSync(lockFile), false);
    const rel2 = first.release();
    assert.equal(rel2.released, true);
    assert.equal(rel2.alreadyReleased, true);

    // Listener leak check across 15 acquire/release cycles
    const baseExit = process.listenerCount('exit');
    const baseSigInt = process.listenerCount('SIGINT');
    const baseSigTerm = process.listenerCount('SIGTERM');
    for (let i = 0; i < 15; i++) {
      const l = processLock.acquireProcessLock({ lockFile });
      assert.equal(l.acquired, true);
      l.release();
    }
    assert.equal(process.listenerCount('exit'), baseExit);
    assert.equal(process.listenerCount('SIGINT'), baseSigInt);
    assert.equal(process.listenerCount('SIGTERM'), baseSigTerm);
  });

  it('refuses to unlink a lock owned by a different token/process', () => {
    const lockFile = path.join(tmpDir, 'token_guard.lock');
    const lock = processLock.acquireProcessLock({ lockFile });
    assert.equal(lock.acquired, true);

    // Simulate external replacement with same PID but different token
    fs.writeFileSync(lockFile, JSON.stringify({
      pid: process.pid,
      token: 'other-owner-token',
      startedAt: new Date().toISOString()
    }), 'utf8');

    const rel = lock.release();
    assert.equal(rel.released, false);
    assert.equal(rel.reason, 'OWNED_BY_OTHER');
    assert.equal(fs.existsSync(lockFile), true);
  });

  it('recovers stale locks, dead-PID locks, and corrupt JSON locks', () => {
    const lockFile = path.join(tmpDir, 'recovery.lock');

    // 1. Stale lock (live PID, old timestamp)
    fs.writeFileSync(lockFile, JSON.stringify({
      pid: process.pid,
      token: 'old',
      startedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString()
    }), 'utf8');
    const r1 = processLock.acquireProcessLock({ lockFile });
    assert.equal(r1.acquired, true);
    r1.release();

    // 2. Dead-PID lock (fresh timestamp, dead PID)
    fs.writeFileSync(lockFile, JSON.stringify({
      pid: 99999999,
      token: 'dead',
      startedAt: new Date().toISOString()
    }), 'utf8');
    const r2 = processLock.acquireProcessLock({ lockFile });
    assert.equal(r2.acquired, true);
    r2.release();

    // 3. Corrupt JSON lock
    fs.writeFileSync(lockFile, '{corrupt json', 'utf8');
    const r3 = processLock.acquireProcessLock({ lockFile });
    assert.equal(r3.acquired, true);
    r3.release();
  });

  it('prevents stale-lock recovery TOCTOU preemption from clobbering a racing winner live lock', () => {
    const lockFile = path.join(tmpDir, 'preempt.lock');
    const guardFile = `${lockFile}.recovering`;

    // Seed an expired stale lock
    fs.writeFileSync(lockFile, JSON.stringify({
      pid: process.pid,
      token: 'expired-stale-token',
      startedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString()
    }), 'utf8');

    const origWriteFileSync = fs.writeFileSync;
    let preemptorResult = null;
    let injected = false;

    fs.writeFileSync = function patchedWriteFileSync(target, data, options) {
      if (!injected && target === guardFile && options && options.flag === 'wx') {
        injected = true;
        // Simulate another process preempting right after stale read and before guard acquisition
        fs.writeFileSync = origWriteFileSync;
        preemptorResult = processLock.acquireProcessLock({ lockFile });
      }
      return origWriteFileSync.apply(fs, arguments);
    };

    let delayedResult;
    try {
      delayedResult = processLock.acquireProcessLock({ lockFile });
    } finally {
      fs.writeFileSync = origWriteFileSync;
    }

    assert.equal(injected, true);
    assert.equal(preemptorResult.acquired, true);
    assert.equal(delayedResult.acquired, false);
    assert.equal(delayedResult.reason, 'LOCK_HELD');
    assert.equal(fs.existsSync(guardFile), false);

    // Confirm preemptor's live lock was NOT clobbered and releases cleanly
    const onDisk = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    assert.equal(onDisk.token, preemptorResult.token);
    assert.deepEqual(preemptorResult.release(), { released: true, reason: 'RELEASED' });
  });

  it('respects an active recovery guard and cleans up a stale recovery guard', () => {
    const lockFile = path.join(tmpDir, 'guard.lock');
    const guardFile = `${lockFile}.recovering`;

    // Seed stale lock + fresh active recovery guard owned by live PID
    fs.writeFileSync(lockFile, JSON.stringify({
      pid: 99999999,
      token: 'dead-lock-token',
      startedAt: new Date().toISOString()
    }), 'utf8');
    fs.writeFileSync(guardFile, JSON.stringify({
      pid: process.pid,
      token: 'active-guard-token',
      startedAt: new Date().toISOString()
    }), 'utf8');

    const blocked = processLock.acquireProcessLock({ lockFile });
    assert.equal(blocked.acquired, false);
    assert.equal(blocked.reason, 'CONTENTION');
    assert.equal(typeof blocked.release, 'function');
    assert.deepEqual(blocked.release(), { released: false, reason: 'NOT_OWNER' });
    assert.equal(JSON.parse(fs.readFileSync(lockFile, 'utf8')).token, 'dead-lock-token');
    assert.equal(fs.existsSync(guardFile), true);

    // Make the recovery guard stale (> 10s old) and verify recovery proceeds cleanly
    fs.writeFileSync(guardFile, JSON.stringify({
      pid: process.pid,
      token: 'stale-guard-token',
      startedAt: new Date(Date.now() - 15000).toISOString()
    }), 'utf8');

    const recovered = processLock.acquireProcessLock({ lockFile });
    assert.equal(recovered.acquired, true);
    assert.equal(fs.existsSync(guardFile), false);
    assert.deepEqual(recovered.release(), { released: true, reason: 'RELEASED' });
  });

  it('blocks cross-process child contention and acquires after child exits', async () => {
    const lockFile = path.join(tmpDir, 'cross_proc.lock');
    const lockModulePath = path.join(ROOT_DIR, 'lib/process-lock.js');

    const child = spawn(process.execPath, [
      '-e',
      `const pl = require(${JSON.stringify(lockModulePath)});
       const l = pl.acquireProcessLock({ lockFile: ${JSON.stringify(lockFile)} });
       if (!l.acquired) process.exit(2);
       process.stdout.write('LOCKED\\n');
       setTimeout(() => { l.release(); process.exit(0); }, 400);`
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    await new Promise((resolve, reject) => {
      let buf = '';
      child.stdout.on('data', chunk => {
        buf += chunk.toString();
        if (buf.includes('LOCKED')) resolve();
      });
      child.on('error', reject);
      child.on('exit', code => {
        if (!buf.includes('LOCKED')) reject(new Error(`Child exited early with code ${code}`));
      });
    });

    const contended = processLock.acquireProcessLock({ lockFile });
    assert.equal(contended.acquired, false);
    assert.equal(contended.holderPid, child.pid);

    await new Promise(resolve => child.once('exit', resolve));

    const acquiredAfter = processLock.acquireProcessLock({ lockFile });
    assert.equal(acquiredAfter.acquired, true);
    acquiredAfter.release();
  });
});

describe('M1 — lib/content-planner.js (ICT Timezone, Unified Slots, Auto-Extend & Rule 5)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('aligns day and date in Asia/Ho_Chi_Minh across UTC midnight', () => {
    // 2026-11-24T17:00:00.000Z === 2026-11-25 00:00:00 ICT (Wednesday = Thứ Tư)
    const parts = contentPlanner.getLocalTimeParts('2026-11-24T17:00:00.000Z');
    assert.equal(parts.dateStr, '2026-11-25');
    assert.equal(parts.dayName, 'Thứ Tư');
    assert.equal(parts.hour, 0);

    const plan = contentPlanner.generatePlan('2026-11-24T17:30:00.000Z', 7);
    assert.equal(plan.length, 21);
    assert.equal(plan[0].date, '2026-11-25');
    assert.equal(plan[0].day, 'Thứ Tư');
    assert.deepEqual(plan.slice(0, 3).map(s => s.slot_time), ['08:30', '11:30', '19:45']);
  });

  it('honors totalDays in generateWeeklyPlan & generateMonthlyPlan and unifies slots to 08:30, 11:30, 19:45', () => {
    const weekly = contentPlanner.generateWeeklyPlan('2026-11-25', 5);
    assert.equal(weekly.length, 15);
    const monthly = contentPlanner.generateMonthlyPlan('2026-11-25', 30);
    assert.equal(monthly.length, 90);

    const validTimes = new Set(['08:30', '11:30', '19:45']);
    assert.deepEqual(contentPlanner.DAILY_SCHEDULE_SLOTS.map(s => s.time), ['08:30', '11:30', '19:45']);
    for (const pillar of contentPlanner.BRAND_PILLARS) {
      assert.ok(validTimes.has(pillar.time_slot), `Unexpected pillar time_slot: ${pillar.time_slot}`);
    }
  });

  it('pickTodaySlot skips expired past slots, picks closest ICT slot, and auto-extends today without touching real calendar', () => {
    const calPath = path.join(tmpDir, 'calendar.json');
    const pastOnlyPlan = [
      {
        slot_id: 'slot_2026-11-14_0830',
        date: '2026-11-14',
        slot_time: '08:30',
        status: 'SCHEDULED',
        concept_hook: 'Old past slot'
      },
      {
        slot_id: 'slot_2026-11-20_1945',
        date: '2026-11-20',
        slot_time: '19:45',
        status: 'SCHEDULED',
        concept_hook: 'Another past slot'
      }
    ];
    fs.writeFileSync(calPath, JSON.stringify({ plan: pastOnlyPlan }), 'utf8');

    // Now = 2026-11-25 11:15 ICT (04:15Z)
    const chosen = contentPlanner.pickTodaySlot({
      calendarPath: calPath,
      now: '2026-11-25T04:15:00.000Z',
      persist: true,
      extendDays: 3
    });
    assert.equal(chosen.date, '2026-11-25');
    assert.equal(chosen.slot_time, '11:30');

    const persisted = JSON.parse(fs.readFileSync(calPath, 'utf8'));
    assert.equal(persisted.plan[0].status, 'EXPIRED');
    assert.equal(persisted.plan[1].status, 'EXPIRED');

    // When all 3 slots for today are PUBLISHED, pick earliest future pending slot
    for (const s of persisted.plan) {
      if (s.date === '2026-11-25') s.status = 'PUBLISHED';
    }
    const nextFuture = contentPlanner.pickTodaySlot({
      plan: persisted.plan,
      now: '2026-11-25T13:00:00.000Z'
    });
    assert.equal(nextFuture.date, '2026-11-26');
    assert.equal(nextFuture.slot_time, '08:30');
  });

  it('loadCalendar/saveCalendar round-trip and pickTodaySlot selects newly added future slot when tomorrow first slot is PUBLISHED', () => {
    const calPath = path.join(tmpDir, 'nested', 'cal.json');
    const missing = contentPlanner.loadCalendar(calPath);
    assert.deepEqual(missing.plan, []);

    const seedPlan = [
      {
        slot_id: 'slot_2026-11-25_0830',
        date: '2026-11-25',
        slot_time: '08:30',
        status: 'PUBLISHED',
        concept_hook: 'Today morning'
      },
      {
        slot_id: 'slot_2026-11-25_1130',
        date: '2026-11-25',
        slot_time: '11:30',
        status: 'PUBLISHED',
        concept_hook: 'Today noon'
      },
      {
        slot_id: 'slot_2026-11-25_1945',
        date: '2026-11-25',
        slot_time: '19:45',
        status: 'PUBLISHED',
        concept_hook: 'Today evening'
      },
      {
        slot_id: 'slot_2026-11-26_0830',
        date: '2026-11-26',
        slot_time: '08:30',
        status: 'PUBLISHED',
        concept_hook: 'Tomorrow morning already published'
      }
    ];
    contentPlanner.saveCalendar({ plan: seedPlan }, calPath);
    const loaded = contentPlanner.loadCalendar(calPath);
    assert.equal(loaded.total_slots, 4);

    const chosen = contentPlanner.pickTodaySlot({
      calendarPath: calPath,
      now: '2026-11-25T13:00:00.000Z',
      persist: true,
      extendDays: 2
    });
    assert.ok(chosen);
    assert.equal(chosen.slot_id, 'slot_2026-11-26_1130');
    assert.equal(chosen.status, 'SCHEDULED');

    const persisted = contentPlanner.loadCalendar(calPath);
    assert.ok(persisted.plan.some(s => s.slot_id === 'slot_2026-11-26_1130'));

    // When today and tomorrow are completely saturated (all 3 slots PUBLISHED), pickTodaySlot({ extendDays: 1 })
    // must advance past tomorrow and return a valid SCHEDULED slot on 2026-11-27 instead of null.
    const saturatedPlan = [
      ...seedPlan,
      {
        slot_id: 'slot_2026-11-26_1130',
        date: '2026-11-26',
        slot_time: '11:30',
        status: 'PUBLISHED',
        concept_hook: 'Tomorrow noon already published'
      },
      {
        slot_id: 'slot_2026-11-26_1945',
        date: '2026-11-26',
        slot_time: '19:45',
        status: 'PUBLISHED',
        concept_hook: 'Tomorrow evening already published'
      }
    ];
    const saturatedCalPath = path.join(tmpDir, 'saturated_cal.json');
    contentPlanner.saveCalendar({ plan: saturatedPlan }, saturatedCalPath);
    const rolloverChosen = contentPlanner.pickTodaySlot({
      calendarPath: saturatedCalPath,
      now: '2026-11-25T13:00:00.000Z',
      persist: true,
      extendDays: 1
    });
    assert.ok(rolloverChosen, 'Expected a valid SCHEDULED slot past saturated tomorrow, got null');
    assert.equal(rolloverChosen.date, '2026-11-27');
    assert.equal(rolloverChosen.slot_time, '08:30');
    assert.equal(rolloverChosen.status, 'SCHEDULED');

    const corruptCalPath = path.join(tmpDir, 'corrupt_cal.json');
    fs.writeFileSync(corruptCalPath, '{corrupt calendar json', 'utf8');
    const calWarnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => calWarnings.push(String(msg));
    try {
      const recoveredCal = contentPlanner.loadCalendar(corruptCalPath);
      assert.deepEqual(recoveredCal.plan, []);
      assert.equal(recoveredCal.total_slots, 0);
      assert.ok(calWarnings.some(w => w.includes('content-planner')));
    } finally {
      console.warn = origWarn;
    }
  });

  it('covers all 4 nhacualand.com segments, validates SPACE_ARCHETYPES, and passes Rule 5 hook checks', () => {
    const segments = new Set(contentPlanner.BRAND_PILLARS.map(p => p.segment));
    for (const expected of ['Phòng Studio', 'Căn hộ dịch vụ', 'Chung cư mini', 'Phòng trọ cao cấp']) {
      assert.ok(segments.has(expected), `Missing segment: ${expected}`);
    }

    const validSpaceIds = new Set(SPACE_ARCHETYPES.map(a => a.id));
    for (const pillar of contentPlanner.BRAND_PILLARS) {
      assert.ok(!/triết lý|nghệ thuật|nhacualand|nhà cửa land|nhà của land/i.test(pillar.name));
      for (const item of pillar.sample_hooks) {
        assert.ok(validSpaceIds.has(item.space_id), `Unknown space_id: ${item.space_id}`);
        const check = governance.evaluateContent({
          caption: `${item.hook}. Tối về mở cửa phòng thấy dễ chịu là mừng rồi.`
        });
        assert.equal(check.allowed, true, `Hook failed Rule 5 (${item.hook}): ${check.violations.join(' | ')}`);
      }
    }
  });
});

describe('M1 — config/brand.json & config/offer_catalog.json (Rule 5 Isolation)', () => {
  it('config/brand.json preserves top-level identity fields while isolating Rule 5 caption policy & hashtags', () => {
    assert.equal(BRAND_CONFIG.brand_id, 'nhacualand');
    assert.equal(BRAND_CONFIG.name, 'Nhà Của Land');
    assert.equal(BRAND_CONFIG.website, 'https://nhacualand.com');
    assert.ok(BRAND_CONFIG.hotline);
    assert.equal(BRAND_CONFIG.admin_email, 'quannguyentop1lux@gmail.com');
    assert.deepEqual(BRAND_CONFIG.allowed_admin_emails, ['quannguyentop1lux@gmail.com', 'ducquan16102006@gmail.com']);
    assert.equal(BRAND_CONFIG.social.facebook_page_id, '1337253129481940');
    assert.equal(BRAND_CONFIG.social.facebook_page_name, 'Nhacualand');
    assert.equal(BRAND_CONFIG.identity_scope, 'NON_CAPTION_BIO_WEBSITE_AND_ASSET_GUARD_ONLY');
    assert.deepEqual(BRAND_CONFIG.hashtags, ['#phongtro', '#chothuephong']);
    assert.ok(BRAND_CONFIG.caption_policy);
    assert.equal(BRAND_CONFIG.caption_policy.allow_brand_name, false);
    assert.equal(BRAND_CONFIG.caption_policy.allow_offers_or_cta, false);
    assert.ok(!/nhacualand|nhà của land|nhà cửa land/i.test(JSON.stringify(BRAND_CONFIG.persona)));
  });

  it('config/offer_catalog.json preserves offer IDs and explicitly disables social caption usage', () => {
    assert.equal(OFFER_CONFIG.caption_enabled, false);
    assert.equal(OFFER_CONFIG.social_caption_policy, 'DISABLED_BY_RULE_5');
    assert.equal(OFFER_CONFIG.usage_scope, 'WEBSITE_AND_DIRECT_INQUIRY_ONLY_NEVER_SOCIAL_CAPTIONS');
    const ids = OFFER_CONFIG.active_offers.map(o => o.offer_id);
    assert.deepEqual(ids, ['OFFER_COC_GIU_PHONG', 'OFFER_FREE_DICH_VU', 'OFFER_COMBO_DON_PHONG']);
    for (const offer of OFFER_CONFIG.active_offers) {
      assert.equal(offer.caption_eligible, false);
    }
  });
});

function hashIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('M1 — Dynamic process.env.DATA_DIR Isolation (Post-require switching)', () => {
  let tmpRoot;
  let origDataDir;

  beforeEach(() => {
    tmpRoot = makeTempDir();
    origDataDir = process.env.DATA_DIR;
  });

  afterEach(() => {
    if (origDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = origDataDir;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('switches process.env.DATA_DIR dynamically across dirA -> dirB without re-require or mutating D:\\Facebook\\data', () => {
    const prodHistoryPath = path.join(ROOT_DIR, 'data', 'publish_history.json');
    const prodCalendarPath = path.join(ROOT_DIR, 'data', 'scheduled_calendar.json');
    const prodLockPath = path.join(ROOT_DIR, 'data', 'orchestrator.lock');

    const beforeHistoryHash = hashIfExists(prodHistoryPath);
    const beforeCalendarHash = hashIfExists(prodCalendarPath);
    const beforeLockExists = fs.existsSync(prodLockPath);

    const dirA = path.join(tmpRoot, 'dirA');
    const dirB = path.join(tmpRoot, 'dirB');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });

    // Phase 1: dirA
    process.env.DATA_DIR = dirA;
    assert.equal(path.resolve(processLock.getDefaultLockFile()), path.resolve(path.join(dirA, 'orchestrator.lock')));
    assert.equal(path.resolve(governance.getHistoryFile()), path.resolve(path.join(dirA, 'publish_history.json')));
    assert.equal(path.resolve(contentPlanner.getDefaultCalendarFile()), path.resolve(path.join(dirA, 'scheduled_calendar.json')));

    const lockA = processLock.acquireProcessLock();
    assert.equal(lockA.acquired, true);
    assert.equal(path.resolve(lockA.lockFile), path.resolve(path.join(dirA, 'orchestrator.lock')));
    assert.equal(fs.existsSync(path.join(dirA, 'orchestrator.lock')), true);
    lockA.release();

    governance.recordPublishEvent({ platform: 'facebook', message: 'Post in dirA' });
    assert.equal(fs.existsSync(path.join(dirA, 'publish_history.json')), true);
    const rateA = governance.checkPublishRateLimit('facebook');
    assert.equal(rateA.countToday, 1);
    assert.equal(rateA.dailyCount, 1);

    contentPlanner.saveCalendar({
      plan: [
        {
          slot_id: 'slot_2026-11-25_1130',
          date: '2026-11-25',
          slot_time: '11:30',
          status: 'SCHEDULED',
          concept_hook: 'Slot in dirA'
        }
      ]
    });
    const pickedA = contentPlanner.pickTodaySlot({ now: '2026-11-25T04:15:00.000Z' });
    assert.equal(pickedA.concept_hook, 'Slot in dirA');

    // Phase 2: Switch to dirB without clearing require cache
    process.env.DATA_DIR = dirB;
    assert.equal(path.resolve(processLock.getDefaultLockFile()), path.resolve(path.join(dirB, 'orchestrator.lock')));
    assert.equal(path.resolve(governance.getHistoryFile()), path.resolve(path.join(dirB, 'publish_history.json')));
    assert.equal(path.resolve(contentPlanner.getDefaultCalendarFile()), path.resolve(path.join(dirB, 'scheduled_calendar.json')));

    const lockB = processLock.acquireProcessLock();
    assert.equal(lockB.acquired, true);
    assert.equal(path.resolve(lockB.lockFile), path.resolve(path.join(dirB, 'orchestrator.lock')));
    assert.equal(fs.existsSync(path.join(dirB, 'orchestrator.lock')), true);
    assert.equal(fs.existsSync(path.join(dirA, 'orchestrator.lock')), false);
    lockB.release();

    const rateBEmpty = governance.checkPublishRateLimit('facebook');
    assert.equal(rateBEmpty.countToday, 0);
    assert.equal(rateBEmpty.dailyCount, 0);

    // pickTodaySlot with persist: true and NO calendarPath writes to dirB/scheduled_calendar.json
    const pickedB = contentPlanner.pickTodaySlot({
      now: '2026-11-25T04:15:00.000Z',
      persist: true,
      extendDays: 1
    });
    assert.equal(pickedB.date, '2026-11-25');
    assert.equal(fs.existsSync(path.join(dirB, 'scheduled_calendar.json')), true);

    assert.equal(hashIfExists(prodHistoryPath), beforeHistoryHash);
    assert.equal(hashIfExists(prodCalendarPath), beforeCalendarHash);
    assert.equal(fs.existsSync(prodLockPath), beforeLockExists);
  });
});

describe('M1 — lib/env-loader.js (Non-Clobbering & Parsing)', () => {
  let tmpDir;
  let savedEnv;
  const trackedKeys = [
    'DRY_RUN',
    'AUTO_PUBLISH',
    'GOOGLE_FLOW_ENABLED',
    'GEMINI_API_KEY',
    'DATA_DIR',
    'M1_TEST_NEW_KEY',
    'M1_TEST_BOM_KEY',
    'M1_TEST_EXPORT_KEY',
    'M1_TEST_DOUBLE_QUOTED',
    'M1_TEST_SINGLE_QUOTED',
    'M1_TEST_SINGLE_CHAR_DQUOTE',
    'M1_TEST_SINGLE_CHAR_SQUOTE',
    'M1_TEST_INLINE_COMMENT',
    'M1_TEST_DQUOTED_COMMENT',
    'M1_TEST_SQUOTED_COMMENT',
    'M1_TEST_QUOTED_HASH_AND_COMMENT'
  ];

  beforeEach(() => {
    tmpDir = makeTempDir();
    savedEnv = {};
    for (const key of trackedKeys) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of trackedKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves pre-set process.env values (including empty string) while loading missing keys and supporting override', () => {
    const customEnv = path.join(tmpDir, 'test.env');
    fs.writeFileSync(customEnv, [
      'DRY_RUN=false',
      'AUTO_PUBLISH=true',
      'GOOGLE_FLOW_ENABLED=true',
      'GEMINI_API_KEY=real-key-from-file',
      'DATA_DIR=D:\\ShouldNotOverwrite',
      'M1_TEST_NEW_KEY=loaded_value'
    ].join('\n'), 'utf8');

    process.env.DRY_RUN = 'true';
    process.env.AUTO_PUBLISH = 'false';
    process.env.GOOGLE_FLOW_ENABLED = 'false';
    process.env.GEMINI_API_KEY = '';
    process.env.DATA_DIR = tmpDir;
    delete process.env.M1_TEST_NEW_KEY;

    const res = envLoader.loadEnv(customEnv);
    assert.equal(res.loaded, true);
    assert.equal(process.env.DRY_RUN, 'true');
    assert.equal(process.env.AUTO_PUBLISH, 'false');
    assert.equal(process.env.GOOGLE_FLOW_ENABLED, 'false');
    assert.equal(process.env.GEMINI_API_KEY, '');
    assert.equal(process.env.DATA_DIR, tmpDir);
    assert.equal(process.env.M1_TEST_NEW_KEY, 'loaded_value');
    assert.deepEqual(res.appliedKeys, ['M1_TEST_NEW_KEY']);

    const overrideRes = envLoader.loadEnv(customEnv, { override: true });
    assert.equal(overrideRes.loaded, true);
    assert.equal(process.env.DRY_RUN, 'false');
    assert.equal(process.env.GEMINI_API_KEY, 'real-key-from-file');
  });

  it('handles BOM, export prefix, quotes, single-char quotes, inline comments, empty keys, and invalid paths gracefully', () => {
    const edgeEnv = path.join(tmpDir, 'edge.env');
    fs.writeFileSync(edgeEnv, [
      '\uFEFF# Leading comment after BOM',
      'M1_TEST_BOM_KEY=bom_ok',
      '',
      '  # Indented comment',
      'export M1_TEST_EXPORT_KEY=exported_val',
      'M1_TEST_DOUBLE_QUOTED="hello # kept"',
      "M1_TEST_SINGLE_QUOTED='world # kept'",
      'M1_TEST_SINGLE_CHAR_DQUOTE="',
      "M1_TEST_SINGLE_CHAR_SQUOTE='",
      'M1_TEST_INLINE_COMMENT=clean_value # trailing comment',
      'M1_TEST_DQUOTED_COMMENT="quoted_val" # trailing comment',
      "M1_TEST_SQUOTED_COMMENT='quoted_val' # comment",
      'M1_TEST_QUOTED_HASH_AND_COMMENT="abc#def" # trailing comment',
      '=ignored_empty_key',
      'LINE_WITHOUT_EQUALS'
    ].join('\r\n'), 'utf8');

    for (const k of trackedKeys) {
      if (k.startsWith('M1_TEST_')) delete process.env[k];
    }

    const loaded = envLoader.loadEnv(edgeEnv);
    assert.equal(loaded.loaded, true);
    assert.equal(process.env.M1_TEST_BOM_KEY, 'bom_ok');
    assert.equal(process.env.M1_TEST_EXPORT_KEY, 'exported_val');
    assert.equal(process.env.M1_TEST_DOUBLE_QUOTED, 'hello # kept');
    assert.equal(process.env.M1_TEST_SINGLE_QUOTED, 'world # kept');
    assert.equal(process.env.M1_TEST_SINGLE_CHAR_DQUOTE, '"');
    assert.equal(process.env.M1_TEST_SINGLE_CHAR_SQUOTE, "'");
    assert.equal(process.env.M1_TEST_INLINE_COMMENT, 'clean_value');
    assert.equal(process.env.M1_TEST_DQUOTED_COMMENT, 'quoted_val');
    assert.equal(process.env.M1_TEST_SQUOTED_COMMENT, 'quoted_val');
    assert.equal(process.env.M1_TEST_QUOTED_HASH_AND_COMMENT, 'abc#def');
    assert.equal(process.env[''], undefined);

    assert.deepEqual(envLoader.loadEnv(null), { loaded: false, envPath: null, appliedKeys: [] });
    assert.deepEqual(envLoader.loadEnv(''), { loaded: false, envPath: '', appliedKeys: [] });
    assert.deepEqual(envLoader.loadEnv(12345), { loaded: false, envPath: 12345, appliedKeys: [] });
    const missingPath = path.join(tmpDir, 'does_not_exist.env');
    assert.deepEqual(envLoader.loadEnv(missingPath), { loaded: false, envPath: missingPath, appliedKeys: [] });
  });
});
