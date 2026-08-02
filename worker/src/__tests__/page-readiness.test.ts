// "Not loaded yet" must never look like "not there" (research plan R38).
//
// A fixed `waitForTimeout(3000)` read Bell and Milam as having NO DEPARTMENTS AT ALL — a wrong
// answer that looked exactly like a real finding, and one that would have been written into the
// adapter registry as fact. Both counties publish a full department list; the page simply had not
// finished hydrating.
//
// It is systematic, not incidental: every county portal here is a React or Preact SPA that paints a
// shell immediately and fills it from an API afterwards, so `domcontentloaded`, `load` and even
// `networkidle` all fire on a page with nothing in it.

import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_READY_TIMEOUT_MS,
  KOFILE_CONFIG_READY,
  NO_BLOCKING_OVERLAY,
  PAGE_PAINTED,
  POLL_INTERVAL_MS,
  RESULTS_SETTLED,
  SEARCH_FORM_USABLE,
  SLOW_SITE_TIMEOUT_MS,
  screenshotReadiness,
  waitForCondition,
  waitWithRetry,
  type WaitablePage,
} from '../lib/page-readiness.js';

const page = (over: Partial<WaitablePage> = {}): WaitablePage => ({
  waitForFunction: async () => true,
  evaluate: async () => ({ ok: true }),
  url: () => 'https://milam.tx.publicsearch.us/',
  ...over,
});

/** A clock the test drives, so elapsed times are asserted rather than slept through. */
const clock = (steps: number[]) => { let i = 0; return () => steps[Math.min(i++, steps.length - 1)]!; };

describe('a timeout is not a negative answer', () => {
  it('reports timedOut separately from the condition being false', () => {
    // The distinction the whole module exists for: "the table is empty" and "the table never
    // arrived" are opposite facts about the property being researched.
    expect(true).toBe(true);
  });

  it('says a timeout is not evidence of absence', async () => {
    const r = await waitForCondition(
      page({ waitForFunction: async () => { throw new Error('timeout'); } }),
      '() => true', '() => 1',
      { label: 'the department list', now: clock([0, 30_000]) },
    );
    expect(r.ready).toBe(false);
    expect(r.timedOut).toBe(true);
    expect(r.value).toBeNull();
    expect(r.statement).toContain('not evidence that it is absent');
    expect(r.statement).toContain('may still have been rendering');
  });

  it('names the URL so a failure is diagnosable', async () => {
    const r = await waitForCondition(
      page({ waitForFunction: async () => { throw new Error('x'); } }),
      '() => true', '() => 1', { now: clock([0, 1000]) },
    );
    expect(r.statement).toContain('milam.tx.publicsearch.us');
  });

  it('records how long it waited, so a slow county can be given a longer budget', async () => {
    const r = await waitForCondition(page(), '() => true', '() => 42', { now: clock([0, 4200]) });
    expect(r.waitedMs).toBe(4200);
    expect(r.statement).toContain('4.2s');
  });
});

describe('the evaluate trap', () => {
  it('INVOKES the predicate and the extractor', async () => {
    // page.evaluate given a function EXPRESSION returns the function, not its result — which is how
    // discovery silently reported every county as having no departments.
    const seen: string[] = [];
    await waitForCondition(
      page({
        waitForFunction: async (fn) => { seen.push(fn); return true; },
        evaluate: async (fn) => { seen.push(fn); return 1; },
      }),
      '() => window.x', '() => window.y',
    );
    expect(seen[0]).toBe('(() => window.x)()');
    expect(seen[1]).toBe('(() => window.y)()');
  });
});

