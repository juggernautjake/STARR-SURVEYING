// lib/research/run-readiness.ts — is there enough here to find ONE parcel?
//
// ── WHAT THE GATE USED TO BE ────────────────────────────────────────────────────────────────────
//
//     const hasInputs = Boolean(project.property_address || project.parcel_id) || documents.length > 0;
//
// Any non-empty address string passed. "CEDAR CREEK" passed. So did "TX". A run would start, spend
// twenty-five minutes and real money, and come back with either nothing or — far worse — a confident
// report about a parcel that is not the one you meant.
//
// That second outcome is the one that matters. This codebase already refuses to guess a county from
// a city for exactly this reason: "a wrong county routes to the wrong clerk and returns a confident
// report about somebody else's land". A road name with no number is the same hazard one level down.
// Cedar Creek Road runs for miles and touches dozens of parcels; the CAD search returns a list, the
// pipeline scores it, and something wins. Being sure and wrong is the failure mode to design against.
//
// ── THE RULE ────────────────────────────────────────────────────────────────────────────────────
//
// COUNTY IS ALWAYS REQUIRED. It is the routing key — it chooses the appraisal district and the clerk
// portal. Without it there is no website to search, which is why the API has always returned 400 for
// a missing county. That part was already right.
//
// Given a county, a run also needs at least ONE thing that can narrow it to a single parcel:
//
//   Property ID                  exact. One parcel, no ambiguity. The strongest input there is.
//   Instrument number            a specific recorded document, which names the property in its own
//                                legal description.
//   Street number + street name  within one county a numbered address is effectively unique.
//   Street name + city           a named road inside one town, rather than across a whole county.
//   Street name + owner name     the road narrows it, the owner picks the parcel off it.
//   Uploaded documents           a deed or survey carries the legal description; the AI reads it.
//
// And these are deliberately NOT enough on their own:
//
//   Street name alone            a county road runs for miles past dozens of parcels.
//   Owner name alone             "SMITH, JOHN" owns a lot of things. The CAD owner search returns a
//                                list and something would win it.
//   City / ZIP / unit            not a parcel identifier in any sense.
//
// ── WHY THIS REFUSES RATHER THAN WARNS ──────────────────────────────────────────────────────────
//
// A warning that can be clicked through is a warning that gets clicked through, and the cost here is
// not a wasted click: it is a paid run, a report an operator may act on, and a boundary opinion about
// land that belongs to someone else. The cheap moment to catch it is before the button.

export interface RunReadinessInput {
  county?: string | null;
  state?: string | null;
  parcelId?: string | null;
  instrumentNumber?: string | null;
  streetNumber?: string | null;
  streetName?: string | null;
  city?: string | null;
  zip?: string | null;
  ownerName?: string | null;
  /** Files already attached to the project. A deed carries its own legal description. */
  documentCount?: number;
}

/** How well the supplied inputs pin down a single parcel. */
export type RunConfidence =
  /** One parcel, unambiguously. */
  | 'exact'
  /** Very likely one parcel; the search may still have to choose between near matches. */
  | 'strong'
  /** Enough to run, but the search may return several candidates. */
  | 'workable';

export interface RunReadiness {
  canRun: boolean;
  /** Only meaningful when `canRun`. */
  confidence: RunConfidence | null;
  /** Plain-language list of what the operator actually supplied. */
  have: string[];
  /** One sentence stating the verdict. */
  headline: string;
  /** Concrete things to add, best first. Empty when the run can go ahead. */
  whatWouldWork: string[];
  /** Said even when the run CAN go ahead, when the inputs are thin enough to be worth a word. */
  caution: string | null;
}

const has = (v: string | null | undefined): boolean => Boolean((v ?? '').trim());

/**
 * Can this project start a run, and if not, what exactly is missing?
 *
 * Pure and shared: the button, the create form and the API all call this, so a run refused by the
 * server can never be one the button offered. Two implementations of "is this enough" is how a
 * disabled button and a 400 come to disagree.
 */
