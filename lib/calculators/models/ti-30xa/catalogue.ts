// lib/calculators/models/ti-30xa/catalogue.ts — what every key on the TI-30Xa actually does.
//
// Owner, 2026-09-20: "We need to catalogue all of the commands and everything for whatever
// calculators we use so that we can fully learn what each button does and what each combination of
// buttons do. I need to become very familiar and quick with the calculator."
//
// ── WHY THIS IS SEPARATE FROM keypad-data.ts ────────────────────────────────────────────────────
//
// `keypad-data.ts` is the device: where each key sits, what is printed on it, what colour it is. It
// was rebuilt from a photograph and it must stay a faithful description of the plastic.
//
// This is the MANUAL: what pressing it does, what the yellow second function does, and — the part
// no manual has — what a surveyor actually reaches for it for. Keeping them apart means the layout
// can be corrected against a photo without touching the teaching, and the teaching can be written
// and rewritten without risk of nudging a key out of place.
//
// ── THE TI-30Xa IS AN ALGEBRAIC, SINGLE-LINE CALCULATOR ─────────────────────────────────────────
//
// This matters more than any individual key, so it is said once here rather than repeated in forty
// entries. The 30Xa evaluates as you go on a single line with no expression history: you cannot see
// what you typed, you cannot edit back into it, and a function key acts IMMEDIATELY on whatever is
// on the display. `45 SIN` gives 0.7071. `SIN 45` does not — it takes the sine of whatever was
// already showing and then you have typed 45 over the top of it.
//
// That is the opposite of the TI-36X Pro and the MultiView, and it is the single commonest way
// somebody who learned on a newer calculator loses marks on the FS exam. Every entry below is
// written for the 30Xa's order.
//
// Approved for the NCEES FS exam under the "TI-30X" model-name rule, which is why it is worth
// learning specifically rather than generically.

export interface KeyDoc {
  /** Matches the `id` in keypad-data.ts. */
  id: string;
  /** What is printed on the key face. */
  label: string;
  /** What pressing it does, in one or two sentences. */
  does: string;
  /** The yellow function above the key, reached with 2nd, when there is one. */
  second?: { label: string; does: string };
  /** A concrete keystroke sequence and what appears, so it can be tried immediately. */
  example?: { press: string; shows: string };
  /** Why a surveyor reaches for it. Omitted where the honest answer is "rarely, on this exam". */
  surveyUse?: string;
  /** The mistake people actually make with this key. */
  trap?: string;
  /** Grouping for the browsable catalogue. */
  group: 'entry' | 'arithmetic' | 'trig' | 'powers' | 'memory' | 'stats' | 'angle' | 'control';
  /** A key whose whole meaning is its label - a digit, or an operator. Rendered compactly, and
   *  exempt from the check that every entry says something substantial. */
  plain?: boolean;
}

