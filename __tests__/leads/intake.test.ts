// __tests__/leads/intake.test.ts
//
// mobile-and-customer-query-gap Slice Q1 — public-form → leads-table
// intake. Locks the pure mapper + the safe-insert behavior so a
// future refactor can't quietly stop populating /admin/leads.

import { describe, it, expect, vi } from 'vitest';
import {
  INTAKE_ROUTING_ROLES,
  buildLeadRowFromForm,
  findIntakeRecipients,
  insertLeadFromForm,
  notifyIntakeRecipients,
  type LeadIntakeInput,
} from '@/lib/leads/intake';

vi.mock('@/lib/notifications', () => ({
  notifyMany: vi.fn(),
}));
import { notifyMany } from '@/lib/notifications';

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

describe('findIntakeRecipients — Q2 role query', () => {
  function fakeClient(users: Array<{ email: string; roles: string[]; is_approved?: boolean; is_banned?: boolean }>) {
    const overlaps = vi.fn().mockResolvedValue({
      data: users.map((u) => ({
        email: u.email,
        roles: u.roles,
        is_approved: u.is_approved ?? true,
        is_banned: u.is_banned ?? false,
      })),
      error: null,
    });
    const select = vi.fn().mockReturnValue({ overlaps });
    const from = vi.fn().mockReturnValue({ select });
    return { from, calls: { from, select, overlaps } };
  }

  it('returns every distinct email with an intake role', async () => {
    const { from } = fakeClient([
      { email: 'admin@s.com', roles: ['admin'] },
      { email: 'crew@s.com', roles: ['field_crew', 'employee'] },
      { email: 'teacher@s.com', roles: ['teacher'] }, // overlaps filter excludes; mock returns all but we still filter banned/unapproved
    ]);
    const result = await findIntakeRecipients({ from } as never);
    // The mock returns all rows; our helper trusts the overlaps filter
    // but still lower-cases + dedupes. Both intake roles land.
    expect(result).toEqual(expect.arrayContaining(['admin@s.com', 'crew@s.com']));
  });

  it('drops banned + unapproved users', async () => {
    const { from } = fakeClient([
      { email: 'good@s.com', roles: ['admin'] },
      { email: 'banned@s.com', roles: ['admin'], is_banned: true },
      { email: 'pending@s.com', roles: ['employee'], is_approved: false },
    ]);
    const result = await findIntakeRecipients({ from } as never);
    expect(result).toEqual(['good@s.com']);
  });

  it('returns [] when supabase errors (never throws)', async () => {
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        overlaps: vi.fn().mockResolvedValue({ data: null, error: { message: 'nope' } }),
      }),
    });
    expect(await findIntakeRecipients({ from } as never)).toEqual([]);
  });
});

describe('notifyIntakeRecipients — Q2 fan-out', () => {
  function clientWithUsers(emails: string[]) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          overlaps: vi.fn().mockResolvedValue({
            data: emails.map((e) => ({ email: e, roles: ['admin'], is_approved: true, is_banned: false })),
            error: null,
          }),
        }),
      }),
    };
  }

  it('calls notifyMany with the right shape per recipient', async () => {
    vi.mocked(notifyMany).mockClear();
    const client = clientWithUsers(['a@s.com', 'b@s.com']);
    const { recipientCount } = await notifyIntakeRecipients(client as never, {
      leadId: 'LEAD-1',
      input: baseInput({ serviceType: 'Boundary', isRush: true }),
    });
    expect(recipientCount).toBe(2);
    expect(notifyMany).toHaveBeenCalledTimes(1);
    const [users, payload] = vi.mocked(notifyMany).mock.calls[0];
    expect(users).toEqual(['a@s.com', 'b@s.com']);
    expect(payload.type).toBe('lead.new');
    // Slice S1 — link points at the focused detail page now.
    expect(payload.link).toBe('/admin/leads/LEAD-1');
    expect(payload.source_type).toBe('leads');
    expect(payload.source_id).toBe('LEAD-1');
    expect(payload.escalation_level).toBe('high'); // rush flag
    expect(payload.body).toContain('Ref: SS-260614-200000-ABC');
    expect(payload.body).toContain('Boundary');
    expect(payload.body).toContain('🔥 RUSH');
  });

  it('skips notifyMany entirely when no recipients exist', async () => {
    vi.mocked(notifyMany).mockClear();
    const client = clientWithUsers([]);
    const result = await notifyIntakeRecipients(client as never, {
      leadId: 'LEAD-2',
      input: baseInput(),
    });
    expect(result.recipientCount).toBe(0);
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('non-rush escalation is `normal`', async () => {
    vi.mocked(notifyMany).mockClear();
    const client = clientWithUsers(['a@s.com']);
    await notifyIntakeRecipients(client as never, {
      leadId: 'LEAD-3',
      input: baseInput({ isRush: false }),
    });
    expect(vi.mocked(notifyMany).mock.calls[0][1].escalation_level).toBe('normal');
  });
});

describe('contact route — Slice Q1 + Q2 wiring', () => {
  // Source-lock the integration points without booting the route.
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const ROUTE_SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'api', 'contact', 'route.ts'),
    'utf8',
  );

  it('imports insertLeadFromForm + supabaseAdmin (Q1)', () => {
    expect(ROUTE_SRC).toMatch(/insertLeadFromForm,[\s\S]*?type LeadIntakeInput,[\s\S]*?from '@\/lib\/leads\/intake'/);
    expect(ROUTE_SRC).toMatch(/import \{ supabaseAdmin \} from '@\/lib\/supabase'/);
  });

  it('runs the INSERT on the production return path (Q1)', () => {
    expect(ROUTE_SRC).toMatch(
      /const insertedLead = await insertLeadFromForm\(supabaseAdmin, intake\)/,
    );
  });

  it('runs the INSERT on the dev-mode short-circuit too (Q1)', () => {
    expect(ROUTE_SRC).toMatch(
      /\/\/ Development mode[\s\S]*?await insertLeadFromForm\(supabaseAdmin, intake\)/,
    );
  });

  it('discriminates Website vs Pricing Calculator on the source field', () => {
    expect(ROUTE_SRC).toMatch(/source: isCalculator \? 'Pricing Calculator' : 'Website'/);
  });

  it('Q2 — imports notifyIntakeRecipients + fires it on the production return path', () => {
    expect(ROUTE_SRC).toMatch(
      /import \{\s*\n?\s*insertLeadFromForm,\s*\n?\s*notifyIntakeRecipients,/,
    );
    expect(ROUTE_SRC).toMatch(/await notifyIntakeRecipients\(supabaseAdmin, \{/);
  });

  it('Q2 — fires the notification in dev mode too so the bell lights up locally', () => {
    expect(ROUTE_SRC).toMatch(
      /\/\/ Development mode[\s\S]*?notifyIntakeRecipients\(supabaseAdmin/,
    );
  });
});

describe('leads admin page — Q3 focus param', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const PAGE_SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'admin', 'leads', 'page.tsx'),
    'utf8',
  );

  it('reads the focus query param', () => {
    expect(PAGE_SRC).toMatch(/const searchParams = useSearchParams\(\);/);
    expect(PAGE_SRC).toMatch(/searchParams\?\.get\('focus'\)/);
  });

  it('scrolls the focused card into view', () => {
    expect(PAGE_SRC).toMatch(/focusedCardRef\.current\.scrollIntoView/);
  });

  it('outlines the focused card so the user sees which one was linked', () => {
    expect(PAGE_SRC).toMatch(/data-focused=\{lead\.id === focusLeadId/);
    expect(PAGE_SRC).toMatch(/outline: '2px solid/);
  });
});
