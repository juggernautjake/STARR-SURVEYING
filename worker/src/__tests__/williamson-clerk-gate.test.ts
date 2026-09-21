/**
 * The clerk gate: what happens when the disclaimer does not stick.
 *
 * A live run on 2026-09-21 reported "0 index row(s)" for a property with twelve recorded
 * transfers. Nothing had gone wrong with the property and nothing had gone wrong with the county —
 * the driver had been bounced back to the disclaimer, spent thirty seconds clicking a button that
 * was not on the page, and then read the empty disclaimer as an empty result.
 *
 * These tests hold that shut. They drive the real driver against a fake browser, because the fault
 * is in the driver's CONTROL FLOW — what it does when the page is not the page it asked for — and
 * that is exactly the part a live site cannot be asked to reproduce on demand.
 */

import { describe, it, expect } from 'vitest';
import type { Browser } from 'playwright';
import { searchWilliamsonClerk, sessionGroups } from '../counties/williamson/clerk-driver.js';
import { planClerkSearch } from '../counties/williamson/clerk.js';
import { WILLIAMSON_ENDPOINTS } from '../counties/williamson/config/endpoints.js';

const DISCLAIMER_TEXT =
  "The Williamson County Clerk's office provides this web site as a public service. " +
  'Information available on this web site is collected, maintained and provided solely for the ' +
  'convenience of the public users. The County Clerk does not certify the authenticity of the ' +
  'information contained herein. By using this service the user agrees to indemnify and hold ' +
  'harmless the County.';

const RESULTS_TEXT = '1 Total Results';

interface FakeOptions {
  /** Does clicking "I Accept" actually set the cookie? `false` reproduces the race. */
  acceptanceSticks: boolean;
  /**
   * Refuse the search form this many times before serving it, with acceptance working throughout.
   * Reproduces the intermittent bounce seen on the tail of a nine-citation walk.
   */
  refuseFormTimes?: number;
}

/** Records what the driver did, so a test can assert on the things it did NOT do. */
interface Trace {
  visited: string[];
  clicked: string[];
  filled: Array<[string, string]>;
}

function fakeBrowser(opts: FakeOptions): { browser: Browser; trace: Trace } {
  const trace: Trace = { visited: [], clicked: [], filled: [] };
  const jar: Array<{ name: string }> = [{ name: 'JSESSIONID' }];
  let onSearchPage = false;
  let refusalsLeft = opts.refuseFormTimes ?? 0;

  const page = {
    async goto(url: string) {
      trace.visited.push(url);
      if (!url.includes(WILLIAMSON_ENDPOINTS.clerk.search)) { onSearchPage = false; return { status: () => 200 }; }

      // The county serves the search form only to a session that has accepted. Otherwise it
      // answers 200 with the disclaimer — a success status carrying the wrong page.
      const accepted = jar.some((c) => c.name === WILLIAMSON_ENDPOINTS.clerk.acceptCookie);
      if (accepted && refusalsLeft > 0) { refusalsLeft -= 1; onSearchPage = false; }
      else onSearchPage = accepted;
      return { status: () => 200 };
    },
    getByRole(_role: string, _o: unknown) {
      return {
        count: async () => 1,
        first: () => ({
          async click() {
            trace.clicked.push('I Accept');
            if (opts.acceptanceSticks) jar.push({ name: WILLIAMSON_ENDPOINTS.clerk.acceptCookie });
          },
        }),
      };
    },
    locator(sel: string) {
      return { count: async () => (onSearchPage && sel === WILLIAMSON_ENDPOINTS.clerk.searchButton ? 1 : 0) };
    },
    url: () => (onSearchPage ? WILLIAMSON_ENDPOINTS.clerk.search : `${WILLIAMSON_ENDPOINTS.clerk.disclaimer}`),
    async innerText() { return onSearchPage ? RESULTS_TEXT : DISCLAIMER_TEXT; },
    async fill(sel: string, value: string) {
      if (!onSearchPage) throw new Error('page.fill: Timeout 30000ms exceeded.');
      trace.filled.push([sel, value]);
    },
    async click(sel: string) {
      if (!onSearchPage) throw new Error('page.click: Timeout 30000ms exceeded.');
      trace.clicked.push(sel);
    },
    async type() {},
    async waitForSelector() {},
    async waitForTimeout() {},
    async waitForLoadState() {},
    async evaluate() { return []; },
    async $$eval() { return ['1236 435 DEED 01/02/1987 SMITH JOHN JONES MARY LOT 14']; },
  };

  const context = {
    async newPage() { return page; },
    async cookies() { return jar; },
    async close() {},
  };

  return { browser: { newContext: async () => context } as unknown as Browser, trace };
}

