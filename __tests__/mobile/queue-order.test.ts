import { describe, it, expect } from 'vitest';
import {
  isEligible, orderedQueue, nextUpload, effectivePosition, prioritizePosition, reorderPositions,
  type PendingUploadRow, type QueueEnv,
} from '../../mobile/lib/queueOrder';

// workmode Area C — the pure upload-queue ordering: strict one-at-a-time, pause, prioritize, reorder.
const env = (over: Partial<QueueEnv> = {}): QueueEnv => ({ onWifi: true, now: 1000, maxRetries: 8, ...over });
const row = (over: Partial<PendingUploadRow>): PendingUploadRow => ({ id: 'x', retry_count: 0, created_at: 100, ...over });

describe('isEligible', () => {
  it('excludes maxed-out, paused, backing-off, and Wi-Fi-only-on-cellular rows', () => {
    expect(isEligible(row({ id: 'a' }), env())).toBe(true);
    expect(isEligible(row({ id: 'b', retry_count: 8 }), env())).toBe(false);      // permanently failed
    expect(isEligible(row({ id: 'c', paused: 1 }), env())).toBe(false);           // user paused
    expect(isEligible(row({ id: 'd', next_attempt_at: 5000 }), env())).toBe(false); // backing off
    expect(isEligible(row({ id: 'e', require_wifi: 1 }), env({ onWifi: false }))).toBe(false); // Wi-Fi only
    expect(isEligible(row({ id: 'e', require_wifi: 1 }), env({ onWifi: true }))).toBe(true);   // Wi-Fi present
  });
});

describe('ordering — FIFO by default, queue_position overrides', () => {
  it('defaults to creation order', () => {
    const rows = [row({ id: 'c', created_at: 300 }), row({ id: 'a', created_at: 100 }), row({ id: 'b', created_at: 200 })];
    expect(orderedQueue(rows, env()).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('queue_position wins over creation time', () => {
    const rows = [row({ id: 'a', created_at: 100, queue_position: 5 }), row({ id: 'b', created_at: 200, queue_position: 1 })];
    expect(orderedQueue(rows, env()).map((r) => r.id)).toEqual(['b', 'a']);
  });
  it('effectivePosition falls back through queue_position → numeric created → parseable date → 0', () => {
    expect(effectivePosition(row({ queue_position: 3, created_at: 100 }))).toBe(3);
    expect(effectivePosition(row({ queue_position: null, created_at: 100 }))).toBe(100);
    expect(effectivePosition(row({ queue_position: null, created_at: '2026-07-16T00:00:00Z' }))).toBe(Date.parse('2026-07-16T00:00:00Z'));
    expect(effectivePosition(row({ queue_position: null, created_at: 'not-a-date' }))).toBe(0);
  });
});

describe('nextUpload — strict one-at-a-time', () => {
  it('returns exactly the single front-of-queue eligible row', () => {
    const rows = [row({ id: 'a', created_at: 200 }), row({ id: 'b', created_at: 100 }), row({ id: 'c', paused: 1, created_at: 50 })];
    const n = nextUpload(rows, env());
    expect(n?.id).toBe('b'); // c is paused; b is earliest eligible
  });
  it('is null when nothing is eligible', () => {
    expect(nextUpload([row({ id: 'a', paused: 1 })], env())).toBeNull();
    expect(nextUpload([], env())).toBeNull();
  });
});

describe('prioritize + reorder (user controls)', () => {
  it('prioritizePosition sorts a row ahead of all current rows', () => {
    const rows = [row({ id: 'a', queue_position: 0 }), row({ id: 'b', queue_position: 1 })];
    const p = prioritizePosition(rows);
    expect(p).toBeLessThan(0);
    // applying it moves the target to the front
    const withPriority = [...rows, row({ id: 'c', queue_position: p })];
    expect(nextUpload(withPriority, env())?.id).toBe('c');
  });
  it('reorderPositions maps ids to 0,1,2… in the requested order', () => {
    expect(reorderPositions(['c', 'a', 'b'])).toEqual({ c: 0, a: 1, b: 2 });
  });
});
