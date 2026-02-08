// lib/problemGenerators.ts — Procedural math problem generators for SIT/FS exam prep
// Each generator produces a problem with randomized values and a detailed step-by-step solution

export interface GeneratedProblem {
  id: string;
  question_text: string;
  question_type: 'numeric_input' | 'multiple_choice' | 'short_answer' | 'fill_blank';
  options?: string[];
  correct_answer: string;
  tolerance: number; // absolute tolerance for numeric answers
  solution_steps: SolutionStep[];
  difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
  category: string;
  subcategory: string;
  tags: string[];
  explanation: string;
}

export interface SolutionStep {
  step_number: number;
  title: string;
  description?: string;
  formula?: string;
  calculation?: string;
  result?: string;
}

// Utility: random number in range (inclusive)
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals: number = 2): number {
  const val = Math.random() * (max - min) + min;
  const f = Math.pow(10, decimals);
  return Math.round(val * f) / f;
}

// Precise rounding that avoids floating point issues
function round(val: number, decimals: number = 4): number {
  const f = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * f) / f;
}

function toRad(deg: number): number { return deg * Math.PI / 180; }
function toDeg(rad: number): number { return rad * 180 / Math.PI; }

function uuid(): string {
  return 'gen-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
}

// Convert decimal degrees to DMS string
function decToDMS(decimal: number): string {
  const d = Math.floor(Math.abs(decimal));
  const mFull = (Math.abs(decimal) - d) * 60;
  const m = Math.floor(mFull);
  const s = round((mFull - m) * 60, 1);
  return `${d}°${m}'${s}"`;
}

// Random name for problem context
const FIRST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Wilson'];
const POINT_NAMES = ['A', 'B', 'C', 'D', 'E', 'P', 'Q', 'R', 'S', 'T'];
const BM_NAMES = ['BM-1', 'BM-2', 'BM-3', 'BM Alpha', 'BM Bravo', 'BM Charlie', 'BM 100', 'BM 200'];

function randName(): string { return FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)]; }
function randPoint(exclude: string[] = []): string {
  const available = POINT_NAMES.filter(p => !exclude.includes(p));
  return available[randInt(0, available.length - 1)];
}
function randBM(): string { return BM_NAMES[randInt(0, BM_NAMES.length - 1)]; }

// ============================================================================
// CATEGORY 1: STATISTICS & ERROR ANALYSIS (Module 1)
// ============================================================================

function genStandardDeviation(): GeneratedProblem {
  const n = randInt(4, 8);
  const baseVal = randFloat(100, 500, 2);
  const measurements: number[] = [];
  for (let i = 0; i < n; i++) {
    measurements.push(round(baseVal + randFloat(-0.1, 0.1, 3), 3));
  }
  const mean = round(measurements.reduce((s, v) => s + v, 0) / n, 4);
  const residuals = measurements.map(m => round(m - mean, 4));
  const sumVSq = round(residuals.reduce((s, v) => s + v * v, 0), 6);
  const stdDev = round(Math.sqrt(sumVSq / (n - 1)), 4);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'List the measurements', description: `Measurements: ${measurements.join(', ')} ft`, result: `n = ${n}` },
    { step_number: 2, title: 'Calculate the mean (Most Probable Value)', formula: 'Mean = Σx / n', calculation: `Mean = ${measurements.join(' + ')} / ${n} = ${round(measurements.reduce((s, v) => s + v, 0), 4)} / ${n}`, result: `Mean = ${mean} ft` },
    { step_number: 3, title: 'Calculate residuals (v = measurement - mean)', description: residuals.map((r, i) => `v${i + 1} = ${measurements[i]} - ${mean} = ${r >= 0 ? '+' : ''}${r}`).join('\n'), result: `Residuals: ${residuals.map(r => r.toFixed(4)).join(', ')}` },
    { step_number: 4, title: 'Square each residual and sum', calculation: `Σv² = ${residuals.map(r => `(${r.toFixed(4)})²`).join(' + ')} = ${sumVSq.toFixed(6)}`, result: `Σv² = ${sumVSq.toFixed(6)}` },
    { step_number: 5, title: 'Apply the standard deviation formula', formula: 'σ = √(Σv² / (n - 1))', calculation: `σ = √(${sumVSq.toFixed(6)} / ${n - 1}) = √(${round(sumVSq / (n - 1), 6)})`, result: `σ = ${stdDev.toFixed(4)} ft` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'medium',
    category: 'Statistics & Error Analysis', subcategory: 'Standard Deviation',
    tags: ['statistics', 'standard-deviation', 'fs-module-1'],
    question_text: `A surveyor measured a distance ${n} times and obtained the following values (in feet): ${measurements.join(', ')}. Calculate the standard deviation of these measurements. Round to 4 decimal places.`,
    correct_answer: stdDev.toFixed(4),
    tolerance: 0.002,
    solution_steps: steps,
    explanation: `The standard deviation measures the spread of measurements around the mean. Using σ = √(Σv²/(n-1)) with n=${n} measurements gives σ = ${stdDev.toFixed(4)} ft.`,
  };
}

function genStandardErrorOfMean(): GeneratedProblem {
  const n = randInt(4, 12);
  const sigma = randFloat(0.01, 0.10, 3);
  const sem = round(sigma / Math.sqrt(n), 4);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify given values', description: `Standard deviation (σ) = ${sigma} ft, Number of measurements (n) = ${n}` },
    { step_number: 2, title: 'Apply the Standard Error of the Mean formula', formula: 'σₘ = σ / √n', calculation: `σₘ = ${sigma} / √${n} = ${sigma} / ${round(Math.sqrt(n), 4)}`, result: `σₘ = ${sem.toFixed(4)} ft` },
    { step_number: 3, title: 'Interpret the result', description: `The mean of these ${n} measurements has an uncertainty of ±${sem.toFixed(4)} ft. More measurements would reduce this uncertainty.` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Statistics & Error Analysis', subcategory: 'Standard Error of Mean',
    tags: ['statistics', 'standard-error', 'fs-module-1'],
    question_text: `Given a standard deviation of ${sigma} ft from ${n} measurements, calculate the standard error of the mean. Round to 4 decimal places.`,
    correct_answer: sem.toFixed(4),
    tolerance: 0.001,
    solution_steps: steps,
    explanation: `The standard error of the mean tells us how precisely we know the true value. σₘ = σ/√n = ${sigma}/√${n} = ${sem.toFixed(4)} ft.`,
  };
}

function genErrorPropagation(): GeneratedProblem {
  const count = randInt(2, 5);
  const errors: number[] = [];
  for (let i = 0; i < count; i++) {
    errors.push(randFloat(0.01, 0.08, 3));
  }
  const sumSq = round(errors.reduce((s, e) => s + e * e, 0), 8);
  const totalError = round(Math.sqrt(sumSq), 4);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify individual errors', description: `Errors: ±${errors.join(' ft, ±')} ft` },
    { step_number: 2, title: 'Square each error', calculation: errors.map((e, i) => `e${i + 1}² = ${e}² = ${round(e * e, 8)}`).join('\n'), result: `Squared errors: ${errors.map(e => round(e * e, 8)).join(', ')}` },
    { step_number: 3, title: 'Sum the squared errors', calculation: `Σe² = ${errors.map(e => round(e * e, 8)).join(' + ')} = ${sumSq}`, result: `Σe² = ${sumSq}` },
    { step_number: 4, title: 'Take the square root', formula: 'E_total = √(Σe²)', calculation: `E_total = √(${sumSq}) = ${totalError.toFixed(4)}`, result: `Total propagated error = ±${totalError.toFixed(4)} ft` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: count <= 3 ? 'easy' : 'medium',
    category: 'Statistics & Error Analysis', subcategory: 'Error Propagation',
    tags: ['statistics', 'error-propagation', 'fs-module-1'],
    question_text: `${count} distances are added together. Their individual errors are ±${errors.join(' ft, ±')} ft. What is the total propagated error? Round to 4 decimal places.`,
    correct_answer: totalError.toFixed(4),
    tolerance: 0.002,
    solution_steps: steps,
    explanation: `When adding measurements, errors propagate as E = √(e₁² + e₂² + ...). The total error is ±${totalError.toFixed(4)} ft.`,
  };
}

