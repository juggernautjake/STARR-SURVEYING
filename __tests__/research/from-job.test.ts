// __tests__/research/from-job.test.ts — the two mappings that would never have thrown.
//
// Owner, 2026-09-20: the research button "should inherit all of the information for the job such as
// any documents, address, property id, customer name, etc".
//
// Two of those do not exist on a job, and the interesting tests here are the ones that pin down
// what happens instead. A `jobs` row has no owner — only `client_name`, the person who HIRED us —
// and no parcel id, only legal-description parts. Both gaps produce silent wrongness if papered
// over: a realtor's name searched as a grantor returns nothing and reads as "no conveyance
// recorded", and an abstract number sent as a parcel id queries the wrong namespace entirely.

import { describe, it, expect } from 'vitest';
import {
  researchPrefillFromJob, researchCreateBody, composeLegalSummary, composeProjectName,
  type JobForResearch,
} from '@/lib/research/from-job';

const job = (over: Partial<JobForResearch> = {}): JobForResearch => ({
  id: 'job-1',
  job_number: '2026-114',
  name: 'Boundary — Whitfield tract',
  address: '4110 W Adams Ave',
  city: 'Temple',
  state: 'TX',
  zip: '76504',
  county: 'Bell',
  survey_type: 'Boundary',
  acreage: 2.31,
  lot_number: '4',
  subdivision: 'Sunset Acres',
  abstract_number: 'A-123',
  client_name: 'Dana Whitfield',
  client_company: null,
  project_id: 'proj-9',
  ...over,
});

describe('the ordinary case carries everything across', () => {
  const p = researchPrefillFromJob(job());

  it('takes the address in parts', () => {
    expect(p.propertyAddress).toBe('4110 W Adams Ave');
    expect(p.city).toBe('Temple');
    expect(p.state).toBe('TX');
    expect(p.zip).toBe('76504');
    expect(p.county).toBe('Bell');
  });

  it('links the job and its project', () => {
    expect(p.jobIds).toEqual(['job-1']);
    expect(p.projectId).toBe('proj-9');
  });

  it('names the project so two surveys on one street stay apart', () => {
    expect(p.name).toBe('4110 W Adams Ave (Job 2026-114)');
  });
});

describe('a job has no owner, only a client — and the briefing says so', () => {
  it('carries the name, because it is the only one a job has', () => {
    expect(researchPrefillFromJob(job()).ownerName).toBe('Dana Whitfield');
  });

  it('flags it as assumed rather than established', () => {
    expect(researchPrefillFromJob(job()).ownerIsAssumed).toBe(true);
  });

  it('spells out the caveat IN THE BRIEFING, every time', () => {
    // This is the load-bearing assertion in the file. The run feeds owner_name to a clerk
    // grantor/grantee search. A realtor's name produces an empty result, and an empty result read
    // as fact becomes "no conveyance recorded" — a wrong answer about somebody's property.
    //
    // The wording moved into describeOwnerCandidates on 2026-09-21; the requirement did not.
    const notes = researchPrefillFromJob(job()).intakeNotes;
    expect(notes).toContain('Dana Whitfield');
    expect(notes).toMatch(/may or may not be the record owner/i);
  });

  it('when the job TITLE names an organisation, that goes first', () => {
    // Job 26144, 2026-09-21. The run searched the clerk three times for the contact and found
    // nothing, while the owner sat in the job's own title.
    const p = researchPrefillFromJob(job({
      name: 'ROUND ROCK HOUSING AUTHORITY CUSHING DRIVE',
      client_name: 'EBBY GREEN',
      client_company: null,
      client_email: 'ebby@roundrockha.org',
    }));
    expect(p.ownerName).toBe('ROUND ROCK HOUSING AUTHORITY');
    expect(p.supplemental.ownerNames, 'the contact is still searchable, just not first')
      .toEqual(['ROUND ROCK HOUSING AUTHORITY', 'EBBY GREEN']);
    expect(p.intakeNotes).toMatch(/FIRST/);
    expect(p.intakeNotes, 'and the work domain is named as evidence').toContain('roundrockha.org');
  });

  it('falls back to the company when there is no personal name', () => {
    const p = researchPrefillFromJob(job({ client_name: null, client_company: 'Bell Title Co' }));
    expect(p.ownerName).toBe('Bell Title Co');
    expect(p.ownerIsAssumed).toBe(true);
  });

  it('is honestly null when the job names nobody', () => {
    const p = researchPrefillFromJob(job({ client_name: null, client_company: null }));
    expect(p.ownerName).toBeNull();
    expect(p.ownerIsAssumed).toBe(false);
    expect(p.missing.join(' ')).toMatch(/owner or client name/i);
  });
});

