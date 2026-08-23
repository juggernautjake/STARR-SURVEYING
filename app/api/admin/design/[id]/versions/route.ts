// app/api/admin/design/[id]/versions/route.ts — what this design used to look like.
//
//   GET  /api/admin/design/<id>/versions              → { versions: VersionSummary[] }
//   POST /api/admin/design/<id>/versions { version }  → { doc }   (restore, forward)
//
// Restoring writes the old views as a NEW version rather than deleting the ones after it — see
// `restoreVersion`. "I restored v3 to look at it and lost v4 through v9" must not be reachable.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { listVersions, restoreVersion } from '@/lib/design/server';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isDeveloper(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const { error } = await gate();
  if (error) return error;
  return NextResponse.json({ versions: await listVersions(params.id) });
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as { version?: number } | null;
  if (typeof body?.version !== 'number') {
    return NextResponse.json({ error: 'Which version?' }, { status: 400 });
  }

  const doc = await restoreVersion(params.id, body.version, email!, new Date().toISOString());
  if (!doc) return NextResponse.json({ error: 'That version does not exist.' }, { status: 404 });
  return NextResponse.json({ doc });
});
