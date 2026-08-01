// lib/leads/attribution.ts — where a lead came from, captured at the click and carried to the row.
//
// G1-1/G1-2 of docs/planning/in-progress/GOOGLE_INTEGRATION_2026-07-31.md.
//
// ── THE ONE THING THIS MODULE EXISTS TO GET RIGHT ────────────────────────────────────────────────────
//
// **Capture on the FIRST page of the session; read at submit.** The obvious implementation — read
// `window.location.search` when the form is submitted — records nothing for exactly the journeys that
// matter most, because almost nobody converts on the page they landed on. A visitor clicks an ad, lands on
// `/services?gclid=…`, reads for two minutes, clicks through to `/contact`, and submits from a URL with no
// parameters at all. The naive version attributes that booking to nothing and the ad looks worthless.
//
// So the identifiers are stored the moment they are seen and re-read later from storage. First write wins
// within a session: if someone arrives from an ad and then wanders in again from an organic search before
// converting, the AD is what paid for them.
//
// ── WHY NOT A COOKIE ────────────────────────────────────────────────────────────────────────────────
//
// This uses `localStorage`, deliberately. A cookie is sent on every request to every route including image
// and API calls, which is pure overhead for something only the form reads; and a first-party cookie set by
// client JS is capped at 7 days by Safari's ITP, which would silently lose the majority of a 90-day window
// on iPhones. `localStorage` is read only where it is needed and is not subject to that cap.
//
// The trade is that it is per-device and per-browser, which is fine: so is a click.
//
// ── PURE, AND TESTABLE WITHOUT A BROWSER ────────────────────────────────────────────────────────────
//
// `parseAttribution` and `mergeAttribution` take plain values and return plain values, so the rules above
// are unit-testable with no DOM. Only `captureAttribution` / `readAttribution` touch storage, and they are
// thin. That split is what stops the "first write wins" rule quietly changing when the storage does.

/** Everything we record about where a visitor came from. Every field optional — most leads have none. */
export interface Attribution {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  landing_page?: string;
  referrer?: string;
  /** ISO timestamp of when these identifiers were first seen. */
  first_seen_at?: string;
}

export const ATTRIBUTION_KEY = 'starr.attribution.v1';

/** How long a captured click stays valid. Google's own click lookback for conversion import is 90 days,
 *  so keeping ours longer would only ever produce uploads Google rejects. */
export const ATTRIBUTION_TTL_DAYS = 90;

/** The three Google click identifiers, in the order they are preferred when uploading a conversion.
 *  `gclid` first because it is the most precise; the braids exist for journeys where it is absent. */
export const CLICK_ID_FIELDS = ['gclid', 'gbraid', 'wbraid'] as const;

const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

/** Trim, drop empties, and cap length. The cap is not paranoia: these values land in TEXT columns and are
 *  echoed into an admin table, and a query string is attacker-controlled input on a public page. */
function clean(v: string | null | undefined, max = 512): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

/**
 * Read attribution out of a URL's query string plus the page context.
 *
 * Takes the search string rather than reading `location`, so it is testable and so a server-side caller
 * (a route handler that sees the referring URL) can use the identical rules.
 */
export function parseAttribution(
  search: string,
  ctx: { landingPage?: string; referrer?: string; now?: string } = {},
): Attribution {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const out: Attribution = {};

  for (const key of CLICK_ID_FIELDS) {
    const v = clean(params.get(key), 256);
    if (v) out[key] = v;
  }
  for (const key of UTM_FIELDS) {
    const v = clean(params.get(key), 256);
    if (v) out[key] = v;
  }

  // Nothing identifying at all → return empty rather than a record of a visit we cannot attribute. An
  // empty object is what lets `mergeAttribution` leave an earlier ad click alone when someone returns
  // organically, and it keeps `hasAttribution` honest.
  if (Object.keys(out).length === 0) return {};

  const landing = clean(ctx.landingPage, 1024);
  if (landing) out.landing_page = landing;
  const ref = clean(ctx.referrer, 1024);
  if (ref) out.referrer = ref;
  out.first_seen_at = ctx.now ?? new Date().toISOString();
  return out;
}

/** Is there anything here worth storing or sending? */
export function hasAttribution(a: Attribution | null | undefined): boolean {
  if (!a) return false;
  return CLICK_ID_FIELDS.some((k) => a[k]) || UTM_FIELDS.some((k) => a[k]);
}

/** The click identifier to send with a conversion, and which kind it is. Null when there is none —
 *  a lead with only UTMs is real and reportable, it just cannot be uploaded as a click conversion. */
export function clickIdOf(a: Attribution | null | undefined): { field: (typeof CLICK_ID_FIELDS)[number]; value: string } | null {
  if (!a) return null;
  for (const field of CLICK_ID_FIELDS) {
    const value = a[field];
    if (value) return { field, value };
  }
  return null;
}

/**
 * FIRST WRITE WINS, and this is the rule the whole module turns on.
 *
 * If a stored attribution already carries a click identifier, a later visit does not overwrite it. Someone
 * who arrives from an ad, leaves, and comes back via an organic search two days later was still BOUGHT by
 * the ad — last-touch would credit the free visit and make the campaign look worse than it is.
 *
 * A later visit DOES win when the stored record has no click identifier (only UTMs, or nothing): a real ad
 * click is better information than the organic visit it replaces.
 */
export function mergeAttribution(stored: Attribution | null, incoming: Attribution): Attribution {
  if (!hasAttribution(incoming)) return stored ?? {};
  if (!hasAttribution(stored)) return incoming;
  if (clickIdOf(stored)) return stored as Attribution;
  return clickIdOf(incoming) ? incoming : (stored as Attribution);
}

/** Has this stored record aged out of Google's lookback window? */
export function isExpired(a: Attribution | null | undefined, now = Date.now()): boolean {
  if (!a?.first_seen_at) return false;
  const seen = Date.parse(a.first_seen_at);
  if (Number.isNaN(seen)) return true; // unparseable is not "fresh"
  return now - seen > ATTRIBUTION_TTL_DAYS * 24 * 60 * 60 * 1000;
}

// ── browser side ────────────────────────────────────────────────────────────────────────────────────
// Everything below touches storage and is deliberately thin, so the rules above stay the testable part.

function readRaw(): Attribution | null {
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // Private mode, storage disabled, or corrupt JSON. Attribution is a nice-to-have; a customer must
    // always be able to submit the form, so every failure here is silent by design.
    return null;
  }
}

/** Call once per page load. Captures anything in the URL, merged with what is already stored. */
export function captureAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = readRaw();
    const fresh = isExpired(stored) ? null : stored;
    const incoming = parseAttribution(window.location.search, {
      landingPage: window.location.pathname + window.location.search,
      referrer: document.referrer || undefined,
    });
    const merged = mergeAttribution(fresh, incoming);
    if (!hasAttribution(merged)) return null;
    if (merged !== fresh) window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return null;
  }
}

/** What the form should send. Null when there is nothing — the form then posts no attribution fields at
 *  all, rather than a set of empty strings that would land in the row as "" instead of NULL. */
export function readAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  const stored = readRaw();
  if (!stored || isExpired(stored) || !hasAttribution(stored)) return null;
  return stored;
}

/** Flatten to the form-field names the intake route reads. Kept beside the parser so the two cannot
 *  drift — a renamed field that is not renamed here fails silently, which is the worst kind. */
export function attributionFormFields(a: Attribution | null): Record<string, string> {
  if (!a) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}
