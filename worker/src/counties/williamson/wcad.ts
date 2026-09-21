/**
 * Williamson Central Appraisal District — the client.
 *
 * Driven by hand on 2026-09-21; every shape here was read off a live response. See
 * docs/research/williamson-county-discovery-2026-09-21.md for the session.
 *
 * ── WHY THIS IS NOT bis-cad.ts WITH A DIFFERENT URL ─────────────────────────────────────────────
 *
 * Because Williamson is not a BIS county. The profile resolver said it was, and the run that
 * followed used BIS's URL shapes against True Automation's site — on a hostname that does not
 * resolve. Three wrong things stacked, and only the third one produced an error message.
 *
 * ── THE PART THAT MATTERS, AND THE CLAIM I HAD TO WITHDRAW ──────────────────────────────────────
 *
 * `quickSearch` is free text and it answered "1007 CUSHING" — no street type at all — with the
 * single correct parcel in 164 milliseconds, no auth, no cookie.
 *
 * I first wrote that it "tolerates partials and misspellings" and that a run should send the raw
 * string and stop. The live check refuted half of that within the minute: **"1007 Cushing Dirve"
 * returns ZERO hits.** It tolerates a MISSING street type; it does not tolerate a WRONG one.
 *
 * That distinction is the whole design of `wcadFindProperty` below. Dropping the street type is
 * free and safe, because a house number plus a street name is already specific enough in one
 * county. Guessing at a correction is neither, so the corrected form is tried only when a
 * geocoder produced one and only after the operator's own words have failed.
 */

import { WILLIAMSON_ENDPOINTS } from './config/endpoints.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';

/** Long enough for a slow day, short enough that a dead host does not cost a stage. */
const TIMEOUT_MS = 15_000;

export interface WcadSearchHit {
  /** `R075105` — the id every other endpoint takes. */
  propertyQuickRefId: string;
  /** `O011710` — the owner/party id, needed by the detail URL. */
  partyQuickRefId: string | null;
  /** `R-16-5591-EX00-0001` — the account number as printed on a notice. */
  propertyNumber: string | null;
  ownerName: string | null;
  situsAddress: string | null;
  taxYear: number | null;
}

export interface WcadSearchResult {
  hits: WcadSearchHit[];
  recordCount: number;
  totalPages: number;
  /** Null when the search itself failed, as opposed to returning nothing. */
  error: string | null;
}

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t : null;
};

/**
 * Free-text property search.
 *
 * `raw` is sent as typed. No variants, no normalisation, no street-type expansion — the endpoint
 * does that work and does it better, and putting a variant generator in front of it would only
 * reintroduce the class of bug that sent "Cushing Dirve" to two counties' worth of search boxes.
 */
