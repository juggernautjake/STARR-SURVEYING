// worker/src/adapters/kofile-clerk-adapter.ts
// Phase 2: KofileClerkAdapter — Playwright automation for Kofile PublicSearch systems.
//
// Kofile/GovOS PublicSearch is the most common Texas county clerk system,
// powering Bell, Williamson, Travis, McLennan, Bexar, and ~80+ other counties.
//
// Key characteristics:
//   - SPA (React) — MUST use Playwright; HTTP-only scraping will not work
//   - Results load via AJAX/fetch; DOM renders client-side
//   - Document images served as signed S3 URLs (expire after ~15 min)
//   - Watermarked free previews; $1/page for un-watermarked copies
//   - Some counties add CountyFusion SUPERSEARCH for full-text OCR queries
//
// Spec §2.4 — Kofile/PublicSearch Adapter

import type { BrowserContext } from 'playwright';
// Model chosen by TASK, cheap-first, not pinned per call site (research plan R6):
// this call reads a clerk document image.
import { modelFor } from '../infra/model-router.js';
import { acquireBrowser } from '../lib/browser-factory.js';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type DocumentImage,
  type PricingInfo,
  type DocumentType,
  type ClerkSearchOptions,
} from './clerk-adapter.js';
import { resolveAdapter } from '../infra/adapter-registry.js';
// Read the results table by its headers — column sets differ per county (research plan R38).
import { describeParse, parseResults } from './kofile-results-parser.js';
// Ask the county which department holds its land records — the code is not a constant (plan R38).
import {
  READ_SITE_CONFIG,
  chooseDepartment,
  type DepartmentChoice,
  type KofileSiteConfig,
} from './kofile-discovery.js';
// Wait for the thing, not for a duration — a fixed delay reported two counties as empty (plan R38).
import {
  KOFILE_CONFIG_READY,
  RESULTS_SETTLED,
  waitForCondition,
  waitWithRetry,
  type WaitablePage,
} from '../lib/page-readiness.js';

// ── Per-county Kofile configuration ──────────────────────────────────────────

interface KofileConfig {
  /** Base URL, e.g. "https://bell.tx.publicsearch.us" */
  baseUrl: string;
  /** Path for search results SPA, e.g. "/results" */
  searchPath: string;
  /** Path prefix for the document viewer, e.g. "/doc/" */
  viewerPath: string;
  countyDisplayName: string;
  /** True for all current Kofile deployments */
  hasImagePreview: boolean;
  /** Real-property department code for this county. Per county, NOT a constant: Milam uses "RP",
   *  Williamson defaults to "CCM" (court minutes) and returns nothing for a deed search. */
  department?: string;
  /** The county's own recorded-date span for that department, e.g. "18010101,20260731". The site
   *  rejects a range outside its own, which is what made Travis look broken. */
  dateRange?: string;
  /** Some counties expose CountyFusion SUPERSEARCH for OCR full-text queries */
  hasSUPERSEARCH: boolean;
  superSearchUrl?: string;
}

// Known Kofile county configurations (keyed by 5-digit FIPS code)
const KOFILE_CONFIGS: Record<string, KofileConfig> = {
  '48027': {  // Bell County
    baseUrl: 'https://bell.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    countyDisplayName: 'Bell County',
    hasImagePreview: true,
    hasSUPERSEARCH: true,
    superSearchUrl: 'https://bell.tx.publicsearch.us/supersearch',
  },
  '48491': {  // Williamson County
    baseUrl: 'https://williamson.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    countyDisplayName: 'Williamson County',
    hasImagePreview: true,
    hasSUPERSEARCH: false,
  },
  '48453': {  // Travis County
    baseUrl: 'https://travis.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    countyDisplayName: 'Travis County',
    hasImagePreview: true,
    hasSUPERSEARCH: false,
  },
  '48309': {  // McLennan County
    baseUrl: 'https://mclennan.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    countyDisplayName: 'McLennan County',
    hasImagePreview: true,
    hasSUPERSEARCH: false,
  },
  '48029': {  // Bexar County
    baseUrl: 'https://bexar.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    countyDisplayName: 'Bexar County',
    hasImagePreview: true,
    hasSUPERSEARCH: false,
  },
};

// ── Rate-limit delays (spec §2.9) ────────────────────────────────────────────

const RATE_LIMIT_MS = {
  /** Between page navigations inside a document viewer */
  PAGE_NAVIGATION:    3_500,
  /** Between individual document downloads */
  DOCUMENT_DOWNLOAD:  6_000,
  /** After a 401 / redirect-to-login (re-auth + retry) */
  SESSION_EXPIRY:    30_000,
  /** Between different search-type requests */
  SEARCH_TYPE:        2_000,
} as const;

/** Maximum session-retry attempts before giving up */
const MAX_SESSION_RETRIES = 3;

// ── KofileClerkAdapter ────────────────────────────────────────────────────────

