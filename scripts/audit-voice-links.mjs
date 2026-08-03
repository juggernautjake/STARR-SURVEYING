// scripts/audit-voice-links.mjs — follow every link under /AndrewAsh and report what does not answer.
//
// The owner reported "a lot of 404 pages in the backend studio". The route-existence check I had run
// only covered the thirteen top-level studio pages by name. That is not the same question: a link can
// point somewhere no route exists, a detail page can 404 on a real id, and a nav entry can be built
// against a path that was later renamed. This crawls what is actually clickable and follows it.
//
// Signed in, because almost every studio page redirects to /login otherwise and a crawl of the login
// page thirteen times would report everything healthy.
//
// Run: node scripts/audit-voice-links.mjs --base http://localhost:3230 --user X --pass Y

import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:3230');
const USER = arg('--user', 'juggernautjake');
const PASS = arg('--pass', '');

const SEEDS = [
  '/AndrewAsh',
  '/AndrewAsh/studio',
  '/AndrewAsh/studio/guide',
  '/AndrewAsh/studio/pages',
  '/AndrewAsh/studio/inquiries',
  '/AndrewAsh/studio/invoices',
  '/AndrewAsh/studio/expenses',
  '/AndrewAsh/studio/clients',
  '/AndrewAsh/studio/contracts',
  '/AndrewAsh/studio/coaching',
  '/AndrewAsh/studio/media',
  '/AndrewAsh/studio/demos',
  '/AndrewAsh/studio/documents',
  '/AndrewAsh/studio/settings',
];

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const login = await page.request.post(`${BASE}/api/voice/auth/login`, { data: { email: USER, password: PASS } });
if (!login.ok()) {
  console.log(`✗ could not sign in (${login.status()})`);
  await browser.close();
  process.exit(1);
}

const seen = new Set();
const queue = [...SEEDS];
const results = [];

while (queue.length) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);

  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  const status = res?.status() ?? 0;

  // Next renders not-found with a 200 in some configurations, so the status alone is not the whole
  // answer — check for the notFound body too.
  const notFoundBody = await page
    .evaluate(() => /this page could not be found|404/i.test(document.body?.innerText?.slice(0, 400) ?? ''))
    .catch(() => false);

  const broken = status >= 400 || (status === 200 && notFoundBody);
  results.push({ path, status, notFoundBody, broken });

  if (broken) continue;

  // Collect every same-origin /AndrewAsh link on the page and follow it. Token URLs are skipped —
  // they are per-client and not part of the studio's own navigation.
  const links = await page
    .evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => h.startsWith('/AndrewAsh')),
    )
    .catch(() => []);

  for (const href of links) {
    const clean = href.split('#')[0];
    if (!clean || seen.has(clean)) continue;
    if (/\/(client|invoice|contract)\/[^/]{20,}/.test(clean)) continue; // per-client token links
    queue.push(clean);
  }
}

await browser.close();

const broken = results.filter((r) => r.broken);
for (const r of results.sort((a, b) => a.path.localeCompare(b.path))) {
  console.log(`  ${r.broken ? '✗' : '✓'} ${String(r.status).padEnd(3)} ${r.path}${r.notFoundBody ? '  (not-found body)' : ''}`);
}
console.log(
  broken.length === 0
    ? `\n✓ All ${results.length} reachable /AndrewAsh pages answer.\n`
    : `\n✗ ${broken.length} of ${results.length} are broken:\n${broken.map((b) => `    ${b.status} ${b.path}`).join('\n')}\n`,
);
process.exitCode = broken.length ? 1 : 0;
