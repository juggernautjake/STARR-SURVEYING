// worker/src/adapters/texasfile-adapter.ts
// Phase 2: TexasFileAdapter — universal fallback for all 254 Texas counties.
//
// TexasFile.com provides an index-only view for every Texas county clerk system.
// Free access returns metadata only (no document images); $1/page for images.
//
// Architecture:
//   - SPA (React) — requires Playwright for search
//   - Universal coverage: works for any Texas county
//   - Free: instrument numbers, dates, grantor/grantee, doc types, page count
//   - Paid: $1/page for un-watermarked images (wallet-based payment)
//
// This adapter is used as a fallback when no county-specific adapter exists
// (CountyFusion, Kofile, Tyler, etc.) and provides index-level data to
// identify which instrument numbers exist before handing off to purchase.
//
// Spec §2.7 — TexasFile Universal Fallback Adapter

import { acquireBrowser } from '../lib/browser-factory.js';
import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type DocumentImage,
  type PricingInfo,
  type ClerkSearchOptions,
  type DocumentType,
} from './clerk-adapter.js';

// A paywall is not an empty index — TexasFile is the fallback for 233 counties (plan R38).
import {
  readAccess,
  countyRecordsUrl,
  hasTexasFileCredentials,
  TEXASFILE_FIELDS,
  type AccessResult,
} from './texasfile-access.js';

/** Base URL for TexasFile public search */
const TEXASFILE_BASE = 'https://www.texasfile.com';

/** Rate limits — TexasFile is more sensitive than county systems */
const RATE_LIMIT_MS = {
  SEARCH_DELAY:    3_000,
  RESULT_WAIT:     2_500,
  BETWEEN_PAGES:   2_000,
} as const;

/** Maximum retries on transient failures */
const MAX_RETRIES = 2;

export class TexasFileAdapter extends ClerkAdapter {
  /** Per-page price for TexasFile document purchases */
  private static readonly PRICE_PER_PAGE = 1.00;

  /** Whether we've already navigated to the TexasFile search page */
  private sessionReady = false;

  /** Whether this session is logged in. False means searches see counts, not records. */
  private signedIn = false;

