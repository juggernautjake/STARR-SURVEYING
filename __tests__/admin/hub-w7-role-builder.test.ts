// __tests__/admin/hub-w7-role-builder.test.ts
//
// Slice W7 — role builder migration + pure helpers + API + UI
// + route registry + middleware gate.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeLabel,
  slugifyRoleKey,
  validateRoleKey,
} from '@/lib/admin/role-builder';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('slugifyRoleKey (pure)', () => {
  it('lowercases + collapses non-alpha-numeric runs to underscores', () => {
    expect(slugifyRoleKey('Dispatcher Lead')).toBe('dispatcher_lead');
    expect(slugifyRoleKey('CAD - Drawer')).toBe('cad_drawer');
  });
  it('strips leading non-letters so the CHECK regex is satisfied', () => {
    expect(slugifyRoleKey('123 Dispatcher')).toBe('dispatcher');
  });
  it('returns null for empty / unsluggable input', () => {
    expect(slugifyRoleKey('')).toBeNull();
    expect(slugifyRoleKey('!!!')).toBeNull();
  });
  it('caps the slug at 41 chars (matches the CHECK constraint upper bound)', () => {
    expect(slugifyRoleKey('a'.repeat(80))!.length).toBe(41);
  });
});

describe('validateRoleKey (pure)', () => {
  it('accepts a clean lower-snake key', () => {
    expect(validateRoleKey('dispatcher_lead')).toEqual({ ok: true, key: 'dispatcher_lead' });
  });
  it("rejects an empty / non-string key", () => {
    expect(validateRoleKey('').ok).toBe(false);
    expect(validateRoleKey(123 as unknown as string).ok).toBe(false);
  });
  it('rejects a key that starts with a digit or contains uppercase', () => {
    expect(validateRoleKey('1_lead').ok).toBe(false);
    expect(validateRoleKey('Dispatcher').ok).toBe(false);
    expect(validateRoleKey('lead!').ok).toBe(false);
  });
});

describe('normalizeLabel (pure)', () => {
  it('trims + caps at 80 chars; blank → null', () => {
    expect(normalizeLabel('  Lead  ')).toBe('Lead');
    expect(normalizeLabel('')).toBeNull();
    expect(normalizeLabel(undefined)).toBeNull();
    expect(normalizeLabel('x'.repeat(120))).toHaveLength(80);
  });
});

describe('Migration 313_custom_roles.sql', () => {
  const SQL = read('seeds/313_custom_roles.sql');

  it('creates the custom_roles table with the contract columns', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.custom_roles/);
    expect(SQL).toMatch(/key\s+TEXT NOT NULL UNIQUE/);
    expect(SQL).toMatch(/label\s+TEXT NOT NULL/);
    expect(SQL).toMatch(/permissions\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  });

  it("locks the key shape via a CHECK regex (lower-snake, 2-41 chars)", () => {
    expect(SQL).toMatch(/CHECK \(key ~ '\^\[a-z\]\[a-z0-9_\]\{1,40\}\$'\)/);
  });
});

describe('API /api/admin/roles/custom (W7)', () => {
  const SRC = read('app/api/admin/roles/custom/route.ts');

  it('GET + POST both require admin', () => {
    const gateCount = (SRC.match(/!isAdmin\(session\.user\.roles\)/g) ?? []).length;
    expect(gateCount).toBeGreaterThanOrEqual(2);
  });

  it("POST slugifies the label when the caller omits the key", () => {
    expect(SRC).toMatch(/slugifyRoleKey\(label\)/);
  });

  it("POST runs validateRoleKey so the request can't bypass the CHECK regex", () => {
    expect(SRC).toMatch(/validateRoleKey\(candidate\)/);
  });

  it('POST returns 409 on a unique-violation Postgres error', () => {
    expect(SRC).toMatch(/error\.code === '23505'/);
  });
});

describe('Role builder page + client (W7)', () => {
  const TAB_RAW = read('app/admin/people/_tabs/RolesTab.tsx');
  // The tab's own header explains the C9 change in prose, and that prose contains every identifier
  // this block looks for. Strip comments so no assertion can pass by matching a sentence I wrote.
  const TAB = TAB_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const CLIENT = read('app/admin/people/_tabs/CustomRoleBuilderClient.tsx');

  // C9 (2026-08-25): this was an async SERVER page that ran `auth()` and redirected non-admins.
  // Imported into the client-side People portal it pulled `node:async_hooks` into the browser
  // bundle, so the read moved to `GET /api/admin/roles/custom`. What the redirect guarded is
  // asserted at the two places that refuse now: the endpoint (tested above) and the tab's role list.
  it('the tab is a client component and does not import server auth', () => {
    expect(TAB).toMatch(/^'use client';$/m);
    expect(TAB).not.toMatch(/@\/lib\/auth/);
    expect(TAB).not.toMatch(/supabaseAdmin/);
  });

  it('the tab reads its rows from the admin-gated endpoint', () => {
    expect(TAB).toMatch(/fetch\('\/api\/admin\/roles\/custom'\)/);
  });

  it('a refused caller reads a refusal rather than an empty builder', () => {
    // 401/403 are the endpoint's answers; the tab has to tell them apart from "no roles yet".
    expect(TAB).toMatch(/r\.status === 401 \|\| r\.status === 403/);
    expect(TAB).toMatch(/data-testid="admin-role-builder-denied"/);
  });

  it('the tab mounts the client with the rows it fetched', () => {
    expect(TAB).toMatch(/<CustomRoleBuilderClient initialRoles=\{roles\}/);
  });

  it('only an admin is offered the tab', () => {
    const PORTAL = read('app/admin/people/page.tsx');
    expect(PORTAL).toMatch(/id: 'roles'[\s\S]{0,240}roles: \['admin'\]/);
  });

  it('the client renders the form testids the spec calls for', () => {
    expect(CLIENT).toMatch(/data-testid="admin-role-builder-form"/);
    expect(CLIENT).toMatch(/data-testid="admin-role-builder-label"/);
    expect(CLIENT).toMatch(/data-testid="admin-role-builder-key"/);
    expect(CLIENT).toMatch(/data-testid="admin-role-builder-permissions"/);
    expect(CLIENT).toMatch(/data-testid="admin-role-builder-submit"/);
  });

  it('client POSTs to /api/admin/roles/custom + prepends the new row on success', () => {
    expect(CLIENT).toMatch(/'\/api\/admin\/roles\/custom'/);
    expect(CLIENT).toMatch(/setRoles\(\(cur\) => \[data\.role, \.\.\.cur\]\)/);
  });
});

describe('Nav + middleware gating (W7)', () => {
  it("route registry surfaces /admin/roles/custom in the office workspace", () => {
    // C9 (2026-08-25): `/admin/roles/custom` is the People portal's `roles` TAB now, so the registry
    // row it used to have is gone. What this guards — the builder is offered in the nav, and only to
    // admins — is asserted where both facts now live: the portal has a row, and the tab carries
    // `roles: ['admin']` in the spec.
    //
    // The middleware gate in the test below is UNCHANGED, and that is the one that actually refuses.
    const SRC = read('lib/admin/route-registry.ts');
    expect(SRC).toMatch(/href: '\/admin\/people'/);
    const PORTAL = read('app/admin/people/page.tsx');
    expect(PORTAL).toMatch(/id: 'roles'[\s\S]{0,240}roles: \['admin'\]/);
  });

  it("middleware gates /admin/roles to admin only", () => {
    const SRC = read('middleware.ts');
    expect(SRC).toMatch(/\{\s*prefix:\s*'\/admin\/roles',\s*roles:\s*\['admin'\]\s*\}/);
  });
});
