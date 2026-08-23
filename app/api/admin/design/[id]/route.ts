// app/api/admin/design/[id]/route.ts — one mockup: open it, or throw it away.
//
//   GET    /api/admin/design/<id> → { doc }
//   DELETE /api/admin/design/<id> → { ok: true }   (soft — `deleted_at`, so it can come back)
//
// Saving goes through POST /api/admin/design rather than PUT here, because the server assigns the
// version and the create and the save are then genuinely the same operation.

import { NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getMockup, deleteMockup } from '@/lib/design/server';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isDeveloper(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async (_req: Request, { params }: { params: { id: string } }) => {
  const { error } = await gate();
  if (error) return error;

  const doc = await getMockup(params.id);
  if (!doc) return NextResponse.json({ error: 'That design does not exist.' }, { status: 404 });
  return NextResponse.json({ doc });
});

export const DELETE = withErrorHandler(async (_req: Request, { params }: { params: { id: string } }) => {
  const { error } = await gate();
  if (error) return error;

  await deleteMockup(params.id, new Date().toISOString());
  return NextResponse.json({ ok: true });
});
