// lib/learn/content-freshness-watch.ts — has the material our exam prep TEACHES been revised? §I3.4
//
// The FS/SIT course cites specific outside documents as authority: the NCEES FS Reference Handbook,
// the Texas surveying practice act, the TBPELS administrative rules, and the recording and platting
// statutes. Those documents change. When one does, the course does not become obviously wrong — it
// becomes quietly wrong, which is far worse for exam preparation than an outage would be.
//
// Nobody is notified. NCEES publishes a new handbook version, the Legislature amends a chapter, and
// the material carries on teaching the previous edition with complete confidence.
//
// ── THIS IS THE THIRD CONSUMER OF announcement-watch ────────────────────────────────────────────
//
// The county portal watch (§I3.3) was first, the regulatory watch (§I3.5) second, and that file
// records why the core was extracted rather than copied: the same question — has an authority
// announced a change that breaks something we depend on — asked of a different subject, drowning in
// the same three false positives (sellers, undated pages, old news).
//
// What differs here is only the profile. Sellers into exam prep are a different and much louder
// crowd than sellers into compliance, and a handbook edition goes stale on a completely different
// clock from a rule amendment.
//
// ── IT FLAGS. IT NEVER EDITS. ───────────────────────────────────────────────────────────────────
//
// This is the hard rule for this watch specifically, and the plan states it as a risk before it
// states the feature: **exam content must not be auto-edited from search results.** A search result
// is an unverified web page. Rewriting a practice question from one would mean teaching whatever a
// well-ranked page happened to say, and the failure would be invisible — a plausible question with
// a wrong answer, which is the single worst artefact this repo could produce.
//
// So the output is a review queue with the triggering sentence quoted and the source linked. A
// person reads it, opens the actual document, and decides. Nothing here writes to course content.
//
// ── THE SUBJECTS ARE DERIVED FROM WHAT THE CONTENT ACTUALLY CITES ───────────────────────────────
//
// Not from a guess about what a surveying course probably references. Counted across the learn
// material on 2026-08-29:
//
//     22 TAC Ch. 138               78 mentions
//     Occupations Code 1071        46
//     NCEES FS Reference Handbook  32
//     Property Code 12 / 13       ~20
//     Local Gov Code Ch. 212       ~6
//
// That count is also what caught a bug in the regulatory watch next door, which was watching 22 TAC
// Chapter 663 — repealed and merged into 138 by HB 1523. A subject list derived from real citations
// found a defect that a subject list written from memory had shipped two days earlier.

import {
  runWatch,
  type ClassifyOptions,
  type WatchProfile,
  type WatchQuery,
  type WatchRun,
} from '@/lib/research/announcement-watch';
import type { TavilySearchOptions } from '@/lib/research/open-web';

export type LearnSubject =
  | 'ncees-handbook'
  | 'practice-act'
  | 'tbpels-standards'
  | 'recording-platting';

/** Words that mean a PUBLISHED DOCUMENT has moved. Deliberately excludes the everyday vocabulary of
 *  exam prep — "study", "review", "prepare", "exam", "practice" — which every one of these pages
 *  carries always, and which would make every result a hit. */
const REVISION_WORDS = [
  'new edition', 'revised', 'revision', 'updated', 'update to', 'version',
  'effective', 'effective date', 'takes effect', 'supersedes', 'superseded',
  'amended', 'amendment', 'adopted', 'repealed', 'replaces', 'errata',
  'now available', 'released', 'changes to', 'what changed',
] as const;

/** Who sells into exam preparation and therefore matches every one of these queries perfectly while
 *  announcing nothing. This list is longer than the compliance one because test prep is among the
 *  most heavily monetised search categories there is — course sellers, cram sites, flashcard apps,
 *  book resellers and content farms all rank for "NCEES FS handbook".
 *
 *  `ncees.org` is deliberately NOT here. It is the publisher — the one host whose announcement IS
 *  the answer. Excluding an official source as a "seller" because it also sells the book is the
 *  mistake that would make this watch permanently blind to the only page that matters. */
const SELLER_HOSTS = [
  'quizlet', 'chegg', 'coursehero', 'studocu', 'brainscape', 'udemy', 'coursera',
  'amazon', 'ebay', 'abebooks', 'thriftbooks', 'barnesandnoble',
  'ppi2pass', 'schoolofpe', 'testmasters', 'prepfe', 'civilengineeringacademy',
  'pdhacademy', 'redvector', 'pdhonline', 'lorman', 'seminarweb',
  'reddit', 'pinterest', 'scribd', 'slideshare', 'youtube',
] as const;

interface SubjectSpec {
  label: string;
  /** Any of these naming the subject is enough — a document is cited several ways, and requiring
   *  one exact string would reject most real announcements. */
  terms: readonly string[];
  queries: readonly WatchQuery[];
  staleAfterYears: number;
  /** What in OUR material goes wrong if this moves. Shown beside a hit, because a reviewer needs to
   *  know what to open, not merely that something changed. */
  affects: string;
}

