const nodemailer = require('nodemailer');
const cron = require('node-cron');
const counterfeitDb = require('../db/counterfeitDb');

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

function isoWeekKey(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

function periodStartDate(frequency, now = new Date()) {
  if (frequency === 'weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  // monthly: first day of the previous calendar month
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

function currentPeriodKey(frequency, now = new Date()) {
  return frequency === 'weekly' ? isoWeekKey(now) : monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

function buildReportBody(rows, frequency, periodKey) {
  const label = frequency === 'weekly' ? `week ${periodKey}` : new Date(`${periodKey}-01`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  if (!rows.length) {
    return `PharmDetect Counterfeit and Fake Medication Report — ${label}\n\nNo counterfeit or expired medications were detected in this period.`;
  }
  const lines = rows.map(r => `- [${r.status}] Medication ID ${r.productId} at ${r.gps} (${r.detectedAt}): ${r.reason}`);
  return `PharmDetect Counterfeit and Fake Medication Report — ${label}\nTotal flagged medications: ${rows.length}\n\n${lines.join('\n')}`;
}

async function sendReport({ force = false } = {}) {
  const frequency = (process.env.REPORT_FREQUENCY || 'monthly').toLowerCase() === 'weekly' ? 'weekly' : 'monthly';
  const periodKey = currentPeriodKey(frequency);
  if (!force && counterfeitDb.wasReportSent(periodKey)) {
    return { skipped: true, reason: 'already sent', periodKey, frequency };
  }
  const since = periodStartDate(frequency).toISOString();
  const rows = counterfeitDb.listSince(since);
  const body = buildReportBody(rows, frequency, periodKey);

  const transport = getTransport();
  const agencyEmail = process.env.MOH_AGENCY_EMAIL;
  if (!transport || !agencyEmail) {
    return { sent: false, reason: 'SMTP_HOST/SMTP_USER/SMTP_PASS/MOH_AGENCY_EMAIL not configured in .env', periodKey, frequency, preview: body };
  }

  await transport.sendMail({
    from: process.env.REPORT_FROM || process.env.SMTP_USER,
    to: agencyEmail,
    subject: `PharmDetect Counterfeit/Expired Medication Report — ${periodKey}`,
    text: body
  });

  counterfeitDb.markReportSent(periodKey, rows.length);
  return { sent: true, periodKey, frequency, count: rows.length };
}

// Real server-side automation: checks daily, but only actually sends once per
// period (weekly on Mondays, or monthly on the 1st), independent of any client.
function scheduleReport() {
  cron.schedule('10 0 * * *', async () => {
    const frequency = (process.env.REPORT_FREQUENCY || 'monthly').toLowerCase() === 'weekly' ? 'weekly' : 'monthly';
    const today = new Date();
    const isReportDay = frequency === 'weekly' ? today.getDay() === 1 /* Monday */ : today.getDate() === 1;
    if (!isReportDay) return;
    try {
      const result = await sendReport();
      console.log('[counterfeit-report]', result);
    } catch (err) {
      console.error('[counterfeit-report] failed', err);
    }
  });
  console.log(`Ministry of Health report scheduler armed (${(process.env.REPORT_FREQUENCY || 'monthly')} cadence).`);
}

module.exports = { sendReport, scheduleReport, currentPeriodKey };
