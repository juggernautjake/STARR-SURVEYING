// worker/src/research/address-parts.ts — the operator's address, used instead of re-guessed.
//
// ── WHAT THE WORKER USED TO RECEIVE ─────────────────────────────────────────────────────────────
//
// One string. The app collected a street, a city, a county, a state and a ZIP in five boxes, joined
// four of them with `, `, and sent the result. The worker then tried to take it back apart, in two
// different places, and on 2026-09-02 both were measured getting it wrong:
//
//   · `services/address-normalizer.ts parseAddress()` matches `..., TEMPLE, TX 76501`. The app
//     emitted `..., TEMPLE, TX, 76501` — a comma between state and ZIP, because it joined every
//     component identically. The pattern missed and the fallback returned
//
//         streetName = "MAIN ST, TEMPLE, TX, 76501"
//
//     which `generateAddressVariants` turned into search terms and typed into the county CAD's
//     street-name box. Nothing matches that. The run then reported that the appraisal district had
//     no record of the property.
//
//   · `counties/bell/scrapers/cad-scraper.ts parseAddressComponents()` strips the city with a
//     hardcoded list of fifteen Bell-area towns. In Waco, Georgetown or Round Rock the city stays
//     inside the street name.
//
// Neither is fixable with a better regex, because both are reconstructing something that was known
// exactly and thrown away. Seed 624 gives `research_projects` real columns and the pipeline route
// sends them as `addressParts`.
//
// ── FALLING BACK IS ALLOWED. FALLING BACK SILENTLY IS NOT ───────────────────────────────────────
//
// Projects created before seed 624 have no parts, and the public request form may only ever supply
// a line of text. Those still parse. The difference is that `resolveAddressParts` returns HOW it
// got its answer, so the run log can distinguish "we searched for the street the operator typed"
// from "we searched for the street we guessed" — which is the first question worth asking when a
// county comes back empty.

/** The address parts as the operator entered them. Mirrors `StructuredAddress` in the app's
 *  `lib/research/property-address.ts`; the two builds cannot share a module, so a test asserts the
 *  field names still agree rather than trusting that they do. */
export interface AddressParts {
  streetNumber?: string | null;
  streetName?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface ResolvedAddress {
  streetNumber: string;
  streetName: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  /** `entered` — the operator typed these. `parsed` — we guessed them from a flattened string. */
  source: 'entered' | 'parsed';
  /** One sentence for the run log. Says which of the two happened, and why it matters. */
  statement: string;
}

const clean = (v: string | null | undefined): string => (v ?? '').trim();

/** Are these parts usable, or empty placeholders from a pre-624 project? */
export function hasUsableParts(parts: AddressParts | null | undefined): boolean {
  if (!parts) return false;
  return Boolean(clean(parts.streetName) || clean(parts.city) || clean(parts.zip));
}

/**
 * Split a street LINE — only the street line — into number, name and unit.
 *
 * Deliberately narrower than the parsers this replaces: it never claims a city, a state or a ZIP.
 * Claiming a city is precisely how "MAIN ST, TEMPLE, TX, 76501" became a street name. If the caller
 * has a flattened string containing a city, the city is dropped here rather than smuggled into the
 * street name, because a search for `MAIN ST` finds the parcel and a search for the whole line
 * finds nothing at all.
 */
export function splitStreetLine(line: string): { streetNumber: string; streetName: string; unit: string } {
  const text = clean(line).replace(/\s+/g, ' ');
  if (!text) return { streetNumber: '', streetName: '', unit: '' };

  // Everything up to the first comma is the street line. The rest is city/state/ZIP and belongs to
  // the fields that own them.
  let rest = text.split(',')[0].trim();
  let streetNumber = '';

  const numMatch = rest.match(/^(\d+[A-Za-z]?)\s+(.*)$/);
  if (numMatch) {
    streetNumber = numMatch[1];
    rest = numMatch[2];
  }

  let unit = '';
  const unitMatch = rest.match(/\s+((?:SUITE|STE|APT|APARTMENT|UNIT|LOT|SPACE|SPC|BLDG|BUILDING|#)\s*\S+)\s*$/i);
  if (unitMatch) {
    unit = unitMatch[1].trim();
    rest = rest.slice(0, unitMatch.index).trim();
  }

  return { streetNumber, streetName: rest.trim(), unit };
}

/** Pull a city and ZIP out of a flattened line, for the fallback path only.
 *
 *  Handles `TX 76501` AND `TX, 76501`, because the app emitted the second for months and the parser
 *  that only understood the first is the reason this module exists. */
function salvageCityZip(line: string): { city: string; zip: string } {
  const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { city: '', zip: '' };

  let zip = '';
  const tail = parts[parts.length - 1];
  const zipMatch = tail.match(/\b(\d{5}(?:-\d{4})?)\b/);
  if (zipMatch) zip = zipMatch[1];

  // The city is the first segment after the street line that is neither a state nor a bare ZIP.
  for (const p of parts.slice(1)) {
    if (/^(TX|TEXAS)\b/i.test(p)) continue;
    if (/^\d{5}(-\d{4})?$/.test(p)) continue;
    return { city: p.replace(/\s+(TX|TEXAS)\s*\d{5}(-\d{4})?$/i, '').trim(), zip };
  }
  return { city: '', zip };
}

/**
 * Get the address parts for a run, preferring what the operator entered.
 *
 * `parts` wins whenever it carries anything usable. A flattened `address` is parsed only when it
 * does not — and the result says so, so the log never presents a guess as a fact.
 */
export function resolveAddressParts(
  parts: AddressParts | null | undefined,
  flattenedAddress: string | null | undefined,
): ResolvedAddress {
  const line = clean(flattenedAddress);

  if (hasUsableParts(parts)) {
    const p = parts!;
    // The street line may still need splitting: a caller can supply a city and ZIP while leaving
    // the whole street in one box.
    const needsSplit = !clean(p.streetNumber) && /^\d/.test(clean(p.streetName));
    const split = needsSplit ? splitStreetLine(clean(p.streetName)) : null;

    const streetNumber = clean(p.streetNumber) || split?.streetNumber || '';
    const streetName = split?.streetName || clean(p.streetName);
    const street = [streetNumber, streetName].filter(Boolean).join(' ') || '(no street)';
    const inCity = clean(p.city) ? ' in ' + clean(p.city) : '';
    const withZip = clean(p.zip) ? ' ' + clean(p.zip) : '';
    return {
      streetNumber,
      streetName,
      unit: clean(p.unit) || split?.unit || '',
      city: clean(p.city),
      state: clean(p.state) || 'TX',
      zip: clean(p.zip),
      source: 'entered',
      statement:
        'Searching on the address parts the operator entered: ' + street + inCity + withZip +
        '. Nothing was inferred from a combined string.',
    };
  }

  const split = splitStreetLine(line);
  const { city, zip } = salvageCityZip(line);
  return {
    streetNumber: split.streetNumber,
    streetName: split.streetName,
    unit: split.unit,
    city,
    state: clean(parts?.state) || 'TX',
    zip,
    source: 'parsed',
    statement: line
      ? 'This project has no separate address fields, so the street was GUESSED from the single ' +
        'line "' + line + '" — street "' + (split.streetName || '(none)') + '"' +
        (city ? ', city "' + city + '"' : ', no city') + '. If the county search comes back empty, ' +
        'this guess is the first thing to check: re-enter the address in the separate fields.'
      : 'No address was supplied at all, so no street search terms could be built.',
  };
}
