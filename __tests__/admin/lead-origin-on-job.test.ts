// __tests__/admin/lead-origin-on-job.test.ts
//
// LR6 of lead-reply-expansion-2026-06-18.md — when a lead converts to
// a job, the lead_replies + lead_notes stay linked to the lead. The
// job page now surfaces an "Originating inquiry" card so the running
// conversation isn't lost after conversion.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('origin-lead API route', () => {
  const SRC = read('app/api/admin/jobs/[id]/origin-lead/route.ts');

  it("gates GET on admin auth", () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
    expect(SRC).toMatch(/'Forbidden'/);
  });

  it("looks up the lead by converted_job_id", () => {
    expect(SRC).toMatch(/\.from\('leads'\)[\s\S]{0,200}\.eq\('converted_job_id', jobId\)[\s\S]{0,200}\.maybeSingle\(\)/);
  });

  it("returns { lead: null } when no lead converted to this job", () => {
    expect(SRC).toMatch(/return NextResponse\.json\(\{ lead: null \}\)/);
  });

  it("counts the lead's outbound replies + office notes for the card hint", () => {
    expect(SRC).toMatch(/\.from\('lead_replies'\)[\s\S]{0,200}\{ count: 'exact', head: true \}[\s\S]{0,200}\.eq\('lead_id', lead\.id\)/);
    expect(SRC).toMatch(/\.from\('lead_notes'\)[\s\S]{0,200}\{ count: 'exact', head: true \}[\s\S]{0,200}\.eq\('lead_id', lead\.id\)/);
  });

  it("includes the most recent reply's sent_at as last_replied_at", () => {
    expect(SRC).toMatch(/\.from\('lead_replies'\)[\s\S]{0,200}\.select\('sent_at'\)[\s\S]{0,200}\.order\('sent_at', \{ ascending: false \}\)[\s\S]{0,200}\.limit\(1\)/);
    expect(SRC).toMatch(/last_replied_at:/);
  });

  it("pulls the SS-… reference number out of the lead's notes", () => {
    expect(SRC).toMatch(/extractRefNumber\(lead\.notes\)/);
  });
});

describe('JobOriginatingLead component', () => {
  const SRC = read('app/admin/jobs/[id]/JobOriginatingLead.tsx');

  it("renders the canonical data-testid", () => {
    expect(SRC).toMatch(/data-testid="job-originating-lead"/);
  });

  it("fetches from /api/admin/jobs/{id}/origin-lead", () => {
    expect(SRC).toMatch(/\/api\/admin\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/origin-lead/);
  });

  it("silently renders nothing when there's no originating lead", () => {
    expect(SRC).toMatch(/if \(!loaded \|\| !lead\) return null;/);
  });

  it("renders reply count + notes count + last-reply ago line", () => {
    expect(SRC).toMatch(/data-testid="job-originating-lead-replies"/);
    expect(SRC).toMatch(/data-testid="job-originating-lead-notes"/);
    expect(SRC).toMatch(/data-testid="job-originating-lead-last"/);
  });

  it("links to /admin/leads/{leadId} so the surveyor can jump back to the conversation", () => {
    expect(SRC).toMatch(/href=\{`\/admin\/leads\/\$\{encodeURIComponent\(lead\.id\)\}`\}/);
    expect(SRC).toMatch(/data-testid="job-originating-lead-link"/);
  });

  it("shows the reference number as a chip in the header", () => {
    expect(SRC).toMatch(/lead\.reference_number && \(/);
  });
});

describe('job detail page mounts JobOriginatingLead', () => {
  const SRC = read('app/admin/jobs/[id]/page.tsx');

  it("imports the component", () => {
    expect(SRC).toMatch(/import JobOriginatingLead from '\.\/JobOriginatingLead'/);
  });

  it("renders <JobOriginatingLead /> at the top of the overview main column", () => {
    expect(SRC).toMatch(/<JobOriginatingLead jobId=\{jobId\} \/>/);
  });
});
