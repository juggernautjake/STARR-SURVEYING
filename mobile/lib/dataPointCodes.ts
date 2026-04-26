/**
 * 179-code library — Starr Surveying point-name taxonomy.
 *
 * Plan §5.3: "Point name intelligence: recognizes 179-code prefixes
 * (BM, IR, HC, SI, etc.), color-codes by category to match arm-sleeve
 * cards, suggests next number in sequence, warns on duplicates."
 *
 * The full 179-code list lives offline (Henry's printout); Phase F0
 * §15 was meant to inventory it. Until that ships, the table below
 * captures the most-common prefixes the field crew uses daily — the
 * UI gracefully falls through to 'unknown' for codes we haven't
 * codified yet.
 *
 * Adding a new prefix: append to CODE_PREFIXES below. The
 * point-name autocomplete (F3 #7) reads the same list — no other
 * file needs changing.
 *
 * Hex colors deliberately match the arm-sleeve cards in the field.
 * If the office reprints the cards with different colors, update
 * here and the StageChip-style pattern picks them up everywhere.
 */

/** Code prefix entry — one row per known 179-code category. */
export interface CodePrefix {
  /** Uppercase prefix as printed on the arm-sleeve card. */
  prefix: string;
  /** Display label for the autocomplete. */
  label: string;
  /** Hex color matching the arm-sleeve card. */
  color: string;
  /** One-line hint shown under the label in the picker. */
  description: string;
}

export const CODE_PREFIXES: ReadonlyArray<CodePrefix> = [
  // Monuments + corners
  { prefix: 'BM',       label: 'Benchmark',          color: '#0EA5E9', description: 'Permanent elevation reference (USGS, NOS, county)' },
  { prefix: 'IR',       label: 'Iron rod',           color: '#0891B2', description: 'Set / found iron rod or pipe' },
  { prefix: 'IP',       label: 'Iron pipe',          color: '#0891B2', description: 'Set / found iron pipe' },
  { prefix: 'CM',       label: 'Concrete monument',  color: '#1E40AF', description: 'Set / found concrete monument' },
  { prefix: 'PK',       label: 'PK nail',            color: '#7C3AED', description: 'Set / found PK nail / mag nail' },
  { prefix: 'X',        label: 'X / scribe',         color: '#7C3AED', description: 'Cut X or scribe mark on hard surface' },

  // Property + boundary
  { prefix: 'PC',       label: 'Property corner',    color: '#0F172A', description: 'Generic property corner (deed-called)' },
  { prefix: 'FC',       label: 'Found corner',       color: '#1E293B', description: 'Found existing monument matching deed' },
  { prefix: 'SC',       label: 'Set corner',         color: '#475569', description: 'Set new corner monument' },
  { prefix: 'WC',       label: 'Witness corner',     color: '#64748B', description: 'Witness / bearing-tree marker' },
  { prefix: 'RC',       label: 'Reference corner',   color: '#64748B', description: 'Reference for an obliterated original' },

  // Linear features (lines, fences, walls)
  { prefix: 'FL',       label: 'Fence line',         color: '#059669', description: 'Fence line shot — corner / change / end' },
  { prefix: 'WL',       label: 'Wall',               color: '#047857', description: 'Wall corner / change / end' },
  { prefix: 'EP',       label: 'Edge of pavement',   color: '#10B981', description: 'Edge of asphalt / concrete' },
  { prefix: 'CL',       label: 'Centerline',         color: '#34D399', description: 'Road / driveway centerline' },
  { prefix: 'EOR',      label: 'Edge of road',       color: '#10B981', description: 'Edge of unpaved road' },

  // Hydrology
  { prefix: 'HC',       label: 'Headwall / culvert', color: '#0284C7', description: 'Headwall, culvert, drain' },
  { prefix: 'WS',       label: "Water's edge",       color: '#0EA5E9', description: 'Edge of water at time of shot' },
  { prefix: 'WB',       label: 'Water body',         color: '#0284C7', description: 'Pond / lake / cistern' },
  { prefix: 'CR',       label: 'Creek',              color: '#0C4A6E', description: 'Creek bank / centerline' },

  // Improvements
  { prefix: 'BC',       label: 'Building corner',    color: '#A855F7', description: 'Building corner / footprint shot' },
  { prefix: 'UT',       label: 'Utility',            color: '#F59E0B', description: 'Utility pole / box / pedestal' },
  { prefix: 'UP',       label: 'Utility pole',       color: '#F59E0B', description: 'Power / phone pole' },
  { prefix: 'WV',       label: 'Water valve',        color: '#3B82F6', description: 'Water valve / meter' },
  { prefix: 'GV',       label: 'Gas valve',          color: '#FBBF24', description: 'Gas valve / meter' },
  { prefix: 'MH',       label: 'Manhole',            color: '#737373', description: 'Manhole / inlet' },
  { prefix: 'SI',       label: 'Sign',               color: '#EF4444', description: 'Sign post / mounted sign' },

  // Vegetation + natural features
  { prefix: 'TR',       label: 'Tree',               color: '#16A34A', description: 'Tree shot (with size + species)' },
  { prefix: 'STP',      label: 'Stump',              color: '#65A30D', description: 'Tree stump' },
  { prefix: 'BR',       label: 'Boulder',            color: '#71717A', description: 'Boulder / large rock' },
  { prefix: 'GP',       label: 'Ground point',       color: '#A3A3A3', description: 'Spot grade / topo shot' },

  // Control + setup
  { prefix: 'CP',       label: 'Control point',      color: '#DC2626', description: 'Survey control / occupation point' },
  { prefix: 'BS',       label: 'Backsight',          color: '#B91C1C', description: 'Setup backsight' },
  { prefix: 'TP',       label: 'Turning point',      color: '#991B1B', description: 'Level / traverse turning point' },

  // Misc
  { prefix: 'NOTE',     label: 'Note point',         color: '#6B7280', description: 'Photo + note shot, not a coordinate' },
  { prefix: 'MISC',     label: 'Miscellaneous',      color: '#6B7280', description: 'Other / TBD — describe in notes' },
] as const;

