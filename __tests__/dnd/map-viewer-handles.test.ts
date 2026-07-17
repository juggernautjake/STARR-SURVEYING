// __tests__/dnd/map-viewer-handles.test.ts — Slice 35a regression guard: the scale/rotate handles on a
// selected image (the reported "I can no longer see the nodes" bug, verified fixed 2026-07-16). renderHandles
// must draw the four corner scale pads + a rotate handle for EVERY selected instance except free text, and
// wire their drag handlers. Source-anchored: map-studio.html is a vanilla browser page (no ES exports).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');
const fn = SRC.slice(SRC.indexOf('function renderHandles(){'), SRC.indexOf('const spriteLive'));

describe('map viewer: image scale/rotate handles (Slice 35a)', () => {
  it('renderHandles exists and only excludes free text (so images DO get handles)', () => {
    expect(fn).toContain('function renderHandles()');
    // The ONLY kind excluded is text; anything else (incl. images) proceeds to draw handles.
    expect(fn).toMatch(/i\.kind===["']text["']\)\s*return/);
    expect(fn).not.toMatch(/i\.kind===["']image["']\)\s*return/); // images must NOT be excluded
  });

  it('draws the four corner scale pads + a rotate handle + stem', () => {
    for (const cls of ['ihandle tl', 'ihandle tr', 'ihandle bl', 'ihandle br', 'ihandle rot', 'ihandle rstem']) {
      expect(fn, `handle "${cls}" not drawn`).toContain(cls);
    }
  });

  it('wires the scale + rotate drag handlers to the handles', () => {
    expect(fn).toContain('onInstScaleDown');
    expect(fn).toContain('onInstRotateDown');
    expect(fn).toMatch(/addEventListener\(["']mousedown["']/);
  });

  it('yields the screen to the 3D viewer (no 2D handles drawn over the WebGL view)', () => {
    expect(fn).toMatch(/Map3D\.isShown\(\)\)\s*return/);
  });
});

describe('map studio: 2D/3D body-size parity (Slice 29)', () => {
  it('keeps the 2D and 3D preview bodies at the SAME ~78% of the viewer (the constants must not drift apart)', () => {
    // 2D: the preview body is sized to 78% (a WebGL canvas can't spill its glow, so 2D leaves the same room).
    expect(SRC).toMatch(/\.pv2d\{[^}]*width:78%;height:78%/);
    // 3D: the halo may claim down to 1/1.28 (~78.1%) before the subject stops shrinking — the matching side.
    expect(SRC).toContain('1/1.28');
    // The two are documented as cross-referencing; if one moves without the other, the previews disagree.
    expect(SRC).toMatch(/1\/1\.28 ≈ 78%|~78% of the viewer/);
  });
});
