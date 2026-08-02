// lib/research/site-probe.ts — reading an unknown county portal (roadmap §8.3, §8.6).
//
// §8.3: *"for unknown vendors … an agent drives Playwright: open the site, locate the search form,
// submit the test query, identify the result list and detail page, and read the available fields.
// Output: a proposed `config` (selectors/endpoints/flow) + proposed `field_map` onto the canonical
// schema."*
//
// This module is the READING half, and it is pure. Given a structural description of a page — the
// forms, their inputs, the tables and their headers — it proposes which form is the search, which
// input takes the query, which table is the result list, and what each column means in canonical
// terms. `site-probe-runner.ts` is the half that drives a browser to produce that description.
//
// ── WHY THE SPLIT, AND WHY THIS SIDE HAS NO AI IN IT ────────────────────────────────────────────
//
// A probe that is one function calling Playwright and Claude can only be tested against a live
// government website, which means it is tested by running it at somebody's county — repeatedly, at
// whatever hour the test suite runs. §9.9's guardrails exist precisely to stop that. Split, the
// judgement is a pure function over fixtures and the browser work is a thin, flagged shell.
//
// The heuristics below are deliberately dull: name/id/placeholder/label text matched against
// synonym lists a Texas surveyor would recognise. They are not trying to be clever, they are trying
// to be RIGHT ABOUT WHY — every proposal carries the evidence that produced it, because a wrong
// mapping that explains itself is corrected in seconds and a wrong one that does not is trusted.

/** One input inside a form, as the browser saw it. */
export interface CapturedField {
  /** A selector that will re-find this element on a later visit. */
  selector: string;
  tag: string;
  type: string | null;
  name: string | null;
  id: string | null;
  placeholder: string | null;
  /** Visible label text, if the capture could associate one. */
  label: string | null;
}

export interface CapturedForm {
  selector: string;
  method: string | null;
  action: string | null;
  fields: CapturedField[];
  submitSelector: string | null;
}

export interface CapturedTable {
  selector: string;
  headers: string[];
  rowCount: number;
  /** First data row, used to sanity-check a header guess against real content. */
  sampleRow: string[];
  /** Selector of the first link inside the first data row, if any — the detail-page path. */
  firstRowLinkSelector: string | null;
}

export interface PageCapture {
  url: string;
  title: string;
  forms: CapturedForm[];
  tables: CapturedTable[];
  /** True when the page paints its records into a canvas or an image — OCR territory, not DOM. */
  hasCanvas: boolean;
  /** Visible text, truncated. Used only for evidence, never parsed for data. */
  textSample: string;
}

export type ProbeConfidence = 'high' | 'medium' | 'low' | 'none';

export interface ProbeProposal {
  /** How to search. Null when no plausible search form was found. */
  search: {
    formSelector: string;
    querySelector: string;
    /** What the query field appears to take — drives which canary makes sense. */
    queryKind: 'address' | 'parcel_id' | 'owner' | 'unknown';
    submitSelector: string | null;
  } | null;
  /** Where results land. Null when the page shows no result-shaped table. */
  results: {
    tableSelector: string;
    detailLinkSelector: string | null;
    /** Column index → canonical path. Only columns we could name. */
    columns: Array<{ index: number; header: string; canonicalPath: string }>;
  } | null;
  confidence: ProbeConfidence;
  /** Why the proposal says what it says. Shown to the person confirming it. */
  evidence: string[];
  /** What a person must check or fill in before this can be trusted. */
  warnings: string[];
}

// ── Synonyms ────────────────────────────────────────────────────────────────────────────────────
//
// Ordered most-specific first: "owner name" must not be claimed by the "name" rule, and "situs
// address" must beat plain "address" when both could match.

const QUERY_SYNONYMS: Array<{ kind: 'address' | 'parcel_id' | 'owner'; patterns: RegExp[] }> = [
  { kind: 'parcel_id', patterns: [/\b(parcel|prop(erty)?[_\s-]?id|quickref|geo[_\s-]?id|account|acct|pin)\b/i] },
  { kind: 'address', patterns: [/\b(situs|street|address|addr|location)\b/i] },
  { kind: 'owner', patterns: [/\b(owner|name|taxpayer)\b/i] },
];

