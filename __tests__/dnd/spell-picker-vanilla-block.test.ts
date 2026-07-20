// __tests__/dnd/spell-picker-vanilla-block.test.ts — the picker enforces, it no longer merely warns (S3).
//
// The reported bug: a level-4 vanilla Wizard could add Wish. The picker showed an "above your
// slots" chip and then added it anyway. This pins the three behaviours that fix it — vanilla is
// blocked, custom is allowed AND marked, the DM is never blocked — at both layers: the shared
// eligibility core (the real decision) and the component wiring (that the decision is actually
// consulted and obeyed).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spellEligibility } from '@/lib/dnd/spells/eligibility';
import { spellsForSystem } from '@/lib/dnd/spells';
import { spellFromCatalog } from '@/app/dnd/_sheet/components/ui/SpellPicker';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const src = read('app/dnd/_sheet/components/ui/SpellPicker.tsx');

const catalog = spellsForSystem('dnd5e-2024');
const byName = (n: string) => {
  const s = catalog.find((x) => x.name.toLowerCase() === n.toLowerCase());
  if (!s) throw new Error(`${n} missing from the 2024 catalog — the test's premise is gone, not the feature`);
  return s;
};

// The exact character from the bug report.
const wizard4 = { system: 'dnd5e-2024', className: 'Wizard', level: 4 };

describe('the reported bug is decided against, at the source of truth', () => {
  it('a level-4 Wizard is refused Wish', () => {
    const v = spellEligibility(byName('Wish'), wizard4);
    expect(v.ok).toBe(false);
    expect(v.reason).toBeTruthy();
  });

  it('and refused a Cleric spell they could never learn', () => {
    expect(spellEligibility(byName('Sacred Flame'), wizard4).ok).toBe(false);
  });

  it('but still allowed their own level-appropriate spells', () => {
    // The block must not be so blunt that it breaks normal play — this is the case that would
    // make the builder wrong in the OTHER direction.
    expect(spellEligibility(byName('Magic Missile'), wizard4).ok).toBe(true);
    expect(spellEligibility(byName('Fire Bolt'), wizard4).ok).toBe(true);
  });
});

describe('the picker consults that decision and obeys it', () => {
  it('calls the shared core rather than re-deriving the rules inline', () => {
    expect(src).toContain("from '@/lib/dnd/spells/eligibility'");
    expect(src).toContain('spellEligibility(s, eligCtx)');
    // The ad-hoc checks this replaced must be gone, or two sources of truth drift apart.
    expect(src).not.toContain('const offList =');
    expect(src).not.toContain('const tooHigh =');
  });

  it('blocks only a vanilla, non-DM character', () => {
    expect(src).toContain('const blocked = isVanilla && !elig.ok && !isDM');
    expect(src).toContain('disabled={blocked}');
  });

  it('refuses the add even if the disabled button is bypassed', () => {
    // A `disabled` attribute is an affordance, not an enforcement point. The handler must
    // re-check, or a stale render / programmatic click walks straight through the block.
    expect(src).toMatch(/const add = \([\s\S]*?if \(isVanilla && !elig\.ok && !isDM\) return/);
  });

  it('labels the two paths differently so the player knows which one they are on', () => {
    expect(src).toContain("'✕ Blocked'");
    expect(src).toContain("'＋ Anyway'");
  });
});

describe('a custom character may take it, and the sheet remembers that it did', () => {
  it('an off-rules pick carries the reason', () => {
    const spell = spellFromCatalog(byName('Wish'), 0, 'level-9 spell; too high');
    expect(spell.offRules).toBe('level-9 spell; too high');
  });

  it('a legal pick carries no marker at all', () => {
    // Absent, not empty-string or false — anything rendering `offRules` should be able to test
    // it for truthiness without every legal spell showing a flag.
    const spell = spellFromCatalog(byName('Magic Missile'), 0);
    expect(spell.offRules).toBeUndefined();
    expect('offRules' in spell).toBe(false);
  });

  it('the marker never displaces the spell mechanics', () => {
    // The whole point of picking from the library is the populated stat block; a flagged spell
    // must still be a fully working spell.
    const spell = spellFromCatalog(byName('Wish'), 0, 'off-list');
    expect(spell.name).toBe('Wish');
    expect(spell.level).toBe(9);
    expect(spell.school).toBeTruthy();
  });

  it('a DM grant is marked as a grant, not as the player breaking the rules', () => {
    expect(src).toContain('granted by the DM');
  });
});
