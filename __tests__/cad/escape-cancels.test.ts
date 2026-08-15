// C14 — Escape cancels, from any state.
//
// ── THE DEFECT C13 PREDICTED ────────────────────────────────────────────────────────────────────
//
// `docs/cad-click-order-contract.md` states one universal rule above all others: **Escape cancels
// the current operation and is never a no-op.** C13 measured that 56 of 58 tool descriptions never
// mention Escape, and argued that a silence that uniform was one missing convention rather than 56
// oversights — probably missing from the code, not merely from the docs.
//
// It was. Every Escape handler in CanvasViewport was a special case guarded on one ref: a snap
// pick, paper-move mode, an interactive rotate/scale, a grab-node drag, an offset source. There was
// no case for the commonest state in the editor — a half-drawn feature.
//
// Pick the polyline tool, click five vertices, realise you started in the wrong place, press
// Escape: nothing happened. The five points stayed pending and the rubber band kept following the
// cursor. `clearDrawingPoints` is called from a dozen places — on commit, on geometry too small to
// be real — and from no cancel.
//
// ── WHY THIS IS A SOURCE SCAN ───────────────────────────────────────────────────────────────────
//
// The handler lives inside a 14,000-line component bound to a live PIXI canvas and a window
// keydown listener; standing that up in jsdom to press one key would test the harness. What can be
// checked cheaply and usefully is that the general case EXISTS, runs LAST, and does the two things
// in the right order. The behaviour itself is C0o-style browser work.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'app/admin/cad/components/CanvasViewport.tsx'), 'utf8');
// Comments stripped — this change's own comment quotes the behaviour it describes, the trap that
// cost C3's guard three revisions.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the general Escape exists', () => {
  it('abandons a half-drawn feature', () => {
    expect(code).toMatch(/drawingPoints\.length > 0[\s\S]{0,120}clearDrawingPoints\(\)/);
  });

  it('returns to SELECT when there is nothing half-drawn', () => {
    expect(code).toMatch(/setTool\('SELECT'\)/);
  });

  it('clears the selection when already idle in SELECT', () => {
    // The only remaining thing Escape could sensibly mean, and the AutoCAD behaviour.
    expect(code).toMatch(/deselectAll\(\)/);
  });
});

describe('the order is the part that matters', () => {
  it('cancels the geometry BEFORE giving up the tool', () => {
    // Two steps, not one. Dropping straight to SELECT would make a single keypress do two things
    // and take away the tool the surveyor is still using.
    const block = code.slice(code.indexOf('drawingPoints.length > 0'));
    const clearAt = block.indexOf('clearDrawingPoints()');
    const selectAt = block.indexOf("setTool('SELECT')");
    expect(clearAt).toBeGreaterThan(-1);
    expect(selectAt).toBeGreaterThan(-1);
    expect(clearAt, 'clearing the pending points must come first').toBeLessThan(selectAt);
  });

  it('runs AFTER the specific Escape cases, so it never steals their key', () => {
    // Each specific case guards on its own ref and stops propagation. A general handler placed
    // first would swallow the key before the offset re-pick or the rotate cancel ever saw it.
    const general = code.indexOf('drawingPoints.length > 0');
    for (const specific of ['snapPickRef.current', 'paperMoveModeRef.current', 'interactiveOpRef.current', 'offsetSourceId']) {
      const at = code.indexOf(specific);
      expect(at, `${specific} should still be handled`).toBeGreaterThan(-1);
      expect(at, `${specific} must be handled before the general case`).toBeLessThan(general);
    }
  });

  it('leaves PAN alone — it is not an operation to cancel out of', () => {
    expect(code).toMatch(/activeTool !== 'SELECT' && [\s\S]{0,40}activeTool !== 'PAN'/);
  });
});