describe('a job has no parcel id, and one is never invented', () => {
  it('parcelId is null even when the job has an abstract number', () => {
    // An abstract number is a legal-description part. A parcel id is the appraisal district's own
    // key. Putting one in the other's field queries the wrong namespace and can return somebody
    // else's parcel.
    const p = researchPrefillFromJob(job({ abstract_number: 'A-123' }));
    expect(p.parcelId).toBeNull();
  });

  it('says so in `missing`, ALWAYS, so a blank field is explained', () => {
    for (const over of [{}, { abstract_number: null }, { lot_number: null, subdivision: null }]) {
      const p = researchPrefillFromJob(job(over));
      expect(p.missing.join(' '), JSON.stringify(over)).toMatch(/parcel \/ property id/i);
    }
  });

  it('puts the legal parts where they belong instead', () => {
    const p = researchPrefillFromJob(job());
    // "A-123" is left as written — it already reads as an abstract, and "Abstract A-123" would be
    // saying it twice. The labelling rule only fires on a bare number; see composeLegalSummary below.
    expect(p.legalDescriptionSummary).toBe('Lot 4, Sunset Acres, A-123');
    expect(p.supplemental.abstracts).toEqual(['A-123']);
    expect(p.supplemental.lots).toEqual(['4']);
    expect(p.supplemental.subdivisions).toEqual(['Sunset Acres']);
  });
});

describe('composeLegalSummary', () => {
  it('labels a bare number so it reads as a legal description', () => {
    expect(composeLegalSummary(job({ subdivision: null, abstract_number: null }))).toBe('Lot 4');
  });

  it('does not double a label the data already carries', () => {
    expect(composeLegalSummary(job({ lot_number: 'Lot 4B', subdivision: null, abstract_number: null })))
      .toBe('Lot 4B');
    expect(composeLegalSummary(job({ lot_number: null, subdivision: null, abstract_number: 'Abstract 77' })))
      .toBe('Abstract 77');
    // "A-123" already looks like an abstract and is left alone.
    expect(composeLegalSummary(job({ lot_number: null, subdivision: null, abstract_number: 'A-123' })))
      .toBe('A-123');
  });

  it('is null when the job records none of the parts', () => {
    expect(composeLegalSummary(job({ lot_number: null, subdivision: null, abstract_number: null }))).toBeNull();
  });
});

describe('composeProjectName', () => {
  it('falls back to the job name when there is no address', () => {
    expect(composeProjectName(job({ address: null }))).toBe('Boundary — Whitfield tract (Job 2026-114)');
  });

  it('never returns an empty name', () => {
    // `name` is required by the create route; an empty one is a 400 the operator cannot act on.
    expect(composeProjectName({ id: 'x' })).toBe('Property research');
    expect(composeProjectName({ id: 'x', address: '   ', name: '  ' })).toBe('Property research');
  });
});

describe('missing tells the operator what will block the run', () => {
  it('names the address and the county when the job has neither', () => {
    const p = researchPrefillFromJob(job({ address: null, county: null }));
    expect(p.missing.join(' ')).toMatch(/street address/i);
    expect(p.missing.join(' ')).toMatch(/county/i);
  });

  it('a complete job still reports the parcel id, and nothing else', () => {
    const p = researchPrefillFromJob(job());
    expect(p.missing).toHaveLength(1);
    expect(p.missing[0]).toMatch(/parcel/i);
  });
});

describe('blank-ish values are treated as absent, not as data', () => {
  it.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
  ])('%s address', (_l, v) => {
    const p = researchPrefillFromJob(job({ address: v as string | null }));
    expect(p.propertyAddress).toBeNull();
    expect(p.missing.join(' ')).toMatch(/street address/i);
  });

  it('defaults the state to TX rather than leaving it null', () => {
    // A null state makes the county lookup ambiguous — there is a Bell County in Texas and a Bell
    // County in Kentucky, Florida and Texas alike.
    expect(researchPrefillFromJob(job({ state: null })).state).toBe('TX');
    expect(researchPrefillFromJob(job({ state: '  ' })).state).toBe('TX');
  });

  it('reads a numeric acreage without turning it into "[object Object]"', () => {
    expect(researchPrefillFromJob(job({ acreage: 2.31 })).intakeNotes).toMatch(/Acreage on the job: 2\.31/);
  });
});

