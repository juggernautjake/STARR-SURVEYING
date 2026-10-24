// app/api/admin/payouts/runs/[id]/commit/route.ts — "Commit payout".
//
//   GET   → what Commit would do: every line grouped by how it goes out, and anything that would be held.
//   POST  → approve (if a draft) and send every line its own way. Safe to press again — see lib/payouts/commit.ts.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { canApprovePayoutBatch, extractRequestIp } from '@/lib/payouts/approval';
import { commitBatch, previewCommit } from '@/lib/payouts/commit';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await previewCommit(params.id));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email || !canApprovePayoutBatch(session.user, isAdmin)) {
    return NextResponse.json({ error: 'Only a payout admin can commit a payout.' }, { status: 403 });
  }
  const result = await commitBatch(params.id, { actor: session.user.email, canApprove: true, ip: extractRequestIp(req.headers) });
  return NextResponse.json(result, { status: result.groups.length === 0 && !result.ok ? 409 : 200 });
}
