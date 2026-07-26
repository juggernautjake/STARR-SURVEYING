// __tests__/dnd/spell-count-enforcement.test.ts — the spell counts now BITE (slot plan S7b).
//
// S7 landed the count source; this is the half that refuses a pick. The whole risk of it is aiming the cap
// at the wrong list, so that is what most of this file is about.
//
// ── The trap ──────────────────────────────────────────────────────────────────────────────────────────
// `spellsKnown` means two different things by edition (see `lib/dnd/classes/types.ts`):
//   · a 2014 KNOWING class — the size of its known list. The sheet's spell list IS that list, so capping
//     the picker is exactly right.
//   · a 2024 PREPARER — the number it PREPARES. The sheet's spell list is NOT that: a Wizard's spellbook
//     and a Cleric's access to the entire Cleric list are both far larger than the number prepared.
// Capping a preparer's picker by its prepared count would refuse spells the class plainly has — so the
// picker caps only cantrips and known-lists, and the prepared number is enforced on the TOGGLE instead.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spellCountsFor } from '@/lib/dnd/spells/counts';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const PICKER = read('app/dnd/_sheet/components/ui/SpellPicker.tsx');
const PANEL = read('app/dnd/_sheet/components/SpellsPanel.tsx');

describe('the cap is aimed at the right list', () => {
  it('a KNOWING class caps its levelled spells in the picker', () => {
    const bard = spellCountsFor('dnd5e-2014', 'Bard', 1);
    expect(bard.prepares).toBe(false);
    expect(bard.spellsKnown).toBe(4);
    // The picker's guard: `if (counts.prepares || counts.spellsKnown == null) return null`.
    expect(PICKER).toContain('if (counts.prepares || counts.spellsKnown == null) return null');
  });

  it('a PREPARER is NOT capped in the picker — its list is bigger than its prepared count', () => {
    const wizard = spellCountsFor('dnd5e-2024', 'Wizard', 5);
    expect(wizard.prepares).toBe(true);
    // A level-5 2024 Wizard prepares 9 but its spellbook holds ~14 by the book's own progression, and a
    // Cleric may hold the entire Cleric list. A picker cap here would refuse legal spells.
    expect(wizard.spellsKnown).toBe(9);
    expect(PICKER).toContain('this class PREPARES from its list');
  });

  it('cantrips ARE capped for everyone — they are a known list in both editions', () => {
    expect(spellCountsFor('dnd5e-2024', 'Wizard', 1).cantripsKnown).toBe(3);
    expect(spellCountsFor('dnd5e-2014', 'Bard', 1).cantripsKnown).toBe(2);
    expect(PICKER).toMatch(/if \(def\.level === 0\)[\s\S]*counts\.cantripsKnown != null/);
  });

  it('the preparer\'s number bites on the prepared TOGGLE instead', () => {
    expect(PANEL).toContain('function togglePrepared');
    expect(PANEL).toMatch(/togglePrepared[\s\S]*preparedCap != null[\s\S]*held >= preparedCap/);
  });
});

describe('what is never counted', () => {
  it('always-prepared spells are excluded — every class rule says they do not count', () => {
    // "Domain spells are always prepared and never count against this number." — 2024 Cleric, verbatim.
    expect(spellCountsFor('dnd5e-2024', 'Cleric', 1).preparedRule).toContain('never count against this number');
    expect(PICKER).toContain('!s.alwaysPrepared');
    expect(PANEL).toContain('!s.alwaysPrepared');
  });

  it('cantrips do not count against the prepared number', () => {
    expect(PANEL).toMatch(/target\.level > 0 && !target\.alwaysPrepared/);
  });
});

describe('nobody who is already over the cap gets broken', () => {
  it('the picker grandfathers with `>=` rather than removing anything', () => {
    // Q5's recorded assumption: grandfather and mark, never silently delete a player's content. Several
    // demo characters hold more spells than their class grants; deleting to fit would be the worse bug.
    expect(PICKER).toMatch(/cantripsHeld >= counts\.cantripsKnown/);
    expect(PICKER).toMatch(/knownHeld >= counts\.spellsKnown/);
  });

  it('the toggle grandfathers too, and never un-prepares anything', () => {
    expect(PANEL).toContain('if (held >= preparedCap) return c');
    // Un-preparing must always work, or an over-cap character can never get back under it.
    expect(PANEL).toMatch(/target && !target\.prepared/);
  });
});

describe('who the cap applies to', () => {
  it('a DM is never blocked — granting past the count is a legitimate DM act', () => {
    expect(PICKER).toContain('isVanilla && !isDM ? overCount(s) : null');
  });

  it('a CUSTOM character is not capped, the same rule the eligibility gate already uses', () => {
    expect(PICKER).toContain('isRulesEnforcedKind');
    expect(PICKER).toContain('if (isVanilla && !isDM && overCount(def)) return');
  });

  it('the guard is in `add`, not only on the disabled attribute', () => {
    // The file's own standing note: "a disabled attribute is a UI affordance, not a rule."
    expect(PICKER).toContain('a disabled attribute is a UI affordance, not a rule');
    expect(PICKER).toContain('if (isVanilla && !isDM && overCount(def)) return');
  });
});

describe('the player is told the number before they hit it', () => {
  it('shows a running budget in the picker', () => {
    // A cap discovered only by being refused reads as a bug; the same number shown while choosing reads
    // as a rule.
    expect(PICKER).toMatch(/Cantrips \{cantripsHeld\}\/\{counts\.cantripsKnown\}/);
    expect(PICKER).toMatch(/Spells known \{knownHeld\}\/\{counts\.spellsKnown\}/);
  });

  it('says "no room", not "not available" — the spell IS legal, they are just full', () => {
    // Saying the same thing for both would send a player hunting for a prerequisite that is not the
    // problem.
    expect(PICKER).toContain('no room');
    expect(PICKER).toContain('No room: ${full}');
  });
});
