// __tests__/research/catalogue-confidence.test.ts — a rating that changes what a value may be used for.
//
// Owner, 2026-09-23: "Please make there be a confidence rating for everything. Like, if we are not
// confident about the rpls number, then it should make that known."
//
// ── WHY A RATING NEEDS TEETH ────────────────────────────────────────────────────────────────────
//
// A confidence score that nothing reads is decoration, and decoration is worse than nothing here:
// it makes a catalogue look checked. The value of the rating is entirely in what it FORBIDS, so
// most of this file is about `mayMatchAutomatically` — the one function that turns a word into a
// consequence.
//
// The stake is concrete. A blank RPLS number makes somebody open the sheet. A WRONG one makes them
// cite it, and the wrong surveyor on a boundary opinion is a professional problem, not a data one.
// The library has already produced one version of this mistake: a "hit" that stopped a run fetching
// a plat the run then did not have. This is the same shape with a worse blast radius.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CONFIDENCE_LEVELS, CONFIDENCE_SCORE, CATALOGUE_PROMPT, CATALOGUE_VERSION,
  FIELD_TO_CATEGORY, mayMatchAutomatically, needsReview, type DocumentCatalogue,
} from '@/lib/research/catalogue-schema';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const field = (value: string | null, confidence: 'high' | 'medium' | 'low', source_text: string | null = 'as printed') =>
  ({ value, confidence, source_text });

describe('a doubtful value never stands in for the document', () => {
  it('a low-confidence RPLS number cannot satisfy anything automatically', () => {
    expect(mayMatchAutomatically('rpls_number', 'low')).toBe(false);
  });

  it('nor can a MEDIUM one — half-sure of a licence number is not sure', () => {
    // The distinction the owner's example turns on. Being half-sure the acreage is 38.5 is useful;
    // being half-sure somebody's licence number is 4330 is how a wrong surveyor gets cited.
    expect(mayMatchAutomatically('rpls_number', 'medium')).toBe(false);
    expect(mayMatchAutomatically('rpls_number', 'high')).toBe(true);
  });

  it('every identifying field is held to the same bar', () => {
    for (const f of ['rpls_number', 'recording_reference', 'abstract_number', 'recorded_date']) {
      expect(mayMatchAutomatically(f, 'medium'), `${f} must require high confidence`).toBe(false);
      expect(mayMatchAutomatically(f, 'high')).toBe(true);
    }
  });

  it('but a descriptive field may be used when the reader was fairly sure', () => {
    // Refusing everything below "high" everywhere would make the catalogue useless on old sheets,
    // where almost nothing is crisp. The bar is raised for what identifies a document, not for what
    // describes it.
    expect(mayMatchAutomatically('acreage', 'medium')).toBe(true);
    expect(mayMatchAutomatically('subdivision_name', 'medium')).toBe(true);
  });

  it('low is refused for every field, identifying or not', () => {
    for (const f of ['acreage', 'city', 'subdivision_name', 'rpls_number']) {
      expect(mayMatchAutomatically(f, 'low'), `${f} at low confidence`).toBe(false);
    }
  });
});

describe('what a person is asked to confirm', () => {
  const cat = {
    subdivision_name: field('Highland Oaks', 'high'),
    surveyors: [{ name: field('Charles L. Miller', 'high'), firm: field(null, 'low'), rpls_number: field('719', 'medium', 'SURVEYOR NO. 719') }],
    recorded_date: field('1963-05-14', 'high'),
    recording_reference: field('Vol. 877, Pg. 272', 'low', 'Vol 8?7 Pg 2?2'),
    acreage: field(null, 'low'),
    city: field('Belton', 'medium'),
  } as unknown as DocumentCatalogue;

  it('surfaces the doubtful values and leaves the confident ones alone', () => {
    const review = needsReview(cat);
    const fields = review.map((r) => r.field);
    expect(fields).toContain('rpls_number');        // medium on an identifying field
    expect(fields).toContain('recording_reference'); // low
    expect(fields).not.toContain('subdivision_name');
    expect(fields).not.toContain('recorded_date');
    expect(fields).not.toContain('city');            // medium, but descriptive
  });

  it('never asks about a field that has no value', () => {
    // "Please confirm this blank" is noise, and noise is what stops people reading the list.
    expect(needsReview(cat).map((r) => r.field)).not.toContain('acreage');
  });

  it('carries the quote, because that is what makes confirming it a one-second job', () => {
    const rpls = needsReview(cat).find((r) => r.field === 'rpls_number');
    expect(rpls?.source).toBe('SURVEYOR NO. 719');
    expect(rpls?.value).toBe('719');
  });

  it('survives a missing or malformed catalogue rather than throwing into a page render', () => {
    expect(needsReview(null)).toEqual([]);
    expect(needsReview(undefined)).toEqual([]);
    expect(needsReview({} as DocumentCatalogue)).toEqual([]);
  });
});

