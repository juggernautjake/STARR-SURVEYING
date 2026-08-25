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

const TRACER = fs.readFileSync(
  path.join(__dirname, '..', '..', 'scripts', 'trace-defaults.mjs'),
  'utf8',
);

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
