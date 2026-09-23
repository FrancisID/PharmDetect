const express = require('express');
const fetch = require('node-fetch');
const pharmaDb = require('../db/pharmaDb');

const router = express.Router();

function nowIso() { return new Date().toISOString(); }

// Reports a counterfeit or expired finding to the separately hosted
// Counterfeit and Fake Medication Database over the network. This is the one
// point of contact between the two independently deployed services.
async function relayToCounterfeitDb({ productId, status, reason, gps }) {
  const url = process.env.COUNTERFEIT_API_URL;
  if (!url) {
    console.warn('[relay] COUNTERFEIT_API_URL not configured — finding was NOT reported to the Counterfeit database:', productId, status);
    return { relayed: false, reason: 'COUNTERFEIT_API_URL not configured' };
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/counterfeit-reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.COUNTERFEIT_API_KEY ? { 'x-api-key': process.env.COUNTERFEIT_API_KEY } : {})
      },
      body: JSON.stringify({ productId, status, reason, gps })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[relay] Counterfeit server rejected the report:', res.status, text);
      return { relayed: false, reason: `Counterfeit server returned ${res.status}` };
    }
    return { relayed: true };
  } catch (err) {
    console.error('[relay] Could not reach the Counterfeit server:', err.message);
    return { relayed: false, reason: 'Counterfeit server unreachable' };
  }
}

// POST /api/scan  { productId, gps }
// Read-only from the Pharmaceutical Database's point of view — never marks a
// medication sold. A genuine, unsold medication comes back PENDING_PURCHASE.
router.post('/scan', async (req, res) => {
  const { productId, gps } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'productId is required' });
  const location = gps || 'unknown';
  const med = pharmaDb.getMedicationRaw(productId);

  if (!med) {
    const reason = 'This Product ID does not exist in the Pharmaceutical Database.';
    await relayToCounterfeitDb({ productId, status: 'COUNTERFEIT', reason, gps: location });
    return res.json({ status: 'COUNTERFEIT', reason });
  }

  if (pharmaDb.isExpired(med)) {
    const reason = `Manufactured ${med.year_of_manufacture}, expected shelf life ${med.expected_lifespan} years — past its expiry date.`;
    await relayToCounterfeitDb({ productId, status: 'EXPIRED', reason, gps: location });
    return res.json({ status: 'EXPIRED', reason });
  }

  if (med.sold) {
    const attempts = pharmaDb.bumpCloneAttempts(productId);
    const reason = `Cloned QR code. The original sale of this medication was already recorded on ${med.first_sale_date} at ${med.first_sale_gps}. This is counterfeit attempt #${attempts}.`;
    await relayToCounterfeitDb({ productId, status: 'COUNTERFEIT', reason, gps: location });
    return res.json({ status: 'COUNTERFEIT', reason });
  }

  return res.json({
    status: 'PENDING_PURCHASE',
    medication: pharmaDb.getMedication(productId),
    reason: 'This medication checks out as genuine and unsold. It will only be marked Sold once the buyer confirms the purchase.'
  });
});

// POST /api/purchase  { productId, gps } — call only after the buyer confirms
router.post('/purchase', async (req, res) => {
  const { productId, gps } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'productId is required' });
  const location = gps || 'unknown';
  const med = pharmaDb.getMedicationRaw(productId);

  if (!med) return res.status(404).json({ error: 'Medication not found' });

  if (med.sold) {
    const attempts = pharmaDb.bumpCloneAttempts(productId);
    const reason = `This medication was confirmed sold elsewhere moments ago (original sale ${med.first_sale_date} at ${med.first_sale_gps}). Treated as counterfeit attempt #${attempts}.`;
    await relayToCounterfeitDb({ productId, status: 'COUNTERFEIT', reason, gps: location });
    return res.status(409).json({ status: 'COUNTERFEIT', reason });
  }

  const updated = pharmaDb.markSold(productId, { dateOfSale: nowIso(), storeOfSale: location });
  return res.json({ status: 'ORIGINAL', medication: updated });
});

module.exports = router;
