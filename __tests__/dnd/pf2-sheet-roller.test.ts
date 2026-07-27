// __tests__/dnd/pf2-sheet-roller.test.ts — Area R1b/IGS6, PF2 parity. The PF2 sheet's in-app roller: tap a
// save/skill/Strike to roll it (or a Strike's damage) through the shared engine. Source-anchors the wiring.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The roller + all tap-to-roll wiring was extracted into the PF2 panel set (usePf2Panels, T-5a);
// the Classic shell (PF2Sheet) is now thin. Read both so these anchors hold wherever they live.
const sheet = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2Sheet.tsx'), 'utf8')
  + readFileSync(join(process.cwd(), 'app/dnd/_ui/pf2/usePf2Panels.tsx'), 'utf8');

describe('PF2 sheet is interactive — tap to roll (R1b)', () => {
  it('uses the shared roll engine with the pathfinder2e system (four-step degrees)', () => {
    expect(sheet).toContain("from '@/lib/dnd/roll'");
    expect(sheet).toContain("system: 'pathfinder2e'");
  });

  it('publishes each roll to the shared animated roller — feed + stage, not a static banner (RO-5b)', () => {
    // The old generic banner was replaced by the shared animated roller: PF2 shapes every roll into an
    // ActiveRoll and pushes it onto the feed the animated stages read. The roll is still fully resolved
    // (total/detail/tone computed for the shaping); it just renders through the roller now.
    expect(sheet).toContain('setActiveRoll(buildD20ActiveRoll(');   // d20 saves/skills/strikes → the feed
    expect(sheet).toContain('setActiveRoll(buildDamageActiveRoll('); // damage → the feed
    expect(sheet).toContain('RollFeedProvider');                     // the roller node provides the feed
    expect(sheet).toContain('rollerStageFor(rollerId)');             // …and mounts the chosen animated stage
  });

  it('saves, skills, Strikes AND Strike damage are all tap-to-roll', () => {
    expect(sheet).toMatch(/rollLine\(`\$\{s\} save`/);           // saves
    expect(sheet).toMatch(/rollLine\(`\$\{sk\.name\} \(\$\{sk\.attribute\}\)`/); // skills
    expect(sheet).toMatch(/rollLine\(`\$\{a\.name\} Strike/);    // Strikes (to-hit)
    // Damage now rolls the RESOLVED expression, not the raw stored die (S15d). `a.damage` is the
    // base die; traits, striking runes and the attribute modifier are applied by pf2ResolveStrike,
    // so rolling `a.damage` directly would ignore every one of them.
    expect(sheet).toMatch(/rollDamage\(`\$\{a\.name\} damage`, strike\.damage\)/);
  });

  it('AO-2 — offers all four roller templates via the on-roller picker', () => {
    // The template picker (RollerTemplateBar) is mounted in the PF2 roller node, and the chosen id resolves
    // through rollerStageFor (Dice Core / Sigil / Board / Impact) — so every template is reachable + switchable
    // on PF2, exactly as on 5e.
    expect(sheet).toContain('RollerTemplateBar');
    // The chosen template resolves through the client-cache helper (instant switching), then the stage.
    expect(sheet).toContain('effectiveRollerChoice(');
    expect(sheet).toContain('rollerStageFor(rollerId)');
  });

  it('AO-2 — the roll carries its full information to the stage: degree, crit/fumble, and named modifiers', () => {
    // Degree-of-success tag vs the Target DC, and crit/fumble from the DEGREE when there is one.
    //
    // CORRECTED 2026-07-27. This assertion used to require `r.critical || r.degree === 'critical-success'`
    // — it pinned the defect as though it were the specification. That expression double-counts the die:
    // `fourStepDegree` has already spent the natural 20/1 shifting the degree, so reading it again makes a
    // natural 20 that lands on **Failure** animate as a critical. A nat 20 is not a critical success in
    // PF2; it is one step better than you rolled. The tone now comes from `rollTone(r)` — shared with the
    // IG roller, which carried the identical line. See `roll-tone-degrees.test.ts`.
    expect(sheet).toContain('degreeLabel(r.degree)');
    expect(sheet).toContain('const tone = rollTone(r);');
    expect(sheet).toContain("crit: tone === 'crit',");
    expect(sheet).toContain("fumble: tone === 'fumble',");
    // The named contributing modifiers reach the stage as boosts/penalties, so the breakdown shows even with
    // a Target DC set (where the tag becomes the degree) — "where did this +N come from" is always answered.
    expect(sheet).toContain('stat.applied.filter((m) => m.value > 0)');
    expect(sheet).toMatch(/boosts: boosts\.length/);
    expect(sheet).toMatch(/penalties: penalties\.length/);
  });

  it('AO-3 — Perception and Initiative are click-to-roll (a DC like Class DC is not)', () => {
    expect(sheet).toContain("rollLine('Perception', d.perception)");
    expect(sheet).toContain("rollLine('Initiative', d.perception)");
    // Class DC is a DC others roll against, not a d20 you roll — it stays display-only (no onRoll).
    expect(sheet).toMatch(/label="Class DC"[^>]*\/>/);
    expect(sheet).not.toMatch(/label="Class DC"[^>]*onRoll/);
  });

  it('rolls the RESOLVED statistic, so the card and the dice cannot disagree (S13b)', () => {
    // The bug this pins: the sheet displayed `pf2SaveTotal(...)` and rolled that number PLUS a
    // condition penalty added at the call site, so a Frightened character read +7 off the card and
    // rolled a 5. `rollLine` now takes the resolved stat itself — there is no second number to
    // drift, because the modifier it rolls is the one the card printed.
    expect(sheet).toContain('rollLine = (name: string, stat: PF2ResolvedStat)');
    expect(sheet).toContain('modifier: stat.total');
    // And it names its sources, per the slice's "the roller shows its work".
    expect(sheet).toContain('stat.breakdown');
    expect(sheet).toContain('suppressed');
    expect(sheet).toContain('situational');
  });
});
