// app/api/admin/jobs/[id]/briefings/[briefingId]/items/route.ts — slice B3.
//
// Called after the browser has PUT the bytes to storage. Registers the object as a `job_files` row
// AND as a briefing item, in that order.
//
// ── WHY IT IS A job_files ROW AND NOT JUST A BRIEFING ITEM ──────────────────────────────────────
//
// D4 of the plan: a briefing is a view over job artefacts, never a second place files live. A video
// posted in a briefing has to appear in the job folder and in the file manager, for the person who
// never opens the briefing and just wants "everything on this job". Registering it here is what
// makes the owner's *"fully integrated with the file management system"* true rather than adjacent.
//
// A note is the one item with no file, which is why the payload check in seed 592 exists.
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { bucketForKind } from '@/lib/jobs/briefings';
import { notifyJobEvent } from '@/lib/notifications/job-event';

export const runtime = 'nodejs';

interface RouteContext { params: Promise<{ id: string; briefingId: string }> }

/**
 * Tell the job something was added — but only if the briefing is already published (B6/D5).
 *
 * Adding the fourth photo to a *draft* nobody can see is not an event. Adding one to a published
 * briefing is, and it goes out at `low`: the person who uploads four photos would otherwise send
 * four full-volume alerts, and a team that gets four alerts about one afternoon learns to swipe all
 * of them away — including the publish that matters.
 */
async function notifyAppend(
  jobId: string, briefingId: string, state: string, title: string | null,
  what: string, actor: string,
): Promise<void> {
  if (state !== 'published') return;
  await notifyJobEvent(jobId, {
    kind: 'briefing_appended',
    title: `${what} added to the briefing — ${title ?? 'untitled'}`,
    link: `/admin/jobs/${jobId}?tab=briefings&briefing=${briefingId}`,
    escalation: 'low',
  }, actor);
}

