// lib/calculators/approved.ts — which calculators you may sit the exam with, and how each one thinks.
//
// Owner, 2026-09-20: "I have the TI-30Xa calculator … We need to catalogue all of the commands and
// everything for whatever calculators we use … I need to become very familiar and quick with the
// calculator."
//
// ── THE LIST IS NCEES'S, NOT OURS ───────────────────────────────────────────────────────────────
//
// The FS exam is administered by NCEES, and Texas (TBPLS) licenses on the back of it. NCEES
// publishes a short list of permitted models and it is enforced at the test centre — turn up with
// anything else and it is taken off you. The list has been stable for years but it IS reviewed
// annually, so `NCEES_LIST_REVIEWED` says when this file was last checked against it rather than
// letting the page imply a currency nobody verified.
//
// ── ENTRY MODEL IS THE THING THAT MATTERS FOR PRACTICE ──────────────────────────────────────────
//
// Not the feature list — the entry model. How a machine takes input decides what your hands learn:
//
//   immediate   type 45, press SIN, and 0.7071 appears at once. The TI-30Xa.
//   expression  build sin(45) on a line and press = to evaluate it. MathPrint and Natural Display.
//   rpn         push 45, then apply SIN. Operands first, no equals key at all. The HPs.
//
// These are not variations on a theme; they are three different sets of muscle memory. Practising
// one and sitting the exam with another is worse than not practising.
//
// This mattered in practice, not in theory: until 2026-09-20 the TI-30Xa emulator was wired to the
// TI-36X Pro's expression engine, so it trained `SIN 45` on a machine that wants `45 SIN`, and
// nothing caught it because nothing had written down that the two differ. That is what this file
// is for, and what the test beside it enforces.

export type EntryModel = 'immediate' | 'expression' | 'rpn';

export interface ApprovedCalculator {
  /** Matches ModelKey in CalculatorProvider, where a key has an emulator. */
  key: string;
  brand: 'TI' | 'Casio' | 'HP';
  label: string;
  entry: EntryModel;
  /** How NCEES words the permission, because the rule is by model-name prefix, not by exact model. */
  rule: string;
  /** What is worth knowing before choosing it. Honest about the trade, not a sales pitch. */
  notes: string;
  /**
   * The engine module this emulator runs on, relative to lib/calculators/models/.
   *
   * Several models share one engine because they are genuinely the same machine under two names.
   * Where that is so, `sharesEngineBecause` says why — an unexplained borrow is exactly how the
   * 30Xa came to be wrong.
   */
  engine: string;
  sharesEngineBecause?: string;
  /** Whether every key has been catalogued and the entry model verified against the engine. */
  audited: boolean;
}

/** When this list was last checked against NCEES's published policy. */
export const NCEES_LIST_REVIEWED = '2026-09-20';

