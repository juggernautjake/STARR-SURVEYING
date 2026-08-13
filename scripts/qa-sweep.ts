// scripts/qa-sweep.ts — walk every admin page as a signed-in admin and report what is broken.
//
// Not a replacement for the e2e specs, which assert behaviour. This asks the cheaper question that
// nothing else asks across the WHOLE surface at once: does the page render, does it fetch what it
// needs, and does it say anything to the user that it should not.
//
// What counts as a finding, and why each one is a real defect rather than noise:
//
//   · an uncaught page error        — the component threw; a blank or partial screen
//   · a failed same-origin request  — a panel is empty and the user is not told why
//   · a console error               — usually a React key/hydration/prop fault that precedes a visual bug
//   · visible error prose           — the page caught it and is showing the user a failure
//   · horizontal overflow           — the phone-width failure this codebase keeps regressing
//
// Usage: npx tsx --env-file=.env.local scripts/qa-sweep.ts [--base URL] [--only substring] [--shot]

import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { encode } from '@auth/core/jwt';

const BASE = argValue('--base') ?? 'http://127.0.0.1:3100';
const ONLY = argValue('--only');
const SHOTS = process.argv.includes('--shot');
const ADMIN_EMAIL = argValue('--as') ?? 'jacobmaddux@starr-surveying.com';
const OUT = 'docs/planning/qa-evidence/sweep-2026-08-13';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Routes come from the registry the nav itself uses, so the sweep cannot drift from the product. */
function routesFromRegistry(): string[] {
  const src = fs.readFileSync('lib/admin/route-registry.ts', 'utf8');
  const found = [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
  return [...new Set(found)]
    // A route with a parameter needs a real id; those are visited via their index page instead.
    .filter((h) => h.startsWith('/') && !h.includes('[') && !h.includes(':'))
    .sort();
}

interface Finding {
  route: string;
  kind: 'pageerror' | 'request' | 'console' | 'visible' | 'overflow';
  detail: string;
}

/** Console noise that is not a defect. Kept deliberately short — a long ignore list is how a real
 *  error gets ignored. Each entry is a claim that the message cannot indicate a user-visible fault. */
const IGNORE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /React Router Future Flag/i,
  /Warning: ReactDOM.render is no longer supported/i,
  // Next dev-only: the dev overlay and HMR websocket chatter.
  /websocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/_next\/webpack-hmr'/i,
];

const isNoise = (t: string) => IGNORE.some((re) => re.test(t));

async function mintSessionCookie(): Promise<string> {
  const raw = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!raw) throw new Error('AUTH_SECRET is not set — cannot mint a session.');
  // Stripped, because the value in .env.local is quoted and the quotes become part of the key.
  const secret = raw.replace(/^["']|["']$/g, '');
  return encode({
    token: { email: ADMIN_EMAIL, name: 'QA sweep', sub: ADMIN_EMAIL },
    secret,
    salt: 'authjs.session-token',
    maxAge: 60 * 60,
  });
}

async function visit(page: Page, route: string): Promise<Finding[]> {
  const found: Finding[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!isNoise(t)) found.push({ route, kind: 'console', detail: t.slice(0, 300) });
  };
  const onPageError = (e: Error) => found.push({ route, kind: 'pageerror', detail: String(e).slice(0, 300) });
  const onResponse = (r: { url(): string; status(): number }) => {
    const u = r.url();
    if (!u.startsWith(BASE)) return;
    // 401/403 on a route the sweep is not entitled to is a fact about the session, not a defect.
    if (r.status() >= 500 || r.status() === 404) {
      found.push({ route, kind: 'request', detail: `HTTP ${r.status()} ${u.replace(BASE, '')}` });
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // Client components fetch after mount; without this the sweep reports a clean page that has not
    // asked for its data yet — the false NEGATIVE that would make this whole script decorative.
    await page.waitForTimeout(2_500);

    const body = (await page.locator('body').innerText().catch(() => '')) ?? '';
    // Phrases the app uses when it is telling the user something failed. Anchored to this codebase's
    // own error prose rather than the word "error", which appears in plenty of healthy labels.
    const ERROR_PROSE = [
      /could not be loaded/i, /something went wrong/i, /failed to load/i, /unexpected error/i,
      /Application error/i, /Internal Server Error/i, /is not a function/i, /undefined is not/i,
    ];
    for (const re of ERROR_PROSE) {
      const m = body.match(re);
      if (m) {
        const at = body.indexOf(m[0]);
        found.push({ route, kind: 'visible', detail: body.slice(Math.max(0, at - 60), at + 120).replace(/\s+/g, ' ') });
        break;
      }
    }

    // The regression this repo keeps having: a page that scrolls sideways on a phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return d.scrollWidth > d.clientWidth + 2 ? { scroll: d.scrollWidth, client: d.clientWidth } : null;
    });
    if (overflow) {
      found.push({ route, kind: 'overflow', detail: `body scrolls to ${overflow.scroll}px in a ${overflow.client}px viewport` });
    }
    if (SHOTS) {
      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: path.join(OUT, `${route.replace(/\//g, '_') || 'root'}.png`), fullPage: false });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  } catch (e) {
    found.push({ route, kind: 'pageerror', detail: `navigation failed: ${String(e).slice(0, 200)}` });
  }

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);
  return found;
}

async function main(): Promise<void> {
  const routes = routesFromRegistry().filter((r) => !ONLY || r.includes(ONLY));
  console.log(`Sweeping ${routes.length} routes at ${BASE} as ${ADMIN_EMAIL}\n`);

  const token = await mintSessionCookie();
  let browser: Browser | null = null;
  const findings: Finding[] = [];

  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{
      name: 'authjs.session-token', value: token,
      domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax',
    }]);
    const page = await ctx.newPage();
    page.on('dialog', (d) => void d.accept());

    for (const route of routes) {
      const f = await visit(page, route);
      findings.push(...f);
      const bad = f.length;
      console.log(`${bad === 0 ? '  ok  ' : ` ${String(bad).padStart(2)}  `} ${route}`);
      for (const x of f) console.log(`        ${x.kind}: ${x.detail}`);
    }
  } finally {
    await browser?.close();
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));

  const byKind = findings.reduce<Record<string, number>>((a, f) => ({ ...a, [f.kind]: (a[f.kind] ?? 0) + 1 }), {});
  console.log(`\n${findings.length} finding(s) across ${routes.length} routes:`, byKind);
  console.log(`Written to ${OUT}/findings.json`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
