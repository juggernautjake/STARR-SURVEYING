// lib/employee-pond/physics.ts
//
// employee-pond Slice E3 — pure physics step. The hook (E3) drives
// this on a requestAnimationFrame loop; tests drive it directly with
// any dt they want.
//
// Coordinate system: positions are relative to the pond center
// `(0, 0)`. Pond is a circle of `pondRadius` px. Orbs have a fixed
// `radius` (the collision circle, not necessarily the rendered
// image size).

export interface OrbState {
  id: string;
  /** x relative to pond center, px */
  x: number;
  /** y relative to pond center, px */
  y: number;
  /** velocity in px/s */
  vx: number;
  vy: number;
  /** collision radius in px */
  radius: number;
  /** true while the user is dragging this orb — physics skips
   *  gravity / damping / bounce for it so the orb tracks the
   *  pointer. Slice E6 flips it; E3 honors it. */
  dragging?: boolean;
  /** CSS scale factor written into the orb's transform every frame.
   *  Default 1.0. Slice E4 flips it to 1.2 on hover so the orb
   *  visually grows; the matching radius bump on the same patch
   *  drives the neighbor bump via the existing repulsion loop. */
  scale?: number;
}

export interface PhysicsOptions {
  /** radius of the containing pond, px */
  pondRadius: number;
  /** gravity strength toward center, 1/s² scale */
  gravity: number;
  /** repulsion force magnitude during overlap */
  repulsion: number;
  /** velocity multiplier per second (0..1; 1 = no damping) */
  damping: number;
  /** bounce energy retention along the normal (0..1) */
  bounceRestitution: number;
  /** elapsed seconds since the last step */
  dt: number;
  /** Slice E6b — small random force added each frame so the pond
   *  never goes fully still. px/s² scale. Default 0. */
  idleJitter?: number;
  /** Slice E6b — when the cursor is inside the pond, orbs feel a
   *  gentle attraction toward it. Strength constant; falls off
   *  with distance via `strength / (dist + 50)`. */
  cursor?: { x: number; y: number } | null;
  cursorAttraction?: number;
  /** Slice E7 — fired when two orbs overlap during the repulsion
   *  pass AND at least one of them is currently being dragged. The
   *  React side uses this to spawn particle effects at the
   *  contact point. */
  onDraggedCollision?: (event: {
    x: number;
    y: number;
    force: number;
  }) => void;
}

/** Slice E6b — defaults tuned for a dynamic + organic floaty feel.
 *  Lower gravity so orbs glide rather than snap, higher damping
 *  factor (closer to 1.0 = less drag), small idle jitter so the
 *  pond never goes completely still, gentle cursor attraction
 *  when the cursor is in the pond. Source-locked; tests + the
 *  hook share them.
 *
 *  Slice P2 (pond-polish-2026-06-16) — user feedback:
 *    "the orbs/circles/icons are too bouncy. They bounce around a
 *     little too aggressively, and whenever I hover over one and it
 *     grows it knocks all of the orbs/circles around it all over
 *     the place. Please just soften the bouncing so that they just
 *     bump around a bit. maybe like, 1/3 of the bounciness."
 *  Repulsion cut to ⅓ (900 → 300). The hover-pop effect feeds
 *  through the SAME repulsion loop (hover bumps the orb's radius
 *  up to 1.2× which triggers neighbor overlap), so cutting
 *  repulsion proportionally calms the hover bump too. Gravity +
 *  damping + jitter + cursor attraction stay untouched so the
 *  slow organic floaty feel survives. */
export const DEFAULT_PHYSICS: Omit<PhysicsOptions, 'dt' | 'pondRadius'> = {
  gravity: 0.8,
  repulsion: 300,
  damping: 0.85,
  bounceRestitution: 0.55,
  idleJitter: 24,
  cursor: null,
  cursorAttraction: 4000,
};

/** One simulation step. Mutates `orbs` in place for performance —
 *  the hook calls this with the same array every frame. */
