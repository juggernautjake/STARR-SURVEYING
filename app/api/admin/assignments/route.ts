// app/api/admin/assignments/route.ts — Assignments CRUD
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const status = searchParams.get('status');
  const assignedTo = searchParams.get('assigned_to');
  const type = searchParams.get('type');

  if (id) {
    const { data, error } = await supabaseAdmin.from('assignments').select('*').eq('id', id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ assignment: data });
  }

  let query = supabaseAdmin.from('assignments').select('*', { count: 'exact' }).order('created_at', { ascending: false });

  // Non-admins only see their own
  if (!isAdmin(session.user.email)) {
    query = query.eq('assigned_to', session.user.email);
  } else if (assignedTo) {
    query = query.eq('assigned_to', assignedTo);
  }

  if (status && status !== 'all') query = query.eq('status', status);
  if (type && type !== 'all') query = query.eq('assignment_type', type);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assignments: data || [], total: count || 0 });
}, { routeName: 'assignments' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, assignment_type, priority, assigned_to, due_date, job_id, module_id, lesson_id, notes } = body;

  if (!title || !assigned_to) {
    return NextResponse.json({ error: 'Title and assigned_to are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('assignments').insert({
    title, description, assignment_type: assignment_type || 'task',
    priority: priority || 'normal', status: 'pending',
    assigned_to, assigned_by: session.user.email,
    due_date: due_date || null, job_id: job_id || null,
    module_id: module_id || null, lesson_id: lesson_id || null, notes: notes || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create notification for the assignee
  await supabaseAdmin.from('notifications').insert({
    user_email: assigned_to,
    type: 'assignment',
    title: 'New Assignment',
    body: `You have been assigned: ${title}`,
    icon: '📋',
    link: '/admin/assignments',
    source_type: 'assignment',
    source_id: data.id,
  }).catch(() => {});

  return NextResponse.json({ assignment: data }, { status: 201 });
}, { routeName: 'assignments' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Assignment ID required' }, { status: 400 });

  if (updates.status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin.from('assignments').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assignment: data });
}, { routeName: 'assignments' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Assignment ID required' }, { status: 400 });

  const { error } = await supabaseAdmin.from('assignments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'assignments' });
