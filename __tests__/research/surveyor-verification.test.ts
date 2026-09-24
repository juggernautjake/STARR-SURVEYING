// __tests__/research/surveyor-verification.test.ts — the check a confidence rating cannot do.
//
// Owner, 2026-09-24: "Is there a name associated with the rpls number? Is there a way to look up
// that number and name and make sure they match. Would this improve the certainty?"
//
// ── THE MEASUREMENT THAT JUSTIFIES THIS FILE ────────────────────────────────────────────────────
//
// 145 name+number pairs from the first 198 Bell plats, checked against the TBPELS register:
// 44% matched, 49% did not, 4% were not licence numbers. **65 of the wrong readings were rated
// "high" confidence.**
//
// That is not a flaw in the rating. Reading CHARLES C LIGORI off a stamped seal IS a confident
// reading of those glyphs; nothing in the image says no such surveyor exists. The rating answers
// "could I read this", the register answers "is this real", and only the second catches a plausible
// misreading. Both are kept because they fail differently.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  verifySurveyor, verifiedEnoughToCite, normaliseLicence, normalisePersonName,
  editDistance, verdictLabel, checkChronology, chronologyNote, type RosterEntry,
} from '@/lib/research/surveyor-verification';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const entry = (rpls: string, first: string, last: string, middle = '', status = 'Registered'): RosterEntry =>
  ({ rpls_number: rpls, first_name: first, middle_name: middle, last_name: last, status });

/** Real rows from the register, and real readings from the archive. */
const LUCKO = entry('4636', 'Charles', 'Lucko', 'Craig');
const TURNER = entry('4606', 'MICHAEL', 'TURNER', 'LYNN', 'Expired');
const ARNOLD = entry('3879', 'GARLAND GALE', 'ARNOLD');
const MITCHELL_G = entry('1602', 'GALE', 'MITCHELL', '', 'Expired');

describe('the number names the person on the sheet', () => {
  it('confirms a clean match', () => {
    const v = verifySurveyor('CHARLES C LUCKO', '4636', LUCKO, [LUCKO]);
    expect(v.verdict).toBe('confirmed');
    expect(v.rosterLicence).toBe('4636');
  });

  it('tolerates a misread character in the surname', () => {
    // LICKO for LUCKO is one substitution off a stamped seal, and it is the same person.
    expect(verifySurveyor('CHARLES C LICKO', '4636', LUCKO, [LUCKO]).verdict).toBe('confirmed');
  });

  it('matches somebody the register lists under a name they do not go by', () => {
    // The seal says GALE ARNOLD; the register says GARLAND GALE ARNOLD. Rejecting that would throw
    // away real matches for people known by their middle name, which is common on these sheets.
    expect(verifySurveyor('GALE ARNOLD', '3879', ARNOLD, [ARNOLD]).verdict).toBe('confirmed');
  });

  it('carries the register\'s status, so a lapsed licence is visible', () => {
    // A 1963 plat was sealed by somebody whose licence closed in 1995. That is not a problem with
    // the plat, and the status is what lets a person tell the two situations apart.
    const v = verifySurveyor('GALE E MITCHELL', '1602', MITCHELL_G, [MITCHELL_G]);
    expect(v.verdict).toBe('confirmed');
    expect(v.rosterStatus).toBe('Expired');
  });
});

describe('the register supplies a number the sheet got wrong', () => {
  it('corrects a single-digit misread when the name resolves to exactly one licensee', () => {
    // The real case, on fifteen sheets: 4606 is Michael Lynn Turner; Charles Lucko is 4636.
    const v = verifySurveyor('CHARLES C LUCKO', '4606', TURNER, [LUCKO, TURNER]);
    expect(v.verdict).toBe('corrected');
    expect(v.rosterLicence).toBe('4636');
    expect(v.note).toContain('4636');
  });

  it('refuses to correct when the name resolves to more than one licensee', () => {
    // Picking the closest of several is how a wrong licence number gets recorded with MORE
    // authority than the one we started with.
    const a = entry('1111', 'JOHN', 'SMITH');
    const b = entry('2222', 'JOHN', 'SMYTH');
    expect(verifySurveyor('JOHN SMITH', '9999', null, [a, b]).verdict).not.toBe('corrected');
  });

  it('a correction is not filed as a confirmation', () => {
    // They carry different risk: one agreed with the register on both halves, the other overrode
    // the number. A surveyor citing a licence should be able to see which they are standing on.
    const v = verifySurveyor('CHARLES C LUCKO', '4606', TURNER, [LUCKO, TURNER]);
    expect(v.verdict).toBe('corrected');
    expect(v.verdict).not.toBe('confirmed');
  });
});

describe('when the register cannot settle it', () => {
  it('reports unmatched when the number exists but names somebody else entirely', () => {
    const v = verifySurveyor('BRUCE LANE BRYAN', '4248', entry('4248', 'STEPHEN', 'BRYSON', '', 'Expired'), []);
    expect(v.verdict).toBe('unmatched');
    // It says so rather than choosing — the register genuinely does not say which half was misread.
    expect(v.note).toContain('does not settle which');
  });

  it('reports not_a_licence for a number that is not on the register at all', () => {
    // 37331, 42802, 82156 — too many digits to be a licence, read off something else on the sheet.
    const v = verifySurveyor('WILSON J BAILEY', '42802', null, []);
    expect(v.verdict).toBe('not_a_licence');
  });

  it('reports incomplete rather than guessing when half the pair is missing', () => {
    expect(verifySurveyor('CHARLES C LUCKO', null, null, []).verdict).toBe('incomplete');
    expect(verifySurveyor(null, '4636', LUCKO, [LUCKO]).verdict).toBe('incomplete');
  });
});

