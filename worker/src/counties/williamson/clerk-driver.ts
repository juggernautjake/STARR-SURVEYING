/**
 * Williamson County Clerk — the browser driver.
 *
 * `clerk.ts` knows the shape of this site: the field ids, the chip-list rule, how a result row
 * reads. This file is the half that actually drives it, and it exists because the name search
 * CANNOT be done with fetch — the search term is not the text in the box, it is the chip that
 * appears after a suggestion is clicked.
 *
 * ── THE RECIPE, EXECUTED ────────────────────────────────────────────────────────────────────────
 *
 *   1. `/user/disclaimer` → click "I Accept". Acceptance rides the session; nothing works before it.
 *   2. `/search/DOCSEARCH149S1`
 *   3. For a NAME search: type one character at a time (a `fill()` sets the value without firing
 *      the key handlers, so the suggestion request never goes out), wait for the dropdown, and
 *      click every variant that belongs to the entity.
 *   4. For an INSTRUMENT or BOOK/PAGE search: a plain fill is correct and no dropdown is involved.
 *   5. Click `#searchButton` — an <a>, not a submit input.
 *   6. Read `.ss-search-row`.
 *
 * Proven on 2026-09-21: four "ROUND ROCK HOUSING*" variants selected together returned 18
 * documents in one query, and "VILLAGE GREEN" returned the 1979 subdivision plat at Cabinet D,
 * page 258.
 *
 * ── EVERY EXIT IS CLASSIFIED ────────────────────────────────────────────────────────────────────
 *
 * A search that did not run must never be reported as a search that found nothing. Each return
 * path here carries a `RejectionVerdict` from `research/site-rejection.ts` saying whether the
 * silence is about the property or about us.
 */

import type { Browser } from 'playwright';
import { WILLIAMSON_ENDPOINTS } from './config/endpoints.js';
import {
  planClerkSearch, parseClerkRow, totalResults, nameFieldSelectors,
  RESULT_ROW_SELECTOR, type ClerkQuery, type ClerkRecord, type ClerkSearchPlan,
} from './clerk.js';
import { variantsToSearch, readSuggestions } from './name-variants.js';
import { readSearchPage, readTransportError, type RejectionVerdict } from '../../research/site-rejection.js';

/** A complete, well-formed Chrome UA. See the note in `searchWilliamsonClerk`. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';

export interface ClerkSearchOutcome {
  records: ClerkRecord[];
  /** What the county said it matched, which can exceed the rows on page one. */
  total: number | null;
  /** The names actually put in the chip list, for the run log. */
  namesUsed: string[];
  plan: ClerkSearchPlan;
  verdict: RejectionVerdict;
}

export interface ClerkDriverOptions {
  /** Cap the rows read off page one. The default is the page size. */
  maxRows?: number;
  /**
   * Ask the index for spelling variants and select them all.
   *
   * On by default because it is the difference between four documents and eighteen — the county
   * holds six spellings of one housing authority. Turn it off for a name already known to be
   * exact.
   */
  expandVariants?: boolean;
  log?: (level: 'info' | 'warn', message: string) => void;
}

const empty = (plan: ClerkSearchPlan, verdict: RejectionVerdict): ClerkSearchOutcome =>
  ({ records: [], total: null, namesUsed: [], plan, verdict });

/**
 * Run one clerk search.
 *
 * The browser is passed in rather than acquired, so the caller owns the session and one page can
 * serve several searches — the disclaimer is accepted once per session, and re-accepting it for
 * every name is both slower and a different session each time.
 */
