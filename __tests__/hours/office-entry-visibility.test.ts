// The office adds a day for an employee — and can then SEE it.
//
// Owner, 2026-08-16: *"Please make sure that we can actually add entries for employees ... and
// actually see those hours entered in the hours management pages."*
//
// ── THE BUG THIS PINS ───────────────────────────────────────────────────────────────────────────
//
// Nothing was wrong with the route. `POST /api/admin/time-logs` accepted `user_email`, checked
// admin, inserted the row, and notified the employee. The defect was entirely in what the page did
// NEXT: it re-ran `loadData()` against whatever filter was active, and the active one is the
// default — `pending,disputed`. An office-entered day is inserted `approved`, because the admin
// entering it IS the approver. So the reload could not contain the row that had just been created.
//
// The save worked. The screen showed nothing. That is indistinguishable from a silent failure, on
// the one action whose entire point is that somebody can see the result — and it is why this was
// reported as "we cannot add entries" when adding was the part that worked.
//
// Source scans, because the page is a client component behind a session and the assertions worth
// keeping are about which state it moves to. The end-to-end proof is
// `scripts/check-hours-entry.mjs`, which drives the real browser.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const page = strip(readFileSync(join(process.cwd(), 'app/admin/hours-approval/page.tsx'), 'utf8'));
const route = strip(readFileSync(join(process.cwd(), 'app/api/admin/time-logs/route.ts'), 'utf8'));
const css = readFileSync(join(process.cwd(), 'app/admin/styles/AdminTimeLogs.css'), 'utf8');

describe('an office-entered day is approved on arrival', () => {
  it('the route inserts it approved, not pending', () => {
    // This is the premise the whole bug rests on. If it ever became `pending`, the page fix below
    // would be landing the approver somewhere the row also is — harmless — but the reason would
    // have gone, so it is asserted rather than assumed.
    expect(route).toMatch(/status:\s*onBehalf\s*\?\s*'approved'\s*:\s*'pending'/);
  });

  it('and records WHO entered it, so it can be told from a submission', () => {
    expect(route).toMatch(/entered_by:\s*onBehalf\s*\?\s*session\.user\.email\s*:\s*null/);
  });
});

describe('after saving, the page moves to a view that can contain the entry', () => {
  const save = page.slice(page.indexOf('const submitEntryForEmployee'), page.indexOf('const preparePayoutForWeek'));

  it('switches off the pending-only queue', () => {
    // `pending,disputed` cannot contain an approved row. Staying on it is the bug.
    expect(save).toMatch(/setFilterStatus\('all'\)/);
    expect(save).toMatch(/setTab\('history'\)/);
  });

  it('moves the week to the entry’s own date, not today', () => {
    // The second half of the bug: the list is week-scoped, so a back-dated day was invisible even
    // with the status filter open.
    expect(save).toMatch(/setWeekStart\(getMonday\(new Date\(`\$\{savedDate\}T00:00:00`\)\)/);
  });

  it('clears the employee filter, so a filter for someone else cannot hide it', () => {
    expect(save).toMatch(/setFilterEmail\(''\)/);
  });

  it('and says on the page that it saved, because the modal it was typed into has closed', () => {
    expect(save).toMatch(/setEntryNotice\(/);
    expect(page).toMatch(/className="tl-entry-notice"/);
  });
});

describe('every status is visible without opening a menu', () => {
  it('the strip renders a chip per state plus the office one', () => {
    for (const label of ['Awaiting review', 'Approved', 'Adjusted', 'Rejected', 'Disputed', 'Added by office']) {
      expect(page, `"${label}" is not on the strip`).toContain(label);
    }
  });

  it('counts come from the whole period, never the filtered list', () => {
    // A strip fed the filtered rows would read "Rejected 0" while you were looking at pending —
    // answering the question wrongly, which is worse than not answering it.
    expect(page).toMatch(/countByStatus\(weekLogs\)/);
    expect(page).toMatch(/const logs = filterLogs\(weekLogs,/);
  });

  it('the pending tab badge is counted off the period too', () => {
    expect(page).toMatch(/const pendingCount = weekLogs\.filter/);
  });

  it('the old status <select> is gone — one control per filter', () => {
    expect(page).not.toMatch(/<option value="disputed">Disputed<\/option>/);
  });

  it('the status request is not sent to the server any more, so filtering cannot re-fetch', () => {
    // Refetching per status is what made a count impossible: you cannot count what you did not ask for.
    expect(page).not.toMatch(/params\.set\('status'/);
  });
});

describe('the selected segment keeps its label', () => {
  it('hover does not repaint the active range button navy-on-navy', () => {
    // `.tl-range__btn:hover` is specificity 0,2,0 and beats `.tl-range__btn--on` at 0,1,0, so a bare
    // hover rule erased the label of the very segment the pointer was on. Measured in the browser:
    // color and background both rgb(29,48,149).
    expect(css).toMatch(/\.tl-range__btn:not\(\.tl-range__btn--on\):hover/);
    expect(css).toMatch(/\.tl-range__btn--on:hover/);
  });
});
