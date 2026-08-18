// lib/receipts/vendor-verify.ts — is there really a Sonic at that address?
//
// Owner, 2026-08-18: *"We need to better capture the address of the location of the purchase, then
// we need to actually search that address and see what it says. If it is a sonic fast food receipt,
// then the address should correspond to a sonic restaurant."*
//
// ── WHY THIS CATCHES THINGS NOTHING ELSE CAN ────────────────────────────────────────────────────
//
// Every other check in the pipeline is internal: the passes are compared against each other, the
// arithmetic against itself. All of them share one blind spot — if the reader misreads the same
// thing the same way twice, the receipt looks perfectly consistent. Two passes reading "423 Line Oak
// St" agree with each other and are both wrong.
//
// A real-world lookup is the only check with an outside opinion. "423 Live Oak St, Marlin TX" either
// is a Sonic or it is not, and no amount of internal agreement can manufacture that answer.
//
// ── AND WHY IT IS NEVER ALLOWED TO OVERWRITE ANYTHING ───────────────────────────────────────────
//
// It reports; it does not correct. A receipt is a record of what the paper says, and a lookup that
// silently rewrote an address into the tidier one Google holds would destroy the evidence — the
// bookkeeper could no longer tell a corrected address from a transcribed one. Where it disagrees, it
// raises a discrepancy naming both, and a person decides.

import type { Discrepancy } from './deep-merge';

/** The subset of a Places result worth keeping. */
export interface PlaceMatch {
  name: string;
  formattedAddress: string;
  /** Google's own category, e.g. `fast_food_restaurant`. Useful for sanity-checking the category. */
  primaryType?: string | null;
  phone?: string | null;
  placeId?: string | null;
  /** 0..1, how well the receipt's vendor name matches this place's name. */
  nameSimilarity: number;
}

export interface VendorVerification {
  /** `skipped` when there is nothing to look up or no key — NOT a failure, and must not be shown as
   *  one. A missing API key is a deployment fact, not a problem with the receipt. */
  status: 'confirmed' | 'mismatch' | 'not_found' | 'skipped' | 'error';
  /** One sentence for the reviewer. */
  detail: string;
  match?: PlaceMatch | null;
  /** Everything the search returned, for the audit trail. */
  candidates?: PlaceMatch[];
  discrepancies: Discrepancy[];
}

// ── Name comparison (pure) ──────────────────────────────────────────────────────────────────────

/** Franchise receipts print names in ways their Google listing does not. Stripping the noise before
 *  comparing is what stops "SONIC DRIVE-IN #4055" from looking unlike "Sonic Drive-In". */
