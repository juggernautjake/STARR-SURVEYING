// __tests__/saas/api-bundle-gate.test.ts — packaging enforced on the data path (§3c.1, item 8f).
//
// The audit read this finding as "packaging is undeclared". It was not. `bundleForRoute()` already
// resolved a bundle for every admin PAGE, and the middleware already redirected on it. What had never
// happened is that the middleware matcher — `['/admin/:path*', '/dnd/:path*']` — does not match
// `/api/...`, so all 351 admin API handlers were reachable by a firm that had bought none of them.
//
// So the ratchet here guards two different things:
//
//  1. **Every admin API route resolves to a decision.** Not "has a gate" — a decision, including an
//     explicit, reasoned "open". Unclassified is the state that silently gives a paid feature away.
//  2. **The gate cannot fire for Starr.** Single-tenant behaviour must be unchanged by construction,
//     because "we shipped multi-tenant gating and it broke the only firm using it" is the one
//     outcome that makes this work negative-value.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  apiGateFor, canAccessApi, pagePathForApi, API_GROUP_GATES,
} from '@/lib/saas/api-bundle-gate';
import { BUNDLES, type BundleId } from '@/lib/saas/bundles';

/** Every `app/api/admin/**\/route.ts`, as the pathname it serves. Dynamic segments become a literal,
 *  which resolves identically because every gate decision here is prefix-based. */
function adminApiPaths(): string[] {
  const root = join(process.cwd(), 'app', 'api', 'admin');
  const out: string[] = [];
  const walk = (dir: string, url: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // Route groups `(name)` do not appear in the URL.
        const seg = entry.startsWith('(') && entry.endsWith(')')
          ? ''
          : '/' + entry.replace(/^\[\.{3}(.+)\]$/, 'splat').replace(/^\[(.+)\]$/, 'id');
        walk(full, url + seg);
      } else if (entry === 'route.ts') {
        out.push('/api/admin' + url);
      }
    }
  };
  walk(root, '');
  return out;
}

const ALL = adminApiPaths();

