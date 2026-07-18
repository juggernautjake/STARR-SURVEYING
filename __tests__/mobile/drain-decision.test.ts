import { describe, it, expect } from 'vitest';
import { nextDrainStep } from '../../mobile/lib/drainDecision';
import type { PendingUploadRow, QueueEnv } from '../../mobile/lib/queueOrder';

// workmode Area C1/C2 — the composed "next drain action" decision that the runtime drain loop calls. Off-
// device + deterministic; composes uploadMode + queueOrder into one result.

const env = (over: Partial<QueueEnv> = {}): QueueEnv => ({ onWifi: true, now: 1000, maxRetries: 8, ...over });
const row = (over: Partial<PendingUploadRow> = {}): PendingUploadRow => ({ id: 'r1', retry_count: 0, ...over });

describe('nextDrainStep', () => {
  it('paused mode stops everything', () => {
    expect(nextDrainStep({ mode: 'paused', rows: [row()], env: env() })).toEqual({ action: 'paused' });
  });

  it('automatic mode uploads the single front-of-queue eligible row', () => {
    const r = nextDrainStep({ mode: 'automatic', rows: [row({ id: 'a', created_at: 2 }), row({ id: 'b', created_at: 1 })], env: env() });
    expect(r.action).toBe('upload');
    expect(r.action === 'upload' && r.row.id).toBe('b'); // FIFO — earlier created_at first
  });

  it('manual mode only uploads on a user-initiated trigger; an automatic tick is blocked', () => {
    const base = { mode: 'manual' as const, rows: [row()], env: env() };
    expect(nextDrainStep({ ...base, userInitiated: true }).action).toBe('upload');
    const auto = nextDrainStep({ ...base, userInitiated: false });
    expect(auto.action).toBe('blocked');
    expect(auto.action === 'blocked' && auto.reason).toMatch(/Manual mode/);
  });

  it('distinguishes a Wi-Fi/backoff/paused BLOCK from an empty queue', () => {
    // a wifi-only row on cellular → blocked (work exists, just can't go now)
    const blocked = nextDrainStep({ mode: 'automatic', rows: [row({ require_wifi: 1 })], env: env({ onWifi: false }) });
    expect(blocked.action).toBe('blocked');
    expect(blocked.action === 'blocked' && blocked.reason).toMatch(/Wi-Fi/);
    // a backing-off row → blocked
    expect(nextDrainStep({ mode: 'automatic', rows: [row({ next_attempt_at: 5000 })], env: env() }).action).toBe('blocked');
    // all rows maxed-out (failed) → idle, not blocked
    expect(nextDrainStep({ mode: 'automatic', rows: [row({ retry_count: 8 })], env: env() })).toEqual({ action: 'idle' });
    // empty queue → idle
    expect(nextDrainStep({ mode: 'automatic', rows: [], env: env() })).toEqual({ action: 'idle' });
  });
});
