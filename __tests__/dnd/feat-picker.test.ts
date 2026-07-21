// __tests__/dnd/feat-picker.test.ts — adding a feat from the library (S9).
//
// The standing repo rule is that builders offer only rules-legal choices at the right slot and
// level, with custom as the EXPLICIT escape hatch. A picker that ignored eligibility would be a
// new hole in that: the AI path and the level builder both enforce it, and a third door that
// doesn't would make the rule meaningless.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FEATS_2024 } from '@/lib/dnd/feats/dnd5e-2024';
import { featEligibility } from '@/lib/dnd/feats/eligibility';
import { featCatalogForSystem, featCatalogNote } from '@/lib/dnd/feats/catalog';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const src = read('app/dnd/_sheet/components/ui/FeatPicker.tsx');

// UPDATED 2026-07-21 for 14-S6a, which made the picker system-scoped rather than 2024-only.
//
// Five assertions here broke, and every one of them broke for the same reason: they pinned the
// IMPLEMENTATION as source text — `featEligibility(f, ctx)`, `useState<FeatSlot>('origin')`,
// `takenFeatKeys`, the literal `system === 'dnd5e-2024' ? FEATS_2024 : []` — rather than the claim
// each test's own name makes. A legitimate refactor that kept every one of those claims true broke
// all five, which is the tell that they were testing the wrong thing.
//
// One was worse than fragile: "is 2024-scoped, with an honest empty state elsewhere" had become
// FALSE as a specification. The picker is system-scoped now, and 2014 is not "elsewhere".
//
// So these are rewritten to assert the behaviour through the dispatcher wherever a behavioural
// assertion is available, keeping source checks only where the claim genuinely is structural
// (that the component re-checks eligibility itself, rather than trusting a disabled button).
describe('the picker enforces the rules rather than bypassing them', () => {
  it('judges every feat with the system-aware gate', () => {
    expect(src).toContain('featEligibilityForSystem');
    // Not the 2024-only entry point: that one cannot judge a 2014 character at all.
    expect(src).not.toMatch(/\bfeatEligibility\(/);
  });

  it('re-checks on ADD, because disabled is an affordance and not an enforcement point', () => {
    // The load-bearing structural claim in this file. A picker that only greys the button is one
    // devtools edit away from granting anything.
    const addFn = src.slice(src.indexOf('const add ='), src.indexOf('const already ='));
    expect(addFn).toContain('featEligibilityForSystem');
    expect(addFn).toMatch(/if \(isVanilla && !elig\.ok && !isDM\) return/);
  });

  it('gates on the SLOT, which in 2024 decides the legal category', () => {
    expect(src).toContain('slot: activeSlot');
    // The slot options come from the system, so 2014 cannot be offered a 2024 track.
    expect(src).toContain('featSlotsForSystem');
  });

  it('passes level, abilities and already-taken feats into the check', () => {
    // Without these the prerequisites cannot be evaluated and everything looks legal.
    expect(src).toContain('level: char.meta.level');
    expect(src).toContain('abilities: char.abilities');
    // Names rather than keys since 14-S6a: each system's gate resolves them against ITS OWN
    // catalog, which is what stops the picker having to know which catalog is live.
    expect(src).toContain('takenFeatureNames');
  });

  it('shows WHY a feat is barred instead of hiding it', () => {
    // "Why can't I take Grappler?" is a question the sheet should answer; hiding it just makes
    // the list look arbitrary.
    expect(src).toContain('elig.reason');
    expect(src).toContain('＋ Anyway');
  });

  it('serves each system its own catalog, and says something true when there is none', () => {
    // Replaces "is 2024-scoped". Asserted through the dispatcher rather than as source text, so
    // the next refactor of the picker cannot break it while the behaviour is intact.
    expect(featCatalogForSystem('dnd5e-2024').length).toBe(FEATS_2024.length);
    expect(featCatalogForSystem('dnd5e-2014').length).toBeGreaterThan(0);
    expect(featCatalogForSystem('pathfinder2e')).toEqual([]);
    // And the empty state no longer implies unfinished work at a system that simply differs.
    expect(featCatalogNote('pathfinder2e')).not.toMatch(/yet/i);
    expect(src).toContain('featCatalogNote');
  });

  it('carries the feat’s real benefit text onto the sheet', () => {
    // The whole point over hand-typing: the feature arrives with its actual rules.
    expect(src).toContain('body: [f.benefit]');
    // The source line comes from the catalog per system — "General feat" is 2024 phrasing, and a
    // 2014 sheet says "Feat", which is what 2014 calls it.
    expect(src).toContain('source: f.sourceLabel');
    expect(featCatalogForSystem('dnd5e-2024').every((f) => /\bfeat$/.test(f.sourceLabel))).toBe(true);
    expect(featCatalogForSystem('dnd5e-2014').every((f) => f.sourceLabel === 'Feat')).toBe(true);
  });
});

describe('eligibility itself behaves as the picker assumes', () => {
  const origin = FEATS_2024.find((f) => f.category === 'origin')!;
  const general = FEATS_2024.find((f) => f.category === 'general')!;

  it('bars an Origin feat from an ASI slot and vice versa', () => {
    expect(featEligibility(origin, { slot: 'asi', level: 8 }).ok).toBe(false);
    expect(featEligibility(general, { slot: 'origin', level: 8 }).ok).toBe(false);
  });

  it('allows an Origin feat at an origin slot', () => {
    expect(featEligibility(origin, { slot: 'origin', level: 1 }).ok).toBe(true);
  });

  it('gives a reason whenever it refuses', () => {
    const r = featEligibility(origin, { slot: 'asi', level: 8 });
    expect(r.ok).toBe(false);
    expect((r.reason ?? '').length).toBeGreaterThan(0);
  });
});

describe('the Features panel offers it', () => {
  it('mounts the picker behind an Add feat button', () => {
    const panel = read('app/dnd/_sheet/components/Features.tsx');
    expect(panel).toContain('<FeatPicker');
    expect(panel).toContain('✦ Add feat');
    expect(panel).toContain('setPickingFeat');
  });
});
