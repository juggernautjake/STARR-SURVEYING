// lib/payments/invoice-public.ts
//
// P4 of payment-infrastructure-2026-06-18.md — pure helpers used by
// the public invoice-lookup route. Lives in `lib/` so vitest can
// import them without dragging in the next-auth shell of the route
// file.

export interface LineItemPublic {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

/** Pure helper — strip line items down to the columns the customer
 *  sees on `/pay/[invoice]`. Anything that smells like an internal
 *  note is dropped. */
export function sanitizeLineItems(raw: unknown): LineItemPublic[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object')
    .map((row) => ({
      description: typeof row.description === 'string' ? row.description : '',
      quantity: typeof row.quantity === 'number' ? row.quantity : 1,
      unit_price_cents: typeof row.unit_price_cents === 'number' ? row.unit_price_cents : 0,
      total_cents: typeof row.total_cents === 'number' ? row.total_cents : 0,
    }));
}

/** Pure helper — total paid against an invoice from its payments
 *  array (only `succeeded` rows count toward balance). */
export function sumSucceededPayments(
  payments: ReadonlyArray<{ amount_cents?: number; status?: string }>,
): number {
  return payments
    .filter((p) => p.status === 'succeeded')
    .reduce((acc, p) => acc + (typeof p.amount_cents === 'number' ? p.amount_cents : 0), 0);
}

export const PUBLIC_BLOCKED_STATUSES: ReadonlySet<string> = new Set(['draft', 'voided']);
