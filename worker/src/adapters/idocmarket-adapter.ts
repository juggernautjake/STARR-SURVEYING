// worker/src/adapters/idocmarket-adapter.ts — Bosque's modern index (plan R39).
//
// iDocMarket is the land-records product behind iDocket, found while re-probing the latter. Its
// Basic Search opens with NO login. Seven Texas counties; only Bosque is inside the 80-mile ring.
//
// ── THIS VENDOR IS THE EASY ONE, AND IT IS WORTH SAYING WHY ─────────────────────────────────────
//
// Every other vendor in this build hid its data behind something: Kofile's department codes, Tyler's
// per-deployment search IDs and card layout, Avenu's flat cell sequence and trusted-click
// requirement, Aumentum's zero-size button and watermark field. Each cost a wrong answer before it
// cost a fix.
//
// iDocMarket marks up its results properly:
//
//     div.row.result-item
//       .doc-title                    [aria-label="Instrument: AFFIDAVIT"]
//       span[sort-desc=docnum]        [aria-label="Document Number: 2025-00232"]
//       p                             [aria-label="Record Date: 1/24/2025"]
//       .full-parties
//         .party-line.grantor-line > .party-value
//         .party-line.grantee-line > .party-value
//
// The party ROLES are in the class names. Nothing has to be inferred from position, marker letters
// or a summary string — which is why this adapter has no trap comments and the others are full of
// them.
//
// ── AND IT TRUNCATES HONESTLY ───────────────────────────────────────────────────────────────────
//
// "Showing: 1000 of 3639 results" states both numbers, so a shortfall is exact rather than
// suspected. See describeShowing() in remaining-counties-survey.ts.

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
  IDOCMARKET_TX_COUNTIES,
  bosqueGapWarning,
  describeShowing,
  idocMarketSearchUrl,
  parseShowing,
} from './remaining-counties-survey.js';
import { resolveAdapter } from '../infra/adapter-registry.js';

/** Read the result rows. The markup is well-classed, so this reads fields rather than guessing. */
const READ_ROWS = `() => {
  const text = (el) => (el ? (el.textContent || '').trim().replace(/\\s+/g, ' ') : '');
  const rows = Array.from(document.querySelectorAll('div.row.result-item'));
  return {
    // Guarded: the search triggers a full navigation, and evaluating mid-navigation finds a null
    // body. Reading "" there would have been parsed as a page stating no result count.
    pageText: document.body ? document.body.innerText : '',
    records: rows.map((r) => ({
      documentType: text(r.querySelector('.doc-title')),
      instrumentNumber: text(r.querySelector('[sort-desc=docnum]')).replace(/^#/, ''),
      recordingDate: (r.querySelector('p[aria-label^="Record Date"]')?.getAttribute('aria-label') || '').replace(/^Record Date:\\s*/i, '').trim(),
      grantors: Array.from(r.querySelectorAll('.full-parties .grantor-line .party-value')).map((e) => text(e)).filter(Boolean),
      grantees: Array.from(r.querySelectorAll('.full-parties .grantee-line .party-value')).map((e) => text(e)).filter(Boolean),
    })),
  };
}`;

export interface IDocMarketRecord {
  documentType: string;
  instrumentNumber: string;
  recordingDate: string;
  grantors: string[];
  grantees: string[];
}

/** Keep only records that can actually identify a document. */
export function usableRecords(records: IDocMarketRecord[]): IDocMarketRecord[] {
  return records.filter((r) => r.instrumentNumber && r.recordingDate);
}

export type SubdivisionMatch =
  | { kind: 'exact'; value: string }
  | { kind: 'near_miss'; candidates: string[] }
  | { kind: 'free_form' };

/** Decide how a legal-description term should be searched.
 *
 *  Pure, and separated from the browser, because the near-miss case is the one that matters and it
 *  must be testable. A term that looks like a subdivision but is not in the county's list would,
 *  searched free-form, return nothing — and that nothing reads as "no documents touch this land"
 *  when it actually means "this county has no subdivision by that name". Those are different
 *  answers and only one of them is true. */
export function matchSubdivision(term: string, subdivisions: string[]): SubdivisionMatch {
  const t = (term ?? '').trim().toLowerCase();
  if (!t) return { kind: 'free_form' };

  const exact = subdivisions.find((s) => s.trim().toLowerCase() === t);
  if (exact) return { kind: 'exact', value: exact };

  const near = subdivisions.filter((s) => s.trim().toLowerCase().includes(t)).slice(0, 8);
  if (near.length > 0) return { kind: 'near_miss', candidates: near };

  // Nothing resembles it, so the caller genuinely meant free-form text.
  return { kind: 'free_form' };
}

