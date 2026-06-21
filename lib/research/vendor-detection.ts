// lib/research/vendor-detection.ts
//
// §8.2 of docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md
// — vendor auto-detection. The leverage point that makes
// no-code county onboarding work: a surveyor pastes a portal URL,
// we look it up against the seeded `url_fingerprints` on
// research_data_vendors, and if it matches we pre-fill the
// adapter's `config` + `field_map` from the vendor template.
// Registering Bell County's publicsearch.us clerk site is then a
// config row, not a code change.
//
// Pure — no DB, no network. Caller fetches the vendor rows from
// `research_data_vendors` (seeded in slice 2) and passes them in.

import type { CanonicalSource } from './canonical-schema';

/** One fingerprint rule on a vendor template. Matches the JSONB
 *  shape seeded in slice 2 (`url_fingerprints`):
 *
 *    [{"type":"host_re","re":"^.+\\.publicsearch\\.us$"}]
 *
 *  Two types are recognized today:
 *    - `host_re` — regex against the URL's host (case-insensitive)
 *    - `path_re` — regex against the URL's pathname
 */
export type UrlFingerprint =
  | { type: 'host_re'; re: string }
  | { type: 'path_re'; re: string };

/** Subset of `research_data_vendors` the matcher needs. Caller can
 *  pass full rows from the DB; we only read these fields. */
export interface VendorTemplate {
  vendor_key: string;
  display_name: string;
  url_fingerprints: UrlFingerprint[];
  /** Higher = preferred when multiple templates match. Defaults to
   *  the count of matched fingerprints (a vendor that matches host
   *  AND path beats one that matches host only). */
  priority?: number;
}

export interface VendorMatch {
  vendor_key: string;
  display_name: string;
  /** Score 0..N where N = number of fingerprints that matched. */
  score: number;
  matched: Array<{ type: UrlFingerprint['type']; re: string }>;
}

export interface DetectionResult {
  /** The strongest match — null when nothing matched. */
  best: VendorMatch | null;
  /** Every vendor template that matched at least one fingerprint,
   *  ranked best-first. The §8 wizard can show a "we think it's
   *  Tyler publicsearch.us, but it could also be a generic
   *  Playwright adapter — pick one" disambiguation when this list
   *  has more than one entry. */
  matches: VendorMatch[];
}

/** Pure. Match the URL against every vendor's fingerprints. Returns
 *  the strongest match + the full ranked list. */
export function detectVendor(
  url: string,
  vendors: readonly VendorTemplate[],
): DetectionResult {
  const parsed = safeParseUrl(url);
  if (!parsed) return { best: null, matches: [] };

  const host = parsed.host.toLowerCase();
  const pathname = parsed.pathname;

  const matches: VendorMatch[] = [];
  for (const v of vendors) {
    if (!Array.isArray(v.url_fingerprints) || v.url_fingerprints.length === 0) continue;
    const matched: VendorMatch['matched'] = [];
    for (const fp of v.url_fingerprints) {
      if (!fp || typeof fp !== 'object') continue;
      let re: RegExp;
      try {
        re = new RegExp(fp.re, 'i');
      } catch {
        // A malformed fingerprint regex shouldn't poison the whole
        // detection; skip it.
        continue;
      }
      if (fp.type === 'host_re' && re.test(host)) {
        matched.push({ type: 'host_re', re: fp.re });
      } else if (fp.type === 'path_re' && re.test(pathname)) {
        matched.push({ type: 'path_re', re: fp.re });
      }
    }
    if (matched.length > 0) {
      matches.push({
        vendor_key: v.vendor_key,
        display_name: v.display_name,
        score: matched.length + (v.priority ?? 0),
        matched,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return { best: matches[0] ?? null, matches };
}

/** Pure. Convenience: returns the matched vendor_key as a
 *  CanonicalSource (the union from canonical-schema.ts) when it
 *  belongs to the canonical set, or `null`. The §8.5 save path
 *  uses this to stamp `research_site_adapters.field_map.vendor_key`
 *  with a typed value. */
export function vendorKeyAsCanonical(key: string): CanonicalSource | null {
  // Listed explicitly so a future vendor that's NOT yet a
  // CanonicalSource doesn't silently slip into the typed pipeline.
  const known: ReadonlyArray<CanonicalSource> = [
    'bell_cad_arcgis',
    'trueautomation_propaccess',
    'esearch_cad',
    'publicsearch_clerk',
    'tyler_publicsearch',
    'bis_arcgis',
    'kofile',
    'txglo',
    'fema',
    'generic_playwright',
    'manual_entry',
    'ai_extraction',
  ];
  return (known as readonly string[]).includes(key) ? (key as CanonicalSource) : null;
}

// ── Internals ────────────────────────────────────────────────────

function safeParseUrl(raw: string): URL | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  // Accept bare hosts like "propaccess.trueautomation.com" — prefix
  // a scheme so the URL constructor will parse them.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}
