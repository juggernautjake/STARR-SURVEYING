// lib/research/portal-watch.ts — is a county about to move its records portal? §I3.3
//
// The self-heal sweep already answers "did an adapter break?" — it probes, compares a DOM fingerprint
// against a canary, and classifies. That is a LAGGING signal by construction: something has to break
// before it can say so, and by then a research run has failed and somebody is reading a stack trace.
//
// Counties announce these migrations. "Bell County Clerk will transition to a new records search
// system effective October 1" sits on a .gov page for weeks before the old URL stops answering. This
// is the LEADING half: the same question, asked earlier, so an adapter update can be planned instead
// of triaged.
//
// ── THIS FILE IS A PROFILE, NOT AN ALGORITHM ────────────────────────────────────────────────────
//
// The classification lives in `announcement-watch.ts` and is shared with the regulatory watch
// (§I3.5), because both are the same machine pointed at different subjects: has an authority
// announced a change that will break something we depend on. What is genuinely specific to counties
// is only what you see below — the four queries, the migration vocabulary, and the fact that the
// records-portal VENDORS match every query perfectly while announcing nothing.
//
// The false-positive reasoning that motivates all of it is in that file's header. Short version:
// searching "<county> clerk records portal new system" always returns something, and a watcher that
// promotes vendor brochures gets muted inside a fortnight — which is worse than no watcher at all.

import {
  buildWatchReport as buildReport,
  classifyAnnouncement,
  isSellerPage,
  runWatch,
  type ClassifyOptions,
  type WatchHit,
  type WatchProfile,
  type WatchQuery,
  type WatchReport,
  type WatchRun,
} from '@/lib/research/announcement-watch';
import type { OpenWebResult, TavilySearchOptions } from '@/lib/research/open-web';

export {
  describeWatchReport,
  latestYear,
  type ClassifyOptions,
  type WatchVerdict,
  type WatchStatus,
} from '@/lib/research/announcement-watch';

/** Kept as this module's own names so callers read in county terms. */
export type PortalWatchHit = WatchHit;
export type PortalWatchReport = WatchReport;
export type PortalWatchQuery = WatchQuery;
export type PortalWatchRun = WatchRun;

export interface PortalWatchTarget {
  /** "Bell" — not "Bell County"; the suffix is added where it belongs. */
  county: string;
  state?: string;
  /** The vendor currently serving this county, when known. Lets the watch ask the sharper question:
   *  not "is something changing" but "is this county leaving Kofile". */
  currentVendor?: string;
}

/** Words that mean something is CHANGING. Deliberately excludes the everyday vocabulary of a records
 *  portal — "search", "online", "records", "index" — which matches every portal every day. */
const MIGRATION_WORDS = [
  'transition', 'transitioning', 'migrating', 'migration', 'new system', 'new portal',
  'new website', 'replacing', 'will replace', 'upgrade to', 'upgrading to', 'go-live',
  'go live', 'effective', 'no longer be available', 'discontinued', 'decommission',
  'switching to', 'moved to', 'has moved', 'now available at', 'beginning',
] as const;

/** The vendors selling records portals in Texas. Their own pages name counties, use every migration
 *  word, and mean nothing — the single most common false positive available here. */
const VENDOR_HOSTS = ['kofile', 'tylertech', 'tyler', 'idocket', 'henschen', 'fidlar', 'avenu', 'govos', 'granicus'] as const;

/** Build the profile for one county. `namesSubject` tolerates "Bell" and "Bell County" because the
 *  target is stored one way and the page says the other; an exact match would reject nearly every
 *  genuine hit. */
export function portalWatchProfile(county: string): WatchProfile {
  const bare = county.toLowerCase().replace(/\s+county$/, '');
  return {
    label: county.replace(/\s+county$/i, ''),
    logPrefix: '[portal-watch]',
    namesSubject: (lower) => lower.includes(bare),
    changeWords: MIGRATION_WORDS,
    changeLabel: 'migration',
    sellerHosts: VENDOR_HOSTS,
    // Portal migrations go stale fast: a 2023 notice describes a portal that has already moved.
    staleAfterYears: 2,
  };
}

/** Backwards-compatible name — the sellers here are the portal vendors. */
export function isVendorPage(url: string): boolean {
  return isSellerPage(url, VENDOR_HOSTS);
}

/** The first sentence carrying a migration word. */
export function migrationExcerpt(text: string): string | null {
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (MIGRATION_WORDS.some((w) => s.toLowerCase().includes(w))) return s.trim().slice(0, 300);
  }
  return null;
}

/**
 * Build the searches for one county.
 *
 * Three angles, because a migration surfaces in three registers: the county says it, the local paper
 * says it, and the commissioners' court minutes say it first.
 */
export function buildPortalWatchQueries(target: PortalWatchTarget): PortalWatchQuery[] {
  const county = `${target.county} County`;
  const state = target.state ?? 'Texas';

  const queries: PortalWatchQuery[] = [
    {
      query: `"${county}" ${state} clerk official records search new system transition`,
      rationale: 'The county announcing it itself — usually a banner on the clerk\'s own page.',
    },
    {
      query: `"${county}" ${state} county clerk records portal upgrade effective date`,
      rationale: 'Announcements almost always carry a go-live date; the date is what makes it actionable.',
    },
    {
      query: `"${county}" ${state} commissioners court agenda clerk records software contract`,
      rationale: 'The contract is approved in open court months before anything visibly changes.',
    },
  ];

  if (target.currentVendor) {
    queries.push({
      query: `"${county}" ${state} clerk records replacing ${target.currentVendor}`,
      rationale: `Named the incumbent (${target.currentVendor}) so a switch AWAY from it surfaces directly.`,
    });
  }

  return queries;
}

/** Rate one result against a county's profile. */
export function classifyWatchResult(
  result: Pick<OpenWebResult, 'url' | 'title' | 'content' | 'score' | 'authority'>,
  county: string,
  opts: ClassifyOptions = {},
): PortalWatchHit {
  return classifyAnnouncement(result, portalWatchProfile(county), opts);
}

/** Rank results for one county and summarise. */
export function buildWatchReport(
  county: string,
  results: ReadonlyArray<Pick<OpenWebResult, 'url' | 'title' | 'content' | 'score' | 'authority'>>,
  opts: ClassifyOptions = {},
): PortalWatchReport {
  return buildReport(county, results, portalWatchProfile(county), opts);
}

/** Watch one county end to end. */
export async function runPortalWatch(
  target: PortalWatchTarget,
  opts: TavilySearchOptions & ClassifyOptions = {},
): Promise<PortalWatchRun> {
  return runWatch(target.county, buildPortalWatchQueries(target), portalWatchProfile(target.county), opts);
}
