// scripts/check-project-recents-search.mjs — recents, search, and assigning a worker to a job.
//
// Creates its own project + two jobs + a team assignment, then removes all of it. The assertions
// are the ones unit tests cannot make: that OPENING a project really moves it to the top of Recent,
// that a date range and an assignee actually filter, and that a worker assignment sticks.
//
// Usage: node --env-file=.env.local scripts/check-project-recents-search.mjs [--base URL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import pg from 'pg';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3220';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const findings = [];
const ok = (m) => console.log(`  OK  ${m}`);
const bad = (m) => { findings.push(m); console.log(`  XX  ${m}`); };

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const token = await encode({ token: { email: AS, name: 'Recents check', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => bad(`page error: ${String(e).slice(0, 180)}`));

const madeProjects = [];
const madeJobs = [];
const CREW = 'fieldhand.qa@starr-surveying.com';

try {
  console.log(`\n  ${BASE} — two projects to search across\n`);
  for (const name of ['QA Recents Alpha Tract', 'QA Recents Beta Ranch']) {
    const r = await page.request.post(`${BASE}/api/admin/projects`, {
      data: {
        name,
        client_name: name.includes('Alpha') ? 'Alpha Holdings' : 'Beta Partners',
        county: name.includes('Alpha') ? 'Hidalgo' : 'Starr',
      },
    });
    if (!r.ok()) { bad(`could not create ${name} (${r.status()})`); continue; }
    madeProjects.push((await r.json()).project);
  }
  if (madeProjects.length < 2) throw new Error('need two projects');
  const [alpha, beta] = madeProjects;
  ok(`created ${alpha.project_number} and ${beta.project_number}`);

  for (const [proj, jobName] of [[alpha, 'QA Alpha Boundary'], [beta, 'QA Beta Topo']]) {
    const r = await page.request.post(`${BASE}/api/admin/jobs`, {
      data: { name: jobName, survey_type: 'boundary', project_id: proj.id },
    });
    if (r.ok()) madeJobs.push((await r.json()).job);
    else bad(`could not create ${jobName} (${r.status()})`);
  }

  // ── Assigning a worker to a job ──────────────────────────────────────────────────────────────
  console.log(`\n  assigning a worker to a job\n`);
  const job = madeJobs[0];
  const assign = await page.request.post(`${BASE}/api/admin/jobs/team`, {
    data: { job_id: job.id, user_email: CREW, user_name: 'QA Fieldhand', role: 'field_crew' },
  });
  if (assign.ok()) ok('a worker can be assigned to a job');
  else bad(`assigning failed (${assign.status()}): ${(await assign.text()).slice(0, 140)}`);

  const teamRow = await db.query('SELECT user_email, role, removed_at FROM public.job_team WHERE job_id=$1 AND user_email=$2', [job.id, CREW]);
  if (teamRow.rows[0] && !teamRow.rows[0].removed_at) ok(`stored on the job as ${teamRow.rows[0].role}`);
  else bad(`the assignment did not stick: ${JSON.stringify(teamRow.rows[0])}`);

  const listed = await (await page.request.get(`${BASE}/api/admin/jobs/team?job_id=${job.id}`)).json();
  if ((listed.team ?? []).some((t) => t.user_email === CREW)) ok('and the job lists them on its team');
  else bad('the job does not list the assigned worker');

  // ── Search ───────────────────────────────────────────────────────────────────────────────────
  console.log(`\n  search\n`);
  const byAssignee = await (await page.request.get(`${BASE}/api/admin/projects?assignee=${encodeURIComponent('QA Fieldhand')}`)).json();
  const ids = (byAssignee.projects ?? []).map((p) => p.id);
  if (ids.includes(alpha.id)) ok('searching by assignee finds the project holding their job');
  else bad(`assignee search returned ${ids.length} project(s), not the one with their job`);
  if (!ids.includes(beta.id)) ok('and does NOT return a project they are not on');
  else bad('assignee search returned a project the person is not assigned to');

  const byEmail = await (await page.request.get(`${BASE}/api/admin/projects?assignee=${encodeURIComponent(CREW)}`)).json();
  if ((byEmail.projects ?? []).some((p) => p.id === alpha.id)) ok('and it works by email as well as by name');
  else bad('assignee search by email found nothing');

  const nobody = await (await page.request.get(`${BASE}/api/admin/projects?assignee=nobody-at-all-xyz`)).json();
  if ((nobody.projects ?? []).length === 0) ok('an unknown assignee returns nothing rather than everything');
  else bad(`an unknown assignee returned ${(nobody.projects ?? []).length} projects — the filter is being skipped`);

  const byCounty = await (await page.request.get(`${BASE}/api/admin/projects?search=Hidalgo`)).json();
  if ((byCounty.projects ?? []).some((p) => p.id === alpha.id)) ok('keyword search matches on county');
  else bad('keyword search does not reach county');

  const byClient = await (await page.request.get(`${BASE}/api/admin/projects?search=${encodeURIComponent('Beta Partners')}`)).json();
  if ((byClient.projects ?? []).some((p) => p.id === beta.id)) ok('and on the client name');
  else bad('keyword search does not reach the client name');

  // A range of today..today must INCLUDE today — the bug an exclusive upper bound causes, and the
  // most common search anybody runs.
  const today = new Date().toISOString().slice(0, 10);
  const inRange = await (await page.request.get(`${BASE}/api/admin/projects?from=${today}&to=${today}`)).json();
  if ((inRange.projects ?? []).some((p) => p.id === alpha.id)) ok('a from/to range of TODAY includes a project created today');
  else bad('today..today excluded a project created today — the upper bound is exclusive');

  const past = await (await page.request.get(`${BASE}/api/admin/projects?from=2000-01-01&to=2000-12-31`)).json();
  if (!(past.projects ?? []).some((p) => p.id === alpha.id)) ok('and a range in the past excludes it');
  else bad('a range in 2000 returned a project created today');

  // ── Recents ──────────────────────────────────────────────────────────────────────────────────
  console.log(`\n  recent projects\n`);
  const recent1 = await (await page.request.get(`${BASE}/api/admin/projects?recent=true&limit=5`)).json();
  if ((recent1.projects ?? []).length <= 5) ok(`the recent list returns at most 5 (${(recent1.projects ?? []).length})`);
  else bad(`recent returned ${(recent1.projects ?? []).length}`);
  if ((recent1.projects ?? [])[0]?.last_touched_at) ok('and each carries when it was last touched');
  else bad('recent projects have no last_touched_at to rank by');

  // Open the project that is NOT currently top, and check it climbs — the whole point of recording
  // opens, since reading a project changes no other timestamp.
  const notTop = (recent1.projects ?? [])[0]?.id === alpha.id ? beta : alpha;
  await page.request.post(`${BASE}/api/admin/projects/${notTop.id}/open`);
  await new Promise((r) => setTimeout(r, 1200));
  const recent2 = await (await page.request.get(`${BASE}/api/admin/projects?recent=true&limit=5`)).json();
  if ((recent2.projects ?? [])[0]?.id === notTop.id) ok('opening a project moves it to the top of Recent');
  else bad(`after opening ${notTop.project_number}, the top is ${(recent2.projects ?? [])[0]?.project_number}`);

  const opens = await db.query('SELECT open_count FROM public.project_opens WHERE project_id=$1 AND user_email=$2', [notTop.id, AS]);
  if ((opens.rows[0]?.open_count ?? 0) >= 1) ok(`and the open was counted (${opens.rows[0].open_count})`);
  else bad('the open was not recorded');

  // ── The screen ───────────────────────────────────────────────────────────────────────────────
  console.log(`\n  the screen\n`);
  await page.goto(`${BASE}/admin/projects`, { waitUntil: 'networkidle', timeout: 240000 });
  const strip = await page.locator('[data-testid="projects-recent"]').waitFor({ state: 'visible', timeout: 45000 }).then(() => true).catch(() => false);
  if (strip) ok('the Recent section is on the projects page');
  else bad('there is no Recent section');
  if (await page.locator(`[data-testid="project-recent-${notTop.id}"]`).count()) ok('and the project just opened is in it');
  else bad('the recently opened project is not in the strip');

  await page.locator('[data-testid="projects-filters-toggle"]').click();
  await page.waitForTimeout(600);
  if (await page.locator('[data-testid="projects-advanced-filters"]').count()) ok('the date + assignee filters open');
  else bad('the advanced filters do not open');
  for (const t of ['projects-from', 'projects-to', 'projects-assignee']) {
    if (await page.locator(`[data-testid="${t}"]`).count()) ok(`  ${t} is present`);
    else bad(`  ${t} is missing`);
  }

  await page.locator('[data-testid="projects-assignee"]').fill('QA Fieldhand');
  await page.waitForTimeout(1800);
  const cards = await page.locator('[data-testid^="project-card-"]').count();
  if (cards === 1) ok('filtering by assignee narrows the list to 1 project on screen');
  else bad(`filtering by assignee left ${cards} cards on screen`);

  const recentHidden = await page.locator('[data-testid="projects-recent"]').count();
  if (recentHidden === 0) ok('and Recent hides while a filter is active');
  else bad('Recent is still shown alongside filtered results');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow <= 0) ok('no horizontal overflow at 1440');
  else bad(`${overflow}px overflow at 1440`);

  const phone = await ctx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${BASE}/admin/projects`, { waitUntil: 'networkidle', timeout: 240000 });
  await phone.locator('[data-testid="projects-recent"]').waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});
  const pOver = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (pOver <= 0) ok('no horizontal overflow at 390');
  else bad(`${pOver}px overflow at 390`);
  await phone.screenshot({ path: 'docs/planning/qa-evidence/projects-style/mobile-projects-recent.png' });
} catch (err) {
  bad(`the run stopped early: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  console.log('\n  putting everything back\n');
  try {
    if (madeJobs.length) {
      const ids = madeJobs.map((j) => j.id);
      await db.query('DELETE FROM public.job_team WHERE job_id = ANY($1)', [ids]);
      await db.query('DELETE FROM public.job_stages_history WHERE job_id = ANY($1)', [ids]);
      await db.query('DELETE FROM public.job_price_history WHERE job_id = ANY($1)', [ids]);
      await db.query('DELETE FROM public.job_files WHERE job_id = ANY($1)', [ids]);
      await db.query('DELETE FROM public.jobs WHERE id = ANY($1)', [ids]);
    }
    if (madeProjects.length) {
      const ids = madeProjects.map((p) => p.id);
      await db.query('DELETE FROM public.project_opens WHERE project_id = ANY($1)', [ids]);
      await db.query('DELETE FROM public.job_files WHERE project_id = ANY($1)', [ids]);
      await db.query('DELETE FROM public.job_payments WHERE project_id = ANY($1)', [ids]);
      await db.query('DELETE FROM public.projects WHERE id = ANY($1)', [ids]);
    }
  } catch (e) {
    bad(`cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const left = await db.query('SELECT (SELECT count(*)::int FROM public.projects WHERE deleted_at IS NULL) pr,(SELECT count(*)::int FROM public.jobs WHERE deleted_at IS NULL) jb');
  console.log(`  live projects: ${left.rows[0].pr} · live jobs: ${left.rows[0].jb}`);
  await browser.close();
  await db.end();
}

console.log(`\n  ${findings.length === 0 ? 'ALL CLEAR' : `${findings.length} finding(s)`}\n`);
process.exit(findings.length === 0 ? 0 : 1);
