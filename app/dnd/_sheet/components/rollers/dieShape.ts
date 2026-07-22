// dieShape — the digital die's SHAPE follows the die being rolled (D-4).
//
// The owner: "right now it's just a rounded square that spins for every roll; a d20 should be a 20-sided
// shape." This derives how many sides the shape should have from the active roll, and builds a CSS
// clip-path for a regular N-gon. A d20 check → a 20-gon; 1d8 damage → an octagon; a mixed pool (2d6+1d4)
// is ambiguous, so it returns null and the roller keeps its neutral rounded shape.

/** Standard die faces we can shape. d100 reads as a 10-sided (a d10 percentile). */
const STD_FACES = [4, 6, 8, 10, 12, 20];

/** The die's side-count for the SHAPE, or null when ambiguous. Reads `isD20` first (the common case:
 *  every check/save/attack), then the die notation in the breakdown (`1d8[5] + 3`), then a single-die
 *  min/max fallback. */
export function dieSides(roll: {
  isD20?: boolean;
  min?: number;
  max?: number;
  entry?: { breakdown?: string };
}): number | null {
  if (roll.isD20) return 20;
  // Match the die notation `NdM` (or `dM`) — e.g. `1d8[5]`, `2d6`, `d12`. A leading `\b` would miss `1d8`
  // (no word boundary between the digit and the `d`), so allow an optional count in front of the `d`.
  const m = /\d*d(\d+)/i.exec(roll.entry?.breakdown ?? '');
  if (m) {
    const n = Number(m[1]);
    if (STD_FACES.includes(n)) return n;
    if (n === 100) return 10;
  }
  if (roll.min === 1 && typeof roll.max === 'number' && STD_FACES.includes(roll.max)) return roll.max;
  return null;
}

/** A CSS `clip-path` for a regular N-gon inscribed in the element (vertex at the top), so the die reads
 *  as an N-sided shape. Clamped to 3…20 sides. */
export function ngonClip(sides: number): string {
  const n = Math.max(3, Math.min(20, Math.round(sides)));
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = 50 + 50 * Math.cos(a);
    const y = 50 + 50 * Math.sin(a);
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${pts.join(', ')})`;
}
