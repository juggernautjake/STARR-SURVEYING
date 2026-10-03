// app/api/admin/files/bulk-delete/route.ts
//
// POST /api/admin/files/bulk-delete   { targets: [{ kind, id }, …] }   (≤ 200 items)
//
// Owner, 2026-09-27: *"make sure with the view and download buttons that there is a delete button as
// well. We should also be able to just do a selection of the images and delete groups of images."*
//
// One route for every Delete button and every "3 selected → Delete". Each item is checked and
// deleted by its kind's handler (lib/files/delete-handlers.ts) — the permission check is on the
// SERVER, per item — and one failure never stops the rest. The answer lists every item:
//
//   200  all deleted            207  some failed (see results[].error)
//   403  none allowed           400  malformed request
//
// `restorable: true` on an item means the Undo (…/bulk-restore) can bring it back.

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
  const results = await runBulk('delete', parsed.targets, actor, DELETE_HANDLERS);
  const summary = summarise('delete', results);
  return NextResponse.json({ results, ...summary }, { status: batchStatus(results) });
}
