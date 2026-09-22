const jwt = require('jsonwebtoken');
const users = require('../db/users');

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set in .env — required for login to work');
  return s;
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, secret(), { expiresIn: '7d' });
}

// requireAuth() — any approved, logged-in account.
// requireAuth('admin') — admin or superuser.
// requireAuth('superuser') — superuser only.
function requireAuth(minRole) {
  const minRank = minRole ? users.ROLE_RANK[minRole] : 0;
  return (req, res, next) => {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization: Bearer <token> header' });
    try {
      const payload = jwt.verify(token, secret());
      const user = users.getById(payload.sub);
      if (!user) return res.status(401).json({ error: 'Account no longer exists' });
      if (user.status !== 'approved') {
        return res.status(403).json({ error: `Your account is ${user.status} — an administrator must approve it before you can access the CEP Database.` });
      }
      if (users.ROLE_RANK[user.role] < minRank) {
        return res.status(403).json({ error: 'You do not have permission to perform this action' });
      }
      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired session — please log in again' });
    }
  };
}

module.exports = { issueToken, requireAuth };
