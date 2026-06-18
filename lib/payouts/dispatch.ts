// lib/payouts/dispatch.ts
//
// P13 of payment-infrastructure-2026-06-18.md — pure helpers for
// per-method dispatch.
//
//   - groupItemsByMethod  → splits an item list into the per-method
//                           buckets the dispatch page renders
//   - buildPayoutDeepLink → platform deep link with amount + note
//                           prefilled (mirrors P4's customer-side
//                           helper but for the office paying out)
//   - buildPayoutNote     → consistent memo on every payout
//   - batchStatusFromItems → derives the parent batch's lifecycle
//                            state from its items' statuses
//   - buildAchCsvLine / buildAchCsv → simplified per-line CSV format
//                                     the office can upload to PNC's
//                                     business banking portal; full
//                                     NACHA encoding lands when the
//                                     bank's preferred format is
//                                     confirmed.

export type PayoutMethod = 'venmo' | 'cashapp' | 'zelle' | 'ach' | 'cash';
export type PayoutItemStatus = 'pending' | 'sent' | 'paid' | 'failed';
export type PayoutBatchStatus = 'draft' | 'approved' | 'dispatched' | 'completed' | 'voided';

export interface DispatchItem {
  id: string;
  user_email: string;
  user_name: string | null;
  total_cents: number;
  method: PayoutMethod | null;
  method_handle: string | null;
  status: PayoutItemStatus;
}

export type GroupedDispatch = Record<PayoutMethod | 'unassigned', DispatchItem[]>;

const ALL_METHODS: PayoutMethod[] = ['venmo', 'cashapp', 'zelle', 'ach', 'cash'];

/** Pure helper — bucket items by their stored method. Items without
 *  a method end up under 'unassigned' so the office sees them
 *  prominently and can fix the assignment before dispatching. */
export function groupItemsByMethod(items: ReadonlyArray<DispatchItem>): GroupedDispatch {
  const out: GroupedDispatch = {
    venmo: [], cashapp: [], zelle: [], ach: [], cash: [], unassigned: [],
  };
  for (const item of items) {
    const m = item.method;
    if (m && ALL_METHODS.includes(m)) {
      out[m].push(item);
    } else {
      out.unassigned.push(item);
    }
  }
  return out;
}

/** Pure helper — single source of truth for the payout memo, so
 *  every method's deep link / note column reads the same. */
export function buildPayoutNote(batchLabel: string, item: { user_email: string }): string {
  return `Starr Surveying payout — ${batchLabel} — ${item.user_email}`;
}

/** Pure helper — fill in a deep-link template for an outbound
 *  payout. Returns null when the method has no template (cash) or
 *  the item has no handle on file (the office must add it before
 *  dispatch). */
export function buildPayoutDeepLink(
  item: DispatchItem,
  batchLabel: string,
): string | null {
  if (!item.method || !item.method_handle) return null;
  const dollars = (Math.max(0, item.total_cents) / 100).toFixed(2);
  const note = encodeURIComponent(buildPayoutNote(batchLabel, item));
  const handle = encodeURIComponent(item.method_handle.replace(/^[@$]/, ''));
  switch (item.method) {
    case 'venmo':
      return `venmo://paycharge?txn=pay&recipients=${handle}&amount=${dollars}&note=${note}`;
    case 'cashapp':
      return `https://cash.app/$${handle}/${dollars}`;
    case 'zelle':
      // Zelle has no universal deep link — most bank apps just
      // accept the recipient in the URL. We return a mailto: as a
      // fallback so the admin can copy the email + amount.
      return `mailto:${item.method_handle}?subject=${encodeURIComponent('Zelle payout')}&body=${note}`;
    default:
      return null;
  }
}

/** Pure helper — derive the parent batch status from the items'
 *  individual statuses. The cron that runs after every item-mark
 *  uses this to roll the batch forward.
 *
 *  Rules (per the lifecycle in seed 325):
 *    - All items `paid`  → batch `completed`
 *    - All items `sent` or `paid` (at least one `sent`) → `dispatched`
 *    - Any item `failed` AND no longer `pending` → `dispatched`
 *      (the office can mark the failed item again once retried;
 *      we don't regress the batch)
 *    - Otherwise → `approved` (still mid-dispatch)
 */
export function batchStatusFromItems(
  items: ReadonlyArray<{ status: PayoutItemStatus }>,
  current: PayoutBatchStatus,
): PayoutBatchStatus {
  if (current === 'voided' || current === 'draft') return current;
  if (items.length === 0) return current;
  const allPaid = items.every((i) => i.status === 'paid');
  if (allPaid) return 'completed';
  const noneStillPending = items.every((i) => i.status !== 'pending');
  if (noneStillPending) return 'dispatched';
  const someProgressed = items.some((i) => i.status === 'sent' || i.status === 'paid');
  if (someProgressed) return 'dispatched';
  return 'approved';
}

/** Pure helper — single CSV row for the ACH payouts file. Matches
 *  the simplest "Bill Pay" CSV most US banks (PNC, BofA, etc.)
 *  accept for bulk transfers: payee email + amount + memo. The
 *  field order is what PNC's "Send Payments" import wants.
 *
 *  Real NACHA file generation is a separate slice — the bank will
 *  tell us their preferred upload format when the account is set
 *  up. For now this CSV is the lingua franca. */
export function buildAchCsvLine(item: DispatchItem, batchLabel: string): string {
  const amount = (Math.max(0, item.total_cents) / 100).toFixed(2);
  const handle = item.method_handle ?? '';
  // CSV-safe — quote any field that contains a comma or quote.
  const q = (s: string) => /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return [
    q(item.user_email),
    q(item.user_name ?? ''),
    q(handle),
    amount,
    q(buildPayoutNote(batchLabel, item)),
  ].join(',');
}

/** Pure helper — wrap the CSV with the header row PNC's import
 *  expects. Returns the full CSV body as a string. */
export function buildAchCsv(
  items: ReadonlyArray<DispatchItem>,
  batchLabel: string,
): string {
  const header = ['email', 'name', 'account', 'amount', 'memo'].join(',');
  const rows = items.map((i) => buildAchCsvLine(i, batchLabel));
  return [header, ...rows].join('\n');
}