export class KofileClerkAdapter extends ClerkAdapter {
  private config: KofileConfig;
  private context: BrowserContext | null = null;
  /** What discovery found. Surfaced so a caller can tell "no land records here" (a fact about the
   *  county) from "the search returned nothing" (a fact about the property). */
  discovery: DepartmentChoice | null = null;
  /** Base directory for saving downloaded page images */
  private downloadDir: string;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);

    // Use known config if available; fall back to the standard Kofile URL pattern
    this.config = KOFILE_CONFIGS[countyFIPS] ?? {
      baseUrl: `https://${countyName.toLowerCase().replace(/\s+/g, '')}.tx.publicsearch.us`,
      searchPath: '/results',
      viewerPath: '/doc/',
      countyDisplayName: `${countyName} County`,
      hasImagePreview: true,
      hasSUPERSEARCH: false,
    };

    this.downloadDir = `/tmp/harvest/${countyFIPS}`;
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  /** Overlay whatever the registry knows on top of the compiled config (plan R8b).
   *
   *  This is the half that makes self-healing real. Sensing a changed site (R9) and storing a
   *  repair (R8) are worth nothing if the scraper still reads a constant compiled into the image:
   *  the fix would sit in the registry while every run kept using the old URL until somebody cut a
   *  release.
   *
   *  The contract a repair targets is deliberately small and snake_cased to match the column names
   *  around it:
   *
   *    base_url          the row's own column — the most common thing to change when a county
   *                      moves its portal
   *    config.search_path        e.g. "/results"
   *    config.viewer_path        e.g. "/doc/"
   *    config.super_search_url
   *    config.has_supersearch
   *
   *  Anything absent keeps the compiled value, so a partial repair is safe: fixing the search path
   *  does not silently blank the viewer path.
   *
   *  Never throws. A registry that is unreachable leaves the adapter exactly as it was compiled —
   *  a database problem must not stop research for a county whose code still works. */
  private async applyRegistryOverrides(): Promise<void> {
    try {
      const resolved = await resolveAdapter(this.countyName, 'clerk_deeds', {
        county: this.countyName,
        siteType: 'clerk_deeds',
        system: 'kofile',
        baseUrl: this.config.baseUrl,
        implementation: 'implemented',
      });
      if (resolved.source !== 'registry') return;

      const cfg = resolved.config as Record<string, unknown>;
      const before = this.config.baseUrl;

      if (resolved.baseUrl) this.config.baseUrl = resolved.baseUrl;
      if (typeof cfg.search_path === 'string') this.config.searchPath = cfg.search_path;
      if (typeof cfg.viewer_path === 'string') this.config.viewerPath = cfg.viewer_path;
      if (typeof cfg.super_search_url === 'string') {
        this.config.superSearchUrl = cfg.super_search_url;
        this.config.hasSUPERSEARCH = true;
      }
      if (typeof cfg.has_supersearch === 'boolean') this.config.hasSUPERSEARCH = cfg.has_supersearch;
      // A county whose real-property department code is not 'RP' is repaired from the registry
      // rather than by a release — the same contract R8b established for base_url.
      if (typeof cfg.department === 'string') this.config.department = cfg.department;

      if (before !== this.config.baseUrl) {
        // Worth a line: a run using a URL that is not in the source tree should say so, or the
        // next person debugging it will read the constant and believe it.
        console.log(`[kofile] ${this.countyName}: base URL from registry — ${before} → ${this.config.baseUrl}`);
      }
    } catch {
      // Compiled config stands. See the doc comment.
    }
  }

  async initSession(): Promise<void> {
    if (this.browser) return;

    await this.applyRegistryOverrides();

    this.browser = await acquireBrowser({
      adapterId: 'kofile-clerk',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1920, height: 1080 },
      acceptDownloads: true,
    });

    this.page = await this.context.newPage();

    fs.mkdirSync(this.downloadDir, { recursive: true });

    await this.discoverSiteConfig();
  }

  /** Ask the county what it has, instead of guessing (plan R38).
   *
   *  Kofile's search needs a `department` code and the code is per county — Milam calls its land
   *  records "Property Records", Travis calls the same code "Land Records", and Williamson's portal
   *  has no land-records department at all. Guessing produced three wrong answers in a day, and the
   *  Williamson case is the dangerous one: searching a court-minutes index for a deed returns
   *  nothing, which reads as "this property has no deeds".
   *
   *  The county publishes the answer at `window.__data.configuration.departments`. Reading it is
   *  what lets one adapter serve every Kofile county without a table of codes to maintain, and what
   *  picks up a county that adds or renames a department on the next run.
   *
   *  Never throws: a discovery failure leaves whatever the registry or the compiled config already
   *  said, exactly as `applyRegistryOverrides` does. */
  private async discoverSiteConfig(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });

      // Wait for the department list to EXIST, not for a duration. A fixed 3-second wait read Bell
      // and Milam as having no departments at all — a wrong answer that looked like a finding, and
      // one that would have been written into the registry as fact.
      const outcome = await waitWithRetry<KofileSiteConfig | null>(
        this.page as unknown as WaitablePage,
        KOFILE_CONFIG_READY,
        READ_SITE_CONFIG,
        {
          label: `${this.countyName}'s department list`,
          reload: async () => { await this.page!.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 }); },
        },
      );
      console.log(`[Kofile/${this.countyName}] ${outcome.statement}`);

      // A page that never rendered is UNREAD, not empty — `chooseDepartment(null, …)` says so, and
      // the adapter keeps whatever the registry already knew rather than overwriting it with a
      // conclusion drawn from a blank page.
      const raw = outcome.result.ready ? outcome.result.value : null;
      const choice = chooseDepartment(raw, this.countyName);
      if (!outcome.result.ready) {
        console.warn(`[Kofile/${this.countyName}] ${choice.reason}`);
        return;
      }

      console.log(`[Kofile/${this.countyName}] ${choice.reason}`);
      this.discovery = choice;

      if (choice.department) this.config.department = choice.department;
      if (choice.dateRange) this.config.dateRange = choice.dateRange;
    } catch (e) {
      console.warn(`[Kofile/${this.countyName}] Could not read the site configuration — using what was already known:`, e);
    }
  }

  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // ── Session retry wrapper ─────────────────────────────────────────────────────

  /**
   * Execute `fn` and automatically recover from Kofile session expiry.
   *
   * Kofile sessions expire silently (the site redirects to a blank/login page
   * rather than returning a proper 401).  This wrapper detects those cases and
   * re-navigates to the base URL before retrying, up to `MAX_SESSION_RETRIES`.
   */
  private async withSessionRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_SESSION_RETRIES; attempt++) {
      try {
        // Check for redirect-to-login before executing
        if (this.page) {
          const currentUrl = this.page.url();
          const isLoginPage =
            currentUrl.includes('/login') ||
            currentUrl.includes('/signin') ||
            currentUrl.includes('/auth');

          if (isLoginPage && attempt > 1) {
            console.warn(
              `[Kofile/${this.countyName}] Session redirected to login — ` +
              `waiting ${RATE_LIMIT_MS.SESSION_EXPIRY / 1000}s then retrying (attempt ${attempt})`,
            );
            await this.sleep(RATE_LIMIT_MS.SESSION_EXPIRY);
            // Re-navigate to the base URL (Kofile public search is anonymous)
            await this.page.goto(this.config.baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
            await this.page.waitForTimeout(2_000);
          }
        }

        return await fn();
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);

        // Detect session-expiry symptoms: navigation timeout, page crash, net errors
        const isSessionError =
          msg.includes('net::ERR_') ||
          msg.includes('Navigation timeout') ||
          msg.includes('Target closed') ||
          msg.includes('Session closed');

        if (isSessionError && attempt < MAX_SESSION_RETRIES) {
          console.warn(
            `[Kofile/${this.countyName}] Session error on attempt ${attempt}/${MAX_SESSION_RETRIES}: ${msg}`,
          );
          // Destroy and re-initialise the browser session
          await this.destroySession().catch(() => {});
          await this.sleep(RATE_LIMIT_MS.SESSION_EXPIRY);
          await this.initSession();
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  /** Promise-based sleep helper */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => { setTimeout(resolve, ms); });
  }

  /** Build a Kofile results URL from a search term. Verified against the live site 2026-08-02.
   *
   *  The old construction — `?searchOper=…&searchString=…` — is IGNORED by the site and returns a
   *  results page with zero rows and no error. That is worse than a 404: a 404 fails loudly and the
   *  health check catches it, while an empty results page is indistinguishable from "this property
   *  has no records". Every search through this adapter was returning an empty index as an answer.
   *
   *  `recordedDateRange` is required — omitting it returns nothing. The default spans everything,
   *  because a chain of title needs the earliest instrument the county holds. */
  private resultsUrl(
    term: string,
    opts: { limit?: number; offset?: number; ocr?: boolean; from?: string; to?: string; department?: string } = {},
  ): string {
    // Prefer the county's OWN published span. The site rejects a range outside it — sending
    // 18000101 to Travis, whose index starts 18010101, is what made it look broken.
    const discovered = this.config.dateRange;
    const from = opts.from ?? discovered?.split(',')[0] ?? '18010101';
    const to = opts.to ?? discovered?.split(',')[1] ?? new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // These are the site's OWN parameter names, read off the address bar after driving its search
    // form (2026-08-02). `searchValue` + `searchType=quickSearch` is the indexed name search; the
    // legacy `q=` is a broader keyword sweep — on Milam the same term gives 5,484 against 220,777,
    // so they are different questions and the narrow one is what a grantor/grantee lookup wants.
    const params = new URLSearchParams({
      // Department codes are PER COUNTY. Milam's real property is 'RP'; Williamson's search form
      // defaults to 'CCM' (court minutes, indexed 1904–1999) and returns nothing for a deed search.
      // A county whose code is not 'RP' needs it read from its own department picker.
      department: opts.department ?? this.config.department ?? 'RP',
      searchType: 'quickSearch',
      searchValue: term,
      keywordSearch: 'false',
      recordedDateRange: `${from},${to}`,
      searchOcrText: String(opts.ocr ?? false),
      limit: String(opts.limit ?? 50),
      offset: String(opts.offset ?? 0),
    });
    return `${this.config.baseUrl}${this.config.searchPath}?${params.toString()}`;
  }

  // ── Search methods ────────────────────────────────────────────────────────────

  async searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    return this.withSessionRetry(async () => {
      console.log(`[Kofile/${this.countyName}] Searching instrument# ${instrumentNo}...`);

      const searchUrl = this.resultsUrl(instrumentNo);

      await this.page!.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await this.awaitResults();

      return this.parseSearchResults();
    });
  }

  async searchByVolumePage(volume: string, pg: string): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    return this.withSessionRetry(async () => {
      console.log(`[Kofile/${this.countyName}] Searching Vol ${volume}, Pg ${pg}...`);

      // The site exposes no volume/page operator. Its free-text search matches the column the
      // results table labels "Book/Volume/Page", so the two values are searched as one term.
      const searchUrl = this.resultsUrl(`${volume} ${pg}`);

      await this.page!.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await this.awaitResults();

      return this.parseSearchResults();
    });
  }

  async searchByGranteeName(
    name: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    return this.withSessionRetry(async () => {
      // Strip common entity suffixes that reduce search precision
      const cleanName = name
        .replace(/\b(LLC|INC|CORP|LP|LTD|TRUST|FAMILY|ET\s*AL|ET\s*UX)\b/gi, '')
        .trim();

      console.log(`[Kofile/${this.countyName}] Searching grantee: "${cleanName}"...`);

      // One free-text index covers both party columns; `parseSearchResults` reads the Grantor and
      // Grantee cells, so filtering by role happens after the search rather than in the URL.
      const searchUrl = this.resultsUrl(cleanName);

      await this.page!.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await this.awaitResults();

      const results = await this.parseSearchResults();

      // Too many hits — retry with the full name for precision
      if (results.length > 50) {
        console.log(
          `[Kofile/${this.countyName}] ${results.length} results — retrying with full name: "${name}"`,
        );
        const refinedUrl = this.resultsUrl(name);

        await this.page!.goto(refinedUrl, { waitUntil: 'networkidle', timeout: 30_000 });
        await this.awaitResults();
        return this.parseSearchResults();
      }

      return results;
    });
  }

  async searchByGrantorName(
    name: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    return this.withSessionRetry(async () => {
      const cleanName = name
        .replace(/\b(LLC|INC|CORP|LP|LTD|TRUST|FAMILY|ET\s*AL|ET\s*UX)\b/gi, '')
        .trim();

      console.log(`[Kofile/${this.countyName}] Searching grantor: "${cleanName}"...`);

      const searchUrl = this.resultsUrl(cleanName);

      await this.page!.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await this.awaitResults();

      return this.parseSearchResults();
    });
  }

  /** Search the scanned document TEXT — Kofile's search-by-land path (plan R39).
   *
   *  ── THIS METHOD USED TO RETURN AN EMPTY ARRAY ─────────────────────────────────────────────────
   *
   *  It logged "Legal description search not supported" and returned `[]`. Two things were wrong
   *  with that, and the second is worse than the first.
   *
   *  It was factually wrong: standard PublicSearch DOES support full-text search, through the
   *  `searchOcrText` parameter this adapter was already sending as `false`.
   *
   *  And it returned `[]` for an unsupported operation. A caller cannot tell that from "this land
   *  has no documents", so the platform's answer for every legal-description search across TWENTY
   *  Kofile counties — including Bell, the home county — was a silent, confident nothing.
   *
   *  ── THE TWO MODES ARE DIFFERENT SEARCHES, NOT BROADER AND NARROWER ────────────────────────────
   *
   *  Driven on Bell 2026-08-02 with the term HAMMIL:
   *
   *      searchOcrText=false   23 results, matching PARTY NAMES (HAMMILL ERICA, HAMMILL ANDREW P)
   *      searchOcrText=true     7 results, where the term appears NOWHERE in the row
   *
   *  The second set matched the OCR'd text inside the scanned documents. Turning OCR on does not
   *  widen the index search — it runs a different one. Anybody assuming it is a superset would
   *  conclude 16 documents had vanished. */
  async searchByLegalDescription(
    legalDesc: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    const term = (legalDesc ?? '').trim();
    if (!term) {
      throw new Error(`[Kofile/${this.countyName}] Empty legal description — refusing to search the whole index.`);
    }

    // Session first — superSearch() needs a page too, and calling it before initSession() threw
    // "Session not initialized" from inside a method that looked unrelated.
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    // SUPERSEARCH is deliberately NOT used here.
    //
    // Bell is flagged `hasSUPERSEARCH`, and routing through it times out waiting for a search input
    // that does not exist on the page — the same class of unverified URL that R37 found across four
    // vendors. The `searchOcrText` path below was driven and works, so the proven route wins over
    // the richer-sounding one. Re-enable SUPERSEARCH per county only after driving it.

    return this.withSessionRetry(async () => {
      console.log(`[Kofile/${this.countyName}] Full-text (OCR) search: "${term}"...`);
      await this.page!.goto(this.resultsUrl(term, { ocr: true }), { waitUntil: 'networkidle', timeout: 45_000 });
      await this.awaitResults();

      const results = await this.parseSearchResults();
      if (results.length === 0) {
        // Say what an empty full-text result does and does not mean. It searches the scanned page
        // TEXT, so a document indexed under a legal description it never spells out will not match.
        console.warn(
          `[Kofile/${this.countyName}] Full-text search for "${term}" returned nothing. This searched the OCR'd ` +
            `DOCUMENT TEXT, not the property-description index, so an absent result means the words do not appear in ` +
            `the scanned pages — NOT that no document touches this land. Try a party search, or a different phrasing ` +
            `of the survey or subdivision name.`,
        );
      }
      return results;
    });
  }

  // ── SUPERSEARCH (CountyFusion OCR full-text) ──────────────────────────────────

  private async superSearch(query: string): Promise<ClerkDocumentResult[]> {
    if (!this.page) throw new Error('Session not initialized');

    console.log(
      `[SUPERSEARCH/${this.countyName}] Full-text search: "${query.substring(0, 50)}..."`,
    );

    await this.page.goto(this.config.superSearchUrl!, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await this.page.waitForTimeout(1_000);

    // SUPERSEARCH exposes a single free-text input
    await this.page.fill(
      'input[type="text"], input[name="query"], #searchInput',
      query,
    );
    await this.page.keyboard.press('Enter');
    await this.awaitResults();  // OCR search is slower; wait for the table, not for a guess

    return this.parseSearchResults();
  }

  /** Wait for a results page to settle before reading it (plan R38).
   *
   *  Replaces a fixed 2-second delay after every search. Two seconds is enough on a fast day and not
   *  on a slow one, and the failure is silent: the parser reads an unrendered table, finds no rows,
   *  and the run reports "no records for this property" — which is a statement about the county's
   *  index, not about our patience.
   *
   *  Rows OR an explicit "no results" both count as settled; only a page showing neither is still
   *  working. */
  private async awaitResults(): Promise<void> {
    if (!this.page) return;
    const r = await waitForCondition(
      this.page as unknown as WaitablePage,
      RESULTS_SETTLED,
      '() => document.querySelectorAll("table tbody tr").length',
      { label: `${this.countyName} search results`, timeoutMs: 30_000 },
    );
    if (!r.ready) {
      // Logged rather than thrown: the parser reports the empty page honestly, and one slow search
      // must not end a 25-minute run.
      console.warn(`[Kofile/${this.countyName}] ${r.statement}`);
    }
  }

  // ── Search result DOM parser ──────────────────────────────────────────────────

  private async parseSearchResults(): Promise<ClerkDocumentResult[]> {
    // No page means the session died, not that the county has no records. Returning [] here made a
    // browser failure indistinguishable from a property with nothing recorded against it.
    if (!this.page) {
      throw new Error(
        `[Kofile/${this.countyName}] Cannot parse results — the browser session is gone. ` +
          `This is a session failure, NOT an empty index.`,
      );
    }

    // A county whose portal has no land-records department will return an empty results page for
    // every deed search, and an empty result reads as "this property has no deeds" — the most
    // misleading answer this platform can give. Say which it is (plan R38).
    if (this.discovery?.noLandRecords) {
      console.warn(`[Kofile/${this.countyName}] ${this.discovery.reason}`);
      return [];
    }

    try {
      // Read the table's own headers and rows. Mapping by header text rather than by position is
      // what makes one adapter work across counties whose column sets differ — Bell renames them,
      // Montgomery has seventeen in another order (plan R38).
      const table = await this.page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('table thead th')).map((t) => (t.textContent ?? '').trim());
        const rows = Array.from(document.querySelectorAll('table tbody tr')).map((tr) =>
          Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()),
        );
        return { headers, rows };
      });

      const report = parseResults(table.headers, table.rows);
      console.log(describeParse(report, this.countyName));

      if (!report.fatal) {
        const results: ClerkDocumentResult[] = report.rows.map((r) => ({
          instrumentNumber: r.instrumentNumber,
          documentType: this.classifyDocumentType(r.documentType) as DocumentType,
          recordingDate: r.recordingDate,
          grantors: r.grantors,
          grantees: r.grantees,
          legalDescription: r.legalDescription,
          source: `kofile_${this.countyFIPS}`,
        }));

        if (results.length > 0) return results;
      }

      // Nothing parsed. The AI fallback below is for a page that rendered differently, NOT for one
      // that genuinely holds no records — so the reason is logged either way rather than an empty
      // array being returned as though it were an answer.
      console.warn(
        `[Kofile/${this.countyName}] Table parse produced no rows` +
        `${report.fatal ? ` — ${report.fatal}` : ''}. Trying the vision fallback.`,
      );
    } catch (e) {
      console.warn(`[Kofile/${this.countyName}] DOM parsing failed:`, e);
    }

    // Vision fallback when the SPA rendered something the table parser could not read.
    try {
      const screenshot = await this.page.screenshot({ fullPage: true });
      return await this.aiParseSearchResults(screenshot);
    } catch (e) {
      // Both parsers failed. That is a page we could not READ, which is the opposite of a page with
      // nothing on it — and the caller cannot tell the difference from an empty array.
      throw new Error(
        `[Kofile/${this.countyName}] Could not read the results page: the table parser failed and the ` +
          `vision fallback also failed (${(e as Error).message}). Treat as UNREAD, NOT as "no records".`,
      );
    }
  }

  // ── AI OCR fallback — parses a screenshot of search results via Claude ────────

  private async aiParseSearchResults(
    screenshot: Buffer,
  ): Promise<ClerkDocumentResult[]> {
    // Guard: AI fallback requires an Anthropic API key.  Skip gracefully when
    // the key is absent rather than crashing with a fetch auth error.
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn(
        `[Kofile/${this.countyName}] AI fallback skipped — ANTHROPIC_API_KEY not set`,
      );
      return [];
    }

    const base64 = screenshot.toString('base64');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelFor('read_scan').model,
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: base64 },
            },
            {
              type: 'text',
              text: `This is a county clerk document search results page (Kofile/PublicSearch system).

Extract ALL document records visible. Return JSON array:
[{
  "instrumentNumber": "string (10-13 digit number)",
  "documentType": "warranty_deed|plat|easement|deed_of_trust|restrictive_covenant|other",
  "recordingDate": "MM/DD/YYYY",
  "grantors": ["name1", "name2"],
  "grantees": ["name1", "name2"],
  "volumePage": { "volume": "string", "page": "string" } or null,
  "pageCount": number or null
}]

Return ONLY valid JSON, no explanation. If no results visible, return [].`,
            },
          ],
        }],
      }),
    });

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text ?? '[]';

    try {
      const parsed = JSON.parse(text.replace(/```json?|```/g, '').trim()) as unknown[];
      return parsed.map((item) => {
        const rec = item as Record<string, unknown>;
        return {
          instrumentNumber: String(rec.instrumentNumber ?? ''),
          documentType: this.classifyDocumentType(String(rec.documentType ?? 'other')),
          recordingDate: String(rec.recordingDate ?? ''),
          grantors: Array.isArray(rec.grantors) ? rec.grantors.map(String) : [],
          grantees: Array.isArray(rec.grantees) ? rec.grantees.map(String) : [],
          volumePage:
            rec.volumePage &&
            typeof rec.volumePage === 'object' &&
            'volume' in (rec.volumePage as object)
              ? {
                  volume: String((rec.volumePage as Record<string, unknown>).volume ?? ''),
                  page: String((rec.volumePage as Record<string, unknown>).page ?? ''),
                }
              : undefined,
          pageCount: typeof rec.pageCount === 'number' ? rec.pageCount : undefined,
          source: `kofile_${this.countyFIPS}_ai`,
        } satisfies ClerkDocumentResult;
      });
    } catch (e) {
      // The model's reply could not be parsed. Unread, not empty.
      throw new Error(
        `[Kofile/${this.countyName}] The AI results parser returned something unusable ` +
          `(${(e as Error).message}). Treat as UNREAD, NOT as "no records".`,
      );
    }
  }

  // ── Document image retrieval ──────────────────────────────────────────────────

  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const images: DocumentImage[] = [];
    const outputDir = path.join(this.downloadDir, instrumentNo);
    fs.mkdirSync(outputDir, { recursive: true });

    const viewerUrl = `${this.config.baseUrl}${this.config.viewerPath}${instrumentNo}`;
    console.log(
      `[Kofile/${this.countyName}] Opening document viewer: ${instrumentNo}...`,
    );

    await this.page.goto(viewerUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await this.page.waitForTimeout(2_000);

    // ── Determine total page count ──────────────────────────────────────────────

    let totalPages = 1;

    // Try "Page X of Y" / "of N" indicator
    const pageIndicator = await this.page.$(
      '.page-indicator, .page-count',
    );
    if (pageIndicator) {
      const indicatorText = await pageIndicator.innerText();
      const match = indicatorText.match(/of\s+(\d+)/i);
      if (match) totalPages = parseInt(match[1], 10);
    }

    // Also check for page thumbnail strip
    if (totalPages <= 1) {
      const thumbnails = await this.page.$$(
        '.page-thumbnail, .thumbnail-item, .page-nav-item',
      );
      if (thumbnails.length > totalPages) totalPages = thumbnails.length;
    }

    // AI fallback for unusual viewer layouts
    if (totalPages <= 1) {
      const screenshot = await this.page.screenshot();
      const aiCount = await this.aiDetectPageCount(screenshot);
      if (aiCount > 1) totalPages = aiCount;
    }

    console.log(
      `[Kofile/${this.countyName}] Document ${instrumentNo}: ${totalPages} pages`,
    );

    // ── Download each page ──────────────────────────────────────────────────────

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        // Navigate to next page (page 1 is already loaded)
        if (pageNum > 1) {
          const nextBtn = await this.page.$(
            '.next-page, button:has-text("Next"), .page-next',
          );
          if (nextBtn) {
            await nextBtn.click();
            await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
          } else {
            // Try direct page-number button
            const pageBtn = await this.page.$(
              `.page-nav-item:nth-child(${pageNum})`,
            );
            if (pageBtn) {
              await pageBtn.click();
              await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
            }
          }
        }

        const imageUrl = await this.extractImageUrl();

        if (imageUrl) {
          const filename = `${instrumentNo}_p${pageNum}.png`;
          const filepath = path.join(outputDir, filename);

          await this.downloadImage(imageUrl, filepath);

          // Quality guard: reject images that are too small to be real documents
          // (< 10 KB = broken/placeholder; < 500 px = thumbnail, not full-res scan)
          let quality: DocumentImage['quality'] = 'fair';
          try {
            const stat = fs.statSync(filepath);
            if (stat.size < 10_240) {
              console.warn(
                `[Kofile/${this.countyName}] Page ${pageNum} image too small ` +
                `(${stat.size} bytes) — likely broken; skipping`,
              );
              fs.unlinkSync(filepath);
              continue;
            }
            if (stat.size > 500_000) quality = 'good';
          } catch { /* stat failed — keep the image anyway */ }

          images.push({
            instrumentNumber: instrumentNo,
            pageNumber: pageNum,
            totalPages,
            imagePath: filepath,
            imageUrl,
            isWatermarked: true,  // Kofile free previews are always watermarked
            quality,
          });

          console.log(
            `[Kofile/${this.countyName}] Downloaded page ${pageNum}/${totalPages}: ${filename}`,
          );
        } else {
          console.warn(
            `[Kofile/${this.countyName}] Could not extract image URL for page ${pageNum}`,
          );

          // Fallback: screenshot the viewer container element
          const viewerEl = await this.page.$(
            '.document-viewer, .image-viewer, #documentImage, .viewer-content',
          );
          if (viewerEl) {
            const filename = `${instrumentNo}_p${pageNum}_screenshot.png`;
            const filepath = path.join(outputDir, filename);
            await viewerEl.screenshot({ path: filepath });

            images.push({
              instrumentNumber: instrumentNo,
              pageNumber: pageNum,
              totalPages,
              imagePath: filepath,
              isWatermarked: true,
              quality: 'poor',
            });
          }
        }

        // Polite rate-limiting between page requests
        await this.page.waitForTimeout(RATE_LIMIT_MS.DOCUMENT_DOWNLOAD);

      } catch (e) {
        console.warn(`[Kofile/${this.countyName}] Error on page ${pageNum}:`, e);
      }
    }

    // ── Nothing captured is not "this document has no pages" ────────────────────
    //
    // The viewer walk above is selector-driven, and a Kofile viewer that has changed its class names
    // yields zero images while every step reports success. Returning `[]` there says the document
    // has no pages — about a document the index just told us has some — which is the silent-empty
    // defect this codebase has a ratchet for, applied to the one artifact a surveyor actually reads.
    //
    // Before giving up, fall through to the capture proven in production against Bell (the
    // grab-docs workflow, on the 3779 FM 436 session). It is not a duplicate of the above: it
    // disables the browser HTTP cache, which matters because Kofile serves SIGNED S3 URLs that
    // expire, and a cached page hands back stale URLs and captures nothing. That is exactly the
    // shape of failure this fallback exists to catch.
    if (images.length === 0) {
      console.warn(
        `[Kofile/${this.countyName}] Viewer walk captured 0 pages for ${instrumentNo} — ` +
          `retrying with the production capture path.`,
      );
      const { fetchDocumentImages } = await import('../services/bell-clerk.js');
      const { PipelineLogger } = await import('../lib/logger.js');
      const pages = await fetchDocumentImages(
        instrumentNo,
        20,
        new PipelineLogger(`kofile-${this.countyFIPS}`),
        this.countyName,
        // The adapter's OWN verified base URL, not the county-name lookup in bell-clerk's config —
        // that map still lists Coryell, McLennan, Falls and Lampasas, whose portals were probed dead
        // in R37/R38. This adapter was only constructed because the county is in the verified
        // routing set, so its URL is the trustworthy one.
        this.config.baseUrl,
      );

      for (const p of pages) {
        const filename = `${instrumentNo}_p${p.pageNumber}.${p.imageFormat}`;
        const filepath = path.join(outputDir, filename);
        try {
          fs.writeFileSync(filepath, Buffer.from(p.imageBase64, 'base64'));
        } catch (e) {
          console.warn(`[Kofile/${this.countyName}] Could not write ${filename}:`, e);
          continue;
        }
        images.push({
          instrumentNumber: instrumentNo,
          pageNumber: p.pageNumber,
          totalPages: pages.length,
          imagePath: filepath,
          imageUrl: p.signedUrl ?? undefined,
          isWatermarked: true,
          quality: 'fair',
        });
      }
    }

    if (images.length === 0) {
      // Both paths failed. Say so rather than handing back an empty array that reads as a finding
      // about the document — the packet would then print "no page image is held" as though the
      // county had none, when what happened is that we could not open the viewer.
      throw new Error(
        `[Kofile/${this.countyName}] Could not capture any page image for ${instrumentNo} — the ` +
          `viewer did not yield one and the production capture path also returned nothing. This is a ` +
          `RETRIEVAL failure, not a document without pages: the index listed this instrument.`,
      );
    }

    return images;
  }

  // ── Image URL extraction ──────────────────────────────────────────────────────

  /**
   * Extract the URL of the document image currently displayed in the viewer.
   * Kofile uses signed AWS S3 URLs; these expire after ~15 minutes.
   */
  private async extractImageUrl(): Promise<string | null> {
    if (!this.page) return null;

    // Method 1: <img> tag with a recognisable S3 / Kofile src
    const imgSrcs = await this.page.$$eval(
      'img[src*="amazonaws"], img[src*="blob:"], img[src*="kofile"], .viewer-image img',
      (imgs) => imgs.map((img) => (img as HTMLImageElement).src),
    );

    for (const src of imgSrcs) {
      if (
        src &&
        (src.includes('amazonaws') || src.startsWith('blob:') || src.includes('kofile'))
      ) {
        return src;
      }
    }

    // Method 2: intercept the next network response for an image resource
    const imageUrls: string[] = [];
    const responseHandler = (response: import('playwright').Response): void => {
      const url = response.url();
      if (
        /\.(png|jpe?g|tiff?)(\?|$)/i.test(url) ||
        /GetImage|image\/page/i.test(url)
      ) {
        imageUrls.push(url);
      }
    };
    this.page.on('response', responseHandler);

    // Trigger the viewer to request the image again
    await this.page.evaluate(() => {
      const viewer = document.querySelector(
        '.viewer-image, .document-image, #pageImage',
      ) as HTMLElement | null;
      if (viewer) viewer.click();
    });
    await this.page.waitForTimeout(2_000);

    this.page.off('response', responseHandler);

    if (imageUrls.length > 0) return imageUrls[imageUrls.length - 1];

    // Method 3: CSS background-image on the viewer element
    const bgUrl = await this.page.evaluate(() => {
      const viewer = document.querySelector(
        '.viewer-image, .document-image, .page-image',
      );
      if (viewer) {
        const bg = getComputedStyle(viewer).backgroundImage;
        const match = bg.match(/url\(["']?(.+?)["']?\)/);
        return match ? match[1] : null;
      }
      return null;
    });

    return bgUrl;
  }

  // ── Image download ────────────────────────────────────────────────────────────

  private async downloadImage(url: string, filepath: string): Promise<void> {
    // Blob URLs must be fetched inside the page context
    if (url.startsWith('blob:')) {
      const buffer = await this.page!.evaluate(async (blobUrl: string) => {
        const res = await fetch(blobUrl);
        const blob = await res.blob();
        const ab = await blob.arrayBuffer();
        return Array.from(new Uint8Array(ab));
      }, url);

      fs.writeFileSync(filepath, Buffer.from(buffer));
      return;
    }

    // Regular https URLs
    return new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(filepath);

      const handleResponse = (response: import('http').IncomingMessage): void => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const location = response.headers.location;
          if (!location) {
            reject(new Error('Redirect with no Location header'));
            return;
          }
          https.get(location, { timeout: 30_000 }, handleResponse).on('error', reject);
        } else {
          response.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
          file.on('error', reject);
        }
      };

      https.get(url, { timeout: 30_000 }, handleResponse).on('error', reject);
    });
  }

  // ── AI page-count detection ───────────────────────────────────────────────────

  private async aiDetectPageCount(screenshot: Buffer): Promise<number> {
    const base64 = screenshot.toString('base64');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelFor('read_scan').model,
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: base64 },
            },
            {
              type: 'text',
              text:
                'This is a document viewer. How many total pages does this document have? ' +
                'Look for "Page X of Y" indicators, page navigation buttons, or page count displays. ' +
                'Return ONLY a number.',
            },
          ],
        }],
      }),
    });

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text ?? '1';
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  // ── Pricing information ───────────────────────────────────────────────────────

  /**
   * Detect per-document purchase pricing from the document viewer page.
   * Most Kofile-powered counties charge $1.00/page for un-watermarked copies.
   */
  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const viewerUrl = `${this.config.baseUrl}${this.config.viewerPath}${instrumentNo}`;
    await this.page.goto(viewerUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await this.page.waitForTimeout(2_000);

    // Look for a price mentioned near a purchase / download button
    const priceText = await this.page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll(
        'button, a, .price, .cost, .download-btn, .purchase-btn',
      ));
      for (const el of candidates) {
        const text = el.textContent ?? '';
        if (text.match(/\$\d+\.?\d*/)) return text;
      }
      return null;
    });

    if (priceText) {
      const priceMatch = priceText.match(/\$(\d+\.?\d*)/);
      const totalPrice = priceMatch ? parseFloat(priceMatch[1]) : 1.00;
      const pageCount = Math.round(totalPrice / 1.00);

      return {
        available: true,
        pricePerPage: 1.00,
        totalPrice,
        pageCount,
        paymentMethod: 'credit_card',
        source: `kofile_${this.countyFIPS}`,
      };
    }

    // Default assumption: $1.00/page (standard for Kofile Texas counties)
    return {
      available: true,
      pricePerPage: 1.00,
      source: `kofile_${this.countyFIPS}_estimated`,
    };
  }
}

