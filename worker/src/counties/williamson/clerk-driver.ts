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
  planClerkSearch, parseClerkRow, totalResults, nameFieldSelectors, TEXT_FIELDS,
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
  /**
   * How long to wait for the acceptance cookie before going on to look at the page anyway.
   *
   * Going on is deliberate: step 2b asks the better question — is the search form actually here —
   * and answers it in one call. This is only how long we are willing to sit still first.
   */
  acceptTimeoutMs?: number;
  log?: (level: 'info' | 'warn', message: string) => void;
}

const empty = (plan: ClerkSearchPlan, verdict: RejectionVerdict): ClerkSearchOutcome =>
  ({ records: [], total: null, namesUsed: [], plan, verdict });

/**
 * Run one clerk search.
 *
 * A thin wrapper over the many-search form, so a caller with one question does not have to build
 * an array. Both open exactly one session.
 */
export async function searchWilliamsonClerk(
  browser: Browser,
  query: ClerkQuery,
  opts: ClerkDriverOptions = {},
): Promise<ClerkSearchOutcome> {
  return (await searchWilliamsonClerkMany(browser, [query], opts))[0]!;
}

/**
 * Run several clerk searches down ONE session.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A LOOP AROUND THE SINGLE VERSION ─────────────────────────
 *
 * Walking a chain of title means one search per book/page citation — nine on the test parcel. The
 * obvious implementation opens a fresh browser context per citation, and it fails in production:
 * on the sixth search the county stops serving pages and answers
 *
 *     "Let's confirm you are human — Complete the security check before continuing."
 *
 * Nine rapid sessions from one address look exactly like a bot, because that is what a bot does.
 * Measured on 2026-09-21: a context per search reached 5 of 9 citations before the wall; ONE
 * session reusing one page reached 8 of 9 with no wall at all, and faster.
 *
 * The catch, and the reason the loop has to be careful: this site REMEMBERS the previous search's
 * criteria and silently ANDs them into the next one. An early probe made a wrong field look
 * correct for exactly this reason. So every search clears the whole form before filling its own —
 * navigating back to the search page is NOT enough.
 */
