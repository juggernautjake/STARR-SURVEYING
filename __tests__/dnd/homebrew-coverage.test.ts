// __tests__/dnd/homebrew-coverage.test.ts — the Studio coverage matrix (P12-1).
//
// The matrix exists so the per-system gaps are visible instead of discovered on save. Its value depends
// entirely on being DERIVED: a hardcoded grid would be a second source of truth that goes stale the first
// time a bridge is built. So these tests check the derivation and its taxonomy, never a copy of the data.
import { describe, it, expect } from 'vitest';
import { coverageMatrix, coverageGaps } from '@/lib/dnd/homebrew/coverage';
import { HOMEBREW_KINDS } from '@/lib/dnd/homebrew/model';
import { kindIsMechanicalIn } from '@/lib/dnd/homebrew/kinds';
import { availableSystems } from '@/lib/dnd/systems';

const SYSTEMS = availableSystems();
const M = coverageMatrix(SYSTEMS);

describe('the matrix is derived, not listed', () => {
  it('covers every kind × every available system', () => {
    expect(M.rows).toHaveLength(HOMEBREW_KINDS.length);
    for (const r of M.rows) expect(r.cells.map((c) => c.system)).toEqual(SYSTEMS.map((s) => s.key));
    expect(M.totals.cells).toBe(HOMEBREW_KINDS.length * SYSTEMS.length);
  });

  it('every `mechanical` cell agrees with `kindIsMechanicalIn`', () => {
    // The one assertion that would catch the matrix drifting from the registry it claims to read.
    for (const r of M.rows) {
      for (const c of r.cells) {
        expect(c.state === 'mechanical', `${r.kind}/${c.system}`).toBe(kindIsMechanicalIn(r.kind, c.system));
      }
    }
  });

  it('the four states partition the grid', () => {
    const { mechanical, gaps, byDesign, notApplicable, cells } = M.totals;
    expect(mechanical + gaps + byDesign + notApplicable).toBe(cells);
  });
});

describe('the taxonomy separates work from non-work', () => {
  it('a Stance is N/A outside Intuitive Games, not a gap', () => {
    // The distinction the whole page turns on. `mechanicalIn` alone cannot tell "we have not built the
    // bridge" from "this system has no such thing", and treating the second as work invents three items
    // that should never be done — which is precisely what the first version of this matrix reported.
    const stance = M.rows.find((r) => r.kind === 'stance')!;
    for (const c of stance.cells) {
      expect(c.state, c.system).toBe(c.system === 'intuitive-games' ? 'mechanical' : 'n/a');
    }
    expect(coverageGaps(M).some((g) => g.kind === 'stance')).toBe(false);
  });

  it('a kind that is mechanical NOWHERE is by-design, not a gap', () => {
    // `rule` is house-rules prose. No engine will ever "apply" one, so its cells are not outstanding work.
    const rule = M.rows.find((r) => r.kind === 'rule');
    if (rule) for (const c of rule.cells) expect(c.state).toBe('by-design');
  });

  it('`complete` means nothing outstanding — not "mechanical everywhere"', () => {
    // A row that is N/A in three systems and mechanical in the fourth has nothing left to do. Defining
    // `complete` as "all mechanical" would leave Stance permanently unfinished.
    for (const r of M.rows) {
      expect(r.complete, r.kind).toBe(r.cells.every((c) => c.state !== 'gap'));
    }
    expect(M.rows.find((r) => r.kind === 'stance')!.complete).toBe(true);
  });

  it('gaps list only cells that could be mechanical and are not', () => {
    for (const g of coverageGaps(M)) {
      expect(g.missing.length).toBeGreaterThan(0);
      for (const sys of g.missing) expect(kindIsMechanicalIn(g.kind, sys)).toBe(false);
    }
    // And the per-system tally matches the list, so the summary cannot disagree with the detail.
    for (const s of SYSTEMS) {
      const fromList = coverageGaps(M).filter((g) => g.missing.includes(s.key)).length;
      expect(M.totals.gapsBySystem[s.key]).toBe(fromList);
    }
  });
});
