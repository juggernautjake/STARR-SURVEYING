// __tests__/design/retire-forwarded-routes.test.ts
//
// S2 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// C1 of the consolidation plan turned `/admin/billing/invoices` and `/admin/billing/plan-history`
// into one-line redirects. Each of them still held a LOCKED design named "— as served", which is a
// claim to be a 1:1 record of what that URL renders. What that URL renders is a redirect.
//
// The tracer already refused to TRACE a forwarding route — that stops a wrong default being written
// and does nothing about the one already sitting there. A design system is only worth reading if a
// stale entry cannot look current, so the walk that discovers the forward is the walk that retires
// the design.
//
// ── WHY ARCHIVED AND NOT DELETED ────────────────────────────────────────────────────────────────
//
// These captures are the RIGHT page's elements, measured while the route really rendered them.
// "What this looked like before it became a tab" is worth keeping.
//
// The five designs deleted on 2026-08-24 were a different case and the distinction is the whole
// point: those held the DESTINATION's elements, traced straight through a forward — `/admin/schedule`
// was holding 72 elements of `/admin/calendar`. That is evidence of nothing and deleting it was
// right. This is evidence of something that no longer exists, which is what an archive is for.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { STATUS_RULES, canTransition } from '@/lib/design/lifecycle';

/** Source with comments stripped, line comments before block ones.
 *
 * ── WHY, AND IT IS NOT TIDINESS ─────────────────────────────────────────────────────────────────
 *
 * The ordering block below compares where two strings appear. Both are things the code does AND
 * things the comments explaining that code say. On 2026-08-25 a comment added to `derive-dossiers`
 * — describing the very flake being fixed, in the words `"still loading after 25s"` — appeared
 * ABOVE the check it described, and the order assertion failed on a file that was correct.
 *
 * That is the third time in this plan an assertion matched prose rather than code. The other two
 * were caught by the same fix; this file was written before it and did not get it. */
const code = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8')
    .split('\r\n').join('\n')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const TRACER = code(path.join('scripts', 'trace-defaults.mjs'));

