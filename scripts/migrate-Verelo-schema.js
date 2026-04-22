import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', 'data');
const dbPath = join(dbDir, 'verelo.db');

if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

function tableExists(name) {
  return db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name) !== undefined;
}

function colExists(table, col) {
  return db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name=?`).get(table, col) !== undefined;
}

console.log('[Migrate] Connected');

// ── 1. CATEGORIES ──
if (!tableExists('categories')) {
  db.exec(`CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1
  );`);
  console.log('[Migrate] Created categories');
}

// Seed Verelo categories
const categories = [
  'Verelo Home Essentials',
  'Verelo Wellness',
  'Verelo Quick Kitchen',
  'Verelo Comfort & Care'
];
for (const cat of categories) {
  const existing = db.prepare(`SELECT id FROM categories WHERE name = ?`).get(cat);
  if (!existing) {
    db.prepare(`INSERT INTO categories (name) VALUES (?)`).run(cat);
  }
}

// ── 2. ALTER PRODUCTS (add new columns if missing) ──
const newCols = [
  { name: 'category_id', def: 'INTEGER' },
  { name: 'status', def: `TEXT DEFAULT 'draft'` },
  { name: 'product_type', def: `TEXT DEFAULT 'partner_trending'` },
  { name: 'image_url', def: `TEXT DEFAULT 'https://verelo.app/placeholder-logo.png'` }
];

for (const col of newCols) {
  if (!colExists('products', col.name)) {
    db.exec(`ALTER TABLE products ADD COLUMN ${col.name} ${col.def};`);
    console.log(`[Migrate] Added column: ${col.name}`);
  } else {
    console.log(`[Migrate] Already exists: ${col.name}`);
  }
}

// Migrate old box_type to new status + product_type (one-time)
db.exec(`
  UPDATE products SET 
    status = CASE 
      WHEN is_active = 1 AND inventory_count > 0 THEN 'live'
      WHEN inventory_count <= 0 THEN 'vaulted'
      ELSE 'draft'
    END,
    product_type = CASE 
      WHEN box_type IN ('factory', 'trending') THEN 'partner_trending'
      WHEN box_type IN ('limited', 'vault') THEN 'verelo_exclusive'
      ELSE 'partner_trending'
    END
  WHERE status IS NULL OR status = '';
`);

// ── 3. SEED PRODUCTS (Verelo Master Inventory) ──
const vereloProducts = [
  // Verelo Home Essentials
  { sku: 'VER-ESS-001', name: 'Verelo Rice (5kg)', price: 12.00, category: 'Verelo Home Essentials' },
  { sku: 'VER-ESS-002', name: 'Pasta Selection', price: 4.50, category: 'Verelo Home Essentials' },
  { sku: 'VER-ESS-003', name: 'Premium Lentils', price: 5.00, category: 'Verelo Home Essentials' },
  { sku: 'VER-ESS-004', name: 'All-Purpose Flour', price: 3.50, category: 'Verelo Home Essentials' },
  { sku: 'VER-CLN-001', name: 'Heavy-Duty Laundry Detergent', price: 15.00, category: 'Verelo Home Essentials' },
  { sku: 'VER-CLN-002', name: 'Dish Soap & Sponges Bundle', price: 8.00, category: 'Verelo Home Essentials' },
  { sku: 'VER-PAP-001', name: 'Premium Toilet Paper (12-Pack)', price: 10.00, category: 'Verelo Home Essentials' },
  
  // Verelo Wellness
  { sku: 'VER-BAB-001', name: 'Hypoallergenic Baby Wipes', price: 6.00, category: 'Verelo Wellness' },
  { sku: 'VER-BAB-002', name: 'Verelo Baby Formula', price: 25.00, category: 'Verelo Wellness' },
  { sku: 'VER-AID-001', name: 'Basic Pharmacy Kit', price: 18.00, category: 'Verelo Wellness' },
  { sku: 'VER-HYD-001', name: 'Bottled Water Case & Hydration Packets', price: 14.00, category: 'Verelo Wellness' },
  { sku: 'VER-TEC-001', name: 'Emergency Tech Kit', price: 22.00, category: 'Verelo Wellness' },
  
  // Verelo Quick Kitchen
  { sku: 'VER-KIT-001', name: 'Ready-Made Pasta Sauce', price: 6.00, category: 'Verelo Quick Kitchen' },
  { sku: 'VER-KIT-002', name: 'Premium Noodles', price: 4.00, category: 'Verelo Quick Kitchen' },
  { sku: 'VER-KIT-003', name: 'Canned Tuna (3-Pack)', price: 7.50, category: 'Verelo Quick Kitchen' },
  { sku: 'VER-KIT-004', name: 'Artisan Spices & Oils Set', price: 19.00, category: 'Verelo Quick Kitchen' },
  { sku: 'VER-KIT-005', name: 'Family Juice Boxes (10-Pack)', price: 8.00, category: 'Verelo Quick Kitchen' },
  
  // Verelo Comfort & Care
  { sku: 'VER-COM-001', name: 'The Coffee Ritual (Premium Beans)', price: 18.00, category: 'Verelo Comfort & Care' },
  { sku: 'VER-COM-002', name: 'Specialty Teas & Mug Set', price: 20.00, category: 'Verelo Comfort & Care' },
  { sku: 'VER-COM-003', name: 'Imported Chocolate Selection', price: 15.00, category: 'Verelo Comfort & Care' },
  { sku: 'VER-SLF-001', name: 'Facial Cleanser & Moisturizer Set', price: 24.00, category: 'Verelo Comfort & Care' },
  { sku: 'VER-SEA-001', name: 'Limited Factory Special (Seasonal)', price: 30.00, category: 'Verelo Comfort & Care' }
];

let seeded = 0;
for (const prod of vereloProducts) {
  const catRow = db.prepare(`SELECT id FROM categories WHERE name = ?`).get(prod.category);
  if (!catRow) continue;
  
  const existing = db.prepare(`SELECT id FROM products WHERE sku = ?`).get(prod.sku);
  if (!existing) {
    db.prepare(`
      INSERT INTO products (sku, name, price, inventory_count, category_id, status, product_type, image_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', 'partner_trending', 'https://verelo.app/placeholder-logo.png', ?, ?)
    `).run(prod.sku, prod.name, prod.price, 0, catRow.id, Date.now(), Date.now());
    seeded++;
  }
}

console.log(`[Migrate] Seeded ${seeded} new products`);
console.log('[Migrate] ✅ Verelo schema complete');
db.close();
