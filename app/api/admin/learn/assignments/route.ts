// app/api/admin/learn/assignments/route.ts
// Admin: assign modules/lessons to users, manage assignments
// Users: view their own assignments
import { auth, isAdmin, canManageContent } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* ── GET: List assignments ── */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const userEmail = searchParams.get('user_email');
  const admin = canManageContent(session.user.email);

  let query = supabaseAdmin.from('learning_assignments').select('*').order('created_at', { ascending: false });

  if (admin && userEmail) {
    query = query.eq('assigned_to', userEmail);
  } else if (!admin) {
    query = query.eq('assigned_to', session.user.email);
  }

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with module/lesson titles
  const moduleIds = [...new Set((data || []).filter((a: any) => a.module_id).map((a: any) => a.module_id))];
  const lessonIds = [...new Set((data || []).filter((a: any) => a.lesson_id).map((a: any) => a.lesson_id))];

  let moduleMap = new Map();
  let lessonMap = new Map();

  if (moduleIds.length > 0) {
    const { data: modules } = await supabaseAdmin.from('learning_modules')
      .select('id, title').in('id', moduleIds);
    for (const m of (modules || []) as any[]) moduleMap.set(m.id, m.title);
  }
  if (lessonIds.length > 0) {
    const { data: lessons } = await supabaseAdmin.from('learning_lessons')
      .select('id, title').in('id', lessonIds);
    for (const l of (lessons || []) as any[]) lessonMap.set(l.id, l.title);
  }

  const enriched = (data || []).map((a: any) => ({
    ...a,
    module_title: a.module_id ? moduleMap.get(a.module_id) || 'Unknown Module' : null,
    lesson_title: a.lesson_id ? lessonMap.get(a.lesson_id) || 'Unknown Lesson' : null,
  }));

  return NextResponse.json({ assignments: enriched });
}, { routeName: 'learn/assignments' });

/* ── POST: Create assignment (admin only) ── */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageContent(session.user.email)) return NextResponse.json({ error: 'Content management access required' }, { status: 403 });

  const body = await req.json();
  const { action } = body;

  // Enroll user in ACC course
  if (action === 'enroll_acc') {
    const { user_email, course_id } = body;
    if (!user_email || !course_id) return NextResponse.json({ error: 'user_email and course_id required' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('acc_course_enrollments')
      .upsert({ user_email, course_id, enrolled_by: session.user.email }, { onConflict: 'user_email,course_id' })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ enrollment: data });
  }

  // Remove ACC enrollment
  if (action === 'unenroll_acc') {
    const { user_email, course_id } = body;
    if (!user_email || !course_id) return NextResponse.json({ error: 'user_email and course_id required' }, { status: 400 });

    await supabaseAdmin.from('acc_course_enrollments')
      .delete().eq('user_email', user_email).eq('course_id', course_id);
    return NextResponse.json({ success: true });
  }

  // Get ACC enrollments
  if (action === 'get_enrollments') {
    const { user_email } = body;
    const { data } = await supabaseAdmin.from('acc_course_enrollments')
      .select('*').eq('user_email', user_email || '');
    return NextResponse.json({ enrollments: data || [] });
  }

  // Create learning assignment
  const { assigned_to, module_id, lesson_id, unlock_next, due_date, notes, status: assignStatus } = body;
  if (!assigned_to) return NextResponse.json({ error: 'assigned_to required' }, { status: 400 });
  if (!module_id && !lesson_id) return NextResponse.json({ error: 'module_id or lesson_id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('learning_assignments')
    .insert({
      assigned_to,
      assigned_by: session.user.email,
      module_id: module_id || null,
      lesson_id: lesson_id || null,
      unlock_next: unlock_next || false,
      due_date: due_date || null,
      notes: notes || null,
      status: assignStatus || 'in_progress',
    })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'assignment_created',
      entity_type: module_id ? 'module' : 'lesson',
      entity_id: module_id || lesson_id,
      metadata: { assigned_to, unlock_next },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ assignment: data });
}, { routeName: 'learn/assignments' });

/* ── PUT: Update assignment ── */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // Update refresh/recoverage frequency
  if (body.action === 'update_refresh') {
    if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const { module_id, refresh_months } = body;
    if (!module_id || refresh_months === undefined) return NextResponse.json({ error: 'module_id and refresh_months required' }, { status: 400 });

    // Check for existing xp config
    const { data: existingConfig } = await supabaseAdmin.from('module_xp_config')
      .select('id').eq('module_type', 'learning_module').eq('module_id', module_id).maybeSingle();
    const existing = existingConfig as any;

    if (existing) {
      await supabaseAdmin.from('module_xp_config')
        .update({ expiry_months: refresh_months, refresh_months: refresh_months })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin.from('module_xp_config')
        .insert({ module_type: 'learning_module', module_id, xp_value: 500, expiry_months: refresh_months, refresh_months: refresh_months, is_active: true });
    }
    return NextResponse.json({ success: true });
  }

  const { id, status: newStatus, notes } = body;
  if (!id) return NextResponse.json({ error: 'Assignment id required' }, { status: 400 });

  // Only admins can update others' assignments
  const { data: assignmentRaw } = await supabaseAdmin.from('learning_assignments')
    .select('*').eq('id', id).single();
  const assignment = assignmentRaw as any;

  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  const isOwner = assignment.assigned_to === session.user.email;
  const adminOrTeacher = canManageContent(session.user.email);
  if (!isOwner && !adminOrTeacher) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const updates: any = {};
  if (newStatus) {
    updates.status = newStatus;
    if (newStatus === 'completed') updates.completed_at = new Date().toISOString();
  }
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabaseAdmin.from('learning_assignments')
    .update(updates).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignment: data });
}, { routeName: 'learn/assignments' });

/* ── DELETE: Cancel assignment (admin only) ── */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageContent(session.user.email)) return NextResponse.json({ error: 'Content management access required' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabaseAdmin.from('learning_assignments')
    .update({ status: 'cancelled' }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'learn/assignments' });
