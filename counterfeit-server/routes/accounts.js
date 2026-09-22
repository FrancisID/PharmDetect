const express = require('express');
const users = require('../db/users');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ---------- admin (and superuser) : approve/reject MoH staff registrations ----------

router.get('/admin/pending-accounts', requireAuth('admin'), (req, res) => {
  res.json(users.listViewers('pending'));
});

router.get('/admin/accounts', requireAuth('admin'), (req, res) => {
  res.json(users.listViewers());
});

router.post('/admin/accounts/:id/approve', requireAuth('admin'), (req, res) => {
  const target = users.getById(req.params.id);
  if (!target || target.role !== 'viewer') return res.status(404).json({ error: 'Staff account not found' });
  res.json(users.setStatus(target.id, 'approved'));
});

router.post('/admin/accounts/:id/reject', requireAuth('admin'), (req, res) => {
  const target = users.getById(req.params.id);
  if (!target || target.role !== 'viewer') return res.status(404).json({ error: 'Staff account not found' });
  res.json(users.setStatus(target.id, 'rejected'));
});

// ---------- superuser only : manage admins, deregister anyone ----------

router.get('/superuser/accounts', requireAuth('superuser'), (req, res) => {
  res.json(users.listAll());
});

router.post('/superuser/admins', requireAuth('superuser'), async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (users.getByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists' });
  const account = await users.appointAdmin({ email, password });
  res.status(201).json(account);
});

router.delete('/superuser/accounts/:id', requireAuth('superuser'), (req, res) => {
  const target = users.getById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Account not found' });
  if (target.role === 'superuser') return res.status(403).json({ error: 'Cannot deregister a superuser account through this endpoint' });
  users.deleteUser(target.id);
  res.json({ deregistered: true });
});

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

module.exports = router;
