// scripts/audit-route-auth.mjs — classify every business API route by the gate it actually has (B1-1).
//
// The surveying analysis opens with a near-miss worth not repeating: a first sweep reported 328 of 340
// admin routes as unauthenticated, because it grepped for `getServerSession` and this repo uses `auth()`
// and `isAdmin` from `lib/auth`. Re-measured with the right predicate: 340 of 340 gated, zero gaps.
//
// So this script does two things differently from that one.
//
//  1. **The predicates are DERIVED from the code**, not guessed. Every gate below was found by opening
//     routes and seeing what they call, and the list is printed with the run so a wrong one is visible
//     rather than silently shrinking the "gated" count.
//  2. **It reports per HANDLER, not per file.** A file whose GET is public and whose DELETE is not gated
//     is not a "gated route" — and per-file counting is exactly how a hole hides inside a mostly-safe
//     file.
//
// Run: `node scripts/audit-route-auth.mjs [--json]`

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const API = join(ROOT, 'app', 'api');

/** Handlers Next.js will route to. Anything else exported is a helper. */
const VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * What counts as a gate, and what each one means.
 *
 * Ordered most-specific first, because a route calling `requireAdmin()` also mentions `auth` and the
 * report should say the strongest thing that is true about it.
 */
const GATES = [
  { id: 'admin', label: 'admin/staff', re: /\b(requireAdmin|isAdmin|requireStaff|assertAdmin|adminGuard|requireRole|hasRole|requireOrgRole)\b/ },
  // NOTE THE MISSING TRAILING `\b` ON THE FIRST ALTERNATIVE, and it is the whole reason these are
  // printed. The first version was `/\b(auth\(\)|…)\b/`, and a `\b` after `)` cannot match: the next
  // character is `;` or a newline, both non-word, so there is no boundary there. It reported **246 of 613
  // admin handlers as ungated** — the exact shape of the near-miss this analysis opens with, reproduced
  // by a different wrong predicate, on the second attempt, by someone who had read the warning.
  { id: 'session', label: 'signed in', re: /\bauth\(\)|\b(getServerSession|getDndSession|getDndUser|requireUser|getSessionUser|currentUser)\b/ },
  { id: 'campaign', label: 'campaign member', re: /\bgetCampaignRole\b/ },
  // Found the same way as the rest: by opening the routes the sweep called ungated and reading what they
  // actually do. These gate on ownership of the RESOURCE rather than on a session — a stronger check, not
  // a missing one, and counting them as holes is how a sweep produces the alarming wrong number this
  // analysis opens by warning about.
  { id: 'resource', label: 'owns the resource', re: /\b(getCharacterAccess|requireCharacterWrite|assertCharacterAccess|isDndOwner|isDndOpenAccess)\b/ },
  // A shared secret in a header is a gate. The Stripe webhook uses a signature; the inbound-email one
  // uses a static secret, and both are named here so neither reads as unprotected.
  { id: 'secret', label: 'shared secret header', re: /\b(EMAIL_INBOUND_WEBHOOK_SECRET|x-webhook-secret|STRIPE_WEBHOOK_SECRET)\b/ },
  { id: 'signature', label: 'signed webhook', re: /\b(constructEvent|verifySignature|stripe\.webhooks|createHmac|timingSafeEqual|WORKER_API_KEY|CRON_SECRET)\b/ },
  { id: 'password', label: 'shared password', re: /\b(PAY_PORTAL_PASSWORD|portalPassword|checkPortalPassword)\b/ },
];

/**
 * Routes that are PUBLIC BY DESIGN — and every entry needs a reason, which is the point of the list.
 *
 * This is the ratchet. A route with no gate and no entry here fails the sweep, so the only way to add an
 * unauthenticated endpoint is to say, in writing, why it is one. "Nobody got round to it" cannot be
 * written down, which is the whole mechanism: the list is short because the reasons are hard.
 *
 * Every one below was read before being added. Two of them were CHANGED rather than excused — the four
 * `…/invoice/[number]/*` payment routes had no throttle at all until this sweep found them.
 */
const INTENTIONALLY_PUBLIC = new Map([
  // ── the public forms and portal ────────────────────────────────────────────────────────────────
  ['app/api/contact/route.ts', 'the public quote form — throttled (A1-2), honeypotted (A1-3), storage-capped (A1-5)'],
  ['app/api/public/invoice/[number]/route.ts', 'the customer invoice portal — throttled and constant-time (A1-4, A1-4b)'],
  ['app/api/public/invoice/[number]/intent/route.ts', 'a customer paying is not signed in — throttled (B1-1) and gated on PAYMENTS_LIVE'],
  ['app/api/public/invoice/[number]/attempt/route.ts', 'a customer marking a deep-link payment sent — throttled (B1-1)'],
  ['app/api/public/invoice/[number]/receipt/route.ts', 'a customer emailing themselves a receipt — throttled (B1-1)'],
  ['app/api/public/invoice/[number]/receipt/pdf/route.ts', 'the same receipt as a PDF — throttled (B1-1)'],

  // ── the door itself ────────────────────────────────────────────────────────────────────────────
  ['app/api/auth/[...nextauth]/route.ts', 'the sign-in endpoint'],
  ['app/api/auth/register/route.ts', 'account creation'],
  ['app/api/auth/check-status/route.ts', 'tells a signing-up user whether their account is approved yet'],
  ['app/api/signup/route.ts', 'account creation'],
  ['app/api/signup/precheck/route.ts', 'validates an org name before creating it — no write'],
  ['app/api/signup/complete/route.ts', 'creates the org and its first admin. Its DELETE is a ROLLBACK of the org it just made two statements earlier, not a destructive surface'],

  // ── /dnd, which is a hidden hub reachable by direct link (owner decision, 2026-07-06) ──────────
  ['app/api/dnd/auth/login/route.ts', 'sign-in'],
  ['app/api/dnd/auth/logout/route.ts', 'sign-out — clears a cookie and nothing else'],
  ['app/api/dnd/auth/quick/route.ts', 'the pseudo-login the hub is built on'],
  ['app/api/dnd/auth/register/route.ts', 'account creation'],
  ['app/api/dnd/auth/signup/route.ts', 'account creation'],
  ['app/api/dnd/auth/recover/route.ts', 'account recovery'],
  ['app/api/dnd/library/search/route.ts', 'reads the shared rules library — published reference content, no campaign data'],
  ['app/api/dnd/systems/route.ts', 'lists the game systems the app supports — a static catalogue'],

  // ── bearer-token access ────────────────────────────────────────────────────────────────────────
  ['app/api/share/[token]/route.ts', 'the TOKEN is the credential — checked against `is_revoked` and an expiry, and optionally a password'],
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === 'route.ts' || name === 'route.tsx') out.push(p);
  }
  return out;
}

