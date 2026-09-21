/**
 * Finding a county's sites, the way they were found by hand.
 *
 * Owner, 2026-09-21: "all of that functionality built into our system … all of the individual
 * county profiles with all of their endpoints and resources."
 *
 * ── WHAT THIS AUTOMATES ─────────────────────────────────────────────────────────────────────────
 *
 * Curating Williamson took a session of: guessing hostnames, checking whether they resolve, opening
 * the ones that do, recognising the software, and writing down what was found. Three of those four
 * steps are mechanical. This is those three.
 *
 * The step that is NOT mechanical is reading a search form and working out that its name field is a
 * chip list whose term is the selected entry rather than the typed text. That stays a person's job,
 * and a discovery report says so rather than pretending otherwise.
 *
 * ── THE FAILURE THIS EXISTS TO PREVENT ──────────────────────────────────────────────────────────
 *
 * `esearch.wilcotx.gov` was in the configuration for months and has never existed. One DNS lookup
 * would have caught it. Nobody ran one, because "is the configured host real" was not a question
 * anything asked — the run asked "did the search work", got no, and blamed the county.
 *
 * So `probeHost` is the cheapest and most important function here, and a discovery run starts with
 * the hosts we already claim rather than with the ones we hope exist.
 */

import { fingerprint, vendorMismatch, type Fingerprint } from './vendor-fingerprint.js';
import { readHttpResponse, readTransportError, type RejectionVerdict } from './site-rejection.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';

export interface HostProbe {
  url: string;
  host: string;
  /** False means the name does not resolve — a configuration error, not an outage. */
  resolves: boolean;
  status: number | null;
  latencyMs: number | null;
  fingerprint: Fingerprint | null;
  verdict: RejectionVerdict | null;
  title: string | null;
}

/** A URL's host, or null when it is not a URL at all. */
export function hostOf(url: string): string | null {
  try { return new URL(url).host; } catch { return null; }
}

/**
 * Open one candidate and say what is there.
 *
 * Deliberately a plain fetch rather than a browser. Most of what discovery needs — does this
 * resolve, does it answer, what software is it — is visible in the first response, and a browser
 * per candidate would make a twenty-candidate sweep take minutes instead of seconds. A candidate
 * that looks promising and renders its content in JavaScript is flagged for a person to open.
 */
export async function probeHost(
  url: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch; expectVendor?: string | null } = {},
): Promise<HostProbe> {
  const host = hostOf(url) ?? url;
  const started = Date.now();

  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });

    const latencyMs = Date.now() - started;
    const body = await res.text().catch(() => '');
    const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(body)?.[1]?.trim() ?? null;

    const headers: Record<string, string> = {};
    res.headers?.forEach?.((v, k) => { headers[k] = v; });

    const verdict = readHttpResponse(res.status, body, headers);
    const fp = fingerprint({ url, body, title, headers });

    return {
      url, host, resolves: true, status: res.status, latencyMs,
      fingerprint: fp,
      verdict: verdict.kind === 'ok' ? null : verdict,
      title,
    };
  } catch (e) {
    const verdict = readTransportError(e);
    return {
      url, host,
      // The distinction that matters. A name that does not resolve is ours to fix; everything else
      // is the network's or the site's.
      resolves: verdict.kind !== 'no_such_host',
      status: null,
      latencyMs: Date.now() - started,
      fingerprint: null,
      verdict,
      title: null,
    };
  }
  // `expectVendor` is compared by the caller via `vendorMismatch`, not here, so a probe stays a
  // statement of fact and the judgement lives one level up.
}

// ── CANDIDATE GENERATION ────────────────────────────────────────────────────────────────────────

/**
 * Hostnames a Texas county's appraisal district plausibly uses.
 *
 * Built from the patterns actually observed across the counties already in this repository, in
 * rough order of how often they are right:
 *
 *   esearch.<county>cad.org        BIS, the commonest by far
 *   www.<county>cad.org            the district's own site
 *   search.<abbrev>.org            True Automation — Williamson is `search.wcad.org`
 *   propaccess.<abbrev>.org        True Automation's other front door
 *   <county>ad.org / <county>.org  smaller districts
 *
 * `abbrev` matters: Williamson's district is WCAD, Travis's is TCAD, Bell's is Bell CAD. A slug
 * built only from the full county name would never have found `search.wcad.org`, which is exactly
 * how the fictional `esearch.wilcotx.gov` survived.
 */
export function appraisalCandidates(county: string): string[] {
  const c = county.trim().toLowerCase().replace(/\s+county$/, '').replace(/[^a-z]/g, '');
  if (!c) return [];

  // WCAD, TCAD, BCAD… the first letter plus "cad" is the near-universal abbreviation.
  const abbrev = `${c[0]}cad`;

  const hosts = [
    `esearch.${c}cad.org`,
    `search.${c}cad.org`,
    `www.${c}cad.org`,
    `${c}cad.org`,
    `search.${abbrev}.org`,
    `propaccess.${abbrev}.org`,
    `www.${abbrev}.org`,
    `${abbrev}.org`,
    `esearch.${c}-cad.org`,
    `www.${c}ad.org`,
  ];
  return [...new Set(hosts)].map((h) => `https://${h}/`);
}

