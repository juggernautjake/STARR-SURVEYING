// worker/src/services/platform-choice.ts — cheapest-first as a policy, not a sort (plan R13).
//
// ── THE DIFFERENCE BETWEEN A SORT AND A POLICY ──────────────────────────────────────────────────
//
// `PaidPlatformRegistry.getPlatformsForCounty()` returns platforms cost-ascending, and the header of
// that file calls this the architecture: "try paid platforms in cost-ascending order". But a sorted
// list is a suggestion. Callers picked a vendor by name — the purchase orchestrator initialises a
// Kofile adapter if any recommendation's `source` string contains "kofile" — so the ordering was
// decorative. A county covered by Tyler at $0.50 was routinely billed at $1.00 because the
// recommendation happened to say TexasFile.
//
// This module makes the choice, states the reason, and records what it skipped. The reason string
// is the part that matters operationally: "used TexasFile at $1.00/page because Tyler is $0.50 but
// has no credentials configured" is an invoice line AND a to-do item. A silent $0.50 overpay per
// page is neither.

import { PaidPlatformRegistry } from './paid-platform-registry.js';
import type { PaidPlatformDescriptor, PaidPlatformId } from '../types/document-access.js';

export interface PlatformChoice {
  platform: PaidPlatformDescriptor | null;
  /** Plain-English justification, safe to show an operator or attach to a receipt. */
  reason: string;
  /** Covered this county and was cheaper, but is unusable — each with why. This is the buy-list for
   *  whoever decides which subscriptions to pay for. */
  cheaperButUnavailable: Array<{ id: PaidPlatformId; costPerPage: number; why: string }>;
  /** Dollars per page above the theoretical best. Zero when we got the cheapest option there is. */
  premiumPerPage: number;
}

export interface ChoiceOptions {
  /** Platform ids with working credentials. Defaults to whatever the environment configures. */
  configured?: PaidPlatformId[];
  /** Skip free sources — they have already been tried and were insufficient. Free platforms are
   *  still returned when this is false, because paying for a TxDOT page that is free is the most
   *  embarrassing way to lose money. */
  includeFree?: boolean;
}

/** Does a platform need credentials at all? Free/anonymous sources do not, and requiring them would
 *  disqualify exactly the platforms we most want to use. */
function needsCredentials(p: PaidPlatformDescriptor): boolean {
  return p.authType !== 'none' && p.costPerPage > 0;
}

/** Choose the platform to buy from, cheapest usable first.
 *
 *  Returns `platform: null` with a reason when nothing is usable, rather than falling through to an
 *  arbitrary vendor. "We cannot buy this here and here is why" is an answer a human can act on; a
 *  surprise charge from a vendor nobody chose is not. */
export function choosePlatform(countyFIPS: string, opts: ChoiceOptions = {}): PlatformChoice {
  const configured = new Set<PaidPlatformId>(
    opts.configured ?? PaidPlatformRegistry.getConfiguredPlatforms(),
  );
  const includeFree = opts.includeFree ?? true;

  const covering = PaidPlatformRegistry.getPlatformsForCounty(countyFIPS)
    .filter((p) => (includeFree ? true : p.costPerPage > 0));

  if (covering.length === 0) {
    return {
      platform: null,
      reason: `no known platform sells records for FIPS ${countyFIPS} — this county needs a manual request`,
      cheaperButUnavailable: [],
      premiumPerPage: 0,
    };
  }

  const cheaperButUnavailable: PlatformChoice['cheaperButUnavailable'] = [];
  let chosen: PaidPlatformDescriptor | null = null;

  // getPlatformsForCounty() is already cost-ascending; walking it in order IS the policy. Anything
  // passed over before the winner is cheaper by construction, so the skip list builds itself.
  for (const p of covering) {
    if (!p.automationSupported) {
      cheaperButUnavailable.push({ id: p.id, costPerPage: p.costPerPage, why: 'no automation — needs a person' });
      continue;
    }
    if (needsCredentials(p) && !configured.has(p.id)) {
      cheaperButUnavailable.push({ id: p.id, costPerPage: p.costPerPage, why: 'no credentials configured' });
      continue;
    }
    chosen = p;
    break;
  }

  if (!chosen) {
    return {
      platform: null,
      reason:
        `every platform covering FIPS ${countyFIPS} is unusable: ` +
        cheaperButUnavailable.map((c) => `${c.id} (${c.why})`).join(', '),
      cheaperButUnavailable,
      premiumPerPage: 0,
    };
  }

  const best = covering[0]!;
  const premium = Number((chosen.costPerPage - best.costPerPage).toFixed(2));

  const reason = premium > 0
    ? `${chosen.displayName} at $${chosen.costPerPage.toFixed(2)}/page — $${premium.toFixed(2)}/page more than ` +
      `${best.displayName}, which is unusable (${cheaperButUnavailable[0]?.why ?? 'unknown'})`
    : `${chosen.displayName} at $${chosen.costPerPage.toFixed(2)}/page — the cheapest option covering this county`;

  return { platform: chosen, reason, cheaperButUnavailable, premiumPerPage: premium };
}

export interface PolicyViolation {
  allowed: boolean;
  reason: string;
}

/** Is buying from `platformId` permitted for this county?
 *
 *  The enforcement point. A caller that picked a vendor from a recommendation string asks here
 *  before spending, and a cheaper usable alternative is a refusal — not a warning that scrolls past
 *  in a log nobody reads while the card gets charged anyway. */
export function mayPurchaseFrom(
  countyFIPS: string,
  platformId: PaidPlatformId,
  opts: ChoiceOptions = {},
): PolicyViolation {
  const choice = choosePlatform(countyFIPS, opts);
  if (!choice.platform) return { allowed: false, reason: choice.reason };
  if (choice.platform.id === platformId) return { allowed: true, reason: choice.reason };

  const asked = PaidPlatformRegistry.getPlatform(platformId);
  if (!asked) return { allowed: false, reason: `${platformId} is not a known platform` };

  // More expensive than the policy choice → refuse. Equal or cheaper → allow: the caller may know
  // something the registry does not (a county-specific rate, a document only that vendor carries),
  // and refusing a CHEAPER purchase would be the policy working against its own purpose.
  if (asked.costPerPage > choice.platform.costPerPage) {
    return {
      allowed: false,
      reason:
        `${asked.displayName} costs $${asked.costPerPage.toFixed(2)}/page but ` +
        `${choice.platform.displayName} covers this county at $${choice.platform.costPerPage.toFixed(2)} ` +
        `and is configured. Buying the dearer one needs a stated reason.`,
    };
  }
  return { allowed: true, reason: `${asked.displayName} is no dearer than the policy choice` };
}
