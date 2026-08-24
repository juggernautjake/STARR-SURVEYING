// app/api/admin/design/versions/route.ts — whole alternative versions of the site.
//
//   GET    /api/admin/design/versions            → { versions }
//   GET    /api/admin/design/versions?id=sv-…    → { version, members, plan }
//   POST   /api/admin/design/versions { name, description?, themeId? } → { version }
//   PUT    /api/admin/design/versions { versionId, designId, action: 'add'|'remove' } → { ok }
//   PATCH  /api/admin/design/versions { versionId, overrides?, dryRun? } → publish (or plan)
//
// Phase V of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// PATCH takes `dryRun` because publishing is the one action here that changes many pages at once,
// and the plan and the publish must be produced by the SAME code — a preview computed by a second
// implementation is a preview that can be wrong about the thing it exists to prevent.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  addMember, createSiteVersion, getSiteVersion, listSiteVersions,
  planPublish, publishSiteVersion, removeMember,
} from '@/lib/design/site-versions';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isDeveloper(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { error } = await gate();
  if (error) return error;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ versions: await listSiteVersions() });

  const loaded = await getSiteVersion(id);
  if (!loaded) return NextResponse.json({ error: 'That version does not exist.' }, { status: 404 });
  // The plan travels with the version: the question anybody opening one asks is "what happens if I
  // publish this", and answering it in a second round trip means the page renders without it.
  const plan = await planPublish(id);
  return NextResponse.json({ ...loaded, plan });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as { name?: string; description?: string; themeId?: string } | null;
  if (!body?.name?.trim()) return NextResponse.json({ error: 'A version needs a name.' }, { status: 400 });

  try {
    const version = await createSiteVersion(
      { name: body.name, description: body.description, themeId: body.themeId },
      email!,
      new Date().toISOString(),
    );
    return NextResponse.json({ version });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not create that.' }, { status: 400 });
  }
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const { error } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as {
    versionId?: string; designId?: string; action?: 'add' | 'remove';
  } | null;
  if (!body?.versionId || !body.designId) {
    return NextResponse.json({ error: 'Which version, and which design?' }, { status: 400 });
  }

  try {
    if (body.action === 'remove') await removeMember(body.versionId, body.designId);
    else await addMember(body.versionId, body.designId, new Date().toISOString());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not change that.' }, { status: 400 });
  }
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as {
    versionId?: string; overrides?: string[]; dryRun?: boolean;
  } | null;
  if (!body?.versionId) return NextResponse.json({ error: 'Which version?' }, { status: 400 });

  try {
    if (body.dryRun) return NextResponse.json({ plan: await planPublish(body.versionId) });
    const result = await publishSiteVersion(
      body.versionId,
      email!,
      new Date().toISOString(),
      { overrides: body.overrides },
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not publish that.' }, { status: 400 });
  }
});
