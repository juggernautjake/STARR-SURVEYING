// __tests__/hours/hours-never-lost.test.ts
//
// The guarantees from 2026-10-05, when four days of one employee's clock-outs were deleted by
// another admin's "My time" edit form (which had been handed everybody's rows), and a clock-out
// with no signal was simply thrown away:
//
//   1. A clock-out is saved on the device before it is sent, and only leaves when the server has it.
//   2. A failed send keeps the hours; a refused one is flagged for a person, never dropped.
//   3. A shift is booked to the day(s) it was worked, on the local calendar — not UTC.
//   4. My time asks for MY rows only, never deletes from the browser, and the server only ever
//      replaces rows belonging to the same person.
//   5. Every write to hours is stamped with who did it, and the history keeps deleted rows.
//   6. Approvers get the Review Employee Hours tile — including on hubs saved before it existed.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildClockOutEntries,
  flushPendingHours,
  readPendingHours,
  splitByLocalDay,
  submitClockOut,
  localDateOf,
} from '@/lib/time-tracking/pending-hours';
import { withPromotedActions, actionAllowedFor, findQuickAction } from '@/lib/hub/quick-actions-catalog';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// ── A browser, minimally ─────────────────────────────────────────────────────────────────────────
function installFakeWindow() {
  const store = new Map<string, string>();
  const win = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  vi.stubGlobal('window', win);
  return store;
}

const session = { startedAt: new Date(2026, 9, 5, 8, 0, 0).toISOString(), jobId: null, tagIds: [] as string[] };

const okFetch = (async () => ({ ok: true, status: 201, json: async () => ({}) })) as unknown as typeof fetch;
const offlineFetch = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
const serverError = (async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })) as unknown as typeof fetch;
const refused = (async () => ({ ok: false, status: 400, json: async () => ({ error: 'Hours must be between 0 and 24' }) })) as unknown as typeof fetch;

describe('a clock-out is never thrown away', () => {
  beforeEach(() => { vi.unstubAllGlobals(); installFakeWindow(); });

  const entries = () => buildClockOutEntries({
    session, perJobAllocations: {}, tagIds: [], notes: '', lunchMinutes: 30,
    description: 'test', now: new Date(2026, 9, 5, 16, 30, 0).getTime(),
  });

  it('posted: nothing left waiting on the device', async () => {
    const out = await submitClockOut(entries(), okFetch);
    expect(out.status).toBe('posted');
    expect(out.hours).toBe(8.5);
    expect(readPendingHours()).toHaveLength(0);
  });

  it('offline: kept on the device and retried later', async () => {
    const out = await submitClockOut(entries(), offlineFetch);
    expect(out.status).toBe('queued');
    expect(readPendingHours()).toHaveLength(1);
    expect(readPendingHours()[0].needsAttention).toBe(false);

    const posted = await flushPendingHours({ fetchImpl: okFetch });
    expect(posted).toBe(1);
    expect(readPendingHours()).toHaveLength(0);
  });

  it('server error: kept and retried, not flagged', async () => {
    const out = await submitClockOut(entries(), serverError);
    expect(out.status).toBe('queued');
    expect(readPendingHours()[0].lastError).toBe('boom');
  });

  it('refused: kept and flagged for a person, never retried blindly or dropped', async () => {
    const out = await submitClockOut(entries(), refused);
    expect(out.status).toBe('needs_attention');
    const [item] = readPendingHours();
    expect(item.needsAttention).toBe(true);
    // A background flush leaves it alone…
    expect(await flushPendingHours({ fetchImpl: okFetch })).toBe(0);
    expect(readPendingHours()).toHaveLength(1);
    // …a person pressing "Send now" includes it.
    expect(await flushPendingHours({ fetchImpl: okFetch, includeNeedsAttention: true })).toBe(1);
  });

  it('every entry carries an idempotency key, so a retry cannot double-log', () => {
    const e = entries();
    expect(e.every((x) => typeof x.client_submission_id === 'string' && x.client_submission_id.length > 5)).toBe(true);
  });

  it('cannot even store it: says so, so the caller keeps the clock running', async () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} },
      dispatchEvent: () => true,
    });
    const out = await submitClockOut(entries(), offlineFetch);
    expect(out.status).toBe('failed');
  });
});

