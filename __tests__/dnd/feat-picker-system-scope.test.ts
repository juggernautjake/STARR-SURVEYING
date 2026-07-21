// The feat picker serves each system its OWN feats, under its OWN slot model (14-S6a).
//
// The defect this closes is the codebase's most familiar one: the 2014 feat catalog and 14-S6b's
// system-keyed gate both existed and were wired into every WRITE path, while the sheet's picker —
// the READ path — still hard-coded `FEATS_2024` and told a 2014 character "No feat library for
// this game system yet". Nothing failed; the content was simply unreachable.
//
// These tests assert the dispatcher's RESULTS rather than reading the picker's source, because a
// source-text check is what would have missed the original bug: the picker's code read perfectly
// well, it just asked the wrong module.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { featCatalogForSystem, featCatalogNote, featSlotsForSystem } from '@/lib/dnd/feats/catalog';
import { FEATS_2024 } from '@/lib/dnd/feats/dnd5e-2024';
import { FEATS_2014 } from '@/lib/dnd/feats/dnd5e-2014';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('feat catalog dispatcher', () => {
  it('serves each 5e edition its own catalog, at full size', () => {
    expect(featCatalogForSystem('dnd5e-2024')).toHaveLength(FEATS_2024.length);
    expect(featCatalogForSystem('dnd5e-2014')).toHaveLength(FEATS_2014.length);
  });

  it('a 2014 character reaches Grappler — the regression itself', () => {
    // Before this slice the 2014 pool was `[]` and this feat was unreachable from the sheet.
    const names = featCatalogForSystem('dnd5e-2014').map((f) => f.name);
    expect(names).toContain('Grappler');
  });

  it('the editions do not bleed into each other', () => {
    const names2014 = new Set(featCatalogForSystem('dnd5e-2014').map((f) => f.name));
    const names2024 = new Set(featCatalogForSystem('dnd5e-2024').map((f) => f.name));
    // 2024's origin feats are the sharpest case: they belong to a track 2014 has no concept of.
    for (const n of names2024) {
      if (!names2014.has(n)) continue;
      // A shared NAME is allowed (both editions could publish one), but never a shared entry.
      expect(featCatalogForSystem('dnd5e-2014').find((f) => f.name === n))
        .not.toBe(featCatalogForSystem('dnd5e-2024').find((f) => f.name === n));
    }
    // And nothing from 2024's catalog leaks into 2014's by construction.
    expect([...names2014].every((n) => FEATS_2014.some((f) => f.name === n))).toBe(true);
  });

  it('gives PF2 and IG NOTHING rather than 5e feats', () => {
    // They have their own feat models and their own gates. A 5e list here would be a bleed
    // dressed up as a convenience.
    for (const s of ['pathfinder2e', 'intuitive-games', 'ambiguous', 'coc7e']) {
      expect(featCatalogForSystem(s)).toEqual([]);
      expect(featSlotsForSystem(s)).toEqual([]);
    }
  });

  it('never labels a 2014 feat with a 2024 track', () => {
    // 2014 feats are one undifferentiated list. origin/general/fighting-style/epic-boon is a 2024
    // structure, and `Feat2014` deliberately has no `category` field at all — the normaliser must
    // not invent one on the way to the UI.
    for (const f of featCatalogForSystem('dnd5e-2014')) {
      expect(f.category).toBeNull();
      expect(f.categoryLabel).toBeNull();
      // And the sheet's source line says what 2014 calls it, not "General feat".
      expect(f.sourceLabel).toBe('Feat');
    }
    for (const f of featCatalogForSystem('dnd5e-2024')) {
      expect(f.category).not.toBeNull();
      expect(f.sourceLabel).toMatch(/ feat$/);
    }
  });

  it('offers each edition its own slot model', () => {
    // 2024 has three tracks; 2014 has exactly one, because a feat REPLACES an ASI rather than
    // occupying a track beside one. Offering 2014 the 2024 three would be the picker asserting a
    // structure the edition does not have.
    expect(featSlotsForSystem('dnd5e-2024').map((s) => s.id).sort()).toEqual(['asi', 'fighting-style', 'origin']);
    const s2014 = featSlotsForSystem('dnd5e-2014');
    expect(s2014).toHaveLength(1);
    expect(s2014[0].id).toBe('asi');
    expect(s2014[0].hint).toMatch(/in place of an Ability Score Improvement/i);
  });

  it('explains an empty picker differently for a complete catalog vs a foreign system', () => {
    // The two empty states are not the same fact. 2014's catalog is COMPLETE at one feat (SRD 5.1
    // publishes only Grappler); PF2/IG do not use this model at all. "No feat library yet" implies
    // unfinished work and is wrong in both cases.
    expect(featCatalogNote('dnd5e-2014')).toMatch(/licensed sources publish/i);
    expect(featCatalogNote('pathfinder2e')).toMatch(/own feat rules/i);
    expect(featCatalogNote('pathfinder2e')).not.toMatch(/yet/i);
  });
});

describe('the picker asks the dispatcher, not a hard-coded catalog', () => {
  const src = read('app/dnd/_sheet/components/ui/FeatPicker.tsx');

  it('no longer imports a specific edition catalog', () => {
    // The structural claim behind every test above: if the picker reaches straight for
    // FEATS_2024 again, the dispatcher is decoration.
    expect(src).not.toMatch(/from '@\/lib\/dnd\/feats\/dnd5e-20(14|24)'/);
    expect(src).toContain("from '@/lib/dnd/feats/catalog'");
  });

  it('judges with the system-aware gate', () => {
    expect(src).toContain('featEligibilityForSystem');
    // The 2024-only entry point must not be what decides a verdict here.
    expect(src).not.toMatch(/\bfeatEligibility\(/);
  });

  it('passes the class through, which 2014 needs and 2024 ignores', () => {
    // A 2014 feat is legal exactly at the levels the character's class grants an ASI, so a picker
    // that omits className would refuse or allow on the wrong levels.
    expect(src).toMatch(/className: char\.meta\.className/);
  });
});
