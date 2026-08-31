// lib/maps/server-key.ts — the maps key a SERVER may use, and the one it may not.
//
// ── THE FALLBACK THAT LOOKS SENSIBLE AND IS A TRAP ──────────────────────────────────────────────
//
// Three research services resolved their key like this:
//
//     process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
//
// It reads as a courtesy — use the server key, fall back to the one we know exists. What it
// actually does, when the server key is unset, is substitute a **browser** key that is restricted
// by HTTP referrer. A server-to-server request sends no referrer, so Google refuses it with
// `REQUEST_DENIED` and the message "API keys with referer restrictions cannot be used with this
// API" — no matter how many APIs are enabled on the project.
//
// The fallback therefore converts a clear, fixable "not configured" into a confusing permission
// error that looks like a Google problem. It also puts a billed server API behind a key that ships
// to every visitor in the page source.
//
// ── THIS IS NOT A NEW OPINION — IT IS THE ONE THE REPO ALREADY HELD ─────────────────────────────
//
// `lib/mileage/distance-provider.ts` and `lib/receipts/vendor-verify.ts` both read
// `GOOGLE_MAPS_SERVER_KEY` then `GOOGLE_MAPS_API_KEY`, and both deliberately exclude the public
// key, with the reasoning written out. The research services were the outliers. This module is
// that same convention in one place so the next server-side caller inherits it instead of copying
// the fallback from whichever file it happened to read.
//
// ── A CORRECTION THE MEASUREMENT FORCED ─────────────────────────────────────────────────────────
//
// `distance-provider.ts` recorded on 2026-08-17 that `GOOGLE_MAPS_API_KEY` "is already used
// server-side by boundary-fetch, parcel-map-capture, progressive-zoom and the lot correlator.
// Those call Static Maps and geocoding from the server AND WORK, so that key is not referrer-locked."
//
// That last clause is an inference, and it is false. Measured 2026-08-30: Static Maps returns 403,
// and 22 stored aerial/topo images in production are broken. The services do not work — nobody had
// looked, because a failed map image was a silent `return null`. "It works, therefore the config is
// fine" is the same reasoning that let a warning about a key nothing reads survive three weeks.

/**
 * Variable names accepted for a server-side maps key, in priority order.
 *
 * Two names because two parts of this codebase named the same idea differently and an audit found
 * the key already existed under the second one. Both are honoured rather than picking a winner and
 * silently breaking whichever installs use the other.
 */
export const SERVER_MAPS_KEY_VARS = ['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY'] as const;

export interface ServerMapsKey {
  /** The key, or null when none is configured. */
  key: string | null;
  /** Which variable supplied it. */
  source: (typeof SERVER_MAPS_KEY_VARS)[number] | null;
}

/**
 * Resolve the key a server-side Google Maps call may use.
 *
 * Never returns `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Its absence is the point: a caller that gets
 * `null` can say "not configured" and name the variable, which is a fixable sentence. A caller
 * handed a browser key can only report Google's refusal, which is not.
 */
// Typed as a plain record rather than NodeJS.ProcessEnv: this project declares NODE_ENV as
// required on ProcessEnv, so every test fixture would need a cast to satisfy it — and a cast in
// a test is a place a real type error can hide.
export function resolveServerMapsKey(
  env: Record<string, string | undefined> = process.env,
): ServerMapsKey {
  for (const name of SERVER_MAPS_KEY_VARS) {
    // Quotes stripped because `.env` files routinely carry them and a quoted key fails with the
    // same opaque denial as a missing one.
    const key = env[name]?.trim().replace(/^["']|["']$/g, '');
    if (key) return { key, source: name };
  }
  return { key: null, source: null };
}

/**
 * The sentence to log when no server key is configured.
 *
 * Names the variables, because the person reading it is the person who can set them, and says
 * explicitly why the public key is not a substitute — otherwise the obvious next move is to paste
 * the browser key in and re-create the original bug under a new name.
 */
export const NO_SERVER_MAPS_KEY_MESSAGE =
  'No server-side Google Maps key: set GOOGLE_MAPS_SERVER_KEY (or GOOGLE_MAPS_API_KEY) to a key '
  + 'with NO referrer restriction. NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is deliberately not used here — '
  + 'it is referrer-restricted, so a server request with no referrer is refused whatever APIs are '
  + 'enabled, and it is public to every visitor.';
