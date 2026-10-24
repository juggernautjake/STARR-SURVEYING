// app/api/admin/payouts/runs/[id]/sync/route.ts — pull Venmo (PayPal) statuses back and settle lines.
//
//   POST → { updated, error? }. Safe to call any time; the dispatch page calls it when it opens.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { syncProviderStatuses } from '@/lib/payouts/commit';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await syncProviderStatuses(params.id));
}
