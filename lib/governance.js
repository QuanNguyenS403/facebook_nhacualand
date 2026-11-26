'use strict';

/**
 * BRAND SAFETY, SELF-APPROVAL GOVERNANCE, WORKSPACE ISOLATION & PER-PLATFORM RATE LIMITING
 * Thương hiệu: Nhà Của Land (nhacualand.com) — Chỉ duy nhất tại D:\Facebook
 *
 * Quy chuẩn Rule 5 (AGENTS.md):
 * - Ngắn gọn 2–4 câu (đọc trong 5 giây), ngôn từ bình dân, chân thực.
 * - Cấm tuyệt đối: quảng cáo/sale/chốt cọc/CTA, hotline/URL, giá tiền, câu khẳng định tâng bốc,
 *   và nhắc tên riêng thương hiệu trong caption/title.
 * - Kiểm soát tần suất độc lập theo từng nền tảng theo múi giờ Asia/Ho_Chi_Minh (ICT).
 */

require('./env-loader');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_WORKSPACE_ROOT = 'D:\\Facebook';
const HISTORY_FILE = path.resolve(__dirname, '../data/publish_history.json');
const OFFER_CATALOG_PATH = path.resolve(__dirname, '../config/offer_catalog.json');
let cachedOfferCatalog = { mtimeMs: -1, codes: [], titles: [] };

function getOfferCatalogLeakTokens() {
  try {
    if (!fs.existsSync(OFFER_CATALOG_PATH)) {
      return { codes: [], titles: [] };
    }
    const stat = fs.statSync(OFFER_CATALOG_PATH);
    if (stat.mtimeMs === cachedOfferCatalog.mtimeMs) {
      return cachedOfferCatalog;
    }
    const parsed = JSON.parse(fs.readFileSync(OFFER_CATALOG_PATH, 'utf8'));
    const offers = [
      ...(Array.isArray(parsed && parsed.active_offers) ? parsed.active_offers : []),
      ...(Array.isArray(parsed && parsed.offers) ? parsed.offers : [])
    ];
    const codes = [];
    const titles = [];
    for (const offer of offers) {
      if (!offer || typeof offer !== 'object') continue;
      if (typeof offer.code === 'string') {
        const foldedCode = foldVietnamese(offer.code).replace(/[^a-z0-9_-]/g, '');
        if (foldedCode.length >= 4) codes.push(foldedCode);
      }
      if (typeof offer.title === 'string') {
        const foldedTitle = foldVietnamese(offer.title).replace(/\s+/g, ' ').trim();
        if (foldedTitle.length >= 15) titles.push(foldedTitle);
      }
    }
    cachedOfferCatalog = {
      mtimeMs: stat.mtimeMs,
      codes: [...new Set(codes)],
      titles: [...new Set(titles)]
    };
    return cachedOfferCatalog;
  } catch (e) {
    return { codes: [], titles: [] };
  }
}

function getDataDir() {
  const raw = process.env.DATA_DIR;
  return (typeof raw === 'string' && raw.trim())
    ? path.resolve(raw.trim())
    : path.resolve(__dirname, '../data');
}

function getHistoryFile() {
  return path.join(getDataDir(), 'publish_history.json');
}

const ZERO_WIDTH_RE = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

