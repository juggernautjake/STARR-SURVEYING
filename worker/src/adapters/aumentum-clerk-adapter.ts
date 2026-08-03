// worker/src/adapters/aumentum-clerk-adapter.ts — Bastrop, on Harris/Aumentum (plan R39).
//
// The fourth vendor found in this build. See remaining-counties-survey.ts for the hunt; the two
// behaviours that shape this file are both invisible from outside, and both produce exactly the
// symptom of a county with no records — a form that submits and returns nothing:
//
//   1. The Search button is a 0x0 <input> with z-index -1. The clickable surface is a <td> whose id
//      is the input's id plus `__5`.
//   2. The party field is a WATERMARK textbox. Its value is literally "Lastname Firstname" until a
//      focus handler clears it; page.fill() leaves the watermark in place and the server answers
//      "Please enter search criteria."

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
import { BASTROP_TRAPS, REMAINING_COUNTY_SURVEY, freePathWarning } from './remaining-counties-survey.js';
import { AUMENTUM_RESULT_CAP, describeParse, parseResults } from './aumentum-results-parser.js';
import { resolveAdapter } from '../infra/adapter-registry.js';

/** Counties on this vendor whose search has been driven. Bastrop only, so far. */
export const AUMENTUM_COUNTIES: Record<string, { fips: string; baseUrl: string }> = {
  Bastrop: { fips: '48021', baseUrl: 'http://www.cc.co.bastrop.tx.us' },
};

export function aumentumBaseUrl(county: string): string | null {
  return AUMENTUM_COUNTIES[county.replace(/\s+county$/i, '').trim()]?.baseUrl ?? null;
}

/** Flatten the results grid to leaf cells, which is what the parser cuts at date boundaries. */
const READ_GRID = `() => {
  const t = document.getElementById('Table1');
  if (!t) return { cells: [], pageText: document.body.innerText };
  const cells = Array.from(t.querySelectorAll('td,th'))
    .filter((c) => c.querySelector('table') === null)
    .map((c) => (c.textContent || '').trim().replace(/\\s+/g, ' '));
  return { cells, pageText: document.body.innerText };
}`;

