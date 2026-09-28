// app/api/admin/files/bulk-restore/route.ts
//
// POST /api/admin/files/bulk-restore   { targets: [{ kind, id }, …] }
//
// The Undo behind the "Deleted 3 files · Undo" toast. Only kinds whose delete is soft can come back
// (File Explorer nodes → the bin; job files → their is_deleted flag); anything else is reported per
// item as not restorable. Same per-item permission checks as the delete.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { parseTargets, runBulk, summarise, batchStatus } from '@/lib/files/bulk-delete';
import { DELETE_HANDLERS } from '@/lib/files/delete-handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = parseTargets(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const actor = { email: session.user.email, roles: session.user.roles ?? [], admin: isAdmin(session.user.roles) };
  const results = await runBulk('restore', parsed.targets, actor, DELETE_HANDLERS);
  const summary = summarise('restore', results);
  return NextResponse.json({ results, ...summary }, { status: batchStatus(results) });
}
