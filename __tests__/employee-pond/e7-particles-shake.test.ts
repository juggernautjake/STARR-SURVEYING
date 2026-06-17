// __tests__/employee-pond/e7-particles-shake.test.ts
//
// employee-pond Slice E7 — particle FX on dragged collisions +
// shake-to-release detection + neighbor kick. Locks the pure helpers
// (detectShake), the physics-step collision callback, the hook
// forward, and the page wiring (particle state, spawn / remove,
// shake handling in pointermove, neighbor kick).

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectShake,
  SHAKE_MIN_REVERSALS,
  SHAKE_WINDOW_MS,
  type MotionSample,
} from '@/lib/employee-pond/drag';
import {
  stepPhysics,
  DEFAULT_PHYSICS,
  type OrbState,
} from '@/lib/employee-pond/physics';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const POND = 280;
const R = 32;
const orb = (over: Partial<OrbState> = {}): OrbState => ({
  id: 'o1', x: 0, y: 0, vx: 0, vy: 0, radius: R, ...over,
});

describe('detectShake — pure helper', () => {
  it('exports thresholds: 3 reversals within 400 ms', () => {
    expect(SHAKE_MIN_REVERSALS).toBe(3);
    expect(SHAKE_WINDOW_MS).toBe(400);
  });

  it('false when the buffer has too few samples to detect reversals', () => {
    expect(detectShake([])).toBe(false);
    expect(detectShake([{ x: 0, y: 0, t: 0 }])).toBe(false);
  });

  it('false when motion is steady-direction (no reversals)', () => {
    const samples: MotionSample[] = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 0, t: 30 },
      { x: 20, y: 0, t: 60 },
      { x: 30, y: 0, t: 90 },
      { x: 40, y: 0, t: 120 },
    ];
    expect(detectShake(samples)).toBe(false);
  });

  it('true for three back-and-forth reversals within 400 ms', () => {
    const samples: MotionSample[] = [
      { x: 0,  y: 0, t: 0 },
      { x: 20, y: 0, t: 40 },
      { x: -10, y: 0, t: 80 },
      { x: 20, y: 0, t: 120 },
      { x: -10, y: 0, t: 160 },
      { x: 20, y: 0, t: 200 },
    ];
    expect(detectShake(samples)).toBe(true);
  });

  it('false when reversals span more than 400 ms (a slow swerve, not a shake)', () => {
    const samples: MotionSample[] = [
      { x: 0, y: 0, t: 0 },
      { x: 20, y: 0, t: 100 },
      { x: -10, y: 0, t: 250 },
      { x: 20, y: 0, t: 380 },
      { x: -10, y: 0, t: 500 },
    ];
    expect(detectShake(samples)).toBe(false);
  });
});

