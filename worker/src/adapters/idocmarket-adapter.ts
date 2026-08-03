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
    const parts = [`${this.countyName}: ${records.length} record(s) parsed from ${out.records.length} row(s).`];
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

  async searchByLegalDescription(legalDesc: string): Promise<ClerkDocumentResult[]> {
    throw new Error(
      `[iDocMarket/${this.countyName}] Legal-description search EXISTS (StartLot, EndLot, Block, Legal, LegalNotes) ` +
        `but has NOT been driven (asked: ${legalDesc.slice(0, 40)}). An unbuilt capability, not a missing one.`,
    );
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
