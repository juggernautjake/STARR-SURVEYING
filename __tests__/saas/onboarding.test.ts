// First-run onboarding (audit §3c.1 item 8i, Phase 4 item 19).
//
// §3c.1: *"Today the app assumes Starr's data exists. A new firm needs empty states, a first-run
// setup, and defaults that are not ours."*

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateOnboarding, emptyStateFor, ONBOARDING_STEPS, type OnboardingFacts } from '@/lib/saas/onboarding';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** Source with comments stripped. Several assertions here are about the ABSENCE of a thing, and the
 *  file explains at length why it is absent — so matching prose would fail the test for saying the
 *  right thing. */
const code = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const EMPTY: OnboardingFacts = {
  hasFirmName: false, hasFirmContact: false, memberCount: 1, countyCount: 0,
  workTypeCount: 0, equipmentCount: 0, customerCount: 0, jobCount: 0, paymentsConfigured: false,
};
const SETUP: OnboardingFacts = {
  hasFirmName: true, hasFirmContact: true, memberCount: 4, countyCount: 3,
  workTypeCount: 5, equipmentCount: 2, customerCount: 8, jobCount: 12, paymentsConfigured: true,
};

describe('a brand-new firm', () => {
  const state = evaluateOnboarding(EMPTY);

  it('is offered exactly one next step, not a wall of twelve', () => {
    // A checklist of everything on day one is a wall rather than a path.
    expect(state.next?.id).toBe('firm_identity');
  });

  it('starts with the firm’s own details, because everything outbound carries them', () => {
    // §3c.3 ships a BLANK rather than a borrowed default precisely so this step is unavoidable — an
    // unset name renders as nothing, and nothing is what makes somebody go and set it.
    expect(ONBOARDING_STEPS[0].id).toBe('firm_identity');
  });

  it('blocks steps whose prerequisites are unmet, but still shows them', () => {
    // A step you cannot start yet is information. A step that is not there at all reads as a feature
    // the product does not have.
    const job = state.steps.find((s) => s.id === 'first_job')!;
    expect(job.blocked).toBe(true);
    expect(state.steps.map((s) => s.id)).toContain('first_job');
  });

  it('knows it is brand new', () => {
    expect(state.isBrandNew).toBe(true);
    expect(state.ready).toBe(false);
  });
});

describe('what counts as done', () => {
  it('does not tick "add your people" for the founder alone', () => {
    // The founder's account exists the moment they sign up, so ">0 members" is true for a firm that
    // has invited nobody — and would tick the step before it was started.
    expect(evaluateOnboarding({ ...EMPTY, hasFirmName: true, hasFirmContact: true, memberCount: 1 }).steps.find((s) => s.id === 'team')!.done).toBe(false);
    expect(evaluateOnboarding({ ...EMPTY, memberCount: 2 }).steps.find((s) => s.id === 'team')!.done).toBe(true);
  });

  it('accepts a firm reachable only by phone', () => {
    // Requiring both an email and a phone would hold the checklist open forever on a technicality.
    const phoneOnly = evaluateOnboarding({ ...EMPTY, hasFirmName: true, hasFirmContact: true });
    expect(phoneOnly.steps.find((s) => s.id === 'firm_identity')!.done).toBe(true);
  });

  it('lets optional steps stay undone without holding the firm hostage', () => {
    // Only the required ones decide `ready`. A firm that never adds an instrument is still a
    // working firm.
    const essentials = evaluateOnboarding({ ...EMPTY, hasFirmName: true, hasFirmContact: true, memberCount: 3 });
    expect(essentials.ready).toBe(true);
    expect(essentials.steps.some((s) => !s.done)).toBe(true);
  });

  it('reports a fully set-up firm as ready with nothing next', () => {
    const state = evaluateOnboarding(SETUP);
    expect(state.ready).toBe(true);
    expect(state.next).toBeNull();
    expect(state.isBrandNew).toBe(false);
  });
});

describe('it is measured, never remembered', () => {
  it('reopens when a firm stops meeting a requirement', () => {
    // A stored `onboarding_complete` flag would stay true after somebody removed their only
    // teammate, and suppress the checklist exactly when it mattered.
    const wasReady = evaluateOnboarding(SETUP);
    expect(wasReady.ready).toBe(true);
    const nowAlone = evaluateOnboarding({ ...SETUP, memberCount: 1 });
    expect(nowAlone.ready).toBe(false);
    expect(nowAlone.next?.id).toBe('team');
  });

  it('has no completion flag anywhere in the API', () => {
    // Comments stripped: the header EXPLAINS why there is no such column, and matching prose would
    // fail this test for saying the right thing.
    const api = code(read('app/api/admin/onboarding/route.ts'));
    expect(api).not.toMatch(/onboarding_complete/);
    expect(api).toMatch(/count: 'exact', head: true/);
  });

  it('does not blank the whole checklist when one table fails to count', () => {
    // One missing table must not hide every step — but the failure is logged, because "0 because
    // there are none" and "0 because the query failed" are the §1.1b pair.
    const api = read('app/api/admin/onboarding/route.ts');
    expect(api).toMatch(/console\.error\(`\[onboarding\] could not count/);
    expect(api).toMatch(/return 0;/);
  });
});

describe('empty states say which kind of empty', () => {
  it('tells a new firm that nothing is broken', () => {
    // An established firm with an empty jobs list has archived everything; a new one has not
    // started. Telling the second "no jobs found" is true and useless.
    const brandNew = emptyStateFor('jobs', true);
    expect(brandNew.body).toMatch(/nothing is broken/);
    expect(brandNew.title).toMatch(/that is expected/);
  });

  it('tells an established firm to check its filters', () => {
    expect(emptyStateFor('jobs', false).body).toMatch(/check your filters/);
  });
});

describe('the checklist behaves like a path, not a wall', () => {
  const component = read('app/admin/components/OnboardingChecklist.tsx');
  const componentCode = code(component);

  it('renders nothing once the essentials are done', () => {
    // Widened 2026-08-04: the condition gained `!mayComplete ||` in front, because the card is now
    // owners and admins only — every step it offers leads somewhere a field-crew member cannot
    // open, so for them it was a permanent to-do list of things they are not permitted to do.
    //
    // Matched loosely on purpose. The property this test defends is *"ready hides it"*, and pinning
    // the whole expression makes it fail on any change to who sees it — which is a different
    // question, already asserted in `onboarding-card-is-completable.test.ts`.
    expect(component).toMatch(/if \([^)]*state\.ready\) return null;/);
  });

  it('has no "don’t show again" flag', () => {
    // The state is measured, so a dismissal would suppress a checklist that should have come back.
    expect(componentCode).not.toMatch(/dismiss|localStorage/i);
  });

  it('is not a modal takeover', () => {
    // A firm that wants to look around before setting anything up should be able to.
    expect(componentCode).not.toMatch(/role="dialog"|position: 'fixed'/);
  });

  it('sits above the widget canvas on the Hub', () => {
    // An empty canvas with no explanation is where a new customer decides the software is broken.
    const hub = read('app/admin/me/page.tsx');
    expect(hub.indexOf('<OnboardingChecklist />')).toBeLessThan(hub.indexOf('<HubMeClient'));
  });
});
