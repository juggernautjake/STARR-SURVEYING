// lib/calculators/models/ti-30xa/guided.ts — routines you follow one key at a time.
//
// Owner, 2026-09-20: "I want it to have a built in calculator for some problems where you actually
// have to use the calculator … it tells you what buttons to press for each step and explains
// exactly what each button is doing. I have the TI-30Xa calculator … I need to become very familiar
// and quick with the calculator."
//
// ── THESE ARE KEYSTROKES, NOT DESCRIPTIONS OF KEYSTROKES ────────────────────────────────────────
//
// The drills in `catalogue.ts` are prose: `press: ['3 0 0', 'x²', '+', ...]` with asides like
// `'(distance = 500)'` mixed in. A person can read them. Nothing can CHECK them, and nothing can
// drive the emulator with them.
//
// Every step here names the actual key ids the engine takes. That buys three things at once:
//
//   1. The keypad can highlight the next key, and pressing the wrong one can say so.
//   2. `expect` is the display the engine really produces, and a test presses every routine and
//      asserts it. A guide that has drifted from the calculator fails the build instead of
//      teaching somebody a sequence that does not work.
//   3. The step's `does` text sits next to the keys it describes, so the two cannot separate.
//
// That third point is the whole reason this is data and not a page of written instructions. An
// explanation that lives somewhere other than the thing it explains goes stale silently.
//
// ── WHY THE EXPECTED DISPLAY IS WRITTEN OUT IN FULL ─────────────────────────────────────────────
//
// `53.13010235`, not `53.13`. The number of digits a 30Xa shows is part of what you are learning:
// somebody who expects `53.13` and sees `53.13010235` pauses, and a pause in the exam costs more
// than the digits do. Practising against the real display means never being surprised by it.
//
// Verified in __tests__/learn/ti30xa-guided.test.ts, which presses every step.

export interface GuidedStep {
  /** Engine key ids, pressed in order. A step is one idea, which is often two or three keys. */
  keys: string[];
  /** What the student reads as the instruction — the key faces, as printed on the device. */
  label: string;
  /** What those keys DO. Not what they are called; what they do, here, in this problem. */
  does: string;
  /** The display afterwards. Checked against the engine by the test. */
  expect: string;
  /** The mistake this step invites. Omitted where there isn't an interesting one. */
  trap?: string;
}

export interface GuidedRoutine {
  id: string;
  title: string;
  /** Why a surveyor cares. The answer to "when would I ever do this". */
  why: string;
  /** The problem in words, so the keystrokes have something to be about. */
  problem: string;
  steps: GuidedStep[];
  /** What the display says at the end, and what it means. */
  answer: string;
  /** The judgement the calculator cannot make for you. */
  afterwards?: string;
}

