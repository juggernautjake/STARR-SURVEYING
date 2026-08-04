// __tests__/middleware/admin-route-gates.test.ts
//
// CAD_AUDIT / platform Slice S19 — every /admin page route is either role-gated or knowingly open.
//
// Origin: `/admin/receipts` rendered its bookkeeping shell for any authenticated user while its API
// answered 403. Nothing leaked — but the page was reachable, and finding that took a browser and a
// console log. Thirty-six page routes had no ROUTE_ROLES entry; seven of them were money surfaces.
//
// The bug worth preventing is not those seven (they are fixed in middleware.ts). It is the eighth:
// a money page added six months from now, gated nowhere, discovered the same slow way. So the rule
// is enforced here rather than remembered — a new `app/admin/<x>/page.tsx` fails this test until
// someone either gates it or writes down why it is open.
//
// This asserts REACHABILITY POLICY, not data safety. The API's own `isAdmin` check is what actually
// holds data back, and it is tested where it lives. A route being listed here proves someone made
// a decision about it, which is all a middleware layer can honestly promise.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_ROLES } from '@/lib/auth-roles';

const REPO = join(__dirname, '..', '..');
const ADMIN_DIR = join(REPO, 'app', 'admin');

/**
 * Page routes deliberately reachable by any authenticated user. Every entry needs a reason: the
 * point of the list is to make "open" a decision someone recorded, not a gap nobody noticed.
 */
const INTENTIONALLY_OPEN: Record<string, string> = {
  // ── Personal surfaces: the user's own data, by definition ──
  'me': "the user's own profile hub",
  // Restored as a real route 2026-08-04: your own profile form, Hub theme, density and font scale.
  // Open for the same reason `me` is — it is your data and your appearance settings, and its API
  // (`/api/admin/me/*`) resolves the row from the session rather than from anything typed.
  'profile': "the user's own profile and appearance settings",
  'my-files': 'the signed-in user\'s own files',
  'my-jobs': "redirected to /admin/me by LEGACY_REDIRECTS before the role check",
  'my-hours': 'redirected to /admin/me by LEGACY_REDIRECTS before the role check',
  'my-pay': 'redirected to /admin/me by LEGACY_REDIRECTS before the role check',
  'availability': 'a crew member sets their own availability',
  'time-off': 'a crew member files their own request; the approval queue is gated separately',
  'mileage': 'a crew member logs their own mileage',
  'notifications': "the user's own notification feed",
  'install': 'PWA install instructions — static help content',
  'login': 'the sign-in page itself',
  'logout': 'the sign-out page itself',

  // ── Staff-wide by design ──
  'people': 'the staff directory is open to staff; its API strips roles/account state for non-admins',
  'contacts': 'shared customer contact list used by anyone who answers a phone',
  'calendar': 'the shared work calendar',
  'search': 'federated search; each underlying source applies its own gate',
  'weather': 'public weather data for field planning',
  'announcements': 'company announcements are meant to be read by everyone',
  'work-mode': 'the field surveyor entry point',
  'work': 'a workspace link hub; destinations are gated individually',
  'money': 'a workspace link hub; destinations are gated individually',
  'office': 'a workspace link hub; destinations are gated individually',
  'timeline': 'job timeline view; job access is gated at /admin/jobs',
  'field-data': 'field crews upload and read their own captures',
  'equipment': 'crews check gear in and out; the manager hub is a separate route',
  'vehicles': 'crews record vehicle condition',
  'files': 'the file explorer enforces per-node permissions in file_permissions, not by route',
  'support': 'anyone can file a support request',
  'learn': 'course content is open to any authenticated user; /learn/manage and /learn/students are gated',

  // ── SaaS: scoped by org membership (resolveAdminOrg), not by Starr's internal roles ──
  'billing': 'SaaS — org-scoped via resolveAdminOrg; an `admin` gate would lock out org admins',
  'payouts': 'SaaS — org-scoped via resolveAdminOrg',
  'audit': 'SaaS — org-scoped via resolveAdminOrg',
  'org-settings': 'SaaS — org-scoped via resolveAdminOrg',
  'orgs': 'SaaS — org-scoped via resolveAdminOrg',
  'invites': 'SaaS — org-scoped via resolveAdminOrg',
  'research-cad': 'CAD is open to every signed-in role per Slice W4; this is a CAD entry point',
};

function middlewareSource(): string {
  return readFileSync(join(REPO, 'middleware.ts'), 'utf8');
}

