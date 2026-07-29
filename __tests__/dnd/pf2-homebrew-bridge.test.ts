// The PF2 engine bridge for shared homebrew (P6-9a).
//
// THE DEFECT: `lib/dnd/homebrew/adopt.ts` writes 5e shapes onto the shared `Character`. A Pathfinder 2e
// character keeps its real state in the `data.pf2e` sidecar, so adopting onto one wrote into a blank 5e
// projection — the save succeeded, the sheet showed nothing, and nothing said why. **It looked like it
// worked**, which is the worst shape a bug can have.
//
// The assertions worth reading are the REFUSALS: this bridge is as much about what it declines to translate
// as what it carries.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pf2AdoptEdits, pf2AdoptRefusal } from '@/lib/dnd/systems/pathfinder2e/adopt';
import { applyPf2Edit, PF2_EDIT_OPS } from '@/lib/dnd/systems/pathfinder2e/edit';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { normalizeInventory, totalBulk } from '@/lib/dnd/systems/pathfinder2e/inventory';
import { assertCharacterScopedOps } from '@/lib/dnd/ai-scope';
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';

const piece = (over: Partial<HomebrewContent> = {}): HomebrewContent => ({
  id: 'hb-1', kind: 'item', name: 'Rope', system: 'pathfinder2e',
  creator: { name: 'Jacob' }, status: 'approved', ...over,
});

describe('what the bridge carries', () => {
  it('gear becomes an inventory line — possible only since PF2 got an inventory', () => {
    const r = pf2AdoptEdits(piece({ kind: 'item', name: 'Rope', payload: { bulk: 'L' } }))!;
    expect(r.adopted).toBe('item');
    expect(r.edits[0]).toMatchObject({ op: 'add_inventory_item', name: 'Rope', bulk: 'L' });
  });

  it('a weapon with damage becomes a Strike', () => {
    const r = pf2AdoptEdits(piece({ kind: 'weapon', name: 'Axe', payload: { damage: '1d8', damageType: 'slashing' } }))!;
    expect(r.adopted).toBe('strike');
    expect(r.edits[0]).toMatchObject({ op: 'add_attack', damage: '1d8', damageType: 'slashing' });
  });

  it('a weapon WITHOUT damage is gear, not an attack that rolls nothing', () => {
    const r = pf2AdoptEdits(piece({ kind: 'weapon', name: 'Ceremonial Blade' }))!;
    expect(r.adopted).toBe('item');
  });

  it('a feat lands on the ARCHETYPE track', () => {
    // Not `class`: a homebrew feat is not one of the four official tracks, and filing it as one would let
    // it be counted against a budget it was never granted by.
    const r = pf2AdoptEdits(piece({ kind: 'feat', name: 'Iron Jaw', description: 'x' }))!;
    expect(r.edits[0]).toMatchObject({ op: 'add_feat', track: 'archetype' });
  });

  it('a spell keeps its rank', () => {
    const r = pf2AdoptEdits(piece({ kind: 'spell', name: 'Ember', payload: { level: 3 } }))!;
    expect(r.edits[0]).toMatchObject({ op: 'add_spell', rank: 3 });
  });
});

