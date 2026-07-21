// __tests__/dnd/pf2-armor-editor.test.ts — armor moves AC (S15d, completing the editor ask).
//
// Armor was settable only at build time, and the AC stat had no way to change it afterwards. Every
// field here feeds pf2ArmorClass — armor that displays but does not move AC is worse than no armor
// field at all, because a player will trust the number.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyPf2Edit, parsePf2Edit, PF2_EDIT_OPS } from '@/lib/dnd/systems/pathfinder2e/edit';
import { pf2ArmorClass } from '@/lib/dnd/systems/pathfinder2e/rules';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const editor = read('app/dnd/_ui/PF2ArmorEditor.tsx');
const sheet = read('app/dnd/_ui/PF2Sheet.tsx');

const dexy = (): PF2Character => {
  const c = blankPF2Character('T');
  return { ...c, identity: { ...c.identity, level: 5 }, attributes: { ...c.attributes, DEX: 4 } };
};

describe('set_armor reaches the AC formula', () => {
  it('is registered', () => {
    expect(PF2_EDIT_OPS as readonly string[]).toContain('set_armor');
  });

  it('moves AC when the item bonus changes', () => {
    const before = pf2ArmorClass(dexy());
    const after = pf2ArmorClass(applyPf2Edit(dexy(), { op: 'set_armor', acBonus: 4, rank: 'trained' }));
    expect(after).toBeGreaterThan(before);
  });

  it('applies the Dex cap — the rule that surprises people', () => {
    // DEX +4 under a cap of +1 contributes only +1. Half plate should NOT reward high Dexterity.
    const capped = applyPf2Edit(dexy(), { op: 'set_armor', acBonus: 5, dexCap: 1, rank: 'trained' });
    const uncapped = applyPf2Edit(dexy(), { op: 'set_armor', acBonus: 5, dexCap: null, rank: 'trained' });
    expect(pf2ArmorClass(uncapped) - pf2ArmorClass(capped)).toBe(3); // 4 − 1
  });

  it('treats dexCap: null as UNCAPPED, not as absent', () => {
    // null is meaningful (unarmored). A truthiness check would swallow both null and 0 and leave
    // the previous cap in place.
    const c = applyPf2Edit(dexy(), { op: 'set_armor', dexCap: 2 });
    expect(applyPf2Edit(c, { op: 'set_armor', dexCap: null }).combat.dexCap).toBeNull();
  });

  it('stores a check penalty as NEGATIVE however it was supplied', () => {
    // Typed as +2 it would otherwise improve four skills instead of hindering them.
    for (const given of [2, -2]) {
      const c = applyPf2Edit(dexy(), { op: 'set_armor', checkPenalty: given });
      expect(c.combat.armorCheckPenalty).toBe(-2);
    }
  });

  it('only touches the fields supplied', () => {
    // Changing an AC bonus must not silently reset the Dex cap.
    const c = applyPf2Edit(dexy(), { op: 'set_armor', name: 'Half Plate', acBonus: 5, dexCap: 1 });
    const after = applyPf2Edit(c, { op: 'set_armor', acBonus: 6 });
    expect(after.combat.dexCap).toBe(1);
    expect(after.combat.armorName).toBe('Half Plate');
  });

  it('does not mutate the input', () => {
    const before = dexy();
    applyPf2Edit(before, { op: 'set_armor', acBonus: 9 });
    expect(before.combat.acItemBonus).toBe(0);
  });

  it('rejects an unrecognised proficiency rank rather than storing it', () => {
    const r = parsePf2Edit({ op: 'set_armor', rank: 'godlike' });
    expect('edit' in r && (r.edit as { rank?: string }).rank).toBeUndefined();
  });

  it('forwards dexCap: null through the parser intact', () => {
    const r = parsePf2Edit({ op: 'set_armor', dexCap: null });
    expect('edit' in r && (r.edit as { dexCap?: number | null }).dexCap).toBeNull();
  });
});

describe('the editor shows what the numbers will become', () => {
  it('previews the resulting AC with the same formula the sheet uses', () => {
    // `effectiveAc`, not the raw `acBonus` box: armor runes DERIVE the item bonus and win over the
    // hand-entered number, so the preview has to use the same value pf2ResolveAc will.
    expect(editor).toContain('const previewAc = 10 + cappedDex + pf2Proficiency(rank, pf2.identity.level) + effectiveAc');
  });

  it('warns when Dexterity is being wasted against the cap', () => {
    // Past the cap, more Dexterity does nothing for AC — a silent subtraction otherwise.
    expect(editor).toContain('dexWasted');
    expect(editor).toContain('doing nothing for AC');
  });

  it('offers catalogued armor as a starting point without locking the fields', () => {
    // Homebrew armor is authored by picking something close and retuning it, or from scratch.
    expect(editor).toContain('PF2_ARMORS_FULL');
    expect(editor).toContain('fillFrom');
  });

  it('takes the check penalty as a positive and stores it negative', () => {
    expect(editor).toContain('Math.abs(c.armorCheckPenalty ?? 0)');
  });
});

describe('the sheet exposes it', () => {
  it('makes AC clickable for an editor only', () => {
    expect(sheet).toContain('setArmorOpen(true)');
    expect(sheet).toContain('canDoEdit ? (');
  });

  it('saves through the gated route', () => {
    expect(sheet).toMatch(/setArmorOpen\(false\); void postEdit\(edit\)/);
  });
});
