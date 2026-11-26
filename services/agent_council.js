'use strict';

/**
 * MULTI-AGENT SEQUENTIAL ROUNDTABLE COUNCIL — NHÀ CỦA LAND (D:\Facebook)
 * Hợp đồng F7:
 * Thực thi tuần tự 6 vai trò:
 *   Researcher -> Strategist -> Copywriter -> Rule5Critic -> MediaDirector -> PublisherCoordinator
 * Lưu biên bản cuộc họp vào DATA_DIR/meetings/ và đồng bộ Work Order.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generatePost, generateVideoScript } = require('./ai_pipeline');
const { evaluateOmnichannelCaptions } = require('../lib/governance');
const workOrderGateway = require('./work-order-gateway');

const COUNCIL_ROLES = [
  'Researcher',
  'Strategist',
  'Copywriter',
  'Rule5Critic',
  'MediaDirector',
  'PublisherCoordinator'
];

function getMeetingsDir() {
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(__dirname, '../data');
  const dir = path.join(dataDir, 'meetings');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function nextMonotonicIso(prevMs) {
  const nowMs = Date.now();
  const ts = nowMs >= prevMs ? nowMs : prevMs;
  return { ms: ts, iso: new Date(ts).toISOString() };
}

async function runMultiAgentRoundtable({
  slot = {},
  researchBrief = null,
  dryRun = false,
  offline = process.env.OFFLINE_MODE === 'true'
} = {}) {
  const meetingId = `mtg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const format = String(slot.format || 'OMNICHANNEL_POST').toUpperCase();
  const isVideo = format.includes('REELS') || format.includes('VIDEO');
  const pillar = slot.pillar_id || slot.pillar_name || 'P1_STUDIO_LIGHT_LIVING';
  const topic = slot.concept_hook || 'Kinh nghiệm đi xem phòng thực tế ban ngày';
  const phases = [];
  let cursorMs = Date.now();

  const pushPhase = (role, decision, evidenceUsed = [], handoffCondition = 'PASS') => {
    const t = nextMonotonicIso(cursorMs);
    cursorMs = t.ms;
    phases.push({
      role,
      timestamp: t.iso,
      decision,
      evidenceUsed,
      handoffCondition
    });
  };

  // Phase 1: Researcher
  const briefSummary = researchBrief
    ? {
        briefId: researchBrief.briefId || 'brief_inline',
        insights: researchBrief.insights || [],
        painPoints: researchBrief.painPoints || [],
        renterTips: researchBrief.renterTips || [],
        domainFacts: researchBrief.domainFacts || []
      }
    : { briefId: 'brief_none', insights: [topic], painPoints: [], renterTips: [], domainFacts: [] };

  pushPhase(
    'Researcher',
    `Xác nhận góc tiếp cận từ brief ${briefSummary.briefId}`,
    [briefSummary.briefId, ...(briefSummary.insights || []).slice(0, 2)],
    'Brief đủ dữ kiện cho biên tập'
  );

  // Phase 2: Strategist
  const channelStrategy = {
    facebook: 'Kể một tình huống đi xem phòng thực tế gần gũi',
    instagram: 'Nhấn mạnh một chi tiết trực quan dễ quan sát trong phòng',
    threads: 'Mở một câu hỏi ngắn để người đi thuê chia sẻ kinh nghiệm'
  };
  const angle = (briefSummary.painPoints && briefSummary.painPoints[0]) || topic;
  pushPhase(
    'Strategist',
    `Chốt trụ cột ${pillar} và chiến lược 3 kênh`,
    [pillar, angle],
    'Chuyển sang Copywriter viết 3 biến thể'
  );

  // Phase 3: Copywriter
  const prevOffline = process.env.OFFLINE_MODE;
  if (offline) process.env.OFFLINE_MODE = 'true';
  let generatedCopy;
  try {
    if (isVideo) {
      const script = await generateVideoScript({ concept: topic });
      const post = await generatePost({ topic, pillar, format: 'REELS_ROOM_TOUR' });
      generatedCopy = { ...post, script };
    } else {
      generatedCopy = await generatePost({ topic, pillar, format });
    }
  } finally {
    if (offline) {
      if (prevOffline === undefined) delete process.env.OFFLINE_MODE;
      else process.env.OFFLINE_MODE = prevOffline;
    }
  }
  pushPhase(
    'Copywriter',
    `Hoàn thiện 3 biến thể caption cho Facebook, Instagram, Threads`,
    ['ai_pipeline'],
    'Chuyển Rule5Critic kiểm định'
  );

  // Phase 4: Rule5Critic
  const gov = evaluateOmnichannelCaptions({
    facebook_caption: generatedCopy.facebook_caption || generatedCopy.body,
    instagram_caption: generatedCopy.instagram_caption || generatedCopy.body,
    threads_caption: generatedCopy.threads_caption || generatedCopy.body,
    title: generatedCopy.title
  });
  pushPhase(
    'Rule5Critic',
    gov.allowed ? 'PASS Rule 5 trên cả 3 kênh' : `REVISE: ${gov.violations.join('; ')}`,
    ['rule5-v1'],
    gov.allowed ? 'Đủ điều kiện dựng Media' : 'Cần sửa copy trước khi dựng'
  );

  // Phase 5: MediaDirector
  const mediaType = isVideo ? 'video' : 'image';
  const mediaSpec = isVideo
    ? {
        mediaType: 'video',
        aspectRatio: '9:16',
        timeline: (generatedCopy.script && generatedCopy.script.timeline) || []
      }
    : {
        mediaType: 'image',
        aspectRatio: '3:4'
      };
  pushPhase(
    'MediaDirector',
    `Xác nhận định dạng ${mediaType} (${mediaSpec.aspectRatio})`,
    [format],
    'Sẵn sàng xuất bản theo tài khoản'
  );

  // Phase 6: PublisherCoordinator
  const workOrder = await workOrderGateway.createOrder({
    topic,
    pillar,
    format,
    slotId: slot.slot_id || null,
    briefRef: briefSummary.briefId,
    preGenerated: generatedCopy
  });
  pushPhase(
    'PublisherCoordinator',
    `Phát hành Work Order ${workOrder.id} (${workOrder.status})`,
    [workOrder.id, slot.slot_id || 'ad_hoc'],
    dryRun ? 'DRY_RUN_SIMULATED' : 'READY_FOR_DISPATCH'
  );

  const consensus = {
    pillar,
    angle,
    channelStrategy,
    mediaType,
    aspectRatio: mediaSpec.aspectRatio,
    rule5Passed: gov.allowed
  };

  const meetingsDir = getMeetingsDir();
  const meetingFile = path.join(meetingsDir, `${meetingId}.json`);
  const record = {
    meetingId,
    workOrderId: workOrder.id,
    slotId: slot.slot_id || null,
    createdAt: new Date().toISOString(),
    dryRun: Boolean(dryRun),
    roles: COUNCIL_ROLES,
    phases,
    consensus,
    generatedCopy,
    meetingFile
  };

  fs.writeFileSync(meetingFile, JSON.stringify(record, null, 2), 'utf8');
  return record;
}

module.exports = {
  COUNCIL_ROLES,
  runMultiAgentRoundtable,
  getMeetingsDir
};
