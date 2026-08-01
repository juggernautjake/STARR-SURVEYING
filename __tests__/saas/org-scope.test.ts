// __tests__/saas/org-scope.test.ts — the tenant filter, and the four ways it could be a lie.
//
// Audit §3c.1 item 8g: *"`org_id` stops being a column and starts being a filter."*
//
// What has to be true for that sentence to be worth anything:
//
//   1. A scoped session's reads, updates and deletes are bounded to its org.
//   2. Rows it CREATES carry the org — a filter without a stamp makes every new row invisible to the
//      session that wrote it, which is worse than no filter at all.
//   3. A request with no session is untouched, so webhooks, cron and the public pay portal keep
//      working exactly as they do today.
//   4. The scope belongs to ONE request. This is the property with teeth: the mechanism uses
//      `enterWith`, which mutates the current async resource, so "does a request that never
//      authenticates inherit the last one's org" is a question with a real answer and not a
//      reassurance. It is asserted here against a simulated dispatch.

import { describe, expect, it, vi } from 'vitest';

import {
  ORG_SCOPED_TABLES,
  CROSS_ORG_TABLES,
  isScopedTable,
  orgScoped,
  stampOrg,
} from '@/lib/saas/org-scope';
import {
  beginOrgScope,
  currentRequestOrgId,
  orgIdForSession,
  runUnscoped,
  runWithOrgScope,
} from '@/lib/saas/org-scope-context';

const STARR = '00000000-0000-0000-0000-000000000001';
const ACME = '00000000-0000-0000-0000-0000000000ac';

// ── A Supabase-shaped stand-in that records what it was asked to do ────────────────────────────
//
// Deliberately not a mock of the real client: the point is to assert the SHAPE of the call chain the
// proxy produces (`.select().eq('org_id', …)`), which a mock that returns `this` for everything would
// happily pass while producing no filter at all.

interface Recorded {
  table: string;
  op: string;
  args: unknown[];
  filters: Array<[string, unknown]>;
}

function fakeClient() {
  const calls: Recorded[] = [];

  const filterBuilder = (rec: Recorded) => {
    const b = {
      eq(col: string, val: unknown) { rec.filters.push([col, val]); return b; },
      in(col: string, val: unknown) { rec.filters.push([col, val]); return b; },
      select() { return b; },
      single() { return b; },
    };
    return b;
  };

  const client = {
    from(table: string) {
      const make = (op: string) => (...args: unknown[]) => {
        const rec: Recorded = { table, op, args, filters: [] };
        calls.push(rec);
        return filterBuilder(rec);
      };
      return {
        select: make('select'),
        insert: make('insert'),
        upsert: make('upsert'),
        update: make('update'),
        delete: make('delete'),
      };
    },
    rpc: vi.fn((..._args: unknown[]) => 'rpc-result'),
    storage: { from: () => 'bucket' },
  };

  return { client, calls };
}

const last = (calls: Recorded[]) => calls[calls.length - 1];

describe('the filter', () => {
  it('bounds a read to the session org', () => {
    const { client, calls } = fakeClient();
    const db = orgScoped(client, () => STARR);

    db.from('jobs').select('*');

    expect(last(calls).table).toBe('jobs');
    expect(last(calls).filters).toEqual([['org_id', STARR]]);
  });

  it('bounds updates and deletes, so one firm cannot write another firm’s rows', () => {
    const { client, calls } = fakeClient();
    const db = orgScoped(client, () => STARR);

    db.from('jobs').update({ status: 'complete' });
    expect(last(calls).filters).toEqual([['org_id', STARR]]);

    db.from('receipts').delete();
    expect(last(calls).filters).toEqual([['org_id', STARR]]);
  });

  it('applies the org bound BEFORE the caller’s own filters, so theirs narrows rather than replaces', () => {
    const { client, calls } = fakeClient();
    const db = orgScoped(client, () => STARR);

    (db.from('jobs').update({ status: 'x' }) as { eq(c: string, v: unknown): unknown }).eq('id', 'job-1');

    // Both survive. An `.eq('id', …)` that replaced the org bound would be an IDOR across tenants —
    // guess another firm's job id and you write to it.
    expect(last(calls).filters).toEqual([['org_id', STARR], ['id', 'job-1']]);
  });

  it('leaves un-scoped tables alone', () => {
    const { client, calls } = fakeClient();
    const db = orgScoped(client, () => STARR);

    db.from('organizations').select('*');
    db.from('research_counties').select('*');

    expect(calls.every((c) => c.filters.length === 0)).toBe(true);
  });

  it('leaves the cross-org exemptions alone — sign-in and invitations depend on it', () => {
    const { client, calls } = fakeClient();
    const db = orgScoped(client, () => STARR);

    for (const t of CROSS_ORG_TABLES) db.from(t).select('*');

    expect(calls.map((c) => c.filters)).toEqual(calls.map(() => []));
  });

  it('does not touch RPC or storage', () => {
    const { client } = fakeClient();
    const db = orgScoped(client, () => STARR);

    // `search_everything` takes `p_org` and applies the bound itself; a proxy cannot filter a
    // function's result set from outside it.
    expect(db.rpc('search_everything', { p_org: STARR })).toBe('rpc-result');
    expect(db.storage.from()).toBe('bucket');
  });
});

