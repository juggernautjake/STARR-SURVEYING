// lib/research/self-heal-baseline.ts — the first sweep captures the baseline the next one needs.
//
// ── WHY EVERY PORTAL REPORTED "NO BASELINE" ─────────────────────────────────────────────────────
//
// A live sweep on 2026-09-02 returned: 18 total, 0 healthy, 18 "no baseline". Every county answered
// HTTP 200 in under a second, and every row said the same thing —
//
//   "Site responded 200, but we have no baseline yet to compare against."
//
// The sweep was working perfectly. It fingerprints the live page, compares it to
// `research_adapter_canaries.baseline_dom_skeleton`, and reports the difference. What it had was
// nothing to compare against, and it would have had nothing forever: the ONLY code in the product
// that inserts a canary row is the "add a new adapter" form, it fires only when the admin types a
// canary query, and it writes `query_input` and `expected_fields` — never a DOM baseline.
//
// So the monitoring layer could detect a change in principle and could not detect one in practice,
// for any adapter, ever. The dashboard reported that honestly, which is the only reason it was
// findable.
//
// ── ADOPTING TODAY'S PAGE IS A REAL RISK, AND IS WHY THIS IS MARKED ─────────────────────────────
//
// If a county's portal is ALREADY broken, baselining it now records the broken state as correct, and
// the sweep will cheerfully report "matches baseline" forever after.
//
// There is no way around that without a human looking at 18 sites, and a monitoring system that
// never starts is worth less than one that starts from an unreviewed baseline. So it starts — and
// says so: every auto-adopted baseline carries `created_by = 'auto-adopt'` and a dated note, so
// "which of these did anyone actually check?" has an answer. A reviewed baseline is a re-capture
// away.
//
// The status it produces is `baseline_captured`, NOT `healthy`. Nothing has been verified — a page
// was recorded. Reporting that as healthy would be the same defect this whole system exists to
// catch, committed by the thing meant to catch it.

export interface Fingerprint {
  hash: string;
  skeleton: string;
  element_count: number;
}

export interface BaselineCaptureDecision {
  /** Capture a baseline from this response? */
  capture: boolean;
  /** Why not, when not. Empty when capturing. */
  reason: string;
}

/**
 * Minimum page size worth baselining.
 *
 * An error page, a redirect stub or a "site temporarily unavailable" notice is a couple of hundred
 * bytes and would make a useless baseline that the next sweep matches happily. A real county portal
 * is kilobytes of form markup.
 */
export const MIN_BASELINE_BYTES = 1_000;

/** Text that means "this is not the portal", even behind a 200. */
const NOT_A_PORTAL = /site (is )?(temporarily )?unavailable|under (maintenance|construction)|service unavailable|access denied|are you a robot|enable javascript to continue/i;

/**
 * Should this response become the baseline?
 *
 * Deliberately conservative. A refused baseline costs one more sweep; a bad one costs every future
 * sweep, silently, because everything afterwards is measured against it.
 */
export function shouldCaptureBaseline(input: {
  httpStatus: number | null;
  body: string;
  hasExistingBaseline: boolean;
}): BaselineCaptureDecision {
  if (input.hasExistingBaseline) {
    return { capture: false, reason: 'a baseline already exists — re-baselining is a deliberate act' };
  }
  if (input.httpStatus !== 200) {
    return { capture: false, reason: `HTTP ${input.httpStatus ?? 'no response'} is not a page worth baselining` };
  }
  if (input.body.length < MIN_BASELINE_BYTES) {
    return {
      capture: false,
      reason: `the response was ${input.body.length} bytes — too small to be the portal, so baselining it ` +
        `would make every future sweep match an error page`,
    };
  }
  if (NOT_A_PORTAL.test(input.body.slice(0, 4000))) {
    return {
      capture: false,
      reason: 'the page says it is unavailable or is asking for a human, so it is not the portal to baseline',
    };
  }
  return { capture: true, reason: '' };
}

/** The canary row an auto-adopted baseline writes. */
export function buildBaselineRow(input: {
  adapterId: string;
  fingerprint: Fingerprint;
  now?: Date;
}): Record<string, unknown> {
  const when = (input.now ?? new Date()).toISOString().slice(0, 10);
  return {
    adapter_id: input.adapterId,
    query_input: {},
    expected_fields: {},
    baseline_dom_hash: input.fingerprint.hash,
    baseline_dom_skeleton: input.fingerprint.skeleton,
    is_active: true,
    // Both of these exist so "was this ever reviewed?" is answerable. An unmarked baseline is
    // indistinguishable from one a person confirmed.
    created_by: 'auto-adopt',
    notes:
      `Captured automatically from the live page on ${when} because no baseline existed. NOBODY HAS ` +
      `CONFIRMED this is what the portal should look like — if the site was already broken on that ` +
      `date, this records the broken state as correct. Re-capture after checking the portal by hand.`,
  };
}

/** The sentence the dashboard shows for a freshly captured baseline. */
export function describeBaselineCapture(captured: boolean, reason: string): string {
  return captured
    ? 'Baseline captured from this run. Nothing is verified yet — the NEXT check is the one that can ' +
      'tell you whether the portal changed.'
    : `No baseline, and none captured: ${reason}.`;
}
