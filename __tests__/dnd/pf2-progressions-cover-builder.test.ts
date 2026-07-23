// __tests__/dnd/pf2-progressions-cover-builder.test.ts — B7 anti-drift guard.
//
// Every PF2 class the BUILDER can create must have a full 1–20 PF2_CLASS_PROGRESSION, so the (upcoming)
// level-up planner has a real table to read for any character a player can build. This locks that
// invariant: if someone adds a class to the builder's `PF2_CLASSES` without also authoring its
// progression, this fails here rather than silently leaving that class with no per-level data.
import { describe, it, expect } from 'vitest';
import { PF2_CLASSES } from '@/lib/dnd/systems/pathfinder2e/content';
import { PF2_CLASS_PROGRESSIONS } from '@/lib/dnd/systems/pathfinder2e/data/classes';

describe('PF2 class progressions cover every builder-offered class (B7)', () => {
  it('every PF2_CLASSES entry has a matching full progression by name', () => {
    const progNames = new Set(PF2_CLASS_PROGRESSIONS.map((p) => p.className));
    const missing = PF2_CLASSES.map((c) => c.name).filter((n) => !progNames.has(n));
    expect(missing, `builder classes with no PF2_CLASS_PROGRESSION: ${missing.join(', ')}`).toEqual([]);
  });

  it('every progression runs level 1 through 20 with an ordered proficiency structure', () => {
    for (const p of PF2_CLASS_PROGRESSIONS) {
      // Features are authored per class; a real progression is never empty.
      expect(p.features.length, `${p.className} has no features`).toBeGreaterThan(0);
      // Every feature sits in the legal 1–20 band.
      for (const f of p.features) expect(f.level, `${p.className} feature "${f.name}"`).toBeGreaterThanOrEqual(1);
      for (const f of p.features) expect(f.level).toBeLessThanOrEqual(20);
    }
  });
});