describe('the rating vocabulary', () => {
  it('is ordered low → high, so comparisons are meaningful', () => {
    // Asserted as the whole list rather than by comparing indexOf pairs: `indexOf` returns -1 for a
    // missing element and -1 is less than every real index, so the pairwise form would pass its
    // hardest at the moment somebody deleted a level.
    expect([...CONFIDENCE_LEVELS]).toEqual(['low', 'medium', 'high']);
  });

  it('buckets into the DECIMAL column without pretending to be a probability', () => {
    // Not 0/50/100: round numbers invite being read as percentages, and these are three words.
    expect(CONFIDENCE_SCORE.high).toBeGreaterThan(CONFIDENCE_SCORE.medium);
    expect(CONFIDENCE_SCORE.medium).toBeGreaterThan(CONFIDENCE_SCORE.low);
    for (const v of Object.values(CONFIDENCE_SCORE)) expect(v % 50).not.toBe(0);
  });
});

describe('the prompt asks for what the schema stores', () => {
  it('demands a rating and a verbatim quote for every value', () => {
    expect(CATALOGUE_PROMPT).toContain('"confidence"');
    expect(CATALOGUE_PROMPT).toContain('source_text');
    expect(CATALOGUE_PROMPT).toContain('VERBATIM');
  });

  it('tells the reader not to guess, and singles out the licence number', () => {
    // The instruction the owner asked for, in the place it has to be.
    expect(CATALOGUE_PROMPT).toContain('NEVER guess');
    expect(CATALOGUE_PROMPT.toLowerCase()).toContain('rpls');
  });

  it('asks it to say so when a scan is simply illegible', () => {
    // Otherwise an unreadable sheet returns a full set of nulls, which is indistinguishable from a
    // sheet that genuinely carries none of these facts.
    expect(CATALOGUE_PROMPT).toContain('unreadable');
  });

  it('names every field the schema records', () => {
    for (const f of ['subdivision_name', 'rpls_number', 'recording_reference', 'original_survey', 'adjoining_subdivisions']) {
      expect(CATALOGUE_PROMPT, `prompt must ask for ${f}`).toContain(f);
    }
  });
});

describe('extracted facts land in categories the database will accept', () => {
  it('every mapped category is one the CHECK constraint allows', () => {
    // seeds/090 constrains `data_category`. A category outside it fails the INSERT at run time, on
    // a row nobody is watching, after the expensive part is already paid for.
    const seed = read('seeds/090_research_tables.sql');
    const allowed = seed.match(/data_category\s+TEXT NOT NULL CHECK \(data_category IN \(([\s\S]*?)\)\)/)?.[1] ?? '';
    expect(allowed, 'could not read the CHECK list from the seed').toContain("'bearing'");
    for (const c of new Set(Object.values(FIELD_TO_CATEGORY))) {
      expect(allowed, `"${c}" is not an allowed data_category`).toContain(`'${c}'`);
    }
  });
});

describe('the sweeper and the schema cannot drift apart', () => {
  const sweeper = read('scripts/catalogue-library.mjs');

  it('the sweeper reads the prompt from the schema module rather than keeping a copy', () => {
    // Two copies of a prompt drift silently: a field dropped from one reads as "not on the sheet".
    expect(sweeper).toContain('catalogue-schema.ts');
    expect(sweeper).toContain('CATALOGUE_PROMPT');
  });

  it('it stamps the version it used, so a better prompt can re-read only the stale rows', () => {
    expect(sweeper).toContain('catalogue_version');
    expect(CATALOGUE_VERSION).toBeGreaterThan(0);
  });

  it('it replaces a document\'s facts rather than appending a second generation', () => {
    expect(sweeper).toContain("delete().eq('document_id'");
  });

  it('a TRANSIENT failure leaves no mark, so an outage cannot empty the queue', () => {
    // Measured 2026-09-24: the first full run stamped 111 documents `catalogue_error` in a row,
    // every one of them "Your credit balance is too low". Nothing was wrong with those sheets — and
    // because the queue skips rows carrying an error, one billing outage would have quietly removed
    // 7,800 documents from the backlog permanently. The bug was not the outage; it was recording
    // the outage as a property of the document.
    expect(sweeper).toContain('TRANSIENT');
    expect(sweeper).toContain('credit balance');
    expect(sweeper).toMatch(/kind === 'permanent'[\s\S]{0,200}catalogue_error/);
  });

  it('a FATAL failure stops the run instead of failing 7,800 documents one at a time', () => {
    // Grinding through the whole archive to fail each document the same way helps nobody and costs
    // a queue. Every worker checks the flag, so one fatal error ends the run promptly.
    expect(sweeper).toContain("kind === 'fatal'");
    expect(sweeper).toContain('STOPPED');
    expect(sweeper).toMatch(/if \(stopped\) return;/);
  });

  it('and says the rows were left alone, so nobody re-runs a repair that is not needed', () => {
    expect(sweeper).toContain('the rows stay in the queue');
  });

  it('a failed document is recorded, not silently skipped', () => {
    // 188 rows in this table point at a folder rather than a file. Skipping them quietly is how a
    // gap becomes permanent.
    expect(sweeper).toContain('catalogue_error');
  });
});
