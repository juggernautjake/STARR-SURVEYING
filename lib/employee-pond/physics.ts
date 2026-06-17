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
}

/** Reasonable defaults that produce a calm, floaty pond at 60 fps.
 *  Source-locked; tests use them as a baseline. */
export const DEFAULT_PHYSICS: Omit<PhysicsOptions, 'dt' | 'pondRadius'> = {
  gravity: 1.4,
  repulsion: 900,
  damping: 0.45,
  bounceRestitution: 0.55,
};

/** One simulation step. Mutates `orbs` in place for performance —
 *  the hook calls this with the same array every frame. */
export function stepPhysics(orbs: OrbState[], opts: PhysicsOptions): void {
  const { pondRadius, gravity, repulsion, damping, bounceRestitution, dt } = opts;
  if (dt <= 0) return;

  // 1. Gravity toward (0, 0). Stronger when far from center so a
  //    stray orb returns home rather than drifting forever.
  for (const o of orbs) {
    if (o.dragging) continue;
    o.vx -= o.x * gravity * dt;
    o.vy -= o.y * gravity * dt;
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
    }
  }

  // 3. Integrate position (semi-implicit Euler).
  for (const o of orbs) {
    if (o.dragging) continue;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
  }

  // 4. Pond-wall bounce. Project the orb back inside the pond and
  //    reflect its velocity along the inward normal.
  for (const o of orbs) {
    if (o.dragging) continue;
    const distSq = o.x * o.x + o.y * o.y;
    const maxDist = pondRadius - o.radius;
    if (distSq <= maxDist * maxDist) continue;
    const dist = Math.sqrt(distSq);
    if (dist <= 0) continue;
    const nx = o.x / dist;
    const ny = o.y / dist;
    o.x = nx * maxDist;
    o.y = ny * maxDist;
    const vn = o.vx * nx + o.vy * ny;
    if (vn > 0) {
      const factor = 1 + bounceRestitution;
      o.vx -= factor * vn * nx;
      o.vy -= factor * vn * ny;
    }
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
