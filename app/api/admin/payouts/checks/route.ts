// app/api/admin/payouts/checks/route.ts — the check register: every number ever used, voids included.
//
//   GET → { checks }

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { listChecks } from '@/lib/payouts/checks-server';

export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ checks: await listChecks() });
}
