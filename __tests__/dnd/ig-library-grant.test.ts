// __tests__/dnd/ig-library-grant.test.ts — the library→sheet path for Intuitive Games (CX-13).
//
// The bug this pins: every IG library section (powers, defensive powers, feats, stances) resolved to
// the shared grant kind `feature`, which `buildGrantEdits` delivers as an `add_feature` op against
// the 5e-shaped `Character` blob. An IG character's real model is the sidecar at `data.ig`. So a
// granted power was written to a model the IG sheet does not read, was never seen by `gateIgEdit`,
// and was never marked with its provenance — content in the wrong place, a bypassed gate, and a
// lost record of how it arrived, from one button.
//
// The tests assert the DELIVERY and the JUDGEMENT, not that a mapping table has certain rows: what
// went wrong before was that a kind existed and nothing carried it into the right model.
import { describe, it, expect } from 'vitest';
import { grantKindForSection } from '@/app/dnd/_ui/GiveEntryButton';
import { igGrantEdit, isIGGrantKind, igGrantNoun, describeIgGrant, IG_GRANT_KINDS } from '@/lib/dnd/systems/intuitive-games/grant';
import { applyIgEdit } from '@/lib/dnd/systems/intuitive-games/edit';
import { gateIgEdit } from '@/lib/dnd/systems/intuitive-games/rules-gate';
import { blankIGCharacter, type IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { buildGrantEdits } from '@/lib/dnd/library-grant';
import { applySheetEdits } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

/** A level-1 Arcanist — a real IG class with a real power list, so eligibility can reach a verdict. */
function arcanist(over: Partial<IGCharacter['identity']> = {}): IGCharacter {
  const ig = blankIGCharacter('Grantee');
  return { ...ig, identity: { ...ig.identity, className: 'Wizard', subclass: 'Arcanist', level: 1, ...over } };
}

const VANILLA = { enforce: true };
const DM = { enforce: false, unboundReason: 'dm-grant' as const };

/** The whole route path, minus the database: map the library kind onto an IG edit, gate it, apply
 *  it, and mark it. Mirrors app/api/dnd/characters/[id]/grant-content/route.ts. */
function grant(ig: IGCharacter, kind: string, name: string, ctx = VANILLA): { ig: IGCharacter; refusal?: string; offRules?: string } {
  const edit = igGrantEdit(kind, name);
  if (!edit) throw new Error(`${kind} is not an IG grant kind`);
  const gate = gateIgEdit(ig, edit, ctx);
  if (!gate.edit) return { ig, refusal: gate.refusal ?? 'refused' };
  const applied = applyIgEdit(ig, gate.edit);
  const next = gate.offRules && gate.edit.op === 'add_power'
    ? { ...applied, offRules: { ...(applied.offRules ?? {}), [gate.edit.name]: gate.offRules } }
    : applied;
  return { ig: next, ...(gate.offRules ? { offRules: gate.offRules } : {}) };
}

describe('the IG library sections resolve to IG kinds, not to a 5e feature', () => {
  it('maps each IG section to its own kind', () => {
    expect(grantKindForSection('powers', 'intuitive-games')).toBe('ig-power');
    expect(grantKindForSection('defensive-powers', 'intuitive-games')).toBe('ig-defensive-power');
    expect(grantKindForSection('feats', 'intuitive-games')).toBe('ig-feat');
    expect(grantKindForSection('stances', 'intuitive-games')).toBe('ig-stance');
  });

  it('leaves the 5e systems’ feats as sheet features — they have no feat model of their own', () => {
    expect(grantKindForSection('feats', 'dnd5e-2024')).toBe('feature');
    expect(grantKindForSection('feats', 'dnd5e-2014')).toBe('feature');
  });

  it('every IG kind is recognised by the guard the route dispatches on', () => {
    for (const k of IG_GRANT_KINDS) {
      expect(isIGGrantKind(k)).toBe(true);
      expect(igGrantEdit(k, 'Anything')).not.toBeNull();
      expect(igGrantNoun(k)).toBeTruthy();
    }
    expect(isIGGrantKind('feature')).toBe(false);
    expect(isIGGrantKind('spell')).toBe(false);
  });
});

describe('a granted power lands in the IG model', () => {
  it('reaches ig.powers — the list the IG sheet actually renders', () => {
    // Elemental Blast is the Arcanist's own inherited starting power, so a vanilla character may
    // take it and the gate has no reason to intervene.
    const out = grant(arcanist(), 'ig-power', 'Elemental Blast');
    expect(out.refusal).toBeUndefined();
    expect(out.ig.powers).toContain('Elemental Blast');
  });

  it('is refused for a VANILLA character when it is off their class list', () => {
    const out = grant(arcanist(), 'ig-power', 'Entangle');
    expect(out.refusal).toBeTruthy();
    expect(out.refusal).toMatch(/not a Arcanist power|not an Arcanist power/i);
    // Refused means NOTHING was written — not written somewhere else.
    expect(out.ig.powers).toHaveLength(0);
  });

  it('is allowed but MARKED when the DM grants it', () => {
    const out = grant(arcanist(), 'ig-power', 'Entangle', DM);
    expect(out.refusal).toBeUndefined();
    expect(out.ig.powers).toContain('Entangle');
    // ⚑ on the sheet is `offRules`; without this the record of how it arrived is simply lost.
    expect(out.ig.offRules?.Entangle).toMatch(/granted by the DM/i);
  });
});

describe('the kinds the gate deliberately does NOT judge stay unjudged', () => {
  // IG-S2: gating feats or stances here would be the UI inventing a restriction the rules do not
  // have — the mirror image of a bleed, and just as wrong.
  it('grants a feat to a vanilla character without a verdict, into the right bucket', () => {
    const out = grant(arcanist(), 'ig-feat', 'Toughness');
    expect(out.refusal).toBeUndefined();
    expect([...out.ig.feats.general, ...out.ig.feats.combat]).toContain('Toughness');
  });

  it('grants a stance to a vanilla character', () => {
    const out = grant(arcanist(), 'ig-stance', 'Defensive');
    expect(out.refusal).toBeUndefined();
    expect(out.ig.stances).toContain('Defensive');
  });
});

describe('a granted stance is LEARNED, not entered', () => {
  it('adds to the known set and leaves the active stance alone', () => {
    const before = { ...arcanist(), combat: { ...arcanist().combat, stances: ['Aggressive'] } };
    const out = grant(before, 'ig-stance', 'Defensive');
    expect(out.ig.stances).toContain('Defensive');
    // Being taught a stance must not drop the one the character is standing in.
    expect(out.ig.combat.stances).toEqual(['Aggressive']);
  });

  it('is idempotent — granting a known stance twice does not duplicate it', () => {
    const once = grant(arcanist(), 'ig-stance', 'Defensive');
    const twice = grant(once.ig, 'ig-stance', 'Defensive');
    expect(twice.ig.stances.filter((s) => s === 'Defensive')).toHaveLength(1);
  });
});

describe('the single-slot and shared kinds', () => {
  it('a granted defensive power sets the one slot, and the summary names what it displaced', () => {
    const before = { ...arcanist(), combat: { ...arcanist().combat, defensivePower: 'Parry' } };
    const edit = igGrantEdit('ig-defensive-power', 'Deflect')!;
    const summary = describeIgGrant(edit, before);
    expect(summary).toMatch(/replacing Parry/);
    expect(applyIgEdit(before, edit).combat.defensivePower).toBe('Deflect');
  });

  it('a condition granted to an IG character reaches ig.combat.conditions', () => {
    // Mechanically load-bearing, not cosmetic: `igResolveAttackInPlay` reads this list, so a
    // condition written to the shared blob is a penalty the sheet shows and the rolls never pay.
    const out = grant(arcanist(), 'condition', 'Frightened');
    expect(out.ig.combat.conditions).toContain('Frightened');
  });

  it('refuses to map the 5e-shaped kinds — IG has no faithful landing spot for them', () => {
    // A null here is what makes the route fall through to `buildGrantEdits`, which is correct for
    // these: IG has no free-form feature list and no inventory, and the shared sheet renders below
    // the IG sheet, so that is a real place for them to live.
    for (const k of ['feature', 'item', 'weapon', 'armor', 'spell']) {
      expect(igGrantEdit(k, 'Longsword')).toBeNull();
    }
  });

  it('refuses an empty name rather than writing a blank element', () => {
    expect(igGrantEdit('ig-power', '   ')).toBeNull();
  });
});

describe('the 5e grant path does not eat the IG sidecar', () => {
  // The kinds IG cannot hold still go through `buildGrantEdits` + `applySheetEdits`, which are
  // 5e-shaped and typed as producing a `Character` — a type with no `ig` field. They survive that
  // round trip only because `applySheetEdits` starts from `structuredClone(input)` rather than
  // rebuilding the object. If anyone ever adds normalization there, this fails instead of silently
  // deleting an entire Intuitive Games character the next time someone grants it a rope.
  it('carries data.ig through a 5e-shaped grant untouched', () => {
    const ig = arcanist();
    const blob = { ...blankCharacter('CX13'), ig } as unknown as Character;
    const out = buildGrantEdits({ kind: 'item', name: 'Rope', system: 'intuitive-games', options: { quantity: 1 } }, { enforce: true, character: { className: '', level: 1, knownSpells: [] } });
    if ('error' in out) throw new Error(out.error);
    const updated = applySheetEdits(blob, out.edits, { equipLimits: 'enforced', system: 'intuitive-games' });
    expect((updated as unknown as { ig?: IGCharacter }).ig).toEqual(ig);
  });
});

describe('describeIgGrant reads the character BEFORE the edit', () => {
  it('says nothing changed when the character already holds it', () => {
    const held = { ...arcanist(), powers: ['Elemental Blast'] };
    expect(describeIgGrant(igGrantEdit('ig-power', 'Elemental Blast')!, held)).toMatch(/already/i);
  });

  it('reports the off-rules mark in the summary the player sees', () => {
    const s = describeIgGrant(igGrantEdit('ig-power', 'Entangle')!, arcanist(), 'granted by the DM — Entangle is not a Arcanist power.');
    expect(s).toMatch(/off-rules: granted by the DM/);
  });
});