export const TI_30XA_CATALOGUE: KeyDoc[] = [
  // ── control and entry ─────────────────────────────────────────────────────────────────────────
  {
    id: '2nd', label: '2nd', group: 'control',
    does: 'Shifts the NEXT key press to the yellow function printed above it. It applies to one key only and then releases — it is not a lock.',
    example: { press: '2nd  then  SIN', shows: 'SIN⁻¹ — arcsine, not sine' },
    surveyUse: 'Every inverse trig function on this calculator is behind 2nd, and inverse trig is how you get an angle out of a latitude and departure.',
    trap: 'Pressing 2nd twice does not lock it — the second press cancels the first. If nothing seems to happen, you have probably shifted and un-shifted.',
  },
  {
    id: 'off', label: 'OFF', group: 'control',
    does: 'Turns the calculator off. Memory and the DRG setting survive.',
    second: { label: 'ˣ√y', does: 'The x-th root of y. Enter y, press 2nd ˣ√y, enter x, press =.' },
    example: { press: '32  2nd ˣ√y  5  =', shows: '2 — the fifth root of 32' },
  },
  {
    id: 'del', label: 'CE/C', group: 'control',
    does: 'Pressed once, clears the number you are typing. Pressed twice, clears the whole calculation.',
    second: { label: 'F↔D', does: 'Toggles the display between a fraction and its decimal value.' },
    surveyUse: 'The single most useful habit on this calculator: when a number looks wrong mid-entry, one press fixes it without losing the running calculation.',
    trap: 'It does NOT clear memory. Use 2nd with STO, or store 0, for that.',
  },
  // The ten digits. There is nothing to say about a 7 beyond that it is a seven, and padding
  // ten entries with invented detail would only teach somebody to stop reading the ones that
  // matter. `plain: true` marks them so the browser can render them compactly and so the
  // 'is this entry thin?' check knows the thinness is deliberate.
  { id: 'n0', label: '0', group: 'entry', plain: true, does: 'Digit zero.' },
  { id: 'n1', label: '1', group: 'entry', plain: true, does: 'Digit one.' },
  { id: 'n2', label: '2', group: 'entry', plain: true, does: 'Digit two.' },
  { id: 'n3', label: '3', group: 'entry', plain: true, does: 'Digit three.' },
  { id: 'n4', label: '4', group: 'entry', plain: true, does: 'Digit four.' },
  { id: 'n5', label: '5', group: 'entry', plain: true, does: 'Digit five.' },
  { id: 'n6', label: '6', group: 'entry', plain: true, does: 'Digit six.' },
  { id: 'n7', label: '7', group: 'entry', plain: true, does: 'Digit seven.' },
  { id: 'n8', label: '8', group: 'entry', plain: true, does: 'Digit eight.' },
  { id: 'n9', label: '9', group: 'entry', plain: true, does: 'Digit nine.' },
  {
    id: 'dot', label: '.', group: 'entry',
    does: 'Decimal point.',
    plain: true,
    trap: 'On a bearing, remember that 12°30′ is 12.5 degrees, not 12.30. Mixing the two is the commonest arithmetic error in the whole exam.',
  },
  {
    id: 'negate', label: '+/−', group: 'entry',
    does: 'Changes the sign of the number showing. Press it AFTER typing the number, not before.',
    example: { press: '4 2 . 5  +/−', shows: '−42.5' },
    surveyUse: 'Southerly latitudes and westerly departures are negative. So are elevations below datum and cut volumes.',
    trap: 'This is not the same as the subtraction key. Typing − 4 2 . 5 starts a subtraction; 4 2 . 5 +/− is the negative number.',
  },
  {
    id: 'ee', label: 'EE', group: 'entry',
    does: 'Enters a power-of-ten exponent. 6.5 EE 4 is 6.5 × 10⁴.',
    second: { label: 'n', does: 'Recalls how many data points are in the statistics registers.' },
    example: { press: '2 . 0 9 EE 7', shows: '2.09 × 10⁷ — roughly the earth’s radius in feet' },
    surveyUse: 'The earth’s mean radius, 20,906,000 ft, is far easier to enter as 2.0906 EE 7 than as eight digits — and it appears in every elevation-factor computation.',
  },

  // ── arithmetic ────────────────────────────────────────────────────────────────────────────────
  { id: 'add', label: '+', group: 'arithmetic', does: 'Addition. On this calculator the operation runs when you press the next operator or =.' },
  { id: 'sub', label: '−', group: 'arithmetic', does: 'Subtraction. Not the same key as +/−, which negates a single number.' },
  { id: 'mul', label: '×', group: 'arithmetic', plain: true, does: 'Multiplication.' },
  { id: 'div', label: '÷', group: 'arithmetic', plain: true, does: 'Division.' },
  {
    id: 'eq', label: '=', group: 'arithmetic',
    does: 'Finishes the calculation and shows the result.',
    trap: 'A function key such as SIN or x² acts immediately on the display — it does not wait for =. Only the four arithmetic operations do.',
  },
  {
    id: 'lparen', label: '(', group: 'arithmetic',
    second: { label: 'Sx', does: 'The SUM of the data points in the statistics registers.' },
    does: 'Opens a parenthesis. The 30Xa honours order of operations, but brackets remove all doubt.',
    surveyUse: 'Worth using generously in error-propagation work, where a missing bracket silently changes √(a²+b²) into √a² + b².',
  },
  {
    id: 'rparen', label: ')', group: 'arithmetic',
    does: 'Closes a parenthesis. Unclosed brackets are resolved when you press =.',
    second: { label: 'Sx2', does: 'The sum of the SQUARES of the data points - the raw material of a standard deviation, if you ever want to compute one the long way.' },
  },
  {
    id: 'frac', label: 'a b/c', group: 'arithmetic',
    does: 'Enters or displays a mixed number. 3 a b/c 1 a b/c 2 is three and a half.',
    second: { label: 'd/c', does: 'Converts between a mixed number and an improper fraction.' },
    trap: 'Rarely wanted in survey work — decimals are the language of the trade. Its real use on the exam is reading an answer choice written as a fraction.',
  },

  // ── trigonometry ──────────────────────────────────────────────────────────────────────────────
  {
    id: 'sin', label: 'SIN', group: 'trig',
    does: 'Sine of the angle showing, in whatever unit DRG is set to. Type the angle FIRST, then press SIN.',
    second: { label: 'SIN⁻¹', does: 'Arcsine — gives the angle whose sine is the number showing.' },
    example: { press: '3 0  SIN', shows: '0.5 (with DRG on DEG)' },
    surveyUse: 'Departure = length × sin(azimuth). Also the long chord of a curve, 2R·sin(Δ/2).',
    trap: 'On this calculator the angle goes in BEFORE the function key. Somebody used to a TI-36X Pro will type SIN 30 and get a wrong answer with no warning.',
  },
  {
    id: 'cos', label: 'COS', group: 'trig',
    does: 'Cosine of the angle showing. Angle first, then the key.',
    second: { label: 'COS⁻¹', does: 'Arccosine — the angle whose cosine is showing.' },
    example: { press: '6 8 . 5  COS', shows: '0.36650' },
    surveyUse: 'Latitude = length × cos(azimuth). Also slope-to-horizontal reduction, H = S·cos(vertical angle).',
  },
  {
    id: 'tan', label: 'TAN', group: 'trig',
    does: 'Tangent of the angle showing.',
    second: { label: 'TAN⁻¹', does: 'Arctangent — the angle whose tangent is showing. This is how you turn a departure over a latitude into a bearing.' },
    example: { press: '4 0 0  ÷  3 0 0  =  2nd TAN⁻¹', shows: '53.13° — the bearing angle for ΔE 400, ΔN 300' },
    surveyUse: 'The tangent distance of a curve, T = R·tan(Δ/2), and every bearing computed from coordinates.',
    trap: 'TAN⁻¹ always answers between −90° and +90°. It cannot know which quadrant you are in — you have to decide that from the signs of ΔN and ΔE yourself.',
  },
  {
    id: 'hyp', label: 'HYP', group: 'trig',
    does: 'Makes the next trig key hyperbolic — SINH, COSH, TANH.',
    second: { label: 'K', does: 'Turns on constant mode, which repeats the last operation each time you press =.' },
    trap: 'Almost never wanted in surveying. If a trig answer looks wildly wrong, check you have not left HYP active.',
  },
  {
    id: 'mode', label: 'DRG', group: 'angle',
    does: 'Cycles the angle unit: DEG → RAD → GRAD. The current one shows in the display.',
    second: { label: 'DRG►', does: 'CONVERTS the number showing from the current unit into the next one, rather than just changing the mode.' },
    example: { press: 'with DEG showing:  1 8 0  2nd DRG►', shows: '3.14159… — 180 degrees expressed in radians' },
    surveyUse: 'Check DRG before every trig calculation. The whole FS exam is in degrees; a calculator left in RAD gives plausible-looking wrong answers all day.',
    trap: 'DRG and 2nd DRG► are different operations. The first changes the MODE and leaves the number alone; the second converts the NUMBER. Confusing them is a classic way to lose an hour.',
  },

  // ── powers, roots, reciprocals ────────────────────────────────────────────────────────────────
  {
    id: 'xsq', label: 'x²', group: 'powers',
    does: 'Squares the number showing, immediately.',
    second: { label: 'x̄', does: 'The mean of the data in the statistics registers.' },
    example: { press: '3 0 0  x²', shows: '90000' },
    surveyUse: 'Everywhere. Σv² for standard deviation, ΔN² + ΔE² for a distance, and every error-propagation formula.',
  },
  {
    id: 'sqrt', label: '√x', group: 'powers',
    does: 'Square root of the number showing, immediately.',
    second: { label: 'σxn−1', does: 'The sample standard deviation of the data in the statistics registers — the n−1 version, which is the one surveying wants.' },
    example: { press: '2 5 0 0 0 0  √x', shows: '500' },
    surveyUse: 'The second half of every inverse and every propagation: distance = √(ΔN²+ΔE²), σ = √(Σv²/(n−1)).',
  },
  {
    id: 'pow', label: 'yˣ', group: 'powers',
    does: 'Raises y to the power x. Enter y, press yˣ, enter x, press =.',
    second: { label: 'ˣ√y', does: 'The x-th root of y.' },
    example: { press: '1 . 0 9  yˣ  6  =', shows: '1.6771 — the compound factor for 9% over 6 years' },
    surveyUse: 'Engineering economics lives here: (1+i)ⁿ is inside every present-worth factor on the exam.',
  },
  {
    id: 'recip', label: '1/x', group: 'powers',
    does: 'Reciprocal of the number showing, immediately.',
    second: { label: 'FRQ', does: 'Enters a frequency for the next statistics data point — how many times that value occurred.' },
    surveyUse: 'Weights in a weighted mean are proportional to 1/σ², so 1/x follows x² more often than you would expect.',
  },
  {
    id: 'pi', label: 'π', group: 'powers',
    does: 'Puts π on the display, to the calculator’s full internal precision.',
    second: { label: 'x≷y', does: 'Swaps the displayed number with the one held in the pending operation.' },
    surveyUse: 'Curve work: L = RΔ needs Δ in radians, and the degree-to-radian conversion is × π ÷ 180.',
    trap: 'Use the π key, never 3.14. On a long curve the difference is measurable on the ground.',
  },
  {
    id: 'log', label: 'LOG', group: 'powers',
    does: 'Common logarithm, base 10, of the number showing.',
    second: { label: '10ˣ', does: 'Ten raised to the number showing — the inverse of LOG.' },
    trap: 'Rarely needed on the FS. Do not confuse it with LN, which is base e.',
  },
  {
    id: 'ln', label: 'LN', group: 'powers',
    does: 'Natural logarithm, base e, of the number showing.',
    second: { label: 'eˣ', does: 'e raised to the number showing.' },
    surveyUse: 'Continuous-compounding problems in engineering economics, and occasionally in EDM atmospheric corrections.',
  },

  // ── memory ────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'sto', label: 'STO', group: 'memory',
    does: 'Stores the number showing into one of three memories. Press STO then 1, 2 or 3.',
    second: { label: 'EXC', does: 'Exchanges the display with a memory - the stored number comes out and the displayed one goes in, in one press.' },
    example: { press: '2 0 9 0 6 0 0 0  STO  1', shows: 'the earth’s radius parked in memory 1' },
    surveyUse: 'Park a constant you will need repeatedly — the earth’s radius, a scale factor, a rate — and stop retyping it. Every retype is a chance to transpose a digit.',
  },
  {
    id: 'rcl', label: 'RCL', group: 'memory',
    does: 'Recalls a stored number to the display. Press RCL then 1, 2 or 3.',
    second: { label: 'SUM', does: 'ADDS the displayed number to a memory instead of replacing it. Useful for accumulating a running total without losing what is already there.' },
    example: { press: 'RCL 1', shows: 'whatever you stored in memory 1' },
    trap: 'Memory survives being switched off. A number left over from yesterday will be recalled quite happily, so store before you recall.',
  },

  // ── statistics ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'sigma', label: 'Σ+', group: 'stats',
    does: 'Adds the number showing to the statistics registers as one data point. The display then shows how many points you have entered.',
    second: { label: 'Σ−', does: 'Removes a data point you entered by mistake.' },
    example: { press: '2 1 5 . 8 6 Σ+  2 1 5 . 9 0 Σ+  2 1 5 . 8 8 Σ+', shows: '3 — three readings entered' },
    surveyUse: 'The fastest route to a mean and a standard deviation on the exam: enter the readings with Σ+, then 2nd x̄ for the mean and 2nd σxn−1 for the standard deviation. It is several minutes faster than computing residuals by hand.',
    trap: 'Clear the registers before starting a new set, or yesterday’s readings are still in there skewing everything. And use σxn−1, not σxn — surveying wants the sample standard deviation.',
  },
  {
    id: 'n', label: 'n (2nd EE)', group: 'stats',
    does: 'Recalls the number of data points currently in the statistics registers. Useful for confirming you entered all of them before trusting a mean.',
  },
];

