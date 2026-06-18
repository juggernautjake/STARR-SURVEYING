// __tests__/admin/payment-customer-snapshot.test.ts
//
// P3 of payment-infrastructure-2026-06-18.md — locks the pure
// snapshot builder that the office's "Create invoice" flow uses to
// fill `invoices.{customer_email,customer_name,customer_phone,
// billing_address}` at issue time.
//
// Priority order (per the plan): explicit overrides > primary
// contact > originating lead > legacy job columns. Empty strings
// fall through to the next layer — a typo'd "" must not mask a
// populated downstream value.

import { describe, it, expect } from 'vitest';
import {
  buildInvoiceCustomerSnapshot,
  cleanField,
  emptyInvoiceCustomerSnapshot,
  mergeBillingAddress,
  pickFirst,
  snapshotIsReceiptReady,
} from '@/lib/payments/customer-snapshot';

describe('cleanField (pure)', () => {
  it("returns null for non-strings, empty, whitespace", () => {
    expect(cleanField(null)).toBeNull();
    expect(cleanField(undefined)).toBeNull();
    expect(cleanField('')).toBeNull();
    expect(cleanField('   ')).toBeNull();
    expect(cleanField(42 as unknown as string)).toBeNull();
  });

  it("trims and returns populated strings", () => {
    expect(cleanField('  mary@example.com  ')).toBe('mary@example.com');
    expect(cleanField('Mary Smith')).toBe('Mary Smith');
  });
});

describe('pickFirst (pure)', () => {
  it("returns the first populated value", () => {
    expect(pickFirst(null, undefined, 'Mary', 'Sue')).toBe('Mary');
  });

  it("treats whitespace-only as absent", () => {
    expect(pickFirst('   ', '', 'Mary')).toBe('Mary');
  });

  it("returns null when every source is empty", () => {
    expect(pickFirst(null, undefined, '', '   ')).toBeNull();
  });
});

describe('mergeBillingAddress (pure)', () => {
  it("merges field-by-field, falling through across sources", () => {
    expect(
      mergeBillingAddress(
        { street: '123 Main' },
        { city: 'Plano' },
        { state: 'TX', property_address: '456 Old' },
      ),
    ).toEqual({ street: '123 Main', city: 'Plano', state: 'TX', zip: null });
  });

  it("returns an all-null address when no source has anything", () => {
    expect(mergeBillingAddress(null, null, null)).toEqual({
      street: null, city: null, state: null, zip: null,
    });
  });

  it("zip only comes from overrides or contact (lead has no zip)", () => {
    expect(mergeBillingAddress(null, { zip: '75093' }, null).zip).toBe('75093');
    expect(mergeBillingAddress({ zip: '75094' }, { zip: '75093' }, null).zip).toBe('75094');
  });
});

