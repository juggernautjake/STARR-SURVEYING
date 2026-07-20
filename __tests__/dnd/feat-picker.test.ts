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

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const src = read('app/dnd/_sheet/components/ui/FeatPicker.tsx');

describe('the picker enforces the rules rather than bypassing them', () => {
  it('runs every feat through featEligibility', () => {
    expect(src).toContain('featEligibility(f, ctx)');
  });

  it('gates on the SLOT, which decides the legal category', () => {
    expect(src).toContain("useState<FeatSlot>('origin')");
    expect(src).toContain('slot,');
  });

  it('passes level, abilities and already-taken feats into the check', () => {
    // Without these the prerequisites cannot be evaluated and everything looks legal.
    expect(src).toContain('level: char.meta.level');
    expect(src).toContain('abilities: char.abilities');
    expect(src).toContain('takenFeatKeys');
  });

  it('shows WHY a feat is barred instead of hiding it', () => {
    // "Why can't I take Grappler?" is a question the sheet should answer; hiding it just makes
    // the list look arbitrary.
    expect(src).toContain('elig.reason');
    expect(src).toContain('＋ Anyway');
  });

  it('is 2024-scoped, with an honest empty state elsewhere', () => {
    expect(src).toContain("system === 'dnd5e-2024' ? FEATS_2024 : []");
    expect(src).toContain('No feat library for this game system yet');
  });

  it('carries the feat’s real benefit text onto the sheet', () => {
    // The whole point over hand-typing: the feature arrives with its actual rules.
    expect(src).toContain('body: [f.benefit]');
    expect(src).toContain('feat`,'); // source names the category, e.g. "Origin feat"
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
