// worker/src/adapters/tyler-eagle-adapter.ts — nine counties, including Waco (plan R39).
//
// See tyler-eagle-discovery.ts for how these portals were found and what each fact cost. The two
// behaviours that shape this file:
//
//   1. `totalPages: 0` means the search matched MORE than the portal will return, not fewer. A
//      broad name on a 169-year index hits it immediately, so the adapter narrows and retries
//      rather than reporting nothing.
//   2. Results are `li.ss-search-row` cards, not table rows.

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
  TYLER_EAGLE_PORTALS,
  TYLER_FIELDS,
  TYLER_MAX_PAGES,
  TYLER_SEARCH_BUTTON,
  describeCompleteness,
  narrowByYear,
  readSearchOutcome,
  shouldContinuePaging,
  tylerEagleUrl,
  type TylerSearchResponse,
} from './tyler-eagle-discovery.js';
import { describeParse, parseResults, type TylerCard } from './tyler-results-parser.js';
import { resolveAdapter } from '../infra/adapter-registry.js';

/** Read every result card off the rendered page. Runs in the browser. */
const READ_CARDS = `() => {
  const cards = Array.from(document.querySelectorAll('li.ss-search-row'));
  return cards.map((c) => {
    const fields = {};
    for (const col of c.querySelectorAll('ul.selfServiceSearchResultColumn')) {
      const items = Array.from(col.querySelectorAll('li'));
      if (items.length < 2) continue;
      const label = (items[0].textContent || '').trim();
      const value = items.slice(1).map((i) => (i.textContent || '').trim()).filter(Boolean).join('\\n');
      if (label) fields[label] = value;
    }
    const link = c.querySelector('a[href*="/web/document/"]');
    return {
      heading: (c.querySelector('h1')?.textContent || '').trim(),
      fields,
      documentHref: link ? link.getAttribute('href') : undefined,
    };
  });
}`;

/** Tyler's index reaches back to 1857 in McLennan. Defaulting to a recent window would return
 *  nothing for a 1912 deed, and that empty result would read as "this property has no deeds". */
export const EARLIEST = new Date(1836, 0, 1);

function usDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

