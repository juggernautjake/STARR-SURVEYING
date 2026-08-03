// worker/src/services/survey-units.ts — varas, chains, and the two different feet.
//
// Older Texas descriptions are written in VARAS, and a modern one is in feet on the Texas State
// Plane. A traverse that adds a vara to a foot produces a polygon that closes beautifully and is
// wrong by a factor of nearly three, so unit normalisation has to happen before any geometry, not
// after.
//
// ── THE TEXAS VARA IS A LEGAL DEFINITION, NOT AN APPROXIMATION ──────────────────────────────────
//
// Texas fixed the vara at **33 1/3 inches** — exactly 2.7 recurring US survey feet. Other Spanish
// colonial varas differ (California ~33 in, Mexico ~32.99 in), which is why this file is explicit
// that it means the Texas vara: a survey in a Texas county measured in varas is in Texas varas, and
// using a general "Spanish vara" of 32.99 inches puts a 1,900-vara line about 4 feet out.
//
// ── AND THERE ARE TWO FEET ──────────────────────────────────────────────────────────────────────
//
// The US survey foot is 1200/3937 m; the international foot is 0.3048 m. They differ by 2 parts per
// million — about **0.01 ft per mile**, and roughly a tenth of a foot across a large ranch.
//
// That is small enough to ignore and large enough to matter, and which is which depends on the job:
// negligible for locating a fence corner, not negligible when a State Plane coordinate is being
// published, because the Texas State Plane zones are defined in US survey feet. NGS retired the US
// survey foot in 2022, so new work is international feet while every legacy Texas plane coordinate
// is US survey feet — the two eras will be mixed on the same desk for years.
//
// So the unit is carried explicitly and conversions state which foot they produced, rather than a
// bare number that is right to five decimal places and ambiguous at the sixth.

export type LengthUnit =
  | 'us_survey_feet' | 'international_feet' | 'varas' | 'chains' | 'rods' | 'links' | 'meters';

/** Metres per unit. The two feet differ in the 7th significant figure — deliberately written out
 *  rather than rounded, because rounding them together is the same as pretending they are one unit. */
const METRES_PER: Record<LengthUnit, number> = {
  us_survey_feet: 1200 / 3937,              // 0.3048006096012192…
  international_feet: 0.3048,               // exact by definition
  // Texas vara = 33 1/3 inches = 25/9 feet — and the foot meant is the US SURVEY foot, which is the
  // one Texas land surveying and the Texas State Plane zones are defined in.
  //
  // Deriving it instead from 33 1/3 INTERNATIONAL inches (100/3 × 0.0254) gives 2.7777772… US survey
  // feet rather than 2.7777778…, so the exported VARAS_TO_US_SURVEY_FEET constant and the actual
  // conversion disagreed in the 7th figure. Small — about 0.01 ft over 1,900 varas — but a module
  // whose published constant does not match its own arithmetic cannot be checked by anybody.
  varas: (25 / 9) * (1200 / 3937),          // 0.84666… m
  chains: 66 * (1200 / 3937),               // Gunter's chain, in US survey feet
  rods: 16.5 * (1200 / 3937),
  links: 0.66 * (1200 / 3937),
  meters: 1,
};

/** 1 vara in US survey feet — exactly 2.777… , i.e. 25/9.
 *
 *  ── This constant existed SIX times in this codebase, with two different values ────────────────
 *
 *  Found 2026-08-03 while consolidating the closure thresholds, which had the identical problem:
 *
 *      survey-units.ts        25 / 9      = 2.7777778   exact
 *      reading-aggregator.ts  1000 / 360  = 2.7777778   exact, and the same number written differently
 *      ai-deed-analyzer.ts    2.7778                    rounded, and its comment says "(exact survey feet)"
 *      ai-plat-analyzer.ts    2.7778                    rounded, and its comment says "(exact)"
 *      validation.ts          2.7778 inline             rounded, in the LIVE Stage 4 closure path
 *      three prompt strings   2.7778                    what we tell the model to use
 *
 *  Two of them were labelled exact and were not, which is worse than being wrong quietly: it tells
 *  the next reader the question has been settled.
 *
 *  The error is small — about 0.04 ft over a 1,900-vara league line, an inch or so — and well under
 *  what old compass-and-chain work can support. It is fixed anyway, for the reason this module
 *  exists at all: it already draws a distinction between the US survey foot and the international
 *  foot in the SEVENTH significant figure, and a platform that insists on that while rounding the
 *  vara in the sixth is not applying a standard, it is applying whichever number a given file
 *  happened to contain.
 *
 *  Prompt text is deliberately NOT changed to `2.777777…` — a model reading a land description does
 *  better with the figure a surveyor would recognise, and every distance it returns is re-converted
 *  here anyway. The prompts now say "≈" instead of implying exactness. */
