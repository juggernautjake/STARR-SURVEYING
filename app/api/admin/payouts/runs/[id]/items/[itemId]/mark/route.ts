// app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts
//
// P13 of payment-infrastructure-2026-06-18.md — per-line item state
// machine. The dispatch page calls this to flip an item between
// pending / sent / paid / failed as the office works the list.
//
//   POST  /api/admin/payouts/runs/{id}/items/{itemId}/mark
//     body: {
//       status: 'sent' | 'paid' | 'failed' | 'pending',
//       external_ref?: string,
//       failure_reason?: string,
//     }
//
// The state change itself — attempted_at / paid_at stamping, the once-only `account` credit (H-11),
// and rolling the batch header forward — lives in lib/payouts/mark-item.ts since 2026-10-11, so
// Commit and the PayPal sync change a line exactly the way this button does.
//
// Guard: the batch must be in `approved` or `dispatched` status —
// you can't mark items on a draft / voided batch.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { markPayoutItem } from '@/lib/payouts/mark-item';
import type { PayoutItemStatus } from '@/lib/payouts/dispatch';

const ALLOWED: PayoutItemStatus[] = ['sent', 'paid', 'failed', 'pending'];

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // …/runs/<id>/items/<itemId>/mark — mark is last, itemId is -2, id is -4.
  const itemId = segments[segments.length - 2];
  const batchId = segments[segments.length - 4];
  if (!itemId || !batchId) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: PayoutItemStatus;
    external_ref?: string;
    failure_reason?: string;
  };
  if (!body.status || !(ALLOWED as string[]).includes(body.status)) {
    return NextResponse.json({ error: 'Unsupported status' }, { status: 400 });
  }

  const r = await markPayoutItem(batchId, itemId, {
    status: body.status,
    external_ref: body.external_ref ?? null,
    failure_reason: body.failure_reason ?? null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 500 });
  return NextResponse.json({ item_status: r.item_status, batch_status: r.batch_status });
});