describe('the day worked, on the local calendar', () => {
  it('an evening clock-out is today, not tomorrow (toISOString was UTC)', () => {
    const evening = new Date(2026, 9, 5, 21, 30, 0);
    expect(localDateOf(evening)).toBe('2026-10-05');
  });

  it('a shift past midnight is split across the days it touched', () => {
    const start = new Date(2026, 9, 5, 20, 0, 0).getTime();
    const end = new Date(2026, 9, 6, 2, 0, 0).getTime();
    expect(splitByLocalDay(start, end)).toEqual([
      { date: '2026-10-05', hours: 4 },
      { date: '2026-10-06', hours: 2 },
    ]);
  });

  it('a forgotten clock-out becomes rows the server accepts, flagged for the approver', () => {
    const rows = buildClockOutEntries({
      session: { startedAt: new Date(2026, 9, 5, 8, 0, 0).toISOString(), jobId: null, tagIds: [] },
      perJobAllocations: {}, tagIds: [], notes: '', lunchMinutes: null, description: 'test',
      now: new Date(2026, 9, 6, 14, 0, 0).getTime(),
    });
    expect(rows.map((r) => r.log_date)).toEqual(['2026-10-05', '2026-10-06']);
    expect(rows.every((r) => r.hours <= 24)).toBe(true);
    expect(rows[0].notes).toMatch(/missed clock-out/);
    // One lunch, on the first row only.
    expect(rows.filter((r) => 'lunch_minutes' in r)).toHaveLength(1);
  });
});

describe('nobody edits anybody else’s hours', () => {
  const panel = read('app/admin/my-hours/MyHoursPanel.tsx');
  const route = read('app/api/admin/time-logs/route.ts');

  it('My time asks for MY rows, even when the viewer is an admin', () => {
    expect(panel).toMatch(/time-logs\?mine=1&week_start=/);
    expect(panel).toMatch(/new URLSearchParams\(\{ mine: '1' \}\)/);
    expect(route).toMatch(/searchParams\.get\('mine'\) === '1'/);
  });

  it('My time never deletes from the browser — the server replaces after saving', () => {
    expect(panel).not.toMatch(/time-logs\?id=\$\{log\.id\}`, \{ method: 'DELETE' \}/);
    expect(panel).toMatch(/replace_ids: editableForDate\.map/);
  });

  it('the server only replaces rows belonging to the same person as the new entries', () => {
    expect(route).toMatch(/const sameOwner = String\(old\.user_email\)\.toLowerCase\(\) === targetEmail/);
    expect(route).toMatch(/if \(!sameOwner \|\| !editable \|\| locked\)/);
    // …and only after every new row was inserted.
    expect(route).toMatch(/client_submission_id: clientKey[\s\S]*NOW, AND ONLY NOW, REMOVE WHAT WAS REPLACED/);
  });

  it('every delete is stamped with who did it', () => {
    expect(route).not.toMatch(/from\('daily_time_logs'\)\.delete\(\)/);
    expect(route).toMatch(/deleteTimeLogAudited\(id, session\.user\.email, 'deleted'\)/);
  });
});

describe('the history is a trigger, so nothing can skip it', () => {
  const seed = read('seeds/664_time_log_events.sql');
  it('logs insert, update and delete, keeping the whole row', () => {
    expect(seed).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON public\.daily_time_logs/);
    expect(seed).toMatch(/to_jsonb\(OLD\)/);
    // No foreign key: the event must outlive the row.
    expect(seed).not.toMatch(/time_log_id\s+uuid[^,]*REFERENCES/);
  });
  it('can never be the reason hours fail to save', () => {
    expect(seed).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
  });
});

describe('Review Employee Hours on the hub', () => {
  it('goes to the approvals queue, for approvers only', () => {
    const def = findQuickAction('review-hours');
    expect(def?.href).toBe('/admin/hours?tab=approvals');
    expect(actionAllowedFor(def!, ['admin'])).toBe(true);
    expect(actionAllowedFor(def!, ['field_crew', 'employee'])).toBe(false);
  });

  it('reaches hubs saved before it existed, unless the person removed it', () => {
    const saved = ['clock-in-out', 'new-project', 'schedule'];
    expect(withPromotedActions(saved, [], ['admin'])).toEqual(['clock-in-out', 'review-hours', 'new-project', 'schedule']);
    expect(withPromotedActions(saved, ['review-hours'], ['admin'])).toEqual(saved);
    expect(withPromotedActions(saved, [], ['field_crew'])).toEqual(saved);
    expect(withPromotedActions(saved, [], null)).toEqual(saved);
  });
});
