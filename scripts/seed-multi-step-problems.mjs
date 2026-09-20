// scripts/seed-multi-step-problems.mjs — author the multi-step FS problem set.
//
// Owner, 2026-09-19: "Please work on expanding the problem sets, and make there be more problems of
// varying difficulty … problems have one step, or multiple steps that build on each other as we
// solve the problem."
//
// Written as a script rather than as hand-typed SQL because every problem is CHECKED before it is
// inserted: each step's formula is evaluated against the given values and the chain of earlier
// steps, exactly as `gradeMultiStep` will evaluate it at marking time. A problem whose formula does
// not evaluate, or whose step ids collide, never reaches the database.
//
// That check is not ceremony. A step formula referring to a variable that does not exist evaluates
// to NaN, `gradeMultiStep` reports the step unmarkable, and a student sees "Not answered" against
// an answer they did give. Catching it here costs a second; catching it in production costs
// somebody's trust in the marking.
//
//   node scripts/seed-multi-step-problems.mjs --dry-run
//   node scripts/seed-multi-step-problems.mjs

import pg from 'pg';
import { readFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');

// ── the evaluator, matching lib/problemEngine.ts ────────────────────────────────────────────────
const scopeFns = {
  PI: Math.PI, E: Math.E,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow, floor: Math.floor, ceil: Math.ceil,
  log: Math.log, log10: Math.log10, exp: Math.exp, min: Math.min, max: Math.max,
  round: (n, d = 0) => { const f = Math.pow(10, d); return Math.round((n + Number.EPSILON) * f) / f; },
  toRad: (deg) => deg * Math.PI / 180,
  toDeg: (rad) => rad * 180 / Math.PI,
};
function evalFormula(formula, vars) {
  const scope = { ...scopeFns, ...vars };
  const keys = Object.keys(scope);
  try {
    const fn = new Function(...keys, `"use strict"; return (${formula});`);
    const r = fn(...keys.map((k) => scope[k]));
    return typeof r === 'number' ? r : NaN;
  } catch { return NaN; }
}

// Module uuids are LOOKED UP, not constructed. The pattern `f500000N-…` holds for modules 1-9 and
// breaks at 10 and 11, where the zero-padding runs out — the first attempt at this produced
// "f50000011-…", which is 9 hex digits in an 8-digit group and was rejected by Postgres. Asking the
// database is both correct and immune to the next module being numbered differently.
let MODULE_IDS = new Map();
const M = (n) => {
  const id = MODULE_IDS.get(n);
  if (!id) throw new Error(`No fs_study_module with module_number ${n}`);
  return id;
};

/** difficulty → how many parts it should have, as a sanity check on the authoring. */
// Bands, not rules. Difficulty here is conceptual load, not part count: a four-part level run is
// routine arithmetic and belongs at medium, while a three-part taping-correction problem is hard
// because the sign convention is the thing being tested. The check exists to catch a one-part
// problem labelled hard, not to arbitrate the middle.
const SHAPE = { easy: [1, 2], medium: [2, 4], hard: [3, 6] };

const problems = [
  // ══ MODULE 1 — measurement, error, statistics ═══════════════════════════════════════════════
  {
    module: 1, difficulty: 'easy', tags: ['fs-module-1', 'statistics', 'mpv'],
    statement: 'A distance is measured four times: 214.62, 214.68, 214.65 and 214.61 ft. Find the most probable value.',
    given: { a: 214.62, b: 214.68, c: 214.65, d: 214.61 },
    steps: [
      { id: 'mpv', prompt: 'Most probable value (the mean), in ft', formula: '(a+b+c+d)/4', unit: 'ft', tolerance: 0.005,
        explanation: 'With measurements of equal weight the most probable value is the arithmetic mean.' },
    ],
    explanation: 'Equal-weight observations: the MPV is simply the mean. Keep one more decimal than the readings while working, then round at the end.',
  },
  {
    module: 1, difficulty: 'medium', tags: ['fs-module-1', 'statistics', 'standard-deviation'],
    statement: 'Three measurements of a baseline are 125.44, 125.50 and 125.47 ft. Work out the mean, the sum of the squared residuals, and the standard deviation of a single observation.',
    given: { a: 125.44, b: 125.50, c: 125.47 },
    steps: [
      { id: 'mean', prompt: 'Mean, in ft', formula: '(a+b+c)/3', unit: 'ft', tolerance: 0.005,
        explanation: 'Add the three and divide by three.' },
      { id: 'sumv2', prompt: 'Sum of squared residuals Σv², in ft²', formula: 'pow(a-mean,2)+pow(b-mean,2)+pow(c-mean,2)', unit: 'ft²', tolerance: 0.0002,
        explanation: 'A residual is each reading minus the mean. Square each one and add them; the signs disappear, which is the point.' },
      { id: 'sigma', prompt: 'Standard deviation σ, in ft', formula: 'sqrt(sumv2/(3-1))', unit: 'ft', tolerance: 0.002,
        explanation: 'σ = √(Σv²/(n−1)). The n−1 is Bessel’s correction — one degree of freedom went into computing the mean.' },
    ],
    explanation: 'The three parts are the standard-deviation formula taken one piece at a time. On the exam the calculator’s stat mode does all three at once, but you have to know what it is doing to spot a wrong entry.',
  },
  {
    module: 1, difficulty: 'hard', tags: ['fs-module-1', 'statistics', 'standard-error', 'error-propagation'],
    statement: 'A distance is measured six times with a standard deviation of a single observation of ±0.030 ft. (a) Find the standard error of the mean. (b) Find the 95% error of the mean. (c) The distance is one of four such sections measured to the same precision — find the standard error of their total.',
    given: { sigma: 0.030, n: 6, sections: 4 },
    steps: [
      { id: 'sm', prompt: 'Standard error of the mean, in ft', formula: 'sigma/sqrt(n)', unit: 'ft', tolerance: 0.0005,
        explanation: 'σ_m = σ/√n. Averaging six readings does not make the work six times better — only √6 times.' },
      { id: 'e95', prompt: '95% error of the mean, in ft', formula: '1.96*sm', unit: 'ft', tolerance: 0.0008,
        explanation: 'E95 = 1.96 σ_m. The handbook gives 1.6449 for 90% and 2.576 for 99%.' },
      { id: 'total', prompt: 'Standard error of the sum of four such sections, in ft', formula: 'sm*sqrt(sections)', unit: 'ft', tolerance: 0.0008,
        explanation: 'Errors of a sum propagate as the root of the sum of squares: E = √(E₁²+E₂²+E₃²+E₄²), which for four equal terms is E√4.' },
    ],
    explanation: 'Three different uses of the same √n relationship. Part (c) is the one people get wrong — the errors add in quadrature, not directly.',
  },
  {
    module: 1, difficulty: 'medium', tags: ['fs-module-1', 'error-propagation', 'area'],
    statement: 'A rectangular parcel is 120.00 ft by 80.00 ft. Each distance was measured with a standard error of ±0.04 ft. Find the area, and the standard error of that area.',
    given: { L: 120.00, W: 80.00, eL: 0.04, eW: 0.04 },
    steps: [
      { id: 'area', prompt: 'Area, in ft²', formula: 'L*W', unit: 'ft²', tolerance: 0.5,
        explanation: 'Length times width.' },
      { id: 'eArea', prompt: 'Standard error of the area, in ft²', formula: 'sqrt(pow(W*eL,2)+pow(L*eW,2))', unit: 'ft²', tolerance: 0.2,
        explanation: 'For a product, E_A = √((W·E_L)² + (L·E_W)²). Each error is scaled by the OTHER dimension, because that is how much area a small change in one side sweeps out.' },
    ],
    explanation: 'The classic propagation-of-a-product problem. The trap is multiplying the two errors together, which gives a number far too small.',
  },

  // ══ MODULE 2 — leveling ══════════════════════════════════════════════════════════════════════
  {
    module: 2, difficulty: 'easy', tags: ['fs-module-2', 'leveling', 'hi'],
    statement: 'A benchmark has an elevation of 412.86 ft. The backsight to it reads 5.42 ft. Find the height of instrument.',
    given: { bm: 412.86, bs: 5.42 },
    steps: [
      { id: 'hi', prompt: 'Height of instrument, in ft', formula: 'bm + bs', unit: 'ft', tolerance: 0.005,
        explanation: 'HI = known elevation + backsight. The backsight is always added — you are reading UP from a point of known height.' },
    ],
    explanation: 'The single most-used relationship in differential leveling.',
  },
  {
    module: 2, difficulty: 'medium', tags: ['fs-module-2', 'leveling', 'turning-point'],
    statement: 'From BM-A at elevation 512.40 ft, a backsight reads 4.28 ft. A foresight to turning point TP-1 reads 7.96 ft. From TP-1 a backsight reads 3.15 ft and a foresight to point B reads 9.44 ft. Find the elevation of B.',
    given: { bmA: 512.40, bs1: 4.28, fs1: 7.96, bs2: 3.15, fs2: 9.44 },
    steps: [
      { id: 'hi1', prompt: 'First height of instrument, in ft', formula: 'bmA + bs1', unit: 'ft', tolerance: 0.005,
        explanation: 'HI₁ = BM-A + BS₁.' },
      { id: 'tp1', prompt: 'Elevation of TP-1, in ft', formula: 'hi1 - fs1', unit: 'ft', tolerance: 0.005,
        explanation: 'A foresight is subtracted — you are reading DOWN from the instrument to the point.' },
      { id: 'hi2', prompt: 'Second height of instrument, in ft', formula: 'tp1 + bs2', unit: 'ft', tolerance: 0.005,
        explanation: 'The instrument moved, so a new HI is established from the turning point.' },
      { id: 'elevB', prompt: 'Elevation of B, in ft', formula: 'hi2 - fs2', unit: 'ft', tolerance: 0.005,
        explanation: 'HI₂ − FS₂.' },
    ],
    explanation: 'Backsights add, foresights subtract, and a turning point is just a temporary benchmark. Four parts, and a slip in any one of them carries cleanly to the end.',
  },
  {
    module: 2, difficulty: 'hard', tags: ['fs-module-2', 'leveling', 'closure', 'adjustment'],
    statement: 'A level loop starts and ends on BM-7 (elevation 288.150 ft). The sum of backsights is 24.118 ft and the sum of foresights is 24.186 ft. The loop is 1.6 miles long and ran through 8 setups. (a) What elevation does the loop close on? (b) What is the misclosure? (c) The allowable misclosure is 0.05√(miles) ft — does it pass?  Enter 1 for yes, 0 for no.',
    given: { bm: 288.150, sumBS: 24.118, sumFS: 24.186, miles: 1.6 },
    steps: [
      { id: 'closeElev', prompt: 'Closing elevation from the notes, in ft', formula: 'bm + sumBS - sumFS', unit: 'ft', tolerance: 0.0005,
        explanation: 'Elevation out = elevation in + ΣBS − ΣFS. For a closed loop it should come back to where it started.' },
      { id: 'misclosure', prompt: 'Misclosure (closing − known), in ft', formula: 'closeElev - bm', unit: 'ft', tolerance: 0.0005,
        explanation: 'The loop should return to 288.150. Whatever it is out by is the misclosure; the sign tells you which way.' },
      { id: 'allowable', prompt: 'Allowable misclosure, in ft', formula: '0.05*sqrt(miles)', unit: 'ft', tolerance: 0.0008,
        explanation: 'Allowable = C√M with C = 0.05 ft for ordinary work. Error accumulates as the root of the distance, not in proportion to it.' },
      { id: 'passes', prompt: 'Does it pass? 1 for yes, 0 for no', formula: 'abs(misclosure) <= allowable ? 1 : 0', tolerance: 0.001,
        explanation: 'Compare the absolute misclosure with the allowable. The sign of the misclosure matters for adjusting, not for passing.' },
    ],
    explanation: 'A whole level loop, the way it appears on the exam: compute, close, compare with a specification. Part (d) is deliberately a yes/no — the exam asks it that way too.',
  },

  // ══ MODULE 3 — distance and angle measurement ═══════════════════════════════════════════════
  {
    module: 3, difficulty: 'easy', tags: ['fs-module-3', 'taping', 'slope'],
    statement: 'A slope distance of 156.84 ft is measured on a 4°10′ slope. Find the horizontal distance.',
    given: { slope: 156.84, deg: 4, min: 10 },
    steps: [
      { id: 'horiz', prompt: 'Horizontal distance, in ft', formula: 'slope*cos(toRad(deg + min/60))', unit: 'ft', tolerance: 0.01,
        explanation: 'H = S·cos(θ). Convert the minutes to a decimal degree first: 4°10′ = 4.1667°.' },
    ],
    explanation: 'The commonest reduction in the field. Note the angle is from horizontal; if a zenith angle is given, use sin instead.',
  },
  {
    module: 3, difficulty: 'hard', tags: ['fs-module-3', 'taping', 'corrections'],
    statement: 'A 100 ft steel tape standardised at 68°F and 12 lb pull is used at 94°F with 20 lb pull to measure 100.00 ft. The tape weighs 1.8 lb, its cross-section is 0.0045 in², E = 29,000,000 psi, and the coefficient of thermal expansion is 0.00000645 per °F. It is fully supported. Find the temperature correction, the tension correction, and the corrected distance.',
    given: { L: 100.00, T: 94, T0: 68, P: 20, P0: 12, A: 0.0045, E: 29000000, alpha: 0.00000645 },
    steps: [
      { id: 'cTemp', prompt: 'Temperature correction, in ft', formula: 'alpha*(T-T0)*L', unit: 'ft', tolerance: 0.0003,
        explanation: 'C_t = α(T−T₀)L. The tape is longer than standard when it is hot, so each tape length measures MORE ground than nominal and the correction is positive.' },
      { id: 'cPull', prompt: 'Tension (pull) correction, in ft', formula: '(P-P0)*L/(A*E)', unit: 'ft', tolerance: 0.0003,
        explanation: 'C_p = (P−P₀)L/(AE). Extra pull stretches the tape, which also makes it read long.' },
      { id: 'corrected', prompt: 'Corrected distance, in ft', formula: 'L + cTemp + cPull', unit: 'ft', tolerance: 0.0006,
        explanation: 'Both corrections are added to the measured length here because both make the tape longer than standard.' },
    ],
    explanation: 'The sign convention is what this problem is really testing. A tape that is LONGER than nominal measures a distance as SHORTER than it is, so when you are laying out you subtract and when you are measuring you add. Read the question carefully.',
  },

  // ══ MODULE 4 — traversing and COGO ═════════════════════════════════════════════════════════
  {
    module: 4, difficulty: 'easy', tags: ['fs-module-4', 'cogo', 'inverse'],
    statement: 'Point A is N 5,000.00, E 5,000.00. Point B is N 5,300.00, E 5,400.00. Find the distance from A to B.',
    given: { aN: 5000, aE: 5000, bN: 5300, bE: 5400 },
    steps: [
      { id: 'dist', prompt: 'Distance A to B, in ft', formula: 'sqrt(pow(bN-aN,2)+pow(bE-aE,2))', unit: 'ft', tolerance: 0.01,
        explanation: 'The inverse: √(ΔN² + ΔE²). A 3-4-5 triangle scaled by 100.' },
    ],
    explanation: 'The single most-used COGO operation. Worth doing in one line on the calculator.',
  },
  {
    module: 4, difficulty: 'medium', tags: ['fs-module-4', 'cogo', 'inverse', 'azimuth'],
    statement: 'Point A is N 1,000.00, E 2,000.00. Point B is N 1,300.00, E 2,400.00. Find ΔN, ΔE, the distance, and the azimuth from A to B.',
    given: { aN: 1000, aE: 2000, bN: 1300, bE: 2400 },
    steps: [
      { id: 'dN', prompt: 'ΔN (latitude), in ft', formula: 'bN - aN', unit: 'ft', tolerance: 0.005,
        explanation: 'ΔN = N_B − N_A. Going north is positive.' },
      { id: 'dE', prompt: 'ΔE (departure), in ft', formula: 'bE - aE', unit: 'ft', tolerance: 0.005,
        explanation: 'ΔE = E_B − E_A. Going east is positive.' },
      { id: 'dist', prompt: 'Distance, in ft', formula: 'sqrt(pow(dN,2)+pow(dE,2))', unit: 'ft', tolerance: 0.01,
        explanation: 'Pythagoras on the latitude and departure.' },
      { id: 'az', prompt: 'Azimuth from north, in decimal degrees', formula: 'toDeg(atan2(dE,dN))', unit: '°', tolerance: 0.02,
        explanation: 'Azimuth = atan2(ΔE, ΔN), measured clockwise from north. Note the order — departure first. If the result is negative, add 360°.' },
    ],
    explanation: 'The full inverse. Using atan2 rather than atan avoids having to reason about which quadrant you are in, which is where most exam errors in this topic come from.',
  },
  {
    module: 4, difficulty: 'hard', tags: ['fs-module-4', 'traverse', 'closure', 'precision'],
    statement: 'A four-sided closed traverse has these latitudes and departures (ft): AB N 245.30, E 132.60; BC S 118.40, E 205.10; CD S 210.70, W 160.90; DA N 83.50, W 177.40. Total length is 1,006.4 ft. Find the misclosure in latitude, the misclosure in departure, the linear misclosure, and the precision denominator.',
    given: { latAB: 245.30, depAB: 132.60, latBC: -118.40, depBC: 205.10, latCD: -210.70, depCD: -160.90, latDA: 83.50, depDA: -177.40, perim: 1006.4 },
    steps: [
      { id: 'sumLat', prompt: 'Sum of latitudes (misclosure in latitude), in ft', formula: 'latAB+latBC+latCD+latDA', unit: 'ft', tolerance: 0.005,
        explanation: 'For a closed traverse the latitudes should sum to zero. North is positive, south negative.' },
      { id: 'sumDep', prompt: 'Sum of departures (misclosure in departure), in ft', formula: 'depAB+depBC+depCD+depDA', unit: 'ft', tolerance: 0.005,
        explanation: 'Likewise the departures. East positive, west negative.' },
      { id: 'linear', prompt: 'Linear misclosure, in ft', formula: 'sqrt(pow(sumLat,2)+pow(sumDep,2))', unit: 'ft', tolerance: 0.005,
        explanation: 'The two misclosures are perpendicular, so the closing error is their resultant: √(ΣLat² + ΣDep²).' },
      { id: 'precision', prompt: 'Precision denominator (1 in …) — enter just the number', formula: 'perim/linear', tolerance: 40,
        explanation: 'Precision = perimeter ÷ linear misclosure, reported as 1:N. Express it to the nearest hundred on the exam.' },
    ],
    explanation: 'The complete traverse-closure computation, and the shape of the question the FS exam asks most often in this area. A slip in either sum carries straight through to the precision, which is exactly what carry-forward marking is for.',
  },

  // ══ MODULE 5 — areas, volumes and curves ═══════════════════════════════════════════════════
  {
    module: 5, difficulty: 'medium', tags: ['fs-module-5', 'area', 'coordinates'],
    statement: 'A triangular parcel has corners at (N 1,000, E 1,000), (N 1,000, E 1,400) and (N 1,300, E 1,400). Find the area by coordinates, in square feet, then in acres.',
    given: { n1: 1000, e1: 1000, n2: 1000, e2: 1400, n3: 1300, e3: 1400 },
    steps: [
      { id: 'twice', prompt: 'Twice the area (the cross-product sum), in ft²', formula: 'abs(n1*(e2-e3) + n2*(e3-e1) + n3*(e1-e2))', unit: 'ft²', tolerance: 1,
        explanation: 'The shoelace sum: Σ N_i(E_{i+1} − E_{i−1}). Taking the absolute value saves worrying about which way round the corners were listed.' },
      { id: 'area', prompt: 'Area, in ft²', formula: 'twice/2', unit: 'ft²', tolerance: 0.5,
        explanation: 'Half the cross-product sum.' },
      { id: 'acres', prompt: 'Area, in acres', formula: 'area/43560', unit: 'ac', tolerance: 0.002,
        explanation: 'One acre is 43,560 ft². Worth knowing cold.' },
    ],
    explanation: 'Area by coordinates works for any polygon and is the method to use whenever you have coordinates. Check: this is a right triangle 400 by 300, so 60,000 ft².',
  },
  {
    module: 5, difficulty: 'hard', tags: ['fs-module-5', 'curves', 'horizontal-curve'],
    statement: 'A horizontal curve has a degree of curve (arc definition) of 4°00′ and a deflection angle Δ of 36°00′. Find the radius, the tangent distance, the length of curve, and the long chord.',
    given: { D: 4.0, delta: 36.0 },
    steps: [
      { id: 'R', prompt: 'Radius, in ft', formula: '5729.58/D', unit: 'ft', tolerance: 0.5,
        explanation: 'R = 5729.58/D for the arc definition — 5729.58 is 100·180/π, the radius whose 1° arc is 100 ft.' },
      { id: 'T', prompt: 'Tangent distance, in ft', formula: 'R*tan(toRad(delta/2))', unit: 'ft', tolerance: 0.5,
        explanation: 'T = R·tan(Δ/2). Half the deflection, because the tangent is symmetrical about the PI.' },
      { id: 'L', prompt: 'Length of curve, in ft', formula: '100*delta/D', unit: 'ft', tolerance: 0.5,
        explanation: 'L = 100Δ/D by the arc definition — each degree of curve is 100 ft of arc. Equivalently L = RΔ in radians.' },
      { id: 'LC', prompt: 'Long chord, in ft', formula: '2*R*sin(toRad(delta/2))', unit: 'ft', tolerance: 0.5,
        explanation: 'LC = 2R·sin(Δ/2). It is always shorter than the arc.' },
    ],
    explanation: 'The four numbers every curve problem starts from. Sanity check: the long chord must be less than L, and T is a little over half of L for a curve of this size.',
  },
  {
    module: 5, difficulty: 'medium', tags: ['fs-module-5', 'volume', 'average-end-area'],
    statement: 'Two cross-sections 100 ft apart have end areas of 420 ft² and 560 ft². Find the volume between them by the average end area method, in cubic feet and then in cubic yards.',
    given: { a1: 420, a2: 560, L: 100 },
    steps: [
      { id: 'cf', prompt: 'Volume, in ft³', formula: '(a1+a2)/2*L', unit: 'ft³', tolerance: 1,
        explanation: 'V = L(A₁+A₂)/2. The average of the two end areas times the distance between them.' },
      { id: 'cy', prompt: 'Volume, in cubic yards', formula: 'cf/27', unit: 'yd³', tolerance: 0.5,
        explanation: 'A cubic yard is 27 ft³. Earthwork is always reported in cubic yards.' },
    ],
    explanation: 'Average end area slightly overestimates when the sections differ a lot; the prismoidal formula is the refinement, and the exam will tell you which to use.',
  },

  // ══ MODULE 6 — GNSS and geodesy ════════════════════════════════════════════════════════════
  {
    module: 6, difficulty: 'medium', tags: ['fs-module-6', 'geodesy', 'scale-factor'],
    statement: 'A ground distance of 2,480.00 ft is to be reduced to grid. The elevation factor is 0.9999704 and the grid scale factor is 0.9999214. Find the combined factor and the grid distance.',
    given: { ground: 2480.00, ef: 0.9999704, sf: 0.9999214 },
    steps: [
      { id: 'cf', prompt: 'Combined factor (6 decimal places)', formula: 'ef*sf', tolerance: 0.0000005,
        explanation: 'The combined factor is the elevation factor times the grid scale factor — the two reductions are independent and multiply.' },
      { id: 'grid', prompt: 'Grid distance, in ft', formula: 'ground*cf', unit: 'ft', tolerance: 0.01,
        explanation: 'Grid = ground × combined factor. Going the other way, divide.' },
    ],
    explanation: 'Ground to grid multiplies; grid to ground divides. Getting this backwards is one of the most common errors on the exam, and on real projects.',
  },

  // ══ MODULE 8 — photogrammetry ══════════════════════════════════════════════════════════════
  {
    module: 8, difficulty: 'medium', tags: ['fs-module-8', 'photogrammetry', 'scale'],
    statement: 'A vertical aerial photograph is taken with a 6 in focal length camera from 4,800 ft above mean terrain. (a) What is the photo scale, as 1 in N ft? (b) A road measures 3.20 in on the photo — how long is it on the ground?',
    given: { f_in: 6, H: 4800, photo_in: 3.20 },
    steps: [
      { id: 'scaleN', prompt: 'Scale denominator in feet per inch (1 in = ? ft)', formula: 'H/(f_in/12)/12', unit: 'ft/in', tolerance: 1,
        explanation: 'Scale = f/H. With f = 6 in = 0.5 ft and H = 4800 ft, the ratio is 1:9600 — and 9600 in is 800 ft, so one inch on the photo is 800 ft on the ground.' },
      { id: 'ground', prompt: 'Ground length of the road, in ft', formula: 'photo_in*scaleN', unit: 'ft', tolerance: 5,
        explanation: 'Photo inches times feet-per-inch.' },
    ],
    explanation: 'Keep the units straight: scale is dimensionless (1:9600) but it is most useful expressed as feet on the ground per inch on the photo.',
  },

  // ══ MODULE 11 — business and economics ═════════════════════════════════════════════════════
  {
    module: 11, difficulty: 'medium', tags: ['fs-module-11', 'economics', 'present-worth'],
    statement: 'A total station costs $28,000 today and will be worth $6,000 in 7 years. Using 8% interest, find the single-payment present worth of the salvage value, and the net present cost of owning the instrument.',
    given: { cost: 28000, salvage: 6000, i: 0.08, n: 7 },
    steps: [
      { id: 'pw', prompt: 'Present worth of the salvage value, in dollars', formula: 'salvage/pow(1+i,n)', unit: '$', tolerance: 2,
        explanation: 'P = F/(1+i)ⁿ — the single-payment present-worth factor, (P/F, i, n).' },
      { id: 'net', prompt: 'Net present cost, in dollars', formula: 'cost - pw', unit: '$', tolerance: 2,
        explanation: 'What you pay now, less what you will get back discounted to today.' },
    ],
    explanation: 'Engineering economics on the FS is mostly recognising which factor is being asked for. (P/F) discounts a single future sum; (P/A) discounts a series.',
  },
];

// ── check every problem before anything is written ──────────────────────────────────────────────
let bad = 0;
for (const p of problems) {
  const scope = { ...p.given };
  const seen = new Set();
  for (const s of p.steps) {
    if (seen.has(s.id)) { console.log(`✗ m${p.module} "${p.statement.slice(0, 40)}…": duplicate step id ${s.id}`); bad++; }
    seen.add(s.id);
    const v = s.formula ? evalFormula(s.formula, scope) : Number(s.answer);
    if (!Number.isFinite(v)) {
      console.log(`✗ m${p.module} step "${s.id}" does not evaluate: ${s.formula}`);
      bad++;
    }
    scope[s.id] = v;
  }
  const [lo, hi] = SHAPE[p.difficulty] ?? [1, 9];
  if (p.steps.length < lo || p.steps.length > hi) {
    console.log(`✗ m${p.module} marked ${p.difficulty} but has ${p.steps.length} parts (expected ${lo}-${hi})`);
    bad++;
  }
}
if (bad > 0) { console.log(`\n${bad} problem(s) failed the check — nothing written.`); process.exit(1); }

console.log(`✓ ${problems.length} problems, ${problems.reduce((n, p) => n + p.steps.length, 0)} parts, all formulas evaluate.`);
for (const p of problems) {
  const scope = { ...p.given };
  const answers = p.steps.map((s) => {
    const v = s.formula ? evalFormula(s.formula, scope) : Number(s.answer);
    scope[s.id] = v;
    return `${s.id}=${Math.round(v * 1000) / 1000}`;
  });
  console.log(`   m${String(p.module).padStart(2)} ${p.difficulty.padEnd(6)} ${p.steps.length}p  ${answers.join('  ')}`);
}
if (DRY) { console.log('\ndry run — nothing written.'); process.exit(0); }

// ── write ───────────────────────────────────────────────────────────────────────────────────────
const url = (readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const mods = await c.query('select module_number, id from fs_study_modules');
MODULE_IDS = new Map(mods.rows.map((r) => [r.module_number, r.id]));
const missing = [...new Set(problems.map((p) => p.module))].filter((n) => !MODULE_IDS.has(n));
if (missing.length) {
  console.log(`✗ no module row for: ${missing.join(', ')} — nothing written.`);
  await c.end();
  process.exit(1);
}
let written = 0;
try {
  await c.query('begin');
  for (const p of problems) {
    // Idempotent by the tag that names the problem set, the way the other question seeds are.
    await c.query(
      `delete from question_bank where question_type = 'multi_step' and question_text = $1`,
      [p.statement],
    );
    await c.query(
      `insert into question_bank
         (question_text, question_type, correct_answer, explanation, difficulty,
          module_id, exam_category, tags, steps, given_vars, options)
       values ($1,'multi_step',$2,$3,$4,$5,'FS',$6,$7::jsonb,$8::jsonb,'[]'::jsonb)`,
      [
        p.statement,
        // `correct_answer` is NOT NULL on this table and means nothing for a step ladder; the final
        // step's id records where the answer actually lives rather than leaving a misleading value.
        `see steps: ${p.steps[p.steps.length - 1].id}`,
        p.explanation ?? null,
        p.difficulty,
        M(p.module),
        p.tags,
        JSON.stringify(p.steps),
        JSON.stringify(p.given),
      ],
    );
    written++;
  }
  await c.query('commit');
  console.log(`\n✓ wrote ${written} multi-step problems.`);
} catch (e) {
  await c.query('rollback');
  console.log('\n✗ nothing written:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
