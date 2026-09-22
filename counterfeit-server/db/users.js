const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Three roles on the CEP Database side:
//   viewer     — self-registers (Ministry of Health staff), starts 'pending'
//   admin      — appointed directly by the superuser, pre-approved
//   superuser  — exactly one, seeded from SUPERUSER_EMAIL/SUPERUSER_PASSWORD
//                in .env on first boot; belongs to the developer/operator
const db = new Database(path.join(DATA_DIR, 'counterfeit_and_fake_medications.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('viewer','admin','superuser')),
    status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const ROLE_RANK = { viewer: 0, admin: 1, superuser: 2 };

const insertStmt = db.prepare(`
  INSERT INTO users (email, password_hash, role, status) VALUES (@email, @passwordHash, @role, @status)
`);
const getByEmailStmt = db.prepare('SELECT * FROM users WHERE email = ?');
const getByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const listByRoleStmt = db.prepare('SELECT * FROM users WHERE role = ? ORDER BY id DESC');
const listByRoleStatusStmt = db.prepare('SELECT * FROM users WHERE role = ? AND status = ? ORDER BY id DESC');
const listAllStmt = db.prepare('SELECT * FROM users ORDER BY id DESC');
const setStatusStmt = db.prepare('UPDATE users SET status = ? WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
const countSuperusersStmt = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'superuser'");

function toApiShape(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, role: row.role, status: row.status, createdAt: row.created_at };
}

async function ensureSuperuser() {
  if (countSuperusersStmt.get().n > 0) return;
  const email = process.env.SUPERUSER_EMAIL;
  const password = process.env.SUPERUSER_PASSWORD;
  if (!email || !password) {
    console.warn('No superuser exists yet, and SUPERUSER_EMAIL/SUPERUSER_PASSWORD are not set in .env — set them and restart to create the developer superuser account.');
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  insertStmt.run({ email, passwordHash, role: 'superuser', status: 'approved' });
  console.log(`Superuser account created for ${email}.`);
}

module.exports = {
  ROLE_RANK,
  ensureSuperuser,
  async registerViewer({ email, password }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const info = insertStmt.run({ email, passwordHash, role: 'viewer', status: 'pending' });
    return toApiShape(getByIdStmt.get(info.lastInsertRowid));
  },
  async appointAdmin({ email, password }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const info = insertStmt.run({ email, passwordHash, role: 'admin', status: 'approved' });
    return toApiShape(getByIdStmt.get(info.lastInsertRowid));
  },
  async verifyPassword(email, password) {
    const row = getByEmailStmt.get(email);
    if (!row) return null;
    const ok = await bcrypt.compare(password, row.password_hash);
    return ok ? row : null;
  },
  getById(id) { return getByIdStmt.get(id); },
  getByEmail(email) { return getByEmailStmt.get(email); },
  listViewers(status) {
    const rows = status ? listByRoleStatusStmt.all('viewer', status) : listByRoleStmt.all('viewer');
    return rows.map(toApiShape);
  },
  listAdmins() { return listByRoleStmt.all('admin').map(toApiShape); },
  listAll() { return listAllStmt.all().map(toApiShape); },
  setStatus(id, status) { setStatusStmt.run(status, id); return toApiShape(getByIdStmt.get(id)); },
  deleteUser(id) { deleteStmt.run(id); },
  toApiShape
};
