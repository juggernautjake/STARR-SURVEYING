// __tests__/dnd/character-import-json.test.ts — reading back the loss-less export (P9-1, audit H-1).
//
// The export has always claimed "literally everything on them". Nothing read it back, so the claim had
// never been tested against anything — it was verified only by people looking at the file.
//
// THE ROUND-TRIP TEST IS THE POINT. export → parse → deep-equal is simultaneously the import's correctness
// test and the strongest guard the EXPORT has ever had: if a field stops surviving the trip, it fails here
// rather than being discovered by someone restoring a character they had already deleted.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { characterToJson, type CharacterExport } from '@/lib/dnd/export/character-export';
import { parseCharacterExport, ROUND_TRIP_FIELDS, MAX_IMPORT_BYTES } from '@/lib/dnd/export/character-import';
import { blankCharacter, normalizeCharacter } from '@/app/dnd/_sheet/data/blank';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** A character with every awkward shape a real sheet contains: nested sidecars, arrays of objects,
 *  numeric zero, an empty string, `null`, a deep nesting, and a non-ASCII name. */
function richCharacter(): CharacterExport {
  const base = blankCharacter('Vex Sallowmere');
  return {
    name: 'Vex Sallowmere',
    system: 'pathfinder2e',
    sheet_type: 'default',
    bio: { pronouns: 'they/them', notes: 'Ate the map.', age: 0 },
    updatedAt: '2026-07-29T12:00:00.000Z',
    data: {
      ...base,
      pf2e: {
        identity: { name: 'Vex Sallowmere', level: 13, className: 'Cleric', subclass: 'Warpriest' },
        saves: { Fortitude: { rank: 'master', itemBonus: 0 }, Reflex: { rank: 'expert', itemBonus: 2 } },
        inventory: [
          { id: 'a', name: 'Rope', quantity: 0, bulk: 'L', location: 'stowed' },
          { id: 'b', name: 'Katana', quantity: 1, bulk: '1', invested: false },
        ],
        currencies: [{ abbrev: 'gp', amount: 42 }],
      },
      meta: { ...base.meta, name: 'Vex Sallowmere', notes: '' },
      deep: { a: { b: { c: [1, 2, { d: null }] } } },
    },
  };
}

describe('THE ROUND TRIP — export, read back, and get the same character', () => {
  const original = richCharacter();
  const json = characterToJson(original);
  const parsed = parseCharacterExport(json);

  it('parses its own export', () => {
    expect(parsed.ok).toBe(true);
  });

  it('and every field the export writes comes back identical', () => {
    if (!parsed.ok) throw new Error('did not parse');
    expect(parsed.value.name).toBe(original.name);
    expect(parsed.value.system).toBe(original.system);
    expect(parsed.value.sheet_type).toBe(original.sheet_type);
    expect(parsed.value.bio).toEqual(original.bio);
    expect(parsed.value.exportedUpdatedAt).toBe(original.updatedAt);
  });

  it('THE SHEET DATA IS DEEP-EQUAL, including zeros, empty strings and nulls', () => {
    // The values most likely to be lost by a helpful normaliser: `quantity: 0`, `invested: false`,
    // `notes: ''`, `age: 0`, and a `null` five levels down.
    if (!parsed.ok) throw new Error('did not parse');
    expect(parsed.value.data).toEqual(original.data);
    const pf2 = (parsed.value.data as Record<string, any>).pf2e;
    expect(pf2.inventory[0].quantity).toBe(0);
    expect(pf2.inventory[1].invested).toBe(false);
    expect((parsed.value.data as Record<string, any>).deep.a.b.c[2].d).toBeNull();
  });

  it('and survives being handed the OBJECT rather than the text', () => {
    // A caller has one or the other depending on whether the user pasted or uploaded. Making each caller
    // remember to JSON.parse first is how one of them ends up not doing it.
    const viaObject = parseCharacterExport(JSON.parse(json));
    expect(viaObject).toEqual(parsed);
  });

  it('a SECOND round trip is byte-identical to the first', () => {
    // The real guard against a normaliser that is merely idempotent-looking: re-exporting what we just
    // imported must produce the same document, or a character degrades a little with every backup.
    if (!parsed.ok) throw new Error('did not parse');
    const again = characterToJson({
      name: parsed.value.name,
      system: parsed.value.system,
      sheet_type: parsed.value.sheet_type,
      bio: parsed.value.bio,
      data: parsed.value.data,
      updatedAt: parsed.value.exportedUpdatedAt,
    });
    expect(again).toBe(json);
  });

  it('and the round-trip field list matches what the export actually writes', () => {
    // ROUND_TRIP_FIELDS exists so the omission of artSrc/tokenSrc is a recorded DECISION rather than
    // something someone forgot: they are the HTML path's inlined images and characterToJson never emits
    // them. If the export grows a field, this fails until the list is updated to say so.
    const written = Object.keys(JSON.parse(json)).sort();
    expect(written).toEqual([...ROUND_TRIP_FIELDS].sort());
  });
});

describe('a blank character of every shape survives too', () => {
  it('round-trips a freshly made sheet without normalisation drift', () => {
    const data = blankCharacter('Nobody');
    const json = characterToJson({ name: 'Nobody', system: 'dnd5e-2024', sheet_type: 'default', data, updatedAt: null });
    const p = parseCharacterExport(json);
    if (!p.ok) throw new Error(p.error);
    expect(p.value.data).toEqual(JSON.parse(JSON.stringify(data)));
    // …and normalising it (which the route does before insert) does not change it either, so a restored
    // blank sheet is the same sheet.
    expect(normalizeCharacter(p.value.data)).toEqual(normalizeCharacter(data));
  });
});

