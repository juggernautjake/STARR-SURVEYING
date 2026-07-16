// __tests__/dnd/registry-default.test.ts — the Hextech look is the neutral default sheet
// (Phase V, Slice 6b), replacing the Lazzuh purple-alien fallback for new PCs and NPCs.
import { describe, it, expect } from 'vitest';
import { getSheetConfig, SHEET_REGISTRY } from '@/app/dnd/_sheet/registry';
import { hextechTheme, lazzuhTheme } from '@/app/dnd/_sheet/theme';

describe('sheet registry default', () => {
  it('unknown / missing sheet_type falls back to the Hextech default (not Lazzuh)', () => {
    const fallback = getSheetConfig(undefined);
    expect(fallback.theme).toBe(hextechTheme);
    expect(fallback.skin).toBe('hextech');
    expect(getSheetConfig('nonexistent').theme).toBe(hextechTheme);
    // The old purple Lazzuh palette is no longer what a default character gets.
    expect(fallback.theme).not.toBe(lazzuhTheme);
  });

  it('registers `default` and `generic` on the Hextech skin, and keeps `custom`', () => {
    expect(SHEET_REGISTRY.default.skin).toBe('hextech');
    expect(SHEET_REGISTRY.generic.skin).toBe('hextech');
    expect(SHEET_REGISTRY.custom.label).toMatch(/custom/i);
  });

  it('leaves the bespoke skins intact (Lazzuh still available, just not the default)', () => {
    expect(SHEET_REGISTRY.lazzuh.theme).toBe(lazzuhTheme);
    expect(SHEET_REGISTRY.lazzuh.modules).toContain('forms');
  });
});
