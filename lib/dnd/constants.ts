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
export const DEMO_DM_USER_ID = '1a2200aa-0000-4000-8000-0000000000d1';
// Shared identity for open-access "＋ New Character" — visitors create + own imported
// characters as Guest (real accounts come with auth later).
export const DEMO_GUEST_USER_ID = '1a2200aa-0000-4000-8000-0000000000e0';

// Each player: a dnd_user id + the character they own. `lazzuh` reuses the
// canonical Lazzuh row; the rest are new character rows.
export const DEMO_PLAYERS = [
  { userId: '1a2200aa-0000-4000-8000-0000000000a1', name: 'Andrew Ash', characterId: LAZZUH_CHARACTER_ID, characterName: 'Lazzuh Gun', sheetType: 'lazzuh' },
  { userId: '1a2200aa-0000-4000-8000-0000000000a2', name: 'Jacob Maddux', characterId: '1a2200aa-0000-4000-8000-0000000000c2', characterName: 'Vera Kade', sheetType: 'generic' },
  { userId: '1a2200aa-0000-4000-8000-0000000000a3', name: 'Mira Sol', characterId: '1a2200aa-0000-4000-8000-0000000000c3', characterName: 'Sprocket', sheetType: 'generic' },
  { userId: '1a2200aa-0000-4000-8000-0000000000a4', name: 'Nyx Vale', characterId: '1a2200aa-0000-4000-8000-0000000000c4', characterName: 'Nova Vex', sheetType: 'nova' },
] as const;

