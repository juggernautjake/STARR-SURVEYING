// __tests__/dnd/level-builder-feat-gate.test.tsx — the TWO feat pickers must enforce the same rule.
//
// Slice 3 gated the Foundations picker with `featEligibilityForSystem`. The level walker has its own ASI
// feat dropdown, and it was already the better of the two — it filtered by category and minLevel, which
// Foundations did not. But after slice 3 they disagreed in the other direction: Foundations HARD-BLOCKED a
// feat whose ability prerequisite wasn't met, while the walker offered it with a "(needs STR 13)" hint.
// One rule, one edition, two enforcement levels, depending on which screen you happened to be on.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { featEligibilityForSystem } from '@/lib/dnd/feats/eligibility';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_ui/LevelBuilder.tsx'), 'utf8');

describe('the level walker gates ASI feats like the Foundations picker', () => {
  it('runs the shared eligibility gate, not a local rule', () => {
    expect(SRC).toContain('featEligibilityForSystem');
    expect(SRC).toMatch(/slot: 'asi', level, abilities/);
  });

  it('takes the character’s ability scores from the page', () => {
    expect(SRC).toMatch(/abilities\?: Partial<Record<AbilityKey, number>>/);
    // S6f added a fifth argument (`hasSpellcasting`); this pins the scores are still passed, which is
    // what this test is about, without re-pinning an argument list that will keep growing.
    expect(SRC).toMatch(/asiFeatChoices\(system, current\.level, plan\?\.homebrewFeats \?\? \[\], abilities[,)]/);
  });

  it('falls back to the previous behaviour when scores are unknown, rather than hiding legal feats', () => {
    // Hiding choices we cannot judge would be the worse failure — a caller without abilities keeps the
    // hint-only list it always had.
    expect(SRC).toMatch(/if \(!abilities\) return pool;/);
  });

  it('keeps the prerequisite hint for the feats it DOES offer', () => {
    // The hint explains what a feat needs; it is not a substitute for the gate, and both belong.
    expect(SRC).toContain('prereqHint');
    expect(SRC).toMatch(/\(needs \$\{parts\.join\(', '\)\}\)/);
  });

  it('and the shared gate really does refuse an unmet ability prerequisite', () => {
    // The behaviour the wiring buys: Grappler needs STR 13.
    const low = { slot: 'asi' as const, level: 4, abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } };
    const high = { ...low, abilities: { ...low.abilities, str: 16 } };
    expect(featEligibilityForSystem('dnd5e-2024', 'Grappler', low).ok).toBe(false);
    expect(featEligibilityForSystem('dnd5e-2024', 'Grappler', high).ok).toBe(true);
  });

  it('leaves the custom-feat escape hatch in place', () => {
    // Gating is only defensible because there is an explicit way past it.
    expect(SRC).toContain('__custom__');
    expect(SRC).toContain('✎ Custom feat…');
  });
});

// S6f. Found by DRIVING the walker, not by reading it: the gate above was wired correctly and still made
// the builder worse, because it was wired to the wrong READING of Foundations. Foundations hard-blocks an
// ineligible feat by rendering it with its reason attached; this picker dropped it from the list. The rule
// was right and invisible, which is the failure mode a source-level test cannot see.
describe('an ineligible feat is explained, not hidden', () => {
  it('marks the feat with the gate’s own reason instead of dropping it', () => {
    // The map REPLACED a filter. Pinning the absence matters as much as the presence: a filter here is
    // what silently removed the choice, and re-adding one would restore the bug with the tests still green.
    expect(SRC).toMatch(/return v\.ok \? f : \{ \.\.\.f, blockedReason: v\.reason/);
    expect(SRC).not.toMatch(/return pool\.filter\(\(f\) => featEligibilityForSystem/);
  });

  it('shows the reason in the option itself, where the player is looking', () => {
    expect(SRC).toMatch(/⊘ \$\{f\.name\} — \$\{f\.blockedReason\}/);
  });

  it('keeps the ineligible option SELECTABLE, because the refusal is what raises the hatch', () => {
    // The whole point. A `disabled` option would explain the feat and still leave "+ Take it anyway"
    // unreachable — the pick has to be sendable for the server to refuse it. So the rendered <option>
    // for a blocked feat must carry no `disabled`.
    const opt = SRC.slice(SRC.indexOf('{choices.map((f) => ('));
    const end = opt.indexOf('))}');
    expect(end).toBeGreaterThan(0);
    expect(opt.slice(0, end)).not.toContain('disabled');
  });

  it('tells the gate whether the character casts, so a caster is not refused War Caster', () => {
    // The bug the reasons exposed. While ineligible feats were HIDDEN this silently dropped War Caster
    // from every caster's list; once shown, it would have labelled a Wizard's legal feat as blocked.
    expect(SRC).toMatch(/has: hasSpellcasting \? \['spellcasting'\] : \[\]/);
    expect(SRC).toMatch(/asiFeatChoices\(system, current\.level, plan\?\.homebrewFeats \?\? \[\], abilities, hasSpellcasting\)/);
    // And the page must actually pass it — the prop existing is not the prop being supplied.
    const PAGE = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/builder/page.tsx'), 'utf8');
    expect(PAGE).toMatch(/hasSpellcasting=\{!!data\.spellcasting\?\.ability \|\| \(data\.spells\?\.length \?\? 0\) > 0\}/);
  });

  it('and the gate really does turn on that flag', () => {
    const base = { slot: 'asi' as const, level: 12, abilities: { str: 19, dex: 14, con: 15, int: 11, wis: 13, cha: 13 } };
    expect(featEligibilityForSystem('dnd5e-2024', 'war-caster', { ...base, has: [] }).ok).toBe(false);
    expect(featEligibilityForSystem('dnd5e-2024', 'war-caster', { ...base, has: ['spellcasting'] }).ok).toBe(true);
  });

  it('and the reason it shows is a real sentence, not an empty string', () => {
    // If the gate ever returned `ok: false` with no reason, the label would read "⊘ Grappler — ".
    const v = featEligibilityForSystem('dnd5e-2024', 'Grappler', {
      slot: 'asi', level: 4, abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
    });
    expect(v.ok).toBe(false);
    expect((v.reason ?? '').trim().length).toBeGreaterThan(0);
  });
});
