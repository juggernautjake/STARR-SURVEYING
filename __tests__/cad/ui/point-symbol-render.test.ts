// __tests__/cad/ui/point-symbol-render.test.ts
//
// cad-trv-fidelity Slice 7 — POINT features render their assigned
// symbol (monument / utility / vegetation glyph) from the symbol
// library instead of the bare crosshair. Locks the CanvasViewport
// wiring + verifies a real library symbol actually emits draw calls.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { findSymbol } from '@/lib/cad/styles/symbol-library';
import { renderSymbol } from '@/lib/cad/styles/symbol-renderer';

describe('CanvasViewport — POINT symbol wiring (source-locked)', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
    'utf8',
  );
  it('imports the symbol library + renderer', () => {
    expect(SRC).toMatch(/import \{ findSymbol \} from '@\/lib\/cad\/styles\/symbol-library';/);
    expect(SRC).toMatch(/import \{ renderSymbol \} from '@\/lib\/cad\/styles\/symbol-renderer';/);
  });
  it('the POINT case renders the symbol when symbolId is set, else the crosshair', () => {
    const pointCase = SRC.slice(SRC.indexOf("case 'POINT': {"));
    const body = pointCase.slice(0, pointCase.indexOf("case 'LINE'"));
    expect(body).toMatch(/feature\.style\.symbolId/);
    expect(body).toMatch(/findSymbol\(symbolId/);
    expect(body).toMatch(/renderSymbol\(g, symbol/);
    // crosshair fallback still present.
    expect(body).toMatch(/g\.lineTo\(sx \+ size, sy\)/);
  });
});

/** Minimal Graphics stub recording the primitive calls renderSymbol makes. */
function fakeGraphics() {
  const calls: string[] = [];
  return {
    calls,
    lineStyle: () => calls.push('lineStyle'),
    beginFill: () => calls.push('beginFill'),
    endFill: () => calls.push('endFill'),
    drawCircle: () => calls.push('drawCircle'),
    drawRect: () => calls.push('drawRect'),
    drawPolygon: () => calls.push('drawPolygon'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    closePath: () => calls.push('closePath'),
  };
}

describe('renderSymbol — a library monument glyph draws', () => {
  it('emits primitive draw calls for an iron-rod monument symbol', () => {
    const sym = findSymbol('MON_IR_038_FOUND');
    expect(sym).toBeTruthy();
    const g = fakeGraphics();
    renderSymbol(g, sym!, 100, 100, 14, 0, 0x000000, 1);
    // The monument is a filled shape → at least one draw primitive ran.
    const drew = g.calls.some((c) => c.startsWith('draw'));
    expect(drew).toBe(true);
  });

  it('is a no-op for an unknown symbol id (safe fallback to crosshair)', () => {
    expect(findSymbol('NOPE_NOT_A_SYMBOL')).toBeUndefined();
  });
});
