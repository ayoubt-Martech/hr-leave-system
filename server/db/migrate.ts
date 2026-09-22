import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pool } from './client';

// Load .env then .env.local (local overrides win)
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

// Works regardless of CJS/ESM — path relative to project root
const migrationsDir = path.join(process.cwd(), 'server', 'db', 'migrations');

async function migrate() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // alphabetical = chronological given naming convention

  console.log(`[migrate] Found ${files.length} migration file(s)`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`[migrate] Running ${file}...`);
    try {
      await pool.query(sql);
      console.log(`[migrate] ✓ ${file}`);
    } catch (err: any) {
      console.error(`[migrate] ✗ ${file}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('[migrate] All migrations complete.');
  await pool.end();
}

migrate();
