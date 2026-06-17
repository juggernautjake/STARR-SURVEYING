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

interface OrbViewportPos {
  x: number;
  y: number;
  /** Collision/visual radius (px). Used so an orb with its edge
   *  poking into the viewport counts as visible. */
  radius: number;
}

/** Slice W1 (pond-camera-wrap-2026-06-17) — Pac-Man-style camera
 *  wrap. Returns the new camera position when the viewport is
 *  empty AND the user is actively panning; null otherwise.
 *
 *  The wrap drops the camera at `-panDirection * wrapDistance`
 *  where `wrapDistance = viewportRadius + orbRadius + wrapBuffer`.
 *  That puts the camera just past the orb cluster on the side
 *  OPPOSITE the pan direction. The pan velocity is unchanged, so
 *  the next frame the camera advances toward world (0,0) and orbs
 *  cross into the viewport from the leading edge.
 *
 *  The teleport ONLY fires when no orb is visible — neither the
 *  pre-jump frame nor the post-jump frame has anything inside the
 *  pond, so the user can't see the camera move. */
export function maybeWrapCamera(
  camera: CameraPosition,
  pan: PanVector,
  orbs: ReadonlyArray<OrbViewportPos>,
  viewportRadius: number,
  wrapBuffer: number = 16,
): CameraPosition | null {
  const panMag = Math.hypot(pan.vx, pan.vy);
  if (panMag < 1) return null;
  for (const orb of orbs) {
    const dx = orb.x - camera.x;
    const dy = orb.y - camera.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= viewportRadius + orb.radius) return null;
  }
  // Conservative single-orb radius for the wrap distance — every
  // orb in the input shares the same render-side radius, so we
  // read it from the first one (the orb list is never empty in
  // practice; bail safely if it is).
  if (orbs.length === 0) return null;
  const orbRadius = orbs[0].radius;
  const wrapDistance = viewportRadius + orbRadius + wrapBuffer;
  return {
    x: -(pan.vx / panMag) * wrapDistance,
    y: -(pan.vy / panMag) * wrapDistance,
  };
}