const NAME_NOISE = /\b(inc|llc|ltd|corp|co|company|store|#\s*\d+|no\.?\s*\d+|the)\b/gi;

export function normaliseVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[#][0-9]+/g, ' ')
    .replace(NAME_NOISE, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * 0..1 similarity between two business names, by token overlap.
 *
 * Token overlap rather than edit distance on purpose. The differences between a receipt header and a
 * Google listing are whole words — a dropped "Drive-In", an added store number, "&" against "and" —
 * and edit distance treats a missing word as many small changes, scoring a genuine match as poorly
 * as an unrelated business of similar length.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normaliseVendorName(a);
  const nb = normaliseVendorName(b);
  if (!na || !nb) return 0;

  const at = new Set(na.split(' ').filter(Boolean));
  const bt = new Set(nb.split(' ').filter(Boolean));
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared += 1;
  // Divided by the SMALLER set, so "Sonic" against "Sonic Drive In" scores 1 rather than 0.33. A
  // receipt header is routinely an abbreviation of the legal name, and penalising it for being short
  // would flag the clearest matches there are.
  const byToken = shared / Math.min(at.size, bt.size);

  // Brand names are not reliably one token. "WAL-MART" splits into `wal` and `mart`, and neither
  // matches `walmart`, so pure token overlap scores a household-name match at ZERO — which is worse
  // than useless, because it manufactures a mismatch warning on the clearest receipts there are.
  // Comparing the squashed forms as well costs nothing and rescues every hyphenated and spaced
  // brand. Caught by the WAL-MART case on the first run of these tests.
  const sa = na.replace(/ /g, '');
  const sb = nb.replace(/ /g, '');
  const bySquash = sa === sb || sa.includes(sb) || sb.includes(sa)
    ? 1
    : 0;

  return Math.max(byToken, bySquash);
}

/** Digits only, so `(254) 883-5545` and `254-883-5545` compare equal. US numbers are compared on
 *  their last ten digits, since a leading 1 is present on some receipts and not others. */
export function samePhone(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const d = (s: string) => s.replace(/\D/g, '').slice(-10);
  const da = d(a);
  const db = d(b);
  return da.length === 10 && da === db;
}

/** How well the receipt's address matches the one Google returned, 0..1, on token overlap. Street
 *  numbers and the town carry most of the signal; the suffix ("St" vs "Street") carries almost none,
 *  which is exactly what token overlap handles well. */
export function addressSimilarity(a: string, b: string): number {
  const norm = (s: string) => s
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|highway|hwy|suite|ste|unit)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const at = new Set(norm(a));
  const bt = new Set(norm(b));
  if (at.size === 0 || bt.size === 0) return 0;
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared += 1;
  return shared / Math.min(at.size, bt.size);
}

/** Confident enough to call it the same business. */
export const NAME_MATCH_THRESHOLD = 0.6;
/** Confident enough to call it the same place. */
export const ADDRESS_MATCH_THRESHOLD = 0.55;

// ── The verdict (pure, so it can be tested without the network) ─────────────────────────────────

export interface VerifyInput {
  vendorName?: string | null;
  vendorAddress?: string | null;
  vendorPhone?: string | null;
}

/**
 * Turn a set of candidates into a verdict.
 *
 * Split out from the fetch so the interesting half — what counts as a match, and what a mismatch
 * should say — is testable without a key, a network or a bill.
 */
export function judgeCandidates(input: VerifyInput, candidates: PlaceMatch[]): VendorVerification {
  const vendor = (input.vendorName ?? '').trim();
  if (candidates.length === 0) {
    return {
      status: 'not_found',
      detail:
        `No business called "${vendor}" was found at that address. That can mean the address was `
        + 'misread, or simply that the place is not listed — worth a look, not proof of anything.',
      candidates: [],
      discrepancies: [{
        code: 'vendor_not_found',
        field: 'vendor_address',
        severity: 'low',
        message:
          `Searching for "${vendor}"${input.vendorAddress ? ` at ${input.vendorAddress}` : ''} found no `
          + 'matching business. Check the address against the photo.',
      }],
    };
  }

  const best = candidates[0];
  const addressScore = input.vendorAddress
    ? addressSimilarity(input.vendorAddress, best.formattedAddress)
    : 0;

  // Recomputed here rather than read off the candidate.
  //
  // `PlaceMatch.nameSimilarity` is filled in by the fetch layer, and trusting it made this function
  // answer questions about a name it had never compared: a candidate carrying a stale similarity of
  // 1 was "confirmed" against a completely different vendor. A pure judge that depends on a number
  // somebody else computed is not pure, and the test that passed "Burger King" against a Sonic
  // candidate confirmed it on the first run.
  const nameScore = vendor ? nameSimilarity(vendor, best.name) : 0;
  const nameOk = nameScore >= NAME_MATCH_THRESHOLD;
  const addressOk = !input.vendorAddress || addressScore >= ADDRESS_MATCH_THRESHOLD;
  const phoneOk = samePhone(input.vendorPhone, best.phone);

  if (nameOk && (addressOk || phoneOk)) {
    return {
      status: 'confirmed',
      detail:
        `Confirmed: ${best.name}, ${best.formattedAddress}`
        + (phoneOk ? ' — the phone number on the receipt matches too.' : '.'),
      match: best,
      candidates,
      discrepancies: [],
    };
  }

  const discrepancies: Discrepancy[] = [];

  // The headline case the owner described: the name on the paper is not the business at that place.
  if (!nameOk) {
    discrepancies.push({
      code: 'vendor_name_mismatch',
      field: 'vendor_name',
      severity: 'medium',
      message:
        `The receipt says "${vendor}", but the business at that address is "${best.name}". Either the `
        + 'name was misread, or the address was.',
      readings: [
        { source: 'receipt', value: vendor },
        { source: 'looked up', value: `${best.name}, ${best.formattedAddress}` },
      ],
    });
  }

  if (input.vendorAddress && !addressOk) {
    discrepancies.push({
      code: 'vendor_address_mismatch',
      field: 'vendor_address',
      severity: 'medium',
      message:
        `The address read as "${input.vendorAddress}", but the nearest ${best.name} on record is at `
        + `"${best.formattedAddress}". Faded digits in a street number are the usual cause.`,
      readings: [
        { source: 'receipt', value: input.vendorAddress },
        { source: 'looked up', value: best.formattedAddress },
      ],
    });
  }

  return {
    status: 'mismatch',
    detail: `Closest match is ${best.name}, ${best.formattedAddress} — which does not line up with the receipt.`,
    match: best,
    candidates,
    discrepancies,
  };
}

// ── The network half ────────────────────────────────────────────────────────────────────────────

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

/** Same variable the mileage provider uses, and for the same reason: a server-side call needs a key
 *  with NO HTTP-referrer restriction. A browser key returns `API_KEY_HTTP_REFERRER_BLOCKED` here. */
function serverKey(): string | null {
  for (const v of ['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY'] as const) {
    const k = process.env[v];
    if (k && k.trim()) return k.trim();
  }
  return null;
}

/**
 * Look the vendor up, and say whether it exists where the receipt claims.
 *
 * Never throws. A lookup is a nice-to-have on top of a reading that already happened, and losing the
 * whole extraction because Places was slow would trade a large certainty for a small one.
 */
export async function verifyVendor(
  input: VerifyInput,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<VendorVerification> {
  const vendor = (input.vendorName ?? '').trim();
  const address = (input.vendorAddress ?? '').trim();

  if (!vendor && !address) {
    return { status: 'skipped', detail: 'No vendor name or address was read, so there was nothing to look up.', discrepancies: [] };
  }

  const key = serverKey();
  if (!key) {
    return {
      status: 'skipped',
      detail:
        'Address checking is off: GOOGLE_MAPS_SERVER_KEY is not set. It needs a key with no HTTP-referrer '
        + 'restriction — a browser key is rejected for server-side calls.',
      discrepancies: [],
    };
  }

  const query = [vendor, address].filter(Boolean).join(' ');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);

  try {
    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        // Field mask is REQUIRED by Places (New) and is also the billing lever — asking for fewer
        // fields is a cheaper SKU. These are the only ones this check reads.
        'X-Goog-FieldMask':
          'places.displayName,places.formattedAddress,places.primaryType,places.nationalPhoneNumber,places.id',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 4 }),
      signal: options.signal ?? controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Named precisely, because the two likely causes have different fixes and both look like "it
      // did not work" from here.
      const hint = /REFERRER/i.test(body)
        ? ' The configured key is restricted by HTTP referrer, so it cannot be used server-side.'
        : /SERVICE_BLOCKED|not enabled|PERMISSION_DENIED/i.test(body)
          ? ' The Places API is not enabled for this key — enable "Places API (New)" and allow it in the key\'s API restrictions.'
          : '';
      return {
        status: 'error',
        detail: `Address lookup failed (HTTP ${res.status}).${hint}`,
        discrepancies: [],
      };
    }

    const json = await res.json() as {
      places?: {
        displayName?: { text?: string };
        formattedAddress?: string;
        primaryType?: string;
        nationalPhoneNumber?: string;
        id?: string;
      }[];
    };

    const candidates: PlaceMatch[] = (json.places ?? []).map((p) => {
      const name = p.displayName?.text ?? '';
      return {
        name,
        formattedAddress: p.formattedAddress ?? '',
        primaryType: p.primaryType ?? null,
        phone: p.nationalPhoneNumber ?? null,
        placeId: p.id ?? null,
        nameSimilarity: vendor ? nameSimilarity(vendor, name) : 0,
      };
    });

    // Best name match first — Places orders by its own relevance, which weighs distance and
    // prominence, not whether the name is the one printed on this receipt.
    candidates.sort((a, b) => b.nameSimilarity - a.nameSimilarity);

    return judgeCandidates(input, candidates);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      detail: /abort/i.test(msg) ? 'Address lookup timed out.' : `Address lookup failed: ${msg}`,
      discrepancies: [],
    };
  } finally {
    clearTimeout(timer);
  }
}