describe('the surface is real, and all of it is classified', () => {
  it('finds the admin API routes it claims to guard', () => {
    // If this collapses to a handful, every assertion below becomes vacuously true — the "renders an
    // empty array and passes" failure §1.3 shipped once already.
    expect(ALL.length).toBeGreaterThan(300);
  });

  it('every admin API route resolves to a bundle or a reasoned open — never unclassified', () => {
    const unclassified = ALL.filter((p) => apiGateFor(p).kind === 'unclassified');
    expect(
      unclassified,
      `These API routes have no bundle classification. Add the group to API_GROUP_GATES in ` +
      `lib/saas/api-bundle-gate.ts, or register the page they mirror:\n  ${unclassified.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every "open" decision carries a reason somebody wrote', () => {
    // An ungated route in a product that sells access is a revenue hole. One with no reason is
    // indistinguishable from one somebody forgot.
    for (const [group, gate] of Object.entries(API_GROUP_GATES)) {
      if (gate.bundle !== null) continue;
      expect(gate.reason.length, `${group} is open with no reason`).toBeGreaterThan(20);
    }
  });

  it('every named bundle actually exists in the catalogue', () => {
    for (const [group, gate] of Object.entries(API_GROUP_GATES)) {
      if (gate.bundle === null) continue;
      expect(BUNDLES[gate.bundle], `${group} requires unknown bundle "${gate.bundle}"`).toBeDefined();
    }
  });
});

describe('the gate closes on the data path, which is the whole point of 8f', () => {
  const recon: BundleId[] = ['recon'];
  const office: BundleId[] = ['office'];

  it('a firm without Recon cannot read research through the API', () => {
    // Before this slice: the page redirected and this returned data. The browser was gated and the
    // fetch was not, which is the gate that matters.
    expect(canAccessApi('/api/admin/research/abc/full-extract', office)).toBe(false);
    expect(canAccessApi('/api/admin/research/abc/full-extract', recon)).toBe(true);
  });

  it('a firm without Office cannot read jobs, payroll or receipts through the API', () => {
    for (const p of ['/api/admin/jobs', '/api/admin/payroll', '/api/admin/receipts', '/api/admin/time-logs']) {
      expect(canAccessApi(p, recon), `${p} leaked to a Recon-only firm`).toBe(false);
      expect(canAccessApi(p, office)).toBe(true);
    }
  });

  it('firm_suite reaches everything, because that is what it is sold as', () => {
    const denied = ALL.filter((p) => !canAccessApi(p, ['firm_suite']));
    expect(denied, `firm_suite was refused:\n  ${denied.join('\n  ')}`).toEqual([]);
  });

  it('the API path maps onto the page whose bundle it inherits', () => {
    // The mapping is derived rather than listed precisely so it cannot drift from the page registry
    // — §1.3's two navigation lists drifted 32 routes apart doing exactly this by hand.
    expect(pagePathForApi('/api/admin/research/abc')).toBe('/admin/research/abc');
    expect(pagePathForApi('/admin/research')).toBeNull();
  });
});

describe('the surfaces a lapsed or wrongly-gated firm needs stay open', () => {
  it('billing, support and account routes are reachable with no bundles at all', () => {
    // Otherwise the one page that could fix the lapse is behind the lapse, and the only way to report
    // being wrongly gated is behind the gate.
    for (const p of [
      '/api/admin/billing/subscription', '/api/admin/support/tickets', '/api/admin/orgs',
      '/api/admin/org-settings', '/api/admin/invites', '/api/admin/users', '/api/admin/errors',
    ]) {
      expect(canAccessApi(p, []), `${p} is unreachable for a firm with no bundles`).toBe(true);
    }
  });

  it('a person\'s own profile and hub are not product features', () => {
    expect(canAccessApi('/api/admin/profile', [])).toBe(true);
    expect(canAccessApi('/api/admin/me/widgets', [])).toBe(true);
  });

  it('search is open, because it filters each corpus by its own permissions', () => {
    // §3b: search spans ten corpora and gates each one; a single bundle gate over the whole box would
    // be both too coarse and redundant.
    expect(canAccessApi('/api/admin/search', [])).toBe(true);
  });
});

describe('single-tenant Starr is unaffected by construction', () => {
  const MW = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8');

  it('the matcher now includes the API — the one-line hole this slice closes', () => {
    expect(MW).toContain("'/api/admin/:path*'");
  });

  it('the API gate returns before doing anything when there are no org memberships', () => {
    // Every Starr session today. The gate is inert, so nothing about single-tenant behaviour depends
    // on all 351 routes being classified correctly on day one.
    const fn = MW.slice(MW.indexOf('function apiBundleGate'), MW.indexOf('export default auth'));
    expect(fn).toMatch(/memberships\.length === 0\)\s*return NextResponse\.next\(\)/);
    expect(fn).toMatch(/isOperator\)\s*return NextResponse\.next\(\)/);
  });

  it('it answers a fetch in JSON rather than redirecting it to an HTML upgrade page', () => {
    // A redirect to an upgrade prompt makes the caller parse HTML as JSON and report a parse error,
    // which tells the user nothing about the actual problem.
    const fn = MW.slice(MW.indexOf('function apiBundleGate'), MW.indexOf('export default auth'));
    expect(fn).toContain('NextResponse.json');
    expect(fn).toContain('402'); // Payment Required — and distinguishable from 401/403.
    expect(fn).not.toContain('NextResponse.redirect');
  });

  it('authentication is left to the handlers, not duplicated here', () => {
    // 351 routes already check auth and the audit calls that coverage solid. Two answers to one
    // question is how they drift.
    const fn = MW.slice(MW.indexOf('function apiBundleGate'), MW.indexOf('export default auth'));
    expect(fn).toMatch(/if \(!user \|\| user\.isOperator\) return NextResponse\.next\(\)/);
  });
});

// ── The page gate leaked too, and that was the bigger bug ────────────────────────────────────────
import { bundleForRoute, canAccessRoute } from '@/lib/saas/bundle-gate';

describe('overrides apply to the subtree, not just the literal path', () => {
  it('gates an individual research project, not only the research index', () => {
    // Found while wiring the API gate. ROUTE_BUNDLE_OVERRIDES was matched with `pathname in map`, so
    // `/admin/research` resolved to recon and `/admin/research/<projectId>` — the page showing a
    // customer's actual property research — matched nothing, fell through to the `research-cad`
    // workspace default (deliberately null, because that workspace splits across two bundles) and
    // was ungated. The index was locked and every room behind it was open.
    expect(bundleForRoute('/admin/research')).toBe('recon');
    expect(bundleForRoute('/admin/research/abc-123')).toBe('recon');
    expect(bundleForRoute('/admin/research/abc-123/documents')).toBe('recon');
    expect(canAccessRoute({ pathname: '/admin/research/abc-123', bundles: ['office'] })).toBe(false);
  });

  it('gates individual CAD drawings the same way', () => {
    expect(bundleForRoute('/admin/cad/drawing-9')).toBe('draft');
    expect(canAccessRoute({ pathname: '/admin/cad/drawing-9', bundles: ['recon'] })).toBe(false);
  });

  it('keeps operator-only research subtrees ungated by bundle, longest match winning', () => {
    // /admin/research/testing overrides to null (operator-only, gated by isOperator instead). The
    // more specific key must beat /admin/research, or operators get billed for a bundle to reach it.
    expect(bundleForRoute('/admin/research/testing')).toBeNull();
    expect(bundleForRoute('/admin/research/testing/runs')).toBeNull();
  });

  it('does not let /admin/work swallow /admin/work-mode', () => {
    // Segment-aware matching. A naive startsWith would make the always-available workspace landing
    // silently ungate a different feature whose name merely begins the same way.
    expect(bundleForRoute('/admin/work')).toBeNull();
    expect(bundleForRoute('/admin/work-mode/start')).toBe('office');
  });

  it('keeps billing reachable throughout its subtree for a lapsed firm', () => {
    expect(bundleForRoute('/admin/billing/upgrade')).toBeNull();
    expect(canAccessRoute({ pathname: '/admin/billing/upgrade', bundles: [] })).toBe(true);
  });
});