const bookPage = { book: '1236', page: '435' } as never;

describe('the clerk gate', () => {
  it('names the redirect instead of reporting an empty index', async () => {
    const { browser } = fakeBrowser({ acceptanceSticks: false });

    const out = await searchWilliamsonClerk(browser, bookPage, { acceptTimeoutMs: 50 });

    // The finding must be about US, and must be retryable — the county is fine.
    expect(out.verdict.kind).toBe('needs_session');
    expect(out.verdict.aboutUs).toBe(true);
    expect(out.verdict.retryable).toBe(true);
    expect(out.verdict.message).toMatch(/served no search form, twice/i);
    expect(out.verdict.message).toMatch(/was the disclaimer again/i);

    // And it must NOT read as "this property has no documents".
    expect(out.verdict.kind).not.toBe('ok');
    expect(out.records).toHaveLength(0);
    expect(out.total).toBeNull();
  });

  it('does not click a button it never saw', async () => {
    const { browser, trace } = fakeBrowser({ acceptanceSticks: false });

    await searchWilliamsonClerk(browser, bookPage, { acceptTimeoutMs: 50 });

    // The thirty seconds the live run burned. Accepting is fine (twice — it retries); searching
    // a gate is not.
    expect(trace.clicked).toEqual(['I Accept', 'I Accept']);
    expect(trace.clicked).not.toContain(WILLIAMSON_ENDPOINTS.clerk.searchButton);
  });

  it('waits for the cookie, so a sticking acceptance reaches the form', async () => {
    const { browser, trace } = fakeBrowser({ acceptanceSticks: true });

    const out = await searchWilliamsonClerk(browser, bookPage, { expandVariants: false, acceptTimeoutMs: 50 });

    expect(out.verdict.kind).toBe('ok');
    expect(trace.clicked).toContain(WILLIAMSON_ENDPOINTS.clerk.searchButton);
    // The number goes to Volume, not Book — Book is a type code and a number in it matches nothing.
    expect(trace.filled).toContainEqual([`#${WILLIAMSON_ENDPOINTS.clerk.fields.volume}`, '1236']);
    // The Book box is cleared like every other field, but never given a value — clearing is what
    // stops the previous search's criteria leaking into this one.
    const bookWrites = trace.filled.filter(([sel]) => sel === `#${WILLIAMSON_ENDPOINTS.clerk.fields.book}`);
    expect(bookWrites.every(([, v]) => v === '')).toBe(true);

    // And the form IS cleared before the query is typed — that clearing is the only thing that
    // stops this site carrying the previous search's criteria into the next one.
    const cleared = trace.filled.filter(([, v]) => v === '').map(([sel]) => sel);
    expect(cleared).toContain(`#${WILLIAMSON_ENDPOINTS.clerk.fields.volume}`);
    expect(cleared).toContain(`#${WILLIAMSON_ENDPOINTS.clerk.fields.instrument}`);
    expect(out.records.length).toBeGreaterThan(0);
  });

  it('retries once when the form is refused intermittently', async () => {
    // Seven of nine citations sailed through and the last two were bounced, same code, same
    // session settings. A second acceptance costs one page load and recovers the document.
    const { browser, trace } = fakeBrowser({ acceptanceSticks: true, refuseFormTimes: 1 });

    const out = await searchWilliamsonClerk(browser, bookPage, { expandVariants: false, acceptTimeoutMs: 50 });

    expect(out.verdict.kind).toBe('ok');
    expect(out.records.length).toBeGreaterThan(0);
    expect(trace.clicked.filter((c) => c === 'I Accept')).toHaveLength(2);
  });

  it('gives up after the second refusal, and says the cookie was fine', async () => {
    // The remedy must not send someone hunting a cookie bug when acceptance plainly worked.
    const { browser, trace } = fakeBrowser({ acceptanceSticks: true, refuseFormTimes: 99 });

    const out = await searchWilliamsonClerk(browser, bookPage, { expandVariants: false, acceptTimeoutMs: 50 });

    expect(out.verdict.kind).toBe('needs_session');
    expect(out.verdict.message).toMatch(/cookie was set/i);
    expect(out.verdict.remedy).toMatch(/the gate is not what we failed/i);
    expect(trace.clicked.filter((c) => c === 'I Accept')).toHaveLength(2);
    expect(trace.clicked).not.toContain(WILLIAMSON_ENDPOINTS.clerk.searchButton);
  });

  it('says the cookie was NOT set when that is the actual fault', async () => {
    const { browser } = fakeBrowser({ acceptanceSticks: false });

    const out = await searchWilliamsonClerk(browser, bookPage, { acceptTimeoutMs: 50 });

    expect(out.verdict.message).toMatch(/cookie was NOT set/i);
    expect(out.verdict.remedy).toMatch(/jQuery Mobile transitions by hash/i);
  });

  it('reaches the search page only after accepting, never before', async () => {
    const { browser, trace } = fakeBrowser({ acceptanceSticks: true });

    await searchWilliamsonClerk(browser, bookPage, { expandVariants: false, acceptTimeoutMs: 50 });

    const gate = trace.visited.findIndex((u) => u.includes('disclaimer'));
    const search = trace.visited.findIndex((u) => u === WILLIAMSON_ENDPOINTS.clerk.search);
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(search).toBeGreaterThan(gate);
  });
});

