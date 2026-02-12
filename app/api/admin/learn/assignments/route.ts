// app/api/admin/learn/assignments/route.ts
// Admin: assign modules/lessons to users, manage assignments
// Users: view their own assignments
import { auth, isAdmin, canManageContent } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notifyLearningAssignment, notifyACCEnrollment } from '@/lib/notifications';

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
    const normalizedEmail = user_email.trim().toLowerCase();

    const { data, error } = await supabaseAdmin.from('acc_course_enrollments')
      .upsert({ user_email: normalizedEmail, course_id, enrolled_by: session.user.email }, { onConflict: 'user_email,course_id' })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Notify the student
    try { await notifyACCEnrollment(normalizedEmail, course_id); } catch { /* ignore */ }

    return NextResponse.json({ enrollment: data });
  }

  // Enroll user in a module (unified enrollment)
  if (action === 'enroll_module') {
    const { user_email, module_id: enrollModuleId, lesson_mode, selected_lessons, due_date } = body;
    if (!user_email || !enrollModuleId) return NextResponse.json({ error: 'user_email and module_id required' }, { status: 400 });
    const normalizedEmail = user_email.trim().toLowerCase();
    // lesson_mode: 'all' | 'specific' | 'first' (default: 'first')
    const mode = lesson_mode || 'first';

    // Look up module info (title + ACC course data)
    const { data: modInfo } = await supabaseAdmin.from('learning_modules')
      .select('title, is_academic, acc_course_id').eq('id', enrollModuleId).single();
    const mod = modInfo as any;
    const moduleTitle = mod?.title || 'a module';

    // Build notes describing the enrollment mode
    const modeLabels: Record<string, string> = { all: 'all lessons open', specific: 'specific lessons', first: 'sequential (first lesson)' };
    const enrollNotes = `Enrolled: ${modeLabels[mode] || mode}${due_date ? ` | Due: ${due_date}` : ''}`;

    // Create module-level assignment (unlocks the module)
    const { data: assignData, error: assignErr } = await supabaseAdmin.from('learning_assignments')
      .insert({
        assigned_to: normalizedEmail,
        assigned_by: session.user.email,
        module_id: enrollModuleId,
        lesson_id: null,
        unlock_next: false,
        status: 'in_progress',
        due_date: due_date || null,
        notes: enrollNotes,
      })
      .select().single();
    if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });

    // Create per-lesson assignments based on mode
    if (mode === 'all') {
      // Unlock ALL published lessons
      const { data: moduleLessons } = await supabaseAdmin.from('learning_lessons')
        .select('id').eq('module_id', enrollModuleId).eq('status', 'published');
      if (moduleLessons && moduleLessons.length > 0) {
        const lessonRows = moduleLessons.map((l: any) => ({
          assigned_to: normalizedEmail,
          assigned_by: session.user.email,
          module_id: enrollModuleId,
          lesson_id: l.id,
          status: 'in_progress',
          due_date: due_date || null,
          notes: 'Enrolled: lesson unlock',
        }));
        await supabaseAdmin.from('learning_assignments').insert(lessonRows);
      }
    } else if (mode === 'specific' && Array.isArray(selected_lessons) && selected_lessons.length > 0) {
      // Unlock only selected lessons
      const lessonRows = selected_lessons.map((lessonId: string) => ({
        assigned_to: normalizedEmail,
        assigned_by: session.user.email,
        module_id: enrollModuleId,
        lesson_id: lessonId,
        status: 'in_progress',
        due_date: due_date || null,
        notes: 'Enrolled: specific lesson',
      }));
      await supabaseAdmin.from('learning_assignments').insert(lessonRows);
    }
    // mode === 'first': no lesson-level assignments, sequential unlock via hasModuleOverride logic

    // If the module is academic and has an ACC course, also enroll in the ACC course
    if (mod?.is_academic && mod?.acc_course_id) {
      await supabaseAdmin.from('acc_course_enrollments')
        .upsert({ user_email: normalizedEmail, course_id: mod.acc_course_id, enrolled_by: session.user.email },
          { onConflict: 'user_email,course_id' });
      try { await notifyACCEnrollment(normalizedEmail, mod.acc_course_id); } catch { /* ignore */ }
    }

    // Notify the student
    try { await notifyLearningAssignment(normalizedEmail, moduleTitle, enrollModuleId); } catch { /* ignore */ }

    // Log activity
    try {
      await supabaseAdmin.from('activity_log').insert({
        user_email: session.user.email,
        action_type: 'module_enrollment',
        entity_type: 'module',
        entity_id: enrollModuleId,
        metadata: { enrolled_user: normalizedEmail, lesson_mode: mode, due_date: due_date || null },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ enrollment: assignData });
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
  const { assigned_to, module_id, lesson_id, unlock_next, due_date, notes, status: assignStatus, unlock_all_lessons } = body;
  if (!assigned_to) return NextResponse.json({ error: 'assigned_to required' }, { status: 400 });
  if (!module_id && !lesson_id) return NextResponse.json({ error: 'module_id or lesson_id required' }, { status: 400 });
  const normalizedAssignTo = assigned_to.trim().toLowerCase();

  const { data, error } = await supabaseAdmin.from('learning_assignments')
    .insert({
      assigned_to: normalizedAssignTo,
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

  // If unlock_all_lessons, also create per-lesson assignments
  if (unlock_all_lessons && module_id && !lesson_id) {
    const { data: moduleLessons } = await supabaseAdmin.from('learning_lessons')
      .select('id').eq('module_id', module_id).eq('status', 'published');
    if (moduleLessons && moduleLessons.length > 0) {
      const lessonRows = moduleLessons.map((l: any) => ({
        assigned_to: normalizedAssignTo,
        assigned_by: session.user.email,
        module_id,
        lesson_id: l.id,
        status: 'in_progress',
        notes: 'Assignment: lesson unlock',
      }));
      await supabaseAdmin.from('learning_assignments').insert(lessonRows);
    }
  }

  // Notify the student
  try {
    const { data: modInfo } = await supabaseAdmin.from('learning_modules')
      .select('title').eq('id', module_id).single();
    const moduleTitle = (modInfo as any)?.title || 'a module';
    let lessonTitle: string | null = null;
    if (lesson_id) {
      const { data: lesInfo } = await supabaseAdmin.from('learning_lessons')
        .select('title').eq('id', lesson_id).single();
      lessonTitle = (lesInfo as any)?.title || null;
    }
    await notifyLearningAssignment(normalizedAssignTo, moduleTitle, module_id || '', lessonTitle, session.user.email);
  } catch { /* ignore */ }

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'assignment_created',
      entity_type: module_id ? 'module' : 'lesson',
      entity_id: module_id || lesson_id,
      metadata: { assigned_to: normalizedAssignTo, unlock_next, unlock_all_lessons },
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

  // Look up the assignment to check if it's module-level
  const { data: assignmentRaw } = await supabaseAdmin.from('learning_assignments')
    .select('*').eq('id', id).single();
  const assignment = assignmentRaw as any;

  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  // Cancel the assignment
  const { error } = await supabaseAdmin.from('learning_assignments')
    .update({ status: 'cancelled' }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If this is a module-level assignment (no lesson_id), also cancel all related
  // lesson-level assignments for the same user+module so re-enrollment starts fresh
  if (assignment.module_id && !assignment.lesson_id) {
    await supabaseAdmin.from('learning_assignments')
      .update({ status: 'cancelled' })
      .eq('assigned_to', assignment.assigned_to)
      .eq('module_id', assignment.module_id)
      .neq('status', 'cancelled');
  }

  return NextResponse.json({ success: true });
}, { routeName: 'learn/assignments' });
