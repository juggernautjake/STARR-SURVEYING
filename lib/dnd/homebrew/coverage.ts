// lib/dnd/homebrew/coverage.ts — what the Studio can actually DO, per kind and per system (P12-1).
//
// The Studio lets you author all 18 kinds in any system. Whether the result is resolved onto a sheet as
// numbers, or saved as rules text, is `kindIsMechanicalIn` — and until now the only place that answer
// surfaced was a hint next to the system dropdown, i.e. you discovered the gap while filling the form in.
//
// This derives the whole grid from the registry so the gaps are a page you can look at. Derived, never
// listed: a hardcoded copy is a second source of truth that goes stale the first time a bridge is built,
// which is exactly the failure this pass has spent days finding elsewhere.
//
// THE CELL TAXONOMY IS THE POINT. "Prose" alone lumps two very different things together:
//   · a kind that resolves in SOME system but not this one — a real gap, and the work P12-2/3/4 name;
//   · a kind that resolves NOWHERE by design — `rule` is house-rules text, and no engine will ever
//     "apply" one. Counting those as gaps would invent four items of work that should never be done.
// So they are separate states, and the summary counts only the first as outstanding.
import { HOMEBREW_KINDS, homebrewKindLabel, type HomebrewKind } from './model';
import { kindIsMechanicalIn, kindSpec } from './kinds';

export type CoverageState = 'mechanical' | 'gap' | 'by-design' | 'n/a';

export interface CoverageCell {
  system: string;
  state: CoverageState;
}

export interface CoverageRow {
  kind: HomebrewKind;
  label: string;
  group: string;
  icon: string;
  cells: CoverageCell[];
  /** Nothing outstanding: every cell is mechanical, by-design prose, or N/A. */
  complete: boolean;
}

export interface CoverageMatrix {
  systems: { key: string; name: string }[];
  rows: CoverageRow[];
  totals: {
    cells: number;
    mechanical: number;
    /** Cells that COULD be mechanical and are not. The only number that represents work. */
    gaps: number;
    byDesign: number;
    /** Cells the system has no concept of — a Stance in 5e. Never work. */
    notApplicable: number;
    /** Per-system gap count, keyed by system — this is what splits P12-2 from P12-3 and P12-4. */
    gapsBySystem: Record<string, number>;
  };
}

/**
 * Build the matrix for the given systems. `systems` comes from `availableSystems()` at the call site so a
 * system flipping to available lights up here with no edit — the same reasoning `systemChoicesForKind`
 * already uses.
 */
export function coverageMatrix(systems: readonly { key: string; name: string }[]): CoverageMatrix {
  const rows: CoverageRow[] = HOMEBREW_KINDS.map((kind) => {
    const spec = kindSpec(kind);
    // `mechanicalIn: []` means "never mechanical anywhere" — a deliberate prose kind, not an unbuilt one.
    const neverMechanical = spec.mechanicalIn !== '*' && (spec.mechanicalIn as readonly string[]).length === 0;
    const cells = systems.map((s) => {
      // N/A FIRST, because it beats every other reading: a Stance in 5e is not an unbuilt bridge, it is a
      // kind that system has no concept of. Without this the matrix reported 11 gaps, three of which were
      // work nobody should ever do.
      const native = !spec.nativeTo || spec.nativeTo.includes(s.key);
      // A DELIBERATE REFUSAL IS NOT A GAP. PF2 and IG both decline a `class` in as many words — converting
      // one "would produce something that levels wrongly, which is worse than a refusal" — and decline a
      // `background` because there is no per-character slot for it. Those decisions live in the adopt
      // converters; `proseByDesignIn` is the registry saying so, so the matrix stops advertising six
      // items of work that have already been decided against.
      const refusedHere = spec.proseByDesignIn?.includes(s.key) ?? false;
      const state: CoverageState = !native
        ? 'n/a'
        : kindIsMechanicalIn(kind, s.key) ? 'mechanical'
          : neverMechanical || refusedHere ? 'by-design' : 'gap';
      return { system: s.key, state };
    });
    return {
      kind,
      label: homebrewKindLabel(kind),
      group: spec.group,
      icon: spec.icon,
      cells,
      complete: cells.every((c) => c.state !== 'gap'),
    };
  });

  const all = rows.flatMap((r) => r.cells);
  const gapsBySystem: Record<string, number> = {};
  for (const s of systems) gapsBySystem[s.key] = all.filter((c) => c.system === s.key && c.state === 'gap').length;

  return {
    systems: systems.map((s) => ({ key: s.key, name: s.name })),
    rows,
    totals: {
      cells: all.length,
      mechanical: all.filter((c) => c.state === 'mechanical').length,
      gaps: all.filter((c) => c.state === 'gap').length,
      byDesign: all.filter((c) => c.state === 'by-design').length,
      notApplicable: all.filter((c) => c.state === 'n/a').length,
      gapsBySystem,
    },
  };
}

/** The rows with at least one gap, for the "what is left" list. Complete and by-design rows are omitted —
 *  a work list that includes finished work is a work list nobody trusts. */
export function coverageGaps(m: CoverageMatrix): { kind: HomebrewKind; label: string; missing: string[] }[] {
  return m.rows
    .map((r) => ({ kind: r.kind, label: r.label, missing: r.cells.filter((c) => c.state === 'gap').map((c) => c.system) }))
    .filter((r) => r.missing.length > 0);
}