export const VARAS_TO_US_SURVEY_FEET = 25 / 9;

export function metresPerUnit(unit: LengthUnit): number {
  return METRES_PER[unit];
}

export interface Converted {
  value: number;
  unit: LengthUnit;
  /** What was converted, so a reader can check it. */
  from: { value: number; unit: LengthUnit };
  statement: string;
}

/** Convert a length between any two units.
 *
 *  Goes through metres rather than chaining factors: chaining vara → foot → chain accumulates a
 *  rounding at every hop, and over a 3,000-vara call those hops are visible in the closure. */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): Converted {
  const converted = (value * METRES_PER[from]) / METRES_PER[to];
  return {
    value: converted,
    unit: to,
    from: { value, unit: from },
    statement: `${value} ${LABEL[from]} = ${round(converted, 4)} ${LABEL[to]}.`,
  };
}

/** The platform's internal unit. Everything geometric is computed in US survey feet because that is
 *  what the Texas State Plane zones are defined in, and what every legacy plane coordinate in this
 *  state is expressed in. */
export const INTERNAL_UNIT: LengthUnit = 'us_survey_feet';

export function toInternal(value: number, from: LengthUnit): number {
  return (value * METRES_PER[from]) / METRES_PER[INTERNAL_UNIT];
}

const LABEL: Record<LengthUnit, string> = {
  us_survey_feet: 'US survey feet',
  international_feet: 'international feet',
  varas: 'varas',
  chains: 'chains',
  rods: 'rods',
  links: 'links',
  meters: 'metres',
};

export function unitLabel(unit: LengthUnit): string {
  return LABEL[unit];
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ── Reading the unit off a description ──────────────────────────────────────────────────────────

/** Which unit is this text written in?
 *
 *  Returns null rather than defaulting to feet. A defaulted unit is the failure this module exists
 *  to prevent: a vara call silently read as feet shortens that line to 36% of its true length, the
 *  traverse still closes to something, and the polygon is simply the wrong shape. */
export function detectUnit(text: string | null | undefined): LengthUnit | null {
  const t = (text ?? '').toLowerCase();
  if (!t.trim()) return null;

  if (/\bvaras?\b|\bvrs?\b/.test(t)) return 'varas';
  if (/\bchains?\b|\bchs?\b|gunter/.test(t)) return 'chains';
  if (/\brods?\b|\bperch(?:es)?\b|\bpoles?\b/.test(t)) return 'rods';
  if (/\blinks?\b|\blks?\b/.test(t)) return 'links';
  if (/\bmet(?:er|re)s?\b|\bm\b/.test(t)) return 'meters';
  if (/\bus\s+survey\s+f(?:ee|oo)t\b|\bsurvey\s+f(?:ee|oo)t\b|\busft\b/.test(t)) return 'us_survey_feet';
  if (/\binternational\s+f(?:ee|oo)t\b|\bift\b/.test(t)) return 'international_feet';
  if (/\bf(?:ee|oo)t\b|\bft\b|'/.test(t)) {
    // Bare "feet" in a Texas land description means US survey feet — that is what the state plane
    // and every legacy description here use. Said out loud in `describeUnitChoice` rather than
    // silently assumed.
    return 'us_survey_feet';
  }
  return null;
}

/** Say which unit was used and why — especially when it was inferred rather than stated. */
export function describeUnitChoice(text: string | null | undefined, unit: LengthUnit | null): string {
  if (!unit) {
    return 'No distance unit is stated and none could be inferred. The distances are NOT assumed to be feet — ' +
      'a vara call read as feet is 36% of its true length, and the traverse would still close to something.';
  }
  if (unit === 'us_survey_feet' && !/survey|usft/i.test(text ?? '')) {
    return 'Distances read as US SURVEY feet — bare "feet" in a Texas land description means the survey foot, ' +
      'which is what the Texas State Plane zones are defined in. If this description is modern and uses ' +
      'international feet, lines are long by about 0.01 ft per mile.';
  }
  if (unit === 'varas') {
    return `Distances read as Texas VARAS (33 1/3 inches = ${round(VARAS_TO_US_SURVEY_FEET, 6)} US survey feet). ` +
      'Not the Californian or Mexican vara — those differ by roughly a foot per 1,900 varas.';
  }
  return `Distances read as ${LABEL[unit]}.`;
}
