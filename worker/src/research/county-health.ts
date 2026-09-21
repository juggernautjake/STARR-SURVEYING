/**
 * Is this county's research actually working?
 *
 * Owner, 2026-09-21: "we need to be able to run health checks on individual counties and also all
 * counties at once … There should be a health check every time a property is searched in a county
 * for that county, and if there is an issue that comes up, then it needs to be flagged and
 * recorded so that we can work on fixing it if possible."
 *
 * ── WHY THE RUN IS THE HEALTH CHECK ─────────────────────────────────────────────────────────────
 *
 * There is already a `SiteHealthMonitor` that opens a browser every thirty minutes and checks that
 * selectors still exist. It is useful and it is not this. A synthetic probe answers "did the page
 * load"; it cannot answer "did a real address find a real parcel", and that second question is the
 * one that was silently false for Williamson for months.
 *
 * Every research run already touches every site this county has. It searches the appraisal
 * district with a real address, the clerk with a real name, the open-data portal with a real id. So
 * the run IS the probe, and a run that finishes has already gathered better evidence than any
 * synthetic check could — for free, against live queries, with the operator watching.
 *
 * What was missing is that the evidence evaporated. A run said "Cannot reach esearch.wilcotx.gov"
 * and the next run said it again, and the fiftieth run said it again, and nobody aggregated fifty
 * identical failures into "this endpoint has never once worked".
 *
 * ── WHAT IS RECORDED ────────────────────────────────────────────────────────────────────────────
 *
 * One observation per SITE ROLE per run: appraisal, clerk, parcel data, plats, and so on — the
 * roles a `CountyProfile` already declares. Each carries the verdict from `site-rejection.ts`, so
 * "we were refused" and "the property has no documents" never collapse into one number.
 *
 * That distinction is the whole value. A county whose clerk returns zero rows for every search is
 * either a quiet county or a broken integration, and only the verdict tells them apart.
 */

import type { RejectionVerdict } from './site-rejection.js';
import type { SiteRole } from '../counties/profile.js';

export type HealthState =
  /** Answered, and gave us something. */
  | 'working'
  /** Answered, but gave us nothing — which may be correct. */
  | 'empty'
  /** Refused US: block, wall, bad host, dead tunnel. Always a defect. */
  | 'refused'
  /** The site is broken or slow. Not our fault, not our fix. */
  | 'site_down'
  /** Configured but never attempted on this run. */
  | 'not_tried';

export interface SiteObservation {
  county: string;
  role: SiteRole;
  /** The host actually contacted, so a config change is visible in the history. */
  host: string | null;
  state: HealthState;
  /** Rows, documents, parcels — whatever this site was asked for. */
  found: number;
  latencyMs: number | null;
  /** The verdict, when something went wrong. */
  verdict: RejectionVerdict | null;
  /** What a person should do, when there is something to do. */
  remedy: string | null;
  at: string;
}

/**
 * Turn what a stage saw into an observation.
 *
 * `found` and the verdict together decide the state, and the order matters: a refusal outranks a
 * count, because a blocked request that happens to return a cached row is still a blocked request.
 */
export function observe(input: {
  county: string;
  role: SiteRole;
  host?: string | null;
  found?: number;
  latencyMs?: number | null;
  verdict?: RejectionVerdict | null;
  attempted?: boolean;
}): SiteObservation {
  const verdict = input.verdict ?? null;
  const found = input.found ?? 0;

  let state: HealthState;
  if (input.attempted === false) {
    state = 'not_tried';
  } else if (verdict && verdict.kind !== 'ok') {
    // `aboutUs` is the split the whole module turns on: a refusal of US is a defect we own, a site
    // being down is weather.
    state = verdict.aboutUs ? 'refused' : 'site_down';
  } else if (found > 0) {
    state = 'working';
  } else {
    state = 'empty';
  }

  return {
    county: input.county,
    role: input.role,
    host: input.host ?? null,
    state,
    found,
    latencyMs: input.latencyMs ?? null,
    verdict,
    remedy: verdict?.remedy ?? null,
    at: new Date().toISOString(),
  };
}

/** Host out of a URL, for the record. Never throws on a malformed one. */
export function hostOf(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  try {
    return new URL(u).host;
  } catch {
    return null;
  }
}

// ── ONE COUNTY ──────────────────────────────────────────────────────────────────────────────────

export type CountyHealth = 'healthy' | 'degraded' | 'broken' | 'unknown';

export interface CountyHealthReport {
  county: string;
  health: CountyHealth;
  observations: SiteObservation[];
  /** Roles that are refusing us — the actionable list. */
  broken: SiteObservation[];
  /** One line a person can read. */
  statement: string;
  /** Everything a person could do about it, deduplicated. */
  remedies: string[];
}

