// __tests__/employee-pond/e6-drag.test.ts
//
// employee-pond Slice E6 — drag interaction. Locks the pure helpers
// (pointer↔pond coords, release velocity, threshold check) and the
// page wiring (refs, pointer handlers, click suppression, drag
// state lifecycle).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DRAG_THRESHOLD_PX,
  MOTION_BUFFER_LIMIT,
  computeReleaseVelocity,
  exceedsDragThreshold,
  pointerToPondCoords,
  type MotionSample,
} from '@/lib/employee-pond/drag';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('pointerToPondCoords', () => {
  const rect = { left: 100, top: 50, width: 400, height: 400 };

  it('translates pointer to pond-center frame', () => {
    // Pond center is at (300, 250) in client coords.
    expect(pointerToPondCoords(300, 250, rect)).toEqual({ x: 0, y: 0 });
    expect(pointerToPondCoords(400, 250, rect)).toEqual({ x: 100, y: 0 });
    expect(pointerToPondCoords(300, 350, rect)).toEqual({ x: 0, y: 100 });
  });

  it('handles negative offsets when the pointer is above/left of center', () => {
    expect(pointerToPondCoords(100, 50, rect)).toEqual({ x: -200, y: -200 });
  });
});

describe('exceedsDragThreshold + DRAG_THRESHOLD_PX', () => {
  it('false for motion strictly inside the threshold disc', () => {
    expect(exceedsDragThreshold(0, 0)).toBe(false);
    expect(exceedsDragThreshold(3, 3)).toBe(false); // dist² = 18 < 25
  });

  it('true once the motion crosses the disc boundary', () => {
    expect(exceedsDragThreshold(6, 0)).toBe(true);
    expect(exceedsDragThreshold(0, -6)).toBe(true);
    expect(exceedsDragThreshold(4, 4)).toBe(true); // dist² = 32 > 25
  });

  it('exports a 5-px threshold', () => {
    expect(DRAG_THRESHOLD_PX).toBe(5);
  });
});

describe('computeReleaseVelocity', () => {
  it('zero when the buffer has fewer than two samples', () => {
    expect(computeReleaseVelocity([])).toEqual({ vx: 0, vy: 0 });
    expect(computeReleaseVelocity([{ x: 1, y: 1, t: 0 }])).toEqual({ vx: 0, vy: 0 });
  });

  it('zero when first and last samples share a timestamp', () => {
    const samples: MotionSample[] = [
      { x: 0, y: 0, t: 100 },
      { x: 50, y: 50, t: 100 },
    ];
    expect(computeReleaseVelocity(samples)).toEqual({ vx: 0, vy: 0 });
  });

  it('produces a positive velocity for forward motion', () => {
    const samples: MotionSample[] = [
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 0, t: 100 }, // 100 px in 0.1 s → 1000 px/s
    ];
    const v = computeReleaseVelocity(samples);
    expect(v.vx).toBeCloseTo(1000, 1);
    expect(v.vy).toBe(0);
  });

  it('handles vertical motion + multi-sample paths', () => {
    const samples: MotionSample[] = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 25, t: 20 },
      { x: 25, y: 80, t: 60 },
      { x: 50, y: 150, t: 100 },
    ];
    const v = computeReleaseVelocity(samples);
    expect(v.vx).toBeCloseTo(500, 1);
    expect(v.vy).toBeCloseTo(1500, 1);
  });

  it('MOTION_BUFFER_LIMIT keeps the buffer bounded', () => {
    expect(MOTION_BUFFER_LIMIT).toBe(8);
  });
});

describe('EmployeePond.tsx — E6 drag wiring', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('imports the drag helpers + types', () => {
    expect(SRC).toMatch(/from '@\/lib\/employee-pond\/drag'/);
    expect(SRC).toMatch(/pointerToPondCoords/);
    expect(SRC).toMatch(/computeReleaseVelocity/);
    expect(SRC).toMatch(/exceedsDragThreshold/);
  });

  it('holds the drag refs (pondElRef, draggingIdRef, dragStartRef, motionSamples, suppressNextClick)', () => {
    expect(SRC).toMatch(/const pondElRef = useRef<HTMLDivElement \| null>/);
    expect(SRC).toMatch(/const draggingIdRef = useRef<string \| null>/);
    expect(SRC).toMatch(/const dragStartRef = useRef</);
    expect(SRC).toMatch(/const motionSamplesRef = useRef<MotionSample\[\]>/);
    expect(SRC).toMatch(/const suppressNextClickRef = useRef<boolean>/);
  });

  it('pointerdown captures the pointer + records start position from physics.orbs', () => {
    expect(SRC).toMatch(/physics\.orbs\.find\(\(o\) => o\.id === employee\.id\)/);
    expect(SRC).toMatch(/setPointerCapture\(e\.pointerId\)/);
  });

  it("pointermove crosses the threshold once, marks physics.dragging, and tracks the pond-relative position", () => {
    expect(SRC).toMatch(/if \(!exceedsDragThreshold\(dx, dy\)\) return;/);
    expect(SRC).toMatch(/physics\.setDragging\(employee\.id, true\)/);
    expect(SRC).toMatch(/pointerToPondCoords\(e\.clientX, e\.clientY, rect\)/);
    expect(SRC).toMatch(/physics\.setOrb\(employee\.id, \{ x: pond\.x, y: pond\.y \}\)/);
  });

  it("the motion buffer trims to MOTION_BUFFER_LIMIT entries", () => {
    expect(SRC).toMatch(/samples\.length > MOTION_BUFFER_LIMIT/);
  });

  it("pointerup applies the release velocity and clears the dragging flag (only when truly dragged)", () => {
    expect(SRC).toMatch(/computeReleaseVelocity\(motionSamplesRef\.current\)/);
    expect(SRC).toMatch(/physics\.setOrb\(employee\.id, \{ vx: release\.vx, vy: release\.vy \}\)/);
    expect(SRC).toMatch(/physics\.setDragging\(employee\.id, false\)/);
  });

  it("pointercancel ends the drag gracefully (no release velocity)", () => {
    expect(SRC).toMatch(/handleOrbPointerCancel/);
  });

  it("click suppresses when a drag just happened", () => {
    expect(SRC).toMatch(/if \(suppressNextClickRef\.current\) \{[\s\S]*?suppressNextClickRef\.current = false;[\s\S]*?return;/);
  });

  it("every orb wires the four pointer handlers", () => {
    expect(SRC).toMatch(/onPointerDown=\{\(e\) => handleOrbPointerDown\(employee, e\)\}/);
    expect(SRC).toMatch(/onPointerMove=\{\(e\) => handleOrbPointerMove\(employee, e\)\}/);
    expect(SRC).toMatch(/onPointerUp=\{\(e\) => handleOrbPointerUp\(employee, e\)\}/);
    expect(SRC).toMatch(/onPointerCancel=\{\(e\) => handleOrbPointerCancel\(employee, e\)\}/);
  });
});

describe('EmployeePond.css — E6 drag cursors', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('orb shows the grab cursor by default and grabbing on :active', () => {
    expect(CSS).toMatch(/\.employee-pond__orb \{[\s\S]*?cursor: grab/);
    expect(CSS).toMatch(/\.employee-pond__orb:active \{[\s\S]*?cursor: grabbing/);
  });

  it("sets touch-action: none so a drag on a touch device doesn't trigger scroll", () => {
    expect(CSS).toMatch(/touch-action: none/);
  });
});
