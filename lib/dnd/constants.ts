// lib/dnd/constants.ts — stable identifiers for the hidden /dnd platform.

// The canonical Lazzuh Gun character row. Seeded from the bundled reference sheet
// by scripts/dnd-seed-lazzuh.ts (Phase C5); the native /dnd/Lazzuh_Gun render (C6)
// loads/saves against this id. Fixed UUID so it's stable across environments.
export const LAZZUH_CHARACTER_ID = '1a2200aa-0000-4000-8000-000000000001';

// ── Demo roster (Phase L) — open-access testing campaign ─────────────────────
// A fixed demo campaign + DM + players + characters so the LoL-style /dnd home
// page has a real roster without anyone signing in. Seeded by scripts/dnd-seed-
// demo.ts. Open-access mode (DND_OPEN_ACCESS) lets a visitor "enter" as any of
// these identities by clicking their card (no password).
export const DEMO_CAMPAIGN_ID = '1a2200aa-0000-4000-8000-0000000000c1';
// The DM of the Neon Odyssey demo is Andrew Ash (id a1). He also runs the streamer
// NPC "xxRainbowKittenUwU37xx" (DM-controlled chat). Reconfigured 2026-07-06 (was "Game Master" d1).
export const DEMO_DM_USER_ID = '1a2200aa-0000-4000-8000-0000000000a1';
export const DEMO_DM_NAME = 'Andrew Ash';
// The streamer character Andrew runs (its fake-Twitch chat is DM-controlled).
export const DEMO_STREAMER_CHARACTER_ID = '1a2200aa-0000-4000-8000-0000000000c4'; // xxRainbowKittenUwU37xx
// Shared identity for open-access "＋ New Character" — visitors create + own imported
// characters as Guest (real accounts come with auth later).
export const DEMO_GUEST_USER_ID = '1a2200aa-0000-4000-8000-0000000000e0';

// Each player: a dnd_user id + the character they own. `lazzuh` reuses the canonical
// Lazzuh row (owned by Jacob Maddux). The streamer (xxRainbowKittenUwU37xx) is DM-run,
// so it's not a player entry. The 3 non-Lazzuh sheets are placeholders to flesh out later.
export const DEMO_PLAYERS = [
  { userId: '1a2200aa-0000-4000-8000-0000000000a2', name: 'Jacob Maddux', characterId: LAZZUH_CHARACTER_ID, characterName: 'Lazzuh Gun', sheetType: 'lazzuh' },
  { userId: '1a2200aa-0000-4000-8000-0000000000a3', name: 'Mira Sol', characterId: '1a2200aa-0000-4000-8000-0000000000c2', characterName: 'Vera Kade', sheetType: 'generic' },
  { userId: '1a2200aa-0000-4000-8000-0000000000a4', name: 'Nyx Vale', characterId: '1a2200aa-0000-4000-8000-0000000000c3', characterName: 'Sprocket', sheetType: 'generic' },
] as const;

// The DM-run streamer NPC (xxRainbowKittenUwU37xx, id c4) — not a player entry,
// owned by the DM. Her bespoke `streamer` sheet skin (§6.9) rides on this row's
// sheet_type; scripts/dnd-seed-demo.ts seeds her a full statted sheet.
export const DEMO_STREAMER = {
  characterId: DEMO_STREAMER_CHARACTER_ID,
  characterName: 'xxRainbowKittenUwU37xx',
  sheetType: 'streamer',
} as const;

