// lib/learn/reveal.ts — when each piece of a lesson arrives on screen.
//
// Owner, 2026-09-20: "I want really smooth animations/transitions for failures/successes and for
// problems and slides that introduce new elements and effects at different times when triggered.
// Please think this out in the lessons and information and determine exactly how to implement these
// ideas for all of the concepts and teaching and problems."
//
// ── THE POINT OF STAGGERING IS ATTENTION, NOT DECORATION ────────────────────────────────────────
//
// A slide whose heading, body, figure and buttons all appear at once gives the eye no order to read
// them in. Arriving a beat apart tells somebody where to start without a word of instruction.
//
// That only works while the delays stay short enough to read as ONE movement. Past roughly half a
// second the eye stops perceiving a sequence and starts perceiving a wait, and a wait on every
// slide of a twenty-five step module is a tax paid twenty-five times. So:
//
// ── THE CAP IS THE WHOLE DESIGN ─────────────────────────────────────────────────────────────────
//
// `stagger` compresses the step as the list grows rather than letting the last item drift further
// and further out. Four items get 70 ms apart and the set lands in 280 ms. Twenty items do NOT take
// 1.4 seconds — they compress to 21 ms apart and still land inside the same budget.
//
// A naive `index * 70` is the single commonest way a staggered list comes to feel broken, and it
// only shows up on the longest list, which is usually the one nobody tested.
//
// Pure. Tested in __tests__/learn/reveal.test.ts.

/** Nothing may take longer than this to finish arriving. A third of a second reads as one gesture. */
export const REVEAL_BUDGET_MS = 340;

/** The gap between items when there is room for it. */
export const REVEAL_STEP_MS = 70;

export interface StaggerOptions {
  /** How many items are arriving, so the step can be compressed to fit the budget. */
  total?: number;
  /** Delay before the first item. Used when a group follows something else. */
  base?: number;
  /** Override the budget for a deliberately slower sequence. */
  budget?: number;
}

/**
 * The delay, in milliseconds, before item `index` should appear.
 *
 * Give it `total` wherever the list length is known — that is what lets it compress. Without it the
 * step is not compressed, which is correct for a handful of fixed elements (a heading, a body, a
 * footer) where the count cannot run away.
 */
export function stagger(index: number, options: StaggerOptions = {}): number {
  const base = Math.max(0, options.base ?? 0);
  const budget = Math.max(0, options.budget ?? REVEAL_BUDGET_MS);
  if (index <= 0) return base;

  const total = options.total;
  if (!total || total <= 1) return base + REVEAL_STEP_MS * index;

  // The LAST item must land within the budget, so the step is the budget divided by the gaps —
  // never more than the comfortable step, and never so small that the sequence disappears.
  const gaps = total - 1;
  const step = Math.min(REVEAL_STEP_MS, budget / gaps);
  return Math.round(base + step * index);
}

/** A ready-made `style` for a staged child. */
export function revealStyle(index: number, options?: StaggerOptions): { animationDelay: string } {
  return { animationDelay: `${stagger(index, options)}ms` };
}

// ── WHAT HAPPENS WHEN AN ANSWER IS MARKED ───────────────────────────────────────────────────────
//
// Success and failure are not symmetrical, and animating them as though they were is a mistake that
// looks like even-handedness.
//
// A correct answer wants a short confirmation that gets out of the way: you already know you were
// right, and the animation is an acknowledgement, not news. A wrong answer wants something that
// catches the eye, because the useful information is the explanation underneath and somebody
// scanning for their next problem will otherwise miss that it appeared.
//
// Neither may be long. An animation that outlasts the information it carries becomes something
// people learn to sit through, and then to ignore.

export type Outcome = 'right' | 'wrong' | 'carried' | 'neutral';

export interface OutcomeMotion {
  /** The class that plays the animation. */
  className: string;
  /** How long it runs, so a caller can time what follows it. */
  durationMs: number;
  /** What a screen reader should hear. Motion is not information unless it is also said. */
  announce: string;
}

export const OUTCOME_MOTION: Record<Outcome, OutcomeMotion> = {
  // A tick that pops and settles. Fast — this is an acknowledgement, not an award.
  right: { className: 'reveal-right', durationMs: 260, announce: 'Correct' },
  // A short lateral nudge. Twice, 4px, and done — big enough to catch the eye, small enough not to
  // read as the app malfunctioning.
  wrong: { className: 'reveal-wrong', durationMs: 300, announce: 'Not right — the explanation is below' },
  // Deliberately neither. A carried step earned its mark, so celebrating it would overstate the
  // outcome, and nudging it would tell somebody their method was wrong when it was not.
  carried: { className: 'reveal-carried', durationMs: 260, announce: 'Right method, carried from an earlier answer' },
  neutral: { className: '', durationMs: 0, announce: '' },
};

/**
 * Whether motion should play at all.
 *
 * Checked in one place so no component has to remember. `prefers-reduced-motion` is not a
 * preference about taste — for some people motion causes nausea — so the answer when it is set is
 * "no animation", not "a smaller one".
 *
 * The CONTENT never depends on this. Everything a staged reveal shows is present and readable with
 * every animation removed; the staging decides when it arrives, never whether.
 */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
