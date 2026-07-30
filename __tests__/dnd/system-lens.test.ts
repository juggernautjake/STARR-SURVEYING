// __tests__/dnd/system-lens.test.ts — N3-3 + N7.
//
// The lens's real claim is an ORDER OF TRUSTWORTHINESS: a designer's published numbers beat a measurement
// of ours, and a measurement beats a conversion. Get that order wrong and the page shows a derived block
// where a real Pathfinder stat block exists — which looks completely fine and is simply the wrong creature.
//
// Also pinned here: that the old `Use in another system` panel is GONE rather than coexisting. Two controls
// answering "which system am I reading?" can disagree, and the failure mode (a header saying Pathfinder
// above a panel showing 5e) is invisible to anything but a reader.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { build, isPublished, LENS_SYSTEMS, SYSTEM_LABEL, type LensSource } from '@/app/dnd/_ui/bestiary/SystemLens';
import { DEFAULT_SYSTEM } from '@/lib/dnd/systems';
import { PF2_TIERS } from '@/lib/dnd/statblocks/tiers';

const page = readFileSync(join(process.cwd(), 'app/dnd/bestiary/[slug]/page.tsx'), 'utf8');
const lens = readFileSync(join(process.cwd(), 'app/dnd/_ui/bestiary/SystemLens.tsx'), 'utf8');
const query = readFileSync(join(process.cwd(), 'lib/dnd/bestiary/query.ts'), 'utf8');

const skunk: LensSource = {
  name: 'Skunk',
  system: 'dnd5e-2014',
  cr: '1/4',
  statblock: { ac: 12, hp: 5, speed: '20 ft.', abilities: { dex: 15 } },
};

describe('the lens picks the most trustworthy source available', () => {
  it('shows the source itself, unaltered, when read in its own system', () => {
    const v = build(skunk, {}, 'dnd5e-2014');
    expect(v.kind).toBe('published');
    expect(v.statblock).toBe(skunk.statblock);
    // Nothing was done to it, so there is nothing to explain.
    expect(v.notes).toEqual([]);
  });

  it('prefers a PUBLISHED sibling over deriving one', () => {
    // The N7 rule. A real Pathfinder Skunk is a designer's numbers; ours is a median.
    const published: LensSource = {
      name: 'Skunk', system: 'pathfinder2e', cr: '-1',
      statblock: { ac: 16, hp: 6 },
    };
    const v = build(skunk, { pathfinder2e: published }, 'pathfinder2e');
    expect(v.kind).toBe('published');
    expect(v.statblock.ac).toBe(16);
    // NOT the measured row — that is the whole point of the preference.
    expect(v.statblock.ac).not.toBe(PF2_TIERS.find((t) => t.tier === -1)!.ac);
  });

  it('derives from the target’s measured table when no sibling exists', () => {
    const v = build(skunk, {}, 'pathfinder2e');
    expect(v.kind).toBe('derived');
    expect(v.statblock.ac).toBe(PF2_TIERS.find((t) => t.tier === -1)!.ac);
    expect(v.notes.length).toBeGreaterThan(0);
  });

  it('falls back to CONVERSION for a system with no table of its own', () => {
    // Intuitive Games publishes no creature-building table (N1-3). Converting and naming the gaps is a
    // weaker claim clearly labelled; deriving would be a strong claim quietly wrong.
    const v = build(skunk, {}, 'intuitive-games');
    expect(v.kind).toBe('converted');
    expect(v.notes.join(' ')).toMatch(/no creature-building table/i);
  });

  it('never returns a derived block with no explanation', () => {
    // A derived block that reads like a designer's is the exact lie G5 exists to prevent.
    for (const sys of LENS_SYSTEMS) {
      const v = build(skunk, {}, sys);
      if (v.kind !== 'published') {
        expect(v.notes.length, `${sys} must explain itself`).toBeGreaterThan(0);
      }
    }
  });

  it('produces different numbers across the systems that have their own tables', () => {
    // The owner's complaint, as an assertion: "the skunk has the same stat block for all four systems".
    const d = build(skunk, {}, 'dnd5e-2024');
    const p = build(skunk, {}, 'pathfinder2e');
    expect(p.statblock.ac).not.toBe(d.statblock.ac);
    expect(p.statblock.hp).not.toBe(d.statblock.hp);
  });
});

