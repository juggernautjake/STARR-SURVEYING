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

// ── STARTING RESEARCH FROM A JOB (Phase J2) ─────────────────────────────────────────────────────
//
// J1 made the link possible. This is the side a person actually starts from: they are looking at a
// job and want the deeds for it. `?new=1&job=<id>` opens the research form pre-filled from the job
// and already attached to it.
//
// The point is not saved keystrokes. The attachment is the thing that gets forgotten when it has to
// be made afterwards, and research nobody attached is research nobody bills for. The address,
// county and state on a job have also already been checked by somebody, so the scope verdict the
// form shows is about a real property rather than about what was typed.

describe('starting research from a job', () => {
  const TAB = read('app/admin/research/_tabs/ProjectsTab.tsx');
  const JOB = read('app/admin/jobs/[id]/page.tsx');

  it('the job page offers it, carrying the job id', () => {
    expect(JOB).toContain('/admin/research?new=1&job=${jobId}');
  });

  it('the research form reads the job param', () => {
    expect(TAB).toContain("searchParams?.get('job')");
    expect(TAB).toContain('/api/admin/jobs?id=');
  });

  it('and pre-links as well as pre-fills', () => {
    // Pre-filling without pre-linking would be the half that does not matter: the address can be
    // retyped, the attachment is what gets forgotten.
    expect(TAB).toContain('job_id: job.id');
    expect(TAB).toContain('setCreateLinkedJob(job)');
  });

  it('job_id is part of the create state\'s TYPE, so it reaches the server', () => {
    // Setting it only inside the updater COMPILES — a spread does not trigger excess-property
    // checks — and then silently never reaches the POST body, because the body is
    // `{ ...newProject }`. It has to be in the initial state.
    expect(TAB).toContain('job_id: null as string | null,');
  });

  it('and is reset after a successful create', () => {
    // Otherwise the next project inherits the last one's job, which is worse than no link: it is a
    // wrong one, silently.
    const at = TAB.indexOf('setNewProject({ name:');
    expect(at).toBeGreaterThan(-1);
    expect(TAB.slice(at, at + 300)).toContain('job_id: null');
  });

  it('an empty field on the job does not blank a default', () => {
    // `state` starts as 'TX'. A job with no state must leave it there rather than clear it, or
    // arriving from a job makes the scope check WORSE than starting from scratch.
    expect(TAB).toContain('state: job.state?.trim() || p.state');
  });

  it('and a failed job lookup still opens the form', () => {
    // Refusing to open the form because a job could not be fetched is a worse answer than an empty
    // form — the person came here to start research either way.
    const at = TAB.indexOf("searchParams?.get('job')");
    expect(TAB.slice(at, at + 1800)).toMatch(/catch\s*\{/);
  });

  it('the create modal offers the picker even without the deep link', () => {
    expect(TAB).toContain('id="create-project-job"');
  });
});

// ── THE ONE FIELD A JOB USUALLY CANNOT FILL IN ──────────────────────────────────────────────────
//
// J2's own reasoning was that "the address, county and state on a job have already been checked by
// somebody". Two of those three hold. Measured against the live database on 2026-08-31, of six
// jobs sampled: **four had an empty or null county**. Every one had a state.
//
// So the common outcome of arriving from a job is a form that looks completely filled in, with the
// single field that decides which clerk is searched — and therefore whether the run spends money —
// blank and unremarked. `CountyNote` says nothing about an empty county on purpose (a blank field
// is not a mistake while somebody is still typing), and `checkScope('TX', '')` returns `unknown`,
// which `ScopeNotice` also renders as nothing. Two components correctly staying quiet add up to a
// silence in the one case where there is something to say.

describe('when the job has no county', () => {
  const TAB = read('app/admin/research/_tabs/ProjectsTab.tsx');

  it('the form says so, at the field', () => {
    expect(TAB).toContain('setJobHadNoCounty(!job.county?.trim())');
    expect(TAB).toContain('This job has no county on it');
  });

  it('in a class the sheet THIS file loads defines', () => {
    // First attempt reused `research-county-note--warn`, which lives in CountyNote.css — a sheet
    // CountyNote imports and ProjectsTab does not. It rendered correctly, because CountyNote is
    // mounted on the same page and pulls the sheet in, and `rendered-classes-are-styled` went
    // 454 -> 456. The guard was right: the styling worked by proximity, and removing CountyNote
    // from this page would have silently unstyled the note.
    expect(TAB).toContain('className="research-prefill-note"');
    expect(TAB, 'borrowing a sheet this file does not import')
      .not.toContain('research-county-note--warn');
    expect(read('app/admin/styles/AdminResearch.css')).toContain('.research-prefill-note {');
  });

  it('and only while it is still empty, so it cannot nag', () => {
    // Keyed off the live field rather than a flag alone: typing a county must clear it without
    // needing a second setter to remember to fire.
    expect(TAB).toContain('jobHadNoCounty && !newProject.county.trim()');
  });

  it('the flag resets with the rest of the form', () => {
    // Otherwise the next project created in the same session inherits the warning from the last.
    const at = TAB.indexOf('setNewProject({ name:');
    expect(TAB.slice(at, at + 420)).toContain('setJobHadNoCounty(false)');
  });

  it('and the county is NOT guessed from the city', () => {
    // The form knows "Buda" and could derive Hays County. It must not. A wrong county routes to the
    // wrong clerk and produces a confident report about somebody else's land; a blank one produces
    // a question. This is the assertion that stops a future "helpful" city→county lookup landing
    // here without the routing consequences being thought through.
    const at = TAB.indexOf("searchParams?.get('job')");
    const effect = TAB.slice(at, at + 1800);
    expect(effect).toContain('county: job.county?.trim() || p.county');
    expect(effect, 'the county is being inferred from something other than the job')
      .not.toMatch(/county:(?!\s*job\.county)/);
  });

  it('control: the no-guess check can fail', () => {
    // It could not, when first written. `/county:s*(?!job.county)/` matches the CORRECT line:
    // `s*` backtracks to zero width, the lookahead then reads " job.county" rather than
    // "job.county", and the negative passes. The quantifier has to be INSIDE the lookahead. This
    // control is the only reason that was caught rather than shipped as a guard against nothing.
    expect('county: cityToCounty(job.city),').toMatch(/county:(?!\s*job\.county)/);
    expect('county: job.county?.trim() || p.county,').not.toMatch(/county:(?!\s*job\.county)/);
  });
});
