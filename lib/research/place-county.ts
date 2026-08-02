// lib/research/place-county.ts — which county is this place in (plan R35).
//
// ── WHY THIS REFUSES TO GUESS ───────────────────────────────────────────────────────────────────
//
// R28 already refuses to infer a county from an address, because getting it wrong sends a 25-minute
// run at the wrong clerk — which fails slowly and expensively rather than immediately. This is the
// same rule applied to place names, and Texas makes it necessary:
//
//   "Cameron"  — the county seat of MILAM County, and also a county 300 miles south (Brownsville).
//   "Austin"   — the capital, in TRAVIS County, and also a county near Houston (Bellville).
//   "Trinity"  — a town in Trinity County; the name matches both.
//   "Waller", "Wharton", "Refugio", "Anderson"… — Texas is full of towns sharing a county's name.
//
// A resolver that picked the more famous reading would be right most of the time and catastrophic
// the rest, and the failure is silent: the run completes, against the wrong county's records.
//
// ── AND SOME TOWNS ARE IN TWO COUNTIES ──────────────────────────────────────────────────────────
//
// Copperas Cove straddles the Bell/Coryell line. Answering "Bell" is not wrong so much as
// incomplete, and a boundary survey on the Coryell side would be researched against the wrong
// clerk's index. Both are returned, with the reason.

export interface CountyRef {
  name: string;
  fips: string;
}

export type ResolutionKind =
  /** One county, no doubt. */
  | 'resolved'
  /** The place genuinely sits in more than one county. Both are returned. */
  | 'straddles'
  /** The name means two different places. Nothing is returned — a person must choose. */
  | 'ambiguous'
  /** Not in the table. Not an error: Texas has thousands of place names. */
  | 'unknown';

export interface Resolution {
  kind: ResolutionKind;
  counties: CountyRef[];
  /** What to tell the person, in every case. */
  statement: string;
  /** What resolves it. Empty when nothing needs resolving. */
  nextStep: string;
}

const C = (name: string, fips: string): CountyRef => ({ name, fips });

/** The places this firm works, from the owner's own list plus the obvious neighbours. */
const PLACES: Record<string, CountyRef[]> = {
  // Bell
  KILLEEN: [C('Bell', '48027')],
  TEMPLE: [C('Bell', '48027')],
  BELTON: [C('Bell', '48027')],
  HARKERHEIGHTS: [C('Bell', '48027')],
  NOLANVILLE: [C('Bell', '48027')],
  SALADO: [C('Bell', '48027')],
  // Straddles the Bell/Coryell line — see the header.
  COPPERASCOVE: [C('Bell', '48027'), C('Coryell', '48099')],

  // Travis
  PFLUGERVILLE: [C('Travis', '48453')],
  LAKEWAY: [C('Travis', '48453')],
  MANOR: [C('Travis', '48453')],

  // Williamson
  ROUNDROCK: [C('Williamson', '48491')],
  GEORGETOWN: [C('Williamson', '48491')],
  HUTTO: [C('Williamson', '48491')],
  TAYLOR: [C('Williamson', '48491')],
  CEDARPARK: [C('Williamson', '48491')],
  LEANDER: [C('Williamson', '48491')],

  // Milam
  MILANO: [C('Milam', '48331')],
  ROCKDALE: [C('Milam', '48331')],
  THORNDALE: [C('Milam', '48331')],

  // McLennan
  WACO: [C('McLennan', '48309')],
  CRAWFORD: [C('McLennan', '48309')],
  HEWITT: [C('McLennan', '48309')],
  WOODWAY: [C('McLennan', '48309')],

  // The rest of the owner's list
  MARSHALL: [C('Harrison', '48203')],
  HUNTSVILLE: [C('Walker', '48471')],
  CENTERVILLE: [C('Leon', '48289')],
  CONROE: [C('Montgomery', '48339')],
  MADISONVILLE: [C('Madison', '48313')],
  BREMOND: [C('Robertson', '48395')],
  CALVERT: [C('Robertson', '48395')],
  HEARNE: [C('Robertson', '48395')],
  GATESVILLE: [C('Coryell', '48099')],
  LAMPASAS: [C('Lampasas', '48281')],
};

/** Names that mean a town AND a county, where the two are different places.
 *
 *  Listing them is the point: without this table a resolver silently prefers one reading, and the
 *  wrong one costs a run against a clerk hundreds of miles away. */
const AMBIGUOUS: Record<string, { candidates: CountyRef[]; note: string }> = {
  CAMERON: {
    candidates: [C('Milam', '48331'), C('Cameron', '48061')],
    note:
      'Cameron is the county seat of MILAM County, and Cameron County is a different place 300 miles ' +
      'south (Brownsville).',
  },
  AUSTIN: {
    candidates: [C('Travis', '48453'), C('Austin', '48015')],
    note:
      'The city of Austin is in TRAVIS County. Austin County (Bellville) is a separate county near Houston.',
  },
  TRINITY: {
    candidates: [C('Trinity', '48455')],
    note: 'The town of Trinity is in Trinity County — the names match, so confirm which was meant.',
  },
  ANDERSON: {
    candidates: [C('Grimes', '48185'), C('Anderson', '48001')],
    note: 'The town of Anderson is in GRIMES County; Anderson County (Palestine) is elsewhere.',
  },
  WALLER: {
    candidates: [C('Waller', '48473')],
    note: 'The city of Waller straddles Waller and Harris counties.',
  },
};

