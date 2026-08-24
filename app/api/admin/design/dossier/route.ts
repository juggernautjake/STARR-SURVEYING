// app/api/admin/design/dossier/route.ts — what a page is for, read and written.
//
//   GET  /api/admin/design/dossier                  → { dossiers }        every page, list shape
//   GET  /api/admin/design/dossier?route=/admin/jobs → { dossier, rows, progress }
//   POST /api/admin/design/dossier { route, purpose?, summary?, audience? } → { dossier }
//
// Phase D of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// ── THIS ROUTE WRITES THE AUTHORED HALF AND ONLY THE AUTHORED HALF ──────────────────────────────
//
// The measured half arrives at `/dossier/derive`, from a browser walk. Two paths rather than one
// endpoint with a mode flag, because the failure this protects against is a re-derive quietly
// overwriting somebody's prose — and a mode flag is one typo away from exactly that.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getMockup } from '@/lib/design/server';
import { checklistFor, listDossiers, saveAuthored } from '@/lib/design/dossier-server';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isDeveloper(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { error } = await gate();
  if (error) return error;

  const route = req.nextUrl.searchParams.get('route');
  if (!route) return NextResponse.json({ dossiers: await listDossiers() });

  // The design is optional: the dossier is a fact about the ROUTE, and it is worth reading before
  // any design for that page exists — that is the point of B2, starting a design from a dossier.
  const designId = req.nextUrl.searchParams.get('design');
  const doc = designId ? await getMockup(designId) : null;
  const { dossier, rows, progress } = await checklistFor(route, designId, doc);
  return NextResponse.json({ dossier, rows, progress });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as {
    route?: string; purpose?: string; summary?: string; audience?: string;
  } | null;
  if (!body?.route) return NextResponse.json({ error: 'Which page?' }, { status: 400 });

  const dossier = await saveAuthored(
    body.route,
    { purpose: body.purpose, summary: body.summary, audience: body.audience },
    email!,
    new Date().toISOString(),
  );
  return NextResponse.json({ dossier });
});
