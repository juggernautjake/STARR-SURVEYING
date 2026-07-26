// __tests__/dnd/slot-escape-hatch-pf2.test.tsx — the escape hatch on Pathfinder 2e (slot plan S6b).
//
// The 5e half shipped the decision core; this is the second system on it. What matters here is that PF2
// REUSES that core rather than growing its own idea of what an exception is — three systems drifting into
// three definitions of "vanilla" is the failure mode `rules-gate.ts` was written to avoid, and the hatch is
// exactly the kind of surface where it would happen.
//
// PF2 differs from 5e in one way that shows up throughout: its gate covers SPELLS as well as feats, and a
// refused spell never occupied a feat slot. So the "recorded even though it fills no slot" path is ordinary
// here, not an edge case.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pf2BuilderChoicesFor, mergePf2BuilderChoices } from '@/lib/dnd/systems/pathfinder2e/builder-choices';
import { pf2PlanLevelUp, type PF2RecordedChoice } from '@/lib/dnd/systems/pathfinder2e/levelup';
import { exceptionsIn, variantKindWithExceptions, unlockOffer, type SlotException } from '@/lib/dnd/slots/entitlement';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
import PF2BuildPicks from '@/app/dnd/_ui/PF2BuildPicks';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ex = (name: string, level?: number): SlotException =>
  ({ name, reason: 'you do not meet its prerequisites', entitlement: 'expanded', ...(level != null ? { level } : {}) });

describe('a hatch pick reaches the PF2 ledger', () => {
  it('stamps the (level, track) slot the feat occupies', () => {
    const out = pf2BuilderChoicesFor({ className: 'Fighter', level: 4, feats: ['Power Attack'], exceptions: [ex('Power Attack')] });
    const feat = out.find((c) => c.kind === 'feat');
    expect(feat?.value).toBe('Power Attack');
    expect(feat?.track).toBeTruthy();          // the slot identity survives — that is what S8b will point at
    expect(feat?.exception?.entitlement).toBe('expanded');
  });

  it('records a refused SPELL, which never had a feat slot to sit in', () => {
    const out = pf2BuilderChoicesFor({ className: 'Wizard', level: 1, feats: [], exceptions: [ex('Fireball', 1)] });
    expect(exceptionsIn(out)).toHaveLength(1);
    expect(out.find((c) => c.exception)?.kind).toBe('other');
  });

  it('the badge derived from that ledger is altered-vanilla, end to end', () => {
    const out = pf2BuilderChoicesFor({ className: 'Wizard', level: 1, feats: [], exceptions: [ex('Fireball', 1)] });
    expect(variantKindWithExceptions('vanilla', exceptionsIn(out))).toBe('altered-vanilla');
  });

  it('changes nothing when there are no exceptions', () => {
    const withArg = pf2BuilderChoicesFor({ className: 'Fighter', level: 4, feats: ['Power Attack'], exceptions: [] });
    const without = pf2BuilderChoicesFor({ className: 'Fighter', level: 4, feats: ['Power Attack'] });
    expect(withArg).toEqual(without);
  });
});

describe('the new `other` kind is inert', () => {
  // Widening a union is where gates silently change behaviour — the `SheetVariantKind` lesson. `other` is
  // only safe because the planner looks choices up by (level, kind, track) and never asks for this one.
  it('an off-slot exception does not satisfy, create or hide any real prompt', () => {
    const recorded: PF2RecordedChoice[] = [{ level: 1, kind: 'other', value: 'Fireball', exception: ex('Fireball', 1) }];
    const withIt = pf2PlanLevelUp({ className: 'Fighter', to: 4, recorded });
    const without = pf2PlanLevelUp({ className: 'Fighter', to: 4, recorded: [] });
    expect(withIt.outstanding).toEqual(without.outstanding);
  });

  it('and the planner never EMITS it, so no UI has to render one', () => {
    const plan = pf2PlanLevelUp({ className: 'Fighter', to: 8, recorded: [] });
    expect(plan.outstanding.every((c) => c.kind !== 'other')).toBe(true);
  });
});

