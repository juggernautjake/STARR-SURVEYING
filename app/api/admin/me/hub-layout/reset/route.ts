// app/api/admin/me/hub-layout/reset/route.ts
//
// Wipes the caller's saved hub layout so the next GET returns null
// and the hub falls back to the persona-default. Used by the "Reset
// to default" button in edit mode.
//
// POST /api/admin/me/hub-layout/reset → { reset: true } | error

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const POST = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabaseAdmin
    .from('user_hub_layouts')
    .delete()
    .eq('user_email', session.user.email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reset: true });
}, { routeName: 'admin/me/hub-layout/reset' });
