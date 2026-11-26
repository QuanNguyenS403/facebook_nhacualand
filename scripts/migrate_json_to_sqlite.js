'use strict';

/**
 * MIGRATE JSON TO SQLITE — NHÀ CỦA LAND (D:\Facebook)
 * Sao lưu & import an toàn data/scheduled_calendar.json và data/publish_history.json vào SQLite.
 * - Idempotent: chạy nhiều lần cho cùng kết quả, không nhân bản.
 * - Lịch sử cũ thiếu remote_post_id được gắn nhãn LEGACY_UNVERIFIED.
 * - Khóa tái phát các slot đã PUBLISHED/DONE trong lịch cũ.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const { openDb, getDataDir, withTransaction, sha256 } = require('../lib/db');

function ictToUtcIso(dateStr, timeStr = '08:30') {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date().toISOString();
  }
  const [hh, mm] = String(timeStr || '08:30').split(':').map(n => parseInt(n, 10) || 0);
  const pad = n => String(n).padStart(2, '0');
  const isoIct = `${dateStr}T${pad(hh)}:${pad(mm)}:00+07:00`;
  const d = new Date(isoIct);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function backupJsonFile(filePath, backupDir) {
  if (!fs.existsSync(filePath)) return null;
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupDir, `${path.basename(filePath)}.${stamp}.bak`);
  fs.copyFileSync(filePath, dest);
  return dest;
}

function migrateJsonToSqlite({ dataDir = getDataDir(), dbPath = null, backup = true } = {}) {
  const calPath = path.join(dataDir, 'scheduled_calendar.json');
  const histPath = path.join(dataDir, 'publish_history.json');
  const backupDir = path.join(dataDir, 'backups');

  const backups = [];
  if (backup) {
    const b1 = backupJsonFile(calPath, backupDir);
    if (b1) backups.push(b1);
    const b2 = backupJsonFile(histPath, backupDir);
    if (b2) backups.push(b2);
  }

  let calendarSlotsImported = 0;
  let historyEventsImported = 0;
  let legacyUnverifiedCount = 0;

  withTransaction((db) => {
    const nowIso = new Date().toISOString();

    if (fs.existsSync(calPath)) {
      const rawCal = fs.readFileSync(calPath, 'utf8');
      const calHash = sha256(rawCal);
      const parsedCal = JSON.parse(rawCal);
      const slots = Array.isArray(parsedCal.plan) ? parsedCal.plan : [];

      const upsertJob = db.prepare(`
        INSERT INTO jobs (
          job_id, slot_id, job_type, scheduled_at_utc, scheduled_date_ict,
          slot_time_ict, status, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
          status = CASE
            WHEN jobs.status IN ('PUBLISHED', 'DONE', 'VERIFIED') THEN jobs.status
            ELSE excluded.status
          END,
          updated_at = excluded.updated_at
      `);

      for (const slot of slots) {
        if (!slot || !slot.slot_id) continue;
        const jobId = `job_slot_${slot.slot_id}`;
        const rawStatus = String(slot.status || 'SCHEDULED').toUpperCase();
        const normalizedStatus = (rawStatus === 'DONE' || rawStatus === 'PUBLISHED') ? 'PUBLISHED' : rawStatus;
        const scheduledUtc = slot.scheduled_at_utc || ictToUtcIso(slot.date, slot.slot_time);

        upsertJob.run(
          jobId,
          slot.slot_id,
          slot.format || 'OMNICHANNEL_POST',
          scheduledUtc,
          slot.date || null,
          slot.slot_time || null,
          normalizedStatus,
          JSON.stringify(slot),
          slot.published_at || nowIso,
          nowIso
        );
        calendarSlotsImported++;
      }

      db.prepare(`
        INSERT OR IGNORE INTO migration_audit (migration_id, source_file, source_hash, rows_imported, imported_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(`mig_cal_${calHash.slice(0, 16)}`, calPath, calHash, calendarSlotsImported, nowIso);
    }

    if (fs.existsSync(histPath)) {
      const rawHist = fs.readFileSync(histPath, 'utf8');
      const histHash = sha256(rawHist);
      const parsedHist = JSON.parse(rawHist);
      const events = Array.isArray(parsedHist) ? parsedHist : (Array.isArray(parsedHist.events) ? parsedHist.events : []);

      const insertPub = db.prepare(`
        INSERT OR IGNORE INTO publications (
          publication_id, slot_id, variant_id, account_id, channel, content_version,
          status, provider_post_id, permalink, engine, proof_screenshot, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (!ev) continue;
        const channel = String(ev.platform || 'facebook').toLowerCase();
        const remoteId = ev.remote_post_id || ev.postId || ev.id || null;
        const status = remoteId ? 'VERIFIED' : 'LEGACY_UNVERIFIED';
        if (!remoteId) legacyUnverifiedCount++;

        const eventHash = sha256(JSON.stringify({ idx: i, ts: ev.timestamp, channel, msg: ev.message_preview || ev.message || '' }));
        const pubId = `pub_legacy_${eventHash.slice(0, 20)}`;
        const variantId = `var_legacy_${eventHash.slice(0, 16)}`;

        insertPub.run(
          pubId,
          ev.slot_id || null,
          variantId,
          ev.account_id || `default_${channel}`,
          channel,
          'legacy-v0',
          status,
          remoteId,
          ev.permalink || null,
          ev.engine || 'LEGACY_IMPORT',
          ev.proofScreenshot || null,
          ev.timestamp || nowIso,
          nowIso
        );
        historyEventsImported++;
      }

      db.prepare(`
        INSERT OR IGNORE INTO migration_audit (migration_id, source_file, source_hash, rows_imported, imported_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(`mig_hist_${histHash.slice(0, 16)}`, histPath, histHash, historyEventsImported, nowIso);
    }
  }, dbPath);

  const db = openDb(dbPath);
  const jobCount = db.prepare('SELECT COUNT(*) AS cnt FROM jobs').get().cnt;
  const pubCount = db.prepare('SELECT COUNT(*) AS cnt FROM publications').get().cnt;

  return {
    backups,
    calendarSlotsImported,
    historyEventsImported,
    legacyUnverifiedCount,
    dbTotals: { jobs: jobCount, publications: pubCount }
  };
}

if (require.main === module) {
  const res = migrateJsonToSqlite();
  console.log('✅ Migration JSON -> SQLite hoàn tất:');
  console.log(JSON.stringify(res, null, 2));
}

module.exports = {
  migrateJsonToSqlite,
  ictToUtcIso
};
