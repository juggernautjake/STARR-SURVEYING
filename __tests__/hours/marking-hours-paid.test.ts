// Approved is not paid, and now the schema can tell them apart.
//
// Owner, 2026-09-19: "I want it so that we can mark hours as approved and as paid. Eventually we
// will link this to the payroll system so that once the hours are approved, the admin can run the
// payroll to pay people for whatever hours they have that have been approved."
//
// Before seeds/651 nothing marked a single time log as paid — paid-ness was a running per-person
// balance, which answers "how much do we owe Jacob" and cannot answer "were THESE eight hours
// paid". These tests pin the linkage and the rule that comes with it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { groupByEmployee } from '@/lib/hours/by-employee';

const read = (p: string) => readFileSync(p, 'utf8');

describe('the schema', () => {
  const seed = read('seeds/651_time_log_paid.sql');

  it('records when, who, and which payout run', () => {
    for (const col of ['paid_at timestamptz', 'paid_by text', 'payout_batch_id uuid']) {
      expect(seed).toContain(col);
    }
  });

  it('lets a run be unnamed, so hand-marking works before payroll is linked', () => {
    // The owner said the payroll link comes "eventually". A NOT NULL batch would have made the
    // feature unusable until it existed.
    expect(seed, 'the batch is nullable').not.toMatch(/payout_batch_id uuid[^,;]*NOT NULL/);
  });

  it('keeps the payment when a payout run is voided', () => {
    // CASCADE here would delete the record that somebody's hours were paid. Voiding a run means
    // the LINK is gone, not the money.
    expect(seed).toContain('ON DELETE SET NULL');
  });

  it('indexes the question the approvals page actually asks', () => {
    expect(seed).toContain('idx_daily_time_logs_unpaid');
    expect(seed).toContain('WHERE paid_at IS NULL');
  });

  it('does not forbid un-approving something already paid', () => {
    // A CHECK across status and paid_at would turn a normal correction into a constraint failure
    // with somebody's wages behind it. The rule lives in the route instead, and the seed says so.
    expect(seed).not.toMatch(/CHECK[^;]*paid_at[^;]*status/i);
    expect(seed).toContain('enforced in the route');
  });
});

describe('the route', () => {
  const route = read('app/api/admin/time-logs/approve/route.ts');

  it('accepts marking paid and unmarking it', () => {
    expect(route).toContain("'approve' | 'reject' | 'mark_paid' | 'mark_unpaid'");
  });

  it('refuses to pay hours nobody approved', () => {
    expect(route).toContain("r.status !== 'approved' && r.status !== 'adjusted'");
    expect(route, 'and says how many, rather than failing silently').toContain('not been approved yet');
  });

  it('counts an adjusted day as approved', () => {
    // An approver changed the figure and accepted it. Refusing to pay it would strand every day
    // that was ever corrected.
    expect(route).toContain("r.status !== 'adjusted'");
  });

  it('does not rewrite who approved the hours', () => {
    // Paying for hours is not re-approving them. Overwriting `approved_by` with whoever pressed
    // Pay would destroy the trail that makes a wage dispute answerable.
    const paidBlock = route.slice(route.indexOf("if (action === 'mark_paid'"), route.indexOf('const updateData'));
    expect(paidBlock).not.toContain('approved_by');
    expect(paidBlock).not.toContain('approved_at');
  });

  it('leaves the batch empty when a person did the marking', () => {
    // So "a person decided" and "a run did it" stay distinguishable forever.
    const paidBlock = route.slice(route.indexOf("if (action === 'mark_paid'"), route.indexOf('const updateData'));
    expect(paidBlock).toContain('paid_by: session.user.email');
    expect(paidBlock, 'unmarking clears the link too').toContain('payout_batch_id: null');
  });

  it('is admin only, like every other action on this route', () => {
    expect(route).toContain("if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Admin only' }");
  });
});

describe('the page', () => {
  const page = read('app/admin/hours/_tabs/ApprovalsTab.tsx');

  it('asks the real column instead of guessing', () => {
    expect(page).toContain('isPaid: (l) => Boolean(l.paid_at)');
  });

  it('offers marking paid, and undoing it', () => {
    // Marking the wrong week paid is the obvious mistake; a one-way action would make the fix a
    // database job.
    expect(page).toContain('data-testid="tl-mark-paid"');
    expect(page).toContain('data-testid="tl-mark-unpaid"');
  });

  it('keeps the bulk bar reachable once nothing is pending', () => {
    // Paying happens AFTER approval, when the pending count is often zero. A bar that only appeared
    // while something was pending would hide the Paid buttons exactly when they are wanted.
    expect(page).toContain("tab === 'pending' && (pendingCount > 0 || selected.size > 0)");
  });

  it('shows paid as its own badge, not as a status', () => {
    // An entry is approved AND paid. Replacing the status would lose one of the two facts.
    expect(page).toContain('tl-badge tl-badge--paid');
    expect(read('app/admin/styles/AdminTimeLogs.css')).toContain('.tl-badge--paid {');
  });
});

describe('what the header adds up', () => {
  const log = (o: Record<string, unknown>) => ({
    id: String(o.id), user_email: 'john@starr.com', log_date: '2026-09-16',
    hours: 8, status: 'approved', created_at: '2026-09-16T17:00:00Z', ...o,
  });

  it('counts only the hours actually marked paid', () => {
    const out = groupByEmployee([
      log({ id: '1', paid_at: '2026-09-18T12:00:00Z' }),
      log({ id: '2', paid_at: null }),
      log({ id: '3' }),
    ] as never, { isPaid: (l) => Boolean((l as { paid_at?: string | null }).paid_at) });
    expect(out[0]!.approvedHours).toBe(24);
    expect(out[0]!.paidHours).toBe(8);
  });

  it('pays the adjusted figure, not what was clocked', () => {
    const out = groupByEmployee([
      log({ id: '1', hours: 9, adjusted_hours: 8, status: 'adjusted', paid_at: '2026-09-18T12:00:00Z' }),
    ] as never, { isPaid: (l) => Boolean((l as { paid_at?: string | null }).paid_at) });
    expect(out[0]!.paidHours).toBe(8);
  });
});
