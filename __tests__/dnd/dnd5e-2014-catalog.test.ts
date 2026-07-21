// __tests__/dnd/dnd5e-2014-catalog.test.ts — the 2014 edition gets its OWN content (14-S2/S3/S4).
//
// 2014 had classes but no feats and no equipment, so a 2014 character's pickers showed nothing.
// The catalogs now exist and are wired into the dispatchers.
//
// THE PROPERTY THAT MATTERS MOST is not coverage — it is that 2024 facts never appear in a 2014
// answer. Editions are different systems (Ground Rule 2), and the failure mode is quiet: a 2014
// question answered with 2024 numbers looks completely fine.
import { describe, it, expect } from 'vitest';
import { FEATS_2014, FEATS_2014_STATUS, FEAT_SLOT_2014 } from '@/lib/dnd/feats/dnd5e-2014';
import { FEATS_2024 } from '@/lib/dnd/feats/dnd5e-2024';
import { WEAPONS_2014, ARMOR_2014, findWeapon2014 } from '@/lib/dnd/equipment/dnd5e-2014';
import { WEAPONS_2024 } from '@/lib/dnd/equipment/dnd5e-2024';

describe('2014 feats are modelled as 2014, not as 2024 with a different list', () => {
  it('encode the single legal slot: instead of an ASI', () => {
    // 2024's origin / general / fighting-style / epic-boon TRACKS do not exist in 2014.
    expect(FEAT_SLOT_2014).toBe('asi');
  });

  it('carry no `category`, because 2014 has no feat categories', () => {
    for (const f of FEATS_2014) {
      expect('category' in f, `${f.name} should not claim a 2024 category`).toBe(false);
    }
  });

  it('every entry names its source', () => {
    for (const f of FEATS_2014) expect(f.source).toBeTruthy();
  });
});

describe('the catalog is honest about being one feat long', () => {
  it('separates "complete for our sources" from "complete for the edition"', () => {
    // A single `complete` flag cannot express this situation truthfully. The catalog HAS everything
    // the clean sources contain — there is nothing more to extract — while remaining a small
    // fraction of the edition's real feat list. Collapsing those to one boolean would either claim
    // completeness it lacks or imply work is outstanding that no permitted source can supply.
    expect(FEATS_2014_STATUS.completeForSources).toBe(true);
    expect(FEATS_2014_STATUS.completeForEdition).toBe(false);
  });

  it('says WHY it is short, so the gap does not read as an oversight', () => {
    // SRD 5.1 reproduces exactly one feat (Grappler). Every other 2014 feat is PHB-only content
    // that is not under the CC-BY licence, so it is not obtainable from any permitted source.
    const note = JSON.stringify(FEATS_2014_STATUS).toLowerCase();
    expect(note).toMatch(/srd/);
  });

  it('was not padded to look complete', () => {
    // The honest answer for the sources in scope is a very short list. If this ever grows, it
    // should be because the licensing situation changed — not because someone filled it in.
    expect(FEATS_2014.length).toBeLessThan(5);
  });
});

describe('2014 equipment is re-derived, not copied from 2024', () => {
  it('has no weapon mastery field at all', () => {
    // Mastery is a 2024 addition. Absence at the TYPE level means a 2024 value cannot be pasted
    // into a 2014 row even by accident.
    for (const w of WEAPONS_2014) {
      expect('mastery' in w, `${w.name} must not carry 2024 mastery`).toBe(false);
    }
  });

  it('keeps Net, which 2014 has and 2024 removed', () => {
    expect(findWeapon2014('Net')).toBeTruthy();
  });

  it('omits the firearms 2024 added', () => {
    for (const gone of ['Musket', 'Pistol']) {
      expect(findWeapon2014(gone), `${gone} is not a 2014 weapon`).toBeFalsy();
    }
  });

  it('keeps 2014 numbers where the editions diverge', () => {
    // Trident is 1d6 in 2014 and 1d8 in 2024 — a small difference that is exactly the kind of
    // thing a copy-paste would silently get wrong.
    const trident2014 = findWeapon2014('Trident');
    const trident2024 = WEAPONS_2024.find((w) => w.name === 'Trident');
    if (trident2014 && trident2024) {
      expect(trident2014.damage).not.toBe(trident2024.damage);
    }
  });

  it('covers the SRD tables it claims to', () => {
    expect(WEAPONS_2014.length).toBeGreaterThan(30);
    expect(ARMOR_2014.length).toBeGreaterThan(10);
  });
});

describe('the two editions stay separate', () => {
  it('2014 and 2024 feat catalogs are different objects', () => {
    expect(FEATS_2014).not.toBe(FEATS_2024);
  });

  it('no 2014 weapon is the same object as a 2024 one', () => {
    // Shared references would mean editing one edition silently edits the other.
    for (const w of WEAPONS_2014) {
      expect(WEAPONS_2024.includes(w as never)).toBe(false);
    }
  });
});
