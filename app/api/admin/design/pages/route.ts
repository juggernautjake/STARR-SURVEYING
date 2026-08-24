// app/api/admin/design/pages/route.ts — the page walkthrough list, and ticking a page off.
//
//   GET  /api/admin/design/pages                          → { pages, progress }
//   POST /api/admin/design/pages { route, status?, note? } → { page }
//
// Phase C of docs/planning/completed/DESIGN_STUDIO_QUALITY_2026-08-23.md.
//
// The inventory is a committed JSON file generated from the filesystem; the status comes from the
// database. Joining them here rather than in the browser means the list arrives complete and the
// client never has to know that the two halves come from different places.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { joinPages, progressOf, isReviewStatus, type PageReview } from '@/lib/design/pages';

const TABLE = 'design_page_reviews';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isDeveloper(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async () => {
  const { error } = await gate();
  if (error) return error;

  // The dossier joins in here rather than being fetched per row: the list shows what each page is
  // FOR and what is still missing about it, and 270 rows × one request each is the shape that makes
  // a list page feel broken. `element_count` is a column for exactly this reason — the element
  // inventory itself is never rendered here.
  const [{ data: reviews }, { data: designs }, { data: dossiers }] = await Promise.all([
    supabaseAdmin.from(TABLE).select('route, status, note, updated_by, updated_at'),
    supabaseAdmin.from('design_mockups').select('id, name, route, status, locked').is('deleted_at', null),
    supabaseAdmin.from('design_page_dossiers').select('route, purpose, summary, element_count'),
  ]);

  const mapped: PageReview[] = ((reviews ?? []) as Array<Record<string, unknown>>).map((r) => ({
    route: r.route as string,
    status: (r.status as PageReview['status']) ?? 'not_started',
    note: (r.note as string | null) ?? null,
    updatedBy: (r.updated_by as string | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
  }));

  const pages = joinPages(
    mapped,
    (designs ?? []) as Array<{ id: string; name: string; route: string | null; status?: string; locked?: boolean }>,
    ((dossiers ?? []) as Array<Record<string, unknown>>).map((d) => ({
      route: d.route as string,
      purpose: (d.purpose as string | null) ?? null,
      summary: (d.summary as string | null) ?? null,
      elementCount: (d.element_count as number | null) ?? 0,
    })),
  );
  return NextResponse.json({ pages, progress: progressOf(pages) });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as { route?: string; status?: string; note?: string } | null;
  if (!body?.route) return NextResponse.json({ error: 'Which page?' }, { status: 400 });
  if (body.status !== undefined && !isReviewStatus(body.status)) {
    return NextResponse.json({ error: `Unknown status "${body.status}".` }, { status: 400 });
  }

  // Upsert: a page has no row until somebody touches it, and an untouched page reads as
  // `not_started` from the inventory alone. That keeps 270 empty rows out of the table.
  const patch: Record<string, unknown> = { route: body.route, updated_by: email, updated_at: new Date().toISOString() };
  if (body.status !== undefined) patch.status = body.status;
  if (body.note !== undefined) patch.note = body.note.trim() || null;

  const { data, error: writeError } = await supabaseAdmin
    .from(TABLE)
    .upsert(patch, { onConflict: 'route' })
    .select('route, status, note, updated_by, updated_at')
    .maybeSingle();
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });

  return NextResponse.json({ page: data });
});