function genRelativePrecision(): GeneratedProblem {
  const distance = randInt(200, 5000);
  const error = randFloat(0.01, 0.20, 2);
  const ratio = round(distance / error, 0);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify given values', description: `Distance = ${distance} ft, Error = ±${error} ft` },
    { step_number: 2, title: 'Calculate relative precision', formula: 'Precision = Error / Distance = 1 : (Distance / Error)', calculation: `Precision = ${error} / ${distance} = 1 : ${ratio}`, result: `Relative precision = 1:${ratio}` },
    { step_number: 3, title: 'Express as a ratio', description: `The precision ratio 1:${ratio} means there is 1 unit of error for every ${ratio} units of measurement.` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Statistics & Error Analysis', subcategory: 'Relative Precision',
    tags: ['statistics', 'precision', 'fs-module-1'],
    question_text: `A distance of ${distance} ft was measured with an error of ±${error} ft. Express the relative precision as 1:X. What is X? Round to the nearest whole number.`,
    correct_answer: Math.round(ratio).toString(),
    tolerance: 5,
    solution_steps: steps,
    explanation: `Relative precision = distance/error = ${distance}/${error} = ${Math.round(ratio)}. So the precision is 1:${Math.round(ratio)}.`,
  };
}

function genSignificantFigures(): GeneratedProblem {
  const numbers = [
    { value: '0.00340', sigfigs: 3, explanation: 'Leading zeros are not significant. Trailing zero after decimal IS significant: 3, 4, 0.' },
    { value: '10.050', sigfigs: 5, explanation: 'All digits significant: 1, 0, 0, 5, 0. Captive and trailing zeros count.' },
    { value: '4500', sigfigs: 2, explanation: 'Trailing zeros without decimal point are ambiguous but typically NOT significant: 4, 5.' },
    { value: '4500.', sigfigs: 4, explanation: 'The decimal point indicates trailing zeros ARE significant: 4, 5, 0, 0.' },
    { value: '0.0120', sigfigs: 3, explanation: 'Leading zeros not significant. Trailing zero IS: 1, 2, 0.' },
    { value: '300.0', sigfigs: 4, explanation: 'All digits significant with decimal point: 3, 0, 0, 0.' },
    { value: '8010', sigfigs: 3, explanation: 'Captive zero IS significant, trailing zero is not: 8, 0, 1.' },
    { value: '0.000506', sigfigs: 3, explanation: 'Leading zeros not significant: 5, 0, 6. The captive zero counts.' },
    { value: '70.00', sigfigs: 4, explanation: 'All digits: 7, 0, 0, 0. Trailing zeros after decimal are significant.' },
    { value: '1.0030', sigfigs: 5, explanation: 'All digits: 1, 0, 0, 3, 0. Both captive and trailing zeros significant.' },
  ];
  const chosen = numbers[randInt(0, numbers.length - 1)];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Statistics & Error Analysis', subcategory: 'Significant Figures',
    tags: ['significant-figures', 'fundamentals', 'fs-module-1'],
    question_text: `How many significant figures are in the number ${chosen.value}?`,
    correct_answer: chosen.sigfigs.toString(),
    tolerance: 0,
    solution_steps: [
      { step_number: 1, title: 'Apply significant figures rules', description: chosen.explanation },
      { step_number: 2, title: 'Count', description: `The number ${chosen.value} has ${chosen.sigfigs} significant figures.`, result: `${chosen.sigfigs} significant figures` },
    ],
    explanation: chosen.explanation,
  };
}

// ============================================================================
// CATEGORY 2: LEVELING (Module 2)
// ============================================================================

function genDifferentialLeveling(): GeneratedProblem {
  const bmName = randBM();
  const bmElev = randFloat(400, 600, 2);
  const bs = randFloat(3, 10, 2);
  const fs = randFloat(2, 9, 2);
  const hi = round(bmElev + bs, 2);
  const newElev = round(hi - fs, 2);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify known values', description: `${bmName} Elevation = ${bmElev} ft\nBacksight (BS) = ${bs} ft\nForesight (FS) = ${fs} ft` },
    { step_number: 2, title: 'Calculate Height of Instrument (HI)', formula: 'HI = Elevation + BS', calculation: `HI = ${bmElev} + ${bs} = ${hi}`, result: `HI = ${hi} ft` },
    { step_number: 3, title: 'Calculate unknown elevation', formula: 'Elevation = HI - FS', calculation: `Elevation = ${hi} - ${fs} = ${newElev}`, result: `Elevation = ${newElev} ft` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Leveling', subcategory: 'Differential Leveling',
    tags: ['leveling', 'differential', 'elevation', 'fs-module-2'],
    question_text: `A level is set up between ${bmName} (elevation ${bmElev} ft) and point ${randPoint()}. The backsight on ${bmName} is ${bs} ft and the foresight on the unknown point is ${fs} ft. What is the elevation of the unknown point?`,
    correct_answer: newElev.toFixed(2),
    tolerance: 0.01,
    solution_steps: steps,
    explanation: `HI = ${bmElev} + ${bs} = ${hi} ft. Elevation = ${hi} - ${fs} = ${newElev} ft.`,
  };
}

function genMultiTurnLeveling(): GeneratedProblem {
  const bmElev = randFloat(350, 550, 2);
  const numTurns = randInt(2, 4);
  const readings: { bs: number; fs: number }[] = [];
  for (let i = 0; i <= numTurns; i++) {
    readings.push({ bs: randFloat(3, 9, 2), fs: i === numTurns ? randFloat(2, 8, 2) : randFloat(3, 8, 2) });
  }

  let currentElev = bmElev;
  const stepsDetail: string[] = [];
  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify starting data', description: `Starting BM elevation = ${bmElev} ft\n${readings.length} instrument setups with backsight/foresight readings` },
  ];

  for (let i = 0; i < readings.length; i++) {
    const hi = round(currentElev + readings[i].bs, 2);
    const nextElev = round(hi - readings[i].fs, 2);
    stepsDetail.push(`Setup ${i + 1}: HI = ${currentElev.toFixed(2)} + ${readings[i].bs} = ${hi} → Elev = ${hi} - ${readings[i].fs} = ${nextElev}`);
    steps.push({
      step_number: i + 2,
      title: `Setup ${i + 1}: Calculate HI and next elevation`,
      formula: 'HI = Elev + BS, then New Elev = HI - FS',
      calculation: `HI = ${currentElev.toFixed(2)} + ${readings[i].bs} = ${hi}\nElev = ${hi} - ${readings[i].fs} = ${nextElev}`,
      result: `Elevation at ${i === readings.length - 1 ? 'final point' : `TP ${i + 1}`} = ${nextElev} ft`,
    });
    currentElev = nextElev;
  }

  const sumBS = round(readings.reduce((s, r) => s + r.bs, 0), 2);
  const sumFS = round(readings.reduce((s, r) => s + r.fs, 0), 2);
  steps.push({
    step_number: readings.length + 2,
    title: 'Verify with arithmetic check',
    formula: 'ΣBS - ΣFS = Final Elev - Starting Elev',
    calculation: `ΣBS = ${sumBS}, ΣFS = ${sumFS}\nΣBS - ΣFS = ${round(sumBS - sumFS, 2)}\nFinal - Start = ${currentElev.toFixed(2)} - ${bmElev} = ${round(currentElev - bmElev, 2)}`,
    result: `Check: ${round(sumBS - sumFS, 2)} = ${round(currentElev - bmElev, 2)} ✓`,
  });

  const readingsText = readings.map((r, i) => `Setup ${i + 1}: BS=${r.bs}, FS=${r.fs}`).join('; ');

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: numTurns <= 2 ? 'medium' : 'hard',
    category: 'Leveling', subcategory: 'Multi-Turn Leveling',
    tags: ['leveling', 'differential', 'turning-points', 'fs-module-2'],
    question_text: `Starting from a benchmark with elevation ${bmElev} ft, a level circuit has ${readings.length} setups. The readings are: ${readingsText}. What is the elevation of the final point? Round to 2 decimal places.`,
    correct_answer: currentElev.toFixed(2),
    tolerance: 0.02,
    solution_steps: steps,
    explanation: `Working through ${readings.length} setups using HI = Elev + BS and Elev = HI - FS gives a final elevation of ${currentElev.toFixed(2)} ft.`,
  };
}