describe('what it refuses, and why the messages differ', () => {
  const bad = (input: unknown) => {
    const r = parseCharacterExport(input);
    return r.ok ? null : r.error;
  };

  it('not JSON at all', () => {
    expect(bad('{ nope')).toMatch(/not valid JSON/);
  });

  it('valid JSON that is not an object', () => {
    expect(bad('[1,2,3]')).toMatch(/must be a JSON object/);
    expect(bad('"hello"')).toMatch(/must be a JSON object/);
    expect(bad('null')).toMatch(/must be a JSON object/);
  });

  it('no name', () => {
    expect(bad({ data: {} })).toMatch(/no character name/);
    expect(bad({ name: '   ', data: {} })).toMatch(/no character name/);
  });

  it('MISSING data and DAMAGED data are different errors', () => {
    // They mean different things to whoever is holding the file: one is "wrong file", the other is
    // "your file is broken". Collapsing them sends someone hunting for the wrong problem.
    expect(bad({ name: 'V' })).toMatch(/no character data/);
    expect(bad({ name: 'V', data: 'a sheet, honest' })).toMatch(/damaged/);
    expect(bad({ name: 'V', data: [1, 2] })).toMatch(/damaged/);
    expect(bad({ name: 'V', data: null })).toMatch(/damaged/);
  });

  it('and an oversized document is refused before it is parsed', () => {
    expect(bad('x'.repeat(MAX_IMPORT_BYTES + 1))).toMatch(/too large/);
  });
});

describe('what it normalises rather than trusts', () => {
  it('the SYSTEM goes through normalizeSystem, so an import cannot invent one', () => {
    const r = parseCharacterExport({ name: 'V', system: 'not-a-game', data: {} });
    if (!r.ok) throw new Error(r.error);
    // Whatever the fallback is, it must be a system the rest of the app believes in — never the raw string.
    expect(r.value.system).not.toBe('not-a-game');
    expect(r.value.system).toBeTruthy();
  });

  it('a null system (an older export) still lands somewhere valid', () => {
    const r = parseCharacterExport({ name: 'V', system: null, data: {} });
    expect(r.ok && typeof r.value.system === 'string' && r.value.system.length > 0).toBe(true);
  });

  it('an unknown sheet_type falls back to default rather than rendering nothing', () => {
    const r = parseCharacterExport({ name: 'V', sheet_type: '   ', data: {} });
    expect(r.ok && r.value.sheet_type).toBe('default');
  });

  it('a non-object bio is dropped rather than stored', () => {
    const r = parseCharacterExport({ name: 'V', bio: 'a string', data: {} });
    expect(r.ok && r.value.bio).toBeNull();
  });

  it('and an absurd name is truncated, not rejected', () => {
    // Rejecting it would lose the whole character over a field the user can fix in two seconds afterwards.
    const r = parseCharacterExport({ name: 'V'.repeat(5000), data: {} });
    expect(r.ok && r.value.name.length).toBe(200);
  });
});

describe('the route', () => {
  const route = read('app/api/dnd/characters/import-json/route.ts');

  it('requires a session and throttles writes', () => {
    expect(route).toContain("if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });");
    expect(route).toContain("enforceRateLimit('write', session.userId)");
  });

  it('a campaign is OPTIONAL, and membership is checked when one is given', () => {
    // Restoring a backup when the campaign it belonged to is gone has to work, or the backup is useless
    // in the one situation you actually need it.
    expect(route).toMatch(/getCampaignRole\(campaignId\)\) === null/);
    expect(route).toContain('campaign_id: campaignId,');
  });

  it('normalises the sheet before insert', () => {
    expect(route).toContain('normalizeCharacter(doc.data)');
  });

  it('lands PRIVATE, whatever the file said', () => {
    expect(route).toContain("visibility: 'private',");
  });

  it('and never writes the export’s timestamp to the row', () => {
    // `updated_at` must say when this row was written. A restore claiming last March sorts wrong in every
    // list the user has.
    expect(route).not.toMatch(/updated_at:/);
    expect(route).toContain('exportedAt: doc.exportedUpdatedAt');
  });

  it('is a DIFFERENT route from the AI upload importer, which still exists', () => {
    // The names are one hyphen apart on purpose-adjacent paths; conflating them is how this ends up
    // routing a perfect backup through a model again.
    expect(read('app/api/dnd/characters/import/route.ts')).toContain('formData');
    expect(route).not.toContain('formData');
  });
});

describe('AND IT HAS A DOOR — the defect this audit keeps finding', () => {
  const button = read('app/dnd/_ui/ImportCharacterJsonButton.tsx');
  const hub = read('app/dnd/characters/page.tsx');

  it('the characters hub mounts the import button', () => {
    // Four times in this audit the engine worked and nothing could reach it. An import route with no
    // button is that defect exactly, and it would be invisible to every test above.
    expect(hub).toContain('<ImportCharacterJsonButton />');
    expect(hub).toContain("from '@/app/dnd/_ui/ImportCharacterJsonButton'");
  });

  it('it posts to the JSON route, not the AI upload one', () => {
    expect(button).toContain("'/api/dnd/characters/import-json'");
    expect(button).not.toMatch(/'\/api\/dnd\/characters\/import'/);
  });

  it('shows the server’s own message rather than flattening it', () => {
    // The route distinguishes "not a character export" from "damaged". Collapsing both into
    // "Import failed" sends someone hunting for the wrong problem.
    expect(button).toContain('setMsg(j.error ?? ');
  });

  it('and clears the file input, so picking the same file twice works', () => {
    // Without this the second pick fires no change event and the button looks dead — the classic
    // file-input bug, and one nobody reports because it looks like nothing happened.
    expect(button).toContain('input.current.value = ');
  });
});
