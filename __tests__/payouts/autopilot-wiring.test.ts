// __tests__/payouts/autopilot-wiring.test.ts — the payout autopilot is connected end to end.
//
// The commonest defect in this codebase is "authored but not wired": a module nobody calls. Each check
// here asserts the CALLER imports and uses the piece, not just that the piece exists.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('one batch builder for the button and the schedule', () => {
  it.each(['app/api/admin/payroll/pay-owed/route.ts', 'app/api/cron/payout-prepare/route.ts'])('%s builds through lib/payouts/build-batch', (p) => {
    expect(read(p)).toMatch(/from '@\/lib\/payouts\/build-batch'/);
  });
  it('the builder resolves every line through routing (method, fallback, fee, hold reason)', () => {
    const s = read('lib/payouts/build-batch.ts');
    expect(s).toMatch(/resolvePayout\(person, policy/);
    expect(s).toMatch(/fee_cents: l\.fee_cents/);
  });
});

describe('Commit', () => {
  it('the route calls commitBatch and previewCommit', () => {
    const s = read('app/api/admin/payouts/runs/[id]/commit/route.ts');
    expect(s).toMatch(/commitBatch\(params\.id/);
    expect(s).toMatch(/previewCommit\(params\.id\)/);
    expect(s).toMatch(/canApprovePayoutBatch/);
  });
  it('stamps one idempotency key per line before any send, and derives the PayPal batch id from the lines', () => {
    const s = read('lib/payouts/commit.ts');
    const keyAt = s.indexOf("idempotency_key: key");
    const sendAt = s.indexOf('createVenmoPayout(pp');
    expect(keyAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(keyAt);
    expect(s).toMatch(/starr-\$\{batchId\}-venmo-\$\{setHash\}/);
  });
  it('re-resolves pending lines against today\'s settings and holds what cannot be paid', () => {
    const s = read('lib/payouts/commit.ts');
    expect(s).toMatch(/preflight\(items, true\)/);
    expect(s).toMatch(/held\.push/);
  });
  it('the batch page shows the Commit panel', () => {
    expect(read('app/admin/payouts/runs/[id]/page.tsx')).toMatch(/<PayoutCommitPanel batchId=\{batch\.id\}/);
  });
});

describe('every money-out path subtracts the fee', () => {
  it.each([
    ['app/api/admin/payouts/runs/[id]/ach-csv/route.ts', /fee_cents/],
    ['app/api/admin/finances/compare/route.ts', /fee_cents/],
    ['app/api/admin/finances/overview/route.ts', /fee_cents/],
    ['app/api/admin/payouts/runs/[id]/route.ts', /fee_cents/],
    ['app/api/admin/payouts/runs/[id]/nacha/route.ts', /fee_cents/],
  ])('%s reads fee_cents for disbursedCents', (p, re) => {
    expect(read(p)).toMatch(re);
  });
});

describe('the org controls it, the employee chooses within it', () => {
  it('settings page saves through the settings API', () => {
    expect(read('app/admin/payouts/settings/page.tsx')).toMatch(/fetch\('\/api\/admin\/payouts\/settings', \{\s*method: 'PUT'/);
  });
  it('My Pay renders "How I get paid"', () => {
    expect(read('app/admin/my-pay/MyPayPanel.tsx')).toMatch(/<MyPayoutMethod \/>/);
  });
  it('a fee can only be chosen with written consent', () => {
    const s = read('app/api/admin/payroll/my-payout-method/route.ts');
    expect(s).toMatch(/needsConsent: true/);
    expect(s).toMatch(/from\('payout_fee_consents'\)\.insert/);
  });
  it('bank numbers are encrypted in the database, never stored in plain columns', () => {
    expect(read('app/api/admin/payroll/my-payout-method/route.ts')).toMatch(/rpc\('save_payout_bank'/);
    expect(read('seeds/677_payout_autopilot.sql')).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
  });
  it('the dispatch page has a bucket for every method', () => {
    const s = read('app/admin/payouts/runs/[id]/dispatch/page.tsx');
    for (const m of ['account', 'venmo', 'ach', 'check', 'cashapp', 'zelle', 'cash', 'other']) expect(s).toContain(`'${m}'`);
  });
});
