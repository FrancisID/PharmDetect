const express = require('express');
const users = require('../db/users');
const { issueToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register — public. Always creates a 'viewer' account (MoH
// staff) with status 'pending'. An admin or the superuser must approve it.
router.post('/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (users.getByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists' });

  const account = await users.registerViewer({ email, password });
  res.status(201).json({ user: account, note: 'Registration received. An administrator must approve your account before you can log in.' });
});

// POST /api/auth/login — works for any role; blocked unless status is 'approved'.
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const row = await users.verifyPassword(email, password);
  if (!row) return res.status(401).json({ error: 'Incorrect email or password' });
  if (row.status !== 'approved') {
    return res.status(403).json({ error: row.status === 'pending' ? 'Your registration is pending administrator approval.' : 'Your registration was not approved.' });
  }
  const account = users.toApiShape(row);
  const token = issueToken(account);
  res.json({ token, user: account });
});

router.get('/me', requireAuth(), (req, res) => {
  res.json(users.toApiShape(req.user));
});

module.exports = router;
