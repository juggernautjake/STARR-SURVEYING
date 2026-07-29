// __tests__/dnd/party-overview.test.ts — the DM's at-a-glance party table (P3-7).
//
// The slice calls this "a new arrangement of existing data". True — but the arrangement is the hard part,
// because the systems do not share columns:
//   · 5e stores AC and derives passive Perception from a skill whose proficiency is a STRING enum.
//   · PF2 derives AC and has Perception as a first-class proficiency.
//   · **Intuitive Games has no armour class at all** — it has damage reduction, and no Perception.
//
// A table with a fixed "AC" column would print blanks for IG (reads as missing data) or a fabricated number
// (Ground Rule 3). So defence is a LABELLED value and the save columns are a union.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarizeMember, summarizeParty, partySaveKeys } from '@/lib/dnd/party-overview';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const dnd5e = (over: Record<string, unknown> = {}) => ({
  meta: { level: 5 },
  abilities: { str: 10, dex: 14, con: 14, int: 8, wis: 16, cha: 12 },
  saves: { str: { proficient: false, misc: 0 }, dex: { proficient: true, misc: 0 }, con: { proficient: false, misc: 0 }, int: { proficient: false, misc: 0 }, wis: { proficient: false, misc: 0 }, cha: { proficient: false, misc: 0 } },
  skills: { perception: { prof: 'proficient', misc: 0 } },
  combat: { ac: 17, maxHp: 40, currentHp: 31, conditions: ['Prone'] },
  ...over,
});

const pf2 = () => ({
  pf2e: {
    identity: { level: 5, className: 'Fighter' },
    attributes: { STR: 4, DEX: 2, CON: 3, INT: 0, WIS: 1, CHA: 0 },
    combat: {
      ancestryHp: 8, classHpPerLevel: 10, currentHp: 0, tempHp: 0, dyingValue: 0, woundedValue: 0,
      heroPoints: 1, speed: 25, armorRank: 'trained', acItemBonus: 2, dexCap: 3,
      conditions: [{ name: 'Frightened', value: 2 }, { name: 'Prone' }],
    },
    perception: { rank: 'expert' },
    saves: { Fortitude: { rank: 'expert' }, Reflex: { rank: 'trained' }, Will: { rank: 'trained' } },
  },
});

const ig = () => ({
  ig: {
    identity: { level: 4, className: 'Archon' },
    abilities: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    combat: {
      hitPoints: { classBackgroundHp: 30, nonlethal: 0, lethal: 5 },
      damageReduction: 3,
      saves: { Fortitude: { rank: 2, misc: 0 }, Reflex: { rank: 1, misc: 0 }, Will: { rank: 1, misc: 0 } },
      conditions: ['Shaken'],
    },
  },
});

describe('5e', () => {
  const m = summarizeMember({ id: '1', name: 'Vex', system: 'dnd5e-2024', data: dnd5e() });

  it('reports the stored AC, labelled', () => {
    expect(m.defense).toEqual({ label: 'AC', value: 17 });
  });

  it('derives passive Perception through the SHEET’s own proficiency helper', () => {
    // THE bug this test exists for. Skills store `{ prof: 'proficient' }`, a string — my first pass read
    // `.proficient` and `.expertise` as booleans, which reported every skilled character as unproficient.
    // Level 5 → PB 3; WIS 16 → +3. Passive = 10 + 3 + 3 = 16. Reading it as a boolean would give 13.
    expect(m.perception).toEqual({ label: 'Passive Perc', value: 16 });
  });

  it('and expertise doubles the bonus, as the sheet does', () => {
    const exp = summarizeMember({
      id: '1', name: 'V', system: 'dnd5e-2024',
      data: dnd5e({ skills: { perception: { prof: 'expertise', misc: 0 } } }),
    });
    expect(exp.perception?.value).toBe(19); // 10 + 3 (WIS) + 6 (2×PB)
  });

  it('has six saves, with proficiency applied from a BOOLEAN', () => {
    // Saves and skills use different shapes in the same character — `blank.ts` builds saves as
    // `{ proficient: false }` and skills as `{ prof: 'none' }`. Reading one shape for both is silently wrong.
    expect(m.saves.DEX).toBe(5); // +2 DEX, +3 PB
    expect(m.saves.WIS).toBe(3); // +3 WIS, not proficient
    expect(Object.keys(m.saves)).toHaveLength(6);
  });

  it('and carries HP and conditions', () => {
    expect(m.maxHp).toBe(40);
    expect(m.currentHp).toBe(31);
    expect(m.conditions).toEqual(['Prone']);
  });
});

