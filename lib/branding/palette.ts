// lib/branding/palette.ts
//
// ── ONE LIST, THREE CONSUMERS ───────────────────────────────────────────────────────────────────
//
// The admin branding portal, the standalone guide sent to printers, and the tests all read this
// file. That is the whole point of it existing: a brand palette that lives in three hand-written
// copies is three palettes, and the day somebody adds a colour to one of them is the day the
// printer and the website stop agreeing about what the company's green is.
//
// It is deliberately pure data with no React and no server imports, so a client component, a build
// script and a vitest file can all pull from it.
//
// ── WHERE THE VALUES CAME FROM ──────────────────────────────────────────────────────────────────
//
// Sampled, not invented. On 2026-08-31 the dominant colours of 41 pieces of existing Starr artwork
// were extracted and quantised; every swatch below whose `sampledFrom` is set was read off real
// logo files rather than chosen. The core red came back as a cluster at #B40C18–#CC1824 with
// #BD1218 sitting in the middle of it, which is why the core did not move.
//
// ── THE INK FIELD IS THE LOAD-BEARING ONE ───────────────────────────────────────────────────────
//
// Every colour records whether it takes WHITE ink or DARK ink on top, because that is the question
// a printer actually asks and getting it wrong is the most expensive mistake in the set. White on
// Hi-Vis Green measures 1.58:1 — a hi-vis vest with a white logo is a blank vest from ten feet —
// and white fails on all seven of the light and bright colours, which is exactly the group people
// reach for white on. `contrast-vs-white` and `contrast-vs-ink` are stored so the claim is a number
// somebody can check, not an assertion.

export type InkChoice = 'white' | 'dark';

export type ColourGroup = 'core' | 'red' | 'blue' | 'orange' | 'brown' | 'green' | 'neutral';

export interface BrandColour {
  name: string;
  hex: string;
  group: ColourGroup;
  rgb: [number, number, number];
  cmyk: [number, number, number, number];
  /** Which ink reads on top of this colour used as a background or garment. */
  ink: InkChoice;
  /** Measured, so the ink choice above is checkable rather than asserted. */
  contrastVsWhite: number;
  contrastVsInk: number;
  /** What this colour is for, in one line. */
  use: string;
  /** The value found in existing artwork, when this swatch was sampled rather than chosen. */
  sampledFrom?: string;
}

