// app/api/admin/jobs/time/route.ts — Time tracking
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  const userEmail = searchParams.get('user_email');
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  let query = supabaseAdmin
    .from('job_time_entries')
    .select('*')
    .eq('job_id', jobId)
    .order('start_time', { ascending: false });

  if (userEmail) query = query.eq('user_email', userEmail);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totalMinutes = (data || []).reduce((sum: number, e: { duration_minutes: number | null }) => sum + (e.duration_minutes || 0), 0);

  return NextResponse.json({
    entries: data || [],
    total_minutes: totalMinutes,
    total_hours: Math.round((totalMinutes / 60) * 100) / 100,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, work_type, start_time, end_time, duration_minutes, description, billable } = await req.json();
  if (!job_id || !start_time) return NextResponse.json({ error: 'job_id and start_time required' }, { status: 400 });

  // Calculate duration if end_time provided but no duration
  let finalDuration = duration_minutes;
  if (!finalDuration && end_time) {
    finalDuration = Math.round((new Date(end_time).getTime() - new Date(start_time).getTime()) / 60000);
  }

  const { data, error } = await supabaseAdmin
    .from('job_time_entries')
    .insert({
      job_id, work_type: work_type || 'general',
      start_time, end_time, duration_minutes: finalDuration,
      description, billable: billable !== false,
      user_email: session.user.email,
      user_name: session.user.name,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Entry ID required' }, { status: 400 });

  const { error } = await supabaseAdmin.from('job_time_entries').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
