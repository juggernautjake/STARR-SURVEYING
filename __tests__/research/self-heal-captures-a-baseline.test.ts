import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  shouldCaptureBaseline,
  buildBaselineRow,
  describeBaselineCapture,
  MIN_BASELINE_BYTES,
} from '@/lib/research/self-heal-baseline';

// ── WHY EVERY PORTAL REPORTED "NO BASELINE" ─────────────────────────────────────────────────────
//
// A live sweep on 2026-09-02 returned 18 total, 0 healthy, 18 "no baseline". Every county answered
// HTTP 200 in under a second and every row said the same thing:
//
//   "Site responded 200, but we have no baseline yet to compare against."
//
// The sweep was working. What it had was nothing to compare against, and it would have had nothing
// forever: the only code in the product that inserts a canary row is the add-an-adapter form, it
// fires only when the admin types a canary query, and it writes `query_input` and `expected_fields`
// — never a DOM baseline. So the monitoring layer could detect a change in principle and never in
// practice, for any adapter.
//
// It reported that honestly, which is the only reason it was findable.

const page = (bytes = 5_000) => '<html><body>' + '<div class="row">x</div>'.repeat(bytes / 25) + '</body></html>';

describe('what may become a baseline', () => {
  it('CONTROL: an ordinary portal page is captured', () => {
    // Without this, "refuse everything" would satisfy every guard below and the sweep would stay
    // blind forever — which is exactly the state this fixes.
    const d = shouldCaptureBaseline({ httpStatus: 200, body: page(), hasExistingBaseline: false });
    expect(d.capture).toBe(true);
  });

  it('never silently replaces a baseline that exists', () => {
    // Re-baselining is how a broken portal becomes the new "correct". It must be a deliberate act.
    const d = shouldCaptureBaseline({ httpStatus: 200, body: page(), hasExistingBaseline: true });
    expect(d.capture).toBe(false);
    expect(d.reason).toMatch(/deliberate act/i);
  });

  it('refuses anything that is not a 200', () => {
    for (const status of [500, 404, 302, null]) {
      const d = shouldCaptureBaseline({ httpStatus: status, body: page(), hasExistingBaseline: false });
      expect(d.capture, `HTTP ${status} was baselined`).toBe(false);
    }
  });

  it('refuses a page too small to be a portal', () => {
    // An error stub behind a 200 is a couple of hundred bytes, and baselining it means every future
    // sweep happily matches an error page.
    const d = shouldCaptureBaseline({ httpStatus: 200, body: 'x'.repeat(MIN_BASELINE_BYTES - 1), hasExistingBaseline: false });
    expect(d.capture).toBe(false);
    expect(d.reason).toMatch(/too small/i);
  });

  it('refuses a maintenance or bot-check page behind a 200', () => {
    for (const text of ['Site temporarily unavailable', 'Are you a robot?', 'Please enable JavaScript to continue']) {
      const body = `<html><body>${text}${'<p>pad</p>'.repeat(200)}</body></html>`;
      const d = shouldCaptureBaseline({ httpStatus: 200, body, hasExistingBaseline: false });
      expect(d.capture, `"${text}" was baselined`).toBe(false);
    }
  });
});

describe('an auto-adopted baseline says it was never reviewed', () => {
  const row = buildBaselineRow({
    adapterId: 'a1',
    fingerprint: { hash: 'abc', skeleton: 'div>span', element_count: 2 },
    now: new Date('2026-09-02T12:00:00Z'),
  });

  it('stores the fingerprint the sweep compares against', () => {
    expect(row.baseline_dom_hash).toBe('abc');
    expect(row.baseline_dom_skeleton).toBe('div>span');
    expect(row.is_active).toBe(true);
  });

  it('is attributable, so "did anyone check this?" has an answer', () => {
    expect(row.created_by).toBe('auto-adopt');
  });

  it('WARNS in the note that a broken portal would be recorded as correct', () => {
    // The honest risk of adopting today's page. A monitoring system that never starts is worth less
    // than one that starts from an unreviewed baseline — but only if it admits which it is.
    expect(String(row.notes)).toMatch(/NOBODY HAS CONFIRMED/);
    expect(String(row.notes)).toMatch(/records the broken state as correct/i);
    expect(String(row.notes)).toContain('2026-09-02');
  });
});

describe('the sentence the dashboard shows', () => {
  it('a capture does NOT claim the portal is healthy', () => {
    // Nothing has been verified — a page was recorded. Calling that healthy would be this system's
    // own defect, committed by the thing meant to catch it.
    const s = describeBaselineCapture(true, '');
    expect(s).toMatch(/Nothing is verified yet/i);
    expect(s.toLowerCase()).not.toContain('healthy');
  });

  it('a refusal says why, so it is actionable', () => {
    expect(describeBaselineCapture(false, 'HTTP 500 is not a page worth baselining'))
      .toMatch(/HTTP 500/);
  });
});

describe('the sweep actually captures — assert the CALLER', () => {
  const SWEEP = fs.readFileSync(
    path.join(process.cwd(), 'app/api/admin/research/self-heal/sweep/route.ts'), 'utf8',
  );

  it('consults the decision helper', () => {
    expect(SWEEP).toContain('shouldCaptureBaseline({');
  });

  it('writes the canary row', () => {
    expect(SWEEP).toContain('buildBaselineRow({');
    expect(SWEEP).toContain("from('research_adapter_canaries')");
  });

  it('updates an existing canary rather than adding a second ACTIVE one', () => {
    // Two active canaries makes "the baseline" ambiguous, and the sweep reads whichever comes back
    // first.
    expect(SWEEP).toContain(".eq('is_active', true)");
  });

  it('reports the capture on the row, so the dashboard can stop saying "no baseline"', () => {
    expect(SWEEP).toContain('baseline_captured: baselineCaptured');
  });
});

describe('the dashboard no longer says the toggle is inert', () => {
  const TAB = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/research/_tabs/SelfHealTab.tsx'), 'utf8',
  );

  it('the schedule toggle does not claim the cron is unwired', () => {
    // It said "Cron wiring lands in slice 2 — toggling now just records your preference." Slice 2
    // landed: /api/cron/research-self-heal is in vercel.json, reads this exact flag, and exits when
    // it is off. Telling an owner their switch does nothing, when it does, is worse than saying
    // nothing.
    expect(TAB, 'the stale slice-2 disclaimer is back').not.toContain('lands in slice 2');
    expect(TAB).toContain('This is WIRED');
  });

  it('and names when it runs, since that is what an operator plans around', () => {
    expect(TAB).toMatch(/06:00 UTC/);
  });
});
