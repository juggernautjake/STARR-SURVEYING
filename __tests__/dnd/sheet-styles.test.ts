// __tests__/dnd/sheet-styles.test.ts — the browsable sheet-style catalog + the PATCH
// guard that only a real, user-selectable style may be set (Phase V, Slice 7).
import { describe, it, expect } from 'vitest';
import { SHEET_STYLES, isSelectableSheetStyle } from '@/lib/dnd/sheet-styles';

describe('sheet styles', () => {
  it('lists the pickable registry skins with a preview swatch', () => {
    const ids = SHEET_STYLES.map((s) => s.id);
    expect(ids).toContain('default');
    expect(ids).toContain('lazzuh');
    expect(ids).toContain('streamer');
    expect(ids).toContain('donata');
    expect(ids).toContain('jack');
    for (const s of SHEET_STYLES) {
      expect(s.label).toBeTruthy();
      expect(s.blurb).toBeTruthy();
      expect(s.swatch.bg).toMatch(/^#/);
      expect(s.swatch.accent).toMatch(/^#/);
    }
  });

  it('does not expose the AI-only `custom` or the internal `generic` alias as pickable', () => {
    expect(isSelectableSheetStyle('custom')).toBe(false);
    expect(isSelectableSheetStyle('generic')).toBe(false);
  });

  it('validates a chosen sheet_type', () => {
    expect(isSelectableSheetStyle('default')).toBe(true);
    expect(isSelectableSheetStyle('donata')).toBe(true);
    expect(isSelectableSheetStyle('nonsense')).toBe(false);
    expect(isSelectableSheetStyle('')).toBe(false);
    expect(isSelectableSheetStyle(null)).toBe(false);
    expect(isSelectableSheetStyle(42)).toBe(false);
  });
});
