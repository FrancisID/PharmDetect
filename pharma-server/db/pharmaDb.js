const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// The Pharmaceutical Database — owned and operated for pharmaceutical
// manufacturers. Physically and operationally separate from the Counterfeit
// and Fake Medication Database, which lives on its own host under the
// Ministry of Health monitoring agency.
const db = new Database(path.join(DATA_DIR, 'pharmaceutical.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT UNIQUE NOT NULL,
    medication_name TEXT NOT NULL,
    manufacturer_id TEXT NOT NULL,
    owner_id INTEGER,
    batch_number TEXT,
    year_of_manufacture INTEGER NOT NULL,
    expected_lifespan INTEGER NOT NULL,
    sold INTEGER NOT NULL DEFAULT 0,
    date_of_sale TEXT,
    store_of_sale TEXT,
    first_sale_date TEXT,
    first_sale_gps TEXT,
    clone_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// Migration for databases created before owner_id existed.
try { db.exec('ALTER TABLE medications ADD COLUMN owner_id INTEGER'); } catch (e) { /* column already exists */ }

function genProductId() {
  let id;
  const exists = db.prepare('SELECT 1 FROM medications WHERE product_id = ?');
  do {
    id = String(Date.now()).slice(-9) + String(Math.floor(Math.random() * 90 + 10));
  } while (exists.get(id));
  return id;
}

function isExpired(m) {
  return (Number(m.year_of_manufacture) + Number(m.expected_lifespan)) < new Date().getFullYear();
}

function toApiShape(row) {
  if (!row) return null;
  return {
    productId: row.product_id,
    medicationName: row.medication_name,
    manufacturerId: row.manufacturer_id,
    ownerId: row.owner_id,
    batchNumber: row.batch_number,
    yearOfManufacture: row.year_of_manufacture,
    expectedLifespan: row.expected_lifespan,
    sold: !!row.sold,
    dateOfSale: row.date_of_sale,
    storeOfSale: row.store_of_sale,
    firstSaleDate: row.first_sale_date,
    firstSaleGps: row.first_sale_gps,
    cloneAttempts: row.clone_attempts,
    expired: isExpired(row),
    createdAt: row.created_at
  };
}

const insertStmt = db.prepare(`
  INSERT INTO medications (product_id, medication_name, manufacturer_id, owner_id, batch_number, year_of_manufacture, expected_lifespan)
  VALUES (@productId, @medicationName, @manufacturerId, @ownerId, @batchNumber, @yearOfManufacture, @expectedLifespan)
`);
const getStmt = db.prepare('SELECT * FROM medications WHERE product_id = ?');
const listStmt = db.prepare('SELECT * FROM medications ORDER BY id DESC');
const listByOwnerStmt = db.prepare('SELECT * FROM medications WHERE owner_id = ? ORDER BY id DESC');
const markSoldStmt = db.prepare(`
  UPDATE medications
  SET sold = 1, date_of_sale = @dateOfSale, store_of_sale = @storeOfSale,
      first_sale_date = @dateOfSale, first_sale_gps = @storeOfSale, clone_attempts = 0
  WHERE product_id = @productId
`);
const bumpCloneStmt = db.prepare('UPDATE medications SET clone_attempts = clone_attempts + 1 WHERE product_id = ?');
const clearStmt = db.prepare('DELETE FROM medications');
const clearByOwnerStmt = db.prepare('DELETE FROM medications WHERE owner_id = ?');
const deleteOneStmt = db.prepare('DELETE FROM medications WHERE product_id = ?');

const ADMIN_EDITABLE_FIELDS = {
  medicationName: 'medication_name',
  batchNumber: 'batch_number',
  yearOfManufacture: 'year_of_manufacture',
  expectedLifespan: 'expected_lifespan',
  sold: 'sold',
  dateOfSale: 'date_of_sale',
  storeOfSale: 'store_of_sale',
  firstSaleDate: 'first_sale_date',
  firstSaleGps: 'first_sale_gps',
  cloneAttempts: 'clone_attempts'
};

module.exports = {
  raw: db,
  isExpired,
  registerMedication(input) {
    const productId = genProductId();
    insertStmt.run({ productId, ...input });
    return toApiShape(getStmt.get(productId));
  },
  getMedication(productId) { return toApiShape(getStmt.get(productId)); },
  getMedicationRaw(productId) { return getStmt.get(productId); },
  listMedications() { return listStmt.all().map(toApiShape); },
  listMedicationsByOwner(ownerId) { return listByOwnerStmt.all(ownerId).map(toApiShape); },
  markSold(productId, { dateOfSale, storeOfSale }) {
    markSoldStmt.run({ productId, dateOfSale, storeOfSale });
    return toApiShape(getStmt.get(productId));
  },
  bumpCloneAttempts(productId) {
    bumpCloneStmt.run(productId);
    return getStmt.get(productId).clone_attempts;
  },
  clearAll() { clearStmt.run(); },
  clearAllForOwner(ownerId) { clearByOwnerStmt.run(ownerId); },
  deleteMedication(productId) { deleteOneStmt.run(productId); },
  adminUpdateMedication(productId, patch) {
    const setClauses = [];
    const params = { productId };
    for (const [apiField, column] of Object.entries(ADMIN_EDITABLE_FIELDS)) {
      if (Object.prototype.hasOwnProperty.call(patch, apiField)) {
        let value = patch[apiField];
        if (column === 'sold') value = value ? 1 : 0;
        setClauses.push(`${column} = @${column}`);
        params[column] = value;
      }
    }
    if (setClauses.length > 0) {
      db.prepare(`UPDATE medications SET ${setClauses.join(', ')} WHERE product_id = @productId`).run(params);
    }
    return toApiShape(getStmt.get(productId));
  }
};
