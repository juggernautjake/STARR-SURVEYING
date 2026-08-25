// __tests__/admin/sidebar-registry-parity.test.ts — one source of navigation truth (§1.3).
//
// Platform audit §1.3: `AdminSidebar.tsx` kept ~180 lines of hand-written nav items while
// `lib/admin/route-registry.ts` kept its own list, and they had drifted — **32 routes were in the
// registry and missing from the sidebar**: Invoicing, Contacts, Files, Calendar, Support, Reports,
// Billing, Org Settings, Audit Log, Invites, Announcements. Reachable on a desktop, invisible on a
// phone, because two lists of the same thing drift the moment anybody adds a page to one of them.
//
// The audit's prescribed fix was *"delete AdminSidebar.tsx"*. That would have deleted mobile
// navigation outright — the component is the mobile drawer, not just a legacy desktop sidebar. The
// second SOURCE was the defect, not the second SURFACE. So the drawer stayed and its list went: it
// now derives from `ADMIN_ROUTES`, grouped by workspace.
//
// This file is the migration's receipt. The list below is every href the hand-written sidebar showed
// on the day it was converted, frozen. Nothing on it may stop being reachable from the drawer.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_ROUTES, WORKSPACE_ORDER, accessibleRoutes } from '@/lib/admin/route-registry';

/** Every href the hand-maintained sidebar rendered, captured from the last commit before conversion.
 *  A migration is only safe if you can prove nothing fell out of it — otherwise "we simplified the
 *  navigation" and "we deleted some of the navigation" look identical from the diff. */
const LEGACY_SIDEBAR_HREFS = [
  // `/admin/dashboard` was on this list until platform audit Phase 1 item 6 (2026-08-01) deleted the
  // page as the second competing home. It is removed here rather than excused: this list means "must
  // still be REACHABLE", and a route that no longer exists cannot satisfy it. The guarantee that its
  // URL still goes somewhere sensible moved to `__tests__/middleware/legacy-redirects.test.ts`,
  // which asserts both the redirect target AND that no page file survives to shadow it.
  '/admin/assignments', '/admin/schedule',
  '/admin/learn', '/admin/learn/roadmap', '/admin/learn/modules', '/admin/learn/knowledge-base',
  '/admin/learn/flashcards', '/admin/learn/exam-prep', '/admin/learn/quiz-history',
  '/admin/learn/fieldbook', '/admin/learn/search', '/admin/learn/students', '/admin/learn/manage',
  '/admin/jobs',
  // ── The five `?tab=` hrefs became real pages on 2026-08-04 ───────────────────────────────────
  //
  // This list is the OLD hand-written drawer, kept so the registry conversion can be proved to have
  // lost nothing. It faithfully recorded five entries pointing at `/admin/me?tab=…` — the Hub — and
  // that is what the owner clicked when they reported "every nav menu link routes back to the hub".
  //
  // Updated to the destinations that answer them, because the property this file defends is *"the
  // conversion lost nothing"*, not *"the hrefs never change"*. Leaving the old strings here would make the
  // guard demand the registry keep pointing five menu items at a page that cannot serve them.
  '/admin/assignments',   // was ?tab=jobs — folded into the entry that already existed
  // C4: the old drawer's '/admin/my-hours' is the Hours portal's `my-time` tab. The route still
  // forwards; this list is about what the DRAWER offers, and it offers one row now.
  '/admin/hours',         // was /admin/my-hours, and before that ?tab=hours
  // C6 absorbed these into the Pay portal. They are hrefs the OLD drawer had; the drawer offers
  // one row now, and every one of these still forwards to its tab.
  '/admin/pay',
  '/admin/my-notes',      // was ?tab=notes
  '/admin/profile',       // was ?tab=profile — folded into 'Profile & Settings'
  '/admin/equipment', '/admin/research', '/admin/cad',
  // C8: both are inside the Customer Money portal now — one as the `incoming` tab, one as its
  // 'New invoice' button. The drawer offers the portal.
  '/admin/invoicing',
  '/admin/messages', '/admin/install', '/admin/settings', '/admin/error-log',
] as const;

