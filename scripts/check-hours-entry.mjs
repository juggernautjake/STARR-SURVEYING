// scripts/check-hours-entry.mjs — add hours for an employee, in a browser, and prove you can SEE them.
//
// Owner, 2026-08-16: *"Please make sure that we can actually add entries for employees. We need it
// so that we can add hours for employees and actually see those hours entered in the hours
// management pages. We need to see all of the submitted/pending hours, the rejected hours, the
// adjusted hours, the accepted hours and the hours that were added by the boss."*
//
// ── WHY A BROWSER, WHEN THE ROUTE ALREADY HAS TESTS ─────────────────────────────────────────────
//
// The bug this exists to catch was not in the route. `POST /api/admin/time-logs` accepted
// `user_email`, checked admin, inserted the row and notified the employee — all correct, all
// covered. The failure was one line of client state afterwards:
//
//   the office-entered day is inserted `approved` (the admin entering it IS the approver), and the
//   page reloaded into its DEFAULT filter, `pending,disputed` — which cannot contain it.
//
// So the save worked and the screen showed nothing. Indistinguishable from a silent failure, on the
// one action whose entire point is that somebody can see the result. No unit test on the route
// could have seen that, because nothing about the route was wrong. This repo's recorded lesson:
// *"drive the surface, don't only measure it."*
//
// ── IT CLEANS UP AFTER ITSELF ───────────────────────────────────────────────────────────────────
//
// The entry is written with a recognisable marker in `description` and DELETED at the end, verified,
// because this runs against real data and a fake day on somebody's timesheet is a wage record.
//
// Usage: node --env-file=.env.local scripts/check-hours-entry.mjs [--base URL] [--for EMAIL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import pg from 'pg';
import fs from 'node:fs';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3111';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const STAMP = arg('--stamp') ?? String(Date.now());
const MARKER = `QA-HOURS-CHECK-${STAMP}`;

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const dbUrl = fs.readFileSync('.env.local', 'utf8')
  .match(/^SUPABASE_DB_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!dbUrl) { console.error('SUPABASE_DB_URL not found'); process.exit(2); }

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const token = await encode({
  token: { email: AS, name: 'Hours entry check', sub: AS },
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

console.log(`\n  ${BASE}/admin/hours-approval\n`);
await page.goto(`${BASE}/admin/hours-approval`, { waitUntil: 'networkidle', timeout: 90000 });

// ── 1. The status strip exists and describes the week ──────────────────────────────────────────
const chips = page.locator('.tl-status-chip');
const chipCount = await chips.count();
if (chipCount >= 6) ok(`status strip renders ${chipCount} chips`);
else bad(`status strip has ${chipCount} chips; expected at least 6 (all/pending/approved/adjusted/rejected/disputed + office)`);

for (const label of ['Approved', 'Adjusted', 'Rejected', 'Awaiting review', 'Added by office']) {
  const found = await page.locator('.tl-status-chip', { hasText: label }).count();
  if (found > 0) ok(`"${label}" is on screen without opening a menu`);
  else bad(`"${label}" is not reachable from the strip`);
}

// ── 2. Add hours for an employee ───────────────────────────────────────────────────────────────
await page.getByRole('button', { name: /Add hours for someone/i }).click();
await page.waitForSelector('#entry-who', { timeout: 15000 });

const options = await page.locator('#entry-who option').allTextContents();
const real = options.filter((o) => !/Choose an employee/i.test(o));
if (real.length > 0) ok(`the employee picker offers ${real.length} people`);
else bad('the employee picker is EMPTY — no hours can be added for anybody');

// Pick whoever the picker actually offers, rather than assuming an address exists.
const targetValue = await page.locator('#entry-who option').nth(1).getAttribute('value');
const FOR = arg('--for') ?? targetValue;
await page.selectOption('#entry-who', FOR);

// A date deliberately OUTSIDE the current week, because that is the second half of the bug: even
// on "All Entries" the list was one week wide, so a back-dated day was invisible too.
const backdated = new Date();
backdated.setDate(backdated.getDate() - 20);
const pad = (n) => String(n).padStart(2, '0');
const BACKDATED = `${backdated.getFullYear()}-${pad(backdated.getMonth() + 1)}-${pad(backdated.getDate())}`;

await page.fill('#entry-date', BACKDATED);
await page.fill('#entry-hours', '6.5');
await page.fill('#entry-desc', MARKER);
await page.getByRole('button', { name: /^Add entry$/ }).click();

// ── 3. THE ACTUAL TEST: is it on the screen afterwards? ────────────────────────────────────────
let visible = false;
try {
  await page.waitForSelector(`text=${MARKER}`, { timeout: 20000 });
  visible = true;
} catch { /* handled below */ }

if (visible) ok('the entry is VISIBLE on the page immediately after saving');
else bad('the entry saved but is NOT on screen — the reload landed on a filter that cannot contain it');

const notice = await page.locator('.tl-entry-notice').count();
if (notice > 0) ok('a confirmation names what was added, and for whom');
else bad('nothing on the page confirms the save');

// It was back-dated, so this also proves the list is no longer stuck one week wide.
if (visible) ok(`a back-dated day (${BACKDATED}) is reachable, not hidden by the week window`);

// ── 4. It is marked as office-entered, not passed off as an employee submission ────────────────
const officeBadge = await page.locator('.tl-badge--office').count();
if (officeBadge > 0) ok('office-entered days carry an "office" badge beside the status');
else bad('an office-entered day is indistinguishable from one the employee submitted');

await page.screenshot({ path: 'docs/planning/qa-evidence/hours-entry-check.png', fullPage: false });

// ── 5. Clean up, and verify the cleanup ────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const del = await client.query('DELETE FROM daily_time_logs WHERE description = $1 RETURNING id', [MARKER]);
const left = await client.query('SELECT count(*)::int AS n FROM daily_time_logs WHERE description = $1', [MARKER]);
await client.end();

if (del.rowCount > 0) ok(`cleaned up ${del.rowCount} test entr${del.rowCount === 1 ? 'y' : 'ies'}`);
else bad('nothing was deleted — either the entry never reached the table, or the marker did not match');
if (left.rows[0].n === 0) ok('no test rows remain');
else bad(`${left.rows[0].n} test row(s) STILL on somebody's timesheet`);

await browser.close();

console.log(findings.length ? `\n  ${findings.length} finding(s)\n` : '\n  clean\n');
process.exit(findings.length ? 1 : 0);
