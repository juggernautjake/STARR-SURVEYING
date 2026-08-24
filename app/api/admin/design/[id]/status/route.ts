// app/api/admin/design/[id]/status/route.ts — promote, demote, retire.
//
//   POST /api/admin/design/:id/status { status }  → { design, demoted }
//
// Phase S of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"Once it has been saved, we will choose to make it active, or leave it as an alternative,
// or a theme linked to the active page or an alternative page, or it will be saved as a
// draft/page under construction/work in progress."*
//
// Activation is one call rather than "demote the old one, then promote the new one" from the
// client, because the two-call version has a window in which a route has no active design, and the
// failure mode of the second call is a page with no record of what it is supposed to be.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { setDesignStatus } from '@/lib/design/server';
import { STATUS_RULES, type DesignStatus } from '@/lib/design/lifecycle';

export const POST = withErrorHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDeveloper(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null) as { status?: string } | null;
  const next = body?.status as DesignStatus | undefined;
  if (!next || !STATUS_RULES[next]) {
    return NextResponse.json(
      { error: `Status must be one of: ${Object.keys(STATUS_RULES).join(', ')}.` },
      { status: 400 },
    );
  }
  // A default is written by the tracer and by nothing else. Letting a person mark a hand-built
  // design as "default" would put an opinion where the evidence is supposed to be.
  if (next === 'default') {
    return NextResponse.json(
      { error: 'A default is traced from the live page, not chosen. Re-trace the page instead.' },
      { status: 400 },
    );
  }

  try {
    const result = await setDesignStatus(params.id, next, session.user.email, new Date().toISOString());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not change the status.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