/** Clerk portals, by the vendors that actually serve Texas counties. */
export function clerkCandidates(county: string): string[] {
  const c = county.trim().toLowerCase().replace(/\s+county$/, '').replace(/[^a-z]/g, '');
  if (!c) return [];
  return [
    `https://${c}.tx.publicsearch.us/`,
    `https://${c}countytx-web.tylerhost.net/${c}web/`,
    `https://www.texasfile.com/search/texas/${c}-county/county-clerk-records/`,
  ];
}

/** Open-data portals. Cheap to check and occasionally the richest source a county has. */
export function dataCandidates(county: string): string[] {
  const c = county.trim().toLowerCase().replace(/\s+county$/, '').replace(/[^a-z]/g, '');
  if (!c) return [];
  const abbrev = `${c[0]}cad`;
  return [
    `https://data.${abbrev}.org/api/catalog/v1?limit=1`,
    `https://data.${c}cad.org/api/catalog/v1?limit=1`,
    `https://data.${c}countytx.gov/api/catalog/v1?limit=1`,
  ];
}

// ── A DISCOVERY RUN ─────────────────────────────────────────────────────────────────────────────

export interface DiscoveryFinding {
  role: 'appraisal' | 'clerk' | 'data' | 'declared';
  probe: HostProbe;
  /** Set when a declared host disagrees with what is actually there. */
  mismatch: string | null;
}

export interface DiscoveryReport {
  county: string;
  checkedAt: string;
  findings: DiscoveryFinding[];
  /** Hosts that answered and fingerprinted — the useful output. */
  found: DiscoveryFinding[];
  /** Configured hosts that do not resolve. The actionable defects. */
  dead: DiscoveryFinding[];
  statement: string;
  /** What a person still has to do by hand. */
  nextSteps: string[];
}

export interface DiscoveryOptions {
  /** Hosts the profile already claims, checked FIRST — the cheapest possible bug-finder. */
  declared?: Array<{ url: string; expectVendor?: string | null }>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Cap the sweep. Candidate lists are speculative and each one costs a request. */
  maxCandidates?: number;
}

/**
 * Sweep a county.
 *
 * Declared hosts first, then candidates. The order is the point: verifying what we already claim is
 * both cheaper and more valuable than guessing at new hosts, because a declared host that does not
 * resolve is a live bug and a candidate that does not resolve is just a candidate.
 */
export async function discoverCounty(
  county: string,
  opts: DiscoveryOptions = {},
): Promise<DiscoveryReport> {
  const findings: DiscoveryFinding[] = [];
  const fetchImpl = opts.fetchImpl;
  const timeoutMs = opts.timeoutMs;

  // 1 · What we already claim.
  for (const d of opts.declared ?? []) {
    const probe = await probeHost(d.url, { fetchImpl, timeoutMs, expectVendor: d.expectVendor });
    const mm = probe.fingerprint ? vendorMismatch(d.expectVendor, probe.fingerprint) : null;
    findings.push({ role: 'declared', probe, mismatch: mm?.message ?? null });
  }

  // 2 · Candidates, capped.
  const cap = opts.maxCandidates ?? 12;
  const plan: Array<{ role: DiscoveryFinding['role']; urls: string[] }> = [
    { role: 'appraisal', urls: appraisalCandidates(county) },
    { role: 'clerk', urls: clerkCandidates(county) },
    { role: 'data', urls: dataCandidates(county) },
  ];

  let spent = 0;
  for (const { role, urls } of plan) {
    for (const url of urls) {
      if (spent >= cap) break;
      // Do not re-probe something already declared.
      if (findings.some((f) => f.probe.url === url)) continue;
      spent += 1;
      const probe = await probeHost(url, { fetchImpl, timeoutMs });
      findings.push({ role, probe, mismatch: null });
    }
  }

  const found = findings.filter((f) =>
    f.probe.resolves && f.probe.status !== null && f.probe.status < 400 &&
    (f.probe.fingerprint?.confidence ?? 0) >= 0.4);
  const dead = findings.filter((f) => f.role === 'declared' && !f.probe.resolves);
  const mismatched = findings.filter((f) => f.mismatch);

  const nextSteps: string[] = [];
  for (const d of dead) {
    nextSteps.push(`REMOVE or fix ${d.probe.host} — it does not resolve, and no proxy can reach a host that does not exist.`);
  }
  for (const m of mismatched) {
    nextSteps.push(`${m.probe.host}: ${m.mismatch}`);
  }
  for (const f of found) {
    if (f.role === 'declared') continue;
    nextSteps.push(
      `Drive ${f.probe.host} by hand (${f.probe.fingerprint!.vendor}) and record its search form. ` +
      'A fingerprint says what the software is; it cannot say which field is a chip list.',
    );
  }

  const statement = [
    `${county}: probed ${findings.length} host(s).`,
    found.length ? `${found.length} answered and were identified.` : 'Nothing was identified.',
    dead.length ? `${dead.length} CONFIGURED host(s) do not resolve.` : '',
    mismatched.length ? `${mismatched.length} vendor mismatch(es).` : '',
  ].filter(Boolean).join(' ');

  return { county, checkedAt: new Date().toISOString(), findings, found, dead, statement, nextSteps };
}