describe('the stamp', () => {
  it('puts the org on rows the session creates', () => {
    const { client, calls } = fakeClient();
    const db = orgScoped(client, () => STARR);

    db.from('jobs').insert({ job_number: '2026-001' });

    expect(last(calls).args[0]).toEqual({ job_number: '2026-001', org_id: STARR });
  });

  it('stamps every row of a bulk insert', () => {
    const { client, calls } = fakeClient();
    const db = orgScoped(client, () => STARR);

    db.from('job_team').insert([{ email: 'a@x.com' }, { email: 'b@x.com' }]);

    expect(last(calls).args[0]).toEqual([
      { email: 'a@x.com', org_id: STARR },
      { email: 'b@x.com', org_id: STARR },
    ]);
  });

  it('never overrides an org the caller set — including an explicit null', () => {
    // A caller writing a deliberately unowned row must be able to say so. Silently overriding them
    // would make this proxy the thing that is lying about where a row belongs.
    expect(stampOrg({ org_id: ACME, a: 1 }, STARR)).toEqual({ org_id: ACME, a: 1 });
    expect(stampOrg({ org_id: null, a: 1 }, STARR)).toEqual({ org_id: null, a: 1 });
  });

  it('passes insert options through untouched', () => {
    const { client, calls } = fakeClient();
    const db = orgScoped(client, () => STARR);

    db.from('jobs').upsert({ id: 'j1' }, { onConflict: 'id' });

    expect(last(calls).args[1]).toEqual({ onConflict: 'id' });
  });
});

describe('no session, no scope', () => {
  it('is byte-for-byte today’s behaviour when nothing resolved an org', () => {
    const { client, calls } = fakeClient();
    const db = orgScoped(client, () => null);

    db.from('jobs').select('*');
    db.from('payments').insert({ amount: 100 });

    expect(calls[0].filters).toEqual([]);
    expect(calls[1].args[0]).toEqual({ amount: 100 }); // no org invented for a webhook
  });
});

describe('which org a session acts as', () => {
  it('is the active org', () => {
    expect(orgIdForSession({ user: { activeOrgId: STARR, memberships: [{ orgId: STARR }] } })).toBe(STARR);
  });

  it('falls back to the first membership when no active org is persisted', () => {
    // `user_active_org` is empty in production today, so this is the live path, not the edge case.
    expect(orgIdForSession({ user: { memberships: [{ orgId: STARR }] } })).toBe(STARR);
  });

  it('is null for an operator, who works across firms by definition', () => {
    expect(orgIdForSession({ user: { isOperator: true, activeOrgId: STARR, memberships: [{ orgId: STARR }] } })).toBeNull();
  });

  it('is null with no session and no memberships', () => {
    expect(orgIdForSession(null)).toBeNull();
    expect(orgIdForSession({ user: { memberships: [] } })).toBeNull();
  });
});

describe('the scope belongs to one request', () => {
  it('is visible after the await that resolved the session', async () => {
    // The mechanism, reproduced exactly: the store is entered SYNCHRONOUSLY and filled later. Set it
    // inside the promise callback instead and this assertion fails — the continuation after `await`
    // resumes in the context captured when the await started.
    async function handler() {
      const holder = beginOrgScope();
      await Promise.resolve().then(() => { holder.orgId = STARR; });
      return currentRequestOrgId();
    }
    await expect(handler()).resolves.toBe(STARR);
  });

  it('does not bleed between concurrent requests', async () => {
    const dispatch = (org: string) => new Promise<string | null>((resolve) => setImmediate(async () => {
      const holder = beginOrgScope();
      await new Promise((r) => setTimeout(r, 5));
      holder.orgId = org;
      await new Promise((r) => setTimeout(r, 5));
      resolve(currentRequestOrgId());
    }));

    await expect(Promise.all([dispatch(STARR), dispatch(ACME)])).resolves.toEqual([STARR, ACME]);
  });

  it('does not leak into a later request that never authenticates', async () => {
    // The `enterWith` hazard, asserted rather than asserted-away. A Stripe webhook arriving after an
    // admin's page load must resolve NO org — if it inherited one it would write into whichever firm
    // happened to load a page most recently.
    const authed = (org: string) => new Promise<void>((resolve) => setImmediate(async () => {
      const holder = beginOrgScope();
      await Promise.resolve();
      holder.orgId = org;
      resolve();
    }));
    const webhook = () => new Promise<string | null>((resolve) => setImmediate(async () => {
      await new Promise((r) => setTimeout(r, 1));
      resolve(currentRequestOrgId());
    }));

    await authed(ACME);
    await expect(webhook()).resolves.toBeNull();
  });

  it('can be declared explicitly by a cron that knows its firm', async () => {
    await runWithOrgScope(STARR, async () => {
      expect(currentRequestOrgId()).toBe(STARR);
      await runUnscoped(async () => {
        expect(currentRequestOrgId()).toBeNull();
      });
    });
  });
});

describe('the table list', () => {
  it('is the thing the proxy consults, and every exemption is in it', () => {
    // An exemption for a table that is not scoped in the first place is a comment pretending to be a
    // decision — and it would silently stop meaning anything if that table ever gained the column.
    for (const t of CROSS_ORG_TABLES) expect(ORG_SCOPED_TABLES.has(t), t).toBe(true);
    for (const t of CROSS_ORG_TABLES) expect(isScopedTable(t), t).toBe(false);
  });

  it('covers the tables the three day-one workflows run on (D3)', () => {
    // Clock in → work → get paid · Lead → job → invoice → paid · Job → field data → CAD → deliverable.
    for (const t of [
      'jobs', 'job_team', 'daily_time_logs', 'active_clock_sessions', 'pay_stubs', 'payroll_runs',
      'leads', 'customer_invoices', 'payments', 'receipts', 'mileage_entries',
      'field_data_points', 'job_files', 'research_documents', 'research_projects',
    ]) {
      expect(isScopedTable(t), t).toBe(true);
    }
  });

  it('is sorted and free of duplicates, so a diff to it reads as a diff', () => {
    const list = [...ORG_SCOPED_TABLES];
    expect(list).toEqual([...new Set(list)]);
    expect(list).toEqual([...list].sort());
  });
});
