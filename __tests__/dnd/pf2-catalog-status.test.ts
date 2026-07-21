// __tests__/dnd/pf2-catalog-status.test.ts — the catalog reports its coverage honestly.
//
// This catalog is partial and will stay partial for a while: PF2 has roughly 1,500 spells and
// 2,500 feats. A partial catalog is fine. A partial catalog that PRESENTS as complete is not,
// because a missing spell then reads as "PF2 has no such spell" rather than "we haven't
// catalogued it yet" — and that is how a rules reference starts actively misleading people.
//
// So these tests guard the HONESTY property, not the counts. Counts are asserted only as
// lower bounds, so authoring more content never breaks the suite.
import { describe, it, expect } from 'vitest';
import {
  PF2_CATALOG_STATUS, PF2_KNOWN_GAPS, PF2_ALL_FEATS, PF2_ALL_SPELLS, PF2_CONDITIONS, PF2_ACTIONS,
  PF2_WEAPONS_FULL, PF2_RUNES, pf2CatalogIsComplete,
} from '@/lib/dnd/systems/pathfinder2e/data';
import { pf2Catalog } from '@/lib/dnd/systems/pathfinder2e/catalog';

describe('the status object never overstates coverage', () => {
  it('reports the catalog as incomplete overall', () => {
    expect(pf2CatalogIsComplete()).toBe(false);
  });

  it('marks spells and feats incomplete, because they are', () => {
    expect(PF2_CATALOG_STATUS.spells.complete).toBe(false);
    expect(PF2_CATALOG_STATUS.feats.complete).toBe(false);
  });

  it('every incomplete kind says what is missing', () => {
    // A bare `complete: false` tells a reader nothing. The note is the useful part.
    for (const [kind, s] of Object.entries(PF2_CATALOG_STATUS)) {
      if (!s.complete) expect(s.note, `${kind} is incomplete and must say why`).toBeTruthy();
    }
  });

  it('counts match the arrays rather than being hand-maintained numbers', () => {
    // A hand-typed count drifts the moment content is added, and then the status object is lying.
    expect(PF2_CATALOG_STATUS.spells.count).toBe(PF2_ALL_SPELLS.length);
    expect(PF2_CATALOG_STATUS.feats.count).toBe(PF2_ALL_FEATS.length);
    expect(PF2_CATALOG_STATUS.conditions.count).toBe(PF2_CONDITIONS.length);
    expect(PF2_CATALOG_STATUS.actions.count).toBe(PF2_ACTIONS.length);
  });

  it('records known gaps in the repo, not only in a chat log', () => {
    expect(PF2_KNOWN_GAPS.length).toBeGreaterThan(5);
    // The two biggest absences must be findable by grep.
    expect(PF2_KNOWN_GAPS.join(' ')).toMatch(/focus spells/i);
    expect(PF2_KNOWN_GAPS.join(' ')).toMatch(/class.*feats|ancestry/i);
  });
});

describe('the authored content is actually reachable', () => {
  it('the browsable catalog exposes the full tranches, not the 25-entry seed', () => {
    const groups = pf2Catalog();
    const byKind = Object.fromEntries(groups.map((g) => [g.kind, g.entries.length]));
    // The seed had 25 spells and 12 weapons; the full tranches are much larger. If these ever
    // collapse back to seed-sized, the catalog silently regressed to showing almost nothing.
    expect(byKind.spell).toBe(PF2_ALL_SPELLS.length);
    expect(byKind.weapon).toBe(PF2_WEAPONS_FULL.length);
    expect(byKind.feat).toBe(PF2_ALL_FEATS.length);
    expect(byKind.condition).toBe(PF2_CONDITIONS.length);
    expect(byKind.action).toBe(PF2_ACTIONS.length);
  });

  it('surfaces the kinds that previously had no catalog presence at all', () => {
    const kinds = new Set(pf2Catalog().map((g) => g.kind));
    for (const k of ['feat', 'condition', 'rune', 'shield', 'item']) {
      expect(kinds.has(k), `${k} should be browsable`).toBe(true);
    }
  });

  it('lower-bound counts, so adding content never breaks this suite', () => {
    expect(PF2_ALL_SPELLS.length).toBeGreaterThanOrEqual(70);
    expect(PF2_ALL_FEATS.length).toBeGreaterThanOrEqual(100);
    expect(PF2_CONDITIONS.length).toBeGreaterThanOrEqual(40);
    expect(PF2_WEAPONS_FULL.length).toBeGreaterThanOrEqual(50);
    expect(PF2_RUNES.length).toBeGreaterThanOrEqual(30);
  });
});

describe('the data is internally consistent', () => {
  it('no duplicate spell or feat names', () => {
    // A duplicate means a lookup silently returns the wrong one.
    const spellNames = PF2_ALL_SPELLS.map((s) => s.name.toLowerCase());
    const featNames = PF2_ALL_FEATS.map((f) => f.name.toLowerCase());
    expect(new Set(spellNames).size).toBe(spellNames.length);
    expect(new Set(featNames).size).toBe(featNames.length);
  });

  it('every spell has at least one tradition', () => {
    // A spell with no tradition can never be legally taken by anyone — it would be invisible to
    // the gate rather than refused by it.
    for (const s of PF2_ALL_SPELLS) {
      expect(s.traditions.length, `${s.name} has no tradition`).toBeGreaterThan(0);
    }
  });

  it('every feat has a level of at least 1', () => {
    for (const f of PF2_ALL_FEATS) expect(f.level, `${f.name}`).toBeGreaterThanOrEqual(1);
  });

  it('every entry carries a source, for the licensing trail', () => {
    for (const s of PF2_ALL_SPELLS) expect(s.source, `${s.name}`).toBeTruthy();
    for (const f of PF2_ALL_FEATS) expect(f.source, `${f.name}`).toBeTruthy();
    for (const c of PF2_CONDITIONS) expect(c.source, `${c.name}`).toBeTruthy();
  });

  it('cantrips are rank 0 and ranked spells are 1–10', () => {
    for (const s of PF2_ALL_SPELLS) {
      expect(s.rank, `${s.name}`).toBeGreaterThanOrEqual(0);
      expect(s.rank, `${s.name}`).toBeLessThanOrEqual(10);
    }
  });
});
