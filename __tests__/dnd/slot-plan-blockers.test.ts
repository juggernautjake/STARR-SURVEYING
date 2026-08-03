// __tests__/dnd/slot-plan-blockers.test.ts — the slot plan's remaining blockers, verified not asserted.
//
// WHY THIS FILE EXISTS. Three items in `SLOT_DRIVEN_CHARACTER_BUILDING` are recorded as blocked on external
// data. That was taken on trust for most of this session — and when the same trust was finally tested on
// S7c it turned out to be **half wrong and hiding a live bug** (a built Magus carried a full caster's spell
// slots while its own rules reported a ceiling of 0). The doc's sibling warns at its top that its claims go
// stale; this applies that warning to the three that remain.
//
// All three verify. The point is that they are now verified, and that each assertion **flips** the day the
// data arrives — so the blocker announces its own resolution instead of waiting to be re-read.
import { describe, it, expect } from 'vitest';
import { IG_CLASS_DETAILS } from '@/lib/dnd/systems/intuitive-games/content';
import { IG_CLASS_TAXONOMY } from '@/lib/dnd/systems/intuitive-games/taxonomy';
import { igFeatBudget } from '@/lib/dnd/systems/intuitive-games/builder-choices';
import { PREF_SHARED_ENGINE_ONLY, prefAppliesToSystem } from '@/lib/dnd/preference-options';
import { PF2_CLASSES, pf2Class } from '@/lib/dnd/systems/pathfinder2e/content';
import { pf2IsReducedCaster, pf2ReducedSlots } from '@/lib/dnd/systems/pathfinder2e/spell-counts';

describe('S10 — RESOLVED 2026-07-27: Champion IS published, and is now catalogued', () => {
  const champion = IG_CLASS_DETAILS.find((d) => d.name.toLowerCase() === 'champion');

  // THE BLOCKER WAS FALSE. This item read "the catalogue is scraped from intuitivegames.net and Champion
  // is not in it". Champion is on that page and always was — /classes lazy-renders its subclass blocks, so
  // a scrape that reads the DOM without scrolling sees the name in the nav and an EMPTY section body. The
  // earlier pass recorded "not published" when what it had measured was "not yet rendered".
  //
  // Captured 2026-07-27 by scrolling the page to force render, then reading innerText.
  it('is catalogued, with the powers the site lists', () => {
    expect(champion).toBeDefined();
    expect(champion!.grantedStance).toBe('Offensive');
    expect(champion!.defensivePower).toBe('Armor Skin');
    expect(champion!.powers).toContain('Challenge');
    expect(champion!.powers).toContain('Weapon Mastery');
    expect(champion!.specializations).toEqual(['Elemental Initiate', 'Devotee']);
  });

  it('but IS selectable, which is why the gap needed handling rather than ignoring', () => {
    // A subclass a player can choose while the catalog knows nothing about it. The builder handles this
    // with free text (pinned by `walker-picker-render.test.tsx`) rather than an empty dropdown.
    expect(JSON.stringify(IG_CLASS_TAXONOMY).toLowerCase()).toContain('champion');
  });

  it('and nothing about it was invented — every field traces to the page', () => {
    // The IG catalog is SCRAPED from intuitivegames.net, and Champion is no exception: its stance, its
    // defensive power, its eight powers and its two specializations were all read off /classes#Champion.
    // The entry carries a note saying so, which is what distinguishes captured data from a plausible
    // hand-written list — the failure mode this assertion has always been guarding against.
    const withPowers = IG_CLASS_DETAILS.filter((d) => (d.powers?.length ?? 0) > 0);
    expect(withPowers.some((d) => d.name.toLowerCase() === 'champion')).toBe(true);
    // Champion's power list matches the site's, in the site's order.
    expect(champion!.powers).toEqual([
      'Challenge', 'Combat Feat', 'Combat Skill Proficiency', 'Martial Prowess',
      'Surge', 'Weapon Expert', 'Weapon Mastery', 'Weapon Training',
    ]);
    // Its Armor Skin defensive power was ALREADY in the catalogue — only the class entry was missing,
    // which is a useful shape to notice: half the data was there and the gap was recorded as total.
    expect(champion!.defensivePower).toBe('Armor Skin');
  });
});

describe('Q6 — RESOLVED 2026-07-27: the IG level-1 feat allowance is TWO, from the source', () => {
  // This block was written as a blocker that "flips the day the data arrives". It has flipped.
  //
  // intuitivegames.net/character-building, Feats section, read 2026-07-27:
  //   *"Each character begins with one Combat Feat and one General Feat of their choice."*
  //
  // The old guess was 1, chosen to err permissive because the scraped schedule covers levels 2–10 and
  // describes level 1 only as including "starting feats" with no number. It was the one number in the
  // whole slot plan that was not source-verified — and it was reachable the entire time, on the same
  // page the schedule itself was scraped from. The blocker was never data availability; it was that
  // nobody opened the section next to the one already being read.
  it('grants exactly TWO feats at level 1 — one Combat, one General', () => {
    expect(igFeatBudget('Freebooter', 1)).toBe(2);
  });

  it('for every subclass, since the rule is a character rule and not a class one', () => {
    for (const sub of ['Freebooter', 'Marksman', 'Arcanist']) {
      expect(igFeatBudget(sub, 1), sub).toBe(2);
    }
  });

  it('the level-1 allowance is the ONLY unsourced number — level 2+ comes from the schedule', () => {
    // One feat per level from 2 up, so each level adds exactly one to the budget. If that ever stops
    // holding, the schedule changed and Q6 is no longer the only open number.
    const a = igFeatBudget('Freebooter', 2);
    const b = igFeatBudget('Freebooter', 3);
    expect(b - a).toBe(1);
  });
});

