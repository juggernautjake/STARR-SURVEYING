// The effects editor (P6-9) — the field that turns homebrew prose into numbers a sheet resolves.
//
// `lib/dnd/effects/targets.ts` calls itself "a contract, not a list": the picker, the AI tool schema, the
// ledger's resolver and the star tooltips are all generated from it, precisely so a hand-written menu can
// never leave a capability unreachable. These assertions hold the Studio's picker to that.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EFFECT_TARGETS, TARGET_GROUPS, TARGET_GROUP_LABELS, targetsInGroup, findTarget,
  isOperationAllowed, validateEffect,
} from '@/lib/dnd/effects/targets';
import { fieldsForKind } from '@/lib/dnd/homebrew/kinds';
import { HOMEBREW_KINDS } from '@/lib/dnd/homebrew/model';

const builder = readFileSync(join(process.cwd(), 'app/dnd/_ui/ContentBuilder.tsx'), 'utf8');

describe('TARGET_GROUPS', () => {
  it('is derived from the labels, so the two cannot drift', () => {
    expect(TARGET_GROUPS).toEqual(Object.keys(TARGET_GROUP_LABELS));
  });

  it('covers every target — no group is unreachable from the picker', () => {
    // The failure this catches: someone adds a group, the picker never lists it, and every target inside
    // it is unauthorable forever. That is the exact scenario targets.ts's header describes.
    const reachable = new Set(TARGET_GROUPS.flatMap((g) => targetsInGroup(g).map((t) => t.key)));
    for (const t of EFFECT_TARGETS) {
      expect(reachable.has(t.key), `${t.key} (group "${t.group}") is not reachable from any picker group`).toBe(true);
    }
  });
});

describe('the picker is generated, not hand-written', () => {
  it('renders groups and targets from the registry', () => {
    expect(builder).toContain('TARGET_GROUPS');
    expect(builder).toContain('targetsInGroup');
    // A literal target key in the component means someone started hand-listing them.
    expect(builder, 'no target key may be hard-coded').not.toMatch(/'(str_score|spell_save_dc|walk_speed)'/);
  });

  it('offers only the operations a target actually allows', () => {
    expect(builder).toMatch(/ops = target\?\.ops \?\? \[\]/);
  });

  it('resets the operation when the target changes', () => {
    // Otherwise switching from an ability (add/set/set_base) to a roll (add/advantage/disadvantage) leaves
    // an illegal pair that only fails at save, after the author has moved on.
    expect(builder).toMatch(/operation: next\?\.ops\[0\]/);
  });

  it('shows the ENGINE’s verdict live, using the same validator adoption runs', () => {
    // What the form accepts and what a sheet will actually apply must not disagree.
    expect(builder).toContain('validateEffect');
  });

  it('and offers no value box for a flag target', () => {
    // A `flag` target IS the whole effect; a value box there invites input that is then ignored.
    expect(builder).toMatch(/target\.valueType !== 'flag'/);
  });
});

describe('the operation labels stay honest', () => {
  it('every operation any target allows has a label', () => {
    const used = new Set(EFFECT_TARGETS.flatMap((t) => t.ops));
    const labelled = builder.slice(builder.indexOf('OPERATION_LABELS'), builder.indexOf('VALUE_PLACEHOLDER'));
    for (const op of used) {
      expect(labelled, `operation "${op}" is offered by a target but has no label`).toContain(`${op}:`);
    }
  });

  it('an unlabelled operation falls back to its raw value rather than vanishing', () => {
    expect(builder).toMatch(/OPERATION_LABELS\[o\] \?\? o/);
  });
});

describe('the registry’s own rules still hold', () => {
  it('rejects an operation a target does not allow', () => {
    const ability = EFFECT_TARGETS.find((t) => t.group === 'ability')!;
    expect(isOperationAllowed(ability.key, 'add')).toBe(true);
    expect(isOperationAllowed(ability.key, 'immunity')).toBe(false);
    expect(validateEffect({ target: ability.key, operation: 'immunity', value: 1 })).not.toBeNull();
  });

  it('and an unknown target is refused rather than coerced', () => {
    expect(findTarget('not_a_target')).toBeUndefined();
    expect(validateEffect({ target: 'not_a_target', operation: 'add', value: 1 })).not.toBeNull();
  });
});

describe('every editor the registry declares is now built', () => {
  it('OWED_BY is empty', () => {
    const owed = builder.slice(builder.indexOf('const OWED_BY'), builder.indexOf('const OWED_BY') + 90);
    expect(owed).toMatch(/OWED_BY: Record<string, string> = \{\};/);
  });

  it('but the placeholder branch is KEPT for the next field type someone adds', () => {
    // Deleting it would mean a new registry field type silently renders nothing at all.
    expect(builder).toContain('IMPLEMENTED.has(f.type)');
    expect(builder).toMatch(/not built yet/i);
  });

  it('every field type any kind declares has an editor', () => {
    const declared = new Set(HOMEBREW_KINDS.flatMap((k) => fieldsForKind(k).map((f) => f.type)));
    const implemented = builder.slice(builder.indexOf('const IMPLEMENTED'), builder.indexOf('const OWED_BY'));
    for (const t of declared) {
      expect(implemented, `field type "${t}" is declared by a kind but has no editor`).toContain(`'${t}'`);
    }
  });
});
