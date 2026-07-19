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
    expect(SRC).toContain('job_team');
    // The RPLS-vs-crew split was extracted to lib/jobs/crew.ts (B5); the component consumes those helpers
    // rather than inlining the 'lead_rpls' role literal.
    expect(SRC).toContain("from '@/lib/jobs/crew'");
    expect(SRC).toContain('jobRpls(job)');
    expect(SRC).toContain('jobCrew(job)');
    const CREW = fs.readFileSync(path.join(process.cwd(), 'lib/jobs/crew.ts'), 'utf8');
    expect(CREW).toContain("'lead_rpls'"); // the role split lives in the tested helper now
  });

  it('reuses the shared location helpers for tap-to-navigate + tap-to-call', () => {
    expect(SRC).toContain("from '@/lib/jobs/location'");
    expect(SRC).toContain('jobMapsUrl(job)');
    expect(SRC).toContain('telHref(job.client_phone)');
  });

  it('B3 — has a calculator (safe evaluator) and a per-job notes pad', () => {
    expect(SRC).toContain('FieldCalculator');
    expect(SRC).toContain('evalArithmetic');
    expect(SRC).toContain('FieldNotes');
    expect(SRC).toContain('starr:field-notes:'); // notes persist per job
  });

  it('A3 — the Files tab lists the active job’s documents, grouped by section', () => {
    expect(SRC).toContain('JobFiles');
    expect(SRC).toContain('/api/admin/jobs/files?job_id=');
    expect(SRC).toContain('bySection');
  });

  it('the Photo tab reviews the job’s captured media (read-only gallery)', () => {
    expect(SRC).toContain('JobMedia');
    expect(SRC).toContain('/field-data');
    expect(SRC).toContain('job_media');
  });

  it('the Calc tab includes the surveying calculator bound to the shared operation catalog (Area D)', () => {
    // Renders SurveyingTools alongside the arithmetic FieldCalculator, driven by the pure catalog — no
    // re-implemented formula in the component.
    expect(SRC).toContain("from '@/lib/surveying/calculator'");
    expect(SRC).toContain('operationsByCategory()');
    expect(SRC).toContain('<SurveyingTools />');
    expect(SRC).toContain('op.compute(args)'); // the pure catalog compute drives the result
  });

  it('the Mileage tab is a real odometer tracker bound to the vehicles API + the pure entry resolver (D6)', () => {
    expect(SRC).toContain("from '@/lib/mileage/odometer'");
    expect(SRC).toContain('<MileageTracker />');
    expect(SRC).toContain("fetch('/api/admin/vehicles')"); // reuses the existing vehicles endpoint
    expect(SRC).toContain('resolveOdometerEntry(Number(start), Number(end))'); // pure compute drives miles + $
  });

  it('D2 — the Job tab lists every job contact with tap-to-call / tap-to-email', () => {
    expect(SRC).toContain('<JobContacts');
    expect(SRC).toContain('/api/admin/jobs/contacts?job_id=');
    expect(SRC).toContain('telHref(c.contact?.phone)'); // each contact phone is tappable, not just the client
    expect(SRC).toContain('mailto:');
  });

  it('D5 — the Instructions tab renders resolved segments over the instructions API', () => {
    expect(SRC).toContain('<JobInstructions');
    expect(SRC).toContain('/api/admin/jobs/${jobId}/instructions');
  });
});
