// __tests__/employee-pond/e6b-feel-selection.test.ts
//
// employee-pond Slice E6b — dynamic/organic/fun feel tuning +
// selection focus. Locks the new physics defaults, the cursor
// attraction + idle jitter forces, the hook handle's setCursor,
// and the page wiring (selection effect, pond cursor handlers,
// data-selection-active mirror) + the CSS dim rule.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_PHYSICS,
  stepPhysics,
  type OrbState,
} from '@/lib/employee-pond/physics';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const POND = 280;
const R = 32;

function orb(over: Partial<OrbState> = {}): OrbState {
  return { id: 'o1', x: 0, y: 0, vx: 0, vy: 0, radius: R, ...over };
}

describe('DEFAULT_PHYSICS — E6b tuning', () => {
  it('gravity dropped from 1.4 → 0.8 so orbs glide rather than snap', () => {
    expect(DEFAULT_PHYSICS.gravity).toBe(0.8);
  });

  it('damping raised so velocity decays more gently (closer to 1.0)', () => {
    expect(DEFAULT_PHYSICS.damping).toBeGreaterThanOrEqual(0.7);
  });

  it('declares idleJitter so the pond never goes completely still', () => {
    expect(DEFAULT_PHYSICS.idleJitter).toBeGreaterThan(0);
  });

  it('declares cursorAttraction so orbs subtly drift toward the cursor', () => {
    expect(DEFAULT_PHYSICS.cursorAttraction).toBeGreaterThan(0);
  });
});

describe('stepPhysics — E6b cursor attraction', () => {
  it("an orb feels a pull toward a non-null cursor", () => {
    const list = [orb({ x: 0, y: 0 })];
    stepPhysics(list, {
      pondRadius: POND,
      ...DEFAULT_PHYSICS,
      // Strong + close to make the effect dominant for the test.
      gravity: 0,
      idleJitter: 0,
      cursor: { x: 100, y: 0 },
      cursorAttraction: 5000,
      dt: 0.016,
    });
    expect(list[0].vx).toBeGreaterThan(0);
  });

  it('zero attraction when cursor is null (default behavior)', () => {
    const list = [orb({ x: 0, y: 0 })];
    stepPhysics(list, {
      pondRadius: POND,
      gravity: 0,
      repulsion: 0,
      damping: 1,
      bounceRestitution: 0,
      idleJitter: 0,
      cursor: null,
      cursorAttraction: 5000,
      dt: 0.016,
    });
    expect(list[0].vx).toBe(0);
    expect(list[0].vy).toBe(0);
  });

  it("a dragging orb ignores cursor attraction", () => {
    const list = [orb({ x: 0, y: 0, dragging: true })];
    stepPhysics(list, {
      pondRadius: POND,
      ...DEFAULT_PHYSICS,
      cursor: { x: 100, y: 0 },
      dt: 0.016,
    });
    expect(list[0].vx).toBe(0);
  });
});

describe('stepPhysics — E6b idle jitter', () => {
  it('non-zero jitter perturbs an orb away from a perfectly still state', () => {
    const list = [orb({ x: 0, y: 0 })];
    let nonZeroSeen = false;
    // Run several frames; PRNG should produce at least one
    // measurable nudge within 60 frames.
    for (let i = 0; i < 60; i++) {
      stepPhysics(list, {
        pondRadius: POND,
        gravity: 0,
        repulsion: 0,
        damping: 1,
        bounceRestitution: 0,
        idleJitter: 50,
        dt: 0.016,
      });
      if (Math.abs(list[0].vx) > 0 || Math.abs(list[0].vy) > 0) {
        nonZeroSeen = true;
        break;
      }
    }
    expect(nonZeroSeen).toBe(true);
  });

  it('zero jitter leaves the orb still', () => {
    const list = [orb({ x: 0, y: 0 })];
    stepPhysics(list, {
      pondRadius: POND,
      gravity: 0,
      repulsion: 0,
      damping: 1,
      bounceRestitution: 0,
      idleJitter: 0,
      dt: 0.016,
    });
    expect(list[0].vx).toBe(0);
    expect(list[0].vy).toBe(0);
  });
});

