// app/api/admin/jobs/team/route.ts — Team member management
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_team')
    .select('*')
    .eq('job_id', jobId)
    .is('removed_at', null)
    .order('assigned_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team: data || [] });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, user_email, user_name, role, notes } = await req.json();
  if (!job_id || !user_email || !role) {
    return NextResponse.json({ error: 'job_id, user_email, and role required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('job_team')
    .insert({ job_id, user_email, user_name, role, notes })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action: 'job_team_added',
    entity_type: 'job',
    entity_id: job_id,
    details: { added_email: user_email, role },
  }).catch(() => {});

  return NextResponse.json({ member: data }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, role, notes } = await req.json();
  if (!id) return NextResponse.json({ error: 'Team member ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_team')
    .update({ role, notes })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Team member ID required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('job_team')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
