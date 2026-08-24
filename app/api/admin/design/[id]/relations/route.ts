// app/api/admin/design/[id]/relations/route.ts — where this came from, and what it is a theme of.
//
//   GET  /api/admin/design/:id/relations                        → { design, parent, children, themeSiblings, routeSiblings }
//   POST /api/admin/design/:id/relations { groupWith | null }    → { design, group }
//   PUT  /api/admin/design/:id/relations { theme }               → { doc }   re-theme in place
//
// Phases B3, K2 and K3 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// ── WHY RE-THEMING IS A DIFFERENT VERB FROM SAVING ──────────────────────────────────────────────
//
// A save writes whatever the editor is holding, elements included. A re-theme writes ONLY the token
// map, and the elements are read from the row and put back untouched. That distinction is the whole
// promise of a theme family: *"a theme sibling shares elements, not copies of them. Otherwise
// 'change the colours' becomes 'rebuild the page'."* Routing it through the ordinary save would
// make that promise depend on the client sending back exactly what it was given.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { designRelations, retheme, setThemeGroup } from '@/lib/design/server';
import type { DesignTheme } from '@/lib/design/document';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isDeveloper(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const { error } = await gate();
  if (error) return error;

  const relations = await designRelations(params.id);
  if (!relations) return NextResponse.json({ error: 'That design does not exist.' }, { status: 404 });
  return NextResponse.json(relations);
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { error } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as { groupWith?: string | null } | null;
  try {
    const result = await setThemeGroup(params.id, body?.groupWith ?? null, new Date().toISOString());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not link those.' }, { status: 400 });
  }
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as { theme?: DesignTheme | null } | null;
  const theme = body?.theme ?? null;
  if (theme && (!theme.id || !theme.tokens || typeof theme.tokens !== 'object')) {
    return NextResponse.json({ error: 'A theme needs an id and a token map.' }, { status: 400 });
  }

  try {
    const doc = await retheme(params.id, theme, email!, new Date().toISOString());
    return NextResponse.json({ doc });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not re-theme that design.';
    // A locked default refuses here for the same reason it refuses a save: it is a record of what
    // is served, and a re-themed record is a record of nothing.
    if (message.startsWith('LOCKED:')) {
      return NextResponse.json({ error: message.replace(/^LOCKED:\s*/, ''), locked: true }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