function genCurvatureRefraction(): GeneratedProblem {
  const distanceFeet = randInt(1000, 10000);
  const F = round(distanceFeet / 1000, 3);
  const cr = round(0.0206 * F * F, 4);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Convert distance to thousands of feet', calculation: `F = ${distanceFeet} / 1000 = ${F}`, result: `F = ${F}` },
    { step_number: 2, title: 'Apply C&R formula', formula: 'C&R = 0.0206 × F²', calculation: `C&R = 0.0206 × ${F}² = 0.0206 × ${round(F * F, 4)} = ${cr}`, result: `C&R = ${cr} ft` },
    { step_number: 3, title: 'Interpret', description: `At a distance of ${distanceFeet} ft, the combined curvature and refraction correction is ${cr} ft. This means the true level surface drops ${cr} ft below the apparent horizontal line of sight.` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Leveling', subcategory: 'Curvature & Refraction',
    tags: ['leveling', 'curvature-refraction', 'fs-module-2'],
    question_text: `Calculate the combined curvature and refraction correction for a distance of ${distanceFeet} ft. Use the formula C&R = 0.0206 × F² where F is in thousands of feet. Round to 4 decimal places.`,
    correct_answer: cr.toFixed(4),
    tolerance: 0.005,
    solution_steps: steps,
    explanation: `C&R = 0.0206 × (${F})² = ${cr} ft.`,
  };
}

// ============================================================================
// CATEGORY 3: DISTANCE & ANGLE MEASUREMENT (Module 3)
// ============================================================================

function genTemperatureCorrection(): GeneratedProblem {
  const length = randInt(100, 500);
  const fieldTemp = randInt(20, 110);
  const stdTemp = 68;
  const alpha = 0.00000645;
  const correction = round(alpha * length * (fieldTemp - stdTemp), 4);
  const correctedDist = round(length + correction, 4);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify given values', description: `Tape length (L) = ${length} ft\nField temperature (T) = ${fieldTemp}°F\nStandard temperature (T₀) = ${stdTemp}°F\nCoefficient (α) = 0.00000645 per °F` },
    { step_number: 2, title: 'Apply temperature correction formula', formula: 'Ct = α × L × (T - T₀)', calculation: `Ct = 0.00000645 × ${length} × (${fieldTemp} - ${stdTemp})\nCt = 0.00000645 × ${length} × ${fieldTemp - stdTemp}`, result: `Ct = ${correction >= 0 ? '+' : ''}${correction} ft` },
    { step_number: 3, title: 'Corrected distance', calculation: `Corrected = ${length} + (${correction}) = ${correctedDist}`, result: `Corrected distance = ${correctedDist} ft` },
    { step_number: 4, title: 'Interpret sign', description: correction >= 0 ? `Positive correction: tape expanded in heat, actual distance is longer.` : `Negative correction: tape contracted in cold, actual distance is shorter.` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'medium',
    category: 'Distance & Angle Measurement', subcategory: 'Temperature Correction',
    tags: ['taping', 'temperature-correction', 'fs-module-3'],
    question_text: `A ${length}-ft steel tape is used at ${fieldTemp}°F. The standard temperature is ${stdTemp}°F and α = 0.00000645/°F. What is the temperature correction? Round to 4 decimal places.`,
    correct_answer: correction.toFixed(4),
    tolerance: 0.002,
    solution_steps: steps,
    explanation: `Ct = 0.00000645 × ${length} × (${fieldTemp} - ${stdTemp}) = ${correction >= 0 ? '+' : ''}${correction} ft.`,
  };
}

function genSagCorrection(): GeneratedProblem {
  const weight = randFloat(0.01, 0.04, 3); // weight per ft
  const length = randInt(50, 150);
  const tension = randInt(10, 30);
  const sag = round(-(weight * weight * length * length * length) / (24 * tension * tension), 4);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify given values', description: `Tape weight (w) = ${weight} lbs/ft\nUnsupported length (L) = ${length} ft\nApplied tension (P) = ${tension} lbs` },
    { step_number: 2, title: 'Apply sag correction formula', formula: 'Cs = -(w² × L³) / (24 × P²)', calculation: `Cs = -(${weight}² × ${length}³) / (24 × ${tension}²)\nCs = -(${round(weight * weight, 6)} × ${length * length * length}) / (24 × ${tension * tension})\nCs = -(${round(weight * weight * length * length * length, 4)}) / (${24 * tension * tension})`, result: `Cs = ${sag.toFixed(4)} ft` },
    { step_number: 3, title: 'Note on sign', description: `Sag correction is ALWAYS NEGATIVE because sag makes the tape appear longer than the true horizontal distance. The measured distance must be reduced by ${Math.abs(sag).toFixed(4)} ft.` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'medium',
    category: 'Distance & Angle Measurement', subcategory: 'Sag Correction',
    tags: ['taping', 'sag-correction', 'fs-module-3'],
    question_text: `A tape weighing ${weight} lbs/ft is used unsupported over a ${length}-ft span with ${tension} lbs of tension. Calculate the sag correction. Round to 4 decimal places. (Include the negative sign.)`,
    correct_answer: sag.toFixed(4),
    tolerance: 0.005,
    solution_steps: steps,
    explanation: `Sag correction = -(w²L³)/(24P²) = ${sag.toFixed(4)} ft. Always negative.`,
  };
}

function genBearingToAzimuth(): GeneratedProblem {
  const quadrants = ['NE', 'SE', 'SW', 'NW'];
  const quad = quadrants[randInt(0, 3)];
  const degrees = randInt(1, 89);
  const minutes = randInt(0, 59);
  const bearingAngle = degrees + minutes / 60;

  let azimuth: number;
  let bearingStr: string;
  switch (quad) {
    case 'NE': azimuth = bearingAngle; bearingStr = `N ${degrees}°${minutes.toString().padStart(2, '0')}' E`; break;
    case 'SE': azimuth = round(180 - bearingAngle, 4); bearingStr = `S ${degrees}°${minutes.toString().padStart(2, '0')}' E`; break;
    case 'SW': azimuth = round(180 + bearingAngle, 4); bearingStr = `S ${degrees}°${minutes.toString().padStart(2, '0')}' W`; break;
    case 'NW': azimuth = round(360 - bearingAngle, 4); bearingStr = `N ${degrees}°${minutes.toString().padStart(2, '0')}' W`; break;
    default: azimuth = bearingAngle; bearingStr = `N ${degrees}°${minutes.toString().padStart(2, '0')}' E`;
  }
  azimuth = round(azimuth, 4);

  const azDeg = Math.floor(azimuth);
  const azMin = Math.round((azimuth - azDeg) * 60);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify the quadrant', description: `Bearing: ${bearingStr} → Quadrant: ${quad}` },
    { step_number: 2, title: 'Apply conversion rule', formula: quad === 'NE' ? 'Azimuth = Bearing angle' : quad === 'SE' ? 'Azimuth = 180° - Bearing angle' : quad === 'SW' ? 'Azimuth = 180° + Bearing angle' : 'Azimuth = 360° - Bearing angle', calculation: quad === 'NE' ? `Az = ${degrees}°${minutes.toString().padStart(2, '0')}' = ${round(bearingAngle, 4)}°` : quad === 'SE' ? `Az = 180° - ${degrees}°${minutes.toString().padStart(2, '0')}' = ${azDeg}°${azMin.toString().padStart(2, '0')}'` : quad === 'SW' ? `Az = 180° + ${degrees}°${minutes.toString().padStart(2, '0')}' = ${azDeg}°${azMin.toString().padStart(2, '0')}'` : `Az = 360° - ${degrees}°${minutes.toString().padStart(2, '0')}' = ${azDeg}°${azMin.toString().padStart(2, '0')}'`, result: `Azimuth = ${round(azimuth, 2)}°` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Distance & Angle Measurement', subcategory: 'Bearing to Azimuth',
    tags: ['bearings', 'azimuths', 'conversions', 'fs-module-3'],
    question_text: `Convert the bearing ${bearingStr} to an azimuth. Express your answer in decimal degrees rounded to 2 decimal places.`,
    correct_answer: round(azimuth, 2).toFixed(2),
    tolerance: 0.05,
    solution_steps: steps,
    explanation: `${bearingStr} is in the ${quad} quadrant. ${quad === 'NE' ? 'Az = bearing' : quad === 'SE' ? 'Az = 180 - bearing' : quad === 'SW' ? 'Az = 180 + bearing' : 'Az = 360 - bearing'} = ${round(azimuth, 2)}°.`,
  };
}