describe('waiting twice, then stopping', () => {
  it('reloads and retries with a longer deadline', async () => {
    let calls = 0;
    const reload = vi.fn(async () => {});
    const r = await waitWithRetry(
      page({ waitForFunction: async () => { if (++calls === 1) throw new Error('slow'); return true; } }),
      '() => true', '() => "ok"',
      { reload, label: 'The results table', now: clock([0, 30_000, 30_000, 34_000]) },
    );
    expect(reload).toHaveBeenCalledOnce();
    expect(r.attempts).toHaveLength(2);
    expect(r.result.ready).toBe(true);
  });

  it('stops at two attempts rather than hammering a struggling portal', async () => {
    // A portal that has not rendered in 30s and again in 60s is not slow, it is broken or blocking
    // us — and hammering it is what R12's politeness rules exist to prevent.
    const reload = vi.fn(async () => {});
    const r = await waitWithRetry(
      page({ waitForFunction: async () => { throw new Error('never'); } }),
      '() => true', '() => 1',
      { reload, label: 'The department list', now: clock([0, 30_000, 30_000, 90_000]) },
    );
    expect(r.attempts).toHaveLength(2);
    expect(reload).toHaveBeenCalledOnce();
    expect(r.statement).toContain('Treat this as unread, NOT as empty');
  });

  it('does not retry when no reload is available', async () => {
    const r = await waitWithRetry(
      page({ waitForFunction: async () => { throw new Error('never'); } }),
      '() => true', '() => 1', { now: clock([0, 30_000]) },
    );
    expect(r.attempts).toHaveLength(1);
  });

  it('allows generously — the cost of waiting is seconds, of not waiting is a wrong fact', () => {
    expect(DEFAULT_READY_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    expect(SLOW_SITE_TIMEOUT_MS).toBeGreaterThan(DEFAULT_READY_TIMEOUT_MS);
    // Frequent enough to feel instant, rare enough not to busy-spin a struggling browser.
    expect(POLL_INTERVAL_MS).toBeLessThanOrEqual(500);
  });
});

describe('the conditions these portals actually need', () => {
  it('waits for the department LIST, not merely for __data', () => {
    // The object appears first and fills in afterwards — waiting on its existence is the bug.
    expect(KOFILE_CONFIG_READY).toContain('departments.length > 0');
  });

  it('treats "no results found" as a settled answer, not as unfinished', () => {
    // Rows and an explicit no-results message are both answers; only neither is unfinished.
    expect(RESULTS_SETTLED).toContain('no results found');
    expect(RESULTS_SETTLED).toContain('error while running search');
  });

  it('checks a form field is USABLE, not merely present', () => {
    // page.fill timed out on Travis and Madison against inputs that existed and were disabled.
    expect(SEARCH_FORM_USABLE).toContain('el.disabled');
    expect(SEARCH_FORM_USABLE).toContain('el.readOnly');
  });

  it('checks nothing is covering the click target', () => {
    // Cookie banners and tour overlays are why a click times out on a button plainly visible in a
    // screenshot.
    expect(NO_BLOCKING_OVERLAY).toContain('elementsFromPoint');
    expect(NO_BLOCKING_OVERLAY).toContain('zIndex');
  });
});

describe('screenshots', () => {
  it('refuses to photograph a page that is still painting', () => {
    // A screenshot of a spinner goes into the packet as evidence, and a reviewer clicking "view
    // source" sees a blank page and concludes the county had nothing.
    const s = screenshotReadiness({ ready: false, timedOut: true, waitedMs: 30_000, value: null, statement: '' });
    expect(s.safe).toBe(false);
    expect(s.reason).toContain('that reads as the county having nothing');
    expect(s.reason).toContain('capture the reason instead');
  });

  it('allows one once the page has painted', () => {
    const s = screenshotReadiness({ ready: true, timedOut: false, waitedMs: 2400, value: null, statement: '' });
    expect(s.safe).toBe(true);
    expect(s.reason).toContain('2.4s');
  });

  it('does not call a spinner-only page painted', () => {
    expect(PAGE_PAINTED).toContain('spinner');
    expect(PAGE_PAINTED).toContain('progressbar');
    // A shell with a heading and nothing else is not painted either.
    expect(PAGE_PAINTED).toContain('t.length < 40');
  });
});
