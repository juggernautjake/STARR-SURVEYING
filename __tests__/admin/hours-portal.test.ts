// __tests__/admin/hours-portal.test.ts
//
// C4 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md — the first portal to
// prove §5, *"one portal, several views"*.
//
// ── WHY THIS SLICE GETS ITS OWN TEST FILE AND C3 DID NOT ────────────────────────────────────────
//
// Equipment merged ten pages that shared one role list. Hours merges FOUR PAGES WITH FOUR DIFFERENT
// ONES, and §5 names the failure that invites:
//
//     "a portal reachable by six roles whose tabs are gated to one is a WIDER door than six
//      separately-gated pages, and it is the single most dangerous thing in this plan."
//
// Widening is invisible. Nothing errors, no test goes red, and the only symptom is somebody seeing a
// tab they should not — which nobody reports, because from their side it looks like a feature. So
// each tab's role list is asserted against the list its PAGE carried, character for character.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveTab, visibleTabs, type PortalSpec } from '@/lib/admin/portal/tabs';
import { ADMIN_ROUTES, accessibleRoutes } from '@/lib/admin/route-registry';

const ROOT = path.join(__dirname, '..', '..');

/** The commit before C4 — the Equipment portal. See the note in `rolesBeforeC4`. */
const BEFORE_C4 = '3aef7ec5f';

/** The portal's spec, read out of the page rather than duplicated — a second copy would drift. */
const PAGE = fs.readFileSync(path.join(ROOT, 'app/admin/hours/page.tsx'), 'utf8');

/**
 * The four role lists as they were the day before C4, read from git rather than from my memory.
 *
 * This is the assertion that actually protects §5's first rule. Retyping the lists here would test
 * that I typed the same thing twice, which is exactly the mistake being guarded against.
 */
