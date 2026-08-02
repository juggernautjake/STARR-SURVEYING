// worker/src/lib/page-readiness.ts — "not loaded yet" must never look like "not there" (R38).
//
// ── THE BUG THAT MOTIVATED THIS ─────────────────────────────────────────────────────────────────
//
// A fixed `waitForTimeout(3000)` read Bell and Milam as having **no departments at all** — a wrong
// answer that looked exactly like a real finding, and one that would have been written into the
// registry as fact. Both counties publish a full department list; the page simply had not finished
// hydrating.
//
// That is this repo's recurring defect in its most expensive form: an unfinished load rendered as an
// answer. And it is systematic, not incidental — every county portal here is a React or Preact SPA
// that paints a shell immediately and fills it from an API afterwards, so `domcontentloaded`,
// `load` and even `networkidle` can all fire on a page with nothing in it.
//
// ── SO: WAIT FOR THE THING, NOT FOR A DURATION ──────────────────────────────────────────────────
//
// Every wait here is a CONDITION with a deadline. When the deadline passes, the result says
// `timedOut` — the caller then knows the difference between "the table is empty" and "the table
// never arrived", which are opposite facts about the property being researched.

/** The minimum a caller needs from a page object. Structural so this module does not import
 *  Playwright and can be unit-tested with a fake. */
export interface WaitablePage {
  waitForFunction(fn: string, options?: { timeout?: number; polling?: number }): Promise<unknown>;
  evaluate(fn: string): Promise<unknown>;
  url(): string;
}

export interface ReadinessResult<T = unknown> {
  ready: boolean;
  /** True when the condition never became true before the deadline. NOT the same as the condition
   *  being false — that distinction is the whole point of this module. */
  timedOut: boolean;
  /** Milliseconds actually waited. Recorded so a county that consistently needs 18 seconds can be
   *  given a longer budget instead of being retried blindly forever. */
  waitedMs: number;
  value: T | null;
  /** Sentence for the run log, and for the health record when it fails. */
  statement: string;
}

/** How long to allow a county portal to render.
 *
 *  Generous on purpose. These are small government deployments, often on shared hosting, and the
 *  cost of waiting 30 seconds is 30 seconds; the cost of not waiting is a wrong answer recorded as a
 *  fact. Bell's own configuration took longer than 3 seconds and shorter than 30. */
export const DEFAULT_READY_TIMEOUT_MS = 30_000;
/** Second attempt after a reload, for a portal that occasionally serves a dead shell. */
export const SLOW_SITE_TIMEOUT_MS = 60_000;
/** How often to re-check. 250ms is frequent enough to feel instant and rare enough not to busy-spin
 *  a browser that is already struggling to render. */
export const POLL_INTERVAL_MS = 250;

/** Wait until `predicate` (a function expression, evaluated in the page) returns truthy.
 *
 *  `extract` then reads the value out. Both are strings because they run in the browser — and both
 *  are INVOKED rather than passed: `page.evaluate` given a function expression returns the function
 *  itself, not its result, which is how discovery silently reported every county as empty. */
export async function waitForCondition<T = unknown>(
  page: WaitablePage,
  predicate: string,
  extract: string,
  opts: { timeoutMs?: number; label?: string; now?: () => number } = {},
): Promise<ReadinessResult<T>> {
  const timeout = opts.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const label = opts.label ?? 'the page content';
  const now = opts.now ?? (() => Date.now());
  const started = now();

  try {
    await page.waitForFunction(`(${predicate})()`, { timeout, polling: POLL_INTERVAL_MS });
  } catch {
    const waitedMs = now() - started;
    return {
      ready: false, timedOut: true, waitedMs, value: null,
      statement:
        `${label} did not appear within ${Math.round(timeout / 1000)}s on ${page.url()}. ` +
        'This is not evidence that it is absent — the page may still have been rendering.',
    };
  }

  const value = (await page.evaluate(`(${extract})()`)) as T;
  const waitedMs = now() - started;
  return {
    ready: true, timedOut: false, waitedMs, value,
    statement: `${label} was ready after ${(waitedMs / 1000).toFixed(1)}s.`,
  };
}

// ── The conditions these portals actually need ──────────────────────────────────────────────────

/** Kofile hangs its whole configuration on `window.__data`, and paints the shell long before it
 *  arrives. Waiting on the DEPARTMENT LIST specifically, rather than on `__data` existing, because
 *  the object appears first and fills in afterwards. */
export const KOFILE_CONFIG_READY = `() => {
  var d = window.__data;
  return !!(d && d.configuration && d.configuration.departments && d.configuration.departments.length > 0);
}`;