/** Look one key up by the id used in `keypad-data.ts`. */
export function docFor(id: string): KeyDoc | undefined {
  return TI_30XA_CATALOGUE.find((k) => k.id === id);
}

export const CATALOGUE_GROUPS: Array<{ id: KeyDoc['group']; label: string; blurb: string }> = [
  { id: 'control', label: 'Control', blurb: 'The shift key and clearing — the two things you press most and think about least.' },
  { id: 'entry', label: 'Entering numbers', blurb: 'Digits, signs and exponents.' },
  { id: 'arithmetic', label: 'Arithmetic', blurb: 'The four operations, brackets and equals.' },
  { id: 'trig', label: 'Trigonometry', blurb: 'The heart of coordinate geometry. Angle first, then the key.' },
  { id: 'angle', label: 'Angle units', blurb: 'DRG, and the conversion that is not the same as the mode change.' },
  { id: 'powers', label: 'Powers and roots', blurb: 'Squares, roots and exponents — the other half of every distance and error formula.' },
  { id: 'memory', label: 'Memory', blurb: 'Three registers. Use them for constants you would otherwise retype.' },
  { id: 'stats', label: 'Statistics', blurb: 'Mean and standard deviation without computing a single residual by hand.' },
];

/** The handful of sequences worth knowing by muscle memory, in the order they are worth learning. */
export interface Drill {
  id: string;
  title: string;
  why: string;
  press: string[];
  result: string;
}

