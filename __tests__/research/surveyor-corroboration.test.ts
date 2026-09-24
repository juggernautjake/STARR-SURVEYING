// __tests__/research/surveyor-corroboration.test.ts — three witnesses, and what to do when they disagree.
//
// Owner, 2026-09-24: "check with other documents for the same rpls number and seal and name and
// compare that to the registry of RPLSs to get more confidence."
//
// ── THE THREE, AND HOW EACH ONE FAILS ───────────────────────────────────────────────────────────
//
//   the reading   fooled by a legible mistake. CHARLES C LIGORI is a confident reading of a seal,
//                 and no such surveyor exists. 65 of the wrong pairs were rated "high".
//   the archive   fooled by a mistake repeated across sheets. Measured: RPLS 4606 was read as
//                 CHARLES C LUCKO on nineteen sheets — and the register says 4606 is Michael Lynn
//                 Turner. A consistent archive can be consistently wrong.
//   the register  silent about anyone it never licensed, and about work predating it.
//
// Because they fail differently, agreement between two is worth more than certainty from one — and
// a DISAGREEMENT is the most valuable output of the three, not a nuisance to be averaged away.
import { describe, it, expect } from 'vitest';
import {
  buildConsensus, corroborate, certainEnoughToCite, CERTAINTY_LABEL, CORROBORATION_THRESHOLD,
  type SurveyorReading,
} from '@/lib/research/surveyor-corroboration';
import type { VerificationResult } from '@/lib/research/surveyor-verification';

const confirmed = (name: string, licence: string): VerificationResult => ({
  verdict: 'confirmed', readName: name, readLicence: licence,
  rosterName: name, rosterLicence: licence, rosterStatus: 'Registered', note: 'register agrees',
});
const objects = (): VerificationResult => ({
  verdict: 'unmatched', readName: null, readLicence: null,
  rosterName: 'SOMEBODY ELSE', rosterLicence: '9999', rosterStatus: 'Expired', note: 'register lists somebody else',
});

const reading = (name: string | null, licence: string | null, verification: VerificationResult | null = null, id = 'd1'): SurveyorReading =>
  ({ documentId: id, name, licence, verification });

/** The real shape from the archive: one name dominant, several near-miss readings around it. */
function luckoArchive() {
  const rs: SurveyorReading[] = [];
  for (let i = 0; i < 15; i++) rs.push(reading('CHARLES C LUCKO', '4606', null, `ok${i}`));
  rs.push(reading('CHARLES C LICKO', '4606', null, 'v1'));
  rs.push(reading('CHARLES C LUDWIG', '4606', null, 'v2'));
  rs.push(reading('ROY MICHAEL SMITH', '4606', null, 'v3'));
  return rs;
}

describe('what the archive says about a licence number', () => {
  it('clusters near-identical spellings into one vote', () => {
    // LUCKO and LICKO are one substitution apart off a stamped seal. Counting them as rival
    // candidates would split the very evidence that settles the question.
    const c = buildConsensus(luckoArchive()).get('4606')!;
    expect(c.consensusName).toBe('CHARLES C LUCKO');
    expect(c.agreeing).toBe(16);
  });

  it('keeps the dissenting readings as evidence rather than discarding them', () => {
    const c = buildConsensus(luckoArchive()).get('4606')!;
    expect(c.dissenting).toBeGreaterThan(0);
    // The readings list is the working, not just the answer — a person can see what was rejected.
    expect(c.readings.map((r) => r.name)).toContain('ROY MICHAEL SMITH');
  });

  it('ignores a reading missing half the pair', () => {
    const c = buildConsensus([reading('NOBODY', null), reading(null, '1234')]);
    expect(c.size).toBe(0);
  });

  it('groups by LICENCE, because the licence is the thing being corroborated', () => {
    const c = buildConsensus([reading('A B SMITH', '111'), reading('A B SMITH', '222')]);
    expect(c.size).toBe(2);
  });
});

