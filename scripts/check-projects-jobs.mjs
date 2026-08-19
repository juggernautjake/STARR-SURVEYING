// scripts/check-projects-jobs.mjs — does the project → job hierarchy actually work end to end?
//
// The unit tests pin the RULES (numbering, inheritance, roll-up arithmetic). They cannot show that
// the API refuses a job with no project, that a job created inside a project really inherits its
// client and site, that the nav carries the new pages, or that the project's folder in the File
// Explorer contains its jobs' files — and "authored but not wired" is this repo's most common
// defect.
//
// ── WHAT IT TOUCHES, AND HOW IT PUTS IT BACK ────────────────────────────────────────────────────
//
// Creates ONE project and TWO jobs inside it, then removes all three. Cleanup runs even on failure
// and reports what it could not undo.
//
// Usage: node --env-file=.env.local scripts/check-projects-jobs.mjs [--base URL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import pg from 'pg';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3212';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const OUT = arg('--out') ?? 'docs/planning/qa-evidence';

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }
if (!process.env.SUPABASE_DB_URL) { console.error('SUPABASE_DB_URL is not set'); process.exit(2); }

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const token = await encode({
  token: { email: AS, name: 'Projects check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => bad(`page error: ${String(e).slice(0, 200)}`));

let projectId = null;
const jobIds = [];

const CLIENT = 'Smith Holdings QA';
const ADDRESS = '100 County Road 12';
const COUNTY = 'Hidalgo';

try {
  // ── A job with no project must be refused ────────────────────────────────────────────────────
  console.log(`\n  ${BASE} — the rule that every job has a project\n`);
  const orphan = await page.request.post(`${BASE}/api/admin/jobs`, {
    data: { name: 'QA — orphan job', survey_type: 'boundary' },
  });
  if (orphan.status() === 400) {
    const body = await orphan.json();
    ok(`a job with no project is refused: "${String(body.error).slice(0, 60)}…"`);
  } else {
    bad(`a job with no project returned ${orphan.status()} — the hierarchy is optional after all`);
    const b = await orphan.json().catch(() => ({}));
    if (b.job?.id) jobIds.push(b.job.id);
  }

  // ── Create a project ─────────────────────────────────────────────────────────────────────────
  console.log(`\n  ${BASE}/admin/projects — creating one\n`);
  const made = await page.request.post(`${BASE}/api/admin/projects`, {
    data: {
      name: 'QA — Smith Tract', description: 'Created by the projects check.',
      client_name: CLIENT, client_email: 'ops@smith.example',
      address: ADDRESS, city: 'Edinburg', state: 'TX', county: COUNTY,
    },
  });
  if (!made.ok()) { bad(`could not create a project (${made.status()}): ${(await made.text()).slice(0, 160)}`); throw new Error('no project'); }
  const project = (await made.json()).project;
  projectId = project.id;
  ok(`created ${project.project_number} — ${project.name}`);
  if (/^P-\d{4}-\d{4}$/.test(project.project_number)) ok('numbered in the project sequence, visibly not a job number');
  else bad(`the project number is "${project.project_number}"`);

  // ── Two jobs inside it, and what they inherit ────────────────────────────────────────────────
  console.log(`\n  two jobs inside it\n`);
  for (const [label, extra] of [
    ['Boundary survey', {}],
    // The second one deliberately overrides the address: the project must NOT overwrite it.
    ['Topographic survey', { address: '102 County Road 12' }],
  ]) {
    const res = await page.request.post(`${BASE}/api/admin/jobs`, {
      data: { name: `QA — ${label}`, survey_type: 'boundary', project_id: projectId, ...extra },
    });
    if (!res.ok()) { bad(`could not create "${label}" (${res.status()}): ${(await res.text()).slice(0, 160)}`); continue; }
    const job = (await res.json()).job;
    jobIds.push(job.id);
    ok(`created ${job.job_number} — ${job.name}`);

    if (job.project_id === projectId) ok('  it is linked to the project');
    else bad(`  its project_id is ${job.project_id}`);

    if (job.client_name === CLIENT) ok(`  it inherited the client (${job.client_name})`);
    else bad(`  it did NOT inherit the client — got ${JSON.stringify(job.client_name)}`);
    if (job.county === COUNTY) ok('  and the county');
    else bad(`  it did not inherit the county — got ${JSON.stringify(job.county)}`);

    if (extra.address) {
      // The load-bearing rule: what the caller typed always wins.
      if (job.address === extra.address) ok(`  and its OWN address survived (${job.address})`);
      else bad(`  the project overwrote the address the caller supplied: ${job.address}`);
    } else if (job.address === ADDRESS) {
      ok('  and the site address');
    } else {
      bad(`  it did not inherit the address — got ${JSON.stringify(job.address)}`);
    }
  }

  // Job numbers must be untouched by all of this.
  const nums = await db.query('SELECT job_number FROM public.jobs WHERE id = ANY($1)', [jobIds]);
  if (nums.rows.every((r) => /^\d{4}-\d{4}$/.test(r.job_number))) ok('job numbers still use the original YYYY-NNNN sequence');
  else bad(`a job number changed shape: ${JSON.stringify(nums.rows.map((r) => r.job_number))}`);

  // ── The project holds them, and adds them up ─────────────────────────────────────────────────
  console.log(`\n  the project's own page data\n`);
  const detail = await (await page.request.get(`${BASE}/api/admin/projects/${projectId}`)).json();
  if ((detail.jobs ?? []).length === jobIds.length) ok(`the project reports its ${detail.jobs.length} jobs`);
  else bad(`the project reports ${(detail.jobs ?? []).length} job(s), expected ${jobIds.length}`);
  if (detail.rollup && typeof detail.rollup.billable === 'number') ok('and a money roll-up summed from them');
  else bad('there is no roll-up on the project');

  // ── A project holding live jobs cannot be deleted ────────────────────────────────────────────
  const refused = await page.request.delete(`${BASE}/api/admin/projects/${projectId}`);
  if (refused.status() === 409) {
    ok(`deleting a project that still holds jobs is refused: "${String((await refused.json()).error).slice(0, 60)}…"`);
  } else {
    bad(`deleting a full project returned ${refused.status()} — its jobs would be orphaned`);
  }

  // ── The File Explorer knows about projects ───────────────────────────────────────────────────
  console.log(`\n  ${BASE}/admin/files — the Projects mount\n`);
  const roots = await (await page.request.get(`${BASE}/api/admin/files?parent=root`)).json();
  if ((roots.nodes ?? []).some((n) => n.id === 'mnt:projects')) ok('a Projects folder sits at the top level of the file system');
  else bad('there is no Projects folder in the File Explorer');

  const inMount = await (await page.request.get(`${BASE}/api/admin/files?parent=${encodeURIComponent('mnt:projects')}`)).json();
  if ((inMount.nodes ?? []).some((n) => n.id === `mnt:projects:${projectId}`)) ok('the project has its own folder');
  else bad('the project does not appear in the Projects folder');

  const projJobs = await (await page.request.get(`${BASE}/api/admin/files?parent=${encodeURIComponent(`mnt:projects:${projectId}`)}`)).json();
  if ((projJobs.nodes ?? []).length === jobIds.length) ok(`and it contains its ${projJobs.nodes.length} jobs`);
  else bad(`the project folder holds ${(projJobs.nodes ?? []).length} job folder(s)`);
  if (projJobs.open_href === `/admin/projects/${projectId}`) ok('and it knows which project page it belongs to');
  else bad(`the folder offers no way to the project page (${projJobs.open_href})`);

  // A job from another project must not resolve under this one.
  const foreign = await page.request.get(
    `${BASE}/api/admin/files?parent=${encodeURIComponent(`mnt:projects:${projectId}:00000000-0000-0000-0000-000000000000`)}`,
  );
  if (foreign.status() === 404) ok('a job that is not in this project is not reachable through its folder');
  else bad(`a foreign job id under this project returned ${foreign.status()}`);

  // ── The screens ──────────────────────────────────────────────────────────────────────────────
  console.log(`\n  the screens\n`);
  await page.goto(`${BASE}/admin/projects`, { waitUntil: 'networkidle', timeout: 180000 });
  // WAIT FOR THE THING, do not sleep at it. A fixed 1500ms reported "the project does not appear on
  // the projects page" on a dev server that was still compiling the route — a false finding against
  // a page that renders correctly, which is the most expensive kind of check to write.
  const card = page.locator(`[data-testid="project-card-${projectId}"]`);
  const listed = await card.waitFor({ state: 'attached', timeout: 30000 }).then(() => true).catch(() => false);
  if (listed) ok('the project is listed on /admin/projects');
  else bad('the project does not appear on the projects page');

  await page.goto(`${BASE}/admin/projects/${projectId}`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.locator('[data-testid="project-jobs"]').waitFor({ state: 'attached', timeout: 30000 }).catch(() => {});
  const jobsShown = await page.locator('[data-testid="project-jobs"] li').count();
  if (jobsShown === jobIds.length) ok(`the project page lists its ${jobsShown} jobs`);
  else bad(`the project page lists ${jobsShown} job(s), expected ${jobIds.length}`);
  if (await page.locator('[data-testid="project-new-job"]').count()) ok('and offers "New job in this project"');
  else bad('the project page has no way to add a job — which is the point of it');
  if (await page.locator('[data-testid="project-files-link"]').count()) ok('and a link to its folder in Files');
  else bad('the project page does not link to its files');

  // The job form must demand a project, and prefill from the one it arrived with.
  await page.goto(`${BASE}/admin/jobs/new?project=${projectId}`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.locator('[data-testid="job-project-select"]').waitFor({ state: 'attached', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800); // the prefill runs once the projects list lands
  const sel = page.locator('[data-testid="job-project-select"]');
  if (await sel.count()) {
    ok('the New Job form asks which project');
    if (await sel.inputValue() === projectId) ok('and arrives with it already chosen');
    else bad(`the ?project= parameter did not preselect it (value: ${await sel.inputValue()})`);
    const addr = await page.locator('input').filter({ hasText: '' }).count();
    const filled = await page.evaluate((want) =>
      Array.from(document.querySelectorAll('input')).some((i) => i.value === want), CLIENT);
    if (filled) ok('and prefilled the client from the project');
    else bad('the form did not prefill the client from the project');
    void addr;
  } else {
    bad('the New Job form has no project picker');
  }

  // The job page points back up.
  if (jobIds[0]) {
    await page.goto(`${BASE}/admin/jobs/${jobIds[0]}`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.waitForTimeout(1800);
    if (await page.locator('[data-testid="job-project-link"]').count()) ok('the job page links up to its project');
    else bad('the job page does not show which project it belongs to');
  }

  // Nav.
  await page.goto(`${BASE}/admin/work`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(1500);
  const workText = await page.locator('body').innerText();
  if (workText.includes('All Projects')) ok('the Work landing offers All Projects');
  else bad('All Projects is missing from the Work landing');
  if (workText.includes('New Project')) ok('and New Project');
  else bad('New Project is missing from the Work landing');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow <= 0) ok('no horizontal overflow at 1440');
  else bad(`${overflow}px of horizontal overflow at 1440`);
  await page.screenshot({ path: `${OUT}/projects-work-1440.png` });

  const phone = await ctx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${BASE}/admin/projects/${projectId}`, { waitUntil: 'networkidle', timeout: 180000 });
  await phone.waitForTimeout(1200);
  const pOver = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (pOver <= 0) ok('no horizontal overflow at 390');
  else bad(`${pOver}px of horizontal overflow at 390`);
  await phone.screenshot({ path: `${OUT}/projects-detail-390.png` });
} catch (err) {
  bad(`the run stopped early: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  console.log('\n  putting everything back\n');
  try {
    if (jobIds.length) await db.query('DELETE FROM public.jobs WHERE id = ANY($1)', [jobIds]);
    if (projectId) await db.query('DELETE FROM public.projects WHERE id = $1', [projectId]);
    if (projectId) await db.query("DELETE FROM public.activity_log WHERE entity_type='project' AND entity_id=$1", [projectId]);
  } catch (e) {
    bad(`cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const left = await db.query(
    'SELECT (SELECT count(*)::int FROM public.projects WHERE deleted_at IS NULL) AS projects,'
    + ' (SELECT count(*)::int FROM public.jobs WHERE deleted_at IS NULL) AS jobs,'
    + ' (SELECT count(*)::int FROM public.jobs WHERE project_id IS NULL) AS orphans',
  );
  console.log(`  live projects: ${left.rows[0].projects} · live jobs: ${left.rows[0].jobs} · orphan jobs: ${left.rows[0].orphans}`);
  await browser.close();
  await db.end();
}

console.log(`\n  ${findings.length === 0 ? 'ALL CLEAR' : `${findings.length} finding(s)`}\n`);
process.exit(findings.length === 0 ? 0 : 1);
