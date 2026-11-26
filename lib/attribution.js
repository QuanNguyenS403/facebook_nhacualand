'use strict';

/**
 * ATTRIBUTION & VIEWING CONVERSION ENGINE — NHÀ CỦA LAND (D:\Facebook)
 * Kết nối sự kiện website (UTM / GA4 / Form) với lịch xem phòng thực tế:
 *   visit -> viewing.requested -> viewing.confirmed -> viewing.attended / cancelled
 * Quy tắc quy nguồn:
 * - post_exact: khi có utm_content trỏ đúng variant_id/post đã xác thực.
 * - channel_campaign: khi có utm_source + utm_campaign (ví dụ link bio chiến dịch).
 * - channel_only: khi chỉ có utm_source.
 * - unknown: khi thiếu căn cứ.
 */

const crypto = require('crypto');
const { openDb, withTransaction } = require('./db');

function resolveSourceConfidence({ utm_source, utm_campaign, utm_content } = {}) {
  if (utm_source && utm_content) return 'post_exact';
  if (utm_source && utm_campaign) return 'channel_campaign';
  if (utm_source) return 'channel_only';
  return 'unknown';
}

function ingestWebEvent({
  event_id = null,
  event_name,
  lead_ref = null,
  booking_ref = null,
  listing_id = null,
  district = null,
  utm_source = null,
  utm_medium = null,
  utm_campaign = null,
  utm_content = null,
  commission_expected_vnd = 0,
  commission_collected_vnd = 0,
  cancelled_reason = null,
  occurred_at = new Date().toISOString(),
  payload = {}
}, dbPath = null) {
  if (!event_name) throw new Error('event_name là bắt buộc');
  const eid = event_id || `ev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const nowIso = new Date().toISOString();

  return withTransaction((db) => {
    const existing = db.prepare('SELECT event_id FROM web_events WHERE event_id = ?').get(eid);
    if (existing) {
      return { deduplicated: true, event_id: eid };
    }

    db.prepare(`
      INSERT INTO web_events (
        event_id, event_name, lead_ref, booking_ref, listing_id,
        utm_source, utm_medium, utm_campaign, utm_content,
        payload_json, occurred_at, ingested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eid, event_name, lead_ref, booking_ref, listing_id,
      utm_source, utm_medium, utm_campaign, utm_content,
      JSON.stringify(payload), occurred_at, nowIso
    );

    if (booking_ref && event_name.startsWith('viewing.')) {
      const statusMap = {
        'viewing.requested': 'REQUESTED',
        'viewing.confirmed': 'CONFIRMED',
        'viewing.attended': 'ATTENDED',
        'viewing.cancelled': 'CANCELLED'
      };
      const status = statusMap[event_name] || 'REQUESTED';
      const viewingId = `vw_${booking_ref}`;
      db.prepare(`
        INSERT INTO viewing_events (
          viewing_id, booking_ref, lead_ref, listing_id, district, status,
          scheduled_at, attended_at, cancelled_reason,
          commission_expected_vnd, commission_collected_vnd, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(booking_ref) DO UPDATE SET
          status = excluded.status,
          attended_at = COALESCE(excluded.attended_at, viewing_events.attended_at),
          cancelled_reason = COALESCE(excluded.cancelled_reason, viewing_events.cancelled_reason),
          commission_expected_vnd = MAX(viewing_events.commission_expected_vnd, excluded.commission_expected_vnd),
          commission_collected_vnd = MAX(viewing_events.commission_collected_vnd, excluded.commission_collected_vnd),
          updated_at = excluded.updated_at
      `).run(
        viewingId, booking_ref, lead_ref, listing_id, district, status,
        occurred_at,
        status === 'ATTENDED' ? occurred_at : null,
        cancelled_reason,
        commission_expected_vnd,
        commission_collected_vnd,
        nowIso
      );

      const confidence = resolveSourceConfidence({ utm_source, utm_campaign, utm_content });
      const channel = utm_source || 'unknown';
      const attrId = `attr_${booking_ref}`;
      db.prepare(`
        INSERT OR IGNORE INTO attribution (
          attribution_id, booking_ref, lead_ref, campaign_id, variant_id,
          channel, source_confidence, touch_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'last_touch', ?)
      `).run(attrId, booking_ref, lead_ref, utm_campaign, utm_content, channel, confidence, nowIso);
    }

    return { deduplicated: false, event_id: eid };
  }, dbPath);
}

function getFunnelSummary(dbPath = null) {
  const db = openDb(dbPath);
  const counts = db.prepare(`
    SELECT status, COUNT(*) AS cnt,
           COALESCE(SUM(commission_expected_vnd), 0) AS expected_vnd,
           COALESCE(SUM(commission_collected_vnd), 0) AS collected_vnd
    FROM viewing_events
    GROUP BY status
  `).all();

  const byChannel = db.prepare(`
    SELECT a.channel, a.source_confidence, COUNT(DISTINCT a.booking_ref) AS bookings,
           SUM(CASE WHEN v.status = 'ATTENDED' THEN 1 ELSE 0 END) AS attended
    FROM attribution a
    LEFT JOIN viewing_events v ON a.booking_ref = v.booking_ref
    GROUP BY a.channel, a.source_confidence
  `).all();

  return { counts, byChannel };
}

module.exports = {
  resolveSourceConfidence,
  ingestWebEvent,
  getFunnelSummary
};
