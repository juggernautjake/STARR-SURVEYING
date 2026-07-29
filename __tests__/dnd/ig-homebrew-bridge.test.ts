// The Intuitive Games engine bridge for shared homebrew (P6-9b).
//
// The mirror of `pf2-homebrew-bridge.test.ts`, fixing the same defect from the other side: an IG character
// keeps its state in `data.ig`, so adopting onto one wrote into a blank 5e projection and silently did
// nothing.
//
// What makes this NOT the same file twice — and what these assertions are really for — is where IG differs:
// it has stances (no other system does), its gear is a loose list rather than a Bulk-tracked inventory, and
// its powers and spells are one list.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { igAdoptEdits, igAdoptRefusal } from '@/lib/dnd/systems/intuitive-games/adopt';
import { applyIgEdit, IG_EDIT_OPS } from '@/lib/dnd/systems/intuitive-games/edit';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { assertCharacterScopedOps } from '@/lib/dnd/ai-scope';
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';

const piece = (over: Partial<HomebrewContent> = {}): HomebrewContent => ({
  id: 'hb-1', kind: 'item', name: 'Rope', system: 'intuitive-games',
  creator: { name: 'Jacob' }, status: 'approved', ...over,
});

const apply = (edits: Parameters<typeof applyIgEdit>[1][]) =>
  edits.reduce((acc, e) => applyIgEdit(acc, e), blankIGCharacter('T'));

describe('what only IG can take', () => {
  it('a STANCE lands natively — no other system has one', () => {
    // This is the payoff of a bridge per system rather than one generic converter: a homebrew stance is
    // meaningless in 5e and PF2, and a first-class mechanic here.
    const r = igAdoptEdits(piece({ kind: 'stance', name: 'Coiled Spring' }))!;
    expect(r.adopted).toBe('stance');
    expect(apply(r.edits).stances).toContain('Coiled Spring');
  });

  it('and a stance is LEARNED, not entered — being taught one is not standing in it', () => {
    const after = apply(igAdoptEdits(piece({ kind: 'stance', name: 'Coiled Spring' }))!.edits);
    expect(after.combat.stances, 'adopting must not silently change what you are holding').toEqual([]);
  });
});

describe('what the bridge carries', () => {
  it('gear becomes a line in the loose equipment list', () => {
    // IG models gear as five worn slots plus `other`. No Bulk field, deliberately — that is a Pathfinder
    // concept and importing it would invent a rule IG does not use.
    const r = igAdoptEdits(piece({ kind: 'item', name: 'Rope' }))!;
    expect(r.adopted).toBe('equipment');
    expect(apply(r.edits).equipment.other).toContain('Rope');
  });

  it('a weapon with damage becomes an attack', () => {
    const r = igAdoptEdits(piece({ kind: 'weapon', name: 'Axe', payload: { damage: '1d8' } }))!;
    expect(r.adopted).toBe('attack');
    expect(apply(r.edits).combat.attacks.map((a) => a.name)).toContain('Axe');
  });

  it('a weapon WITHOUT damage is gear, not an attack that rolls nothing', () => {
    expect(igAdoptEdits(piece({ kind: 'weapon', name: 'Ceremonial Blade' }))!.adopted).toBe('equipment');
  });

  it('a spell AND an ability both become powers — IG has one list', () => {
    for (const kind of ['spell', 'ability'] as const) {
      const r = igAdoptEdits(piece({ kind, name: 'Ember' }))!;
      expect(r.adopted, kind).toBe('power');
      expect(apply(r.edits).powers).toContain('Ember');
    }
  });

  it('a feat reaches the feat list', () => {
    const r = igAdoptEdits(piece({ kind: 'feat', name: 'Iron Jaw' }))!;
    const after = apply(r.edits);
    expect([...after.feats.general, ...after.feats.combat]).toContain('Iron Jaw');
  });

  it('a condition can be applied', () => {
    const r = igAdoptEdits(piece({ kind: 'condition', name: 'Winded' }))!;
    expect(apply(r.edits).combat.conditions).toContain('Winded');
  });
});

describe('what it refuses', () => {
  it('a class cannot cross', () => {
    expect(igAdoptEdits(piece({ kind: 'class' }))).toBeNull();
    expect(igAdoptEdits(piece({ kind: 'subclass' }))).toBeNull();
  });

  it('and says why, in IG’s own terms rather than Pathfinder’s', () => {
    const msg = igAdoptRefusal(piece({ kind: 'class', name: 'Pugilist' }));
    expect(msg).toMatch(/per-level schedule of powers and specializations/);
    expect(msg).toMatch(/Translate to another system/);
  });

  it('prose-only kinds are refused rather than forced somewhere they do not belong', () => {
    for (const kind of ['rule', 'background', 'creature', 'skill'] as const) {
      expect(igAdoptEdits(piece({ kind })), kind).toBeNull();
    }
  });

  it('5e effects are flagged, never translated', () => {
    const r = igAdoptEdits(piece({
      kind: 'item', payload: { effects: [{ target: 'str_score', operation: 'add', value: 2 }] },
    }))!;
    expect(r.notes.join(' ')).toMatch(/authored for D&D 5e/);
    expect(JSON.stringify(r.edits)).not.toContain('str_score');
  });
});

describe('the equipment ops behave at the edges', () => {
  it('adding what you already carry is a no-op, not a duplicate line', () => {
    // `other` is a list of names with no quantity, so "add it" and "it is already there" are the only
    // honest outcomes.
    const c = blankIGCharacter('T');
    const once = applyIgEdit(c, { op: 'add_equipment', name: 'Rope' });
    expect(applyIgEdit(once, { op: 'add_equipment', name: 'Rope' })).toBe(once);
  });

  it('removing something absent is a VISIBLE no-op', () => {
    const c = blankIGCharacter('T');
    expect(applyIgEdit(c, { op: 'remove_equipment', name: 'Nothing' })).toBe(c);
  });

  it('and matching ignores case, like every other IG name lookup', () => {
    const c = applyIgEdit(blankIGCharacter('T'), { op: 'add_equipment', name: 'Rope' });
    expect(applyIgEdit(c, { op: 'remove_equipment', name: 'rope' }).equipment.other).not.toContain('Rope');
  });
});

describe('the route handles all three systems', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/dnd/homebrew/[id]/adopt/route.ts'), 'utf8');

  it('branches on each sidecar, then falls back to the 5e path', () => {
    expect(route).toContain('isPF2Character');
    expect(route).toContain('isIGCharacter');
    expect(route.indexOf('isIGCharacter')).toBeLessThan(route.indexOf('adoptHomebrew(current'));
  });

  it('preserves the rest of `data` when writing the IG sidecar back', () => {
    expect(route).toMatch(/\{ \.\.\.rawData, ig \}/);
  });
});

describe('the new ops stay inside the AI boundary', () => {
  it('every IG op is character-scoped', () => {
    expect(() => assertCharacterScopedOps([...IG_EDIT_OPS])).not.toThrow();
    expect(IG_EDIT_OPS).toContain('add_equipment');
    expect(IG_EDIT_OPS).toContain('remove_equipment');
  });
});