function rolesBeforeC4(): Record<string, string[] | null> {
  // ── PINNED, NOT `HEAD` ─────────────────────────────────────────────────────────────────────
  //
  // This said `HEAD:`, which was right for exactly one commit and wrong the moment another landed —
  // C5 the next morning. A test that reads "the previous version" from a moving reference is not
  // pinned to anything; it silently starts comparing the code against ITSELF and passes forever.
  //
  // `3aef7ec5f` is the Equipment portal commit, the last one before C4 touched these four rows. If
  // it is ever unreachable — a squash, a fresh clone with a shallow fetch — the test SKIPS with a
  // note rather than passing quietly, because a guard that cannot read its baseline has not verified
  // anything.
  let before: string;
  try {
    before = execFileSync('git', ['show', `${BEFORE_C4}:lib/admin/route-registry.ts`], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // Unreachable commit. Returning an empty map makes the first assertion below fail loudly with a
    // readable message rather than letting the four comparisons pass against `undefined` — which is
    // what `toEqual` does when both sides are undefined, and would be this guard verifying nothing
    // while showing green.
    return {};
  }
  const out: Record<string, string[] | null> = {};
  for (const href of ['/admin/my-hours', '/admin/hours-approval', '/admin/time-off', '/admin/availability']) {
    const line = before.split(/\r?\n/).find((l) => l.includes(`href: '${href}',`));
    if (!line) { out[href] = undefined as never; continue; }
    const m = line.match(/roles: \[([^\]]*)\]/);
    if (!m) { out[href] = null; continue; }               // null = ungated, which is a real answer
    out[href] = m[1]
      .replace(/\.\.\.WORK_ROLES/, "'admin', 'developer', 'field_crew'")
      .split(',').map((r) => r.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }
  return out;
}

/** The tab role lists, parsed out of the page's spec. */
function tabRoles(id: string): string[] | null {
  const block = PAGE.slice(PAGE.indexOf(`id: '${id}'`));
  const end = block.indexOf('\n    },');
  const chunk = block.slice(0, end === -1 ? 400 : end);
  const m = chunk.match(/roles: (?:APPROVERS as never|\[([^\]]*)\])/);
  if (!m) return null;
  if (!m[1]) return ['admin', 'developer', 'tech_support'];   // the APPROVERS constant
  return m[1].split(',').map((r) => r.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

describe('§5 rule 1 — the portal is not a wider door than the pages it absorbed', () => {
  const before = rolesBeforeC4();

  const PAIRS: Array<[string, string]> = [
    ['my-time', '/admin/my-hours'],
    ['approvals', '/admin/hours-approval'],
    ['time-off', '/admin/time-off'],
    ['availability', '/admin/availability'],
  ];

  it('reads the old lists out of git, so this tests the code and not my typing', () => {
    // A scan that quietly found nothing would pass every assertion below while proving none of them.
    expect(Object.keys(before)).toHaveLength(4);
    expect(before['/admin/hours-approval']).toEqual(['admin', 'developer', 'tech_support']);
  });

  for (const [tab, href] of PAIRS) {
    it(`${tab} carries exactly the roles ${href} carried`, () => {
      const was = before[href];
      const now = tabRoles(tab);
      if (was === null) {
        // `/admin/time-off` was ungated: every employee may ask for leave. Gating it here would be
        // this slice NARROWING a door while claiming to merge four pages — the same sin as widening
        // one, and harder to notice because nobody complains about access they never had.
        expect(now).toBeNull();
        return;
      }
      expect([...(now ?? [])].sort()).toEqual([...was!].sort());
    });
  }
});

describe('§5 rule 2 — never render an empty portal', () => {
  const spec: PortalSpec = {
    route: '/admin/hours',
    tabs: [
      { id: 'my-time', label: 'My time', roles: tabRoles('my-time') as never },
      { id: 'approvals', label: 'Approvals', roles: tabRoles('approvals') as never },
      { id: 'time-off', label: 'Time off' },
      { id: 'availability', label: 'Availability', roles: tabRoles('availability') as never },
    ],
    defaultTab: 'my-time',
  };

  it('every role sees at least one tab', () => {
    // The registry gates a ROUTE, not a tab, so a portal visible to somebody with no visible tab is
    // a dead link in their sidebar. That cannot happen here because `time-off` is ungated — and this
    // asserts it for every role the product has rather than for the three I thought of.
    for (const role of ['admin', 'developer', 'employee', 'field_crew', 'guest', 'student', 'teacher', 'researcher', 'drawer', 'tech_support', 'equipment_manager', 'finance']) {
      const seen = visibleTabs(spec, { roles: [role] });
      expect(seen.length, `${role} sees no tab`).toBeGreaterThan(0);
    }
  });

  it('and the registry row is ungated, which is the union rather than a widening', () => {
    const row = ADMIN_ROUTES.find((r) => r.href === '/admin/hours');
    expect(row).toBeDefined();
    // Ungated because one of the four absorbed pages was. A row gated tighter than the union would
    // have removed somebody's access; gated looser would have granted it.
    expect(row!.roles).toBeUndefined();
  });

  it('and the four absorbed routes are out of the nav', () => {
    // Their ROUTES still exist and forward — this is about the sidebar, which is the point of the
    // whole document. A nav entry that lands on a redirect is a row that flickers.
    for (const href of ['/admin/my-hours', '/admin/hours-approval', '/admin/time-off', '/admin/availability']) {
      expect(ADMIN_ROUTES.find((r) => r.href === href), `${href} is still in the registry`).toBeUndefined();
    }
  });
});

describe('§5 rule 3 — the default is per role, and the URL still wins', () => {
  const spec: PortalSpec = {
    route: '/admin/hours',
    tabs: [
      { id: 'my-time', label: 'My time', roles: ['admin', 'developer', 'field_crew', 'employee', 'tech_support'] as never },
      { id: 'approvals', label: 'Approvals', roles: ['admin', 'developer', 'tech_support'] as never },
      { id: 'time-off', label: 'Time off' },
      { id: 'availability', label: 'Availability', roles: ['admin', 'developer', 'tech_support', 'equipment_manager'] as never },
    ],
    defaultTab: (roles) => {
      if (roles.some((r) => ['admin', 'developer', 'tech_support'].includes(r))) return 'approvals';
      if (roles.includes('equipment_manager')) return 'availability';
      return 'my-time';
    },
  };

  it('an approver opens on the queue waiting for them', () => {
    expect(resolveTab(spec, null, { roles: ['admin'] })).toBe('approvals');
  });

  it('a dispatcher opens on the day they are planning', () => {
    expect(resolveTab(spec, null, { roles: ['equipment_manager'] })).toBe('availability');
  });

  it('and everybody else on their own hours', () => {
    expect(resolveTab(spec, null, { roles: ['field_crew'] })).toBe('my-time');
    expect(resolveTab(spec, null, { roles: ['employee'] })).toBe('my-time');
  });

  it('a URL for a tab you may not see does not open it', () => {
    // *"A default is a courtesy; it is not a permission."* A field crew member sent
    // `/admin/hours?tab=approvals` gets their own timesheet, not somebody else's approval queue.
    expect(resolveTab(spec, 'approvals', { roles: ['field_crew'] })).toBe('my-time');
    expect(resolveTab(spec, 'availability', { roles: ['employee'] })).toBe('my-time');
  });

  it('but a URL for one you MAY see beats your default', () => {
    expect(resolveTab(spec, 'my-time', { roles: ['admin'] })).toBe('my-time');
  });

  it('and a guest, who has only time-off, lands on it rather than on nothing', () => {
    // The per-role default names `my-time`, which a guest cannot see. C2 falls through to the first
    // visible tab rather than rendering an empty portal for exactly the people it defaulted for.
    expect(resolveTab(spec, null, { roles: ['guest'] })).toBe('time-off');
  });
});

describe('the API is the boundary, not the tab', () => {
  it('this portal refuses nothing on its own', () => {
    // §5 rule 1's other half: *"A tab hidden in the UI is a convenience; the route behind it must
    // still refuse."* Every endpoint these four pages called keeps every check it had — this slice
    // moved components between files and did not touch a single handler.
    expect(PAGE).not.toMatch(/status: 40[13]/);
    expect(PAGE).not.toMatch(/isAdmin\(/);
  });

  it('and an admin still cannot reach a page their role never offered', () => {
    // A sanity check on the merge as a whole rather than on this file: consolidating four rows into
    // one must not have changed what any role can reach elsewhere.
    const guest = accessibleRoutes({ roles: ['guest'] as never, isCompanyUser: false });
    expect(guest.find((r) => r.href === '/admin/settings')).toBeUndefined();
  });
});
