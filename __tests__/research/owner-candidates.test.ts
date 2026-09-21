// __tests__/research/owner-candidates.test.ts — the name a deed is actually recorded in.
//
// Every test here is anchored on a real failure. Job 26144's research run, 2026-09-21, searched the
// Williamson County clerk three times for "EBBY GREEN" and found nothing — while the owner sat in
// the job's own title and the client's email domain corroborated it.

import { describe, it, expect } from 'vitest';
import {
  ownerCandidates, bestOwnerName, organisationInTitle, organisationDomain,
  looksLikeOrganisation, describeOwnerCandidates,
} from '@/lib/research/owner-candidates';

/** The job, exactly as it is in the database. */
const JOB_26144 = {
  name: 'ROUND ROCK HOUSING AUTHORITY CUSHING DRIVE ',
  client_name: 'EBBY GREEN ',
  client_company: '',
  client_email: 'ebby@roundrockha.org',
};

describe('job 26144 — the run this module exists because of', () => {
  it('puts the housing authority first, not the employee', () => {
    const c = ownerCandidates(JOB_26144);
    expect(c[0]!.name).toBe('ROUND ROCK HOUSING AUTHORITY');
    expect(c[0]!.source).toBe('job-name');
    expect(c[0]!.isOrganisation).toBe(true);
  });

  it('still carries the person, last', () => {
    // Not discarded — Ebby Green may appear on a document, and the run should be able to try the
    // name. It just must not be the FIRST thing a fixed number of clerk searches is spent on.
    const c = ownerCandidates(JOB_26144);
    expect(c.map((x) => x.name)).toContain('EBBY GREEN');
    expect(c[c.length - 1]!.name).toBe('EBBY GREEN');
  });

  it('notices the work email and says what it implies', () => {
    const person = ownerCandidates(JOB_26144).find((x) => x.name === 'EBBY GREEN')!;
    expect(person.why).toContain('roundrockha.org');
    expect(person.why).toMatch(/acting for that organisation/i);
  });

  it('bestOwnerName is the authority', () => {
    expect(bestOwnerName(JOB_26144)).toBe('ROUND ROCK HOUSING AUTHORITY');
  });

  it('the briefing explains the order rather than just listing names', () => {
    const text = describeOwnerCandidates(JOB_26144)!;
    expect(text).toContain('ROUND ROCK HOUSING AUTHORITY');
    expect(text).toMatch(/FIRST/);
    expect(text, 'and warns what the bare personal name will do').toMatch(/likely to return nothing/i);
  });

  it('drops the street from the title', () => {
    // "CUSHING DRIVE" is where, not who.
    expect(organisationInTitle(JOB_26144.name)).toBe('ROUND ROCK HOUSING AUTHORITY');
  });

  it('treats an empty client_company as absent rather than as a name', () => {
    expect(ownerCandidates(JOB_26144).some((c) => c.source === 'client-company')).toBe(false);
  });
});

describe('organisationInTitle', () => {
  it.each([
    ['ROUND ROCK HOUSING AUTHORITY CUSHING DRIVE', 'ROUND ROCK HOUSING AUTHORITY'],
    ['SMITH FAMILY TRUST — 14 ACRES', 'SMITH FAMILY TRUST'],
    ['FIRST BAPTIST CHURCH LOT 4', 'FIRST BAPTIST CHURCH'],
    ['ACME PROPERTIES LLC BOUNDARY SURVEY', 'ACME PROPERTIES LLC'],
    ['GEORGETOWN ISD ELEMENTARY SITE', 'GEORGETOWN ISD'],
    ['BRUSHY CREEK MUD TRACT 2', 'BRUSHY CREEK MUD'],
    ['HILL COUNTRY DEVELOPMENT CORPORATION PHASE 3', 'HILL COUNTRY DEVELOPMENT CORPORATION'],
  ])('%s → %s', (title, want) => {
    expect(organisationInTitle(title)).toBe(want);
  });

  it('prefers the longer name when two keywords overlap', () => {
    // "HOUSING AUTHORITY" beats the bare "AUTHORITY" — the longer span is the more complete name.
    expect(organisationInTitle('TEMPLE HOUSING AUTHORITY SITE')).toBe('TEMPLE HOUSING AUTHORITY');
  });

  it('returns null rather than guessing a personal name', () => {
    // "SMITH TRACT" is ambiguous between a person and a place, and a wrong personal name costs a
    // clerk search and can send a researcher after the wrong family.
    expect(organisationInTitle('SMITH TRACT')).toBeNull();
    expect(organisationInTitle('1007 CUSHING DRIVE')).toBeNull();
    expect(organisationInTitle('BOUNDARY SURVEY')).toBeNull();
  });

  it('refuses a bare keyword with no name in front of it', () => {
    expect(organisationInTitle('LLC')).toBeNull();
    expect(organisationInTitle('TRUST')).toBeNull();
  });

  it('does not fire on a keyword buried inside another word', () => {
    // "CORP" must not match inside "INCORPORATED".
    expect(organisationInTitle('INCORPORATED VILLAGE SURVEY')).toBeNull();
  });

  it('"COUNTY ROAD 314" is a street, not an owner', () => {
    // COUNTY is an organisation word — Williamson County owns land — but with nothing in front of
    // it there is no name here, only a road. The "something before the keyword" rule covers this.
    expect(organisationInTitle('COUNTY ROAD 314 SURVEY')).toBeNull();
    expect(organisationInTitle('WILLIAMSON COUNTY ROAD 314'), 'but a named county is real')
      .toBe('WILLIAMSON COUNTY');
  });

  it('keeps the entity designator, which is the half a deed is filed under', () => {
    // Caught by this suite: listing PARTNERS before LP made "ACME PARTNERS LP" come back as
    // "ACME PARTNERS" — a different string from the recorded name, and so a search that finds
    // nothing. The rightmost keyword wins.
    expect(organisationInTitle('ACME PARTNERS LP NORTH TRACT')).toBe('ACME PARTNERS LP');
    expect(organisationInTitle('CEDAR HOLDINGS LLC PHASE 1')).toBe('CEDAR HOLDINGS LLC');
    expect(organisationInTitle('OAK PROPERTIES INC TRACT 2')).toBe('OAK PROPERTIES INC');
  });

  it.each([['empty', ''], ['spaces', '   '], ['null', null], ['undefined', undefined]])(
    '%s is null', (_l, v) => { expect(organisationInTitle(v as string | null)).toBeNull(); },
  );
});

