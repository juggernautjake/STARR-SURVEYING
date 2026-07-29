// __tests__/dnd/pathbuilder-import.test.ts — bring a character over from Pathbuilder (P9-3, audit H-3).
//
// PF2 players are the least-served group here and almost all of them already have a character in
// Pathbuilder. A deterministic adapter is instant, costs nothing, and — unlike the AI ingestion path — can
// say exactly what it did and did not understand.
//
// THE THING THESE TESTS DEFEND IS THE REFUSAL TO GUESS. Pathbuilder's JSON has no published schema. Some
// of it is stable and obvious; some is not. So the adapter reads what it recognises, reports the rest in
// `unmapped`, and the tests below check both halves — including that it does NOT read the fields it
// deliberately left alone.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePathbuilder, describePathbuilderImport } from '@/lib/dnd/systems/pathfinder2e/pathbuilder';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** A Pathbuilder export, in the shape the app produces: `{ success, build: {...} }`. */
const doc = (over: Record<string, unknown> = {}) => ({
  success: true,
  build: {
    name: 'Vex Sallowmere',
    class: 'Cleric',
    level: 5,
    ancestry: 'Elf',
    heritage: 'Woodland Elf',
    background: 'Scholar',
    deity: 'Sarenrae',
    keyability: 'wis',
    abilities: { str: 10, dex: 14, con: 12, int: 12, wis: 18, cha: 8 },
    proficiencies: { religion: 4, medicine: 2, acrobatics: 0, perception: 4, fortitude: 4, heavy: 0 },
    languages: ['Common', 'Elven'],
    feats: [['Domain Initiate', null, 'Class Feat', 1], ['Fleet', null, 'Ancestry Feat', 1]],
    spellCasters: [{ name: 'Cleric', spells: [{ spellLevel: 1, list: ['Heal', 'Bless'] }] }],
    ...over,
  },
});