/**
 * How is this county doing?
 *
 * ── THE APPRAISAL ROLE IS LOAD-BEARING AND THE OTHERS ARE NOT ──
 *
 * A run that cannot identify the parcel has failed at step one and everything after it is guesswork
 * — so an appraisal failure is `broken` on its own. A clerk or plat failure is `degraded`: the run
 * still knows what the property is, it just knows less about its history.
 *
 * `empty` is deliberately not a failure anywhere. A county clerk with no documents for a name is
 * making a statement about the property, and treating that as ill health would make every quiet
 * parcel look like an outage.
 */
export function summariseCounty(county: string, observations: readonly SiteObservation[]): CountyHealthReport {
  const obs = observations.filter((o) => o.county.toLowerCase() === county.toLowerCase());
  const broken = obs.filter((o) => o.state === 'refused');
  const down = obs.filter((o) => o.state === 'site_down');
  const working = obs.filter((o) => o.state === 'working');

  let health: CountyHealth;
  if (obs.length === 0) {
    health = 'unknown';
  } else if (broken.some((o) => o.role === 'appraisal')) {
    health = 'broken';
  } else if (broken.length > 0 || down.length > 0) {
    health = 'degraded';
  } else if (working.length > 0) {
    health = 'healthy';
  } else {
    // Everything answered and everything was empty. Not a fault, and not a clean bill either.
    health = 'unknown';
  }

  const parts: string[] = [];
  if (working.length) parts.push(`${working.length} source(s) answered with data`);
  if (broken.length) parts.push(`${broken.length} REFUSED us (${broken.map((o) => o.role).join(', ')})`);
  if (down.length) parts.push(`${down.length} site(s) were down or slow`);
  const emptyCount = obs.filter((o) => o.state === 'empty').length;
  if (emptyCount) parts.push(`${emptyCount} answered with nothing, which may be correct`);

  return {
    county,
    health,
    observations: obs,
    broken,
    statement: obs.length === 0
      ? `${county}: nothing has been observed yet.`
      : `${county} is ${health.toUpperCase()} — ${parts.join('; ')}.`,
    remedies: [...new Set(
      [...broken, ...down].map((o) => o.remedy).filter((r): r is string => Boolean(r)),
    )],
  };
}

// ── EVERY COUNTY ────────────────────────────────────────────────────────────────────────────────

export interface FleetHealthReport {
  checkedAt: string;
  counties: CountyHealthReport[];
  broken: CountyHealthReport[];
  degraded: CountyHealthReport[];
  healthy: CountyHealthReport[];
  statement: string;
}

/**
 * Every county that has been observed, worst first.
 *
 * Sorted by severity rather than alphabetically because this is read when something is wrong, and a
 * broken county buried between Bastrop and Bosque is a broken county nobody sees.
 */
export function summariseFleet(observations: readonly SiteObservation[]): FleetHealthReport {
  const counties = [...new Set(observations.map((o) => o.county))]
    .map((c) => summariseCounty(c, observations));

  const rank: Record<CountyHealth, number> = { broken: 0, degraded: 1, unknown: 2, healthy: 3 };
  counties.sort((a, b) => rank[a.health] - rank[b.health] || a.county.localeCompare(b.county));

  const broken = counties.filter((c) => c.health === 'broken');
  const degraded = counties.filter((c) => c.health === 'degraded');
  const healthy = counties.filter((c) => c.health === 'healthy');

  const statement = counties.length === 0
    ? 'No county has been observed yet.'
    : `${counties.length} county/counties observed: ${broken.length} broken, ${degraded.length} degraded, ` +
      `${healthy.length} healthy.` +
      (broken.length ? ` Broken: ${broken.map((c) => c.county).join(', ')}.` : '');

  return { checkedAt: new Date().toISOString(), counties, broken, degraded, healthy, statement };
}

// ── WHAT GOES IN THE RUN LOG ────────────────────────────────────────────────────────────────────

/**
 * The lines a run prints about its own county's health.
 *
 * Printed at the END of a run rather than the start, because that is when the evidence exists. A
 * health line before the run is a memory of last time.
 */
export function healthLines(report: CountyHealthReport): string[] {
  const out: string[] = [report.statement];

  for (const o of report.broken) {
    out.push(
      `  ✗ ${o.role}${o.host ? ` (${o.host})` : ''} — ${o.verdict?.message ?? 'refused us'}` +
      (o.remedy ? ` → ${o.remedy}` : ''),
    );
  }
  for (const o of report.observations.filter((x) => x.state === 'site_down')) {
    out.push(`  ~ ${o.role}${o.host ? ` (${o.host})` : ''} — ${o.verdict?.message ?? 'the site did not answer'}`);
  }

  if (report.health === 'healthy') {
    out.push('  Every source this county has was reached and answered.');
  }
  return out;
}

/**
 * Does this observation deserve a flag somebody has to clear?
 *
 * Only a refusal. A site being down fixes itself; an empty result is a finding; a refusal is a
 * defect in our own configuration or egress and will still be there tomorrow unless somebody acts.
 */
export function needsAttention(o: SiteObservation): boolean {
  return o.state === 'refused';
}
