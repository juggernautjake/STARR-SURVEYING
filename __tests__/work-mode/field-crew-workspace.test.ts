import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// workmode B1/B2 — the Field Crew workspace is a real, job-driven hub, not the old scaffold.
const SRC = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/work-mode/field_crew/_components/FieldCrewWorkspace.tsx'),
  'utf8',
);

describe('FieldCrewWorkspace is job-driven (B1/B2)', () => {
  it('B1 — loads real jobs and picks one via a <select>, not the placeholder input', () => {
    expect(SRC).toContain("fetch('/api/admin/jobs?limit=200')");
    expect(SRC).toContain('<select');
    expect(SRC).not.toContain('placeholder="Pick a job…"'); // the old scaffold input is gone
    expect(SRC).toContain('setJobId'); // selection persists to the work-mode store
  });

  it('B2 — the Job tab pulls the active job’s customer / property / RPLS / crew', () => {
    expect(SRC).toContain('JobSummary');
    expect(SRC).toContain('client_name');
    expect(SRC).toContain("'lead_rpls'"); // splits RPLS out of the crew list
    expect(SRC).toContain('job_team');
  });

  it('reuses the shared location helpers for tap-to-navigate + tap-to-call', () => {
    expect(SRC).toContain("from '@/lib/jobs/location'");
    expect(SRC).toContain('jobMapsUrl(job)');
    expect(SRC).toContain('telHref(job.client_phone)');
  });
});