describe('when the witnesses agree', () => {
  it('register + archive = verified', () => {
    const consensus = buildConsensus(luckoArchive());
    const c = corroborate(reading('CHARLES C LUCKO', '4606', confirmed('CHARLES C LUCKO', '4606')), consensus);
    expect(c.certainty).toBe('verified');
    expect(c.why).toContain('16');
  });

  it('register alone, with a thin archive, is register_only', () => {
    const consensus = buildConsensus([reading('SOLO NAME', '777')]);
    const c = corroborate(reading('SOLO NAME', '777', confirmed('SOLO NAME', '777')), consensus);
    expect(c.certainty).toBe('register_only');
  });

  it('both are citable without opening the sheet', () => {
    expect(certainEnoughToCite('verified')).toBe(true);
    expect(certainEnoughToCite('register_only')).toBe(true);
  });
});

describe('when they disagree — the part that matters', () => {
  it('a lone reading against a settled archive is DISPUTED, not accepted', () => {
    // This is the CHARLES C LUDWIG case: one sheet against nineteen.
    const consensus = buildConsensus(luckoArchive());
    const c = corroborate(reading('CHARLES C LUDWIG', '4606'), consensus);
    expect(c.certainty).toBe('disputed');
    expect(c.why).toContain('does not support');
  });

  it('a settled archive the REGISTER rejects is disputed too, not blessed by weight of numbers', () => {
    // Nineteen sheets can be nineteen copies of one mistake. Reporting that as verified because
    // two of three witnesses agreed is exactly what this layer exists to prevent.
    const consensus = buildConsensus(luckoArchive());
    const c = corroborate(reading('CHARLES C LUCKO', '4606', objects()), consensus);
    expect(c.certainty).toBe('disputed');
  });

  it('a dispute is never citable', () => {
    expect(certainEnoughToCite('disputed')).toBe(false);
  });

  it('a dispute is reported before any agreement is claimed', () => {
    // Order of the checks is the policy. A minority reading that also happens to have a confirmed
    // register entry is still worth a person seeing the conflict.
    const consensus = buildConsensus(luckoArchive());
    const c = corroborate(reading('ROY MICHAEL SMITH', '4606'), consensus);
    expect(c.certainty).toBe('disputed');
  });
});

describe('the archive alone is evidence, but not enough', () => {
  it('many agreeing sheets with no register match is archive_only', () => {
    const rs = Array.from({ length: 5 }, (_, i) => reading('OLD TIMER', '55', null, `x${i}`));
    const c = corroborate(rs[0], buildConsensus(rs));
    expect(c.certainty).toBe('archive_only');
  });

  it('and archive_only is NOT citable', () => {
    // Agreement across sheets shows we READ it consistently — not that the licence exists. A
    // draftsman's house style reproduces the same mistake on every plat a firm ever filed.
    expect(certainEnoughToCite('archive_only')).toBe(false);
  });

  it('two agreeing sheets is a coincidence, three is a pattern', () => {
    const two = Array.from({ length: 2 }, (_, i) => reading('THIN NAME', '66', null, `y${i}`));
    expect(corroborate(two[0], buildConsensus(two)).certainty).toBe('uncorroborated');
    const three = Array.from({ length: CORROBORATION_THRESHOLD }, (_, i) => reading('THIN NAME', '66', null, `y${i}`));
    expect(corroborate(three[0], buildConsensus(three)).certainty).toBe('archive_only');
  });
});

describe('a single unconfirmed sheet says so plainly', () => {
  it('is uncorroborated', () => {
    const rs = [reading('ONLY ONCE', '4242')];
    expect(corroborate(rs[0], buildConsensus(rs)).certainty).toBe('uncorroborated');
  });

  it('and carries the register\'s reason when there is one', () => {
    const rs = [reading('ONLY ONCE', '4242', objects())];
    expect(corroborate(rs[0], buildConsensus(rs)).why).toContain('somebody else');
  });
});

describe('every certainty is explainable to a person', () => {
  it('has a label and a reason', () => {
    for (const k of ['verified', 'register_only', 'archive_only', 'disputed', 'uncorroborated'] as const) {
      expect(CERTAINTY_LABEL[k].length).toBeGreaterThan(10);
    }
  });

  it('the reason names the witnesses, not a score', () => {
    // A blended number would hide WHICH witness objected, and the objection is the actionable part.
    const consensus = buildConsensus(luckoArchive());
    const c = corroborate(reading('CHARLES C LUDWIG', '4606'), consensus);
    expect(c.why).toMatch(/\d+ other sheet/);
    expect(c.why).not.toMatch(/score|0\.\d/);
  });
});
