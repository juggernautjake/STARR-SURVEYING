// __tests__/dnd/level-walker-escape-hatch.test.ts — customize AT EACH LEVEL (slot plan S6d).
//
// The owner's directive, verbatim: *"We need to be able to build level by level with the appropriately
// scoped system mechanics, and also be able to fully customize at each level if that's what the user wants
// to do. All of the customizations should be flagged as such."*
//
// S6a–c delivered half of that. They put the escape hatch on the FOUNDATIONS builders — where a character
// is assembled in one go — and left the LEVEL WALKERS, which is the surface the directive is actually
// about, with no hatch at all: `LevelBuilder` had zero references to it, and the `levels` route recorded no
// exceptions. A refused pick mid-walk was a dead end.
//
// What is tested here is mostly what the hatch REFUSES to do, because the failure mode is obvious: a hatch
// that simply stops enforcing would undo the whole slot plan and hand back "ten feats at level 2".
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ROUTE = read('app/api/dnd/characters/[id]/levels/route.ts');
const UI = read('app/dnd/_ui/LevelBuilder.tsx');

describe('the route accepts an exception, per pick', () => {
  it('is opt-in on each POST, never a mode', () => {
    // A per-character or per-session "allow anything" flag would be the same thing as no gate.
    expect(ROUTE).toContain('body?.acceptException === true && offer.offered');
  });

  it('still refuses when the pick is not acknowledged', () => {
    expect(ROUTE).toMatch(/if \(!accepted\) \{[\s\S]{0,220}status: 400/);
  });

  it('records the VALIDATOR\'s reason, never one the client sent', () => {
    // Otherwise a crafted POST could file "the DM approved this" against a refusal that happened for an
    // entirely different cause, and the badge meant to make the departure legible would launder it.
    expect(ROUTE).toContain("reason: v.error ?? 'not available to this character'");
  });

  it('does not offer it on a CUSTOM character', () => {
    // `unlockOffer` returns `offered: false` there — the rules never bound, so there is no exception to
    // record and an "Altered vanilla" badge would be noise.
    expect(ROUTE).toContain('unlockOffer({ isDM: r.access.isDM, kind: buildVariant })');
  });

  it('stamps DM-granted for a DM and expanded for a player', () => {
    expect(ROUTE).toContain('entitlement: offer.stamps');
  });

  it('names the pick from the choice itself, whatever kind it is', () => {
    // A feat, a subclass, an expertise pair — the recorded name has to say WHICH thing was excepted.
    expect(ROUTE).toContain('choice.featKey || choice.value || (choice.skills ?? []).join');
  });
});

describe('the badge follows, exactly as it does from the builders', () => {
  it('is derived from the merged ledger, not from the request', () => {
    expect(ROUTE).toContain('exceptionsIn(next.build?.choices');
    expect(ROUTE).toContain('variantKindWithExceptions(priorKind, exceptions)');
  });

  it('only writes system_variants when the kind actually moves', () => {
    // A build must never rewrite lineage, art or summaries as a side effect.
    expect(ROUTE).toContain('if (nextKind !== priorKind) {');
    expect(ROUTE).toContain('[ACTIVE_SLOT_META_KEY]:');
  });

  it('echoes the kind and the named exceptions back to the walker', () => {
    expect(ROUTE).toContain('variantKind: nextKind');
    expect(ROUTE).toContain('exceptions.map(describeException)');
  });
});

describe('the walker offers the door only when the route says so', () => {
  it('reads `canTakeAnyway` from the refusal rather than assuming', () => {
    // The route knows whether a given refusal is overridable; the client must not guess. A malformed
    // choice and an ineligible-but-legal-to-except pick both return 400.
    expect(ROUTE).toContain('canTakeAnyway: offer.offered');
    expect(UI).toContain('j?.canTakeAnyway ? { choice, reason:');
  });

  it('re-sends the EXACT choice that was refused', () => {
    // Re-deriving it from the form could send something subtly different from what was judged — the
    // recorded exception would then describe a pick that never happened.
    expect(UI).toContain('void save(refused.choice, { commitLevel: refused.commitLevel, acceptException: true })');
  });

  it('says what accepting costs, before it is accepted', () => {
    expect(UI).toContain('Altered vanilla');
    expect(UI).toContain('name it for your DM');
  });

  it('offers a way out that is not taking it', () => {
    expect(UI).toContain('Pick something else');
  });

  it('clears the offer once a pick succeeds, so it cannot linger', () => {
    expect(UI).toContain('setRefused(null);');
  });
});
