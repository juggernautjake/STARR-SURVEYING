// __tests__/admin/onboarding-card-is-completable.test.ts
//
// Owner, 2026-08-04: *"there are some pending survey firm things on the hub that need to be updated…
// but I am not seeing a clear way to make sure everything that needs to be updated can be updated.
// Like, there needs to be clearer instructions or something. Please make it so that we can actually
// meet those requirements and once they are met that little element goes away. Make sure that only
// shows up for owners and admins also."*
//
// Three separate things, and only one of them was a missing feature:
//
//   1. **It never said what was blank.** The card shows a goal ("your name, phone and address go on
//      every proposal") and a score ("0 of 2 essentials done") and nothing in between. A firm with a
//      name but no phone number sees the same card as one with neither, and no way to work out
//      which half is left — so it reads as a requirement that cannot be met.
//   2. **It disappeared already.** `state.ready` has always hidden it. What made that invisible is
//      (1): with no finish line stated, "it will go away when you are done" is unfalsifiable.
//   3. **Everyone saw it.** Every step leads somewhere a field-crew member cannot open, so for them
//      it was a permanent to-do list of things they are not allowed to do.

import { describe, it, expect } from 'vitest';
import { evaluateOnboarding, type OnboardingFacts } from '@/lib/saas/onboarding';
import { readCode } from '../_helpers/source';

const card = readCode('app/admin/components/OnboardingChecklist.tsx');

const facts = (over: Partial<OnboardingFacts> = {}): OnboardingFacts => ({
  hasFirmName: false,
  hasFirmContact: false,
  memberCount: 1,
  countyCount: 0,
  workTypeCount: 0,
  equipmentCount: 0,
  customerCount: 0,
  jobCount: 0,
  paymentsConfigured: false,
  ...over,
});

describe('the card says exactly what is still blank', () => {
  it('names both gaps when nothing is filled in', () => {
    const s = evaluateOnboarding(facts());
    const identity = s.steps.find((x) => x.id === 'firm_identity')!;
    expect(identity.missing).toEqual(['Firm name', 'A contact email or phone number']);
  });

  it('names only the gap that is left when one is filled in', () => {
    // The case that made the card look broken: a firm with a name and no phone was told "0 of 2
    // done" with no indication that the name had counted.
    const s = evaluateOnboarding(facts({ hasFirmName: true }));
    const identity = s.steps.find((x) => x.id === 'firm_identity')!;
    expect(identity.missing).toEqual(['A contact email or phone number']);
  });

  it('treats email OR phone as one requirement, not two', () => {
    // `hasFirmContact` is already either/or. Listing them separately would leave somebody who added
    // a phone number staring at "email missing" — a requirement the product does not actually have.
    const withPhone = evaluateOnboarding(facts({ hasFirmName: true, hasFirmContact: true }));
    expect(withPhone.steps.find((x) => x.id === 'firm_identity')!.missing).toEqual([]);
  });

  it('every unfinished step names something, so none is a dead end', () => {
    // A step with no `missing` entry is a requirement with no stated way to satisfy it — exactly
    // the complaint. Asserted across ALL steps rather than the two required ones, because the
    // expanded list shows every step.
    const s = evaluateOnboarding(facts());
    const silent = s.steps.filter((x) => !x.done && x.missing.length === 0).map((x) => x.id);
    expect(silent, `these steps are unfinished and say nothing about what would finish them: ${silent.join(', ')}`)
      .toEqual([]);
  });

  it('a finished step claims nothing is missing', () => {
    // `done` and `missing.length === 0` are the same statement made twice — from the same facts, so
    // they cannot disagree. A card reading "done" beside "still needed: …" would be worse than
    // either.
    const s = evaluateOnboarding(facts({
      hasFirmName: true, hasFirmContact: true, memberCount: 2, countyCount: 1,
      workTypeCount: 1, equipmentCount: 1, customerCount: 1, jobCount: 1, paymentsConfigured: true,
    }));
    for (const step of s.steps) expect(step.missing, `${step.id}`).toEqual([]);
  });
});

describe('it goes away when the requirements are met', () => {
  it('is not ready while either essential is outstanding', () => {
    expect(evaluateOnboarding(facts()).ready).toBe(false);
    expect(evaluateOnboarding(facts({ hasFirmName: true, hasFirmContact: true })).ready).toBe(false); // team
    expect(evaluateOnboarding(facts({ memberCount: 2 })).ready).toBe(false);                          // identity
  });

  it('is ready as soon as BOTH essentials are done, whatever the optional steps say', () => {
    // Optional steps must never hold the card open. A firm that has no equipment is a firm, and a
    // setup prompt that outlives setup is the thing being complained about.
    const s = evaluateOnboarding(facts({ hasFirmName: true, hasFirmContact: true, memberCount: 2 }));
    expect(s.ready).toBe(true);
    expect(s.steps.some((x) => !x.done && !x.required), 'optional steps remain, deliberately').toBe(true);
  });

  it('and the card renders nothing once ready', () => {
    expect(card).toContain('state.ready) return null');
  });
});

describe('only owners and admins see it', () => {
  it('checks the session roles', () => {
    expect(card).toContain("roles.includes('admin')");
    expect(card).toContain("roles.includes('owner')");
  });

  it('hides it from everyone else', () => {
    expect(card).toContain('if (!mayComplete');
  });

  it('does not even fetch for someone who cannot act on it', () => {
    // A request per page load, per crew member, for a card they will never be shown.
    expect(card).toContain('if (mayComplete) load()');
  });
});
