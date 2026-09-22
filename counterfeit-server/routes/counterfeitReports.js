const express = require('express');
const counterfeitDb = require('../db/counterfeitDb');
const requireApiKey = require('../middleware/requireApiKey');
const { requireAuth } = require('../middleware/auth');
const { sendReport, currentPeriodKey } = require('../services/emailReport');

const router = express.Router();

// POST /api/counterfeit-reports — write path, used ONLY by the Pharmaceutical
// Database server's relay (service-to-service, authenticated with the shared
// API key set in .env — never a human login, and never called by consumer apps).
router.post('/', requireApiKey, (req, res) => {
  const { productId, status, reason, gps } = req.body || {};
  if (!productId || !status || !reason) {
    return res.status(400).json({ error: 'productId, status and reason are required' });
  }
  if (!['COUNTERFEIT', 'EXPIRED'].includes(status)) {
    return res.status(400).json({ error: 'status must be COUNTERFEIT or EXPIRED' });
  }
  const record = counterfeitDb.addReport({ productId, status, reason, gps: gps || 'unknown' });
  res.status(201).json(record);
});

// GET /api/counterfeit-reports — read path for the Ministry of Health agency viewer.
// Any logged-in agency user (admin or viewer) can read.
router.get('/', requireAuth(), (req, res) => {
  res.json(counterfeitDb.list());
});

router.get('/export.csv', requireAuth(), (req, res) => {
  const rows = counterfeitDb.list();
  const header = 'Product ID,Status,Reason,GPS,Detected\n';
  const body = rows.map(r => [r.productId, r.status, `"${r.reason.replace(/"/g, "'")}"`, `"${r.gps}"`, r.detectedAt].join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="counterfeit_and_fake_medications.csv"');
  res.send(header + body);
});

router.get('/status', requireAuth(), (req, res) => {
  const last = counterfeitDb.lastSent();
  res.json({
    agencyEmail: process.env.MOH_AGENCY_EMAIL || null,
    smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    frequency: (process.env.REPORT_FREQUENCY || 'monthly').toLowerCase() === 'weekly' ? 'weekly' : 'monthly',
    lastSentPeriod: last ? last.period_key : null,
    lastSentAt: last ? last.sent_at : null,
    totalRecords: counterfeitDb.list().length
  });
});

// Sending an out-of-cycle report and clearing data are both admin-only actions.
router.post('/send-now', requireAuth('admin'), async (req, res) => {
  try {
    const result = await sendReport({ force: true });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send report', detail: err.message });
  }
});

router.delete('/', requireAuth('admin'), (req, res) => {
  counterfeitDb.clearAll();
  res.json({ cleared: true });
});

module.exports = router;
