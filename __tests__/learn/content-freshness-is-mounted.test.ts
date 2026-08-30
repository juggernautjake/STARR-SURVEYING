// The freshness panel is actually REACHED — not merely written.
//
// ── WHY THIS TEST IS SHAPED THE WAY IT IS ───────────────────────────────────────────────────────
//
// On 2026-08-27 an entire Hub Customizer was built on `AddWidgetModal`, a component nothing in the
// app mounts. It typechecked, it linted, its own tests passed, and the wiring test that was supposed
// to catch exactly this asserted that the MODAL imported its dependencies — never that anything
// imported the modal. Only driving a browser found it.
//
// So this asserts the CALLER, in both directions of the chain:
//
//     ReferencesTab  →  ContentFreshnessPanel  →  /api/admin/learn/content-freshness
//
// A test that only checked the panel's own imports would pass identically if the panel were
// unreachable, which is the failure mode being defended against. See
// [[feedback_wiring_tests_must_check_the_caller]].
//
// `npm run verify:orphans` covers the module-level version of this and caught this very panel's
// library before it was wired. This is the narrower claim the ratchet cannot make: not "something
// imports it" but "the tab a person opens imports it".

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('content-freshness watch is reachable from a page a person opens', () => {
  it('ReferencesTab imports AND renders the panel', () => {
    const tab = read('app/admin/learn/_tabs/ReferencesTab.tsx');
    // Both halves matter: an unused import satisfies a grep for the name while rendering nothing.
    expect(tab).toMatch(/import\s+ContentFreshnessPanel\s+from\s+'\.\/ContentFreshnessPanel'/);
    expect(tab).toMatch(/<ContentFreshnessPanel\s*\/>/);
  });

  it('the panel calls the route that exists', () => {
    const panel = read('app/admin/learn/_tabs/ContentFreshnessPanel.tsx');
    expect(panel).toContain('/api/admin/learn/content-freshness');
    // And the route file is really there — a fetch to a 404 is silent in the panel's catch.
    expect(fs.existsSync(path.join(ROOT, 'app/api/admin/learn/content-freshness/route.ts'))).toBe(true);
  });

  it('the route is admin-gated, like its two siblings', () => {
    const route = read('app/api/admin/learn/content-freshness/route.ts');
    expect(route).toContain('isAdmin');
    expect(route).toMatch(/status:\s*401/);
    expect(route).toMatch(/status:\s*403/);
  });

  it('the route has NO write path — the plan states this as a risk before it states the feature', () => {
    // Exam content must never be auto-edited from a search result. The cheapest place to make that
    // impossible is here, by the endpoint simply not having a way to write.
    const route = read('app/api/admin/learn/content-freshness/route.ts');
    expect(route).not.toMatch(/export const (POST|PUT|PATCH|DELETE)\b/);
  });

  it('the panel branches on status, not on hit count', () => {
    // "We checked and nothing moved" and "we never checked" produce the same empty list. A blank
    // that reads as an all-clear is the specific harm on a study surface.
    const panel = read('app/admin/learn/_tabs/ContentFreshnessPanel.tsx');
    expect(panel).toContain("'not-configured'");
    expect(panel).toContain("'search-failed'");
  });
});
