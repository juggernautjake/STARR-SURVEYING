// scripts/nav-usage-report.mjs — which admin routes does anybody actually open?
//
//   node --env-file=.env.local scripts/nav-usage-report.mjs
//   node --env-file=.env.local scripts/nav-usage-report.mjs --days 14
//   node --env-file=.env.local scripts/nav-usage-report.mjs --by-person
//
// C0 of docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// ── WHY THIS SHIPS WITH THE EMITTER AND NOT AFTER IT ────────────────────────────────────────────
//
// A slice that writes rows nobody can read is not a slice, it is a table. The plan's C0 is "measure,
// THEN read it", and the reading half is where the decision actually gets made — so both halves land
// together or the data sits there being nominally available.
//
// ── THE THING THIS REPORT MUST NOT LET YOU DO ───────────────────────────────────────────────────
//
// Conclude that an unlisted route is unused. There are three reasons a route can be missing:
//
//   nobody opened it            the finding
//   nobody who opened it was in the window   the window's fault
//   it was never reachable to begin with     a BUG, and the most interesting outcome
//
// The third is why this prints the routes with zero views next to the roles that can see them,
// rather than as a bare list. A page no one has opened because the only role that could reach it has
// two people in it is a different problem from a page that is genuinely dead.

import fs from 'node:fs';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const DAYS = Number(arg('--days') ?? 30);
const BY_PERSON = process.argv.includes('--by-person');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set'); process.exit(2); }

const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
const res = await fetch(
  `${url}/rest/v1/nav_events?select=event_name,user_email,pathname,props,created_at`
  + `&event_name=eq.nav.route.view&created_at=gte.${since}&limit=50000`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
if (!res.ok) { console.error(res.status, await res.text()); process.exit(1); }
const rows = await res.json();

console.log(`\n  ${rows.length} route view(s) in the last ${DAYS} day(s)\n`);

if (rows.length === 0) {
  console.log('  Nothing recorded yet. Either the emitter has not shipped to production, or nobody has');
  console.log('  opened an admin page since it did. Both are indistinguishable from here, which is why');
  console.log('  the plan says to leave it running for two weeks before reading anything into it.\n');
  process.exit(0);
}

// One rule for what a route is, shared with the emitter — see lib/admin/route-usage.ts.
const routeOf = (r) => (r.props && r.props.route) || r.pathname || '(unknown)';

const views = new Map();
const people = new Map();
for (const r of rows) {
  const route = routeOf(r);
  if (!views.has(route)) views.set(route, { n: 0, who: new Set() });
  const v = views.get(route);
  v.n += 1;
  if (r.user_email) v.who.add(r.user_email);
  people.set(r.user_email, (people.get(r.user_email) ?? 0) + 1);
}

const ranked = [...views.entries()].sort((a, b) => b[1].n - a[1].n);
console.log('  ── OPENED ──\n');
console.log(`  ${'views'.padStart(6)}  ${'people'.padStart(6)}  route`);
for (const [route, v] of ranked) {
  console.log(`  ${String(v.n).padStart(6)}  ${String(v.who.size).padStart(6)}  ${route}`);
}

// ── Never opened, with the roles that could have ────────────────────────────────────────────────
const registry = fs.readFileSync('lib/admin/route-registry.ts', 'utf8');
const nav = [];
const re = /\{\s*href:\s*'([^']+)',\s*label:\s*'([^']+)',\s*workspace:\s*'([^']+)'([\s\S]{0,700}?)\n/g;
let m;
while ((m = re.exec(registry))) {
  // `roles` is written three ways in the registry: a literal array, a named constant
  // (`EQUIPMENT_ROLES`), and a spread of one plus extras (`[...PAY_ROLES, 'tech_support']`).
  //
  // The first version of this matched only literal arrays and printed "everyone" for the rest —
  // including all eight equipment routes, which are gated to four roles. That is worse than
  // printing nothing: the caveat three lines below TELLS the reader to check this column before
  // concluding a page is dead, and it was quietly answering "anyone can reach this" for a third of
  // the product. An unparsed value now says so.
  const rolesMatch = /roles:\s*(\[[^\]]*\]|[A-Z][A-Z_]+)/.exec(m[4]);
  nav.push({
    href: m[1],
    label: m[2],
    ws: m[3],
    roles: rolesMatch ? rolesMatch[1].replace(/\s+/g, ' ') : '(no roles field — open to any signed-in user)',
  });
}

const unopened = nav.filter((r) => !views.has(r.href));
console.log(`\n  ── NOT OPENED in ${DAYS} days: ${unopened.length} of ${nav.length} nav links ──\n`);
console.log('  A route here is UNOBSERVED, not proven unused. Read the roles column before concluding');
console.log('  anything: a page only two people can reach is quiet for a reason that is not disuse.\n');
const byWs = {};
for (const r of unopened) (byWs[r.ws] = byWs[r.ws] ?? []).push(r);
for (const ws of Object.keys(byWs).sort()) {
  console.log(`  ${ws}`);
  for (const r of byWs[ws]) console.log(`      ${r.href.padEnd(40)} ${r.roles.slice(0, 64)}`);
}

if (BY_PERSON) {
  console.log('\n  ── BY PERSON ──\n');
  for (const [who, n] of [...people.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${who}`);
  }
}
console.log('');
