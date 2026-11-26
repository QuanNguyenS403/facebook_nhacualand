'use strict';

/**
 * AUTONOMOUS INTERNET RESEARCH & SOURCE BRIEF AGENT — NHÀ CỦA LAND (D:\Facebook)
 * Hợp đồng F6:
 * - Đọc tri thức sẵn có trong DATA_DIR/knowledge/ (sourceMode: 'cached_knowledge').
 * - Đồng bộ read-only (GET only) từ nhacualand.com hoặc siteUrl truyền vào ('live_web').
 * - Fallback sạch 100% Rule 5 khi offline ('offline_seed').
 * - Lưu brief vào DATA_DIR/knowledge/ và bảng briefs trong SQLite.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getLocalDateString, evaluateContent } = require('../lib/governance');
const { openDb } = require('../lib/db');

function getKnowledgeDir() {
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(__dirname, '../data');
  const dir = path.join(dataDir, 'knowledge');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanFactLine(text) {
  return String(text || '')
    .replace(/nhacualand\.com|nhacualand|nhà cửa land|nhà của land|0981\s*753\s*082|inbox ngay|chốt cọc|số 1/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlToSentences(html) {
  const noScripts = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = noScripts
    .replace(/<\/(p|h1|h2|h3|h4|li|div|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
  return text
    .split(/\r?\n+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 12 && s.length <= 240);
}

function buildSeedKnowledge(topic, pillar) {
  const t = String(topic || '').toLowerCase();
  const insights = [
    'Người đi thuê phòng thường xem kỹ ánh sáng tự nhiên, độ thông thoáng và tường nhà vào ban ngày',
    'Tiền điện, nước, dịch vụ chung và phí gửi xe cần được hỏi rõ bằng con số cụ thể trước khi đặt cọc'
  ];
  const painPoints = [
    'Ảnh trên mạng sáng sủa nhưng đến nơi thực tế phòng bí bách, tối hoặc ẩm góc tường',
    'Phụ phí phát sinh cuối tháng khiến tổng tiền ở cao hơn nhiều so với tiền phòng ban đầu'
  ];
  const renterTips = [
    'Thử tắt đèn trong phòng lúc ban ngày để xem mặt bàn và góc ngủ có đủ sáng tự nhiên không',
    'Kiểm tra đồng hồ điện nước riêng, vòi nước nhà tắm và độ cách âm hành lang vào giờ cao điểm'
  ];
  const domainFacts = [
    'Phòng Studio có không gian gọn gàng, cửa sổ thoáng phù hợp người đi làm độc thân',
    'Căn hộ dịch vụ tách bếp giúp nấu ăn không bị ám mùi quần áo',
    'Chung cư mini chú trọng khóa an ninh, chỗ để xe và sự yên tĩnh buổi tối',
    'Phòng trọ cao cấp gần trục đi làm giúp tiết kiệm thời gian di chuyển hằng ngày'
  ];

  if (t.includes('điện') || t.includes('phí') || String(pillar).includes('COST')) {
    insights.unshift('Bảng chi phí hằng tháng rõ ràng giúp người đi thuê dễ cân đối lương mỗi tháng');
  } else if (t.includes('yên tĩnh') || t.includes('ngủ') || String(pillar).includes('QUIET')) {
    insights.unshift('Tường cách âm và lối đi gọn gàng giúp người làm ca hoặc tan làm muộn ngủ sâu giấc');
  }

  return {
    insights: insights.map(cleanFactLine).filter(Boolean),
    painPoints: painPoints.map(cleanFactLine).filter(Boolean),
    renterTips: renterTips.map(cleanFactLine).filter(Boolean),
    domainFacts: domainFacts.map(cleanFactLine).filter(Boolean)
  };
}

function findCachedBriefForToday(knowledgeDir, todayIct) {
  if (!fs.existsSync(knowledgeDir)) return null;
  const files = fs.readdirSync(knowledgeDir)
    .filter(f => f.startsWith(`research_${todayIct}`) && f.endsWith('.json'))
    .sort()
    .reverse();

  for (const file of files) {
    try {
      const fullPath = path.join(knowledgeDir, file);
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (data && Array.isArray(data.insights) && data.insights.length > 0) {
        return { data, filePath: fullPath };
      }
    } catch (_) {}
  }
  return null;
}

async function fetchSiteDomainFacts(siteUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(siteUrl, {
      method: 'GET',
      headers: { 'Accept': 'text/html,application/xhtml+xml' },
      signal: controller.signal
    });
    if (!res.ok) return [];
    const html = await res.text();
    const lines = stripHtmlToSentences(html);
    const segmentLines = lines.filter(l => /studio|căn hộ dịch vụ|chung cư mini|phòng trọ|điện nước|cửa sổ|ánh sáng|an ninh/i.test(l));
    const selected = (segmentLines.length > 0 ? segmentLines : lines).slice(0, 8);
    return selected.map(cleanFactLine).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

function assertRule5SafeList(items) {
  return (items || []).map(item => {
    const cleaned = cleanFactLine(item);
    const check = evaluateContent({ caption: cleaned, channel: 'facebook' });
    if (check.allowed) return cleaned;
    return check.normalizedMessage || cleaned;
  }).filter(Boolean);
}

async function conductResearch({
  topic = 'Kinh nghiệm đi xem phòng trọ thực tế',
  pillar = 'P1_STUDIO_LIGHT_LIVING',
  siteUrl = process.env.NHACUALAND_URL || process.env.BRAND_WEBSITE || null,
  offline = process.env.OFFLINE_MODE === 'true',
  dryRun = false,
  forceRefresh = false
} = {}) {
  const knowledgeDir = getKnowledgeDir();
  const todayIct = getLocalDateString();
  const seed = buildSeedKnowledge(topic, pillar);

  // 1. Kiểm tra tri thức cache trong ngày nếu không offline & không forceRefresh
  if (!offline && !forceRefresh) {
    const cached = findCachedBriefForToday(knowledgeDir, todayIct);
    if (cached) {
      return {
        ...cached.data,
        sourceMode: 'cached_knowledge',
        filePath: cached.filePath
      };
    }
  }

  let sourceMode = 'offline_seed';
  let domainFacts = [...seed.domainFacts];
  const sources = ['internal_renter_seed'];

  // 2. Nếu online và có siteUrl -> đọc GET read-only
  if (!offline && siteUrl && /^https?:\/\//i.test(siteUrl)) {
    try {
      const liveFacts = await fetchSiteDomainFacts(siteUrl);
      if (liveFacts.length > 0) {
        domainFacts = [...new Set([...liveFacts, ...seed.domainFacts])].slice(0, 10);
        sourceMode = 'live_web';
        sources.unshift(siteUrl);
      }
    } catch (_) {
      // Fallback an toàn về offline_seed
    }
  }

  const briefId = `brief_${todayIct.replace(/-/g, '')}_${crypto.randomBytes(4).toString('hex')}`;
  const fetchedAt = new Date().toISOString();
  const slug = String(topic || 'topic')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'brief';
  const filePath = path.join(knowledgeDir, `research_${todayIct}_${slug}_${briefId.slice(-6)}.json`);

  const brief = {
    briefId,
    fetchedAt,
    date: todayIct,
    topic,
    pillar,
    sourceMode,
    dryRun: Boolean(dryRun),
    insights: assertRule5SafeList(seed.insights),
    painPoints: assertRule5SafeList(seed.painPoints),
    renterTips: assertRule5SafeList(seed.renterTips),
    domainFacts: domainFacts.map(cleanFactLine).filter(Boolean),
    sources,
    filePath
  };

  fs.writeFileSync(filePath, JSON.stringify(brief, null, 2), 'utf8');

  try {
    const db = openDb();
    db.prepare(`
      INSERT OR REPLACE INTO briefs (brief_id, topic, pillar, source_mode, source_refs_json, brief_json, file_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(briefId, topic, pillar, sourceMode, JSON.stringify(sources), JSON.stringify(brief), filePath, fetchedAt);
  } catch (_) {}

  return brief;
}

module.exports = {
  conductResearch,
  getKnowledgeDir
};
