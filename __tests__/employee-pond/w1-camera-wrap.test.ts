// __tests__/employee-pond/w1-camera-wrap.test.ts
//
// Slice W1 (pond-camera-wrap-2026-06-17) — Pac-Man-style camera
// wrap + thicker scroll-ring stroke for easier clicking.
//
// User asks rolled into this slice:
//   1. "It would be cool if after scrolling for a while with no
//      orbs/pucks in view, the view kind of reset so that we go
//      past the orbs/pucks again."
//   2. "Make the scroll ring outline … a bit thicker and easier
//      to click."
//
// Behavioral coverage for `maybeWrapCamera` + source-locks for
// the React wiring and the CSS stroke widths.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { maybeWrapCamera } from '../../lib/employee-pond/camera';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const ORB_R = 32;
const VIEWPORT_R = 360;
const orbAt = (x: number, y: number) => ({ x, y, radius: ORB_R });

describe('maybeWrapCamera (pure helper)', () => {
  it('returns null when the user is not actively panning', () => {
    const out = maybeWrapCamera(
      { x: 9999, y: 0 },
      { vx: 0, vy: 0 },
      [orbAt(0, 0)],
      VIEWPORT_R,
    );
    expect(out).toBeNull();
  });

  it('returns null when any orb is inside the visible viewport', () => {
    const out = maybeWrapCamera(
      { x: 200, y: 0 }, // close to origin — orb at (0,0) is in view
      { vx: 200, vy: 0 },
      [orbAt(0, 0)],
      VIEWPORT_R,
    );
    expect(out).toBeNull();
  });

  it('wraps to the OPPOSITE side of the orb cluster when the viewport is empty', () => {
    const out = maybeWrapCamera(
      { x: 1000, y: 0 }, // way past every orb to the right
      { vx: 260, vy: 0 }, // user is still scrolling right
      [orbAt(0, 0)],
      VIEWPORT_R,
    );
    expect(out).not.toBeNull();
    // Wrap target: -panDir * (VIEWPORT_R + ORB_R + 16) = -(360+32+16) = -408
    expect(out!.x).toBeCloseTo(-(VIEWPORT_R + ORB_R + 16));
    expect(out!.y).toBeCloseTo(0);
  });

  it('is omni-directional — wrap direction follows the pan vector', () => {
    // Pan straight up: wrap target should land BELOW the cluster.
    const up = maybeWrapCamera(
      { x: 0, y: -1000 },
      { vx: 0, vy: -260 },
      [orbAt(0, 0)],
      VIEWPORT_R,
    );
    expect(up!.x).toBeCloseTo(0);
    expect(up!.y).toBeCloseTo(VIEWPORT_R + ORB_R + 16);

    // Pan diagonally NE: wrap target should land SW at the same
    // magnitude as a single-axis wrap (the magnitude is fixed).
    const diag = maybeWrapCamera(
      { x: 1000, y: -1000 },
      { vx: 200, vy: -200 },
      [orbAt(0, 0)],
      VIEWPORT_R,
    );
    const expectedMag = VIEWPORT_R + ORB_R + 16;
    expect(Math.hypot(diag!.x, diag!.y)).toBeCloseTo(expectedMag);
    // Diagonal — components are equal-and-opposite signs of the pan.
    expect(diag!.x).toBeCloseTo(-expectedMag / Math.SQRT2);
    expect(diag!.y).toBeCloseTo(+expectedMag / Math.SQRT2);
  });

  it('returns null when the orb list is empty (degenerate safety)', () => {
    const out = maybeWrapCamera(
      { x: 1000, y: 0 },
      { vx: 260, vy: 0 },
      [],
      VIEWPORT_R,
    );
    expect(out).toBeNull();
  });

  it('after wrap, the camera-to-origin distance equals viewportRadius + orbRadius + buffer (orbs are just off-screen)', () => {
    const wrapped = maybeWrapCamera(
      { x: 3000, y: 0 },
      { vx: 100, vy: 0 },
      [orbAt(0, 0)],
      VIEWPORT_R,
      24, // custom buffer
    );
    expect(Math.hypot(wrapped!.x, wrapped!.y)).toBeCloseTo(VIEWPORT_R + ORB_R + 24);
  });
});

describe('EmployeePond — wrap wiring source-lock (W1)', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('imports maybeWrapCamera alongside the existing camera helpers', () => {
    expect(SRC).toMatch(/import \{[\s\S]*?maybeWrapCamera[\s\S]*?\} from '@\/lib\/employee-pond\/camera'/);
  });

  it('bumps PAN_MAX_OFFSET_PX to 4000 (wrap becomes the practical limit)', () => {
    expect(SRC).toMatch(/const PAN_MAX_OFFSET_PX = 4000/);
  });

  it('keeps orbsForWrapRef pointed at the live physics orb list each render', () => {
    expect(SRC).toMatch(/orbsForWrapRef\.current = physics\.orbs/);
  });

  it('the pan rAF calls maybeWrapCamera after applyCameraStep and adopts the new camera if non-null', () => {
    expect(SRC).toMatch(/const wrapped = maybeWrapCamera\(\s*cameraRef\.current,\s*pan,\s*orbsForWrapRef\.current,\s*POND_RADIUS_PX,?\s*\);/);
    expect(SRC).toMatch(/if \(wrapped\) cameraRef\.current = wrapped/);
  });
});

describe('EmployeePond CSS — thicker scroll ring (W1, user-feedback)', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('resting stroke is bumped to 3.0 viewBox units (~22px rendered)', () => {
    expect(CSS).toMatch(/\.employee-pond__scroll-ring-stroke\s*\{[\s\S]*?stroke-width:\s*3\.0/);
  });

  it('hover stroke is bumped to 4.6 viewBox units (~35px rendered)', () => {
    expect(CSS).toMatch(/\.employee-pond__scroll-ring--hover \.employee-pond__scroll-ring-stroke\s*\{[\s\S]*?stroke-width:\s*4\.6/);
  });
});
