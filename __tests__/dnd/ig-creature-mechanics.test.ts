// __tests__/dnd/ig-creature-mechanics.test.ts — a transposed creature that reads as IG (B6-4).
//
// The judgement under test is WHERE THE LINE IS. Renaming `restrained` to `Entangled` is a translation
// between two published vocabularies. Deciding a creature is in the Offensive stance is not — nothing in a
// 5e stat block says so, and a stance is a choice a combatant makes on its turn rather than a property of
// the creature. So the tests below care as much about what is NOT emitted as about what is.
import { describe, it, expect } from 'vitest';
import {
  IG_CONDITION_GAPS, IG_CONDITION_MAP, IG_HOUSE_READING, igCreatureEntries, igReferencedNames,
  isPublishedIgCondition, readConditions, suggestDefensivePower, suggestStance,
} from '@/lib/dnd/systems/intuitive-games/creature-mechanics';
import { IG_STANCE_DEFS, IG_DEFENSIVE_POWERS } from '@/lib/dnd/systems/intuitive-games/content';
import type { Statblock } from '@/lib/dnd/homebrew/statblock';

const sb = (entries: Array<{ name: string; body: string }>, extra: Partial<Statblock> = {}): Statblock => ({
  entries: entries.map((e) => ({ kind: 'trait' as const, name: e.name, body: e.body })),
  ...extra,
});

describe('conditions — a real translation between two published vocabularies', () => {
  it('renames what IG has an equivalent for', () => {
    const r = readConditions(sb([{ name: 'Web', body: 'The target is restrained and frightened until it escapes.' }]));
    expect(r.find((c) => c.from === 'restrained')?.to).toBe('Entangled');
    expect(r.find((c) => c.from === 'frightened')?.to).toBe('Shaken');
  });

  it('names what IG does NOT have rather than approximating it', () => {
    // Turning `petrified` into "Paralyzed" would lose the part where the creature is stone — a DM applying
    // the nearest neighbour would run the encounter wrong, which is worse than being told there is a gap.
    const r = readConditions(sb([{ name: 'Gaze', body: 'The target is petrified. It is also charmed.' }]));
    expect(r.find((c) => c.from === 'petrified')?.to).toBeNull();
    expect(r.find((c) => c.from === 'petrified')?.note).toMatch(/stone/i);
    expect(r.find((c) => c.from === 'charmed')?.to).toBeNull();
  });

  it('is word-bounded, so "unrestrained" is not "restrained"', () => {
    expect(readConditions(sb([{ name: 'X', body: 'It moves unrestrained through the water.' }]))).toHaveLength(0);
  });

  it('reads the condition-immunities line as well as the actions', () => {
    const r = readConditions(sb([], { conditionImmunities: 'poisoned, paralyzed' }));
    expect(r.map((c) => c.to)).toEqual(expect.arrayContaining(['Sickened', 'Paralyzed']));
  });

  it('is stable, so re-running the generator is an upsert rather than a diff', () => {
    const a = readConditions(sb([{ name: 'X', body: 'prone, blinded, restrained' }]));
    const b = readConditions(sb([{ name: 'X', body: 'restrained, blinded, prone' }]));
    expect(a).toEqual(b);
  });

  it('maps only onto conditions IG actually publishes', () => {
    // A typo here would print a condition name that appears nowhere in the rules, which reads as
    // authoritative and cannot be looked up.
    for (const name of Object.values(IG_CONDITION_MAP)) {
      expect(isPublishedIgCondition(name), `${name} is not an IG condition`).toBe(true);
    }
  });

  it('never lists a condition as both mapped and missing', () => {
    for (const k of Object.keys(IG_CONDITION_MAP)) expect(IG_CONDITION_GAPS[k]).toBeUndefined();
  });
});

