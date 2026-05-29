// __tests__/work-mode/clock-session.test.ts
//
// Slice 188 — clock-session localStorage helpers. The ClockInPill
// rendering wiring is exercised by the Slice 192 Playwright spec.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CLOCK_SESSION_KEY,
  clearClockSession,
  elapsedHours,
  readClockSession,
  writeClockSession,
} from '@/lib/work-mode/clock-session';

// Minimal in-memory localStorage so the helpers under test see a
// `window.localStorage` even though vitest runs in `environment: 'node'`.
function installFakeStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  } as Storage;
  // Some helper files type `window` via DOM lib; node lets us add it.
  (globalThis as unknown as { window: { localStorage: Storage } }).window = { localStorage: ls };
  return store;
}

describe('clock-session — read/write/clear', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installFakeStorage();
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('returns null when the session is absent', () => {
    expect(readClockSession()).toBeNull();
  });

  it('round-trips a written session', () => {
    const session = { startedAt: '2026-05-29T12:00:00.000Z', jobId: 'job-1', tagIds: ['t1', 't2'] };
    writeClockSession(session);
    expect(readClockSession()).toEqual(session);
    // Persisted under the documented key.
    expect(store.get(CLOCK_SESSION_KEY)).toBeTruthy();
  });

  it('defaults jobId to null and tagIds to [] when omitted in storage', () => {
    store.set(CLOCK_SESSION_KEY, JSON.stringify({ startedAt: '2026-05-29T12:00:00.000Z' }));
    expect(readClockSession()).toEqual({
      startedAt: '2026-05-29T12:00:00.000Z',
      jobId: null,
      tagIds: [],
    });
  });

  it('returns null when the stored row is malformed JSON', () => {
    store.set(CLOCK_SESSION_KEY, 'not-json');
    expect(readClockSession()).toBeNull();
  });

  it('returns null when the stored row lacks startedAt', () => {
    store.set(CLOCK_SESSION_KEY, JSON.stringify({ jobId: 'job-1', tagIds: [] }));
    expect(readClockSession()).toBeNull();
  });

  it('clearClockSession removes the row', () => {
    writeClockSession({ startedAt: '2026-05-29T12:00:00.000Z', jobId: null, tagIds: [] });
    clearClockSession();
    expect(readClockSession()).toBeNull();
  });
});

describe('clock-session — SSR safety (no window)', () => {
  it('read/write/clear are no-ops without window', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(readClockSession()).toBeNull();
    expect(() => writeClockSession({ startedAt: '2026-05-29T12:00:00.000Z', jobId: null, tagIds: [] })).not.toThrow();
    expect(() => clearClockSession()).not.toThrow();
  });
});

describe('clock-session — elapsedHours', () => {
  it('returns hours since the start, 2-decimal precision', () => {
    const start = new Date('2026-05-29T12:00:00Z').toISOString();
    const now = new Date('2026-05-29T15:30:00Z').getTime(); // 3.5h later
    expect(elapsedHours(start, now)).toBeCloseTo(3.5, 2);
  });

  it('returns 0 for a future timestamp', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(elapsedHours(future)).toBe(0);
  });

  it('returns 0 for unparseable input', () => {
    expect(elapsedHours('not a date')).toBe(0);
  });

  it('returns 0 for exact-now startedAt', () => {
    const start = new Date('2026-05-29T12:00:00Z').toISOString();
    expect(elapsedHours(start, Date.parse(start))).toBe(0);
  });
});