function genAzimuthToBearing(): GeneratedProblem {
  const azimuth = randFloat(0.5, 359.5, 2);
  let quad: string;
  let bearingAngle: number;

  if (azimuth <= 90) { quad = 'NE'; bearingAngle = azimuth; }
  else if (azimuth <= 180) { quad = 'SE'; bearingAngle = round(180 - azimuth, 2); }
  else if (azimuth <= 270) { quad = 'SW'; bearingAngle = round(azimuth - 180, 2); }
  else { quad = 'NW'; bearingAngle = round(360 - azimuth, 2); }

  const bDeg = Math.floor(bearingAngle);
  const bMin = Math.round((bearingAngle - bDeg) * 60);
  const bearingStr = `${quad[0]} ${bDeg}°${bMin.toString().padStart(2, '0')}' ${quad[1]}`;

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Determine the quadrant from azimuth', description: `Azimuth = ${azimuth}°\n0-90 = NE, 90-180 = SE, 180-270 = SW, 270-360 = NW\nQuadrant: ${quad}` },
    { step_number: 2, title: 'Calculate bearing angle', formula: quad === 'NE' ? 'Bearing = Azimuth' : quad === 'SE' ? 'Bearing = 180° - Azimuth' : quad === 'SW' ? 'Bearing = Azimuth - 180°' : 'Bearing = 360° - Azimuth', calculation: quad === 'NE' ? `Bearing angle = ${azimuth}°` : quad === 'SE' ? `Bearing angle = 180 - ${azimuth} = ${bearingAngle}°` : quad === 'SW' ? `Bearing angle = ${azimuth} - 180 = ${bearingAngle}°` : `Bearing angle = 360 - ${azimuth} = ${bearingAngle}°`, result: `Bearing = ${bearingStr}` },
  ];

  return {
    id: uuid(), question_type: 'short_answer', difficulty: 'easy',
    category: 'Distance & Angle Measurement', subcategory: 'Azimuth to Bearing',
    tags: ['bearings', 'azimuths', 'conversions', 'fs-module-3'],
    question_text: `Convert an azimuth of ${azimuth}° to a bearing. Express as a bearing angle in decimal degrees (e.g. enter just the numeric angle like ${bearingAngle}).`,
    correct_answer: bearingAngle.toFixed(2),
    tolerance: 0.1,
    solution_steps: steps,
    explanation: `Az ${azimuth}° is in the ${quad} quadrant. Bearing angle = ${bearingAngle}°. Full bearing: ${bearingStr}.`,
  };
}

function genSlopeToHorizontal(): GeneratedProblem {
  const slopeDist = randFloat(200, 800, 2);
  const vertAngle = randFloat(2, 25, 2);
  const hDist = round(slopeDist * Math.cos(toRad(vertAngle)), 2);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify given values', description: `Slope distance (S) = ${slopeDist} ft\nVertical angle (α) = ${vertAngle}°` },
    { step_number: 2, title: 'Apply horizontal distance formula', formula: 'H = S × cos(α)', calculation: `H = ${slopeDist} × cos(${vertAngle}°)\nH = ${slopeDist} × ${round(Math.cos(toRad(vertAngle)), 6)}`, result: `H = ${hDist} ft` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Distance & Angle Measurement', subcategory: 'Slope to Horizontal Distance',
    tags: ['slope-distance', 'horizontal-distance', 'trigonometry', 'fs-module-3'],
    question_text: `A total station measures a slope distance of ${slopeDist} ft at a vertical angle of ${vertAngle}°. What is the horizontal distance? Round to 2 decimal places.`,
    correct_answer: hDist.toFixed(2),
    tolerance: 0.05,
    solution_steps: steps,
    explanation: `H = S × cos(α) = ${slopeDist} × cos(${vertAngle}°) = ${hDist} ft.`,
  };
}

// ============================================================================
// CATEGORY 4: TRAVERSING & COGO (Module 4)
// ============================================================================

function genLatitudeDeparture(): GeneratedProblem {
  const distance = randFloat(150, 700, 2);
  const azimuth = randFloat(0, 359.99, 2);
  const lat = round(distance * Math.cos(toRad(azimuth)), 2);
  const dep = round(distance * Math.sin(toRad(azimuth)), 2);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify given values', description: `Distance = ${distance} ft\nAzimuth = ${azimuth}°` },
    { step_number: 2, title: 'Calculate Latitude (N-S component)', formula: 'Lat = D × cos(Az)', calculation: `Lat = ${distance} × cos(${azimuth}°)\nLat = ${distance} × ${round(Math.cos(toRad(azimuth)), 6)}`, result: `Latitude = ${lat >= 0 ? '+' : ''}${lat} ft (${lat >= 0 ? 'North' : 'South'})` },
    { step_number: 3, title: 'Calculate Departure (E-W component)', formula: 'Dep = D × sin(Az)', calculation: `Dep = ${distance} × sin(${azimuth}°)\nDep = ${distance} × ${round(Math.sin(toRad(azimuth)), 6)}`, result: `Departure = ${dep >= 0 ? '+' : ''}${dep} ft (${dep >= 0 ? 'East' : 'West'})` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'medium',
    category: 'Traversing & COGO', subcategory: 'Latitude & Departure',
    tags: ['traverse', 'latitude', 'departure', 'cogo', 'fs-module-4'],
    question_text: `A traverse leg has a distance of ${distance} ft and an azimuth of ${azimuth}°. Calculate the latitude. Round to 2 decimal places. (Positive = North, Negative = South.)`,
    correct_answer: lat.toFixed(2),
    tolerance: 0.1,
    solution_steps: steps,
    explanation: `Lat = ${distance} × cos(${azimuth}°) = ${lat} ft. Dep = ${distance} × sin(${azimuth}°) = ${dep} ft.`,
  };
}

function genInverseComputation(): GeneratedProblem {
  const n1 = randFloat(1000, 5000, 2);
  const e1 = randFloat(1000, 5000, 2);
  const n2 = round(n1 + randFloat(-500, 500, 2), 2);
  const e2 = round(e1 + randFloat(-500, 500, 2), 2);
  const dN = round(n2 - n1, 2);
  const dE = round(e2 - e1, 2);
  const dist = round(Math.sqrt(dN * dN + dE * dE), 2);

  // Compute azimuth handling all quadrants
  let azRad = Math.atan2(dE, dN);
  if (azRad < 0) azRad += 2 * Math.PI;
  const azDeg = round(toDeg(azRad), 2);

  const pA = randPoint();
  const pB = randPoint([pA]);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify coordinates', description: `Point ${pA}: N=${n1}, E=${e1}\nPoint ${pB}: N=${n2}, E=${e2}` },
    { step_number: 2, title: 'Calculate coordinate differences', calculation: `ΔN = ${n2} - ${n1} = ${dN}\nΔE = ${e2} - ${e1} = ${dE}` },
    { step_number: 3, title: 'Calculate distance', formula: 'D = √(ΔN² + ΔE²)', calculation: `D = √(${dN}² + ${dE}²)\nD = √(${round(dN * dN, 2)} + ${round(dE * dE, 2)})\nD = √(${round(dN * dN + dE * dE, 2)})`, result: `Distance = ${dist} ft` },
    { step_number: 4, title: 'Calculate azimuth', formula: 'Az = atan2(ΔE, ΔN)', calculation: `Az = atan2(${dE}, ${dN})\nAz = ${azDeg}°`, result: `Azimuth = ${azDeg}°` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'medium',
    category: 'Traversing & COGO', subcategory: 'Inverse Computation',
    tags: ['traverse', 'inverse', 'cogo', 'coordinates', 'fs-module-4'],
    question_text: `Given Point ${pA} (N: ${n1}, E: ${e1}) and Point ${pB} (N: ${n2}, E: ${e2}), calculate the distance between them. Round to 2 decimal places.`,
    correct_answer: dist.toFixed(2),
    tolerance: 0.15,
    solution_steps: steps,
    explanation: `ΔN=${dN}, ΔE=${dE}. Distance = √(${dN}²+${dE}²) = ${dist} ft. Azimuth = ${azDeg}°.`,
  };
}

