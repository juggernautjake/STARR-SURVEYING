// app/api/admin/activity-tags/route.ts
//
// Activity tag catalog. Read-only for v1; the seed file (Slice 180)
// is the source of truth. User-defined tags would come from POST
// later — they have a `system = false` flag for that path.
//
// Slice 188 of customizable-hub-and-work-mode-2026-05-28.md.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const SELECT_COLS = 'id, label, color, system, work_type_key';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('activity_tags')
    .select(SELECT_COLS)
    .order('system', { ascending: false }) // system tags first
    .order('label', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tags: data ?? [] });
}, { routeName: 'admin/activity-tags' });
