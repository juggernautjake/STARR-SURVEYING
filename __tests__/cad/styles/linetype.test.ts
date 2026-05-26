// __tests__/cad/styles/linetype.test.ts
import { describe, it, expect } from 'vitest';
import { BUILTIN_LINE_TYPES } from '@/lib/cad/styles/linetype-library';
import { getSymbolById } from '@/lib/cad/styles/symbol-library';
import { renderLineWithType } from '@/lib/cad/styles/linetype-renderer';

// Minimal recording mock of a Pixi Graphics object.
function mockGraphics() {
  const calls: Record<string, number> = {};
  const g = new Proxy(
    {},
    {
      get: (_t, prop: string) => (..._a: unknown[]) => {
        calls[prop] = (calls[prop] ?? 0) + 1;
        return g;
      },
    }
  );
  return { g, calls };
}

const lt = (id: string) => BUILTIN_LINE_TYPES.find((l) => l.id === id)!;
const horiz = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
];

describe('line type library integrity', () => {
  it('every inline-symbol reference resolves to a real symbol', () => {
    for (const l of BUILTIN_LINE_TYPES) {
      for (const s of l.inlineSymbols) {
        expect(getSymbolById(s.symbolId), `${l.id} → ${s.symbolId}`).toBeDefined();
      }
    }
  });

  it('dash patterns are positive numbers', () => {
    for (const l of BUILTIN_LINE_TYPES) {
      for (const v of l.dashPattern) expect(v).toBeGreaterThan(0);
    }
  });

  it('ships the new user-requested patterns', () => {
    for (const id of ['DASH_X', 'DASH_CIRCLE', 'DASH_INFINITY', 'LONG_DASH', 'UTIL_POLE_LINE']) {
      expect(lt(id), id).toBeDefined();
    }
  });
});

describe('renderDashedLine scaling', () => {
  it('renders multiple dash segments when the pattern resolves on screen', () => {
    const { g, calls } = mockGraphics();
    // zoom=1 px/ft, DASHED [10,6] → ~16px period over 1000px → many dashes
    renderLineWithType(g, lt('DASHED'), horiz, 0x000000, 1, 1, 50, 1);
    expect(calls.moveTo).toBeGreaterThan(2); // each dash starts with a moveTo
  });

  it('falls back to a single solid stroke when zoomed too far out', () => {
    const { g, calls } = mockGraphics();
    // tiny zoom → whole pattern < 4px → solid line (one moveTo)
    renderLineWithType(g, lt('DASHED'), horiz, 0x000000, 1, 1, 50, 0.0001);
    expect(calls.moveTo).toBe(1);
  });

  it('solid line uses the fast path (one moveTo, one lineTo)', () => {
    const { g, calls } = mockGraphics();
    renderLineWithType(g, lt('SOLID'), horiz, 0x000000, 1, 1, 50, 1);
    expect(calls.moveTo).toBe(1);
    expect(calls.lineTo).toBe(1);
  });
});

describe('AT_VERTICES inline symbols', () => {
  it('renders without error and draws on a 3-vertex polyline', () => {
    const { g, calls } = mockGraphics();
    const poly = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 50 },
    ];
    renderLineWithType(g, lt('UTIL_POLE_LINE'), poly, 0x000000, 1, 1, 50, 1);
    // UTIL_POLE draws circles; expect drawing activity.
    const drew = (calls.drawCircle ?? 0) + (calls.beginFill ?? 0) + (calls.lineTo ?? 0);
    expect(drew).toBeGreaterThan(0);
  });
});
