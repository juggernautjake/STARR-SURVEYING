/**
 * Williamson — the Stage 1 parcel lookup.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
 *
 * The generic pipeline's Stage 1 has exactly one way to find a parcel: `searchBisCad`. That is
 * correct for the thirty-odd BIS counties and useless for Williamson, which runs True Automation.
 * Removing Williamson's (fictional) BIS row stopped the run wasting 33 seconds on a hostname that
 * does not exist, but it left the county with no appraisal lookup at all — a quieter failure than
 * before and still a failure.
 *
 * This is the bridge. `wcad.ts` knows how to talk to WCAD; this maps its answer onto the
 * `PropertyIdResult` the rest of the pipeline already understands, so nothing downstream needs to
 * know which vendor answered.
 *
 * ── CONFIDENCE IS EARNED, NOT ASSERTED ──────────────────────────────────────────────────────────
 *
 * `matchConfidence` drives real decisions further down — whether a run trusts the parcel enough to
 * spend money on deeds. A lookup that had to drop the street type to find anything is not as
 * certain as one that matched what the operator typed, and saying so is the difference between a
 * useful number and decoration.
 */

import type { PropertyIdResult } from '../../types/index.js';
import type { PipelineLogger } from '../../lib/logger.js';
import {
  wcadFindProperty, wcadDetailUrl, parseWcadDetail, subdivisionFromLegal, wcadSubdivision,
  type FindAttempt,
} from './wcad.js';

export interface WilliamsonStage1Options {
  /** The geocoder's corrected line, when Stage 0 produced one. */
  canonical?: string | null;
  /** Rendered text of the detail page, when a caller already has a browser open. */
  detailText?: string | null;
  fetchImpl?: typeof fetch;
}

/**
 * How much to believe a hit, given how hard we had to look.
 *
 * The operator's own words matching is the strongest signal available — they are looking at the
 * job. Each fallback is a step away from that, so each costs confidence. Nothing here reaches 1.0:
 * a single search result is evidence, not proof, and the only thing that would justify certainty
 * is a second independent source agreeing.
 */
export function confidenceFor(attemptsUsed: number): number {
  if (attemptsUsed <= 1) return 0.95;
  if (attemptsUsed === 2) return 0.85;
  return 0.75;
}

/** The sentence a person reads in the run log when the search took more than one try. */
export function describeAttempts(attempts: readonly FindAttempt[]): string {
  return attempts
    .map((a) => `"${a.query}" (${a.why}) → ${a.hits === 0 ? 'nothing' : `${a.hits} result${a.hits === 1 ? '' : 's'}`}`)
    .join('; ');
}

/**
 * Find a Williamson parcel and describe it the way the pipeline expects.
 *
 * Returns `null` when nothing was found, which is a real answer here rather than an error — this
 * county's search is a single fast JSON call, so "no such address" is cheap and trustworthy in a
 * way it is not on a site we had to fight.
 */
export async function williamsonStage1(
  address: string,
  logger: PipelineLogger,
  opts: WilliamsonStage1Options = {},
): Promise<PropertyIdResult | null> {
  const found = await wcadFindProperty(address, {
    canonical: opts.canonical,
    fetchImpl: opts.fetchImpl,
  });

  // Every attempt is logged whether or not it worked. "We tried three spellings and Williamson has
  // none of them" and "we never asked" are different findings, and only one is about the property.
  logger.info('Stage1', `WCAD: ${describeAttempts(found.attempts)}`);

  if (!found.hit) {
    const many = found.attempts.some((a) => a.hits > 1);
    logger.warn(
      'Stage1',
      many
        ? 'WCAD matched more than one property and none of the queries narrowed it to one — the address needs a unit or a property id.'
        : 'WCAD has no property at that address. The search is a single free-text call, so this is an answer rather than a failure to reach the site.',
    );
    return null;
  }

  const hit = found.hit;
  const notes: string[] = [];

  // Which attempt actually worked — the last one, since the search stops at the first that returns.
  const used = found.attempts.length;
  if (used > 1) {
    notes.push(
      `The address as entered found nothing; this matched on "${found.attempts[used - 1]!.query}" ` +
      `(${found.attempts[used - 1]!.why}).`,
    );
  }

  // The detail page carries the legal description, and the legal description carries the
  // subdivision — the step job 26144's run skipped when it announced a platted lot was metes and
  // bounds. Only read when a caller has already rendered the page; this module does not open a
  // browser of its own.
  let legal: string | null = null;
  let acreage: number | null = null;
  let mapId: string | undefined;
  let mailing: string | undefined;

  if (opts.detailText) {
    const d = parseWcadDetail(hit.propertyQuickRefId, opts.detailText);
    legal = d.legalDescription;
    acreage = d.acres;
    mapId = d.mapNumber ?? undefined;
    mailing = d.mailingAddress ?? undefined;

    const sub = subdivisionFromLegal(legal);
    if (sub) {
      const { matches } = await wcadSubdivision(sub, opts.fetchImpl ?? fetch);
      if (matches.length > 0) {
        const m = matches[0]!;
        notes.push(
          `Platted: ${m.name}${m.code ? ` (${m.code})` : ''}${m.hasGeometry ? ', polygon on file' : ''}.`,
        );
        logger.info('Stage1', `WCAD: subdivision ${m.name}${m.code ? ` code ${m.code}` : ''}`);
      } else {
        notes.push(`Legal description names "${sub}" but the county's subdivision index has no match.`);
      }
    } else if (legal) {
      notes.push('Metes and bounds — no subdivision to look up.');
    }
  }

  return {
    propertyId: hit.propertyQuickRefId,
    // WCAD's account number is the closest thing it has to Bell's geo id — the number printed on a
    // notice, and what a person will quote back.
    geoId: hit.propertyNumber,
    ownerName: hit.ownerName,
    legalDescription: legal,
    acreage,
    propertyType: null,
    situsAddress: hit.situsAddress,
    source: 'Williamson CAD (WCAD)',
    layer: 'wcad-quick-search',
    matchConfidence: confidenceFor(used),
    validationNotes: notes,
    // ── DELIBERATELY ABSENT ──────────────────────────────────────────────────────────────────
    // `instrumentNumbers` is left unset because WCAD does not publish them. Its Sales datasets
    // cite deeds by BOOK and PAGE, and a downstream reader that finds an empty instrument list
    // will fall back to the name search — which is the correct behaviour here, and the reason
    // `capabilities.clerkBridge` is 'volume_page'. Filling this with book/page strings formatted
    // to look like instruments would send the clerk a number in the wrong namespace.
    ownerId: hit.partyQuickRefId ?? undefined,
    mapId,
    mailingAddress: mailing,
  };
}

/** Where a browser should go to read the rest. */
export function williamsonDetailUrl(hit: { propertyId: string; ownerId?: string }): string {
  return wcadDetailUrl(hit.propertyId, hit.ownerId ?? null);
}
