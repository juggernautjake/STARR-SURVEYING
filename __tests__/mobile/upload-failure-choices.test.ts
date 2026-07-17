import { describe, it, expect } from 'vitest';
import {
  needsFailureDecision, failureChoices, resolveFailureChoice,
  type FailureChoice,
} from '../../mobile/lib/uploadFailureChoices';
import type { PendingUploadRow } from '../../mobile/lib/queueOrder';

// workmode Area C5 — the pure failure-choice logic: on a failed upload, offer save-local-forget / retry /
// wait-for-reception, and map each to the row mutation that implements it. Off-device + deterministic.
const row = (over: Partial<PendingUploadRow> = {}): PendingUploadRow => ({ id: 'u1', retry_count: 8, ...over });
const NOW = 1_700_000_000_000;

describe('needsFailureDecision', () => {
  it('is true only once the queue has hit the retry cap', () => {
    expect(needsFailureDecision(row({ retry_count: 8 }), 8)).toBe(true);
    expect(needsFailureDecision(row({ retry_count: 9 }), 8)).toBe(true);
    expect(needsFailureDecision(row({ retry_count: 3 }), 8)).toBe(false);
    expect(needsFailureDecision(row({ retry_count: undefined }), 8)).toBe(false);
  });
});

describe('failureChoices', () => {
  it('offers exactly the three choices the user asked for, with wait-for-reception as the default', () => {
    const opts = failureChoices(row());
    expect(opts.map((o) => o.choice).sort()).toEqual(['retry_now', 'save_local_forget', 'wait_reception']);
    const def = opts.filter((o) => o.isDefault);
    expect(def).toHaveLength(1);
    expect(def[0].choice).toBe('wait_reception');
  });
  it('every choice has a human label + description', () => {
    for (const o of failureChoices(row())) {
      expect(o.label.trim().length).toBeGreaterThan(0);
      expect(o.description.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('resolveFailureChoice', () => {
  it('(a) save-local-forget drops the row but KEEPS the file — not a discard', () => {
    const r = resolveFailureChoice(row(), 'save_local_forget', NOW);
    expect(r.removeRow).toBe(true);
    expect(r.deleteLocalFile).toBe(false); // the whole point: keep the surveyor's bytes
    expect(r.kickDrain).toBe(false);
  });
  it('(b) retry-now clears the failure state and attempts immediately', () => {
    const r = resolveFailureChoice(row(), 'retry_now', NOW);
    expect(r.removeRow).toBe(false);
    expect(r.set).toMatchObject({ retry_count: 0, last_error: null, next_attempt_at: NOW });
    expect(r.set?.require_wifi).toBeUndefined(); // retry-now doesn't gate on Wi-Fi
    expect(r.deleteLocalFile).toBe(false);
    expect(r.kickDrain).toBe(true);
  });
  it('(c) wait-for-reception re-queues, gates on Wi-Fi, and does NOT kick a drain', () => {
    const r = resolveFailureChoice(row(), 'wait_reception', NOW);
    expect(r.removeRow).toBe(false);
    expect(r.set).toMatchObject({ retry_count: 0, last_error: null, next_attempt_at: NOW, require_wifi: 1 });
    expect(r.deleteLocalFile).toBe(false);
    expect(r.kickDrain).toBe(false);
  });
  it('no choice ever deletes the local file (data is never silently lost)', () => {
    const choices: FailureChoice[] = ['save_local_forget', 'retry_now', 'wait_reception'];
    for (const c of choices) expect(resolveFailureChoice(row(), c, NOW).deleteLocalFile).toBe(false);
  });
  it('a resolved retry becomes eligible again under the queue engine', () => {
    // Cross-check with queueOrder: after retry-now the mutated row is no longer maxed-out/backing-off.
    const r = resolveFailureChoice(row({ retry_count: 8 }), 'retry_now', NOW);
    const mutated = { ...row(), ...r.set } as PendingUploadRow;
    expect((mutated.retry_count ?? 0) < 8).toBe(true);
    expect((mutated.next_attempt_at ?? 0) <= NOW).toBe(true);
  });
});
