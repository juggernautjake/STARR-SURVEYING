// __tests__/dnd/saves-skills-effective.test.ts — Slice 10 completion: EVERY derived number on the
// Saves & Skills card reads the ledger-effective abilities, not the base scores. Passive Perception and
// the Save DC were the two that still read char.abilities directly — so a WIS/STR-boosting item moved
// every save and skill on the card but silently left those two stale. Source-anchored guard.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PANEL = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/SavesSkills.tsx'), 'utf8');

describe('Saves & Skills derived numbers use the ledger-effective abilities', () => {
  it('Passive Perception and Save DC read the effective `abilities`, not base char.abilities', () => {
    expect(PANEL).toContain('abilityMod(abilities.wis)'); // passive perception
    expect(PANEL).toContain('abilityMod(abilities.str)'); // save DC
  });
  it('does not regress to the base scores for those two', () => {
    expect(PANEL).not.toContain('abilityMod(char.abilities.wis)');
    expect(PANEL).not.toContain('abilityMod(char.abilities.str)');
  });
});
