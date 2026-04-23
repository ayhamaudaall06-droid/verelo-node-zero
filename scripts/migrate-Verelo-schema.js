import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const DB_PATH = process.env.DATABASE_URL || './data/verelo.db';

async function run() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  console.log('[Migrate] Connected for Advanced Schema Update');

  // Helper function to check if a column exists
  const colExists = async (tableName, columnName) => {
    const info = await db.all(`PRAGMA table_info(${tableName})`);
    return info.some(col => col.name === columnName);
  };

  // 1. Ensure metadata_json exists (The Source Column)
  if (!(await colExists('products', 'metadata_json'))) {
    await db.exec(`ALTER TABLE products ADD COLUMN metadata_json TEXT DEFAULT '{}';`);
    console.log('[Migrate] Added base JSON column: metadata_json');
  }

  // 2. Define Generated Columns (Virtual)
  const genCols = [
    { name: 'size', expr: "json_extract(metadata_json, '$.size')" },
    { name: 'color', expr: "json_extract(metadata_json, '$.color')" },
    { name: 'material', expr: "json_extract(metadata_json, '$.material')" },
    { name: 'ai_generated', expr: "CASE WHEN json_extract(metadata_json, '$.source')='ai' THEN 1 ELSE 0 END" }
  ];

  for (const c of genCols) {
    if (!(await colExists('products', c.name))) {
      try {
        await db.exec(`ALTER TABLE products ADD COLUMN ${c.name} TEXT GENERATED ALWAYS AS (${c.expr}) VIRTUAL;`);
        console.log(`[Migrate] Created Generated Column: ${c.name}`);
      } catch (e) {
        console.log(`[Migrate] Skipped ${c.name}: ${e.message}`);
      }
    } else {
      console.log(`[Migrate] Column already exists: ${c.name}`);
    }
  }

  console.log('[Migrate] ✅ Advanced schema update complete.');
  await db.close();
}

run().catch(console.error);
