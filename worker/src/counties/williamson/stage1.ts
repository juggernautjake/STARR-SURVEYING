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

import type { PropertyIdResult, DeedHistoryEntry } from '../../types/index.js';
import type { PipelineLogger } from '../../lib/logger.js';
import {
  wcadFindProperty, wcadDetailUrl, parseWcadDetail, fetchWcadDetail, subdivisionFromLegal,
  wcadSubdivision, wcadSales, wcadParcel, parseConveyanceName, wcadData, type FindAttempt,
} from './wcad.js';
import { WILLIAMSON_ENDPOINTS } from './config/endpoints.js';

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
  let propertyType: string | null = null;

  // ── THE DETAIL PAGE IS FETCHED, NOT HOPED FOR ────────────────────────────────────────────────
  //
  // This used to run only when a caller passed `detailText`, and no caller ever did. So every
  // Williamson run returned a property id and an owner and then reported no legal description, no
  // acreage and no subdivision — the three most valuable fields on the page — with nothing
  // failing anywhere. Found by looking for the caller of an option that had none.
  const detail = opts.detailText
    ? { detail: parseWcadDetail(hit.propertyQuickRefId, opts.detailText), error: null }
    : await fetchWcadDetail(hit.propertyQuickRefId, hit.partyQuickRefId, opts.fetchImpl ?? fetch);

  if (detail.error) {
    // Not fatal: the parcel is already identified and the run can proceed on the id and the owner.
    // But it must be SAID, because the difference between "this parcel has no legal description"
    // and "we did not fetch the page that carries it" is the whole value of the field.
    logger.warn('Stage1', `WCAD: the detail page could not be read (${detail.error}) — the parcel is identified but its legal description, acreage and subdivision are unknown for this run.`);
    notes.push(`The detail page was not readable: ${detail.error}`);
  } else if (detail.detail) {
    const d = detail.detail;
    legal = d.legalDescription;
    acreage = d.acres;
    mapId = d.mapNumber ?? undefined;
    mailing = d.mailingAddress ?? undefined;
    propertyType = d.propertyType;

    logger.info('Stage1',
      `WCAD detail: ${[
        d.account ? `account ${d.account}` : null,
        legal ? `legal "${legal}"` : 'no legal description on the page',
        acreage !== null ? `${acreage} acres` : null,
        d.improvementSqFt ? `${d.improvementSqFt} sq ft built ${d.yearBuilt ?? '?'}` : null,
        d.mapNumber ? `map ${d.mapNumber}` : null,
      ].filter(Boolean).join(' · ')}`);

    const sub = subdivisionFromLegal(legal);
    if (sub) {
      const { matches, error } = await wcadSubdivision(sub, opts.fetchImpl ?? fetch);
      if (error) {
        logger.warn('Stage1', `WCAD: the subdivision index could not be searched (${error}).`);
        notes.push(`The subdivision index was unreachable: ${error}`);
      } else if (matches.length > 0) {
        const m = matches[0]!;
        notes.push(
          `Platted: ${m.name}${m.code ? ` (${m.code})` : ''}${m.hasGeometry ? ', polygon on file' : ''}.`,
        );
        logger.info('Stage1',
          `WCAD: subdivision "${m.name}"${m.code ? ` code ${m.code}` : ''}` +
          `${m.lots ? `, ${m.lots} lots` : ''}${m.hasGeometry ? ', polygon on file' : ''}` +
          `${matches.length > 1 ? ` (${matches.length - 1} other near match(es))` : ''}`);
      } else {
        // The index is genuinely incomplete — it holds SOUTH CREEK SEC 10 and SEC 12 and no SEC 16
        // — so a miss here is not evidence the parcel is unplatted.
        logger.info('Stage1',
          `WCAD: the subdivision index has no entry for "${sub}". The index is known to be ` +
          'incomplete, so this is not evidence the parcel is unplatted — the legal description ' +
          'says it is.');
        notes.push(`Legal description names "${sub}"; the county's subdivision index has no entry for it.`);
      }
    } else if (legal) {
      logger.info('Stage1', 'WCAD: metes and bounds — no subdivision to look up.');
      notes.push('Metes and bounds — no subdivision to look up.');
    }
  }

  // ── THE CLERK BRIDGE ─────────────────────────────────────────────────────────────────────────
  //
  // This county cites deeds by BOOK AND PAGE and publishes no instrument numbers at all, so the
  // route into the clerk is: property id → Sales dataset → book/page. That chain was designed,
  // written, tested — and never called, which meant Stage 2 fell back to searching the owner's
  // NAME: slower, less precise, and on this clerk it needs a browser and a chip-list interaction
  // that a book/page search does not.
  //
  // `deedHistory` carries volume and page, so the citations travel on the shape the pipeline
  // already understands and nothing downstream needs to know which county produced them.
  //
  // The Sales datasets key on the NUMERIC property id, not the `R…` quick-ref. They are different
  // keys and passing the wrong one returns an empty list that looks exactly like a property with
  // no sales history — so the numeric id is looked up rather than assumed.
  const deedHistory: DeedHistoryEntry[] = [];
  try {
    const { rows } = await wcadData<Record<string, unknown>>(
      WILLIAMSON_ENDPOINTS.data.datasets.propertyCertified,
      { quickrefid: hit.propertyQuickRefId, $select: 'propertyid', $limit: 1 },
      opts.fetchImpl ?? fetch,
    );
    const numericId = rows[0] ? String(rows[0].propertyid ?? '') : '';

    if (!numericId) {
      logger.info('Stage1', `WCAD: no numeric property id for ${hit.propertyQuickRefId}, so no sales history could be looked up.`);
    } else {
      const { sales, error } = await wcadSales(numericId, { fetchImpl: opts.fetchImpl });
      if (error) {
        logger.warn('Stage1', `WCAD: the sales dataset could not be read (${error}).`);
        notes.push(`The sales history was unreachable: ${error}`);
      } else if (sales.length === 0) {
        // A real finding on exempt or long-held property — job 26144's parcel has none across all
        // five sales datasets — and NOT the same as the dataset being unavailable.
        logger.info('Stage1',
          `WCAD: no recorded transfers for property ${numericId}. Common on exempt or long-held ` +
          'land; the clerk will have to be searched by name rather than by book and page.');
        notes.push('The appraisal district records no transfers for this parcel.');
      } else {
        for (const s of sales) {
          deedHistory.push({
            deedDate: s.deedDate ?? undefined,
            type: s.instrumentTypeCode ?? undefined,
            volume: s.book ?? s.volume ?? undefined,
            page: s.page ?? undefined,
          });
        }
        const citable = deedHistory.filter((d) => d.volume && d.page);
        logger.info('Stage1',
          `WCAD: ${sales.length} recorded transfer(s), ${citable.length} citing a book and page — ` +
          `${citable.slice(0, 4).map((d) => `${d.volume}/${d.page}`).join(', ')}` +
          `${citable.length > 4 ? ` and ${citable.length - 4} more` : ''}. ` +
          'These are what the clerk should be searched on; the name search is the fallback.');
      }
    }
  } catch (e) {
    logger.warn('Stage1', `WCAD: the sales lookup threw (${e instanceof Error ? e.message : String(e)}).`);
  }

  // ── THE PARCEL BOUNDARY ──────────────────────────────────────────────────────────────────────
  //
  // Recorded because it exists and was declared missing: the profile said this county had no public
  // parcel polygon service, and the Socrata Parcels dataset carries a GeoJSON MultiPolygon on every
  // row. The conveyance name on that row also names the subdivision WITH its code, which matters
  // because the standalone subdivision index is incomplete.
  try {
    const { parcel } = await wcadParcel(hit.propertyQuickRefId, opts.fetchImpl ?? fetch);
    if (parcel?.geometry) {
      logger.info('Stage1', `WCAD: parcel boundary on file for ${parcel.parcelId}.`);
      notes.push('A parcel boundary polygon is published for this property.');
    }
    const conv = parseConveyanceName(parcel?.conveyanceName);
    if (conv) {
      logger.info('Stage1',
        `WCAD: the parcel row names its subdivision directly — ${conv.code ? `${conv.code} ` : ''}${conv.name}.`);
      notes.push(`Subdivision per the parcel record: ${conv.code ? `${conv.code} — ` : ''}${conv.name}.`);
    }
  } catch (e) {
    logger.warn('Stage1', `WCAD: the parcel lookup threw (${e instanceof Error ? e.message : String(e)}).`);
  }

  return {
    propertyId: hit.propertyQuickRefId,
    deedHistory: deedHistory.length ? deedHistory : undefined,
    // WCAD's account number is the closest thing it has to Bell's geo id — the number printed on a
    // notice, and what a person will quote back.
    geoId: hit.propertyNumber,
    ownerName: hit.ownerName,
    legalDescription: legal,
    acreage,
    propertyType,
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
