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
import PAGES from '@/lib/design/pages.generated.json';
import { staleRoutes } from '@/lib/design/staleness';

const TABLE = 'design_page_reviews';

/**
 * Which routes have a default older than the page it claims to record — S3.
 *
 * The RULE lives in `lib/design/staleness.ts` because three other callers need the same answer:
 * the tracer, the deriver and the conformance sweep all take `--stale`, and a queue that showed
 * work the tool emptying it could not see would be the design-conformance defect again — two
 * copies of one rule, disagreeing, with a number that looked like evidence.
 */
function staleDefaultRoutes(tracedAt: Map<string, string>): Set<string> {
  return staleRoutes(
    (PAGES as { routes: Array<{ route: string; file: string }> }).routes,
    tracedAt,
  );
}
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
    supabaseAdmin.from('design_mockups').select('id, name, route, state_key, status, locked, traced_at').is('deleted_at', null),
    // `state_key` is not optional here — see the mapping below. Left out of the SELECT, every one
    // of a route's dossiers arrives claiming to be the route's own.
    supabaseAdmin.from('design_page_dossiers').select('route, state_key, purpose, summary, element_count, states'),
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
    ((designs ?? []) as Array<Record<string, unknown>>).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      route: (d.route as string | null) ?? null,
      status: d.status as string | undefined,
      locked: d.locked as boolean | undefined,
      // snake_case column → camelCase field. The `--stale` filter matched nothing for exactly this
      // reason three slices ago; the summary shape and the column name are not the same thing.
      stateKey: (d.state_key as string | undefined) ?? '',
      // ── `counts` IS DELIBERATELY ABSENT, AND THE `lopsided-default` GAP IS INERT BECAUSE OF IT ──
      //
      // `joinPages` accepts `counts: { desktop, mobile }` and derives the sixth gap from it — the
      // only gap about a record being WRONG rather than missing. Nothing here supplies it, so that
      // gap can never fire on any page.
      //
      // Not an oversight to be patched by adding a field: the counts live inside `views`, and the
      // SELECT above omits `views` ON PURPOSE — see the note at the query, `element_count` exists as
      // a column precisely so 270 rows of element inventory are not dragged into a list page. Adding
      // `views` here would trade a real, measured page-load regression for a chip.
      //
      // Two honest ways to finish it, both bigger than a mapping line:
      //   · a generated/stored count column on `design_mockups` (a seed, applied to the live DB), or
      //   · a second narrow aggregate query keyed by id, joined in like the dossiers are.
      //
      // Left inert and SAID SO rather than left looking done — and deferred on a measurement, not a
      // shrug: **194 defaults in the table, 0 of them lopsided.** The chip would show an empty queue,
      // and the creation path is already closed, because `recaptureIfLopsided` re-takes the short
      // viewport before storing through the same module. A live schema migration to display a zero
      // is the wrong trade. The moment anything here supplies `counts`, the gap works.
    })),
    ((dossiers ?? []) as Array<Record<string, unknown>>).map((d) => ({
      route: d.route as string,
      // ── THE SAME snake_case → camelCase SEAM, FOR THE FIFTH TIME (V6) ────────────────────────
      //
      // The designs above already carry this comment because the `--stale` filter matched nothing
      // for exactly this reason. This is the same line one field over, and getting it wrong here
      // would have been quieter: every dossier of `/admin/settings` would arrive as `stateKey: ''`,
      // the Map in `joinPages` would keep whichever came last, and the page would report one of its
      // tabs' element counts as its own. No error, no empty — just a wrong number.
      stateKey: (d.state_key as string | undefined) ?? '',
      purpose: (d.purpose as string | null) ?? null,
      summary: (d.summary as string | null) ?? null,
      elementCount: (d.element_count as number | null) ?? 0,
      states: (d.states as Array<{ key: string; label: string; kind: string }> | null) ?? [],
    })),
    staleDefaultRoutes(new Map(
      ((designs ?? []) as Array<Record<string, unknown>>)
        // The ROUTE's own default, not a tab's. A tabbed route has several defaults and this Map is
        // keyed on the route, so without the state filter the row's "traced before the page
        // changed" chip would be computed from whichever tab came last out of the database — a
        // stale-or-not verdict about one page, decided by a different page's timestamp.
        .filter((d) => d.status === 'default' && !d.state_key && typeof d.traced_at === 'string' && d.route)
        .map((d) => [d.route as string, d.traced_at as string]),
    )),
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
