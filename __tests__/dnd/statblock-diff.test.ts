// __tests__/dnd/statblock-diff.test.ts — "all differences in the variant stat block should be noted" (N3-5).
//
// The owner's requirement is a DIFF, and a diff has two ways to fail that both look fine on screen: it can
// miss a change (the block a DM is running differs from what the page says) or invent one (noise that
// buries the three lines that matter). Both are asserted here.
//
// The surrounding UI is pinned too, because a correct diff nothing renders is this repo's most common
// defect and the page it replaced was a stack of collapsed <details> nobody opened.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { diffStatblocks } from '@/lib/dnd/statblocks/diff';
import { deriveVariant } from '@/lib/dnd/bestiary/variants';
import type { Statblock } from '@/lib/dnd/homebrew/statblock';

const page = readFileSync(join(process.cwd(), 'app/dnd/bestiary/[slug]/page.tsx'), 'utf8');
// Comments stripped for the negative assertions, the same guard bestiary-schema.test.ts uses — and it
// caught this file immediately: the comment explaining that the carousel REPLACED a stack of collapsed
// `<details>` matched the assertion that no `<details>` remains.
const pageCode = page.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const carousel = readFileSync(join(process.cwd(), 'app/dnd/_ui/bestiary/VariantCarousel.tsx'), 'utf8');

const base: Statblock = {
  ac: 15,
  hp: 45,
  speed: '30 ft.',
  abilities: { str: 16, dex: 12 },
  saves: 'DEX +5, CON +6',
  entries: [
    { kind: 'action', name: 'Bite', body: 'Melee attack.', toHit: '+7', damage: '2d6 + 4 piercing' },
    { kind: 'trait', name: 'Keen Smell', body: 'Advantage on smell checks.' },
  ],
};

const by = (ds: ReturnType<typeof diffStatblocks>, key: string) => ds.find((d) => d.key === key);

describe('the diff reports what moved, and only what moved', () => {
  it('says nothing about an identical block', () => {
    expect(diffStatblocks(base, { ...base })).toEqual([]);
  });

  it('does not report unchanged fields alongside changed ones', () => {
    // A diff padded with unchanged rows is just the stat block again, which the reader has directly above.
    const ds = diffStatblocks(base, { ...base, ac: 17 });
    expect(ds).toHaveLength(1);
    expect(ds[0].key).toBe('ac');
    expect(ds[0].from).toBe('15');
    expect(ds[0].to).toBe('17');
  });

  it('scores the direction of a number, so "harder" and "weaker" are visible at a glance', () => {
    expect(by(diffStatblocks(base, { ...base, ac: 17 }), 'ac')!.direction).toBe('up');
    expect(by(diffStatblocks(base, { ...base, hp: 30 }), 'hp')!.direction).toBe('down');
  });

  it('reads signed modifiers as numbers — the form the game is actually written in', () => {
    // `shiftModifiers` produces exactly these, and calling "+7 → +9" merely "changed" would drop the one
    // thing a DM is reading the diff for.
    const v = { ...base, entries: [{ ...base.entries![0], toHit: '+9' }, base.entries![1]] };
    const d = by(diffStatblocks(base, v), 'entry.bite.toHit')!;
    expect(d.direction).toBe('up');
    expect(d.label).toBe('Bite — to hit');
  });

  it('refuses to score a multi-number string, rather than judging it on its first number', () => {
    // "DEX +5, CON +6" → "DEX +7, CON +8" has no single direction.
    const d = by(diffStatblocks(base, { ...base, saves: 'DEX +7, CON +8' }), 'saves')!;
    expect(d.direction).toBe('changed');
  });

  it('distinguishes absent from zero, on both sides', () => {
    // `null` means the field is not there; "0" means someone wrote a zero. A diff that conflated them
    // would report an AC of 0 for a creature that simply has none.
    const added = by(diffStatblocks({ hp: 5 }, { hp: 5, ac: 0 }), 'ac')!;
    expect(added.from).toBe(null);
    expect(added.to).toBe('0');
    const removed = by(diffStatblocks({ hp: 5, ac: 12 }, { hp: 5 }), 'ac')!;
    expect(removed.from).toBe('12');
    expect(removed.to).toBe(null);
  });

  it('compares scores and modifiers separately — "+3" and "16" are not the same claim', () => {
    const ds = diffStatblocks({ abilities: { str: 16 } }, { abilityMods: { str: 3 } });
    expect(by(ds, 'abilities.str')!.to).toBe(null);
    expect(by(ds, 'abilityMods.str')!.from).toBe(null);
  });

  it('matches entries by NAME, so an inserted trait does not report the whole action list as changed', () => {
    const withExtra: Statblock = {
      ...base,
      entries: [
        { kind: 'trait', name: 'Pack Tactics', body: 'New trait.' },
        ...base.entries!,
      ],
    };
    const ds = diffStatblocks(base, withExtra);
    // Exactly one row: the addition. Index-matching would have reported Bite and Keen Smell as changed too.
    expect(ds).toHaveLength(1);
    expect(ds[0].label).toBe('Pack Tactics');
    expect(ds[0].from).toBe(null);
  });

  it('reports a removed entry as removed, not as a change to nothing', () => {
    const ds = diffStatblocks(base, { ...base, entries: [base.entries![0]] });
    expect(ds).toHaveLength(1);
    expect(ds[0].label).toBe('Keen Smell');
    expect(ds[0].to).toBe(null);
  });

  it('never mutates either side', () => {
    const a = JSON.parse(JSON.stringify(base));
    const b = JSON.parse(JSON.stringify({ ...base, ac: 20 }));
    diffStatblocks(a, b);
    expect(a).toEqual(base);
    expect(b.ac).toBe(20);
  });
});

