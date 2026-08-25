// The Money workspace and the People directory (platform audit §2.2 / §2.3, Phase 1 items 7 + 8).
//
// §2.2 found thirty money surfaces with no financial home and a vocabulary that actively misled;
// §2.3 found ten routes describing one noun. The fix is registry data plus two new pages, so most of
// what can go wrong is a route filed under the wrong heading or a name that collides again — both
// checkable here, and neither visible in a screenshot.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADMIN_ROUTES,
  WORKSPACES,
  WORKSPACE_ORDER,
  findRoute,
  routesForWorkspace,
  workspaceOf,
} from '@/lib/admin/route-registry';
import { PERSONAS } from '@/lib/admin/personas';
import { WORKSPACE_DEFAULT_BUNDLE } from '@/lib/saas/bundle-gate';

const ROOT = process.cwd();
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('item 7 — Money is one workspace', () => {
  it('exists, is ordered, and has a landing page on disk', () => {
    expect(WORKSPACES.money).toBeDefined();
    expect(WORKSPACE_ORDER).toContain('money');
    expect(exists('app/admin/money/page.tsx')).toBe(true);
    expect(findRoute('/admin/money')).toBeDefined();
  });

  it('gathered the surfaces §2.2 listed, from BOTH workspaces they were split across', () => {
    const money = routesForWorkspace('money').map((r) => r.href);
    // A sample from each of the four sections, and specifically ones that used to live in different
    // workspaces — /admin/finances and /admin/mileage were Work, the rest were Office.
    for (const href of [
      // C8 absorbed /admin/receivables and /admin/payments/inbox into the Customer Money portal,
      // which is itself in Money. Same invariant, one row instead of three.
      '/admin/invoicing',
      // `/admin/mileage` was a sample here until C5 absorbed it as the Receipts portal's `mileage`
      // tab, alongside `/admin/cards` and `/admin/pass-through`. The invariant this test guards —
      // the firm's money surfaces live in ONE workspace rather than scattered across two — is
      // untouched and is in fact stronger: `/admin/receipts` is in Money and mileage is inside it.
      // Listing the old href would assert a row that deliberately went away.
      // C6 absorbed /admin/payroll and /admin/payouts into the Pay portal, which is itself in Money.
      // The invariant — the firm's money surfaces live in ONE workspace — is stronger, not weaker.
      '/admin/pay', '/admin/receipts',
      // C8 absorbed /admin/finances/overview as the Books & Tax portal's `overview` tab.
      '/admin/finances',
      // `/admin/billing/upgrade` was a sample here until C1 of the consolidation plan removed it
      // from the registry. It is not in ANY workspace now, deliberately: it is the interstitial the
      // bundle gate sends you to, not a place you navigate to, and a sidebar row reading "Upgrade
      // Plan" rendered "Unknown bundle" when clicked because the parameters that give it meaning
      // only exist when the gate sends you. The invariant this test guards — the firm's money
      // surfaces live in ONE workspace rather than scattered across two — is untouched: the
      // subscription is still here, as `/admin/billing`, which now carries its three tabs.
      '/admin/billing',
    ]) {
      expect(money, `${href} is not in the Money workspace`).toContain(href);
    }
  });

  it('every Money route names which of the four sections it is in', () => {
    // The audit's grouping is the point. A route with no section renders under "Everything else",
    // which is where pages go to be missed.
    const unsectioned = routesForWorkspace('money')
      .filter((r) => r.href !== '/admin/money')
      .filter((r) => !r.section);
    expect(unsectioned.map((r) => r.href)).toEqual([]);
  });

  it('and only uses the four §2.2 named', () => {
    const sections = new Set(routesForWorkspace('money').map((r) => r.section).filter(Boolean));
    expect([...sections].sort()).toEqual(['Company account', 'Money in', 'Money out', 'Profitability']);
  });

  it('is reachable by a firm that could reach those pages before', () => {
    // The pages did not change; only where they are filed. A different bundle would lock a paying
    // firm out of invoicing on a nav reshuffle.
    expect(WORKSPACE_DEFAULT_BUNDLE.money).toBe(WORKSPACE_DEFAULT_BUNDLE.office);
  });

  it('appears in every persona rail, exactly once', () => {
    for (const [id, persona] of Object.entries(PERSONAS)) {
      const count = persona.railOrder.filter((w) => w === 'money').length;
      expect(count, `${id} rail`).toBe(1);
      // Exhaustive lists — a persona missing a workspace loses its icon entirely.
      expect(new Set(persona.railOrder).size, `${id} rail`).toBe(WORKSPACE_ORDER.length);
    }
  });

  it('no URL moved', () => {
    // Consolidation here is a re-filing, not a migration. Every money page keeps its path, so no
    // bookmark, notification link or customer email breaks.
    for (const href of ['/admin/invoicing', '/admin/billing', '/admin/finances', '/admin/pay']) {
      expect(workspaceOf(href)).toBe('money');
      expect(exists(`app${href}/page.tsx`), `${href} page file`).toBe(true);
    }

    // C6 (2026-08-25): `/admin/payroll` was a sample above and is now a REDIRECT into the Pay
    // portal. The claim this test makes — *"consolidation here is a re-filing, not a migration; no
    // bookmark, notification link or customer email breaks"* — is exactly what C6 had to preserve, so
    // it is asserted directly rather than dropped: the file is still there, and what it contains is a
    // forward rather than a 404.
    for (const href of ['/admin/payroll', '/admin/payouts', '/admin/my-pay', '/admin/rewards']) {
      expect(exists(`app${href}/page.tsx`), `${href} page file`).toBe(true);
      const src = fs.readFileSync(path.join(ROOT, `app${href}/page.tsx`), 'utf8');
      expect(src, `${href} should forward into the Pay portal`).toContain("redirect('/admin/pay?tab=");
    }
  });
});

