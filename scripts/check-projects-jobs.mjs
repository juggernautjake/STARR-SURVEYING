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
// The edit step below deliberately corrects the client name, so anything asserted AFTER that point
// must expect the corrected value. Checking for the original there fails against a form that is
// behaving perfectly — which it did, once.
const CLIENT_CORRECTED = 'Smith Holdings CORRECTED';
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

  // ── Editing, which was create-only until the last slice ──────────────────────────────────────
  //
  // A project's client and site are what every NEW job inherits, so an uncorrectable typo does not
  // sit still — it propagates into every job made afterwards. Equally load-bearing: the edit must
  // NOT reach back into jobs that already exist, whose copies are what get printed.
  const beforeEdit = await db.query('SELECT client_name, address FROM public.jobs WHERE id = $1', [jobIds[0]]);
  const edited = await page.request.patch(`${BASE}/api/admin/projects/${projectId}`, {
    data: { client_name: CLIENT_CORRECTED, county: 'Starr' },
  });
  if (edited.ok()) {
    const p = (await edited.json()).project;
    if (p.client_name === CLIENT_CORRECTED && p.county === 'Starr') ok('the project can be corrected after it exists');
    else bad(`the edit did not stick: ${JSON.stringify({ n: p.client_name, c: p.county })}`);
  } else {
    bad(`editing the project failed (${edited.status()})`);
  }
  const afterEdit = await db.query('SELECT client_name, address FROM public.jobs WHERE id = $1', [jobIds[0]]);
  if (afterEdit.rows[0]?.client_name === beforeEdit.rows[0]?.client_name) {
    ok('and it did NOT rewrite the jobs already inside it');
  } else {
    bad(`the project edit cascaded into an existing job: ${beforeEdit.rows[0]?.client_name} → ${afterEdit.rows[0]?.client_name}`);
  }

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

  // ── Stages are reachable in BOTH directions (2026-08-19) ─────────────────────────────────────
  //
  // Owner: "we need to be able to go back to previous stages of the job at any time." The timeline
  // used to be seven divs and a forward-only button.
  console.log(`\n  stages, in both directions\n`);
  const jobForStage = jobIds[0];
  await page.request.post(`${BASE}/api/admin/jobs/stages`, { data: { job_id: jobForStage, to_stage: 'drawing' } });
  const atDrawing = await db.query('SELECT stage, date_accepted FROM public.jobs WHERE id = $1', [jobForStage]);
  if (atDrawing.rows[0].stage === 'drawing') ok('a job can be set forward to drawing');
  else bad(`the job is at ${atDrawing.rows[0].stage}`);

  await page.request.post(`${BASE}/api/admin/jobs/stages`, { data: { job_id: jobForStage, to_stage: 'research' } });
  const backAtResearch = await db.query('SELECT stage, date_accepted FROM public.jobs WHERE id = $1', [jobForStage]);
  if (backAtResearch.rows[0].stage === 'research') ok('and moved BACK to research');
  else bad(`moving back failed — the job is at ${backAtResearch.rows[0].stage}`);

  // The milestone must not be rewritten by revisiting. `date_accepted` is stamped on arrival at
  // research; going back must not claim the job was accepted today.
  const first = atDrawing.rows[0].date_accepted;
  const after = backAtResearch.rows[0].date_accepted;
  if (!first || String(first) === String(after)) ok('and revisiting a stage did not rewrite its milestone date');
  else bad(`moving back overwrote date_accepted: ${first} → ${after}`);

  // ── A file can belong to the PROJECT, not only to a job ──────────────────────────────────────
  console.log(`\n  files on the project itself\n`);
  const bytes = Buffer.from('Starr QA — the signed contract for the whole tract.\n', 'utf8');
  const pInit = await page.request.post(`${BASE}/api/admin/jobs/files/upload`, {
    data: { project_id: projectId, name: 'contract.txt', size_bytes: bytes.length },
  });
  if (pInit.ok()) {
    const { file_id, path, signed_url } = await pInit.json();
    ok('the server issues a signed URL for a project document');
    const put = await page.request.fetch(signed_url, { method: 'PUT', data: bytes, headers: { 'content-type': 'text/plain' } });
    if (put.ok()) ok('the bytes go straight to storage');
    else bad(`the PUT failed (${put.status()})`);

    const row = await page.request.post(`${BASE}/api/admin/jobs/files`, {
      data: {
        project_id: projectId, file_id, storage_path: path, file_name: 'contract.txt',
        file_type: 'document', file_size: bytes.length, mime_type: 'text/plain', section: 'project',
      },
    });
    if (row.ok()) ok('and the row is created against the project, with no job');
    else bad(`the project file row failed (${row.status()}): ${(await row.text()).slice(0, 160)}`);

    const check = await db.query('SELECT job_id, project_id FROM public.job_files WHERE id = $1', [file_id]);
    if (check.rows[0]?.project_id === projectId && check.rows[0]?.job_id === null) ok('stored with project_id and a null job_id');
    else bad(`the row is ${JSON.stringify(check.rows[0])}`);

    const listed = await (await page.request.get(`${BASE}/api/admin/jobs/files?project_id=${projectId}`)).json();
    if ((listed.files ?? []).some((f) => f.id === file_id)) ok('and the project lists it');
    else bad('the project does not list its own document');

    // A job's own file list must NOT suddenly include the project's documents.
    const jobList = await (await page.request.get(`${BASE}/api/admin/jobs/files?job_id=${jobIds[0]}`)).json();
    if (!(jobList.files ?? []).some((f) => f.id === file_id)) ok('and a job’s file list is unaffected by it');
    else bad('a project document leaked into a job’s file list');

    const docsFolder = await (await page.request.get(
      `${BASE}/api/admin/files?parent=${encodeURIComponent(`mnt:projects:${projectId}:docs`)}`)).json();
    if ((docsFolder.nodes ?? []).some((n) => n.name.includes('contract'))) ok('and the File Explorer shows it under Project documents');
    else bad(`the project-documents folder does not hold it — saw ${JSON.stringify((docsFolder.nodes ?? []).map((n) => n.name))}`);

    await db.query('DELETE FROM public.job_files WHERE id = $1', [file_id]);
  } else {
    bad(`could not start a project upload (${pInit.status()}): ${(await pInit.text()).slice(0, 160)}`);
  }

  // ── Money: down payments, price changes, cancellation (2026-08-19) ───────────────────────────
  console.log(`\n  money — bid, received, owed\n`);
  const moneyJob = jobIds[1] ?? jobIds[0];

  await page.request.put(`${BASE}/api/admin/jobs`, {
    data: { id: moneyJob, quote_amount: 4200, price_reason: 'Opening bid' },
  });
  await page.request.put(`${BASE}/api/admin/jobs`, {
    data: { id: moneyJob, quote_amount: 5600, price_reason: 'Client added the topo' },
  });
  const hist = await db.query(
    'SELECT field, old_amount, new_amount, reason FROM public.job_price_history WHERE job_id = $1 ORDER BY created_at',
    [moneyJob],
  );
  if (hist.rows.length >= 2) ok(`the price change was recorded (${hist.rows.length} entries)`);
  else bad(`price history has ${hist.rows.length} row(s) — the change was not recorded`);
  const raise = hist.rows.find((r) => Number(r.new_amount) === 5600);
  if (raise && Number(raise.old_amount) === 4200) ok('with the OLD figure, which the job row no longer holds');
  else bad(`the raise did not keep its old amount: ${JSON.stringify(raise)}`);
  if (raise?.reason === 'Client added the topo') ok('and the reason it changed');
  else bad(`the reason was not stored: ${JSON.stringify(raise?.reason)}`);

  // A down payment.
  const dep = await page.request.post(`${BASE}/api/admin/jobs/payments`, {
    data: { job_id: moneyJob, amount: 1500, payment_type: 'deposit', payment_method: 'check', reference_number: '1042' },
  });
  if (dep.ok()) ok('a down payment can be recorded');
  else bad(`recording a down payment failed (${dep.status()})`);

  const m1 = await (await page.request.get(`${BASE}/api/admin/jobs/money?job_id=${moneyJob}`)).json();
  if (m1.summary?.billed === 5600) ok(`the job bills the current price (${m1.summary.billed})`);
  else bad(`billed is ${m1.summary?.billed}, expected 5600`);
  if (m1.summary?.deposits === 1500) ok('and reports the down payment separately');
  else bad(`deposits is ${m1.summary?.deposits}`);
  if (m1.summary?.outstanding === 4100) ok('and owes the remainder (4100)');
  else bad(`outstanding is ${m1.summary?.outstanding}, expected 4100`);
  if (m1.reconcile?.agrees) ok('and the stored total agrees with the payment records');
  else bad(`the stored total drifted: ${JSON.stringify(m1.reconcile)}`);

  // A refund must reduce what was received — both sides of the arithmetic agree now.
  await page.request.post(`${BASE}/api/admin/jobs/payments`, {
    data: { job_id: moneyJob, amount: 500, payment_type: 'refund' },
  });
  const m2 = await (await page.request.get(`${BASE}/api/admin/jobs/money?job_id=${moneyJob}`)).json();
  if (m2.summary?.received === 1000) ok('a refund reduces what was received');
  else bad(`received is ${m2.summary?.received}, expected 1000`);
  if (m2.reconcile?.agrees) ok('and the job row still agrees with the records');
  else bad(`a refund put the stored total out of step: ${JSON.stringify(m2.reconcile)}`);

  // Cancel it, with a reason and a retained amount.
  await page.request.put(`${BASE}/api/admin/jobs`, {
    data: { id: moneyJob, result: 'abandoned', result_reason: 'Client sold the property', amount_retained: 1000 },
  });
  const m3 = await (await page.request.get(`${BASE}/api/admin/jobs/money?job_id=${moneyJob}`)).json();
  if (m3.job?.result_reason === 'Client sold the property') ok('a cancellation records why');
  else bad(`the cancellation reason is ${JSON.stringify(m3.job?.result_reason)}`);
  if (m3.job?.cancelled_at) ok('and when');
  else bad('cancelled_at was not stamped');
  if (m3.summary?.outstanding === 0) ok('and a cancelled job stops being a receivable');
  else bad(`a cancelled job still shows ${m3.summary?.outstanding} outstanding`);
  if (m3.summary?.received === 1000) ok('while the money that really arrived is still counted');
  else bad(`received is ${m3.summary?.received} after cancellation`);

  // A payment against the PROJECT, not one of its jobs — a retainer, or one cheque for several.
  const projPay = await page.request.post(`${BASE}/api/admin/jobs/payments`, {
    data: { project_id: projectId, amount: 2000, payment_type: 'deposit', payment_method: 'transfer' },
  });
  if (projPay.ok()) ok('a payment can be recorded against the project itself');
  else bad(`a project-level payment failed (${projPay.status()}): ${(await projPay.text()).slice(0, 160)}`);

  const projPayRow = await db.query(
    'SELECT job_id, project_id FROM public.job_payments WHERE project_id = $1 AND job_id IS NULL',
    [projectId],
  );
  if (projPayRow.rows.length === 1) ok('stored against the project, with no job');
  else bad(`expected one project-level payment row, found ${projPayRow.rows.length}`);

  const pm = await (await page.request.get(`${BASE}/api/admin/jobs/money?project_id=${projectId}`)).json();
  if (pm.totals?.direct_payments === 2000) ok('and the project total counts it');
  else bad(`the project roll-up reports direct_payments=${pm.totals?.direct_payments}`);
  // It must NOT leak into a job's own figures — that is what filing it on a job would have done.
  const jm = await (await page.request.get(`${BASE}/api/admin/jobs/money?job_id=${jobIds[0]}`)).json();
  if (!(jm.payments ?? []).some((p) => Number(p.amount) === 2000)) ok('without attaching itself to any one job');
  else bad('the project payment leaked onto a job');

  // The firm-wide roll-up the financial pages read.
  const firm = await (await page.request.get(`${BASE}/api/admin/jobs/money`)).json();
  if (firm.totals && typeof firm.totals.billed === 'number' && typeof firm.totals.received === 'number') {
    ok(`the firm-wide roll-up answers bid/received/owed (${firm.totals.jobs} jobs)`);
  } else {
    bad('there is no firm-wide roll-up for the financial pages');
  }

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
  if (await page.locator('[data-testid="project-edit"]').count()) ok('and a way to edit it');
  else bad('the project page offers no way to correct the project');
  // Asserted HERE, while the project page is the page on screen. These three lived after the
  // New Job navigation once and reported "the project page has no upload control" — about a page
  // that was not open. An assertion has to run where the thing it names actually is.
  if (await page.locator('[data-testid="project-upload-label"]').count()) ok('and can upload files to the project itself');
  else bad('the project page has no upload control');
  if (await page.locator('[data-testid="project-all-files-link"]').count()) ok('and links to all files on the platform');
  else bad('the project page does not offer the whole file system');

  await page.goto(`${BASE}/admin/projects/${projectId}/edit`, { waitUntil: 'networkidle', timeout: 180000 });
  const nameBox = page.locator('[data-testid="proj-edit-name"]');
  const editReady = await nameBox.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
  if (editReady) {
    ok('the edit form opens');
    if ((await nameBox.inputValue()).includes('Smith Tract')) ok('with the project’s current values in it');
    else bad(`the edit form did not load the current name (${await nameBox.inputValue()})`);
    if (await page.locator('[data-testid="proj-archive"]').count()) ok('and offers archiving');
    else bad('the edit form has no archive control');
  } else {
    bad('the edit form did not render');
  }

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
      Array.from(document.querySelectorAll('input')).some((i) => i.value === want), CLIENT_CORRECTED);
    if (filled) ok('and prefilled the client from the project');
    else bad('the form did not prefill the client from the project');
    void addr;
  } else {
    bad('the New Job form has no project picker');
  }

  // The job page points back up, surfaces its files, and is navigable stage-by-stage.
  if (jobIds[0]) {
    await page.goto(`${BASE}/admin/jobs/${jobIds[0]}`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.locator('[data-testid="job-project-link"]').waitFor({ state: 'attached', timeout: 30000 }).catch(() => {});
    if (await page.locator('[data-testid="job-project-link"]').count()) ok('the job page links up to its project');
    else bad('the job page does not show which project it belongs to');

    if (await page.locator('[data-testid="job-files-quick"]').count()) ok('and offers Files & photos from the header');
    else bad('the job page buries its files in the tab strip');

    // Every stage must be openable, whatever the job's current stage is — the whole point.
    const openable = await page.locator('[data-testid^="stage-open-"]').count();
    if (openable === 7) ok(`all ${openable} stages are clickable, not just the current one`);
    else bad(`only ${openable} stage(s) are clickable`);

    // Clicking Research must open the research work, without re-staging the job.
    const stageBefore = (await db.query('SELECT stage FROM public.jobs WHERE id = $1', [jobIds[0]])).rows[0].stage;
    await page.locator('[data-testid="stage-open-research"]').click();
    await page.waitForTimeout(1200);
    const stageAfter = (await db.query('SELECT stage FROM public.jobs WHERE id = $1', [jobIds[0]])).rows[0].stage;
    if (stageAfter === stageBefore) ok('and opening a stage does NOT change the job’s stage');
    else bad(`opening the research stage re-staged the job: ${stageBefore} → ${stageAfter}`);

    // Files quick-access really lands on the files panel.
    await page.locator('[data-testid="job-files-quick"]').click();
    await page.waitForTimeout(1200);
    if (await page.locator('[data-testid="job-all-files-link"]').count()) ok('and the files view offers the whole platform’s files');
    else bad('the job files view is a dead end');
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
