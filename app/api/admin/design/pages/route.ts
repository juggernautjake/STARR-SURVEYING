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

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { joinPages, progressOf, isReviewStatus, type PageReview } from '@/lib/design/pages';
import PAGES from '@/lib/design/pages.generated.json';

const TABLE = 'design_page_reviews';

/**
 * Which routes have a default older than the page it claims to record — S3 of
 * docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
 *
 * Owner: *"we need all of the changes that we are making to be reflected there too."* The gap this
 * closes is not "there is no record" — the list already says that loudly. It is "the record is
 * OLDER than the thing it records", which looks completely fine until somebody relies on it. Every
 * consolidation slice creates a few of these.
 *
 * ── WHY GIT AND NOT mtime ──────────────────────────────────────────────────────────────────────
 *
 * The first version used `fs.statSync().mtimeMs`, and it reported 50 of 138 admin routes stale
 * within minutes of the defaults being traced. mtime records when the FILE was written, not when
 * the page changed — a branch checkout, a rebase or a formatting pass rewrites it, and this
 * repository does all three daily. A queue that is 36% false is one people stop opening, which
 * makes it worse than no queue: the real stale entries are still in there, now camouflaged.
 *
 * The last COMMIT that touched the file is the honest signal, and it costs one `git log` for the
 * whole tree — measured at ~0.1s, against 138 `stat` calls for a worse answer.
 *
 * Falls back to mtime when git is unavailable (a deployed container with no `.git`). Noisy is
 * better than absent for this, and the fallback direction is safe: it over-reports, and a page
 * flagged stale that is not costs one re-trace, while a page silently stale costs a decision made
 * on a wrong record.
 */
function lastCommitByFile(): Map<string, number> | null {
  try {
    // One pass. `--name-only` prints the commit date then the files it touched, so the FIRST time
    // a path appears is its most recent change — git walks newest-first.
    const out = execFileSync(
      'git',
      ['log', '--format=%cI', '--name-only', '--', 'app/admin'],
      { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15_000 },
    );
    const byFile = new Map<string, number>();
    let when = 0;
    for (const line of out.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (/^\d{4}-\d{2}-\d{2}T/.test(t)) { when = Date.parse(t); continue; }
      if (!byFile.has(t) && Number.isFinite(when)) byFile.set(t, when);
    }
    return byFile.size ? byFile : null;
  } catch {
    return null;
  }
}

function staleDefaultRoutes(tracedAt: Map<string, string>): Set<string> {
  const stale = new Set<string>();
  const commits = lastCommitByFile();
  const routes = (PAGES as { routes: Array<{ route: string; file: string }> }).routes;
  for (const page of routes) {
    const traced = tracedAt.get(page.route);
    if (!traced) continue;
    const tracedMs = Date.parse(traced);
    if (!Number.isFinite(tracedMs)) continue;
    // `file` is the route's DIRECTORY; the page itself is what renders.
    const rel = `${page.file}/page.tsx`;
    const changedMs = commits?.get(rel) ?? (() => {
      try { return fs.statSync(path.join(process.cwd(), rel)).mtimeMs; } catch { return null; }
    })();
    if (changedMs !== null && changedMs !== undefined && changedMs > tracedMs) stale.add(page.route);
  }
  return stale;
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
    supabaseAdmin.from('design_mockups').select('id, name, route, status, locked, traced_at').is('deleted_at', null),
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
    staleDefaultRoutes(new Map(
      ((designs ?? []) as Array<Record<string, unknown>>)
        .filter((d) => d.status === 'default' && typeof d.traced_at === 'string' && d.route)
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
