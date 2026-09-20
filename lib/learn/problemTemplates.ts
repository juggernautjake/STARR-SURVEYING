// lib/learn/problemTemplates.ts — problems that are different every time you open them.
//
// Owner, 2026-09-20: "Make sure we are able to generate new problems and that they all work every
// time and that the grading works every time too."
//
// ── A FIXED PROBLEM SET TEACHES ITSELF AWAY ─────────────────────────────────────────────────────
//
// Fifty-three written problems is a good bank and it has a short half-life. The second time through,
// you remember that the answer was 500 ft, and remembering an answer is indistinguishable from
// knowing a method right up until the exam, where it is worth nothing.
//
// A template is the method with the numbers left out. Same shape, same traps, new arithmetic — so
// the only way to answer it the fourth time is the same way you answered it the first.
//
// ── EVERY GENERATED PROBLEM MUST WORK. NOT ALMOST EVERY ONE. ────────────────────────────────────
//
// This is the hard part, and it is the reason templates are usually a bad idea done carelessly.
// Random numbers find the degenerate cases that hand-written problems never hit:
//
//   · a bearing that lands exactly on a quadrant boundary, where the answer is arguably two things
//   · a vertical curve whose high point falls outside the curve, so the question has no answer
//   · a traverse that closes perfectly, making "find the precision" a division by zero
//   · a tolerance that is wider than the gap between the right answer and a plausible wrong one,
//     so a wrong answer marks correct
//
// None of these throw. Every one produces a problem that looks fine and is broken, and the student
// concludes they are bad at surveying.
//
// So each template carries a `valid` predicate, and `generate` REJECTS AND RESAMPLES until it holds
// — then the test file generates thousands of instances per template and checks not just that they
// evaluate but that grading the true answers marks every step correct, and that grading a
// deliberately wrong answer marks it wrong.
//
// ── SEEDED, SO A PROBLEM CAN BE REOPENED ────────────────────────────────────────────────────────
//
// `generate(template, seed)` is deterministic. That is what lets a problem be linked to, recorded
// against an attempt, and reproduced exactly when somebody asks "show me that one again" — without
// storing the whole thing. A bug report that says "seed 41839 grades wrong" is reproducible; one
// that says "a curve problem graded wrong this morning" is not.

import type { ProblemStep } from './gradeSteps';

/** A value the template draws each time. */
export interface ParamSpec {
  min: number;
  max: number;
  /** Rounded to this many decimals, so the problem reads like a field note and not like a float. */
  decimals?: number;
  /** Drawn as a multiple of this, for stationing and whole-degree angles. */
  step?: number;
}

export interface ProblemTemplate {
  id: string;
  /** Which FS module it belongs to. */
  module: number;
  difficulty: 'easy' | 'medium' | 'hard';
  title: string;
  tags: string[];
  params: Record<string, ParamSpec>;
  /** Values computed from the drawn params, available to the statement and the steps. */
  derived?: (p: Record<string, number>) => Record<string, number>;
  /** The problem in words. `{name}` is replaced with the value, `{name:2}` with 2 decimals. */
  statement: string;
  steps: ProblemStep[];
  explanation: string;
  /**
   * Whether a draw is usable.
   *
   * This is where the degenerate cases are excluded, and each template says in words which one it
   * is guarding against. A predicate with no comment is a predicate nobody can safely change.
   */
  valid: (v: Record<string, number>) => boolean;
}

// ── the random source ───────────────────────────────────────────────────────────────────────────
//
// mulberry32. Small, fast, and — the property that matters here — identical in every JavaScript
// runtime, so a seed that reproduces a problem on the server reproduces it in the browser. Math.random
// cannot be seeded at all, which would make "show me that problem again" impossible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(rand: () => number, spec: ParamSpec): number {
  const raw = spec.min + rand() * (spec.max - spec.min);
  if (spec.step) {
    const n = Math.round(raw / spec.step) * spec.step;
    // Multiplying floats reintroduces the noise `step` exists to remove: 0.1 * 3 is
    // 0.30000000000000004, and a "whole degree" of 137.00000000000003 renders as exactly that.
    return Number(n.toFixed(6));
  }
  return Number(raw.toFixed(spec.decimals ?? 2));
}

