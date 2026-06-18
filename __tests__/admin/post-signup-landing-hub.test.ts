// __tests__/admin/post-signup-landing-hub.test.ts
//
// post-signup-landing-hub-2026-06-18 — newly-created accounts (and any
// user signing in without a deep link) should land on /admin/me (the
// Hub), not /admin/dashboard. The login page + middleware were defaulting
// to the legacy dashboard.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('login default callbackUrl (post-signup-landing-hub-2026-06-18)', () => {
  const SRC = read('app/admin/login/page.tsx');

  it("defaults to /admin/me when no callbackUrl query param is present", () => {
    expect(SRC).toMatch(/searchParams\.get\('callbackUrl'\) \|\| '\/admin\/me'/);
  });

  it('no longer defaults to /admin/dashboard', () => {
    expect(SRC).not.toMatch(/searchParams\.get\('callbackUrl'\) \|\| '\/admin\/dashboard'/);
  });
});

describe('middleware redirects (post-signup-landing-hub-2026-06-18)', () => {
  const SRC = read('middleware.ts');

  it("a signed-in user hitting /admin/login bounces to /admin/me", () => {
    expect(SRC).toMatch(/if \(pathname === '\/admin\/login' \|\| pathname === '\/admin\/register'\) \{\s*\n[\s\S]{1,300}?NextResponse\.redirect\(new URL\('\/admin\/me'/);
  });

  it("role-forbidden routes bounce to /admin/me instead of /admin/dashboard", () => {
    expect(SRC).toMatch(/if \(!route\.roles\.some[\s\S]{0,200}?NextResponse\.redirect\(new URL\('\/admin\/me'/);
  });

  it('no longer points either redirect at /admin/dashboard', () => {
    // The legacy dashboard is still a reachable page, but the redirects
    // should no longer auto-target it. Make sure both replacements held.
    expect(SRC).not.toMatch(/NextResponse\.redirect\(new URL\('\/admin\/dashboard',/);
  });
});
