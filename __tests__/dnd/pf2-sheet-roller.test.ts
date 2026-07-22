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
