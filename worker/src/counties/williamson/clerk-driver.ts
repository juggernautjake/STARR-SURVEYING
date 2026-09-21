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
  /**
   * Wait this long between searches down one session. Default 2s.
   *
   * Not politeness for its own sake — this county runs a WAF that watches pace, and ten searches
   * inside a minute is not a pace a person searching a deed index produces. A walk that pauses
   * finishes; a walk that sprints gets "Let's confirm you are human" part-way through and loses
   * the rest of the chain. Two seconds across nine citations costs under twenty seconds.
   */
  pauseMs?: number;
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

  if (plans.every((p) => !p.runnable)) return plans.map(declined);

  // ── A SUBMITTED NAME OUTLIVES ITS SEARCH ───────────────────────────────────────────────────────
  //
  // Emptying the text boxes is enough to stop one citation leaking into the next. It is NOT enough
  // after a name search: once a name has been SUBMITTED the county remembers it on the session and
  // re-renders the chip on the next page load, and since a chip IS a search term, every later
  // citation goes out as "book/page AND that name" and comes back empty.
  //
  // Proven on 2026-09-21. A name search returning 10 rows, then a reload, then citation 2661/0944:
  // the holder came back carrying "AMH 2015-2 BORROWER LLC" and the citation returned 0 rows where
  // the same citation alone returns 1. In the live pipeline this read as four consecutive deeds
  // vanishing — no error, no warning, just a chain of title with holes in it.
  //
  // The chip carries no remove control of its own, so rather than hunt for a way to un-say it, a
  // name search gets its own session. Criteria memory is per session; a new one cannot inherit
  // what the last one was told. Two sessions is still far below the six that draw the bot wall.
  const groups = sessionGroups(plans);
  if (groups.length > 1) {
    log('info',
      `[WilliamsonClerk] Running ${groups.length} sessions: a submitted name stays on the session ` +
      'and would silently narrow every citation searched after it.');
  }

  const results: ClerkSearchOutcome[] = new Array(plans.length);
  for (const group of groups) {
    const groupPlans = group.map((i) => plans[i]!);
    const out = await runSession(browser, groupPlans, opts, log);
    group.forEach((planIndex, k) => { results[planIndex] = out[k]!; });
  }
  return results;
}

/**
 * Not a failure and not an empty result — a query we declined to send. Saying so plainly keeps it
 * out of the "this property has no documents" bucket.
 */
const declined = (plan: ClerkSearchPlan) => empty(plan, {
  kind: 'bad_query' as const, aboutUs: false, retryable: false,
  message: `No clerk search was made: ${plan.why}.`, remedy: null,
});

/**
 * Split the plans into the sessions they must run in, preserving order.
 *
 * One rule: a name search ends its session. Everything up to and including a name goes together —
 * the name is the last thing that session does — and what follows starts fresh. Searches with no
 * name at all stay in a single session, which is the common case and the cheap one.
 */
