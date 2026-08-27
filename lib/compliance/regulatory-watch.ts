// lib/compliance/regulatory-watch.ts — has a rule we depend on changed? §I3.5
//
// The compliance register next door tracks what we hold: licences, insurance, instrument
// calibration. It answers "are we current". It cannot answer "has the thing we are current WITH
// moved", and that second question is the one that arrives without warning:
//
//   · TBPELS amends a rule and the CE or seal requirements shift under an active licence
//   · FEMA revises a flood map and yesterday's elevation certificate describes a different zone
//   · A county changes its recording fees and every quote with a filing line is now wrong
//
// None of those send us an email. They are published, and then they are in force.
//
// ── THIS IS THE SECOND CONSUMER OF announcement-watch ───────────────────────────────────────────
//
// The county portal watch (§I3.3) was the first, and that file's header says plainly that a generic
// layer over a single caller is debt. This is the caller it was extracted for: the identical
// question — has an authority announced a change that breaks something we depend on — asked of a
// different subject, drowning in the same three false positives.
//
// What is genuinely different here is only the profile, and one number. Portal migrations go stale
// in two years because the portal has already moved. A rule amendment from 2023 is still the rule,
// so `staleAfterYears` is far longer and a demotion for age would throw away the answer.
//
// ── NOTHING HERE IS COMPLIANCE ADVICE ───────────────────────────────────────────────────────────
//
// Every result is an unverified web page, ranked. A licensed professional reads it and decides. The
// output is deliberately a "worth ten minutes" list with the triggering sentence quoted, and it is
// never written into the compliance register as a fact — a search result must not be able to change
// what the firm believes about its own licence.

import {
  runWatch,
  type ClassifyOptions,
  type WatchProfile,
  type WatchQuery,
  type WatchRun,
} from '@/lib/research/announcement-watch';
import type { TavilySearchOptions } from '@/lib/research/open-web';

export type RegulatoryTopic = 'tbpels' | 'flood-maps' | 'recording-fees';

/** Words that mean a RULE is changing. Excludes the everyday vocabulary of regulation — "rules",
 *  "requirements", "licensing" — which every board page carries every day of its life. */
const RULE_CHANGE_WORDS = [
  'amend', 'amended', 'amendment', 'adopted', 'adoption', 'repeal', 'repealed',
  'effective', 'takes effect', 'new rule', 'rule change', 'proposed rule',
  'revision', 'revised', 'update to', 'updated', 'notice of', 'final rule',
  'increase', 'increased', 'new fee', 'fee schedule', 'effective date',
] as const;

/** Who sells into compliance and therefore matches every one of these queries perfectly while
 *  announcing nothing: continuing-education providers, seminar sites, and law-firm marketing. */
const SELLER_HOSTS = [
  'pdhacademy', 'redvector', 'continuingeducation', 'ceu', 'pdhonline', 'aecdaily',
  'lorman', 'jdsupra', 'lexology', 'natlawreview', 'findlaw', 'justia', 'avvo',
  'udemy', 'coursera', 'seminarweb',
] as const;

interface TopicSpec {
  label: string;
  /** Any of these naming the subject is enough. Regulatory subjects are named several ways. */
  terms: readonly string[];
  queries: readonly WatchQuery[];
  /** Rules stay in force for years, so age is weak evidence here — unlike a portal migration. */
  staleAfterYears: number;
  /** Shown in the UI so somebody reading a hit knows why we watch this at all. */
  why: string;
}

