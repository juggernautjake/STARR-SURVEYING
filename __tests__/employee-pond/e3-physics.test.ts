// __tests__/employee-pond/e3-physics.test.ts
//
// employee-pond Slice E3 — pure physics + the rAF hook wiring.
// The pure step is unit-tested with deterministic dt + state; the
// hook + component wiring is source-locked.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_PHYSICS,
  stepPhysics,
  totalKineticEnergy,
  type OrbState,
} from '@/lib/employee-pond/physics';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const POND = 280;
const R = 32;

function orb(over: Partial<OrbState> = {}): OrbState {
  return { id: 'o1', x: 0, y: 0, vx: 0, vy: 0, radius: R, ...over };
}

describe('stepPhysics — gravity', () => {
  it('an orb at center with zero velocity stays put', () => {
    const list = [orb()];
    stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 0.016 });
    expect(list[0].x).toBeCloseTo(0, 3);
    expect(list[0].y).toBeCloseTo(0, 3);
  });

  it('an orb offset from center accelerates back toward it', () => {
    const list = [orb({ x: 100, y: 0 })];
    stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 0.016 });
    expect(list[0].vx).toBeLessThan(0);
  });

  it('the dragging flag suppresses gravity', () => {
    const list = [orb({ x: 100, dragging: true })];
    stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 0.016 });
    expect(list[0].vx).toBe(0);
    expect(list[0].x).toBe(100);
  });

  it('dt <= 0 is a no-op (defensive)', () => {
    const list = [orb({ x: 100, vx: 50 })];
    stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 0 });
    expect(list[0]).toEqual({ id: 'o1', x: 100, y: 0, vx: 50, vy: 0, radius: R });
  });
});

describe('stepPhysics — pairwise repulsion', () => {
  it('two overlapping orbs push each other away', () => {
    const list = [orb({ id: 'a', x: 0, y: 0 }), orb({ id: 'b', x: 30, y: 0 })];
    // Pre-step: distance 30, sum of radii 64 → overlapping.
    stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 0.016 });
    expect(list[0].vx).toBeLessThan(0); // 'a' pushed left
    expect(list[1].vx).toBeGreaterThan(0); // 'b' pushed right
  });

  it('two non-overlapping orbs exchange no force', () => {
    const list = [orb({ id: 'a', x: 0, y: 0 }), orb({ id: 'b', x: 100, y: 0 })];
    stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 0.016 });
    // Only gravity acts; both at y=0 means no y velocity.
    expect(list[0].vy).toBe(0);
    expect(list[1].vy).toBe(0);
  });

  it('a dragging orb still pushes others (without being pushed itself)', () => {
    const list = [
      orb({ id: 'a', x: 0, y: 0, dragging: true }),
      orb({ id: 'b', x: 30, y: 0 }),
    ];
    stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 0.016 });
    expect(list[0].vx).toBe(0); // dragger unchanged
    expect(list[1].vx).toBeGreaterThan(0); // pushed
  });
});

describe('stepPhysics — pond wall bounce', () => {
  it('clamps an orb that crossed the pond edge back inside', () => {
    const list = [orb({ x: 1000, y: 0, vx: 50 })]; // way outside
    stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 0.016 });
    const dist = Math.sqrt(list[0].x ** 2 + list[0].y ** 2);
    expect(dist).toBeLessThanOrEqual(POND - R + 0.0001);
  });

  it('reflects the velocity normal component when leaving the pond', () => {
    const list = [orb({ x: POND - R + 1, y: 0, vx: 200 })];
    stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 0.016 });
    // Was moving outward; reflection should now point inward.
    expect(list[0].vx).toBeLessThan(0);
  });
});

describe('stepPhysics — damping', () => {
  it('reduces velocity over time toward zero', () => {
    const list = [orb({ vx: 200, vy: 0 })];
    const before = list[0].vx;
    // Run 60 frames of 16.6 ms — about 1 second.
    for (let i = 0; i < 60; i++) {
      stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 1 / 60 });
    }
    expect(Math.abs(list[0].vx)).toBeLessThan(Math.abs(before));
  });

  it("totalKineticEnergy decreases over time when no external force acts", () => {
    const list = [orb({ vx: 100, vy: 100 })];
    const before = totalKineticEnergy(list);
    for (let i = 0; i < 60; i++) {
      stepPhysics(list, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 1 / 60 });
    }
    expect(totalKineticEnergy(list)).toBeLessThan(before);
  });
});

describe('useEmployeePondPhysics.ts — hook contract', () => {
  const SRC = read('app/admin/employees/useEmployeePondPhysics.ts');

  it('owns the rAF lifecycle (requestAnimationFrame + cancel on unmount)', () => {
    expect(SRC).toMatch(/window\.requestAnimationFrame\(loop\)/);
    expect(SRC).toMatch(/window\.cancelAnimationFrame\(rafRef\.current\)/);
  });

  it('caps dt so a tab-switch catch-up frame can\'t explode the sim', () => {
    expect(SRC).toMatch(/MAX_DT_SEC = 0\.033/);
    expect(SRC).toMatch(/Math\.min\(MAX_DT_SEC,/);
  });

  it('skips the rAF setup entirely when enabled = false (battery save)', () => {
    expect(SRC).toMatch(/if \(!args\.enabled\) return;/);
  });

  it("syncs the orb pool when visibleIds changes (existing keep state, new spawn at placeOrb)", () => {
    expect(SRC).toMatch(/const prior = existing\.get\(id\);/);
    expect(SRC).toMatch(/placeOrb\(rand, args\.pondRadius\)/);
  });

  it('returns a handle with setOrb + setDragging for the drag slice (E6) to call', () => {
    // Uses shorthand method syntax: `setOrb(id, patch) { ... }`.
    expect(SRC).toMatch(/setOrb\(id, patch\) \{/);
    expect(SRC).toMatch(/setDragging\(id, dragging\) \{/);
  });

  it('writes each orb transform imperatively (no React re-render per frame)', () => {
    expect(SRC).toMatch(/el\.style\.transform = `translate3d\(calc\(\$\{orb\.x\.toFixed\(2\)\}px - 50%\)/);
  });
});

describe('EmployeePond.tsx — E3 hook wiring', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('imports the physics hook', () => {
    expect(SRC).toMatch(/import \{ useEmployeePondPhysics \} from '\.\/useEmployeePondPhysics'/);
  });

  it("declares the orb refs map + a stable setOrbRef callback", () => {
    expect(SRC).toMatch(/const orbRefsRef = useRef<Map<string, HTMLElement \| null>>/);
    expect(SRC).toMatch(/const setOrbRef = useCallback/);
  });

  it('calls the hook with visibleIds + ORB_RADIUS_PX + POND_RADIUS_PX + seed + enabled', () => {
    expect(SRC).toMatch(
      /useEmployeePondPhysics\(orbRefsRef\.current, \{[\s\S]*?visibleIds,[\s\S]*?pondRadius: POND_RADIUS_PX,[\s\S]*?orbRadius: ORB_RADIUS_PX,[\s\S]*?seed,[\s\S]*?enabled: true,[\s\S]*?\}\);/,
    );
  });

  it('attaches the ref callback on every orb element', () => {
    expect(SRC).toMatch(/ref=\{setOrbRef\(employee\.id\)\}/);
  });

  it("drops the static inline transform — physics owns position now", () => {
    expect(SRC).not.toMatch(/style=\{\{\s*\n\s*transform: `translate3d\(calc\(\$\{pos\.x\}px/);
  });
});
