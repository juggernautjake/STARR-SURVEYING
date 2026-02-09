// app/api/admin/learn/user-progress/route.ts
// Comprehensive user progress: module statuses, lesson progress, content interactions, locking
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const ADMIN_EMAILS = [
  'hankmaddux@starr-surveying.com',
  'jacobmaddux@starr-surveying.com',
  'info@starr-surveying.com',
];
function isAdmin(email: string) { return ADMIN_EMAILS.includes(email); }

/* ── GET: Module/lesson progress with status calculation ── */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userEmail = session.user.email;
  const { searchParams } = new URL(req.url);
  const moduleId = searchParams.get('module_id');
  const targetEmail = searchParams.get('user_email');
  const email = (isAdmin(userEmail) && targetEmail) ? targetEmail : userEmail;

  // If module_id provided: return lesson-level progress for that module
  if (moduleId) {
    const [lessonsRes, progressRes, assignmentsRes] = await Promise.all([
      supabaseAdmin.from('learning_lessons').select('id, title, order_index, estimated_minutes, resources, videos, status')
        .eq('module_id', moduleId).order('order_index'),
      supabaseAdmin.from('user_lesson_progress').select('*').eq('user_email', email).eq('module_id', moduleId),
      supabaseAdmin.from('learning_assignments').select('*').eq('assigned_to', email)
        .eq('module_id', moduleId).neq('status', 'cancelled'),
    ]);

    const lessons = lessonsRes.data || [];
    const progress = progressRes.data || [];
    const assignments = assignmentsRes.data || [];
    const progressMap = new Map(progress.map((p: any) => [p.lesson_id, p]));
    const assignmentMap = new Map(assignments.filter((a: any) => a.lesson_id).map((a: any) => [a.lesson_id, a]));

    const enrichedLessons = lessons.map((lesson: any, idx: number) => {
      const lp = progressMap.get(lesson.id);
      const assignment = assignmentMap.get(lesson.id);
      const prevLesson = idx > 0 ? lessons[idx - 1] : null;
      const prevProgress = prevLesson ? progressMap.get(prevLesson.id) : null;

      // Count required content interactions
      let resources: any[] = [];
      let videos: any[] = [];
      try { resources = typeof lesson.resources === 'string' ? JSON.parse(lesson.resources) : (lesson.resources || []); } catch { resources = []; }
      try { videos = typeof lesson.videos === 'string' ? JSON.parse(lesson.videos) : (lesson.videos || []); } catch { videos = []; }
      const totalInteractions = resources.length + videos.length;
      const interactions = lp?.content_interactions || {};
      const completedInteractions = Object.keys(interactions).filter(k => interactions[k] === true).length;

      // Locking logic
      let locked = false;
      let lockReason = '';
      if (idx > 0 && !assignment) {
        if (!prevProgress || prevProgress.status !== 'completed') {
          locked = true;
          lockReason = `Complete "${prevLesson.title}" first`;
        }
      }

      return {
        ...lesson,
        status: lp?.status || 'not_started',
        started_at: lp?.started_at,
        completed_at: lp?.completed_at,
        quiz_unlocked: lp?.quiz_unlocked || false,
        content_interactions: interactions,
        total_interactions: totalInteractions,
        completed_interactions: completedInteractions,
        locked,
        lock_reason: lockReason,
        is_assigned: !!assignment,
        assignment,
      };
    });

    return NextResponse.json({ lessons: enrichedLessons });
  }

  // Otherwise: return all modules with status for the user
  const [modulesRes, completionsRes, lessonCountRes, lessonProgressRes, assignmentsRes, enrollmentsRes] = await Promise.all([
    supabaseAdmin.from('learning_modules').select('*').eq('status', 'published').order('order_index'),
    supabaseAdmin.from('module_completions').select('*').eq('user_email', email).eq('module_type', 'learning_module'),
    supabaseAdmin.from('learning_lessons').select('id, module_id'),
    supabaseAdmin.from('user_lesson_progress').select('lesson_id, module_id, status').eq('user_email', email),
    supabaseAdmin.from('learning_assignments').select('*').eq('assigned_to', email).neq('status', 'cancelled'),
    supabaseAdmin.from('acc_course_enrollments').select('course_id').eq('user_email', email),
  ]);

  const modules = modulesRes.data || [];
  const completions = completionsRes.data || [];
  const allLessons = lessonCountRes.data || [];
  const allProgress = lessonProgressRes.data || [];
  const assignments = assignmentsRes.data || [];
  const enrollments = new Set((enrollmentsRes.data || []).map((e: any) => e.course_id));

  // Build lookup maps
  const completionMap = new Map<string, any>();
  for (const c of completions) {
    const existing = completionMap.get(c.module_id);
    if (!existing || (c.is_current && !existing.is_current)) {
      completionMap.set(c.module_id, c);
    }
  }

  const lessonCountMap = new Map<string, number>();
  for (const l of allLessons) {
    lessonCountMap.set(l.module_id, (lessonCountMap.get(l.module_id) || 0) + 1);
  }

  const lessonProgressMap = new Map<string, { completed: number; started: number; total: number }>();
  for (const lp of allProgress) {
    const entry = lessonProgressMap.get(lp.module_id) || { completed: 0, started: 0, total: 0 };
    if (lp.status === 'completed') entry.completed++;
    else if (lp.status === 'in_progress') entry.started++;
    lessonProgressMap.set(lp.module_id, entry);
  }

  const moduleAssignments = new Map<string, any>();
  for (const a of assignments) {
    if (a.module_id && !a.lesson_id) moduleAssignments.set(a.module_id, a);
  }

  // Calculate status for each module
  const enrichedModules = modules.map((mod: any, idx: number) => {
    const completion = completionMap.get(mod.id);
    const totalLessons = lessonCountMap.get(mod.id) || 0;
    const lp = lessonProgressMap.get(mod.id) || { completed: 0, started: 0, total: 0 };
    const assignment = moduleAssignments.get(mod.id);
    const prevModule = idx > 0 ? modules[idx - 1] : null;
    const prevCompletion = prevModule ? completionMap.get(prevModule.id) : null;

    // Determine status
    let userStatus = 'not_started';
    if (assignment && assignment.status !== 'completed') {
      userStatus = 'assigned';
    } else if (completion?.is_current && completion.expires_at && new Date(completion.expires_at) > new Date()) {
      userStatus = 'completed';
    } else if (completion?.completed_at && completion.expires_at && new Date(completion.expires_at) <= new Date()) {
      userStatus = 'due';
    } else if (completion?.completed_at && !completion.is_current) {
      userStatus = 'needs_refreshing';
    } else if (lp.completed > 0 || lp.started > 0) {
      userStatus = 'in_progress';
    }

    // Locking logic
    let locked = false;
    let lockReason = '';

    // ACC course gating
    if (mod.is_academic && mod.acc_course_id) {
      if (!enrollments.has(mod.acc_course_id) && !assignment) {
        locked = true;
        lockReason = `Requires enrollment in ${mod.acc_course_id.replace('_', ' ')}`;
      }
    }

    // Sequential locking (only if not assigned and not ACC-locked)
    if (!locked && !assignment && idx > 0) {
      const prevStatus = getModuleStatus(prevModule, completionMap, lessonProgressMap);
      if (prevStatus !== 'completed' && prevStatus !== 'due' && prevStatus !== 'needs_refreshing') {
        // Check if admin assigned this specific module (override)
        if (!moduleAssignments.has(mod.id)) {
          locked = true;
          lockReason = `Complete "${prevModule.title}" first`;
        }
      }
    }

    return {
      ...mod,
      user_status: userStatus,
      total_lessons: totalLessons,
      completed_lessons: lp.completed,
      started_lessons: lp.started,
      percentage: totalLessons > 0 ? Math.round((lp.completed / totalLessons) * 100) : 0,
      locked,
      lock_reason: lockReason,
      is_assigned: !!assignment,
      assignment,
      is_enrolled: mod.is_academic && mod.acc_course_id ? enrollments.has(mod.acc_course_id) : true,
    };
  });

  return NextResponse.json({ modules: enrichedModules });
}, { routeName: 'learn/user-progress' });

