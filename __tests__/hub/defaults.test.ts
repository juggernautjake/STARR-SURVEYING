// __tests__/hub/defaults.test.ts
//
// Coverage for persona-default layouts. Verifies every Persona id from
// lib/admin/personas has a default + that each layout is well-formed
// (no overlaps, no out-of-bounds x+w, sensible row totals).

import { describe, it, expect } from 'vitest';
import {
  PERSONA_DEFAULT_LAYOUTS,
  FALLBACK_DEFAULT_LAYOUT,
  defaultLayoutForPersona,
} from '@/lib/hub/defaults';
import { PERSONA_ORDER, type Persona } from '@/lib/admin/personas';
import type { WidgetInstance } from '@/lib/hub/types';

describe('persona default layouts — exhaustiveness', () => {
  it('has a layout for every persona in PERSONA_ORDER', () => {
    for (const persona of PERSONA_ORDER) {
      expect(PERSONA_DEFAULT_LAYOUTS[persona], `${persona} default`).toBeDefined();
    }
  });

  it('each default layout has at least 4 widgets', () => {
    for (const persona of PERSONA_ORDER) {
      const widgets = PERSONA_DEFAULT_LAYOUTS[persona];
      expect(widgets.length, `${persona} widget count`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('persona default layouts — well-formed', () => {
  for (const persona of PERSONA_ORDER) {
    it(`${persona}: no overlapping widgets`, () => {
      expect(noOverlaps(PERSONA_DEFAULT_LAYOUTS[persona]), persona).toBe(true);
    });

    it(`${persona}: every widget fits within 12 cols`, () => {
      for (const w of PERSONA_DEFAULT_LAYOUTS[persona]) {
        expect(w.x + w.w, `${persona}/${w.id} fits within 12 cols`).toBeLessThanOrEqual(12);
        expect(w.x, `${persona}/${w.id} x ≥ 0`).toBeGreaterThanOrEqual(0);
      }
    });

    it(`${persona}: every widget has integer x/y/w/h ≥ 1`, () => {
      for (const w of PERSONA_DEFAULT_LAYOUTS[persona]) {
        expect(Number.isInteger(w.x)).toBe(true);
        expect(Number.isInteger(w.y)).toBe(true);
        expect(Number.isInteger(w.w)).toBe(true);
        expect(Number.isInteger(w.h)).toBe(true);
        expect(w.w).toBeGreaterThanOrEqual(1);
        expect(w.h).toBeGreaterThanOrEqual(1);
      }
    });

    it(`${persona}: every widget has a non-empty id + type`, () => {
      for (const w of PERSONA_DEFAULT_LAYOUTS[persona]) {
        expect(w.id.length).toBeGreaterThan(0);
        expect(w.type.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('defaultLayoutForPersona', () => {
  it('returns the persona-specific layout', () => {
    expect(defaultLayoutForPersona('admin')).toBe(PERSONA_DEFAULT_LAYOUTS.admin);
  });

  it('returns FALLBACK when the persona key is unmapped', () => {
    // Cast through unknown — the union excludes unknown values, but
    // a future persona id could land here from an out-of-date client.
    expect(defaultLayoutForPersona('totally-fake' as unknown as Persona)).toBe(FALLBACK_DEFAULT_LAYOUT);
  });
});

describe('FALLBACK_DEFAULT_LAYOUT', () => {
  it('contains at least one widget so the canvas isn\'t empty', () => {
    expect(FALLBACK_DEFAULT_LAYOUT.length).toBeGreaterThan(0);
  });

  it('fits within 12 cols', () => {
    for (const w of FALLBACK_DEFAULT_LAYOUT) {
      expect(w.x + w.w).toBeLessThanOrEqual(12);
    }
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────

function noOverlaps(widgets: WidgetInstance[]): boolean {
  for (let i = 0; i < widgets.length; i++) {
    for (let j = i + 1; j < widgets.length; j++) {
      const a = widgets[i];
      const b = widgets[j];
      const overlap =
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y;
      if (overlap) {
        return false;
      }
    }
  }
  return true;
}
