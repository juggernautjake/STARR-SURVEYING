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
  const PAGE = read('app/admin/roles/custom/page.tsx');
  const CLIENT = read('app/admin/roles/custom/CustomRoleBuilderClient.tsx');

  it("the server page redirects non-admins to /admin/me", () => {
    expect(PAGE).toMatch(/if \(!isAdmin\(session\.user\.roles\)\) redirect\('\/admin\/me'\)/);
  });

  it("the page mounts the client with the initial role list", () => {
    expect(PAGE).toMatch(/<CustomRoleBuilderClient initialRoles=\{roles\}/);
  });

  it("the client renders the form testids the spec calls for", () => {
    expect(CLIENT).toMatch(/data-testid="admin-role-builder-form"/);
    expect(CLIENT).toMatch(/data-testid="admin-role-builder-label"/);
    expect(CLIENT).toMatch(/data-testid="admin-role-builder-key"/);
    expect(CLIENT).toMatch(/data-testid="admin-role-builder-permissions"/);
    expect(CLIENT).toMatch(/data-testid="admin-role-builder-submit"/);
  });

  it("client POSTs to /api/admin/roles/custom + prepends the new row on success", () => {
    expect(CLIENT).toMatch(/'\/api\/admin\/roles\/custom'/);
    expect(CLIENT).toMatch(/setRoles\(\(cur\) => \[data\.role, \.\.\.cur\]\)/);
  });
});

describe('Nav + middleware gating (W7)', () => {
  it("route registry surfaces /admin/roles/custom in the office workspace", () => {
    const SRC = read('lib/admin/route-registry.ts');
    expect(SRC).toMatch(/href: '\/admin\/roles\/custom'[\s\S]*?label: 'Role Builder'[\s\S]*?roles: \['admin'\]/);
  });

  it("middleware gates /admin/roles to admin only", () => {
    const SRC = read('middleware.ts');
    expect(SRC).toMatch(/\{\s*prefix:\s*'\/admin\/roles',\s*roles:\s*\['admin'\]\s*\}/);
  });
});
