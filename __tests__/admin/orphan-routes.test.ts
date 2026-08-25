// __tests__/admin/orphan-routes.test.ts — a page nobody can reach is a page nobody built (§1.4).
//
// PLATFORM_AUDIT_AND_LAUNCH_QUESTIONS_2026-07-29 §1.4 found **36 built pages unreachable from
// navigation** — not on the rail, not in ⌘K, no breadcrumb, no help — and named the class correctly:
// *"this is the repo's most common defect class: authored but not wired."*
//
// Three of them (`finances/overview`, `finances/reconcile`, `payouts/tax-report`) had been built
// SPECIFICALLY to close go-live gaps G2/G3/G5. That is the sharpest version of the problem: work that
// shipped, works, and cannot be found — so it reads as missing, and gets built again.
//
// This is the ratchet that stops it coming back. Adding a page under `app/admin/` without a registry
// entry now fails here, naming the file.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';

const SCRIPT = join(process.cwd(), 'scripts', 'audit-orphan-routes.mjs');

function sweep(): { output: string; code: number } {
  try {
    return { output: execFileSync('node', [SCRIPT], { encoding: 'utf8' }), code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { output: err.stdout ?? '', code: err.status ?? 1 };
  }
}

describe('§1.4 — every built page is reachable', () => {
  const { output, code } = sweep();

  it('has no orphans', () => {
    expect(output, output).toMatch(/ORPHANS: +0/);
    expect(code, 'the sweep exits non-zero when a page is unreachable').toBe(0);
  });

  it('has no dangling registry entries either', () => {
    // The other direction, and the worse one: a hidden page is work nobody can find, but a menu item
    // with no page behind it is a link that 404s.
    expect(output).not.toMatch(/DANGLING/);
  });

  it('the three go-live dashboards are on the RAIL, not merely registered', () => {
    // Registering them with `showInRail: false` would satisfy the letter of the finding and none of
    // it: being unfindable was the entire problem, and the palette only helps somebody who already
    // knows the page exists.
    //
    // ── C8 (2026-08-25) ─────────────────────────────────────────────────────────────────
    //
    // All three are tabs of the Books & Tax portal now. The finding this guards is the sharpest
    // version of *authored but not wired* — three dashboards BUILT to close go-live gaps that
    // nothing linked to — and a tab of a railed portal is more findable than a rail row of its own,
    // not less: you reach it by opening the thing it belongs to.
    //
    // What is asserted is therefore the same property one level up, plus the words somebody would
    // type. A portal that was itself palette-only would fail this exactly as a hidden page did.
    const portal = ADMIN_ROUTES.find((r) => r.href === '/admin/finances');
    expect(portal, 'the Books & Tax portal must be registered').toBeDefined();
    expect(portal!.showInRail, 'the portal must appear on the rail').not.toBe(false);
    for (const word of ['overview', 'reconcile', 'payroll tax']) {
      expect(portal!.keywords, `somebody typing "${word}" must find it`).toContain(word);
    }
    // And each still resolves — a redirect, not a 404.
    for (const href of ['/admin/finances/overview', '/admin/finances/reconcile', '/admin/payouts/tax-report']) {
      expect(require('node:fs').existsSync(`app${href}/page.tsx`), `${href} lost its route`).toBe(true);
    }
  });
});

describe('the registry stayed usable while growing by a third', () => {
  it('every route has a description, so ⌘K and the help drawer have something to show', () => {
    const bare = ADMIN_ROUTES.filter((r) => !r.description?.trim()).map((r) => r.href);
    expect(bare, 'routes with no description').toEqual([]);
  });

  it('every icon name is a real lucide export', () => {
    // `iconName` is a plain string so the registry stays pure data, which means nothing type-checks it.
    // Today an unknown name degrades to a placeholder glyph; when the resolver lands it would render
    // nothing at all, and a blank icon in a rail is indistinguishable from a broken build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lucide = require('lucide-react') as Record<string, unknown>;
    const missing = [...new Set(ADMIN_ROUTES.map((r) => r.iconName))].filter((n) => !(n in lucide));
    expect(missing, 'iconName values not exported by lucide-react').toEqual([]);
  });

  it('keeps the rail scannable — most of the new routes are palette-only', () => {
    // Registering all 35 on the rail would have traded one problem for a worse one: a rail with 126
    // items is a rail nobody scans, and the go-live dashboards would be as lost inside it as they were
    // outside it. The split is the design, so it is asserted rather than left to drift.
    //
    // C0g (2026-08-15) — the RATIO guard was replaced by an ABSOLUTE one, and the reason matters
    // more than the number. Retiring Work Mode deleted 9 routes, 8 of them `showInRail: false`. The
    // railed count did not move at all, so the rail is exactly as scannable as it was — but the
    // ratio rose past 0.75 purely because its denominator shrank, and it failed.
    //
    // A proxy that fails when the thing it proxies for is unchanged is measuring the wrong
    // quantity. Scannability depends on how many items are IN the rail, which is what this comment
    // argued in the first place ("a rail with 126 items"), so that is now what is asserted. The
    // ratio survives only as the weaker "not everything is railed" check.
    const railed = ADMIN_ROUTES.filter((r) => r.showInRail !== false).length;
    expect(railed).toBeLessThan(ADMIN_ROUTES.length);
    expect(railed, 'a rail this long is a rail nobody scans').toBeLessThanOrEqual(110);
  });
});
