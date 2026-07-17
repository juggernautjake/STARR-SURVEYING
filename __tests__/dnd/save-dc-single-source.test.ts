// __tests__/dnd/save-dc-single-source.test.ts — the StatRail honored the manual Save DC override while
// the Saves & Skills card recomputed 8+PB+STR and ignored it, so setting an override showed two
// different Save DCs on one sheet. Slice 13's one-answer rule: the STR-based Save DC is derived once in
// the store (override ?? 8 + PB + effective STR) and both cards read it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const STORE = read('app/dnd/_sheet/state/store.tsx');
const RAIL = read('app/dnd/_sheet/components/StatRail.tsx');
const SAVES = read('app/dnd/_sheet/components/SavesSkills.tsx');

describe('the STR-based Save DC has a single source', () => {
  it('the store derives saveDc from the override or 8 + PB + effective STR', () => {
    expect(STORE).toContain('char.combat.saveDCOverride ?? 8 + pb + abilityMod(abilities.str)');
    expect(STORE).toContain('saveDc: number');
  });
  it('StatRail reads the store saveDc (not its own recompute)', () => {
    expect(RAIL).toContain('const dc = saveDc');
    expect(RAIL).not.toContain('8 + pb + strMod');
  });
  it('SavesSkills reads the store saveDc — so it honors the override too', () => {
    expect(SAVES).toContain('const saveDC = saveDc');
    expect(SAVES).not.toContain('8 + pb + abilityMod(abilities.str)');
  });
});