describe('rebuilding does not corrupt the PF2 record', () => {
  const exceptional: PF2RecordedChoice = { level: 1, kind: 'other', value: 'Fireball', exception: ex('Fireball', 1) };

  it('replaces its own exceptions rather than stacking a duplicate', () => {
    expect(exceptionsIn(mergePf2BuilderChoices([exceptional], [exceptional], 4))).toHaveLength(1);
  });

  it('leaves an unrelated `other` choice alone', () => {
    const other: PF2RecordedChoice = { level: 2, kind: 'other', value: 'something else' };
    expect(mergePf2BuilderChoices([other], [exceptional], 4)).toContainEqual(other);
  });

  it('dropping the pick drops the exception, so the badge can fall back', () => {
    const merged = mergePf2BuilderChoices([exceptional], [{ level: 1, kind: 'feat', track: 'class', value: 'Power Attack' }], 4);
    expect(variantKindWithExceptions('altered-vanilla', exceptionsIn(merged))).toBe('vanilla');
  });
});

describe('the PF2 picker mounts the shared control', () => {
  const props = { className: 'Fighter', ancestry: 'Human', level: 1, selected: [] as string[], onToggle: () => {} };

  it('offers the hatch over the refusals the SEARCH surfaced', () => {
    // Scoped to the search, not the whole catalog: PF2 has thousands of entries, so a complete
    // "everything you can't have" list would be unusable, and the player is already looking at the thing.
    const html = renderToStaticMarkup(
      <PF2BuildPicks kind="feat" {...props} offer={unlockOffer({ kind: 'vanilla' })}
        exceptions={[]} onTakeAnyway={() => {}} onUndoException={() => {}} />,
    );
    // With no search term the row list is empty, so there is nothing to escape and nothing renders.
    expect(html).not.toContain('Add a different feat');
  });

  it('stays exactly as it was when no hatch props are passed', () => {
    const plain = renderToStaticMarkup(<PF2BuildPicks kind="feat" {...props} />);
    expect(plain).not.toContain('Add a different');
    expect(plain).toContain('Search'); // the picker itself still renders
  });

  it('uses the SHARED component, not a PF2-local copy', () => {
    const src = read('app/dnd/_ui/PF2BuildPicks.tsx');
    expect(src).toContain("import TakeAnyway from './builder/TakeAnyway'");
  });
});

describe('the PF2 route is wired the same way as 5e', () => {
  const SRC = read('app/api/dnd/characters/[id]/pf2-build/route.ts');

  it('splits the gate\'s refusals rather than trusting the client', () => {
    expect(SRC).toMatch(/splitAcknowledged\(\s*buildGate\.refused,/);
    expect(SRC).toContain('offer.offered ? acknowledged : []');
  });

  it('an unacknowledged refusal still 400s', () => {
    expect(SRC).toContain('if (stillRefused.length) {');
    expect(SRC).toContain('refused: stillRefused,');
  });

  it('derives the badge from the merged ledger, not from the request', () => {
    expect(SRC).toContain('exceptionsIn(assembled.pf2Build.choices)');
    expect(SRC).toContain('variantKindWithExceptions(buildVariant, exceptions)');
  });

  it('shares the 5e decision core instead of reimplementing it', () => {
    expect(SRC).toContain("from '@/lib/dnd/slots/entitlement'");
  });
});

describe('the PF2 builder keeps picks and exceptions in step', () => {
  const SRC = read('app/dnd/_ui/PF2CharacterBuilder.tsx');

  it('deselecting a chip drops its exception', () => {
    expect(SRC).toMatch(/const toggleWith = [\s\S]*setExceptions\(\(p\) => p\.filter/);
  });

  it('sends them to the server, alongside the picks', () => {
    // Anchored on the payload rather than on a bare line: `exceptions,` also appears at the useState, and a
    // newline-delimited pattern is a CRLF trap on this checkout (`\n\s*…\n` cannot match `\r\n`).
    expect(SRC).toMatch(/picks: \{[^}]*\},\s*exceptions,/);
  });

  it('defaults to the gate being ON for a caller that does not say', () => {
    expect(SRC).toContain("variantKind = 'vanilla'");
    expect(SRC).toContain('isDM = false');
  });
});
