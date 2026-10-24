// app/api/admin/jobs/[id]/open/route.ts — record that somebody looked at this job.
//
//   POST /api/admin/jobs/<id>/open
//
// Owner, 2026-10-11: *"It is more helpful to see jobs that are being actively viewed and
// modified."* Edits are stamped by database triggers (seeds/676); a view changes nothing in the
// database, so the job page reports it here. It stamps the job's project as viewed too — opening a
// job is working in its project. Kept off the `jobs` row itself: that table's `updated_at` trigger
// would turn every look into an apparent edit.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { markJobViewed } from '@/lib/activity/record-activity-server';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Read through the org-scoped client, so a job id from another firm is a 404 and stamps nothing.
  const { data: job } = await supabaseAdmin
    .from('jobs').select('id, project_id').eq('id', params.id).maybeSingle();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  await markJobViewed(job.id as string, (job.project_id as string | null) ?? null, session.user.email);
  return NextResponse.json({ ok: true });
}
