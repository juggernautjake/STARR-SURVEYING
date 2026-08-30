// lib/leads/market-watch.ts — who is about to need a survey, and who else is bidding? §I3.2
//
// The last of the five Tavily applications, and the only one aimed at winning work rather than at
// not being caught out.
//
// ── THE USEFUL HALF IS THE AGENDAS, NOT THE COMPETITORS ─────────────────────────────────────────
//
// The plan filed this as "competitor and market watch", which undersells it. A subdivision plat on a
// commissioners' court agenda, a rezoning up for approval, a site plan filed with a city — each of
// those is a project that needs a surveyor BEFORE it needs almost anything else, and each is
// published on a public agenda days or weeks ahead. That is a lead source, not a curiosity.
//
// Competitor naming is the second subject and genuinely is intelligence: which firms are being named
// in the counties we serve tells us where we are already losing without anyone filing a loss.
//
// ── THIS IS THE FOURTH CONSUMER OF announcement-watch ───────────────────────────────────────────
//
// County portal watch (§I3.3), regulatory watch (§I3.5), learning-content freshness (§I3.4), this.
// One classifier, four profiles. The core's whole justification was that these differ only in
// subject and vocabulary, and four consumers later that has held.
//
// ── THE GEOGRAPHY IS DERIVED, NOT COPIED ────────────────────────────────────────────────────────
//
// `SERVICE_AREA_COUNTIES` in `lib/seo/business.ts` is the one list of where this firm works — the
// same array `/service-area` renders and the same one the LocalBusiness JSON-LD publishes. A second
// copy here is the defect this repo has hit repeatedly: two lists that agree on the day they are
// written and drift silently afterwards. So the core counties below are NAMES FILTERED AGAINST that
// array, and a test fails if any of them stops being a county the firm serves.
//
// ── AND IT DELIBERATELY DOES NOT WATCH ALL 46 ───────────────────────────────────────────────────
//
// The service area is 46 counties inside a ~150-mile radius. Two queries each is 92 searches per
// sweep, which is real money to answer a question about places the firm rarely bids. The watch
// covers the counties adjacent to the Belton office, where the drive is short enough that a lead is
// a lead rather than a maybe.
//
// That cap is stated in `coveredCounties()` and reported by the route, because a watch that silently
// covers a quarter of the stated service area reads as "nothing is happening in Harris County" when
// it means "nobody looked".

import {
  runWatch,
  type ClassifyOptions,
  type WatchProfile,
  type WatchQuery,
  type WatchRun,
} from '@/lib/research/announcement-watch';
import type { TavilySearchOptions } from '@/lib/research/open-web';
import { SERVICE_AREA_COUNTIES } from '@/lib/seo/business';

export type MarketSubject = 'development-pipeline' | 'competitor-activity';

/** The counties within a short drive of the Belton office, as bare names.
 *
 *  Checked against `SERVICE_AREA_COUNTIES` below rather than trusted — a name misspelt here would
 *  produce a watch that silently searches for a county that does not exist and reports nothing. */
const CORE_COUNTY_NAMES = [
  'Bell', 'Coryell', 'McLennan', 'Williamson', 'Falls',
  'Milam', 'Lampasas', 'Burnet', 'Bosque', 'Hamilton', 'Limestone',
] as const;

/**
 * The counties this watch actually covers, filtered against the firm's published service area.
 *
 * A name that is not in `SERVICE_AREA_COUNTIES` is dropped rather than searched. The filter is the
 * point: it makes the two lists impossible to disagree, and a dropped name shows up as a shortfall
 * in `coveredCounties().length` that the test below catches.
 */
export function coveredCounties(): string[] {
  const served = new Set(SERVICE_AREA_COUNTIES.map((c) => c.replace(/ County$/, '')));
  return CORE_COUNTY_NAMES.filter((c) => served.has(c));
}

/** How much of the stated service area this watch does NOT look at. Reported, never silent. */
export function coverageNote(): string {
  const covered = coveredCounties().length;
  const total = SERVICE_AREA_COUNTIES.length;
  return `Covers ${covered} of ${total} service-area counties — those within a short drive of the `
    + `Belton office. The other ${total - covered} are not searched, so a blank here is not evidence `
    + 'that nothing is happening in them.';
}

/** Words that mean a PROJECT IS STARTING. Deliberately excludes the everyday vocabulary of local
 *  government — "meeting", "agenda", "county", "city council" — which every one of these pages
 *  carries and which would make every result a hit. */
