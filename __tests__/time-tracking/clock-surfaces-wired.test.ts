// __tests__/time-tracking/clock-surfaces-wired.test.ts
//
// C0i of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// ── WHY THIS TEST EXISTS ────────────────────────────────────────────────────────────────────────
//
// Retiring Work Mode (C0g) deleted 29 files. The clock lived under `lib/work-mode/` and was moved
// out first (C0a) precisely so that deletion could not take it — because **clock-out writes payroll
// hours**. `/api/admin/time-logs` inserts into `daily_time_logs`, which is what an employee is paid
// from.
//
// The end-to-end proof was run by hand on 2026-08-15 against the live database: the activity-tag
// catalog returned 200 with 28 tags, the clock-out payload POSTed 201, and the row landed with the
// right hours, date and email (then removed). That proved the path on that day. This file is what
// keeps it true, because the risk is not that the code is wrong today — it is that a later
// refactor quietly re-points one of these surfaces and nobody notices until payday.
//
// It is a source scan, and `__tests__/mileage/manual-mileage-route.test.ts` is a standing lesson in
// what that cannot see: a scan proves an import exists, never that a database accepts the write.
// The hand-run above is the other half, and neither substitutes for the other.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const pill = read('app/admin/components/ClockInPill.tsx');
const quickActions = read('lib/hub/widgets/quick-actions/index.tsx');
const greeting = read('app/admin/me/components/HubGreeting.tsx');
const tagsRoute = read('app/api/admin/activity-tags/route.ts');

describe('the clock survived the shell it used to live in', () => {
  it('no clock surface still imports from lib/work-mode', () => {
    // The directory is gone; an import of it would not compile. Asserted anyway so the failure
    // names the reason rather than surfacing as a module-resolution error.
    for (const [name, src] of [['pill', pill], ['quick-actions', quickActions], ['greeting', greeting], ['tags route', tagsRoute]] as const) {
      expect(src, `${name} should not reference lib/work-mode`).not.toMatch(/lib\/work-mode/);
    }
  });

  it('the top-bar pill reads the clock from lib/time-tracking', () => {
    expect(pill).toMatch(/@\/lib\/time-tracking\/clock-modals/);
    expect(pill).toMatch(/@\/lib\/time-tracking\/clock-session/);
    expect(pill).toMatch(/@\/lib\/time-tracking\/use-activity-tags/);
  });

  it('the Quick Actions tile shares the SAME clock module as the pill', () => {
    // Both surfaces must read one session. Two clocks would let a user appear clocked in on the
    // hub and clocked out in the top bar, and only one of them would write the hours.
    expect(quickActions).toMatch(/@\/lib\/time-tracking\/clock-modals/);
    expect(quickActions).toMatch(/@\/lib\/time-tracking\/clock-session/);
  });

  it('the greeting banner still reports clock state — the owner asked to keep it', () => {
    expect(greeting).toMatch(/@\/lib\/time-tracking\/clock-session/);
    expect(greeting).toMatch(/CLOCK_SESSION_KEY/);
    expect(greeting).toMatch(/clocked in/i);
  });

  it('clocking out still posts to the payroll hours endpoint', () => {
    // The one line in this file that is really about money.
    expect(quickActions).toMatch(/'\/api\/admin\/time-logs'/);
    expect(pill).toMatch(/'\/api\/admin\/time-logs'/);
  });

  it('the activity-tag catalog is served from lib/time-tracking', () => {
    expect(tagsRoute).toMatch(/@\/lib\/time-tracking\/activity-tags/);
  });
});
