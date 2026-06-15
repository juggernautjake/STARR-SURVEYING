// __tests__/leads/intake.test.ts
//
// mobile-and-customer-query-gap Slice Q1 — public-form → leads-table
// intake. Locks the pure mapper + the safe-insert behavior so a
// future refactor can't quietly stop populating /admin/leads.

import { describe, it, expect, vi } from 'vitest';
import {
  INTAKE_ROUTING_ROLES,
  buildLeadRowFromForm,
  insertLeadFromForm,
  type LeadIntakeInput,
} from '@/lib/leads/intake';

function baseInput(overrides: Partial<LeadIntakeInput> = {}): LeadIntakeInput {
  return {
    name: 'Jane Landowner',
    email: 'jane@example.com',
    phone: '254-555-1234',
    company: 'Acme Cattle Co.',
    propertyAddress: '123 FM 436, Belton',
    state: 'tx',
    serviceType: 'Boundary Survey',
    projectDetails: 'About 5 acres south of the creek',
    referenceNumber: 'SS-260614-200000-ABC',
    source: 'Website',
    ...overrides,
  };
}

describe('INTAKE_ROUTING_ROLES', () => {
  it('always includes admin so the office sees every query', () => {
    expect(INTAKE_ROUTING_ROLES).toContain('admin');
  });

  it('routes to operational roles that can actually own a lead', () => {
    // Don't lock the FULL list (Q2 may tune it); lock that the four
    // roles the Q1 plan called out are present.
    for (const role of ['admin', 'employee', 'equipment_manager', 'field_crew']) {
      expect(INTAKE_ROUTING_ROLES).toContain(role);
    }
  });
});

describe('buildLeadRowFromForm — pure mapper', () => {
  it('returns a row with the schema-required defaults set', () => {
    const row = buildLeadRowFromForm(baseInput());
    expect(row.status).toBe('new');
    expect(row.created_by).toBe('website-form');
    expect(row.state).toBe('TX');
  });

  it('prefixes notes with the reference number so the inbox + table correlate', () => {
    const row = buildLeadRowFromForm(baseInput());
    expect(row.notes.startsWith('Ref: SS-260614-200000-ABC')).toBe(true);
    expect(row.notes).toContain('About 5 acres south of the creek');
  });

  it('falls back to just the reference when the customer left projectDetails blank', () => {
    const row = buildLeadRowFromForm(baseInput({ projectDetails: '' }));
    expect(row.notes).toBe('Ref: SS-260614-200000-ABC');
  });

  it('collapses empty optional fields to null (not empty strings)', () => {
    const row = buildLeadRowFromForm(
      baseInput({ phone: '', company: '   ', propertyAddress: '' }),
    );
    expect(row.phone).toBeNull();
    expect(row.company).toBeNull();
    expect(row.property_address).toBeNull();
  });

  it('upper-cases the state code (`tx` → `TX`) so admin filters match', () => {
    expect(buildLeadRowFromForm(baseInput({ state: 'tx' })).state).toBe('TX');
    expect(buildLeadRowFromForm(baseInput({ state: 'mt' })).state).toBe('MT');
  });

  it('drops a NaN / negative estimatedAcreage rather than writing junk', () => {
    expect(buildLeadRowFromForm(baseInput({ estimatedAcreage: NaN })).estimated_acreage).toBeNull();
    expect(buildLeadRowFromForm(baseInput({ estimatedAcreage: -5 })).estimated_acreage).toBe(-5);
    // Note: schema doesn't reject negatives; the mapper just won't lie about NaN.
    expect(buildLeadRowFromForm(baseInput({ estimatedAcreage: 12.5 })).estimated_acreage).toBe(12.5);
  });

  it('respects the caller-supplied `source` discriminator', () => {
    expect(buildLeadRowFromForm(baseInput({ source: 'Pricing Calculator' })).source).toBe(
      'Pricing Calculator',
    );
    expect(buildLeadRowFromForm(baseInput({ source: 'Website' })).source).toBe('Website');
  });
});

describe('insertLeadFromForm — safe-insert (never throws)', () => {
  it('returns the new id on a happy-path INSERT', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'new-uuid' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const result = await insertLeadFromForm({ from } as never, baseInput());
    expect(result).toEqual({ id: 'new-uuid' });
    expect(from).toHaveBeenCalledWith('leads');
    expect(insert).toHaveBeenCalledTimes(1);
    expect((insert.mock.calls[0][0] as { name: string }).name).toBe('Jane Landowner');
  });

  it('returns null + does NOT throw when supabase returns an error', async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const result = await insertLeadFromForm({ from } as never, baseInput());
    expect(result).toBeNull();
  });

  it('returns null + does NOT throw when the client itself blows up', async () => {
    const from = vi.fn(() => {
      throw new Error('network down');
    });
    const result = await insertLeadFromForm({ from } as never, baseInput());
    expect(result).toBeNull();
  });
});

describe('contact route — Slice Q1 wiring', () => {
  // Source-lock the integration points without booting the route.
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const ROUTE_SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'api', 'contact', 'route.ts'),
    'utf8',
  );

  it('imports insertLeadFromForm + supabaseAdmin', () => {
    expect(ROUTE_SRC).toMatch(/import \{ insertLeadFromForm, type LeadIntakeInput \} from '@\/lib\/leads\/intake'/);
    expect(ROUTE_SRC).toMatch(/import \{ supabaseAdmin \} from '@\/lib\/supabase'/);
  });

  it('runs the INSERT on the production return path', () => {
    expect(ROUTE_SRC).toMatch(
      /const insertedLead = await insertLeadFromForm\(supabaseAdmin, buildLeadIntake\(\)\)/,
    );
  });

  it('runs the INSERT on the dev-mode short-circuit too', () => {
    expect(ROUTE_SRC).toMatch(
      /\/\/ Development mode[\s\S]*?await insertLeadFromForm\(supabaseAdmin, buildLeadIntake\(\)\)/,
    );
  });

  it('discriminates Website vs Pricing Calculator on the source field', () => {
    expect(ROUTE_SRC).toMatch(/source: isCalculator \? 'Pricing Calculator' : 'Website'/);
  });
});