/** A results table that has either rendered rows OR told us there are none. Both are answers; only
 *  a page showing neither is unfinished. */
export const RESULTS_SETTLED = `() => {
  var rows = document.querySelectorAll('table tbody tr').length;
  if (rows > 0) return true;
  var t = document.body ? document.body.innerText : '';
  return /no results found|0 results|returned no results|error while running search/i.test(t);
}`;

/** A search form that is not merely present but usable. `page.fill` timed out on Travis and Madison
 *  against an input that existed and was still disabled. */
export const SEARCH_FORM_USABLE = `() => {
  var el = document.querySelector('#basicSearchInputBox');
  if (!el || el.disabled || el.readOnly) return false;
  var r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}`;

/** Nothing is covering the thing we are about to click — cookie banners and tour overlays are why a
 *  click times out on a button that is plainly visible in a screenshot. */
export const NO_BLOCKING_OVERLAY = `() => {
  var els = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2) || [];
  for (var i = 0; i < els.length; i++) {
    var s = getComputedStyle(els[i]);
    if ((s.position === 'fixed' || s.position === 'absolute') && parseInt(s.zIndex || '0', 10) > 1000) return false;
  }
  return true;
}`;

// ── Screenshots ─────────────────────────────────────────────────────────────────────────────────

export interface ScreenshotReadiness {
  safe: boolean;
  reason: string;
}

/** Is the page worth photographing yet?
 *
 *  A screenshot of a loading spinner is worse than no screenshot: it goes into the packet as
 *  evidence, and a reviewer clicking "view source" sees a blank page and concludes the county had
 *  nothing. */
export const PAGE_PAINTED = `() => {
  if (document.readyState !== 'complete') return false;
  var t = document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim() : '';
  if (t.length < 40) return false;
  if (/^\\s*(loading|please wait|one moment)/i.test(t)) return false;
  var spinners = document.querySelectorAll('[class*="spinner"], [class*="loading"], [role="progressbar"]');
  for (var i = 0; i < spinners.length; i++) {
    var r = spinners[i].getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return false;
  }
  return true;
}`;

export function screenshotReadiness(result: ReadinessResult): ScreenshotReadiness {
  if (result.ready) return { safe: true, reason: `Painted after ${(result.waitedMs / 1000).toFixed(1)}s.` };
  return {
    safe: false,
    reason:
      'The page had not finished painting. A screenshot taken now would show a spinner, and in a ' +
      'packet that reads as the county having nothing — capture the reason instead.',
  };
}

// ── Retry ───────────────────────────────────────────────────────────────────────────────────────

export interface AttemptRecord {
  attempt: number;
  waitedMs: number;
  timedOut: boolean;
}

export interface RetryOutcome<T> {
  result: ReadinessResult<T>;
  attempts: AttemptRecord[];
  statement: string;
}

/** Try, reload, try again with a longer deadline.
 *
 *  Two attempts, not five: a portal that has not rendered in 30 seconds and again in 60 is not slow,
 *  it is broken or blocking us, and hammering it is exactly what R12's politeness rules exist to
 *  prevent. Every attempt is recorded, so a county that always needs the second try is visible as a
 *  candidate for a longer default rather than as an intermittent failure. */
export async function waitWithRetry<T = unknown>(
  page: WaitablePage,
  predicate: string,
  extract: string,
  opts: { label?: string; reload?: () => Promise<void>; now?: () => number } = {},
): Promise<RetryOutcome<T>> {
  const attempts: AttemptRecord[] = [];

  let result = await waitForCondition<T>(page, predicate, extract, {
    timeoutMs: DEFAULT_READY_TIMEOUT_MS, label: opts.label, now: opts.now,
  });
  attempts.push({ attempt: 1, waitedMs: result.waitedMs, timedOut: result.timedOut });

  if (!result.ready && opts.reload) {
    await opts.reload();
    result = await waitForCondition<T>(page, predicate, extract, {
      timeoutMs: SLOW_SITE_TIMEOUT_MS, label: opts.label, now: opts.now,
    });
    attempts.push({ attempt: 2, waitedMs: result.waitedMs, timedOut: result.timedOut });
  }

  const total = attempts.reduce((n, a) => n + a.waitedMs, 0);
  const statement = result.ready
    ? `${opts.label ?? 'Content'} ready on attempt ${attempts.length} after ${(total / 1000).toFixed(1)}s total.`
    : `${opts.label ?? 'Content'} never appeared across ${attempts.length} attempt(s) totalling ` +
      `${(total / 1000).toFixed(1)}s. Treat this as unread, NOT as empty.`;

  return { result, attempts, statement };
}
