// __tests__/notifications/withdrawal.test.ts
//
// The withdrawal API has had approve / reject / process since it was written and has never sent a
// single notification. A person who asked for their own wages and heard nothing assumes the system
// is broken — and with no admin queue either, they were right.
//
// The distinction these tests exist to protect is "approved" versus "sent". They are separate steps
// and mean different things to somebody whose rent depends on the difference.
import { describe, it, expect } from 'vitest';
import { buildWithdrawalNotification } from '@/lib/notifications/withdrawal';

const base = { userEmail: 'jack@x.com', amount: 250, destination: 'bank_account' } as const;

describe('approved is not paid', () => {
  it('says the money has not gone yet', () => {
    // Letting somebody believe an approval is a payment is how a rent payment bounces.
    const n = buildWithdrawalNotification({ ...base, outcome: 'approved' })!;
    expect(n.body).toContain('$250.00');
    expect(n.body).toMatch(/not been sent yet/i);
    expect(n.title).toMatch(/approved/i);
  });

  it('promises a second message when it does go', () => {
    const n = buildWithdrawalNotification({ ...base, outcome: 'approved' })!;
    expect(n.body).toMatch(/told again|when it goes/i);
  });

  it('says plainly when it has actually been sent', () => {
    const n = buildWithdrawalNotification({ ...base, outcome: 'completed' })!;
    expect(n.body).toMatch(/has been sent/i);
    expect(n.body).toMatch(/off your balance/i);
  });
});

describe('a refusal says why', () => {
  it('carries the reason', () => {
    const n = buildWithdrawalNotification({
      ...base, outcome: 'rejected', reason: 'Waiting on the invoice that funds this week',
    })!;
    expect(n.body).toContain('Waiting on the invoice that funds this week');
    expect(n.body).toContain('Reason:');
  });

  it('does not leave a dangling "Reason:" when none was given', () => {
    const n = buildWithdrawalNotification({ ...base, outcome: 'rejected' })!;
    expect(n.body).not.toContain('Reason:');
  });

  it('says the balance is untouched, on both a refusal and a cancellation', () => {
    // The first question after "declined" is whether the money went anyway.
    for (const outcome of ['rejected', 'cancelled'] as const) {
      expect(buildWithdrawalNotification({ ...base, outcome })!.body).toMatch(/balance is unchanged/i);
    }
  });
});

describe('wording', () => {
  it('turns the stored destination key into something a person says', () => {
    // Nobody says "bank_account" out loud.
    const n = buildWithdrawalNotification({ ...base, outcome: 'completed' })!;
    expect(n.body).toContain('to your bank account');
    expect(n.body).not.toContain('bank_account');
  });

  it('handles a destination it has never seen', () => {
    const n = buildWithdrawalNotification({ ...base, destination: 'cash_app', outcome: 'completed' })!;
    expect(n.body).toContain('cash app');
  });

  it('omits the destination entirely when there is none', () => {
    const n = buildWithdrawalNotification({ userEmail: 'j@x.com', amount: 10, outcome: 'approved' })!;
    expect(n.body).not.toContain('to your');
  });

  it('still says something useful when the amount is unreadable', () => {
    const n = buildWithdrawalNotification({ userEmail: 'j@x.com', amount: null, outcome: 'completed' })!;
    expect(n.body).toContain('Your withdrawal');
    expect(n.body).not.toContain('NaN');
  });

  it('points at the employee’s own pay page', () => {
    expect(buildWithdrawalNotification({ ...base, outcome: 'approved' })!.link).toBe('/admin/my-pay');
  });
});

describe('never throws after the money has moved', () => {
  it('returns null with nobody to tell', () => {
    // `completed` fires after the balance has already been debited. A missing email must not turn a
    // sent withdrawal into a 500 that invites somebody to retry it.
    expect(buildWithdrawalNotification({ userEmail: null, outcome: 'completed', amount: 5 })).toBeNull();
    expect(buildWithdrawalNotification({ userEmail: '   ', outcome: 'completed', amount: 5 })).toBeNull();
  });
});
