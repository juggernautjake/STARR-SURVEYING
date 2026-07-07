// scripts/dnd-seed-lazzuh.ts — migrate the Lazzuh Gun reference sheet into a
// dnd_characters row (Phase C5). Run with tsx: `npm run dnd:seed-lazzuh`.
//
// The sheet's data is already vendored at app/dnd/_sheet/data/lazzuh.ts ("the
// current build"), so this is the one-time server-side migrate the plan calls
// for — no browser localStorage/Export needed. Idempotent: upserts by the fixed
// LAZZUH_CHARACTER_ID, so re-running re-syncs the row to the bundled data.
//
// Connection: SUPABASE_DB_URL (falls back to .env.local) — the node-pg path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// `pg` ships no bundled types and @types/pg isn't installed (the sibling *.mjs DB
// scripts avoid tsc entirely). This script is run via tsx, not the app build.
// @ts-expect-error - no type declarations for 'pg'
import pg from 'pg';
import { lazzuh } from '../app/dnd/_sheet/data/lazzuh';
import { LAZZUH_CHARACTER_ID } from '../lib/dnd/constants';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

function readDbUrl(): string | null {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const envPath = path.join(REPO_ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)\s*$/);
      if (m) return m[1].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return null;
}

async function main() {
  const dbUrl = readDbUrl();
  if (!dbUrl) {
    console.error('SUPABASE_DB_URL not found (env or .env.local).');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const res = await client.query(
      `INSERT INTO dnd_characters (id, name, sheet_type, data, visibility, is_npc)
         VALUES ($1, $2, 'lazzuh', $3::jsonb, 'public', false)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             sheet_type = EXCLUDED.sheet_type,
             data = EXCLUDED.data,
             visibility = EXCLUDED.visibility,
             updated_at = now()
       RETURNING id, name, jsonb_typeof(data) AS data_kind, data->'meta'->>'level' AS level`,
      [LAZZUH_CHARACTER_ID, lazzuh.meta.name, JSON.stringify(lazzuh)],
    );
    const row = res.rows[0];
    console.log('✓ Seeded Lazzuh character row:');
    console.log(`  id:    ${row.id}`);
    console.log(`  name:  ${row.name}  (level ${row.level}, data=${row.data_kind})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