export const BRAND_COLOURS: BrandColour[] = [
  // ── CORE ────────────────────────────────────────────────────────────────────────────────────
  { name: 'Starr Red', hex: '#BD1218', group: 'core', rgb: [189, 18, 24], cmyk: [0, 90, 87, 26],
    ink: 'white', contrastVsWhite: 6.43, contrastVsInk: 2.88,
    use: 'The lead brand colour. Logo, primary calls to action, accent stitching.',
    sampledFrom: 'cluster #B40C18–#CC1824 across every badge variant' },
  { name: 'Starr Navy', hex: '#1D3095', group: 'core', rgb: [29, 48, 149], cmyk: [81, 68, 0, 42],
    ink: 'white', contrastVsWhite: 11.00, contrastVsInk: 1.68,
    use: 'The second identity colour. Headings, structure, the blue half of the logo.',
    sampledFrom: '#183090' },
  { name: 'White', hex: '#FFFFFF', group: 'core', rgb: [255, 255, 255], cmyk: [0, 0, 0, 0],
    ink: 'dark', contrastVsWhite: 1, contrastVsInk: 18.51,
    use: 'Knockout, and the safest ink on all four core colours.' },
  { name: 'Ink Black', hex: '#0F1419', group: 'core', rgb: [15, 20, 25], cmyk: [40, 20, 0, 90],
    ink: 'white', contrastVsWhite: 18.51, contrastVsInk: 1,
    use: 'Body text and the default dark. Use instead of pure #000000.',
    sampledFrom: '#181818' },

  // ── REDS & PINKS ────────────────────────────────────────────────────────────────────────────
  { name: 'Brick Red', hex: '#9A0F14', group: 'red', rgb: [154, 15, 20], cmyk: [0, 90, 87, 40],
    ink: 'white', contrastVsWhite: 8.56, contrastVsInk: 2.16,
    use: 'Use instead of Starr Red for small type, thin strokes and embroidery.' },
  { name: 'Maroon', hex: '#6B1027', group: 'red', rgb: [107, 16, 39], cmyk: [0, 85, 64, 58],
    ink: 'white', contrastVsWhite: 12.15, contrastVsInk: 1.52,
    use: 'Deep and formal. Reads as Texas A&M in Central Texas — use that deliberately.',
    sampledFrom: '#600C24' },
  { name: 'Clay Rose', hex: '#CF6569', group: 'red', rgb: [207, 101, 105], cmyk: [0, 51, 49, 19],
    ink: 'dark', contrastVsWhite: 3.67, contrastVsInk: 5.04,
    use: 'The mid pink. Already in the working palette.' },
  { name: 'Blush', hex: '#E9AFA8', group: 'red', rgb: [233, 175, 168], cmyk: [0, 25, 28, 9],
    ink: 'dark', contrastVsWhite: 1.88, contrastVsInk: 9.84,
    use: 'The light pink. Ladies’ fit tees, spring campaigns.' },

  // ── BLUES ───────────────────────────────────────────────────────────────────────────────────
  { name: 'Midnight Navy', hex: '#152050', group: 'blue', rgb: [21, 32, 80], cmyk: [74, 60, 0, 69],
    ink: 'white', contrastVsWhite: 15.51, contrastVsInk: 1.19,
    use: 'The best all-round garment colour, and the right pick for any one-colour job.' },
  { name: 'Slate Blue', hex: '#3C546C', group: 'blue', rgb: [60, 84, 108], cmyk: [44, 22, 0, 58],
    ink: 'white', contrastVsWhite: 7.85, contrastVsInk: 2.36,
    use: 'Heritage blue. The one heritage colourway that stays close to the real identity.',
    sampledFrom: '#304860' },
  { name: 'Sky Blue', hex: '#7FA8D9', group: 'blue', rgb: [127, 168, 217], cmyk: [41, 23, 0, 15],
    ink: 'dark', contrastVsWhite: 2.47, contrastVsInk: 7.50,
    use: 'The light blue. Polos, sun shirts, neck gaiters.' },

  // ── ORANGES ─────────────────────────────────────────────────────────────────────────────────
  { name: 'Burnt Orange', hex: '#B4491A', group: 'orange', rgb: [180, 73, 26], cmyk: [0, 59, 86, 29],
    ink: 'white', contrastVsWhite: 5.37, contrastVsInk: 3.45,
    use: 'Heritage orange. Texas through and through — merch, not equipment.',
    sampledFrom: '#B44818' },
  { name: 'Safety Orange', hex: '#F26522', group: 'orange', rgb: [242, 101, 34], cmyk: [0, 58, 86, 5],
    ink: 'dark', contrastVsWhite: 3.15, contrastVsInk: 5.87,
    use: 'Hi-vis vests, cones, jobsite signage. Equipment, never merch.' },
  { name: 'Terracotta', hex: '#C08460', group: 'orange', rgb: [192, 132, 96], cmyk: [0, 31, 50, 25],
    ink: 'dark', contrastVsWhite: 3.13, contrastVsInk: 5.92,
    use: 'The softest heritage hue. Friendliest of the seven.',
    sampledFrom: '#C08460' },

  // ── BROWNS & NATURALS ───────────────────────────────────────────────────────────────────────
  { name: 'Saddle Brown', hex: '#6B4A2F', group: 'brown', rgb: [107, 74, 47], cmyk: [0, 31, 56, 58],
    ink: 'white', contrastVsWhite: 7.94, contrastVsInk: 2.33,
    use: 'Leather goods, hat patches, waxed canvas.' },
  { name: 'Espresso', hex: '#3E332A', group: 'brown', rgb: [62, 51, 42], cmyk: [0, 18, 32, 76],
    ink: 'white', contrastVsWhite: 12.27, contrastVsInk: 1.51,
    use: 'The dark brown. A softer alternative to black.',
    sampledFrom: '#483C30' },
  { name: 'Khaki', hex: '#A8906C', group: 'brown', rgb: [168, 144, 108], cmyk: [0, 14, 36, 34],
    ink: 'dark', contrastVsWhite: 3.06, contrastVsInk: 6.06,
    use: 'Field uniform standard. Warmest garment in the range.',
    sampledFrom: 'the tan cap' },
  { name: 'Cream', hex: '#F5EFE3', group: 'brown', rgb: [245, 239, 227], cmyk: [0, 2, 7, 4],
    ink: 'dark', contrastVsWhite: 1.14, contrastVsInk: 16.17,
    use: 'The paper of every heritage colourway.',
    sampledFrom: '#FCF0E4' },

  // ── GREENS ──────────────────────────────────────────────────────────────────────────────────
  { name: 'Field Green', hex: '#50A720', group: 'green', rgb: [80, 167, 32], cmyk: [52, 0, 81, 35],
    ink: 'dark', contrastVsWhite: 3.05, contrastVsInk: 6.07,
    use: 'Bright grass green. Already in the working palette.' },
  { name: 'Hi-Vis Green', hex: '#C7D805', group: 'green', rgb: [199, 216, 5], cmyk: [8, 0, 98, 15],
    ink: 'dark', contrastVsWhite: 1.58, contrastVsInk: 11.68,
    use: 'The neon. Safety vests and hi-vis tees only.' },
  { name: 'Forest Green', hex: '#2C4A2E', group: 'green', rgb: [44, 74, 46], cmyk: [41, 0, 38, 71],
    ink: 'white', contrastVsWhite: 9.88, contrastVsInk: 1.87,
    use: 'Heritage green. Best of the set on olive and tan garments.',
    sampledFrom: '#304830' },
  { name: 'Pine', hex: '#1C3323', group: 'green', rgb: [28, 51, 35], cmyk: [45, 0, 31, 80],
    ink: 'white', contrastVsWhite: 13.57, contrastVsInk: 1.36,
    use: 'The dark green. Nearly a neutral — behaves like Ink Black with warmth.' },
  { name: 'Sage', hex: '#A8B490', group: 'green', rgb: [168, 180, 144], cmyk: [7, 0, 20, 29],
    ink: 'dark', contrastVsWhite: 2.19, contrastVsInk: 8.46,
    use: 'The light green. The field behind the forest-green heritage badge.',
    sampledFrom: '#A8B490' },
  { name: 'Olive Drab', hex: '#54543C', group: 'green', rgb: [84, 84, 60], cmyk: [0, 0, 29, 67],
    ink: 'white', contrastVsWhite: 7.75, contrastVsInk: 2.39,
    use: 'The military green. Field-crew favourite.',
    sampledFrom: 'the olive cap' },

  // ── NEUTRALS ────────────────────────────────────────────────────────────────────────────────
  { name: 'Mist', hex: '#E5E7EB', group: 'neutral', rgb: [229, 231, 235], cmyk: [3, 2, 0, 8],
    ink: 'dark', contrastVsWhite: 1.24, contrastVsInk: 14.95,
    use: 'Light heather garments, rules, panel edges.' },
  { name: 'Steel', hex: '#9CA3AF', group: 'neutral', rgb: [156, 163, 175], cmyk: [11, 7, 0, 31],
    ink: 'dark', contrastVsWhite: 2.54, contrastVsInk: 7.29,
    use: 'Mid grey. Only Midnight Navy survives on it.' },
  { name: 'Slate Text', hex: '#4B5563', group: 'neutral', rgb: [75, 85, 99], cmyk: [24, 14, 0, 61],
    ink: 'white', contrastVsWhite: 7.56, contrastVsInk: 2.45,
    use: 'Body copy and captions. Digital and print, not garments.' },
];

