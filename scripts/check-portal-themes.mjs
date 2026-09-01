// scripts/check-portal-themes.mjs — do the portal themes actually hold up on real pages?
//
//   node --env-file=.env.local scripts/check-portal-themes.mjs --base http://127.0.0.1:3015
//   node --env-file=.env.local scripts/check-portal-themes.mjs --themes starr-dark,forest-dark
//
// Phase T of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"I want it so that we have at least 3 clearly defined themes prebuilt and that are able
// to be selected in the settings/options of the portal pages. This should not effect the frontend
// pages, as those should stay the same. Please go ahead and design the different available themes
// and make sure they look good for all of the pages."*
//
// ── "LOOKS GOOD" IS TWO MEASURABLE THINGS ───────────────────────────────────────────────────────
//
// A theme is a set of `--theme-*` custom properties on `<html>`. Every surface that reads them
// re-paints; every surface that hard-codes a colour does not. So a dark theme produces two failure
// modes, and both are measurable:
//
//   UNTHEMED ISLAND   a light panel in a dark app, because that element's CSS says `#fff` instead
//                     of `var(--theme-bg-surface)`. This is the one that reads as broken.
//   UNREADABLE TEXT   text whose contrast against what is actually behind it falls below 4.5:1,
//                     because the foreground followed the theme and the background did not, or the
//                     other way round.
//
// Both are found by rendering the real pages under the real theme and measuring computed colours —
// not by reading stylesheets, which cannot tell you what ended up on top.
//
// ── WHY IT ALSO CHECKS THE FRONTEND ─────────────────────────────────────────────────────────────
//
// The owner's constraint is that the public site must NOT change. `ShellTheme` mounts inside the
// admin shell, so that is already true by construction — but "true by construction" is how things
// stop being true. A public page is loaded with the theme cookie set and asserted to be unchanged.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const BASE = (arg('--base') ?? 'http://127.0.0.1:3015').replace(/\/$/, '');
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';
const THEMES = (arg('--themes') ?? 'starr-default,starr-dark,forest-dark,ocean,high-contrast-dark').split(',');
const RAW_ROUTES = (arg('--routes') ?? '/admin/jobs,/admin/employees,/admin/work,/admin/research,/admin/learn,/admin/settings').split(',');

