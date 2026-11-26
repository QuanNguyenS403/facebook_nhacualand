'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbLib = require('../../lib/db');
const { migrateJsonToSqlite } = require('../../scripts/migrate_json_to_sqlite');
const { parseTargetPlatforms, classifyMediaInput } = require('../../services/publish-executor');
const sourceTruth = require('../../lib/source-truth');
const attribution = require('../../lib/attribution');
const { generateWeeklyExecutiveReport } = require('../../scripts/weekly_report');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nhacualand_${prefix}_`));
}

describe('M4: Master Plan Upgrade (SQLite WAL, P0 Fixes, Source Truth, Attribution)', () => {
  it('opens SQLite in WAL mode, records budget usage, and creates consistent backup', () => {
    const dir = makeTempDir('db');
    const dbPath = path.join(dir, 'test.db');
    try {
      const db = dbLib.openDb(dbPath);
      const mode = db.prepare('PRAGMA journal_mode;').get();
      assert.equal(String(mode.journal_mode).toLowerCase(), 'wal');

      dbLib.recordBudgetUsage({ provider: 'gemini', meter: 'tokens', actual: 100, costVnd: 0 }, dbPath);
      assert.equal(dbLib.getTotalIncrementalSpendVnd(dbPath), 0);

      const backupPath = dbLib.backupDatabase(path.join(dir, 'backup.db'), dbPath);
      assert.equal(fs.existsSync(backupPath), true);
    } finally {
      dbLib.closeAllDbs();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('migrates JSON calendar & history idempotently and marks missing IDs as LEGACY_UNVERIFIED', () => {
    const dir = makeTempDir('mig');
    const dbPath = path.join(dir, 'mig.db');
    try {
      fs.writeFileSync(path.join(dir, 'scheduled_calendar.json'), JSON.stringify({
        plan: [
          { slot_id: 's1', date: '2026-11-26', slot_time: '08:30', status: 'PUBLISHED', format: 'OMNICHANNEL_POST' },
          { slot_id: 's2', date: '2026-11-26', slot_time: '11:30', status: 'SCHEDULED', format: 'REELS' }
        ]
      }));
      fs.writeFileSync(path.join(dir, 'publish_history.json'), JSON.stringify([
        { timestamp: '2026-11-26T01:30:00Z', platform: 'facebook', message: 'Test legacy' },
        { timestamp: '2026-11-26T02:00:00Z', platform: 'instagram', remote_post_id: 'ig_123' }
      ]));

      const first = migrateJsonToSqlite({ dataDir: dir, dbPath, backup: false });
      const second = migrateJsonToSqlite({ dataDir: dir, dbPath, backup: false });

      assert.equal(first.dbTotals.jobs, 2);
      assert.equal(first.dbTotals.publications, 2);
      assert.equal(first.legacyUnverifiedCount, 1);
      assert.equal(second.dbTotals.jobs, 2);
      assert.equal(second.dbTotals.publications, 2);
    } finally {
      dbLib.closeAllDbs();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parseTargetPlatforms normalizes aliases and rejects unknown channels', () => {
    assert.deepEqual(parseTargetPlatforms('facebook_fanpage,ig'), ['facebook', 'instagram']);
    assert.throws(() => parseTargetPlatforms('tiktok_unknown'), /không hợp lệ/i);
  });

  it('classifyMediaInput distinguishes remote URLs from missing local paths', () => {
    const remote = classifyMediaInput('https://cdn.nhacualand.com/room.jpg?sig=1');
    assert.equal(remote.kind, 'remote_url');
    assert.equal(remote.isRemote, true);
    assert.equal(remote.isVideo, false);

    const missing = classifyMediaInput('D:/Facebook/data/images/nonexistent_123.png');
    assert.equal(missing.kind, 'missing_local');
  });

  it('source-truth blocks demo listings (mau-*) and allows verified available listings', () => {
    const dir = makeTempDir('truth');
    const dbPath = path.join(dir, 'truth.db');
    try {
      sourceTruth.upsertListing({
        listing_id: 'L_DEMO',
        canonical_url: 'https://nhacualand.com/tin/mau-studio-cau-giay',
        availability: 'AVAILABLE',
        is_demo: false
      }, dbPath);
      const demoRes = sourceTruth.verifyListingForPublication('L_DEMO', { dbPath });
      assert.equal(demoRes.ok, false);
      assert.equal(demoRes.reason, 'DEMO_LISTING_BLOCKED');

      sourceTruth.upsertListing({
        listing_id: 'L_REAL',
        canonical_url: 'https://nhacualand.com/tin/phong-cau-giay-id31',
        availability: 'AVAILABLE',
        is_demo: false,
        valid_until: '2099-01-01T00:00:00Z'
      }, dbPath);
      const realRes = sourceTruth.verifyListingForPublication('L_REAL', { dbPath });
      assert.equal(realRes.ok, true);
    } finally {
      dbLib.closeAllDbs();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('attribution tracks viewing funnel without duplicating event_id and feeds weekly report', () => {
    const dir = makeTempDir('attr');
    const dbPath = path.join(dir, 'attr.db');
    try {
      const r1 = attribution.ingestWebEvent({
        event_id: 'ev_1',
        event_name: 'viewing.requested',
        lead_ref: 'lead_1',
        booking_ref: 'bk_1',
        utm_source: 'instagram',
        utm_campaign: 'pilot_cau_giay'
      }, dbPath);
      const r2 = attribution.ingestWebEvent({
        event_id: 'ev_1',
        event_name: 'viewing.requested',
        lead_ref: 'lead_1',
        booking_ref: 'bk_1'
      }, dbPath);
      assert.equal(r1.deduplicated, false);
      assert.equal(r2.deduplicated, true);

      attribution.ingestWebEvent({
        event_id: 'ev_2',
        event_name: 'viewing.attended',
        lead_ref: 'lead_1',
        booking_ref: 'bk_1',
        commission_expected_vnd: 1600000
      }, dbPath);

      const report = generateWeeklyExecutiveReport(dbPath);
      assert.equal(report.incrementalSpendVnd, 0);
      assert.equal(report.viewingFunnel.byChannel[0].source_confidence, 'channel_campaign');
      assert.equal(report.viewingFunnel.byChannel[0].attended, 1);
    } finally {
      dbLib.closeAllDbs();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
