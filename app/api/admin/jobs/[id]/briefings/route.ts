// app/api/admin/jobs/[id]/briefings/route.ts — slice B3 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
//   GET  → the job's briefings. Published ones for everyone on the job; your own drafts as well.
//   POST → start a draft. Nobody is notified and nobody else can see it (see B5 for publishing).
//
// A draft is created BEFORE the recording is uploaded, because the upload needs a briefing id to be
// filed under. That is why "start a briefing" is a button that appears to do nothing — it is making
// the folder the video will land in.
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { bucketForKind } from '@/lib/jobs/briefings';

export const runtime = 'nodejs';

interface RouteContext { params: Promise<{ id: string }> }

const COLS = 'id, job_id, author_email, title, body, state, published_at, created_at, updated_at';

/** Long enough to watch a forty-minute walkthrough without the URL expiring mid-play, which
 *  presents as the video freezing rather than as an error anybody could act on. */
const PLAYBACK_URL_TTL_SEC = 60 * 60 * 4;

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: jobId } = await ctx.params;
  const me = session.user.email;

  const { data, error } = await supabaseAdmin
    .from('job_briefings')
    .select(COLS)
    .eq('job_id', jobId)
    // Published, or mine. A draft belongs to the person assembling it — that is the whole point of
    // being able to work on it over a morning before anyone sees it.
    .or(`state.eq.published,author_email.eq.${me}`)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (data ?? []).map((b: Record<string, unknown>) => (b as { id: string }).id);
  const { data: items } = ids.length
    ? await supabaseAdmin
        .from('job_briefing_items')
        .select('id, briefing_id, kind, job_file_id, note_text, duration_seconds, added_by, added_at, sort_order')
        .in('briefing_id', ids)
        .order('sort_order', { ascending: true })
    : { data: [] as unknown[] };

  interface ItemRow {
    briefing_id: string; kind: string; job_file_id: string | null;
    added_at: string; sort_order: number;
  }
  const rows = (items ?? []) as ItemRow[];

  // ── the bytes ────────────────────────────────────────────────────────────────────────────────
  //
  // Items point at `job_files` (D4) and `job_files` holds a `storage_path`, not a URL — the bucket
  // is private, which is the point. So playback needs a signed URL, minted here rather than by a
  // second round-trip per item: a briefing with a video and eight photos would otherwise be nine
  // requests before anything renders.
  // The item's `kind` is what decides the bucket — a video is in `starr-field-videos` and a photo
  // is not — so the kind is carried alongside the id rather than guessed at signing time by trying
  // every bucket in turn. (That version worked and cost three storage round-trips per file.)
  const kindByFileId = new Map<string, string>();
  for (const r of rows) if (r.job_file_id) kindByFileId.set(r.job_file_id, r.kind);

  const fileIds = [...kindByFileId.keys()];
  const filesById = new Map<string, { file_name: string; storage_path: string | null; file_size_bytes: number | null; content_type: string | null; url: string | null }>();
  if (fileIds.length > 0) {
    const { data: files } = await supabaseAdmin
      .from('job_files')
      .select('id, file_name, storage_path, file_size_bytes, content_type, file_url')
      .in('id', fileIds);
    for (const f of (files ?? []) as Array<{ id: string; file_name: string; storage_path: string | null; file_size_bytes: number | null; content_type: string | null; file_url: string | null }>) {
      filesById.set(f.id, {
        file_name: f.file_name,
        storage_path: f.storage_path,
        file_size_bytes: f.file_size_bytes,
        content_type: f.content_type,
        // `file_url` is what the OLD upload path (post-the-bytes-to-a-route) writes. A briefing item
        // uploaded direct-to-storage has a `storage_path` instead. Both shapes are read because a
        // photo attached from the job's existing files is the first shape and the recording is the
        // second, and a viewer that handles only one renders half a briefing.
        url: f.file_url,
      });
    }
    await Promise.all(
      [...filesById.entries()].map(async ([fileId, f]) => {
        if (f.url || !f.storage_path) return;
        const bucket = bucketForKind(kindByFileId.get(fileId) ?? '');
        if (!bucket) return;
        const { data: signed } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(f.storage_path, PLAYBACK_URL_TTL_SEC);
        f.url = signed?.signedUrl ?? null;
      }),
    );
  }

  const byBriefing = new Map<string, unknown[]>();
  for (const it of rows) {
    const file = it.job_file_id ? filesById.get(it.job_file_id) : undefined;
    const list = byBriefing.get(it.briefing_id) ?? [];
    list.push({
      ...it,
      file_name: file?.file_name ?? null,
      file_size_bytes: file?.file_size_bytes ?? null,
      content_type: file?.content_type ?? null,
      url: file?.url ?? null,
      // Said explicitly rather than inferred from a null URL: a file whose bytes have gone renders
      // as a broken player, and "this attachment is missing" is a thing somebody can act on.
      missing: Boolean(it.job_file_id) && !file,
    });
    byBriefing.set(it.briefing_id, list);
  }

  return NextResponse.json({
    briefings: (data ?? []).map((b: Record<string, unknown>) => {
      const row = b as { id: string };
      return { ...row, items: byBriefing.get(row.id) ?? [] };
    }),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: jobId } = await ctx.params;

  const { data: job } = await supabaseAdmin.from('jobs').select('id, org_id').eq('id', jobId).maybeSingle();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const { data, error } = await supabaseAdmin
    .from('job_briefings')
    .insert({
      job_id: jobId,
      org_id: (job as { org_id: string | null }).org_id,
      author_email: session.user.email,
      title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null,
      body: typeof body.body === 'string' ? body.body : null,
      // Always a draft. There is no "create published" path: publishing is a separate, deliberate
      // act that notifies the job, and an endpoint that can do both in one call is an endpoint that
      // will eventually notify twelve people about an empty briefing.
      state: 'draft',
    })
    .select(COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ briefing: data });
}