const TOPICS: Record<RegulatoryTopic, TopicSpec> = {
  tbpels: {
    label: 'TBPELS rules',
    // "TBPELS" alone is too narrow: the board is written several ways, and the rules live in
    // 22 TAC Chapter 663 which a notice may cite without naming the board.
    terms: ['tbpels', 'board of professional engineers and land surveyors', 'professional land surveyor', '22 tac', 'chapter 663', 'texas board of professional'],
    queries: [
      {
        query: 'TBPELS "land surveyor" rule amendment adopted effective Texas',
        rationale: 'The board announcing an adopted amendment — the version that is already in force.',
      },
      {
        query: 'Texas Board Professional Engineers Land Surveyors proposed rule change surveying continuing education',
        rationale: 'Proposed rules surface months before adoption, which is the whole point of watching.',
      },
      {
        query: '"22 TAC" 663 surveying rule amendment Texas Register effective date',
        rationale: 'The Texas Register is where it is published first; the chapter cite finds it without the board name.',
      },
    ],
    // A rule adopted in 2021 is still the rule. Demoting it for age would throw away the answer.
    staleAfterYears: 12,
    why: 'Rule changes reach seal requirements, CE hours and what a survey must show. They are published, then in force.',
  },

  'flood-maps': {
    label: 'FEMA flood maps',
    terms: ['fema', 'flood insurance rate map', 'firm panel', 'lomr', 'loma', 'flood map', 'letter of map'],
    queries: [
      {
        query: 'FEMA flood map revision effective date Bell Coryell Williamson County Texas',
        rationale: 'A revised panel changes the zone an elevation certificate reports for the same parcel.',
      },
      {
        query: 'FEMA "letter of map revision" Texas central preliminary flood insurance rate map effective',
        rationale: 'LOMRs land parcel by parcel and are easy to miss until a certificate is challenged.',
      },
    ],
    // A map panel stays effective until superseded, but a 10-year-old revision is settled history.
    staleAfterYears: 5,
    why: 'A revised panel changes the flood zone an elevation certificate reports for the same parcel.',
  },

  'recording-fees': {
    label: 'County recording fees',
    terms: ['recording fee', 'filing fee', 'county clerk', 'fee schedule', 'plat filing'],
    queries: [
      {
        query: 'Texas county clerk recording fee schedule increase effective plat filing',
        rationale: 'Filing fees are quoted to clients; an increase makes every open quote wrong.',
      },
      {
        query: 'county clerk Texas "fee schedule" plat recording new fees effective date commissioners court',
        rationale: 'Adopted in open court, usually with an effective date a month or two out.',
      },
    ],
    staleAfterYears: 3,
    why: 'Filing fees appear on quotes. An increase we did not notice comes out of the job, not the client.',
  },
};

export function regulatoryTopics(): Array<{ id: RegulatoryTopic; label: string; why: string }> {
  return (Object.keys(TOPICS) as RegulatoryTopic[]).map((id) => ({
    id, label: TOPICS[id].label, why: TOPICS[id].why,
  }));
}

/** Build the profile for one topic. Exported so the matching rules are testable on their own. */
export function regulatoryProfile(topic: RegulatoryTopic): WatchProfile {
  const spec = TOPICS[topic];
  return {
    label: spec.label,
    logPrefix: '[reg-watch]',
    // ANY of the terms is enough. A regulatory subject is named several ways — the board, the
    // statute cite, the document type — and requiring one exact string would reject most real hits.
    namesSubject: (lower) => spec.terms.some((t) => lower.includes(t)),
    changeWords: RULE_CHANGE_WORDS,
    changeLabel: 'rule-change',
    sellerHosts: SELLER_HOSTS,
    staleAfterYears: spec.staleAfterYears,
  };
}

export function regulatoryQueries(topic: RegulatoryTopic): readonly WatchQuery[] {
  return TOPICS[topic].queries;
}

/**
 * Watch one regulatory topic.
 *
 * Same status taxonomy as every other watch: `not-configured` (no key — nothing was looked at) is
 * not `searched` with no hits, and neither is `search-failed`. On a compliance surface that
 * distinction is the whole point — "we checked and nothing changed" and "we never checked" must
 * never render the same way.
 */
export async function runRegulatoryWatch(
  topic: RegulatoryTopic,
  opts: TavilySearchOptions & ClassifyOptions = {},
): Promise<WatchRun> {
  const spec = TOPICS[topic];
  return runWatch(spec.label, spec.queries, regulatoryProfile(topic), opts);
}
