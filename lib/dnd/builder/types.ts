// lib/dnd/builder/types.ts — the shared shape of the guided character builder (B1).
//
// WIZARD = shell, SYSTEM = build plan (mirrors the sheet's FORMAT = shell, SYSTEM = panels). The
// `GuidedBuilder` shell renders an ordered list of steps grouped into phases (Foundations → Levels →
// Review) and knows nothing system-specific; each system supplies its own ordered steps derived from
// that system's rules/engine, so the steps and their choices come straight from the rulebook — no
// duplication. See docs/planning/completed/GUIDED_CHARACTER_BUILDER_2026-07-23.md.

/** The phase a step belongs to — groups the rail. Free-form so a system can add its own phase label,
 *  but the canonical order is Foundations → Levels → Review. */
export type BuildPhase = 'Foundations' | 'Levels' | 'Review' | (string & {});

/** Per-step completion state, shown as a chip in the rail. Computed by the system's plan where it can be
 *  (a step that owns required choices), else 'info' for a read-only/optional step. */
export type BuildStepStatus = 'done' | 'current' | 'todo' | 'info' | 'locked';

/** The metadata half of a step — serialisable, no React. The renderable node is supplied alongside by the
 *  server page (a ReactNode can't live in a lib type), so the shell pairs `GuidedStepMeta` with a node. */
export interface GuidedStepMeta {
  /** Stable id (anchor + rail key). */
  id: string;
  /** Rail + panel heading, e.g. "Class", "Level 3", "Review & Finish". */
  title: string;
  /** Which phase group the step sits under in the rail. */
  phase: BuildPhase;
  /** One-line blurb under the step heading — the "what this step decides" explainer. */
  help?: string;
  /** Optional starting status; the shell defaults the first step to 'current' and the rest to 'todo'. */
  status?: BuildStepStatus;
}