export async function searchWilliamsonClerkMany(
  browser: Browser,
  queries: readonly ClerkQuery[],
  opts: ClerkDriverOptions = {},
): Promise<ClerkSearchOutcome[]> {
  const log = opts.log ?? (() => {});
  const plans = queries.map((q) => planClerkSearch(q));

  // Not a failure and not an empty result — a query we declined to send. Saying so plainly keeps
  // it out of the "this property has no documents" bucket.
  const declined = (plan: ClerkSearchPlan) => empty(plan, {
    kind: 'bad_query' as const, aboutUs: false, retryable: false,
    message: `No clerk search was made: ${plan.why}.`, remedy: null,
  });

  if (plans.every((p) => !p.runnable)) return plans.map(declined);

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
    //
    // Waiting on a LOAD STATE here is the bug that cost a whole live run. The site is jQuery
    // Mobile: the accept button is a real `type=submit`, but jQuery Mobile intercepts the submit
    // and does an AJAX page transition, so the navigation trace reads
    //
    //     /user/disclaimer  →  /user/disclaimer#/williamsonweb/  →  /williamsonweb/
    //
    // The middle step is a HASH CHANGE, not a document load — so `waitForLoadState` resolves
    // instantly against the document already sitting there, and the code races on while the POST
    // that grants acceptance is still in flight. The search page then redirects straight back to
    // the disclaimer, every field is absent, and the driver spends 30 seconds clicking a button
    // that was never on the page before reporting "no documents" for a property that has twelve.
    //
    // So wait for the THING ITSELF: the cookie the server sets when it accepts the acceptance.
    // Two attempts, because the gate fails INTERMITTENTLY. Walking nine citations in one run, the
    // first seven sailed through and the last two were bounced — the same code, the same session
    // settings, a different answer. Whatever the county does under repeated rapid acceptance, a
    // second try costs one page load and turns a reported fault back into a document.
    let cookieSeen = false;
    let gateText = '';
    let onForm = false;

    for (let attempt = 1; attempt <= 2 && !onForm; attempt++) {
      if (attempt > 1) {
        log('info', '[WilliamsonClerk] The search form did not appear; accepting the disclaimer again.');
        await page.waitForTimeout(1_500);
      }

      await page.goto(`${base}/user/disclaimer`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      const accept = page.getByRole('button', { name: WILLIAMSON_ENDPOINTS.clerk.acceptButton });
      if (await accept.count()) {
        await accept.first().click();
        cookieSeen = await waitForCookie(
          context, WILLIAMSON_ENDPOINTS.clerk.acceptCookie, opts.acceptTimeoutMs ?? 20_000);
      }

      // ── 2 · THE SEARCH PAGE ──────────────────────────────────────────────────────────────────
      await page.goto(WILLIAMSON_ENDPOINTS.clerk.search, { waitUntil: 'domcontentloaded', timeout: 45_000 });

      // A wall here means nothing below will work, and it is OUR problem rather than the county's.
      gateText = await page.innerText('body').catch(() => '');
      const gate = readSearchPage(gateText);
      if (gate.kind === 'browser_wall' || gate.kind === 'bot_wall') {
        log('warn', `[WilliamsonClerk] ${gate.message}`);
        return plans.map((p) => empty(p, gate));
      }

      // ── 2b · ARE WE ACTUALLY ON THE SEARCH PAGE? ─────────────────────────────────────────────
      //
      // Never fill, click and read a page we have not confirmed is the form. When acceptance does
      // not stick the server answers 200 with the DISCLAIMER — a success status carrying the
      // wrong page — and every step after this reads as "the property has no documents" instead
      // of "we never got in". One cheap assertion converts a silent false negative into a named
      // fault.
      onForm = await page.locator(WILLIAMSON_ENDPOINTS.clerk.searchButton).count() > 0;
    }

    // The wall the citation walk actually hits. `readSearchPage` classifies it, but only if it is
    // asked — and until 2026-09-21 this text reached the "no search form" branch instead and was
    // reported as a session problem with a remedy about cookies. Ask first.
    if (!onForm) {
      const wall = readSearchPage(gateText);
      if (wall.kind === 'bot_wall' || wall.kind === 'browser_wall' || wall.kind === 'rate_limited') {
        log('warn', `[WilliamsonClerk] ${wall.message}`);
        return plans.map((p) => empty(p, wall));
      }
    }

    if (!onForm) {
      // Say what was actually there. The first version of this message asserted the disclaimer had
      // bounced us, and printed a "came back as" URL identical to the one requested — which told
      // whoever read the log nothing and was not even true. What the page HELD is the evidence.
      const looksLikeDisclaimer = /indemnify and hold harmless|does not certify the authenticity/i
        .test(gateText);
      const heading = gateText.replace(/\s+/g, ' ').trim().slice(0, 160);

      const verdict: RejectionVerdict = {
        kind: 'needs_session', aboutUs: true, retryable: true,
        message:
          'The clerk served no search form, twice. The acceptance cookie was ' +
          `${cookieSeen ? 'set' : 'NOT set'}, and the page it returned ` +
          (looksLikeDisclaimer ? 'was the disclaimer again' : `began "${heading}"`) + '.',
        remedy: cookieSeen
          ? 'Acceptance worked, so the gate is not what we failed. Something else is between us ' +
            'and the form — read the page text above; it usually names itself.'
          : 'Acceptance is a cookie the server sets on the POST behind "I Accept". Confirm the ' +
            `"${WILLIAMSON_ENDPOINTS.clerk.acceptCookie}" cookie is present before navigating; a ` +
            'page load state is not enough, because jQuery Mobile transitions by hash.',
      };
      log('warn', `[WilliamsonClerk] ${verdict.message}`);
      return plans.map((p) => empty(p, verdict));
    }

    // ── 3 · EVERY SEARCH, DOWN THE ONE SESSION ─────────────────────────────────────────────────
    const results: ClerkSearchOutcome[] = [];
    for (const [i, plan] of plans.entries()) {
      if (!plan.runnable) { results.push(declined(plan)); continue; }

      // Back to a clean form. The navigation alone does NOT clear the previous search — this site
      // keeps the criteria — so the fields are emptied explicitly below.
      if (i > 0) {
        await page.goto(WILLIAMSON_ENDPOINTS.clerk.search, { waitUntil: 'domcontentloaded', timeout: 45_000 })
          .catch(() => {});

        // A wall can appear part-way through a walk. Everything from here on is unreachable, and
        // saying so once is better than nine identical failures.
        if (await page.locator(WILLIAMSON_ENDPOINTS.clerk.searchButton).count() === 0) {
          const midText = await page.innerText('body').catch(() => '');
          const mid = readSearchPage(midText);
          const verdict: RejectionVerdict = mid.kind === 'ok'
            ? {
                kind: 'needs_session', aboutUs: true, retryable: true,
                message:
                  `The clerk stopped serving the search form after ${i} of ${plans.length} ` +
                  `search(es). The page began "${midText.replace(/\s+/g, ' ').trim().slice(0, 120)}".`,
                remedy: 'Re-run the remaining citations in a new session, more slowly.',
              }
            : mid;
          log('warn', `[WilliamsonClerk] ${verdict.message}`);
          for (const rest of plans.slice(i)) results.push(empty(rest, verdict));
          return results;
        }
      }

      results.push(await runOneSearch(page, plan, opts, log));
    }

    return results;
  } catch (e) {
    // A thrown navigation is classified the same way a failed fetch is, so a DNS error and a
    // refused tunnel do not both read as "the clerk is down".
    const verdict = readTransportError(e);
    log('warn', `[WilliamsonClerk] ${verdict.message}`);
    return plans.map((p) => empty(p, verdict));
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Fill the form and read the answer. The session is already open and the form is already on
 * screen — this function's whole job is one query.
 */
async function runOneSearch(
  page: {
    fill(sel: string, value: string, opts?: { timeout?: number }): Promise<void>;
    click(sel: string, opts?: { timeout?: number }): Promise<void>;
    type(sel: string, text: string, opts?: { delay?: number }): Promise<void>;
    innerText(sel: string): Promise<string>;
    waitForSelector(sel: string, opts?: { timeout?: number }): Promise<unknown>;
    waitForTimeout(ms: number): Promise<void>;
    evaluate: <A, R>(fn: (arg: A) => R | Promise<R>, arg: A) => Promise<R>;
    $$eval: (sel: string, fn: (els: Element[]) => string[]) => Promise<string[]>;
  },
  plan: ClerkSearchPlan,
  opts: ClerkDriverOptions,
  log: (level: 'info' | 'warn', message: string) => void,
): Promise<ClerkSearchOutcome> {
  try {
    // ── 3a · A CLEAN FORM ──────────────────────────────────────────────────────────────────────
    //
    // Not optional, and not achievable by navigating. The county carries the previous search's
    // criteria forward and ANDs them into this one, which turns a correct query into a silent
    // zero — and, worse, once made a WRONG field look right because the right one still held the
    // value from the search before.
    // The chip lists need NO clearing, and trying to clear them broke the page. They do not
    // survive a page load — verified on 2026-09-21 by selecting "SCOTT RALPH", reloading, and
    // finding the holder empty — while the text fields DO. That asymmetry is the whole rule:
    // reload handles the chips, and only the text boxes need emptying by hand.
    //
    // The first attempt at this clicked every `<a>` inside each chip holder. A chip carries no
    // anchor, so that removed nothing; what it did hit was the holder's OTHER link —
    // `a.advancedSearch`, an ordinary href to /search/advancedSearchPres/… — which navigated off
    // the search page before a single query ran, and every search then timed out looking for a
    // button that was no longer there.
    for (const id of Object.values(TEXT_FIELDS)) {
      await page.fill(`#${id}`, '', { timeout: 5_000 }).catch(() => {});
    }

    // ── 3b · THE PLAIN FIELDS ──────────────────────────────────────────────────────────────────
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
    // An explicit, short timeout. The default 30 seconds is time spent waiting for an element that
    // step 2b has already proven is on the page — if it is not clickable within a few seconds it
    // is covered or disabled, and the sooner that reads as a fault the better.
    await page.click(WILLIAMSON_ENDPOINTS.clerk.searchButton, { timeout: 10_000 });
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
    // One search failing does not end the walk — the caller keeps going with the next citation.
    const verdict = readTransportError(e);
    log('warn', `[WilliamsonClerk] ${plan.description}: ${verdict.message}`);
    return empty(plan, verdict);
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

/** Just enough of a Playwright context to read its cookie jar. */
interface CookieJar {
  cookies(): Promise<Array<{ name: string }>>;
}

/**
 * Wait until the server has actually granted something, rather than until the page looks settled.
 *
 * Returns whether the cookie arrived. The caller does NOT branch on it: step 2b asks the better
 * question — is the search form on the page — and a cookie that is present but rejected would
 * pass this check and fail that one. This exists to stop the race, not to judge it.
 */
async function waitForCookie(ctx: CookieJar, name: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const jar = await ctx.cookies().catch(() => [] as Array<{ name: string }>);
    if (jar.some((c) => c.name === name)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 150));
  }
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
