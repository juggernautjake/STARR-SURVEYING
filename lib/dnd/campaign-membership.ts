// lib/dnd/campaign-membership.ts — which campaigns a character is in, which it could join, and who may
// change that. Pure, so the rules are testable without a database and the route and the UI cannot disagree.
//
// WHY THIS EXISTS (owner, 2026-07-26): "make sure there is a clear and easy way to take character into and
// out of a campaign". Both halves existed server-side and neither was reachable from the character:
//
//   · LEAVING — `DELETE /api/dnd/campaigns/[id]/characters/[characterId]` already allows the character's
//     OWNER as well as the DM, but its only caller is `CampaignHub`, the DM's roster. A player looking at
//     their own character had no way out of a campaign, and nowhere that even listed which campaigns it was
//     in — `campaignsForCharacter` was used for permission checks only.
//   · JOINING — `POST /api/dnd/campaigns/[id]/join-character` is called from exactly one place,
//     `AddToDemoButton`, hard-wired to the demo campaign.
//
// So this module deliberately adds no new mutation: it decides WHAT to offer, and the UI calls those two
// endpoints, which keeps authorization in one place rather than copying it into a third.

/** A campaign as the picker needs it. */
export interface CampaignRef {
  id: string;
  name: string;
  /** The caller's role in it, or null when they are not a member. */
  role?: 'dm' | 'player' | null;
}

export interface MembershipView {
  /** Campaigns this character is currently on the roster of. */
  member: CampaignRef[];
  /** Campaigns the CALLER belongs to that this character could still be added to. */
  joinable: CampaignRef[];
}

const norm = (s: string) => s.trim().toLowerCase();
const byName = (a: CampaignRef, b: CampaignRef) => norm(a.name).localeCompare(norm(b.name));

/**
 * Split the caller's campaigns into "this character is in it" and "it could join".
 *
 * `characterCampaignIds` is the character's real roster — which may include a campaign the CALLER is not a
 * member of (a DM added it, then the player left the table). Those still appear under `member`, because
 * hiding a membership the character genuinely has would make the panel lie; they simply have no `role`.
 */
export function membershipView(
  callerCampaigns: CampaignRef[],
  characterCampaignIds: string[],
  extraNames: Record<string, string> = {},
): MembershipView {
  const inIds = new Set(characterCampaignIds.filter(Boolean));
  const seen = new Set<string>();
  const member: CampaignRef[] = [];
  const joinable: CampaignRef[] = [];

  for (const c of callerCampaigns) {
    if (seen.has(c.id)) continue;           // a duplicate row must not become a duplicate chip
    seen.add(c.id);
    (inIds.has(c.id) ? member : joinable).push(c);
  }
  // Rosters the caller can't see into: named where we have a name, and never silently dropped.
  for (const id of inIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    member.push({ id, name: extraNames[id] ?? 'A campaign you are not in', role: null });
  }
  return { member: member.sort(byName), joinable: joinable.sort(byName) };
}

/**
 * May this caller take the character OUT of that campaign?
 *
 * Mirrors the DELETE route exactly — the character's owner, or that campaign's DM. Duplicating the rule in
 * the UI would let the button appear where the server refuses, which reads as a broken app; this is the one
 * definition both read.
 */
export function canLeaveCampaign(opts: { isOwner: boolean; role?: 'dm' | 'player' | null }): boolean {
  return opts.isOwner || opts.role === 'dm';
}

/**
 * May this caller put the character INTO that campaign?
 *
 * The owner may take their own character anywhere they themselves belong; a DM may bring one into their own
 * table. A player cannot add someone ELSE's character to a campaign — that is the DM's call or the owner's.
 */
export function canJoinCampaign(opts: { isOwner: boolean; role?: 'dm' | 'player' | null }): boolean {
  if (!opts.role) return false;             // not a member of that campaign at all
  return opts.isOwner || opts.role === 'dm';
}

/** One line for the panel's empty state — said plainly rather than showing an empty list. */
export function membershipSummary(view: MembershipView): string {
  if (view.member.length === 0) {
    return view.joinable.length
      ? 'Not in a campaign yet — this character is yours alone until you add it to one.'
      : 'Not in a campaign, and you are not in one either. Join or create a campaign first.';
  }
  const names = view.member.map((c) => c.name).join(', ');
  return view.member.length === 1 ? `In ${names}.` : `In ${view.member.length} campaigns: ${names}.`;
}