function getCooldownMinutes() {
  const n = parseInt(process.env.RATE_LIMIT_COOLDOWN_MINUTES || '15', 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function getMaxPostsPerDay() {
  const n = parseInt(process.env.MAX_POSTS_PER_PLATFORM_PER_DAY || '8', 10);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

const BANNED_POLICIES = {
  RENTAL_FRAUD: [
    'lừa đảo tiền cọc', 'phòng ma', 'bán nhà ma', 'lừa tiền cọc',
    'bùng cọc', 'nhà trọ lừa đảo', 'đa cấp thuê nhà', 'chiếm đoạt cọc',
    'tin ảo', 'ảnh mạng lừa đảo'
  ],
  MISLEADING_CLAIMS: [
    'rẻ nhất việt nam', 'rẻ nhất vũ trụ', 'ở miễn phí trọn đời',
    'số 1 việt nam', 'duy nhất trên đời', 'không đâu có', 'hoàn tiền 1000%',
    'trúng thưởng 100%', 'vỡ nợ thanh lý nhà', 'xả gấp trốn nợ',
    'số 1', 'số một', 'hàng đầu', 'chuyên nghiệp nhất', 'khẳng định uy tín',
    'hoàn hảo nhất', 'tuyệt đối nhất', 'đẳng cấp nhất', 'tốt nhất', 'rẻ nhất',
    'đẹp nhất', 'uy tín nhất', 'cao cấp nhất'
  ],
  ENGAGEMENT_BAIT: [
    'tăng follow', 'hack sub', 'chia sẻ vào 10 nhóm', 'tag 5 bạn bè',
    'chấm để nhận lộc', 'share ngay trúng lớn', 'chấm nhận giá', 'chốt cọc ngay'
  ]
};

const BANNED_BRAND_NAMES = ['nhacualand', 'nhà cửa land', 'nhà của land', 'nhacualand.com'];
const REQUIRED_TAGS = ['#phongtro', '#chothuephong'];

const BANNED_HASHTAG_TERMS = [
  'nhacualand', 'giamgia', 'voucher', 'datcoc', 'chotcoc', 'giare',
  'khuyenmai', 'hotline', 'inbox', 'uudai', 'mienphi', 'chothuegap',
  'phonggiare', 'nhatrogiare', 'phongdepgiatot', 'sale',
  'lienhe', 'giatot', 'quangcao', 'booking', 'deal', 'promo',
  'ibngay', 'dmngay', 'nhangia', 'tuvan', 'truycap', 'chinhchu', 'phongdepgiare',
  'chotngay', 'chotphong', 'datphong', 'nhanhtay', 'xemphongngay',
  'linkbio', 'vaobio', 'ghebio', 'xembio', 'bamlink', 'datlich',
  'giuphong', 'thuengay', 'cmtngay', 'commentngay', 'chaothue', 'giahoi',
  'callngay', 'goingay', 'nhantin', 'nhanngay', 'lienlac', 'zalo',
  'sodienthoai', 'canchothue', 'thanhly', 'giucho', 'moixemphong', 'xaphong',
  'mienphicoc', 'mienphithang'
];

const HOMOGLYPH_CASE_MAP = {
  // Cyrillic lookalikes
  '\u0430': 'a', '\u0410': 'A',
  '\u0435': 'e', '\u0415': 'E',
  '\u043E': 'o', '\u041E': 'O',
  '\u0440': 'p', '\u0420': 'P',
  '\u0441': 'c', '\u0421': 'C',
  '\u0445': 'x', '\u0425': 'X',
  '\u0456': 'i', '\u0406': 'I',
  '\u0443': 'y', '\u0423': 'Y',
  '\u043A': 'k', '\u041A': 'K',
  '\u043C': 'm', '\u041C': 'M',
  '\u043D': 'h', '\u041D': 'H',
  '\u0442': 't', '\u0422': 'T',
  '\u0432': 'b', '\u0412': 'B',
  '\u04BB': 'h', '\u04BA': 'H',
  '\u04CF': 'l', '\u04C0': 'L',
  '\u0501': 'd', '\u0500': 'D',
  '\u0455': 's', '\u0405': 'S',
  '\u0458': 'j', '\u0408': 'J',
  '\u04AF': 'y', '\u04AE': 'Y',
  '\u051B': 'q', '\u051A': 'Q',
  '\u051D': 'w', '\u051C': 'W',
  // Greek lookalikes
  '\u03B1': 'a', '\u0391': 'A',
  '\u03B2': 'b', '\u0392': 'B',
  '\u03B5': 'e', '\u0395': 'E',
  '\u0396': 'Z',
  '\u03B7': 'n', '\u0397': 'H',
  '\u03B9': 'i', '\u0399': 'I',
  '\u03BA': 'k', '\u039A': 'K',
  '\u039C': 'M',
  '\u03BD': 'v', '\u039D': 'N',
  '\u03BF': 'o', '\u039F': 'O',
  '\u03C1': 'p', '\u03A1': 'P',
  '\u03C4': 't', '\u03A4': 'T',
  '\u03C5': 'y', '\u03A5': 'Y',
  '\u03C7': 'x', '\u03A7': 'X',
  '\u03F2': 'c', '\u03F9': 'C',
  // Latin & punctuation lookalikes
  '\u0131': 'i',
  '\u00B7': '.',
  '\u2024': '.',
  '\u2027': '.',
  '\u2219': '.',
  '\u22C5': '.',
  '\u3002': '.',
  '\uFF0E': '.',
  '\uFF61': '.'
};

const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPH_CASE_MAP).join('')}]`, 'g');

function stripZeroWidthAndNfc(str = '') {
  if (str === null || str === undefined) return '';
  return String(str).replace(ZERO_WIDTH_RE, '').normalize('NFC').replace(ZERO_WIDTH_RE, '');
}

function stripZeroWidthAndNfkc(str = '') {
  if (str === null || str === undefined) return '';
  return String(str).replace(ZERO_WIDTH_RE, '').normalize('NFKC').replace(ZERO_WIDTH_RE, '');
}

function foldHomoglyphs(str = '') {
  return stripZeroWidthAndNfkc(str)
    .replace(HOMOGLYPH_RE, ch => HOMOGLYPH_CASE_MAP[ch] || ch)
    .normalize('NFC');
}

function foldVietnameseKeepCase(str = '') {
  return foldHomoglyphs(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function foldVietnamese(str = '') {
  return foldVietnameseKeepCase(str).toLowerCase();
}

function toValidDate(input) {
  if (input === null || input === '' || typeof input === 'boolean') return null;
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(d.getTime()) || !Number.isFinite(d.getTime())) return null;
  return d;
}

/**
 * Trả về chuỗi ngày YYYY-MM-DD theo múi giờ địa phương (mặc định Asia/Ho_Chi_Minh).
 */
function getLocalDateString(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const d = toValidDate(date);
  if (!d) {
    throw new TypeError('Invalid date supplied to getLocalDateString');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);

  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Tách thân bài khỏi chuỗi hashtag cuối dòng/cuối bài.
 */
function extractBodyWithoutTrailingHashtags(text = '') {
  const clean = stripZeroWidthAndNfc(text).trim();
  if (!clean) return '';

  const lines = clean.split(/\r?\n/);
  while (lines.length > 0 && /^\s*(?:#[\p{L}\p{N}_-]+\s*)+$/u.test(lines[lines.length - 1])) {
    lines.pop();
  }
  const withoutTrailingLines = lines
    .filter(line => !/^\s*(?:#[\p{L}\p{N}_-]+\s*)+$/u.test(line))
    .join('\n');

  return withoutTrailingLines
    .replace(/(?:(?:\s+|(?<=[.!?…]))#[\p{L}\p{N}_-]+)+\s*$/gu, '')
    .trim();
}

/**
 * Đếm số câu tiếng Việt / Latin trong caption, bỏ qua hashtag, số thập phân (2.5, 18.5m2, 3.000.000)
 * và các từ viết tắt phổ biến (TP.HCM, Q.1, P.2, v.v.).
 */
function countSentences(text = '') {
  if (text === null || text === undefined) return 0;
  const body = extractBodyWithoutTrailingHashtags(String(text));
  if (!body) return 0;

  let protectedText = body
    // Bảo vệ số thập phân và dấu phân cách hàng nghìn (2.5, 18.5m2, 3.000.000)
    .replace(/(?<=\d)\.(?=\d)/g, '\uE000')
    // Bảo vệ domain/URL phổ biến nếu xuất hiện trong văn bản (không nuốt dấu chấm trước từ tiếng Việt viết hoa thiếu khoảng trắng như "thoáng.Co")
    .replace(/(?<![\p{L}\p{N}-])(?:[\p{L}\p{N}-]+\.)+(?:com|vn|net|org|info|biz|xyz|top|site|online|store|shop|land|house|app|click|vip|pro|link|rent|live|page)\b/giu, m => m.replace(/\./g, '\uE000'))
    .replace(/(?<![\p{L}\p{N}-])(?:[\p{L}\p{N}-]+\.)+(?!Co(?![\p{L}\p{N}])|Io(?![\p{L}\p{N}])|Me(?![\p{L}\p{N}]))(?:[iI][oO]|[cC][oO]|[mM][eE])(?![\p{L}\p{N}])/gu, m => m.replace(/\./g, '\uE000'))
    .replace(/(?<![\p{L}\p{N}-])(?:[\p{L}\p{N}-]+\.)+(?:io|co|do|ly|me|gg|to|in|id|be)(?=\/\S+)/giu, m => m.replace(/\./g, '\uE000'))
    // Bảo vệ viết tắt nhiều phần
    .replace(/\b(TP)\.(HCM|HN)\b/gi, '$1\uE000$2')
    .replace(/\b([vV])\.([vV])\.(?=\s+\p{Lu})/gu, '$1\uE000$2.')
    .replace(/\bv\.v\./gi, 'v\uE000v\uE000')
    // Bảo vệ viết tắt đơn có dấu chấm trước chữ/số (Q.1, P.2, TP.Thủ Đức, Mr.A, ...)
    .replace(/(?<![\p{L}\p{N}])(TP|Q|P|H|T|F|KP|TT|TX|VD|ThS|TS|PGS|GS|KTS|KS|Mr|Mrs|Ms|Dr|St|No|etc)\.(?=\s*[\p{L}\p{N}])/giu, '$1\uE000');

  const segments = protectedText.split(/(?:[.!?…]+|\r?\n)+/u);
  const validSegments = segments.filter(seg => /[\p{L}\p{N}]/u.test(seg));
  return validSegments.length;
}

/**
 * Tự động chuẩn hóa nội dung để đạt chuẩn sạch sẽ (không thêm hashtag vào chuỗi rỗng).
 */
function normalizeCompliantMessage(rawMessage = '') {
  const msg = stripZeroWidthAndNfc(rawMessage).trim();
  if (!msg) return '';

  const existingTags = msg.match(/#[\p{L}\p{N}_-]+/gu) || [];
  if (existingTags.length === 0 && process.env.SELF_APPROVE_CONTENT !== 'false') {
    return `${msg}\n\n${REQUIRED_TAGS.join(' ')}`.trim();
  }
  return msg;
}

/**
 * Kiểm tra vi phạm Rule 5 (tên thương hiệu, handle, URL, SĐT, quảng cáo/CTA, giá tiền, câu tâng bốc, Meta policies)
 * trên một đoạn văn bản (caption hoặc title).
 */
function collectRule5TextViolations(rawText, labelPrefix = '') {
  const violations = [];
  const homoglyphClean = foldHomoglyphs(rawText);
  const homoglyphCleanLower = homoglyphClean.toLowerCase();
  const foldedKeepCase = foldVietnameseKeepCase(rawText);
  const folded = foldedKeepCase.toLowerCase();

  const push = (msg) => {
    violations.push(labelPrefix ? `${labelPrefix}${msg}` : msg);
  };

  // 1. Tên riêng thương hiệu (kể cả biến thể bỏ dấu, dấu ngăn cách, zero-width, leetspeak, homoglyph, I-lookalike, hậu tố, tiền tố dính chữ)
  const leetBrandMatched =
    /n[\W_]*[hn][\W_]*[a4@][\W_]*c[\W_]*u[\W_]*[a4@][\W_]*[l1i][\W_]*[a4@][\W_]*n[\W_]*d(?:$|[^a-z]|(?:vn|com|net|org|hcm|hn)(?:$|[^a-z]))/i.test(folded) ||
    /nh[a4@]\W*cu[a4@]\W*[l1i][a4@]nd(?:$|[^a-z])/i.test(folded) ||
    BANNED_BRAND_NAMES.some(b => homoglyphCleanLower.includes(b));

  if (leetBrandMatched) {
    push('Vi phạm Rule 5: Cấm nhắc tên riêng thương hiệu trong nội dung.');
  }

  // Handle @username
  if (/(?<![a-z0-9._])@[a-z0-9._]{2,}/i.test(homoglyphClean)) {
    push('Vi phạm Rule 5: Cấm nhắc @handle mạng xã hội trong nội dung.');
  }

  // 2. URL / Domain (bao gồm [.], {.}, <.>, [dot], (dot), (chấm), tên miền chèn khoảng trắng, Unicode dots, spoken dot, homoglyphs và shorteners; không bắt nhầm ".Co ", ".Cơm", ". VN/TOP/APP", "phim. App", "Bách Khoa. App ghi...", "cây me. me", " . do/to/be/ly/in")
  if (
    /(https?:\/\/|www\.)\S+/i.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[\p{L}\p{N}-]{1,}\s*(?:\[\s*\.\s*\]|\[\s*(?:dot|chấm|cham)\s*\]|\(\s*(?:dot|chấm|cham)\s*\)|\(\s*\.\s*\)|\{\s*(?:\.|dot|chấm|cham)\s*\}|<\s*(?:\.|dot|chấm|cham)\s*>)\s*(?:com|vn|net|org|io|co|do|ly|info|biz|me|xyz|top|site|online|store|shop|land|house|app|click|vip|pro|link|rent|live|page|in|id|be)\b/iu.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])(?:[\p{L}\p{N}-]{1,}|(?:[\p{L}\p{N}]\s+){2,}[\p{L}\p{N}])\s+(?:chấm|cham|dot)\s+(?:com|vn|net|org|info|biz|xyz|top|site|online|store|shop|land|house|app|click|vip|pro|link|rent|live|page|io|gg|uk|us|(?:co|me|ly)(?=\s+(?:chấm|cham|dot|\.)\s*[a-z]{2,}))(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /(?<![\p{L}\p{N}-])[\p{L}\p{N}-]{2,}\.(?:com|vn|net|org|info|biz|xyz|top|site|online|store|shop|land|house|app|click|vip|pro|link|rent|live|page)(?![\p{L}\p{N}])/iu.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[a-z0-9-]{1,}\.(?:com|vn|net|org|io|uk|us|gg|tv|click|vip|pro|link|rent|live|page)(?![\p{L}\p{N}])/u.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[\p{L}\p{N}-]{2,}\.(?!Co(?![\p{L}\p{N}])|Io(?![\p{L}\p{N}])|Me(?![\p{L}\p{N}]))(?:[iI][oO]|[cC][oO]|[mM][eE])(?![\p{L}\p{N}])/u.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[\p{L}\p{N}-]+\s*\.\s*(?:com|vn|net|org|info|biz|xyz|top|site|online|store|shop|land|house|app|click|vip|pro|link|rent|live|page|io|co|do|ly|me|gg|to|in|id|be|uk|us|tv)\/\S+/iu.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])(?:bit\.ly|bit\.do|tinyurl\.com|t\.co|x\.com|g\.co|t\.me|zalo\.me|fb\.com|m\.me|linktr\.ee|goo\.gl|is\.gd|ow\.ly|rb\.gy|cutt\.ly|youtu\.be|lnkd\.in|s\.id)(?![\p{L}\p{N}])/iu.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[\p{L}\p{N}-]{1,}\s+\.\s*(?:com|vn|net|org|info|biz|xyz|top|site|online|store|shop|land|house|app|click|vip|pro|link|rent|live|page|io|uk|us|gg|tv)(?![\p{L}\p{N}])/iu.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])(?:[a-zA-Z0-9-]{4,}|[a-zA-Z0-9-]*[-0-9][a-zA-Z0-9-]*)\s+\.\s*(?:me|co|Me|Co|ME|CO)(?![\p{L}\p{N}])/u.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])(?:[\p{L}\p{N}]\s+){2,}[\p{L}\p{N}]\s*\.\s*(?:com|vn|net|org|info|biz|xyz|top|site|online|store|shop|land|house|app|click|vip|pro|link|rent|live|page|io|me|co)(?![\p{L}\p{N}])/iu.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[\p{L}\p{N}-]{1,}\s+\.\s*(?:do|to|be|ly|in|id|co|me)(?=\s*(?:\.\s*[a-z]{2,}|\/\S+))/iu.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[\p{L}\p{N}-]{1,}\.\s+(?:com|vn|net|org|info|biz|xyz|top|site|online|store|shop|land|house|app|click|vip|pro|link|rent|live|page|io|ly|gg|tv|uk|us)(?![\p{L}\p{N}])/u.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])(?:[a-zA-Z0-9-]{4,}|[a-zA-Z0-9-]*[-0-9][a-zA-Z0-9-]*)\.\s+(?:me|co|Me|Co)(?![\p{L}\p{N}])/u.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[a-zA-Z0-9-]{2,}\.\s+(?:Com|Net|Org|Info|Biz|Xyz|Site|Vn|Io)(?![\p{L}\p{N}])/u.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])(?:[a-zA-Z0-9-]{4,}|[a-zA-Z0-9-]*[-0-9][a-zA-Z0-9-]*)\.\s+(?:Top|App|Online|Store|Shop|Land|House|Pro|Link|Rent|Live|Page)(?=\s*(?:\/|[.,!?;:…]|$|(?:nh[ée]|nha|n[eè]|nh[ỉi]|th[ôo]i|nh[áa]|nh[aà]|lu[ôo]n|[đd]i|[đd][óo]|[đd][âa]y)(?:\s+(?:nh[ée]|nha|th[ôo]i|[đd]i))?\s*(?:[.,!?;:…]|$)))/u.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[a-z0-9-]{2,}\.\s+(?:COM|NET|ORG|INFO|BIZ|XYZ|SITE|IO|CLICK|VIP|PRO|LINK|RENT|LIVE|PAGE)(?![\p{L}\p{N}])/u.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[A-Z0-9-]{2,}\.\s+(?:COM|VN|NET|ORG|INFO|BIZ|XYZ|TOP|SITE|ONLINE|STORE|SHOP|LAND|HOUSE|APP|CLICK|VIP|PRO|LINK|RENT|LIVE|PAGE|IO|ME|CO)(?![\p{L}\p{N}])/u.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])(?:[\p{L}\p{N}-]{2,}|(?:[\p{L}\p{N}]\s+){1,}[\p{L}\p{N}])(?:\s*(?:\.|\[\s*(?:\.|dot|chấm|cham)\s*\]|\(\s*(?:\.|dot|chấm|cham)\s*\)|\{\s*(?:\.|dot|chấm|cham)\s*\}|<\s*(?:\.|dot|chấm|cham)\s*>)\s*|\s+(?:dot|chấm|cham)\s+)(?:c\s+o\s+m|n\s+e\s+t|o\s+r\s+g|i\s+o|v\s+n|a\s+p\s+p|t\s+o\s+p|x\s+y\s+z|s\s+i\s+t\s+e|c\s+l\s+i\s+c\s+k|v\s+i\s+p|m\s+e|c\s+o|s\s+h\s+o\s+p|s\s+t\s+o\s+r\s+e|l\s+a\s+n\s+d|h\s+o\s+u\s+s\s+e|o\s+n\s+l\s+i\s+n\s+e|i\s+n\s+f\s+o|b\s+i\s+z|p\s+r\s+o|l\s+i\s+n\s+k|r\s+e\s+n\s+t|l\s+i\s+v\s+e|p\s+a\s+g\s+e)(?![\p{L}\p{N}])/iu.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])[\p{L}\p{N}-]{1,}\s*\.\s*(?:io|co|me)\s*\.\s*(?:vn|uk|us|jp|kr|sg|au)(?![\p{L}\p{N}])/iu.test(homoglyphClean) ||
    /(?<![\p{L}\p{N}-])(?:bit\s*\.\s*(?:ly|do)|tinyurl\s*\.\s*com|t\s*\.\s*(?:co|me)|x\s*\.\s*com|g\s*\.\s*co|zalo\s*\.\s*me|fb\s*\.\s*com|m\s*\.\s*me|linktr\s*\.\s*ee|goo\s*\.\s*gl|is\s*\.\s*gd|ow\s*\.\s*ly|rb\s*\.\s*gy|cutt\s*\.\s*ly|youtu\s*\.\s*be|lnkd\s*\.\s*in|s\s*\.\s*id)(?![\p{L}\p{N}])/iu.test(homoglyphClean)
  ) {
    push('Vi phạm Rule 5: Cấm chèn liên kết/URL/tên miền trong nội dung.');
  }

  // 3. Hotline / Số điện thoại Việt Nam (hỗ trợ fullwidth, /, *, |, _, ,, en-dash, em-dash, Unicode hyphens \u2010-\u2011/\u2212, +84/... và đầu số 1800/1900)
  if (
    /(?:^|[^\d])(?:\(?\+?84\)?|\(?0)[\s.\-–—\u2010\u2011\u2212()/*|,_]*(?:[235789][\s.\-–—\u2010\u2011\u2212()/*|,_]*)(?:\d[\s.\-–—\u2010\u2011\u2212()/*|,_]*){8,9}(?=$|[^\d])/.test(homoglyphClean) ||
    /(?:^|[^\d])1[89]00[\s.\-–—\u2010\u2011\u2212/*|,_]*(?:\d{4,6}|\d{3}[\s.\-–—\u2010\u2011\u2212/*|,_]+\d{3}|\d{2}[\s.\-–—\u2010\u2011\u2212/*|,_]+\d{2}[\s.\-–—\u2010\u2011\u2212/*|,_]+\d{2})(?=$|[^\d])/.test(homoglyphClean)
  ) {
    push('Vi phạm Rule 5: Cấm chèn số điện thoại/hotline trong nội dung.');
  }

  // 4. Từ khóa liên hệ / CTA / Quảng cáo / Chốt cọc / Ưu đãi / Mã khuyến mãi
  const contactCtaPatterns = [
    { re: /\b(hotline|sdt|so dien thoai|zalo|call ngay|goi ngay|lien he|lien lac|inbox|nhan tin|dat lich|hen (?:lich )?xem phong|xem phong ngay|truy cap|bam link|link bio|duoi binh luan|binh luan ben duoi|de lai (?:binh luan|comment|cmt)|vao bio|ghe bio|xem bio|trang ca nhan|(?:comment|cmt) (?:ben duoi|duoi bai|ngay))\b/i, desc: 'CTA/liên hệ' },
    { re: /(?:^|[^\p{L}\p{N}])(ib|dm)(?=$|[^\p{L}\p{N}])/iu, desc: 'CTA/nhắn tin (ib/dm)' },
    { re: /\b(dat coc|chot coc|giam gia|voucher|uu dai|khuyen mai|mien phi thang|mien phi coc|mien phi dich vu|mien phi wifi|mien phi internet|mien phi don phong|mien phi ve sinh|mien phi gui xe|mien phi giu xe|mien phi dien nuoc|mien phi noi that|mien phi lap dat|free wifi|free internet|free dich vu|free thang|free coc|free don phong|free ve sinh|free gui xe|free giu xe|cho thue gap|can cho thue|chinh chu cho thue|thanh ly|phong gia re|gia re bat ngo|full noi that gia|cmt de|tag \d+ ban|chia se vao (?:\d+\s+)?(?:nhom|group|hoi)|nhanh tay|chot phong|dat phong|chao thue|con (?:dung )?(?:\d+|mot|hai|ba) phong duy nhat|duy nhat (?:\d+|mot|hai|ba) phong|ma uu dai|ma khuyen mai|ma voucher|code uu dai|code giam(?:\s+gia)?|flash sale|sale (?:off|soc|manh|lon|khung)|booking (?:xem|phong|lich|ngay|som|truoc|cho)|book (?:phong|lich|xem|ngay|som|cho)|deal (?:tot|hoi|ngon|soc|hot|xin|hap dan|dac biet|doc quyen)|san deal|chot deal|(?:tra gop (?:tien )?(?:(?:thue )?(?:phong|nha|tro)|coc|dien\s*nuoc|noi that|dich vu|phi\s+(?:dich vu|quan ly))|tra gop tien (?:dien(?:\s*(?:nuoc|may lanh|dieu hoa))?|nuoc|may lanh|dieu hoa|rac|mang|wifi|gui xe|giu xe|ve sinh)|(?:(?:tien )?(?:coc|(?:thue )?(?:phong|nha|tro))) tra gop|gop (?:tien )?coc))\b/i, desc: 'quảng cáo/ưu đãi/chốt cọc' }
  ];
  for (const { re, desc } of contactCtaPatterns) {
    const m = folded.match(re);
    if (m) {
      push(`Vi phạm Rule 5: Chứa nội dung ${desc} ("${m[0]}").`);
    }
  }
  const chiTuPromoMatch = homoglyphCleanLower.match(/(?<![\p{L}\p{N}])(?:chỉ|chi)\s+từ\s*(?:[:=\-]?\s*(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?!(?:\d|[.,]\d))(?!\s*(?:m2|m²|m|cm|km|tiếng|tieng|giờ|gio|phút|phut|giây|giay|tuổi|tuoi|tầng|tang|lầu|lau|bước|buoc|căn|can|phòng|phong|người|nguoi|bạn|ban|cánh|canh|lần|lan|chỗ|cho)(?![\p{L}\p{N}]))|(?:(?:một|mot|hai|ba|bốn|bon|tư|tu|năm|nam|sáu|sau|bảy|bay|tám|tam|chín|chin|mười|muoi|nửa|nua)\s*(?:triệu|trieu|tr|củ|cu|ngàn|ngan|nghìn|nghin|k|đ|d|%|tháng|thang|tuần|tuan|ngày|ngay)|(?:hôm\s+nay|hom\s+nay|ngày\s+mai|ngay\s+mai|tuần\s+này|tuan\s+nay|tháng\s+này|thang\s+nay|cuối\s+tuần|cuoi\s+tuan|bây\s+giờ|bay\s+gio|giá|gia|mức|muc|tiền|tien|cọc|coc|ưu\s*đãi|uu\s*dai))(?![\p{L}\p{N}]))/iu);
  if (chiTuPromoMatch) {
    push(`Vi phạm Rule 5: Chứa nội dung quảng cáo/ưu đãi/chốt cọc ("${chiTuPromoMatch[0]}").`);
  }
  const promoCodePhraseMatch =
    homoglyphCleanLower.match(/(?<![\p{L}\p{N}])(?:dùng|dung|nhập|nhap|áp(?:\s+dụng)?|ap(?:\s+dung)?|sử\s+dụng|su\s+dung|tặng|tang|nhận|nhan|kèm|kem|lấy|lay)\s+mã(?![\p{L}\p{N}])(?!\s+(?:khóa|khoa|cửa|cua|vào\s*cửa|vao\s*cua|mở\s*cửa|mo\s*cua|mở\s*tủ|mo\s*tu|nhận\s*đồ|nhan\s*do|cửa\s*từ|cua\s*tu|số|so|pin|qr|phòng|phong|đồng\s*hồ|dong\s*ho|vân\s*tay|van\s*tay|định\s*danh|dinh\s*danh|căn\s*cước|can\s*cuoc|học\s*sinh|hoc\s*sinh|sinh\s*viên|sinh\s*vien|bưu\s*điện|buu\s*dien|vùng|vung|wifi|wi-?fi|thang\s*máy|thang\s*may|cổng|cong|bảo\s*vệ|bao\s*ve|otp|vận\s*đơn|van\s*don|đơn\s*hàng|don\s*hang|thẻ|the|bãi\s*xe|bai\s*xe|gửi\s*xe|gui\s*xe|giữ\s*xe|giu\s*xe|nhà\s*xe|nha\s*xe|tòa\s*nhà|toa\s*nha|chung\s*cư|chung\s*cu|xác\s*nhận|xac\s*nhan)(?![\p{L}\p{N}]))/iu) ||
    homoglyphClean.match(/(?<![\p{L}\p{N}])(?:dùng|dung|nhập|nhap|áp(?:\s+dụng)?|ap(?:\s+dung)?|sử\s+dụng|su\s+dung|tặng|tang|nhận|nhan|kèm|kem|lấy|lay)\s+ma\s+(?=[a-zA-Z0-9_-]*[A-Z0-9])[a-zA-Z0-9_-]{4,}(?![\p{L}\p{N}])/u) ||
    homoglyphCleanLower.match(/(?<![\p{L}\p{N}])(?:dùng|dung|nhập|nhap|áp(?:\s+dụng)?|ap(?:\s+dung)?|sử\s+dụng|su\s+dung|tặng|tang|nhận|nhan|kèm|kem|lấy|lay)\s+ma\s+(?:khuyen\s*mai|giam(?:\s*gia)?|uu\s*dai|voucher|sale|free|promo|deal|vip|off|welcome|km)(?![\p{L}\p{N}])/iu);
  if (promoCodePhraseMatch) {
    push(`Vi phạm Rule 5: Chứa nội dung mã ưu đãi/khuyến mãi ("${promoCodePhraseMatch[0]}").`);
  }
  const percentOrGiftPromoMatch = homoglyphCleanLower.match(/(?<![\p{L}\p{N}])(?:(?:tặng|tang|giảm|giam|ưu\s*đãi|uu\s*dai|lì\s*xì|li\s*xi|hoàn(?:\s+tiền)?|hoan(?:\s+tien)?)\s+(?:(?:ngay|thêm|them|lại|lai|liền|lien|cho|được|duoc|siêu|sieu|sâu|sau|mạnh|manh|sốc|soc|lớn|lon|hẳn|han|tới|toi|tận|tan|đến|den|cực|cuc|lên\s+đến|len\s+den|lên\s+tới|len\s+toi|trực\s+tiếp|truc\s+tiep|tiền\s+phòng|tien\s+phong|tiền\s+nhà|tien\s+nha|tiền\s+cọc|tien\s+coc)\s+){0,2}(?:(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:%|(?:k|tr\d*|triệu|trieu|củ|cu|m(?:[013-9]\d*|\d{2,})|nghìn|nghin|ngàn|ngan|vnđ|vnd|đồng|dong|đ|d)(?![\p{L}\p{N}]))|(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})(?!(?:[\d\p{L}]|[.,]\d))|(?:\d+|một|mot|hai|ba|nửa|nua|1\s*\/\s*2)\s+(?:tháng|thang|tuần|tuan|ngày|ngay)(?![\p{L}\p{N}]))|(?:bớt|bot)\s+(?:(?:ngay|thêm|them|lại|lai|liền|lien|cho|được|duoc|siêu|sieu|sâu|sau|mạnh|manh|sốc|soc|lớn|lon|hẳn|han|tới|toi|tận|tan|đến|den|cực|cuc|lên\s+đến|len\s+den|lên\s+tới|len\s+toi|trực\s+tiếp|truc\s+tiep|tiền\s+phòng|tien\s+phong|tiền\s+nhà|tien\s+nha|tiền\s+cọc|tien\s+coc)\s+){0,2}(?:(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:%|(?:k|tr\d*|triệu|trieu|củ|cu|m(?:[013-9]\d*|\d{2,})|nghìn|nghin|ngàn|ngan|vnđ|vnd|đồng|dong|đ|d)(?![\p{L}\p{N}]))|(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})(?!(?:[\d\p{L}]|[.,]\d))|(?:\d+|một|mot|hai|ba|nửa|nua|1\s*\/\s*2)\s+(?:tháng|thang|tuần|tuan|ngày|ngay)\s+(?:tiền|tien|phí|phi|cọc|coc|phòng|phong|nhà|nha|trọ|tro|đầu|dau)(?![\p{L}\p{N}])|(?:\d+|một|mot|hai|ba|nửa|nua|1\s*\/\s*2)\s+(?:tháng|thang)(?=\s*(?:[.,!?;:…]|$)))|(?:miễn(?:\s*phí)?|mien(?:\s*phi)?|free)\s+(?:(?:ngay|thêm|them|liền|lien|cho|được|duoc|sâu|sau|mạnh|manh|sốc|soc|lớn|lon|siêu|sieu|hẳn|han|tới|toi|tận|tan|đến|den|cực|cuc)\s+){0,2}(?:(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:%|(?:k|tr\d*|triệu|trieu|củ|cu|m(?:[013-9]\d*|\d{2,})|nghìn|nghin|ngàn|ngan|vnđ|vnd|đồng|dong|đ|d)(?![\p{L}\p{N}]))|(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})(?!(?:[\d\p{L}]|[.,]\d))|(?:\d+|một|mot|hai|ba|nửa|nua|1\s*\/\s*2)\s+(?:tháng|thang|tuần|tuan|ngày|ngay)(?![\p{L}\p{N}]))|(?:tặng|tang|miễn(?:\s*phí)?|mien(?:\s*phi)?|free)\s+(?:(?:ngay|thêm|them|liền|lien|hẳn|han|tới|toi|tận|tan|đến|den)\s+)?(?:tháng|thang|tuần|tuan)\s+(?:đầu|dau)(?:\s+(?:tiên|tien))?(?![\p{L}\p{N}])|(?:hỗ\s*trợ|ho\s*tro)\s+(?:(?:ngay|thêm|them|cho|được|duoc|tới|toi|đến|den|lên\s+đến|len\s+den|lên\s+tới|len\s+toi|trực\s+tiếp|truc\s+tiep|tiền\s+phòng|tien\s+phong|tiền\s+nhà|tien\s+nha|chi\s+phí|chi\s+phi)\s+){0,2}(?:(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:%|(?:k|tr\d*|triệu|trieu|củ|cu|m(?:[013-9]\d*|\d{2,})|nghìn|nghin|ngàn|ngan|vnđ|vnd|đồng|dong|đ|d)(?![\p{L}\p{N}]))|(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})(?!(?:[\d\p{L}]|[.,]\d))|(?:\d+|một|mot|nửa|nua|1\s*\/\s*2)\s+(?:tháng|thang|tuần|tuan|ngày|ngay)(?![\p{L}\p{N}]))|(?:chiết|chiet)\s*(?:khấu|khau)(?![\p{L}\p{N}])|sale\s+(?:(?:ngay|thêm|them|sốc|soc|lớn|lon|mạnh|manh|tháng\s+đầu|thang\s+dau|tới|toi|đến|den|tận|tan|lên\s+đến|len\s+den|lên\s+tới|len\s+toi|trực\s+tiếp|truc\s+tiep|tiền\s+phòng|tien\s+phong|tiền\s+nhà|tien\s+nha)\s+){0,2}\d+\s*%|(?:miễn|mien)\s+(?:(?:đóng|dong|thu|nộp|nop|đặt|dat)\s+)?(?:(?:tiền|tien|phí|phi)\s+)?(?:cọc|coc)(?![\p{L}\p{N}])|(?:không|khong|ko|khỏi|khoi)\s+(?:(?:cần|can|mất|mat|thu|đóng|dong|phải|phai|nộp|nop|tốn|ton|đặt|dat|có|co)\s+){0,3}(?:(?:tiền|tien|phí|phi)\s+)?(?:cọc|coc)(?![\p{L}\p{N}])|(?:chưa|chua)\s+(?:cần|can|phải|phai|thu|mất|mat|tốn|ton)\s+(?:(?:đóng|dong|nộp|nop|đặt|dat)\s+)?(?:(?:tiền|tien|phí|phi)\s+)?(?:cọc|coc)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}\d])0\s*(?:k|đ|d|đồng|dong|vnđ|vnd)?\s*(?:(?:tiền|tien)\s+)?(?:cọc|coc)(?![\p{L}\p{N}])|hoàn(?:\s+(?:tiền|tien))?\s+\d+\s*%)/iu);
  if (percentOrGiftPromoMatch) {
    push(`Vi phạm Rule 5: Chứa nội dung quảng cáo/ưu đãi/chốt cọc ("${percentOrGiftPromoMatch[0]}").`);
  }

  // 4a. Mã code khuyến mãi tổng quát & mã/tiêu đề từ config/offer_catalog.json
  const genericCodeMatch =
    homoglyphClean.match(/(?<![\p{L}\p{N}])(?:[Mm][ãÃaA]|[Cc][Oo][Dd][Ee])\s*[:=\-]\s*(?=[a-zA-Z0-9_-]*[a-zA-Z])(?=[a-zA-Z0-9_-]*[0-9]|[a-zA-Z0-9_-]{5,})[a-zA-Z0-9_-]{4,}(?![\p{L}\p{N}])/u) ||
    homoglyphClean.match(/(?<![\p{L}\p{N}])[Cc][Oo][Dd][Ee]\s+(?=[a-zA-Z0-9_-]*[a-zA-Z])(?=[a-zA-Z0-9_-]*[0-9]|[a-zA-Z0-9_-]{5,})[a-zA-Z0-9_-]{4,}(?![\p{L}\p{N}])/u) ||
    homoglyphCleanLower.match(/(?<![\p{L}\p{N}])(?:dùng|dung|nhập|nhap|áp(?:\s+dụng)?|ap(?:\s+dung)?|sử\s+dụng|su\s+dung|tặng|tang|nhận|nhan|kèm|kem|lấy|lay)\s+code\s+(?=[a-z0-9_-]*[a-z])(?=[a-z0-9_-]*[0-9]|[a-z0-9_-]{5,})[a-z0-9_-]{4,}(?![\p{L}\p{N}])/iu) ||
    homoglyphCleanLower.match(/(?<![\p{L}\p{N}])(?:mã|ma|code)\s+(?:sale|giam|giảm|free|vip|off|promo|deal|voucher|welcome|uudai|ưu\s*đãi|km)[a-z0-9_-]*(?![\p{L}\p{N}])/iu);
  if (genericCodeMatch) {
    push(`Vi phạm Rule 5: Chứa mã ưu đãi/khuyến mãi ("${genericCodeMatch[0]}").`);
  }

  const offerTokens = getOfferCatalogLeakTokens();
  for (const code of offerTokens.codes) {
    const cleanCode = code.replace(/[-._\s]/g, '');
    const escapedCode = code.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const sepPattern = cleanCode.split('').map(ch => ch.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('[-._\\s]*');
    const codeRe = new RegExp(`(?<![a-z0-9])(?:${escapedCode}|${sepPattern})(?![a-z0-9])`, 'i');
    if (codeRe.test(folded)) {
      push(`Vi phạm Rule 5: Rò rỉ mã ưu đãi từ offer_catalog.json ("${code.toUpperCase()}").`);
    }
  }
  if (offerTokens.titles.length > 0) {
    const normalizedFolded = folded.replace(/\s+/g, ' ').trim();
    for (const offerTitle of offerTokens.titles) {
      if (normalizedFolded.includes(offerTitle)) {
        push('Vi phạm Rule 5: Rò rỉ nội dung ưu đãi từ offer_catalog.json.');
        break;
      }
    }
  }

  // 4b. Cụm từ CTA nhạy thanh điệu (tránh nhận nhầm "mới xem phòng", "xà phòng", "giữ cho", "giữ phòng sạch sẽ/vệ sinh/bếp/thông thoáng/bừa bộn", "thuê ngày", "chốt ngày", "nhận ngày", "mà giảm", "chậm để lâu", "tăng gói cước", "đánh giá chỉ/hơi/tốt", "tham gia chỉ", "già chỉ/hơi/tốt")
  const toneSensitiveCtaRe = /(?<![\p{L}\p{N}])(?:(?:mời|moi)\s+xem\s+(?:phòng|phong)|(?:xả|xa)\s+(?:phòng|phong|kho)|(?:giữ|giu)\s+chỗ|giu\s+cho|(?:cọc|coc|đặt|dat|chốt|chot|chuyển(?:\s+khoản)?|chuyen(?:\s+khoan)?|ck|giữ\s*chỗ|giu\s*cho|nhanh\s+tay|nhắn\s+trước|nhan\s+truoc)\s+(?:(?:sớm|som|trước|truoc|nhanh|ngay|tiền|tien)\s+){0,2}(?:(?:để|de)\s+)?(?:giữ|giu)\s+(?:phòng|phong)|(?:giữ|giu)\s+(?:phòng|phong)\s+(?:ngay|sớm|som|kẻo|keo|trước|truoc|lấy|lay|hôm\s+nay|hom\s+nay|liền|lien|gấp|gap|online|cho\s+(?:bạn|ban|anh|chị|chi|em|khách|khach))|(?:nhận|nhan)\s+(?:phòng|phong)\s+ngay|(?:cho\s+)?(?:thuê|thue)\s+ngay|(?:chốt|chot)\s+(?:ngay|sớm|som)|(?:nhắn|nhận|nhan)\s+ngay|(?:nhắn|nhan)\s+(?:riêng|rieng)|(?:thì|thi|cứ|cu|hãy|hay)\s+(?:bình\s+luận|binh\s+luan|comment|cmt)|(?:bình\s+luận|binh\s+luan|comment|cmt)\s+(?:nhé|nhe|nha|đi|di|ngay|nào|nao)|(?<!(?:đánh|danh|tham|chuyên|chuyen|quốc|quoc|trả|tra)\s+)(?:giá\s+(?:chỉ|chi|tốt|tot|hời|hoi)|gia\s+(?:chi|tot|hoi))|(?:mã|ma)\s+(?:giảm|giam)(?:\s+(?:giá|gia))?|(?:chốt|chot)\s+(?:đơn|don)(?!\s+(?:giản|gian|thuần|thuan|điệu|dieu|sơ|so))|chấm\s+(?:bài|hóng|hong|nhẹ|nhe)|chấm\s+(?:để|de)|cham\s+de\s+(?:nhận|nhan|gửi|gui|xem|giữ|giu|báo|bao|tư\s*vấn|tu\s*van|inbox|ib|lấy|lay|đặt|dat|biết|biet|có|co|lộc|loc|giá|gia)|tặng\s+gói|tang\s+goi\s+(?:vệ\s*sinh|ve\s*sinh|nội\s*thất|noi\s*that|dịch\s*vụ|dich\s*vu|ưu\s*đãi|uu\s*dai|khuyến\s*mãi|khuyen\s*mai|combo|quà|qua))(?![\p{L}\p{N}])/iu;
  const toneCtaMatch = homoglyphCleanLower.match(toneSensitiveCtaRe);
  if (toneCtaMatch) {
    push(`Vi phạm Rule 5: Chứa nội dung quảng cáo/ưu đãi/chốt cọc ("${toneCtaMatch[0]}").`);
  }

  // 5. Giá tiền (tách "củ"/"cũ", "2k"/"2k3" thế hệ/tuổi, "500m"/"3m" khoảng cách vs "3.5M"/"khoảng 3.5m" triệu; hỗ trợ "3k5", "4k5", "Cọc 500.000", "Tiền điện 4.000/số")
  if (
    /\b(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:tr\d*|trieu\d*|nghin|ngan|vnd)(?:\s*\/\s*(?:thang|thg|th|m2|nguoi|phong))?\b/i.test(folded) ||
    /\b(?:\d{1,3}(?:[.,]\d{3})+|\d+[.,]\d+|\d{2,})\s*k\d*(?:\s*\/\s*(?:thang|thg|th|m2|nguoi|phong|so|kwh|khoi|ngay|lan|xe))?\b/i.test(folded) ||
    /\b[3-9]\s*k\d+\b/i.test(folded) ||
    /\b(?:gia|tien(?:\s+(?:phong|nha|tro|thue|dich\s*vu|dien(?:\s*nuoc)?|nuoc|gui\s*xe|giu\s*xe|coc))?|thue|coc|phi|dien|nuoc|gui\s*xe|giu\s*xe|rac|mang|wifi|ve\s*sinh|dich\s*vu|giam|tang|bot|con|mat|ton|het)(?:\s+(?:chi|co|tam|khoang|tu)){0,2}\s*[:=\-]?\s*\d\s*k\d*\b/i.test(folded) ||
    /\b(?:chi|tam|khoang|tu)(?:\s+(?:chi|co|tam|khoang|tu))?\s*[:=\-]?\s*(?:[03-9]\s*k\d*|[12]\s*k\d*(?=\s*(?:\/|\bmot\b|\bmoi\b|\bhang\b|\bdong\b|\bnghin\b|\btien\b|\bphi\b|\bgia\b|\bve\b|\bluot\b|\bchiec\b|\bxe\b|\bso\b|\bkhoi\b|\bkwh\b|\bngay\b|\bthang\b|\btuan\b|\bnguoi\b|\bphong\b)))\b/i.test(folded) ||
    /\b\d\s*k\d*\s*\/\s*(?:thang|thg|th|m2|nguoi|phong|so|kwh|khoi|ngay|lan|xe)\b/i.test(folded) ||
    /(?<![\p{L}\p{N}])(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*củ\d*(?:\s*(?:rưỡi|ruoi|mốt|mot|hai|ba|tư|tu|lăm|lam|năm|nam|sáu|sau|bảy|bay|tám|tam|chín|chin))?(?:\s*\/\s*(?:th[áa]ng|thg|th|m2|ng[ưườ]i|ph[òo]ng))?(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*cu\d+(?:\s*\/\s*(?:th[áa]ng|thg|th|m2|ng[ưườ]i|ph[òo]ng))?(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*cu\s*(?:\/\s*(?:th[áa]ng|thg|th|m2|ng[ưườ]i|ph[òo]ng)|(?:moi|hang|mot|1)\s+thang)(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /(?<![\p{L}\p{N}])(?:gi[áa]|gia|ti[ềe]n|tien|thu[êe]|thue|t[ầa]m|tam|kho[ảa]ng|khoang|ch[ỉi]|chi|c[ọo]c|coc)(?:\s+(?:ch[ỉi]|chi|c[óo]|co|ph[òo]ng|phong|nh[àa]|nha|tr[ọo]|tro|thu[êe]|thue)){0,2}\s*[:=\-]?\s*\d+(?:[.,]\d+)?\s*cu(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /(?<![\p{L}\p{N}])(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*đồng(?![\p{L}\p{N}])(?!\s*(?:h[ồo]|nghi[ệe]p|b[ộo]|lo[ạa]t|t[ìi]nh|t[âa]m|m[ịi]nh|minh|[yý]|thu[ậa]n|ph[ụu]c|c[ảa]m|h[àa]nh|h[ưư][ớo]ng|b[àa]o|đ[ộo]i|qu[êe])(?![\p{L}\p{N}]))/iu.test(homoglyphCleanLower) ||
    /(?<![\p{L}\p{N}])(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*dong(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /(?<![\p{L}\p{N}])(?:gi[áa]|ti[ềe]n|thu[êe]|c[ọo]c)(?:\s+[\p{L}\p{N}]+){0,3}\s+(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*dong(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*dong\s*\/\s*(?:th[áa]ng|thg|th|m2|ng[ưườ]i|ph[òo]ng)(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /\b(?:\d+(?:[.,]\d+)?\s*m\d*\s*(?:\/\s*(?:thang|thg|th)|(?:moi|hang|mot|1)\s+thang)|\d+(?:[.,]\d+)?\s*m(?:[013-9]\d*|\d{2,})?\s*\/\s*(?:nguoi|phong))\b/i.test(folded) ||
    /\b(?:gia|tien(?:\s+(?:phong|nha|tro|thue|coc))?|coc|thue|chi(?:\s+co)?|tam|khoang|tu|(?:moi|hang)\s+thang)(?:\s+(?:chi|co|tam|khoang|tu))?\s*[:=\-]?\s*[1-9]\s*m2\s*\/\s*(?:nguoi|phong)\b/i.test(folded) ||
    /\b\d+(?:[.,]\d+)?\s*M2\s*\/\s*(?:nguoi|phong)\b/.test(foldedKeepCase) ||
    /\b(?:[gG][iI][aA](?:\s+(?:[tT][hH][uU][eE]|[pP][hH][oO][nN][gG]|[nN][hH][aA]|[tT][rR][oO]))?|[tT][iI][eE][nN](?:\s+(?:[pP][hH][oO][nN][gG]|[nN][hH][aA]|[tT][rR][oO]|[tT][hH][uU][eE]|[cC][oO][cC]))?|[tT][hH][uU][eE]|(?:[mM][oO][iI]|[hH][aA][nN][gG])\s+[tT][hH][aA][nN][gG]|[cC][hH][iI](?:\s+[cC][oO])?|[tT][aA][mM]|[kK][hH][oO][aA][nN][gG]|[tT][uU]|[cC][oO][cC]|[gG][iI][aA][mM]|[tT][aA][nN][gG]|[bB][oO][tT]|[hH][oO]\s+[tT][rR][oO]|[hH][oO][aA][nN]|[dD][oO][nN][gG]|[tT][rR][aA]|[tT][oO][nN]|[mM][aA][tT]|[hH][eE][tT])(?:\s+(?:[cC][hH][iI]|[cC][oO]|[tT][aA][mM]|[kK][hH][oO][aA][nN][gG]|[tT][uU]))?\s*[:=\-]?\s*\d+(?:[.,]\d+)?\s*M\d*\b/.test(foldedKeepCase) ||
    /\b[tT][hH][uU][eE]\s+(?:[pP][hH][oO][nN][gG]|[nN][hH][aA]|[tT][rR][oO])(?:\s+(?:[cC][hH][iI]|[cC][oO]|[tT][aA][mM]|[kK][hH][oO][aA][nN][gG]|[tT][uU])){0,2}\s*[:=\-]?\s*\d+(?:[.,]\d+)?\s*M(?:[013-9]\d*|\d{2,})?\b/.test(foldedKeepCase) ||
    /\b(?:gia(?:\s+(?:thue|phong|nha|tro))?|tien(?:\s+(?:phong|nha|tro|thue|coc))?|coc|(?:moi|hang)\s+thang)(?:\s+(?:chi|co|tam|khoang|tu)){0,2}\s*[:=\-]?\s*\d+(?:[.,]\d+)?\s*m\d*\b/i.test(folded) ||
    /\bthue\s+(?:phong|nha|tro)(?:\s+(?:chi|co|tam|khoang|tu)){0,2}\s*[:=\-]?\s*(?:\d+(?:[.,]\d+)?\s*m(?:[013-9]\d*|\d{2,})|\d+[.,]\d+\s*m(?!\s*(?:x|\*|×|dai|rong|cao)\b))\b/i.test(folded) ||
    /\bthue(?:\s+(?:chi|co|tam|khoang|tu)){0,2}\s*[:=\-]?\s*(?:\d+(?:[.,]\d+)?\s*m(?:[013-9]\d*|\d{2,})?|[1-5]\s*m2)\b/i.test(folded) ||
    /(?<!\b(?:(?:chieu\s+)?(?:rong(?:\s+rai)?|dai|ngang)|(?:chieu|be)\s+sau|(?<!\b(?:gia|tien|muc|chi\s+phi)\s+)cao|cach\s+(?!tim|thue|de|nao|giam|tinh|xem)[a-z0-9]+(?:\s+[a-z0-9]+){0,2})(?:\s+(?:phong|nha|cua|gac(?:\s+xep)?|ban\s+cong|san|hem|ngo|duong|hanh\s+lang|cua\s+so|tran(?:\s+nha)?|giuong|tu|loai))?\s+)\b(?:(?:chi(?:\s+co)?|tam|khoang|tu)(?:\s+(?:chi|co|tam|khoang|tu))?\s*[:=\-]?\s*(?:\d+(?:[.,]\d+)?\s*m(?:[013-9]\d*|\d{2,})|\d+[.,]\d+\s*m)|(?:dong|tra|nop|ton|mat|het|con)(?:\s+(?:chi|co|tam|khoang|tu))?\s*[:=\-]?\s*\d+(?:[.,]\d+)?\s*m(?:[013-9]\d*|\d{2,}))(?!\s*(?:x|\*|×|,?\s*(?:dai|rong|cao|sau)\s+\d))\b/i.test(folded) ||
    /\b(?:\d{6,}|\d{1,3}(?:[.,]\d{3})+)\s*d\b/i.test(folded) ||
    /(?:^|[^\p{L}\p{N}])(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:vn)?đ(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /\b\d{1,3}(?:[.,]\d{3}){2,}\b/.test(folded) ||
    /\b\d{1,3}(?:\s+\d{3}){2,}\b/.test(folded) ||
    /(?<![\p{L}\p{N}])(?:giá(?:\s+(?:thuê|thue|phòng|phong|nhà|nha|trọ|tro))?|gia\s+(?:thuê|thue|phòng|phong|nhà|nha|trọ|tro))(?:\s+(?:chỉ|chi|có|co|tầm|tam|khoảng|khoang|từ|tu)){0,2}\s*[:=\-]?\s*(?:(?:\d{4,}|\d{1,3}(?:[.,]\d{3})+)(?!\s*(?:lần|lan|buổi|buoi|bước|buoc|cái|cai|chỗ|cho|người|nguoi|tầng|tang)(?![\p{L}\p{N}]))|\d+(?:[.,]\d+)?\s*(?:\/\s*(?:tháng|thang|thg|th|ngày|ngay|tuần|tuan|số|so|khối|khoi|kwh|m2|người|nguoi|phòng|phong)|(?:mỗi|moi|hàng|hang|1|một|mot)\s+(?:tháng|thang|ngày|ngay|tuần|tuan|số|so|khối|khoi)))(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /(?<![\p{L}\p{N}])(?:chỉ|chi)\s+từ\s*[:=\-]?\s*(?:(?:\d{4,}|\d{1,3}(?:[.,]\d{3})+)(?!(?:\d|[.,]\d))(?!\s*(?:m2|m²|m|cm|km|tiếng|tieng|giờ|gio|phút|phut|giây|giay|tuổi|tuoi|tầng|tang|lầu|lau|bước|buoc|căn|can|phòng|phong|người|nguoi|bạn|ban|cánh|canh|lần|lan|chỗ|cho)(?![\p{L}\p{N}]))|\d+(?:[.,]\d+)?(?!(?:\d|[.,]\d))\s*(?:tr\d*|triệu\d*|trieu\d*|củ\d*|cu\d*|k\d*|ngàn|ngan|nghìn|nghin|đ|d|vnđ|vnd|đồng|dong|\/\s*(?:tháng|thang|thg|th|ngày|ngay|tuần|tuan)|(?:mỗi|moi|hàng|hang)\s+(?:tháng|thang)))(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower) ||
    /\b(?:tien(?:\s+(?:phong|nha|tro|thue|dich\s*vu|quan\s*ly|dien(?:\s*nuoc)?|nuoc|gui\s*xe|giu\s*xe|rac|mang|wifi|ve\s*sinh|thang\s*may|chung|coc))?|phi(?:\s+(?:dich\s*vu|quan\s*ly|gui\s*xe|giu\s*xe|ve\s*sinh|rac|nuoc|dien(?:\s*nuoc)?|wifi|mang|thang\s*may|chung))?|dien(?:\s*nuoc)?|nuoc|gui\s*xe|giu\s*xe|rac|mang|wifi|ve\s*sinh|dich\s*vu|thue(?:\s+(?:phong|nha|tro))?|coc)(?:\s+(?:chi|co|tam|khoang|tu)){0,2}\s*[:=\-]?\s*(?:(?!(?:19\d{2}|20[0-3]\d)(?!(?:\d|[.,]\d))(?!\s*(?:\/\s*(?:thang|thg|th|ngay|tuan)|(?:moi|hang)\s+thang|k|d|dong|vnd|tr|trieu|cu)\b))\d{4,}|\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)*\s*(?:\/\s*(?:thang|thg|th)|(?:moi|hang)\s+thang))\b/i.test(folded) ||
    /\b(?:\d{4,}\s*(?:\/\s*(?:thang|thg|th|nguoi|phong|so|kwh|khoi|xe|luot|ngay)|(?:moi|hang|mot|1)\s+(?:thang|so|kwh|khoi|ngay|nguoi|luot|xe))|(?:\d{6,}|\d{1,3}(?:[.,]\d{3})+)\s*(?:\/\s*(?:thang|thg|th|nguoi|phong|m2|so|kwh|khoi|xe|luot|ngay)|(?:moi|hang|mot|1)\s+(?:thang|so|kwh|khoi|ngay|nguoi|luot|xe)|thang\b)|(?:moi|hang)\s+thang\s+(?:(?:chi|co|tam|khoang)\s+)?\d{6,})/i.test(folded) ||
    /\b(?:(?:gia(?:\s+(?:thue|phong|nha|tro))?|tien(?:\s+(?:phong|nha|tro|thue|coc))?|thue(?:\s+(?:phong|nha|tro))?|(?:moi|hang)\s+thang(?:\s+(?:chi|co|tam|khoang|tu))?|chi(?:\s+co)?|tam|khoang|tu)\s+(?:mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi|nua)\s+(?:trieu|cu)(?:\s+(?:ruoi|mot|hai|ba|bon|nam|sau|bay|tam|chin))?|(?:mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi|nua)\s+(?:trieu|cu)(?:\s+(?:ruoi|mot|hai|ba|bon|nam|sau|bay|tam|chin))?\s*(?:\/\s*(?:thang|thg|th)|(?:moi|hang|mot|1)\s+thang|dong\b)|(?:mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)\s+trieu\s+(?:ruoi|mot|hai|ba|bon|nam|sau|bay|tam|chin))\b/i.test(folded) ||
    /(?<![\p{L}\p{N}])(?:một|mot|hai|ba|bốn|bon|tư|tu|năm|nam|sáu|sau|bảy|bay|tám|tam|chín|chin|mười|muoi)\s+củ\s+(?:rưỡi|ruoi|một|mot|hai|ba|bốn|bon|năm|nam|sáu|sau|bảy|bay|tám|tam|chín|chin)(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower)
  ) {
    push('Vi phạm Rule 5: Cấm đăng giá tiền thuê phòng trong nội dung.');
  }

  // 6. Tâng bốc / Khẳng định quá mức (lưu ý tách "số 1" với "cửa sổ 1", "đẳng cấp nhất" với "đang cập nhật", "độc quyền" với "đọc quyển")
  const superlativeAccentedRe = /(?<![\p{L}\p{N}])số\s*(?:1|một|mot)(?![\p{L}\p{N}])/iu;
  const superlativePlainRe = /(?<![\p{L}\p{N}])so\s*(?:1|mot|một)(?![\p{L}\p{N}])/iu;
  if (superlativeAccentedRe.test(homoglyphCleanLower) || superlativePlainRe.test(homoglyphCleanLower)) {
    push('Vi phạm Rule 5: Chứa từ ngữ khẳng định/tâng bốc ("số 1").');
  }

  const toneSensitiveSupMatch = homoglyphCleanLower.match(/(?<![\p{L}\p{N}])(?:độc\s+quyền|doc\s+quyen|đẳng\s+cấp\s+nhất|dang\s+cap\s+nhat|(?:bậc|bac)\s+nhất|bậc\s+nhat|bac\s+nhat)(?![\p{L}\p{N}])/iu);
  if (toneSensitiveSupMatch) {
    push(`Vi phạm Rule 5: Chứa từ ngữ khẳng định/tâng bốc ("${toneSensitiveSupMatch[0]}").`);
  }

  const superlativeFoldedRe = /(?<![a-z0-9])(hang dau|chuyen nghiep nhat|khang dinh uy tin|dam bao uy tin|hoan hao nhat|tuyet doi nhat|tuyet voi nhat|tot nhat|re nhat|dep nhat|uy tin nhat|cao cap nhat|chat luong nhat|hien dai nhat|tien nghi nhat|an toan nhat|xin nhat|dang song nhat|gia mem nhat|chuan 5 sao|chuan nam sao|dam bao 100%|duy nhat tren doi|khong dau co|cam ket 100%|anh that 100%|minh bach 100%|chat luong so 1|top\s*1|chinh chu 100%|100%\s*chinh\s*chu)(?![a-z0-9])/i;
  const supMatch = folded.match(superlativeFoldedRe);
  if (supMatch) {
    push(`Vi phạm Rule 5: Chứa từ ngữ khẳng định/tâng bốc ("${supMatch[0]}").`);
  }

  // 7. Chính sách Meta (BANNED_POLICIES)
  for (const [category, words] of Object.entries(BANNED_POLICIES)) {
    for (const word of words) {
      if (word === 'số 1' || word === 'số một') continue; // đã kiểm tra chuẩn xác ở mục 6
      if (word === 'phòng ma') {
        if (/(?<![\p{L}\p{N}])(?:phòng|phong)\s+ma(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower)) {
          push(`Vi phạm chính sách Meta [${category}]: Chứa cụm từ cấm "${word}".`);
        }
        continue;
      }
      if (word === 'bán nhà ma') {
        if (/(?<![\p{L}\p{N}])(?:bán|ban)\s+(?:nhà|nha)\s+ma(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower)) {
          push(`Vi phạm chính sách Meta [${category}]: Chứa cụm từ cấm "${word}".`);
        }
        continue;
      }
      if (word === 'đẳng cấp nhất') {
        if (/(?<![\p{L}\p{N}])(?:đẳng\s+cấp\s+nhất|dang\s+cap\s+nhat)(?![\p{L}\p{N}])/iu.test(homoglyphCleanLower)) {
          push(`Vi phạm chính sách Meta [${category}]: Chứa cụm từ cấm "${word}".`);
        }
        continue;
      }
      const foldedWord = foldVietnamese(word);
      const escapedAccented = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const escapedFolded = foldedWord.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const reAccented = new RegExp(`(?<![\\p{L}\\p{N}])${escapedAccented}(?![\\p{L}\\p{N}])`, 'iu');
      const reFolded = new RegExp(`\\b${escapedFolded}\\b`, 'i');
      if (reAccented.test(homoglyphCleanLower) || reFolded.test(folded)) {
        push(`Vi phạm chính sách Meta [${category}]: Chứa cụm từ cấm "${word}".`);
      }
    }
  }

  return violations;
}

/**
 * 1. Kiểm tra tiêu chuẩn nội dung theo Rule 5 và chính sách Meta (Fanpage, Instagram, Threads)
 */
function evaluateContent(content = {}) {
  const input = typeof content === 'string' ? { caption: content } : (content || {});
  const violations = [];
  const rawBody = input.caption !== undefined && input.caption !== null
    ? input.caption
    : (input.message !== undefined && input.message !== null ? input.message : '');

  const normalizedBody = normalizeCompliantMessage(rawBody);
  const bodyOnly = extractBodyWithoutTrailingHashtags(normalizedBody);
  const title = typeof input.title === 'string' ? stripZeroWidthAndNfc(input.title).trim() : '';
  const channel = typeof input.channel === 'string' ? input.channel.toLowerCase().trim() : null;

  const sentenceCount = countSentences(normalizedBody);
  const wordCount = bodyOnly
    ? bodyOnly.split(/\s+/).filter(t => /[\p{L}\p{N}]/u.test(t)).length
    : 0;
  const charCount = [...bodyOnly].length;
  const hashtags = normalizedBody.match(/#[\p{L}\p{N}_-]+/gu) || [];
  const hashtagCount = hashtags.length;

  // Cấu trúc & độ dài thân caption (Rule 5)
  if (charCount < 15) {
    violations.push('Nội dung quá ngắn (tối thiểu 15 ký tự).');
  }
  if (sentenceCount < 2 || sentenceCount > 4) {
    violations.push(`Vi phạm Rule 5: Caption phải có từ 2 đến 4 câu (hiện tại: ${sentenceCount} câu).`);
  }
  if (wordCount > 90) {
    violations.push(`Vi phạm Rule 5: Caption vượt quá 90 từ (hiện tại: ${wordCount} từ).`);
  }
  if (charCount > 450) {
    violations.push(`Vi phạm Rule 5: Phần thân caption vượt quá 450 ký tự (hiện tại: ${charCount} ký tự).`);
  }
  if (channel === 'threads') {
    const totalCodepoints = [...normalizedBody].length;
    if (totalCodepoints > 500) {
      violations.push(`Vi phạm Threads: Tổng nội dung vượt quá 500 ký tự (${totalCodepoints}/500).`);
    }
  }

  // Hashtag (tối đa 2 hashtag sạch, cấm hashtag thương hiệu/quảng cáo)
  if (hashtagCount > 2) {
    violations.push(`Vi phạm Rule 5: Tối đa 2 hashtag sạch (hiện tại: ${hashtagCount}).`);
  }
  for (const tag of hashtags) {
    const foldedTag = foldVietnamese(tag).replace(/[^a-z0-9]/g, '');
    if (BANNED_HASHTAG_TERMS.some(term => foldedTag.includes(term))) {
      violations.push(`Vi phạm Rule 5: Hashtag "${tag}" mang tính thương hiệu hoặc quảng cáo.`);
    }
  }

  // Nội dung Rule 5 trên caption & title
  violations.push(...collectRule5TextViolations(normalizedBody));
  if (title) {
    violations.push(...collectRule5TextViolations(title, '[TITLE] '));
  }

  const dedupedViolations = [...new Set(violations)];

  return {
    allowed: dedupedViolations.length === 0,
    selfApproved: dedupedViolations.length === 0 && process.env.REQUIRE_HUMAN_APPROVAL !== 'true',
    normalizedMessage: normalizedBody,
    score: dedupedViolations.length === 0 ? 100 : Math.max(0, 100 - dedupedViolations.length * 30),
    violations: dedupedViolations,
    stats: {
      sentenceCount,
      wordCount,
      charCount,
      hashtagCount
    }
  };
}

/**
 * Kiểm duyệt đồng bộ cả 3 kênh (Facebook, Instagram, Threads) — fail closed nếu bất kỳ kênh nào vi phạm.
 */
function evaluateOmnichannelCaptions({
  facebook_caption,
  instagram_caption,
  threads_caption,
  title
} = {}) {
  const facebook = evaluateContent({ caption: facebook_caption, title, channel: 'facebook' });
  const instagram = evaluateContent({ caption: instagram_caption, title, channel: 'instagram' });
  const threads = evaluateContent({ caption: threads_caption, title, channel: 'threads' });

  const violations = [
    ...facebook.violations.map(v => `[FACEBOOK] ${v}`),
    ...instagram.violations.map(v => `[INSTAGRAM] ${v}`),
    ...threads.violations.map(v => `[THREADS] ${v}`)
  ];

  return {
    allowed: facebook.allowed && instagram.allowed && threads.allowed,
    results: { facebook, instagram, threads },
    violations
  };
}

function realpathDeepest(target) {
  let cur = path.win32.resolve(target);
  const tail = [];
  while (true) {
    try {
      fs.lstatSync(cur);
      try {
        const real = fs.realpathSync.native(cur);
        return tail.length > 0 ? path.win32.join(real, ...tail.reverse()) : real;
      } catch (realErr) {
        const linkTarget = fs.readlinkSync(cur);
        const resolvedLink = path.win32.resolve(path.win32.dirname(cur), linkTarget);
        return tail.length > 0 ? path.win32.join(resolvedLink, ...tail.reverse()) : resolvedLink;
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        const parent = path.win32.dirname(cur);
        if (parent === cur) {
          return path.win32.resolve(target);
        }
        tail.push(path.win32.basename(cur));
        cur = parent;
        continue;
      }
      throw err;
    }
  }
}

function isWithinWin32(base, target) {
  const rel = path.win32.relative(base.toLowerCase(), target.toLowerCase());
  return rel === '' || (!path.win32.isAbsolute(rel) && rel.split(/[\\/]/)[0] !== '..');
}

/**
 * Bảo vệ cô lập workspace D:\Facebook: chặn traversal, UNC/device, drive-relative, prefix trap và symlink/junction thoát ra ngoài.
 */
function assertInsideWorkspace(targetPath, root = DEFAULT_WORKSPACE_ROOT) {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    throw new TypeError('Workspace isolation violation: targetPath must be a non-empty string.');
  }
  if (typeof root !== 'string' || !root.trim()) {
    throw new TypeError('Workspace isolation violation: root must be a non-empty string.');
  }
  if (targetPath.includes('\0') || root.includes('\0')) {
    throw new Error('Workspace isolation violation: null byte in path is forbidden.');
  }

  const trimmedTarget = targetPath.trim();
  if (/^(\\\\|\/\/)/.test(trimmedTarget)) {
    throw new Error(`Workspace isolation violation: UNC/device path "${targetPath}" is forbidden.`);
  }
  if (/^[a-zA-Z]:(?![\\/])/.test(trimmedTarget)) {
    throw new Error(`Workspace isolation violation: drive-relative path "${targetPath}" is forbidden.`);
  }

  const normalizedRoot = path.win32.resolve(root);
  const resolvedTarget = path.win32.isAbsolute(trimmedTarget)
    ? path.win32.resolve(trimmedTarget)
    : path.win32.resolve(normalizedRoot, trimmedTarget);

  if (!isWithinWin32(normalizedRoot, resolvedTarget)) {
    throw new Error(`Workspace isolation violation: "${targetPath}" resolves outside "${normalizedRoot}".`);
  }

  const realRoot = realpathDeepest(normalizedRoot);
  const realTarget = realpathDeepest(resolvedTarget);

  if (!isWithinWin32(realRoot, realTarget)) {
    throw new Error(`Workspace isolation violation (realpath): "${targetPath}" resolves outside "${normalizedRoot}".`);
  }

  return resolvedTarget;
}

/**
 * 2. Kiểm tra tần suất đăng an toàn ĐỘC LẬP THEO TỪNG NỀN TẢNG (facebook / instagram / threads)
 * Theo ngày địa phương Asia/Ho_Chi_Minh và làm tròn xuống (Math.floor) cho cooldown.
 */
function checkPublishRateLimit(platform = null, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const historyFile = opts.historyFile || getHistoryFile();
  const tz = opts.timeZone || process.env.TIMEZONE || DEFAULT_TIMEZONE;

  const nowDate = opts.now !== undefined ? toValidDate(opts.now) : new Date();
  if (!nowDate) {
    throw new TypeError('Invalid options.now supplied to checkPublishRateLimit');
  }
  const nowMs = nowDate.getTime();
  const todayLocal = getLocalDateString(nowDate, tz);

  if (!fs.existsSync(historyFile)) {
    return {
      allowed: true,
      countToday: 0,
      dailyCount: 0,
      waitMinutes: 0,
      cooldownRemainingMinutes: 0
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    if (!Array.isArray(parsed)) {
      console.warn(`[governance] Publish history at "${historyFile}" is not an array.`);
      return {
        allowed: true,
        countToday: 0,
        dailyCount: 0,
        waitMinutes: 0,
        cooldownRemainingMinutes: 0
      };
    }

    const maxPosts = getMaxPostsPerDay();
    const minCooldown = getCooldownMinutes();
    const targetPlatform = platform ? String(platform).toLowerCase() : null;

    const platformHistory = targetPlatform
      ? parsed.filter(p => p && typeof p.platform === 'string' && p.platform.toLowerCase() === targetPlatform)
      : parsed;

    const todayPosts = platformHistory.filter(p => {
      const d = toValidDate(p && p.timestamp);
      return d ? getLocalDateString(d, tz) === todayLocal : false;
    });

    if (todayPosts.length >= maxPosts) {
      return {
        allowed: false,
        reason: `[${(platform || 'ALL').toUpperCase()}] Đã đạt ngưỡng an toàn tối đa ${maxPosts} bài/ngày.`,
        countToday: todayPosts.length,
        dailyCount: todayPosts.length,
        waitMinutes: 0,
        cooldownRemainingMinutes: 0
      };
    }

    if (minCooldown > 0 && platformHistory.length > 0) {
      const validTimestamps = platformHistory
        .map(p => toValidDate(p && p.timestamp))
        .filter(Boolean)
        .map(d => d.getTime())
        .filter(ms => ms <= nowMs);

      if (validTimestamps.length > 0) {
        const lastTime = Math.max(...validTimestamps);
        const elapsedMs = nowMs - lastTime;
        const minCooldownMs = minCooldown * 60 * 1000;

        if (elapsedMs >= 0 && elapsedMs < minCooldownMs) {
          const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));
          const remaining = Math.ceil((minCooldownMs - elapsedMs) / (1000 * 60));
          return {
            allowed: false,
            reason: `[${(platform || 'ALL').toUpperCase()}] Khoảng cách 2 bài liên tiếp trên cùng kênh quá sát (${elapsedMinutes} phút). Cần giãn cách tối thiểu ${minCooldown} phút (còn ${remaining} phút).`,
            waitMinutes: remaining,
            cooldownRemainingMinutes: remaining,
            countToday: todayPosts.length,
            dailyCount: todayPosts.length
          };
        }
      }
    }

    return {
      allowed: true,
      countToday: todayPosts.length,
      dailyCount: todayPosts.length,
      waitMinutes: 0,
      cooldownRemainingMinutes: 0
    };
  } catch (e) {
    console.warn(`[governance] Failed to read/parse publish history (${historyFile}): ${e.message}`);
    return {
      allowed: true,
      countToday: 0,
      dailyCount: 0,
      waitMinutes: 0,
      cooldownRemainingMinutes: 0
    };
  }
}

/**
 * 3. Ghi nhận lịch sử xuất bản thành công
 */
function recordPublishEvent(event = {}, options = {}) {
  const targetEvent = event && typeof event === 'object' ? event : {};
  const opts = options && typeof options === 'object' ? options : {};
  const historyFile = opts.historyFile || targetEvent.historyFile || getHistoryFile();

  let history = [];
  if (fs.existsSync(historyFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      history = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn(`[governance] Failed to parse existing publish history: ${e.message}`);
      history = [];
    }
  }
  if (!Array.isArray(history)) {
    history = [];
  }

  history.push({
    timestamp: new Date().toISOString(),
    platform: targetEvent.platform || 'all',
    contentType: targetEvent.contentType || 'feed',
    summary: (targetEvent.message || '').slice(0, 100),
    engine: targetEvent.engine || 'PLAYWRIGHT_RPA',
    spaceArchetype: targetEvent.spaceArchetype || null,
    mediaPath: targetEvent.mediaPath || null,
    proofScreenshot: targetEvent.proofScreenshot || null
  });

  if (history.length > 200) {
    history = history.slice(-200);
  }

  const dir = path.dirname(historyFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');
}

module.exports = {
  HISTORY_FILE,
  getHistoryFile,
  getLocalDateString,
  countSentences,
  normalizeCompliantMessage,
  evaluateContent,
  evaluateOmnichannelCaptions,
  assertInsideWorkspace,
  checkPublishRateLimit,
  recordPublishEvent
};