function genPrecisionRatio(): GeneratedProblem {
  const numLegs = randInt(3, 6);
  const distances: number[] = [];
  const azimuths: number[] = [];
  for (let i = 0; i < numLegs; i++) {
    distances.push(randFloat(200, 600, 2));
    azimuths.push(randFloat(0, 359.99, 2));
  }
  const perimeter = round(distances.reduce((s, d) => s + d, 0), 2);

  const sumLat = round(distances.reduce((s, d, i) => s + d * Math.cos(toRad(azimuths[i])), 0), 4);
  const sumDep = round(distances.reduce((s, d, i) => s + d * Math.sin(toRad(azimuths[i])), 0), 4);
  const closure = round(Math.sqrt(sumLat * sumLat + sumDep * sumDep), 4);
  const precision = perimeter > 0 ? Math.round(perimeter / closure) : 0;

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Compute Latitudes and Departures for each leg', description: distances.map((d, i) => `Leg ${i + 1}: D=${d}, Az=${azimuths[i]}° → Lat=${round(d * Math.cos(toRad(azimuths[i])), 4)}, Dep=${round(d * Math.sin(toRad(azimuths[i])), 4)}`).join('\n') },
    { step_number: 2, title: 'Sum Latitudes and Departures', calculation: `ΣLat = ${sumLat} (should be 0 for closed traverse)\nΣDep = ${sumDep} (should be 0 for closed traverse)` },
    { step_number: 3, title: 'Calculate Linear Closure', formula: 'LC = √(ΣLat² + ΣDep²)', calculation: `LC = √(${round(sumLat * sumLat, 6)} + ${round(sumDep * sumDep, 6)}) = ${closure}`, result: `Linear closure = ${closure} ft` },
    { step_number: 4, title: 'Calculate Precision Ratio', formula: 'Precision = 1 : (Perimeter / LC)', calculation: `Perimeter = ${perimeter} ft\nPrecision = 1 : (${perimeter} / ${closure}) = 1 : ${precision}`, result: `Precision ratio = 1:${precision}` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'hard',
    category: 'Traversing & COGO', subcategory: 'Traverse Precision Ratio',
    tags: ['traverse', 'precision', 'closure', 'cogo', 'fs-module-4'],
    question_text: `A ${numLegs}-sided traverse has legs:\n${distances.map((d, i) => `Leg ${i + 1}: Distance=${d} ft, Azimuth=${azimuths[i]}°`).join('\n')}\nCalculate the linear closure error in feet. Round to 4 decimal places.`,
    correct_answer: closure.toFixed(4),
    tolerance: 0.1,
    solution_steps: steps,
    explanation: `ΣLat=${sumLat}, ΣDep=${sumDep}. LC = √(${sumLat}²+${sumDep}²) = ${closure} ft. Precision = 1:${precision}.`,
  };
}

// ============================================================================
// CATEGORY 5: AREAS, VOLUMES & CURVES (Module 5)
// ============================================================================

function genCoordinateArea(): GeneratedProblem {
  const n = randInt(3, 5);
  const coords: { x: number; y: number }[] = [];
  // Generate a rough polygon
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n + randFloat(-0.3, 0.3);
    const r = randFloat(50, 200, 1);
    coords.push({
      x: round(500 + r * Math.cos(angle), 2),
      y: round(500 + r * Math.sin(angle), 2),
    });
  }

  // Shoelace formula
  let sum1 = 0, sum2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum1 += coords[i].x * coords[j].y;
    sum2 += coords[j].x * coords[i].y;
  }
  const area = round(Math.abs(sum1 - sum2) / 2, 2);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'List coordinates', description: coords.map((c, i) => `Point ${i + 1}: (${c.x}, ${c.y})`).join('\n') },
    { step_number: 2, title: 'Apply Shoelace (Cross-Multiply) formula', formula: '2A = |Σ(Xi × Yi+1) - Σ(Xi+1 × Yi)|', calculation: `Σ(Xi × Yi+1) = ${coords.map((c, i) => `${c.x}×${coords[(i + 1) % n].y}`).join(' + ')} = ${round(sum1, 2)}\nΣ(Xi+1 × Yi) = ${coords.map((c, i) => `${coords[(i + 1) % n].x}×${c.y}`).join(' + ')} = ${round(sum2, 2)}` },
    { step_number: 3, title: 'Calculate area', calculation: `2A = |${round(sum1, 2)} - ${round(sum2, 2)}| = ${round(Math.abs(sum1 - sum2), 2)}\nA = ${round(Math.abs(sum1 - sum2), 2)} / 2 = ${area}`, result: `Area = ${area} sq ft` },
    { step_number: 4, title: 'Convert to acres (if needed)', calculation: `${area} / 43,560 = ${round(area / 43560, 4)} acres`, result: `${round(area / 43560, 4)} acres` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: n <= 3 ? 'medium' : 'hard',
    category: 'Areas, Volumes & Curves', subcategory: 'Coordinate Area',
    tags: ['area', 'coordinate-method', 'shoelace', 'fs-module-5'],
    question_text: `Calculate the area of a ${n}-sided polygon with vertices:\n${coords.map((c, i) => `Point ${i + 1}: (${c.x}, ${c.y})`).join('\n')}\nUse the coordinate (shoelace) method. Round to 2 decimal places. Answer in square feet.`,
    correct_answer: area.toFixed(2),
    tolerance: 1.0,
    solution_steps: steps,
    explanation: `Using the shoelace formula: Area = |Σ(XiYi+1) - Σ(Xi+1Yi)| / 2 = ${area} sq ft.`,
  };
}

function genAverageEndArea(): GeneratedProblem {
  const a1 = randFloat(50, 500, 1);
  const a2 = randFloat(50, 500, 1);
  const length = randInt(25, 100);
  const volumeCuFt = round(length * (a1 + a2) / 2, 2);
  const volumeCuYd = round(volumeCuFt / 27, 2);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify given values', description: `Area 1 (A₁) = ${a1} sq ft\nArea 2 (A₂) = ${a2} sq ft\nDistance between sections (L) = ${length} ft` },
    { step_number: 2, title: 'Apply Average End Area formula', formula: 'V = L × (A₁ + A₂) / 2', calculation: `V = ${length} × (${a1} + ${a2}) / 2\nV = ${length} × ${round(a1 + a2, 1)} / 2\nV = ${length} × ${round((a1 + a2) / 2, 2)}`, result: `Volume = ${volumeCuFt} cu ft` },
    { step_number: 3, title: 'Convert to cubic yards', formula: 'V(yd³) = V(ft³) / 27', calculation: `V = ${volumeCuFt} / 27 = ${volumeCuYd}`, result: `Volume = ${volumeCuYd} cu yd` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Areas, Volumes & Curves', subcategory: 'Average End Area Volume',
    tags: ['volume', 'average-end-area', 'earthwork', 'fs-module-5'],
    question_text: `Two cross sections are ${length} ft apart. Their areas are ${a1} sq ft and ${a2} sq ft. Calculate the volume in cubic yards using the Average End Area method. Round to 2 decimal places.`,
    correct_answer: volumeCuYd.toFixed(2),
    tolerance: 0.5,
    solution_steps: steps,
    explanation: `V = L(A₁+A₂)/2 = ${length}×(${a1}+${a2})/2 = ${volumeCuFt} cu ft = ${volumeCuYd} cu yd.`,
  };
}

function genHorizontalCurve(): GeneratedProblem {
  const R = randInt(300, 2000);
  const delta = randFloat(15, 90, 2);
  const T = round(R * Math.tan(toRad(delta / 2)), 2);
  const L = round(R * toRad(delta), 2);
  const E = round(R * (1 / Math.cos(toRad(delta / 2)) - 1), 2);
  const M = round(R * (1 - Math.cos(toRad(delta / 2))), 2);
  const D = round(5729.578 / R, 4);

  // Ask for tangent length
  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify given values', description: `Radius (R) = ${R} ft\nDeflection angle (Δ) = ${delta}°` },
    { step_number: 2, title: 'Calculate Tangent Length', formula: 'T = R × tan(Δ/2)', calculation: `T = ${R} × tan(${delta}/2)\nT = ${R} × tan(${round(delta / 2, 2)}°)\nT = ${R} × ${round(Math.tan(toRad(delta / 2)), 6)}`, result: `T = ${T} ft` },
    { step_number: 3, title: 'Calculate Curve Length', formula: 'L = R × Δ (Δ in radians)', calculation: `L = ${R} × ${round(toRad(delta), 6)} = ${L}`, result: `L = ${L} ft` },
    { step_number: 4, title: 'Calculate External Distance', formula: 'E = R × (sec(Δ/2) - 1)', calculation: `E = ${R} × (1/cos(${round(delta / 2, 2)}°) - 1) = ${E}`, result: `E = ${E} ft` },
    { step_number: 5, title: 'Calculate Middle Ordinate', formula: 'M = R × (1 - cos(Δ/2))', calculation: `M = ${R} × (1 - cos(${round(delta / 2, 2)}°)) = ${M}`, result: `M = ${M} ft` },
    { step_number: 6, title: 'Degree of Curve', formula: 'D = 5729.578 / R', calculation: `D = 5729.578 / ${R} = ${D}°`, result: `D = ${D}°` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'medium',
    category: 'Areas, Volumes & Curves', subcategory: 'Horizontal Curve',
    tags: ['curves', 'horizontal-curve', 'tangent-length', 'fs-module-5'],
    question_text: `A horizontal curve has a radius of ${R} ft and a deflection angle of ${delta}°. Calculate the tangent length (T). Round to 2 decimal places.`,
    correct_answer: T.toFixed(2),
    tolerance: 0.5,
    solution_steps: steps,
    explanation: `T = R × tan(Δ/2) = ${R} × tan(${round(delta / 2, 2)}°) = ${T} ft.`,
  };
}