describe('a route that forwards does not keep a design claiming to be its record', () => {
  it('the lifecycle already allowed this, so S2 invented no new status', () => {
    // `default → archived` is the ONLY transition a default has, and the rule's own comment says
    // why: "a default can only ever be re-traced or retired". S2 is that sentence, automated.
    expect(STATUS_RULES.default.canBecome).toEqual(['archived']);
    expect(canTransition('default', 'archived')).toBe(true);
  });

  it('a default cannot be quietly promoted instead of retired', () => {
    // The failure mode worth blocking: turning the record of what EXISTS into the specification of
    // what SHOULD exist says nothing, and would launder a stale trace into a live proposal.
    for (const to of ['active', 'alternative', 'draft'] as const) {
      expect(canTransition('default', to), `default should not become ${to}`).toBe(false);
    }
  });

  it('archived keeps the design rather than dropping it', () => {
    expect(STATUS_RULES.archived.meaning).toMatch(/history/i);
    expect(STATUS_RULES.archived.editable).toBe(false);
    // Recoverable: somebody who retires the wrong thing has a way back.
    expect(STATUS_RULES.archived.canBecome).toContain('draft');
  });

  it('the tracer retires on the redirect branch, before it decides to skip', () => {
    const branch = TRACER.slice(TRACER.indexOf('if (landedOn !== target.route)'));
    expect(branch).toMatch(/status: 'archived'/);
    expect(branch).toMatch(/\/status`/);
    // Only the DEFAULT is retired. A draft somebody cloned from it is their own work on a route that
    // moved, and deleting or archiving that would be the tool making a decision for them.
    expect(branch).toMatch(/x\.status === 'default'/);
  });

  it('and it still refuses to trace the forwarding route at all', () => {
    // The retire must not have replaced the refusal. Writing a default for a route that forwards is
    // the original defect — `/admin/schedule` held 72 elements of `/admin/calendar`.
    const branch = TRACER.slice(TRACER.indexOf('if (landedOn !== target.route)'));
    // BOTH indices are asserted present before they are compared, and that is not belt-and-braces.
    // `indexOf` returns -1 when the needle is absent, and -1 is less than every real index — so the
    // bare comparison PASSES HARDEST at the moment the thing it guards stops existing. Delete the
    // `continue` and this check would go green. `__tests__/ordering-assertion-ratchet.test.ts` exists
    // because that shape was found three times in one day, once guarding a spending rule; it caught
    // this line too, which is the ratchet doing exactly its job on a test written the same afternoon.
    const stop = branch.indexOf('continue;');
    const trace = branch.indexOf('/api/admin/design/import');
    expect(stop, 'the redirect branch must stop').toBeGreaterThan(-1);
    expect(trace, 'the tracer must still write defaults somewhere below').toBeGreaterThan(-1);
    expect(stop).toBeLessThan(trace);
  });

  it('reports what it retired rather than doing it silently', () => {
    // A tool that quietly changes the status of somebody's records is one people stop trusting.
    const branch = TRACER.slice(TRACER.indexOf('if (landedOn !== target.route)'));
    expect(branch).toMatch(/retired/);
  });
});

// ── C14: THE ORDER OF THE TWO QUESTIONS, IN BOTH WALKERS ─────────────────────────────────────────
//
// The S2 branch above is only reachable if the walker asks "did this route forward?" BEFORE it
// decides the page never loaded. Both walkers asked the wrong one first, and both were fixed on
// 2026-08-25 — the second only because fixing the first prompted somebody to read its sibling.
//
// What it cost: a stub whose DESTINATION is slow trips the readiness check, so the forward branch
// never ran. After the consolidation that is most stubs — they land on a portal that has not gone
// quiet inside the budget. `trace-defaults` reported four of them as hangs and left their stale
// defaults in place, which is precisely the rot S2 exists to stop. `derive-dossiers` did the same
// and put them in the "not derived" queue as failures — **the exact outcome the comment sitting
// above its own forward check records being fixed once already.**
//
// A comment recording a fix did not prevent the same fix being needed twice. A test might.
describe('a forward is answered before a spinner, in both walkers', () => {
  const DOSSIERS = code(path.join('scripts', 'derive-dossiers.mjs'));

  /** Assert `first` really appears before `second`, with both proven present.
   *
   *  `indexOf` returns -1 when the needle is absent, and -1 is less than every real index — so a
   *  bare `a < b` PASSES HARDEST at the moment one side stops existing. The file this block is
   *  appended to already carries that lesson; repeating the shape here would be ignoring it. */
  const assertOrder = (src: string, first: string, second: string, what: string) => {
    const a = src.indexOf(first);
    const b = src.indexOf(second);
    expect(a, `${what}: "${first.slice(0, 40)}" is missing`).toBeGreaterThan(-1);
    expect(b, `${what}: "${second.slice(0, 40)}" is missing`).toBeGreaterThan(-1);
    expect(a, `${what}: the forward check must come first`).toBeLessThan(b);
  };

  it('trace-defaults asks about the forward before it asks about loading', () => {
    assertOrder(TRACER, 'landedOn !== target.route', 'if (stillLoading)', 'trace-defaults');
  });

  it('derive-dossiers asks about the forward before it sets a loading problem', () => {
    assertOrder(DOSSIERS, 'landedOn !== target.route', 'still loading after 25s', 'derive-dossiers');
  });

  it('neither forward check is gated on there being no problem', () => {
    // `derive-dossiers` did not merely ask second — it asked `if (!problem && landedOn !== ...)`,
    // so even in the right order a loading problem would have suppressed it. The guard has to be
    // unconditional, because whether the route forwards is not a matter of how the page went.
    expect(DOSSIERS).not.toMatch(/!problem && landedOn !== target\.route/);
    expect(TRACER).not.toMatch(/!stillLoading && landedOn !== target\.route/);
  });

  it('trace-defaults short-circuits the walk instead of measuring a redirect twice', () => {
    // The correctness fix left the cost: the check sat below the viewport loop, so every stub paid
    // two page loads and four waits before anything read the URL. Roughly eighty of the ninety-eight
    // routes in a `--since` pass are stubs, which is why the first full pass never finished.
    const loop = TRACER.slice(TRACER.indexOf('for (const [viewId, size] of Object.entries(VIEWPORTS))'));
    const early = loop.indexOf('forwarded = true; break;');
    // The assignment, not its right-hand side: `page.evaluate(CAPTURE, classes)` became
    // `captureStable(page, classes)` and this assertion failed for a reason that had nothing to do
    // with the order it exists to protect.
    const capture = loop.indexOf('captures[viewId] =');
    expect(early, 'the in-loop forward exit is missing').toBeGreaterThan(-1);
    expect(capture, 'the capture call is missing').toBeGreaterThan(-1);
    expect(early, 'the forward exit must precede the capture, or the stub is measured anyway')
      .toBeLessThan(capture);
  });
});
