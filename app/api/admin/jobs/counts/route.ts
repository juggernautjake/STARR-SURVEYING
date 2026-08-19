// app/api/admin/jobs/counts/route.ts — every tab's number, in one request.
//
// Owner, 2026-08-19: *"we need to make sure that we are displaying the numbers associated with each
// button immediately on page load if there is anything… And if there is nothing related to it, then
// it should just have '0'."*
//
// ── WHY THIS EXISTS RATHER THAN LETTING EACH TAB REPORT ITSELF ──────────────────────────────────
//
// The counts used to arrive from the tabs themselves — `research.length` once the Research tab had
// been opened, `onCountChange` from CAD and Photos when theirs mounted. Which meant the badges
// appeared only for places you had ALREADY been, so the tab strip could never answer the question
// it exists to answer: where is there anything? A job with forty photos looked identical to one
// with none until you went and checked.
//
// Counted with `head: true` + `count: 'exact'`, so Postgres returns the number and none of the
// rows. Ten counts cost less than the one query that used to fetch every research row to call
// `.length` on it.
//
// Failures are counted as ZERO rather than propagated: a badge is a hint, and a job page that
// refuses to render because a count query failed would trade something useful for something
// trivial. `ok: false` is returned alongside so the caller can tell "nothing" from "unknown".

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/** One count, never throwing — see the note above about a badge not being worth a broken page. */
async function count(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const { count: n, error } = await build();
    return error ? 0 : (n ?? 0);
  } catch {
    return 0;
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobId = new URL(req.url).searchParams.get('job_id');
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  const liveFiles = () =>
    supabaseAdmin.from('job_files').select('id', { count: 'exact', head: true })
      .eq('job_id', jobId).eq('is_deleted', false).eq('is_backup', false);

  const [
    schedule, research, cad, fieldwork, files, photos, videos, financial, activity, messages,
  ] = await Promise.all([
    count(() => supabaseAdmin.from('schedule_events').select('id', { count: 'exact', head: true }).eq('job_id', jobId)),
    count(() => supabaseAdmin.from('job_research').select('id', { count: 'exact', head: true }).eq('job_id', jobId)),
    count(() => supabaseAdmin.from('cad_drawings').select('id', { count: 'exact', head: true }).eq('job_id', jobId)),
    count(() => supabaseAdmin.from('job_field_data').select('id', { count: 'exact', head: true }).eq('job_id', jobId)),
    // The Files tab shows everything that is not a photo or a video — the same split the tabs use,
    // so the badge cannot disagree with what the tab lists.
    count(() => liveFiles().not('section', 'in', '("photos","videos")')),
    count(() => liveFiles().eq('section', 'photos')),
    count(() => liveFiles().eq('section', 'videos')),
    count(() => supabaseAdmin.from('job_payments').select('id', { count: 'exact', head: true }).eq('job_id', jobId)),
    count(() => supabaseAdmin.from('job_stages_history').select('id', { count: 'exact', head: true }).eq('job_id', jobId)),
    // Messages hang off the job's conversation, not off the job — so this is two steps, and the
    // absence of a conversation is a real zero rather than an error.
    (async () => {
      const { data: job } = await supabaseAdmin.from('jobs').select('conversation_id').eq('id', jobId).maybeSingle();
      const convId = (job as { conversation_id?: string | null } | null)?.conversation_id;
      if (!convId) return 0;
      return count(() => supabaseAdmin.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', convId));
    })(),
  ]);

  return NextResponse.json({
    ok: true,
    // `overview` is deliberately absent: it is a summary of the job, not a collection, so a number
    // on it would be inventing one. The tab strip reserves the space either way, so every tile is
    // the same size whether or not it carries a figure.
    counts: { schedule, research, cad, fieldwork, files, photos, videos, financial, activity, messages },
  });
}, { routeName: 'jobs/counts' });