export class IDocMarketAdapter extends ClerkAdapter {
  private searchUrl: string;
  private context: BrowserContext | null = null;
  lastParseSummary: string | null = null;
  lastCoverageWarning: string | null = null;
  /** True when the portal said it returned fewer results than it found. */
  lastResultTruncated = false;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
    const url = idocMarketSearchUrl(countyName);
    if (!url) {
      throw new Error(
        `[iDocMarket] ${countyName} is not an iDocMarket county. Known: ${Object.keys(IDOCMARKET_TX_COUNTIES).join(', ')}.`,
      );
    }
    this.searchUrl = url;
  }

  async initSession(): Promise<void> {
    if (this.browser) return;
    await this.applyRegistryOverrides();

    this.browser = await acquireBrowser({
      adapterId: 'idocmarket',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });
    if (!this.browser) throw new Error(`[iDocMarket/${this.countyName}] Could not acquire a browser.`);
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
        system: 'idocmarket',
        baseUrl: this.searchUrl,
        implementation: 'implemented',
      });
      if (resolved.source === 'registry' && /idocmarket/i.test(resolved.baseUrl ?? '')) this.searchUrl = resolved.baseUrl!;
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

  private async partySearch(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    const page = this.page!;

    // Bosque's two free indexes do not meet: QuickLink ends 1905, this one begins 2012. A search in
    // the hole between them returns nothing from BOTH, which looks like a thorough search.
    const from = (options as { from?: Date } | undefined)?.from;
    this.lastCoverageWarning = from && this.countyName === 'Bosque' ? bosqueGapWarning(from.getFullYear()) : null;
    if (this.lastCoverageWarning) console.warn(`[iDocMarket/${this.countyName}] ${this.lastCoverageWarning}`);

    await page.goto(this.searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('#PartyName', { timeout: 30_000 });
    // The page re-initialises its form after DOMContentLoaded and CLEARS the inputs. Filling before
    // that finishes leaves the field empty, and an empty party field does not fail — it searches the
    // ENTIRE county index. That returned 182,715 Bosque records for a name search, none of them
    // matching the name, which is a wrong answer wearing a very large number.
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);

    await page.fill('#PartyName', name);

    // Verify it took. Submitting an empty term is the failure above; refusing is cheap.
    const typed = await page.inputValue('#PartyName').catch(() => '');
    if (typed.trim() !== name.trim()) {
      throw new Error(
        `[iDocMarket/${this.countyName}] The party field did not hold the search term (wanted "${name}", got "${typed}"). ` +
          `Refusing to submit: an empty party field searches the WHOLE county index and returns tens of thousands of ` +
          `unrelated records that look like results.`,
      );
    }

    return this.submitAndRead(`party="${name}"`, options);
  }

  /** Submit whatever criteria are already filled in, then read and report the results.
   *
   *  Shared by every search so the completeness reporting cannot drift between them — the party
   *  search and the legal-description search must describe a truncated result identically. */
  private async submitAndRead(criteria: string, _options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    const page = this.page!;

    // The submit control is the LAST element in the form. Matching the first control labelled
    // "search" lands on the date picker's own buttons, and the search never runs.
    const submit = page.locator('#SearchForm input.btn-primary[value="Search"]');
    await submit.scrollIntoViewIfNeeded();
    await submit.click({ timeout: 25_000 });

    // The search navigates, so wait for the new document to settle before asking it anything.
    await page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => undefined);
    await page
      .waitForFunction(
        () => {
          const t = document.body?.innerText ?? '';
          return /Showing:\s*[\d,]+\s*of\s*[\d,]+\s*results/i.test(t) || /no results|no documents/i.test(t);
        },
        undefined,
        { timeout: 70_000, polling: 500 },
      )
      .catch(() => undefined);

    const out = (await page.evaluate(`(${READ_ROWS})()`)) as { pageText: string; records: IDocMarketRecord[] };
    const records = usableRecords(out.records);

    const showing = parseShowing(out.pageText);
    this.lastResultTruncated = showing?.truncated ?? false;
    const parts = [`${this.countyName}: ${criteria} → ${records.length} record(s) parsed from ${out.records.length} row(s).`];
    const shown = describeShowing(this.countyName, out.pageText);
    if (shown) parts.push(shown);
    else parts.push('The portal stated no result count, so completeness is UNKNOWN.');
    this.lastParseSummary = parts.join(' ');
    console.log(`[iDocMarket/${this.countyName}] ${this.lastParseSummary}`);

    return records.map((r) => ({
      instrumentNumber: r.instrumentNumber,
      documentType: this.classifyDocumentType(r.documentType) as DocumentType,
      recordingDate: r.recordingDate,
      grantors: r.grantors,
      grantees: r.grantees,
      source: 'idocmarket',
    }));
  }

  // The party index covers both roles and the markup labels each line, so both entry points run the
  // same search.
  async searchByGrantorName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.partySearch(name, options);
  }

  async searchByGranteeName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.partySearch(name, options);
  }

  async searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]> {
    throw new Error(
      `[iDocMarket/${this.countyName}] Instrument-number search is NOT implemented (asked: ${instrumentNo}). ` +
        `The form carries StartDocNumber/EndDocNumber and they have not been driven. Not an empty result.`,
    );
  }

  async searchByVolumePage(volume: string, pg: string): Promise<ClerkDocumentResult[]> {
    throw new Error(
      `[iDocMarket/${this.countyName}] Book/page search is NOT implemented (vol ${volume} pg ${pg}). ` +
        `The form carries VolCert, Book and Page and they have not been driven. Not an empty result.`,
    );
  }

  /** Every subdivision the county's index knows, straight from the form's own dropdown.
   *
   *  A controlled vocabulary, which is unusual and useful: it means "is there a subdivision called
   *  X in this county" is answerable exactly, instead of being inferred from a search returning
   *  nothing. Bosque lists 397. */
  async listSubdivisions(): Promise<string[]> {
    await this.initSession();
    const page = this.page!;
    await page.goto(this.searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('#Subdivision', { timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);

    return (await page.evaluate(() => {
      const s = document.getElementById('Subdivision') as HTMLSelectElement | null;
      if (!s) return [];
      return Array.from(s.options).map((o) => o.value.trim()).filter(Boolean);
    })) as string[];
  }

  /** Search by legal description.
   *
   *  Two different searches hide behind one method, and the difference matters:
   *
   *    - A term matching a SUBDIVISION in the county's dropdown is searched exactly, via that
   *      dropdown. This is the surveyor's normal case and the most reliable path.
   *    - Anything else goes to the free-form `Legal` field.
   *
   *  The trap is in between. If a caller passes something that LOOKS like a subdivision but is not
   *  in the county's list, the free-form search returns nothing — and that nothing reads as "no
   *  documents touch this land" when it actually means "this county has no subdivision by that
   *  name". So an unmatched term is reported with the near misses rather than silently searched
   *  free-form and answered with zero. */
  async searchByLegalDescription(legalDesc: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    // Checked BEFORE opening a browser: an empty criterion searches the whole county index, and
    // refusing costs nothing.
    const term = (legalDesc ?? '').trim();
    if (!term) throw new Error(`[iDocMarket/${this.countyName}] Empty legal description — refusing to search the whole index.`);

    await this.initSession();
    const page = this.page!;

    const match = matchSubdivision(term, await this.listSubdivisions());

    if (match.kind === 'near_miss') {
      throw new Error(
        `[iDocMarket/${this.countyName}] "${term}" is not an exact subdivision in this county's index, but ` +
          `${match.candidates.length} similar name(s) exist: ${match.candidates.join(', ')}. Searching free-form would ` +
          `return nothing and that nothing would read as "no documents touch this land". Pick one of the above, or pass ` +
          `a genuine free-form legal description.`,
      );
    }
    const exact = match.kind === 'exact' ? match.value : null;

    // From here the search is honest either way: an exact subdivision, or free-form text the caller
    // meant as free-form.
    await page.goto(this.searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('#Subdivision', { timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);

    if (exact) await page.selectOption('#Subdivision', exact);
    else await page.fill('#Legal', term);

    const held = exact ? await page.inputValue('#Subdivision') : await page.inputValue('#Legal');
    if (held.trim().toLowerCase() !== (exact ?? term).toLowerCase()) {
      throw new Error(
        `[iDocMarket/${this.countyName}] The legal-description field did not hold "${exact ?? term}" (got "${held}"). ` +
          `Refusing to submit: an empty criterion searches the WHOLE county index.`,
      );
    }

    return this.submitAndRead(`legal="${exact ?? term}"${exact ? ' (exact subdivision)' : ' (free-form)'}`, options);
  }

  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    throw new Error(
      `[iDocMarket/${this.countyName}] Images for ${instrumentNo} open through viewDoc() with an opaque token and are ` +
        `charged on this vendor. Not wired up, and not "no images".`,
    );
  }

  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    throw new Error(
      `[iDocMarket/${this.countyName}] Pricing for ${instrumentNo}: the county page quotes $5/day + $1/page, but that has ` +
        `not been confirmed against a live cart. Treat as unconfirmed.`,
    );
  }
}
