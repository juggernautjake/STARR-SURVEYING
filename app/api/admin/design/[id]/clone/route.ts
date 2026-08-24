// app/api/admin/design/[id]/clone/route.ts — copy a design into something you can edit.
//
//   POST /api/admin/design/:id/clone { name?, asThemeSibling?, themeId? }  → { design }
//
// Phases B + K of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"we should never be able to change the default page for any page itself, but we should be
// able to clone it and change the clone"*, and *"if we make an alternative of the page, then it
// will create a new version that looks the same that we can then edit and change up and save."*
//
// ── TWO KINDS OF CLONE, AND THE DIFFERENCE MATTERS DOWNSTREAM ───────────────────────────────────
//
// A plain clone starts a new lineage: a different layout for the same page.
//
// A THEME SIBLING (`asThemeSibling`) is the same layout wearing different colours, and joins the
// source's theme group. That distinction is what lets the settings picker offer "this page, in
// these themes" — a re-skin belongs in the group, a re-layout does not, and guessing from the
// contents afterwards is not possible.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { cloneMockup } from '@/lib/design/server';

export const POST = withErrorHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDeveloper(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    name?: string; asThemeSibling?: boolean; themeId?: string | null;
  };

  try {
    const { document, summary } = await cloneMockup(params.id, session.user.email, new Date().toISOString(), {
      name: body.name,
      asThemeSibling: !!body.asThemeSibling,
      themeId: body.themeId ?? null,
    });
    return NextResponse.json({ design: summary, doc: document });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not clone that design.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
