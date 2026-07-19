// lib/dnd/campaign-character-copy.ts — the ISOLATED in-campaign character copy (owner 2026-07-18: "the DM can
// change a character's info, but only the version of that character inside their campaign … the original
// character exists outside the campaign … the version inside the campaign is isolated to that campaign …
// players can opt to replace the original with the in-campaign version").
//
// Model: the original character (`dnd_characters.data`) is the creator's canonical sheet. A campaign holds an
// OPTIONAL override of that sheet on the roster join row (`dnd_campaign_characters.data_override`). While the
// override is null the campaign simply shows the original; the first DM edit inside the campaign forks a copy
// (a deep snapshot) into the override, and thereafter DM edits touch ONLY that override — the original is
// untouched and stays with the creator. The creator may later PROMOTE the override back over their original.
//
// This module is the pure data plumbing (which bytes render / fork / promote); the routes that read+write the
// override and enforce who-can-do-what (see character-visibility.ts) build on it. Framework-free + tested.

/** Deep-clone a character data object so the campaign copy can diverge from the original without aliasing.
 *  Uses structuredClone when available, else a JSON round-trip (character data is plain JSON). */
export function cloneSheetData<T>(data: T): T {
  if (data == null) return data;
  try {
    if (typeof structuredClone === 'function') return structuredClone(data);
  } catch { /* fall through to JSON */ }
  return JSON.parse(JSON.stringify(data));
}

/** The data a campaign should RENDER for a character: its isolated override when one exists, else the original.
 *  So a campaign with no override shows the live original; once forked, it shows the campaign's own copy. */
export function campaignRenderData<T>(originalData: T, override: T | null | undefined): T {
  return override != null ? override : originalData;
}

/** True once the campaign holds its own isolated copy (a DM edit has forked it). */
export function hasCampaignOverride(override: unknown): boolean {
  return override != null;
}

/**
 * Fork the campaign's isolated copy from the current render data on the FIRST in-campaign edit: if an override
 * already exists it's returned unchanged (already isolated); otherwise a deep snapshot of the original is
 * taken. The caller then applies the edit to the returned copy and stores it as the override — leaving the
 * original untouched.
 */
export function forkCampaignCopy<T>(originalData: T, existingOverride: T | null | undefined): T {
  return existingOverride != null ? existingOverride : cloneSheetData(originalData);
}

/**
 * PROMOTE: the data to write back over the ORIGINAL when the creator opts to replace it with the in-campaign
 * version. Returns a deep clone of the override (null when there's no override to promote — nothing changed in
 * the campaign yet). The caller writes this to `dnd_characters.data` and MAY then clear the override so the
 * campaign and original are back in sync.
 */
export function promoteOverrideToOriginal<T>(override: T | null | undefined): T | null {
  return override != null ? cloneSheetData(override) : null;
}
