// app/api/admin/payouts/checks/[checkId]/route.ts — void a check (and reissue on a new number).
//
//   POST { action: 'void', reason, reissue?: boolean }

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { voidCheck } from '@/lib/payouts/checks-server';

export async function POST(req: NextRequest, { params }: { params: { checkId: string } }) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string; reissue?: boolean };
  if (body.action !== 'void') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  if (!body.reason?.trim()) return NextResponse.json({ error: 'Say why the check is being voided.' }, { status: 400 });
  const r = await voidCheck(params.checkId, session.user.email, body.reason.trim(), body.reissue === true);
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
