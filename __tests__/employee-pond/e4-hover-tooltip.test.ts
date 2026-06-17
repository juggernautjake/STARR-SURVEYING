// __tests__/employee-pond/e4-hover-tooltip.test.ts
//
// employee-pond Slice E4 — hover scale + neighbor bump + tooltip.
// Locks the OrbState scale field, hook patch acceptance, component
// hover-state wiring (pointer + focus), and the orb markup
// restructure (clip + tooltip + data-hovered).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  stepPhysics,
  DEFAULT_PHYSICS,
  type OrbState,
} from '@/lib/employee-pond/physics';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const POND = 280;
const R = 32;

function orb(over: Partial<OrbState> = {}): OrbState {
  return { id: 'o1', x: 0, y: 0, vx: 0, vy: 0, radius: R, ...over };
}

describe('OrbState — E4 scale field is honored end-to-end', () => {
  it("growing an orb's radius makes neighbors feel a stronger push", () => {
    // Two orbs side-by-side at distance 50 (just within sum-of-radii).
    const list1 = [orb({ id: 'a', x: 0 }), orb({ id: 'b', x: 50 })];
    stepPhysics(list1, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 1 / 60 });
    const baselinePushB = list1[1].vx;

    // Same two orbs but A's radius grew (hover).
    const list2 = [
      orb({ id: 'a', x: 0, radius: R * 1.2 }),
      orb({ id: 'b', x: 50 }),
    ];
    stepPhysics(list2, { pondRadius: POND, ...DEFAULT_PHYSICS, dt: 1 / 60 });
    const hoveredPushB = list2[1].vx;

    expect(hoveredPushB).toBeGreaterThan(baselinePushB);
  });
});

describe('useEmployeePondPhysics — E4 transform includes scale', () => {
  const SRC = read('app/admin/employees/useEmployeePondPhysics.ts');

  it('reads orb.scale (default 1) and appends scale(...) to the transform write', () => {
    expect(SRC).toMatch(/const scale = orb\.scale \?\? 1;/);
    expect(SRC).toMatch(/scale\(\$\{scale\.toFixed\(3\)\}\)/);
  });

  it('setOrb accepts radius + scale patches', () => {
    expect(SRC).toMatch(/if \(patch\.radius !== undefined\) o\.radius = patch\.radius;/);
    expect(SRC).toMatch(/if \(patch\.scale !== undefined\) o\.scale = patch\.scale;/);
  });
});

describe('EmployeePond.tsx — E4 hover wiring', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('holds hoveredEmployeeId state + a prev ref to know which orb to reset', () => {
    expect(SRC).toMatch(/const \[hoveredEmployeeId, setHoveredEmployeeId\] = useState<string \| null>/);
    expect(SRC).toMatch(/const prevHoveredRef = useRef<string \| null>/);
  });

  it('declares HOVER_SCALE + HOVER_RADIUS constants (so the bump is consistent)', () => {
    expect(SRC).toMatch(/const HOVER_SCALE = /);
    expect(SRC).toMatch(/const HOVER_RADIUS = ORB_RADIUS_PX \* HOVER_SCALE/);
  });

  it('hover-change effect resets the previous orb + bumps the new one', () => {
    expect(SRC).toMatch(/if \(prev && prev !== hoveredEmployeeId\) \{[\s\S]*?physics\.setOrb\(prev, \{ scale: 1, radius: ORB_RADIUS_PX \}\)/);
    expect(SRC).toMatch(/physics\.setOrb\(hoveredEmployeeId, \{[\s\S]*?scale: HOVER_SCALE,[\s\S]*?radius: HOVER_RADIUS/);
  });

  it("pointer hover excludes touch input (so a finger swipe doesn't grow orbs)", () => {
    expect(SRC).toMatch(
      /onPointerEnter=\{\(e\) => \{[\s\S]*?if \(e\.pointerType === 'mouse' \|\| e\.pointerType === 'pen'\)/,
    );
  });

  it('keyboard focus also fires hover (accessibility — tooltip reachable without a mouse)', () => {
    expect(SRC).toMatch(/onFocus=\{\(\) => setHoveredEmployeeId\(employee\.id\)\}/);
    expect(SRC).toMatch(/onBlur=\{\(\) =>\s*\n?\s*setHoveredEmployeeId\(\(cur\) => \(cur === employee\.id \? null : cur\)\)/);
  });

  it('orb element carries data-hovered + restructured markup (clip wraps avatar)', () => {
    expect(SRC).toMatch(/data-hovered=\{hoveredEmployeeId === employee\.id \? 'true' : undefined\}/);
    expect(SRC).toMatch(/<div className="employee-pond__orb-clip">/);
  });

  it('renders the tooltip with name + email + role="tooltip" + aria-hidden mirror', () => {
    expect(SRC).toMatch(/data-testid="employee-pond-orb-tooltip"/);
    expect(SRC).toMatch(/role="tooltip"/);
    expect(SRC).toMatch(/aria-hidden=\{hoveredEmployeeId !== employee\.id\}/);
    expect(SRC).toMatch(/employee-pond__orb-tooltip-name/);
    expect(SRC).toMatch(/employee-pond__orb-tooltip-email/);
  });
});

describe('EmployeePond.css — E4 contract', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('orb is now overflow: visible (was hidden) so the tooltip can escape', () => {
    expect(CSS).toMatch(/\.employee-pond__orb \{[\s\S]*?overflow: visible/);
  });

  it('orb-clip child holds overflow: hidden so the avatar stays circle-clipped', () => {
    expect(CSS).toMatch(/\.employee-pond__orb-clip \{[\s\S]*?overflow: hidden/);
  });

  it('hovered orb gets a brand-navy-tinted shadow + z-index bump', () => {
    expect(CSS).toMatch(
      /\.employee-pond__orb\[data-hovered='true'\] \{[\s\S]*?box-shadow:[\s\S]*?z-index: 2/,
    );
  });

  it('tooltip starts invisible and fades in when data-hovered is true', () => {
    expect(CSS).toMatch(/\.employee-pond__orb-tooltip \{[\s\S]*?opacity: 0;[\s\S]*?transition: opacity/);
    expect(CSS).toMatch(
      /\.employee-pond__orb\[data-hovered='true'\] \.employee-pond__orb-tooltip \{[\s\S]*?opacity: 1/,
    );
  });

  it("tooltip carries an arrow caret pointing up at the orb", () => {
    expect(CSS).toMatch(
      /\.employee-pond__orb-tooltip::before \{[\s\S]*?border-bottom-color: var\(--color-text-primary\)/,
    );
  });

  it('prefers-reduced-motion collapses the fade transition', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.employee-pond__orb-tooltip \{[\s\S]*?transition: opacity 1ms/,
    );
  });

  it("still uses canonical tokens (no drift)", () => {
    expect(CSS).toMatch(/var\(--color-text-on-dark\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
  });
});