export function assessRunReadiness(input: RunReadinessInput): RunReadiness {
  const county = has(input.county);
  const parcel = has(input.parcelId);
  const instrument = has(input.instrumentNumber);
  const streetNo = has(input.streetNumber);
  const street = has(input.streetName);
  const city = has(input.city);
  const zip = has(input.zip);
  const owner = has(input.ownerName);
  const docs = (input.documentCount ?? 0) > 0;

  // What they gave us, named back to them. The operator's own words are the fastest way for them to
  // spot that a value went into the wrong box.
  const have: string[] = [];
  if (county) have.push(`county (${input.county!.trim()})`);
  if (parcel) have.push(`Property ID (${input.parcelId!.trim()})`);
  if (instrument) have.push(`instrument number (${input.instrumentNumber!.trim()})`);
  if (streetNo && street) have.push(`street address (${input.streetNumber!.trim()} ${input.streetName!.trim()})`);
  else if (street) have.push(`street name (${input.streetName!.trim()}) with no number`);
  else if (streetNo) have.push(`street number (${input.streetNumber!.trim()}) with no street name`);
  if (city) have.push(`city (${input.city!.trim()})`);
  if (zip) have.push(`ZIP (${input.zip!.trim()})`);
  if (owner) have.push(`owner name (${input.ownerName!.trim()})`);
  if (docs) have.push(`${input.documentCount} uploaded document${input.documentCount === 1 ? '' : 's'}`);
  if (have.length === 0) have.push('nothing yet');

  // ── County first, because nothing else can compensate for it ────────────────────────────────
  if (!county) {
    return {
      canRun: false,
      confidence: null,
      have,
      headline: 'A county is required before any research can run.',
      whatWouldWork: [
        'Add the county the property is in. It decides which appraisal district and county clerk ' +
        'are searched, so there is no site to look at without it — and it is deliberately not ' +
        'guessed from the city, because a wrong county returns a confident report about land in ' +
        'the wrong place.',
      ],
      caution: null,
    };
  }

  // ── Then: does anything narrow it to one parcel? ────────────────────────────────────────────
  if (parcel) {
    return {
      canRun: true, confidence: 'exact', have,
      headline: 'Ready to run. The Property ID identifies one parcel exactly.',
      whatWouldWork: [],
      caution: null,
    };
  }

  if (instrument) {
    return {
      canRun: true, confidence: 'strong', have,
      headline: 'Ready to run. The deed search starts from the instrument number you supplied.',
      whatWouldWork: [],
      caution: street || owner ? null
        : 'Only the instrument number identifies the property, so everything depends on that ' +
          'document being the right one. A street name or owner name would let the run cross-check it.',
    };
  }

  if (streetNo && street) {
    const pinned = city || zip;
    return {
      canRun: true,
      confidence: pinned ? 'strong' : 'workable',
      have,
      headline: pinned
        ? 'Ready to run. A numbered address inside a named town is enough to find the parcel.'
        : 'Ready to run. A numbered address within one county is usually enough.',
      whatWouldWork: [],
      caution: pinned ? null
        : 'No city, so if this county has the same street name in more than one town the search may ' +
          'return several candidates. Adding the city removes that.',
    };
  }

  if (street && (city || owner)) {
    return {
      canRun: true, confidence: 'workable', have,
      headline: city
        ? 'Ready to run, though a road can run past many parcels — the city narrows it.'
        : 'Ready to run. The owner name is what will pick this parcel off the road.',
      whatWouldWork: [],
      caution:
        'There is no street number, so the search identifies the road and then has to choose among ' +
        'the parcels on it. A street number or a Property ID would make this exact.',
    };
  }

  // ── Documents alone are NOT enough, and the button must say so ─────────────────────────────
  //
  // This returned canRun=true, 'workable', "Ready to run from your uploaded documents." The
  // worker's front door refuses a request with no address, no Property ID and no instrument
  // number, and nothing in the product reads a legal description out of an upload BEFORE the run
  // starts — so the button was offering a run the server always refused. Found by the
  // 2026-09-03 platform audit (api-routes C1). The documents still count for everything after
  // the parcel is found; they just cannot find it.
  if (docs) {
    return {
      canRun: false, confidence: null, have,
      headline: 'Not enough to run: uploaded documents cannot identify the parcel on their own.',
      whatWouldWork: [
        'Add the street address, or the Property ID from the appraisal district, or the instrument ' +
        'number of the deed. Any one of them lets the run find the parcel; the documents you ' +
        'attached are then read alongside everything it retrieves.',
      ],
      caution: null,
    };
  }

  // ── Not enough. Say precisely what would fix it, best option first ──────────────────────────
  const whatWouldWork: string[] = [];

  if (street && !streetNo) {
    whatWouldWork.push(
      `Add the street number. "${input.streetName!.trim()}" on its own can run for miles past ` +
      `dozens of parcels, and the search would have to guess which one you mean.`,
    );
    whatWouldWork.push('Or add the city, which narrows the road to one town.');
    whatWouldWork.push('Or add the owner name as the appraisal district records it, which picks the parcel off the road.');
  } else if (owner && !street) {
    whatWouldWork.push(
      `Add a street name — with or without a number. An owner name alone returns every parcel ` +
      `"${input.ownerName!.trim()}" holds in ${input.county!.trim()} County, and the run would ` +
      `pick one of them.`,
    );
  } else if (streetNo && !street) {
    whatWouldWork.push('Add the street name. A number with no road cannot be looked up.');
  } else {
    whatWouldWork.push('Add a street number and street name.');
  }

  whatWouldWork.push(
    'Or add the Property ID from the county appraisal district site — that is the strongest option, ' +
    'because it names one parcel and nothing else.',
  );
  whatWouldWork.push('Or add an instrument number if you already have the deed.');
  whatWouldWork.push('Or attach a deed, plat or prior survey, and the run can read the legal description from it.');

  return {
    canRun: false,
    confidence: null,
    have,
    headline:
      `Not enough yet to identify a single parcel in ${input.county!.trim()} County — a run started ` +
      `now would either find nothing or find the wrong property.`,
    whatWouldWork,
    caution: null,
  };
}

/**
 * The whole verdict as one block of text, for an API error body and for a title attribute.
 *
 * Kept here rather than built at each call site so the operator reads the same words whether they
 * hover the disabled button or get the refusal back from the server.
 */
export function describeRunReadiness(r: RunReadiness): string {
  const lines = [r.headline, '', `You have supplied: ${r.have.join(', ')}.`];
  if (r.whatWouldWork.length > 0) {
    lines.push('', 'To start a run, do any one of these:');
    for (const w of r.whatWouldWork) lines.push(`  • ${w}`);
  }
  if (r.caution) lines.push('', `Worth knowing: ${r.caution}`);
  return lines.join('\n');
}
