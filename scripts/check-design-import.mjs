// scripts/check-design-import.mjs — can a real page still be traced into the canvas?
//
//   node --env-file=.env.local scripts/check-design-import.mjs --base http://127.0.0.1:3211
//
// Slices M1–M2 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// The matching logic is covered by 19 unit tests. What those cannot see is the half that only
// exists in a browser: whether the walk still finds the page, whether the content root is still
// called `.admin-layout__content`, and whether the design that comes out is openable. That seam —
// a script and a route that work perfectly in isolation — is exactly where this repo's most common
// defect lives, so it gets driven for real.
//
// It traces `/admin/jobs` because that page has the widest mix: cards, a toolbar, a search field,
// badges, a stats row and a table of real records.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import { spawnSync } from 'node:child_process';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = (arg('--base') ?? 'http://127.0.0.1:3211').replace(/\/$/, '');
const ROUTE = arg('--route') ?? '/admin/jobs';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const problems = [];
const check = (condition, description, detail) => {
  console.log(`  ${condition ? '✓' : '✗'} ${description}${!condition && detail ? ` — ${detail}` : ''}`);
  if (!condition) problems.push(description);
};

console.log(`\n  Tracing ${ROUTE} into a design, then opening it\n`);

// Run the real script, exactly as a person would. Its own output is the first assertion.
const run = spawnSync(process.execPath, ['scripts/design-import-page.mjs', '--base', BASE, '--route', ROUTE], {
  encoding: 'utf8',
  env: process.env,
});
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
check(run.status === 0, 'the import script runs to completion', `exit ${run.status}`);

const idMatch = /\/admin\/design\/(d-[a-z0-9-]+)/.exec(output);
check(!!idMatch, 'it reports the design it created', output.split('\n').slice(-3).join(' ').slice(0, 120));
if (!idMatch) { console.log(output); process.exit(1); }
const id = idMatch[1];

const kept = [...output.matchAll(/(desktop|mobile):\s+(\d+) element/g)].map((m) => Number(m[2]));
check(kept.length === 2 && kept.every((n) => n > 15),
  'both views came back with a real page worth of elements', `kept ${kept.join(' and ')}`);

check(/thing\(s\) on this page the catalogue cannot name|Every element on this page matched/.test(output),
  'it reports catalogue coverage either way');

// ── Now open it, because a design that cannot be opened is not an import ───────────────────────
const token = await encode({ token: { email: AS, name: 'Import check', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();

await page.goto(`${BASE}/admin/design/${id}`, { waitUntil: 'domcontentloaded' });
const artboard = await page.waitForSelector('.dsx__artboard', { timeout: 20_000 }).catch(() => null);
check(!!artboard, 'the imported design opens in the studio');

if (artboard) {
  await page.waitForTimeout(1200);
  const onCanvas = await page.locator('.dsx__el').count();
  check(onCanvas > 15, 'and its elements are on the canvas', `${onCanvas} elements`);

  // The elements have to be REAL catalogue instances, not a picture of the page: the whole value of
  // importing is that what comes back is editable and carries the app's own class names.
  const named = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.dsx__el .dsx__el-inner > *'))
      .map((el) => (typeof el.className === 'string' ? el.className : ''))
      .filter(Boolean));
  check(named.some((c) => /job|admin|jobs-page/.test(c)),
    'and they wear the app\'s real class names', named.slice(0, 3).join(' | ') || '(none)');

  // The LAST element, not the first. Imported elements nest: the outermost container is placed
  // first and therefore sits lowest, with its own children painted over it — which is correct
  // (clicking a card's label selects the label, clicking its empty margin selects the card), but it
  // means the first element in the list is the one thing that is never directly clickable.
  await page.locator('.dsx__el').last().click();
  await page.waitForTimeout(200);
  check(await page.locator('.dsx-ins__name').count() > 0, 'and an imported element can be selected and edited');

  // Mobile is its own capture, not a squeezed copy of the desktop one.
  await page.locator('.dsx__view', { hasText: 'Mobile' }).click();
  await page.waitForTimeout(400);
  const mobileCount = await page.locator('.dsx__el').count();
  check(mobileCount > 15, 'the mobile view was traced separately and is populated', `${mobileCount} elements`);
}

await page.request.fetch(`${BASE}/api/admin/design/${id}`, { method: 'DELETE' });
await browser.close();

console.log(problems.length
  ? `\n✗ ${problems.length} problem(s):\n${problems.map((p) => `   · ${p}`).join('\n')}\n`
  : '\n✓ A real page traces into an editable design, and reports what the catalogue is missing.\n');
process.exit(problems.length ? 1 : 0);
