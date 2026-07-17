// __tests__/dnd/saves-skills-effective.test.ts — Slice 10 completion: EVERY derived number on the
// Saves & Skills card reads the ledger-effective abilities, not the base scores. Passive Perception and
// the Save DC were the two that still read char.abilities directly — so a WIS/STR-boosting item moved
// every save and skill on the card but silently left those two stale. Source-anchored guard.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PANEL = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/SavesSkills.tsx'), 'utf8');

describe('Saves & Skills derived numbers use the ledger-effective abilities', () => {
  it('Passive Perception reads the effective `abilities`, not base char.abilities', () => {
    expect(PANEL).toContain('abilityMod(abilities.wis)'); // passive perception
  });
  it('the Save DC reads the store single-source saveDc (effective STR + override — see save-dc-single-source)', () => {
    expect(PANEL).toContain('const saveDC = saveDc');
  });
  it('does not regress to the base scores', () => {
    expect(PANEL).not.toContain('abilityMod(char.abilities.wis)');
    expect(PANEL).not.toContain('abilityMod(char.abilities.str)');
  });

  it('folds the ledger save/skill bonus targets so those effects reach the mod + roll', () => {
    // The dedicated <ability>_saves / all_saves / skill.<key> / all_skills roll targets were resolved
    // only by the now-dead deriveCharacter engine, so a Cloak-of-Protection-style +saves or a +skill item
    // never reached the SavesSkills card. Now folded like initiative/death_save (no-op without effects).
    expect(PANEL).toContain("ledger.value(`${a.key}_saves`, 0) + ledger.value('all_saves', 0)");
    expect(PANEL).toContain("ledger.value(`skill.${sk.key}`, 0) + ledger.value('all_skills', 0)");
  });

  it('folds the ledger advantage/disadvantage flags on saves + skills (not just the numeric bonus)', () => {
    // A ledger effect granting advantage on a save/skill roll must reach it, combined with the hardcoded
    // feature flags (Danger Sense, Base Form). rollFlagsUnion ORs the target flags; the roll passes both.
    expect(PANEL).toContain('rollFlagsUnion(`${a.key}_saves`, \'all_saves\')');
    expect(PANEL).toContain('rollFlagsUnion(`skill.${sk.key}`, \'all_skills\')');
    expect(PANEL).toContain('advantage: isDex || saveEf.advantage, disadvantage: saveEf.disadvantage');
    expect(PANEL).toContain('advantage: stealthAdv || skillEf.advantage, disadvantage: skillEf.disadvantage');
  });

  it('the ★ marker watches the SAME bonus targets the roll folds — so a +saves/+skill item is explainable', () => {
    // The gap this closes: the mod folds <ability>_saves/all_saves (and skill.<key>/all_skills), but the
    // EffectStar used to watch ONLY the ability target — so a Cloak of Protection's all_saves +1 moved the
    // number while lighting no ★, an unexplainable bonus. The star's targets must mirror the roll's folds.
    expect(PANEL).toContain('target={[`ability_${a.key}`, `${a.key}_saves`, \'all_saves\']}');
    expect(PANEL).toContain('target={[`ability_${sk.ability}`, `skill.${sk.key}`, \'all_skills\']}');
  });
});
