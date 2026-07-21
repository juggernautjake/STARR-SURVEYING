// __tests__/dnd/off-rules-marker.test.ts — off-rules content is VISIBLE on the sheet (S6).
//
// Allowing a custom character to take anything is only half the design; the other half is that
// doing so stays visible. A DM reading a sheet should see what was taken outside the rules, and a
// DM gift should never become indistinguishable from a normal class pick.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { SheetEdit } from '@/lib/dnd/sheet-edits';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the marker survives the trip onto the sheet', () => {
  it('add_spell carries offRules through to the stored spell', () => {
    const c = applySheetEdits(blankCharacter('T'), [
      { op: 'add_spell', name: 'Wish', level: 9, description: 'x', offRules: 'granted by the DM — level-9 spell' } as SheetEdit,
    ]);
    expect(c.spells?.[0].offRules).toContain('granted by the DM');
  });

  it('add_feature carries it too', () => {
    const c = applySheetEdits(blankCharacter('T'), [
      { op: 'add_feature', name: 'Grappler', body: ['x'], offRules: 'requires Strength 13' } as SheetEdit,
    ]);
    expect(c.features?.find((f) => f.name === 'Grappler')?.offRules).toBe('requires Strength 13');
  });

  it('a legal add sets no marker at all', () => {
    // Absent rather than empty, so rendering can test truthiness without every legal element
    // carrying a flag.
    const c = applySheetEdits(blankCharacter('T'), [
      { op: 'add_spell', name: 'Magic Missile', level: 1, description: 'x' } as SheetEdit,
    ]);
    expect(c.spells?.[0].offRules).toBeUndefined();
  });
});

describe('the sheet renders it where the content renders', () => {
  it('spells show the mark', () => {
    const src = read('app/dnd/_sheet/components/SpellsPanel.tsx');
    expect(src).toContain('OffRulesMark');
    expect(src).toContain('reason={s.offRules}');
  });

  it('features show the mark', () => {
    const src = read('app/dnd/_sheet/components/Features.tsx');
    expect(src).toContain('OffRulesMark');
    expect(src).toContain('reason={f.offRules}');
  });

  it('renders nothing when there is no reason', () => {
    // The flag must be invisible on an ordinary sheet, or it becomes noise everyone learns to
    // ignore — which is the same as not having it.
    const src = read('app/dnd/_sheet/components/ui/OffRulesMark.tsx');
    expect(src).toContain('if (!reason) return null');
  });

  it('distinguishes a DM gift from a rules-break, and explains itself', () => {
    const src = read('app/dnd/_sheet/components/ui/OffRulesMark.tsx');
    expect(src).toContain("reason.startsWith('granted by the DM')");
    // The reason travels with the mark — an unexplained warning glyph on a sheet reads as a bug.
    expect(src).toContain('title=');
    expect(src).toContain('aria-label=');
  });

  it('is its own glyph, not a reuse of ✎ or ★', () => {
    // They answer different questions: ✎ hand-edited, ★ currently modified, ⚑ outside the rules.
    // Checked on the RENDERED body only — the file's comment names the other two glyphs while
    // explaining the distinction, so scanning the whole source would fail on the explanation.
    const src = read('app/dnd/_sheet/components/ui/OffRulesMark.tsx');
    const body = src.slice(src.indexOf('export default function'));
    expect(body).toContain('⚑');
    expect(body).not.toContain('✎');
    expect(body).not.toContain('★');
  });
});
