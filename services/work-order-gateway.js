'use strict';

/**
 * AUTONOMOUS WORK ORDER GATEWAY (ZERO-HUMAN-APPROVAL)
 * Thương hiệu: Nhà Của Land (nhacualand.com) — Chỉ duy nhất tại D:\Facebook
 *
 * Nâng cấp: Lưu bền vững vào SQLite bảng work_orders (ngoài cache Map trong bộ nhớ)
 * để không mất lệnh khi khởi động lại tiến trình.
 */

require('../lib/env-loader');
const crypto = require('crypto');
const { generatePost, generateVideoScript } = require('./ai_pipeline');
const { evaluateContent, evaluateOmnichannelCaptions } = require('../lib/governance');
const { openDb } = require('../lib/db');

class WorkOrderGateway {
  constructor() {
    this.orders = new Map();
  }

  async createOrder({
    topic,
    pillar = 'Không Gian Sống & Tiện Nghi Phòng Thuê',
    format = 'OMNICHANNEL_POST',
    slotId = null,
    briefRef = null,
    listingId = null,
    listingVersion = null,
    preGenerated = null
  }) {
    const orderId = `WO_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    let generated = preGenerated;
    if (!generated) {
      if (String(format).includes('REELS') || String(format).includes('VIDEO')) {
        generated = await generateVideoScript({ concept: topic });
      } else {
        generated = await generatePost({ topic, pillar, format });
      }
    }

    const scriptVoiceover = (generated && Array.isArray(generated.timeline))
      ? generated.timeline.map(s => s && s.voiceover).filter(Boolean).slice(0, 3).join(' ')
      : '';
    const gov = (generated && (generated.facebook_caption || generated.instagram_caption || generated.threads_caption))
      ? evaluateOmnichannelCaptions({
          facebook_caption: generated.facebook_caption || generated.body || '',
          instagram_caption: generated.instagram_caption || generated.facebook_caption || generated.body || '',
          threads_caption: generated.threads_caption || generated.facebook_caption || generated.body || ''
        })
      : evaluateContent({
          caption: typeof generated === 'object'
            ? (generated.body || scriptVoiceover || generated.hook_3s || generated.call_to_action || '')
            : String(generated)
        });

    const nowIso = new Date().toISOString();
    const status = gov.allowed ? 'SELF_APPROVED_READY_TO_PUBLISH' : 'BLOCKED_BY_POLICY';

    const order = {
      id: orderId,
      created_at: nowIso,
      slot_id: slotId,
      brief_ref: briefRef,
      listing_id: listingId,
      listing_version: listingVersion,
      topic,
      pillar,
      format,
      human_approval_required: false,
      generated,
      compliance: gov,
      status
    };

    this.orders.set(orderId, order);

    try {
      const db = openDb();
      db.prepare(`
        INSERT OR REPLACE INTO work_orders (
          work_order_id, slot_id, order_type, topic, pillar, listing_id,
          listing_version, brief_ref, generated_json, compliance_json,
          status, human_approval_required, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        orderId,
        slotId,
        format,
        topic,
        pillar,
        listingId,
        listingVersion,
        briefRef,
        JSON.stringify(generated),
        JSON.stringify(gov),
        status,
        nowIso,
        nowIso
      );
    } catch (_) {}

    return order;
  }

  getOrder(id) {
    if (this.orders.has(id)) return this.orders.get(id);
    try {
      const db = openDb();
      const row = db.prepare('SELECT * FROM work_orders WHERE work_order_id = ?').get(id);
      if (!row) return undefined;
      return {
        id: row.work_order_id,
        created_at: row.created_at,
        slot_id: row.slot_id,
        brief_ref: row.brief_ref,
        topic: row.topic,
        pillar: row.pillar,
        format: row.order_type,
        human_approval_required: false,
        generated: JSON.parse(row.generated_json || '{}'),
        compliance: JSON.parse(row.compliance_json || '{}'),
        status: row.status
      };
    } catch (_) {
      return undefined;
    }
  }

  listOrders() {
    try {
      const db = openDb();
      const rows = db.prepare('SELECT * FROM work_orders ORDER BY created_at DESC LIMIT 200').all();
      if (rows.length > 0) {
        return rows.map(row => ({
          id: row.work_order_id,
          created_at: row.created_at,
          slot_id: row.slot_id,
          brief_ref: row.brief_ref,
          topic: row.topic,
          pillar: row.pillar,
          format: row.order_type,
          human_approval_required: false,
          status: row.status
        }));
      }
    } catch (_) {}
    return Array.from(this.orders.values());
  }
}

module.exports = new WorkOrderGateway();
