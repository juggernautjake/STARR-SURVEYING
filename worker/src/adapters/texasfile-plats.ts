// worker/src/adapters/texasfile-plats.ts — recorded plats from the statewide aggregator.
//
// Driven by hand on 2026-09-21 against Williamson County; the form and its coverage table were read
// off the live page.
//
// ── WHY THIS IS SEPARATE FROM PLAT_REPO_REGISTRY ────────────────────────────────────────────────
//
// `services/county-plats.ts` is the FREE-FIRST path: a county portal that serves unwatermarked plat
// PDFs for nothing, like Bell's. Its whole design is "does this county give plats away, and how do
// we reach it". Putting a paid source in that registry would make `platSourceStatus()` report
// "available" for a county where every plat costs money, and the free-first purchase logic would
// stop looking for the free one.
//
// So this is the OTHER half, and the two answer different questions:
//
//     PLAT_REPO_REGISTRY   "is there a free plat repository?"   Bell yes, Williamson no.
//     this module          "can we buy the plat anywhere?"      Williamson yes, 1854 to now.
//
// A run should try the free repository first and land here only when there is not one — which is
// the order `county-plats.ts` already establishes and this module deliberately does not disturb.
//
// ── WHY IT MATTERS FOR WILLIAMSON SPECIFICALLY ──────────────────────────────────────────────────
//
// Job 26144's property is Lot 1 of VILLAGE GREEN, a recorded subdivision. The run announced it was
// metes and bounds and never looked for a plat. Williamson has no free plat repository, so even
// once the subdivision name is known — which WCAD's legal description and the county's own
// Subdivisions dataset both give — there was nowhere for the run to go. This is where it goes.

import { countySlug } from './texasfile-access.js';

/** The per-county plat search page. */
export function platSearchUrl(countyName: string): string {
  return `https://www.texasfile.com/search/texas/${countySlug(countyName)}/plat-records/`;
}

/**
 * Form field names, read off the live Williamson page on 2026-09-21.
 *
 * Note these are NOT the county-clerk form's names — that one uses the `name-0-name`,
 * `bvp-0-volume` convention. The plat form is a plainer, older shape, and a scraper that reuses the
 * clerk field map here fills nothing and submits an empty search, which returns everything or
 * nothing depending on the day.
 */
export const TEXASFILE_PLAT_FIELDS = {
  /** "Subdivision or Name". The field that matters — it is what a legal description gives us. */
  description: 'description',
  /** "Volume or Cabinet" — older plats are filed by volume, newer ones by cabinet. */
  volume: 'volume',
  /** "Page, Slide or Sleeve" — the counterpart to volume/cabinet. */
  page: 'page',
  /** "File Number", when a deed already cites one. */
  number: 'number',
  startDate: 'start_date',
  endDate: 'end_date',
} as const;

export interface PlatQuery {
  /** Subdivision name — from a legal description or the county's subdivision index. */
  subdivision?: string | null;
  volume?: string | null;
  page?: string | null;
  fileNumber?: string | null;
}

export interface PlatSearchPlan {
  url: string;
  /** Field name → value, ready to fill. Empty fields are omitted rather than sent blank. */
  fields: Record<string, string>;
  /** What this search is, in words, for the run log. */
  description: string;
  /** False when there is nothing to search on — the caller should not open a browser. */
  runnable: boolean;
  why: string;
}

const clean = (v: string | null | undefined): string => (v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Turn what we know into a plat search, or say why we cannot.
 *
 * Refuses an empty query rather than submitting one. A blank plat search on this form returns the
 * county's entire plat index, and a run that then "found 4,000 plats" has learned nothing and will
 * spend a page charge finding that out.
 */
export function planPlatSearch(countyName: string, q: PlatQuery): PlatSearchPlan {
  const fields: Record<string, string> = {};
  const parts: string[] = [];

  const sub = clean(q.subdivision);
  const vol = clean(q.volume);
  const pg = clean(q.page);
  const num = clean(q.fileNumber);

  // A file number is the most specific thing there is — one document — so when we have one the
  // others only narrow a search that is already narrow, and a mismatch between them would exclude
  // the very plat we are asking for.
  if (num) {
    fields[TEXASFILE_PLAT_FIELDS.number] = num;
    parts.push(`file number ${num}`);
  } else {
    if (sub) {
      fields[TEXASFILE_PLAT_FIELDS.description] = sub;
      parts.push(`subdivision "${sub}"`);
    }
    if (vol) {
      fields[TEXASFILE_PLAT_FIELDS.volume] = vol;
      parts.push(`volume/cabinet ${vol}`);
    }
    if (pg) {
      fields[TEXASFILE_PLAT_FIELDS.page] = pg;
      parts.push(`page/slide ${pg}`);
    }
  }

  const runnable = Object.keys(fields).length > 0;

  return {
    url: platSearchUrl(countyName),
    fields,
    description: runnable
      ? `${countyName} County plat records by ${parts.join(' and ')}`
      : `${countyName} County plat records — nothing to search on`,
    runnable,
    why: runnable
      ? 'a subdivision name, a volume/page or a file number is enough to narrow the index'
      : 'no subdivision name, volume/page or file number is known, and a blank plat search returns ' +
        'the county\'s whole index — thousands of rows, no answer, and a page charge to discover it',
  };
}

/**
 * Coverage, as the site states it per county.
 *
 * Recorded rather than assumed: a run that says "no plats found" for a 1903 subdivision should be
 * able to distinguish "the index does not reach that far back" from "there is no such plat", and
 * only the coverage table can tell it apart.
 */
export interface PlatCoverage {
  county: string;
  platsFrom: string;
  platsTo: string;
  indexFrom: string;
  indexTo: string;
  verifiedAt: string;
}

export const TEXASFILE_PLAT_COVERAGE: Record<string, PlatCoverage> = {
  williamson: {
    county: 'Williamson',
    // Read off the live page's own coverage table.
    platsFrom: '1854-02-18',
    platsTo: '2026-09-11',
    indexFrom: '1848-09-14',
    indexTo: '2026-09-11',
    verifiedAt: '2026-09-21',
  },
};

/** What we can say about a county's plat coverage before searching it. */
export function platCoverageStatement(countyName: string): string {
  const key = countyName.trim().toLowerCase().replace(/\s+county$/, '');
  const c = TEXASFILE_PLAT_COVERAGE[key];
  if (!c) {
    return `TexasFile carries ${countyName} County plats, but nobody has read its coverage dates — ` +
      'a search that finds nothing cannot yet be distinguished from an index that does not reach that far back.';
  }
  return `TexasFile plat maps for ${c.county} County run ${c.platsFrom} to ${c.platsTo} ` +
    `(full index ${c.indexFrom} to ${c.indexTo}), read from the site on ${c.verifiedAt}. ` +
    'The index and image previews are free; a downloadable PDF is charged per page.';
}