const WHAT: Record<string, string> = { video: 'A recording', photo: 'A photo', file: 'A file', note: 'A note' };

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: jobId, briefingId } = await ctx.params;

  const { data: briefing } = await supabaseAdmin
    .from('job_briefings').select('id, job_id, org_id, author_email, state, title').eq('id', briefingId).maybeSingle();
  if (!briefing || (briefing as { job_id: string }).job_id !== jobId) {
    return NextResponse.json({ error: 'Briefing not found on this job.' }, { status: 404 });
  }
  if ((briefing as { author_email: string }).author_email !== session.user.email) {
    return NextResponse.json({ error: 'Only the person who started this briefing can add to it.' }, { status: 403 });
  }
  const { state: briefingState, title: briefingTitle } =
    briefing as { state: string; title: string | null };

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const kind = String(body.kind ?? '');

  if (kind === 'note') {
    const text = String(body.noteText ?? '').trim();
    if (!text) return NextResponse.json({ error: 'A note needs some text.' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('job_briefing_items')
      .insert({ briefing_id: briefingId, kind: 'note', note_text: text, added_by: session.user.email, sort_order: nextSort(body) })
      .select('id, kind, note_text, added_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await notifyAppend(jobId, briefingId, briefingState, briefingTitle, WHAT.note!, session.user.email);
    return NextResponse.json({ item: data });
  }

  const bucket = bucketForKind(kind);
  if (!bucket) return NextResponse.json({ error: `Unknown item kind “${kind}”.` }, { status: 400 });

  const path = String(body.path ?? '');
  const fileName = String(body.fileName ?? '').trim();
  if (!path || !fileName) return NextResponse.json({ error: 'path and fileName are required.' }, { status: 400 });

  // Confirm the object is actually there before recording that it is. Without this a failed upload
  // that still calls `complete` produces a briefing item pointing at nothing, which renders as a
  // broken player rather than as an error anybody can act on.
  const dir = path.slice(0, path.lastIndexOf('/'));
  const base = path.slice(path.lastIndexOf('/') + 1);
  const { data: listed } = await supabaseAdmin.storage.from(bucket).list(dir, { search: base, limit: 1 });
  const stored = (listed ?? []).find((o) => o.name === base);
  if (!stored) {
    return NextResponse.json(
      { error: 'That upload did not finish — the file is not in storage. Try uploading it again.' },
      { status: 409 },
    );
  }

  const { data: fileRow, error: fileErr } = await supabaseAdmin
    .from('job_files')
    .insert({
      job_id: jobId,
      org_id: (briefing as { org_id: string | null }).org_id ?? undefined,
      file_name: fileName,
      // `name` as well as `file_name`: the instructions resolver reads `name ?? file_name`, so
      // setting it is what makes a briefing's video attachable from the Instructions tab's picker.
      name: fileName,
      file_type: kind,
      storage_path: path,
      content_type: typeof body.contentType === 'string' ? body.contentType : null,
      file_size_bytes: typeof body.sizeBytes === 'number' ? body.sizeBytes : null,
      // The job folder groups by section, so a briefing's artefacts land together rather than being
      // scattered through "documents".
      section: 'briefings',
      description: typeof body.description === 'string' ? body.description : null,
      // `uploaded_by` is TEXT and holds the email; `created_by` is a UUID column and is deliberately
      // not set here. Writing the email into both looked obviously right and failed with
      // `invalid input syntax for type uuid` — the two columns on this table record who in two
      // different currencies.
      uploaded_by: session.user.email,
      upload_state: 'done',   // the CHECK allows pending|wifi-waiting|done|failed — not 'complete'
    })
    .select('id, file_name, storage_path, file_size_bytes')
    .single();
  if (fileErr) return NextResponse.json({ error: fileErr.message }, { status: 500 });

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('job_briefing_items')
    .insert({
      briefing_id: briefingId,
      kind,
      job_file_id: (fileRow as { id: string }).id,
      duration_seconds: typeof body.durationSeconds === 'number' ? Math.round(body.durationSeconds) : null,
      added_by: session.user.email,
      sort_order: nextSort(body),
    })
    .select('id, kind, job_file_id, duration_seconds, added_at, sort_order')
    .single();
  if (itemErr) {
    // The file row survives deliberately. The bytes are in storage and registered on the job; losing
    // the briefing link is recoverable, quietly deleting somebody's 120 MB upload is not.
    return NextResponse.json({ error: itemErr.message, jobFile: fileRow }, { status: 500 });
  }

  await notifyAppend(jobId, briefingId, briefingState, briefingTitle, WHAT[kind] ?? 'Something', session.user.email);

  return NextResponse.json({ item, jobFile: fileRow });
}

/**
 * Remove an item from a briefing.
 *
 * The `job_files` row and its bytes stay. Same reasoning as deleting a draft: taking a photo out of
 * a briefing is a decision about the briefing, not a request to destroy a file that is registered on
 * the job and visible in the file manager. Deleting the file is the Files tab's job, where the
 * consequence is on screen.
 */
export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: jobId, briefingId } = await ctx.params;

  const itemId = new URL(req.url).searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId is required.' }, { status: 400 });

  const { data: briefing } = await supabaseAdmin
    .from('job_briefings').select('id, job_id, author_email').eq('id', briefingId).maybeSingle();
  if (!briefing || (briefing as { job_id: string }).job_id !== jobId) {
    return NextResponse.json({ error: 'Briefing not found on this job.' }, { status: 404 });
  }
  if ((briefing as { author_email: string }).author_email !== session.user.email) {
    return NextResponse.json({ error: 'Only the person who wrote this briefing can change it.' }, { status: 403 });
  }

  // Scoped to the briefing as well as the id, so an item id from another briefing cannot be deleted
  // by somebody who authored this one.
  const { error } = await supabaseAdmin
    .from('job_briefing_items').delete().eq('id', itemId).eq('briefing_id', briefingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

/** Where this item sits in the briefing. Client-supplied, defaulting to the end. */
function nextSort(body: Record<string, unknown>): number {
  return typeof body.sortOrder === 'number' ? Math.round(body.sortOrder) : 0;
}
