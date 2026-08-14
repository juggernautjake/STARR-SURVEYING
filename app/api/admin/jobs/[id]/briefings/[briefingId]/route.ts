// app/api/admin/jobs/[id]/briefings/[briefingId]/route.ts — slices B4 and B6.
//
//   PATCH  → edit the title and notes.
//   DELETE → throw away a draft.
//
// ── WHY A PUBLISHED BRIEFING CANNOT BE DELETED ──────────────────────────────────────────────────
//
// D5 of the plan, and the same reason the schema forbids un-publishing: telling twelve people to go
// read something and then making it vanish is worse than leaving it up with a correction appended.
// Somebody on a truck who read half of it at breakfast has no way to find out what it said. A draft
// nobody has seen is a different object entirely, and deleting one costs nothing.
//
// Editing the notes on a published briefing IS allowed — that is the owner's *"he can add more stuff
// later"* — and it notifies quietly rather than at publish volume.
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyJobEvent } from '@/lib/notifications/job-event';

export const runtime = 'nodejs';

interface RouteContext { params: Promise<{ id: string; briefingId: string }> }

const COLS = 'id, job_id, author_email, title, body, state, published_at, created_at, updated_at';

/** The briefing, if it is on this job and this caller is allowed to change it. */
async function authorise(jobId: string, briefingId: string, email: string) {
  const { data } = await supabaseAdmin
    .from('job_briefings')
    .select('id, job_id, author_email, state, title')
    .eq('id', briefingId)
    .maybeSingle();
  const row = data as { id: string; job_id: string; author_email: string; state: string; title: string | null } | null;
  if (!row || row.job_id !== jobId) {
    return { error: NextResponse.json({ error: 'Briefing not found on this job.' }, { status: 404 }) };
  }
  if (row.author_email !== email) {
    return { error: NextResponse.json({ error: 'Only the person who wrote this briefing can change it.' }, { status: 403 }) };
  }
  return { row };
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: jobId, briefingId } = await ctx.params;

  const gate = await authorise(jobId, briefingId, session.user.email);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === 'string') patch.title = body.title.trim() || null;
  if (typeof body.body === 'string') patch.body = body.body;

  const { data, error } = await supabaseAdmin
    .from('job_briefings').update(patch).eq('id', briefingId).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Only a published briefing notifies. Editing a draft is somebody working, not an event — and the
  // draft is invisible to everyone else anyway, so a notification would point at a 404.
  if (gate.row!.state === 'published') {
    await notifyJobEvent(jobId, {
      kind: 'briefing_appended',
      title: `briefing updated — ${gate.row!.title ?? 'untitled'}`,
      body: 'The notes on this briefing changed.',
      link: `/admin/jobs/${jobId}?tab=briefings&briefing=${briefingId}`,
      escalation: 'low',
    }, session.user.email);
  }

  return NextResponse.json({ briefing: data });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: jobId, briefingId } = await ctx.params;

  const gate = await authorise(jobId, briefingId, session.user.email);
  if (gate.error) return gate.error;

  if (gate.row!.state === 'published') {
    return NextResponse.json(
      {
        error: 'A published briefing cannot be deleted — people have already been told to read it. '
          + 'Add a note to it saying what changed instead.',
      },
      { status: 409 },
    );
  }

  // The items go with it (`ON DELETE CASCADE`), but the `job_files` rows they point at do NOT.
  // Deliberate: the bytes are on the job, registered in the file manager, and somebody who abandons
  // a draft has not asked to delete a 120 MB recording. The Files tab is where a file is deleted.
  const { error } = await supabaseAdmin.from('job_briefings').delete().eq('id', briefingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
