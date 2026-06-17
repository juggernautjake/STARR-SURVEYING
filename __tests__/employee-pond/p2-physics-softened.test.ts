// __tests__/employee-pond/p2-physics-softened.test.ts
//
// Slice P2 (employee-pond-polish-2026-06-16) — user feedback:
//   "the orbs/circles/icons are too bouncy… Please just soften the
//    bouncing so that they just bump around a bit. maybe like, 1/3
//    of the bounciness. keep it so that they have a general slow
//    organic living movement to them still, just not so accelerated."
//
// The hover-pop is fed by the SAME repulsion loop as collisions —
// hover bumps the orb's radius up to 1.2× which then activates the
// neighbor repulsion — so a single ⅓ cut on `repulsion` addresses
// both complaints in one knob.
//
// This file locks:
//   1) The repulsion default is 300 (was 900) — exactly the ⅓ the
//      user asked for.
//   2) Gravity, damping, idleJitter, and cursorAttraction were NOT
//      touched (the "slow organic floaty feel" the user wants to
//      keep).
//
// Pure value lock — no rendering required.

import { describe, it, expect } from 'vitest';
import { DEFAULT_PHYSICS } from '../../lib/employee-pond/physics';

describe('Slice P2 — pond physics softened to ~⅓ bounciness', () => {
  it('repulsion is cut to 300 (one-third of the pre-polish 900)', () => {
    expect(DEFAULT_PHYSICS.repulsion).toBe(300);
  });

  it('gravity is unchanged (slow organic pull toward center stays)', () => {
    expect(DEFAULT_PHYSICS.gravity).toBe(0.8);
  });

  it('damping is unchanged (orbs still glide rather than snap)', () => {
    expect(DEFAULT_PHYSICS.damping).toBe(0.85);
  });

  it('idleJitter is unchanged (pond never goes completely still)', () => {
    expect(DEFAULT_PHYSICS.idleJitter).toBe(24);
  });

  it('cursorAttraction is unchanged (gentle pull toward cursor stays)', () => {
    expect(DEFAULT_PHYSICS.cursorAttraction).toBe(4000);
  });
});
