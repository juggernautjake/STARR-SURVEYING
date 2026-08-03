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
import {
  USLR_COUNTIES,
  USLR_FIELDS,
  USLR_MAX_PAGES,
  coverageConfidence,
  coverageWarning,
  describeUslrCompleteness,
  indexBegins,
  uslrUrl,
} from './uslandrecords-discovery.js';
import { readResults, type GroupedDocument } from './uslandrecords-results-parser.js';

/** What READ_GRID hands back from the page. */
interface GridRead {
  headers: string[];
  rows: string[][];
  reportedRows: number | null;
  headerMatchesExpected?: boolean;
  liveHeaders?: string[];
}
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
  /** How well this county's coverage is known at all — certified, prose-only, or self-disputed.
   *
   *  Separate from `lastCoverageWarning`, which is about the search that was just run. This is about
   *  the county, and it is set on every search so a report can never present a coverage claim read
   *  off a welcome sentence as if it were a certification. */
  lastCoverageConfidence: string | null = null;

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

    // Ask for 100 rows a page before reading anything.
    //
    // The grid defaults to 20 and offers 20/50/100 as page-size buttons. Raising it is strictly
    // better than walking a pager: fewer round trips, no postback sequencing, and no chance of a
    // record shifting page mid-walk. Robertson's 239-row search drops from 12 pages to 3.
    await this.setPageSize100();

    const firstGrid = (await page.evaluate(`(${READ_GRID})()`)) as GridRead;
    const pageText = await page.evaluate(() => document.body.innerText);

    const outcome = readResults({ ...firstGrid, pageText }, this.countyName);
    if (outcome.state === 'too_broad') {
      // Throwing beats returning [] — an empty array here would be recorded as "this name owns
      // nothing in this county", which is the opposite of what the portal said.
      this.lastParseSummary = outcome.statement;
      console.log(`[USLandRecords/${this.countyName}] ${outcome.statement}`);
      throw new Error(outcome.statement);
    }
    if (outcome.state === 'empty') {
      this.lastParseSummary = outcome.statement;
      console.log(`[USLandRecords/${this.countyName}] ${outcome.statement}`);
      return [];
    }

    return this.readAllPages(firstGrid, outcome.documents);
  }

  /** Switch the grid to 100 rows per page and wait for it to actually reload.
   *
   *  Never throws: if the control is missing the read still happens at 20 a page, and
   *  `describeUslrCompleteness` reports the shortfall rather than hiding it. */
  private async setPageSize100(): Promise<void> {
    const page = this.page!;
    const before = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('table tr')).filter(
          (r) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(r.textContent || '') && r.querySelectorAll('td').length >= 5,
        ).length,
    );
    // 20 rows on screen and 20 available is already everything — no reason to reload.
    if (before === 0) return;

    const clicked = await page
      .click('#DocList1_PageView100Btn', { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!clicked) return;

    // Wait for the row count to grow OR settle; a fixed delay here would read the old 20-row grid.
    await page
      .waitForFunction(
        (prev) => {
          const n = Array.from(document.querySelectorAll('table tr')).filter(
            (r) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(r.textContent || '') && r.querySelectorAll('td').length >= 5,
          ).length;
          const w = window as unknown as { __uslrPS?: number; __uslrPSStable?: number };
          if (w.__uslrPS === n) w.__uslrPSStable = (w.__uslrPSStable ?? 0) + 1;
          else { w.__uslrPS = n; w.__uslrPSStable = 0; }
          return n > prev || (n > 0 && (w.__uslrPSStable ?? 0) >= 4);
        },
        before,
        { timeout: 45_000, polling: 500 },
      )
      .catch(() => undefined);
  }

  /** Walk every page of the grid, not just the first.
   *
   *  The grid serves 20 rows a page and states the rest as a "239 rows" counter. Returning page one
   *  meant answering a 239-row search with 20 documents and nothing marking it short — which reads
   *  as a complete answer, and is the same defect as an empty result wearing a more convincing
   *  disguise.
   *
   *  There is no page-2 URL: the pager is an ASP.NET postback, so paging means clicking through it. */
  private async readAllPages(first: GridRead, firstDocs: GroupedDocument[]): Promise<ClerkDocumentResult[]> {
    const page = this.page!;
    const reported = first.reportedRows;
    const byKey = new Map<string, GroupedDocument>();
    // Key on citation AND date: the citation alone can repeat across series in some counties.
    const keyOf = (d: GroupedDocument) => `${d.instrumentNumber}::${d.recordingDate}`;
    for (const d of firstDocs) byKey.set(keyOf(d), d);

    let pagesRead = 1;
    let rowsSeen = first.rows.length;

    while (pagesRead < USLR_MAX_PAGES) {
      if (reported !== null && rowsSeen >= reported) break;

      const firstCell = first.rows[0]?.[0] ?? '';
      const advanced = await this.clickNextPage(firstCell, rowsSeen);
      if (!advanced) break;

      const grid = (await page.evaluate(`(${READ_GRID})()`)) as GridRead;
      if (grid.rows.length === 0) break;

      const text = await page.evaluate(() => document.body.innerText);
      const next = readResults({ ...grid, pageText: text }, this.countyName);
      pagesRead += 1;
      rowsSeen += grid.rows.length;
      if (next.state !== 'has_results') break;

      // Dedupe across pages — a record shifting page mid-walk would otherwise read as two
      // conveyances of the same land.
      for (const d of next.documents) if (!byKey.has(keyOf(d))) byKey.set(keyOf(d), d);
      first.rows = grid.rows;
    }

    const docs = [...byKey.values()];
    this.lastParseSummary = describeUslrCompleteness(this.countyName, docs.length, rowsSeen, pagesRead, reported);
    console.log(`[USLandRecords/${this.countyName}] ${this.lastParseSummary}`);

    return docs.map((d) => ({
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

  /** Click the pager's Next and wait for the grid's contents to actually change.
   *
   *  Waiting on the first row's text rather than a delay: this pager is an ASP.NET postback with no
   *  page indicator to watch, and reading straight after the click re-reads the page just left —
   *  which yields the same 20 documents again and stops the walk one page in. */
  private async clickNextPage(previousFirstCell: string, _rowsSeen: number): Promise<boolean> {
    const page = this.page!;
    // The pager's Next is `#DocList1_LinkButtonNext`, an ASP.NET postback link. Matching on the
    // text "Next" instead picks up a plain <td> that renders the same word and is not clickable —
    // which fails silently and stops the walk after one page.
    const clicked = await page
      .click('#DocList1_LinkButtonNext', { timeout: 10_000 })
      // A trusted click again — the same synthetic-click trap as the search button itself.
      .then(() => true)
      .catch(() => false);
    if (!clicked) return false;

    // Compare the first genuine DATE CELL in the grid.
    //
    // Not "the first row containing a date": that row is the search-criteria summary ("Date From:
    // 1/1/1800"), which never changes, so the wait could never be satisfied and the walk stopped
    // after one page even though Next had worked. The record's file date is a cell that is EXACTLY
    // a date, which the summary text never is.
    return page
      .waitForFunction(
        (prev) => {
          const cells = Array.from(document.querySelectorAll('td,th'))
            .filter((c) => c.querySelector('table') === null)
            .map((c) => (c.textContent || '').trim());
          const firstDate = cells.find((c) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c));
          return !!firstDate && firstDate !== prev;
        },
        previousFirstCell,
        { timeout: 45_000, polling: 400 },
      )
      .then(() => true)
      .catch(() => false);
  }

  /** Record when a caller asks for years this county never digitised, and how well this county's
   *  coverage is known in the first place. */
  private noteCoverage(options?: ClerkSearchOptions): void {
    const from = (options as { from?: Date } | undefined)?.from;
    this.lastCoverageWarning = from ? coverageWarning(this.countyName, from) : null;
    if (this.lastCoverageWarning) console.warn(`[USLandRecords/${this.countyName}] ${this.lastCoverageWarning}`);

    // Always set, warning or not. Nineteen counties route here now and they are not equally well
    // documented — three publish no certification banner and one contradicts itself — so a run that
    // reported them all in the same voice would be overstating three of them.
    this.lastCoverageConfidence = coverageConfidence(this.countyName);
    if (this.lastCoverageConfidence) console.log(`[USLandRecords/${this.countyName}] ${this.lastCoverageConfidence}`);
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

  /** Capture the free watermarked pages the portal already shows (plan I/S7).
   *
   *  Driven on the live Val Verde viewer 2026-08-03 — see `uslandrecords-viewer.ts` for the DOM and
   *  the three facts that made this look harder than it is: the viewer opens in a NEW TAB, the
   *  render signal is the image `src` token changing rather than any elapsed time, and the pager
   *  renames its Next button instead of disabling it.
   *
   *  Requires a row to have been opened in the results grid first, which is what `openDocument`
   *  does. Throwing rather than returning [] when that has not happened: an empty array here would
   *  read as "this document has no pages". */
  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    if (!this.page || !this.context) {
      throw new Error(
        `[USLandRecords/${this.countyName}] No session open, so ${instrumentNo} could not be viewed. ` +
          `A retrieval failure, not a document without images.`,
      );
    }

    const { CAPTURE_VIEWPORT, USLR_VIEWER, capturePages } = await import('./uslandrecords-viewer.js');

    // The viewer tab is a SECOND page on this context. Waiting for it has to be armed BEFORE the
    // click, or the tab can open and be missed in the gap between the two.
    const viewerPromise = this.context.waitForEvent('page', { timeout: 20_000 }).catch(() => null);
    await this.page.click(USLR_VIEWER.viewerTabSelector, { timeout: 15_000 }).catch(() => undefined);
    const viewer = await viewerPromise;

    if (!viewer) {
      throw new Error(
        `[USLandRecords/${this.countyName}] The image viewer did not open for ${instrumentNo}. The portal ` +
          `serves free watermarked pages, so this is a retrieval failure rather than a document without images.`,
      );
    }

    try {
      // Set the viewport BEFORE the image renders. This portal fits the page to the container and
      // signs those dimensions into the image token, so the render size is decided here and cannot be
      // changed afterwards by editing the URL. At a normal browser size a letter page comes back
      // 304×561 — about 36 DPI, where a bearing label is 2.5 px and simply is not in the image.
      await viewer.setViewportSize({ width: CAPTURE_VIEWPORT.width, height: CAPTURE_VIEWPORT.height }).catch(() => undefined);
      await viewer.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined);
      // Re-render at the new size: the image URL was generated from whatever the container was when
      // the tab opened, and a reload is what makes the portal issue a token for the bigger one.
      await viewer.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);

      const result = await capturePages(viewer, { log: (m) => console.log(m) });
      this.lastParseSummary = result.statement;
      console.log(`[USLandRecords/${this.countyName}] ${result.statement}`);

      if (result.pages.length === 0) {
        // Every stop reason here is about US, not about the document.
        throw new Error(`[USLandRecords/${this.countyName}] ${instrumentNo}: ${result.statement}`);
      }

      return result.pages.map((p) => ({
        instrumentNumber: instrumentNo,
        pageNumber: p.pageNumber,
        totalPages: result.pages.length,
        // Kept in memory rather than written to disk here: the caller decides where a document
        // lives, and this adapter has no download directory of its own.
        imagePath: '',
        imageBase64: p.imageBase64,
        imageUrl: p.sourceUrl,
        width: p.width,
        height: p.height,
        // The portal's own words: free viewing is watermarked; printing and download are charged.
        isWatermarked: true,
        quality: p.width >= 1000 ? 'good' : 'fair',
      } as DocumentImage));
    } finally {
      await viewer.close().catch(() => undefined);
    }
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