describe('organisationDomain', () => {
  it('returns a work domain', () => {
    expect(organisationDomain('ebby@roundrockha.org')).toBe('roundrockha.org');
    expect(organisationDomain('J.Smith@BellTitle.COM')).toBe('belltitle.com');
  });

  it.each(['a@gmail.com', 'a@yahoo.com', 'a@outlook.com', 'a@icloud.com', 'a@att.net'])(
    '%s is not an organisation', (e) => { expect(organisationDomain(e)).toBeNull(); },
  );

  it.each([['no at', 'nobody'], ['empty', ''], ['null', null], ['no dot', 'a@localhost'], ['leading at', '@x.com']])(
    '%s is null', (_l, v) => { expect(organisationDomain(v as string | null)).toBeNull(); },
  );
});

describe('ordering is the whole point', () => {
  it('an organisation always outranks a person', () => {
    const c = ownerCandidates({
      name: 'ACME PARTNERS LP NORTH TRACT',
      client_name: 'John Doe',
      client_email: 'john@acmepartners.com',
    });
    expect(c[0]!.isOrganisation).toBe(true);
    expect(c[0]!.name).toBe('ACME PARTNERS LP');
  });

  it('an explicit company beats the contact but not the job title', () => {
    const c = ownerCandidates({
      name: 'CEDAR RIDGE HOA PHASE 2',
      client_company: 'Bell Title Co',
      client_name: 'Jane Roe',
    });
    expect(c.map((x) => x.source)).toEqual(['job-name', 'client-company', 'client-name']);
  });

  it('falls back to the person when there is no organisation anywhere', () => {
    const c = ownerCandidates({ name: 'SMITH TRACT', client_name: 'Bob Smith' });
    expect(c).toHaveLength(1);
    expect(c[0]!.name).toBe('Bob Smith');
    expect(c[0]!.isOrganisation).toBe(false);
  });

  it('never duplicates a name that appears twice', () => {
    const c = ownerCandidates({
      name: 'BELL TITLE CO SURVEY',
      client_company: 'BELL TITLE CO',
      client_name: 'BELL TITLE CO',
    });
    expect(c).toHaveLength(1);
  });

  it('is case-insensitive about duplicates', () => {
    const c = ownerCandidates({ client_company: 'Acme LLC', client_name: 'ACME LLC' });
    expect(c).toHaveLength(1);
  });

  it('an empty job produces no candidates and no crash', () => {
    expect(ownerCandidates({})).toEqual([]);
    expect(bestOwnerName({})).toBeNull();
    expect(describeOwnerCandidates({})).toBeNull();
  });
});

describe('looksLikeOrganisation', () => {
  it.each(['ROUND ROCK HOUSING AUTHORITY', 'ACME LLC', 'SMITH FAMILY TRUST', 'GEORGETOWN ISD'])(
    '%s is an organisation', (n) => { expect(looksLikeOrganisation(n)).toBe(true); },
  );

  it.each(['EBBY GREEN', 'John Doe', 'Maria Gonzalez-Ruiz'])(
    '%s is a person', (n) => { expect(looksLikeOrganisation(n)).toBe(false); },
  );
});