/** The four the owner names as the identity. Everything else is an extension of these. */
export const CORE_COLOURS = BRAND_COLOURS.filter((c) => c.group === 'core');

export const GROUP_LABELS: Record<ColourGroup, string> = {
  core: 'Core — the identity',
  red: 'Reds & pinks',
  blue: 'Blues',
  orange: 'Oranges',
  brown: 'Browns & naturals',
  green: 'Greens',
  neutral: 'Supporting neutrals',
};

export const GROUP_ORDER: ColourGroup[] = ['core', 'red', 'blue', 'orange', 'brown', 'green', 'neutral'];

export function coloursInGroup(group: ColourGroup): BrandColour[] {
  return BRAND_COLOURS.filter((c) => c.group === group);
}

export function colourByName(name: string): BrandColour | undefined {
  return BRAND_COLOURS.find((c) => c.name === name);
}

// ── PAIRINGS THAT MUST NEVER SHIP ───────────────────────────────────────────────────────────────
//
// Listed rather than derived, because the point of the list is the SENTENCE beside each one. A
// derived "everything under 4.5:1" list would be 200 rows of noise; these are the six somebody
// actually tries.

export interface BannedPair {
  fg: string;
  bg: string;
  ratio: number;
  why: string;
}

export const NEVER_PAIR: BannedPair[] = [
  { fg: 'Starr Red', bg: 'Starr Navy', ratio: 1.71,
    why: 'The two primary brand colours are almost invisible against each other. They always need white, cream or gold between them.' },
  { fg: 'White', bg: 'Hi-Vis Green', ratio: 1.58,
    why: 'The worst pairing in the palette. A hi-vis vest with a white logo is a blank vest from ten feet.' },
  { fg: 'White', bg: 'Sage', ratio: 2.19,
    why: 'Sage is a light colour. It takes dark ink, like every other light colour here.' },
  { fg: 'White', bg: 'Sky Blue', ratio: 2.47,
    why: 'Reads acceptably on a bright monitor and disappears on fabric in daylight.' },
  { fg: 'White', bg: 'Safety Orange', ratio: 3.15,
    why: 'The instinctive choice on safety wear, and wrong. Use Ink Black or Midnight Navy.' },
  { fg: 'Starr Red', bg: 'Brick Red', ratio: 1.33,
    why: 'Two reds one step apart. Neither separates from the other at any size.' },
];

