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
import bcrypt from 'bcryptjs';
import { streamerCharacter } from '../app/dnd/_sheet/data/streamer';
import { donataDime } from '../app/dnd/_sheet/data/donata';
import { jack } from '../app/dnd/_sheet/data/jack';
import { DEMO_CAMPAIGN_ID, DEMO_DM_EMAIL, DEMO_DM_NAME, DEMO_DM_USER_ID, DEMO_DONATA, DEMO_GUEST_USER_ID, DEMO_JACK_CHARACTER_ID, DEMO_PLAYERS, DEMO_STREAMER, LAZZUH_CHARACTER_ID } from '../lib/dnd/constants';

const { Client } = pg;

// Shallow pseudo-login passwords (name + password; keyed by the account's quick:<name>
// email). Not real security — just so a character/campaign belongs to a specific person.
const PW: Record<string, string> = { 'quick:andrew': 'league', 'quick:jacob': '1234', 'quick:susie': '0987', 'quick:sarah': 'mojo' };
const hash = (pw: string) => bcrypt.hash(pw, 10);
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
    // 1. DM + player accounts. Each signs in via the pseudo-login (name + password), keyed
    // by its quick:<name> email; the password is shallow (organization, not security).
    await client.query(
      `INSERT INTO dnd_users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash`,
      [DEMO_DM_USER_ID, DEMO_DM_EMAIL, DEMO_DM_NAME, await hash(PW[DEMO_DM_EMAIL])],
    );
    for (const p of DEMO_PLAYERS) {
      await client.query(
        `INSERT INTO dnd_users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash`,
        [p.userId, p.email, p.name, await hash(PW[p.email])],
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
    // Shared Guest identity for "＋ New Character" (owns visitor-created imports). It is
    // intentionally NOT a member of Neon Odyssey — the roster is Andrew, Jacob, Susie.
    await client.query(
      `INSERT INTO dnd_users (id, email, display_name) VALUES ($1, 'guest@neon.local', 'Guest')
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
      [DEMO_GUEST_USER_ID],
    );

    // 3. Characters. Lazzuh: attach its canonical row to Jacob as a PRIVATE sheet (only
    // Jacob + the DM can open it). No other player sheets — the roster is Jacob + Susie.
    await client.query(
      `UPDATE dnd_characters SET campaign_id = $1, owner_user_id = $2, visibility = 'private', is_npc = false WHERE id = $3`,
      [DEMO_CAMPAIGN_ID, DEMO_PLAYERS[0].userId, LAZZUH_CHARACTER_ID],
    );

    // xxRainbowKittenUwU37xx — Susie's PLAYER character on the bespoke `streamer` pixel
    // skin, PRIVATE (only Susie + the DM can open it). Only her fake-Twitch chat is
    // DM-controlled (via the DM's campaign role, not character ownership). First ensure
    // Susie's account + membership so she shows as a normal playable card.
    await client.query(
      `INSERT INTO dnd_users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash`,
      [DEMO_STREAMER.playerUserId, DEMO_STREAMER.playerEmail, DEMO_STREAMER.playerName, await hash(PW[DEMO_STREAMER.playerEmail])],
    );
    await client.query(
      `INSERT INTO dnd_campaign_members (campaign_id, user_id, role) VALUES ($1, $2, 'player')
       ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'player'`,
      [DEMO_CAMPAIGN_ID, DEMO_STREAMER.playerUserId],
    );
    await client.query(
      `INSERT INTO dnd_characters (id, campaign_id, owner_user_id, name, sheet_type, data, visibility, is_npc)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'private', false)
       ON CONFLICT (id) DO UPDATE SET campaign_id = EXCLUDED.campaign_id, owner_user_id = EXCLUDED.owner_user_id, name = EXCLUDED.name, sheet_type = EXCLUDED.sheet_type, data = EXCLUDED.data, is_npc = EXCLUDED.is_npc, visibility = EXCLUDED.visibility`,
      [DEMO_STREAMER.characterId, DEMO_CAMPAIGN_ID, DEMO_STREAMER.playerUserId, DEMO_STREAMER.characterName, DEMO_STREAMER.sheetType, JSON.stringify(streamerCharacter(DEMO_STREAMER.characterName))],
    );

    // Put the streamer LIVE by default so her chat + influence meter are running the
    // moment you open her sheet (the DM can still toggle it from Stream controls).
    await client.query(
      `INSERT INTO dnd_stream_state (character_id, is_live, viewer_count, chat_speed, engagement)
         VALUES ($1, true, 1337, 4, 65)
       ON CONFLICT (character_id) DO UPDATE SET is_live = true, viewer_count = EXCLUDED.viewer_count, chat_speed = EXCLUDED.chat_speed, engagement = EXCLUDED.engagement`,
      [DEMO_STREAMER.characterId],
    );

    // Donata Dime — Sarah's PLAYER character on the bespoke `donata` MLM skin, PRIVATE
    // (only Sarah + the DM can open it). First ensure Sarah's account + membership.
    await client.query(
      `INSERT INTO dnd_users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash`,
      [DEMO_DONATA.playerUserId, DEMO_DONATA.playerEmail, DEMO_DONATA.playerName, await hash(PW[DEMO_DONATA.playerEmail])],
    );
    await client.query(
      `INSERT INTO dnd_campaign_members (campaign_id, user_id, role) VALUES ($1, $2, 'player')
       ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'player'`,
      [DEMO_CAMPAIGN_ID, DEMO_DONATA.playerUserId],
    );
    await client.query(
      `INSERT INTO dnd_characters (id, campaign_id, owner_user_id, name, sheet_type, data, visibility, is_npc)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'private', false)
       ON CONFLICT (id) DO UPDATE SET campaign_id = EXCLUDED.campaign_id, owner_user_id = EXCLUDED.owner_user_id, name = EXCLUDED.name, sheet_type = EXCLUDED.sheet_type, data = EXCLUDED.data, is_npc = EXCLUDED.is_npc, visibility = EXCLUDED.visibility`,
      [DEMO_DONATA.characterId, DEMO_CAMPAIGN_ID, DEMO_DONATA.playerUserId, DEMO_DONATA.characterName, DEMO_DONATA.sheetType, JSON.stringify(donataDime(DEMO_DONATA.characterName))],
    );

    // Jack — a Rangor Pugilist on the bespoke `jack` "homebrew rulebook" skin. Seeded
    // DM-owned + campaign-visible; the DM assigns him to whoever plays Jack via the roster
    // tool (no fixed player account invented). His full level-3 build lives in the data jsonb.
    await client.query(
      `INSERT INTO dnd_characters (id, campaign_id, owner_user_id, name, sheet_type, data, visibility, is_npc)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'campaign', false)
       ON CONFLICT (id) DO UPDATE SET campaign_id = EXCLUDED.campaign_id, owner_user_id = EXCLUDED.owner_user_id, name = EXCLUDED.name, sheet_type = EXCLUDED.sheet_type, data = EXCLUDED.data, is_npc = EXCLUDED.is_npc, visibility = EXCLUDED.visibility`,
      [DEMO_JACK_CHARACTER_ID, DEMO_CAMPAIGN_ID, DEMO_DM_USER_ID, 'Jack', 'jack', JSON.stringify(jack('Jack'))],
    );

    const { rows } = await client.query(
      `SELECT c.name, u.display_name AS owner, m.role FROM dnd_characters c
         JOIN dnd_campaign_members m ON m.user_id = c.owner_user_id AND m.campaign_id = c.campaign_id
         JOIN dnd_users u ON u.id = c.owner_user_id
       WHERE c.campaign_id = $1 ORDER BY c.created_at`,
      [DEMO_CAMPAIGN_ID],
    );
    console.log('✓ Demo campaign "Neon Odyssey" seeded. Roster:');
    console.log(`  DM: ${DEMO_DM_NAME}`);
    for (const r of rows) console.log(`  ${r.role}: ${r.owner} → ${r.name}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error('Seed failed:', err instanceof Error ? err.message : err); process.exit(1); });
