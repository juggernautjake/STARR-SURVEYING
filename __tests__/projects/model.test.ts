// __tests__/projects/model.test.ts — the project rules that are easy to get subtly wrong.

import { describe, it, expect } from 'vitest';
import {
  nextProjectNumber, inheritFromProject, overriddenFields, rollUp, projectLabel, suggestProjectName,
  isProjectStatus, PROJECT_STATUSES,
} from '@/lib/projects/model';

describe('project numbering', () => {
  it('starts at 0001 for a year with nothing in it', () => {
    expect(nextProjectNumber(2026, [])).toBe('P-2026-0001');
  });

  it('continues from the highest number, not the count', () => {
    // The whole reason this takes a max: with 0002 deleted, counting returns 0003, which already
    // exists — a unique-index failure, or a reused number on somebody's paperwork.
    expect(nextProjectNumber(2026, ['P-2026-0001', 'P-2026-0003'])).toBe('P-2026-0004');
  });

  it('ignores other years and anything that is not a project number', () => {
    expect(nextProjectNumber(2026, ['P-2025-0099', '2026-0042', '', 'P-2026-x'])).toBe('P-2026-0001');
  });

  it('is visibly not a job number', () => {
    expect(nextProjectNumber(2026, [])).toMatch(/^P-/);
  });
});

describe('what a job inherits', () => {
  const project = {
    client_name: 'Smith Holdings', client_email: 'ops@smith.example',
    address: '100 County Rd 12', county: 'Doña Ana', state: 'NM',
    customer_id: 'cust-1', lead_rpls_email: 'rpls@starr-surveying.com',
  };

  it('fills the blanks', () => {
    const job = inheritFromProject(project, { name: 'Boundary' });
    expect(job.client_name).toBe('Smith Holdings');
    expect(job.county).toBe('Doña Ana');
    expect(job.customer_id).toBe('cust-1');
  });

  it('NEVER overwrites what the caller supplied', () => {
    // Somebody typing a different address is telling you the job is on the adjoining parcel. The
    // project overwriting that would discard the more specific of the two facts.
    const job = inheritFromProject(project, { address: '102 County Rd 12' });
    expect(job.address).toBe('102 County Rd 12');
    expect(job.county).toBe('Doña Ana'); // the untouched ones still fill
  });

  it('treats whitespace as absent, so a blank box still inherits', () => {
    const job = inheritFromProject(project, { client_name: '   ' });
    expect(job.client_name).toBe('Smith Holdings');
  });

  it('does not invent values the project does not have', () => {
    const job = inheritFromProject({ client_name: 'X' }, { name: 'Topo' });
    expect(job.city).toBeUndefined();
  });

  it('leaves fields that are not inherited alone', () => {
    const job = inheritFromProject({ ...project, name: 'PROJECT NAME', stage: 'lead' }, { name: 'Boundary' });
    expect(job.name).toBe('Boundary');
    expect(job.stage).toBeUndefined();
  });

  it('reports what has diverged', () => {
    const job = inheritFromProject(project, { address: '102 County Rd 12' });
    expect(overriddenFields(project, job)).toEqual(['address']);
  });

  it('reports nothing diverged for a pure inherit', () => {
    const job = inheritFromProject(project, {});
    expect(overriddenFields(project, job)).toEqual([]);
  });
});

