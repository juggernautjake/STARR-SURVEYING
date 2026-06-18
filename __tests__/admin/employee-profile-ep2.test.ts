// __tests__/admin/employee-profile-ep2.test.ts
//
// Slice EP2a (employee-profile-buildout-2026-06-17) — contact-method
// schema + API + pure validation helpers. UI section in ProfilePanel
// follows in EP2b.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONTACT_KINDS,
  normalizeLabel,
  validateContact,
} from '../../lib/employee-profile/contact-methods';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('CONTACT_KINDS enum', () => {
  it('locks the three kinds the user asked for', () => {
    expect(CONTACT_KINDS).toEqual(['phone', 'email', 'address']);
  });
});

describe('validateContact (pure helper)', () => {
  it('rejects an empty value regardless of kind', () => {
    for (const k of CONTACT_KINDS) {
      const r = validateContact(k, '   ');
      expect(r.ok).toBe(false);
    }
  });

  it('accepts a well-formed phone + collapses whitespace', () => {
    const r = validateContact('phone', '  +1 (555)  123-4567 ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe('+1 (555) 123-4567');
  });

  it('rejects a phone with no digits', () => {
    const r = validateContact('phone', 'abcdef');
    expect(r.ok).toBe(false);
  });

  it('lowercases + validates an email', () => {
    const r = validateContact('email', '  Alice@Starr.COM ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe('alice@starr.com');
  });

  it('rejects an email without an @ or dot', () => {
    const r = validateContact('email', 'alice');
    expect(r.ok).toBe(false);
  });

  it('accepts a free-form address and trims it', () => {
    const r = validateContact('address', '  101 Maple St\n  ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe('101 Maple St');
  });

  it('rejects an address over 1000 chars', () => {
    const r = validateContact('address', 'x'.repeat(1001));
    expect(r.ok).toBe(false);
  });
});

describe('normalizeLabel (pure helper)', () => {
  it('trims + caps the label at 80 chars; blank → null', () => {
    expect(normalizeLabel(undefined)).toBeNull();
    expect(normalizeLabel('')).toBeNull();
    expect(normalizeLabel('  Mobile  ')).toBe('Mobile');
    expect(normalizeLabel('x'.repeat(120))).toHaveLength(80);
  });
});

describe('Migration 311_employee_contact_methods.sql', () => {
  const SQL = read('seeds/311_employee_contact_methods.sql');

  it('creates the employee_contact_methods table with the CHECK on kind', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.employee_contact_methods/);
    expect(SQL).toMatch(/kind\s+TEXT NOT NULL CHECK \(kind IN \('phone', 'email', 'address'\)\)/);
  });

  it('indexes by user_email AND by (user_email, kind)', () => {
    expect(SQL).toMatch(/idx_employee_contact_methods_user[\s\S]*?\(user_email\)/);
    expect(SQL).toMatch(/idx_employee_contact_methods_user_kind[\s\S]*?\(user_email, kind\)/);
  });
});

describe('API /api/admin/profile/contact-methods', () => {
  const SRC = read('app/api/admin/profile/contact-methods/route.ts');

  it('SELECT_COLS includes the contract columns', () => {
    expect(SRC).toMatch(/SELECT_COLS\s*=\s*'id, user_email, kind, value, label, is_primary, created_at, updated_at'/);
  });

  it('GET scopes non-admins to their own email', () => {
    expect(SRC).toMatch(/!isAdmin\(session\.user\.roles\) && email !== session\.user\.email/);
  });

  it('POST validates kind + value via the shared helper', () => {
    expect(SRC).toMatch(/CONTACT_KINDS\.includes\(body\.kind as ContactKind\)/);
    expect(SRC).toMatch(/validateContact\(body\.kind as ContactKind/);
  });

  it('POST demotes any prior is_primary row on the same (user, kind)', () => {
    expect(SRC).toMatch(/\.update\(\{ is_primary: false \}\)[\s\S]*?\.eq\('user_email', userEmail\)[\s\S]*?\.eq\('kind', body\.kind\)/);
  });

  it('PATCH verifies ownership before updating', () => {
    expect(SRC).toMatch(/existing\.user_email !== session\.user\.email && !isAdmin\(session\.user\.roles\)/);
  });

  it('DELETE verifies ownership before deleting', () => {
    expect(SRC).toMatch(/existing\.user_email !== session\.user\.email && !isAdmin\(session\.user\.roles\)/);
  });
});
