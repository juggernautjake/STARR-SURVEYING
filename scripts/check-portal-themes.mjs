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
const ROUTES = (arg('--routes') ?? '/admin/jobs,/admin/employees,/admin/work,/admin/research,/admin/learn,/admin/settings').split(',');

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

// The measuring function runs in the page: it needs getComputedStyle and the real stacking order.
const AUDIT = (limits) => {
  const parse = (css) => {
    const m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(css || '');
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };
  const lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const la = lum(a); const lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  /** What is actually painted behind this element — walk up until something is not transparent. */
  const behind = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.5) return bg;
      // ── A GRADIENT IS NOT A COLOUR, AND GUESSING ONE MANUFACTURES A FINDING ──────────────────
      //
      // The hub greeting is a brand hero: white text on `linear-gradient(135deg, …)`, with no
      // background-COLOR anywhere in its ancestry. This walk read `backgroundColor` only, found
      // `rgba(0,0,0,0)` all the way to the root, fell back to the page, and reported white text
      // at 1.05:1 — on all eleven themes, light and dark alike, which is the tell: a real contrast
      // defect does not have the same ratio on a white page and a black one.
      //
      // Four findings per run, about a banner that is perfectly legible. This is the fifth time an
      // instrument in this system has reported its own blind spot as a property of the app, and
      // the cost is always the same — a confidently wrong measurement is indistinguishable from a
      // discovery, and it buries the real ones.
      //
      // Answering "unknown" rather than a number is the honest result. What is behind the text is
      // a ramp of colours, and no single ratio describes it.
      if (getComputedStyle(node).backgroundImage !== 'none') return null;
      node = node.parentElement;
    }
    const root = parse(getComputedStyle(document.documentElement).backgroundColor);
    return root && root.a > 0.5 ? root : { r: 255, g: 255, b: 255, a: 1 };
  };

  const pageBg = behind(document.body) ?? { r: 255, g: 255, b: 255, a: 1 };
  const pageIsDark = lum(pageBg) < 0.4;

  const islands = [];
  const unreadable = [];
  // Counted and reported, never silently dropped: "we did not look at 4 things" and "we looked at
  // 4 things and they were fine" are different statements, and a check that cannot tell them apart
  // is one you can quietly narrow to nothing.
  const unmeasurable = [];
  const seen = new Set();

  const scope = document.querySelector('.admin-layout__content') ?? document.body;
  scope.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12) return;             // too small to read as a surface
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return;

    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const key = `${el.tagName}.${cls}`;

    // ── Unthemed island: a big pale surface sitting in a dark app ────────────────────────────────
    const bg = parse(s.backgroundColor);
    if (pageIsDark && bg && bg.a > 0.5 && lum(bg) > 0.7 && r.width * r.height > 12000) {
      if (!seen.has(`i:${key}`)) { seen.add(`i:${key}`); islands.push({ what: key, bg: s.backgroundColor, area: Math.round(r.width * r.height) }); }
    }

    // ── Unreadable text: only elements that actually own visible text ───────────────────────────
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 1);
    if (!ownText) return;
    const fg = parse(s.color);
    if (!fg || fg.a < 0.5) return;
    const size = parseFloat(s.fontSize) || 16;
    const bold = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? limits.large : limits.normal;
    const paper = behind(el);
    if (!paper) {
      if (!seen.has(`u:${key}`)) { seen.add(`u:${key}`); unmeasurable.push({ what: key, why: 'sits on a gradient' }); }
      return;
    }
    const got = ratio(fg, paper);
    if (got < need && !seen.has(`t:${key}`)) {
      seen.add(`t:${key}`);
      unreadable.push({ what: key, ratio: Math.round(got * 100) / 100, need, size: Math.round(size * 10) / 10, color: s.color });
    }
  });

  return { pageIsDark, pageBg: `rgb(${pageBg.r}, ${pageBg.g}, ${pageBg.b})`, islands, unreadable, unmeasurable };
};

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
  for (const i of [...summary.islands.values()].slice(0, 30)) {
    console.log(`     ✗ light surface in a dark app: ${i.what} — ${i.bg}`);
  }
  for (const u of [...summary.unreadable.values()].slice(0, 40)) {
    console.log(`     ✗ ${u.what} — ${u.ratio}:1, needs ${u.need}:1 (${u.size}px ${u.color})`);
  }
  if (summary.islands.size > 8) console.log(`     …and ${summary.islands.size - 8} more surfaces`);
  if (summary.unreadable.size > 10) console.log(`     …and ${summary.unreadable.size - 10} more text problems`);
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
