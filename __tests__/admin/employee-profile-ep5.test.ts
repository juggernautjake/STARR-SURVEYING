// __tests__/admin/employee-profile-ep5.test.ts
//
// Slice EP5 — "Jobs I've worked on" — new API endpoint that
// joins `job_team` with `jobs` and a new card on ProfilePanel.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('API /api/admin/profile/jobs (EP5)', () => {
  const SRC = read('app/api/admin/profile/jobs/route.ts');

  it('non-admins are scoped to their own email', () => {
    expect(SRC).toMatch(/!isAdmin\(session\.user\.roles\) && email !== session\.user\.email/);
  });

  it('queries job_team by user_email ordered by latest assigned_from first', () => {
    expect(SRC).toMatch(/\.from\('job_team'\)[\s\S]*?\.eq\('user_email', email\)[\s\S]*?\.order\('assigned_from', \{ ascending: false/);
  });

  it('hydrates the matching jobs rows in a single follow-up `.in()` query', () => {
    expect(SRC).toMatch(/\.from\('jobs'\)[\s\S]*?\.in\('id', jobIds\)/);
  });

  it('collapses duplicate job_team rows by job_id keeping the most recent assignment', () => {
    expect(SRC).toMatch(/seen\.has\(row\.job_id\)/);
    expect(SRC).toMatch(/seen\.add\(row\.job_id\)/);
  });

  it('returns is_crew_lead as a boolean (not nullable downstream)', () => {
    expect(SRC).toMatch(/is_crew_lead: row\.is_crew_lead === true/);
  });
});

describe('ProfilePanel — Jobs worked card (EP5)', () => {
  const SRC = read('app/admin/profile/ProfilePanel.tsx');

  it('holds workedJobs + workedJobsLoading state', () => {
    expect(SRC).toMatch(/const \[workedJobs, setWorkedJobs\] = useState<Array<\{/);
    expect(SRC).toMatch(/const \[workedJobsLoading, setWorkedJobsLoading\] = useState/);
  });

  it('fetches from /api/admin/profile/jobs scoped to the signed-in email', () => {
    expect(SRC).toMatch(/`\/api\/admin\/profile\/jobs\?email=\$\{encodeURIComponent\(email\)\}`/);
  });

  it('renders the card with a stable testid + empty state copy', () => {
    expect(SRC).toMatch(/data-testid="profile-worked-jobs"/);
    expect(SRC).toMatch(/haven&apos;t been assigned to any jobs/);
  });

  it("each row links to /admin/jobs/<id> + has a stable per-row testid", () => {
    expect(SRC).toMatch(/data-testid=\{`profile-worked-job-\$\{j\.job_id\}`\}/);
    expect(SRC).toMatch(/href=\{`\/admin\/jobs\/\$\{j\.job_id\}`\}/);
  });

  it('shows a "Crew lead" badge with its own testid when is_crew_lead', () => {
    expect(SRC).toMatch(/data-testid=\{`profile-worked-job-\$\{j\.job_id\}-lead`\}/);
    expect(SRC).toMatch(/Crew lead/);
  });
});
