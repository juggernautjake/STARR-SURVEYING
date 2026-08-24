// app/api/admin/me/design-themes/route.ts — the designer themes I am allowed to choose.
//
//   GET /api/admin/me/design-themes → { themes: [{ id, name, palette, fromRoute, … }] }
//
// Phase T3 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// ── WHY THIS IS UNDER /me AND NOT UNDER /design ─────────────────────────────────────────────────
//
// Every other design endpoint is gated to developers, because the Page Designer exposes the whole
// app's structure and a half-finished mockup on a foreman's screen would read as a promise. This
// one is different in kind: it is the list of themes a PERSON may pick for their own portal, which
// is a personal setting like density or text size. Gating it to developers would mean the themes
// were built for everybody and offered to nobody.
//
// What it returns is deliberately thin — a name and fourteen colours. No design ids to open, no
// routes to browse, nothing about what is in the mockups. A person choosing a colour scheme does
// not need, and should not receive, the design system's inventory.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { paletteFromTokens, selectableDesignerThemes } from '@/lib/design/portal-themes';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const themes = await selectableDesignerThemes();
    return NextResponse.json({
      themes: themes.map((t) => ({
        id: t.id,
        name: t.name,
        palette: paletteFromTokens(t.tokens),
        // Said so the picker can explain why this theme is on offer at all: it belongs to the
        // design of record for a page. Without it, a designer theme in this list is a mystery
        // entry that appeared one day.
        fromRoute: t.fromRoute,
        fromDesign: t.fromDesign.name,
      })),
    });
  } catch (err) {
    // A themes list that cannot be read is not worth an error page — the built-ins are still there
    // and the picker degrades to exactly what it was before this existed.
    console.error('[design themes] could not be listed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ themes: [] });
  }
});
