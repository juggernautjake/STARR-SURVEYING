// lib/dnd/campaign-scope.ts — campaign system-scoping (owner 2026-07-18: "whatever system the campaign is set
// for, only the character sheets that relate to that campaign can be used or even viewed in it … when
// accessing our characters from the campaign, we only have character sheets that align with the system the DM
// chose").
//
// A character can hold multiple system sheets (system_variants → `SheetSlot[]` via `listSheets`). On the
// player's OWN profile they see all of them and can add more; but INSIDE a DM's campaign, only the slots whose
// system matches the campaign's system are eligible — so a Pathfinder sheet never shows up in a D&D 2024
// campaign. This module is the pure filter both the campaign character view and its access check use, so they
// agree. (DM approval is a separate gate — see `campaignApproval`.) Pure + framework-free + tested.
import { normalizeSystem } from '@/lib/dnd/systems';
import type { SheetSlot } from '@/lib/dnd/system-variants';

/** Does a sheet slot's system match the campaign's system (both normalized)? */
export function sheetMatchesSystem(sheet: Pick<SheetSlot, 'system'>, campaignSystem: string): boolean {
  return normalizeSystem(sheet.system) === normalizeSystem(campaignSystem);
}

/**
 * The character's sheets eligible to be used IN a campaign of `campaignSystem` — only the slots whose system
 * matches. Empty when the character has no sheet in that system (they'd need to build/transpose one to join).
 */
export function campaignEligibleSheets(sheets: SheetSlot[], campaignSystem: string): SheetSlot[] {
  return (sheets ?? []).filter((s) => sheetMatchesSystem(s, campaignSystem));
}

/** True when the character has at least one sheet in the campaign's system (i.e. it can be played there). */
export function characterHasCampaignSheet(sheets: SheetSlot[], campaignSystem: string): boolean {
  return campaignEligibleSheets(sheets, campaignSystem).length > 0;
}

/**
 * Which sheet a campaign should show as ACTIVE for a character: the active slot when it already matches the
 * campaign's system, otherwise the first eligible (matching-system) slot, otherwise null (the character has no
 * sheet for this campaign's system). So opening a character from the campaign always lands on the right-system
 * sheet, never a mismatched one.
 */
export function campaignActiveSheet(sheets: SheetSlot[], campaignSystem: string): SheetSlot | null {
  const eligible = campaignEligibleSheets(sheets, campaignSystem);
  if (eligible.length === 0) return null;
  return eligible.find((s) => s.active) ?? eligible[0];
}
