// __tests__/hours/clock-out-double-submit.test.tsx
//
// One clock-out, two rows of hours.
//
// The regression this file exists for is in the production data, not in a hypothesis:
// `daily_time_logs` held two identical 7.56-hour rows for michaelgibbs@starr-surveying.com on
// 2026-08-17, created 3.2 seconds apart, both reading "Clock-out entry from top-bar pill". Nobody
// worked fifteen hours that Monday. The confirm button stayed live for the whole round-trip, so a
// second click while the first request was still going posted the entire day again.
//
// Two layers are locked here, because either one alone leaves the door open:
//
//   the BUTTON  cannot be pressed twice — a source contract, the same way this repo pins every
//               other component behaviour it cannot mount
//   the ROUTE   refuses the second copy anyway, because a UI guard cannot stop a fetch the browser
//               retried, a second tab, or the next surface somebody writes
//
// The guard is in `ModalActions` and not in either caller ON PURPOSE. There are two clock-out
// surfaces — the top-bar `ClockInPill` and the Quick Actions tile — each with its own copy of the
// submit handler, so a fix written in one of them would have left the other able to do it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  findRecentDuplicate,
  isSameEntry,
  DUPLICATE_WINDOW_MS,
  type StoredEntry,
} from '@/lib/hours/duplicate-submission';

const root = path.join(__dirname, '..', '..');
const MODALS = fs.readFileSync(path.join(root, 'lib', 'time-tracking', 'clock-modals.tsx'), 'utf8');
const PILL = fs.readFileSync(path.join(root, 'app', 'admin', 'components', 'ClockInPill.tsx'), 'utf8');
const WIDGET = fs.readFileSync(path.join(root, 'lib', 'hub', 'widgets', 'quick-actions', 'index.tsx'), 'utf8');
const ROUTE = fs.readFileSync(path.join(root, 'app', 'api', 'admin', 'time-logs', 'route.ts'), 'utf8');

describe('the confirm button cannot be pressed twice', () => {
  it('tracks whether a submission is in flight', () => {
    expect(MODALS).toMatch(/const \[busy, setBusy\] = useState\(false\)/);
  });

  it('returns early on a second press instead of calling the handler again', () => {
    // `if (busy) return;` BEFORE `setBusy(true)` is the whole fix. React batches state updates, so
    // two clicks in the same tick both see the old `busy` unless the guard reads it first.
    expect(MODALS).toMatch(/if \(busy\) return;\s*\n\s*setBusy\(true\)/);
  });

  it('awaits the handler, so "in flight" covers the network and not just the click', () => {
    expect(MODALS).toMatch(/await onConfirm\(\)/);
  });

  it('releases the button when the save failed and the dialog stayed open', () => {
    // Without the `finally` a thrown handler strands the user on a dead button with no way to retry.
    expect(MODALS).toMatch(/finally \{[\s\S]*?setBusy\(false\)/);
  });

  it('disables both buttons, so the dialog cannot be closed out from under a save', () => {
    // Closing mid-save clears the clock session on a submission whose outcome the user can no
    // longer see — they would not know whether to enter the day by hand.
    const actions = MODALS.slice(MODALS.indexOf('function ModalActions'));
    expect(actions.match(/disabled=\{busy\}/g) ?? []).toHaveLength(2);
  });

  it('says what it is doing rather than looking broken', () => {
    expect(MODALS).toMatch(/busyLabel="Saving your hours…"/);
    expect(MODALS).toMatch(/busyLabel="Clocking in…"/);
  });

  it('covers BOTH clock-out surfaces, because both post their own entries', () => {
    // The reason the guard is not in either caller. If a third surface appears it inherits this.
    for (const [name, src] of [['ClockInPill', PILL], ['quick-actions', WIDGET]] as const) {
      expect(src, `${name} should submit through the shared modal`).toMatch(/ClockOutModal/);
      expect(src, `${name} should not roll its own confirm button`).not.toMatch(/confirmLabel="Submit \+ clock out"/);
    }
  });
});

describe('the route refuses the second copy regardless', () => {
  const at = (iso: string): StoredEntry => ({
    id: 'existing', log_date: '2026-08-17', hours: 7.56,
    description: 'Clock-out entry from top-bar pill', job_id: null, created_at: iso,
  });
  const entry = { log_date: '2026-08-17', hours: 7.56, description: 'Clock-out entry from top-bar pill' };
  const NOW = Date.parse('2026-08-17T21:31:10.952Z');

  it('recognises the exact pair that reached production, 3.2 seconds apart', () => {
    const echo = findRecentDuplicate([at('2026-08-17T21:31:07.758Z')], entry, NOW);
    expect(echo?.id).toBe('existing');
  });

  it('answers with the row that already exists, so a retry reads as the success it was', () => {
    // Not a boolean and not an error. A failure shown for hours that are safely stored is how the
    // person ends up submitting them a third time.
    expect(findRecentDuplicate([at('2026-08-17T21:31:07.758Z')], entry, NOW)).toHaveProperty('id');
  });

  it('lets the same entry through once the window has passed', () => {
    // Two identical entries on one day are a real timesheet. Refusing them forever would turn a
    // data fix into a form people fight.
    const old = at(new Date(NOW - DUPLICATE_WINDOW_MS - 1000).toISOString());
    expect(findRecentDuplicate([old], entry, NOW)).toBeNull();
  });

  it('does not collapse two different pieces of work that ran the same length', () => {
    const morning = { ...at('2026-08-17T21:31:07.758Z'), description: 'Morning: control' };
    expect(findRecentDuplicate([morning], { ...entry, description: 'Afternoon: topo' }, NOW)).toBeNull();
  });

  it('tells entries apart by job', () => {
    const onJobA = { ...at('2026-08-17T21:31:07.758Z'), job_id: 'a' };
    expect(findRecentDuplicate([onJobA], { ...entry, job_id: 'b' }, NOW)).toBeNull();
    expect(findRecentDuplicate([onJobA], { ...entry, job_id: 'a' }, NOW)).not.toBeNull();
  });

  it('treats a missing job and a null job as the same absence', () => {
    expect(isSameEntry(at('2026-08-17T21:31:07.758Z'), entry)).toBe(true);
    expect(isSameEntry({ ...at('2026-08-17T21:31:07.758Z'), job_id: null }, { ...entry, job_id: undefined })).toBe(true);
  });

  it('fails open on an unreadable timestamp rather than dropping the hours', () => {
    // The safe direction to be wrong in: a duplicate that slips through is visible in the queue and
    // one click to reject. Hours silently discarded are not visible anywhere.
    expect(findRecentDuplicate([at('not a date')], entry, NOW)).toBeNull();
  });

  it('is wired into the route, and reported rather than hidden', () => {
    expect(ROUTE).toMatch(/findRecentDuplicate\(prior, entry, nowMs\)/);
    expect(ROUTE).toMatch(/duplicates_suppressed: duplicatesSuppressed/);
  });

  it('also collapses two identical entries inside ONE request', () => {
    // A double-submit is the common case; a client looping over an array it built twice is the same
    // defect arriving by a different road. The route pushes each insert back onto the list it checks.
    expect(ROUTE).toMatch(/if \(data\) prior\.push\(\{/);
  });
});
