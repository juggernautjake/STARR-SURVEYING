// lib/research/property-address.ts — the address as the operator typed it, kept that way.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// The create form asks for street, city, county, state and ZIP in five boxes. The create route then
// joined four of them into one string, and two separate parsers in the worker tried to guess them
// back apart. Measured on 2026-09-02, neither could:
//
//   · `address-normalizer.parseAddress` expects `..., TEMPLE, TX 76501`. The route emitted
//     `..., TEMPLE, TX, 76501` — one extra comma, because it joined every component identically.
//     The pattern missed, the fallback ran, and `streetName` came out as the ENTIRE remainder:
//     "MAIN ST, TEMPLE, TX, 76501". That string was then typed into the county CAD's street-name
//     box, where it matches nothing, and the run reported no appraisal record for the property.
//
//   · Bell's `parseAddressComponents` strips the city with a hardcoded list of fifteen Bell-area
//     towns, so a property in Waco or Georgetown keeps its city inside the street name.
//
// Both are reconstructions of something the operator had already entered correctly. This module is
// the alternative: carry the parts, never re-derive them.
//
// ── THE ONE RULE ────────────────────────────────────────────────────────────────────────────────
//
// A composed string is for HUMANS — a card, a heading, a report. It is never the input to a search.
// Search terms are built from the components. `composeAddress` exists so the display stays pretty;
// nothing downstream should ever take its output and split it again.

/** A property address with its parts intact. Every field optional: a rural parcel legitimately has
 *  no street number, and a CAD id alone is enough to run. */
export interface StructuredAddress {
  streetNumber?: string | null;
  streetName?: string | null;
  unit?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  zip?: string | null;
  /** County appraisal district property ID. Pins the exact parcel where an address is ambiguous. */
  parcelId?: string | null;
}

const clean = (v: string | null | undefined): string => (v ?? '').trim();

/** Is there enough here to find a parcel?
 *
 *  A street name alone is enough (rural roads often have no number). A city alone is not — that is
 *  a search for a town, and the run would burn twenty minutes proving it. A parcel ID alone IS
 *  enough and is in fact the strongest input there is. */
export function canLocateProperty(a: StructuredAddress): boolean {
  return Boolean(clean(a.parcelId) || clean(a.streetName));
}

/**
 * The human-readable one-liner. Used for cards, headings and reports.
 *
 * The state and ZIP are joined with a SPACE, not a comma — `TX 76501`, the way an envelope is
 * addressed and the way every address parser in the world expects. The old route joined them with a
 * comma and that single character defeated the worker's own parser. This is not a style choice.
 */
export function composeAddress(a: StructuredAddress): string {
  const street = [clean(a.streetNumber), clean(a.streetName), clean(a.unit)]
    .filter(Boolean)
    .join(' ');
  const stateZip = [clean(a.state), clean(a.zip)].filter(Boolean).join(' ');
  return [street, clean(a.city), stateZip].filter(Boolean).join(', ');
}

/**
 * Split a single typed line into a street number, name and unit.
 *
 * ONLY for seeding the separate boxes as the operator types, and for legacy rows that have nothing
 * else. It is a guess, and the caller should treat it as one — which is the entire reason the
 * structured fields exist. It deliberately does NOT try to find a city, state or ZIP: those have
 * their own boxes, and a parser that quietly claims one is how "MAIN ST, TEMPLE, TX, 76501" became
 * a street name.
 */
export function splitStreetLine(line: string): {
  streetNumber: string;
  streetName: string;
  unit: string;
} {
  const text = clean(line).replace(/\s+/g, ' ');
  if (!text) return { streetNumber: '', streetName: '', unit: '' };

  let rest = text;
  let streetNumber = '';

  // A leading number, optionally with a letter — `123`, `123A`, `1/2` blocks are left alone.
  const numMatch = rest.match(/^(\d+[A-Za-z]?)\s+(.*)$/);
  if (numMatch) {
    streetNumber = numMatch[1];
    rest = numMatch[2];
  }

  // A trailing unit. Anchored to the END and to a known unit word, so `UNIT` in "UNIVERSITY DR"
  // cannot be mistaken for one and neither can a house number.
  let unit = '';
  const unitMatch = rest.match(/\s+((?:SUITE|STE|APT|APARTMENT|UNIT|LOT|SPACE|SPC|BLDG|BUILDING|#)\s*\S+)\s*$/i);
  if (unitMatch) {
    unit = unitMatch[1].trim();
    rest = rest.slice(0, unitMatch.index).trim();
  }

  return { streetNumber, streetName: rest.trim(), unit };
}

/** Does this address carry parts, or only a legacy flattened string? Decides whether the worker
 *  uses the components or falls back to guessing — and lets it SAY which it did. */
export function hasStructuredParts(a: StructuredAddress): boolean {
  return Boolean(clean(a.streetName) || clean(a.city) || clean(a.zip));
}

/**
 * The search terms a county CAD form should receive.
 *
 * Returns the pieces separately because that is how the forms ask for them. The unit is
 * deliberately absent: appraisal indexes are keyed to the parcel, not the apartment, and including
 * a suite number turns a match into a miss.
 */
export function cadSearchTerms(a: StructuredAddress): {
  streetNumber: string | null;
  streetName: string | null;
  city: string | null;
  zip: string | null;
} {
  return {
    streetNumber: clean(a.streetNumber) || null,
    streetName: clean(a.streetName).toUpperCase() || null,
    city: clean(a.city).toUpperCase() || null,
    zip: clean(a.zip) || null,
  };
}

/**
 * What the operator gave us, in a sentence, for the run log and the AI briefing.
 *
 * Names what is MISSING as well as what is present. A run that searched without a city searched
 * differently, and six weeks later "why did this come back empty" is unanswerable if the log only
 * recorded the address it did have.
 */
export function describeAddressInput(a: StructuredAddress): string {
  const have: string[] = [];
  const missing: string[] = [];
  const note = (label: string, v: string | null | undefined) =>
    (clean(v) ? have : missing).push(label);

  note('street number', a.streetNumber);
  note('street name', a.streetName);
  note('city', a.city);
  note('county', a.county);
  note('ZIP', a.zip);
  note('parcel ID', a.parcelId);

  if (have.length === 0) return 'No property identifiers were supplied at intake.';
  return (
    `Supplied at intake: ${have.join(', ')}.` +
    (missing.length ? ` Not supplied: ${missing.join(', ')}.` : '')
  );
}