export const TI_30XA_GUIDED: GuidedRoutine[] = [
  // ── 1 ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'inverse-distance',
    title: 'Distance from ΔN and ΔE',
    why: 'The inverse — distance and direction between two points — is the most-used computation on the exam and in the field. This is its first half.',
    problem: 'A course runs ΔN = 300.00 ft, ΔE = 400.00 ft. How long is it?',
    steps: [
      {
        keys: ['n3', 'n0', 'n0'],
        label: '3 0 0',
        does: 'Types ΔN into the display. Nothing is computed yet — the 30Xa is holding one number.',
        expect: '300',
      },
      {
        keys: ['xsq'],
        label: 'x²',
        does: 'Squares what is showing, immediately. This is the difference between a 30Xa and a MathPrint calculator: the answer replaces the display the moment you press the key, with no = needed.',
        expect: '90000',
        trap: 'On a TI-36X Pro you would build the whole expression first. Practising that habit here will cost you time on the machine you actually sit with.',
      },
      {
        keys: ['add'],
        label: '+',
        does: 'Holds 90000 and waits for the next number. The display still shows 90000 because nothing has replaced it yet.',
        expect: '90000',
      },
      {
        keys: ['n4', 'n0', 'n0'],
        label: '4 0 0',
        does: 'Types ΔE. The display clears to the new entry.',
        expect: '400',
      },
      {
        keys: ['xsq'],
        label: 'x²',
        does: 'Squares ΔE, again straight away.',
        expect: '160000',
      },
      {
        keys: ['eq'],
        label: '=',
        does: 'Completes the pending addition: 90000 + 160000.',
        expect: '250000',
      },
      {
        keys: ['sqrt'],
        label: '√x',
        does: 'Square-roots the result. This is the length of the course.',
        expect: '500',
      },
    ],
    answer: '500 — the course is 500.00 ft.',
    afterwards: 'Fourteen keystrokes and no paper. Worth drilling until your hand does it while you read the next line of the problem.',
  },

  // ── 2 ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'inverse-bearing',
    title: 'Direction from ΔN and ΔE — and the quadrant the calculator will not give you',
    why: 'The second half of the inverse, and the single commonest place to lose marks for a reason that has nothing to do with arithmetic.',
    problem: 'Same course: ΔN = 300.00 ft, ΔE = 400.00 ft. What is its bearing?',
    steps: [
      {
        keys: ['n4', 'n0', 'n0'],
        label: '4 0 0',
        does: 'ΔE goes in first, because the bearing angle from north is arctan(ΔE ÷ ΔN) — departure over latitude.',
        expect: '400',
        trap: 'Reversing these gives arctan(ΔN ÷ ΔE), which is the angle from EAST. It is the complement of the right answer, and it looks perfectly plausible.',
      },
      {
        keys: ['div'],
        label: '÷',
        does: 'Holds 400 as the numerator and waits for what you are dividing by. The display keeps showing 400 — the 30Xa has no second line to show you a pending operation.',
        expect: '400',
      },
      {
        keys: ['n3', 'n0', 'n0'],
        label: '3 0 0',
        does: 'ΔN, the denominator. The display clears to the new entry — 400 is being held, not lost.',
        expect: '300',
      },
      {
        keys: ['eq'],
        label: '=',
        does: 'The ratio. This is the tangent of the bearing angle.',
        expect: '1.333333333',
      },
      {
        keys: ['2nd', 'tan'],
        label: '2nd  TAN⁻¹',
        does: '2nd selects the function printed above the key; TAN⁻¹ then turns the tangent back into an angle. Check DEG is showing before you trust it.',
        expect: '53.13010235',
        trap: 'TAN⁻¹ only ever answers between −90° and +90°. It cannot know your quadrant and it will not warn you.',
      },
    ],
    answer: '53.13010235 — an angle of 53°07′48″ from north.',
    afterwards: 'Both ΔN and ΔE are positive, so the course runs north-east: N 53°07′48″ E. Had both been negative the calculator would have shown the SAME 53.13, and the answer would have been S 53°07′48″ W. The signs are yours to read.',
  },

  // ── 3 ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'dms-to-decimal',
    title: 'DMS into decimal degrees, without the DMS key',
    why: 'Nearly every angle on the exam arrives as degrees-minutes-seconds and every trig function wants decimal degrees. Doing it as arithmetic works on any approved calculator, including ones with no DMS key at all.',
    problem: 'Convert 52°14′30″ to decimal degrees.',
    steps: [
      {
        keys: ['n5', 'n2'],
        label: '5 2',
        does: 'The whole degrees. They need no conversion.',
        expect: '52',
      },
      {
        keys: ['add', 'n1', 'n4', 'div', 'n6', 'n0'],
        label: '+  1 4  ÷  6 0',
        does: 'Minutes over 60. Nothing has been added yet — the 30Xa applies precedence at =, so the division will happen before the addition without any brackets.',
        expect: '60',
        trap: 'This is worth proving to yourself: press 2 + 3 × 4 = and you get 14, not 20. The 30Xa is an AOS machine and does respect × over +.',
      },
      {
        keys: ['add', 'n3', 'n0', 'div', 'n3', 'n6', 'n0', 'n0'],
        label: '+  3 0  ÷  3 6 0 0',
        does: 'Seconds over 3600. Still nothing computed — three terms are now pending.',
        expect: '3600',
      },
      {
        keys: ['eq'],
        label: '=',
        does: 'Resolves the lot: 52 + (14 ÷ 60) + (30 ÷ 3600).',
        expect: '52.24166667',
      },
    ],
    answer: '52.24166667° — this is what you feed to SIN, COS or TAN.',
    afterwards: 'Going back the other way: subtract the whole degrees, × 60 for minutes, subtract those, × 60 for seconds.',
  },

  // ── 4 ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'curve-radius-tangent',
    title: 'Radius and tangent of a horizontal curve',
    why: 'Every curve problem starts by turning the degree of curve into a radius. The constant is worth knowing by heart.',
    problem: 'A curve has D = 4°00′ (arc definition) and Δ = 36°00′. Find R and T.',
    steps: [
      {
        keys: ['n5', 'n7', 'n2', 'n9', 'dot', 'n5', 'n8'],
        label: '5 7 2 9 . 5 8',
        does: 'The arc-definition constant, which is 100 × 180 ÷ π. Memorise it.',
        expect: '5729.58',
      },
      {
        keys: ['div', 'n4', 'eq'],
        label: '÷  4  =',
        does: 'Divided by the degree of curve gives the radius.',
        expect: '1432.395',
      },
      {
        keys: ['n3', 'n6', 'div', 'n2', 'eq'],
        label: '3 6  ÷  2  =',
        does: 'Half of Δ. The tangent formula uses Δ/2, not Δ — this is the most-missed detail in curve work.',
        expect: '18',
        trap: 'R is no longer on the display. You will need it again in a moment, which is exactly what STO is for.',
      },
      {
        keys: ['tan'],
        label: 'TAN',
        does: 'The tangent of 18°, taken straight from the display.',
        expect: '0.3249196962',
      },
      {
        keys: ['mul', 'n1', 'n4', 'n3', 'n2', 'dot', 'n3', 'n9', 'n5', 'eq'],
        label: '×  1 4 3 2 . 3 9 5  =',
        does: 'Times R, giving T = R·tan(Δ/2).',
        expect: '465.4133482',
      },
    ],
    answer: '465.4133482 — the tangent distance is 465.41 ft.',
    afterwards: 'Retyping R is what STO exists to prevent. The next routine does the same problem without it.',
  },

  // ── 5 ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'memory-sto-rcl',
    title: 'Holding a number with STO, instead of writing it down',
    why: 'Every retyped number is a chance to transpose two digits, and a transposed digit in an intermediate value produces a final answer that looks entirely reasonable. The memory keys are the cheapest accuracy you can buy.',
    problem: 'Same curve. Keep R in memory and use it without retyping.',
    steps: [
      {
        keys: ['n5', 'n7', 'n2', 'n9', 'dot', 'n5', 'n8', 'div', 'n4', 'eq'],
        label: '5 7 2 9 . 5 8  ÷  4  =',
        does: 'R again, on the display.',
        expect: '1432.395',
      },
      {
        keys: ['sto', 'n1'],
        label: 'STO  1',
        does: 'Stores the display in memory 1. STO waits for a digit — that digit chooses which of the three memories you mean. Nothing on the display changes.',
        expect: '1432.395',
        trap: 'STO overwrites without asking. There is no confirmation and no undo.',
      },
      {
        keys: ['n3', 'n6', 'div', 'n2', 'eq', 'tan'],
        label: '3 6  ÷  2  =  TAN',
        does: 'tan(Δ/2), with R safe in memory.',
        expect: '0.3249196962',
      },
      {
        keys: ['mul', 'rcl', 'n1'],
        label: '×  RCL  1',
        does: 'RCL 1 puts R back on the display as the second operand. No retyping, so nothing to transpose.',
        expect: '1432.395',
      },
      {
        keys: ['eq'],
        label: '=',
        does: 'The multiplication completes.',
        expect: '465.4133482',
      },
    ],
    answer: '465.4133482 — the same T, with five fewer digits typed.',
    afterwards: 'Three memories, 1 to 3. Learn to reach for STO the moment a number is going to be needed twice.',
  },

  // ── 6 ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'latitude-departure',
    title: 'Latitude and departure of a course',
    why: 'Traverse closure, area by DMD, and coordinate geometry all run on latitudes and departures. This is the forward direction of the inverse you did first.',
    problem: 'A course is 450.00 ft long at an azimuth of 128°30′. Find its latitude and departure.',
    steps: [
      {
        keys: ['n1', 'n2', 'n8', 'dot', 'n5'],
        label: '1 2 8 . 5',
        does: 'The azimuth in decimal degrees. 30′ is exactly half a degree, so no conversion is needed here.',
        expect: '128.5',
      },
      {
        keys: ['cos'],
        label: 'COS',
        does: 'Cosine of the azimuth, at once. It is negative, which is the calculator telling you the course runs south.',
        expect: '-0.6225146366',
        trap: 'That minus sign is information, not an error. Using azimuth rather than bearing is what makes the signs come out right on their own.',
      },
      {
        keys: ['mul', 'n4', 'n5', 'n0', 'eq'],
        label: '×  4 5 0  =',
        does: 'Times the length. This is the latitude: how far north (or here, south) the course goes.',
        expect: '-280.1315865',
      },
      {
        keys: ['n1', 'n2', 'n8', 'dot', 'n5', 'sin'],
        label: '1 2 8 . 5  SIN',
        does: 'Sine of the same azimuth, for the departure. Positive, so the course runs east.',
        expect: '0.7826081569',
      },
      {
        keys: ['mul', 'n4', 'n5', 'n0', 'eq'],
        label: '×  4 5 0  =',
        does: 'Times the length again, giving the departure.',
        expect: '352.1736706',
      },
    ],
    answer: 'Latitude −280.1315865 ft, departure +352.1736706 ft — −280.13 and +352.17 to a hundredth.',
    afterwards: 'South and east — the south-east quadrant, which is what an azimuth of 128½° should give. Checking the signs against the quadrant takes a second and catches a whole class of mistake.',
  },

  // ── 7 ───────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'stats-mean-sd',
    title: 'Mean and standard deviation of repeated readings',
    why: 'Faster than residuals by hand and far harder to get wrong. Worth learning properly rather than half-remembering under time pressure.',
    problem: 'Five readings of the same angle: 42.15, 42.18, 42.12, 42.20, 42.16. Find the mean and the sample standard deviation.',
    steps: [
      {
        keys: ['n4', 'n2', 'dot', 'n1', 'n5', 'sigma'],
        label: '4 2 . 1 5  Σ+',
        does: 'Enters the first reading into the statistics registers. The display shows how many readings are in so far — not the reading.',
        expect: '1',
        trap: 'That 1 is a COUNT. Seeing your data replaced by a small integer is alarming the first time and entirely normal.',
      },
      {
        keys: ['n4', 'n2', 'dot', 'n1', 'n8', 'sigma'],
        label: '4 2 . 1 8  Σ+',
        does: 'Second reading, same gesture. The count goes to 2 — that running count is your only confirmation the reading went in, so watch it.',
        expect: '2',
      },
      {
        keys: ['n4', 'n2', 'dot', 'n1', 'n2', 'sigma'],
        label: '4 2 . 1 2  Σ+',
        does: 'Third. If the count ever fails to advance, you pressed Σ+ twice or not at all, and the set is already wrong.',
        expect: '3',
      },
      {
        keys: ['n4', 'n2', 'dot', 'n2', 'n0', 'sigma'],
        label: '4 2 . 2 0  Σ+',
        does: 'Fourth. There is no way to see the readings back, which is why the count is the check.',
        expect: '4',
      },
      {
        keys: ['n4', 'n2', 'dot', 'n1', 'n6', 'sigma'],
        label: '4 2 . 1 6  Σ+',
        does: 'Fifth. Five readings are now held in the statistics registers, and the display agrees with how many you meant to enter.',
        expect: '5',
      },
      {
        keys: ['2nd', 'xsq'],
        label: '2nd  x̄',
        does: 'The mean, printed above the x² key.',
        expect: '42.162',
      },
      {
        keys: ['2nd', 'sqrt'],
        label: '2nd  σxn−1',
        does: 'The SAMPLE standard deviation — divided by n−1, which is what you want for a set of observations rather than a whole population.',
        expect: '0.03033150178',
        trap: 'σxn (no minus one) sits nearby and divides by n. For survey observations it is the wrong one, and it gives a smaller, more flattering number.',
      },
    ],
    answer: 'Mean 42.162, sample standard deviation 0.03033150178 — about 0.030.',
    afterwards: 'Clear the registers before the next set, or the old readings quietly join the new ones.',
  },
];

/** One routine by id. */
export function guidedRoutine(id: string): GuidedRoutine | undefined {
  return TI_30XA_GUIDED.find((r) => r.id === id);
}

/** Every key a routine presses, flattened — what the test feeds the engine. */
export function routineKeys(routine: GuidedRoutine): string[] {
  return routine.steps.flatMap((s) => s.keys);
}
