// lib/maps/static-map-status.ts — why a map image did not arrive.
//
// ── THE SILENCE THIS REPLACES ───────────────────────────────────────────────────────────────────
//
// Three services fetch imagery from the Maps Static API, and all three did the same thing with a
// failure:
//
//     if (!res.ok) return null;
//
// The body — the only part of the response that says WHICH failure — was never read. So a research
// run that produced no aerial photo could not tell anybody whether the API was switched off, the
// key was wrong, the billing account had lapsed, or the coordinates were out of bounds. All four
// arrive as `null`.
//
// This is the same fix, and the same reasoning, as `places-status.ts`: Google reports every outcome
// through one channel, and a caller that collapses them re-creates the ambiguity the API was at
// least honest about.
//
// ── THE TWO 403s THAT MEAN OPPOSITE THINGS ──────────────────────────────────────────────────────
//
// Measured against the live key on 2026-08-30, hours apart, and this is why the body matters:
//
//   "This API is not activated on your API project."          → nobody enabled it. Owner action.
//   "This API key is not authorized to use this service."     → enabled, but the key's API
//                                                                restriction list excludes it.
//   "API keys with referer restrictions cannot be used with this API."
//                                                             → the key is a BROWSER key and this
//                                                                call is server-side. No amount of
//                                                                enabling fixes it.
//
// Identical status code, three different people to talk to. The first two flipped from one to the
// other during a single session as APIs were enabled, which is exactly how a stale diagnosis
// outlives the problem it described.
//
// ── WHY THE REFERER CASE IS CALLED OUT SPECIFICALLY ─────────────────────────────────────────────
//
// Every server-side caller resolves its key as:
//
//     process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
//
// That reads as a sensible fallback and is a trap. When the server key is unset — which it is in
// production — the fallback substitutes the PUBLIC, referer-restricted browser key, which cannot
// authenticate a server-to-server request no matter which APIs are enabled. The failure then looks
// like a Google problem rather than a missing environment variable, so the message names the
// variable.

export type StaticMapFailureKind =
  /** The API is not switched on for the project. Someone must enable it in Cloud Console. */
  | 'not-enabled'
  /** Enabled, but this key's API-restriction list does not include it. */
  | 'key-not-authorized'
  /** A browser (referer-restricted) key used for a server-side call. Needs a separate server key. */
  | 'referer-restricted-key'
  /** No key reached the request at all. */
  | 'no-key'
  /** Billing is not enabled or has lapsed. */
  | 'billing'
  /** Rate limited or over quota — real, and self-resolving. */
  | 'quota'
  /** Google failed in a way it did not name, or the request was malformed. */
  | 'broken';

export interface StaticMapFailure {
  kind: StaticMapFailureKind;
  /** One line for the operator log. Says who has to do something, not just what happened. */
  message: string;
  /** True when a human must change configuration; false when retrying could work. */
  needsAction: boolean;
}

/**
 * Classify a failed Maps Static API response.
 *
 * Takes the status and the raw body text rather than a Response so it can be tested without a
 * network stub — the interesting behaviour is a mapping from Google's prose to an instruction.
 */
export function classifyStaticMapFailure(
  status: number,
  body: string | null | undefined,
): StaticMapFailure {
  const text = (body ?? '').toLowerCase();

  // Order matters. The referer message is also a 403 mentioning keys, so it must be tested before
  // the more general "not authorized" match or it would be reported as a restriction-list problem
  // and send somebody to the wrong screen.
  if (text.includes('referer restrictions')) {
    return {
      kind: 'referer-restricted-key',
      needsAction: true,
      message:
        'Maps Static refused a referer-restricted key. This is a SERVER-side call, so it cannot use '
        + 'the public browser key. Set GOOGLE_MAPS_API_KEY to a key with no referer restriction '
        + '(IP-restricted, or unrestricted and kept server-side) — enabling more APIs will not fix this.',
    };
  }

  if (text.includes('not activated')) {
    return {
      kind: 'not-enabled',
      needsAction: true,
      message:
        'Maps Static API is not activated on the Google Cloud project. Enable "Maps Static API" in '
        + 'the Cloud Console API library. The research pipeline already depends on it.',
    };
  }

  if (text.includes('not authorized')) {
    return {
      kind: 'key-not-authorized',
      needsAction: true,
      message:
        'The Maps key is not authorized for Maps Static. The API is enabled but this key\'s API '
        + 'restriction list excludes it — add it under Credentials → the key → API restrictions.',
    };
  }

  if (text.includes('billing')) {
    return {
      kind: 'billing',
      needsAction: true,
      message: 'Google rejected the request for billing reasons. Check the billing account on the Maps project.',
    };
  }

  if (status === 429 || text.includes('over_query_limit') || text.includes('quota')) {
    return {
      kind: 'quota',
      needsAction: false,
      message: 'Maps Static is rate-limited or over quota. This is temporary; the run may retry later.',
    };
  }

  return {
    kind: 'broken',
    needsAction: false,
    message: `Maps Static returned HTTP ${status} without naming a cause`
      + (body ? `: ${body.slice(0, 200)}` : ' (empty body)'),
  };
}

/** The message for the case where no key was resolved at all — no request is worth sending. */
export const NO_MAPS_KEY_MESSAGE =
  'No Google Maps key configured: set GOOGLE_MAPS_API_KEY (server-side). '
  + 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is a browser key and is referer-restricted, so it cannot '
  + 'authenticate this request even when it is present.';