export async function searchWilliamsonClerk(
  browser: Browser,
  query: ClerkQuery,
  opts: ClerkDriverOptions = {},
): Promise<ClerkSearchOutcome> {
  const log = opts.log ?? (() => {});
  const plan = planClerkSearch(query);

  if (!plan.runnable) {
    // Not a failure and not an empty result — a query we declined to send. Saying so plainly keeps
    // it out of the "this property has no documents" bucket.
    return empty(plan, {
      kind: 'bad_query', aboutUs: false, retryable: false,
      message: `No clerk search was made: ${plan.why}.`, remedy: null,
    });
  }

  // A COMPLETE user-agent. Several adapters in this repo carry a malformed one missing both
  // "(KHTML, like Gecko)" and the trailing "Safari/537.36", and the common browser-detection
  // libraries match Chrome by `Chrome/(\d+)` FOLLOWED BY `Safari/` — so the short string falls
  // through every branch into the "ancient browser" bucket and earns an update-your-browser wall.
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
  });

  try {
    const page = await context.newPage();
    const base = WILLIAMSON_ENDPOINTS.clerk.home.replace(/\/$/, '');

    // ── 1 · THE GATE ───────────────────────────────────────────────────────────────────────────
    await page.goto(`${base}/user/disclaimer`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const accept = page.getByRole('button', { name: WILLIAMSON_ENDPOINTS.clerk.acceptButton });
    if (await accept.count()) {
      await accept.first().click();
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }

    // ── 2 · THE SEARCH PAGE ────────────────────────────────────────────────────────────────────
    await page.goto(WILLIAMSON_ENDPOINTS.clerk.search, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // A wall here means nothing below will work, and it is OUR problem rather than the county's.
    const gateText = await page.innerText('body').catch(() => '');
    const gate = readSearchPage(gateText);
    if (gate.kind === 'browser_wall' || gate.kind === 'bot_wall') {
      log('warn', `[WilliamsonClerk] ${gate.message}`);
      return empty(plan, gate);
    }

    // ── 3 · THE PLAIN FIELDS ───────────────────────────────────────────────────────────────────
    for (const [id, value] of Object.entries(plan.textFields)) {
      await page.fill(`#${id}`, value).catch(() => {});
    }

    // ── 4 · THE CHIP FIELDS ────────────────────────────────────────────────────────────────────
    const namesUsed: string[] = [];
    for (const [field, typed] of Object.entries(plan.nameFields)) {
      const sel = nameFieldSelectors(field as Parameters<typeof nameFieldSelectors>[0]);

      // Ask the index how it spells this, unless the caller said not to.
      let wanted = [typed as string];
      if (opts.expandVariants !== false) {
        const suggestions = await suggestThroughPage(page, field, typed as string);
        wanted = variantsToSearch(typed as string, suggestions);
        if (wanted.length > 1) {
          log('info', `[WilliamsonClerk] "${typed}" → ${wanted.length} spellings in the county's index: ${wanted.join(' · ')}`);
        }
      }

      // Type ONE CHARACTER AT A TIME. `fill()` sets the value without firing the key handlers, so
      // the suggestion request never goes out and the dropdown never appears.
      await page.click(sel.input).catch(() => {});
      await page.type(sel.input, typed as string, { delay: 45 }).catch(() => {});

      // Wait for the dropdown the typing triggered.
      await page.waitForSelector(`${sel.list} li`, { timeout: 8_000 }).catch(() => {});

      const picked = await page.evaluate(
        ({ listSel, want }: { listSel: string; want: string[] }) => {
          const list = document.querySelector(listSel);
          if (!list) return [] as string[];
          const chosen: string[] = [];
          const wantUpper = want.map((w) => w.toUpperCase());
          for (const li of Array.from(list.querySelectorAll('li'))) {
            const text = (li.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text) continue;
            if (!wantUpper.includes(text.toUpperCase())) continue;
            const clickable = (li.querySelector('a') as HTMLElement | null) ?? (li as HTMLElement);
            clickable.click();
            chosen.push(text);
          }
          return chosen;
        },
        { listSel: sel.list, want: wanted },
      ).catch(() => [] as string[]);

      namesUsed.push(...picked);

      // Nothing selected means no search term was submitted — the exact condition that returns
      // "Your search could not be completed" and gets misread as "no results".
      if (picked.length === 0) {
        log('warn', `[WilliamsonClerk] The index offered no entry matching "${typed}" — that name is not in it.`);
        return {
          ...empty(plan, {
            kind: 'ok', aboutUs: false, retryable: false,
            message: `The county's name index contains no entry for "${typed}". The search was not ` +
              'submitted, because submitting an unselected name returns a refusal rather than an ' +
              'empty result — but the absence of the name IS the finding.',
            remedy: null,
          }),
          namesUsed,
        };
      }
    }

    // ── 5 · GO ─────────────────────────────────────────────────────────────────────────────────
    await page.click(WILLIAMSON_ENDPOINTS.clerk.searchButton);
    await page.waitForSelector(`${RESULT_ROW_SELECTOR}, .ss-utility-box`, { timeout: 25_000 }).catch(() => {});
    await page.waitForTimeout(800);

    // ── 6 · READ ───────────────────────────────────────────────────────────────────────────────
    const pageText = await page.innerText('body').catch(() => '');
    const rowTexts = await page.$$eval(RESULT_ROW_SELECTOR, (els) => els.map((e) => (e as HTMLElement).innerText));

    const verdict = readSearchPage(pageText, { rowCount: rowTexts.length });
    if (verdict.kind !== 'ok') {
      log('warn', `[WilliamsonClerk] ${verdict.message}`);
      return { ...empty(plan, verdict), namesUsed };
    }

    const cap = opts.maxRows ?? 200;
    const records = rowTexts.slice(0, cap)
      .map(parseClerkRow)
      .filter((r): r is ClerkRecord => r !== null);

    const total = totalResults(pageText);
    log('info',
      `[WilliamsonClerk] ${plan.description} → ${records.length} row(s)` +
      (total !== null && total > records.length ? ` of ${total} the county reports` : ''));

    return { records, total, namesUsed, plan, verdict };
  } catch (e) {
    // A thrown navigation is classified the same way a failed fetch is, so a DNS error and a
    // refused tunnel do not both read as "the clerk is down".
    const verdict = readTransportError(e);
    log('warn', `[WilliamsonClerk] ${verdict.message}`);
    return empty(plan, verdict);
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * The county's rows as the pipeline's document shape.
 *
 * Index rows only — this is what the clerk PUBLISHES for free, and it is a great deal: grantor,
 * grantee, legal description, book/page, type and date on every row. What it is not is the
 * document image, which costs money at the counter or through TexasFile.
 *
 * `textContent` carries the legal description rather than null, because the extraction stage reads
 * that field and a legal description is genuinely the document's most useful line. Leaving it null
 * would throw away the one piece of substance a free index row has.
 */
export function toDocumentRefs(
  records: readonly ClerkRecord[],
): Array<{
  instrumentNumber: string | null;
  volume: string | null;
  page: string | null;
  documentType: string;
  recordingDate: string | null;
  grantors: string[];
  grantees: string[];
  source: string;
  url: string | null;
  legalDescription: string | null;
}> {
  return records.map((r) => ({
    instrumentNumber: r.instrument,
    // The county calls it a book; the pipeline's field is `volume`. Same number, and mapping it
    // here is what lets a Williamson row be cited the same way a Bell one is.
    volume: r.book,
    page: r.page,
    documentType: r.documentType ?? 'UNKNOWN',
    recordingDate: r.recordedAt,
    grantors: r.grantors,
    grantees: r.grantees,
    source: 'Williamson County Clerk (Tyler)',
    // The index has no per-document permalink; the search that found it is the citation.
    url: WILLIAMSON_ENDPOINTS.clerk.search,
    legalDescription: r.legalDescription,
  }));
}

/**
 * Ask the suggestion endpoint from inside the page.
 *
 * Done in-page rather than with a server-side fetch because the endpoint is session-scoped: the
 * disclaimer acceptance lives in a cookie this context holds, and a bare fetch from the worker
 * would be a different session with no acceptance on it.
 */
async function suggestThroughPage(
  page: { evaluate: <A, R>(fn: (arg: A) => R | Promise<R>, arg: A) => Promise<R> },
  field: string,
  searchText: string,
): Promise<string[]> {
  const body = await page.evaluate(
    async ({ f, q }: { f: string; q: string }) => {
      try {
        const res = await fetch(
          `/williamsonweb/search/suggest/${f}?searchText=${encodeURIComponent(q)}&maxValues=1000`,
          { method: 'POST' },
        );
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    { f: field, q: searchText },
  ).catch(() => null);

  return readSuggestions(body);
}
