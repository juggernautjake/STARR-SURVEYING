// scripts/check-job-notes.mjs — post a job note and read it back, in a browser, for real.
//
// Owner, 2026-08-16: *"Job note entries should be recorded and should display who posted it to the
// job, from where and the date and time."*
//
// ── WHY THIS EXISTS ALONGSIDE THE UNIT TESTS ────────────────────────────────────────────────────
//
// The tests around this feature are source scans, because the route talks to Supabase and the panel
// is a client component behind a session. Source scans prove the code says the right thing. They
// cannot prove a note actually lands in the table, comes back with the author's NAME rather than
// their email, and prints an origin — which is the whole of what was asked for.
//
// This repo's own lesson, recorded twice: *"Drive the surface, don't only measure it"*, and a green
// engine suite is not evidence that a feature exists. So: real browser, real session, real database.
//
// ── IT CLEANS UP AFTER ITSELF ───────────────────────────────────────────────────────────────────
//
// The note is posted with a recognisable marker and DELETED at the end, because this runs against
// production data and a QA note on a real job is litter somebody has to find and explain. The
// delete is verified too — a cleanup that silently fails is how the litter gets there.
//
// Usage: npx tsx --env-file=.env.local scripts/check-job-notes.mjs --job <uuid> [--base URL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import pg from 'pg';
import fs from 'node:fs';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3111';
const JOB = arg('--job');
const EMAIL = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const MARKER = `QA-JOB-NOTE-CHECK ${arg('--stamp') ?? 'run'}`;

if (!JOB) { console.error('--job <uuid> is required'); process.exit(2); }

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const dbUrl = fs.readFileSync('.env.local', 'utf8')
  .match(/^SUPABASE_DB_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!dbUrl) { console.error('SUPABASE_DB_URL not found'); process.exit(2); }

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const token = await encode({
  token: { email: EMAIL, name: 'Job note check', sub: EMAIL },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{
  name: 'authjs.session-token', value: token,
  domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax',
}]);
const page = await ctx.newPage();
page.on('pageerror', (e) => bad(`page error: ${String(e).slice(0, 160)}`));

console.log(`\n  ${BASE}/admin/jobs/${JOB} — Field Work tab\n`);

// The panel lives on the job detail page's Field Work tab, which is where somebody who "opens up
// the job" actually lands.
await page.goto(`${BASE}/admin/jobs/${JOB}`, { waitUntil: 'networkidle', timeout: 60000 });
const fieldTab = page.getByRole('button', { name: /Field work/i }).first();
if (await fieldTab.isVisible().catch(() => false)) {
  await fieldTab.click();
} else {
  bad('the Field Work tab could not be found on the job page');
}
await page.waitForTimeout(2000);

const box = page.getByLabel('New job note');
if (!(await box.isVisible().catch(() => false))) {
  bad('the job-note compose box is not on the job page');
} else {
  ok('compose box is reachable from the job page');

  await box.fill(`${MARKER}\nGate code 4417. Dog is friendly.`);
  const post = page.getByRole('button', { name: /Post note/i });
  if (!(await post.isEnabled().catch(() => false))) {
    bad('Post note stayed disabled with text typed');
  } else {
    await post.click();
    // The new note is prepended from the server's response, so it should appear without a reload.
    await page.waitForTimeout(2500);

    const card = page.locator('li', { hasText: MARKER }).first();
    if (!(await card.isVisible().catch(() => false))) {
      bad('the posted note did not appear in the list');
    } else {
      ok('the note appears immediately, without a reload');
      const text = (await card.innerText().catch(() => '')) ?? '';

      // WHO — a name, not a raw email. This is the half that was broken for every note ever
      // written: notes key their author by email and the manifest route's name lookup keys by id.
      if (/@/.test(text) && !/[A-Za-z]+\s+[A-Za-z]+/.test(text.split('\n').pop() ?? '')) {
        bad(`author rendered as a bare email: ${text.slice(0, 120)}`);
      } else ok('shows WHO posted it');

      // FROM WHERE
      if (/Office/i.test(text)) ok('shows FROM WHERE ("Office — job page")');
      else bad(`origin missing from the card: ${text.slice(0, 160)}`);

      // WHEN — an absolute date and time.
      if (/\d{1,2}:\d{2}/.test(text)) ok('shows the date and TIME');
      else bad(`no time on the card: ${text.slice(0, 160)}`);
    }
  }
}

await ctx.close();
await browser.close();

// ── Verify in the database, then clean up ──────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(
  `select id, user_email, job_id, context_type, context_label, is_public, is_current, created_at
     from fieldbook_notes where content like $1`,
  [`%${MARKER}%`],
);

if (rows.length === 0) {
  bad('no row reached the database');
} else {
  const r = rows[0];
  ok(`row in fieldbook_notes (${rows.length})`);
  if (r.job_id === JOB) ok('scoped to the job from the URL'); else bad(`job_id is ${r.job_id}`);
  if (r.user_email === EMAIL) ok('author is the session user'); else bad(`author is ${r.user_email}`);
  if (r.context_type === 'job_office') ok("origin stamped server-side as 'job_office'");
  else bad(`context_type is ${r.context_type}`);
  // is_public: a job note belongs to the crew, not to whoever typed it.
  if (r.is_public === true) ok('visible to the crew'); else bad('note is private to its author');
  // is_current: read as a soft-archive flag by every reader — false would render "archived".
  if (r.is_current === true) ok('active, not archived'); else bad('note created as archived');
}

const del = await client.query('delete from fieldbook_notes where content like $1', [`%${MARKER}%`]);
const { rows: left } = await client.query(
  'select count(*)::int as n from fieldbook_notes where content like $1', [`%${MARKER}%`],
);
if (left[0].n === 0) ok(`cleaned up (${del.rowCount} removed)`);
else bad(`${left[0].n} QA note(s) left behind — delete them by hand`);

await client.end();

console.log(findings.length === 0 ? '\n  all checks passed\n' : `\n  ${findings.length} problem(s)\n`);
process.exitCode = findings.length ? 1 : 0;
