// app/api/design/composition/route.ts — which composition the signed-in viewer gets.
//
//   GET /api/design/composition?route=/admin/receipts&state=queue → { composition | null }
//
// W4 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// ── WHY THIS LIVES UNDER /api/design AND NOT /api/admin/design ──────────────────────────────────
//
// Everything else in the design system is `/api/admin/design/*` and gated on `isDeveloper`, because
// it is a build tool: the catalogue, the tracer, the conformance sweep, the page list. Those are
// nobody's business but the two people who build this app.
//
// This one is different in kind. It is not read by the studio — it is read by a PORTAL, on behalf of
// whoever has that portal open, which is a field crew member or a bookkeeper. Gating it on developer
// would mean compositions serve only to developers, which is the opposite of the point.
//
// ── WHAT IT WILL AND WILL NOT TELL YOU ──────────────────────────────────────────────────────────
//
// The answer is about the CALLER and cannot be asked about anybody else: the viewer comes from the
// session, never from a parameter. Without that, `?as=someone@else` would be a way to read the
// layout somebody built for themselves — small, but it is a permission check that would only exist
// by accident of nobody having tried.
//
// And it returns `{ composition: null }` with a 200 for "nothing applies", which is the common case
// and not an error. A 404 there would make every portal's console noisy for the normal state of the
// world, and noise is how a real 404 gets ignored.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { compositionFor, viewerFrom } from '@/lib/design/composition-server';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const route = req.nextUrl.searchParams.get('route');
  if (!route?.startsWith('/')) {
    return NextResponse.json({ error: 'Which route?' }, { status: 400 });
  }
  const state = req.nextUrl.searchParams.get('state') ?? '';

  const composition = await compositionFor(route, state, viewerFrom(session));
  return NextResponse.json({ composition });
});
