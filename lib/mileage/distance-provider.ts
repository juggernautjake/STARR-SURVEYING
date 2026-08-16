// lib/mileage/distance-provider.ts — address → address driving distance, behind one adapter.
//
// C0b1 of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// > **Owner, 2026-08-15:** *"put in the starting address and the job address and the distance will
// > be calculated"*
//
// ── THE GATE IS NARROWER THAN THE LEDGER RECORDED, AND IT WAS TESTABLE ──────────────────────────
//
// C0b1 was parked as "owner-gated: needs a maps API key and billing enabled", and the planning
// table said flatly: *"Nothing. No geocoding, no distance-matrix, no maps provider anywhere."*
//
// Probing the project on 2026-08-16 says otherwise, and the difference matters because one version
// is a spending decision and the other is a two-minute console change:
//
//   * the legacy Distance Matrix API is **off** — `REQUEST_DENIED`, "You're calling a legacy API",
//     with Google itself pointing at the Routes API instead;
//   * the **Routes API is enabled and billed** — a request to `directions/v2:computeRoutes` gets
//     past every enablement and billing check and fails at
//     `API_KEY_HTTP_REFERRER_BLOCKED`.
//
// A referrer block is not a billing problem. It means the only key in the environment
// (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) is a **browser** key restricted to HTTP referrers, and this
// call is server-side, where there is no referrer to send. What is actually needed is a key without
// a referrer restriction — `GOOGLE_MAPS_SERVER_KEY` below.
//
// So the adapter is built and wired. It reports "not configured" until that key exists, and starts
// working the moment it does, without a code change.
//
// ── WHY THE RESULT TYPE HAS FOUR OUTCOMES AND NOT TWO ───────────────────────────────────────────
//
// C44e's headline finding in this very document is that *a webhook that is not configured returns
// `ok: true`*. That is the trap this file is most likely to fall into, because the three failure
// modes look identical from the call site and mean completely different things to the person
// standing in front of the form:
//
//   NOT_CONFIGURED — nobody has set a key. The surveyor should type the distance and move on; there
//                    is nothing they can do about it and no reason to retry.
//   NO_ROUTE       — the provider answered, and there is no driving route between these addresses.
//                    Usually a typo in an address, and re-reading it is exactly the right move.
//   PROVIDER_ERROR — the provider failed. Retrying is reasonable.
//   ok             — a real distance.
//
// Collapsing those into `null` would make "we never asked" indistinguishable from "we asked and the
// answer is no", which is the distinction C0d spent a whole slice restoring to the job manifest.

export type DistanceLookup =
  | { ok: true; miles: number; resolvedOrigin: string; resolvedDestination: string; provider: string }
  | { ok: false; reason: 'NOT_CONFIGURED'; detail: string }
  | { ok: false; reason: 'NO_ROUTE'; detail: string }
  | { ok: false; reason: 'PROVIDER_ERROR'; detail: string };

const METERS_PER_MILE = 1609.344;

/**
 * The server-side key.
 *
 * Deliberately NOT `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. That one is a browser key restricted by HTTP
 * referrer, so a server call with no referrer is rejected — and falling back to it would turn a
 * clear "not configured" into a confusing `PERMISSION_DENIED` on every single lookup. A key meant
 * for the browser is also a key that ships to every visitor, and using it for a billed server API
 * would put the firm's quota behind a value anyone can read out of the page source.
 */
function serverKey(): string | null {
  const raw = process.env.GOOGLE_MAPS_SERVER_KEY;
  const key = raw?.trim().replace(/^["']|["']$/g, '');
  return key ? key : null;
}

/** True when a lookup can actually be attempted. The form asks this to decide whether to show the
 *  button at all, so an unconfigured install shows a typed-distance field and no dead control. */
export function isDistanceLookupConfigured(): boolean {
  return serverKey() !== null;
}

/**
 * Driving distance between two addresses, in miles.
 *
 * One adapter, one provider today. The signature is the seam: swapping Google for Mapbox or an
 * internal service is a change to this file and to nothing that calls it — which is the whole of
 * what C0b1 asks for ("so the provider can change without touching the form").
 */
export async function lookupDrivingDistance(
  origin: string,
  destination: string,
  opts: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<DistanceLookup> {
  const from = origin.trim();
  const to = destination.trim();
  if (!from || !to) {
    // Not a provider error — the caller has not supplied the question yet. Reported as NO_ROUTE
    // with a specific sentence rather than thrown, so the form can render it the same way it
    // renders every other refusal.
    return { ok: false, reason: 'NO_ROUTE', detail: 'Enter both a starting address and a destination.' };
  }

  const key = serverKey();
  if (!key) {
    return {
      ok: false,
      reason: 'NOT_CONFIGURED',
      // The message names the variable, because the person who reads it is the person who can set
      // it. "Distance lookup unavailable" would send them looking for a bug.
      detail: 'Set GOOGLE_MAPS_SERVER_KEY to enable the address lookup. Until then, type the distance.',
    };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        // Routes bills by the fields requested, so asking for only the distance is a cost decision
        // as well as a correctness one.
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { address: from },
        destination: { address: to },
        travelMode: 'DRIVE',
        units: 'IMPERIAL',
      }),
      signal: opts.signal,
    });
  } catch (e) {
    return {
      ok: false,
      reason: 'PROVIDER_ERROR',
      detail: e instanceof Error ? e.message : 'The distance service could not be reached.',
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // A referrer-blocked key is a CONFIGURATION fault wearing a permission error's clothes, and it
    // is the exact state this project is in today. Reporting it as PROVIDER_ERROR would send
    // somebody looking for an outage; naming it tells them which key to replace.
    if (/API_KEY_HTTP_REFERRER_BLOCKED|referer/i.test(body)) {
      return {
        ok: false,
        reason: 'NOT_CONFIGURED',
        detail: 'The configured maps key is a browser key restricted by HTTP referrer, so it cannot be used server-side. GOOGLE_MAPS_SERVER_KEY needs a key with no referrer restriction.',
      };
    }
    if (/not enabled|legacy API|SERVICE_DISABLED/i.test(body)) {
      return {
        ok: false,
        reason: 'NOT_CONFIGURED',
        detail: 'The Routes API is not enabled for this Google Cloud project.',
      };
    }
    return { ok: false, reason: 'PROVIDER_ERROR', detail: `Distance service returned HTTP ${res.status}.` };
  }

  let json: { routes?: Array<{ distanceMeters?: number }> };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { ok: false, reason: 'PROVIDER_ERROR', detail: 'The distance service returned a response that could not be read.' };
  }

  const meters = json.routes?.[0]?.distanceMeters;
  // Routes returns HTTP 200 with an EMPTY `routes` array when there is no drivable route — the
  // shape that makes "no answer" look like a successful call. Two addresses on different continents
  // land here, and so does a mistyped street.
  if (typeof meters !== 'number' || !Number.isFinite(meters)) {
    return {
      ok: false,
      reason: 'NO_ROUTE',
      detail: 'No driving route was found between those addresses — check them for a typo.',
    };
  }
  // A zero-metre route is a real answer to a silly question (the same address twice) and is allowed
  // through: a 0-mile trip is a legal entry, and refusing it would be the tool arguing with a
  // surveyor who knows what they meant.

  return {
    ok: true,
    miles: Math.round((meters / METERS_PER_MILE) * 100) / 100,
    resolvedOrigin: from,
    resolvedDestination: to,
    provider: 'google-routes',
  };
}