// ── TYPE ────────────────────────────────────────────────────────────────────────────────────────
//
// Ten faces, each with a job. All SIL Open Font License: free for commercial use including goods
// the firm sells, embeddable in a PDF sent to a printer, and the only thing the licence forbids is
// selling the font files themselves. That constraint is why every one of these is a Google font
// rather than the obvious commercial pick — a brand system nobody can legally install is a brand
// system nobody uses.

export type FontRole = 'display' | 'body' | 'technical';

export interface BrandFont {
  name: string;
  role: FontRole;
  /** The one-line job. */
  purpose: string;
  /** Where it goes, and where it must not. */
  use: string;
  /** CSS font-family stack, with a real fallback. */
  stack: string;
  /** The weights loaded for the specimen. */
  weights: string;
  /** Caps-only faces need saying — Bebas has no true lowercase. */
  capsOnly?: boolean;
  sample: string;
}

export const BRAND_FONTS: BrandFont[] = [
  { name: 'Oswald', role: 'display', purpose: 'Primary display',
    use: 'The primary lockup, headlines, section headers, hat wordmarks. Condensed enough to fit a long company name into a narrow space, and it matches the compressed caps already in the badge. This is the house display face.',
    stack: '"Oswald", "Arial Narrow", sans-serif', weights: '400;600;700',
    sample: 'STARR SURVEYING' },
  { name: 'Archivo Black', role: 'display', purpose: 'Impact headline',
    use: 'Shirt fronts, yard signs, ad headlines — anything that has to land in one glance. Wider and heavier than Oswald; use it when there is room and you want weight rather than height. Never for more than about five words.',
    stack: '"Archivo Black", "Helvetica Neue", sans-serif', weights: '400',
    sample: 'Boundary Surveys' },
  { name: 'Bebas Neue', role: 'display', purpose: 'Banners & caps',
    use: 'Jobsite banners, cap side text, curved badge type, table headers, tall narrow spaces. Give it generous letter-spacing — it tightens up badly at default tracking.',
    stack: '"Bebas Neue", "Oswald", sans-serif', weights: '400', capsOnly: true,
    sample: 'LICENSED TEXAS LAND SURVEYOR' },
  { name: 'Alfa Slab One', role: 'display', purpose: 'Heritage & merch',
    use: 'The heritage colourways, vintage tees, enamel mugs, coasters, stickers. A heavy slab serif that reads as old signage. Pair it with Cream and one heritage hue — never with the primary red-and-navy identity.',
    stack: '"Alfa Slab One", Rockwell, Georgia, serif', weights: '400',
    sample: 'Est. Central Texas' },
  { name: 'Rye', role: 'display', purpose: 'Western character',
    use: 'Texas flavour — rodeo sponsorships, county fair banners, limited-run merch. Sparingly: one line, large, and never for body copy or anything a client reads to get information.',
    stack: '"Rye", "Alfa Slab One", serif', weights: '400',
    sample: 'Starr Surveying Co.' },
  { name: 'Inter', role: 'body', purpose: 'Body & interface',
    use: 'The website, the software, proposals, email — anything read on a screen. Already in use across the Starr Surveying platform, so keeping it here means print and digital agree.',
    stack: '"Inter", -apple-system, "Segoe UI", sans-serif', weights: '400;500;600;800',
    sample: 'Boundary retracement, ALTA/NSPS, topographic and construction staking' },
  { name: 'Source Sans 3', role: 'body', purpose: 'Long-form body',
    use: 'Printed brochures, multi-page proposals, report body text. Warmer and more open than Inter, which reads better on paper over long stretches. Use one or the other in a document, never both.',
    stack: '"Source Sans 3", "Inter", sans-serif', weights: '400;600',
    sample: 'A boundary survey establishes the true corners of a parcel from the record and the evidence on the ground.' },
  { name: 'Roboto Condensed', role: 'technical', purpose: 'Plats & tables',
    use: 'Drawing labels, plat annotations, legends, dense tables, spec sheets. Narrow enough for a long legal description to fit inside a parcel outline, and it stays legible when a plat is printed at half size.',
    stack: '"Roboto Condensed", "Arial Narrow", sans-serif', weights: '400;700',
    sample: 'LOT 14, BLOCK 3 — HOLLAND TOWNSITE — 2.184 ACRES' },
  { name: 'Source Serif 4', role: 'body', purpose: 'Formal & legal',
    use: 'Surveyor’s certificates, metes-and-bounds descriptions, affidavits, letters to attorneys and title companies. A serif signals a document of record — the one place where looking traditional is the point.',
    stack: '"Source Serif 4", Georgia, serif', weights: '400;700',
    sample: 'Certificate of Survey — State of Texas, County of Bell' },
  { name: 'JetBrains Mono', role: 'technical', purpose: 'Technical data',
    use: 'Bearings, distances, coordinates, instrument readings, data tables. Every digit is the same width, so columns line up without tabs and a transposed figure is easy to spot. It also separates 0 from O and 1 from l, which on a coordinate matters.',
    stack: '"JetBrains Mono", ui-monospace, monospace', weights: '400;700',
    sample: 'N 30°14′22″ E   412.68′' },
];

