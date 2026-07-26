// __tests__/dnd/slot-escape-hatch-ig.test.tsx — the escape hatch on Intuitive Games (slot plan S6c).
//
// The third and last system on the shared core. IG differs from 5e and PF2 in two ways that matter:
//
//   1. Its gate refuses POWERS and the SPECIALIZATION, not feats. `igPowerEligibility` has no feat
//      equivalent (IG feat prerequisites are unstructured prose), and IG's feat constraint is the per-level
//      BUDGET rather than an eligibility rule. So the hatch covers powers only — offering one over the feat
//      budget would promise an exception `ig-build` never records.
//   2. Its level-1 picks have NO schedule row (the scraped schedule starts at level 2) and are deliberately
//      left unrecorded. So "an exception that fills no slot" is the COMMON case here, not an edge — without
//      the off-slot path a level-1 exception would vanish entirely and the character would read "Vanilla".
//
// This slice also fixed a live bug in `powerReason`, which is pinned below.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { igBuilderChoicesFor, mergeIgBuilderChoices } from '@/lib/dnd/systems/intuitive-games/builder-choices';
import { igPlanLevelUp, type IGRecordedChoice } from '@/lib/dnd/systems/intuitive-games/levelup';
import { exceptionsIn, variantKindWithExceptions, type SlotException } from '@/lib/dnd/slots/entitlement';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ex = (name: string, level?: number): SlotException =>
  ({ name, reason: 'that power belongs to another subclass', entitlement: 'expanded', ...(level != null ? { level } : {}) });

describe('an IG hatch pick reaches the ledger', () => {
  it('records a LEVEL-1 exception, which has no schedule row to sit in', () => {
    // The case that would otherwise be lost silently — and the one a level-1 IG character hits first.
    const out = igBuilderChoicesFor({ subclass: 'Champion', level: 1, powers: ['Borrowed Power'], exceptions: [ex('Borrowed Power', 1)] });
    expect(exceptionsIn(out)).toHaveLength(1);
    expect(out.find((c) => c.exception)?.kind).toBe('other');
  });

  it('the badge derived from that ledger is altered-vanilla, end to end', () => {
    const out = igBuilderChoicesFor({ subclass: 'Champion', level: 1, powers: ['Borrowed Power'], exceptions: [ex('Borrowed Power', 1)] });
    expect(variantKindWithExceptions('vanilla', exceptionsIn(out))).toBe('altered-vanilla');
  });

  it('changes nothing when there are no exceptions', () => {
    const withArg = igBuilderChoicesFor({ subclass: 'Champion', level: 4, powers: ['A', 'B'], exceptions: [] });
    const without = igBuilderChoicesFor({ subclass: 'Champion', level: 4, powers: ['A', 'B'] });
    expect(withArg).toEqual(without);
  });
});

describe('the new `other` kind is inert in IG too', () => {
  it('an off-schedule exception does not satisfy, create or hide any real prompt', () => {
    const recorded: IGRecordedChoice[] = [{ level: 1, kind: 'other', value: 'Borrowed Power', exception: ex('Borrowed Power', 1) }];
    const withIt = igPlanLevelUp({ subclass: 'Champion', to: 4, recorded });
    const without = igPlanLevelUp({ subclass: 'Champion', to: 4, recorded: [] });
    expect(withIt.outstanding).toEqual(without.outstanding);
  });

  it('the planner never EMITS it', () => {
    const plan = igPlanLevelUp({ subclass: 'Champion', to: 10, recorded: [] });
    expect(plan.outstanding.every((c) => c.kind !== 'other')).toBe(true);
  });

  it('and the level route refuses to accept one from a client', () => {
    // `CHOICE_KINDS` is a whitelist, so the walker can neither create nor overwrite an exception record.
    const src = read('app/api/dnd/characters/[id]/ig-levels/route.ts');
    const list = src.slice(src.indexOf('const CHOICE_KINDS'), src.indexOf('function buildState'));
    expect(list).not.toContain("'other'");
  });
});

