// __tests__/mobile/drain-invariants.test.ts — property-style invariants for the drain brain. The example
// tests cover specific scenarios; this enumerates a broad grid of (mode × network × row-mix) and asserts the
// rules that must ALWAYS hold, catching edge cases a handful of examples miss.
import { describe, it, expect } from 'vitest';
import { nextDrainStep } from '../../mobile/lib/drainDecision';
import { isEligible, orderedQueue, type PendingUploadRow, type QueueEnv } from '../../mobile/lib/queueOrder';
import type { UploadMode } from '../../mobile/lib/uploadMode';

const MODES: UploadMode[] = ['automatic', 'manual', 'paused'];
const ENVS: QueueEnv[] = [
  { onWifi: true, now: 1000, maxRetries: 8 },
  { onWifi: false, now: 1000, maxRetries: 8 },
];
// A palette of rows covering every eligibility state.
const ROW_KINDS: Record<string, Partial<PendingUploadRow>> = {
  ready: {},
  paused: { paused: 1 },
  wifiOnly: { require_wifi: 1 },
  backoff: { next_attempt_at: 9999 },
  failed: { retry_count: 8 },
};

// Every non-empty subset (up to 3 rows) of the palette, plus the empty queue.
function* queues(): Generator<PendingUploadRow[]> {
  const kinds = Object.entries(ROW_KINDS);
  yield [];
  for (const [a, ra] of kinds) yield [{ id: `${a}1`, retry_count: 0, created_at: 1, ...ra }];
  for (const [a, ra] of kinds)
    for (const [b, rb] of kinds)
      yield [
        { id: `${a}1`, retry_count: 0, created_at: 1, ...ra },
        { id: `${b}2`, retry_count: 0, created_at: 2, ...rb },
      ];
}

describe('nextDrainStep invariants (mode × network × row-mix grid)', () => {
  it('holds the drain rules for every combination', () => {
    let checked = 0;
    for (const mode of MODES) {
      for (const env of ENVS) {
        for (const userInitiated of [true, false]) {
          for (const rows of queues()) {
            const step = nextDrainStep({ mode, rows, env, userInitiated });
            checked++;

            // 1. Paused mode NEVER uploads.
            if (mode === 'paused') expect(step.action).toBe('paused');

            // 2. A chosen row is ALWAYS eligible AND is the front of the ordered queue (strict one-at-a-time).
            if (step.action === 'upload') {
              expect(isEligible(step.row, env), `chose ineligible ${step.row.id}`).toBe(true);
              expect(orderedQueue(rows, env)[0].id).toBe(step.row.id);
              // and the mode permitted draining (automatic always; manual only when user-initiated).
              expect(mode === 'automatic' || (mode === 'manual' && userInitiated)).toBe(true);
            }

            // 3. 'idle' only when NO row could ever upload again (all failed/empty) — never with eligible work.
            if (step.action === 'idle') {
              expect(orderedQueue(rows, env).length).toBe(0);
              expect(rows.every((r) => (r.retry_count ?? 0) >= env.maxRetries)).toBe(true);
            }

            // 4. The result is always one of the four known actions (total function, never throws/undefined).
            expect(['upload', 'paused', 'blocked', 'idle']).toContain(step.action);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200); // the grid actually exercised a broad space
  });
});
