// scripts/check-project-file-upload.mjs — can a file still be attached to a PROJECT?
//
// The oversize gate rewrote this panel's uploader: what used to be one function taking a `FileList`
// is now a gate (`startUpload`) in front of a loop (`upload`), so a video too big for one object
// can be offered a cut instead of a refusal. That is exactly the kind of change that type-checks,
// passes every unit test, and silently unhooks the button — this repo's most common defect.
//
// So this drives the real panel: pick a project, attach a file through its own control, and require
// the row to come back from the API. It deletes what it made.
//
// Usage: node --env-file=.env.local scripts/check-project-file-upload.mjs [--base URL] [--as EMAIL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3211';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const token = await encode({
  token: { email: AS, name: 'Project upload check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => bad(`page error: ${String(e).slice(0, 200)}`));

const api = {
  get: (p) => page.request.get(`${BASE}${p}`),
  del: (p) => page.request.delete(`${BASE}${p}`),
};

let madeId = null;

try {
  console.log(`\n  ${BASE} — attaching a file to a project\n`);
  const projects = await (await api.get('/api/admin/projects')).json();
  const project = (projects.projects ?? projects.rows ?? [])[0];
  if (!project) { bad('no project to test against'); throw new Error('no project'); }
  ok(`using ${project.project_number ?? project.id}`);

  await page.goto(`${BASE}/admin/projects/${project.id}`, { waitUntil: 'domcontentloaded' });
  const input = await page.waitForSelector('[data-testid="project-upload-input"]', { state: 'attached', timeout: 60_000 }).catch(() => null);
  if (!input) { bad('the project page has no upload control'); throw new Error('no control'); }
  ok('the panel and its upload control rendered');

  const name = `qa-project-doc-${Date.now() % 1000000}.txt`;
  const before = await (await api.get(`/api/admin/jobs/files?project_id=${project.id}`)).json();
  const beforeIds = new Set((before.files ?? []).map((f) => f.id));

  await page.setInputFiles('[data-testid="project-upload-input"]', {
    name, mimeType: 'text/plain', buffer: Buffer.from('A project document, uploaded by the QA check.\n'),
  });

  // Poll the API rather than the DOM: watching the page's own rows with Playwright's text engine
  // stalls the in-flight upload XHR (see scripts/check-files-video-upload.mjs for the full account).
  let made = null;
  for (let waited = 0; waited < 90_000 && !made; waited += 1_000) {
    await page.waitForTimeout(1_000);
    const listing = await (await api.get(`/api/admin/jobs/files?project_id=${project.id}`)).json();
    made = (listing.files ?? []).find((f) => !beforeIds.has(f.id) && f.file_name === name) ?? null;
  }
  if (!made) { bad('the file never arrived — the upload control is not wired to anything'); throw new Error('no row'); }
  madeId = made.id;
  ok(`the file uploaded and came back as a row (${made.file_name})`);

  if (made.storage_bucket === 'starr-field-files') ok(`stored in the right bucket (${made.storage_bucket})`);
  else bad(`stored in "${made.storage_bucket}" — a project document belongs in starr-field-files`);
  if (made.download_href) ok('and it has somewhere to download from');
  else bad('the row has no download_href — the bytes are unreachable');
} catch (err) {
  bad(`stopped early: ${err.message}`);
} finally {
  if (madeId) {
    const del = await api.del(`/api/admin/jobs/files?id=${madeId}`);
    console.log(del.ok() ? `\n  cleaned up (${madeId} deleted)` : `\n  NOTE: could not delete ${madeId} — remove it by hand`);
  }
  await browser.close();
}

console.log(findings.length === 0
  ? '\n✓ The project upload control still works after the oversize gate.\n'
  : `\n✗ ${findings.length} problem(s):\n${findings.map((f) => `   · ${f}`).join('\n')}\n`);
process.exit(findings.length === 0 ? 0 : 1);