describe('buildInvoiceCustomerSnapshot (pure)', () => {
  it("honors overrides over every other source", () => {
    expect(
      buildInvoiceCustomerSnapshot({
        overrides: {
          customer_email: 'override@example.com',
          customer_name: 'Override Name',
          customer_phone: '555-9999',
          billing_address: { street: '9 New', city: 'Frisco', state: 'TX', zip: '75035' },
        },
        contact: { email: 'contact@example.com', name: 'Contact Name', phone: '555-1111' },
        lead: { email: 'lead@example.com', name: 'Lead Name' },
        job: { client_email: 'job@example.com' },
      }),
    ).toEqual({
      customer_email: 'override@example.com',
      customer_name: 'Override Name',
      customer_phone: '555-9999',
      billing_address: { street: '9 New', city: 'Frisco', state: 'TX', zip: '75035' },
    });
  });

  it("falls back to contact when no override", () => {
    expect(
      buildInvoiceCustomerSnapshot({
        contact: {
          email: 'contact@example.com', name: 'Contact Name', phone: '555-1111',
          address: '7 Contact', city: 'Allen', state: 'TX', zip: '75002',
        },
        lead: { email: 'lead@example.com', name: 'Lead Name', property_address: '5 Lead', city: 'Plano' },
      }),
    ).toEqual({
      customer_email: 'contact@example.com',
      customer_name: 'Contact Name',
      customer_phone: '555-1111',
      billing_address: { street: '7 Contact', city: 'Allen', state: 'TX', zip: '75002' },
    });
  });

  it("falls back to lead when no override + no contact", () => {
    expect(
      buildInvoiceCustomerSnapshot({
        lead: {
          email: 'lead@example.com', name: 'Lead Name', phone: '555-2222',
          property_address: '3 Lead', city: 'Plano', state: 'TX',
        },
        job: { client_email: 'job@example.com' },
      }),
    ).toEqual({
      customer_email: 'lead@example.com',
      customer_name: 'Lead Name',
      customer_phone: '555-2222',
      billing_address: { street: '3 Lead', city: 'Plano', state: 'TX', zip: null },
    });
  });

  it("falls back to legacy job columns when nothing else is set", () => {
    expect(
      buildInvoiceCustomerSnapshot({
        job: {
          client_email: 'job@example.com',
          client_name: 'Legacy Client',
          client_phone: '555-3333',
        },
      }),
    ).toEqual({
      customer_email: 'job@example.com',
      customer_name: 'Legacy Client',
      customer_phone: '555-3333',
      billing_address: { street: null, city: null, state: null, zip: null },
    });
  });

  it("fall-through is per-field — a sparse contact still pulls phone from the lead", () => {
    expect(
      buildInvoiceCustomerSnapshot({
        contact: { email: 'contact@example.com', name: 'Contact Name' },
        lead: { phone: '555-LEAD', property_address: '5 Lead' },
      }),
    ).toEqual({
      customer_email: 'contact@example.com',
      customer_name: 'Contact Name',
      customer_phone: '555-LEAD',
      billing_address: { street: '5 Lead', city: null, state: null, zip: null },
    });
  });

  it("empty-string overrides DON'T mask a populated downstream value", () => {
    expect(
      buildInvoiceCustomerSnapshot({
        overrides: { customer_email: '   ', customer_name: '' },
        contact: { email: 'contact@example.com', name: 'Contact Name' },
      }).customer_email,
    ).toBe('contact@example.com');
  });

  it("returns the empty snapshot shape when every source is missing", () => {
    expect(buildInvoiceCustomerSnapshot({})).toEqual({
      customer_email: null,
      customer_name: null,
      customer_phone: null,
      billing_address: { street: null, city: null, state: null, zip: null },
    });
  });
});

describe('snapshotIsReceiptReady + emptyInvoiceCustomerSnapshot (pure)', () => {
  it("reports ready when an email is present", () => {
    expect(snapshotIsReceiptReady({
      customer_email: 'mary@example.com',
      customer_name: null, customer_phone: null,
      billing_address: { street: null, city: null, state: null, zip: null },
    })).toBe(true);
  });

  it("reports NOT ready when only name + address are set (no email = no receipt)", () => {
    expect(snapshotIsReceiptReady({
      customer_email: null,
      customer_name: 'Mary Smith',
      customer_phone: '555-1111',
      billing_address: { street: '1 Main', city: 'Plano', state: 'TX', zip: '75093' },
    })).toBe(false);
  });

  it("emptyInvoiceCustomerSnapshot returns the JSONB-friendly null skeleton", () => {
    expect(emptyInvoiceCustomerSnapshot()).toEqual({
      customer_email: null,
      customer_name: null,
      customer_phone: null,
      billing_address: { street: null, city: null, state: null, zip: null },
    });
  });
});

describe('P3 plan annotation locks the slice', () => {
  // Smoke test — the plan still names the snapshot-on-issue rationale.
  // Read inline so this file stays self-contained.
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const PLAN = fs.readFileSync(
    path.join(__dirname, '..', '..', 'docs/planning/completed/payment-infrastructure-2026-06-18.md'),
    'utf8',
  );

  it("plan still mentions the snapshot-at-invoice-time rationale", () => {
    expect(PLAN).toMatch(/snapshot the customer's email \+ phone \+ address at that moment/);
  });
});