describe('against the variants the database actually holds', () => {
  const creature = { name: 'Owlbear', system: 'dnd5e-2014', cr: '3', type: 'monstrosity', size: 'Large', statblock: base };

  it('an Elite variant reports the AC, HP and to-hit the formula moved', () => {
    const elite = deriveVariant(creature, 'elite', 'boss-tier')!;
    const ds = diffStatblocks(base, elite.statblock);
    expect(by(ds, 'ac')!.direction).toBe('up');
    expect(by(ds, 'hp')!.direction).toBe('up');
    expect(by(ds, 'entry.bite.toHit')!.direction).toBe('up');
  });

  it('drops hit dice that no longer describe the hit points', () => {
    // Caught on the page, not here: the Elite Balor rendered "Hit Points 374 (26d12+130)", and
    // 26d12+130 averages 299 — the BASE's total. The block contradicted itself in the one place a DM
    // rolls from, and it had been doing so for all 4,378 stored variants.
    //
    // DROPPED rather than recomputed, the same call deriveNativeStatblock makes: a die expression
    // averaging the new total has several equally defensible answers, and printing one states a
    // creature's constitution as a fact. A missing line reads as missing; a wrong one reads as true.
    const withDice: Statblock = { ...base, hitDice: '6d10 + 12' };
    const elite = deriveVariant({ ...creature, statblock: withDice }, 'elite', 'boss-tier')!;
    expect(elite.statblock.hp).not.toBe(withDice.hp);
    expect(elite.statblock.hitDice).toBeUndefined();
    expect(elite.notes.join(' ')).toMatch(/hit dice were dropped/i);
    // And the diff SAYS so, rather than the line quietly vanishing between two blocks.
    const d = by(diffStatblocks(withDice, elite.statblock), 'hitDice')!;
    expect(d.from).toBe('6d10 + 12');
    expect(d.to).toBe(null);
  });

  it('leaves hit dice alone when there are no hit points to change', () => {
    // The dice still describe whatever they described; nothing moved, so nothing is invented or removed.
    const noHp: Statblock = { ac: 12, hitDice: '2d8' };
    const elite = deriveVariant({ ...creature, statblock: noHp }, 'elite', 'boss-tier')!;
    expect(elite.statblock.hitDice).toBe('2d8');
  });

  it('a Weak variant reports them moving the other way', () => {
    const weak = deriveVariant(creature, 'weak', 'boss-tier')!;
    const ds = diffStatblocks(base, weak.statblock);
    for (const k of ['ac', 'hp', 'entry.bite.toHit']) expect(by(ds, k)!.direction, k).toBe('down');
  });

  it('reports what the derivation SENTENCE does not — the PF2 DC that never shifted', () => {
    // The Pathfinder adjustment's sentence claims it shifts "AC, attacks, DCs and saves". `deriveVariant`
    // shifts AC, saves, skills and each entry's toHit; a DC written inside an action's PROSE is untouched.
    // Quoting the sentence repeats a promise the data does not keep — comparing the blocks tells the
    // truth, which is the whole reason this is computed rather than reprinted.
    const pf2Base: Statblock = {
      ac: 16, hp: 20, saves: 'Fort +8, Ref +5, Will +6',
      entries: [{ kind: 'action', name: 'Spray Musk', body: 'Each creature must attempt a DC 16 Fortitude save.' }],
    };
    const elite = deriveVariant({ ...creature, system: 'pathfinder2e', statblock: pf2Base }, 'elite', 'boss-tier')!;
    expect(elite.derivation).toMatch(/DCs/);
    const ds = diffStatblocks(pf2Base, elite.statblock);
    expect(by(ds, 'ac')!.direction).toBe('up');
    expect(by(ds, 'saves')).toBeTruthy();
    // The claim the sentence makes and the data does not honour. Asserted so the day someone fixes
    // `deriveVariant` to shift prose DCs, this test says exactly what changed.
    expect(by(ds, 'entry.spray musk.body')).toBeUndefined();
  });
});

describe('the carousel replaced the collapsed list', () => {
  it('is a carousel of every version, base included', () => {
    // The base is the thing every other card is a difference FROM; a carousel without it is a comparison
    // with one side missing.
    expect(carousel).toMatch(/role="tablist"/);
    expect(carousel).toMatch(/id: '__base__'/);
  });

  it('opens on a VARIANT, because the lens already renders the base directly above', () => {
    // Otherwise the page stacks two near-identical stat blocks and the panel reads as a rendering bug.
    // The base card stays — it is the anchor every diff is measured from — it is just not the default.
    expect(carousel).toMatch(/useState\(variants\.length > 0 \? 1 : 0\)/);
  });

  it('computes the differences rather than quoting the derivation sentence', () => {
    expect(carousel).toMatch(/diffStatblocks\(baseStatblock, current\.statblock\)/);
    // The sentence stays, UNDER the measured list — it carries provenance ("a house formula, not an
    // official rule") that a diff cannot express.
    expect(carousel).toMatch(/current\.derivation/);
  });

  it('says so when a variant is identical, instead of rendering an empty box', () => {
    // A creature with no AC and no HP to shift produces a real row and no differences.
    expect(carousel).toMatch(/Identical to \$\{baseName\}/);
    expect(carousel).toMatch(/diffs\.length === 0/);
  });

  it('the page no longer stacks collapsed <details> nobody opened', () => {
    expect(page).toMatch(/<VariantCarousel/);
    expect(pageCode).not.toMatch(/<details/);
    // And the statblock import it needed is gone rather than left orphaned.
    expect(pageCode).not.toMatch(/import CreatureStatblock/);
  });
});
