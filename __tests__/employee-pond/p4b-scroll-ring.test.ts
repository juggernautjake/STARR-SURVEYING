// __tests__/employee-pond/p4b-scroll-ring.test.ts
//
// Slice P4b (employee-pond-polish-2026-06-16) — user feedback:
//   "Omni-directional scroll ring … a circular outline around the
//    pond. Hover: the ring enlarges slightly and shows a 'Click to
//    scroll' tooltip. Click + hold on a side of the ring: the
//    camera pans in that direction. Releasing stops the pan.
//    Gravity stays anchored to the world origin so orbs always
//    drift back toward where they started."
//
// Two halves:
//   1) Behavior — the pure helpers in lib/employee-pond/camera.ts
//      (pan vector from pointer geometry; camera clamp; ring hit
//      test) are testable without React.
//   2) Source-lock — the React wiring (camera ref, pan loop, ring
//      component, reset-recenters-camera, CSS shapes) is locked
//      by string match so future refactors keep the contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyCameraStep,
  panVectorFromPointer,
  pointerIsOnRing,
} from '../../lib/employee-pond/camera';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('panVectorFromPointer (pure helper)', () => {
  it('returns a unit-magnitude vector scaled by `speed`', () => {
    const v = panVectorFromPointer({ x: 100, y: 0 }, 240);
    expect(v.vx).toBeCloseTo(240);
    expect(v.vy).toBeCloseTo(0);
  });

  it('the angle to the pointer picks direction, distance does not change speed', () => {
    const near = panVectorFromPointer({ x: 30, y: 40 }, 250); // hypot = 50
    const far  = panVectorFromPointer({ x: 300, y: 400 }, 250); // hypot = 500
    expect(Math.hypot(near.vx, near.vy)).toBeCloseTo(250);
    expect(Math.hypot(far.vx, far.vy)).toBeCloseTo(250);
    // Same direction (3-4-5 triangle scaled either way).
    expect(near.vx / near.vy).toBeCloseTo(far.vx / far.vy, 6);
  });

  it('returns a zero vector inside the dead zone', () => {
    expect(panVectorFromPointer({ x: 0, y: 0 }, 200)).toEqual({ vx: 0, vy: 0 });
    expect(panVectorFromPointer({ x: 2, y: 1 }, 200, 5)).toEqual({ vx: 0, vy: 0 });
  });

  it('clicking at the TOP of the ring pans the camera upward (negative y)', () => {
    const v = panVectorFromPointer({ x: 0, y: -100 }, 240);
    expect(v.vy).toBeLessThan(0);
  });
});

describe('applyCameraStep (pure helper)', () => {
  it('advances the camera by velocity × dt', () => {
    const cam = applyCameraStep({ x: 0, y: 0 }, { vx: 100, vy: 0 }, 0.5, 9999);
    expect(cam.x).toBeCloseTo(50);
    expect(cam.y).toBeCloseTo(0);
  });

  it("clamps to the camera envelope so the user can't scroll into the void forever", () => {
    const cam = applyCameraStep({ x: 0, y: 0 }, { vx: 9999, vy: 0 }, 1, 720);
    expect(Math.hypot(cam.x, cam.y)).toBeLessThanOrEqual(720 + 1e-6);
  });

  it('preserves direction during clamp (clamped point sits on the same ray as the un-clamped one)', () => {
    const cam = applyCameraStep({ x: 0, y: 0 }, { vx: 9999, vy: 9999 }, 1, 100);
    // Diagonal — clamped point should still be at 45°.
    expect(cam.x).toBeCloseTo(cam.y, 4);
    expect(Math.hypot(cam.x, cam.y)).toBeCloseTo(100, 4);
  });
});

describe('pointerIsOnRing (pure helper)', () => {
  it('true when the pointer sits inside the ring band', () => {
    expect(pointerIsOnRing({ x: 370, y: 0 }, 360, 380)).toBe(true);
  });
  it('false when the pointer is inside the inner radius (pond center)', () => {
    expect(pointerIsOnRing({ x: 10, y: 0 }, 360, 380)).toBe(false);
  });
  it('false when the pointer is past the outer radius', () => {
    expect(pointerIsOnRing({ x: 500, y: 0 }, 360, 380)).toBe(false);
  });
});

describe('EmployeePond camera wiring source-lock (P4b)', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('imports the camera helpers', () => {
    expect(SRC).toMatch(/import \{[\s\S]*?applyCameraStep[\s\S]*?panVectorFromPointer[\s\S]*?\} from '@\/lib\/employee-pond\/camera'/);
  });

  it('declares the camera + pan refs', () => {
    expect(SRC).toMatch(/cameraRef = useRef<CameraPosition>\(\{ x: 0, y: 0 \}\)/);
    expect(SRC).toMatch(/panRef = useRef<PanVector>\(\{ vx: 0, vy: 0 \}\)/);
    expect(SRC).toMatch(/cameraLayerRef = useRef<HTMLDivElement \| null>\(null\)/);
  });

  it('renders the .employee-pond__camera-layer that holds the orbs + particles', () => {
    expect(SRC).toMatch(/className="employee-pond__camera-layer"/);
    expect(SRC).toMatch(/ref=\{cameraLayerRef\}/);
  });

  it('the pan rAF loop writes the camera transform via writeCameraToLayer', () => {
    expect(SRC).toMatch(/writeCameraToLayer/);
    expect(SRC).toMatch(/el\.style\.transform = `translate3d\(\$\{\(-x\)\.toFixed\(2\)\}px, \$\{\(-y\)\.toFixed\(2\)\}px, 0\)`/);
  });

  it('handleReset recenters the camera in addition to bumping the respawn seed', () => {
    expect(SRC).toMatch(/cameraRef\.current = \{ x: 0, y: 0 \};\s*\n\s*writeCameraToLayer\(\)/);
  });

  it('renders the ScrollRing component below the pond surface', () => {
    expect(SRC).toMatch(/<ScrollRing[\s\S]*?panSpeed=\{PAN_SPEED_PX_S\}/);
  });
});

describe('EmployeePond CSS — ring + tooltip + camera layer (P4b)', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('declares the camera layer with will-change: transform', () => {
    expect(CSS).toMatch(/\.employee-pond__camera-layer\s*\{[\s\S]*?will-change:\s*transform/);
  });

  it('positions the scroll ring extending 14px outside the pond wrap', () => {
    expect(CSS).toMatch(/\.employee-pond__scroll-ring\s*\{[\s\S]*?inset:\s*-14px/);
  });

  it('hit-tests on the stroke only so clicks INSIDE the ring fall through to orbs', () => {
    expect(CSS).toMatch(/\.employee-pond__scroll-ring-stroke\s*\{[\s\S]*?pointer-events:\s*stroke/);
  });

  it('hover bumps the stroke width — the user-facing "ring enlarges slightly"', () => {
    // Slice W1 bumped the stroke widths to make the ring easier
    // to click (user feedback). Hover stroke went 2.4 → 4.6.
    expect(CSS).toMatch(/\.employee-pond__scroll-ring--hover \.employee-pond__scroll-ring-stroke\s*\{[\s\S]*?stroke-width:\s*4\.6/);
  });

  it('renders a tooltip element keyed off the hover state', () => {
    expect(CSS).toMatch(/\.employee-pond__scroll-ring-tooltip\s*\{[\s\S]*?white-space:\s*nowrap/);
  });
});
