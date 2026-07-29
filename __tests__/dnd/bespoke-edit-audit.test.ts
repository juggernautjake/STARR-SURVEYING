// __tests__/dnd/bespoke-edit-audit.test.ts — the bespoke sheets' edits reach the DM's review queue.
//
// THE DEFECT: `ig-edit` and `pf2-edit` — the routes the Intuitive Games and Pathfinder 2e sheets write
// every manual change through — inserted **no audit row at all**. So on those two systems a player could
// add a feat, add a power or spell, change an ability score, or add an attack, and the DM's review queue
// showed nothing. Content taken through the escape hatch was invisible too, which is precisely what that
// queue exists to surface.
//
// WHY IT IS A BUG AND NOT A GAP: the AI path already audits the same edits (`ai-edit` inserts `ig:<op>` /
// `pf2:<op>` rows). `ig-edit`'s own header argues the mirror case for the RULES gate — *"gating only the AI
// would make 'use the manual control instead' a way around the rules"* — and auditing only the AI makes the
// manual control a way around the review queue.
//
// WHY THE EARLIER SWEEP MISSED IT: the "every mechanical build path audits" pass covered `app/dnd/_sheet/`,
// the SHARED sheet. IG and PF2 have their own sheets and their own routes, and were never in scope.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAuditableBespokeEdit, bespokeFieldPath, PLAY_OPS } from '@/lib/dnd/audit/bespoke-ops';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const IG_ROUTE = read('app/api/dnd/characters/[id]/ig-edit/route.ts');
const PF2_ROUTE = read('app/api/dnd/characters/[id]/pf2-edit/route.ts');
const AI_ROUTE = read('app/api/dnd/characters/[id]/ai-edit/route.ts');

/** Every op the real edit union declares, read from the source so this cannot drift from it. */
function opsOf(file: string, typeName: string): string[] {
  const src = read(file);
  const start = src.indexOf(`export type ${typeName}`);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('\n\n', start);
  const body = src.slice(start, end === -1 ? undefined : end);
  return [...new Set([...body.matchAll(/op: '([a-z_0-9]+)'/g)].map((m) => m[1]))];
}

const IG_OPS = opsOf('lib/dnd/systems/intuitive-games/edit.ts', 'IGEdit');
const PF2_OPS = opsOf('lib/dnd/systems/pathfinder2e/edit.ts', 'PF2Edit');

describe('the op unions were read, not assumed', () => {
  it('found both, with the build ops that motivated this', () => {
    expect(IG_OPS).toEqual(expect.arrayContaining(['add_feat', 'add_power', 'set_ability', 'add_attack']));
    expect(PF2_OPS).toEqual(expect.arrayContaining(['add_feat', 'add_spell', 'set_attribute', 'add_attack']));
  });
});

describe('BUILD edits audit', () => {
  // The concrete ones from the defect: each of these changes what the character IS.
  const igBuild = ['add_feat', 'remove_feat', 'add_power', 'remove_power', 'set_ability', 'add_attack', 'update_attack', 'remove_attack', 'set_defensive_power', 'add_stance', 'update_power', 'update_feat'];
  const pf2Build = ['add_feat', 'remove_feat', 'add_spell', 'remove_spell', 'set_attribute', 'add_attack', 'update_attack', 'remove_attack', 'set_armor', 'update_spell', 'update_feat'];

  for (const op of igBuild) {
    it(`IG ${op}`, () => expect(isAuditableBespokeEdit('intuitive-games', op)).toBe(true));
  }
  for (const op of pf2Build) {
    it(`PF2 ${op}`, () => expect(isAuditableBespokeEdit('pathfinder2e', op)).toBe(true));
  }

  it('add_stance is BUILD even though a stance switch is play', () => {
    // The distinction that is easy to get wrong: `add_stance` grants a new stance to the character;
    // `set_active_stance` picks between the ones they already have.
    expect(isAuditableBespokeEdit('intuitive-games', 'add_stance')).toBe(true);
    expect(isAuditableBespokeEdit('intuitive-games', 'set_active_stance')).toBe(false);
  });
});