describe('stepPhysics — E7 onDraggedCollision callback', () => {
  it('fires when overlap involves a dragging orb', () => {
    const cb = vi.fn();
    const list = [
      orb({ id: 'a', x: 0, y: 0, dragging: true }),
      orb({ id: 'b', x: 30, y: 0 }),
    ];
    stepPhysics(list, {
      pondRadius: POND,
      ...DEFAULT_PHYSICS,
      idleJitter: 0,
      onDraggedCollision: cb,
      dt: 0.016,
    });
    expect(cb).toHaveBeenCalled();
    const arg = cb.mock.calls[0][0];
    expect(arg.x).toBeCloseTo(15);
    expect(arg.y).toBeCloseTo(0);
    expect(arg.force).toBeGreaterThan(0);
  });

  it('does NOT fire when neither orb is dragging (regular collision)', () => {
    const cb = vi.fn();
    const list = [
      orb({ id: 'a', x: 0, y: 0 }),
      orb({ id: 'b', x: 30, y: 0 }),
    ];
    stepPhysics(list, {
      pondRadius: POND,
      ...DEFAULT_PHYSICS,
      idleJitter: 0,
      onDraggedCollision: cb,
      dt: 0.016,
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT fire when orbs are not overlapping', () => {
    const cb = vi.fn();
    const list = [
      orb({ id: 'a', x: 0, y: 0, dragging: true }),
      orb({ id: 'b', x: 200, y: 0 }),
    ];
    stepPhysics(list, {
      pondRadius: POND,
      ...DEFAULT_PHYSICS,
      idleJitter: 0,
      onDraggedCollision: cb,
      dt: 0.016,
    });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('useEmployeePondPhysics — E7 forwards the collision callback', () => {
  const SRC = read('app/admin/employees/useEmployeePondPhysics.ts');

  it('args.onDraggedCollision is held in a ref so the loop reads the latest', () => {
    expect(SRC).toMatch(/const collisionCbRef = useRef<UsePondPhysicsArgs\['onDraggedCollision'\]>/);
    expect(SRC).toMatch(/collisionCbRef\.current = args\.onDraggedCollision/);
  });

  it("loop hands collisionCbRef.current to stepPhysics every frame", () => {
    expect(SRC).toMatch(/onDraggedCollision: collisionCbRef\.current,/);
  });
});

describe('EmployeePond.tsx — E7 page wiring', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('imports detectShake', () => {
    expect(SRC).toMatch(/detectShake/);
  });

  it('declares the particle state + a seq counter + a max-pool cap', () => {
    expect(SRC).toMatch(/const \[particles, setParticles\] = useState<Particle\[\]>/);
    expect(SRC).toMatch(/const particleSeqRef = useRef<number>/);
    expect(SRC).toMatch(/MAX_ACTIVE_PARTICLES = 64/);
  });

  it('spawnParticles caps the pool at MAX_ACTIVE_PARTICLES', () => {
    expect(SRC).toMatch(/next\.length > MAX_ACTIVE_PARTICLES[\s\S]*?next\.slice\(next\.length - MAX_ACTIVE_PARTICLES\)/);
  });

  it("collision callback throttles to once per ≥40 ms", () => {
    expect(SRC).toMatch(/if \(now - lastCollisionAtRef\.current < 40\) return;/);
  });

  it('drag pointerdown resets shakeReleasedRef so each drag starts fresh', () => {
    expect(SRC).toMatch(/shakeReleasedRef\.current = false;/);
  });

  it("pointermove fires detectShake; on a positive hit, releases the orb + kicks neighbors + spawns 12 particles", () => {
    expect(SRC).toMatch(/if \(!shakeReleasedRef\.current && detectShake\(samples\)\)/);
    expect(SRC).toMatch(/physics\.setDragging\(employee\.id, false\)/);
    expect(SRC).toMatch(/spawnParticles\(pond\.x, pond\.y, 12\)/);
    expect(SRC).toMatch(/kickNeighbors\(pond\.x, pond\.y, 140, 220\)/);
  });

  it("pointerup skips the release-velocity logic when shake already fired", () => {
    expect(SRC).toMatch(/wasDragged && !shakeReleasedRef\.current/);
  });

  it('every particle renders with CSS custom properties + auto-removes onAnimationEnd', () => {
    expect(SRC).toMatch(/data-testid="employee-pond-particle"/);
    expect(SRC).toMatch(/'--p-x': p\.x/);
    expect(SRC).toMatch(/onAnimationEnd=\{\(\) => removeParticle\(p\.id\)\}/);
  });

  it('kickNeighbors iterates the physics handle and patches velocities', () => {
    expect(SRC).toMatch(/const kickNeighbors = useCallback\(/);
    expect(SRC).toMatch(/for \(const o of physics\.orbs\)/);
    expect(SRC).toMatch(/physics\.setOrb\(o\.id, \{[\s\S]*?vx: o\.vx \+/);
  });
});

describe('EmployeePond.css — E7 particle styling', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('particle is absolutely positioned + 8 px circle', () => {
    expect(CSS).toMatch(/\.employee-pond__particle \{[\s\S]*?width: 8px;[\s\S]*?height: 8px;[\s\S]*?border-radius: 50%/);
  });

  it('declares the particle keyframes (start → travel via --p-x/--p-y/--p-vx/--p-vy)', () => {
    expect(CSS).toMatch(/@keyframes employee-pond-particle \{/);
    expect(CSS).toMatch(/--travel-x: calc\(\(var\(--p-x\) \+ var\(--p-vx\) \* 0\.5\) \* 1px - 50%\)/);
  });

  it('reduced-motion collapses the particle animation to 1 ms', () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.employee-pond__particle \{[\s\S]*?animation: employee-pond-particle 1ms linear forwards/);
  });
});