describe('the money roll-up', () => {
  it('adds the jobs up', () => {
    const r = rollUp([
      { quote_amount: 1000, final_amount: 1200, amount_paid: 1200 },
      { quote_amount: 500, amount_paid: 100 },
    ]);
    expect(r.jobs).toBe(2);
    expect(r.quoted).toBe(1500);
    expect(r.billable).toBe(1700);  // 1200 final + 500 falling back to its quote
    expect(r.paid).toBe(1300);
    expect(r.outstanding).toBe(400);
  });

  it('falls back to the quote when no final amount is set', () => {
    // A job in progress has a number the firm is counting on; reporting zero makes it look free.
    expect(rollUp([{ quote_amount: 800 }]).billable).toBe(800);
  });

  it('excludes deleted jobs entirely', () => {
    const r = rollUp([
      { quote_amount: 1000, amount_paid: 0 },
      { quote_amount: 9999, amount_paid: 0, deleted_at: '2026-08-01T00:00:00Z' },
    ]);
    expect(r.jobs).toBe(1);
    expect(r.billable).toBe(1000);
  });

  it('never reports a negative balance', () => {
    // An overpayment on one job must not silently cancel another job's genuine debt.
    const r = rollUp([
      { quote_amount: 100, final_amount: 100, amount_paid: 500 },
      { quote_amount: 300, amount_paid: 0 },
    ]);
    expect(r.outstanding).toBeGreaterThanOrEqual(0);
  });

  it('counts active and archived separately', () => {
    const r = rollUp([{ quote_amount: 1 }, { quote_amount: 1, is_archived: true }]);
    expect(r.active).toBe(1);
    expect(r.archived).toBe(1);
  });

  it('survives nulls and junk without producing NaN', () => {
    const r = rollUp([{ quote_amount: null, final_amount: undefined, amount_paid: null }]);
    expect(Number.isFinite(r.billable)).toBe(true);
    expect(r.billable).toBe(0);
  });

  it('is empty for a project with no jobs', () => {
    expect(rollUp([])).toMatchObject({ jobs: 0, billable: 0, outstanding: 0 });
  });
});

describe('the suggested name', () => {
  // Owner, 2026-08-19: "We will likely name the project by the name of the customer or location or
  // date or some combination of all 3."
  const AUG = new Date('2026-08-19T12:00:00Z');

  it('combines all three when it has all three', () => {
    expect(suggestProjectName({ client: 'Smith Holdings', location: 'Los Ebanos Estates', date: AUG }))
      .toBe('Smith Holdings — Los Ebanos Estates — Aug 2026');
  });

  it('leaves out what it does not have, rather than an empty separator', () => {
    // A name reading "— Edinburg — Aug 2026" looks like a bug, and people retype around bugs.
    expect(suggestProjectName({ location: 'Edinburg', date: AUG })).toBe('Edinburg — Aug 2026');
    expect(suggestProjectName({ client: 'Smith Holdings', date: AUG })).toBe('Smith Holdings — Aug 2026');
  });

  it('does not repeat itself when client and location are the same', () => {
    expect(suggestProjectName({ client: 'Smith Tract', location: 'smith tract', date: AUG }))
      .toBe('Smith Tract — Aug 2026');
  });

  it('never offers a bare date — that is a timestamp, not a name', () => {
    expect(suggestProjectName({ date: AUG })).toBe('');
  });

  it('offers nothing when it knows nothing', () => {
    expect(suggestProjectName({})).toBe('');
    expect(suggestProjectName({ client: '  ', location: null })).toBe('');
  });

  it('survives an invalid date without printing "Invalid Date"', () => {
    expect(suggestProjectName({ client: 'Smith', date: new Date('nonsense') })).toBe('Smith');
  });
});

describe('labels and status', () => {
  it('titles a project by its number and name', () => {
    expect(projectLabel({ project_number: 'P-2026-0014', name: 'Smith Tract' })).toBe('P-2026-0014 — Smith Tract');
  });
  it('still titles a project with no number yet', () => {
    expect(projectLabel({ name: 'Smith Tract' })).toBe('Smith Tract');
    expect(projectLabel({})).toBe('Untitled project');
  });
  it('recognises exactly the four statuses', () => {
    for (const s of PROJECT_STATUSES) expect(isProjectStatus(s)).toBe(true);
    expect(isProjectStatus('archived')).toBe(false);
    expect(isProjectStatus(null)).toBe(false);
  });
});
