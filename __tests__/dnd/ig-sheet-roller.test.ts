// __tests__/dnd/ig-sheet-roller.test.ts — Area R1b/IGS6. The IG sheet's in-app roller: tapping a save,
// skill, or attack rolls it through the shared engine and shows the result in a banner. Source-anchors the
// wiring so a refactor that dropped the interactivity (back to static numbers) fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The roller wiring moved into the IG panel set (useIgPanels, T-6a); the Classic shell (IGSheet) is now
// thin. Read both so the tap-to-roll anchors hold wherever the code lives.
const sheet = readFileSync(join(process.cwd(), 'app/dnd/_ui/IGSheet.tsx'), 'utf8')
  + readFileSync(join(process.cwd(), 'app/dnd/_ui/ig/useIgPanels.tsx'), 'utf8');

describe('IG sheet is interactive — tap to roll (R1b / IGS6)', () => {
  it('uses the shared roll engine (resolveD20Roll + rollNaturalD20), not a bespoke roller', () => {
    expect(sheet).toContain("from '@/lib/dnd/roll'");
    // The roller resolves through the shared engine — a `natural` d20 (rolled once, or the lower of two for a
    // condition-disadvantaged roll) fed to resolveD20Roll. Assert both pieces rather than one literal call, so
    // the condition auto-fold (Area R2) doesn't trip a too-literal source match.
    expect(sheet).toContain('resolveD20Roll({ natural,');
    expect(sheet).toContain('rollNaturalD20()');
  });

  it('publishes each roll to the shared animated roller — feed + stage, not a static banner (RO-5c)', () => {
    // The old generic result banner was replaced by the shared animated roller: every roll is shaped into an
    // ActiveRoll and pushed onto the feed the four animated stages read. The roll is still fully resolved
    // (label/total/detail/tone are still computed for the shaping); it just renders through the roller now.
    expect(sheet).toContain('setActiveRoll(buildD20ActiveRoll(');   // d20 checks/saves/attacks → the feed
    expect(sheet).toContain('setActiveRoll(buildDamageActiveRoll('); // damage → the feed
    expect(sheet).toContain('RollFeedProvider');                     // the roller node provides the feed
    expect(sheet).toContain('rollerStageFor(rollerId)');             // …and mounts the chosen animated stage
    expect(sheet).toMatch(/tone:/); // crit/fumble/normal still computed per roll
  });

  it('saves, skills, attacks (to-hit), damage AND ability checks are all tap-to-roll', () => {
    expect(sheet).toMatch(/rollLine\(`\$\{k\} check`/);        // ability checks
    expect(sheet).toMatch(/rollLine\(`\$\{s\} save`/);         // saves
    expect(sheet).toMatch(/rollLine\(`\$\{s\.name\} \(\$\{s\.ability\}\)`/); // skills
    expect(sheet).toMatch(/rollLine\(`\$\{a\.name\} attack`/); // attacks (to-hit)
    expect(sheet).toMatch(/rollDamage\(`\$\{a\.name\} damage`, r\.damage\)/); // damage dice
  });

  it('damage uses the dice-expression roller', () => {
    expect(sheet).toContain('rollDiceExpr');
  });
});