describe('what it REFUSES, and why that is the point', () => {
  it('a class cannot cross', () => {
    // PF2 advancement is four feat tracks and proficiency ranks, not a hit die and an ASI ladder.
    // Converting produces something that levels wrongly — worse than a refusal.
    expect(pf2AdoptEdits(piece({ kind: 'class', name: 'Pugilist' }))).toBeNull();
    expect(pf2AdoptEdits(piece({ kind: 'subclass' }))).toBeNull();
  });

  it('and the refusal EXPLAINS itself and points somewhere useful', () => {
    const msg = pf2AdoptRefusal(piece({ kind: 'class', name: 'Pugilist' }));
    expect(msg).toMatch(/feat tracks and proficiency ranks/);
    expect(msg, 'point at the transposer, which IS the honest route between systems').toMatch(/Translate to another system/);
  });

  it('prose-only kinds are refused rather than forced somewhere they do not belong', () => {
    for (const kind of ['rule', 'condition', 'background', 'creature'] as const) {
      expect(pf2AdoptEdits(piece({ kind })), kind).toBeNull();
    }
  });

  it('5e effects are NOT translated — they are flagged', () => {
    // A "+2 STR" authored in 5e is a statement about ability SCORES, which PF2 does not have in play. A
    // silent mapping would rebalance every piece that crossed.
    const r = pf2AdoptEdits(piece({
      kind: 'item', payload: { effects: [{ target: 'str_score', operation: 'add', value: 2 }] },
    }))!;
    expect(r.adopted).toBe('item');
    expect(r.notes.join(' ')).toMatch(/authored for D&D 5e/);
    expect(r.notes.join(' '), 'and say where to go instead').toMatch(/Translate to another system/);
    expect(JSON.stringify(r.edits), 'no effect may leak into a PF2 edit').not.toContain('str_score');
  });

  it('says nothing when there were no 5e effects to warn about', () => {
    expect(pf2AdoptEdits(piece({ kind: 'item' }))!.notes).toEqual([]);
  });
});

describe('the edits actually land on a PF2 sheet', () => {
  it('an item reaches the inventory and counts toward Bulk', () => {
    const c = blankPF2Character('T');
    const r = pf2AdoptEdits(piece({ kind: 'item', name: 'Rope', payload: { bulk: 'L' } }))!;
    const after = r.edits.reduce((acc, e) => applyPf2Edit(acc, e), c);
    expect(normalizeInventory(after.inventory)).toHaveLength(1);
    expect(totalBulk(normalizeInventory(after.inventory))).toBe(0.1);
  });

  it('adding the same item twice increases the COUNT, not the line count', () => {
    // An inventory with "Rope" twice is a list nobody wants to reconcile mid-session.
    const c = blankPF2Character('T');
    const e = pf2AdoptEdits(piece({ kind: 'item', name: 'Rope' }))!.edits[0];
    const after = applyPf2Edit(applyPf2Edit(c, e), e);
    const inv = normalizeInventory(after.inventory);
    expect(inv).toHaveLength(1);
    expect(inv[0].quantity).toBe(2);
  });

  it('removing something that is not there is a visible no-op, not a silent one', () => {
    const c = blankPF2Character('T');
    expect(applyPf2Edit(c, { op: 'remove_inventory_item', name: 'Nothing' })).toBe(c);
  });

  it('a feat reaches the feat list', () => {
    const c = blankPF2Character('T');
    const r = pf2AdoptEdits(piece({ kind: 'feat', name: 'Iron Jaw', description: 'x' }))!;
    expect(r.edits.reduce((acc, e) => applyPf2Edit(acc, e), c).feats.map((f) => f.name)).toContain('Iron Jaw');
  });
});

describe('the route routes by SIDECAR, not by system string', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/dnd/homebrew/[id]/adopt/route.ts'), 'utf8');

  it('branches on isPF2Character', () => {
    // The system column can disagree with what is actually stored; the sidecar cannot.
    expect(route).toContain('isPF2Character');
    expect(route).toContain('pf2AdoptEdits');
  });

  it('preserves the rest of `data` when writing the sidecar back', () => {
    // Rebuilding `data` from the sidecar alone would delete the 5e projection, the custom sections and
    // everything else stored beside it.
    expect(route).toMatch(/\{ \.\.\.rawData, pf2e: pf2 \}/);
  });

  it('and returns the notes, because silence reads as "the feature is broken"', () => {
    expect(route).toMatch(/notes: extraNotes/);
  });
});

describe('the new ops stay inside the AI boundary', () => {
  it('every PF2 op is still character-scoped', () => {
    expect(() => assertCharacterScopedOps([...PF2_EDIT_OPS])).not.toThrow();
    expect(PF2_EDIT_OPS).toContain('add_inventory_item');
    expect(PF2_EDIT_OPS).toContain('remove_inventory_item');
  });
});