export class TylerEagleAdapter extends ClerkAdapter {
  private baseUrl: string;
  private context: BrowserContext | null = null;
  /** Discovered from the county's own menu — never hardcoded across counties. */
  private searchId: string | null = null;
  lastParseSummary: string | null = null;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
    const url = tylerEagleUrl(countyName);
    if (!url) {
      throw new Error(
        `[Tyler] ${countyName} has no located Tyler Host portal. Known: ${Object.keys(TYLER_EAGLE_PORTALS).join(', ')}. ` +
          `Add one only after driving its search and seeing documents come back.`,
      );
    }
    this.baseUrl = url.replace(/\/$/, '');
  }

  async initSession(): Promise<void> {
    if (this.browser) return;
    await this.applyRegistryOverrides();

    this.browser = await acquireBrowser({
      adapterId: 'tyler-eagle',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });
    if (!this.browser) throw new Error(`[Tyler/${this.countyName}] Could not acquire a browser.`);
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1600, height: 1100 },
      acceptDownloads: true,
    });
    this.page = await this.context.newPage();

    await this.acceptDisclaimer();
    await this.discoverSearchId();
  }

  private async applyRegistryOverrides(): Promise<void> {
    try {
      const resolved = await resolveAdapter(this.countyName, 'clerk_deeds', {
        county: this.countyName,
        siteType: 'clerk_deeds',
        system: 'tyler_eagle',
        baseUrl: this.baseUrl,
        implementation: 'implemented',
      });
      if (resolved.source === 'registry' && resolved.baseUrl) this.baseUrl = resolved.baseUrl.replace(/\/$/, '');
    } catch {
      /* keep the compiled URL */
    }
  }

  /** Everything is gated behind the disclaimer; it sets the `disclaimerAccepted` cookie. */
  private async acceptDisclaimer(): Promise<void> {
    const page = this.page!;
    await page.goto(`${this.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('a,button,input[type=submit]')).find((x) =>
        /accept|agree|continue/i.test((x.textContent || (x as HTMLInputElement).value || '')),
      ) as HTMLElement | undefined;
      el?.click();
    });
    // The main menu loads asynchronously. Wait for the SEARCH LINKS themselves, not for the
    // "Loading main menu" text to disappear — that text has not been rendered yet when this first
    // runs, so its absence is satisfied immediately and the menu is read while still empty.
    await page
      .waitForFunction(() => document.querySelectorAll('a[href*="/search/"]').length > 0, undefined, {
        timeout: 45_000,
        polling: 300,
      })
      .catch(() => undefined);
  }

  /** Ask the county which search is its official public record index.
   *
   *  The IDs are per deployment — McLennan's is DOCSEARCH402S1 and its marriage index is
   *  DOCSEARCH392S3. Hardcoding one across counties would search another county's marriage records
   *  for a deed and return nothing, which reads as "this property has no deeds". */
  private async discoverSearchId(): Promise<void> {
    const page = this.page!;
    this.searchId = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/search/"]'));
      const opr = links.find((a) => /official public record/i.test(a.textContent || ''));
      const chosen = opr ?? links[0];
      const href = chosen?.getAttribute('href') ?? '';
      return /\/search\/([A-Z0-9]+)/i.exec(href)?.[1] ?? null;
    });

    if (!this.searchId) {
      throw new Error(
        `[Tyler/${this.countyName}] Could not find an Official Public Record search in the menu. ` +
          `Refusing to guess a search ID — searching the wrong index returns nothing, which reads as "no records".`,
      );
    }
  }

  /** Run one search and read whatever the portal says about it. */
  private async runOnce(fields: Record<string, string>): Promise<{ outcome: ReturnType<typeof readSearchOutcome>; results: ClerkDocumentResult[] }> {
    const page = this.page!;
    await page.goto(`${this.baseUrl}/search/${this.searchId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(
      (n) => !!document.querySelector(`[name="${n}"]`),
      TYLER_FIELDS.bothNames,
      { timeout: 45_000, polling: 300 },
    );

    let json: TylerSearchResponse | null = null;
    const onResponse = async (res: { url(): string; text(): Promise<string> }) => {
      if (!/searchPost/i.test(res.url())) return;
      try { json = JSON.parse(await res.text()) as TylerSearchResponse; } catch { /* not JSON */ }
    };
    page.on('response', onResponse);

    try {
      await page.evaluate((f) => {
        for (const [name, value] of Object.entries(f)) {
          const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
          if (!el) continue;
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, fields);

      // Exactly #searchButton — a looser match hits the hidden advancedSearchButton-<field> links
      // and opens a help dialog, which looks identical to a search that returned nothing.
      await page.click(TYLER_SEARCH_BUTTON);

      await page
        .waitForFunction(
          () => /Total Results|more documents than the maximum|no records|no results/i.test(document.body.innerText),
          undefined,
          { timeout: 75_000, polling: 400 },
        )
        .catch(() => undefined);
    } finally {
      page.off('response', onResponse);
    }

    const pageText = await page.evaluate(() => document.body.innerText);
    const outcome = readSearchOutcome(json ?? { validationMessages: {}, totalPages: 0, currentPage: 1 }, this.countyName, pageText);

    if (outcome.state !== 'has_results') return { outcome, results: [] };

    const results = await this.readAllPages(pageText);
    return { outcome, results };
  }

  /** Read every page of a result set, not just the first.
   *
   *  Tyler serves 100 cards per page and states the rest in its banner — "Showing page 1 of 5 for
   *  436 Total Results". Returning page one would have silently dropped 336 documents while looking
   *  exactly like a complete answer, which is the same defect as an empty result and harder to
   *  notice because something did come back.
   *
   *  Paging advances through the "Next" control rather than a URL, because the results live in
   *  session state; there is no page-2 address to request. */
  private async readAllPages(firstPageText: string): Promise<ClerkDocumentResult[]> {
    const page = this.page!;
    const out: ClerkDocumentResult[] = [];
    const seen = new Set<string>();
    let pageText = firstPageText;
    let expectedPages: number | null = null;
    let pagesRead = 0;

    while (pagesRead < TYLER_MAX_PAGES) {
      // Invoked, not just passed: `page.evaluate("() => {...}")` evaluates the string as an
      // EXPRESSION, which yields the function object itself and serialises to undefined. The same
      // mistake in the Kofile discovery reported every county as having no departments.
      const cards = (await page.evaluate(`(${READ_CARDS})()`)) as TylerCard[];
      const report = parseResults(cards, pageText);
      pagesRead += 1;
      if (expectedPages === null) expectedPages = report.banner?.pages ?? 1;

      for (const r of report.rows) {
        // Dedupe across pages: a record shifting between pages while we walk them would otherwise
        // appear twice, and a duplicated deed reads as two conveyances.
        if (seen.has(r.instrumentNumber)) continue;
        seen.add(r.instrumentNumber);
        out.push({
          instrumentNumber: r.instrumentNumber,
          documentType: this.classifyDocumentType(r.documentType) as DocumentType,
          recordingDate: r.recordingDate,
          grantors: r.grantors,
          grantees: r.grantees,
          legalDescription: r.legalDescription,
          source: 'tyler_eagle',
        });
      }

      const current = report.banner?.page ?? pagesRead;
      if (!shouldContinuePaging(current, expectedPages ?? 1, pagesRead)) break;

      const advanced = await this.clickNext(current);
      if (!advanced) break;
      pageText = await page.evaluate(() => document.body.innerText);
    }

    const total = parseResults([], pageText).banner?.total ?? null;
    this.lastParseSummary = describeCompleteness(this.countyName, out.length, pagesRead, expectedPages, total);
    console.log(`[Tyler/${this.countyName}] ${this.lastParseSummary}`);
    return out;
  }

  /** Click the pager's Next and wait for the page number to actually change.
   *
   *  Waiting on the banner rather than a delay: clicking Next and reading immediately re-reads the
   *  page just left, which would return the same 100 documents twice and stop early. */
  private async clickNext(currentPage: number): Promise<boolean> {
    const page = this.page!;
    const clicked = await page.evaluate(() => {
      const next = Array.from(document.querySelectorAll('a')).find(
        (a) => (a.textContent || '').trim().toLowerCase() === 'next' && !/ui-disabled/.test(a.className || ''),
      ) as HTMLElement | undefined;
      if (!next) return false;
      next.click();
      return true;
    });
    if (!clicked) return false;

    return page
      .waitForFunction(
        (prev) => {
          const m = /Showing page (\d+) of/i.exec(document.body.innerText);
          return !!m && Number(m[1]) > prev;
        },
        currentPage,
        { timeout: 60_000, polling: 400 },
      )
      .then(() => true)
      .catch(() => false);
  }

  /** Search, and if the portal says "too many", split the window and search each slice.
   *
   *  The slices tile the original range with no gaps. A gap would be a deed nobody sees — the same
   *  wrong answer as an empty result, only harder to notice. */
  private async searchNarrowing(nameField: string, name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    const from = (options as { from?: Date } | undefined)?.from ?? EARLIEST;
    const to = (options as { to?: Date } | undefined)?.to ?? new Date();

    const attempt = await this.runOnce({
      [nameField]: name,
      [TYLER_FIELDS.startDate]: usDate(from),
      [TYLER_FIELDS.endDate]: usDate(to),
    });

    if (attempt.outcome.state === 'rejected') throw new Error(attempt.outcome.statement);
    if (attempt.outcome.state !== 'over_limit') {
      if (attempt.outcome.state === 'empty') console.log(`[Tyler/${this.countyName}] ${attempt.outcome.statement}`);
      return attempt.results;
    }

    console.log(`[Tyler/${this.countyName}] ${attempt.outcome.statement} — narrowing.`);
    const out: ClerkDocumentResult[] = [];
    const seen = new Set<string>();
    for (const win of narrowByYear(from, to, 5)) {
      const slice = await this.runOnce({
        [nameField]: name,
        [TYLER_FIELDS.startDate]: usDate(win.from),
        [TYLER_FIELDS.endDate]: usDate(win.to),
      });
      if (slice.outcome.state === 'over_limit') {
        // Report rather than silently return a partial window. A surveyor needs to know the answer
        // is incomplete far more than they need a shorter list.
        console.warn(
          `[Tyler/${this.countyName}] STILL over limit for ${usDate(win.from)}–${usDate(win.to)}. ` +
            `This window is INCOMPLETE — narrow by document type or a fuller name.`,
        );
      }
      for (const r of slice.results) {
        if (seen.has(r.instrumentNumber)) continue;
        seen.add(r.instrumentNumber);
        out.push(r);
      }
    }
    return out;
  }

  async searchByGrantorName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.searchNarrowing(TYLER_FIELDS.grantor, name, options);
  }

  async searchByGranteeName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.searchNarrowing(TYLER_FIELDS.grantee, name, options);
  }

  async searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    const { outcome, results } = await this.runOnce({ [TYLER_FIELDS.docNumber]: instrumentNo });
    if (outcome.state === 'rejected') throw new Error(outcome.statement);
    return results;
  }

  async searchByVolumePage(volume: string, pg: string): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    const { outcome, results } = await this.runOnce({ [TYLER_FIELDS.volume]: volume, [TYLER_FIELDS.page]: pg });
    if (outcome.state === 'rejected') throw new Error(outcome.statement);
    return results;
  }

  async searchByLegalDescription(legalDesc: string): Promise<ClerkDocumentResult[]> {
    // The form has no legal-description field. Saying so beats returning [], which would read as
    // "no such property".
    throw new Error(
      `[Tyler/${this.countyName}] The search form has no legal-description field (asked: ${legalDesc.slice(0, 40)}). ` +
        `Use a party, instrument or book/page search. This is a missing capability, not an empty result.`,
    );
  }

  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    throw new Error(
      `[Tyler/${this.countyName}] Image retrieval for ${instrumentNo} goes through the portal's cart, which is not wired up. ` +
        `The document id is captured on each result; purchasing is not built. Not "no images".`,
    );
  }

  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    throw new Error(`[Tyler/${this.countyName}] Pricing for ${instrumentNo} has not been read off the cart. Unknown, not free.`);
  }

  async destroySession(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.page = null;
    this.browser = null;
    this.searchId = null;
  }
}