export function sessionGroups(plans: readonly ClerkSearchPlan[]): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];

  for (let i = 0; i < plans.length; i++) {
    current.push(i);
    if (plans[i]!.kind === 'name') {
      groups.push(current);
      current = [];
    }
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

/** Run a set of plans down one browser session. */
async function runSession(
  browser: Browser,
  plans: readonly ClerkSearchPlan[],
  opts: ClerkDriverOptions,
  log: (level: 'info' | 'warn', message: string) => void,
): Promise<ClerkSearchOutcome[]> {
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
        await page.waitForTimeout(opts.pauseMs ?? 2_000).catch(() => {});
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
    // Chips are not cleared here, and the reason is NOT that they cannot outlive a page load —
    // an earlier version of this comment said that, on the strength of a probe that selected a
    // chip, reloaded, and found the holder empty. That probe never pressed Search. A chip that has
    // only been SELECTED does die with the page; a chip that has been SUBMITTED comes back, because
    // the county keeps it on the session. The distinction cost four deeds in a live run.
    //
    // So the rule is: within a session, only the text boxes need emptying, and a name search never
    // has anything running behind it — `sessionGroups` ends its session. See the note there.
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

      // ── CLICK EACH NAME ONCE, THEN CHECK WHAT ACTUALLY STUCK ─────────────────────────────────
      //
      // The dropdown lists a name TWICE — once as the highlighted `acItem-selected` row and once
      // as an ordinary `acItem`. Clicking every row whose text matches therefore clicks the same
      // name twice, and the second click TOGGLES THE CHIP BACK OFF. The search then goes out with
      // no term at all and the county answers "your search could not be completed", which is the
      // one refusal on this site most easily misread as "this owner owns nothing".
      //
      // Observed live on 2026-09-21 against "AMH 2015-2 BORROWER LLC": the suggestion endpoint
      // returned the name, the variant ranking kept it, the dropdown showed it — and the search
      // was still refused, because we had selected and then deselected it.
      await page.evaluate(
        ({ listSel, want }: { listSel: string; want: string[] }) => {
          const list = document.querySelector(listSel);
          if (!list) return;
          const wantUpper = new Set(want.map((w) => w.toUpperCase()));
          const clicked = new Set<string>();
          for (const li of Array.from(list.querySelectorAll('li'))) {
            const text = (li.textContent || '').replace(/\s+/g, ' ').trim();
            const key = text.toUpperCase();
            if (!text || !wantUpper.has(key) || clicked.has(key)) continue;
            const clickable = (li.querySelector('a') as HTMLElement | null) ?? (li as HTMLElement);
            clickable.click();
            clicked.add(key);
          }
        },
        { listSel: sel.list, want: wanted },
      ).catch(() => {});

      // The chips are the search term, so the chips are the truth. Reading them back turns "we
      // clicked something" into "the form now holds these names" — the difference between the two
      // is exactly the bug above.
      const picked = await readChips(page, sel.holder);

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

    let verdict = readSearchPage(pageText, { rowCount: rowTexts.length });

    // `readSearchPage` reads text and cannot see which search produced it, so its "could not be
    // completed" message explains the usual cause: a chip-list name that was typed and never
    // selected. On a BOOK/PAGE search there is no chip list, so that explanation sends the reader
    // after a bug that cannot exist — seen live on citation 1729/712, where the real cause was the
    // county's bot wall closing in on the next request. The driver does know the plan, so it says
    // so here rather than passing on a confident wrong diagnosis.
    if (verdict.kind === 'bad_query' && plan.kind !== 'name') {
      verdict = {
        ...verdict,
        message:
          `The clerk refused the ${plan.description} search as incomplete. This was not a name ` +
          'search, so the usual cause — a name typed but never picked from the dropdown — does ' +
          'not apply. A refusal on a plain book/page fill usually means the form was not the form ' +
          'we thought it was, which is what the county serves just before a bot wall.',
        remedy: 'Re-run this citation in a fresh session; if it repeats, check for a wall.',
      };
    }

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
 * Read the names currently in a chip list.
 *
 * A chip is an `<li class="cblist-input-list …">` holding just the name — no anchor, which is why
 * an earlier attempt to remove chips by clicking their links removed nothing. The holder also
 * contains the "Contains Any" toggle and the input row, so those two are skipped by class.
 */
async function readChips(
  page: { evaluate: <A, R>(fn: (arg: A) => R | Promise<R>, arg: A) => Promise<R> },
  holderSel: string,
): Promise<string[]> {
  return page.evaluate((sel: string) => {
    const holder = document.querySelector(sel);
    if (!holder) return [] as string[];
    const names: string[] = [];
    for (const li of Array.from(holder.querySelectorAll('li'))) {
      if (li.classList.contains('cblist-input-toggle')) continue;
      if (li.classList.contains('autoCompleteList')) continue;
      if (li.className.includes('acItem')) continue;
      const text = (li.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) names.push(text);
    }
    return names;
  }, holderSel).catch(() => [] as string[]);
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
