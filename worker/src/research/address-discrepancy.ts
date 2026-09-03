// worker/src/research/address-discrepancy.ts — what the operator typed versus where the parcel is.
//
// ── WHY THIS IS NOT AN INTAKE CHECK ─────────────────────────────────────────────────────────────
//
// The plan asked for a warning when the city and ZIP disagree, prompted by the 2026-09-03 run: the
// operator entered "11780 FM 2484, Belton, TX 76513" and the parcel is at "11780 FM2484, Salado, TX
// 76571".
//
// Checked before building. **Belton is a Bell County city. 76513 is a Bell County ZIP.** The pair
// is internally consistent, geographically sensible, and would have passed every check that could
// be written against the data available at intake. It is simply not this property's address.
//
// Nothing typed into a form can be validated into correctness here. Only a source that knows where
// the parcel actually is can tell you — and two of those became available in the same session:
// Google geocoding (B1) and the parcel polygon's own centroid (B2).
//
// ── WHY IT MATTERS ENOUGH TO REPORT ─────────────────────────────────────────────────────────────
//
// A city that disagrees is one of two things, and they need opposite responses:
//
//   · The operator typed the wrong address, and the run is about the wrong property. Everything
//     downstream — the deeds, the boundary, the report — is then about somebody else's land, and
//     the run would say none of that.
//   · The address is right and the county records use a different city. Rural Texas addresses near
//     a town line routinely carry one town's mailing address and another's situs, which is
//     completely normal and worth nothing more than a note.
//
// This cannot tell them apart, and does not try. It reports the difference and says both readings
// are possible, because a system that guessed would eventually guess wrong on somebody's boundary
// survey. The ZIP is the stronger signal — a different ZIP is a different postal area, where a
// different city name is often just naming convention.

export interface AddressDiscrepancyInput {
  /** What the operator typed. */
  enteredCity?: string | null;
  enteredZip?: string | null;
  enteredStreet?: string | null;
  /** What a location source resolved. */
  resolvedCity?: string | null;
  resolvedZip?: string | null;
  resolvedAddress?: string | null;
  /** Which source resolved it, for the sentence: 'Google' | 'the parcel record' | ... */
  source: string;
}

export type DiscrepancyLevel = 'none' | 'note' | 'warn';

export interface AddressDiscrepancy {
  level: DiscrepancyLevel;
  /** Empty when `none`. */
  message: string;
  /** The specific fields that differ, for a UI that wants to highlight them. */
  fields: Array<'city' | 'zip'>;
}

const norm = (v: string | null | undefined): string =>
  (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Five digits, ignoring any +4. `76513-5438` and `76513` are the same postal area. */
const zip5 = (v: string | null | undefined): string => {
  const m = (v ?? '').match(/\d{5}/);
  return m ? m[0] : '';
};

/**
 * Compare what was typed against what a location source resolved.
 *
 * Only reports on fields the operator actually supplied — an operator who left the city blank has
 * not disagreed with anything, and telling them "the city differs" when they entered none would be
 * noise that trains people to ignore the real ones.
 */
export function compareAddress(input: AddressDiscrepancyInput): AddressDiscrepancy {
  const fields: Array<'city' | 'zip'> = [];

  const enteredCity = norm(input.enteredCity);
  const resolvedCity = norm(input.resolvedCity);
  const cityDiffers = Boolean(enteredCity && resolvedCity && enteredCity !== resolvedCity);

  const enteredZip = zip5(input.enteredZip);
  const resolvedZip = zip5(input.resolvedZip);
  const zipDiffers = Boolean(enteredZip && resolvedZip && enteredZip !== resolvedZip);

  if (cityDiffers) fields.push('city');
  if (zipDiffers) fields.push('zip');

  if (fields.length === 0) return { level: 'none', message: '', fields };

  const entered = [input.enteredCity, input.enteredZip].filter(Boolean).join(' ');
  const resolved = [input.resolvedCity, input.resolvedZip].filter(Boolean).join(' ');

  // A different ZIP is a different postal area — a materially different place. A different city
  // name at the SAME ZIP is usually naming convention, and rural Texas does it constantly.
  const level: DiscrepancyLevel = zipDiffers ? 'warn' : 'note';

  const head = zipDiffers
    ? `The property may not be where the address says.`
    : `${input.source} names a different city for this address.`;

  return {
    level,
    fields,
    message:
      `${head} You entered ${entered || '(nothing)'}; ${input.source} places ` +
      `${input.resolvedAddress ? `"${input.resolvedAddress}"` : 'this parcel'} in ${resolved}. ` +
      (zipDiffers
        ? `A different ZIP is a different postal area, so this is either a typo in the address — in ` +
          `which case this run is about the wrong property — or the county records simply use a ` +
          `different town, which is common for rural addresses near a town line. Worth checking ` +
          `before relying on the report.`
        : `Rural addresses near a town line routinely carry one town's mailing address and ` +
          `another's situs. Probably nothing, recorded so it is not a surprise later.`),
  };
}

/** The short form for a run log line. Null when there is nothing to say. */
export function discrepancyLogLine(d: AddressDiscrepancy): string | null {
  if (d.level === 'none') return null;
  return d.level === 'warn' ? `⚠ ${d.message}` : d.message;
}