export function stepPhysics(orbs: OrbState[], opts: PhysicsOptions): void {
  const {
    pondRadius,
    gravity,
    repulsion,
    damping,
    bounceRestitution,
    dt,
    idleJitter = 0,
    cursor = null,
    cursorAttraction = 0,
    onDraggedCollision,
  } = opts;
  if (dt <= 0) return;

  // 1. Gravity toward (0, 0). Stronger when far from center so a
  //    stray orb returns home rather than drifting forever.
  for (const o of orbs) {
    if (o.dragging) continue;
    o.vx -= o.x * gravity * dt;
    o.vy -= o.y * gravity * dt;
  }

  // 1b. Slice E6b — cursor attraction. When the cursor is inside
  //     the pond, every non-dragging orb feels a gentle pull toward
  //     it. Force falls off as 1 / (dist + 50) so a close-by orb
  //     doesn't get a runaway tug.
  if (cursor && cursorAttraction > 0) {
    for (const o of orbs) {
      if (o.dragging) continue;
      const dx = cursor.x - o.x;
      const dy = cursor.y - o.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const force = (cursorAttraction / (dist + 50)) * dt;
      o.vx += (dx / dist) * force;
      o.vy += (dy / dist) * force;
    }
  }

  // 1c. Slice E6b — idle jitter. Tiny random per-frame force so the
  //     pond never goes fully still. Bounded by `idleJitter` (px/s²)
  //     so it stays subtle.
  if (idleJitter > 0) {
    for (const o of orbs) {
      if (o.dragging) continue;
      o.vx += (Math.random() - 0.5) * 2 * idleJitter * dt;
      o.vy += (Math.random() - 0.5) * 2 * idleJitter * dt;
    }
  }

  // 2. Pairwise repulsion when orbs overlap. O(n²) but n ≤ 50
  //    means <1250 checks/frame — negligible at 60 fps.
  for (let i = 0; i < orbs.length; i++) {
    const a = orbs[i];
    for (let j = i + 1; j < orbs.length; j++) {
      const b = orbs[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.radius + b.radius;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 0 || distSq >= minDist * minDist) continue;
      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      const force = repulsion * overlap * dt;
      if (!a.dragging) {
        a.vx -= nx * force;
        a.vy -= ny * force;
      }
      if (!b.dragging) {
        b.vx += nx * force;
        b.vy += ny * force;
      }
      // Slice E7 — emit a collision event when a dragged orb is
      // involved. Contact point is the midpoint of the two
      // colliding circles. `force` mirrors the repulsion intensity
      // so the React side can scale particle count/velocity.
      if (onDraggedCollision && (a.dragging || b.dragging)) {
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        onDraggedCollision({ x: cx, y: cy, force });
      }
    }
  }

  // 3. Integrate position (semi-implicit Euler).
  for (const o of orbs) {
    if (o.dragging) continue;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
  }

  // 4. Slice E10b — soft pond viewport. Orbs can drift OUTSIDE the
  //    visible circle (the pond's `overflow: hidden` clips them
  //    visually) but feel a gentle inward pull proportional to how
  //    far they are. They always come home eventually via
  //    gravity + this pull + damping. No hard wall bounce so a
  //    user dragging or shaking an orb can fling it off-screen
  //    without snapping back; collisions can knock orbs out of
  //    view, then collisions can bring them back.
  //
  //    bounceRestitution is retained on the options interface for
  //    API compatibility but is no longer applied by the soft
  //    viewport — kept as a hint for a future opt-in hard-wall
  //    mode.
  void bounceRestitution;
  for (const o of orbs) {
    if (o.dragging) continue;
    const distSq = o.x * o.x + o.y * o.y;
    const visible = pondRadius - o.radius;
    if (distSq <= visible * visible) continue;
    const dist = Math.sqrt(distSq);
    if (dist <= 0) continue;
    const overshoot = dist - visible;
    // Linear in overshoot — steady tug back, scaled by dt so the
    // result is frame-rate-independent. Tuned so an orb flung to
    // 2× the visible radius returns to view in ~1.5 s under
    // typical gravity + damping defaults.
    const pull = overshoot * 3 * dt;
    o.vx -= (o.x / dist) * pull;
    o.vy -= (o.y / dist) * pull;
  }

  // 5. Damping — velocity decays exponentially so the pond settles
  //    once the user lets go. Math.pow(damping, dt) gives the right
  //    per-frame factor regardless of dt.
  const dampFactor = Math.pow(damping, dt);
  for (const o of orbs) {
    if (o.dragging) continue;
    o.vx *= dampFactor;
    o.vy *= dampFactor;
  }
}

/** Total kinetic energy of the pond — useful for "is it settled?"
 *  checks in tests + a future "shake-to-release" detector. */
export function totalKineticEnergy(orbs: OrbState[]): number {
  let e = 0;
  for (const o of orbs) e += o.vx * o.vx + o.vy * o.vy;
  return e;
}