const PREFIX_LOOKUP = new Map(
  CODE_PREFIXES.map((entry) => [entry.prefix, entry])
);

/**
 * Pull the prefix out of a point name. "BM01" → "BM", "FL-CORNER-NE"
 * → "FL", "MISC123" → "MISC". We greedy-match from the start until
 * we hit a digit, hyphen, underscore, or end-of-string. The longest
 * matching prefix wins so 'STP' doesn't collide with 'ST'.
 */
export function extractPrefix(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim().toUpperCase();
  if (trimmed === '') return null;

  // Capture the leading run of letters. Stops at digit / hyphen /
  // underscore / whitespace — anything that signals "the prefix
  // ended."
  const match = /^([A-Z]+)/.exec(trimmed);
  if (!match) return null;
  const candidate = match[1];

  // Walk from longest to shortest to handle overlap (STP vs ST).
  // The list is small enough that a linear scan is fine.
  for (let len = candidate.length; len > 0; len--) {
    const prefix = candidate.slice(0, len);
    if (PREFIX_LOOKUP.has(prefix)) return prefix;
  }

  // Unknown prefix — return the literal so the UI can still show it
  // (rendered with the 'unknown' fallback color).
  return candidate;
}

/**
 * Resolve a prefix string to its CodePrefix entry, or to a fallback
 * for unknown prefixes. The fallback uses muted gray so an unrecognised
 * code reads as "needs codifying" rather than mimicking a known
 * category color.
 */
export function lookupPrefix(prefix: string | null | undefined): CodePrefix {
  if (!prefix) return UNKNOWN_PREFIX;
  return PREFIX_LOOKUP.get(prefix.toUpperCase()) ?? {
    prefix: prefix.toUpperCase(),
    label: prefix.toUpperCase(),
    color: UNKNOWN_PREFIX.color,
    description: 'Unrecognised prefix — add to CODE_PREFIXES if used regularly.',
  };
}

const UNKNOWN_PREFIX: CodePrefix = {
  prefix: 'UNKNOWN',
  label: 'Unknown',
  color: '#9CA3AF',
  description: 'Prefix not in the 179-code library.',
};

/**
 * Suggest the next number in sequence for a given prefix on a given
 * job. Reads existing point names matching `{prefix}{digits}` and
 * returns prefix + (highest + 1), zero-padded to 2 digits when the
 * highest existing is also 2-digit. Returns the bare prefix when the
 * job has no points with that prefix yet.
 *
 * Examples (existing on job): BM01, BM02, BM05  →  "BM06"
 *                             IR (none)         →  "IR"
 *                             FL-NE             →  "FL-NE" stays a manual name
 *
 * Free-text suffixes (FL-CORNER-NE, BM-MAIN) are skipped — only
 * pure numeric suffixes participate in auto-numbering.
 */
export function suggestNextName(
  prefix: string,
  existingNames: ReadonlyArray<string>
): string {
  const upper = prefix.toUpperCase();
  let highest = 0;
  let highestWidth = 2;
  let foundAny = false;

  // Match e.g. "BM01" (with width 2) or "BM123" (width 3). Reject
  // "BM-NE" (no number).
  const pattern = new RegExp(`^${escapeForRegex(upper)}(\\d+)$`);
  for (const raw of existingNames) {
    const m = pattern.exec(raw.trim().toUpperCase());
    if (!m) continue;
    foundAny = true;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > highest) {
      highest = n;
      highestWidth = Math.max(highestWidth, m[1].length);
    }
  }

  if (!foundAny) return upper;
  return `${upper}${String(highest + 1).padStart(highestWidth, '0')}`;
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
