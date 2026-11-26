'use strict';

/**
 * SQLITE DATABASE LAYER (WAL MODE) — NHÀ CỦA LAND (D:\Facebook)
 * Sử dụng node:sqlite (built-in Node.js >= 22.5 / 24.x), không cần native build.
 * Tuân thủ cô lập DATA_DIR để test E2E và runtime không xung đột.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const connections = new Map();

function getDataDir() {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(WORKSPACE_ROOT, 'data');
}

function getDbPath(customPath = null) {
  if (customPath) return path.resolve(customPath);
  if (process.env.SQLITE_DB_PATH) return path.resolve(process.env.SQLITE_DB_PATH);
  return path.join(getDataDir(), 'nhacualand.db');
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex');
}

const SCHEMA_SQL = `
-- 1. Điều phối & Hàng đợi (Campaigns, Work Orders, Jobs)
CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id TEXT PRIMARY KEY,
  request_key TEXT UNIQUE NOT NULL,
  objective TEXT NOT NULL,
  market TEXT,
  duration_days INTEGER DEFAULT 14,
  timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh',
  targets_json TEXT NOT NULL DEFAULT '["facebook","instagram","threads"]',
  max_incremental_spend_vnd REAL NOT NULL DEFAULT 0,
  policy_version TEXT NOT NULL DEFAULT 'rule5-v1',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_orders (
  work_order_id TEXT PRIMARY KEY,
  campaign_id TEXT,
  slot_id TEXT,
  order_type TEXT NOT NULL DEFAULT 'OMNICHANNEL_POST',
  topic TEXT NOT NULL,
  pillar TEXT,
  listing_id TEXT,
  listing_version INTEGER,
  brief_ref TEXT,
  asset_ids_json TEXT DEFAULT '[]',
  required_checks_json TEXT DEFAULT '["rights","freshness","channel_copy","media_quality","target_identity"]',
  generated_json TEXT,
  compliance_json TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  human_approval_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY,
  work_order_id TEXT,
  slot_id TEXT,
  job_type TEXT NOT NULL,
  scheduled_at_utc TEXT NOT NULL,
  scheduled_date_ict TEXT,
  slot_time_ict TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  lease_owner TEXT,
  lease_until TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_id TEXT,
  last_error TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs(status, scheduled_at_utc);
CREATE INDEX IF NOT EXISTS idx_jobs_slot ON jobs(slot_id);

-- 2. Nguồn phòng & Dữ kiện (Listings, Snapshots, Claims)
CREATE TABLE IF NOT EXISTS listings (
  listing_id TEXT PRIMARY KEY,
  canonical_url TEXT,
  title TEXT,
  district TEXT,
  segment TEXT,
  rent_vnd REAL,
  fees_breakdown_json TEXT,
  availability TEXT NOT NULL DEFAULT 'UNKNOWN',
  is_demo INTEGER NOT NULL DEFAULT 0,
  verification_source TEXT,
  verified_at TEXT,
  valid_until TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  raw_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(listing_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS claims (
  claim_id TEXT PRIMARY KEY,
  listing_id TEXT,
  claim_text TEXT NOT NULL,
  verification_source TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  FOREIGN KEY (listing_id) REFERENCES listings(listing_id) ON DELETE CASCADE
);

-- 3. Tài sản media & Bản quyền (Assets, Rights, Links)
CREATE TABLE IF NOT EXISTS assets (
  asset_id TEXT PRIMARY KEY,
  listing_id TEXT,
  sha256 TEXT,
  original_ref TEXT,
  local_path TEXT,
  remote_url TEXT,
  mime_type TEXT,
  kind TEXT NOT NULL,
  is_synthetic INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  duration_sec REAL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(listing_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS asset_rights (
  rights_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  license_ref TEXT NOT NULL,
  allowed_channels_json TEXT NOT NULL DEFAULT '["facebook","instagram","threads"]',
  rights_until TEXT,
  revoked_at TEXT,
  consent_ref TEXT,
  verified_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_links (
  parent_asset_id TEXT NOT NULL,
  child_asset_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'DERIVED_FROM',
  created_at TEXT NOT NULL,
  PRIMARY KEY (parent_asset_id, child_asset_id),
  FOREIGN KEY (parent_asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE,
  FOREIGN KEY (child_asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

-- 4. Nghiên cứu, Biên tập & Kiểm định (Briefs, Content Versions, Variants, Decisions)
CREATE TABLE IF NOT EXISTS briefs (
  brief_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  pillar TEXT,
  source_mode TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  brief_json TEXT NOT NULL,
  file_path TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_versions (
  content_version_id TEXT PRIMARY KEY,
  work_order_id TEXT,
  brief_id TEXT,
  prompt_version TEXT NOT NULL DEFAULT 'rule5-v1',
  version_num INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(work_order_id) ON DELETE SET NULL,
  FOREIGN KEY (brief_id) REFERENCES briefs(brief_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS variants (
  variant_id TEXT PRIMARY KEY,
  content_version_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  caption_text TEXT NOT NULL,
  scene_asset_refs_json TEXT DEFAULT '[]',
  media_asset_id TEXT,
  variant_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (content_version_id) REFERENCES content_versions(content_version_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decisions (
  decision_id TEXT PRIMARY KEY,
  content_version_id TEXT,
  variant_id TEXT,
  policy_version TEXT NOT NULL DEFAULT 'rule5-v1',
  reviewed_hash TEXT NOT NULL,
  verdict TEXT NOT NULL,
  score INTEGER,
  violations_json TEXT DEFAULT '[]',
  reviewer_role TEXT NOT NULL DEFAULT 'Rule5Critic',
  created_at TEXT NOT NULL
);

-- 5. Xuất bản theo tài khoản & Đối soát (Publications, Attempts, Outbox)
CREATE TABLE IF NOT EXISTS publications (
  publication_id TEXT PRIMARY KEY,
  work_order_id TEXT,
  slot_id TEXT,
  variant_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  content_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  provider_container_id TEXT,
  provider_post_id TEXT,
  permalink TEXT,
  engine TEXT,
  proof_screenshot TEXT,
  error_message TEXT,
  next_attempt_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (variant_id, account_id, content_version)
);
CREATE INDEX IF NOT EXISTS idx_pub_slot_status ON publications(slot_id, status);

CREATE TABLE IF NOT EXISTS publication_attempts (
  attempt_id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  attempt_num INTEGER NOT NULL,
  engine TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_container_id TEXT,
  provider_post_id TEXT,
  request_hash TEXT,
  response_json TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (publication_id) REFERENCES publications(publication_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outbox (
  outbox_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  processed_at TEXT
);

-- 6. Đo lường & Chuyển đổi khách thuê (Metrics, Web Events, Attribution, Viewings)
CREATE TABLE IF NOT EXISTS social_metrics (
  metric_id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  window_label TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  raw_json TEXT,
  captured_at TEXT NOT NULL,
  FOREIGN KEY (publication_id) REFERENCES publications(publication_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS web_events (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  lead_ref TEXT,
  booking_ref TEXT,
  listing_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  payload_json TEXT,
  occurred_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attribution (
  attribution_id TEXT PRIMARY KEY,
  booking_ref TEXT,
  lead_ref TEXT,
  campaign_id TEXT,
  variant_id TEXT,
  channel TEXT NOT NULL,
  source_confidence TEXT NOT NULL,
  touch_type TEXT NOT NULL DEFAULT 'last_touch',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS viewing_events (
  viewing_id TEXT PRIMARY KEY,
  booking_ref TEXT UNIQUE NOT NULL,
  lead_ref TEXT,
  listing_id TEXT,
  district TEXT,
  status TEXT NOT NULL,
  scheduled_at TEXT,
  attended_at TEXT,
  cancelled_reason TEXT,
  commission_expected_vnd REAL DEFAULT 0,
  commission_collected_vnd REAL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 7. Ngân sách, Sự cố & Tổng hợp ngày (Budget Ledger, Incidents, Daily Rollups, Audit)
CREATE TABLE IF NOT EXISTS budget_ledger (
  ledger_id TEXT PRIMARY KEY,
  run_id TEXT,
  provider TEXT NOT NULL,
  meter TEXT NOT NULL,
  reserved REAL NOT NULL DEFAULT 0,
  actual REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  cost_vnd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'COMMITTED',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  incident_id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  component TEXT NOT NULL,
  channel TEXT,
  message TEXT NOT NULL,
  details_json TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_rollups (
  date_ict TEXT NOT NULL,
  channel TEXT NOT NULL,
  posts_verified INTEGER NOT NULL DEFAULT 0,
  posts_partial INTEGER NOT NULL DEFAULT 0,
  posts_failed INTEGER NOT NULL DEFAULT 0,
  viewings_requested INTEGER NOT NULL DEFAULT 0,
  viewings_confirmed INTEGER NOT NULL DEFAULT 0,
  viewings_attended INTEGER NOT NULL DEFAULT 0,
  incremental_spend_vnd REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date_ict, channel)
);

CREATE TABLE IF NOT EXISTS migration_audit (
  migration_id TEXT PRIMARY KEY,
  source_file TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  rows_imported INTEGER NOT NULL,
  imported_at TEXT NOT NULL
);
`;

function openDb(customPath = null) {
  const dbPath = getDbPath(customPath);
  if (connections.has(dbPath)) {
    return connections.get(dbPath);
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  connections.set(dbPath, db);
  return db;
}

function closeDb(customPath = null) {
  const dbPath = getDbPath(customPath);
  const db = connections.get(dbPath);
  if (db) {
    try { db.close(); } catch (_) {}
    connections.delete(dbPath);
  }
}

function closeAllDbs() {
  for (const [k, db] of connections.entries()) {
    try { db.close(); } catch (_) {}
    connections.delete(k);
  }
}

function withTransaction(fn, customPath = null) {
  const db = openDb(customPath);
  db.exec('BEGIN IMMEDIATE;');
  try {
    const res = fn(db);
    db.exec('COMMIT;');
    return res;
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw err;
  }
}

function backupDatabase(destPath = null, sourcePath = null) {
  const db = openDb(sourcePath);
  const target = destPath
    ? path.resolve(destPath)
    : path.join(getDataDir(), 'backups', `nhacualand_${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
  const escaped = target.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}';`);
  return target;
}

function recordBudgetUsage({ runId = null, provider, meter, reserved = 0, actual = 0, unit = 'calls', costVnd = 0, status = 'COMMITTED' }, customPath = null) {
  const db = openDb(customPath);
  const id = `bdg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  db.prepare(`
    INSERT INTO budget_ledger (ledger_id, run_id, provider, meter, reserved, actual, unit, cost_vnd, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, runId, provider, meter, reserved, actual, unit, costVnd, status, new Date().toISOString());
  return id;
}

function getTotalIncrementalSpendVnd(customPath = null) {
  const db = openDb(customPath);
  const row = db.prepare(`SELECT COALESCE(SUM(cost_vnd), 0) AS total FROM budget_ledger WHERE status != 'REVERTED'`).get();
  return row ? Number(row.total) : 0;
}

function recordIncident({ severity = 'WARN', component, channel = null, message, details = null }, customPath = null) {
  const db = openDb(customPath);
  const id = `inc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  db.prepare(`
    INSERT INTO incidents (incident_id, severity, component, channel, message, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, severity, component, channel, message, details ? JSON.stringify(details) : null, new Date().toISOString());
  return id;
}

module.exports = {
  getDataDir,
  getDbPath,
  openDb,
  closeDb,
  closeAllDbs,
  withTransaction,
  backupDatabase,
  recordBudgetUsage,
  getTotalIncrementalSpendVnd,
  recordIncident,
  sha256
};