describe('stances — a reading of evidence, not a conversion', () => {
  it('reads Pack Tactics as the flanking stance', () => {
    const r = suggestStance(sb([{ name: 'Pack Tactics', body: 'It has advantage on an attack roll if an ally is within 5 feet.' }]));
    expect(r?.stance).toBe('Swarming');
    expect(r?.evidence).toMatch(/flanking/i);
  });

  it('prefers the more specific reading when two apply', () => {
    // A creature with both fights by flanking, but the PAYOFF is the sneak damage — and IG allows one
    // stance at a time, so returning both would misrepresent the mechanic while looking more helpful.
    const r = suggestStance(sb([
      { name: 'Pack Tactics', body: 'advantage when an ally is near' },
      { name: 'Sneak Attack', body: 'It deals an extra 7 (2d6) damage.' },
    ]));
    expect(r?.stance).toBe('Precise');
  });

  it('RETURNS NOTHING when the stat block offers no evidence', () => {
    // The most important assertion here. Most creatures get no stance, and that is the designed outcome:
    // 300 invented stances would tell a DM something false about a mechanic they act on every turn.
    expect(suggestStance(sb([{ name: 'Bite', body: 'Melee Weapon Attack: +4 to hit. Hit: 5 (1d6 + 2) piercing damage.' }]))).toBeNull();
    expect(suggestStance(sb([]))).toBeNull();
  });

  it('does not read a prepared SPELL as a fighting style', () => {
    // Measured against the real catalogue: a bare `shield` matched "fire shield" and "shield of faith"
    // sitting in slot lists, so an Archmage was read as fighting defensively because of what it had
    // prepared. Six of eight sampled Defensive matches were wrong before this was tightened.
    const archmage = sb([{ name: 'Spellcasting', body: '4th level (3 slots): banishment, fire shield, stoneskin' }]);
    expect(suggestStance(archmage)).toBeNull();
    // …while a real Parry still reads as Defensive.
    expect(suggestStance(sb([{ name: 'Parry', body: 'The captain adds 2 to its AC against one melee attack.' }]))?.stance).toBe('Defensive');
  });

  it('every stance and power it can emit is one IG publishes', () => {
    const refs = igReferencedNames();
    const stances = new Set(IG_STANCE_DEFS.map((s) => s.name));
    const powers = new Set(IG_DEFENSIVE_POWERS.map((d) => d.name));
    for (const s of refs.stances) expect(stances.has(s), `${s} is not an IG stance`).toBe(true);
    for (const p of refs.defensivePowers) expect(powers.has(p), `${p} is not an IG defensive power`).toBe(true);
  });
});

describe('defensive powers', () => {
  it('reads a riposte as Counterattack and damage reduction as Armor Skin', () => {
    expect(suggestDefensivePower(sb([{ name: 'Riposte', body: 'It strikes back.' }]))?.stance).toBe('Counterattack');
    expect(suggestDefensivePower(sb([], { resistances: 'bludgeoning from nonmagical attacks' }))?.stance).toBe('Armor Skin');
  });

  it('returns nothing for a creature with no defensive text', () => {
    expect(suggestDefensivePower(sb([{ name: 'Bite', body: 'It bites.' }]))).toBeNull();
  });
});

describe('the entries appended to a transposed creature', () => {
  const entries = igCreatureEntries(sb([
    { name: 'Pack Tactics', body: 'advantage when an ally is within 5 feet' },
    { name: 'Bite', body: 'the target is knocked prone and restrained' },
  ]));

  it('labels every derived line as a house reading', () => {
    // The same voice deriveVariant uses. A stance printed without it reads as a published rule.
    expect(entries.find((e) => e.name.startsWith('Stance:'))?.body).toContain(IG_HOUSE_READING);
  });

  it('carries the evidence, so a DM can check the suggestion rather than trust it', () => {
    expect(entries.find((e) => e.name.startsWith('Stance:'))?.body).toMatch(/Suggested because/);
  });

  it('quotes the published stance text rather than paraphrasing it', () => {
    const body = entries.find((e) => e.name === 'Stance: Swarming')!.body;
    const swarming = IG_STANCE_DEFS.find((s) => s.name === 'Swarming')!;
    expect(body).toContain(swarming.basic);
    expect(body).toContain(swarming.advanced);
  });

  it('emits ordinary trait entries, so they render and fork with no new machinery', () => {
    for (const e of entries) expect(e.kind).toBe('trait');
  });

  it('adds nothing at all to a creature with no evidence and no conditions', () => {
    expect(igCreatureEntries(sb([{ name: 'Slam', body: 'Melee Weapon Attack: +3 to hit.' }]))).toEqual([]);
  });
});