const parse = (input: unknown) => {
  const r = parsePathbuilder(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('the fields it does read', () => {
  const { picks } = parse(doc());

  it('identity comes across', () => {
    expect(picks.name).toBe('Vex Sallowmere');
    expect(picks.className).toBe('Cleric');
    expect(picks.level).toBe(5);
    expect(picks.ancestry).toBe('Elf');
    expect(picks.heritage).toBe('Woodland Elf');
    expect(picks.background).toBe('Scholar');
    expect(picks.deity).toBe('Sarenrae');
  });

  it('ABILITY SCORES BECOME MODIFIERS — the single most consequential line in the adapter', () => {
    // Pathbuilder stores 18; the builder wants +4. Importing the score as a modifier would produce a
    // character with a +22 to hit and a spell DC in the thirties, and it would look like a data problem
    // rather than a units problem.
    expect(picks.attributes).toEqual({ STR: 0, DEX: 2, CON: 1, INT: 1, WIS: 4, CHA: -1 });
  });

  it('the key attribute maps to the builder’s casing', () => {
    expect(picks.keyAttribute).toBe('WIS');
  });

  it('trained skills come from the proficiency map, above rank 0', () => {
    // Untrained (0) is not a skill you trained, and the non-skill entries in the same map — perception,
    // saves, armour categories — are not skills at all.
    expect(picks.trainedSkills).toEqual(['Medicine', 'Religion']);
  });

  it('FEATS ARE READ FROM ELEMENT 0 ONLY', () => {
    // Pathbuilder stores each feat as an ARRAY — ["Fleet", null, "Ancestry Feat", 1] — and the order of
    // everything after the name has not been stable across versions. Reading the level from element 3 and
    // attaching it to a slot would be exactly the guess this module exists not to make; the catalogue
    // re-derives the level anyway, and that answer is the correct one.
    expect(picks.feats).toEqual(['Domain Initiate', 'Fleet']);
  });

  it('spells are flattened across every caster block', () => {
    expect(picks.spells).toEqual(['Heal', 'Bless']);
  });

  it('and languages come across', () => {
    expect(picks.languages).toEqual(['Common', 'Elven']);
  });
});

describe('what it refuses to guess, and says so', () => {
  it('THE SUBCLASS IS NOT IMPORTED, on purpose', () => {
    // Pathbuilder stores it under a different key per class — `bloodline`, `instinct`, `doctrine` — and
    // reading the wrong one would set a Cleric's doctrine from a Barbarian field. Choosing it on the sheet
    // is one dropdown; a wrongly-set doctrine changes four proficiency tracks (see P5-10) and looks right.
    const { picks, notes } = parse(doc({ doctrine: 'warpriest', bloodline: 'draconic' }));
    expect(picks.subclass).toBeUndefined();
    expect(notes.join(' ')).toMatch(/Subclass .* is not imported/i);
  });

  it('every unread key is REPORTED rather than swallowed', () => {
    const { unmapped } = parse(doc({ pets: [], money: { gp: 12 }, equipment: [['Rope', 1]] }));
    expect(unmapped).toContain('pets');
    expect(unmapped).toContain('money');
    expect(unmapped).toContain('equipment');
    // …and a key it DID read is not listed as missed.
    expect(unmapped).not.toContain('abilities');
    expect(unmapped).not.toContain('feats');
  });

  it('and it notes that feats arrive by name', () => {
    expect(parse(doc()).notes.join(' ')).toMatch(/imported by NAME/i);
  });
});

describe('what it accepts and what it refuses', () => {
  it('takes the object or the JSON text', () => {
    expect(parse(JSON.stringify(doc())).picks.name).toBe('Vex Sallowmere');
  });

  it('accepts a bare build object, which people paste surprisingly often', () => {
    expect(parse(doc().build).picks.className).toBe('Cleric');
  });

  it('refuses a file with no build', () => {
    const r = parsePathbuilder({ success: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no "build" object/);
  });

  it('refuses non-JSON and non-objects with distinguishable messages', () => {
    const bad = (v: unknown) => { const r = parsePathbuilder(v); return r.ok ? null : r.error; };
    expect(bad('{ nope')).toMatch(/not valid JSON/);
    expect(bad('[1,2]')).toMatch(/must be a JSON object/);
    expect(bad(42)).toMatch(/must be a JSON object/);
  });

  it('survives a build full of junk without throwing', () => {
    const { picks } = parse({ build: { class: 'Fighter', abilities: 'nope', feats: 'nope', proficiencies: 7, languages: 3, level: 'x' } });
    expect(picks.className).toBe('Fighter');
    expect(picks.attributes).toBeUndefined();
    expect(picks.feats).toBeUndefined();
    expect(picks.level).toBeUndefined();
  });

  it('and clamps a level outside 1–20 rather than trusting it', () => {
    expect(parse(doc({ level: 99 })).picks.level).toBe(20);
    expect(parse(doc({ level: 0 })).picks.level).toBe(1);
  });
});

describe('the summary', () => {
  it('says what came across', () => {
    const s = describePathbuilderImport(parse(doc()));
    expect(s).toContain('level 5 Cleric');
    expect(s).toContain('Elf');
    expect(s).toContain('2 feats');
  });

  it('and does not claim anything for an empty build', () => {
    expect(describePathbuilderImport(parse({ build: {} }))).toBe('nothing recognisable');
  });
});

describe('the route', () => {
  const route = read('app/api/dnd/characters/import-pathbuilder/route.ts');

  it('requires a session and throttles', () => {
    expect(route).toContain("if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });");
    expect(route).toContain("enforceRateLimit('write', session.userId)");
  });

  it('ASSEMBLES THROUGH THE BUILDER, not by writing a sidecar', () => {
    // This is what makes an imported character indistinguishable from a built one: it picks up the
    // level-appropriate proficiency ranks (P5-10), the doctrine tracks, the HP formula and the Strike
    // ranks from the one place that owns them. An importer that hand-assembles a sidecar drifts.
    expect(route).toContain('assemblePF2VanillaCharacter(');
    expect(route).not.toContain('pf2e: {');
  });

  it('lands private, and in a campaign only if you are a member', () => {
    expect(route).toContain("visibility: 'private',");
    expect(route).toMatch(/getCampaignRole\(campaignId\)\) === null/);
  });

  it('and RETURNS what it could not map', () => {
    // The whole advantage of a deterministic importer over the AI one is that it can say what it missed.
    expect(route).toContain('notes,');
    expect(route).toContain('unmapped,');
  });

  it('is a third, distinct import route', () => {
    expect(read('app/api/dnd/characters/import/route.ts')).toContain('formData');       // AI uploads
    expect(read('app/api/dnd/characters/import-json/route.ts')).toContain('parseCharacterExport'); // our own
    expect(route).toContain('parsePathbuilder');
  });
});

describe('AND IT HAS A DOOR', () => {
  const ui = read('app/dnd/_ui/ImportCharacterJsonButton.tsx');

  it('the existing import button picks the route from the FILE', () => {
    // Not a second button. A Pathbuilder export is recognisable on sight, and asking the player to
    // classify their own file is asking them to know something we can just look at.
    expect(ui).toContain("'/api/dnd/characters/import-pathbuilder'");
    expect(ui).toMatch(/"build"\\s\*:\\s\*\\\{/);
  });

  it('and shows the caveats, rather than hiding them', () => {
    expect(ui).toContain('j.unmapped');
    expect(ui).toContain('setDetail(caveats)');
  });
});