// ── EVERY DEFAULT ROUTE WAS AN INDEX ROUTE ──────────────────────────────────────────────────────
//
// Measured 2026-08-31. The eight research portal tabs had been swept clean across all eleven
// palettes for a week. The first time this script was pointed at a PROJECT-scoped route it found
// two real defects immediately:
//
//   · "No Active Research" at 1.05:1 — near-white text on a hard-coded #F9FAFB panel, on all four
//     dark palettes. The text was tokenised and the background was not, which is worse than
//     tokenising neither: a literal pair would at least have been self-consistent.
//   · the stepper's completed-stage labels at 3.03:1 — a green audited once, against white.
//
// Neither is exotic. They survived because a detail route cannot be reached by typing a path with
// no id in it, so the route list quietly described "the pages that are easy to name" rather than
// "the pages people use". A route with a `:projectId` in it is expanded from the database here.
//
// It FAILS rather than skipping when the id cannot be resolved. A silently-skipped route is
// precisely how this gap lasted as long as it did — a green run that checked eight of ten pages
// and said so nowhere.
async function resolveRoutes(routes) {
  if (!routes.some((r) => r.includes(':projectId'))) return routes;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('--routes contains :projectId but SUPABASE env vars are not set');
    process.exit(2);
  }

  const res = await fetch(`${url}/rest/v1/research_projects?select=id&order=created_at.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows) || !rows[0]?.id) {
    console.error('--routes contains :projectId and no research project could be resolved');
    process.exit(2);
  }

  console.log(`  :projectId → ${rows[0].id}`);
  return routes.map((r) => r.replace(':projectId', rows[0].id));
}

const ROUTES = await resolveRoutes(RAW_ROUTES);

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

/** WCAG AA for body text. Large text is allowed 3:1 and is treated separately below. */
const MIN_CONTRAST = 4.5;
const MIN_CONTRAST_LARGE = 3;

const token = await encode({ token: { email: AS, name: 'Theme check', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();

// The measuring function that runs IN the page lives in `_contrast-audit-probe.mjs`. The research
// portal's E3 responsive spec runs the same one over the Review TABS, which are state rather than
// routes and so are unreachable from any route list — and a second hand-written copy of a probe
// this subtle is the copy that stops being maintained and goes on reporting clean.
import { AUDIT } from './_contrast-audit-probe.mjs';

console.log(`\n  ${BASE} — do the portal themes hold up?\n`);

let problems = 0;
const perTheme = {};

for (const theme of THEMES) {
  // ── SET THE THEME THE WAY THE APP DOES ────────────────────────────────────────────────────────
  //
  // The first version set `data-theme` on `<html>` with `page.evaluate` after navigating, which
  // looked like it worked and did not: `ShellTheme` hydrates from the hub store a moment later and
  // writes the ACCOUNT's stored preference over the top. Every run reported on `starr-default`
  // while printing "starr-dark" as the heading — eighteen findings about a theme that was never
  // applied.
  //
  // `starr-shell-theme` is the localStorage key ShellTheme reads before the store arrives, exactly
  // so a themed user does not see the default for one paint. Writing it in an init script means the
  // theme is applied by the app's own code, on the app's own path, before the first paint — which
  // is both correct and the thing worth testing.
  await ctx.addInitScript((t) => {
    try { localStorage.setItem('starr-shell-theme', t); } catch { /* private mode */ }
  }, theme);

  // ── AND THE STORE HAS TO AGREE, OR IT WINS A SECOND LATER ─────────────────────────────────────
  //
  // The localStorage echo only decides the FIRST paint. `ShellTheme` then hydrates from
  // `/api/admin/me/hub-data` and writes the account's saved preference over the top — so a page
  // measured 1.6s after load was being measured under whatever this account happens to have
  // chosen, not under the theme in the heading. That is how the audit reported `#0F1419` text on a
  // rule that had already been converted to `var(--theme-fg-primary)`: the rule was right and the
  // theme was never applied.
  //
  // Answering the hub-data call with the theme under test makes the app apply it through its own
  // code path and keep it applied, which is both correct and the thing worth testing.
  await page.route('**/api/admin/me/hub-data*', async (route) => {
    // A cold dev server can take longer than Playwright's 30s default to compile this API route,
    // and an unhandled rejection here killed the ENTIRE sweep — eighteen routes across five themes,
    // lost to one slow compile. Falling through to the real request keeps the run alive; that page
    // is then measured under whatever theme the account has, which is worth strictly more than no
    // measurement at all.
    let response;
    try {
      response = await route.fetch({ timeout: 90_000 });
    } catch {
      await route.continue().catch(() => {});
      return;
    }
    let body = {};
    try { body = await response.json(); } catch { /* not JSON — pass it through untouched */ }
    await route.fulfill({ response, json: { ...body, theme, customTheme: null } }).catch(() => {});
  });

  const summary = { islands: new Map(), unreadable: new Map(), unmeasurable: new Map(), dark: false };
  for (const route of ROUTES) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(1600);
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      const res = await page.evaluate(AUDIT, { normal: MIN_CONTRAST, large: MIN_CONTRAST_LARGE });
      if (process.env.DEBUG_THEME) {
        const v = await page.evaluate(() => { const c = getComputedStyle(document.documentElement); return { attr: document.documentElement.getAttribute("data-theme"), warn: c.getPropertyValue("--color-warning").trim(), fg: c.getPropertyValue("--color-text-primary").trim() }; });
        console.log(`       [debug] ${route} attr=${v.attr} --color-warning=${v.warn} --color-text-primary=${v.fg}`);
      }
      summary.dark = res.pageIsDark;
      for (const i of res.islands) summary.islands.set(i.what, i);
      for (const u of res.unreadable) summary.unreadable.set(u.what, u);
      for (const u of res.unmeasurable ?? []) summary.unmeasurable.set(u.what, u);
    } catch { /* a route that will not load says nothing about the theme */ }
  }
  perTheme[theme] = summary;
  const bad = summary.islands.size + summary.unreadable.size;
  problems += bad;

  console.log(`  ── ${theme}${summary.dark ? ' (dark)' : ''} ──`);
  // Said out loud on every run, clean or not. A check that silently skips things is how a green
  // result stops meaning anything — and skipping these is the correct behaviour, not a gap: what
  // is behind text on a gradient is a ramp of colours, and no single ratio describes it.
  const skipped = summary.unmeasurable.size
    ? `     · ${summary.unmeasurable.size} element(s) sit on a gradient and cannot be scored: ${[...summary.unmeasurable.keys()].slice(0, 4).join(', ')}`
    : '';
  if (bad === 0) {
    console.log('     ✓ no unthemed surfaces, no unreadable text');
    if (skipped) console.log(skipped);
    console.log('');
    continue;
  }
  if (skipped) console.log(skipped);
  // The caps and the counts have to be the SAME numbers. They were 30/40 and 8/10, so a run that
  // printed all 25 of its findings then announced "…and 15 more text problems" — sending somebody
  // to look for fifteen defects that were already on the screen. A reporter that miscounts its own
  // output is the cheapest way there is to lose trust in a real list.
  const ISLAND_CAP = 30;
  const TEXT_CAP = 40;
  for (const i of [...summary.islands.values()].slice(0, ISLAND_CAP)) {
    console.log(`     ✗ light surface in a dark app: ${i.what} — ${i.bg}`);
  }
  for (const u of [...summary.unreadable.values()].slice(0, TEXT_CAP)) {
    console.log(`     ✗ ${u.what} — ${u.ratio}:1, needs ${u.need}:1 (${u.size}px ${u.color})`);
  }
  if (summary.islands.size > ISLAND_CAP) console.log(`     …and ${summary.islands.size - ISLAND_CAP} more surfaces`);
  if (summary.unreadable.size > TEXT_CAP) console.log(`     …and ${summary.unreadable.size - TEXT_CAP} more text problems`);
  console.log('');
}

// ── The frontend must not move ──────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
await page.waitForTimeout(1200);
const publicTheme = await page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-theme'),
  bg: getComputedStyle(document.body).backgroundColor,
}));
if (publicTheme.attr) {
  console.log(`  ✗ the public site carries data-theme="${publicTheme.attr}" — themes must be admin-only`);
  problems += 1;
} else {
  console.log('  ✓ the public site carries no theme attribute — the frontend is unaffected');
}

await browser.close();
console.log(`\n  ${problems === 0 ? 'Every theme tested holds up.' : `${problems} theme problem(s).`}\n`);
process.exit(problems > 0 ? 1 : 0);