/** Top-level segments under app/admin that are real page routes. */
function adminPageSegments(): string[] {
  return readdirSync(ADMIN_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // Route groups `(x)`, private `_x`, and dynamic `[x]` are not literal URL segments.
    .filter((n) => !n.startsWith('(') && !n.startsWith('_') && !n.startsWith('['))
    .filter((n) => existsSync(join(ADMIN_DIR, n, 'page.tsx')));
}

/** Prefixes ROUTE_ROLES actually gates, read from the source of truth. */
function gatedPrefixes(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/\{\s*prefix:\s*'(\/admin\/[^']+)'/g)) {
    out.add(m[1]);
  }
  return out;
}

describe('admin route gates', () => {
  const src = middlewareSource();
  const gated = gatedPrefixes(src);
  const segments = adminPageSegments();

  it('finds the admin page routes and the middleware table', () => {
    // Guards the instrument: if either scan silently returns nothing, every assertion below passes
    // vacuously and this file becomes decoration. That failure mode has bitten this repo before.
    expect(segments.length).toBeGreaterThan(20);
    expect(gated.size).toBeGreaterThan(20);
  });

  it('gates every admin page route or records why it is open', () => {
    const ungoverned = segments.filter(
      (s) => !gated.has(`/admin/${s}`) && !(s in INTENTIONALLY_OPEN),
    );

    expect(
      ungoverned,
      ungoverned.length
        ? `These /admin routes are reachable by ANY authenticated user and nobody has said whether ` +
          `that is intended:\n` +
          ungoverned.map((s) => `  /admin/${s}`).join('\n') +
          `\n\nEither add a { prefix, roles } entry to ROUTE_ROLES in middleware.ts (copy the role ` +
          `list from the route's own API check — the API is the real boundary), or add the segment ` +
          `to INTENTIONALLY_OPEN in this file with a one-line reason.`
        : undefined,
    ).toEqual([]);
  });

  it('keeps the money surfaces gated', () => {
    // Named explicitly because these are the seven the audit found open, and a silent regression
    // here reads as "no test failed" rather than "the bookkeeping queue is public to staff again".
    for (const p of [
      '/admin/receipts',
      '/admin/invoicing',
      '/admin/receivables',
      '/admin/reports',
      '/admin/compliance',
      '/admin/team',
      '/admin/finances',
    ]) {
      expect(gated.has(p), `${p} lost its ROUTE_ROLES entry`).toBe(true);
    }
  });

  it('orders specific prefixes before the general ones that contain them', () => {
    // ROUTE_ROLES is first-match-wins and `break`s on the first hit, so a general prefix placed
    // above a specific one silently swallows it: `/admin/jobs` before `/admin/jobs/new` would hand
    // job creation the wider list and no test would notice. The file says this in a comment; a
    // comment cannot fail. Checked over the whole table, not just the entries added by this slice.
    const order = [...src.matchAll(/\{\s*prefix:\s*'(\/admin\/[^']+)'/g)].map((m) => m[1]);
    const shadowed: string[] = [];
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        if (order[j] !== order[i] && order[j].startsWith(order[i] + '/')) {
          shadowed.push(`'${order[i]}' (line ${i + 1} of the table) shadows '${order[j]}'`);
        }
      }
    }
    expect(
      shadowed,
      shadowed.length
        ? `A general prefix precedes a more specific one, so the specific entry is unreachable:\n` +
          shadowed.map((s) => `  ${s}`).join('\n') +
          `\nMove the more specific prefix above the general one.`
        : undefined,
    ).toEqual([]);
  });

  it('never shows a nav link to a role its own gate would bounce', () => {
    // This caught a live regression while the slice was being written: the new '/admin/receipts'
    // gate also matched '/admin/receipts/new' — Capture Receipt — and would have bounced every
    // field-crew member at the moment they tried to photograph a fuel receipt. The sidebar would
    // have gone on showing them the link.
    //
    // A link that redirects is worse than a missing one: the user reads it as the app being broken,
    // and there is nothing on screen to suggest otherwise.
    const ROLE_CONSTANTS: Record<string, string[]> = {
      WORK_ROLES: ['admin', 'developer', 'field_crew'],
      RESEARCH_ROLES: ['admin', 'developer', 'researcher', 'drawer'],
      CONTENT_MGMT_ROLES: ['admin', 'developer', 'teacher'],
      PAY_ROLES: ['admin', 'developer', 'field_crew'],
    };
    const parseRoles = (raw: string): string[] =>
      raw.split(',').flatMap((tok) => {
        const t = tok.trim();
        if (!t) return [];
        if (t.startsWith('...')) return ROLE_CONSTANTS[t.slice(3)] ?? [`UNRESOLVED:${t}`];
        return [t.replace(/'/g, '')];
      });

    const registry = readFileSync(join(REPO, 'lib', 'admin', 'route-registry.ts'), 'utf8');
    // Order matters: middleware takes the FIRST matching prefix and breaks, so the check must too.
    const gates = [...src.matchAll(/\{\s*prefix:\s*'(\/admin\/[^']+)',\s*roles:\s*\[([^\]]*)\]/g)]
      .map((m) => ({ prefix: m[1], roles: parseRoles(m[2]) }));
    const navEntries = [...registry.matchAll(/href:\s*'(\/admin\/[^']+)'[^\n]*?roles:\s*\[([^\]]*)\]/g)]
      .map((m) => ({ href: m[1], roles: parseRoles(m[2]) }));

    expect(navEntries.length, 'nav registry scan found nothing — the instrument is broken').toBeGreaterThan(40);
    // An unresolved `...SPREAD` would silently look like a missing role and fail the wrong way.
    const unresolved = [...gates, ...navEntries].flatMap((e) =>
      ('roles' in e ? e.roles : []).filter((r) => r.startsWith('UNRESOLVED:')),
    );
    expect(unresolved, 'add the new role constant to ROLE_CONSTANTS above').toEqual([]);

    const bounced: string[] = [];
    for (const nav of navEntries) {
      const gate = gates.find((g) => nav.href === g.prefix || nav.href.startsWith(g.prefix + '/'));
      if (!gate) continue; // ungated is covered by the reachability test above
      const missing = nav.roles.filter((r) => !gate.roles.includes(r));
      if (missing.length) {
        bounced.push(
          `${nav.href} — nav offers it to [${missing.join(', ')}] but the first matching gate ` +
            `'${gate.prefix}' allows only [${gate.roles.join(', ')}]`,
        );
      }
    }
    expect(
      bounced,
      bounced.length
        ? `These roles see a sidebar link that redirects them to /admin/me:\n` +
          bounced.map((b) => `  ${b}`).join('\n') +
          `\n\nEither widen the gate, narrow the nav entry's roles, or add a more specific prefix ` +
          `ABOVE the general one (that is what /admin/receipts/new does).`
        : undefined,
    ).toEqual([]);
  });

  it('lets every signed-in role file a receipt', () => {
    // S19 shipped '/admin/receipts/new' with the nav registry's seven roles and silently dropped
    // `employee` — the role middleware itself falls back to for any staff member without an explicit
    // one. A new hire could file a receipt before that gate existed and could not afterwards.
    //
    // The API behind this page (`/api/admin/receipts/upload`) checks only that a session exists. So
    // the gate must list EVERY role, and it must be checked against ALL_ROLES rather than a copy —
    // otherwise adding a twelfth role locks its holders out of expense filing, and nothing says so.
    //
    // The entry cannot simply be deleted: '/admin/receipts' matches this path too, and first-match
    // wins, so removing it hands the route to the approval queue's admin-only gate.
    const entry = [...src.matchAll(/\{\s*prefix:\s*'(\/admin\/[^']+)',\s*roles:\s*\[([^\]]*)\]/g)]
      .find((m) => m[1] === '/admin/receipts/new');
    expect(entry, "'/admin/receipts/new' must stay listed ABOVE '/admin/receipts'").toBeTruthy();

    const granted = entry![2].split(',').map((r) => r.trim().replace(/'/g, '')).filter(Boolean);
    const missing = ALL_ROLES.filter((r) => !granted.includes(r));
    expect(
      missing,
      missing.length
        ? `These roles cannot reach Capture Receipt, but its API accepts any session: ` +
          `[${missing.join(', ')}]`
        : undefined,
    ).toEqual([]);
  });

  it('does not gate the staff directory', () => {
    // The inverse regression: someone "fixes" the open routes in bulk and quietly removes a feature
    // crews use daily. /admin/people is open on purpose and its API strips the sensitive fields.
    expect(gated.has('/admin/people')).toBe(false);
  });

  it('has a stated reason for every intentionally-open route', () => {
    for (const [seg, reason] of Object.entries(INTENTIONALLY_OPEN)) {
      expect(reason.trim().length, `${seg} needs a real reason, not a placeholder`).toBeGreaterThan(15);
    }
  });
});
