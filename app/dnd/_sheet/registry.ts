// app/dnd/_sheet/registry.ts — the sheet_type registry + module system (Phase C8).
//
// Every character has a `sheet_type` (the `dnd_characters.sheet_type` column). The
// registry maps that key to `{ theme, modules[] }`: the bespoke skin (C7) plus the
// character-only mechanic modules the engine should render. Shared sections
// (abilities, combat, attacks, gear, story…) are always present; a *module* is an
// extra that only some characters have — e.g. Lazzuh's Surge/transformation forms.
// The engine (App) renders a module's tab/content only when the character's
// sheet_type registers it, so new characters are "a theme + data (+ maybe a
// module)" rather than a fork.
import { lazzuhTheme, streamerTheme, type SheetTheme } from './theme';

// Known character-only mechanic modules. Add an id here when a new bespoke
// mechanic is built. `stream` = the live streamer chat + influence meter + the
// DM's stream controls (§6.9); only characters that register it get those.
export type SheetModuleId = 'forms' | 'stream';

// A `skin` is a bespoke visual treatment beyond color/font tokens — the extra CSS
// (pixel frames, scanlines, glitch, etc.) lives under `.dnd-sheet.skin-<id>` in
// theme.css. The engine appends `skin-<id>` to the sheet root when set.
export type SheetSkinId = 'streamer';

export interface SheetTypeConfig {
  label: string;
  theme?: SheetTheme;
  /** Extra visual treatment class (adds `.skin-<id>` to the sheet root). */
  skin?: SheetSkinId;
  modules: SheetModuleId[];
}

export const SHEET_REGISTRY: Record<string, SheetTypeConfig> = {
  // The Lazzuh Gun reference sheet: neon skin + the Surge/forms module.
  lazzuh: { label: 'Lazzuh Gun', theme: lazzuhTheme, modules: ['forms'] },
  // Bright hot-pink pixel/CRT magical-girl streamer skin (§6.9) — e.g. xxRainbowKittenUwU37xx.
  // The `stream` module unlocks the live chat, influence meter, and DM stream controls.
  streamer: { label: 'Streamer', theme: streamerTheme, skin: 'streamer', modules: ['stream'] },
  // Fallback for a character with no bespoke skin/modules yet.
  generic: { label: 'Generic', modules: [] },
};

export function getSheetConfig(sheetType?: string): SheetTypeConfig {
  return (sheetType && SHEET_REGISTRY[sheetType]) || SHEET_REGISTRY.generic;
}

export function hasModule(sheetType: string | undefined, id: SheetModuleId): boolean {
  return getSheetConfig(sheetType).modules.includes(id);
}
