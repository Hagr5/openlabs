/**
 * seed.js — populates users + laptops with fixed, deterministic data.
 * Run once at container startup (via entrypoint.sh) after resetDatabase().
 * Re-running against an already-seeded DB is a no-op (guarded by a check).
 */

const { initDatabase } = require('./index');
const { createUserModel } = require('../models/userModel');
const { createLaptopModel } = require('../models/laptopModel');

function seed() {
  const db = initDatabase();
  const userModel = createUserModel(db);
  const laptopModel = createLaptopModel(db);

  if (!userModel.findByUsername('alice')) {
    userModel.create({
      username: 'alice',
      email: 'alice@techvault.example',
      password: 'Sup3rSecure!2026',
      role: 'CUSTOMER',
    });
  }

  if (!userModel.findByUsername('support_bot')) {
    // Decoy account — real random password, never distributed to players,
    // and never used by any intended solution path.
    const { randomBytes } = require('crypto');
    userModel.create({
      username: 'support_bot',
      email: 'support@techvault.example',
      password: randomBytes(24).toString('hex'),
      role: 'SUPPORT',
    });
  }

  const existingLaptops = laptopModel.findAll();
  if (existingLaptops.length === 0) {
    // Fixed IDs (not random) — the challenge design/solution references
    // "LP-2049" (Vault Studio 16) explicitly as the product used with
    // fetchCompetitorPrice, so these must be stable across resets.
    const laptops = [
      { id: 'LP-1401', name: 'Vault Pro 14', brand: 'TechVault', price: 1299.0, stock: 12, cpu: 'Ryzen 7 8840HS', ram: '16GB', storage: '512GB NVMe', gpu: 'Radeon 780M' },
      { id: 'LP-1301', name: 'Vault Air 13', brand: 'TechVault', price: 999.0, stock: 20, cpu: 'Core i5-1340P', ram: '16GB', storage: '256GB NVMe', gpu: 'Iris Xe' },
      { id: 'LP-2049', name: 'Vault Studio 16', brand: 'TechVault', price: 2049.0, stock: 5, cpu: 'Core i9-14900HX', ram: '32GB', storage: '1TB NVMe', gpu: 'RTX 4070' },
      { id: 'LP-1501', name: 'Vault Lite 15', brand: 'TechVault', price: 649.0, stock: 30, cpu: 'Ryzen 5 7530U', ram: '8GB', storage: '256GB NVMe', gpu: null },
    ];
    const insert = db.prepare(
      `INSERT INTO laptops (id, name, brand, price, stock, cpu, ram, storage, gpu)
       VALUES (@id, @name, @brand, @price, @stock, @cpu, @ram, @storage, @gpu)`
    );
    for (const l of laptops) {
      insert.run(l);
    }
  }

  console.log(JSON.stringify({ lvl: 'info', msg: 'seed complete' }));
  db.close();
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
