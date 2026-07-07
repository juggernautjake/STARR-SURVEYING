// scripts/dnd-seed-demo.ts — demo roster for open-access testing (Phase L1). Creates
// a fixed campaign + DM + players + character rows so the LoL-style /dnd home page has
// a real roster with no sign-in. Idempotent (upsert by fixed ids). Character content
// for the samples is filled in later slices; here they get valid blank sheets. Lazzuh
// reuses its canonical row and is attached to the demo campaign.
//
// Run with tsx: `npx tsx scripts/dnd-seed-demo.ts`. Connection: SUPABASE_DB_URL / .env.local.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - no type declarations for 'pg'
import pg from 'pg';
import { blankCharacter } from '../app/dnd/_sheet/data/blank';
import { DEMO_CAMPAIGN_ID, DEMO_DM_USER_ID, DEMO_GUEST_USER_ID, DEMO_PLAYERS, DEMO_STREAMER, LAZZUH_CHARACTER_ID } from '../lib/dnd/constants';

const { Client } = pg;
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  if (!dbUrl) { console.error('SUPABASE_DB_URL not found.'); process.exit(1); }
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // 1. DM + player users (password_hash null — open-access enters without a password).
    await client.query(
      `INSERT INTO dnd_users (id, email, display_name) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
      [DEMO_DM_USER_ID, 'gm@neon.local', 'Game Master'],
    );
    for (const p of DEMO_PLAYERS) {
      await client.query(
        `INSERT INTO dnd_users (id, email, display_name) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
        [p.userId, `${p.userId.slice(-4)}@neon.local`, p.name],
      );
    }

    // 2. Campaign + memberships.
    await client.query(
      `INSERT INTO dnd_campaigns (id, dm_user_id, name, blurb) VALUES ($1, $2, 'Neon Odyssey', 'Open-access demo campaign')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, blurb = EXCLUDED.blurb`,
      [DEMO_CAMPAIGN_ID, DEMO_DM_USER_ID],
    );
    await client.query(
      `INSERT INTO dnd_campaign_members (campaign_id, user_id, role) VALUES ($1, $2, 'dm')
       ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'dm'`,
      [DEMO_CAMPAIGN_ID, DEMO_DM_USER_ID],
    );
    for (const p of DEMO_PLAYERS) {
      await client.query(
        `INSERT INTO dnd_campaign_members (campaign_id, user_id, role) VALUES ($1, $2, 'player')
         ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'player'`,
        [DEMO_CAMPAIGN_ID, p.userId],
      );
    }
    // Shared Guest identity for "＋ New Character" (owns visitor-created imports).
    await client.query(
      `INSERT INTO dnd_users (id, email, display_name) VALUES ($1, 'guest@neon.local', 'Guest')
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
      [DEMO_GUEST_USER_ID],
    );
    await client.query(
      `INSERT INTO dnd_campaign_members (campaign_id, user_id, role) VALUES ($1, $2, 'player')
       ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'player'`,
      [DEMO_CAMPAIGN_ID, DEMO_GUEST_USER_ID],
    );

    // 3. Characters. Lazzuh: attach its canonical row to the campaign + owner. Others:
    // create valid blank sheets (content filled in later slices).
    await client.query(
      `UPDATE dnd_characters SET campaign_id = $1, owner_user_id = $2, visibility = 'campaign' WHERE id = $3`,
      [DEMO_CAMPAIGN_ID, DEMO_PLAYERS[0].userId, LAZZUH_CHARACTER_ID],
    );
    for (const p of DEMO_PLAYERS.slice(1)) {
      await client.query(
        `INSERT INTO dnd_characters (id, campaign_id, owner_user_id, name, sheet_type, data, visibility, is_npc)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'campaign', false)
         ON CONFLICT (id) DO UPDATE SET campaign_id = EXCLUDED.campaign_id, owner_user_id = EXCLUDED.owner_user_id, name = EXCLUDED.name, sheet_type = EXCLUDED.sheet_type`,
        [p.characterId, DEMO_CAMPAIGN_ID, p.userId, p.characterName, p.sheetType, JSON.stringify(blankCharacter(p.characterName))],
      );
    }

    // Nova Vex — the DM-run streamer NPC (her fake-Twitch chat is DM-controlled).
    // Owned by the DM, flagged is_npc, and carrying the bespoke `nova` pixel skin.
    await client.query(
      `INSERT INTO dnd_characters (id, campaign_id, owner_user_id, name, sheet_type, data, visibility, is_npc)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'campaign', true)
       ON CONFLICT (id) DO UPDATE SET campaign_id = EXCLUDED.campaign_id, owner_user_id = EXCLUDED.owner_user_id, name = EXCLUDED.name, sheet_type = EXCLUDED.sheet_type, is_npc = EXCLUDED.is_npc`,
      [DEMO_STREAMER.characterId, DEMO_CAMPAIGN_ID, DEMO_DM_USER_ID, DEMO_STREAMER.characterName, DEMO_STREAMER.sheetType, JSON.stringify(blankCharacter(DEMO_STREAMER.characterName))],
    );

    const { rows } = await client.query(
      `SELECT c.name, u.display_name AS owner, m.role FROM dnd_characters c
         JOIN dnd_campaign_members m ON m.user_id = c.owner_user_id AND m.campaign_id = c.campaign_id
         JOIN dnd_users u ON u.id = c.owner_user_id
       WHERE c.campaign_id = $1 ORDER BY c.created_at`,
      [DEMO_CAMPAIGN_ID],
    );
    console.log('✓ Demo campaign "Neon Odyssey" seeded. Roster:');
    console.log(`  DM: Game Master`);
    for (const r of rows) console.log(`  ${r.role}: ${r.owner} → ${r.name}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error('Seed failed:', err instanceof Error ? err.message : err); process.exit(1); });