function genVerticalCurve(): GeneratedProblem {
  // Ensure grades have opposite signs so the high/low point falls within the curve
  const isCrestType = Math.random() > 0.5;
  let g1: number, g2: number;
  if (isCrestType) {
    g1 = randFloat(1, 5, 2);    // positive grade in
    g2 = randFloat(-5, -1, 2);  // negative grade out (crest)
  } else {
    g1 = randFloat(-5, -1, 2);  // negative grade in
    g2 = randFloat(1, 5, 2);    // positive grade out (sag)
  }
  const L = randInt(200, 800);
  const bvcElev = randFloat(400, 600, 2);
  const bvcStation = randInt(10, 50) * 100;

  // High/low point — guaranteed to be within [0, L] since g1 and g2 have opposite signs
  const r = (g2 - g1) / L;
  const xHighLow = round(-g1 / r, 2);
  const highLowElev = round(bvcElev + (g1 / 100) * xHighLow + (r / 200) * xHighLow * xHighLow, 2);
  const isCrest = g1 > 0 && g2 < 0;
  const isSag = g1 < 0 && g2 > 0;
  const pointType = isCrest ? 'high' : isSag ? 'low' : (g1 > g2 ? 'high' : 'low');

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify given values', description: `Grade in (g₁) = ${g1 >= 0 ? '+' : ''}${g1}%\nGrade out (g₂) = ${g2 >= 0 ? '+' : ''}${g2}%\nCurve length (L) = ${L} ft\nBVC elevation = ${bvcElev} ft\nBVC station = ${bvcStation}+00` },
    { step_number: 2, title: 'Calculate rate of change', formula: 'r = (g₂ - g₁) / L', calculation: `r = (${g2} - ${g1}) / ${L} = ${round(g2 - g1, 4)} / ${L} = ${round(r, 6)} %/ft`, result: `r = ${round(r, 6)} %/ft` },
    { step_number: 3, title: `Find ${pointType} point location`, formula: 'x = -g₁ / r (from BVC)', calculation: `x = -(${g1}) / ${round(r, 6)} = ${xHighLow} ft from BVC`, result: `${pointType} point is ${xHighLow} ft from BVC (Station ${round(bvcStation + xHighLow / 100, 2) + '+00'})` },
    { step_number: 4, title: `Calculate ${pointType} point elevation`, formula: 'Elev = BVC_elev + (g₁/100)×x + (r/200)×x²', calculation: `Elev = ${bvcElev} + (${g1}/100)×${xHighLow} + (${round(r, 6)}/200)×${xHighLow}²\nElev = ${bvcElev} + ${round((g1 / 100) * xHighLow, 4)} + ${round((r / 200) * xHighLow * xHighLow, 4)}`, result: `${pointType.charAt(0).toUpperCase() + pointType.slice(1)} point elevation = ${highLowElev} ft` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'hard',
    category: 'Areas, Volumes & Curves', subcategory: 'Vertical Curve',
    tags: ['curves', 'vertical-curve', 'high-low-point', 'fs-module-5'],
    question_text: `A vertical curve connects grade g₁ = ${g1 >= 0 ? '+' : ''}${g1}% to g₂ = ${g2 >= 0 ? '+' : ''}${g2}%. The curve length is ${L} ft. BVC elevation is ${bvcElev} ft. How far from the BVC is the ${pointType} point? Round to 2 decimal places.`,
    correct_answer: Math.abs(xHighLow).toFixed(2),
    tolerance: 1.0,
    solution_steps: steps,
    explanation: `r = (g₂-g₁)/L = ${round(r, 6)}. x = -g₁/r = ${xHighLow} ft from BVC. Elevation there = ${highLowElev} ft.`,
  };
}

// ============================================================================
// CATEGORY 6: GPS/GNSS & GEODESY (Module 6)
// ============================================================================

function genOrthometricHeight(): GeneratedProblem {
  const ellipsoidH = randFloat(200, 800, 2);
  const geoidN = randFloat(-30, 30, 2);
  const orthoH = round(ellipsoidH - geoidN, 2);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify values', description: `Ellipsoid height (h) = ${ellipsoidH} m\nGeoid undulation (N) = ${geoidN >= 0 ? '+' : ''}${geoidN} m` },
    { step_number: 2, title: 'Apply orthometric height formula', formula: 'H = h - N', calculation: `H = ${ellipsoidH} - (${geoidN}) = ${orthoH}`, result: `Orthometric height (H) = ${orthoH} m` },
    { step_number: 3, title: 'Interpret', description: `The orthometric height (elevation above the geoid/mean sea level) is ${orthoH} m. ${geoidN >= 0 ? 'Positive geoid undulation means the geoid is above the ellipsoid.' : 'Negative geoid undulation means the geoid is below the ellipsoid.'}` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'GNSS/GPS & Geodesy', subcategory: 'Orthometric Height',
    tags: ['gps', 'orthometric-height', 'geoid', 'geodesy', 'fs-module-6'],
    question_text: `A GPS receiver shows an ellipsoid height of ${ellipsoidH} m. The geoid undulation at this location is ${geoidN >= 0 ? '+' : ''}${geoidN} m. Calculate the orthometric height (H). Round to 2 decimal places.`,
    correct_answer: orthoH.toFixed(2),
    tolerance: 0.02,
    solution_steps: steps,
    explanation: `H = h - N = ${ellipsoidH} - (${geoidN}) = ${orthoH} m.`,
  };
}

function genGridToGround(): GeneratedProblem {
  const groundDist = randFloat(500, 5000, 2);
  const scaleFactor = randFloat(0.9996, 1.0004, 6);
  const elevFactor = randFloat(0.9997, 1.0000, 6);
  const combinedFactor = round(scaleFactor * elevFactor, 6);
  const gridDist = round(groundDist * combinedFactor, 2);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify values', description: `Ground distance = ${groundDist} ft\nGrid scale factor = ${scaleFactor}\nElevation factor = ${elevFactor}` },
    { step_number: 2, title: 'Calculate Combined Factor', formula: 'CF = Grid Scale Factor × Elevation Factor', calculation: `CF = ${scaleFactor} × ${elevFactor} = ${combinedFactor}`, result: `Combined Factor = ${combinedFactor}` },
    { step_number: 3, title: 'Calculate Grid Distance', formula: 'Grid Distance = Ground Distance × CF', calculation: `Grid = ${groundDist} × ${combinedFactor} = ${gridDist}`, result: `Grid distance = ${gridDist} ft` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'medium',
    category: 'GNSS/GPS & Geodesy', subcategory: 'Grid to Ground Distance',
    tags: ['gps', 'scale-factor', 'grid-distance', 'geodesy', 'fs-module-6'],
    question_text: `A ground distance is ${groundDist} ft. The grid scale factor is ${scaleFactor} and the elevation factor is ${elevFactor}. Calculate the grid distance. Round to 2 decimal places.`,
    correct_answer: gridDist.toFixed(2),
    tolerance: 0.15,
    solution_steps: steps,
    explanation: `CF = ${scaleFactor} × ${elevFactor} = ${combinedFactor}. Grid = ${groundDist} × ${combinedFactor} = ${gridDist} ft.`,
  };
}

// ============================================================================
// CATEGORY 7: BOUNDARY LAW & PUBLIC LANDS (Module 7)
// ============================================================================

function genSectionArea(): GeneratedProblem {
  const descriptions = [
    { desc: 'NE 1/4', acres: 160 },
    { desc: 'SW 1/4', acres: 160 },
    { desc: 'N 1/2 of the NE 1/4', acres: 80 },
    { desc: 'S 1/2 of the SW 1/4', acres: 80 },
    { desc: 'NW 1/4 of the NE 1/4', acres: 40 },
    { desc: 'SE 1/4 of the SW 1/4', acres: 40 },
    { desc: 'N 1/2 of the NW 1/4 of the NE 1/4', acres: 20 },
    { desc: 'SE 1/4 of the NE 1/4 of the SW 1/4', acres: 10 },
    { desc: 'N 1/2', acres: 320 },
    { desc: 'S 1/2 of the NE 1/4 of the NE 1/4', acres: 20 },
    { desc: 'NE 1/4 and the N 1/2 of the SE 1/4', acres: 240 },
  ];
  const chosen = descriptions[randInt(0, descriptions.length - 1)];
  const sqft = round(chosen.acres * 43560, 0);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Recall section basics', description: '1 Section = 640 acres = 1 mile × 1 mile\n1/4 Section = 160 acres\n1/4 of 1/4 = 40 acres' },
    { step_number: 2, title: 'Parse the legal description', description: `"${chosen.desc}" — work from right to left, halving or quartering at each step.` },
    { step_number: 3, title: 'Calculate', description: `Starting with 640 acres for a full section, divide as described.`, result: `${chosen.desc} = ${chosen.acres} acres = ${sqft.toLocaleString()} sq ft` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: chosen.acres <= 40 ? 'medium' : 'easy',
    category: 'Boundary Law & Public Lands', subcategory: 'Section Subdivision',
    tags: ['boundary-law', 'plss', 'section', 'acres', 'fs-module-7'],
    question_text: `How many acres are in the ${chosen.desc} of a standard section?`,
    correct_answer: chosen.acres.toString(),
    tolerance: 0,
    solution_steps: steps,
    explanation: `A full section = 640 acres. The ${chosen.desc} = ${chosen.acres} acres.`,
  };
}

