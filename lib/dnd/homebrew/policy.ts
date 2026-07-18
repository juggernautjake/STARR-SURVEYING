// lib/dnd/homebrew/policy.ts — the campaign-level DM gate for homebrew (Area H4, pure layer).
//
// A DM decides which shared homebrew is legal in THEIR campaign: either the whole approved catalog
// (`allowAll`) or an explicit allowlist of piece ids. These pure helpers read that policy off a campaign row
// (defensively) and combine it with the per-piece `canUseHomebrew` rule, so the route/UI just supply the
// campaign's stored policy + whether the viewer is the DM. Kept separate from `model.ts` so the policy shape
// (a campaign concern) doesn't bleed into the content model.
import { canUseHomebrew, isHomebrewPublished, type HomebrewContent } from './model';

export interface CampaignHomebrewPolicy {
  /** The DM opened the ENTIRE approved catalog for this campaign. */
  allowAll?: boolean;
  /** Otherwise, only these specific homebrew piece ids are legal in the campaign. */
  allowedIds?: string[];
}

/** Defensively read a campaign's homebrew policy from a raw (DB/JSON) value. Unknown/missing → the closed
 *  default (nothing allowed until the DM opts in), never an accidental open catalog. */
export function readHomebrewPolicy(raw: unknown): CampaignHomebrewPolicy {
  if (!raw || typeof raw !== 'object') return { allowAll: false, allowedIds: [] };
  const r = raw as Record<string, unknown>;
  return {
    allowAll: r.allowAll === true,
    allowedIds: Array.isArray(r.allowedIds) ? r.allowedIds.filter((x): x is string => typeof x === 'string') : [],
  };
}

/** Whether a piece is legal for a campaign given its policy + the viewer's DM status. Pure wrapper over
 *  `canUseHomebrew` that reads the campaign's stored allow rules. */
export function homebrewAllowedForCampaign(
  content: HomebrewContent,
  policy: CampaignHomebrewPolicy,
  opts: { isDM?: boolean } = {},
): boolean {
  return canUseHomebrew(content, { isDM: opts.isDM, allowAll: policy.allowAll, allowedIds: policy.allowedIds });
}

/** The subset of a catalog a character in this campaign may actually adopt (H4) — published pieces the DM has
 *  allowed (a DM sees their own drafts too). */
export function allowedHomebrewList(
  list: readonly HomebrewContent[],
  policy: CampaignHomebrewPolicy,
  opts: { isDM?: boolean } = {},
): HomebrewContent[] {
  return list.filter((c) => homebrewAllowedForCampaign(c, policy, opts));
}

/** Toggle a single piece on/off a campaign's allowlist (H4 DM control, pure) — returns the next policy. A no-op
 *  when `allowAll` is on (the whole catalog is already open; the DM turns that off first to curate). */
export function toggleHomebrewAllowed(policy: CampaignHomebrewPolicy, id: string): CampaignHomebrewPolicy {
  if (policy.allowAll) return policy;
  const cur = new Set(policy.allowedIds ?? []);
  if (cur.has(id)) cur.delete(id);
  else cur.add(id);
  return { ...policy, allowedIds: [...cur] };
}

/** A short, honest summary of what a campaign's policy permits — for the DM settings surface. */
export function describeHomebrewPolicy(policy: CampaignHomebrewPolicy): string {
  if (policy.allowAll) return 'All approved homebrew is allowed in this campaign.';
  const n = policy.allowedIds?.length ?? 0;
  if (n === 0) return 'No homebrew is allowed yet — the DM adds pieces to the allowlist.';
  return `${n} homebrew ${n === 1 ? 'piece is' : 'pieces are'} allowed in this campaign.`;
}

/** Guard used by an adopt/apply route (H4): may this character take this piece? Requires the piece to be
 *  published AND allowed by the campaign policy (a DM bypasses for preview). Pure — the route supplies the
 *  campaign policy + DM flag it already resolves for access control. */
export function canAdoptHomebrew(
  content: HomebrewContent,
  policy: CampaignHomebrewPolicy,
  opts: { isDM?: boolean } = {},
): boolean {
  if (!isHomebrewPublished(content) && !opts.isDM) return false;
  return homebrewAllowedForCampaign(content, policy, opts);
}
