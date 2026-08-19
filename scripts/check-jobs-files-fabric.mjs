// scripts/check-jobs-files-fabric.mjs — a job, its files, and the file system, driven end to end.
//
// The unit tests pin the RULES (which id a node carries, which gate each kind re-applies). They
// cannot show that a file uploaded on a job page arrives in the File Explorer, that the job folder
// lists it, or that the links between the two surfaces go anywhere — and "authored but not wired"
// is this repo's most common defect.
//
// ── WHAT THIS TOUCHES, AND HOW IT PUTS IT BACK ──────────────────────────────────────────────────
//
// It creates ONE job called "QA — jobs/files fabric" and uploads one tiny text file to it, because
// the live database has no undeleted job at all and a fabric with nothing in it proves nothing. It
// borrows ONE existing receipt by setting its `job_id`, and sets it back to null afterwards.
// Everything it makes, it removes: the job is soft-deleted, the file row is deleted, the receipt is
// released. The cleanup runs even when a check fails, and reports what it could not undo.
//
// Usage: node --env-file=.env.local scripts/check-jobs-files-fabric.mjs [--base URL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import pg from 'pg';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3210';
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
  token: { email: AS, name: 'Jobs/files fabric check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{
  name: 'authjs.session-token', value: token,
  domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax',
}]);
const page = await ctx.newPage();
page.on('pageerror', (e) => bad(`page error: ${String(e).slice(0, 200)}`));

/** Everything to undo, innermost first. */
const cleanup = [];
let jobId = null;
let borrowedReceipt = null;