function getModuleStatus(mod: any, completionMap: Map<string, any>, progressMap: Map<string, any>): string {
  if (!mod) return 'not_started';
  const completion = completionMap.get(mod.id);
  const lp = progressMap.get(mod.id) || { completed: 0, started: 0 };
  if (completion?.is_current && completion.expires_at && new Date(completion.expires_at) > new Date()) return 'completed';
  if (completion?.completed_at) return 'due';
  if (lp.completed > 0 || lp.started > 0) return 'in_progress';
  return 'not_started';
}

/* ── POST: Record content interaction or update lesson status ── */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userEmail = session.user.email;
  const body = await req.json();
  const { action } = body;

  // Record a content interaction (user opened a link, watched a video, etc.)
  if (action === 'content_interaction') {
    const { lesson_id, module_id, interaction_key } = body;
    if (!lesson_id || !interaction_key) {
      return NextResponse.json({ error: 'lesson_id and interaction_key required' }, { status: 400 });
    }

    // Upsert lesson progress record
    const { data: existing } = await supabaseAdmin.from('user_lesson_progress')
      .select('*').eq('user_email', userEmail).eq('lesson_id', lesson_id).maybeSingle();

    const interactions = existing?.content_interactions || {};
    interactions[interaction_key] = true;

    if (existing) {
      const { data, error } = await supabaseAdmin.from('user_lesson_progress')
        .update({
          content_interactions: interactions,
          status: existing.status === 'not_started' ? 'in_progress' : existing.status,
          started_at: existing.started_at || new Date().toISOString(),
        })
        .eq('id', existing.id).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ progress: data });
    } else {
      const { data, error } = await supabaseAdmin.from('user_lesson_progress')
        .insert({
          user_email: userEmail,
          module_id: module_id,
          lesson_id: lesson_id,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          content_interactions: interactions,
        })
        .select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ progress: data });
    }
  }

  // Start a lesson (mark as in_progress)
  if (action === 'start_lesson') {
    const { lesson_id, module_id } = body;
    if (!lesson_id) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('user_lesson_progress')
      .upsert({
        user_email: userEmail,
        module_id: module_id,
        lesson_id: lesson_id,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      }, { onConflict: 'user_email,lesson_id' })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ progress: data });
  }

  // Check quiz unlock status
  if (action === 'check_quiz_unlock') {
    const { lesson_id } = body;
    if (!lesson_id) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });

    const { data: progress } = await supabaseAdmin.from('user_lesson_progress')
      .select('*').eq('user_email', userEmail).eq('lesson_id', lesson_id).maybeSingle();

    const { data: lesson } = await supabaseAdmin.from('learning_lessons')
      .select('resources, videos').eq('id', lesson_id).single();

    let resources: any[] = [];
    let videos: any[] = [];
    try { resources = typeof lesson?.resources === 'string' ? JSON.parse(lesson.resources) : (lesson?.resources || []); } catch { resources = []; }
    try { videos = typeof lesson?.videos === 'string' ? JSON.parse(lesson.videos) : (lesson?.videos || []); } catch { videos = []; }
    const totalRequired = resources.length + videos.length;
    const interactions = progress?.content_interactions || {};
    const completedCount = Object.keys(interactions).filter(k => interactions[k] === true).length;

    const unlocked = totalRequired === 0 || completedCount >= totalRequired;

    // Update quiz_unlocked flag
    if (unlocked && progress && !progress.quiz_unlocked) {
      await supabaseAdmin.from('user_lesson_progress')
        .update({ quiz_unlocked: true }).eq('id', progress.id);
    }

    return NextResponse.json({
      quiz_unlocked: unlocked,
      total_required: totalRequired,
      completed_count: completedCount,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}, { routeName: 'learn/user-progress' });
