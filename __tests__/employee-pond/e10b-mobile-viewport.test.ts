// __tests__/employee-pond/e10b-mobile-viewport.test.ts
//
// employee-pond Slice E10b — mobile-responsive build + soft pond
// viewport. Locks the phone CSS overrides (toolbar reorg, full-
// screen filter sheet, bottom-sheet dialogue, 44 pt touch targets,
// safe-area insets) and the soft-viewport physics change (orbs
// can drift outside the visible circle; pulled back gently).

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
const orb = (over: Partial<OrbState> = {}): OrbState => ({
  id: 'o1', x: 0, y: 0, vx: 0, vy: 0, radius: R, ...over,
});

describe('physics — soft viewport (E10b)', () => {
  it('does not clamp an orb that drifted outside the visible radius', () => {
    const list = [orb({ x: 500, y: 0, vx: 0 })];
    stepPhysics(list, {
      pondRadius: POND,
      ...DEFAULT_PHYSICS,
      idleJitter: 0,
      dt: 0.016,
    });
    expect(list[0].x).toBeGreaterThan(POND); // still outside
  });

  it("applies an inward pull whose magnitude grows with overshoot", () => {
    const closer = [orb({ x: POND + 50, y: 0, vx: 0 })];
    const farther = [orb({ x: POND + 200, y: 0, vx: 0 })];
    stepPhysics(closer, {
      pondRadius: POND,
      ...DEFAULT_PHYSICS,
      idleJitter: 0,
      dt: 0.016,
    });
    stepPhysics(farther, {
      pondRadius: POND,
      ...DEFAULT_PHYSICS,
      idleJitter: 0,
      dt: 0.016,
    });
    expect(farther[0].vx).toBeLessThan(closer[0].vx);
  });

  it("an outside orb with no opposing velocity eventually drifts back toward center", () => {
    const list = [orb({ x: POND + 100, y: 0, vx: 0 })];
    // Run 5 seconds of simulation @ 60 fps.
    for (let i = 0; i < 300; i++) {
      stepPhysics(list, {
        pondRadius: POND,
        ...DEFAULT_PHYSICS,
        idleJitter: 0,
        dt: 1 / 60,
      });
    }
    expect(list[0].x).toBeLessThan(POND + 100); // closer to center
  });

  it("dragging orbs ignore the viewport pull (so the user can drag freely off-screen)", () => {
    const list = [orb({ x: POND + 100, y: 0, vx: 0, dragging: true })];
    stepPhysics(list, {
      pondRadius: POND,
      ...DEFAULT_PHYSICS,
      idleJitter: 0,
      dt: 0.016,
    });
    expect(list[0].vx).toBe(0); // no force applied
  });
});

describe('EmployeePond.css — E10b mobile toolbar reorg', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('toolbar stacks column on phone with the search row first', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.employee-pond__toolbar \{[\s\S]*?flex-direction: column/,
    );
  });

  it('search input + filter button both hit 44 pt min on phone', () => {
    expect(CSS).toMatch(/\.employee-pond__search \{[\s\S]*?min-height: 44px[\s\S]*?\}/);
    expect(CSS).toMatch(/\.employee-pond__filter-btn \{[\s\S]*?min-height: 44px[\s\S]*?\}/);
  });
});

describe('EmployeePond.css — E10b filter panel becomes a full-screen sheet on phone', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('panel takes position: fixed inset:0 on phone', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.employee-pond__filter-panel \{[\s\S]*?position: fixed;[\s\S]*?inset: 0/,
    );
  });

  it('panel respects safe-area-inset for the iOS home indicator + notch', () => {
    expect(CSS).toMatch(
      /padding-bottom: calc\(var\(--space-5\) \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
    expect(CSS).toMatch(
      /padding-top: calc\(var\(--space-4\) \+ env\(safe-area-inset-top, 0px\)\)/,
    );
  });

  it('filter rows + checkboxes bump to thumb-friendly sizes', () => {
    expect(CSS).toMatch(/\.employee-pond__filter-row \{[\s\S]*?padding: 10px 12px;[\s\S]*?font-size: var\(--text-base\)/);
    expect(CSS).toMatch(/\.employee-pond__filter-row input\[type='checkbox'\] \{[\s\S]*?width: 22px;[\s\S]*?height: 22px/);
  });
});

describe('EmployeePond.css — E10b dialogue becomes a bottom-sheet on phone', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('dialogue overrides position to fixed + bottom: 0 (slides up from bottom)', () => {
    expect(CSS).toMatch(
      /\.employee-pond__dialogue \{[\s\S]*?position: fixed !important;[\s\S]*?bottom: 0 !important;[\s\S]*?width: 100% !important/,
    );
  });

  it('top corners rounded; bottom flat (sheet metaphor)', () => {
    expect(CSS).toMatch(/border-radius: var\(--radius-lg\) var\(--radius-lg\) 0 0/);
  });

  it('rises into view via a sheet-rise keyframe (300 ms ease-out cubic)', () => {
    expect(CSS).toMatch(/@keyframes employee-pond-sheet-rise \{[\s\S]*?from \{ transform: translateY\(100%\) !important;/);
  });

  it('grab handle indicator at the top of the sheet (purely visual)', () => {
    expect(CSS).toMatch(
      /\.employee-pond__dialogue::before \{[\s\S]*?width: 36px;[\s\S]*?height: 4px[\s\S]*?background: #D1D5DB/,
    );
  });

  it('Email + Message + Open profile buttons hit 44 pt min', () => {
    expect(CSS).toMatch(/\.employee-pond__dialogue-btn \{[\s\S]*?min-height: 44px/);
    expect(CSS).toMatch(/\.employee-pond__dialogue-link \{[\s\S]*?min-height: 44px/);
  });

  it('close button bumps to 44×44 on phone', () => {
    expect(CSS).toMatch(/\.employee-pond__dialogue-close \{[\s\S]*?width: 44px;[\s\S]*?height: 44px/);
  });

  it('respects safe-area-inset-bottom so the home indicator stays clear', () => {
    expect(CSS).toMatch(/padding-bottom: calc\(var\(--space-4\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });
});

describe('EmployeePond.css — E10b small-phone (≤480 px) tightening', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it("shrinks pond + orb sizes for the smallest devices", () => {
    expect(CSS).toMatch(/@media \(max-width: 480px\) \{[\s\S]*?--pond-radius: 140px[\s\S]*?--orb-size: 52px/);
  });

  it("shrinks the list-row avatar to 32×32 for narrow rows", () => {
    expect(CSS).toMatch(
      /@media \(max-width: 480px\) \{[\s\S]*?\.employee-pond__list-avatar \{[\s\S]*?width: 32px;[\s\S]*?height: 32px/,
    );
  });
});
