// app/api/admin/assignments/route.ts — Assignments CRUD
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { buildAssignmentNotification } from '@/lib/notifications/assignment';

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
  if (!isAdmin(session.user.roles)) {
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
  if (!session?.user?.email || !isAdmin(session.user.roles)) {
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

  // hub-widget-excellence-03 Slice 2e — notify the assignee with the
  // typed payload (now carries priority + due date, vs. the old generic
  // inline insert). Best-effort.
  try {
    const notice = buildAssignmentNotification(data as Parameters<typeof buildAssignmentNotification>[0]);
    if (notice) await notify(notice);
  } catch { /* ignore notification failures */ }

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

  // hub-widget-excellence-03 Slice 2e — when an admin reassigns the
  // task (sets a new assigned_to), notify the new assignee. Status-only
  // edits (e.g. a worker marking their own task complete) stay silent.
  if (isAdmin(session.user.roles) && typeof updates.assigned_to === 'string' && updates.assigned_to.trim()) {
    try {
      const notice = buildAssignmentNotification(data as Parameters<typeof buildAssignmentNotification>[0]);
      if (notice) await notify(notice);
    } catch { /* ignore notification failures */ }
  }

  return NextResponse.json({ assignment: data });
}, { routeName: 'assignments' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Assignment ID required' }, { status: 400 });

  const { error } = await supabaseAdmin.from('assignments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'assignments' });
