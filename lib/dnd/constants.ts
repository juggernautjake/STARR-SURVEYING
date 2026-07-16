// lib/dnd/constants.ts — stable identifiers for the hidden /dnd platform.

// The canonical Lazzuh Gun character row. Seeded from the bundled reference sheet
// by scripts/dnd-seed-lazzuh.ts (Phase C5); the native /dnd/Lazzuh_Gun render (C6)
// loads/saves against this id. Fixed UUID so it's stable across environments.
export const LAZZUH_CHARACTER_ID = '1a2200aa-0000-4000-8000-000000000001';

// ── Neon Odyssey roster — real (shallow) accounts ────────────────────────────
// A fixed campaign owned by named accounts that sign in via the pseudo-login
// (name + password, keyed `quick:<name>`; see /api/dnd/auth/quick). Characters
// belong to their owner and are visibility='private' — only the owner and the
// campaign DM can open the sheet. Seeded by scripts/dnd-seed-demo.ts.
export const DEMO_CAMPAIGN_ID = '1a2200aa-0000-4000-8000-0000000000c1';
// Andrew (id a1) — DM of Neon Odyssey. Signs in as "Andrew" (key quick:andrew).
export const DEMO_DM_USER_ID = '1a2200aa-0000-4000-8000-0000000000a1';
export const DEMO_DM_NAME = 'Andrew';
export const DEMO_DM_EMAIL = 'quick:andrew';
// The streamer character "xxRainbowKittenUwU37xx" — a PLAYER character owned by Susie.
// Only her fake-Twitch chat is DM-controlled (Andrew gets the stream controls on her
// sheet via his campaign DM role, not via character ownership).
export const DEMO_STREAMER_CHARACTER_ID = '1a2200aa-0000-4000-8000-0000000000c4';
export const DEMO_STREAMER_PLAYER_USER_ID = '1a2200aa-0000-4000-8000-0000000000a5';
export const DEMO_STREAMER_PLAYER_NAME = 'Susie';
export const DEMO_STREAMER_PLAYER_EMAIL = 'quick:susie';
// Donata Dime — a PLAYER character owned by Sarah (a6), on the bespoke `donata` MLM skin.
// A Cleric of the pyramid-scheme founder "Mighty Mojo." Andrew (DM) can edit her via his
// campaign DM role; Sarah edits her as the owner.
export const DEMO_DONATA_CHARACTER_ID = '1a2200aa-0000-4000-8000-0000000000c5';
export const DEMO_DONATA_PLAYER_USER_ID = '1a2200aa-0000-4000-8000-0000000000a6';
export const DEMO_DONATA_PLAYER_NAME = 'Sarah';
export const DEMO_DONATA_PLAYER_EMAIL = 'quick:sarah';

// Jack — a Rangor Pugilist on the bespoke `jack` "homebrew rulebook" skin, owned by the
// player account Jack (a7). Like the other PCs his sheet is visibility='private', so only
// Jack himself and the campaign DM (Andrew) can open it.
export const DEMO_JACK_CHARACTER_ID = '1a2200aa-0000-4000-8000-0000000000c6';
export const DEMO_JACK_PLAYER_USER_ID = '1a2200aa-0000-4000-8000-0000000000a7';
export const DEMO_JACK_PLAYER_NAME = 'Jack';
export const DEMO_JACK_PLAYER_EMAIL = 'quick:jack';

// Jack (id c6) — a PLAYER character on the bespoke `jack` skin, owned by the Jack account.
export const DEMO_JACK = {
  characterId: DEMO_JACK_CHARACTER_ID,
  characterName: 'Jack',
  sheetType: 'jack',
  playerUserId: DEMO_JACK_PLAYER_USER_ID,
  playerName: DEMO_JACK_PLAYER_NAME,
  playerEmail: DEMO_JACK_PLAYER_EMAIL,
} as const;

// Shared identity for open-access "＋ New Character" — visitors create + own imported
// characters as Guest (has no password, so it's the only passwordless enter-as identity).
export const DEMO_GUEST_USER_ID = '1a2200aa-0000-4000-8000-0000000000e0';

// Each player: a dnd_user id + the character they own. Jacob owns the canonical Lazzuh
// row. (The streamer is a player too — see DEMO_STREAMER — but keeps her bespoke sheet.)
export const DEMO_PLAYERS = [
  { userId: '1a2200aa-0000-4000-8000-0000000000a2', name: 'Jacob', email: 'quick:jacob', characterId: LAZZUH_CHARACTER_ID, characterName: 'Lazzuh Gun', sheetType: 'lazzuh' },
] as const;

// The streamer (xxRainbowKittenUwU37xx, id c4) — a PLAYER character on the bespoke
// `streamer` sheet skin (§6.9), owned by Susie. Only her live chat is DM-controlled.
export const DEMO_STREAMER = {
  characterId: DEMO_STREAMER_CHARACTER_ID,
  characterName: 'xxRainbowKittenUwU37xx',
  sheetType: 'streamer',
  playerUserId: DEMO_STREAMER_PLAYER_USER_ID,
  playerName: DEMO_STREAMER_PLAYER_NAME,
  playerEmail: DEMO_STREAMER_PLAYER_EMAIL,
} as const;

// Donata Dime (id c5) — a PLAYER character on the bespoke `donata` MLM skin, owned by Sarah.
export const DEMO_DONATA = {
  characterId: DEMO_DONATA_CHARACTER_ID,
  characterName: 'Donata Dime',
  sheetType: 'donata',
  playerUserId: DEMO_DONATA_PLAYER_USER_ID,
  playerName: DEMO_DONATA_PLAYER_NAME,
  playerEmail: DEMO_DONATA_PLAYER_EMAIL,
} as const;

