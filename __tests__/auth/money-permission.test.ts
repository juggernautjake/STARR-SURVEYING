// __tests__/auth/money-permission.test.ts
//
// Owner, 2026-08-12: *"Only people with money handling permissions will be able to see the accounts
// of the employees."*
//
// Before this there was no such permission. Everything financial gated on `admin` — the role that
// can do everything — plus one `PAYOUT_ADMIN_EMAILS` env allowlist whose own header calls itself a
// placeholder for exactly this.
//
// The property worth pinning is the one that makes the role safe to ship: it takes NOTHING away
// from anybody. A permission model whose first act is to lock the owner out of payroll is one that
// gets reverted before it is understood.
import { describe, it, expect } from 'vitest';
import { ALL_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_PRIORITY, canHandleMoney, getPrimaryRole, type UserRole } from '@/lib/auth-roles';

describe('who may handle money', () => {
  it('lets an admin, exactly as before', () => {
    // The whole existing firm keeps working on the day this ships.
    expect(canHandleMoney(['admin'])).toBe(true);
  });

  it('lets a finance user who is not an admin — the case that did not exist', () => {
    // A bookkeeper can now see wages without also being able to manage users, roles or settings.
    expect(canHandleMoney(['finance'])).toBe(true);
    expect(canHandleMoney(['employee', 'finance'])).toBe(true);
  });

  it('refuses a developer', () => {
    // `developer` exists so somebody can test the application. A testing role that can read every
    // employee's earnings is the one role that should not.
    expect(canHandleMoney(['developer'])).toBe(false);
  });

  it('refuses tech_support, an ordinary employee, and field crew', () => {
    for (const r of [['tech_support'], ['employee'], ['field_crew'], ['equipment_manager']] as UserRole[][]) {
      expect(canHandleMoney(r), `${r[0]} must not see wages`).toBe(false);
    }
  });

  it('refuses nobody at all', () => {
    expect(canHandleMoney(null)).toBe(false);
    expect(canHandleMoney(undefined)).toBe(false);
    expect(canHandleMoney([])).toBe(false);
  });
});

describe('the role is fully declared', () => {
  it('is in the vocabulary', () => {
    expect(ALL_ROLES).toContain('finance');
  });

  it('has a label, a description, and a place in the priority order', () => {
    // A role missing from any of these renders as a raw key somewhere, or drops out of the primary
    // -role calculation and shows somebody as "Employee".
    expect(ROLE_LABELS.finance).toBeTruthy();
    expect(ROLE_DESCRIPTIONS.finance).toBeTruthy();
    expect(ROLE_PRIORITY).toContain('finance');
  });

  it('says what it is FOR, not just what it is called', () => {
    expect(ROLE_DESCRIPTIONS.finance).toMatch(/earn|wage|money|withdraw/i);
  });

  it('is outranked by admin but outranks the field roles for display', () => {
    expect(getPrimaryRole(['finance', 'admin'])).toBe('admin');
    expect(getPrimaryRole(['employee', 'finance'])).toBe('finance');
  });
});
