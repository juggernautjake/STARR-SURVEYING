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

// ── PF2: the walker gated the SLOT but never the VALUE ────────────────────────────────────────────────
//
// The bigger half of this slice. `pf2PlanLevelUp` has always scoped which slots a level offers, so the
// walker asked the right questions — but `readChoice` validated only the SHAPE of the answer. Nothing
// checked whether the feat you named was one you could actually take, so the walker would record a
// level-13 feat into a level-2 class slot. The Foundations builder has gated this since S4.
describe('PF2 level walker: the value is gated, then exceptable', () => {
  const PF2 = read('app/api/dnd/characters/[id]/pf2-levels/route.ts');
  const PF2UI = read('app/dnd/_ui/PF2LevelBuilder.tsx');

  it('runs the shared eligibility core rather than a second rule', () => {
    expect(PF2).toContain('pf2FeatEligibility(def,');
    expect(PF2).toContain('pf2ContextFor(sidecar)');
  });

  it('judges the CATALOG entry, not the choice\'s own claim', () => {
    // Otherwise a crafted POST declares a level-20 feat to be level 1 and walks through — the exact
    // reasoning `gatePf2Edit` already documents.
    expect(PF2).toContain('PF2_ALL_FEATS.find((f) => f.name.toLowerCase() === choice.value!.trim().toLowerCase())');
  });

  it('lets HOMEBREW through — it never claimed to be official', () => {
    // `if (def)` — an unknown feat is not refused, because refusing it would block authoring rather than
    // close a hole.
    expect(PF2).toMatch(/if \(def\) \{/);
  });

  it('does not gate a DM or a custom character', () => {
    expect(PF2).toContain('isRulesEnforcedKind(buildVariant) && !access.access.isDM');
  });

  it('accepts an acknowledged exception, per pick, with the gate\'s own reason', () => {
    expect(PF2).toContain('body.acceptException === true && offer.offered');
    expect(PF2).toContain("reason: elig.reason ?? 'not available to this character'");
  });

  it('moves the badge from the merged ledger', () => {
    expect(PF2).toContain('exceptionsIn(choices)');
    expect(PF2).toContain('variantKindWithExceptions(priorKind, exceptions)');
  });

  it('and the walker offers the door only when the route allows it', () => {
    expect(PF2UI).toContain('setRefused(j?.canTakeAnyway ? choice : null)');
    expect(PF2UI).toContain('void record(refused, true)');
  });
});

// ── IG: the same missing check, third system ──────────────────────────────────────────────────────────
//
// `igPlanLevelUp` scoped the slots from the scraped schedule; `readChoice` checked the shape of the answer
// and nothing else. A Beastmaster could record an Arcanist's power at level 3 and the level read complete.
describe('IG level walker: the value is gated, then exceptable', () => {
  const IG = read('app/api/dnd/characters/[id]/ig-levels/route.ts');
  const IGUI = read('app/dnd/_ui/IGLevelBuilder.tsx');

  it('gates POWERS and the SPECIALIZATION — what IG can actually judge', () => {
    expect(IG).toContain("choice.kind === 'subclass-power' || choice.kind === 'specialization'");
    expect(IG).toContain('igPowerEligibility(choice.value, ctx)');
    expect(IG).toContain('igSpecializationEligibility(choice.value, ctx)');
  });

  it('leaves FEATS to the budget, matching the Foundations builder', () => {
    // `igPowerEligibility` has no feat equivalent — IG feat prerequisites are unstructured prose — so a
    // feat gate here would be inventing a rule the system does not state.
    expect(IG).not.toMatch(/igFeatEligibility/);
  });

  it('builds the context from what the character already holds', () => {
    // Powers already recorded must not start refusing each other, and Dabbler widens the legal set —
    // EXCEPT the pick under review, which is filtered out below (the laundering hole).
    expect(IG).toContain('knownPowers: choices');
    expect(IG).toContain('specializations: choices');
  });

  it('does not gate a DM or a custom character', () => {
    expect(IG).toContain('isRulesEnforcedKind(buildVariant) && !access.access.isDM');
  });

  it('accepts an acknowledged exception with the gate\'s own reason', () => {
    expect(IG).toContain('body.acceptException === true && offer.offered');
    expect(IG).toContain("reason: elig.reason ?? 'not available to this character'");
  });

  it('moves the badge from the merged ledger', () => {
    expect(IG).toContain('exceptionsIn(choices)');
    expect(IG).toContain('variantKindWithExceptions(priorKind, exceptions)');
  });

  it('and the walker offers the door only when the route allows it', () => {
    expect(IGUI).toContain('setRefused(j?.canTakeAnyway ? choice : null)');
    expect(IGUI).toContain('void record(refused, true)');
  });
});

describe('all three walkers now behave alike', () => {
  const ROUTES = [
    'app/api/dnd/characters/[id]/levels/route.ts',
    'app/api/dnd/characters/[id]/pf2-levels/route.ts',
    'app/api/dnd/characters/[id]/ig-levels/route.ts',
  ];

  it('every level route shares the one entitlement core', () => {
    // Three systems drifting into three ideas of what an exception is, is the failure this prevents.
    for (const r of ROUTES) expect(read(r), r).toContain("from '@/lib/dnd/slots/entitlement'");
  });

  it('every level route tells the client whether a refusal is overridable', () => {
    for (const r of ROUTES) expect(read(r), r).toContain('canTakeAnyway: offer.offered');
  });

  it('and every one derives the badge rather than trusting the request', () => {
    for (const r of ROUTES) expect(read(r), r).toContain('variantKindWithExceptions(');
  });
});

// ── The LAUNDERING hole, found by driving the live route ──────────────────────────────────────────────
//
// Found 2026-07-26 against a real character, and invisible to every test above — they assert the route
// SOURCE contains the gate and the stamp, which it did. The defect was in what the gate SAW.
//
// Sequence that broke it:
//   1. take an illegal power through the hatch → recorded, flagged, badge moves to "Altered vanilla";
//   2. save the SAME choice again without acknowledging → **accepted**, exception gone, badge back to
//      "Vanilla" — and the illegal power still on the sheet.
//
// Cause: eligibility treats already-known powers as legitimate (right — whatever granted them was), and
// the context was built from the recorded choices, so the pick justified ITSELF. `recordChoice` replaces
// the entry at that (level, kind), so the thing being replaced is precisely the thing under review.
//
// `gateIgPicks` and `gatePf2Picks` have always documented this rule for the build path — "every feat in
// this build is under review, so treating them as already-held would make the whole set vacuously legal".
// The level routes are where I failed to apply it.
describe('a pick cannot justify itself (the laundering hole)', () => {
  const IG = read('app/api/dnd/characters/[id]/ig-levels/route.ts');
  const PF2 = read('app/api/dnd/characters/[id]/pf2-levels/route.ts');

  it('IG excludes the slot being replaced from the known set', () => {
    expect(IG).toContain('c.level === choice.level && c.kind === choice.kind');
    expect(IG).toContain('selfJustifying');
  });

  it('IG also excludes the same VALUE recorded at another level', () => {
    // Holding one power twice is its own problem, but it must not become a way to launder the first copy.
    expect(IG).toMatch(/\(c\.value \?\? ''\)\.trim\(\)\.toLowerCase\(\) === choice\.value!\.trim\(\)\.toLowerCase\(\)/);
  });

  it('and applies it to specializations as well as powers', () => {
    expect(IG).toContain("c.kind === 'specialization' && c.value && !selfJustifying(c)");
    expect(IG).toContain("c.kind === 'subclass-power' && c.value && !selfJustifying(c)");
  });

  it('PF2 strips the feat under review from the sheet-derived featNames', () => {
    // `pf2ContextFor` reads featNames off the sidecar, and a walker feat is PROJECTED there — so the
    // identical hole existed by a different route.
    expect(PF2).toContain("featNames: (base.featNames ?? []).filter((n) => n.trim().toLowerCase() !== under)");
  });

  it('both record WHY the filter exists, since removing it looks harmless', () => {
    // A future reader sees a filter dropping entries from an eligibility context and could easily take it
    // for redundancy. It is the whole reason the flag survives a second save.
    expect(IG).toContain('MUST NOT JUSTIFY ITSELF');
    expect(PF2).toContain('MUST NOT JUSTIFY ITSELF');
  });
});
