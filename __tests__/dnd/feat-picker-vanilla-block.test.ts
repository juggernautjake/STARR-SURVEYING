// __tests__/dnd/feat-picker-vanilla-block.test.ts — feats get the same hard block as spells (S4).
//
// The feat picker already ran every feat through `featEligibility` and showed the reason — but
// then offered "＋ Anyway" to EVERYONE, which made "rules-legal by default" a suggestion. The
// eligibility logic was never the gap; the gate was.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { featEligibility } from '@/lib/dnd/feats/eligibility';
import { FEATS_2024 } from '@/lib/dnd/feats/dnd5e-2024';

const src = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/ui/FeatPicker.tsx'), 'utf8');

const feat = (name: string) => {
  const f = FEATS_2024.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!f) throw new Error(`${name} missing from FEATS_2024 — the test's premise is gone, not the feature`);
  return f;
};

describe('the eligibility core still decides (unchanged by this slice)', () => {
  it('a general feat is not legal in an Origin slot', () => {
    const general = FEATS_2024.find((f) => f.category === 'general');
    expect(general).toBeTruthy();
    const v = featEligibility(general!, { slot: 'origin', level: 1, abilities: {}, takenFeatKeys: [], has: [] });
    expect(v.ok).toBe(false);
    expect(v.reason).toBeTruthy();
  });

  it('an origin feat IS legal in an Origin slot at level 1', () => {
    // The guard against over-blocking: breaking legal picks is worse than the permissiveness
    // this slice removes.
    const origin = FEATS_2024.find((f) => f.category === 'origin');
    expect(origin).toBeTruthy();
    expect(featEligibility(origin!, { slot: 'origin', level: 1, abilities: {}, takenFeatKeys: [], has: [] }).ok).toBe(true);
  });

  it('an epic boon is barred well below its level', () => {
    const boon = FEATS_2024.find((f) => f.category === 'epic-boon');
    if (!boon) return; // catalog may not carry boons yet; the slot rules above still hold
    expect(featEligibility(boon, { slot: 'asi', level: 4, abilities: {}, takenFeatKeys: [], has: [] }).ok).toBe(false);
  });
});

describe('the picker now gates on it instead of only narrating it', () => {
  it('blocks a vanilla, non-DM character', () => {
    expect(src).toContain('const isVanilla = variantKind === ');
    expect(src).toContain('const blocked = isVanilla && !elig.ok && !isDM');
    expect(src).toContain('disabled={blocked}');
  });

  it('reads variantKind from the sheet context', () => {
    expect(src).toMatch(/useChar\(\)[\s\S]{0,80}variantKind|variantKind[\s\S]{0,40}=\s*useChar/);
    expect(src).toContain('variantKind');
  });

  it('re-checks inside add(), not just on the button', () => {
    expect(src).toMatch(/const add = \([\s\S]*?if \(isVanilla && !elig\.ok && !isDM\) return/);
  });

  it('still offers "＋ Anyway" — but now only where it is allowed', () => {
    // Custom characters keep the escape hatch; that is the whole point of building custom.
    expect(src).toContain("'＋ Anyway'");
    expect(src).toContain("'✕ Blocked'");
  });

  it('marks what a custom character took outside the rules', () => {
    expect(src).toContain('offRules');
    expect(src).toContain('granted by the DM');
  });

  it('shows the reason either way, rather than hiding the feat', () => {
    // "Why can't I take Grappler?" stays answerable — the row is greyed, not removed.
    expect(src).toContain('elig.reason');
    expect(src).not.toContain('.filter((f) => elig.ok');
  });
});
