// __tests__/dnd/transpose-source-sheet.test.ts — choosing which existing sheet a transpose adapts from.
import { describe, it, expect } from 'vitest';
import {
  originalSheet, isValidSourceChoice, pickSourceSheet, sourceSheetLabel,
} from '@/lib/dnd/transpose/source-sheet';
import type { SheetSlot } from '@/lib/dnd/system-variants';

const slot = (id: string, system: string, kind: 'vanilla' | 'custom' = 'vanilla', active = false): SheetSlot => ({ slotId: id, system, kind, name: `${system} sheet`, active, level: 1 });

const sheets: SheetSlot[] = [
  slot('s1', 'pathfinder2e', 'custom', true), // an active AI transpose
  slot('s2', 'dnd5e-2024', 'vanilla'),          // the original hand-built sheet
  slot('s3', 'dnd5e-2014', 'custom'),
];

describe('originalSheet', () => {
  it('is the first vanilla (hand-built) sheet, not a custom transpose', () => {
    expect(originalSheet(sheets)?.slotId).toBe('s2');
  });
  it('falls back to the first slot when there is no vanilla one', () => {
    expect(originalSheet([slot('a', 'x', 'custom'), slot('b', 'y', 'custom')])?.slotId).toBe('a');
  });
  it('is null for no sheets', () => {
    expect(originalSheet([])).toBeNull();
  });
});

describe('pickSourceSheet', () => {
  it('honors a valid explicit choice', () => {
    expect(pickSourceSheet(sheets, 's3')?.slotId).toBe('s3');
  });
  it('defaults to the original when no (or an invalid) choice is given', () => {
    expect(pickSourceSheet(sheets)?.slotId).toBe('s2');
    expect(pickSourceSheet(sheets, 'nope')?.slotId).toBe('s2');
    expect(pickSourceSheet(sheets, null)?.slotId).toBe('s2');
  });
});

describe('isValidSourceChoice + label', () => {
  it('validates a slot id', () => {
    expect(isValidSourceChoice(sheets, 's1')).toBe(true);
    expect(isValidSourceChoice(sheets, 'zzz')).toBe(false);
    expect(isValidSourceChoice(sheets, null)).toBe(false);
  });
  it('labels the source for the UI', () => {
    expect(sourceSheetLabel(sheets[1], (s) => s.toUpperCase())).toBe('dnd5e-2024 sheet · DND5E-2024');
    expect(sourceSheetLabel(null, (s) => s)).toBe('this character');
  });
});
