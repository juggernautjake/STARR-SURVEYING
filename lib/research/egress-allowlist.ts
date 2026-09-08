// lib/research/egress-allowlist.ts — which hosts the app will fetch on the worker's behalf.
//
// ── WHY THE APP FETCHES ANYTHING FOR THE WORKER ──────────────────────────────────────────────────
//
// The research worker lives on a netcup server in a German datacentre. Bell County's clerk publishes
// every subdivision plat as a free PDF on bellcountytx.com — and that site answers HTTP 403 to the
// worker's address for every URL, with any User-Agent, and to Browserbase's datacentre addresses
// alike (a residential Browserbase session would get through, but the account's free plan has no
// proxies: "402 Proxies are not included in the free plan"). The same URLs answer 200 from the office
// and from Vercel. So the app, on a US address, fetches one URL at a time for the worker.
//
// The list is a strict allowlist: this is an open fetch on a public function, and only the hosts a
// research run has a reason to reach are on it. Everything else is refused before any request.

export interface EgressRule {
  host: RegExp;
  /** When set, the URL's path must match too (a shared CMS host carries other tenants). */
  path?: RegExp;
}

export const EGRESS_ALLOWLIST: readonly EgressRule[] = [
  // Bell County Clerk — plat index pages + PDFs (the site redirects PDFs to the CMS host below).
  { host: /^(www\.)?bellcountytx\.com$/i },
  // Revize CMS, Bell County's tenant only.
  { host: /^cms3\.revize\.com$/i, path: /^\/revize\/bellcountytx\// },
];

/** True when the URL is https and its host (and path, where the rule says) is on the list. */
export function egressAllowed(url: string, rules: readonly EgressRule[] = EGRESS_ALLOWLIST): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  return rules.some((r) => r.host.test(u.hostname) && (!r.path || r.path.test(u.pathname)));
}

/** The largest body the relay will pass back. A plat PDF is 1–3 MB; the Vercel response cap is 4.5 MB
 *  of JSON, and base64 costs a third, so 3 MB of bytes is the honest ceiling. */
export const EGRESS_MAX_BYTES = 3 * 1024 * 1024;
