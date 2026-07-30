// __tests__/dnd/bestiary-import-pf2.test.ts — Foundry PF2e actor → creature row (B1-5).
//
// A SEPARATE TRANSFORM FROM THE 5e ONE, and these tests exist mostly to pin why. The two sources share no
// field paths at all, so pointing `srdCreatureToRow` at a Foundry actor yields a creature with no AC, no
// HP, no abilities and no actions — which it reports as a SUCCESSFUL import, because every field is
// optional. B1-3 paid for that lesson three times (`senses`, `saves`, `skills` absent on 334 of 334).
//
// The fixtures below are trimmed from the real `goblin-warrior.json` in the Foundry pf2e repo, not invented.
import { describe, it, expect } from 'vitest';
import { pf2ActorToRow, pf2IsRedistributable, pf2Licences } from '@/lib/dnd/bestiary/import-pf2';

const PROV = {
  source: 'Monster Core', licence: 'ORC',
  attribution: 'Pathfinder Monster Core © Paizo Inc., licensed under the ORC licence.',
  slugPrefix: 'pf2', system: 'pathfinder2e',
};

// `any` deliberately: this fixture stands in for arbitrary Foundry JSON, and typing it precisely would
// make the test assert TypeScript's inference rather than the transform's behaviour — the cases below
// mutate it into shapes a real pack contains (a stale OGL marker, a missing publication block).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const goblin = (): Record<string, any> => ({
  name: 'Goblin Warrior',
  type: 'npc',
  system: {
    abilities: { cha: { mod: 1 }, con: { mod: 1 }, dex: { mod: 3 }, int: { mod: 0 }, str: { mod: 0 }, wis: { mod: -1 } },
    attributes: { ac: { value: 16 }, hp: { max: 6 }, speed: { value: 25, otherSpeeds: [] } },
    details: {
      level: { value: -1 },
      languages: { value: ['goblin', 'common'] },
      publicNotes: '<p>The frontline fighters of goblin tribes.</p>',
    },
    perception: { mod: 2, senses: [{ type: 'darkvision' }] },
    saves: { fortitude: { value: 5 }, reflex: { value: 7 }, will: { value: 3 } },
    skills: { acrobatics: { base: 5 }, stealth: { base: 5 } },
    traits: { size: { value: 'sm' }, value: ['goblin', 'humanoid'] },
  },
  items: [
    {
      type: 'melee', name: 'Dogslicer',
      system: {
        bonus: { value: 7 },
        damageRolls: { ey6azuu: { damage: '1d6', damageType: 'slashing' } },
        traits: { value: ['agile', 'finesse'] },
        publication: { license: 'ORC' },
      },
    },
    {
      type: 'action', name: 'Goblin Scuttle',
      system: {
        actionType: { value: 'reaction' },
        description: { value: '<p><strong>Trigger</strong> An ally ends a move.</p><hr /><p>The goblin @UUID[Compendium.pf2e.actionspf2e.Item.Step]{Steps}.</p>' },
        publication: { license: 'ORC' },
      },
    },
  ],
});

describe('pf2ActorToRow — the numbers', () => {
  it('reads AC, HP and speed from their Foundry paths', () => {
    const s = pf2ActorToRow(goblin(), PROV)!.row.statblock;
    expect(s.ac).toBe(16);
    expect(s.hp).toBe(6);
    expect(s.speed).toBe('25 feet');
  });

  it('puts ability MODIFIERS in abilityMods, never in abilities', () => {
    // The inversion this guards against: writing a +3 modifier into `abilities` renders it as a SCORE of
    // 3 — a crippling weakness where the source states a strength.
    const s = pf2ActorToRow(goblin(), PROV)!.row.statblock;
    expect(s.abilities).toBeUndefined();
    expect(s.abilityMods).toEqual({ str: 0, dex: 3, con: 1, int: 0, wis: -1, cha: 1 });
  });

  it('KEEPS A NEGATIVE MODIFIER, which the score field would have dropped', () => {
    // `abilities` validates 1–99, so Wis −1 would silently vanish and read as "no Wisdom listed".
    expect(pf2ActorToRow(goblin(), PROV)!.row.statblock.abilityMods?.wis).toBe(-1);
  });

  it('carries a NEGATIVE LEVEL through as the tier, because PF2 really has those', () => {
    const r = pf2ActorToRow(goblin(), PROV)!;
    expect(r.row.cr).toBe('-1');
    expect(r.row.cr_sort).toBe(-1);
  });
});

