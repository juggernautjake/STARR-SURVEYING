// app/api/admin/research/[projectId]/offers/preview/route.ts — the first page, as a thumbnail.
//
// Owner, 2026-09-21: "We should take a screenshot of the first page of the document if we can and
// use it as a thumbnail."
//
// A thumbnail is what makes an offer honest. TexasFile gives image previews away and charges only
// for the downloadable PDF, so a surveyor can see whether it is the plat they want before spending
// — instead of buying a line of text that says DEED and finding out afterwards.
//
// ── WHY A ROUTE AND NOT A PUBLIC URL ────────────────────────────────────────────────────────────
//
// The `research-documents` bucket is private. The purchased pages are served from public URLs
// because `uploadDocumentIncremental` asks for them; a preview of something nobody has bought is
// different, and a signed URL that expires is the right shape for an image on an internal page.
//
// ── THE PATH GUARD IS THE POINT ─────────────────────────────────────────────────────────────────
//
// The path arrives in a query string, which means it arrives from the browser, which means it can
// say anything. Without the prefix check below this endpoint signs a URL for ANY object in the
// bucket to any signed-in user — every other project's documents included. The check is not
// defence in depth; it is the whole of the defence.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { pathBelongsToProject } from '@/lib/research/offers';

export const dynamic = 'force-dynamic';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const path = req.nextUrl.searchParams.get('path') ?? '';
  if (!pathBelongsToProject(path, projectId)) {
    return NextResponse.json({ error: 'Not a preview for this project.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from(RESEARCH_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 600);

  if (error || !data?.signedUrl) {
    // A missing thumbnail is not worth an error page — the panel falls back to a document glyph.
    return NextResponse.json({ error: 'No preview' }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, 302);
});