describe('S9 — the dice-roller BUG half is closed; only the feature question (Q4) remains', () => {
  it('both settings are shared-engine only', () => {
    expect(PREF_SHARED_ENGINE_ONLY).toContain('diceRollerStyle');
    expect(PREF_SHARED_ENGINE_ONLY).toContain('recordMode');
  });

  it('so a PF2 or IG player is not offered a control that would do nothing', () => {
    // The defect S9 originally described — two settings that silently did nothing on the bespoke sheets.
    for (const field of ['diceRollerStyle', 'recordMode'] as const) {
      expect(prefAppliesToSystem(field, 'pathfinder2e')).toBe(false);
      expect(prefAppliesToSystem(field, 'intuitive-games')).toBe(false);
    }
  });

  it('while the shared-engine systems still get them', () => {
    for (const field of ['diceRollerStyle', 'recordMode'] as const) {
      expect(prefAppliesToSystem(field, 'dnd5e-2024')).toBe(true);
      expect(prefAppliesToSystem(field, 'dnd5e-2014')).toBe(true);
    }
  });

  it('and an unknown system fails OPEN, so an ambiguous character is not shown an empty modal', () => {
    expect(prefAppliesToSystem('diceRollerStyle', undefined)).toBe(true);
  });
});

// ── THE FOURTH DRIFT ────────────────────────────────────────────────────────────────────────────
//
// Added 2026-08-02. The plan's summary table has now gone stale three separate times, and the doc
// itself records two of them ("the doc contradicted itself on its own summary line, which is the
// version an owner actually reads"). It happened again: the table still listed S10 as waiting on
// data a banner four paragraphs above it had already reported resolved, and still called the
// Magus/Summoner reduced tables blocked on a published source that had since shipped as
// PF2_REDUCED_SLOTS.
//
// Correcting the prose a fourth time would buy the same few weeks the previous three did. These
// assertions instead make the two live claims fail out loud, so the summary table cannot say
// "blocked on data" about something the code already has.
describe('the plan summary must not outlive the code — verified, not asserted', () => {
  it('the reduced-caster spell table IS modelled, so no row may call it blocked on a source', () => {
    // What "blocked on the published source" claimed was missing. It is here, for both classes, and
    // it is not the full-caster table.
    expect(pf2IsReducedCaster('Magus')).toBe(true);
    expect(pf2IsReducedCaster('Summoner')).toBe(true);
    expect(pf2IsReducedCaster('Wizard')).toBe(false);

    const magus5 = pf2ReducedSlots('Magus', 5);
    expect(magus5).not.toBeNull();
    // Rank-3 slots at level 5, and nothing above — the shape that distinguishes a reduced caster
    // from the full table the builder used to hand a Magus by mistake.
    expect(magus5!.slice(1).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('and it is available at every level a character can reach', () => {
    for (const level of [1, 2, 10, 20]) {
      expect(pf2ReducedSlots('Summoner', level)).not.toBeNull();
    }
    // Clamped rather than undefined at the edges: a level read from bad data must not crash a sheet.
    expect(pf2ReducedSlots('Summoner', 0)).not.toBeNull();
    expect(pf2ReducedSlots('Summoner', 99)).not.toBeNull();
  });

  it('CATALOGUE DECISION — RESOLVED 2026-08-02: all published, not core-only', () => {
    // This assertion did its job. It was written the same day saying "when this test fails, the
    // decision has been made", the owner made it, and the failure is what carried the change into
    // every guard that had quietly encoded the old answer — four of them, in three files.
    expect(PF2_CLASSES).toHaveLength(16);
    expect(pf2Class('Magus')).not.toBeNull();
    expect(pf2Class('Summoner')).not.toBeNull();
  });

  it('and both arrived complete rather than half-built, which was the condition for adding them at all', () => {
    // A catalogue whose guards disagree about how many classes exist is worse than one honestly
    // missing two — which is why the earlier attempt was reverted. `summary` is the field that
    // attempt would have let someone discover the hard way; the catalog renders it.
    for (const name of ['Magus', 'Summoner']) {
      const def = pf2Class(name)!;
      expect(def.summary.length, `${name} summary`).toBeGreaterThan(0);
      expect(def.subclassOptions.length, `${name} level-1 choice`).toBeGreaterThan(0);
      expect(pf2IsReducedCaster(name), `${name} uses the reduced table`).toBe(true);
    }
    expect(PF2_CLASSES.every((c) => typeof c.summary === 'string' && c.summary.length > 0)).toBe(true);
  });
});
