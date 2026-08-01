// __tests__/leads/intake-org-id.test.ts — the enquiry actually reaches the database. A14.
//
// ── WHAT THIS IS A REGRESSION TEST FOR ─────────────────────────────────────────────────────────────
//
// `leads.org_id` is NOT NULL with no default, and nothing in the intake path was setting it. Every public
// contact-form submission failed its INSERT with
// `null value in column "org_id" ... violates not-null constraint`, and because that failure is
// deliberately silent — the email send is the legal record, so a DB problem must not 500 the customer —
// nobody saw it. When this was found the newest lead in the live database was **six weeks old** while the
// form kept returning 200 and customers kept getting confirmations.
//
// ── WHY 15,000 GREEN TESTS MISSED IT ───────────────────────────────────────────────────────────────
//
// Every existing test exercises `buildLeadRowFromForm`, which is pure and correct. None of them INSERT.
// The bug lived entirely in the gap between a well-tested row builder and a schema constraint, and it was
// found by submitting the real form in a real browser and reading the real database.
//
// So this test asserts on the INSERT, with a fake client that behaves like the real constraint.
import { describe, it, expect, vi } from 'vitest';
import { insertLeadFromForm, resolveIntakeOrgId, type LeadIntakeInput } from '@/lib/leads/intake';

vi.mock('@/lib/notifications', () => ({ notifyMany: vi.fn() }));
vi.mock('@/lib/customers/identity', async (orig) => {
  const actual = await orig() as Record<string, unknown>;
  return { ...actual, upsertCustomer: vi.fn().mockResolvedValue(null) };
});
vi.mock('@/lib/pipeline/events', async (orig) => {
  const actual = await orig() as Record<string, unknown>;
  return { ...actual, recordMilestone: vi.fn().mockResolvedValue(true) };
});

const ORG = '00000000-0000-0000-0000-000000000001';

const input = (over: Partial<LeadIntakeInput> = {}): LeadIntakeInput => ({
  name: 'Jane Landowner',
  email: 'jane@example.com',
  referenceNumber: 'SS-260801-120000-ABC',
  source: 'Website',
  ...over,
});

/** A client that enforces the one constraint the real table enforces and nothing else. */
function fakeClient(orgs: Array<{ id: string }>, captured: { row?: Record<string, unknown> } = {}) {
  return {
    from(table: string) {
      if (table === 'organizations') {
        return { select: () => ({ limit: () => Promise.resolve({ data: orgs, error: null }) }) };
      }
      return {
        insert(row: Record<string, unknown>) {
          captured.row = row;
          // The real NOT NULL constraint, reproduced.
          if (row.org_id === null || row.org_id === undefined) {
            return { select: () => ({ single: () => Promise.resolve({
              data: null,
              error: { message: 'null value in column "org_id" of relation "leads" violates not-null constraint' },
            }) }) };
          }
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'lead-1' }, error: null }) }) };
        },
      };
    },
  } as never;
}

describe('the INSERT actually succeeds', () => {
  it('sets org_id, so the row is not rejected', () => {
    const captured: { row?: Record<string, unknown> } = {};
    return insertLeadFromForm(fakeClient([{ id: ORG }], captured), input()).then((result) => {
      expect(result).toEqual({ id: 'lead-1' });
      expect(captured.row?.org_id).toBe(ORG);
    });
  });

  it('FAILS the way the bug failed if org_id is ever dropped again', async () => {
    // Proves the fake client is actually enforcing the constraint — otherwise this file would pass even
    // with the bug reintroduced, which is the failure mode of a regression test that tests nothing.
    const captured: { row?: Record<string, unknown> } = {};
    const client = fakeClient([], captured);
    expect(await insertLeadFromForm(client, input())).toBeNull();
  });
});

describe('resolveIntakeOrgId — never guess which org a customer belongs to', () => {
  it('uses the env override when set', async () => {
    const before = process.env.LEADS_DEFAULT_ORG_ID;
    process.env.LEADS_DEFAULT_ORG_ID = 'org-from-env';
    expect(await resolveIntakeOrgId(fakeClient([{ id: ORG }]))).toEqual({ orgId: 'org-from-env' });
    if (before === undefined) delete process.env.LEADS_DEFAULT_ORG_ID; else process.env.LEADS_DEFAULT_ORG_ID = before;
  });

  it('uses the single organization when there is exactly one', async () => {
    expect(await resolveIntakeOrgId(fakeClient([{ id: ORG }]))).toEqual({ orgId: ORG });
  });

  it('REFUSES rather than picking one when several exist', async () => {
    // The only thing worse than a lead that fails to save is a lead that saves into an org where nobody
    // will ever look at it.
    const out = await resolveIntakeOrgId(fakeClient([{ id: 'a' }, { id: 'b' }]));
    expect('error' in out).toBe(true);
    if ('error' in out) expect(out.error).toMatch(/LEADS_DEFAULT_ORG_ID/);
  });

  it('says what to do when there are no orgs at all', async () => {
    const out = await resolveIntakeOrgId(fakeClient([]));
    expect('error' in out).toBe(true);
    if ('error' in out) expect(out.error).toMatch(/seeds/i);
  });
});

describe('a dropped enquiry leaves a loud trace', () => {
  it('logs the customer it lost, not just the error object', async () => {
    // This log line is the ONLY evidence a dropped enquiry produces — the customer still gets a 200 and a
    // confirmation email by design, so "INSERT failed: {}" in a log nobody greps is how six weeks passed.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await insertLeadFromForm(fakeClient([]), input({ email: 'lost@example.com' }));
    expect(spy.mock.calls.flat().join(' ')).toMatch(/NOT be saved|NOT saved/);
    spy.mockRestore();
  });
});
