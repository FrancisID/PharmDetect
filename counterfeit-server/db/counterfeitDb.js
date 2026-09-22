const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// This is a physically separate service from the Pharmaceutical Database —
// it is meant to be deployed on its own host, under the Ministry of Health
// monitoring agency's own infrastructure and access control.
const db = new Database(path.join(DATA_DIR, 'counterfeit_and_fake_medications.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS counterfeit_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('COUNTERFEIT','EXPIRED')),
    reason TEXT NOT NULL,
    gps TEXT,
    detected_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS report_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_key TEXT UNIQUE NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    record_count INTEGER NOT NULL
  );
`);

function toApiShape(row) {
  return {
    id: row.id,
    productId: row.product_id,
    status: row.status,
    reason: row.reason,
    gps: row.gps,
    detectedAt: row.detected_at
  };
}

const insertStmt = db.prepare(`
  INSERT INTO counterfeit_reports (product_id, status, reason, gps) VALUES (@productId, @status, @reason, @gps)
`);
const listStmt = db.prepare('SELECT * FROM counterfeit_reports ORDER BY id DESC');
const sinceStmt = db.prepare(`SELECT * FROM counterfeit_reports WHERE detected_at >= ? ORDER BY id ASC`);
const logSentStmt = db.prepare(`INSERT OR REPLACE INTO report_log (period_key, record_count) VALUES (?, ?)`);
const wasSentStmt = db.prepare('SELECT 1 FROM report_log WHERE period_key = ?');
const lastSentStmt = db.prepare('SELECT period_key, sent_at FROM report_log ORDER BY sent_at DESC LIMIT 1');
const clearStmt = db.prepare('DELETE FROM counterfeit_reports');

module.exports = {
  raw: db,
  addReport(input) {
    insertStmt.run(input);
    return this.list()[0];
  },
  list() {
    return listStmt.all().map(toApiShape);
  },
  listSince(isoDate) {
    return sinceStmt.all(isoDate).map(toApiShape);
  },
  wasReportSent(periodKey) {
    return !!wasSentStmt.get(periodKey);
  },
  markReportSent(periodKey, count) {
    logSentStmt.run(periodKey, count);
  },
  lastSent() {
    return lastSentStmt.get() || null;
  },
  clearAll() {
    clearStmt.run();
  }
};
