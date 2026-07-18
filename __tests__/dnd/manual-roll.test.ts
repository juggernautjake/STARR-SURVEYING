// __tests__/dnd/manual-roll.test.ts — Areas R3 (manual d20 fold) + R5 (record an IRL roll). The pure fold is
// golden-pinned; the store + tray wiring is source-anchored (store fns live inside a React provider).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { foldD20 } from '@/app/dnd/_sheet/lib/dice';

describe('foldD20 — manual d20 face + modifier (Area R3)', () => {
  it('folds the entered face with the modifier, no randomness', () => {
    const r = foldD20(14, 5);
    expect(r.natural).toBe(14);
    expect(r.total).toBe(19);
    expect(r.mode).toBe('flat');
    expect(r.rolls).toEqual([14]);
    expect(r.breakdown).toBe('d20[14] + 5 (entered)');
  });
  it('marks crit on the crit range and fumble on a natural 1', () => {
    expect(foldD20(20, 3).crit).toBe(true);
    expect(foldD20(1, 8).fumble).toBe(true);
    expect(foldD20(1, 8).crit).toBe(false);
    expect(foldD20(19, 0, 19).crit).toBe(true); // improved crit range
  });
  it('clamps the face to 1–20 and rounds', () => {
    expect(foldD20(99, 0).natural).toBe(20);
    expect(foldD20(-4, 0).natural).toBe(1);
    expect(foldD20(12.6, 0).natural).toBe(13);
  });
  it('renders a negative modifier with a minus', () => {
    expect(foldD20(10, -2).breakdown).toBe('d20[10] − 2 (entered)');
    expect(foldD20(10, 0).breakdown).toBe('d20[10] (entered)');
  });
});

describe('store + tray wiring for manual/IRL entry (R3/R5)', () => {
  const store = readFileSync(join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');
  const tray = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/DiceTray.tsx'), 'utf8');

  it('the store exposes manualD20 (folds + exhaustion + stages) and recordRoll (logs an IRL roll)', () => {
    expect(store).toContain('const manualD20 = useCallback');
    expect(store).toContain('foldD20(face, mod + exhEff.penalty, rollCritMin)');
    expect(store).toContain("tags: string[] = ['MANUAL']");
    expect(store).toContain('const recordRoll = useCallback');
    expect(store).toContain("tag: 'IRL'");
    // both are exported on the context value
    expect(store).toContain('manualD20,');
    expect(store).toContain('recordRoll,');
  });

  it('the tray has a two-mode entry panel (fold a d20 face / record a result)', () => {
    expect(tray).toContain('manualD20, recordRoll');
    expect(tray).toContain("entryMode === 'fold'");
    expect(tray).toContain('manualD20(label, parseInt(entryMod, 10) || 0, face');
    expect(tray).toContain('recordRoll(label, total)');
    expect(tray).toContain('Enter a roll');
  });
});