/** The Google Fonts href that loads every specimen. Derived so it cannot drift from the list. */
export function googleFontsHref(): string {
  const families = BRAND_FONTS.map((f) => {
    const family = f.name.replace(/ /g, '+');
    if (f.name === 'Source Serif 4') return `family=Source+Serif+4:opsz,wght@8..60,400;8..60,700`;
    return f.weights === '400' ? `family=${family}` : `family=${family}:wght@${f.weights}`;
  });
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

/** Every colour name, as a type. Lets a logo profile name a colour the palette can be asked for. */
export type ColourName = (typeof BRAND_COLOURS)[number]['name'];

// ── CONTRAST, COMPUTED HERE ─────────────────────────────────────────────────────────────────────
//
// The stored `contrastVsWhite` / `contrastVsInk` on each colour answer the ink question, which is
// the one that gets asked most. Everything else — "what else can I put on Forest Green?" — needs
// the full N×N, and 27 colours is 702 ordered pairs. Deriving them beats storing them: a stored
// matrix is 702 numbers to get wrong, and it goes stale the moment a hex moves.

const srgb = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

function luminance([r, g, b]: readonly number[]): number {
  return 0.2126 * srgb(r!) + 0.7152 * srgb(g!) + 0.0722 * srgb(b!);
}

/** WCAG 2.1 relative-luminance contrast between two palette colours. */
export function contrastBetween(a: BrandColour, b: BrandColour): number {
  const [hi, lo] = [luminance(a.rgb), luminance(b.rgb)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100;
}

export type PairGrade = 'aaa' | 'aa' | 'large' | 'fail';

/**
 * The grade a pairing earns.
 *
 * Four bands rather than pass/fail because the middle one is real and gets misused: 3:1 to 4.5:1 is
 * legitimate for display sizes and wrong for body copy, and collapsing it into "fail" is how a
 * usable headline pairing gets thrown away, while collapsing it into "pass" is how unreadable small
 * print ships.
 */
export function gradeFor(ratio: number): PairGrade {
  if (ratio >= 7) return 'aaa';
  if (ratio >= 4.5) return 'aa';
  if (ratio >= 3) return 'large';
  return 'fail';
}

export const GRADE_LABELS: Record<PairGrade, string> = {
  aaa: 'Excellent',
  aa: 'Safe for body text',
  large: 'Display sizes only',
  fail: 'Do not use for text',
};

export interface Pairing {
  fg: ColourName;
  bg: ColourName;
  ratio: number;
  grade: PairGrade;
}

/** Every ordered pair, graded. Derived, so it cannot disagree with the swatches. */
export function allPairings(): Pairing[] {
  const out: Pairing[] = [];
  for (const bg of BRAND_COLOURS) {
    for (const fg of BRAND_COLOURS) {
      if (fg.name === bg.name) continue;
      const ratio = contrastBetween(fg, bg);
      out.push({ fg: fg.name, bg: bg.name, ratio, grade: gradeFor(ratio) });
    }
  }
  return out;
}

/** What can go ON this colour, best first. The question somebody actually arrives with. */
export function pairingsOn(bg: ColourName, minGrade: PairGrade = 'aa'): Pairing[] {
  const rank: Record<PairGrade, number> = { fail: 0, large: 1, aa: 2, aaa: 3 };
  return allPairings()
    .filter((p) => p.bg === bg && rank[p.grade] >= rank[minGrade])
    .sort((a, b) => b.ratio - a.ratio);
}

// ── SEMANTIC STATUS TONES ───────────────────────────────────────────────────────────────────────
//
// Not brand colours — these are the four states any interface or document has to express, and they
// are here because "what colour is our warning state?" is a brand question that was previously
// answered by whoever was building the page that day.
//
// Kept as data rather than inline styles for the reason `inline-style-hex-ratchet` gives: a hex
// inside `style={{…}}` cannot be reached by a token, a media query, the print stylesheet or a
// contrast audit. Every pair below is stored with its measured ratio.

export interface StatusTone {
  id: 'success' | 'warning' | 'danger' | 'info';
  label: string;
  bg: string;
  fg: string;
  ratio: number;
  use: string;
}

export const STATUS_TONES: StatusTone[] = [
  { id: 'success', label: 'Complete', bg: '#DCFCE7', fg: '#14532D', ratio: 9.55,
    use: 'Finished work, approved items, passing checks.' },
  { id: 'warning', label: 'In progress', bg: '#FEF3C7', fg: '#78350F', ratio: 8.62,
    use: 'Work underway, pending review, anything waiting on somebody.' },
  { id: 'danger', label: 'Blocked', bg: '#FEE2E2', fg: '#7F1D1D', ratio: 9.24,
    use: 'Stopped work, failed checks, anything needing a decision now.' },
  { id: 'info', label: 'Scheduled', bg: '#DBEAFE', fg: '#1E3A8A', ratio: 9.29,
    use: 'Future work, informational notes, neutral context.' },
];

/** Hi-vis states, which take dark ink rather than the light-on-light pattern above. */
export const HIVIS_TONES: StatusTone[] = [
  { id: 'warning', label: 'Field priority', bg: '#C7D805', fg: '#0F1419', ratio: 11.68,
    use: 'Safety wear and equipment. Dark ink — white measures 1.58:1 here.' },
  { id: 'danger', label: 'Safety hold', bg: '#F26522', fg: '#0F1419', ratio: 5.87,
    use: 'Hi-vis vests and jobsite signage. Dark ink — white measures 3.15:1.' },
];

// ── FONT PAIRINGS ───────────────────────────────────────────────────────────────────────────────
//
// Which faces go together, and for what. Two per piece is the working limit; three only when one of
// them is the monospace carrying data, which is the documents-of-record case below.

export interface FontPairing {
  id: string;
  label: string;
  /** Names in BRAND_FONTS. */
  fonts: string[];
  purpose: string;
  /** The colourway this pairing is normally set in — names in BRAND_COLOURS. */
  ground: ColourName;
  ink: ColourName;
  accent?: ColourName;
}

export const FONT_PAIRINGS: FontPairing[] = [
  { id: 'house', label: 'Oswald + Inter', fonts: ['Oswald', 'Inter'],
    purpose: 'The house pairing. Website, proposals, ads, signage, social. If in doubt, use this one.',
    ground: 'Midnight Navy', ink: 'White' },
  { id: 'heritage', label: 'Alfa Slab One + Source Sans 3', fonts: ['Alfa Slab One', 'Source Sans 3'],
    purpose: 'Heritage merchandise. Vintage tees, mugs, stickers, the retail line. Always on Cream with one heritage hue.',
    ground: 'Cream', ink: 'Espresso', accent: 'Burnt Orange' },
  { id: 'record', label: 'Source Serif 4 + Roboto Condensed + JetBrains Mono',
    fonts: ['Source Serif 4', 'Roboto Condensed', 'JetBrains Mono'],
    purpose: 'Documents of record. Plats, certificates, legal descriptions. The one place three faces is correct — each carries a different kind of information.',
    ground: 'White', ink: 'Ink Black', accent: 'Starr Navy' },
  { id: 'apparel', label: 'Bebas Neue + Archivo Black', fonts: ['Bebas Neue', 'Archivo Black'],
    purpose: 'Apparel and banners. Cap side text, shirt backs, jobsite banners. Loud on purpose — keep it to two lines.',
    ground: 'Ink Black', ink: 'White', accent: 'Safety Orange' },
  { id: 'western', label: 'Rye + Roboto Condensed', fonts: ['Rye', 'Roboto Condensed'],
    purpose: 'Regional and event work — rodeo sponsorships, county fairs, limited runs. One line of Rye, never more.',
    ground: 'Cream', ink: 'Maroon', accent: 'Espresso' },
];

export function fontByName(name: string): BrandFont | undefined {
  return BRAND_FONTS.find((f) => f.name === name);
}
