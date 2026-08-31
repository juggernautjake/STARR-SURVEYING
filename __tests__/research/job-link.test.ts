// __tests__/research/job-link.test.ts — Phase J1.
//
// ── A COLUMN, AN INDEX, AND NO WAY TO USE EITHER ────────────────────────────────────────────────
//
// `research_projects.job_id` has existed since `seeds/090_research_tables.sql:141`, with an index
// on it and a comment reading "optional link to a jobs record". Measured 2026-08-31:
//
//   · **zero** `.tsx` files under `app/admin/research` mentioned it;
//   · the POST route accepted it and no form ever sent it;
//   · the PATCH route's allowlist did not include it at all.
//
// So the only way to attach a research project to a job was to send `job_id` at creation, from a
// form that did not offer the field — and once created, nothing in the product could change it.
//
// That is this repository's other recurring shape, alongside the cast-that-matches-nothing: work
// that exists, is indexed, is half-wired, and is unreachable. `api-routes-are-reachable.test.ts`
// records eleven of them at the module level. This is the column-level equivalent.
//
// Owner: *"can link the research to a specific job if they want"*.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { jobLabel, type JobSummary } from '@/app/admin/research/components/JobLinkPicker';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const seeds = () => fs.readdirSync(path.join(ROOT, 'seeds')).filter((f) => f.endsWith('.sql'))
  .map((f) => read(`seeds/${f}`)).join('\n');

describe('the column this is built on', () => {
  it('exists, and is a real column rather than a memory', () => {
    // Control: the whole slice is pointless if `job_id` is not there. This is the assertion that
    // would have caught the reverse mistake — building UI for a column nobody created.
    expect(seeds()).toMatch(/job_id\s+UUID/i);
  });
});

describe('the API can set it, and can unset it', () => {
  const ROUTE = 'app/api/admin/research/route.ts';

  it('PATCH accepts job_id', () => {
    expect(read(ROUTE), 'the update route still cannot change the link')
      .toContain('updates.job_id !== undefined');
  });

  it('and treats null as UNLINK rather than as "leave it alone"', () => {
    // `job_id: job_id || null` in the POST path is fine — nothing to preserve there. On PATCH the
    // distinction matters: `undefined` means the caller did not mention it, `null` means detach.
    // Folding the two together would make unlinking impossible, which is a state somebody reaches.
    const src = read(ROUTE);
    const at = src.indexOf('updates.job_id !== undefined');
    const block = src.slice(at, at + 220);
    expect(block).toContain('updates.job_id ? String(updates.job_id) : null');
  });

  it('POST still accepts it too, so a project can be created already attached', () => {
    expect(read(ROUTE)).toContain('job_id: job_id || null');
  });
});

describe('and the product can reach it', () => {
  const MODAL = 'app/admin/research/[projectId]/_sections/EditProjectModal.tsx';
  const HEADER = 'app/admin/research/[projectId]/_sections/ProjectHeader.tsx';
  const PAGE = 'app/admin/research/[projectId]/page.tsx';

  it('the edit modal renders a picker', () => {
    expect(read(MODAL)).toContain('<JobLinkPicker');
    expect(read(MODAL)).toContain('job_id: jobId');
  });

  it('the page sends job_id when saving', () => {
    // `...editProjectData` is the payload, so the field has to be IN that object — putting it in
    // component state alone would render a picker that changes nothing.
    const src = read(PAGE);
    expect(src).toContain('job_id: (project as { job_id?: string | null }).job_id ?? null');
    expect(src).toContain('...editProjectData');
  });

  it('the header shows WHICH job, not just that there is one', () => {
    // A row reading "Linked" makes somebody open another tab to find out to what.
    expect(read(HEADER)).toContain('jobLabel(linkedJob)');
    expect(read(HEADER)).toContain('/admin/jobs/');
  });

  it('and the header is given the job', () => {
    expect(read(PAGE)).toContain('linkedJob={linkedJob}');
  });

  it('the picker brings its own stylesheet', () => {
    // Third instance in this repo of a shared component rendering unstyled because it relied on a
    // route-scoped sheet. This one is used outside /admin/research too.
    expect(read('app/admin/research/components/JobLinkPicker.tsx')).toContain("import './JobLinkPicker.css'");
  });

  it('and every colour it uses is a token that exists', () => {
    const css = read('app/admin/research/components/JobLinkPicker.css');
    const tokens = css.match(/var\((--[a-z-]+)/g)?.map((m) => m.slice(4)) ?? [];
    expect(tokens.length, 'the picker hard-codes its colours').toBeGreaterThanOrEqual(8);
    const defined = read('app/styles/tokens.css') + read('app/styles/themes.css');
    for (const t of tokens) {
      expect(defined, `${t} is read by JobLinkPicker.css and defined nowhere`).toContain(`${t}:`);
    }
  });
});

describe('naming a job the way a person would', () => {
  const job = (over: Partial<JobSummary> = {}): JobSummary => ({ id: 'abc12345-9999', ...over });

  it('leads with the job number, which is what somebody knows', () => {
    expect(jobLabel(job({ job_number: '26064', name: 'Pustka Boundary' })))
      .toBe('26064 — Pustka Boundary');
  });

  it('adds the address, because two jobs can share a name', () => {
    expect(jobLabel(job({ job_number: '26064', name: 'Boundary', address: '16991 Pecan School Rd', city: 'Holland' })))
      .toBe('26064 — Boundary · 16991 Pecan School Rd, Holland');
  });

  it('falls back to whatever it has', () => {
    expect(jobLabel(job({ address: '16991 Pecan School Rd' }))).toBe('16991 Pecan School Rd');
    expect(jobLabel(job({ name: 'Boundary' }))).toBe('Boundary');
  });

  it('and NEVER returns an empty string', () => {
    // The same property the document library needed, for the same reason: a blank row in a picker
    // is an option nobody can choose and looks like a rendering bug.
    for (const j of [job(), job({ job_number: '  ' }), job({ name: '', address: '' })]) {
      expect(jobLabel(j).trim().length, JSON.stringify(j)).toBeGreaterThan(0);
    }
  });
});
