const express = require('express');
const pharmaDb = require('../db/pharmaDb');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/medications — a logged-in, approved manufacturer sees ONLY their
// own medications. (Admins/superusers use GET /api/admin/medications for the
// full cross-manufacturer view.)
router.get('/', requireAuth(), (req, res) => {
  if (req.user.role !== 'manufacturer') {
    return res.status(403).json({ error: 'Only manufacturer accounts have a personal medication list — admins should use /api/admin/medications' });
  }
  res.json(pharmaDb.listMedicationsByOwner(req.user.id));
});

// GET /api/medications/:productId — public lookup; does not require auth and
// does not leak which manufacturer owns it beyond the manufacturerId label
// already shown on the physical package.
router.get('/:productId', (req, res) => {
  const med = pharmaDb.getMedication(req.params.productId);
  if (!med) return res.status(404).json({ error: 'Medication not found' });
  res.json(med);
});

// POST /api/medications — register a medication under the logged-in
// manufacturer's own account. manufacturerId and ownerId are taken from the
// authenticated session, never from the request body.
router.post('/', requireAuth(), (req, res) => {
  if (req.user.role !== 'manufacturer') {
    return res.status(403).json({ error: 'Only manufacturer accounts can register medications' });
  }
  const { medicationName, batchNumber, yearOfManufacture, expectedLifespan } = req.body || {};
  if (!medicationName || !yearOfManufacture || !expectedLifespan) {
    return res.status(400).json({ error: 'medicationName, yearOfManufacture and expectedLifespan are all required' });
  }
  const med = pharmaDb.registerMedication({
    medicationName: String(medicationName),
    manufacturerId: req.user.manufacturer_id,
    ownerId: req.user.id,
    batchNumber: batchNumber ? String(batchNumber) : null,
    yearOfManufacture: Number(yearOfManufacture),
    expectedLifespan: Number(expectedLifespan)
  });
  res.status(201).json(med);
});

// DELETE /api/medications — clears only the logged-in manufacturer's own
// medications. Cannot affect other manufacturers' data.
router.delete('/', requireAuth(), (req, res) => {
  if (req.user.role !== 'manufacturer') {
    return res.status(403).json({ error: 'Only manufacturer accounts can clear their own medications' });
  }
  pharmaDb.clearAllForOwner(req.user.id);
  res.json({ cleared: true });
});

module.exports = router;
