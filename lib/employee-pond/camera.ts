// lib/employee-pond/camera.ts
//
// Slice P4b — pure helpers for the pond's omni-directional scroll
// ring camera. The render side owns the rAF loop and DOM writes;
// these functions just convert pointer geometry into pan vectors
// and clamp the camera to its viewing envelope.
//
// Mental model:
//   • Orbs live in a fixed world; their physics positions never
//     change when the camera moves.
//   • The camera position is the world coordinate of the center
//     of the viewport. The orb-container's CSS transform is
//     `translate(-cam.x, -cam.y)` so the world appears to shift.
//   • Gravity in the physics keeps pulling orbs toward (0, 0),
//     so when the camera pans away, orbs drift back into view at
//     the world origin (matching the user's spec: "Gravity stays
//     anchored to the world origin so orbs always drift back").

export interface PanVector {
  vx: number;
  vy: number;
}

export interface CameraPosition {
  x: number;
  y: number;
}

/** Convert a pointer position relative to the ring center into a
 *  pan velocity (px/s). Magnitude is fixed at `speed` — the angle
 *  to the pointer picks the direction, the distance does not.
 *  A pointer within `deadZonePx` of center yields zero velocity
 *  so a click at dead-center doesn't pan unpredictably. */
export function panVectorFromPointer(
  pointer: { x: number; y: number },
  speed: number,
  deadZonePx: number = 4,
): PanVector {
  const len = Math.hypot(pointer.x, pointer.y);
  if (len < deadZonePx) return { vx: 0, vy: 0 };
  return {
    vx: (pointer.x / len) * speed,
    vy: (pointer.y / len) * speed,
  };
}

/** Advance the camera by `(vx, vy) * dt`, then clamp the result so
 *  the user can't scroll into the void forever. The clamp is a
 *  circular envelope (||cam|| ≤ maxOffset) so panning at 45° has
 *  the same reach as panning along an axis. */
export function applyCameraStep(
  camera: CameraPosition,
  pan: PanVector,
  dt: number,
  maxOffset: number,
): CameraPosition {
  const next: CameraPosition = {
    x: camera.x + pan.vx * dt,
    y: camera.y + pan.vy * dt,
  };
  const len = Math.hypot(next.x, next.y);
  if (len <= maxOffset) return next;
  return {
    x: (next.x / len) * maxOffset,
    y: (next.y / len) * maxOffset,
  };
}

/** True when the pointer (relative to the ring center) lands ON
 *  the ring band rather than inside the pond or outside the ring.
 *  The render side uses this to decide whether to start a pan on
 *  pointerdown. */
export function pointerIsOnRing(
  pointer: { x: number; y: number },
  ringInnerRadius: number,
  ringOuterRadius: number,
): boolean {
  const d = Math.hypot(pointer.x, pointer.y);
  return d >= ringInnerRadius && d <= ringOuterRadius;
}