/** Normalise for lookup: case, punctuation and spacing all vary in how people type a town. */
export function placeKey(place: string): string {
  return place.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Counties, by their own name. Every Texas county is already a row in `research_counties`; this is
 *  only the subset the resolver needs to answer "is this a county name?". */
const COUNTY_NAMES = new Map<string, CountyRef>(
  [
    C('Bell', '48027'), C('Travis', '48453'), C('Williamson', '48491'), C('Milam', '48331'),
    C('Harrison', '48203'), C('McLennan', '48309'), C('Coryell', '48099'), C('Walker', '48471'),
    C('Leon', '48289'), C('Montgomery', '48339'), C('Trinity', '48455'), C('Madison', '48313'),
    C('Robertson', '48395'), C('Lampasas', '48281'), C('Bexar', '48029'), C('Harris', '48201'),
    C('Hidalgo', '48215'), C('Cameron', '48061'), C('Austin', '48015'), C('Grimes', '48185'),
    C('Brazos', '48041'), C('Burleson', '48051'), C('Falls', '48145'), C('Limestone', '48293'),
  ].map((c) => [placeKey(c.name), c]),
);

/** Which county is this place in?
 *
 *  Ambiguity is checked FIRST. A name that is both a town and a county must not be resolved by
 *  whichever table happens to be consulted first — that is how a resolver acquires a silent
 *  preference nobody chose. */
export function resolvePlace(place: string, hint?: { isCounty?: boolean }): Resolution {
  const key = placeKey(place.replace(/\s+county$/i, ''));
  if (!key) {
    return { kind: 'unknown', counties: [], statement: 'No place was given.', nextStep: 'Provide a town or county name.' };
  }

  // An explicit "X County" removes the ambiguity by itself — the writer said which they meant.
  const saidCounty = hint?.isCounty || /\bcounty\b/i.test(place);
  const amb = AMBIGUOUS[key];
  if (amb && !saidCounty) {
    return {
      kind: 'ambiguous',
      counties: [],
      statement:
        `"${place}" is ambiguous. ${amb.note} Nothing has been assumed — a run against the wrong ` +
        'county completes normally and searches the wrong clerk\'s index.',
      nextStep: `Say which was meant: ${amb.candidates.map((c) => `${c.name} County`).join(' or ')}.`,
    };
  }

  const county = COUNTY_NAMES.get(key);
  if (saidCounty && county) {
    return {
      kind: 'resolved', counties: [county],
      statement: `${county.name} County (FIPS ${county.fips}).`, nextStep: '',
    };
  }

  const places = PLACES[key];
  if (places && places.length === 1) {
    return {
      kind: 'resolved', counties: places,
      statement: `${place} is in ${places[0]!.name} County (FIPS ${places[0]!.fips}).`, nextStep: '',
    };
  }
  if (places && places.length > 1) {
    return {
      kind: 'straddles', counties: places,
      statement:
        `${place} lies in more than one county: ${places.map((c) => c.name).join(' and ')}. ` +
        'Which one applies depends on where the parcel actually sits.',
      // Not an error to fix — a fact to act on.
      nextStep: 'Search both, or narrow it with the parcel id or an appraisal-district lookup.',
    };
  }

  if (county) {
    return {
      kind: 'resolved', counties: [county],
      statement: `${county.name} County (FIPS ${county.fips}).`, nextStep: '',
    };
  }

  return {
    kind: 'unknown', counties: [],
    // Texas has thousands of place names; not being in the table is not an error.
    statement: `"${place}" is not in the place table. That does not mean it is not a real place.`,
    nextStep: 'Give the county directly, or add this place to the table once somebody confirms it.',
  };
}

/** The counties the firm has said it works, from the owner's list. Used to register adapters (R36)
 *  and to check coverage against intent. */
export const TARGET_COUNTIES: CountyRef[] = [
  C('Bell', '48027'),
  C('Travis', '48453'),
  C('Williamson', '48491'),
  C('Milam', '48331'),
  C('Harrison', '48203'),
  C('McLennan', '48309'),
  C('Coryell', '48099'),
  C('Walker', '48471'),
  C('Leon', '48289'),
  C('Montgomery', '48339'),
  C('Trinity', '48455'),
  C('Madison', '48313'),
  C('Robertson', '48395'),
];

/** Resolve a whole list of places at once, keeping the ones that could not be resolved visible.
 *
 *  Returns the unresolved separately rather than dropping them: a list that silently loses the
 *  ambiguous entries looks complete and is not. */
export function resolveAll(places: string[]): {
  counties: CountyRef[];
  needsDecision: Array<{ place: string; resolution: Resolution }>;
} {
  const byFips = new Map<string, CountyRef>();
  const needsDecision: Array<{ place: string; resolution: Resolution }> = [];

  for (const p of places) {
    const r = resolvePlace(p);
    if (r.kind === 'resolved' || r.kind === 'straddles') {
      for (const c of r.counties) byFips.set(c.fips, c);
      if (r.kind === 'straddles') needsDecision.push({ place: p, resolution: r });
    } else {
      needsDecision.push({ place: p, resolution: r });
    }
  }

  return {
    counties: [...byFips.values()].sort((a, b) => a.name.localeCompare(b.name)),
    needsDecision,
  };
}