export async function wcadQuickSearch(
  raw: string,
  opts: { taxYear?: number; page?: number; fetchImpl?: typeof fetch } = {},
): Promise<WcadSearchResult> {
  const query = (raw ?? '').trim();
  if (!query) return { hits: [], recordCount: 0, totalPages: 0, error: 'nothing to search for' };

  const url = new URL(WILLIAMSON_ENDPOINTS.cad.quickSearch);
  url.searchParams.set('f', query);
  url.searchParams.set('pn', String(opts.page ?? 1));
  // `st`/`so`/`pt` are sent exactly as the site sends them. They are not guesses and they are not
  // tuning knobs; a different `pt` silently drops whole property classes.
  url.searchParams.set('st', '4');
  url.searchParams.set('so', 'desc');
  url.searchParams.set('pt', 'RP;PP;MH;NR');
  url.searchParams.set('ty', String(opts.taxYear ?? WILLIAMSON_ENDPOINTS.cad.defaultTaxYear));

  const doFetch = opts.fetchImpl ?? fetch;

  try {
    const res = await doFetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return { hits: [], recordCount: 0, totalPages: 0, error: `WCAD search returned ${res.status}` };
    }

    const body = (await res.json()) as {
      ResultList?: Array<Record<string, unknown>>;
      RecordCount?: number;
      TotalPageCount?: number;
    };

    const hits = (body.ResultList ?? []).map((r): WcadSearchHit => ({
      propertyQuickRefId: String(r.PropertyQuickRefID ?? '').trim(),
      partyQuickRefId: text(r.PartyQuickRefID),
      propertyNumber: text(r.PropertyNumber),
      ownerName: text(r.OwnerName),
      situsAddress: text(r.SitusAddress),
      taxYear: typeof r.TaxYear === 'number' ? r.TaxYear : null,
    })).filter((h) => h.propertyQuickRefId);

    return {
      hits,
      recordCount: typeof body.RecordCount === 'number' ? body.RecordCount : hits.length,
      totalPages: typeof body.TotalPageCount === 'number' ? body.TotalPageCount : 1,
      error: null,
    };
  } catch (e) {
    // A timeout and a refusal are both "we did not get an answer", and the caller's next move is
    // the same either way. The message is kept so a run log can tell them apart afterwards.
    return {
      hits: [], recordCount: 0, totalPages: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface FindAttempt {
  query: string;
  why: string;
  hits: number;
  error: string | null;
}

export interface FindResult {
  hit: WcadSearchHit | null;
  /** Every query tried, in order, with its result. Goes straight into the run log. */
  attempts: FindAttempt[];
}

/**
 * Drop the street type from an address line.
 *
 * "1007 Cushing Dirve" → "1007 Cushing". This is the move that rescues a typo, and it works for a
 * reason rather than by luck: the misspelling is almost always in the TYPE — Dirve, Streeet, Aveune
 * — because the type is the word people stop reading. A house number and a street name are already
 * unique inside one county, so throwing the type away costs nothing and removes the commonest
 * error in one step.
 *
 * Returns null when there is nothing to drop, so the caller does not repeat a query it just ran.
 */
export function withoutStreetType(line: string): string | null {
  const words = (line ?? '').trim().split(/\s+/);
  // Need at least a number and two more words for there to be a droppable type.
  if (words.length < 3) return null;
  if (!/^\d/.test(words[0]!)) return null;
  const trimmed = words.slice(0, -1).join(' ');
  return trimmed.length > 2 && trimmed !== line.trim() ? trimmed : null;
}

/**
 * Find one property, trying the cheapest honest queries in order.
 *
 * The order is the argument:
 *
 *   1. **What the operator typed.** Right most of the time, and it is what they will recognise.
 *   2. **The same line without its street type.** Free, and it is what turns "1007 Cushing Dirve"
 *      into a hit. Nothing is guessed — a word is removed.
 *   3. **A geocoder's corrected line, if the caller has one.** Tried last because it is the only
 *      step that introduces a word nobody typed. `canonical` is optional for exactly this reason:
 *      a caller with no geocode still gets steps 1 and 2.
 *
 * Stops at the first query that returns anything. Every attempt is reported whether or not it
 * worked, because "we tried three spellings and the county has none of them" and "we never asked"
 * are different findings and only one of them is about the property.
 */
export async function wcadFindProperty(
  typed: string,
  opts: { canonical?: string | null; taxYear?: number; fetchImpl?: typeof fetch } = {},
): Promise<FindResult> {
  const attempts: FindAttempt[] = [];
  const seen = new Set<string>();

  const tries: Array<{ query: string; why: string }> = [];
  const push = (query: string | null | undefined, why: string) => {
    const q = (query ?? '').trim();
    if (!q) return;
    const key = q.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    tries.push({ query: q, why });
  };

  push(typed, 'as the operator typed it');
  push(withoutStreetType(typed), 'without the street type — the word a typo usually lands in');
  if (opts.canonical) {
    const line = opts.canonical.split(',')[0]?.trim() ?? '';
    push(line, 'as a geocoder corrected it');
    push(withoutStreetType(line), 'the corrected line without its street type');
  }

  for (const t of tries) {
    const r = await wcadQuickSearch(t.query, { taxYear: opts.taxYear, fetchImpl: opts.fetchImpl });
    attempts.push({ query: t.query, why: t.why, hits: r.hits.length, error: r.error });
    // A single hit is an answer. Several means the query was too loose to be sure, and picking the
    // first would be a coin toss dressed as a result — the caller is given the attempts and can
    // narrow or ask.
    if (r.hits.length === 1) return { hit: r.hits[0]!, attempts };
    if (r.hits.length > 1) return { hit: null, attempts };
  }

  return { hit: null, attempts };
}

/** Where a person (or a browser) goes to see this property. */
export function wcadDetailUrl(propertyQuickRefId: string, partyQuickRefId?: string | null): string {
  const url = new URL(WILLIAMSON_ENDPOINTS.cad.detail);
  url.searchParams.set('PropertyQuickRefID', propertyQuickRefId);
  if (partyQuickRefId) url.searchParams.set('PartyQuickRefID', partyQuickRefId);
  return url.toString();
}

export interface WcadDetail {
  propertyId: string;
  ownerName: string | null;
  situsAddress: string | null;
  legalDescription: string | null;
  account: string | null;
  mapNumber: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  mailingAddress: string | null;
  exemptions: string | null;
  acres: number | null;
  landSqFt: number | null;
  improvementSqFt: number | null;
  yearBuilt: number | null;
}

/**
 * Read the labelled fields out of the detail page's rendered text.
 *
 * Takes the TEXT, not the HTML, and takes it as a parameter rather than fetching — the page is
 * ASP.NET WebForms with no JSON behind it, so whoever has a browser open should hand the text over
 * rather than this module opening a second one. It also makes every field here testable against a
 * captured page.
 *
 * Labels are matched on their own line because that is how the page lays them out: a label line
 * followed by its value line. Matching label-then-anything would let "Legal Description" pick up
 * the heading two rows down on a parcel where the value is blank.
 */
export function parseWcadDetail(propertyId: string, pageText: string): WcadDetail {
  const lines = String(pageText ?? '').split('\n').map((l) => l.trim());

  const after = (label: string): string | null => {
    const want = label.toUpperCase();
    for (let i = 0; i < lines.length - 1; i += 1) {
      if (lines[i]!.toUpperCase() === want || lines[i]!.toUpperCase() === `${want}:`) {
        // Skip blanks — the page puts an empty row between a label and its value in places.
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
          const v = lines[j]!;
          if (v) return v;
        }
      }
    }
    return null;
  };

  const num = (s: string | null): number | null => {
    if (!s) return null;
    const m = /(-?[\d,]+(?:\.\d+)?)/.exec(s.replace(/\s/g, ''));
    if (!m) return null;
    const n = Number(m[1]!.replace(new RegExp(',', 'g'), ''));
    return Number.isFinite(n) ? n : null;
  };

  // "122,839 Sq. ft / 2.820000 acres" — the acreage is the authoritative one; `Effective Acres` on
  // this page reads 0.000000 even where the land segment says 2.82, so it is deliberately not used.
  const landLine = lines.find((l) => /Sq\.\s*ft\s*\/\s*[\d.]+\s*acres/i.test(l)) ?? '';
  const acresFromLand = /\/\s*([\d.]+)\s*acres/i.exec(landLine);

  const legal = after('Legal Description');
  const acresFromLegal = legal ? /ACRES\s+([\d.]+)/i.exec(legal) : null;

  return {
    propertyId,
    ownerName: after('Owner Name'),
    situsAddress: after('PROPERTY ADDRESS'),
    legalDescription: legal,
    account: after('Account'),
    mapNumber: after('Map Number'),
    neighborhood: after('Neighborhood'),
    propertyType: after('Property Type'),
    mailingAddress: after('Mailing Address'),
    exemptions: after('Exemptions'),
    acres: acresFromLand ? Number(acresFromLand[1]) : acresFromLegal ? Number(acresFromLegal[1]) : null,
    landSqFt: num(landLine),
    improvementSqFt: num(after('Total Main Area (Exterior Measured)')),
    yearBuilt: num(after('YEAR BUILT')),
  };
}

// ── THE OPEN DATA PORTAL ────────────────────────────────────────────────────────────────────────

/**
 * One SODA query.
 *
 * Socrata takes SQL-ish parameters, so the caller passes them whole rather than this wrapping every
 * one in a named argument — `$where` in particular is the entire point of the API and any attempt
 * to model it would be a worse query language than the one that already exists.
 */
export async function wcadData<T = Record<string, unknown>>(
  dataset: string,
  params: Record<string, string | number> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<{ rows: T[]; error: string | null }> {
  const url = new URL(`${WILLIAMSON_ENDPOINTS.data.resource}/${dataset}.json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  try {
    const res = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { rows: [], error: `${dataset} returned ${res.status}` };
    const rows = (await res.json()) as T[];
    return { rows: Array.isArray(rows) ? rows : [], error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export interface WcadSale {
  propertyId: string | null;
  book: string | null;
  page: string | null;
  volume: string | null;
  deedDate: string | null;
  instrumentTypeCode: string | null;
  validity: string | null;
}

/**
 * Every recorded transfer the appraisal district knows about for a property, newest first.
 *
 * **This is the clerk bridge.** Williamson's appraisal data cites deeds by BOOK and PAGE and
 * carries no instrument number at all — the opposite of Bell. A run that looks for an instrument
 * number here finds none and concludes there are no deeds.
 *
 * `propertyId` is the numeric internal id (`145198`), NOT the `R…` quick-ref id. They are
 * different keys and passing the wrong one returns an empty list that looks exactly like a
 * property with no sales history.
 */
export async function wcadSales(
  propertyId: string,
  opts: { limit?: number; certified?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<{ sales: WcadSale[]; error: string | null }> {
  const dataset = opts.certified === false
    ? WILLIAMSON_ENDPOINTS.data.datasets.salesPreliminary
    : WILLIAMSON_ENDPOINTS.data.datasets.salesCertified;

  const { rows, error } = await wcadData<Record<string, unknown>>(dataset, {
    propertyid: propertyId,
    $limit: opts.limit ?? 50,
    $order: 'deeddate DESC',
  }, opts.fetchImpl ?? fetch);

  const sales = rows.map((r): WcadSale => ({
    propertyId: text(r.propertyid),
    book: text(r.book),
    page: text(r.page),
    volume: text(r.volume),
    deedDate: text(r.deeddate),
    instrumentTypeCode: text(r.instrumenttypecode),
    validity: text(r.transfervaliditydesc),
  })).filter((s) => s.book || s.page || s.volume || s.deedDate);

  return { sales, error };
}

export interface WcadSubdivision {
  name: string;
  code: string | null;
  type: string | null;
  acres: number | null;
  lots: number | null;
  filedAt: string | null;
  hasGeometry: boolean;
}

/**
 * Find a platted subdivision by name.
 *
 * Job 26144's run announced "No subdivision name yet … this is a metes-and-bounds parcel" about a
 * property whose legal description reads "VILLAGE GREEN (EXEMPT), LOT 1". It was not a
 * metes-and-bounds parcel; nobody had looked. This is where to look.
 *
 * Matched with `like` on the upper-cased name because the district's own spelling carries suffixes
 * a legal description does not — "VILLAGE GREEN" in the deed is "VILLAGE GREEN SUB" in the dataset.
 */
export async function wcadSubdivision(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ matches: WcadSubdivision[]; error: string | null }> {
  const n = (name ?? '').trim().toUpperCase();
  if (!n) return { matches: [], error: null };

  // Socrata string literals are single-quoted; a quote inside one is doubled.
  const safe = n.replace(new RegExp("'", 'g'), "''");

  const { rows, error } = await wcadData<Record<string, unknown>>(
    WILLIAMSON_ENDPOINTS.data.datasets.subdivisions,
    { $where: `upper(name) like '%${safe}%'`, $limit: 20 },
    fetchImpl,
  );

  const matches = rows.map((r): WcadSubdivision => ({
    name: String(r.name ?? '').trim(),
    code: text(r.scode),
    type: text(r.type),
    acres: typeof r.acres === 'number' ? r.acres : Number(r.acres) || null,
    lots: typeof r.numberlots === 'number' ? r.numberlots : Number(r.numberlots) || null,
    filedAt: text(r.filedate),
    hasGeometry: Boolean(r.geometry),
  })).filter((m) => m.name);

  return { matches, error };
}

/**
 * The subdivision name inside a legal description, or null.
 *
 * "VILLAGE GREEN (EXEMPT), LOT 1, ACRES 2.82" → "VILLAGE GREEN".
 *
 * Takes the text before the first comma and strips a parenthetical, because that is how this
 * district writes them. Returns null for anything that looks like metes and bounds — a description
 * starting with an acreage or an abstract reference is not a platted lot, and handing "18.308 AC
 * GARCIA M SVY ABST 246" to a subdivision search wastes a request and can match something unrelated.
 */
export function subdivisionFromLegal(legal: string | null | undefined): string | null {
  const l = (legal ?? '').trim();
  if (!l) return null;

  // Metes and bounds: "18.308 AC GARCIA M SVY ABST 246", "A0246 GARCIA M, 10.0 ACRES".
  if (/^[\d.]+\s*(AC|ACRE)/i.test(l)) return null;
  if (/^A\d{3,}/i.test(l)) return null;
  if (/\bABST(RACT)?\b/i.test(l) && !/\bLOT\b/i.test(l)) return null;

  const head = l.split(',')[0] ?? '';
  const name = head.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name || name.length < 3) return null;
  // A head that is itself a lot reference is not a subdivision name.
  if (/^(LOT|BLOCK|BLK|TRACT|UNIT)\b/i.test(name)) return null;
  return name.toUpperCase();
}
