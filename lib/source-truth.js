'use strict';

/**
 * SOURCE TRUTH & ASSET RIGHTS VERIFIER — NHÀ CỦA LAND (D:\Facebook)
 * Xác minh theo từng listing_id và từng asset_id trong SQLite:
 * - Chặn tin demo (is_demo=1 hoặc slug bắt đầu bằng mau-) khỏi luồng ROOM_TOUR_REAL.
 * - Chặn tin hết phòng (availability != 'AVAILABLE') hoặc quá hạn (valid_until < now).
 * - Chặn tư liệu đã bị thu hồi (revoked_at != null) hoặc hết hạn quyền (rights_until < now).
 */

const { openDb } = require('./db');
const truthConfig = require('../config/product-truth-status.json');

function isExpired(isoStr, now = new Date()) {
  if (!isoStr) return false;
  const ts = Date.parse(isoStr);
  return Number.isFinite(ts) && ts < now.getTime();
}

function verifyListingForPublication(listingId, { now = new Date(), dbPath = null } = {}) {
  if (!listingId) {
    return {
      ok: false,
      reason: 'MISSING_LISTING_ID',
      recommendedType: truthConfig.fallback_topic_type || 'renter_education'
    };
  }

  const db = openDb(dbPath);
  const listing = db.prepare('SELECT * FROM listings WHERE listing_id = ?').get(listingId);
  if (!listing) {
    return {
      ok: false,
      reason: 'LISTING_NOT_FOUND',
      recommendedType: 'renter_education'
    };
  }

  const demoPrefixes = truthConfig.demo_slug_prefixes || ['mau-'];
  const urlLower = String(listing.canonical_url || '').toLowerCase();
  const hasDemoPrefix = demoPrefixes.some(p => urlLower.includes(`/${p}`) || urlLower.includes(p));

  if (listing.is_demo === 1 || hasDemoPrefix) {
    return {
      ok: false,
      reason: 'DEMO_LISTING_BLOCKED',
      recommendedType: 'renter_education',
      listing
    };
  }

  if (String(listing.availability || '').toUpperCase() !== 'AVAILABLE') {
    return {
      ok: false,
      reason: `LISTING_UNAVAILABLE_${listing.availability || 'UNKNOWN'}`,
      recommendedType: 'renter_education',
      listing
    };
  }

  if (isExpired(listing.valid_until, now)) {
    return {
      ok: false,
      reason: 'LISTING_VERIFICATION_EXPIRED',
      recommendedType: 'renter_education',
      listing
    };
  }

  return { ok: true, listing };
}

function verifyAssetRights(assetId, { channel = null, now = new Date(), dbPath = null } = {}) {
  if (!assetId) {
    return { ok: false, reason: 'MISSING_ASSET_ID' };
  }

  const db = openDb(dbPath);
  const asset = db.prepare('SELECT * FROM assets WHERE asset_id = ?').get(assetId);
  if (!asset) {
    return { ok: false, reason: 'ASSET_NOT_FOUND' };
  }

  const rights = db.prepare(`
    SELECT * FROM asset_rights
    WHERE asset_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(assetId);

  if (!rights) {
    return { ok: false, reason: 'ASSET_RIGHTS_MISSING', asset };
  }

  if (rights.revoked_at) {
    return { ok: false, reason: 'ASSET_RIGHTS_REVOKED', asset, rights };
  }

  if (isExpired(rights.rights_until, now)) {
    return { ok: false, reason: 'ASSET_RIGHTS_EXPIRED', asset, rights };
  }

  if (channel) {
    let allowed = [];
    try {
      allowed = JSON.parse(rights.allowed_channels_json || '[]');
    } catch (_) {
      allowed = [];
    }
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(channel)) {
      return { ok: false, reason: `ASSET_CHANNEL_NOT_ALLOWED_${channel}`, asset, rights };
    }
  }

  return { ok: true, asset, rights };
}

function upsertListing({
  listing_id,
  canonical_url = null,
  title = null,
  district = null,
  segment = null,
  rent_vnd = null,
  fees_breakdown = null,
  availability = 'AVAILABLE',
  is_demo = false,
  verification_source = 'manual',
  verified_at = new Date().toISOString(),
  valid_until = null,
  version = 1,
  raw = null
}, dbPath = null) {
  const db = openDb(dbPath);
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO listings (
      listing_id, canonical_url, title, district, segment, rent_vnd,
      fees_breakdown_json, availability, is_demo, verification_source,
      verified_at, valid_until, version, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(listing_id) DO UPDATE SET
      canonical_url = excluded.canonical_url,
      title = excluded.title,
      district = excluded.district,
      segment = excluded.segment,
      rent_vnd = excluded.rent_vnd,
      fees_breakdown_json = excluded.fees_breakdown_json,
      availability = excluded.availability,
      is_demo = excluded.is_demo,
      verification_source = excluded.verification_source,
      verified_at = excluded.verified_at,
      valid_until = excluded.valid_until,
      version = excluded.version,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `).run(
    listing_id,
    canonical_url,
    title,
    district,
    segment,
    rent_vnd,
    fees_breakdown ? JSON.stringify(fees_breakdown) : null,
    availability,
    is_demo ? 1 : 0,
    verification_source,
    verified_at,
    valid_until,
    version,
    raw ? JSON.stringify(raw) : null,
    nowIso
  );
  return listing_id;
}

module.exports = {
  verifyListingForPublication,
  verifyAssetRights,
  upsertListing
};
