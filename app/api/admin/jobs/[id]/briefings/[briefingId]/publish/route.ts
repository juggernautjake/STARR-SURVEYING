// app/api/admin/jobs/[id]/briefings/[briefingId]/publish/route.ts — slice B5.
//
// Owner: *"Once he has compiled his notes and instructions and stuff, he can post it and make it so
// that all of the people involved in the job can see it."*
//
// ── PUBLISH IS A ONE-WAY DOOR (D5) ──────────────────────────────────────────────────────────────
//
// This is the moment the crew becomes responsible for knowing something. There is no un-publish:
// the schema's CHECK forbids `state='draft'` with a `published_at`, so the state cannot be walked
// back even by a later PATCH. Everything after this is an append (B6), which notifies quietly.
//
// It is also the ONE event in this feature that is genuinely an announcement rather than ambient
// activity, which is why it is the only one marked `high`. If uploading a photo were also `high`,
// the phone would be trained to ignore both.
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyJobEvent } from '@/lib/notifications/job-event';

export const runtime = 'nodejs';

interface RouteContext { params: Promise<{ id: string; briefingId: string }> }

export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: jobId, briefingId } = await ctx.params;

  const { data } = await supabaseAdmin
    .from('job_briefings')
    .select('id, job_id, author_email, title, state')
    .eq('id', briefingId)
    .maybeSingle();
  const briefing = data as { id: string; job_id: string; author_email: string; title: string | null; state: string } | null;

  if (!briefing || briefing.job_id !== jobId) {
    return NextResponse.json({ error: 'Briefing not found on this job.' }, { status: 404 });
  }
  if (briefing.author_email !== session.user.email) {
    return NextResponse.json({ error: 'Only the person who wrote this briefing can publish it.' }, { status: 403 });
  }
  if (briefing.state === 'published') {
    // Not an error worth a 4xx: a double-click on the publish button must not read as a failure, and
    // it must not notify twice. Returning the row unchanged makes it idempotent.
    return NextResponse.json({ briefing, alreadyPublished: true, notified: 0 });
  }

  // Refuse an empty one. A briefing with no video, no notes and no attachments notifies the whole
  // crew about nothing, and the person who did it will not know why everyone is annoyed.
  const [{ count: itemCount }, { data: full }] = await Promise.all([
    supabaseAdmin.from('job_briefing_items').select('id', { count: 'exact', head: true }).eq('briefing_id', briefingId),
    supabaseAdmin.from('job_briefings').select('body').eq('id', briefingId).maybeSingle(),
  ]);
  const hasNotes = Boolean((full as { body: string | null } | null)?.body?.trim());
  if ((itemCount ?? 0) === 0 && !hasNotes) {
    return NextResponse.json(
      { error: 'This briefing is empty. Add a recording, a note or a file before posting it — publishing tells everyone on the job to go and read it.' },
      { status: 400 },
    );
  }

  const publishedAt = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from('job_briefings')
    .update({ state: 'published', published_at: publishedAt, updated_at: publishedAt })
    .eq('id', briefingId)
    // Guards against two tabs publishing the same briefing at the same moment: the second update
    // matches nothing and returns no row, so only one notification goes out.
    .eq('state', 'draft')
    .select('id, job_id, author_email, title, body, state, published_at, created_at, updated_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ briefing, alreadyPublished: true, notified: 0 });

  const { notified } = await notifyJobEvent(jobId, {
    kind: 'briefing_published',
    title: `briefing posted — ${briefing.title ?? 'untitled'}`,
    body: `${session.user.name ?? session.user.email} posted a briefing on this job.`,
    link: `/admin/jobs/${jobId}?tab=briefings&briefing=${briefingId}`,
    escalation: 'high',
  }, session.user.email);

  return NextResponse.json({ briefing: updated, notified });
}