describe('the conversion lost nothing', () => {
  it('every legacy sidebar href is still registered', () => {
    const known = new Set(ADMIN_ROUTES.map((r) => r.href));
    const missing = LEGACY_SIDEBAR_HREFS.filter((h) => !known.has(h));
    expect(missing, 'hrefs the old drawer had that no longer exist in the registry').toEqual([]);
  });

  it('and none of them was quietly demoted to palette-only', () => {
    // This caught a real regression while the conversion was being written. Five routes —
    // invoices/new, payments/inbox, payouts/runs, rewards/how-it-works, rewards/admin — had been
    // registered `showInRail: false` in the §1.4 pass, on the reasonable-sounding grounds that a rail
    // with everything on it is a rail nobody scans. But the hand-written drawer HAD shown them. The
    // moment the drawer started deriving from the registry, "palette-only" silently meant "gone from
    // mobile" — a navigation regression delivered as a cleanup.
    const demoted = ADMIN_ROUTES
      .filter((r) => (LEGACY_SIDEBAR_HREFS as readonly string[]).includes(r.href))
      .filter((r) => r.showInRail === false)
      .map((r) => r.href);
    expect(demoted, 'routes the old drawer showed that would now vanish from it').toEqual([]);
  });
});

describe('there is exactly one source of navigation truth', () => {
  const SIDEBAR = readFileSync(
    join(process.cwd(), 'app', 'admin', 'components', 'AdminSidebar.tsx'), 'utf8',
  );

  it('the drawer hand-declares no routes of its own', () => {
    // The specific failure mode being ratcheted. Adding one literal item here is how the drift starts,
    // and it looks entirely reasonable at the time — the registry edit is the easy step to skip.
    expect(SIDEBAR).not.toMatch(/href: '\/admin\//);
  });

  it('and it gates through accessibleRoutes rather than its own role logic', () => {
    // Two places expressing "who may see this" is the same bug in a different costume: the lists could
    // agree on which routes exist and still disagree on who sees them.
    expect(SIDEBAR).toMatch(/accessibleRoutes\(/);
    expect(SIDEBAR).not.toMatch(/const canAccess/);
  });

  it('the nav-v2 flag is gone, so there is one shell rather than two', () => {
    // Comments stripped before matching. Both files carry a note explaining WHY the flag went, and a
    // bare string search would flag the explanation as the thing it warns about — banning the word
    // would just delete the reasoning and leave the next reader to rederive it.
    const code = (rel: string) =>
      readFileSync(join(process.cwd(), rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

    expect(code('lib/admin/nav-store.ts')).not.toMatch(/adminNavV2Enabled|setNavV2/);
    expect(code('app/admin/components/AdminLayoutClient.tsx')).not.toMatch(/navV2/);
  });
});

describe('the derived drawer is usable, not merely correct', () => {
  const admin = accessibleRoutes({
    roles: ['admin'],
    isCompanyUser: true,
  }).filter((r) => r.showInRail !== false);

  it('groups into workspaces the rail already uses, so the two agree by construction', () => {
    const workspaces = new Set(admin.map((r) => r.workspace));
    for (const ws of workspaces) expect(WORKSPACE_ORDER).toContain(ws);
  });

  it('shows an admin far more than the 64 links the hand-written list managed', () => {
    // The point of the exercise: the drift was costing ~32 routes on mobile.
    expect(admin.length).toBeGreaterThan(LEGACY_SIDEBAR_HREFS.length);
  });

  it('still hides internal-only routes from a non-company user', () => {
    // The conversion must not widen access. `accessibleRoutes` is now the ONLY gate, so if it were
    // wrong it would be wrong on every surface at once.
    const outsider = accessibleRoutes({ roles: ['employee'], isCompanyUser: false });
    expect(outsider.every((r) => !r.internalOnly)).toBe(true);
  });

  it('gives a field-crew user a smaller drawer than an admin', () => {
    const crew = accessibleRoutes({ roles: ['field_crew'], isCompanyUser: true })
      .filter((r) => r.showInRail !== false);
    expect(crew.length).toBeGreaterThan(0);
    expect(crew.length).toBeLessThan(admin.length);
  });
});