describe('pf2ActorToRow — the printed lines', () => {
  it('prints the three saves in stat-block order', () => {
    expect(pf2ActorToRow(goblin(), PROV)!.row.statblock.saves).toBe('Fort +5, Ref +7, Will +3');
  });

  it('folds perception and senses into one line, as PF2 does', () => {
    expect(pf2ActorToRow(goblin(), PROV)!.row.statblock.senses).toBe('Perception +2; darkvision');
  });

  it('capitalises skills', () => {
    expect(pf2ActorToRow(goblin(), PROV)!.row.statblock.skills).toBe('Acrobatics +5, Stealth +5');
  });

  it('finds the creature type among traits that also list ancestry', () => {
    // ["goblin", "humanoid"] has no marker saying which is the type, so it is matched against the closed
    // list rather than taken by position.
    expect(pf2ActorToRow(goblin(), PROV)!.row.type).toBe('humanoid');
  });

  it('expands the two-letter size code', () => {
    expect(pf2ActorToRow(goblin(), PROV)!.row.size).toBe('Small');
  });
});

describe('pf2ActorToRow — strikes and actions', () => {
  it('turns a melee item into a rollable entry', () => {
    const e = pf2ActorToRow(goblin(), PROV)!.row.statblock.entries!.find((x) => x.name === 'Dogslicer')!;
    expect(e.toHit).toBe('+7');
    expect(e.damage).toBe('1d6 slashing');
  });

  it('joins several damage rolls — a bite that also poisons is one strike', () => {
    const a = goblin();
    a.items[0].system.damageRolls = {
      aaa: { damage: '1d6', damageType: 'piercing' }, bbb: { damage: '1d4', damageType: 'poison' },
    };
    const e = pf2ActorToRow(a, PROV)!.row.statblock.entries!.find((x) => x.name === 'Dogslicer')!;
    expect(e.damage).toBe('1d6 piercing plus 1d4 poison');
  });

  it('files a reaction as a reaction', () => {
    const e = pf2ActorToRow(goblin(), PROV)!.row.statblock.entries!.find((x) => x.name === 'Goblin Scuttle')!;
    expect(e.kind).toBe('reaction');
  });

  it('STRIPS FOUNDRY MARKUP, keeping the readable half of a @UUID reference', () => {
    // Left in, a stat block reads "@UUID[Compendium.pf2e.actionspf2e.Item.Step]{Steps}" at the table.
    const e = pf2ActorToRow(goblin(), PROV)!.row.statblock.entries!.find((x) => x.name === 'Goblin Scuttle')!;
    expect(e.body).toContain('Steps');
    expect(e.body).not.toContain('@UUID');
    expect(e.body).not.toContain('<p>');
  });

  it('strips HTML from the description too', () => {
    const d = pf2ActorToRow(goblin(), PROV)!.row.description!;
    expect(d).toBe('The frontline fighters of goblin tribes.');
  });
});

describe('pf2ActorToRow — what it refuses', () => {
  it('refuses a document that is not an npc', () => {
    expect(pf2ActorToRow({ ...goblin(), type: 'character' }, PROV)).toBeNull();
  });

  it('refuses a nameless actor rather than importing "Unnamed"', () => {
    expect(pf2ActorToRow({ ...goblin(), name: '' }, PROV)).toBeNull();
  });

  it('REFUSES AN ACTOR WITH NO ORC MARKING rather than guessing', () => {
    // Foundry ships several packs and they do not all carry the same terms.
    const a = goblin();
    a.items.forEach((i: any) => { i.system.publication.license = 'OGL'; });
    expect(pf2ActorToRow(a, PROV)).toBeNull();
  });

  it('refuses an actor that states no licence at all — unstated is unknown', () => {
    const a = goblin();
    a.items.forEach((i: any) => { delete i.system.publication; });
    expect(pf2ActorToRow(a, PROV)).toBeNull();
  });

  it('ACCEPTS A MIXED OGL/ORC ACTOR — a stale marker on one item does not un-license the creature', () => {
    // The real case: Halfling Street Watcher is Monster Core, but one of its six items was never re-marked
    // in the remaster. Reading only the FIRST item's licence refused it — and item order is an
    // implementation detail of the pack file, so which weapon came first decided whether it imported.
    const a = goblin();
    a.items[0].system.publication.license = 'OGL';   // ORC still present on the second item
    expect(pf2ActorToRow(a, PROV)).not.toBeNull();
  });

  it('collects every licence stated, not just the first', () => {
    const a = goblin();
    a.items[0].system.publication.license = 'OGL';
    expect(pf2Licences(a).sort()).toEqual(['OGL', 'ORC']);
    expect(pf2IsRedistributable(a)).toBe(true);
    expect(pf2IsRedistributable({ items: [] })).toBe(false);
  });
});
