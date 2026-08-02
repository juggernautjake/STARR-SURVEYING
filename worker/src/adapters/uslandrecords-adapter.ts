// worker/src/adapters/uslandrecords-adapter.ts — Falls and Robertson (plan R39).
//
// See uslandrecords-discovery.ts for how these were found and what each fact cost. The three
// behaviours that shape this file:
//
//   1. The form submits only on a TRUSTED click. A synthetic one sends no POST at all.
//   2. A too-broad search returns a timeout modal, not an empty result.
//   3. There is no instrument number — a document's identity is its book/volume/page citation.

import { acquireBrowser } from '../lib/browser-factory.js';
import type { BrowserContext } from 'playwright';
import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type ClerkSearchOptions,
  type DocumentImage,
  type DocumentType,
  type PricingInfo,
} from './clerk-adapter.js';
import { USLR_COUNTIES, USLR_FIELDS, coverageWarning, indexBegins, uslrUrl } from './uslandrecords-discovery.js';
import { readResults } from './uslandrecords-results-parser.js';
import { resolveAdapter } from '../infra/adapter-registry.js';

/** Read the results grid: the table holding the most dated rows. */
const READ_GRID = `() => {
  // Score a table by rows that are actually DATA — dated AND carrying several cells. Scoring on
  // "contains a date" alone picks an outer wrapper whose single row holds the whole grid as text,
  // which yields one giant unusable row instead of twenty real ones.
  const dataRows = (t) => Array.from(t.querySelectorAll('tr')).filter(
    (r) => /\\d{1,2}\\/\\d{1,2}\\/\\d{4}/.test(r.textContent || '') && r.querySelectorAll('td').length >= 5,
  );
  const tables = Array.from(document.querySelectorAll('table'));
  let best = null, bestN = 0;
  for (const t of tables) {
    const n = dataRows(t).length;
    if (n > bestN) { bestN = n; best = t; }
  }
  if (!best) return { headers: [], rows: [], reportedRows: null };
  const trs = Array.from(best.querySelectorAll('tr'));
  const headerRow = trs.find((r) => /File Date/i.test(r.textContent || '') && r.querySelectorAll('th,td').length > 3);
  const headers = headerRow ? Array.from(headerRow.querySelectorAll('th,td')).map((c) => (c.textContent || '').trim()) : [];
  // The grid is NOT one <tr> per record. It renders as a single row whose cells run the header
  // labels followed by every record's cells in sequence, so per-<tr> parsing yields exactly one
  // record no matter how many the county returned — which is how a 239-row result set was reported
  // as a single document.
  //
  // So: flatten every cell, then start a new record at each date cell. The date is the first column
  // and the only reliable record boundary.
  const flat = Array.from(best.querySelectorAll('td,th'))
    .filter((c) => c.querySelector('table') === null)      // leaf cells only, never a container
    .map((c) => (c.textContent || '').trim().replace(/\\s+/g, ' '));

  const DATE = /^\\d{1,2}\\/\\d{1,2}\\/\\d{4}$/;
  const rows = [];
  let current = null;
  for (const cell of flat) {
    if (DATE.test(cell)) { if (current) rows.push(current); current = [cell]; }
    else if (current) current.push(cell);
  }
  if (current) rows.push(current);
  const m = document.body.innerText.match(/([\\d,]+)\\s+rows/i);

  // Chunking by date boundary produces POSITIONAL records, so the header row's own indices no
  // longer describe them — the grid's cells are one flat sequence, not a table of rows. The order
  // below is the column order the header row states, and it is asserted against the live header
  // (see \`headerMatchesExpected\`) so a county reordering its grid is caught rather than mis-read.
  const EXPECTED = ['File Date', 'Name/Corporation', 'Book/Vol/Page', 'Pages', 'Type Desc.', 'Type'];
  // The labels sit at some offset inside the flat cell list, so look for the sequence rather than
  // assuming it starts at index 0.
  const lower = headers.map((h) => h.toLowerCase());
  const start = lower.indexOf('file date');
  const headerMatchesExpected = start >= 0 && EXPECTED.every((h, i) => lower[start + i] === h.toLowerCase());

  return { headers: EXPECTED, rows, reportedRows: m ? Number(m[1].replace(/,/g, '')) : null, headerMatchesExpected, liveHeaders: headers };
}`;

