#!/usr/bin/env node
// scripts/capture-research-ui.mjs — photograph every research screen, so a person can look at them.
//
//   node --env-file=.env.local scripts/capture-research-ui.mjs --base http://localhost:3050
//   node --env-file=.env.local scripts/capture-research-ui.mjs --theme starr-dark --out docs/planning/qa-evidence/dark
//
// ── WHY A CAMERA AND NOT ANOTHER ASSERTION ──────────────────────────────────────────────────────
//
// `e2e/research-responsive.spec.ts` already drives these routes at two widths and measures three
// things: horizontal overflow, occluded controls, and — since F2 — computed contrast. All three are
// green. `check-portal-themes.mjs` measures eleven palettes and is green too.
//
// None of that answers "does this look right". Alignment, rhythm, density, whether two panels that
// do the same job look like they were built by the same person — those are real defects with real
// cost, they are what the owner asked about, and no assertion this repository could reasonably
// write would catch them. Forty pictures answers it in two minutes.
//
// So this is deliberately NOT a gate. It fails nothing. It produces evidence, with a manifest, and
// the findings go in the plan doc as a table with a filename against each.
//
// ── FULL PAGE, AND THE ONE THING THAT MAKES A STITCHED SHOT LIE ─────────────────────────────────
//
// `fullPage: true` stitches the scroll height into one image, and a `position: fixed` element is
// painted ONCE, at its scroll-0 position, into that stitched picture. The floating action dock
// therefore appears lying across whatever happened to be at that offset — a place it never actually
// occupies. `mobile-overflow-audit.spec.ts` records the same trap for the same reason.
//
// The dock is hidden for the capture. It is a real element and its overlap is a real question, but
// that question is answered by `elementFromPoint` in the E3 spec, which asks whether a tap lands on
// the control. A picture cannot answer it and will confidently suggest a wrong answer.
//
// ── AND THE REVIEW TABS, WHICH ARE STATE RATHER THAN ROUTES ─────────────────────────────────────
//
// Nothing route-based renders the Easements, Survey Data or coherence panels. They are captured by
// driving the tab bar with the same fixture the E3 spec uses, for the same reason: these panels
// render nothing at all when their data is absent, so a shot of an empty run is a shot of nothing.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import fs from 'node:fs';
import path from 'node:path';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const BASE = (arg('--base', 'http://localhost:3050')).replace(/\/$/, '');
const THEME = arg('--theme', 'starr-default');
const OUT = arg('--out', 'docs/planning/qa-evidence/ui-audit');
const AS = arg('--as', 'jacobmaddux@starr-surveying.com');

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set — run with --env-file=.env.local'); process.exit(2); }

const WIDTHS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
];

/** Swept from the filesystem, not typed — a route added after the list is a route nobody looks at. */
function routedPages() {
  const root = 'app/admin/research';
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(rel, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(rel, e.name));
      else if (e.name === 'page.tsx') {
        out.push('/' + path.relative('app', rel).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return out.sort();
}

/** `position: fixed` chrome, painted once into a stitched full-page shot. See the note above. */
const HIDE_FIXED = `
  .fab-menu, .assistant-fab-wrap, [class*="floating-messenger"] { display: none !important; }
`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const token = await encode({
    token: { email: AS, name: 'UI audit', sub: AS, roles: ['admin'], isCompanyUser: true },
    secret, salt: 'authjs.session-token', maxAge: 3600,
  });

  const browser = await chromium.launch();
  const manifest = [];

  // The project id is data, and `[projectId]` is where most of the surface lives.
  let projectId = null;
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/admin/research`, { waitUntil: 'networkidle' });
    projectId = await p.evaluate(async () => {
      const r = await fetch('/api/admin/research');
      if (!r.ok) return null;
      return (await r.json()).projects?.[0]?.id ?? null;
    });
    await ctx.close();
  }

  const routes = routedPages().map((r) => (projectId ? r.replace('[projectId]', projectId) : r))
    .filter((r) => !r.includes('[projectId]'));

  for (const w of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: w.width, height: w.height },
      isMobile: w.mobile, hasTouch: w.mobile, deviceScaleFactor: 1,
    });
    await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
    await ctx.addInitScript((t) => { try { localStorage.setItem('starr-shell-theme', t); } catch { /* private mode */ } }, THEME);
    const page = await ctx.newPage();
    await page.addStyleTag({ content: HIDE_FIXED }).catch(() => {});

    for (const route of routes) {
      const slug = route.replace(/^\/admin\/research\/?/, '').replace(/[^\w-]+/g, '-') || 'portal';
      const file = `${slug}--${w.name}.png`;
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 45_000 });
        await page.waitForTimeout(1200);
        await page.addStyleTag({ content: HIDE_FIXED });
        const text = await page.evaluate(() => (document.body.innerText || '').trim().length);
        await page.screenshot({ path: path.join(OUT, file), fullPage: true });
        manifest.push({ route, width: w.name, file, chars: text });
        console.log(`  ${file.padEnd(46)} ${text} chars`);
      } catch (err) {
        manifest.push({ route, width: w.name, file: null, error: String(err).slice(0, 120) });
        console.log(`  ${route} @ ${w.name} — FAILED: ${String(err).slice(0, 80)}`);
      }
    }
    await ctx.close();
  }

  fs.writeFileSync(
    path.join(OUT, 'manifest.json'),
    `${JSON.stringify({ base: BASE, theme: THEME, capturedAt: new Date().toISOString(), shots: manifest }, null, 2)}\n`,
  );
  console.log(`\n  ${manifest.filter((m) => m.file).length} shots → ${OUT}`);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