function genUnitConversion(): GeneratedProblem {
  const conversions = [
    { from: 'chains', to: 'feet', factor: 66, unit: randInt(1, 50) },
    { from: 'varas (Texas)', to: 'feet', factor: 100 / 36, unit: randInt(5, 200) },
    { from: 'acres', to: 'square feet', factor: 43560, unit: randInt(1, 20) },
    { from: 'miles', to: 'feet', factor: 5280, unit: randInt(1, 5) },
    { from: 'feet (US Survey)', to: 'meters', factor: 1200 / 3937, unit: randInt(100, 5000) },
    { from: 'feet (International)', to: 'meters', factor: 0.3048, unit: randInt(100, 5000) },
    { from: 'rods', to: 'feet', factor: 16.5, unit: randInt(1, 80) },
  ];
  const c = conversions[randInt(0, conversions.length - 1)];
  const result = round(c.unit * c.factor, 4);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify conversion factor', description: `1 ${c.from.replace(/ \(.*\)/, '')} = ${c.factor} ${c.to}` },
    { step_number: 2, title: 'Multiply', calculation: `${c.unit} ${c.from} × ${c.factor} = ${result} ${c.to}`, result: `${result} ${c.to}` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Boundary Law & Public Lands', subcategory: 'Unit Conversions',
    tags: ['conversions', 'units', 'fs-module-7'],
    question_text: `Convert ${c.unit} ${c.from} to ${c.to}. Round to 4 decimal places.`,
    correct_answer: result.toFixed(4),
    tolerance: c.factor > 1000 ? 5 : 0.05,
    solution_steps: steps,
    explanation: `${c.unit} ${c.from} × ${c.factor} = ${result} ${c.to}.`,
  };
}

// ============================================================================
// CATEGORY 8: PHOTOGRAMMETRY & CONSTRUCTION (Module 8)
// ============================================================================

function genPhotoScale(): GeneratedProblem {
  const focalLength = randFloat(100, 300, 1); // mm
  const flyingHeight = randInt(2000, 15000); // ft AGL
  const focalLengthFt = round(focalLength / 304.8, 4);
  const scale = round(focalLengthFt / flyingHeight, 6);
  const scaleDenominator = Math.round(1 / scale);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify values', description: `Focal length (f) = ${focalLength} mm = ${focalLengthFt} ft\nFlying height AGL (H) = ${flyingHeight} ft` },
    { step_number: 2, title: 'Calculate photo scale', formula: 'Scale = f / H', calculation: `Scale = ${focalLengthFt} / ${flyingHeight} = ${scale}`, result: `Scale = 1:${scaleDenominator}` },
    { step_number: 3, title: 'Interpret', description: `1 unit on the photo represents ${scaleDenominator} units on the ground.` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'medium',
    category: 'Photogrammetry & Construction', subcategory: 'Photo Scale',
    tags: ['photogrammetry', 'photo-scale', 'fs-module-8'],
    question_text: `An aerial camera has a focal length of ${focalLength} mm. The flying height is ${flyingHeight} ft AGL. What is the photo scale denominator? (Express the answer as the number X in 1:X.) Round to the nearest whole number.`,
    correct_answer: scaleDenominator.toString(),
    tolerance: 50,
    solution_steps: steps,
    explanation: `Scale = f/H = ${focalLengthFt}/${flyingHeight} ≈ 1:${scaleDenominator}.`,
  };
}

function genCutFill(): GeneratedProblem {
  const designElev = randFloat(450, 550, 2);
  const numPoints = randInt(3, 6);
  const groundElevs: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    groundElevs.push(randFloat(designElev - 8, designElev + 8, 2));
  }
  const cutFills = groundElevs.map(g => round(designElev - g, 2));
  // Positive = fill needed, Negative = cut needed

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify design elevation', description: `Design elevation = ${designElev} ft` },
    { step_number: 2, title: 'Calculate cut/fill at each point', formula: 'Cut/Fill = Design Elevation - Ground Elevation', description: groundElevs.map((g, i) => `Point ${i + 1}: ${designElev} - ${g} = ${cutFills[i] >= 0 ? '+' : ''}${cutFills[i]} ft (${cutFills[i] >= 0 ? 'FILL' : 'CUT'})`).join('\n') },
    { step_number: 3, title: 'Summary', description: `${cutFills.filter(cf => cf > 0).length} points need fill, ${cutFills.filter(cf => cf < 0).length} points need cut.` },
  ];

  const askIdx = randInt(0, numPoints - 1);

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Photogrammetry & Construction', subcategory: 'Cut/Fill Calculation',
    tags: ['construction', 'cut-fill', 'grading', 'fs-module-8'],
    question_text: `The design elevation is ${designElev} ft. The existing ground elevation at point ${askIdx + 1} is ${groundElevs[askIdx]} ft. What is the cut or fill amount? (Positive = fill, Negative = cut.) Round to 2 decimal places.`,
    correct_answer: cutFills[askIdx].toFixed(2),
    tolerance: 0.02,
    solution_steps: steps,
    explanation: `Cut/Fill = ${designElev} - ${groundElevs[askIdx]} = ${cutFills[askIdx]} ft. ${cutFills[askIdx] >= 0 ? 'Fill' : 'Cut'} is needed.`,
  };
}

// ============================================================================
// DMS CONVERSION PROBLEMS
// ============================================================================

function genDMStoDecimal(): GeneratedProblem {
  const d = randInt(0, 359);
  const m = randInt(0, 59);
  const s = randFloat(0, 59.9, 1);
  const decimal = round(d + m / 60 + s / 3600, 4);

  const steps: SolutionStep[] = [
    { step_number: 1, title: 'Identify DMS values', description: `${d}° ${m}' ${s}"` },
    { step_number: 2, title: 'Convert', formula: 'Decimal = D + M/60 + S/3600', calculation: `= ${d} + ${m}/60 + ${s}/3600\n= ${d} + ${round(m / 60, 6)} + ${round(s / 3600, 6)}`, result: `= ${decimal}°` },
  ];

  return {
    id: uuid(), question_type: 'numeric_input', difficulty: 'easy',
    category: 'Distance & Angle Measurement', subcategory: 'DMS to Decimal Degrees',
    tags: ['conversions', 'dms', 'angles', 'fs-module-3'],
    question_text: `Convert ${d}° ${m}' ${s}" to decimal degrees. Round to 4 decimal places.`,
    correct_answer: decimal.toFixed(4),
    tolerance: 0.005,
    solution_steps: steps,
    explanation: `${d}° ${m}' ${s}" = ${d} + ${m}/60 + ${s}/3600 = ${decimal}°.`,
  };
}

function genDecimalToDMS(): GeneratedProblem {
  const decimal = randFloat(0.5, 359.5, 4);
  const d = Math.floor(decimal);
  const mFull = (decimal - d) * 60;
  const m = Math.floor(mFull);
  const s = round((mFull - m) * 60, 1);

  return {
    id: uuid(), question_type: 'short_answer', difficulty: 'easy',
    category: 'Distance & Angle Measurement', subcategory: 'Decimal to DMS',
    tags: ['conversions', 'dms', 'angles', 'fs-module-3'],
    question_text: `Convert ${decimal}° to degrees-minutes-seconds. Give the minutes value only (whole number).`,
    correct_answer: m.toString(),
    tolerance: 0,
    solution_steps: [
      { step_number: 1, title: 'Extract degrees', description: `Degrees = floor(${decimal}) = ${d}°` },
      { step_number: 2, title: 'Extract minutes', calculation: `Remaining = (${decimal} - ${d}) × 60 = ${round(mFull, 4)}\nMinutes = floor(${round(mFull, 4)}) = ${m}'` },
      { step_number: 3, title: 'Extract seconds', calculation: `Seconds = (${round(mFull, 4)} - ${m}) × 60 = ${s}"` },
      { step_number: 4, title: 'Result', result: `${d}° ${m}' ${s}"` },
    ],
    explanation: `${decimal}° = ${d}° ${m}' ${s}".`,
  };
}

