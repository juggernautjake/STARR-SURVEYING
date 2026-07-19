// lib/dnd/character-visibility.ts — the precise access model for a character's ORIGINAL sheet vs its isolated
// CAMPAIGN version (owner 2026-07-18). The rules, verbatim-in-intent:
//   • A character is private or public.
//   • In a campaign, the DM ALWAYS sees everything about every character, private or public.
//   • private → other players can't see the info; public → everyone can review it, but a non-owner can't
//     CHANGE another player's character.
//   • The DM can edit a character's info, but only the VERSION inside their campaign (the isolated copy).
//   • The ORIGINAL exists outside the campaign; only its creator can edit the original.
//   • A player MAY opt to replace their original with the in-campaign version (promote).
//
// This module is the pure, exhaustively-tested decision core; the data-model that stores the campaign COPY and
// the routes/UI that enforce these decisions build on it (see the plan in the DND platform doc).

export type Visibility = 'private' | 'public';

/** How the viewer relates to the character. `isCreator` = owns the original; `isDM` = DM of a campaign the
 *  character is in; `isAssignedPlayer` = the player the DM assigned to play it (may differ from the creator). */
export interface ViewerRelation {
  isCreator: boolean;
  isDM: boolean;
  isAssignedPlayer: boolean;
  /** A non-DM member of the campaign (a fellow player). */
  isCampaignMember: boolean;
}

export interface SheetAccess { canView: boolean; canEdit: boolean }

const normVis = (v: string | null | undefined): Visibility => (v === 'public' ? 'public' : 'private');

/**
 * Access to the ORIGINAL sheet (the creator's canonical copy, living outside any campaign):
 *   • EDIT — only the creator. Nobody else edits the original (not even the DM; the DM edits the campaign copy).
 *   • VIEW — the creator; a DM of a campaign it's in (DMs always see everything); everyone if it's public;
 *     otherwise (private) nobody else.
 */
export function originalSheetAccess(rel: ViewerRelation, visibility: string | null | undefined): SheetAccess {
  const vis = normVis(visibility);
  const canEdit = rel.isCreator;
  const canView = canEdit || rel.isDM || vis === 'public';
  return { canView, canEdit };
}

/**
 * Access to the CAMPAIGN VERSION (the isolated copy inside one campaign):
 *   • EDIT — the DM of that campaign (they manage their campaign's copy), and the assigned player / creator of
 *     THIS character (a player edits their own; never another player's).
 *   • VIEW — anyone who can edit; a fellow campaign member only when the character is public (private hides it
 *     from other players); the DM always (they see everything).
 */
export function campaignSheetAccess(rel: ViewerRelation, visibility: string | null | undefined): SheetAccess {
  const vis = normVis(visibility);
  const ownsThis = rel.isCreator || rel.isAssignedPlayer;
  const canEdit = rel.isDM || ownsThis;
  const canView = canEdit || rel.isDM || (rel.isCampaignMember && vis === 'public');
  return { canView, canEdit };
}

/** Only the character's creator may opt to REPLACE their original with the in-campaign version. */
export function canPromoteCampaignToOriginal(rel: ViewerRelation): boolean {
  return rel.isCreator;
}

/**
 * Where an EDIT to a character-in-a-campaign should land — the crux of the isolation rule:
 *   • The DM (when they are NOT this character's creator) edits the ISOLATED campaign copy — their changes must
 *     never touch the creator's original. → 'campaign-override'.
 *   • Everyone else who can edit (the creator / assigned player editing their own) edits the ORIGINAL, which is
 *     also what the campaign renders until the DM first forks a copy. → 'original'.
 * This is the pure routing decision the load/save + AI/homebrew edit chokepoints consult to pick their write
 * target (VIS6c). Kept framework-free + tested so the eventual wiring is trivial, reviewed glue.
 */
export type EditTarget = 'original' | 'campaign-override';
export function campaignEditTarget(rel: ViewerRelation, inCampaign: boolean): EditTarget {
  return inCampaign && rel.isDM && !rel.isCreator && !rel.isAssignedPlayer ? 'campaign-override' : 'original';
}

/** The mirror of {@link campaignEditTarget} for READS: a viewer sees the isolated campaign copy exactly when
 *  their edits would land there — so what they see is what they'd change (never see the override but save the
 *  original). Any override present is honoured for that viewer; otherwise the original renders. */
export function campaignReadFromOverride(rel: ViewerRelation, inCampaign: boolean, overrideExists: boolean): boolean {
  return overrideExists && campaignEditTarget(rel, inCampaign) === 'campaign-override';
}

/** Would a fellow player (a campaign member who isn't the owner/DM) be able to see this character? Encodes the
 *  headline rule: private hides from other players; public lets everyone review (but not edit). */
export function fellowPlayerCanView(visibility: string | null | undefined): boolean {
  return normVis(visibility) === 'public';
}
