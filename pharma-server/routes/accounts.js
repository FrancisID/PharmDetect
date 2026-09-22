const express = require('express');
const users = require('../db/users');
const pharmaDb = require('../db/pharmaDb');
const { requireAuth, issueToken } = require('../middleware/auth');

const router = express.Router();

// ---------- admin (and superuser) : approve/reject manufacturer registrations ----------

// GET /api/admin/pending-accounts — manufacturer registrations awaiting approval
router.get('/admin/pending-accounts', requireAuth('admin'), (req, res) => {
  res.json(users.listManufacturers('pending'));
});

// GET /api/admin/accounts — all manufacturer accounts, any status (oversight view)
router.get('/admin/accounts', requireAuth('admin'), (req, res) => {
  res.json(users.listManufacturers());
});

// POST /api/admin/accounts/:id/approve
router.post('/admin/accounts/:id/approve', requireAuth('admin'), (req, res) => {
  const target = users.getById(req.params.id);
  if (!target || target.role !== 'manufacturer') return res.status(404).json({ error: 'Manufacturer account not found' });
  res.json(users.setStatus(target.id, 'approved'));
});

// POST /api/admin/accounts/:id/reject
router.post('/admin/accounts/:id/reject', requireAuth('admin'), (req, res) => {
  const target = users.getById(req.params.id);
  if (!target || target.role !== 'manufacturer') return res.status(404).json({ error: 'Manufacturer account not found' });
  res.json(users.setStatus(target.id, 'rejected'));
});

// ---------- superuser only : manage admins, deregister anyone ----------

// GET /api/superuser/accounts — every account on this server, any role
router.get('/superuser/accounts', requireAuth('superuser'), (req, res) => {
  res.json(users.listAll());
});

// POST /api/superuser/admins — appoint a new admin directly (pre-approved)
router.post('/superuser/admins', requireAuth('superuser'), async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (users.getByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists' });
  const account = await users.appointAdmin({ email, password });
  res.status(201).json(account);
});

// DELETE /api/superuser/accounts/:id — deregister any account (manufacturer or admin).
// A superuser cannot delete another superuser through this route (protects the
// developer's own account from accidental or malicious removal by itself).
router.delete('/superuser/accounts/:id', requireAuth('superuser'), (req, res) => {
  const target = users.getById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Account not found' });
  if (target.role === 'superuser') return res.status(403).json({ error: 'Cannot deregister a superuser account through this endpoint' });
  users.deleteUser(target.id);
  res.json({ deregistered: true });
});

// POST /api/superuser/accounts/:id/approve — covers admin accounts too, for
// completeness (e.g. if an admin-candidate flow is added later).
router.post('/superuser/accounts/:id/approve', requireAuth('superuser'), (req, res) => {
  const target = users.getById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Account not found' });
  res.json(users.setStatus(target.id, 'approved'));
});
router.post('/superuser/accounts/:id/reject', requireAuth('superuser'), (req, res) => {
  const target = users.getById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Account not found' });
  res.json(users.setStatus(target.id, 'rejected'));
});

// ---------- admin (and superuser) : oversee and modify ANY medication entry ----------

// GET /api/admin/medications — every medication across every manufacturer
router.get('/admin/medications', requireAuth('admin'), (req, res) => {
  res.json(pharmaDb.listMedications());
});

// PUT /api/admin/medications/:productId — correct/modify any field on any entry
router.put('/admin/medications/:productId', requireAuth('admin'), (req, res) => {
  const existing = pharmaDb.getMedicationRaw(req.params.productId);
  if (!existing) return res.status(404).json({ error: 'Medication not found' });
  const updated = pharmaDb.adminUpdateMedication(req.params.productId, req.body || {});
  res.json(updated);
});

// DELETE /api/admin/medications/:productId — remove a single erroneous entry
router.delete('/admin/medications/:productId', requireAuth('admin'), (req, res) => {
  const existing = pharmaDb.getMedicationRaw(req.params.productId);
  if (!existing) return res.status(404).json({ error: 'Medication not found' });
  pharmaDb.deleteMedication(req.params.productId);
  res.json({ deleted: true });
});

module.exports = router;