export class AumentumClerkAdapter extends ClerkAdapter {
  private baseUrl: string;
  private context: BrowserContext | null = null;
  lastParseSummary: string | null = null;
  lastCoverageWarning: string | null = null;
  /** True when the last search hit the portal's row cap, so the answer is partial by an unknown amount. */
  lastResultTruncated = false;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
    const url = aumentumBaseUrl(countyName);
    if (!url) {
      throw new Error(
        `[Aumentum] ${countyName} is not a driven Aumentum county. Known: ${Object.keys(AUMENTUM_COUNTIES).join(', ')}.`,
      );
    }
    this.baseUrl = url;
  }

  async initSession(): Promise<void> {
    if (this.browser) return;
    await this.applyRegistryOverrides();

    this.browser = await acquireBrowser({
      adapterId: 'aumentum-clerk',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });
    if (!this.browser) throw new Error(`[Aumentum/${this.countyName}] Could not acquire a browser.`);
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1600, height: 1100 },
    });
    this.page = await this.context.newPage();

    // Everything past this point is served to "Visitor"; the disclaimer sets that up.
    await this.page.goto(`${this.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await this.page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a,button')).find((x) =>
        /acknowledge|disclaimer/i.test(x.textContent || ''),
      ) as HTMLElement | undefined;
      a?.click();
    });
    await this.page
      .waitForFunction(() => /Welcome Visitor/i.test(document.body.innerText), undefined, { timeout: 30_000, polling: 300 })
      .catch(() => undefined);
  }

  private async applyRegistryOverrides(): Promise<void> {
    try {
      const resolved = await resolveAdapter(this.countyName, 'clerk_deeds', {
        county: this.countyName,
        siteType: 'clerk_deeds',
        system: 'harris_aumentum',
        baseUrl: this.baseUrl,
        implementation: 'implemented',
      });
      if (resolved.source === 'registry' && resolved.baseUrl) {
        this.baseUrl = resolved.baseUrl.replace(/\/RealEstate\/.*$/, '').replace(/\/+$/, '');
      }
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

    // Warn when the caller asks for years this county never digitised. Bastrop starts at 1973.
    const from = (options as { from?: Date } | undefined)?.from;
    this.lastCoverageWarning = from ? freePathWarning(this.countyName, from.getFullYear()) : null;
    if (this.lastCoverageWarning) console.warn(`[Aumentum/${this.countyName}] ${this.lastCoverageWarning}`);

    await page.goto(`${this.baseUrl}/RealEstate/SearchEntry.aspx`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector(BASTROP_TRAPS.partyField, { timeout: 30_000 });

    // WATERMARK FIELD: click to focus (which clears it), select-all, delete, then TYPE real keys.
    // page.fill() sets .value without firing the focus handler, so the watermark survives and the
    // server rejects the search with "Please enter search criteria." — a message that never reaches
    // a scraper reading only the results area.
    const field = page.locator(BASTROP_TRAPS.partyField);
    await field.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await field.type(name, { delay: 60 });

    const typed = await field.inputValue();
    if (typed.trim().toLowerCase() === BASTROP_TRAPS.partyWatermark.toLowerCase() || !typed.trim()) {
      throw new Error(
        `[Aumentum/${this.countyName}] The party field still holds its watermark ("${typed}") — the search term did not take. ` +
          `Refusing to submit: the portal would answer "${BASTROP_TRAPS.watermarkValidation}" and an empty result would read as "no records".`,
      );
    }

    // ZERO-SIZE BUTTON: the <input> is 0x0 with z-index -1 and cannot be clicked. Aumentum renders
    // buttons as table composites; the clickable surface is the <td> named <inputId>__5.
    await page.click(BASTROP_TRAPS.searchButtonSelector, { timeout: 25_000 });

    await page
      .waitForFunction(
        () => /SearchResults/i.test(location.href) || /no records|no match|Please enter search criteria/i.test(document.body.innerText),
        undefined,
        { timeout: 75_000, polling: 500 },
      )
      .catch(() => undefined);

    const pageText = await page.evaluate(() => document.body.innerText);
    if (new RegExp(BASTROP_TRAPS.watermarkValidation, 'i').test(pageText)) {
      throw new Error(
        `[Aumentum/${this.countyName}] The portal rejected the search ("${BASTROP_TRAPS.watermarkValidation}"). ` +
          `This is a malformed query, NOT an empty index.`,
      );
    }

    // Wait for the grid itself, not merely for the URL to change. SearchResults.aspx renders its
    // shell before #Table1 is populated, and reading in between returns zero cells — which the
    // parser would faithfully report as zero records.
    await page
      .waitForFunction(
        () => {
          const t = document.getElementById('Table1');
          if (!t) return false;
          return Array.from(t.querySelectorAll('td')).some((c) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test((c.textContent || '').trim()));
        },
        undefined,
        { timeout: 60_000, polling: 500 },
      )
      .catch(() => undefined);

    const grid = (await page.evaluate(`(${READ_GRID})()`)) as { cells: string[]; pageText: string };
    const report = parseResults(grid.cells, grid.pageText);
    this.lastParseSummary = describeParse(report, this.countyName);
    this.lastResultTruncated = report.capped;
    console.log(`[Aumentum/${this.countyName}] ${this.lastParseSummary}`);
    if (report.capped) console.warn(`[Aumentum/${this.countyName}] RESULT TRUNCATED at the portal's ${AUMENTUM_RESULT_CAP}-row cap.`);

    return report.rows.map((r) => ({
      instrumentNumber: r.instrumentNumber,
      volumePage: r.book && r.page ? { volume: r.book, page: r.page } : undefined,
      documentType: this.classifyDocumentType(r.documentType) as DocumentType,
      recordingDate: r.recordingDate,
      grantors: r.grantors,
      grantees: r.grantees,
      source: 'harris_aumentum',
    }));
  }

  // One party index covers both roles; the [R]/[E] markers decide the side, so both entry points
  // run the same search and the parser sorts it out.
  async searchByGrantorName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.partySearch(name, options);
  }

  async searchByGranteeName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.partySearch(name, options);
  }

  async searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]> {
    throw new Error(
      `[Aumentum/${this.countyName}] Instrument-number search is NOT implemented (asked: ${instrumentNo}). ` +
        `The form has txtInstrumentNoFrom/To and it has not been driven. A missing capability, not an empty result.`,
    );
  }

  async searchByVolumePage(volume: string, pg: string): Promise<ClerkDocumentResult[]> {
    throw new Error(
      `[Aumentum/${this.countyName}] Book/page search is NOT implemented (vol ${volume} pg ${pg}). ` +
        `The form has txtBook and txtPage and they have not been driven. Not an empty result.`,
    );
  }

  async searchByLegalDescription(legalDesc: string): Promise<ClerkDocumentResult[]> {
    // This adapter first claimed the vendor offers no legal-description search. It does — the form
    // carries txtLDBook, txtLDLot, txtLDSection, txtLDMapId and txtLDFreeForm. They have not been
    // driven, which is a different and smaller claim than "not offered", and saying the wrong one
    // would send a researcher to a courthouse for something the portal can answer.
    throw new Error(
      `[Aumentum/${this.countyName}] Legal-description search EXISTS on this portal (txtLDBook, txtLDLot, ` +
        `txtLDSection, txtLDMapId, txtLDFreeForm) but has NOT been driven (asked: ${legalDesc.slice(0, 40)}). ` +
        `An unbuilt capability, not a missing one, and not an empty result.`,
    );
  }

  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    throw new Error(
      `[Aumentum/${this.countyName}] Images for ${instrumentNo} go through the site's basket/"Get a Free Copy" flow, which is not wired up. Not "no images".`,
    );
  }

  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    throw new Error(`[Aumentum/${this.countyName}] Pricing for ${instrumentNo} has not been read. Unknown, not free.`);
  }

  /** What this county's online index actually covers, for a caller to report alongside results. */
  coverage(): string | undefined {
    return REMAINING_COUNTY_SURVEY[this.countyName]?.freeCoverage;
  }
}