const SUBJECTS: Record<LearnSubject, SubjectSpec> = {
  'ncees-handbook': {
    label: 'NCEES FS Reference Handbook',
    terms: ['ncees', 'fs reference handbook', 'fundamentals of surveying', 'reference handbook', 'exam specification'],
    queries: [
      {
        query: 'NCEES "FS Reference Handbook" new version released surveying',
        rationale: 'The handbook is the one document candidates are given in the exam room. A new version changes which formulas they have.',
      },
      {
        query: 'NCEES "Fundamentals of Surveying" exam specification revised effective',
        rationale: 'The specification sets topic weights. Ours are built to a published distribution; a revision silently invalidates it.',
      },
    ],
    // Handbook editions turn over on a few-year cycle, and an edition two cycles back is no longer
    // what anybody sits the exam with.
    staleAfterYears: 4,
    affects: 'Every question citing the handbook, and the exam_weight distribution the practice exam is built from.',
  },

  'practice-act': {
    label: 'Texas surveying practice act (Occupations Code 1071)',
    terms: ['occupations code', '1071', 'practice act', 'land surveying practice', 'texas legislature'],
    queries: [
      {
        query: 'Texas "Occupations Code" 1071 land surveying amended legislature effective',
        rationale: 'The practice act defines what surveying is and who may do it — the definitional spine of the licensure material.',
      },
      {
        query: 'Texas legislature land surveying bill signed effective date professional land surveyor licensure',
        rationale: 'Bills are reported by number long before the code text updates, so the bill is the earlier signal.',
      },
    ],
    // Statutes stay in force for years; age is weak evidence here, and demoting for it discards the
    // answer rather than ranking it.
    staleAfterYears: 10,
    affects: 'Licensure, scope-of-practice and professional-responsibility modules.',
  },

  'tbpels-standards': {
    label: 'TBPELS standards (22 TAC Ch. 138)',
    // Chapter 138, not 663 — see the header, and the correction it forced in regulatory-watch.ts.
    terms: ['22 tac', 'chapter 138', 'compliance and professionalism for surveyors', 'tbpels', 'professional and technical standards'],
    queries: [
      {
        query: '"22 TAC" 138 surveying standards amendment adopted Texas Register effective',
        rationale: 'Subchapter E carries the precision, accuracy and monumentation standards our technical questions are scored against.',
      },
      {
        query: 'TBPELS "Compliance and Professionalism for Surveyors" rule amendment boundary survey standards',
        rationale: 'The chapter by title — a notice often names the title without the citation, or the citation without the board.',
      },
    ],
    staleAfterYears: 8,
    affects: 'Precision/accuracy questions (§138.83) and the professional-conduct module (§138.91).',
  },

  'recording-platting': {
    label: 'Recording and platting statutes',
    terms: ['property code', 'local government code', 'chapter 212', 'recording', 'plat', 'subdivision'],
    queries: [
      {
        query: 'Texas "Property Code" recording instruments conveyance amended effective surveyor plat',
        rationale: 'Property Code 12 and 13 govern what gets recorded and the effect of recording — cited throughout the boundary material.',
      },
      {
        query: 'Texas "Local Government Code" 212 subdivision plat approval amended effective',
        rationale: 'Chapter 212 is municipal plat approval; a change here reaches the platting module directly.',
      },
    ],
    staleAfterYears: 10,
    affects: 'Boundary, conveyancing and platting modules.',
  },
};

export function learnSubjects(): Array<{ id: LearnSubject; label: string; affects: string }> {
  return (Object.keys(SUBJECTS) as LearnSubject[]).map((id) => ({
    id,
    label: SUBJECTS[id].label,
    affects: SUBJECTS[id].affects,
  }));
}

/** Build the profile for one subject. Exported so the matching rules are testable without a network. */
export function learnFreshnessProfile(subject: LearnSubject): WatchProfile {
  const spec = SUBJECTS[subject];
  return {
    label: spec.label,
    logPrefix: '[learn-watch]',
    namesSubject: (lower) => spec.terms.some((t) => lower.includes(t)),
    changeWords: REVISION_WORDS,
    // "revision" rather than the generic word: a handbook is revised, not amended, and this string
    // is read by a person deciding whether the hit is worth ten minutes.
    changeLabel: 'revision',
    sellerHosts: SELLER_HOSTS,
    staleAfterYears: spec.staleAfterYears,
  };
}

export function learnFreshnessQueries(subject: LearnSubject): readonly WatchQuery[] {
  return SUBJECTS[subject].queries;
}

/** What in our own material a hit on this subject puts in question. */
export function learnSubjectAffects(subject: LearnSubject): string {
  return SUBJECTS[subject].affects;
}

/**
 * Watch one learning-content subject.
 *
 * Same status taxonomy as every other watch, and it matters here for the same reason: "we checked
 * and the handbook has not moved" and "we never checked" must never render identically. On a study
 * surface the second silently promises a currency the system never verified.
 *
 * Returns a report. It does not, and must not, write to course content.
 */
export async function runLearnFreshnessWatch(
  subject: LearnSubject,
  opts: TavilySearchOptions & ClassifyOptions = {},
): Promise<WatchRun> {
  const spec = SUBJECTS[subject];
  return runWatch(spec.label, spec.queries, learnFreshnessProfile(subject), opts);
}
