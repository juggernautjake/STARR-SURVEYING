// __tests__/dnd/builder-e2e.test.ts — Slice 15 QA smoke test: the whole builder pipeline
// connects end-to-end at the data layer (build → edit → custom sheet → interactive widget →
// layout edit → cross-system transpose → switch back). Live AI/DB paths are covered by the
// per-slice tests + noted as running-app checks; this proves the pure seams line up.
import { describe, it, expect } from 'vitest';
import { blankCharacter, normalizeCharacter } from '@/app/dnd/_sheet/data/blank';
import { applySheetEdits } from '@/lib/dnd/sheet-edits';
import { composeCustomSheet, layoutHasInteractive, hasCustomLayout } from '@/lib/dnd/custom-sheet';
import { applyLayoutEdits } from '@/lib/dnd/layout-edits';
import { installTransposed, switchActive, readVariants, type ActiveSheet } from '@/lib/dnd/system-variants';
import { getSheetConfig } from '@/app/dnd/_sheet/registry';
import { isSelectableSheetStyle } from '@/lib/dnd/sheet-styles';

describe('builder end-to-end (Slice 15 QA)', () => {
  it('runs the full pipeline without a crash', () => {
    // 1. Grounded build → a mechanics edit onto a blank sheet (Slice 8/2).
    let char = applySheetEdits(blankCharacter('Kael'), [
      { op: 'set_meta', field: 'className', value: 'Fighter' } as never,
      { op: 'set_level', value: 5 } as never,
      { op: 'add_feature', name: 'Second Wind', body: ['Regain HP.'] } as never,
    ]);
    // 2. Normalization keeps every tab crash-safe across systems (Slice 1b/10).
    char = normalizeCharacter(JSON.parse(JSON.stringify(char)));
    expect(char.features.some((f) => f.name === 'Second Wind')).toBe(true);
    expect(getSheetConfig('default').skin).toBe('hextech'); // Hextech default (Slice 6b)

    // 3. A static custom sheet composes safely (Slice 6).
    const staticDoc = composeCustomSheet({ title: char.meta.name, blocks: [{ type: 'stats', title: 'Abilities', items: [{ label: 'STR', value: 18 }] }] });
    expect(staticDoc).toContain('Kael');
    expect(staticDoc.startsWith('<!doctype html>')).toBe(true);

    // 4. A layout edit adds an interactive widget → the sheet becomes interactive (Slice 11/12).
    const { layout } = applyLayoutEdits({ blocks: [] }, '', [
      { op: 'add_block', block: { type: 'heading', text: 'Kael' } },
      { op: 'add_block', block: { type: 'counter', key: 'focus', label: 'Focus' } },
    ]);
    expect(hasCustomLayout(layout)).toBe(true);
    expect(layoutHasInteractive(layout)).toBe(true);
    expect(isSelectableSheetStyle('lazzuh')).toBe(true); // style pick works (Slice 7)

    // 5. Cross-system transpose then switch back restores the original unchanged (Slice 13).
    const active: ActiveSheet = { system: 'dnd5e-2024', data: char, sheet_type: 'default', custom_layout: layout, custom_css: '' };
    const transposed = installTransposed(active, readVariants({}), 'dnd5e-2014', { ...char, transposed: true });
    expect(transposed.active.system).toBe('dnd5e-2014');
    const back = switchActive(transposed.active, transposed.variants, 'dnd5e-2024');
    expect(back.active.system).toBe('dnd5e-2024');
    expect(back.active.data).toEqual(char); // original 2024 sheet intact
  });
});