describe('item 8 — the money words no longer collide', () => {
  it('"Billing" no longer means two opposite things', () => {
    // §2.2: "Billing" meant the subscription you pay for the software, "Invoicing" meant what your
    // customers pay you, and "Finances" meant job profitability. Nobody was going to guess that.
    //
    // C8 (2026-08-25) changed two of the three labels, and the invariant is the reason it HAD to:
    // "Job Profitability" was the whole page and is one tab of four now, so leaving it would have
    // been §2.2's defect re-made by a slice that cites §2.2 — a name describing a fraction of what the
    // row opens. "Customer Invoices" widened the same way.
    //
    // The three still cannot be mistaken for each other, which is what this guards.
    expect(findRoute('/admin/billing')?.label).toBe('Software Subscription');
    expect(findRoute('/admin/invoicing')?.label).toBe('Customer Money');
    expect(findRoute('/admin/finances')?.label).toBe('Books & Tax');
  });

  it('each of the three says out loud what it is NOT', () => {
    // The label alone fixes the first read; the description is what settles it for somebody who has
    // been using the old names for a year.
    expect(findRoute('/admin/billing')?.description).toMatch(/THIS FIRM pays/);
    expect(findRoute('/admin/invoicing')?.description).toMatch(/NOT the subscription/);
    expect(findRoute('/admin/finances')?.description).toMatch(/NOT invoicing/);
  });

  it('no two registered routes share a label', () => {
    // The whole class of defect §2.2 found: two pages with one word between them.
    const byLabel = new Map<string, string[]>();
    for (const r of ADMIN_ROUTES) {
      byLabel.set(r.label, [...(byLabel.get(r.label) ?? []), r.href]);
    }
    const collisions = [...byLabel.entries()].filter(([, hrefs]) => hrefs.length > 1);
    expect(collisions).toEqual([]);
  });
});

describe('item 7 — People is one directory and one record', () => {
  it('both pages exist and the directory is registered', () => {
    expect(exists('app/admin/people/page.tsx')).toBe(true);
    expect(exists('app/admin/people/[email]/page.tsx')).toBe(true);
    expect(exists('app/api/admin/people/route.ts')).toBe(true);
    expect(findRoute('/admin/people')).toBeDefined();
  });

  it('the ten routes it fronts still work', () => {
    // §2.3's fix is a front door, not a demolition. /admin/users still owns roles and
    // /admin/employees/manage still owns editing a record; deleting them would move the work into
    // this page and recreate §1.3 — two surfaces rendering the same data, drifting.
    for (const href of ['/admin/employees', '/admin/users', '/admin/team', '/admin/contacts']) {
      expect(findRoute(href), `${href} was removed`).toBeDefined();
    }
  });

  it('the profile is keyed by email, like every other person route in the app', () => {
    // The audit wrote `[id]`. Every existing detail route is keyed by email, and a translation step
    // between the two is where somebody eventually gets shown the wrong person's pay.
    expect(exists('app/admin/people/[email]/page.tsx')).toBe(true);
    expect(exists('app/admin/people/[id]/page.tsx')).toBe(false);
  });

  it('the directory does not decide access on its own', () => {
    // The tab list is filtered by the viewer's roles, but each destination re-checks. A nav list
    // being wrong must not be the only thing between a crew member and a payroll record.
    const src = fs.readFileSync(path.join(ROOT, 'app/admin/people/[email]/page.tsx'), 'utf8');
    expect(src).toMatch(/isAdmin\(roles\) \|\| isDeveloper\(roles\)/);
    expect(src).toMatch(/enforce the same rule themselves/);
  });
});