const PIPELINE_WORDS = [
  'preliminary plat', 'final plat', 'replat', 'plat approval', 'subdivision',
  'site plan', 'rezoning', 'rezone', 'zoning change', 'annexation', 'annex',
  'variance', 'development agreement', 'municipal utility district', 'mud',
  'approved', 'submitted', 'filed', 'public hearing', 'notice of', 'groundbreaking',
] as const;

/** Words that mean a FIRM IS BEING NAMED in a way worth knowing about. */
const COMPETITOR_WORDS = [
  'awarded', 'selected', 'contract', 'surveying services', 'professional services',
  'request for qualifications', 'rfq', 'request for proposals', 'rfp',
  'engaged', 'retained', 'approved', 'agreement with',
] as const;

/** Who ranks for every one of these queries while announcing nothing: property portals, listing
 *  aggregators and lead-resale sites. `.gov` and local news are the sources that matter, and neither
 *  is on this list. */
const SELLER_HOSTS = [
  'zillow', 'realtor', 'redfin', 'trulia', 'landwatch', 'land', 'loopnet', 'crexi',
  'homes', 'movoto', 'point2homes', 'har.com', 'apartments',
  'thumbtack', 'angi', 'homeadvisor', 'houzz', 'porch', 'bark', 'yelp',
  'indeed', 'ziprecruiter', 'glassdoor',
] as const;

interface SubjectSpec {
  label: string;
  changeWords: readonly string[];
  changeLabel: string;
  staleAfterYears: number;
  /** What to DO with a hit. A watch that surfaces something nobody acts on is a subscription. */
  actOn: string;
}

const SUBJECTS: Record<MarketSubject, SubjectSpec> = {
  'development-pipeline': {
    label: 'Development pipeline',
    changeWords: PIPELINE_WORDS,
    changeLabel: 'project',
    // An agenda item from two years ago is a project that already happened. This is the shortest
    // window of any watch in the repo, and deliberately so.
    staleAfterYears: 1,
    actOn: 'A plat, site plan or rezoning on an agenda needs a surveyor early. Contact the applicant or the engineer named on the filing.',
  },
  'competitor-activity': {
    label: 'Competitor activity',
    changeWords: COMPETITOR_WORDS,
    changeLabel: 'award',
    staleAfterYears: 2,
    actOn: 'A named award tells you which firms a public body already knows. Worth a look at their RFQ list before the next one opens.',
  },
};

/** County-naming predicate, shared by both subjects. Built from `coveredCounties()` so it can never
 *  drift from the geography the queries actually search. */
function namesACoveredCounty(lower: string): boolean {
  return coveredCounties().some((c) => lower.includes(c.toLowerCase()));
}

export function marketSubjects(): Array<{ id: MarketSubject; label: string; actOn: string }> {
  return (Object.keys(SUBJECTS) as MarketSubject[]).map((id) => ({
    id, label: SUBJECTS[id].label, actOn: SUBJECTS[id].actOn,
  }));
}

export function marketProfile(subject: MarketSubject): WatchProfile {
  const spec = SUBJECTS[subject];
  return {
    label: spec.label,
    logPrefix: '[market-watch]',
    namesSubject: namesACoveredCounty,
    changeWords: spec.changeWords,
    changeLabel: spec.changeLabel,
    sellerHosts: SELLER_HOSTS,
    staleAfterYears: spec.staleAfterYears,
  };
}

/** One query per covered county, so a hit names somewhere the firm can actually drive to. */
export function marketQueries(subject: MarketSubject): readonly WatchQuery[] {
  const counties = coveredCounties();
  if (subject === 'competitor-activity') {
    return counties.map((c) => ({
      query: `"land surveying" OR "surveying services" contract awarded ${c} County Texas commissioners court`,
      rationale: `Which firms ${c} County has already engaged — published in the minutes, nowhere else.`,
    }));
  }
  return counties.map((c) => ({
    query: `${c} County Texas preliminary plat subdivision site plan approved commissioners court agenda`,
    rationale: `Plats and site plans on the ${c} County agenda are projects that need a surveyor before they need a builder.`,
  }));
}

/** What to do with a hit on this subject. */
export function marketSubjectAction(subject: MarketSubject): string {
  return SUBJECTS[subject].actOn;
}

/**
 * Watch one market subject across the covered counties.
 *
 * Same status taxonomy as the other three watches. Here the distinction is commercial rather than
 * regulatory: "we looked and nothing is being platted" and "we never looked" are the difference
 * between a quiet market and a missed one.
 */
export async function runMarketWatch(
  subject: MarketSubject,
  opts: TavilySearchOptions & ClassifyOptions = {},
): Promise<WatchRun> {
  const spec = SUBJECTS[subject];
  return runWatch(spec.label, marketQueries(subject), marketProfile(subject), opts);
}
