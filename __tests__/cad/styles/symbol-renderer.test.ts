// __tests__/cad/styles/symbol-renderer.test.ts — Unit tests for the symbol renderer
import { describe, it, expect, vi } from 'vitest';
import { parseSVGPathData, renderSymbol, resolveSymbolColor, parseColor } from '@/lib/cad/styles/symbol-renderer';
import type { SymbolDefinition } from '@/lib/cad/styles/types';

// ── parseColor ───────────────────────────────────────────────────────────────

describe('parseColor', () => {
  it('parses standard hex colors', () => {
    expect(parseColor('#FF0000')).toBe(0xFF0000);
    expect(parseColor('#000000')).toBe(0x000000);
    expect(parseColor('#FFFFFF')).toBe(0xFFFFFF);
    expect(parseColor('#27AE60')).toBe(0x27AE60);
  });

  it('parses hex colors without leading #', () => {
    expect(parseColor('FF0000')).toBe(0xFF0000);
    expect(parseColor('000000')).toBe(0x000000);
  });

  it('returns 0x000000 for null/undefined/empty inputs', () => {
    expect(parseColor('')).toBe(0x000000);
    expect(parseColor(null as unknown as string)).toBe(0x000000);
    expect(parseColor(undefined as unknown as string)).toBe(0x000000);
  });

  it('returns 0x000000 for invalid hex strings', () => {
    expect(parseColor('ZZZZZZ')).toBe(0x000000);
  });
});

// ── parseSVGPathData ──────────────────────────────────────────────────────────

describe('parseSVGPathData', () => {
  it('returns empty array for empty string', () => {
    expect(parseSVGPathData('')).toHaveLength(0);
  });

  it('parses a simple M L Z path', () => {
    const cmds = parseSVGPathData('M 0 0 L 10 10 Z');
    expect(cmds).toHaveLength(3);
    expect(cmds[0]).toMatchObject({ type: 'M', x: 0, y: 0 });
    expect(cmds[1]).toMatchObject({ type: 'L', x: 10, y: 10 });
    expect(cmds[2]).toMatchObject({ type: 'Z' });
  });

  it('parses a cross path (M L M L)', () => {
    // Cross: M -3 0 L 3 0 M 0 -3 L 0 3
    const cmds = parseSVGPathData('M -3 0 L 3 0 M 0 -3 L 0 3');
    // Results: M(-3,0), L(3,0), M(0,-3), L(0,3)
    expect(cmds.length).toBeGreaterThanOrEqual(4);
    expect(cmds.find(c => c.type === 'M' && c.x === -3)).toBeTruthy();
    expect(cmds.find(c => c.type === 'L' && c.x === 3)).toBeTruthy();
  });

  it('parses a C (cubic bezier) command', () => {
    const cmds = parseSVGPathData('M 0 0 C 1 2 3 4 5 6');
    const cCmd = cmds.find(c => c.type === 'C');
    expect(cCmd).toBeTruthy();
    expect(cCmd?.x1).toBe(1);
    expect(cCmd?.y1).toBe(2);
    expect(cCmd?.x2).toBe(3);
    expect(cCmd?.y2).toBe(4);
    expect(cCmd?.x).toBe(5);
    expect(cCmd?.y).toBe(6);
  });

  it('parses H (horizontal line) command', () => {
    const cmds = parseSVGPathData('M 0 5 H 10');
    const hLine = cmds.find(c => c.type === 'L');
    expect(hLine).toBeTruthy();
    expect(hLine?.x).toBe(10);
    expect(hLine?.y).toBe(5); // y stays same as last M position
  });

  it('parses V (vertical line) command', () => {
    const cmds = parseSVGPathData('M 3 0 V 10');
    const vLine = cmds.find(c => c.type === 'L');
    expect(vLine).toBeTruthy();
    expect(vLine?.x).toBe(3); // x stays same
    expect(vLine?.y).toBe(10);
  });

  it('silently ignores unknown commands (A, S, Q, T)', () => {
    // Should not throw
    expect(() => parseSVGPathData('M 0 0 A 5 5 0 1 0 10 10')).not.toThrow();
    const cmds = parseSVGPathData('M 0 0 A 5 5 0 1 0 10 10');
    // A command ignored, M should be parsed
    expect(cmds.find(c => c.type === 'M')).toBeTruthy();
  });

  it('handles multiple coordinate pairs after M (implicit L)', () => {
    const cmds = parseSVGPathData('M 0 0 10 20 30 40');
    expect(cmds[0]).toMatchObject({ type: 'M', x: 0, y: 0 });
    // Subsequent pairs become L
    expect(cmds[1]).toMatchObject({ type: 'L', x: 10, y: 20 });
    expect(cmds[2]).toMatchObject({ type: 'L', x: 30, y: 40 });
  });

  it('handles paths with commas and varying whitespace', () => {
    const cmds = parseSVGPathData('M0,0L10,10');
    expect(cmds).toHaveLength(2);
    expect(cmds[0]).toMatchObject({ type: 'M', x: 0, y: 0 });
    expect(cmds[1]).toMatchObject({ type: 'L', x: 10, y: 10 });
  });

  it('handles negative coordinates', () => {
    const cmds = parseSVGPathData('M -5 -5 L 5 5');
    expect(cmds[0]).toMatchObject({ type: 'M', x: -5, y: -5 });
    expect(cmds[1]).toMatchObject({ type: 'L', x: 5, y: 5 });
  });
});

