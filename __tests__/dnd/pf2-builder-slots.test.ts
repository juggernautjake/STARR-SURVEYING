// __tests__/dnd/pf2-builder-slots.test.ts — PF2 Foundations picks are bounded and slot-attributed (S4).
//
// The owner's report: "at every level we get access to all spells and feats … they can click on as many as
// they want. We shouldn't be able to give 10 different feats to a character at level 2."
//
// PF2 is the sharpest case because it already knew better. `pf2PlanLevelUp` is fully slot-driven — one
// prompt per (level, TRACK: ancestry/class/skill/general) — and `pf2LevelBreakdown` returns exactly which
// tracks each level grants. The builder even DISPLAYED the number ("3 chosen · 7 owed by level 12"). Then it
// stored a flat `feats: string[]` behind an unbounded toggle and `assemblePF2VanillaCharacter` wrote
// `pf2Build` with no `choices`, so: any number of feats could be taken, none was attached to a slot, and the
// walker re-asked for every one. Computed, displayed, thrown away.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  pf2FeatSlots, pf2FeatSlotCount, pf2BuilderChoicesFor, mergePf2BuilderChoices,
} from '@/lib/dnd/systems/pathfinder2e/builder-choices';
import { pf2PlanLevelUp, pf2LevelBreakdown, type PF2RecordedChoice } from '@/lib/dnd/systems/pathfinder2e/levelup';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the class schedule defines the slots', () => {
  it('a level-1 Fighter has very few feat slots — certainly not thirty', () => {
    const n = pf2FeatSlotCount('Fighter', 1);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(3); // ancestry/class/skill at level 1 at most
  });

  it('slots accumulate with level and each names its track', () => {
    const at1 = pf2FeatSlotCount('Fighter', 1);
    const at12 = pf2FeatSlotCount('Fighter', 12);
    expect(at12).toBeGreaterThan(at1);
    for (const s of pf2FeatSlots('Fighter', 12)) {
      expect(['ancestry', 'class', 'skill', 'general']).toContain(s.track);
      expect(s.level).toBeLessThanOrEqual(12);
    }
  });

  it('matches the breakdown the builder already displayed — one source, not two', () => {
    // The caption used `pf2LevelBreakdown(...).reduce(sum of featTracks.length)`; the cap must be the
    // same number or the label and the limit would contradict each other on screen.
    for (const [cls, lvl] of [['Fighter', 12], ['Wizard', 7], ['Rogue', 20]] as const) {
      const caption = pf2LevelBreakdown(cls, lvl).reduce((n, s) => n + s.featTracks.length, 0);
      expect(pf2FeatSlotCount(cls, lvl), `${cls}@${lvl}`).toBe(caption);
    }
  });

  it('no class chosen yet → no slots claimed', () => {
    expect(pf2FeatSlots(undefined, 5)).toEqual([]);
  });

  it('an unknown class still gets a schedule, and it is the shared default', () => {
    // Two corrections I made while writing this, both worth keeping visible. Ancestry, skill and general
    // feats are granted by the GAME, not the class, so an unrecognised name still owes those — my first
    // version asserted zero slots and was wrong about the rules. And `pf2FeatLevelsFor` also has a default
    // CLASS-feat ladder, so a homebrew class name falls back to PF2's common schedule rather than to
    // nothing. Both are the right behaviour for a builder: an unknown class caps at a sane number instead
    // of going unbounded, which is the failure this whole slice is about.
    const slots = pf2FeatSlots('Not A Class', 5);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.length).toBe(pf2LevelBreakdown('Not A Class', 5).reduce((n, s) => n + s.featTracks.length, 0));
    for (const s of slots) expect(['ancestry', 'skill', 'general', 'class']).toContain(s.track);
  });
});

