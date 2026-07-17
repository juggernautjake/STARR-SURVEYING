// __tests__/mobile/outcome-invariants.test.ts — property-style invariants for planAfterUpload (the post-
// upload brain), the counterpart to drain-invariants. Enumerates result × mode × notifyLevel × retentionPref
// × savedToCameraRoll and asserts the rules that must ALWAYS hold.
import { describe, it, expect } from 'vitest';
import { planAfterUpload, type UploadResult } from '../../mobile/lib/uploadOutcome';
import type { UploadMode } from '../../mobile/lib/uploadMode';
import type { UploadNotifyLevel } from '../../mobile/lib/uploadNotify';
import type { RetentionPref } from '../../mobile/lib/uploadRetention';

const MODES: UploadMode[] = ['automatic', 'manual', 'paused'];
const LEVELS: UploadNotifyLevel[] = ['each', 'summary'];
const PREFS: RetentionPref[] = ['ask', 'keep', 'delete'];
const RESULTS: UploadResult[] = [
  { ok: true, name: 'a', remaining: 5 },
  { ok: true, name: 'b', remaining: 1 },
  { ok: true, name: 'c', remaining: 0 }, // last file
  { ok: false, name: 'd', canRetry: true },
  { ok: false, name: 'e', canRetry: false },
];

describe('planAfterUpload invariants (result × mode × settings grid)', () => {
  it('holds the post-upload rules for every combination', () => {
    let checked = 0;
    for (const result of RESULTS) {
      for (const mode of MODES) {
        for (const notifyLevel of LEVELS) {
          for (const retentionPref of PREFS) {
            for (const savedToCameraRoll of [true, false]) {
              const plan = planAfterUpload(result, { mode, notifyLevel, retentionPref, savedToCameraRoll });
              checked++;

              if (!result.ok) {
                // Failure: NEVER touch local media (nothing uploaded), NEVER advance past the failure.
                expect(plan.retention, 'failure planned retention').toBeNull();
                expect(plan.advance).toBe(false);
                expect(plan.queueComplete).toBe(false);
              } else {
                // Success is CONFIRMED, so retention may act (never null on success).
                expect(plan.retention, 'success without a retention decision').not.toBeNull();
                // queueComplete iff nothing remains.
                expect(plan.queueComplete).toBe(result.remaining <= 0);
                // Auto-advance ONLY in automatic mode and only if there's more to do.
                expect(plan.advance).toBe(mode === 'automatic' && result.remaining > 0);
                // A delete pref only ever deletes on a confirmed success (which this is).
                if (retentionPref === 'delete') expect(plan.retention!.deleteWorkingCopy).toBe(true);
                if (retentionPref === 'keep') expect(plan.retention!.deleteWorkingCopy).toBe(false);
                // Camera-roll deletion is offered only when the media was saved there AND the pref acts on the
                // local file ('delete'/'ask') — 'keep' is a full no-op, so it offers nothing.
                expect(plan.retention!.offerCameraRollDelete).toBe(retentionPref !== 'keep' && savedToCameraRoll);
              }

              // Failures always notify (even summary); per-file success pings are suppressed in summary.
              if (!result.ok) expect(plan.notification).not.toBeNull();
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(150);
  });
});