/** The body of one exported handler, so a gate in a sibling verb does not count for this one. */
function handlerBody(src, verb) {
  const re = new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+${verb}\\b|const\\s+${verb}\\s*=)`);
  const m = src.match(re);
  if (!m) return null;
  const from = m.index;
  const rest = src.slice(from);
  // Up to the next export, or the end of file.
  const next = rest.slice(1).search(/\nexport\s+(?:async\s+)?(?:function|const)\s+[A-Z]/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

const files = walk(API).sort();
const rows = [];

for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const src = readFileSync(file, 'utf8');
  // A wrapper applied at module level (withErrorHandler, withAdmin…) counts for every handler in it.
  const moduleLevel = src.slice(0, src.search(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/) + 1 || src.length);

  for (const verb of VERBS) {
    const body = handlerBody(src, verb);
    if (!body) continue;
    const scope = body + '\n' + moduleLevel;
    const gate = GATES.find((g) => g.re.test(scope));
    rows.push({
      route: rel,
      verb,
      area: rel.startsWith('app/api/admin/') ? 'admin'
        : rel.startsWith('app/api/dnd/') ? 'dnd'
        : rel.startsWith('app/api/webhooks/') ? 'webhooks'
        : rel.startsWith('app/api/public/') ? 'public'
        : rel.startsWith('app/api/cron/') ? 'cron'
        : 'business',
      gate: gate?.id ?? null,
      gateLabel: gate?.label ?? null,
      publicByDesign: INTENTIONALLY_PUBLIC.has(rel),
      destructive: verb === 'DELETE' || /\.delete\(\)/.test(body),
      serviceRole: /supabaseAdmin/.test(scope),
    });
  }
}

const ungated = rows.filter((r) => !r.gate && !r.publicByDesign);
const business = rows.filter((r) => r.area !== 'dnd');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, ungated }, null, 2));
} else {
  console.log('Predicates used (a wrong one shrinks the gated count silently, so they are printed):');
  for (const g of GATES) console.log(`  ${g.id.padEnd(10)} ${g.re}`);
  console.log('');
  const byArea = new Map();
  for (const r of rows) {
    const k = r.area;
    const a = byArea.get(k) ?? { total: 0, gated: 0, publicByDesign: 0, ungated: 0 };
    a.total++;
    if (r.gate) a.gated++;
    else if (r.publicByDesign) a.publicByDesign++;
    else a.ungated++;
    byArea.set(k, a);
  }
  console.log('HANDLERS (not files) by area:');
  for (const [area, a] of [...byArea].sort()) {
    console.log(`  ${area.padEnd(10)} total ${String(a.total).padStart(4)}  gated ${String(a.gated).padStart(4)}  public-by-design ${a.publicByDesign}  UNGATED ${a.ungated}`);
  }
  console.log(`\nTotal handlers: ${rows.length}  ·  business (non-D&D): ${business.length}`);
  console.log(`Destructive handlers: ${rows.filter((r) => r.destructive).length}  ·  ungated destructive: ${rows.filter((r) => r.destructive && !r.gate && !r.publicByDesign).length}`);
  console.log(`Service-role handlers: ${rows.filter((r) => r.serviceRole).length}  ·  ungated service-role: ${rows.filter((r) => r.serviceRole && !r.gate && !r.publicByDesign).length}`);

  if (ungated.length) {
    console.log(`\nUNGATED (${ungated.length}) — each needs a gate or an entry in INTENTIONALLY_PUBLIC with a reason:`);
    for (const r of ungated) {
      console.log(`  ${r.verb.padEnd(6)} ${r.route}${r.destructive ? '   [DESTRUCTIVE]' : ''}${r.serviceRole ? '   [service-role]' : ''}`);
    }
  } else {
    console.log('\nNo ungated handlers that are not accounted for.');
  }
}

// THE RATCHET. A route with no gate and no reason fails the run, so the only way to add an
// unauthenticated endpoint is to write down why it is one — and "nobody got round to it" cannot be
// written down. `__tests__/security/route-authorization.test.ts` runs this and reads the exit code.
process.exit(ungated.length ? 1 : 0);
