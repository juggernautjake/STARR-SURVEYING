// app/api/admin/projects/[id]/open/route.ts — record that somebody looked at this project.
//
//   POST /api/admin/projects/<id>/open
//
// Owner, 2026-08-19: *"the 5 most recent projects that have been opened/created/worked on."*
//
// Created and worked-on were already recorded — `created_at`, and `updated_at` on the project and
// its jobs. OPENED was not, because reading a project changes nothing. Which is exactly why it is
// worth its own row: the project somebody opened five times this week without editing is the one
// they are actually working, and by every stored timestamp it looks untouched.
//
// Upserted, one row per person per project (seeds/606). Fire-and-forget from the page: a recents
// list that could fail somebody's attempt to open a project would be a bad trade.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { fireAndForget } from '@/lib/apiErrorHandler';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // `open_count` is incremented rather than overwritten, so "opened eleven times" stays
  // distinguishable from "glanced at once" — which is the difference between a project somebody is
  // living in and one they looked at by mistake.
  const { data: existing } = await supabaseAdmin
    .from('project_opens')
    .select('open_count')
    .eq('project_id', params.id)
    .eq('user_email', session.user.email)
    .maybeSingle();

  await fireAndForget(
    supabaseAdmin.from('project_opens').upsert(
      {
        project_id: params.id,
        user_email: session.user.email,
        opened_at: new Date().toISOString(),
        open_count: ((existing as { open_count?: number } | null)?.open_count ?? 0) + 1,
      },
      { onConflict: 'project_id,user_email' },
    ),
  );

  return NextResponse.json({ ok: true });
}
