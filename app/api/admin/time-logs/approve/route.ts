// app/api/admin/time-logs/approve/route.ts — Bulk approval actions for admins
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// POST: Bulk approve/reject time logs
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { ids, action, rejection_reason } = body as {
    ids: string[];
    action: 'approve' | 'reject';
    rejection_reason?: string;
  };

  if (!ids?.length || !action) {
    return NextResponse.json({ error: 'ids and action required' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    approved_by: session.user.email,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (action === 'approve') {
    updateData.status = 'approved';
  } else {
    updateData.status = 'rejected';
    updateData.rejection_reason = rejection_reason || 'Rejected by admin';
  }

  const { data, error } = await supabaseAdmin
    .from('daily_time_logs')
    .update(updateData)
    .in('id', ids)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: `time_logs_bulk_${action}`,
      entity_type: 'daily_time_logs',
      entity_id: ids[0],
      metadata: { count: ids.length, action },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ updated: data?.length || 0, logs: data || [] });
}, { routeName: 'time-logs/approve' });
