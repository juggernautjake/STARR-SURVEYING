// The learning-content freshness watch — §I3.4.
//
// These tests never touch the network. `classifyAnnouncement` is a pure function of a result and a
// profile, so the profile's judgement is testable on fabricated results, which is the entire reason
// the core was split that way.
//
// What is worth testing here is NOT "does it return hits". It is whether the profile draws the three
// lines that make a watch useful rather than noisy: seller pages are not announcements, the exam-prep
// vocabulary is not a change signal, and an official publisher is not a seller.

import { describe, it, expect } from 'vitest';
import {
  learnFreshnessProfile,
  learnFreshnessQueries,
  learnSubjects,
  learnSubjectAffects,
  type LearnSubject,
} from '@/lib/learn/content-freshness-watch';
import { classifyAnnouncement, isSellerPage } from '@/lib/research/announcement-watch';

const ALL: LearnSubject[] = ['ncees-handbook', 'practice-act', 'tbpels-standards', 'recording-platting'];

function result(over: Partial<{ title: string; content: string; url: string; score: number; authority: number }> = {}) {
  return {
    title: 'NCEES releases new FS Reference Handbook version 10.5',
    content: 'NCEES has released a revised FS Reference Handbook, effective January 1, 2026.',
    url: 'https://ncees.org/news/handbook-update',
    score: 0.9,
    // ncees.org is the publisher — high authority is what makes it an official source.
    authority: 0.9,
    ...over,
  };
}

describe('learn freshness — every subject is wired', () => {
  it('exposes all four subjects with queries and an "affects" line', () => {
    expect(learnSubjects().map((s) => s.id).sort()).toEqual([...ALL].sort());
    for (const s of ALL) {
      expect(learnFreshnessQueries(s).length).toBeGreaterThan(0);
      // A reviewer needs to know WHAT to open, not just that something moved.
      expect(learnSubjectAffects(s).length).toBeGreaterThan(20);
      // A query nobody can explain is a query nobody will maintain.
      for (const q of learnFreshnessQueries(s)) expect(q.rationale.length).toBeGreaterThan(20);
    }
  });
});

describe('learn freshness — the lines the profile has to draw', () => {
  it('accepts a real publisher announcement', () => {
    // currentYear injected so this test does not start failing in 2030.
    const v = classifyAnnouncement(result(), learnFreshnessProfile('ncees-handbook'), { currentYear: 2026 });
    expect(v.verdict).toBe('likely');
    expect(v.excerpt).toBeTruthy();
  });

  it('caps a cram-site page at "possible" — it can never be the thing that pages somebody', () => {
    // This is the failure mode the whole seller list exists for: test-prep sellers rank ABOVE the
    // publisher for the publisher's own document, and their pages name it perfectly.
    //
    // The contract is a CAP, not an exclusion, and that is deliberate — a seller page can still be
    // worth a glance. Asserting `noise` here would be asserting something the core does not
    // promise; asserting "never likely" is the guarantee that actually matters, because `likely` is
    // the tier a person is expected to act on.
    const seller = classifyAnnouncement(
      result({ url: 'https://quizlet.com/ncees-fs-reference-handbook-flashcards' }),
      learnFreshnessProfile('ncees-handbook'),
      { currentYear: 2026 },
    );
    expect(seller.verdict).not.toBe('likely');
    expect(seller.reasons.join(' ')).toMatch(/vendor marketing/i);

    // Control: the SAME text on the publisher's own host does reach `likely`. Without this the
    // assertion above would pass just as well if the profile rejected everything.
    const publisher = classifyAnnouncement(result(), learnFreshnessProfile('ncees-handbook'), { currentYear: 2026 });
    expect(publisher.verdict).toBe('likely');
  });

  it('demotes an announcement too old to still be the current edition', () => {
    const v = classifyAnnouncement(
      result({ content: 'NCEES released a revised FS Reference Handbook, effective January 1, 2015.' }),
      learnFreshnessProfile('ncees-handbook'),
      { currentYear: 2026 },
    );
    expect(v.verdict).not.toBe('likely');
    expect(v.reasons.join(' ')).toMatch(/stale/i);
  });

  it('does NOT treat ncees.org as a seller — it is the publisher', () => {
    // The mistake that would make this watch permanently blind. NCEES sells the handbook; it is
    // still the one host whose announcement is the actual answer.
    const hosts = learnFreshnessProfile('ncees-handbook').sellerHosts;
    expect(isSellerPage('https://ncees.org/news/handbook-update', hosts)).toBe(false);
    // Control: the list is not simply inert.
    expect(isSellerPage('https://quizlet.com/x', hosts)).toBe(true);
  });

  it('does not fire on the everyday vocabulary of exam prep', () => {
    // "study", "review", "practice", "exam" appear on every page in this subject area. If any of
    // them counted as a change word, every result would be a hit and the watch would be worthless.
    const words = learnFreshnessProfile('ncees-handbook').changeWords.map((w) => w.toLowerCase());
    for (const everyday of ['study', 'review', 'practice', 'exam', 'prepare', 'course']) {
      expect(words).not.toContain(everyday);
    }
  });

  it('watches 22 TAC Chapter 138, the chapter that is actually in force', () => {
    // HB 1523 repealed the surveying standards in Chapter 663 and merged them into 138. A watch on
    // 663 alone would report "nothing found" with total confidence, forever.
    const terms = learnFreshnessProfile('tbpels-standards')
      .namesSubject;
    expect(terms('tbpels adopted amendments to 22 tac chapter 138')).toBe(true);
    expect(terms('compliance and professionalism for surveyors, subchapter e')).toBe(true);
    // Control: an unrelated page must not name the subject.
    expect(terms('city council approves new park bond')).toBe(false);
  });
});

describe('learn freshness — staleness is per subject, not global', () => {
  it('gives a statute a far longer life than a handbook edition', () => {
    // A 2019 statute is still the law. A 2019 handbook is two editions out of date. One number for
    // both would either discard live statutes or admit dead handbooks.
    expect(learnFreshnessProfile('practice-act').staleAfterYears)
      .toBeGreaterThan(learnFreshnessProfile('ncees-handbook').staleAfterYears);
  });
});