export const TI_30XA_DRILLS: Drill[] = [
  {
    id: 'check-drg',
    title: 'Check the angle mode before anything else',
    why: 'A calculator left in radians gives wrong answers that look entirely reasonable. Make this the first thing you do when you sit down, every single time.',
    press: ['Look at the display', 'DRG until DEG shows'],
    result: 'DEG in the corner of the display',
  },
  {
    id: 'inverse',
    title: 'Distance and bearing from ΔN and ΔE',
    why: 'The single most-used computation in the whole exam. Worth being able to do without thinking.',
    press: ['3 0 0', 'x²', '+', '4 0 0', 'x²', '=', '√x', '(distance = 500)', '4 0 0', '÷', '3 0 0', '=', '2nd', 'TAN⁻¹'],
    result: '500 ft, then 53.13° — and you decide the quadrant from the signs',
  },
  {
    id: 'dms',
    title: 'Degrees, minutes and seconds into decimal degrees',
    why: 'Almost every angle on the exam arrives as DMS and every trig function wants decimal degrees.',
    press: ['5 2', '+', '1 4', '÷', '6 0', '+', '3 0', '÷', '3 6 0 0', '='],
    result: '52.2417° for 52°14′30″',
  },
  {
    id: 'stats',
    title: 'Mean and standard deviation from a set of readings',
    why: 'Minutes faster than residuals by hand, and far less error-prone. Learn this one properly.',
    press: ['each reading then Σ+', '…', '2nd', 'x̄', '(mean)', '2nd', 'σxn−1'],
    result: 'the mean, then the sample standard deviation',
  },
  {
    id: 'curve',
    title: 'Radius and tangent of a curve from D and Δ',
    why: 'Curve problems all start here, and the arc-definition constant is worth memorising.',
    press: ['5 7 2 9 . 5 8', '÷', '4', '=', '(R = 1432.39)', '×', '(', '3 6', '÷', '2', ')', 'TAN', '='],
    result: 'R = 1432.39 ft, then T = 465.41 ft',
  },
];