  /** What the last search actually hit. Surfaced so a caller can tell a paywall (the records exist,
   *  we cannot open them) from an empty index (they do not exist) — the distinction that decides
   *  whether a county needs a subscription or needs a different portal. */
  lastAccess: AccessResult | null = null;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  async initSession(): Promise<void> {
    if (this.browser) return;

    this.browser = await acquireBrowser({
      adapterId: 'texasfile',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });

    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1920, height: 1080 },
    });

    this.page = await context.newPage();
    this.sessionReady = false;

    // ── SIGN IN, which this adapter never did ───────────────────────────────────────────────────
    //
    // TexasFile runs the search anonymously, tells you how many records matched, and then redirects
    // to /register/ to show them (measured 2026-08-02, see texasfile-access.ts). So without a login
    // every one of the 233 counties that fall back to this adapter reached a count and stopped.
    // `readAccess` reported that honestly as `paywalled` — which is why this looked like a coverage
    // problem rather than a missing three lines.
    //
    // The credentials have been set and funded since 2026-08-29. Nothing read them: the purchase
    // adapter logs in, this one did not, and `hasTexasFileCredentials()` had no callers at all.
    await this.signIn();
  }

  /**
   * Log in, so a search returns records rather than a count and a paywall.
   *
   * Never throws. A failed or absent login leaves the adapter exactly where it used to be — able to
   * search and report a count — and `readAccess` will say `paywalled`, which is the truthful answer
   * for a session that cannot see the records. Losing the sign-in must not lose the count, because
   * "5,000 records exist here and we cannot open them" is still a purchasing decision.
   */
  private async signIn(): Promise<void> {
    if (!this.page || this.signedIn) return;

    if (!hasTexasFileCredentials()) {
      // Stated once, plainly. This is a capability the run does not have, not a fact about Texas.
      console.warn(
        `[TexasFile/${this.countyName}] No TEXASFILE_USERNAME/TEXASFILE_PASSWORD is set. Searches ` +
          `will reach the paywall and report record COUNTS without the records themselves. That is ` +
          `a missing subscription, not an absence of records.`,
      );
      return;
    }

    try {
      await this.page.goto(`${TEXASFILE_BASE}/login/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const user = await this.page.$('input[name="username"], input[name="email"], input[type="email"]');
      const pass = await this.page.$('input[name="password"], input[type="password"]');
      if (!user || !pass) {
        console.warn(`[TexasFile/${this.countyName}] Could not find the login form — continuing unauthenticated.`);
        return;
      }

      await user.fill(process.env.TEXASFILE_USERNAME ?? '');
      await pass.fill(process.env.TEXASFILE_PASSWORD ?? '');

      const submit = await this.page.$('button[type="submit"], input[type="submit"]');
      if (submit) await submit.click();
      else await this.page.keyboard.press('Enter');

      await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

      // Verified by what the page says, not by "the click did not throw". A rejected login returns
      // 200 with an error on it, which is indistinguishable from success to a navigation check.
      const text = await this.page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => '');
      const stillOnLogin = /\/login/i.test(this.page.url());
      const rejected = /invalid|incorrect|try again|not match/i.test(text);

      if (stillOnLogin || rejected) {
        console.warn(
          `[TexasFile/${this.countyName}] Sign-in did not take — the credentials were refused or the ` +
            `form changed. Searches will still report counts, behind the paywall.`,
        );
        return;
      }

      this.signedIn = true;
      console.log(`[TexasFile/${this.countyName}] Signed in — searches can return records.`);
    } catch (err) {
      console.warn(
        `[TexasFile/${this.countyName}] Sign-in threw (${err instanceof Error ? err.message : String(err)}) ` +
          `— continuing unauthenticated.`,
      );
    }
  }

  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.sessionReady = false;
    }
  }

  // ── Navigation helper ─────────────────────────────────────────────────────────

  /**
   * Navigate to TexasFile and select the correct county if not already there.
   * TexasFile uses a county dropdown on the main search page.
   */
  private async ensureOnSearchPage(): Promise<void> {
    if (!this.page) throw new Error('Session not initialized');

    if (this.sessionReady) return;

    // ── THE URL THE SITE ACTUALLY SERVES ────────────────────────────────────────────────────────
    //
    // This used to go to `/search` and pick a county from a dropdown. `texasfile-access.ts` recorded
    // on 2026-08-02, from driving the live site, that this shape is IGNORED — TexasFile redirects to
    // its generic landing page and shows nothing. The real per-county page is slug-based, and
    // `countyRecordsUrl()` has existed to build it ever since, with no caller.
    //
    // So the measurement was made, written down, and never connected to the code that needed it.
    await this.page.goto(countyRecordsUrl(this.countyName), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await this.page.waitForTimeout(1_200);

    this.sessionReady = true;
  }

  /**
   * Fill the county search form and submit it.
   *
   * Driven through the FORM rather than by building a URL, because it is a Django form: the hidden
   * `csrfmiddlewaretoken` and `selected_counties` have to survive, and a constructed query string
   * drops both. That is recorded in `texasfile-access.ts` beside the field names, which were read
   * off the live page — every search method here was previously guessing at selectors like
   * `input[name="grantee"]`, which the page does not have.
   *
   * Returns false when the form is not on the page, so the caller can report a navigation failure
   * rather than an empty index.
   */
  private async submitSearch(fields: Partial<Record<keyof typeof TEXASFILE_FIELDS, string>>): Promise<boolean> {
    if (!this.page) throw new Error('Session not initialized');

    let filledAny = false;
    for (const [key, value] of Object.entries(fields)) {
      if (!value) continue;
      const name = TEXASFILE_FIELDS[key as keyof typeof TEXASFILE_FIELDS];
      const input = await this.page.$(`[name="${name}"]`);
      if (!input) continue;
      await input.fill('');
      await input.fill(value);
      filledAny = true;
    }
    if (!filledAny) return false;

    const submit = await this.page.$('button[type="submit"], input[type="submit"]');
    if (submit) await submit.click();
    else await this.page.keyboard.press('Enter');

    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);
    return true;
  }

  // ── Search methods ────────────────────────────────────────────────────────────

  async searchByInstrumentNumber(
    instrumentNo: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    console.log(
      `[TexasFile/${this.countyName}] Searching instrument# ${instrumentNo}...`,
    );

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.ensureOnSearchPage();

        if (await this.submitSearch({ instrumentNumber: instrumentNo })) {
          return await this.parseResults();
        }
        // The form was not on the page. That is a navigation failure, and the retry below treats
        // it as one — the old code fell through to a `/search?county=…` URL the site ignores, so a
        // missing form arrived as an empty index for 233 counties.
        throw new Error('the county search form was not on the page');
      } catch (e) {
        if (attempt === MAX_RETRIES) {
          // An exhausted retry is an ERROR, not an empty index. TexasFile is the fallback for 232
          // counties, so returning [] here reported "this property has no records" for most of
          // Texas whenever the site was slow, blocked or changed.
          throw new Error(
            `[TexasFile/${this.countyName}] Instrument-number search FAILED after ${MAX_RETRIES} attempts ` +
              `(${(e as Error).message}). This is an error, NOT an empty index.`,
          );
        }
        this.sessionReady = false;
        await this.page.waitForTimeout(2_000);
      }
    }
    return [];
  }

  async searchByVolumePage(
    volume: string,
    pg: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    console.log(`[TexasFile/${this.countyName}] Searching Vol ${volume} / Pg ${pg}...`);

    try {
      await this.ensureOnSearchPage();
      if (!(await this.submitSearch({ volume, page: pg }))) {
        throw new Error('the county search form was not on the page');
      }
      return await this.parseResults();
    } catch (e) {
      throw new Error(
        `[TexasFile/${this.countyName}] Volume/page search FAILED (${(e as Error).message}). ` +
          `This is an error, NOT an empty index.`,
      );
    }
  }

  async searchByGranteeName(
    name: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const cleanName = this.cleanName(name);
    console.log(`[TexasFile/${this.countyName}] Searching grantee: "${cleanName}"...`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.ensureOnSearchPage();

        if (options?.documentTypes?.length) {
          await this.applyDocTypeFilter(options.documentTypes);
        }
        // `nameType` is what separates a grantee search from a grantor one on this form. The old
        // code looked for an `input[name="grantee"]` that does not exist, so both searches were
        // identical and neither ran.
        if (await this.submitSearch({ name: cleanName, nameType: 'grantee' })) {
          return await this.parseResults();
        }
        throw new Error('the county search form was not on the page');
      } catch (e) {
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `[TexasFile/${this.countyName}] Grantee search FAILED after ${MAX_RETRIES} attempts ` +
              `(${(e as Error).message}). This is an error, NOT an empty index.`,
          );
        }
        this.sessionReady = false;
        await this.page.waitForTimeout(2_000);
      }
    }
    return [];
  }

  async searchByGrantorName(
    name: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const cleanName = this.cleanName(name);
    console.log(`[TexasFile/${this.countyName}] Searching grantor: "${cleanName}"...`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.ensureOnSearchPage();

        if (options?.documentTypes?.length) {
          await this.applyDocTypeFilter(options.documentTypes);
        }
        if (await this.submitSearch({ name: cleanName, nameType: 'grantor' })) {
          return await this.parseResults();
        }
        throw new Error('the county search form was not on the page');
      } catch (e) {
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `[TexasFile/${this.countyName}] Grantor search FAILED after ${MAX_RETRIES} attempts ` +
              `(${(e as Error).message}). This is an error, NOT an empty index.`,
          );
        }
        this.sessionReady = false;
        await this.page.waitForTimeout(2_000);
      }
    }
    return [];
  }

  async searchByLegalDescription(
    legalDesc: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    // This returned [] — the same defect fixed in the Kofile adapter, and worse here, because
    // TexasFile is the fallback for 232 counties. "The free tier does not offer this search" and
    // "no document mentions this land" are different facts, and only the caller can act on the
    // first one.
    throw new Error(
      `[TexasFile/${this.countyName}] Legal-description search is NOT offered on the free tier ` +
        `(asked: ${legalDesc.slice(0, 40)}). A missing capability, NOT an empty index — do not record this as ` +
        `"no documents touch this land". A subscription, or a county with its own portal, is the way to answer it.`,
    );
  }

  // ── Document access ───────────────────────────────────────────────────────────

  /**
   * TexasFile requires wallet-based purchase for document images.
   *
   * This used to return an empty array, which reads as "this document has no images". Every
   * TexasFile document HAS images — they are behind a paywall. Use getDocumentPricing() for the
   * cost and the purchase flow to obtain them.
   */
  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    throw new Error(
      `[TexasFile/${this.countyName}] Images for ${instrumentNo} require a wallet purchase. ` +
        `The document HAS pages — this is the absence of ACCESS, not the absence of images.`,
    );
  }

  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    // Try to get the actual page count from a cached search result or live query
    const pageCount = await this.fetchPageCount(instrumentNo);
    const totalPrice = pageCount ? pageCount * TexasFileAdapter.PRICE_PER_PAGE : undefined;

    return {
      available: true,
      pricePerPage: TexasFileAdapter.PRICE_PER_PAGE,
      totalPrice,
      pageCount,
      paymentMethod: 'wallet',
      source: `texasfile_${this.countyFIPS}`,
    };
  }

  // ── Result parser ─────────────────────────────────────────────────────────────

  /**
   * Parse TexasFile search results.
   * TexasFile is a React SPA; results render into a table after the JS executes.
   * We parse the rendered DOM.
   */
  private async parseResults(): Promise<ClerkDocumentResult[]> {
    // A dead session is not an empty index — and on the fallback for 232 counties, that mistake
    // reaches further than anywhere else.
    if (!this.page) {
      throw new Error(
        `[TexasFile/${this.countyName}] Cannot parse results — the browser session is gone. ` +
          `This is a session failure, NOT an empty index.`,
      );
    }

    // TexasFile runs the search, tells you how many records matched, and THEN asks for an account.
    // Without this check that arrives as an empty array — and for the 233 counties that fall back to
    // TexasFile, "no records found" would be the platform's answer for most of Texas (plan R38).
    try {
      const body = await this.page.evaluate(() => document.body.innerText.slice(0, 4000));
      const access = readAccess(this.page.url(), body, this.countyName);
      this.lastAccess = access;
      if (access.state === 'paywalled') {
        console.warn(`[TexasFile/${this.countyName}] ${access.statement} ${access.nextStep}`);
        return [];
      }
      if (access.state === 'unknown') {
        console.warn(`[TexasFile/${this.countyName}] ${access.statement}`);
      }
    } catch {
      // A failed read of the page text must not stop the parse below.
    }

    const results: ClerkDocumentResult[] = [];

    try {
      // Wait for results to render
      await this.page.waitForSelector(
        'table tbody tr, .result-row, .search-result',
        { timeout: 8_000 },
      ).catch(() => {});

      const pageText = await this.page.evaluate(
        () => (document.body.innerText ?? '').toLowerCase(),
      );
      if (
        pageText.includes('no records') ||
        pageText.includes('no results') ||
        pageText.includes('0 result')
      ) {
        return [];
      }

      // Grab all table rows
      const rows = await this.page.$$(
        'table tbody tr, .result-row',
      );

      for (const row of rows) {
        try {
          const text = await row.innerText();
          const parsed = this.parseResultRow(text);
          if (parsed) results.push(parsed);
        } catch {
          // Skip unparseable rows
        }
      }

      // Handle pagination — TexasFile shows 25 results per page
      if (results.length >= 25) {
        const nextBtn = await this.page.$(
          '.next-page, button:has-text("Next"), [aria-label="Next"]',
        );
        if (nextBtn) {
          await nextBtn.click();
          await this.page.waitForTimeout(RATE_LIMIT_MS.BETWEEN_PAGES);
          const nextPageResults = await this.parseResults();
          results.push(...nextPageResults);
        }
      }
    } catch (e) {
      console.warn(`[TexasFile/${this.countyName}] DOM parsing failed:`, e);
    }

    console.log(
      `[TexasFile/${this.countyName}] Found ${results.length} records`,
    );

    return results;
  }

  /**
   * Parse one row of TexasFile search results.
   * TexasFile columns (typical order):
   *   Filing Date | Instrument# | Doc Type | Grantors | Grantees | Book/Page | Pages
   */
  private parseResultRow(rowText: string): ClerkDocumentResult | null {
    // Instrument number: 8–13 digit number
    const instrMatch = rowText.match(/\b(\d{8,13})\b/);
    if (!instrMatch) return null;

    const instrumentNumber = instrMatch[1];

    // Recording date
    const dateMatch =
      rowText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/) ??
      rowText.match(/(\d{4}-\d{2}-\d{2})/);
    const recordingDate = dateMatch ? dateMatch[1] : '';

    // Page count (e.g. "3 pages" or "3 pg")
    const pagesMatch = rowText.match(/(\d+)\s*(?:pages?|pg\.?)/i);
    const pageCount = pagesMatch ? parseInt(pagesMatch[1], 10) : undefined;

    // Volume/page reference
    const vpMatch = rowText.match(/\b(\d{3,6})\s*[/,]\s*(\d{1,5})\b/);
    const volumePage = vpMatch ? { volume: vpMatch[1], page: vpMatch[2] } : undefined;

    // Document type — extract any type keyword
    const docTypeRaw = this.extractDocTypeFromText(rowText);

    // Party names — extract ALL CAPS multi-word strings
    const nameMatches = rowText.match(/[A-Z][A-Z\s,\.'-]{4,}/g) ?? [];
    const names = nameMatches
      .map((n) => n.trim())
      .filter(
        (n) =>
          n.length > 4 &&
          !n.includes(instrumentNumber) &&
          !/\d{4}/.test(n),
      );

    const grantors = names[0] ? [names[0]] : [];
    const grantees = names[1] ? [names[1]] : [];

    return {
      instrumentNumber,
      documentType: docTypeRaw
        ? this.classifyDocumentType(docTypeRaw)
        : 'other',
      recordingDate,
      grantors,
      grantees,
      volumePage,
      pageCount,
      source: `texasfile_${this.countyFIPS}`,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private extractDocTypeFromText(text: string): string {
    const upper = text.toUpperCase();
    const typeKws = [
      'WARRANTY DEED', 'SPECIAL WARRANTY', 'QUITCLAIM', 'DEED OF TRUST',
      'PLAT', 'REPLAT', 'AMENDED PLAT', 'EASEMENT', 'RESTRICTIVE COVENANT',
      'CC&R', 'RIGHT OF WAY', 'DEDICATION', 'RELEASE OF LIEN',
      'AFFIDAVIT', 'CORRECTION', 'OIL', 'MINERAL', 'LEASE',
    ];
    for (const kw of typeKws) {
      if (upper.includes(kw)) return kw;
    }
    return '';
  }

  private async applyDocTypeFilter(docTypes: DocumentType[]): Promise<void> {
    if (!this.page) return;
    const select = await this.page.$(
      'select[name="docType"], select[name="type"], #documentType',
    );
    if (!select) return;

    // Map our canonical type to TexasFile's display label (best-effort)
    const labelMap: Partial<Record<DocumentType, string>> = {
      warranty_deed: 'Warranty Deed',
      plat: 'Plat',
      easement: 'Easement',
      deed_of_trust: 'Deed of Trust',
    };

    for (const dt of docTypes) {
      const label = labelMap[dt];
      if (label) {
        await select.selectOption({ label }).catch(() => {});
        break;  // TexasFile only supports one type filter at a time
      }
    }
  }

  private cleanName(name: string): string {
    return name
      .replace(/\b(LLC|INC|CORP|LP|LTD|TRUST|FAMILY|ET\s*AL|ET\s*UX)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Attempt to get the page count for a known instrument number */
  private async fetchPageCount(instrumentNo: string): Promise<number | undefined> {
    try {
      const results = await this.searchByInstrumentNumber(instrumentNo);
      const result = results.find((r) => r.instrumentNumber === instrumentNo);
      return result?.pageCount;
    } catch {
      return undefined;
    }
  }
}
