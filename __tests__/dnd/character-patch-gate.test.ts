// __tests__/dnd/character-patch-gate.test.ts — the write gate every in-place sheet editor goes through.
//
// `PATCH /api/dnd/characters/[id]` is the single route the shared sheet's autosave writes to, so it is the
// permission boundary for the whole Slice-20 in-place editing surface: every ability score, AC, HP, save DC,
// speed, level, skill toggle, feat/spell pick, inventory change and deletion ends up here.
//
// **It had no test.** The DELETE half of this file is covered by `character-delete.test.ts`; the PATCH half
// — the half that runs on every keystroke-committed edit — was not, which is precisely the gap the rules
// platform doc left open ("the per-field-editor permission tests land with Slice 20's editor UI"). Slice 20
// shipped; the tests did not follow it.
//
// The properties below are the ones whose regression would be damaging and silent. The whitelist one
// especially: `WRITABLE` is what stands between a sheet edit and a request that rewrites who OWNS the
// character, and nothing but a reader's care currently keeps a new field out of it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/route.ts'), 'utf8');

/** The `WRITABLE` array as the route actually declares it. Parsed rather than restated so this suite
 *  cannot drift from the source it is guarding — a hand-copied list would pass forever after a divergence. */
function writableFields(): string[] {
  const m = ROUTE.match(/const WRITABLE = \[([\s\S]*?)\] as const;/);
  if (!m) throw new Error('WRITABLE not found — the route was restructured; re-derive this guard.');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('PATCH refuses a caller who cannot write', () => {
  it('403s on `canWrite` rather than on ownership', () => {
    // Deliberately NOT `isOwner`: a DM and an assigned player must be able to edit a sheet. That is the
    // difference between this and DELETE below, and getting it backwards breaks either security or play.
    expect(ROUTE).toMatch(/if \(!res\.access\.canWrite\) \{[\s\S]{0,140}status: 403/);
  });

  it('checks access BEFORE reading the body, so an unreadable payload cannot skip the gate', () => {
    const gate = ROUTE.indexOf('!res.access.canWrite');
    const parse = ROUTE.indexOf('await req.json()', ROUTE.indexOf('export async function PATCH'));
    expect(gate).toBeGreaterThan(0);
    expect(parse).toBeGreaterThan(gate);
  });

  it('DELETE stays stricter than PATCH — owner only, because it is irreversible', () => {
    // A DM can edit your character; a DM must not be able to erase it.
    expect(ROUTE).toMatch(/if \(!res\.access\.isOwner\) \{[\s\S]{0,140}status: 403/);
  });
});

describe('the writable whitelist is the real boundary', () => {
  it('only whitelisted keys are copied out of the body', () => {
    // The loop is what makes an unknown key inert. A spread of `body` here would be the whole gate gone.
    expect(ROUTE).toMatch(/for \(const key of WRITABLE\) \{\s*if \(key in body\) patch\[key\] = body\[key\]/);
    expect(ROUTE).not.toMatch(/\.\.\.body/);
  });

  it('carries no identity, ownership or audit column', () => {
    // The damaging regression: adding one of these to WRITABLE would let anyone with write access — a DM,
    // or an assigned player — hand themselves the character, or forge its history. Each is listed so the
    // failure names the field rather than just a count.
    const forbidden = [
      'id', 'user_id', 'owner_user_id', 'created_at', 'campaign_id',
      'is_npc',            // derived from roster_role by the route itself; settable = the two can diverge
      'system',            // the rulebook the whole sheet is validated against
    ];
    const writable = writableFields();
    for (const f of forbidden) expect(writable).not.toContain(f);
  });

  it('still carries the fields the sheet actually saves, so this guard cannot pass by emptying the list', () => {
    const writable = writableFields();
    expect(writable).toContain('data');   // the whole sheet state — every in-place edit
    expect(writable).toContain('name');
    expect(writable).toContain('visibility');
  });

  it('refuses a body with nothing writable in it instead of writing an empty patch', () => {
    expect(ROUTE).toMatch(/if \(Object\.keys\(patch\)\.length === 0\) \{[\s\S]{0,140}status: 400/);
  });
});

describe('the fields that need MORE than write access', () => {
  it('reassigning who plays the character is owner/DM only', () => {
    // `canWrite` includes the assigned player; that player must not be able to pass the character on.
    expect(ROUTE).toMatch(/if \('played_by_user_id' in patch\) \{[\s\S]{0,260}!res\.access\.isOwner && !res\.access\.isDM[\s\S]{0,160}status: 403/);
  });

  it('and the new player must already be in the character’s campaign', () => {
    // Otherwise a character could be pushed onto a stranger — the same property `join-character` protects.
    expect(ROUTE).toContain('campaignsForCharacter');
    expect(ROUTE).toMatch(/not a member of this character[’']s campaign[\s\S]{0,60}status: 400/);
  });
});

describe('validation on the fields a UI can set', () => {
  it('rejects an empty name rather than storing one', () => {
    expect(ROUTE).toMatch(/'name' in patch && !String\(patch\.name \?\? ''\)\.trim\(\)/);
  });

  it('constrains visibility to the three real values', () => {
    expect(ROUTE).toMatch(/\['private', 'campaign', 'public'\]\.includes/);
  });

  it('validates roster_role through the shared predicate, not an inline list', () => {
    expect(ROUTE).toContain('isRosterRole(rr)');
    // Keeping is_npc in step is the reason is_npc is NOT itself writable (above).
    expect(ROUTE).toContain('patch.is_npc = rr !== \'pc\'');
  });

  it('refuses a sheet style the browser is not allowed to pick', () => {
    // `custom` is AI-only; an arbitrary string would render nothing.
    expect(ROUTE).toContain('isSelectableSheetStyle(patch.sheet_type)');
  });
});
