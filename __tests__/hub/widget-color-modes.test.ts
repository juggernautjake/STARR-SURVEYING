// __tests__/hub/widget-color-modes.test.ts
//
// Slice 103 — catalog metadata for the Style tab. Locks the ordered
// lists of color modes / status tints / border radii / shadow depths
// so adding a new entry can't silently shift the UI.

import { describe, it, expect } from 'vitest';
import {
  BORDER_RADII,
  COLOR_MODES,
  SHADOW_DEPTHS,
  STATUS_TINTS,
  labelForColorMode,
  labelForStatusTint,
} from '@/lib/hub/widget-color-modes';

describe('widget-color-modes — COLOR_MODES', () => {
  it('exposes the 5 modes in display order', () => {
    expect(COLOR_MODES.map((m) => m.id)).toEqual([
      'inherit', 'subtle-accent', 'accent', 'status', 'custom',
    ]);
  });

  it('every entry has a label + description', () => {
    for (const m of COLOR_MODES) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
    }
  });

  it('labelForColorMode returns the catalog label', () => {
    expect(labelForColorMode('accent')).toBe('Accent');
    expect(labelForColorMode('subtle-accent')).toBe('Subtle accent');
  });
});

describe('widget-color-modes — STATUS_TINTS', () => {
  it('exposes the 4 tints in display order', () => {
    expect(STATUS_TINTS.map((t) => t.id)).toEqual([
      'info', 'success', 'warning', 'danger',
    ]);
  });

  it('labelForStatusTint returns the catalog label', () => {
    expect(labelForStatusTint('warning')).toBe('Warning');
  });
});

describe('widget-color-modes — BORDER_RADII', () => {
  it('exposes sharp / rounded / pill with ascending pixel radii', () => {
    expect(BORDER_RADII.map((r) => r.id)).toEqual(['sharp', 'rounded', 'pill']);
    expect(BORDER_RADII[0].px).toBe(0);
    expect(BORDER_RADII[1].px).toBeGreaterThan(0);
    expect(BORDER_RADII[2].px).toBeGreaterThan(BORDER_RADII[1].px);
  });
});

describe('widget-color-modes — SHADOW_DEPTHS', () => {
  it('exposes the four depth levels 0-3 in order', () => {
    expect(SHADOW_DEPTHS.map((s) => s.id)).toEqual([0, 1, 2, 3]);
  });
});