/**
 * A submitted name outlives its search.
 *
 * The county keeps it on the SESSION and re-renders the chip on the next page load, so every
 * citation searched afterwards goes out as "book/page AND that name" and comes back empty. In the
 * live pipeline this read as four consecutive deeds vanishing — no error, just holes in a chain of
 * title. Emptying the text boxes does not help: the chip is not a text box.
 */
describe('sessions', () => {
  const plansFor = (qs: Array<Record<string, string>>) => qs.map((q) => planClerkSearch(q as never));

  it('gives a name search its own session, and starts fresh after it', () => {
    const plans = plansFor([
      { bothNames: 'AMH 2015-2 BORROWER LLC' },
      { volume: '2661', page: '0944' },
      { volume: '2368', page: '030' },
    ]);
    // The name ends session one; the citations run in a session that never heard the name.
    expect(sessionGroups(plans)).toEqual([[0], [1, 2]]);
  });

  it('keeps citations together — one session, which is the cheap case', () => {
    const plans = plansFor([
      { volume: '2661', page: '0944' },
      { volume: '2368', page: '030' },
      { volume: '2131', page: '765' },
    ]);
    expect(sessionGroups(plans)).toEqual([[0, 1, 2]]);
  });

  it('separates two name searches from each other', () => {
    const plans = plansFor([
      { bothNames: 'SMITH JOHN' },
      { bothNames: 'JONES MARY' },
    ]);
    expect(sessionGroups(plans)).toEqual([[0], [1]]);
  });

  it('never drops or reorders a query', () => {
    const plans = plansFor([
      { volume: '1', page: '1' },
      { bothNames: 'SMITH JOHN' },
      { volume: '2', page: '2' },
      { bothNames: 'JONES MARY' },
      { volume: '3', page: '3' },
    ]);
    const groups = sessionGroups(plans);
    expect(groups.flat()).toEqual([0, 1, 2, 3, 4]);
    // A name is always last in its group — nothing runs behind it on a poisoned session.
    for (const g of groups) {
      const namesAt = g.filter((i) => plans[i]!.kind === 'name');
      if (namesAt.length) expect(namesAt).toEqual([g[g.length - 1]]);
    }
  });

  it('handles an empty list', () => {
    expect(sessionGroups([])).toEqual([]);
  });
});
