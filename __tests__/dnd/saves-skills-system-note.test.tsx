// __tests__/dnd/saves-skills-system-note.test.tsx — the shared sheet admits when the skill list is not yours.
//
// The rules-platform doc carries this as a deferred data-model item, correctly: `SavesSkills` renders the
// hardcoded 5e `SKILLS` against `char.skills`, a 5e-keyed store, and system-scoping it needs a system-keyed
// skill-proficiency store — larger than a drop-in and a risk to the primary 5e path.
//
// What the deferral did NOT cover is that the wrong list renders SILENTLY, and that it is reachable. PF2 and
// IG have bespoke sheets, but those only render once the character has been BUILT — the page gates on
// `isIGCharacter(data.ig)` — so an IG character created and not yet built falls through to this shared
// engine and is shown Arcana / Athletics / Deception as though they were its skills. They are not; IG has
// Arcane / Appraise / Bluff.
//
// So this slice does not fix the model. It stops the sheet asserting something untrue without saying so: a
// sheet that is wrong and silent is worse than one that is wrong and admits it, because only the second
// tells the player to go and build the character.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { systemSkills } from '@/lib/dnd/system-rules';
import { SKILLS } from '@/app/dnd/_sheet/rules/dnd';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/SavesSkills.tsx'), 'utf8');
const names = (system: string) => systemSkills(system as Parameters<typeof systemSkills>[0]).map((s) => s.name.toLowerCase());
const fiveE = new Set(SKILLS.map((s) => s.label.toLowerCase()));

describe('which systems the note should fire for', () => {
  it('NOT for either 5e edition — the lists are identical, so a note would be noise', () => {
    for (const sys of ['dnd5e-2014', 'dnd5e-2024']) {
      const missing = names(sys).filter((n) => !fiveE.has(n));
      expect(missing, `${sys} should match the sheet's own SKILLS`).toEqual([]);
    }
  });

  it('for Intuitive Games, whose skills genuinely differ', () => {
    const missing = names('intuitive-games').filter((n) => !fiveE.has(n));
    expect(missing.length, 'IG should have skills 5e does not').toBeGreaterThan(0);
    expect(missing).toContain('appraise');   // the concrete example in the doc
  });

  it('for Pathfinder 2e, which is reachable the same way before a build', () => {
    const missing = names('pathfinder2e').filter((n) => !fiveE.has(n));
    expect(missing.length).toBeGreaterThan(0);
  });

  it('NOT for an untracked/ambiguous system — nothing is known, so nothing is claimed', () => {
    expect(names('ambiguous')).toEqual([]);
  });
});

describe('the component derives it rather than hardcoding a system list', () => {
  it('reads the shared rules catalog', () => {
    // A hardcoded ['intuitive-games','pathfinder2e'] would go stale the day a fifth system's skills land.
    expect(SRC).toContain("from '@/lib/dnd/system-rules'");
    expect(SRC).toContain('systemSkills(key)');
  });

  it('compares by name, case-insensitively, so 5e never trips its own note', () => {
    expect(SRC).toContain('s.label.toLowerCase()');
    expect(SRC).toContain('s.name.toLowerCase()');
  });

  it('returns null for a system with no catalogued skills', () => {
    expect(SRC).toContain('if (!own.length) return null');
  });

  it('names the system and gives real examples, not a vague warning', () => {
    // "Some skills may differ" tells a player nothing they can act on.
    expect(SRC).toContain('systemLabel(key)');
    expect(SRC).toMatch(/missing\.slice\(0, 3\)\.map\(\(s\) => s\.name\)\.join\(/);
  });

  it('points at the fix the player can actually take', () => {
    expect(SRC).toContain('build this character in its own builder');
  });
});

describe('what this deliberately does NOT do', () => {
  it('leaves the 5e-keyed store and the rendered rows alone', () => {
    // The note is additive. Swapping the rendered list without a system-keyed store would break the
    // proficiency toggles, which read `char.skills[sk.key]` — the reason the real fix is deferred.
    expect(SRC).toContain('{SKILLS.map((sk) => {');
    expect(SRC).toContain('char.skills[sk.key]');
  });
});
