// scripts/dnd-bootstrap.mjs — mint the FIRST DM account for the hidden /dnd platform.
//
// Why this exists (Phase B, B0): /dnd registration is invite-only, and invites can
// only be created by a DM who already belongs to a campaign. That's a chicken/egg —
// there's no way to create the very first DM through the app. This script seeds that
// first DM + a starter campaign + the DM membership, so the DM can log in and mint
// player invites via POST /api/dnd/invites.
//
// Credentials are NEVER committed — they come from env or CLI flags at run time:
//
//   DND_BOOTSTRAP_EMAIL=dm@example.com DND_BOOTSTRAP_PASSWORD='…' \
//   DND_BOOTSTRAP_NAME='Dungeon Master' node scripts/dnd-bootstrap.mjs
//
//   # or with flags:
//   node scripts/dnd-bootstrap.mjs --email dm@example.com --password '…' \
//        --name 'Dungeon Master' --campaign 'The Hollow Crown'
//
// Idempotent: re-running upserts the DM (resets password/name), reuses the campaign
// with the same name, and re-asserts the DM membership. Connection: SUPABASE_DB_URL
// (falls back to parsing .env.local) — the node-pg path per project memory.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

// ── args / env ──────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const getOpt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const email = (getOpt('--email') || process.env.DND_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
const password = getOpt('--password') || process.env.DND_BOOTSTRAP_PASSWORD || '';
const displayName = (getOpt('--name') || process.env.DND_BOOTSTRAP_NAME || 'Dungeon Master').trim();
const campaignName = (getOpt('--campaign') || process.env.DND_BOOTSTRAP_CAMPAIGN || 'New Campaign').trim();

if (!email || !password) {
  console.error(
    'Missing credentials. Provide --email and --password (or DND_BOOTSTRAP_EMAIL / DND_BOOTSTRAP_PASSWORD).',
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

// ── resolve the DB url (same approach as apply-seeds.mjs) ────────────
function readDbUrl() {
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

const dbUrl = readDbUrl();
if (!dbUrl) {
  console.error('SUPABASE_DB_URL not found (env or .env.local).');
  process.exit(1);
}

async function main() {
  const password_hash = await bcrypt.hash(password, 10);
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      `INSERT INTO dnd_users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             display_name  = EXCLUDED.display_name
       RETURNING id, email, display_name`,
      [email, password_hash, displayName],
    );
    const user = userRes.rows[0];

    // Reuse an existing same-named campaign for this DM, else create one.
    const existing = await client.query(
      `SELECT id FROM dnd_campaigns WHERE dm_user_id = $1 AND name = $2 LIMIT 1`,
      [user.id, campaignName],
    );
    let campaignId;
    if (existing.rows.length) {
      campaignId = existing.rows[0].id;
    } else {
      const campRes = await client.query(
        `INSERT INTO dnd_campaigns (dm_user_id, name) VALUES ($1, $2) RETURNING id`,
        [user.id, campaignName],
      );
      campaignId = campRes.rows[0].id;
    }

    await client.query(
      `INSERT INTO dnd_campaign_members (campaign_id, user_id, role)
         VALUES ($1, $2, 'dm')
       ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'dm'`,
      [campaignId, user.id],
    );

    await client.query('COMMIT');
    console.log('✓ Bootstrapped first DM:');
    console.log(`  user:     ${user.display_name} <${user.email}>  (${user.id})`);
    console.log(`  campaign: ${campaignName}  (${campaignId})`);
    console.log('  Sign in at /dnd/login, then mint player invites.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Bootstrap failed:', err.message);
  process.exit(1);
});