/** Fill `{name}` and `{name:n}` placeholders from the values. */
export function fillTemplate(text: string, values: Record<string, number>): string {
  return text.replace(/\{(\w+)(?::(\d+))?\}/g, (whole, name: string, dp?: string) => {
    const v = values[name];
    if (v === undefined || !Number.isFinite(v)) return whole;
    return dp === undefined ? String(v) : v.toFixed(Number(dp));
  });
}

export interface GeneratedProblem {
  templateId: string;
  seed: number;
  module: number;
  difficulty: 'easy' | 'medium' | 'hard';
  title: string;
  tags: string[];
  statement: string;
  given: Record<string, number>;
  steps: ProblemStep[];
  explanation: string;
}

/** How many draws before giving up. */
const MAX_ATTEMPTS = 200;

/**
 * Build one problem from a template.
 *
 * Throws if the template cannot produce a valid draw. That is deliberate and it is the right
 * behaviour: a template whose `valid` predicate rejects everything is a bug in the template, and the
 * alternative — returning a problem that failed its own validity check — is how a broken problem
 * reaches a student. The test file generates every template thousands of times, so this throw fires
 * in CI rather than in front of somebody studying.
 */
export function generate(template: ProblemTemplate, seed: number): GeneratedProblem {
  const rand = mulberry32(seed);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const params: Record<string, number> = {};
    for (const [name, spec] of Object.entries(template.params)) params[name] = draw(rand, spec);

    const values = { ...params, ...(template.derived?.(params) ?? {}) };
    if (Object.values(values).some((v) => !Number.isFinite(v))) continue;
    if (!template.valid(values)) continue;

    return {
      templateId: template.id,
      seed,
      module: template.module,
      difficulty: template.difficulty,
      title: template.title,
      tags: template.tags,
      statement: fillTemplate(template.statement, values),
      given: values,
      steps: template.steps.map((s) => ({ ...s, prompt: fillTemplate(s.prompt, values) })),
      explanation: fillTemplate(template.explanation, values),
    };
  }

  throw new Error(
    `template '${template.id}' produced no valid draw in ${MAX_ATTEMPTS} attempts — ` +
    'its parameter ranges and its `valid` predicate disagree.',
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE TEMPLATES
//
// Each one is a method somebody has to be able to do cold, not a number they can memorise.
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const PROBLEM_TEMPLATES: ProblemTemplate[] = [
  // ── m1 · error and statistics ─────────────────────────────────────────────────────────────────
  {
    id: 'gen-precision-ratio',
    module: 1, difficulty: 'easy',
    title: 'Precision of a traverse',
    tags: ['fs-module-1', 'precision', 'generated'],
    params: {
      perim: { min: 1200, max: 5200, decimals: 2 },
      misclosure: { min: 0.05, max: 0.55, decimals: 2 },
    },
    statement: 'A traverse {perim:2} ft long closes with a linear misclosure of {misclosure:2} ft. Find the precision, expressed as the denominator of 1:N.',
    steps: [
      { id: 'precision', prompt: 'Precision denominator — enter just the number', formula: 'perim/misclosure', tolerance: 250,
        explanation: 'Precision = perimeter / misclosure, written 1:N and normally rounded DOWN to a round figure. Rounding up would claim a precision you did not achieve.' },
    ],
    explanation: 'Precision is a ratio, so it has no units and does not depend on how long the traverse is — which is the point of expressing it this way. Most boundary work is specified at 1:10,000 or better.',
    // A misclosure that rounds to 0.00 would divide by zero, and one near zero gives a precision so
    // large the tolerance swallows every answer. Both are excluded by the parameter range, and the
    // predicate says so explicitly rather than relying on the range never being widened.
    valid: (v) => v.misclosure >= 0.05 && v.perim / v.misclosure > 2500,
  },

  // ── m2 · levelling ────────────────────────────────────────────────────────────────────────────
  {
    id: 'gen-level-hi',
    module: 2, difficulty: 'medium',
    title: 'Height of instrument and a turning point',
    tags: ['fs-module-2', 'leveling', 'generated'],
    params: {
      bmElev: { min: 280, max: 1450, decimals: 2 },
      bs: { min: 1.20, max: 11.80, decimals: 2 },
      fs: { min: 0.90, max: 11.50, decimals: 2 },
    },
    statement: 'A level is set up and a backsight of {bs:2} ft is read on a benchmark at elevation {bmElev:2} ft. A foresight of {fs:2} ft is then read on a turning point. (a) What is the height of instrument? (b) What is the elevation of the turning point?',
    steps: [
      { id: 'hi', prompt: 'Height of instrument, in ft', formula: 'bmElev + bs', unit: 'ft', tolerance: 0.01,
        explanation: 'HI = known elevation + backsight. A backsight is always ADDED — you are reading up from a point whose elevation you know to the line of sight.' },
      { id: 'tp', prompt: 'Elevation of the turning point, in ft', formula: 'hi - fs', unit: 'ft', tolerance: 0.01,
        explanation: 'Elevation = HI − foresight. A foresight is always SUBTRACTED — you are reading down from the line of sight to the point you are establishing.' },
    ],
    explanation: 'Backsight plus, foresight minus, every time. The rod reading is a distance DOWN from the line of sight, so a bigger reading means a lower point — which is the one thing about levelling that feels backwards until it does not.',
    // Nothing degenerate is possible here: any positive rod readings give a sensible answer.
    valid: () => true,
  },

  // ── m3 · the inverse ──────────────────────────────────────────────────────────────────────────
  {
    id: 'gen-inverse',
    module: 3, difficulty: 'hard',
    title: 'Inverse between two coordinates',
    tags: ['fs-module-3', 'inverse', 'generated'],
    params: {
      nA: { min: 4000, max: 6000, decimals: 2 },
      eA: { min: 3000, max: 5000, decimals: 2 },
      dN: { min: -900, max: 900, decimals: 2 },
      dE: { min: -900, max: 900, decimals: 2 },
    },
    derived: (p) => ({ nB: Number((p.nA + p.dN).toFixed(2)), eB: Number((p.eA + p.dE).toFixed(2)) }),
    statement: 'From point A at N {nA:2}, E {eA:2} to point B at N {nB:2}, E {eB:2}. (a) What is the latitude of the course? (b) The departure? (c) The length? (d) The azimuth, in decimal degrees?',
    steps: [
      { id: 'lat', prompt: 'Latitude (change in northing), in ft', formula: 'nB - nA', unit: 'ft', tolerance: 0.02,
        explanation: 'Destination minus origin, always. A negative latitude means the course runs south, and keeping that sign is what makes the azimuth come out right with no extra thought.' },
      { id: 'dep', prompt: 'Departure (change in easting), in ft', formula: 'eB - eA', unit: 'ft', tolerance: 0.02,
        explanation: 'Destination minus origin again. Positive means east.' },
      { id: 'len', prompt: 'Length of the course, in ft', formula: 'sqrt(lat*lat + dep*dep)', unit: 'ft', tolerance: 0.05,
        explanation: 'Pythagoras on the latitude and departure. On a TI-30Xa: latitude, x², +, departure, x², =, √x.' },
      { id: 'az', prompt: 'Azimuth of the course, in decimal degrees', formula: '(toDeg(atan2(dep, lat)) + 360) % 360', unit: 'deg', tolerance: 0.03,
        explanation: 'atan2(departure, latitude) returns the azimuth with the quadrant already right. A plain arctangent of dep/lat cannot know the quadrant — it answers between −90° and +90°, and the rest is your judgement.' },
    ],
    explanation: 'The inverse is the most-used computation on the exam. Read the signs of the latitude and departure before you trust any angle: they name the quadrant, and the quadrant is what a bare arctangent leaves out.',
    // Two exclusions. A course shorter than 120 ft makes the azimuth hypersensitive to coordinates
    // rounded to a hundredth, so the stated tolerance stops being meaningful.
    //
    // And a latitude or departure near zero puts the course on a quadrant boundary — effectively
    // due north or due east — where the quadrant is arguably two things and a student who picks
    // the other one is marked wrong for being right. 30 ft is the threshold rather than a fraction
    // of a foot: the point is not to avoid an exact tie, it is to keep the course unambiguously
    // inside one quadrant, which is the judgement the problem is teaching.
    valid: (v) => Math.hypot(v.dN, v.dE) > 120 && Math.abs(v.dN) > 30 && Math.abs(v.dE) > 30,
  },

  // ── m3 · DMS ──────────────────────────────────────────────────────────────────────────────────
  {
    id: 'gen-dms-decimal',
    module: 3, difficulty: 'easy',
    title: 'DMS to decimal degrees',
    tags: ['fs-module-3', 'dms', 'generated'],
    params: {
      d: { min: 1, max: 89, step: 1 },
      m: { min: 0, max: 59, step: 1 },
      s: { min: 0, max: 59, step: 1 },
    },
    statement: 'Convert {d}° {m}′ {s}″ to decimal degrees.',
    steps: [
      { id: 'dd', prompt: 'Decimal degrees', formula: 'd + m/60 + s/3600', unit: 'deg', tolerance: 0.00005,
        explanation: 'Degrees, plus minutes over 60, plus seconds over 3600. On an AOS calculator the whole thing is one chain ending in a single equals — the divisions resolve before the additions without any brackets.' },
    ],
    explanation: 'Every trig function wants decimal degrees and almost every angle on the exam arrives as DMS. Convert once at the start, work in decimal throughout, and convert back only at the end — going back and forth at every step is how rounding error creeps in.',
    // Guarded because a rounded answer to 5 decimals must still be distinguishable from the exact
    // value at the stated tolerance, which it always is for whole seconds.
    valid: () => true,
  },

  // ── m5 · horizontal curve ─────────────────────────────────────────────────────────────────────
  {
    id: 'gen-curve-elements',
    module: 5, difficulty: 'hard',
    title: 'Horizontal curve elements and stationing',
    tags: ['fs-module-5', 'curves', 'generated'],
    params: {
      D: { min: 2, max: 9, step: 0.5 },
      delta: { min: 12, max: 82, step: 0.5 },
      piSta: { min: 2000, max: 9000, step: 5 },
    },
    derived: (p) => ({ R: Number((5729.58 / p.D).toFixed(2)) }),
    statement: 'A horizontal curve has a degree of curve of {D}° (arc definition) and a central angle Δ of {delta}°. The PI is at station {piSta} ft. (a) What is the radius? (b) The tangent distance? (c) The curve length? (d) The station of the PT?',
    steps: [
      { id: 'radius', prompt: 'Radius, in ft', formula: '5729.58/D', unit: 'ft', tolerance: 0.5,
        explanation: 'R = 5729.58 / D for the arc definition, where 5729.58 is 100 × 180 / π. Worth memorising — every curve problem starts here.' },
      { id: 'T', prompt: 'Tangent distance, in ft', formula: 'radius*tan(toRad(delta/2))', unit: 'ft', tolerance: 0.2,
        explanation: 'T = R·tan(Δ/2). Half the central angle, not the whole one — the single most-missed detail in curve work.' },
      { id: 'L', prompt: 'Curve length, in ft', formula: 'radius*toRad(delta)', unit: 'ft', tolerance: 0.2,
        explanation: 'L = R·Δ with Δ in radians. In degrees that is πRΔ/180, which is the same thing written out.' },
      { id: 'ptSta', prompt: 'Station of the PT, in ft', formula: 'piSta - T + L', unit: 'ft', tolerance: 0.3,
        explanation: 'PC = PI − T, then PT = PC + L, going ALONG THE CURVE. Adding T to the PI instead is wrong: the curve is shorter than the two tangents it replaces, and the difference is 2T − L.' },
    ],
    explanation: 'Stationing follows the alignment, and the alignment follows the curve rather than the tangents. PT = PC + L, never PI + T.',
    // A Δ at or past 180° has no tangent distance, and one near it sends T to infinity. A PC before
    // station zero would mean negative stationing, which is legal on a real alignment and a
    // distraction in a problem about curve elements.
    valid: (v) => {
      const R = 5729.58 / v.D;
      const T = R * Math.tan((v.delta / 2) * Math.PI / 180);
      return v.delta < 100 && T < v.piSta && T > 20;
    },
  },

  // ── m4 · latitude and departure ───────────────────────────────────────────────────────────────
  {
    id: 'gen-lat-dep',
    module: 4, difficulty: 'medium',
    title: 'Latitude and departure of a course',
    tags: ['fs-module-4', 'traverse', 'generated'],
    params: {
      L: { min: 180, max: 950, decimals: 2 },
      az: { min: 0.5, max: 359.5, decimals: 2 },
    },
    statement: 'A course is {L:2} ft long at an azimuth of {az:2}°. (a) What is its latitude? (b) Its departure?',
    steps: [
      { id: 'lat', prompt: 'Latitude, in ft', formula: 'L*cos(toRad(az))', unit: 'ft', tolerance: 0.02,
        explanation: 'Latitude = L·cos(azimuth). Working from the azimuth rather than a quadrant bearing means the sign arrives on its own — negative is south, and you never do any quadrant bookkeeping.' },
      { id: 'dep', prompt: 'Departure, in ft', formula: 'L*sin(toRad(az))', unit: 'ft', tolerance: 0.02,
        explanation: 'Departure = L·sin(azimuth). Negative is west.' },
    ],
    explanation: 'Cosine for latitude, sine for departure — remembered by north being the reference direction, so the cosine (which is 1 at zero) belongs to the northing. Check the signs against the quadrant every time; it takes a second and catches a whole class of error.',
    // An azimuth within half a degree of a cardinal makes one component almost exactly zero, where
    // the absolute tolerance stops discriminating between a right answer and a sign error.
    valid: (v) => {
      const off = Math.min(...[0, 90, 180, 270, 360].map((c) => Math.abs(v.az - c)));
      return off > 1.5;
    },
  },

  // ── m5 · area by coordinates ──────────────────────────────────────────────────────────────────
  {
    id: 'gen-area-coordinates',
    module: 5, difficulty: 'medium',
    title: 'Area of a triangle by coordinates',
    tags: ['fs-module-5', 'area', 'generated'],
    params: {
      n1: { min: 900, max: 1100, decimals: 2 },
      e1: { min: 900, max: 1100, decimals: 2 },
      n2: { min: 1200, max: 1600, decimals: 2 },
      e2: { min: 950, max: 1400, decimals: 2 },
      n3: { min: 950, max: 1300, decimals: 2 },
      e3: { min: 1500, max: 1900, decimals: 2 },
    },
    statement: 'A parcel has corners at A (N {n1:2}, E {e1:2}), B (N {n2:2}, E {e2:2}) and C (N {n3:2}, E {e3:2}), taken in order. (a) What is the double area? (b) The area in square feet? (c) In acres?',
    steps: [
      { id: 'doubleArea', prompt: 'Double area, in sq ft (enter the absolute value)', formula: 'abs(n1*e2 - n2*e1 + n2*e3 - n3*e2 + n3*e1 - n1*e3)', unit: 'sq ft', tolerance: 60,
        explanation: 'Cross-products corner by corner around the figure and back to the first. The sign only tells you which way round you went, so take the absolute value.' },
      { id: 'area', prompt: 'Area, in sq ft', formula: 'doubleArea/2', unit: 'sq ft', tolerance: 30,
        explanation: 'Half the double area. The method is built to give twice the area so that it needs no fractions until the last step.' },
      { id: 'acres', prompt: 'Area, in acres', formula: 'area/43560', unit: 'acres', tolerance: 0.005,
        explanation: '43,560 square feet to the acre — 66 × 660, a chain by a furlong.' },
    ],
    explanation: 'The coordinate method is exact for any closed figure with straight sides and needs no bearings or distances at all. Go round in one consistent direction and never skip the closing term back to the first corner.',
    // Three nearly-collinear corners give an area near zero, where the absolute tolerance is wider
    // than the answer and any number at all marks correct.
    valid: (v) => {
      const twice = Math.abs(
        v.n1 * v.e2 - v.n2 * v.e1 + v.n2 * v.e3 - v.n3 * v.e2 + v.n3 * v.e1 - v.n1 * v.e3,
      );
      return twice / 2 > 20000;
    },
  },

  // ── m6 · grid and ground ──────────────────────────────────────────────────────────────────────
  {
    id: 'gen-combined-factor',
    module: 6, difficulty: 'hard',
    title: 'Ground distance to grid distance',
    tags: ['fs-module-6', 'grid', 'generated'],
    params: {
      ground: { min: 800, max: 6500, decimals: 2 },
      elev: { min: 150, max: 6200, decimals: 0 },
      k: { min: 0.99988, max: 1.00008, decimals: 7 },
    },
    statement: 'A ground distance of {ground:2} ft is measured at an average elevation of {elev:0} ft, where the grid scale factor is {k:7}. Using a mean earth radius of 20,906,000 ft, find (a) the elevation factor, (b) the combined factor, and (c) the grid distance.',
    steps: [
      { id: 'ef', prompt: 'Elevation factor — to 7 decimal places', formula: '20906000/(20906000+elev)', tolerance: 0.0000005,
        explanation: 'EF = R/(R+h). Above the ellipsoid your measured distance is longer than the arc at sea level, so the factor is a little less than 1.' },
      { id: 'cf', prompt: 'Combined factor — to 7 decimal places', formula: 'ef*k', tolerance: 0.0000005,
        explanation: 'CF = EF × grid scale factor. The two corrections are independent, so they multiply.' },
      { id: 'grid', prompt: 'Grid distance, in ft', formula: 'ground*cf', unit: 'ft', tolerance: 0.02,
        explanation: 'Grid = ground × CF. Going the other way — grid to ground — you divide.' },
    ],
    explanation: 'The commonest mistake is applying the combined factor the wrong way round. Ground to grid multiplies; grid to ground divides. Carry seven decimal places throughout — rounding a combined factor to four is a part-per-ten-thousand error, which is 0.5 ft on a mile and larger than anything else in the computation.',
    valid: () => true,
  },

  // ── m8 · photo scale ──────────────────────────────────────────────────────────────────────────
  {
    id: 'gen-photo-scale',
    module: 8, difficulty: 'medium',
    title: 'Photo scale and ground distance',
    tags: ['fs-module-8', 'photogrammetry', 'generated'],
    params: {
      f_in: { min: 3, max: 12, step: 0.5 },
      H: { min: 2400, max: 12000, step: 100 },
      photo_in: { min: 1.2, max: 7.5, decimals: 2 },
    },
    statement: 'A vertical aerial photograph is taken with a {f_in} in focal length camera from {H} ft above mean terrain. (a) How many feet on the ground does one inch on the photo represent? (b) A road measures {photo_in:2} in on the photo — how long is it on the ground?',
    steps: [
      { id: 'scaleN', prompt: 'Feet on the ground per inch on the photo', formula: 'H/f_in', unit: 'ft/in', tolerance: 1,
        explanation: 'Scale is f/H, so one inch of photo covers H/f feet of ground. Both are already in inches and feet respectively, so the ratio is direct.' },
      { id: 'ground', prompt: 'Ground length of the road, in ft', formula: 'photo_in*scaleN', unit: 'ft', tolerance: 5,
        explanation: 'Photo inches times feet-per-inch. The photo distance is a measurement on a print or a screen, so it carries whatever error your ruler does — at 1,200 ft per inch, a fortieth of an inch is 30 ft on the ground.' },
    ],
    explanation: 'Photogrammetry on the FS is unit bookkeeping more than optics. Keep focal length and flying height in compatible units and the rest follows.',
    valid: () => true,
  },

  // ── m11 · engineering economics ───────────────────────────────────────────────────────────────
  {
    id: 'gen-present-worth',
    module: 11, difficulty: 'medium',
    title: 'Present worth of a future sum',
    tags: ['fs-module-11', 'economics', 'generated'],
    params: {
      cost: { min: 9000, max: 65000, step: 500 },
      salvage: { min: 1000, max: 18000, step: 250 },
      i: { min: 0.03, max: 0.12, decimals: 3 },
      n: { min: 3, max: 12, step: 1 },
    },
    statement: 'A piece of equipment costs ${cost} today and will be worth ${salvage} in {n} years. At {i} interest, (a) what is the present worth of the salvage value, and (b) what is the net present cost of owning it?',
    steps: [
      { id: 'pw', prompt: 'Present worth of the salvage value, in dollars', formula: 'salvage/pow(1+i,n)', unit: '$', tolerance: 2,
        explanation: 'P = F/(1+i)ⁿ — the single-payment present-worth factor, written (P/F, i, n).' },
      { id: 'net', prompt: 'Net present cost, in dollars', formula: 'cost - pw', unit: '$', tolerance: 2,
        explanation: 'What you pay now, less what you will get back discounted to today.' },
    ],
    explanation: 'Engineering economics on the FS is mostly recognising which factor is being asked for. (P/F) discounts a single future sum; (P/A) discounts a series. Getting the factor right matters more than the arithmetic.',
    // A salvage worth more than the purchase price is not a piece of equipment, it is an
    // investment, and the phrase "net present cost" stops making sense when it comes out negative.
    valid: (v) => v.salvage < v.cost * 0.6,
  },
];

/** One template by id. */
export function problemTemplate(id: string): ProblemTemplate | undefined {
  return PROBLEM_TEMPLATES.find((t) => t.id === id);
}

/** Templates for a module, in the order they should be met. */
export function templatesForModule(module: number): ProblemTemplate[] {
  return PROBLEM_TEMPLATES.filter((t) => t.module === module);
}