describe('the lens defaults to 2024 and offers all four systems', () => {
  it('opens on the site-wide default', () => {
    expect(DEFAULT_SYSTEM).toBe('dnd5e-2024');
    expect(page).toMatch(/initial=\{DEFAULT_SYSTEM as BestiarySystem\}/);
    // And the component's own default agrees, so a caller that omits it lands in the same place.
    expect(lens).toMatch(/initial = 'dnd5e-2024'/);
  });

  it('lists every system, default first', () => {
    expect(LENS_SYSTEMS).toEqual(['dnd5e-2024', 'dnd5e-2014', 'pathfinder2e', 'intuitive-games']);
    expect(LENS_SYSTEMS[0]).toBe(DEFAULT_SYSTEM);
    for (const s of LENS_SYSTEMS) expect(SYSTEM_LABEL[s]).toBeTruthy();
  });

  it('marks the creature’s OWN system as published in the menu', () => {
    // Caught in the browser: the 2014 Badger's dropdown showed no ◆ beside 2014, then rendered
    // "◆ Published" the moment 2014 was chosen. `published` holds only the OTHER systems, so a marker
    // reading it alone answers "no" for the one system that is certainly yes.
    expect(isPublished(skunk, {}, 'dnd5e-2014')).toBe(true);
    expect(isPublished(skunk, {}, 'pathfinder2e')).toBe(false);
    expect(isPublished(skunk, { pathfinder2e: { ...skunk, system: 'pathfinder2e' } }, 'pathfinder2e')).toBe(true);
  });

  it('the menu marker and the badge cannot disagree', () => {
    // The property, not the implementation: for every system, ◆ in the menu means exactly what the badge
    // above the block says. They drifted once because the same rule was written out twice.
    for (const sys of LENS_SYSTEMS) {
      const published = { pathfinder2e: { ...skunk, system: 'pathfinder2e' } };
      expect(isPublished(skunk, published, sys), sys).toBe(build(skunk, published, sys).kind === 'published');
    }
  });

  it('is a dropdown at the TOP of the block, not a panel below it', () => {
    expect(lens).toMatch(/aria-haspopup="listbox"/);
    expect(lens).toMatch(/role="listbox"/);
    // The control is rendered before the stat block in the same component.
    expect(lens.indexOf('aria-haspopup="listbox"')).toBeLessThan(lens.indexOf('<CreatureStatblock'));
  });

  it('switches without navigating — "dynamic in real time"', () => {
    // Client state, not a URL round trip. A `?to=` link would reload the page.
    expect(lens).toMatch(/'use client'/);
    expect(lens).toMatch(/useState<BestiarySystem>\(initial\)/);
    expect(lens).not.toMatch(/router\.push|<Link/);
  });
});

describe('"Use in another system" is gone, not merely hidden', () => {
  it('the panel is deleted from the creature page', () => {
    expect(page).not.toMatch(/Use in another system/);
    expect(page).not.toMatch(/TRANSPOSE_TARGETS/);
  });

  it('and so is the ?to= round trip it was built on', () => {
    // Dead scaffolding left behind is the same defect as an unwired component, from the other direction.
    expect(page).not.toMatch(/searchParams/);
    expect(page).not.toMatch(/transposeTo/);
    expect(page).not.toMatch(/transposeCreature\(/);
  });

  it('the lens is what replaced it', () => {
    expect(page).toMatch(/<SystemLens/);
    expect(page).toMatch(/published=\{siblings\}/);
  });
});

describe('sibling identity is exact, never fuzzy (N7)', () => {
  it('matches on name without wildcards, and re-checks the match in code', () => {
    expect(query).toMatch(/\.ilike\('name', name\)/);
    // No `%` — a prefix match would make "Badger" pick up "Giant Badger", which is a different creature.
    expect(query).not.toMatch(/ilike\('name', `%/);
    // Belt and braces: the row's name is compared again, so a later edit adding a wildcard cannot silently
    // turn this into the fuzzy match the design forbids.
    expect(query).toMatch(/String\(r\.name\)\.toLowerCase\(\) !== name\.toLowerCase\(\)/);
  });

  it('excludes the creature’s own system, and is deterministic when a system has several rows', () => {
    expect(query).toMatch(/\.neq\('system', ownSystem\)/);
    expect(query).toMatch(/\.order\('slug', \{ ascending: true \}\)/);
    expect(query).toMatch(/first by slug wins/);
  });

  it('a failed lookup degrades to derivation rather than taking the page down', () => {
    expect(query).toMatch(/if \(error\) return \{\};/);
  });

  it('never offers a row WE generated as a published sibling', () => {
    // A LIVE BUG, found by opening the Badger in a browser and not by any of the 8,427 tests that were
    // passing at the time. The page announced "D&D 5e (2024) ◆ Published" for a creature no publisher has
    // printed in 2024: `generate-transposed-bestiary.mjs`'s `Transposed from …` rows were being returned
    // as siblings, so the lens's top rank — reserved for *a designer wrote these numbers* — was handed
    // our own conversion.
    //
    // Undetectable by eye: transposition CARRIES the source's AC and HP, so the block was identical to
    // the 2014 one and only the badge was lying. The lens suite above asserts the ORDER and could never
    // have caught it, because the defect was in what got called published on the way in.
    expect(query).toMatch(/\.not\('source', 'like', 'Transposed from %'\)/);
    // And re-checked in code, like the name match, because a `.not()` clause is one careless edit from
    // being dropped and the failure is silent.
    expect(query).toMatch(/String\(r\.source \?\? ''\)\.startsWith\('Transposed from '\)/);
    // The column has to be SELECTED for that check to mean anything — reading an unselected column
    // returns undefined, which would make the guard pass for every row.
    expect(query).toMatch(/\.select\('slug, name, system, type, size, cr, source, statblock'\)/);
  });
});