const COLUMN_SYNONYMS: Array<{ path: string; patterns: RegExp[] }> = [
  { path: 'parcel_id', patterns: [/\b(parcel|prop(erty)?\s*id|quickref|geo\s*id|account|acct|pin)\b/i] },
  { path: 'owner.name', patterns: [/\bowner\b/i, /\btaxpayer\b/i] },
  { path: 'situs_address.line1', patterns: [/\bsitus\b/i, /\bproperty address\b/i, /\blocation\b/i] },
  { path: 'mailing_address.line1', patterns: [/\bmailing\b/i] },
  { path: 'legal.description', patterns: [/\blegal\b/i, /\bdescription\b/i, /\babstract\b/i, /\bsubdivision\b/i] },
  { path: 'acreage', patterns: [/\bacre/i, /\bland size\b/i, /\barea\b/i] },
  { path: 'valuation.market_value', patterns: [/\bmarket\b/i, /\bappraised\b/i, /\bassessed\b/i, /\bvalue\b/i] },
  { path: 'county_fips', patterns: [/\bcounty\b/i] },
];

function haystack(f: CapturedField): string {
  return [f.name, f.id, f.placeholder, f.label].filter(Boolean).join(' ');
}

/** Does this form look like a search rather than a login, a newsletter or a filter? */
function scoreSearchForm(form: CapturedForm): { score: number; why: string[] } {
  const why: string[] = [];
  let score = 0;
  const text = form.fields.map(haystack).join(' ').toLowerCase();

  // A password field is decisive in the other direction: this is a sign-in, and probing it would
  // mean submitting a query into somebody's login form.
  if (form.fields.some((f) => (f.type ?? '').toLowerCase() === 'password')) {
    return { score: -100, why: ['Has a password field — this is a sign-in form, not a search.'] };
  }

  for (const { kind, patterns } of QUERY_SYNONYMS) {
    if (patterns.some((p) => p.test(text))) { score += 3; why.push(`A field mentions ${kind.replace('_', ' ')}.`); }
  }
  if (/\bsearch\b/i.test(text) || /search/i.test(form.action ?? '')) { score += 2; why.push('The form or its action says "search".'); }
  if (form.fields.some((f) => (f.type ?? 'text') === 'search')) { score += 2; why.push('It has an input of type="search".'); }
  // A form with one visible text input is usually the site search; a form with fifteen is a filter
  // panel, which is still usable but is not where a one-line canary goes.
  const textFields = form.fields.filter((f) => ['text', 'search', null].includes(f.type as never));
  if (textFields.length === 1) { score += 1; why.push('It has exactly one text input.'); }
  if (textFields.length === 0) { score -= 5; why.push('It has no text input at all.'); }
  if (form.submitSelector) { score += 1; why.push('It has a submit control.'); }
  return { score, why };
}

function classifyQueryField(f: CapturedField): 'address' | 'parcel_id' | 'owner' | 'unknown' {
  const text = haystack(f);
  for (const { kind, patterns } of QUERY_SYNONYMS) {
    if (patterns.some((p) => p.test(text))) return kind;
  }
  return 'unknown';
}

function classifyColumn(header: string): string | null {
  for (const { path, patterns } of COLUMN_SYNONYMS) {
    if (patterns.some((p) => p.test(header))) return path;
  }
  return null;
}