describe('what a verdict licenses', () => {
  it('confirmed and corrected may be relied on; the rest may not', () => {
    for (const verdict of ['confirmed', 'corrected'] as const) {
      expect(verifiedEnoughToCite({ verdict } as never)).toBe(true);
    }
    for (const verdict of ['unmatched', 'not_a_licence', 'incomplete'] as const) {
      expect(verifiedEnoughToCite({ verdict } as never)).toBe(false);
    }
    expect(verifiedEnoughToCite(null)).toBe(false);
  });

  it('every verdict has a label a person can read', () => {
    for (const v of ['confirmed', 'corrected', 'unmatched', 'not_a_licence', 'incomplete'] as const) {
      expect(verdictLabel(v).length).toBeGreaterThan(8);
    }
  });
});

describe('chronology — a licence cannot seal a plat before it existed', () => {
  // A FOURTH witness, and the only one that is a hard impossibility rather than a similarity. It
  // catches the class the others miss: a misread number that happens to name a real surveyor whose
  // name is close enough to pass. Names repeat and blur; dates do not bend.
  const modern = { ...entry('6878', 'SETH', 'BARTON'), granted_on: '2005-03-01' };

  it('rules out a 1963 plat sealed by a licence granted in 2005', () => {
    expect(checkChronology(modern, '1963-05-14')).toBe('impossible');
  });

  it('accepts a plat from after the licence was granted', () => {
    expect(checkChronology(modern, '2012-08-01')).toBe('plausible');
  });

  it('allows a year of grace for survey, signature and recording', () => {
    // The sheet is signed, then filed, then recorded, and the reader may have the year wrong by
    // one. Rejecting a plat dated four months before the grant date would be a false accusation.
    expect(checkChronology(modern, '2004-12-01')).toBe('plausible');
    expect(checkChronology(modern, '1999-01-01')).toBe('impossible');
  });

  it('says unknown rather than guessing when either date is missing', () => {
    // A silent 'plausible' on missing data would make the check look like it passed.
    expect(checkChronology(modern, null)).toBe('unknown');
    expect(checkChronology({ ...modern, granted_on: null }, '1963-05-14')).toBe('unknown');
    expect(checkChronology(null, '1963-05-14')).toBe('unknown');
  });

  it('only tests the GRANT date, never the expiry', () => {
    // `expires_on` is the CURRENT expiry: a licence renewed for thirty years shows one recent date,
    // so testing a plat against it would reject the archive's entire back catalogue.
    const lapsed = { ...entry('719', 'CHARLES', 'MILLER', 'L', 'Closed'), granted_on: '1955-01-01', expires_on: '1995-12-31' };
    expect(checkChronology(lapsed, '2001-06-01')).toBe('plausible');
  });

  it('explains itself in words a person can act on', () => {
    expect(chronologyNote(modern, '1963-05-14')).toContain('1963-05-14');
    expect(chronologyNote(modern, '1963-05-14')).toContain('2005-03-01');
  });
});

describe('normalising', () => {
  it('a licence number is digits, without leading zeros', () => {
    expect(normaliseLicence('RPLS No. 04636')).toBe('4636');
    expect(normaliseLicence('4636')).toBe('4636');
    expect(normaliseLicence(null)).toBe('');
  });

  it('a name loses punctuation and case but keeps its parts', () => {
    expect(normalisePersonName('Charles  C. Lucko')).toBe('CHARLES C LUCKO');
  });

  it('edit distance counts what it should', () => {
    expect(editDistance('LUCKO', 'LICKO')).toBe(1);
    expect(editDistance('LUCKO', 'LUCKO')).toBe(0);
    expect(editDistance('', 'ABC')).toBe(3);
  });
});

describe('the roster sync refuses to poison the register', () => {
  const sync = read('scripts/sync-surveyor-roster.mjs');

  it('rejects a short download instead of upserting it', () => {
    // A truncated file upserted silently turns every real licence into "not on the register", which
    // reads as a data-quality finding rather than a broken sync.
    expect(sync).toContain('MIN_PLAUSIBLE_ROWS');
    expect(sync).toContain('REFUSED');
  });

  it('rejects a changed CSV header rather than filling columns with the wrong fields', () => {
    expect(sync).toContain('the CSV header changed');
  });

  it('uses curl, not fetch', () => {
    // node's fetch is 403'd by hosts curl gets a 200 from; a survey built on the failing one
    // produced two full runs of wrong answers on 2026-09-21 before anybody checked.
    expect(sync).toContain("execFileSync('curl'");
  });

  it('de-duplicates by licence number before upserting', () => {
    // Postgres refuses a batch that touches one key twice — "cannot affect row a second time" —
    // and that fails the whole 500-row batch, not the duplicate. It did, on the first run.
    expect(sync).toContain('cannot affect row a second time');
    expect(sync).toContain('byNum.set');
  });

  it('the verifier refuses to run against a short roster too', () => {
    expect(read('scripts/verify-surveyors.mjs')).toContain('REFUSED');
  });
});
