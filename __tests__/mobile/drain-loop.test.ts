// __tests__/mobile/drain-loop.test.ts — an INTEGRATION check that the two pure brains compose into a
// correct drain loop: nextDrainStep picks the next file, the runtime "uploads" it, planAfterUpload says
// whether to advance, repeat until idle. Simulates the runtime loop with pure functions + an in-memory
// queue (no device), so the whole capture→drain→complete flow is proven off-device.
import { describe, it, expect } from 'vitest';
import { nextDrainStep } from '../../mobile/lib/drainDecision';
import { planAfterUpload } from '../../mobile/lib/uploadOutcome';
import type { PendingUploadRow, QueueEnv } from '../../mobile/lib/queueOrder';
import type { UploadMode } from '../../mobile/lib/uploadMode';

const env: QueueEnv = { onWifi: true, now: 0, maxRetries: 8 };

/** Run the drain loop to completion, recording the order files upload + the terminal step. */
function runLoop(mode: UploadMode, rows: PendingUploadRow[], opts: { userInitiated?: boolean; retentionPref?: 'ask' | 'keep' | 'delete' } = {}) {
  const uploaded: string[] = [];
  const notifications: string[] = [];
  let deletedLocal = 0;
  let guard = 0;
  let live = [...rows];
  for (;;) {
    if (guard++ > 100) throw new Error('loop did not terminate'); // safety net — the loop MUST end
    const step = nextDrainStep({ mode, rows: live, env, userInitiated: opts.userInitiated });
    if (step.action !== 'upload') return { uploaded, notifications, deletedLocal, terminal: step };
    // "Upload" the row: it succeeds and leaves the queue; `remaining` is what's left after it.
    live = live.filter((r) => r.id !== step.row.id);
    uploaded.push(step.row.id);
    const plan = planAfterUpload({ ok: true, name: step.row.id, remaining: live.length }, { mode, retentionPref: opts.retentionPref });
    if (plan.notification) notifications.push(plan.notification.title);
    if (plan.retention?.deleteWorkingCopy) deletedLocal++;
    // When the plan says don't auto-advance, the loop ends; the terminal state is what the drainer would do
    // on its NEXT automatic tick (no new user tap) — manual mode then reads as "blocked, waiting for a tap".
    if (!plan.advance) return { uploaded, notifications, deletedLocal, terminal: nextDrainStep({ mode, rows: live, env, userInitiated: false }) };
    // else: automatic mode continues to the next file.
  }
}

describe('drain loop composes correctly (nextDrainStep + planAfterUpload)', () => {
  it('automatic mode uploads all files in FIFO order and terminates idle', () => {
    const rows: PendingUploadRow[] = [
      { id: 'f1', retry_count: 0, created_at: 1 },
      { id: 'f2', retry_count: 0, created_at: 2 },
      { id: 'f3', retry_count: 0, created_at: 3 },
    ];
    const r = runLoop('automatic', rows, { retentionPref: 'delete' });
    expect(r.uploaded).toEqual(['f1', 'f2', 'f3']); // strict one-at-a-time, in order
    expect(r.terminal.action).toBe('idle'); // queue drained
    expect(r.deletedLocal).toBe(3); // delete pref + confirmed each time
    expect(r.notifications[r.notifications.length - 1]).toBe('Uploads complete'); // last ping is completion
  });

  it('manual mode uploads exactly one per user tap, then stops (blocked), not the whole queue', () => {
    const rows: PendingUploadRow[] = [
      { id: 'a', retry_count: 0, created_at: 1 },
      { id: 'b', retry_count: 0, created_at: 2 },
    ];
    const r = runLoop('manual', rows, { userInitiated: true });
    expect(r.uploaded).toEqual(['a']); // one tap = one file (no auto-advance)
    expect(r.terminal.action).toBe('blocked'); // waiting for the next user tap
  });

  it('paused mode uploads nothing', () => {
    const r = runLoop('paused', [{ id: 'x', retry_count: 0 }]);
    expect(r.uploaded).toEqual([]);
    expect(r.terminal.action).toBe('paused');
  });
});