// ── renderSymbol ──────────────────────────────────────────────────────────────

function makeMockGraphics() {
  return {
    lineStyle: vi.fn(),
    beginFill: vi.fn(),
    endFill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    drawCircle: vi.fn(),
    bezierCurveTo: vi.fn(),
    calls: [] as string[],
  };
}

function makeSymbol(pathOverrides: Partial<SymbolDefinition['paths'][0]>[] = []): SymbolDefinition {
  return {
    id: 'TEST_SYM', name: 'Test', category: 'GENERIC',
    paths: pathOverrides.length ? pathOverrides.map(o => ({
      type: 'CIRCLE' as const, cx: 0, cy: 0, r: 3,
      fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5,
      ...o,
    })) : [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2, minSize: 1, maxSize: 5,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: false, isEditable: true, assignedCodes: [],
  };
}

describe('renderSymbol', () => {
  it('does nothing when g is null', () => {
    // Should not throw
    expect(() => renderSymbol(null, makeSymbol(), 10, 10, 5, 0, 0xFF0000, 1)).not.toThrow();
  });

  it('does nothing when symbol is null', () => {
    const g = makeMockGraphics();
    expect(() => renderSymbol(g, null as unknown as SymbolDefinition, 10, 10, 5, 0, 0xFF0000, 1)).not.toThrow();
    expect(g.drawCircle).not.toHaveBeenCalled();
  });

  it('does nothing when symbol has no paths', () => {
    const g = makeMockGraphics();
    const sym = makeSymbol([]);
    sym.paths = [];
    renderSymbol(g, sym, 10, 10, 5, 0, 0xFF0000, 1);
    expect(g.drawCircle).not.toHaveBeenCalled();
  });

  it('does nothing when sizePx <= 0', () => {
    const g = makeMockGraphics();
    renderSymbol(g, makeSymbol(), 10, 10, 0, 0, 0xFF0000, 1);
    expect(g.drawCircle).not.toHaveBeenCalled();
  });

  it('does nothing when sizePx is negative', () => {
    const g = makeMockGraphics();
    renderSymbol(g, makeSymbol(), 10, 10, -5, 0, 0xFF0000, 1);
    expect(g.drawCircle).not.toHaveBeenCalled();
  });

  it('does nothing when screenX/screenY are NaN', () => {
    const g = makeMockGraphics();
    renderSymbol(g, makeSymbol(), NaN, 10, 5, 0, 0xFF0000, 1);
    expect(g.drawCircle).not.toHaveBeenCalled();
  });

  it('does nothing when screenX/screenY are Infinity', () => {
    const g = makeMockGraphics();
    renderSymbol(g, makeSymbol(), Infinity, 10, 5, 0, 0xFF0000, 1);
    expect(g.drawCircle).not.toHaveBeenCalled();
  });

  it('calls drawCircle for a CIRCLE path', () => {
    const g = makeMockGraphics();
    renderSymbol(g, makeSymbol(), 50, 50, 10, 0, 0xFF0000, 1);
    expect(g.drawCircle).toHaveBeenCalledTimes(1);
  });

  it('calls moveTo/lineTo for a PATH', () => {
    const g = makeMockGraphics();
    const sym = makeSymbol([{
      type: 'PATH', d: 'M 0 0 L 5 5 L -5 5 Z',
      fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5,
    }]);
    renderSymbol(g, sym, 50, 50, 10, 0, 0xFF0000, 1);
    expect(g.moveTo).toHaveBeenCalled();
    expect(g.lineTo).toHaveBeenCalled();
  });

  it('calls drawCircle for a CIRCLE with NONE stroke (no lineStyle)', () => {
    const g = makeMockGraphics();
    const sym = makeSymbol([{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 }]);
    renderSymbol(g, sym, 50, 50, 10, 0, 0xFF0000, 1);
    expect(g.lineStyle).toHaveBeenCalledWith(0);
    expect(g.drawCircle).toHaveBeenCalled();
  });

  it('calls beginFill/endFill for non-NONE fill', () => {
    const g = makeMockGraphics();
    const sym = makeSymbol([{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 }]);
    renderSymbol(g, sym, 50, 50, 10, 0, 0xFF0000, 1);
    expect(g.beginFill).toHaveBeenCalled();
    expect(g.endFill).toHaveBeenCalled();
  });

  it('does NOT call beginFill for NONE fill', () => {
    const g = makeMockGraphics();
    const sym = makeSymbol([{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 }]);
    renderSymbol(g, sym, 50, 50, 10, 0, 0xFF0000, 1);
    expect(g.beginFill).not.toHaveBeenCalled();
  });

  it('skips TEXT path type without error', () => {
    const g = makeMockGraphics();
    const sym = makeSymbol([{ type: 'TEXT', text: 'BM', tx: 0, ty: 0, fontSize: 3, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 }]);
    expect(() => renderSymbol(g, sym, 50, 50, 10, 0, 0xFF0000, 1)).not.toThrow();
    expect(g.drawCircle).not.toHaveBeenCalled();
    expect(g.moveTo).not.toHaveBeenCalled();
  });

  it('does not call drawCircle for zero-radius circle', () => {
    const g = makeMockGraphics();
    const sym = makeSymbol([{ type: 'CIRCLE', cx: 0, cy: 0, r: 0, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }]);
    renderSymbol(g, sym, 50, 50, 10, 0, 0xFF0000, 1);
    expect(g.drawCircle).not.toHaveBeenCalled();
  });

  it('clamps opacity to 0-1 range', () => {
    const g = makeMockGraphics();
    renderSymbol(g, makeSymbol(), 50, 50, 10, 0, 0xFF0000, 2);
    // beginFill called with clamped opacity of 1
    expect(g.beginFill).toHaveBeenCalledWith(expect.any(Number), 1);
  });

  it('uses 0 for NaN rotation', () => {
    const g = makeMockGraphics();
    expect(() => renderSymbol(g, makeSymbol(), 50, 50, 10, NaN, 0xFF0000, 1)).not.toThrow();
    expect(g.drawCircle).toHaveBeenCalled();
  });
});

// ── resolveSymbolColor ────────────────────────────────────────────────────────

describe('resolveSymbolColor', () => {
  function makeSymDef(colorMode: SymbolDefinition['colorMode'], fixedColor: string | null): SymbolDefinition {
    return {
      id: 'S1', name: 'S', category: 'GENERIC', paths: [],
      insertionPoint: { x: 0, y: 0 }, defaultSize: 2, minSize: 1, maxSize: 5,
      colorMode, fixedColor, defaultRotation: 0, rotatable: false,
      isBuiltIn: true, isEditable: false, assignedCodes: [],
    };
  }

  it('FIXED mode returns fixedColor', () => {
    expect(resolveSymbolColor(makeSymDef('FIXED', '#FF0000'), '#00FF00', '#0000FF')).toBe('#FF0000');
  });

  it('FIXED mode falls back to #000000 when fixedColor is null', () => {
    expect(resolveSymbolColor(makeSymDef('FIXED', null), '#00FF00', '#0000FF')).toBe('#000000');
  });

  it('CODE mode returns codeColor', () => {
    expect(resolveSymbolColor(makeSymDef('CODE', null), '#00FF00', '#0000FF')).toBe('#00FF00');
  });

  it('LAYER mode returns layerColor', () => {
    expect(resolveSymbolColor(makeSymDef('LAYER', null), '#00FF00', '#0000FF')).toBe('#0000FF');
  });
});