export class USLandRecordsAdapter extends ClerkAdapter {
  private baseUrl: string;
  private context: BrowserContext | null = null;
  lastParseSummary: string | null = null;
  /** Set when a search ran outside what the county actually indexes. */
  lastCoverageWarning: string | null = null;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
    const url = uslrUrl(countyName);
    if (!url) {
      throw new Error(
        `[USLandRecords] ${countyName} has no known portal. Known: ${Object.keys(USLR_COUNTIES).join(', ')}. ` +
          `The subdomain is not derivable from the county name — find it from the county's own site.`,
      );
    }
    this.baseUrl = url;
  }

  async initSession(): Promise<void> {
    if (this.browser) return;
    await this.applyRegistryOverrides();

    this.browser = await acquireBrowser({
      adapterId: 'uslandrecords',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });
    if (!this.browser) throw new Error(`[USLandRecords/${this.countyName}] Could not acquire a browser.`);
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1600, height: 1100 },
    });
    this.page = await this.context.newPage();
  }

  private async applyRegistryOverrides(): Promise<void> {
    try {
      const resolved = await resolveAdapter(this.countyName, 'clerk_deeds', {
        county: this.countyName,
        siteType: 'clerk_deeds',
        system: 'uslandrecords_2020',
        baseUrl: this.baseUrl,
        implementation: 'implemented',
      });
      if (resolved.source === 'registry' && resolved.baseUrl) this.baseUrl = resolved.baseUrl;
    } catch {
      /* keep the compiled URL */
    }
  }

  async destroySession(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.page = null;
    this.browser = null;
  }

  private async nameSearch(last: string, first: string): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    const page = this.page!;

    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(
      (n) => !!document.querySelector(`input[name="${n}"]`),
      USLR_FIELDS.lastName,
      { timeout: 45_000, polling: 300 },
    );

    // The advisory callout overlays the Search button; removing it is more reliable than hunting
    // for its close control, which is an unlabelled glyph.
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('[id*=Callout],[class*=allout]'))) el.remove();
    });

    await page.fill(`input[name="${USLR_FIELDS.lastName}"]`, last);
    if (first) await page.fill(`input[name="${USLR_FIELDS.firstName}"]`, first).catch(() => undefined);

    // MUST be a trusted click. page.evaluate(() => el.click()) sends no POST at all — no error, no
    // change, which reads as a broken site rather than an unreal click.
    await page.click('#SearchFormEx1_btnSearch', { timeout: 20_000 });

    // Wait for the RESULTS GRID, not for "a row containing a date".
    //
    // The certification banner ("Certified Date Range: 01/01/1800 thru 07/30/2026") is a dated row
    // that exists before any search runs, so the looser condition was satisfied instantly and the
    // grid was read while still empty — reporting a 239-row result set as "genuinely nothing
    // recorded". A readiness condition that can be met by page furniture manufactures empty answers.
    await page
      .waitForFunction(
        () =>
          /reached the configured timeout period|no records|not found/i.test(document.body.innerText) ||
          /[\d,]+\s+rows/i.test(document.body.innerText) ||
          Array.from(document.querySelectorAll('table')).some(
            (t) => Array.from(t.querySelectorAll('tr')).filter((r) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(r.textContent || '')).length >= 3,
          ),
        undefined,
        { timeout: 75_000, polling: 500 },
      )
      .catch(() => undefined);

    // Then wait for the grid to STOP GROWING. The "239 rows" counter is written before the rows
    // themselves finish rendering, so reading on the counter alone returns whatever happens to be
    // in the DOM — one row out of twenty, reported as if it were the result.
    await page
      .waitForFunction(
        () => {
          const count = Array.from(document.querySelectorAll('table tr')).filter(
            (r) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(r.textContent || '') && r.querySelectorAll('td').length >= 5,
          ).length;
          const w = window as unknown as { __uslrLast?: number; __uslrStable?: number };
          if (w.__uslrLast === count) w.__uslrStable = (w.__uslrStable ?? 0) + 1;
          else { w.__uslrLast = count; w.__uslrStable = 0; }
          // Stable across three consecutive polls, and actually holding rows.
          return count > 0 && (w.__uslrStable ?? 0) >= 3;
        },
        undefined,
        { timeout: 45_000, polling: 500 },
      )
      .catch(() => undefined);

    const grid = (await page.evaluate(`(${READ_GRID})()`)) as { headers: string[]; rows: string[][]; reportedRows: number | null };
    const pageText = await page.evaluate(() => document.body.innerText);

    const outcome = readResults({ ...grid, pageText }, this.countyName);
    this.lastParseSummary = outcome.statement;
    console.log(`[USLandRecords/${this.countyName}] ${outcome.statement}`);

    if (outcome.state === 'too_broad') {
      // Throwing beats returning [] — an empty array here would be recorded as "this name owns
      // nothing in this county", which is the opposite of what the portal said.
      throw new Error(outcome.statement);
    }
    if (outcome.state === 'empty') return [];

    return outcome.documents.map((d) => ({
      instrumentNumber: d.instrumentNumber,
      volumePage: { volume: d.citation.volume, page: d.citation.page },
      documentType: this.classifyDocumentType(d.documentType) as DocumentType,
      recordingDate: d.recordingDate,
      grantors: d.grantors,
      grantees: d.grantees,
      pageCount: d.pageCount ?? undefined,
      source: 'uslandrecords (party list PARTIAL — name search returns only matching parties)',
    }));
  }

  /** Record when a caller asks for years this county never digitised. */
  private noteCoverage(options?: ClerkSearchOptions): void {
    const from = (options as { from?: Date } | undefined)?.from;
    this.lastCoverageWarning = from ? coverageWarning(this.countyName, from) : null;
    if (this.lastCoverageWarning) console.warn(`[USLandRecords/${this.countyName}] ${this.lastCoverageWarning}`);
  }

  async searchByGrantorName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    this.noteCoverage(options);
    const { last, first } = splitName(name);
    // One index covers both roles; the GR/GT column decides the side, so both entry points run the
    // same search and the parser sorts it out.
    return this.nameSearch(last, first);
  }

  async searchByGranteeName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    this.noteCoverage(options);
    const { last, first } = splitName(name);
    return this.nameSearch(last, first);
  }

  async searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]> {
    throw new Error(
      `[USLandRecords/${this.countyName}] This vendor publishes NO instrument numbers — documents are cited by ` +
        `book/volume/page only (asked: ${instrumentNo}). Use searchByVolumePage. Not an empty result.`,
    );
  }

  async searchByVolumePage(volume: string, pg: string): Promise<ClerkDocumentResult[]> {
    // The Book Search tab exists but has not been driven; saying so beats returning [], which would
    // read as "no such document recorded".
    throw new Error(
      `[USLandRecords/${this.countyName}] Book/volume/page search (vol ${volume} pg ${pg}) is NOT implemented — ` +
        `the portal's Book Search tab has not been driven. A missing capability, not an empty result.`,
    );
  }

  async searchByLegalDescription(legalDesc: string): Promise<ClerkDocumentResult[]> {
    throw new Error(
      `[USLandRecords/${this.countyName}] No legal-description search is offered (asked: ${legalDesc.slice(0, 40)}). Not an empty result.`,
    );
  }

  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    throw new Error(
      `[USLandRecords/${this.countyName}] Watermarked viewing is free on this portal but the viewer is not wired up ` +
        `(${instrumentNo}); printing and download are charged. Not "no images".`,
    );
  }

  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    throw new Error(
      `[USLandRecords/${this.countyName}] Pricing for ${instrumentNo}: the portal states $1.00 for the first 10 pages ` +
        `then $0.10/page, but this has not been read off a live cart. Treat as unconfirmed.`,
    );
  }

  /** Exposed so a caller can report the county's real coverage alongside a result. */
  indexBeginsAt(): Date | null {
    return indexBegins(this.countyName);
  }
}

/** Split a search name into the portal's two fields.
 *
 *  The label is "Business/Last Name", so a company goes wholly into the last-name field. Splitting
 *  "FIRST NATIONAL BANK OF MCGREGOR" on its first space would search for a surname of "FIRST". */
export function splitName(name: string): { last: string; first: string } {
  const n = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!n) return { last: '', first: '' };
  const comma = n.indexOf(',');
  if (comma > 0) return { last: n.slice(0, comma).trim(), first: n.slice(comma + 1).trim() };
  return { last: n, first: '' };
}