/** Pure. Propose how to drive this portal, and say why. */
export function proposeFromCapture(capture: PageCapture): ProbeProposal {
  const evidence: string[] = [];
  const warnings: string[] = [];

  // ── The search form ──
  const ranked = capture.forms
    .map((form) => ({ form, ...scoreSearchForm(form) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0] && ranked[0].score > 0 ? ranked[0] : null;

  let search: ProbeProposal['search'] = null;
  if (best) {
    // The query field is the highest-signal text input, not simply the first: county portals
    // routinely put a "tax year" select before the address box.
    const candidates = best.form.fields.filter((f) => ['text', 'search', null, undefined].includes(f.type as never));
    const scored = candidates
      .map((f) => ({ f, kind: classifyQueryField(f) }))
      .sort((a, b) => (a.kind === 'unknown' ? 1 : 0) - (b.kind === 'unknown' ? 1 : 0));
    const chosen = scored[0];
    if (chosen) {
      search = {
        formSelector: best.form.selector,
        querySelector: chosen.f.selector,
        queryKind: chosen.kind,
        submitSelector: best.form.submitSelector,
      };
      evidence.push(...best.why);
      if (!best.form.submitSelector) {
        warnings.push('No submit button was found — the form may need Enter, which the probe cannot confirm without submitting it.');
      }
      if (chosen.kind === 'unknown') {
        warnings.push('The search box does not say what it takes. Try the test property both as an address and as a parcel number.');
      }
    }
  } else {
    warnings.push('No search form was recognised. This portal may search from a link, a map, or a page behind a menu.');
  }

  // ── The result list ──
  //
  // The widest table with more than one row. County portals wrap layout in tables too, and the
  // layout ones are one row of two cells; the results one has headers a surveyor would recognise,
  // which is what the column scoring below actually measures.
  let results: ProbeProposal['results'] = null;
  const tableCandidates = capture.tables
    .filter((t) => t.rowCount > 0 && t.headers.length >= 2)
    .map((t) => {
      const columns = t.headers
        .map((h, index) => ({ index, header: h, canonicalPath: classifyColumn(h) }))
        .filter((c): c is { index: number; header: string; canonicalPath: string } => !!c.canonicalPath);
      return { table: t, columns };
    })
    .sort((a, b) => b.columns.length - a.columns.length || b.table.headers.length - a.table.headers.length);

  const bestTable = tableCandidates[0];
  if (bestTable && bestTable.columns.length > 0) {
    results = {
      tableSelector: bestTable.table.selector,
      detailLinkSelector: bestTable.table.firstRowLinkSelector,
      columns: bestTable.columns,
    };
    evidence.push(
      `A table has ${bestTable.columns.length} column(s) we recognise: ${bestTable.columns.map((c) => `${c.header} → ${c.canonicalPath}`).join(', ')}.`,
    );
    if (!bestTable.table.firstRowLinkSelector) {
      warnings.push('No link was found in the first result row, so the detail page cannot be reached automatically.');
    }
    // Naming a column is a guess about a header, not a reading of the data. Said plainly, because
    // this is the mapping most likely to be wrong in a way that looks right.
    warnings.push('Column meanings are guessed from the header text. Check each one against the live page before saving.');
  } else if (capture.tables.length > 0) {
    warnings.push('Tables were found, but none of their headers looked like property fields.');
  } else {
    warnings.push('No result table was found. The portal may render results as cards, or only after a search runs.');
  }

  if (capture.hasCanvas) {
    // §8.3 explicitly anticipates these: "DOM + OCR for canvas/image-rendered portals".
    warnings.push('Part of this page is drawn to a canvas or an image, so some records may be readable only by OCR, not by selectors.');
  }

  return { search, results, confidence: gradeConfidence(search, results, warnings), evidence, warnings };
}

function gradeConfidence(
  search: ProbeProposal['search'],
  results: ProbeProposal['results'],
  warnings: string[],
): ProbeConfidence {
  if (!search && !results) return 'none';
  if (search && results && results.columns.length >= 3 && search.queryKind !== 'unknown') {
    // Even the best case is capped by the fact that nothing has been SUBMITTED. A high-confidence
    // proposal here means "this is very likely the right shape", never "this works".
    return warnings.length <= 2 ? 'high' : 'medium';
  }
  if (search || (results && results.columns.length >= 2)) return 'medium';
  return 'low';
}

/** Turn an accepted proposal into the `config` a bespoke `browser_playwright` adapter runs on (§8.6).
 *
 *  Kept separate from the proposal so that what a person confirmed and what gets stored are the same
 *  object, transformed once. A UI that assembled this itself would be a second place the flow shape
 *  is decided. */
export function configFromProposal(proposal: ProbeProposal, baseUrl: string): Record<string, unknown> {
  return {
    access_method: 'browser_playwright',
    base_url: baseUrl,
    flow: {
      // Recorded as steps rather than as a bag of selectors: the order is the part a later repair
      // (§9) has to reason about, and a bag loses it.
      steps: [
        { action: 'goto', url: baseUrl },
        ...(proposal.search
          ? [
              { action: 'fill', selector: proposal.search.querySelector, value: '{query}' },
              proposal.search.submitSelector
                ? { action: 'click', selector: proposal.search.submitSelector }
                : { action: 'press', selector: proposal.search.querySelector, key: 'Enter' },
            ]
          : []),
        ...(proposal.results ? [{ action: 'wait_for', selector: proposal.results.tableSelector }] : []),
        ...(proposal.results?.detailLinkSelector
          ? [{ action: 'click', selector: proposal.results.detailLinkSelector }]
          : []),
      ],
    },
    query_kind: proposal.search?.queryKind ?? 'unknown',
    result_table: proposal.results?.tableSelector ?? null,
    // Every probed adapter is born needing a human pass. Recorded IN the config so the fact travels
    // with the adapter rather than living in whoever-remembers.
    probe: { confidence: proposal.confidence, warnings: proposal.warnings, probed_at: '{now}' },
  };
}

/** The proposal's column guesses, as the `field_map` shape the registry stores (§7.5). */
export function fieldMapFromProposal(proposal: ProbeProposal): Record<string, unknown> {
  return {
    vendor_key: 'generic_playwright',
    version: 'probe-1',
    mappings: (proposal.results?.columns ?? []).map((c) => ({
      from_path: `row[${c.index}]`,
      to_path: c.canonicalPath,
      transform: c.canonicalPath === 'acreage' ? 'number' : 'trim',
      confidence: 'probed',
    })),
  };
}