/**
 * Counties whose PublicSearch portal was IDENTIFIED but not yet DRIVEN (plan R39d, 2026-08-04).
 *
 * ── WHY THESE ARE NOT IN `KOFILE_CONFIGS` ───────────────────────────────────────────────────────
 *
 * The bar in this file is explicit: *"Verified means the search form was driven, rows came back, and
 * the headers mapped. Nothing goes in this table because a URL returned 200 — that is exactly how
 * the platform ended up claiming 53 Kofile counties when it had 21."*
 *
 * These two clear every check short of that one:
 *
 *   * both hosts resolve, on **35.247.2.99** — the same address as the proven `bell` and `travis`
 *     portals, i.e. the same PublicSearch cluster;
 *   * both render an official county-clerk record search naming the right county and clerk;
 *   * both expose the field labels this adapter drives — *Search Term*, *Date Range*,
 *     *Recorded Date*, *Search Index & Full Text (OCR)*;
 *   * Gillespie's own county website links to it as its records portal.
 *
 * What has NOT happened is a search executed and its rows parsed. So they are recorded here, where
 * a proving pass can pick them up, and they route nowhere.
 *
 * ── WHY IT MATTERS THAT THEY WERE FOUND AT ALL ──────────────────────────────────────────────────
 *
 * Both were in `HENSCHEN_CONFIGS`, pointed at `llano.co.texas.us` and `records.gillespiecountyclerk.com`
 * — hostnames that **do not exist and never did** (R39b measured all 16 Henschen hosts as ENOTFOUND).
 * So the platform believed it knew where these counties' records were, and was wrong; the real
 * portals are on a vendor it has already proven, under the exact hostname pattern this adapter
 * derives for a county with no explicit config.
 *
 * ── ONE THING TO CARRY INTO THE DRIVEN PASS ─────────────────────────────────────────────────────
 *
 * Both pages now say **"Powered by Neumo"**, not Kofile or GovOS. Same product, same field labels,
 * same cluster — a rebrand, not a different system. Worth knowing before somebody reads "Neumo" on
 * screen, concludes the adapter is pointed at the wrong vendor, and rewrites something that works.
 */
export const KOFILE_IDENTIFIED_NOT_DRIVEN: Record<string, { county: string; url: string; evidence: string }> = {
  '48171': {
    county: 'Gillespie',
    url: 'https://gillespie.tx.publicsearch.us',
    evidence: "linked from gillespiecounty.gov as the county's records portal; resolves on the proven cluster; clerk named on the page",
  },
  '48299': {
    county: 'Llano',
    url: 'https://llano.tx.publicsearch.us',
    evidence: 'resolves on the proven cluster; renders the Llano County clerk record search with the expected field labels',
  },
};