// ============================================================================
// MASTER GENERATOR MAP — all problem types with metadata
// ============================================================================

export interface ProblemTypeInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  module: number; // FS module 1-8
  difficulties: ('easy' | 'medium' | 'hard' | 'very_hard')[];
  generator: (difficulty?: string) => GeneratedProblem;
}

export const PROBLEM_TYPES: ProblemTypeInfo[] = [
  // Module 1: Statistics
  { id: 'std_deviation', name: 'Standard Deviation', description: 'Calculate σ from a set of measurements', category: 'Statistics & Error Analysis', module: 1, difficulties: ['medium'], generator: genStandardDeviation },
  { id: 'std_error_mean', name: 'Standard Error of Mean', description: 'Calculate σₘ = σ/√n', category: 'Statistics & Error Analysis', module: 1, difficulties: ['easy'], generator: genStandardErrorOfMean },
  { id: 'error_propagation', name: 'Error Propagation', description: 'Combine errors using root-sum-squares', category: 'Statistics & Error Analysis', module: 1, difficulties: ['easy', 'medium'], generator: genErrorPropagation },
  { id: 'relative_precision', name: 'Relative Precision', description: 'Calculate precision ratio 1:X', category: 'Statistics & Error Analysis', module: 1, difficulties: ['easy'], generator: genRelativePrecision },
  { id: 'significant_figures', name: 'Significant Figures', description: 'Count significant figures in a number', category: 'Statistics & Error Analysis', module: 1, difficulties: ['easy'], generator: genSignificantFigures },

  // Module 2: Leveling
  { id: 'differential_leveling', name: 'Differential Leveling', description: 'Calculate elevation using HI, BS, and FS', category: 'Leveling', module: 2, difficulties: ['easy'], generator: genDifferentialLeveling },
  { id: 'multi_turn_leveling', name: 'Multi-Turn Leveling', description: 'Level through multiple turning points', category: 'Leveling', module: 2, difficulties: ['medium', 'hard'], generator: genMultiTurnLeveling },
  { id: 'curvature_refraction', name: 'Curvature & Refraction', description: 'Calculate C&R correction for distance', category: 'Leveling', module: 2, difficulties: ['easy'], generator: genCurvatureRefraction },

  // Module 3: Distance & Angles
  { id: 'temp_correction', name: 'Temperature Correction', description: 'Steel tape temperature correction', category: 'Distance & Angle Measurement', module: 3, difficulties: ['medium'], generator: genTemperatureCorrection },
  { id: 'sag_correction', name: 'Sag Correction', description: 'Tape sag correction calculation', category: 'Distance & Angle Measurement', module: 3, difficulties: ['medium'], generator: genSagCorrection },
  { id: 'bearing_to_azimuth', name: 'Bearing → Azimuth', description: 'Convert bearing to azimuth', category: 'Distance & Angle Measurement', module: 3, difficulties: ['easy'], generator: genBearingToAzimuth },
  { id: 'azimuth_to_bearing', name: 'Azimuth → Bearing', description: 'Convert azimuth to bearing angle', category: 'Distance & Angle Measurement', module: 3, difficulties: ['easy'], generator: genAzimuthToBearing },
  { id: 'slope_to_horizontal', name: 'Slope → Horizontal Distance', description: 'Convert slope distance using vertical angle', category: 'Distance & Angle Measurement', module: 3, difficulties: ['easy'], generator: genSlopeToHorizontal },
  { id: 'dms_to_decimal', name: 'DMS → Decimal Degrees', description: 'Convert degrees-minutes-seconds to decimal', category: 'Distance & Angle Measurement', module: 3, difficulties: ['easy'], generator: genDMStoDecimal },
  { id: 'decimal_to_dms', name: 'Decimal → DMS', description: 'Convert decimal degrees to DMS', category: 'Distance & Angle Measurement', module: 3, difficulties: ['easy'], generator: genDecimalToDMS },

  // Module 4: Traversing & COGO
  { id: 'lat_dep', name: 'Latitude & Departure', description: 'Calculate lat/dep from distance and azimuth', category: 'Traversing & COGO', module: 4, difficulties: ['medium'], generator: genLatitudeDeparture },
  { id: 'inverse_computation', name: 'Inverse Computation', description: 'Distance and azimuth from coordinates', category: 'Traversing & COGO', module: 4, difficulties: ['medium'], generator: genInverseComputation },
  { id: 'precision_ratio', name: 'Traverse Precision Ratio', description: 'Compute linear closure and precision', category: 'Traversing & COGO', module: 4, difficulties: ['hard'], generator: genPrecisionRatio },

  // Module 5: Areas, Volumes & Curves
  { id: 'coordinate_area', name: 'Coordinate Area (Shoelace)', description: 'Calculate area from polygon coordinates', category: 'Areas, Volumes & Curves', module: 5, difficulties: ['medium', 'hard'], generator: genCoordinateArea },
  { id: 'avg_end_area', name: 'Average End Area Volume', description: 'Earthwork volume between cross sections', category: 'Areas, Volumes & Curves', module: 5, difficulties: ['easy'], generator: genAverageEndArea },
  { id: 'horizontal_curve', name: 'Horizontal Curve', description: 'Tangent, curve length, external, middle ordinate', category: 'Areas, Volumes & Curves', module: 5, difficulties: ['medium'], generator: genHorizontalCurve },
  { id: 'vertical_curve', name: 'Vertical Curve High/Low Point', description: 'Find high or low point on vertical curve', category: 'Areas, Volumes & Curves', module: 5, difficulties: ['hard'], generator: genVerticalCurve },

  // Module 6: GNSS/GPS
  { id: 'orthometric_height', name: 'Orthometric Height (H = h - N)', description: 'Calculate elevation from GPS height and geoid', category: 'GNSS/GPS & Geodesy', module: 6, difficulties: ['easy'], generator: genOrthometricHeight },
  { id: 'grid_ground_dist', name: 'Grid ↔ Ground Distance', description: 'Combined scale/elevation factor conversion', category: 'GNSS/GPS & Geodesy', module: 6, difficulties: ['medium'], generator: genGridToGround },

  // Module 7: Boundary Law
  { id: 'section_area', name: 'Section Subdivision (Acres)', description: 'PLSS section/quarter-section areas', category: 'Boundary Law & Public Lands', module: 7, difficulties: ['easy', 'medium'], generator: genSectionArea },
  { id: 'unit_conversion', name: 'Unit Conversions', description: 'Chains, varas, rods, acres, feet, meters', category: 'Boundary Law & Public Lands', module: 7, difficulties: ['easy'], generator: genUnitConversion },

  // Module 8: Photogrammetry
  { id: 'photo_scale', name: 'Photo Scale', description: 'Calculate aerial photo scale from focal length and height', category: 'Photogrammetry & Construction', module: 8, difficulties: ['medium'], generator: genPhotoScale },
  { id: 'cut_fill', name: 'Cut/Fill Calculation', description: 'Design elevation vs ground elevation', category: 'Photogrammetry & Construction', module: 8, difficulties: ['easy'], generator: genCutFill },
];

// Generate problems of a specific type
export function generateProblems(typeId: string, count: number): GeneratedProblem[] {
  const typeInfo = PROBLEM_TYPES.find(t => t.id === typeId);
  if (!typeInfo) return [];
  const problems: GeneratedProblem[] = [];
  for (let i = 0; i < count; i++) {
    problems.push(typeInfo.generator());
  }
  return problems;
}

// Generate a random mix of problems
export function generateMixedProblems(config: { typeId: string; count: number }[]): GeneratedProblem[] {
  const all: GeneratedProblem[] = [];
  for (const c of config) {
    all.push(...generateProblems(c.typeId, c.count));
  }
  return all;
}

// Get all problem types grouped by category
export function getProblemTypesByCategory(): Record<string, ProblemTypeInfo[]> {
  const grouped: Record<string, ProblemTypeInfo[]> = {};
  for (const pt of PROBLEM_TYPES) {
    if (!grouped[pt.category]) grouped[pt.category] = [];
    grouped[pt.category].push(pt);
  }
  return grouped;
}
