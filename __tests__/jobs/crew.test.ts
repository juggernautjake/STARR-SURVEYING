import { describe, it, expect } from 'vitest';
import { jobCrew, jobRpls, crewNames, type JobCrewInput } from '@/lib/jobs/crew';

// Work Mode field hub (B2/B5) — "who's on this job": the lead RPLS + the crew under them, derived from
// job_team. Pure, so the hub's Job tab and any other surface split it the same way.
const job = (over: Partial<JobCrewInput>): JobCrewInput => ({ job_team: [], ...over });

describe('jobRpls', () => {
  it('names the lead_rpls team member', () => {
    expect(jobRpls(job({ job_team: [
      { role: 'lead_rpls', user_name: 'Dana Reyes' },
      { role: 'field_crew', user_name: 'Ben' },
    ] }))).toBe('Dana Reyes');
  });
  it('falls back to lead_rpls_email when no member carries the role', () => {
    expect(jobRpls(job({ job_team: [{ role: 'field_crew', user_name: 'Ben' }], lead_rpls_email: 'rpls@x.com' }))).toBe('rpls@x.com');
  });
  it('is null when nobody is assigned', () => {
    expect(jobRpls(job({ job_team: [], lead_rpls_email: null }))).toBeNull();
    expect(jobRpls(job({ job_team: null }))).toBeNull();
  });
});

describe('jobCrew', () => {
  it('is everyone EXCEPT the lead RPLS', () => {
    const crew = jobCrew(job({ job_team: [
      { role: 'lead_rpls', user_name: 'Dana' },
      { role: 'field_crew', user_name: 'Ben' },
      { role: 'tech', user_name: 'Ana' },
    ] }));
    expect(crew.map((m) => m.user_name)).toEqual(['Ben', 'Ana']);
  });
  it('is empty when the only member is the RPLS (→ "Just you" in the UI)', () => {
    expect(jobCrew(job({ job_team: [{ role: 'lead_rpls', user_name: 'Dana' }] }))).toHaveLength(0);
  });
});

describe('crewNames', () => {
  it('prefers name over email and joins with commas', () => {
    expect(crewNames([{ user_name: 'Ben' }, { user_email: 'ana@x.com' }])).toBe('Ben, ana@x.com');
  });
  it('skips members with neither name nor email', () => {
    expect(crewNames([{ user_name: 'Ben' }, {}, { user_name: null, user_email: null }])).toBe('Ben');
  });
});
