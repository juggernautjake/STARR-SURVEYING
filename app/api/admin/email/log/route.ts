// app/api/admin/email/log/route.ts
// Sent-email history for admins (doc 04, slice EM5). Returns recent rows from
// email_send_log (seeds/381) — who/when/subject + recipient counts.
//
// GET /api/admin/email/log?limit=50  →  { sends: [...] }

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '50', 10) || 50, 200);

  const { data, error } = await supabaseAdmin
    .from('email_send_log')
    .select('id, sender_email, subject, role, recipient_count, sent_count, failed_count, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    // Table may not be migrated yet — return empty rather than 500 so the page renders.
    return NextResponse.json({ sends: [], unavailable: true });
  }
  return NextResponse.json({ sends: data ?? [] });
}, { routeName: 'admin/email/log' });