export const APPROVED_CALCULATORS: ApprovedCalculator[] = [
  {
    key: 'ti-30xa',
    brand: 'TI',
    label: 'TI-30Xa',
    entry: 'immediate',
    rule: 'Permitted under the TI-30X model-name rule, which covers every model whose name begins "TI-30X".',
    notes: 'One line, no history, no expression editing. That sounds like a downgrade and is arguably the opposite under time pressure: there is nothing to scroll, nothing to mis-edit, and every key does its thing the instant you press it. It is also the cheapest on the list and the hardest to break.',
    engine: 'ti-30xa/engine',
    audited: true,
  },
  {
    key: 'ti-30xs-multiview',
    brand: 'TI',
    label: 'TI-30XS MultiView',
    entry: 'expression',
    rule: 'Permitted under the TI-30X model-name rule.',
    notes: 'Four lines and MathPrint entry, so you can see and correct an expression before evaluating it. The cost is that entry is a separate step from evaluation, which is slower for the short arithmetic that makes up most of the exam.',
    engine: 'ti-36x-pro/engine',
    sharesEngineBecause: 'Both are MathPrint expression-entry machines; the 36X Pro is a superset. The extra Pro functions have no keys on the MultiView keypad, so they are unreachable here rather than wrongly available.',
    audited: false,
  },
  {
    key: 'ti-36x-pro',
    brand: 'TI',
    label: 'TI-36X Pro',
    entry: 'expression',
    rule: 'Permitted under the TI-36X model-name rule.',
    notes: 'The most capable TI on the list: polar/rectangular conversion in one step, a numeric solver, and matrix and vector work. Worth it only if you will actually learn those; otherwise it is a slower TI-30Xa with more places to get lost.',
    engine: 'ti-36x-pro/engine',
    audited: false,
  },
  {
    key: 'casio-fx-115',
    brand: 'Casio',
    label: 'Casio fx-115ES PLUS',
    entry: 'expression',
    rule: 'Permitted under the fx-115 model-name rule.',
    notes: 'Natural Textbook Display — fractions and roots appear as they would be written. Strong at conversions and equation solving.',
    engine: 'casio-fx-991/engine',
    sharesEngineBecause: 'The fx-115ES PLUS and fx-991ES PLUS are the same calculator sold under two names in different markets. Same keypad, same entry model, same behaviour.',
    audited: false,
  },
  {
    key: 'casio-fx-991',
    brand: 'Casio',
    label: 'Casio fx-991ES PLUS',
    entry: 'expression',
    rule: 'Permitted under the fx-991 model-name rule.',
    notes: 'The fx-115ES PLUS under its other name. Everything that applies to one applies to the other.',
    engine: 'casio-fx-991/engine',
    audited: false,
  },
  {
    key: 'hp-33s',
    brand: 'HP',
    label: 'HP 33s',
    entry: 'rpn',
    rule: 'Permitted by exact model. The HP rule names the 33s and the 35s specifically — no prefix rule, so no other HP qualifies.',
    notes: 'Switchable between RPN and algebraic. RPN is genuinely faster once it is in your hands, and genuinely slower while it is not. Discontinued, so it is second-hand only.',
    engine: 'hp-35s/engine',
    sharesEngineBecause: 'Both are four-level RPN machines with the same stack behaviour and the same dual RPN/algebraic mode. The 35s adds keys, it does not change how entry works.',
    audited: false,
  },
  {
    key: 'hp-35s',
    brand: 'HP',
    label: 'HP 35s',
    entry: 'rpn',
    rule: 'Permitted by exact model, alongside the 33s.',
    notes: 'The most powerful calculator on the list and the steepest to learn. Programmable, with direct support for degrees-minutes-seconds and for vectors, which suits surveying better than anything else here — if you put in the hours.',
    engine: 'hp-35s/engine',
    audited: false,
  },
];

/** One calculator by key. */
export function approvedCalculator(key: string): ApprovedCalculator | undefined {
  return APPROVED_CALCULATORS.find((c) => c.key === key);
}

/** What the three entry models mean, for a page that has to explain the choice. */
export const ENTRY_MODELS: Record<EntryModel, { label: string; how: string; watchFor: string }> = {
  immediate: {
    label: 'Immediate execution',
    how: 'Type the number, then press the function. `45 SIN` gives 0.7071 straight away — there is no expression and no evaluate step.',
    watchFor: 'Arithmetic still follows precedence: 2 + 3 × 4 = gives 14, not 20. It is the FUNCTIONS that act at once, not the operators.',
  },
  expression: {
    label: 'Expression entry',
    how: 'Build the whole line — `sin(45)` — and press = to evaluate it. You can see and correct it before committing.',
    watchFor: 'Pressing SIN first opens a bracket rather than computing anything. Practising this on a machine you will not sit with teaches the wrong first move.',
  },
  rpn: {
    label: 'RPN',
    how: 'Operands first, then the operation. 45 ENTER SIN. There is no equals key because there is nothing to evaluate — each key acts on the stack as you press it.',
    watchFor: 'Fastest in trained hands and unusable in untrained ones. Decide early, because switching a month before the exam is worse than either choice.',
  },
};

/** Every distinct engine, and which models depend on it. For the audit guard. */
export function enginesInUse(): Map<string, ApprovedCalculator[]> {
  const byEngine = new Map<string, ApprovedCalculator[]>();
  for (const c of APPROVED_CALCULATORS) {
    const list = byEngine.get(c.engine) ?? [];
    list.push(c);
    byEngine.set(c.engine, list);
  }
  return byEngine;
}