describe('the create body cannot drift from the prefill', () => {
  const p = researchPrefillFromJob(job());
  const body = researchCreateBody(p);

  it('sends every field the prefill collected', () => {
    expect(body).toMatchObject({
      name: p.name,
      property_address: p.propertyAddress,
      city: p.city,
      state: p.state,
      zip: p.zip,
      county: p.county,
      parcel_id: null,
      owner_name: p.ownerName,
      intake_notes: p.intakeNotes,
      project_id: p.projectId,
      job_ids: p.jobIds,
    });
  });

  it('mirrors the first job into job_id for the older readers of seed 090', () => {
    expect(body.job_id).toBe('job-1');
  });

  it('carries the caveat into the database, not just onto the screen', () => {
    // intake_notes is what the AI briefing reads. If the warning lived only in the confirm dialog
    // it would be seen once by the operator and never by the thing doing the research.
    expect(String(body.intake_notes)).toMatch(/may or may not be the record owner/i);
  });

  it('sends every owner candidate, not just the first', () => {
    // supplemental.ownerNames is searched by the run. A second name here is a second chance at the
    // grantor index rather than a note nobody reads.
    const org = researchCreateBody(researchPrefillFromJob(job({
      name: 'CEDAR RIDGE HOA PHASE 2', client_name: 'Jane Roe', client_company: null,
    })));
    expect((org.supplemental as { ownerNames?: string[] }).ownerNames)
      .toEqual(['CEDAR RIDGE HOA', 'Jane Roe']);
    expect(org.owner_name).toBe('CEDAR RIDGE HOA');
  });
});

/**
 * The owner and the client are two different people (seed 655).
 *
 * Job 26144: "ROUND ROCK HOUSING AUTHORITY CUSHING DRIVE" at 1007 Cushing Drive, client_name
 * EBBY GREEN — a person who works at the housing authority. The clerk was searched for her name
 * three times and found nothing, because a grantor index records who signed a deed, not who
 * telephoned a surveyor. The record owner was CITY OF ROUND ROCK.
 *
 * `owner_name` is where the office writes that down when it knows it. When it is blank — the normal
 * case — the inference from the job title and the client's email domain does the work exactly as
 * before.
 */
describe('owner_name is not client_name', () => {
  const job26144 = {
    job_number: '26144',
    name: 'ROUND ROCK HOUSING AUTHORITY CUSHING DRIVE ',
    address: '1007 Cushing Drive',
    city: 'Round Rock', state: 'TX', county: 'Williamson',
    client_name: 'EBBY GREEN ',
    client_email: 'ebby@roundrockha.org',
  } as never;

  it('uses a stated owner over anything inferred', () => {
    const p = researchPrefillFromJob({ ...(job26144 as object), owner_name: 'CITY OF ROUND ROCK' } as never);
    expect(p.ownerName).toBe('CITY OF ROUND ROCK');
    // And it is NOT flagged as an assumption, because a person typed it.
    expect(p.ownerIsAssumed).toBe(false);
  });

  it('never hands the clerk the client as the owner', () => {
    // The whole defect in one assertion.
    for (const owner of ['CITY OF ROUND ROCK', null, undefined]) {
      const p = researchPrefillFromJob({ ...(job26144 as object), owner_name: owner } as never);
      expect(p.ownerName, String(owner)).not.toMatch(/EBBY GREEN/i);
    }
  });

  it('still infers when nobody stated one, and says that it did', () => {
    const p = researchPrefillFromJob(job26144);
    expect(p.ownerName).toBeTruthy();
    expect(p.ownerIsAssumed).toBe(true);
  });

  it('keeps a stated owner at the front of the names the run will try', () => {
    const p = researchPrefillFromJob({ ...(job26144 as object), owner_name: 'CITY OF ROUND ROCK' } as never);
    expect(p.supplemental?.ownerNames?.[0]).toBe('CITY OF ROUND ROCK');
    // without duplicating it if the inference produced the same name
    const names = p.supplemental?.ownerNames ?? [];
    expect(new Set(names).size).toBe(names.length);
  });

  it('inherits the county the job carries', () => {
    expect(researchPrefillFromJob(job26144).county).toBe('Williamson');
    // and says so plainly when it is missing, rather than starting a run that cannot pick a clerk
    const noCounty = researchPrefillFromJob({ ...(job26144 as object), county: null } as never);
    expect(noCounty.county).toBeNull();
    expect(noCounty.missing.join(' ')).toMatch(/county/i);
  });
});