describe('PLAY edits stay out of the queue', () => {
  // The boundary the shared sheet settled: logging these would bury the build changes the queue exists for.
  for (const op of ['set_active_stance', 'clear_stance', 'add_condition', 'remove_condition', 'apply_damage', 'heal']) {
    it(`IG ${op}`, () => expect(isAuditableBespokeEdit('intuitive-games', op)).toBe(false));
  }
  for (const op of ['apply_damage', 'heal', 'set_temp_hp', 'set_condition', 'set_dying', 'set_wounded', 'set_hero_points', 'set_focus_points']) {
    it(`PF2 ${op}`, () => expect(isAuditableBespokeEdit('pathfinder2e', op)).toBe(false));
  }
});

describe('the classifier fails VISIBLE, not silent', () => {
  it('an op nobody has classified audits', () => {
    // Asymmetric costs: an unclassified play op is a filterable noisy row; an unclassified BUILD op is a
    // silent change to a character — the defect this module exists to close. So new ops are loud.
    expect(isAuditableBespokeEdit('intuitive-games', 'some_future_op')).toBe(true);
    expect(isAuditableBespokeEdit('pathfinder2e', 'some_future_op')).toBe(true);
  });

  it('an unrecognised system audits too', () => {
    expect(isAuditableBespokeEdit('dnd5e-2024', 'anything')).toBe(true);
    expect(isAuditableBespokeEdit('', 'anything')).toBe(true);
  });

  it('every name in a play set is a REAL op', () => {
    // A typo in a play set fails safe (that op would audit) but leaves a dead entry and a genuinely
    // play op logging forever. Catch it here rather than in the queue.
    for (const op of PLAY_OPS['intuitive-games']) expect(IG_OPS).toContain(op);
    for (const op of PLAY_OPS.pathfinder2e) expect(PF2_OPS).toContain(op);
  });
});

describe('one audit vocabulary, shared with the AI path', () => {
  it('field paths match the prefix ai-edit already writes', () => {
    expect(bespokeFieldPath('intuitive-games', 'add_power')).toBe('ig:add_power');
    expect(bespokeFieldPath('pathfinder2e', 'add_feat')).toBe('pf2:add_feat');
    // The AI route is the existing precedent these must not diverge from.
    expect(AI_ROUTE).toContain('field_path: `ig:${parsed.edit.op}`');
    expect(AI_ROUTE).toContain('field_path: `pf2:${parsed.edit.op}`');
  });
});

describe('both manual routes actually write the row', () => {
  for (const [name, route] of [['ig-edit', IG_ROUTE], ['pf2-edit', PF2_ROUTE]] as const) {
    it(`${name} inserts into dnd_sheet_edits, gated by the classifier`, () => {
      expect(route).toContain("from('dnd_sheet_edits').insert(");
      expect(route).toContain('isAuditableBespokeEdit(');
      expect(route).toContain('bespokeFieldPath(');
    });

    it(`${name} marks the row source 'manual'`, () => {
      // The column's CHECK constraint allows 'ai' | 'manual' | 'revert'; a hand edit is 'manual', which is
      // what distinguishes it from the AI's row in the DM's queue.
      expect(route).toContain("source: 'manual'");
    });

    it(`${name} audits AFTER the write succeeds, and cannot fail the edit`, () => {
      // Ordering: a row claiming a change that then failed to save is worse than no row. And the audit is
      // best-effort — the player's edit must not 500 because the queue insert did.
      const save = route.indexOf("from('dnd_characters')");
      const audit = route.indexOf("from('dnd_sheet_edits')");
      expect(save).toBeGreaterThan(-1);
      expect(audit).toBeGreaterThan(save);
      // The GUARANTEE is that the audit write has a rejection handler, so it can never fail the edit —
      // not that the handler is spelled `() => {}`. Pinning the empty literal failed the change that gave
      // these handlers a `console.error`, which STRENGTHENED the property: a swallowed audit failure is
      // how `library-grant` rows were rejected by a CHECK constraint for months without anyone noticing.
      // A test that forbids logging an error it is not allowed to throw is protecting the wrong thing.
      expect(route).toMatch(/\}\)\.then\(\(\) => \{\},\s*\(/);
    });

    it(`${name} describes the edit that was APPLIED, not the one requested`, () => {
      // The gate can alter an edit (off-rules marking); the queue should record what happened.
      expect(route).toMatch(/isAuditableBespokeEdit\('[a-z2-]+', gate\.edit\.op\)/);
    });
  }

  it('and both note off-rules content, which is the queue’s whole point', () => {
    expect(IG_ROUTE).toContain('off-rules:');
    expect(PF2_ROUTE).toContain('off-rules:');
  });
});
