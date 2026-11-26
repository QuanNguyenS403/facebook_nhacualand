'use strict';

/**
 * BÁO CÁO TUẦN MỘT TRANG CHO SẾP — NHÀ CỦA LAND (D:\Facebook)
 * Tổng hợp từ SQLite:
 * (1) Khách đủ điều kiện, lịch xác nhận, lượt đã đến & doanh thu
 * (2) Kết quả xuất bản theo kênh (VERIFIED / PARTIAL / UNKNOWN / LEGACY_UNVERIFIED)
 * (3) Chi tăng thêm (budget_ledger) & chi phí mỗi lượt đến
 * (4) Sự cố mở & việc cần chủ tài khoản xử lý
 */

require('../lib/env-loader');
const { openDb, getTotalIncrementalSpendVnd } = require('../lib/db');
const { getFunnelSummary } = require('../lib/attribution');

function generateWeeklyExecutiveReport(dbPath = null) {
  const db = openDb(dbPath);

  const pubByChannel = db.prepare(`
    SELECT channel,
           SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified,
           SUM(CASE WHEN status = 'UNKNOWN' THEN 1 ELSE 0 END) AS unknown,
           SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status = 'LEGACY_UNVERIFIED' THEN 1 ELSE 0 END) AS legacy_unverified
    FROM publications
    GROUP BY channel
  `).all();

  const jobStats = db.prepare(`
    SELECT status, COUNT(*) AS cnt FROM jobs GROUP BY status
  `).all();

  const openIncidents = db.prepare(`
    SELECT severity, component, channel, message, created_at
    FROM incidents
    WHERE resolved_at IS NULL
    ORDER BY created_at DESC LIMIT 10
  `).all();

  const funnel = getFunnelSummary(dbPath);
  const spendVnd = getTotalIncrementalSpendVnd(dbPath);

  const report = {
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Ho_Chi_Minh',
    publicationsByChannel: pubByChannel,
    schedulerJobs: jobStats,
    viewingFunnel: funnel,
    incrementalSpendVnd: spendVnd,
    openIncidents
  };

  return report;
}

if (require.main === module) {
  const r = generateWeeklyExecutiveReport();
  console.log('================================================================');
  console.log('📊 BÁO CÁO ĐIỀU HÀNH TUẦN — NHÀ CỦA LAND (nhacualand.com)');
  console.log('================================================================');
  console.log(JSON.stringify(r, null, 2));
}

module.exports = { generateWeeklyExecutiveReport };