describe('useEmployeePondPhysics — E6b setCursor on the handle', () => {
  const SRC = read('app/admin/employees/useEmployeePondPhysics.ts');

  it('declares the cursorRef inside the hook', () => {
    expect(SRC).toMatch(/const cursorRef = useRef<\{ x: number; y: number \} \| null>/);
  });

  it("hands cursorRef.current to stepPhysics every frame", () => {
    expect(SRC).toMatch(/cursor: cursorRef\.current,/);
  });

  it('handle exposes setCursor that mutates the ref', () => {
    expect(SRC).toMatch(/setCursor\(cursor\) \{\s*\n\s*cursorRef\.current = cursor;\s*\n\s*\}/);
  });
});

describe('EmployeePond.tsx — E6b wiring', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('declares SELECTION_SCALE + SELECTION_RADIUS constants + a prevSelectedRef', () => {
    expect(SRC).toMatch(/const prevSelectedRef = useRef<string \| null>/);
    expect(SRC).toMatch(/const SELECTION_SCALE = /);
    expect(SRC).toMatch(/const SELECTION_RADIUS = /);
  });

  it('selection effect bumps the selected orb + resets the previous one', () => {
    expect(SRC).toMatch(/physics\.setOrb\(selectedEmployee\.id, \{[\s\S]*?scale: SELECTION_SCALE,[\s\S]*?radius: SELECTION_RADIUS/);
    expect(SRC).toMatch(/physics\.setOrb\(prev, \{ scale: 1, radius: ORB_RADIUS_PX \}\)/);
  });

  it("hover effect early-returns while a dialogue is open (selection owns the bump)", () => {
    expect(SRC).toMatch(/if \(selectedEmployee\) return; \/\/ selection effect owns the bump/);
  });

  it("pond surface mirrors selectedEmployee via data-selection-active", () => {
    expect(SRC).toMatch(/data-selection-active=\{selectedEmployee \? 'true' : undefined\}/);
  });

  it("pond surface onPointerMove feeds the cursor into physics; onPointerLeave clears it", () => {
    expect(SRC).toMatch(/onPointerMove=\{\(e\) => \{[\s\S]*?physics\.setCursor\(pond\)/);
    expect(SRC).toMatch(/onPointerLeave=\{\(\) => \{\s*\n\s*physics\.setCursor\(null\)/);
  });

  it("cursor tracking skips touch input (the drag handler already owns finger gestures)", () => {
    expect(SRC).toMatch(
      /onPointerMove=\{\(e\) => \{[\s\S]*?if \(e\.pointerType !== 'mouse' && e\.pointerType !== 'pen'\) return/,
    );
  });
});

describe('EmployeePond.css — E6b selection focus dim', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('non-selected orbs dim to opacity ≈ 0.32 when selection-active is true', () => {
    expect(CSS).toMatch(
      /\.employee-pond__pond\[data-selection-active='true'\]\s*\n?\s*\.employee-pond__orb:not\(\[data-selected='true'\]\) \{\s*\n\s*opacity: 0\.32/,
    );
  });

  it('the selected orb stays opacity: 1 and z-index above the dimmed neighbors', () => {
    expect(CSS).toMatch(
      /\.employee-pond__pond\[data-selection-active='true'\]\s*\n?\s*\.employee-pond__orb\[data-selected='true'\] \{[\s\S]*?opacity: 1;[\s\S]*?z-index: 5/,
    );
  });

  it('orb has an opacity transition so the dim is smooth', () => {
    expect(CSS).toMatch(/\.employee-pond__orb \{[\s\S]*?transition:[\s\S]*?opacity 200ms ease/);
  });

  it("prefers-reduced-motion disables the orb transition", () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.employee-pond__orb \{[\s\S]*?transition: none/,
    );
  });
});
