// lib/notifications/withdrawal.ts
//
// Telling somebody what happened to their request for their own money.
//
// Owner, 2026-08-12: *"employees can see money earned, withdraw to their private accounts."*
//
// The withdrawal API has had `approve`, `reject` and `process` since it was written and has never
// sent a single notification. A person who asked for their wages and heard nothing back assumes the
// system is broken, and they are not wrong to: nothing on the employee's screen changes until they
// happen to reload it, and there is no admin queue that would have shown anybody the request either.
//
// ── WHY THE REJECTION CARRIES ITS REASON AND THE APPROVAL DOES NOT ───────────────────────────────
//
// A refusal is the only one of the three that leaves the person with something to do, and "your
// withdrawal was rejected" without a reason is the same dead end the hours rejection had until
// today. An approval and a completion are self-explanatory; padding them with prose would train
// people to skim the ones that matter.
//
// Pure and dependency-free, like every builder here, so the wording is testable without a database.

export type WithdrawalOutcome = 'approved' | 'rejected' | 'completed' | 'cancelled';

export interface WithdrawalNotificationInput {
  userEmail?: string | null;
  outcome: WithdrawalOutcome;
  /** Dollars. */
  amount?: number | null;
  /** Required in substance for a rejection — see the header. */
  reason?: string | null;
  /** Where it is going, when that is known: "bank_account", "venmo". */
  destination?: string | null;
}

export interface WithdrawalNotification {
  user_email: string;
  type: 'payment';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'withdrawal';
}

const money = (n: number): string => `$${n.toFixed(2)}`;

/** "bank_account" → "your bank account". Stored as a key; nobody says "bank_account" out loud. */
function destinationPhrase(destination: string | null | undefined): string {
  const d = (destination ?? '').trim().toLowerCase();
  if (!d) return '';
  if (d === 'bank_account') return ' to your bank account';
  return ` to your ${d.replace(/_/g, ' ')}`;
}

/**
 * Build the notification, or null when there is nobody to tell.
 *
 * Null rather than a throw: this fires after the money has already moved, and a missing email must
 * not turn a completed withdrawal into a 500.
 */
export function buildWithdrawalNotification(
  input: WithdrawalNotificationInput,
): WithdrawalNotification | null {
  const email = input.userEmail?.trim();
  if (!email) return null;

  const amount = typeof input.amount === 'number' && Number.isFinite(input.amount)
    ? money(input.amount)
    : 'Your withdrawal';
  const where = destinationPhrase(input.destination);

  switch (input.outcome) {
    case 'approved':
      return {
        user_email: email, type: 'payment', icon: '✅',
        title: '✅ Withdrawal approved',
        // Approved is deliberately NOT "paid". The money has not moved yet, and letting somebody
        // believe it has is how a rent payment bounces.
        body: `${amount} was approved${where}. It has not been sent yet — you will be told again when it goes out.`,
        link: '/admin/my-pay', source_type: 'withdrawal',
      };
    case 'completed':
      return {
        user_email: email, type: 'payment', icon: '💸',
        title: '💸 Withdrawal sent',
        body: `${amount} has been sent${where} and taken off your balance.`,
        link: '/admin/my-pay', source_type: 'withdrawal',
      };
    case 'rejected': {
      const why = input.reason?.trim() ? ` Reason: ${input.reason.trim()}` : '';
      return {
        user_email: email, type: 'payment', icon: '❌',
        title: '❌ Withdrawal declined',
        body: `${amount} was not approved.${why} Your balance is unchanged.`,
        link: '/admin/my-pay', source_type: 'withdrawal',
      };
    }
    case 'cancelled':
    default:
      return {
        user_email: email, type: 'payment', icon: '↩️',
        title: '↩️ Withdrawal cancelled',
        body: `${amount} was cancelled. Your balance is unchanged.`,
        link: '/admin/my-pay', source_type: 'withdrawal',
      };
  }
}
