// __tests__/dnd/dev-routes.test.ts — developer-only pages don't ship live (P1-4, audit D-5).
//
// Most of this file exists to record what D-5 got WRONG, because three of its four routes dissolved on
// contact with the source and the corrections are worth pinning so nobody "re-fixes" them:
//
//   · `/dnd/preview/edit-flow` was already gated, more strictly than the slice proposed.
//   · `/dnd/login` is a four-line redirect, not a page.
//   · `/dnd/Lazzuh_Gun` is the owner's personal sheet — deliberately public, explicitly exempted in
//     middleware. Gating it would BREAK it, so a test asserts it stays ungated.
//   · The "indexable" half was wrong for all four: the /dnd layout noindexes the whole subtree.
//
// The one real defect was `/dnd/hextech-demo`, whose own header claimed auth-gating that stopped existing
// when /dnd went public-by-link on 2026-07-06.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devRouteVisible } from '@/lib/dnd/dev-routes';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// `vi.stubEnv` rather than assigning `process.env` directly: NODE_ENV is a non-writable data descriptor
// under vitest, so a hand-rolled `defineProperty` throws. `unstubAllEnvs` restores everything after each
// test, which also stops these from leaking into the rest of the suite.
const setEnv = (node: string, harness?: string) => {
  vi.stubEnv('NODE_ENV', node);
  vi.stubEnv('NEXT_PUBLIC_E2E_HARNESS', harness ?? '');
};

afterEach(() => vi.unstubAllEnvs());

describe('the gate rule', () => {
  it('hides dev routes in production', () => {
    setEnv('production');
    expect(devRouteVisible()).toBe(false);
  });

  it('shows them in development and test', () => {
    setEnv('development');
    expect(devRouteVisible()).toBe(true);
    setEnv('test');
    expect(devRouteVisible()).toBe(true);
  });

  it('and the harness flag re-opens them in production, so a deployed preview stays screenshottable', () => {
    setEnv('production', '1');
    expect(devRouteVisible()).toBe(true);
  });

  it('but only for exactly "1" — a stray truthy value does not open production', () => {
    setEnv('production', 'true');
    expect(devRouteVisible()).toBe(false);
    setEnv('production', '0');
    expect(devRouteVisible()).toBe(false);
  });
});

describe('both dev harnesses use it', () => {
  it('the style guide is gated — the one real D-5 finding', () => {
    const page = read('app/dnd/hextech-demo/page.tsx');
    expect(page).toContain("from '@/lib/dnd/dev-routes'");
    expect(page).toContain('if (!devRouteVisible()) notFound();');
  });

  it('and its stale "auth-gated" claim is gone', () => {
    // The comment is why nobody re-checked for two years' worth of commits. /dnd has been public by direct
    // link since 2026-07-06.
    const page = read('app/dnd/hextech-demo/page.tsx');
    expect(page).not.toMatch(/Auth-gated with the rest of \/dnd \(it's an internal style guide\)\./);
  });

  it('the edit-flow preview shares the same rule rather than its own copy', () => {
    const page = read('app/dnd/preview/edit-flow/page.tsx');
    expect(page).toContain('if (!devRouteVisible()) notFound();');
    expect(page, 'the inline NODE_ENV check should be gone').not.toMatch(/process\.env\.NODE_ENV === 'production'/);
  });
});

describe('the routes D-5 named that must NOT be gated', () => {
  it("Lazzuh_Gun stays open — it is the owner's personal sheet, not a dev route", () => {
    // Deliberately public and localStorage-backed, and explicitly exempted in middleware. Gating it would
    // break a page someone actually uses.
    const page = read('app/dnd/Lazzuh_Gun/page.tsx');
    expect(page).not.toContain('devRouteVisible');
    expect(read('middleware.ts')).toContain("pathname === '/dnd/Lazzuh_Gun'");
  });

  it('and /dnd/login stays a redirect, so old bookmarks resolve', () => {
    const page = read('app/dnd/login/page.tsx');
    expect(page).toContain("redirect('/dnd')");
    expect(page).not.toContain('devRouteVisible');
  });
});

describe('the "indexable" half of D-5 was wrong', () => {
  it('the /dnd layout noindexes the entire subtree', () => {
    expect(read('app/dnd/layout.tsx')).toContain('robots: { index: false, follow: false }');
  });

  it('and the two pages that could matter re-declare it themselves', () => {
    for (const p of ['app/dnd/hextech-demo/page.tsx', 'app/dnd/Lazzuh_Gun/page.tsx']) {
      expect(read(p), `${p} should carry its own robots directive`).toContain('robots: { index: false, follow: false }');
    }
  });
});