describe('picks are attributed to the slot they fill', () => {
  it('assigns feats earliest-first, carrying the track', () => {
    const slots = pf2FeatSlots('Fighter', 5);
    const out = pf2BuilderChoicesFor({ className: 'Fighter', level: 5, feats: ['Power Attack', 'Sudden Charge'] });
    const feats = out.filter((c) => c.kind === 'feat');
    expect(feats).toHaveLength(2);
    expect(feats[0]).toMatchObject({ level: slots[0].level, track: slots[0].track, value: 'Power Attack' });
    expect(feats[1]).toMatchObject({ level: slots[1].level, track: slots[1].track, value: 'Sudden Charge' });
  });

  it('leaves unfilled slots outstanding rather than recording blanks', () => {
    const out = pf2BuilderChoicesFor({ className: 'Fighter', level: 12, feats: ['Power Attack'] });
    expect(out.filter((c) => c.kind === 'feat')).toHaveLength(1);
  });

  it('never invents a slot for a feat beyond the schedule', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Feat ${i}`);
    const out = pf2BuilderChoicesFor({ className: 'Fighter', level: 1, feats: many });
    expect(out.filter((c) => c.kind === 'feat').length).toBe(pf2FeatSlotCount('Fighter', 1));
  });

  it('records the subclass moment when the class has one', () => {
    const out = pf2BuilderChoicesFor({ className: 'Barbarian', level: 3, subclass: 'Giant' });
    const sub = out.find((c) => c.kind === 'subclass');
    expect(sub?.value).toBe('Giant');
    expect(sub?.level).toBe(1); // Instinct is chosen at level 1
  });
});

describe('the walker stops re-asking for what Foundations already chose', () => {
  const owed = (recorded: PF2RecordedChoice[], level = 5) =>
    pf2PlanLevelUp({ className: 'Fighter', to: level, recorded }).outstanding.filter((o) => o.kind === 'feat').length;

  it('a build with every slot filled owes no feat prompts', () => {
    const slots = pf2FeatSlots('Fighter', 5);
    const recorded = pf2BuilderChoicesFor({
      className: 'Fighter', level: 5, feats: slots.map((_, i) => `Feat ${i}`),
    });
    expect(owed(recorded)).toBe(0);
  });

  it('a partial build still owes exactly what is missing', () => {
    const total = pf2FeatSlotCount('Fighter', 5);
    const recorded = pf2BuilderChoicesFor({ className: 'Fighter', level: 5, feats: ['Power Attack'] });
    expect(owed(recorded)).toBe(total - 1);
  });

  it('without the ledger every slot is asked again (the bug)', () => {
    expect(owed([])).toBe(pf2FeatSlotCount('Fighter', 5));
  });
});

describe('a rebuild replaces what it owns and nothing else', () => {
  it('keeps the attribute BOOSTS, which Foundations does not collect', () => {
    const existing: PF2RecordedChoice[] = [{ level: 5, kind: 'boosts', attributes: ['STR', 'CON', 'DEX', 'WIS'] }];
    const merged = mergePf2BuilderChoices(existing, pf2BuilderChoicesFor({
      className: 'Fighter', level: 5, feats: ['Power Attack'],
    }), 5);
    expect(merged.find((c) => c.kind === 'boosts')).toBeTruthy();
  });

  it('keeps choices above the built level', () => {
    const existing: PF2RecordedChoice[] = [{ level: 9, kind: 'feat', track: 'class', value: 'Later Feat' }];
    const merged = mergePf2BuilderChoices(existing, pf2BuilderChoicesFor({
      className: 'Fighter', level: 5, feats: ['Power Attack'],
    }), 5);
    expect(merged.find((c) => c.level === 9)).toBeTruthy();
  });

  it('does not stack two feats into one slot on rebuild', () => {
    const first = pf2BuilderChoicesFor({ className: 'Fighter', level: 5, feats: ['A', 'B'] });
    const second = pf2BuilderChoicesFor({ className: 'Fighter', level: 5, feats: ['C'] });
    const merged = mergePf2BuilderChoices(first, second, 5);
    expect(merged.filter((c) => c.kind === 'feat')).toHaveLength(1);
    expect(merged[0].value).toBe('C');
  });
});

describe('the surfaces are wired', () => {
  it('the build route records the ledger', () => {
    const route = read('app/api/dnd/characters/[id]/pf2-build/route.ts');
    expect(route).toContain('pf2BuilderChoicesFor');
    expect(route).toContain('mergePf2BuilderChoices');
  });

  it('the picker enforces the cap it already displayed', () => {
    const picks = read('app/dnd/_ui/PF2BuildPicks.tsx');
    expect(picks).toContain('limit');
    expect(picks).toContain('selected.length >= limit');
    // An already-chosen entry must stay clickable, or a full list could never be undone.
    expect(picks).toContain('!active && selected.length >= limit');
    expect(read('app/dnd/_ui/PF2CharacterBuilder.tsx')).toContain('limit: featsOwed');
  });
});