describe('Pathfinder 2e', () => {
  const m = summarizeMember({ id: '2', name: 'Amiri', system: 'pathfinder2e', data: pf2() });

  it('derives AC rather than reading a stored one', () => {
    expect(m.defense?.label).toBe('AC');
    expect(m.defense?.value).toBeGreaterThan(10);
  });

  it('labels Perception as PF2 does — not "passive"', () => {
    // PF2 Perception is an active proficiency, not 5e's passive score. Calling it "Passive Perc" would be
    // one system's vocabulary printed over another's.
    expect(m.perception?.label).toBe('Perc');
  });

  it('has three saves, not six', () => {
    expect(Object.keys(m.saves).sort()).toEqual(['Fort', 'Ref', 'Will']);
  });

  it('renders conditions from an ARRAY of objects, with values', () => {
    // The other bug this file caught: PF2 conditions are `{ name, value? }[]`, not a record. Running
    // `Object.entries` over it iterates INDICES and prints "0 [object Object]" on a DM's screen — and it
    // typechecked, because the blob arrives as `unknown`.
    expect(m.conditions).toEqual(['Frightened 2', 'Prone']);
  });
});

describe('Intuitive Games — the system that breaks a fixed table', () => {
  const m = summarizeMember({ id: '3', name: 'Kesh', system: 'intuitive-games', data: ig() });

  it('reports DAMAGE REDUCTION, not a fabricated AC', () => {
    // IG has no to-hit target. A blank AC column reads as missing data; a derived one invents a rule.
    expect(m.defense).toEqual({ label: 'DR', value: 3 });
  });

  it('and has NO perception, rather than one invented from Wisdom', () => {
    expect(m.perception).toBeNull();
  });

  it('with three saves and its own conditions', () => {
    expect(Object.keys(m.saves).sort()).toEqual(['Fort', 'Ref', 'Will']);
    expect(m.conditions).toEqual(['Shaken']);
  });

  it('and HP that subtracts lethal damage', () => {
    expect(m.maxHp).toBeGreaterThan(0);
    expect(m.currentHp).toBe(m.maxHp! - 5);
  });
});

describe('a MIXED party', () => {
  const party = summarizeParty([
    { id: '1', name: 'Vex', system: 'dnd5e-2024', data: dnd5e() },
    { id: '2', name: 'Amiri', system: 'pathfinder2e', data: pf2() },
    { id: '3', name: 'Kesh', system: 'intuitive-games', data: ig() },
  ]);

  it('keeps the UNION of save columns, not the intersection', () => {
    // Intersecting would leave a lone 5e character showing none of their six saves just because a PF2
    // character joined the table.
    expect(partySaveKeys(party)).toEqual(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA', 'Fort', 'Ref', 'Will']);
  });

  it('and every member keeps only the saves their system has', () => {
    expect(party[0].saves.Fort).toBeUndefined();
    expect(party[1].saves.STR).toBeUndefined();
  });

  it('the column order is stable', () => {
    // A DM screen that reorders its columns between loads is unreadable.
    expect(partySaveKeys(party)).toEqual(partySaveKeys([...party].reverse()));
  });
});

describe('unbuilt and malformed characters', () => {
  it('an empty sheet reports nulls rather than zeroes', () => {
    // "AC 0" is a claim; "—" is the truth.
    const m = summarizeMember({ id: 'x', name: 'New', system: 'dnd5e-2024', data: {} });
    expect(m.defense).toBeNull();
    expect(m.maxHp).toBeNull();
  });

  it('a PF2 character with no sidecar degrades quietly', () => {
    const m = summarizeMember({ id: 'x', name: 'New', system: 'pathfinder2e', data: {} });
    expect(m.defense).toBeNull();
    expect(m.saves).toEqual({});
  });

  it('and nothing throws on junk', () => {
    for (const data of [null, undefined, 'nonsense', { pf2e: 'no' }, { ig: 42 }]) {
      expect(() => summarizeMember({ id: 'x', name: 'X', system: 'pathfinder2e', data })).not.toThrow();
    }
    expect(summarizeParty([])).toEqual([]);
  });
});

describe('the route', () => {
  const route = read('app/api/dnd/campaigns/[id]/party/route.ts');

  it('is DM-only', () => {
    expect(route).toContain("if (role !== 'dm')");
  });

  it('computes server-side, so no full sheet blob crosses the wire', () => {
    // A client-side version would ship every player's private notes, backstory and inventory to whoever
    // opened the page, to render a row of numbers.
    expect(route).toContain('summarizeParty(');
    expect(route, 'the raw rows must not be returned').not.toMatch(/NextResponse\.json\(\{[^}]*rows/);
  });

  it('uses the shared roster query and excludes NPCs', () => {
    expect(route).toContain('characterIdsInCampaign(params.id)');
    expect(route).toContain(".eq('is_npc', false)");
  });
});