try {
  // ── Make a job to hang things on ──────────────────────────────────────────────────────────────
  console.log(`\n  ${BASE} — building a job to test the fabric\n`);

  const created = await page.request.post(`${BASE}/api/admin/jobs`, {
    data: { name: 'QA — jobs/files fabric', survey_type: 'boundary', stage: 'lead' },
  });
  if (!created.ok()) {
    bad(`could not create a QA job (${created.status()}) — nothing else can be checked`);
    throw new Error('no job');
  }
  const createdBody = await created.json();
  jobId = createdBody.job?.id ?? createdBody.id;
  if (!jobId) { bad('the create response carried no job id'); throw new Error('no job id'); }
  ok(`created a QA job (${jobId.slice(0, 8)}…)`);
  cleanup.push(async () => {
    await db.query('UPDATE public.jobs SET deleted_at = now() WHERE id = $1', [jobId]);
  });

  // ── Upload a file the way the browser now does: signed URL, PUT, then the row ─────────────────
  const bytes = Buffer.from('Starr QA — this file proves the fabric works.\n', 'utf8');
  const init = await page.request.post(`${BASE}/api/admin/jobs/files/upload`, {
    data: { job_id: jobId, name: 'fabric-check.txt', size_bytes: bytes.length },
  });
  if (!init.ok()) {
    bad(`the upload could not be started (${init.status()}): ${(await init.text()).slice(0, 160)}`);
  } else {
    const { file_id, path, signed_url } = await init.json();
    ok('the server issued a signed upload URL');

    const put = await page.request.fetch(signed_url, {
      method: 'PUT', data: bytes, headers: { 'content-type': 'text/plain' },
    });
    if (put.ok()) ok('the bytes went straight to storage, not through the API');
    else bad(`the PUT to storage failed (${put.status()})`);

    const row = await page.request.post(`${BASE}/api/admin/jobs/files`, {
      data: {
        job_id: jobId, file_id, storage_path: path,
        file_name: 'fabric-check.txt', file_type: 'document',
        file_size: bytes.length, mime_type: 'text/plain', section: 'general',
      },
    });
    if (row.ok()) {
      ok('the job_files row was created');
      cleanup.push(async () => { await db.query('DELETE FROM public.job_files WHERE id = $1', [file_id]); });
    } else {
      bad(`the job_files row failed (${row.status()}): ${(await row.text()).slice(0, 160)}`);
    }

    // The whole point of the change: the row carries the columns the file system reads.
    const check = await db.query(
      'SELECT storage_path, upload_state, file_url, name, content_type FROM public.job_files WHERE id = $1',
      [file_id],
    );
    const r = check.rows[0];
    if (r?.storage_path && r.upload_state === 'done') ok('it was written in the shape the File Explorer reads');
    else bad(`the row is not in the storage shape: ${JSON.stringify(r)}`);
    if (r && r.file_url === null) ok('and no base64 was put in the database');
    else bad('file_url was written for a storage upload — the base64 path is back');

    // No `[BACKUP]` twin for a storage upload.
    const twin = await db.query("SELECT count(*)::int n FROM public.job_files WHERE job_id = $1 AND is_backup = true", [jobId]);
    if (twin.rows[0].n === 0) ok('no backup twin was made — a second row pointing at the same key backs up nothing');
    else bad(`${twin.rows[0].n} backup row(s) were made for a storage upload`);
  }

  // ── Borrow a receipt, so the job folder has a second kind in it ────────────────────────────────
  const spare = await db.query(
    'SELECT id FROM public.receipts WHERE job_id IS NULL AND deleted_at IS NULL AND photo_url IS NOT NULL LIMIT 1',
  );
  if (spare.rows[0]) {
    borrowedReceipt = spare.rows[0].id;
    await db.query('UPDATE public.receipts SET job_id = $1 WHERE id = $2', [jobId, borrowedReceipt]);
    cleanup.push(async () => {
      await db.query('UPDATE public.receipts SET job_id = NULL WHERE id = $1', [borrowedReceipt]);
    });
    ok('borrowed one receipt onto the job (released again at the end)');
  } else {
    console.log('  · no spare receipt to borrow, so the Receipts folder is not checked');
  }

  // ── The File Explorer: is there a folder for this job, with the right things in it? ────────────
  console.log(`\n  ${BASE}/admin/files — the Jobs mount\n`);

  const roots = await (await page.request.get(`${BASE}/api/admin/files?parent=root`)).json();
  const jobsRoot = (roots.nodes ?? []).find((n) => n.id === 'mnt:jobs');
  if (jobsRoot) ok(`"${jobsRoot.name}" appears at the top level of the file system`);
  else bad('there is no Jobs folder at the top level');

  const jobsList = await (await page.request.get(`${BASE}/api/admin/files?parent=${encodeURIComponent('mnt:jobs')}`)).json();
  const mine = (jobsList.nodes ?? []).find((n) => n.id === `mnt:jobs:${jobId}`);
  if (mine) ok(`the job has its own folder, named "${mine.name}"`);
  else bad('the job does not appear in the Jobs folder');

  const kindsRes = await page.request.get(`${BASE}/api/admin/files?parent=${encodeURIComponent(`mnt:jobs:${jobId}`)}`);
  const kinds = await kindsRes.json();
  const kindNames = (kinds.nodes ?? []).map((n) => n.name);
  if (kindNames.some((n) => n.startsWith('Files'))) ok(`the Files folder is there: ${kindNames.join(', ')}`);
  else bad(`no Files folder inside the job — saw: ${kindNames.join(', ') || '(nothing)'}`);
  if (borrowedReceipt) {
    if (kindNames.some((n) => n.startsWith('Receipts'))) ok('and the Receipts folder, from an entirely different table');
    else bad('the borrowed receipt did not produce a Receipts folder');
  }
  if ((kinds.breadcrumb ?? []).length >= 2) ok('the breadcrumb can climb back out');
  else bad(`the breadcrumb is ${JSON.stringify(kinds.breadcrumb)} — a dead end`);
  if (kinds.open_href === `/admin/jobs/${jobId}`) ok('the folder knows which job page it belongs to');
  else bad(`the folder offers no way to the job page (open_href: ${kinds.open_href})`);

  const filesIn = await (await page.request.get(`${BASE}/api/admin/files?parent=${encodeURIComponent(`mnt:jobs:${jobId}:files`)}`)).json();
  const uploaded = (filesIn.nodes ?? []).find((n) => n.name === 'fabric-check.txt');
  if (uploaded) ok('the uploaded file is listed inside the job folder');
  else bad(`the uploaded file is not in the job's Files folder — saw ${JSON.stringify((filesIn.nodes ?? []).map((n) => n.name))}`);

  if (uploaded) {
    // The id must be the JOB-FILES source id, which is what makes the download work with no second
    // resolver — the property the unit test pins, confirmed here against a live row.
    if (uploaded.id.startsWith('mnt:job-files:')) ok('and it carries its own source id, so download needs no second code path');
    else bad(`the node id is ${uploaded.id} — a jobs-specific id would need its own resolver`);

    const dl = await page.request.get(`${BASE}/api/admin/files/${encodeURIComponent(uploaded.id)}/download`);
    if (dl.ok()) {
      const { url } = await dl.json();
      const got = await page.request.fetch(url);
      const text = await got.text();
      if (text.includes('proves the fabric works')) ok('and downloading it through the File Explorer returns the bytes');
      else bad(`the download returned something else: ${text.slice(0, 80)}`);
    } else {
      bad(`the download failed (${dl.status()})`);
    }
  }

  // ── The flat Job Files folder, which was structurally empty before ────────────────────────────
  const flat = await (await page.request.get(`${BASE}/api/admin/files?parent=${encodeURIComponent('mnt:job-files')}`)).json();
  const flatNames = (flat.nodes ?? []).map((n) => n.name);
  if (flatNames.includes('fabric-check.txt')) ok('the flat Job Files folder shows it too');
  else bad(`the flat Job Files folder is still missing it — saw ${flatNames.length} row(s)`);
  if (flatNames.includes('qa-note.txt')) ok('and the legacy data-URI row, which it could never see before');
  else console.log('  · the legacy row is not present (it may have been cleaned up)');

  // ── Both links, in a real browser ─────────────────────────────────────────────────────────────
  console.log(`\n  the two links, clicked\n`);

  await page.goto(`${BASE}/admin/jobs/${jobId}`, { waitUntil: 'networkidle', timeout: 180000 });
  // The tab carries a BADGE COUNT once the job has files (`job.file_count`), so its accessible name
  // is "Files 1", not "Files". An exact `/^files$/i` matched nothing — and because the click was
  // guarded by `if (count)`, the miss was silent and surfaced below as "the job page has no link",
  // blaming the product for a selector. A check that skips a step must say so out loud.
  const filesTab = page.getByRole('button', { name: /^files(\s*\d+)?$/i }).first();
  if (await filesTab.count()) {
    await filesTab.click();
    await page.waitForTimeout(1200);
  } else {
    bad('could not find the Files tab to click — the link check below proves nothing');
  }
  const toFiles = page.locator(`a[href="/admin/files?node=mnt:jobs:${jobId}"]`);
  if (await toFiles.count()) ok('the job page points at its folder');
  else bad('the job page has no link to its folder in Files');

  await page.goto(`${BASE}/admin/files?node=${encodeURIComponent(`mnt:jobs:${jobId}`)}`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  // `body.includes('Files')` is NOT good enough, and hid a real bug for a whole run: the ROOT
  // listing contains a "Job Files" folder, so that assertion passed green while the deep link was
  // landing on the root. The root's giveaway is the OTHER top-level mounts — a job folder holds
  // only its own kinds and never lists "Research Documents" or "Field Media" beside them.
  const landedOnRoot = body.includes('Research Documents') && body.includes('Field Media');
  if (!landedOnRoot && /Files\s*\(\d+\)/.test(body)) ok('the deep link opens the job folder directly');
  else if (landedOnRoot) bad('the ?node= deep link fell back to the ROOT listing');
  else bad('the ?node= deep link did not open the folder');
  const openJob = page.locator('[data-testid="fx-open-source"]');
  if (await openJob.count()) ok('and the folder offers "Open the job"');
  else bad('the folder has no way back to the job');

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow <= 0) ok('no horizontal overflow at 1440');
  else bad(`${overflow}px of horizontal overflow at 1440`);

  await page.screenshot({ path: `${OUT}/jobs-mount-1440.png`, fullPage: false });

  const phone = await ctx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${BASE}/admin/files?node=${encodeURIComponent(`mnt:jobs:${jobId}`)}`, { waitUntil: 'networkidle', timeout: 180000 });
  await phone.waitForTimeout(1000);
  const pOver = await phone.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (pOver <= 0) ok('no horizontal overflow at 390');
  else bad(`${pOver}px of horizontal overflow at 390`);
  await phone.screenshot({ path: `${OUT}/jobs-mount-390.png`, fullPage: false });
} catch (err) {
  bad(`the run stopped early: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  console.log('\n  putting everything back\n');
  for (const undo of cleanup.reverse()) {
    try { await undo(); } catch (e) { bad(`cleanup failed: ${e instanceof Error ? e.message : String(e)}`); }
  }
  // Say what the database looks like afterwards, rather than assuming the undo worked.
  const left = await db.query(
    'SELECT (SELECT count(*)::int FROM public.jobs WHERE deleted_at IS NULL) AS live_jobs,'
    + ' (SELECT count(*)::int FROM public.receipts WHERE job_id IS NOT NULL) AS receipts_on_jobs',
  );
  console.log(`  live jobs left: ${left.rows[0].live_jobs} · receipts still attached to a job: ${left.rows[0].receipts_on_jobs}`);
  await browser.close();
  await db.end();
}

console.log(`\n  ${findings.length === 0 ? 'ALL CLEAR' : `${findings.length} finding(s)`}\n`);
process.exit(findings.length === 0 ? 0 : 1);