describe('rebuilding does not corrupt the IG record', () => {
  const exceptional: IGRecordedChoice = { level: 1, kind: 'other', value: 'Borrowed Power', exception: ex('Borrowed Power', 1) };

  it('replaces its own exceptions rather than stacking a duplicate', () => {
    expect(exceptionsIn(mergeIgBuilderChoices([exceptional], [exceptional], 4))).toHaveLength(1);
  });

  it('leaves an unrelated `other` choice alone', () => {
    const other: IGRecordedChoice = { level: 2, kind: 'other', value: 'something else' };
    expect(mergeIgBuilderChoices([other], [exceptional], 4)).toContainEqual(other);
  });

  it('dropping the pick drops the exception, so the badge can fall back', () => {
    const merged = mergeIgBuilderChoices([exceptional], [{ level: 2, kind: 'feat-general', value: 'Toughness' }], 4);
    expect(variantKindWithExceptions('altered-vanilla', exceptionsIn(merged))).toBe('vanilla');
  });
});

describe('an altered-vanilla IG character is still greyed — the bug this slice found', () => {
  const SRC = read('app/dnd/_ui/IGCharacterBuilder.tsx');

  it('powerReason asks whether the rules BIND, not whether the kind is exactly vanilla', () => {
    // Was `if (variantKind !== 'vanilla') return undefined`. When S8a added the third kind, that silently
    // became true for `altered-vanilla` — so the picker greyed NOTHING while `ig-build` went on refusing
    // the same picks with a 400. The function's own comment promises the builder and the save "can never
    // disagree about what is legal"; for one of the three kinds, they did.
    expect(SRC).toContain('if (!isRulesEnforcedKind(variantKind)) return undefined;');
    expect(SRC).not.toContain("if (variantKind !== 'vanilla') return undefined;");
  });
});

describe('the IG builder mounts the shared control, in the right place', () => {
  const SRC = read('app/dnd/_ui/IGCharacterBuilder.tsx');

  it('uses the shared component rather than a third local copy', () => {
    expect(SRC).toContain("import TakeAnyway from './builder/TakeAnyway'");
  });

  it('offers it on POWERS, which is the list the gate actually refuses', () => {
    expect(SRC).toMatch(/const powersBlock = [\s\S]*<TakeAnyway/);
    expect(SRC).toContain('noun="power"');
  });

  it('does NOT put it inside `Chips`, which stances and weapon types also use', () => {
    // Those two are deliberately uncapped and have no eligibility rule, so a hatch there would offer an
    // escape from a constraint that does not exist.
    const chips = SRC.slice(SRC.indexOf('const Chips = ('), SRC.indexOf('// B2:'));
    expect(chips).not.toContain('TakeAnyway');
  });

  it('keeps picks and exceptions in step, and sends them', () => {
    expect(SRC).toMatch(/const toggle = [\s\S]*setExceptions\(\(prev\) => prev\.filter/);
    expect(SRC).toMatch(/companionName \},\s*exceptions \}/);
  });
});

describe('the IG route is wired the same way as the other two', () => {
  const SRC = read('app/api/dnd/characters/[id]/ig-build/route.ts');

  it('splits the gate\'s refusals rather than trusting the client', () => {
    expect(SRC).toMatch(/splitAcknowledged\(\s*buildGate\.refused,/);
    expect(SRC).toContain('offer.offered ? acknowledged : []');
  });

  it('an unacknowledged refusal still 400s', () => {
    expect(SRC).toContain('if (stillRefused.length) {');
    expect(SRC).toContain('refused: stillRefused,');
  });

  it('derives the badge from the merged ledger, not from the request', () => {
    expect(SRC).toContain('exceptionsIn(built.igBuild.choices)');
    expect(SRC).toContain('variantKindWithExceptions(buildVariant, exceptions)');
  });
});

describe('all three systems share one core', () => {
  it('none of them reimplements the decision', () => {
    for (const route of [
      'app/api/dnd/characters/[id]/dnd5e-build/route.ts',
      'app/api/dnd/characters/[id]/pf2-build/route.ts',
      'app/api/dnd/characters/[id]/ig-build/route.ts',
    ]) {
      expect(read(route), route).toContain("from '@/lib/dnd/slots/entitlement'");
    }
  });

  it('and all three record the exception on their own ledger type', () => {
    expect(read('lib/dnd/classes/levelup.ts')).toContain('exception?: SlotException;');
    expect(read('lib/dnd/systems/pathfinder2e/levelup.ts')).toContain('exception?: SlotException;');
    expect(read('lib/dnd/systems/intuitive-games/levelup.ts')).toContain('exception?: SlotException;');
  });
});
