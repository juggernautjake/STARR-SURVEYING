// lib/employee-pond/drag.ts
//
// employee-pond Slice E6 — pure helpers for the drag interaction.
// The hook layer translates pointer events into orb manipulations;
// these are the geometric + temporal primitives both the hook and
// its tests share.

/** Convert a window-space pointer position to pond-center
 *  coordinates (the same frame the physics engine works in).
 *  Pure — caller passes the cached bounding rect. */
export function pointerToPondCoords(
  pointerClientX: number,
  pointerClientY: number,
  pondRect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const cx = pondRect.left + pondRect.width / 2;
  const cy = pondRect.top + pondRect.height / 2;
  return {
    x: pointerClientX - cx,
    y: pointerClientY - cy,
  };
}

/** Sample shape used by the drag motion buffer + the release-
 *  velocity helper. Time is in `performance.now()` ms. */
export interface MotionSample {
  x: number;
  y: number;
  t: number;
}

/** Compute a release velocity (px/s) from a buffer of recent
 *  position samples. Uses the first + last sample so a brief
 *  flick produces a meaningful velocity; falls back to zero
 *  when there are fewer than two samples or zero elapsed time. */
export function computeReleaseVelocity(samples: MotionSample[]): {
  vx: number;
  vy: number;
} {
  if (samples.length < 2) return { vx: 0, vy: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dtSec = (last.t - first.t) / 1000;
  if (dtSec <= 0) return { vx: 0, vy: 0 };
  return {
    vx: (last.x - first.x) / dtSec,
    vy: (last.y - first.y) / dtSec,
  };
}

/** Threshold (px) under which a pointer-down → pointer-up
 *  pair is treated as a click, not a drag. Below the threshold
 *  the dialogue opens; above, the orb has been moved. */
export const DRAG_THRESHOLD_PX = 5;

/** Decide whether a (dx, dy) gesture crossed the drag threshold. */
export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
}

/** Cap on retained samples so a long drag doesn't grow the
 *  motion buffer unbounded. Eight samples ≈ 130 ms of recent
 *  motion at 60 fps — enough to compute a flick velocity
 *  without amplifying jitter. */
export const MOTION_BUFFER_LIMIT = 8;

/** Slice E7 — shake detection thresholds. Three horizontal velocity
 *  reversals within 400 ms triggers a release. Tunable; tests lock
 *  the constants so a future relaxation has to update both. */
export const SHAKE_MIN_REVERSALS = 3;
export const SHAKE_WINDOW_MS = 400;

/** Returns true when the motion buffer shows a rapid back-and-forth
 *  shake: at least SHAKE_MIN_REVERSALS sign changes of the
 *  horizontal motion within the last SHAKE_WINDOW_MS. Pure so the
 *  source-lock can verify both the happy path and the bored-cursor
 *  case where dx is mostly the same sign. */
export function detectShake(samples: MotionSample[]): boolean {
  if (samples.length < SHAKE_MIN_REVERSALS + 1) return false;
  const window = samples[samples.length - 1].t - samples[0].t;
  if (window > SHAKE_WINDOW_MS) return false;
  let reversals = 0;
  let lastSign = 0;
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].x - samples[i - 1].x;
    const sign = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    if (sign === 0) continue;
    if (lastSign !== 0 && sign !== lastSign) reversals++;
    lastSign = sign;
  }
  return reversals >= SHAKE_MIN_REVERSALS;
}
