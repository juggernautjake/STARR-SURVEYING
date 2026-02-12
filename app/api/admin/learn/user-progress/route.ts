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
    // Non-admin users only see published lessons
    let lessonsQuery = supabaseAdmin.from('learning_lessons').select('id, title, order_index, estimated_minutes, resources, videos, status')
      .eq('module_id', moduleId);
    if (!isAdmin(userEmail)) {
      lessonsQuery = lessonsQuery.eq('status', 'published');
    }
    const [lessonsRes, progressRes, assignmentsRes, lessonQuizRes] = await Promise.all([
      lessonsQuery.order('order_index'),
      supabaseAdmin.from('user_lesson_progress').select('*').eq('user_email', email).eq('module_id', moduleId),
      supabaseAdmin.from('learning_assignments').select('*').eq('assigned_to', email)
        .eq('module_id', moduleId).neq('status', 'cancelled'),
      supabaseAdmin.from('quiz_attempts').select('lesson_id, score_percent').eq('user_email', email).eq('module_id', moduleId),
    ]);

    const lessons = lessonsRes.data || [];
    const progress = progressRes.data || [];
    const assignments = assignmentsRes.data || [];
    const progressMap = new Map<string, any>(progress.map((p: any) => [p.lesson_id, p]));
    const assignmentMap = new Map<string, any>(assignments.filter((a: any) => a.lesson_id).map((a: any) => [a.lesson_id, a]));
    // Module-level assignment means admin has granted access to the module (bypass lesson locks)
    const hasModuleOverride = assignments.some((a: any) => !a.lesson_id);

    // Build per-lesson quiz stats
    const lessonQuizMap = new Map<string, { attempts: number; totalScore: number }>();
    for (const qa of (lessonQuizRes.data || [])) {
      if (!qa.lesson_id) continue;
      const entry = lessonQuizMap.get(qa.lesson_id) || { attempts: 0, totalScore: 0 };
      entry.attempts++;
      entry.totalScore += qa.score_percent || 0;
      lessonQuizMap.set(qa.lesson_id, entry);
    }

    const enrichedLessons = lessons.map((lesson: any, idx: number) => {
      const lp: any = progressMap.get(lesson.id);
      const assignment = assignmentMap.get(lesson.id);
      const prevLesson = idx > 0 ? lessons[idx - 1] : null;
      const prevProgress: any = prevLesson ? progressMap.get(prevLesson.id) : null;

      // Count required content interactions
      let resources: any[] = [];
      let videos: any[] = [];
      try { resources = typeof lesson.resources === 'string' ? JSON.parse(lesson.resources) : (lesson.resources || []); } catch { resources = []; }
      try { videos = typeof lesson.videos === 'string' ? JSON.parse(lesson.videos) : (lesson.videos || []); } catch { videos = []; }
      const totalInteractions = resources.length + videos.length;
      const interactions: Record<string, boolean> = lp?.content_interactions || {};
      const completedInteractions = Object.keys(interactions).filter(k => interactions[k] === true).length;

      // Locking logic (module-level override bypasses all lesson locks)
      let locked = false;
      let lockReason = '';
      if (idx > 0 && !assignment && !hasModuleOverride) {
        if (!prevProgress || prevProgress.status !== 'completed') {
          locked = true;
          lockReason = `Complete "${prevLesson.title}" first`;
        }
      }

      const lqStats = lessonQuizMap.get(lesson.id);
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
        avg_quiz_score: lqStats ? Math.round(lqStats.totalScore / lqStats.attempts) : null,
        quiz_attempts: lqStats?.attempts || 0,
      };
    });

    return NextResponse.json({ lessons: enrichedLessons });
  }

  // Otherwise: return all modules with status for the user
  // Non-admin users only see published lessons in lesson counts
  let lessonCountQuery = supabaseAdmin.from('learning_lessons').select('id, module_id');
  if (!isAdmin(userEmail)) {
    lessonCountQuery = lessonCountQuery.eq('status', 'published');
  }
  const [modulesRes, completionsRes, lessonCountRes, lessonProgressRes, assignmentsRes, enrollmentsRes, quizAttemptsRes] = await Promise.all([
    supabaseAdmin.from('learning_modules').select('*').eq('status', 'published').order('order_index'),
    supabaseAdmin.from('module_completions').select('*').eq('user_email', email).eq('module_type', 'learning_module'),
    lessonCountQuery,
    supabaseAdmin.from('user_lesson_progress').select('lesson_id, module_id, status').eq('user_email', email),
    supabaseAdmin.from('learning_assignments').select('*').eq('assigned_to', email).neq('status', 'cancelled'),
    supabaseAdmin.from('acc_course_enrollments').select('course_id').eq('user_email', email),
    supabaseAdmin.from('quiz_attempts').select('module_id, lesson_id, score_percent').eq('user_email', email),
  ]);

  const modules = modulesRes.data || [];
  const completions = completionsRes.data || [];
  const allLessons = lessonCountRes.data || [];
  const allProgress = lessonProgressRes.data || [];
  const assignments = assignmentsRes.data || [];
  const enrollments = new Set((enrollmentsRes.data || []).map((e: any) => e.course_id));

  // Build quiz stats per module: { total_attempts, total_score, avg_quiz_score }
  const moduleQuizMap = new Map<string, { attempts: number; totalScore: number }>();
  for (const qa of (quizAttemptsRes.data || [])) {
    if (!qa.module_id) continue;
    const entry = moduleQuizMap.get(qa.module_id) || { attempts: 0, totalScore: 0 };
    entry.attempts++;
    entry.totalScore += qa.score_percent || 0;
    moduleQuizMap.set(qa.module_id, entry);
  }

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

    const quizStats = moduleQuizMap.get(mod.id);
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
      avg_quiz_score: quizStats ? Math.round(quizStats.totalScore / quizStats.attempts) : null,
      quiz_attempts: quizStats?.attempts || 0,
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
    const { data: existingRaw } = await supabaseAdmin.from('user_lesson_progress')
      .select('*').eq('user_email', userEmail).eq('lesson_id', lesson_id).maybeSingle();
    const existing = existingRaw as any;

    const interactions: Record<string, boolean> = existing?.content_interactions || {};
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

    const { data: progressRaw } = await supabaseAdmin.from('user_lesson_progress')
      .select('*').eq('user_email', userEmail).eq('lesson_id', lesson_id).maybeSingle();
    const progress = progressRaw as any;

    const { data: lessonRaw } = await supabaseAdmin.from('learning_lessons')
      .select('resources, videos').eq('id', lesson_id).single();
    const lesson = lessonRaw as any;

    let resources: any[] = [];
    let videos: any[] = [];
    try { resources = typeof lesson?.resources === 'string' ? JSON.parse(lesson.resources) : (lesson?.resources || []); } catch { resources = []; }
    try { videos = typeof lesson?.videos === 'string' ? JSON.parse(lesson.videos) : (lesson?.videos || []); } catch { videos = []; }

    // Check required articles
    const { data: requiredArticles } = await supabaseAdmin
      .from('lesson_required_articles')
      .select('article_id')
      .eq('lesson_id', lesson_id);
    let articlesRequired = 0;
    let articlesCompleted = 0;
    if (requiredArticles && requiredArticles.length > 0) {
      articlesRequired = requiredArticles.length;
      const articleIds = requiredArticles.map((r: any) => r.article_id);
      const { data: completions } = await supabaseAdmin
        .from('user_article_completions')
        .select('article_id')
        .eq('user_email', userEmail)
        .in('article_id', articleIds);
      articlesCompleted = completions?.length || 0;
    }

    const totalRequired = resources.length + videos.length + articlesRequired;
    const interactions: Record<string, boolean> = progress?.content_interactions || {};
    const completedCount = Object.keys(interactions).filter(k => interactions[k] === true).length + articlesCompleted;

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

  // Complete a lesson (for intro/no-quiz lessons)
  if (action === 'complete_lesson') {
    const { lesson_id, module_id } = body;
    if (!lesson_id || !module_id) {
      return NextResponse.json({ error: 'lesson_id and module_id required' }, { status: 400 });
    }

    // Verify this lesson has no quiz questions (only allow for no-quiz lessons)
    const { data: questionCount } = await supabaseAdmin.from('question_bank')
      .select('id', { count: 'exact' }).eq('lesson_id', lesson_id);
    if (questionCount && questionCount.length > 0) {
      return NextResponse.json({ error: 'This lesson has a quiz. Complete the quiz to finish the lesson.' }, { status: 400 });
    }

    // Mark user_lesson_progress as completed
    const { data: existingRaw } = await supabaseAdmin.from('user_lesson_progress')
      .select('*').eq('user_email', userEmail).eq('lesson_id', lesson_id).maybeSingle();
    const existing = existingRaw as any;
    const now = new Date().toISOString();

    if (existing) {
      await supabaseAdmin.from('user_lesson_progress')
        .update({ status: 'completed', completed_at: now })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin.from('user_lesson_progress')
        .insert({
          user_email: userEmail,
          module_id,
          lesson_id,
          status: 'completed',
          started_at: now,
          completed_at: now,
        });
    }

    // Also record in user_progress table (for progress API compatibility)
    await supabaseAdmin.from('user_progress')
      .upsert({ user_email: userEmail, module_id, lesson_id }, { onConflict: 'user_email,lesson_id' });

    return NextResponse.json({ completed: true });
  }

  if (action === 'block_analytics') {
    const { lesson_id, module_id, block_times, blocks_viewed, total_blocks, quiz_answer } = body;
    if (!lesson_id) {
      return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });
    }

    // If this is an inline quiz answer, log it separately for question analytics
    if (quiz_answer) {
      await supabaseAdmin.from('activity_log').insert({
        user_email: userEmail,
        action_type: 'inline_quiz_answer',
        entity_type: 'lesson_block',
        entity_id: quiz_answer.block_id,
        metadata: {
          lesson_id,
          module_id,
          question: quiz_answer.question,
          selected_option: quiz_answer.selected_option,
          correct_option: quiz_answer.correct_option,
          is_correct: quiz_answer.is_correct,
          timestamp: new Date().toISOString(),
        },
      });
      return NextResponse.json({ saved: true });
    }

    // Store block time analytics as an activity log entry
    if (block_times && Object.keys(block_times).length > 0) {
      await supabaseAdmin.from('activity_log').insert({
        user_email: userEmail,
        action_type: 'block_analytics',
        entity_type: 'lesson',
        entity_id: lesson_id,
        metadata: {
          module_id,
          block_times,
          blocks_viewed,
          total_blocks,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({ saved: true });
  }

  if (action === 'get_block_analytics') {
    // Admin only: fetch aggregated block analytics for a lesson
    const { lesson_id: targetLessonId } = body;
    if (!targetLessonId) {
      return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });
    }
    if (!isAdmin(userEmail)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: logs } = await supabaseAdmin.from('activity_log')
      .select('metadata, user_email, created_at')
      .eq('action_type', 'block_analytics')
      .eq('entity_id', targetLessonId)
      .order('created_at', { ascending: false })
      .limit(200);

    // Aggregate: per-block average time and view count
    const blockStats: Record<string, { totalTime: number; viewCount: number }> = {};
    let sessionCount = 0;
    for (const log of (logs || [])) {
      const meta = log.metadata as any;
      if (!meta?.block_times) continue;
      sessionCount++;
      for (const [blockId, seconds] of Object.entries(meta.block_times)) {
        if (!blockStats[blockId]) blockStats[blockId] = { totalTime: 0, viewCount: 0 };
        blockStats[blockId].totalTime += seconds as number;
        blockStats[blockId].viewCount++;
      }
    }

    const aggregated = Object.entries(blockStats).map(([blockId, stats]) => ({
      block_id: blockId,
      avg_time_seconds: Math.round(stats.totalTime / stats.viewCount),
      total_time_seconds: stats.totalTime,
      view_count: stats.viewCount,
    })).sort((a, b) => b.avg_time_seconds - a.avg_time_seconds);

    // Also fetch inline quiz answer stats for this lesson
    const { data: quizLogs } = await supabaseAdmin.from('activity_log')
      .select('metadata')
      .eq('action_type', 'inline_quiz_answer')
      .order('created_at', { ascending: false })
      .limit(500);

    // Filter to this lesson and aggregate
    const quizStats: Record<string, { attempts: number; correct: number; question: string }> = {};
    for (const log of (quizLogs || [])) {
      const meta = log.metadata as any;
      if (meta?.lesson_id !== targetLessonId) continue;
      const blockId = meta?.block_id || (log as any).entity_id;
      if (!blockId) continue;
      if (!quizStats[blockId]) quizStats[blockId] = { attempts: 0, correct: 0, question: meta.question || '' };
      quizStats[blockId].attempts++;
      if (meta.is_correct) quizStats[blockId].correct++;
    }

    const quizAnalytics = Object.entries(quizStats).map(([blockId, s]) => ({
      block_id: blockId,
      question: s.question,
      attempts: s.attempts,
      correct: s.correct,
      wrong: s.attempts - s.correct,
      pass_rate: Math.round((s.correct / s.attempts) * 100),
    })).sort((a, b) => a.pass_rate - b.pass_rate);

    return NextResponse.json({ analytics: aggregated, quiz_analytics: quizAnalytics, session_count: sessionCount });
  }

  // Admin-only: aggregated quiz attempt analytics (formal QuizRunner quizzes)
  if (action === 'get_quiz_analytics') {
    if (!isAdmin(userEmail)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { module_id: targetModuleId, lesson_id: targetLessonId, attempt_type } = body;

    let query = supabaseAdmin.from('quiz_attempts')
      .select('id, attempt_type, module_id, lesson_id, exam_category, total_questions, correct_answers, score_percent, time_spent_seconds, user_email, completed_at')
      .order('completed_at', { ascending: false })
      .limit(500);

    if (targetModuleId) query = query.eq('module_id', targetModuleId);
    if (targetLessonId) query = query.eq('lesson_id', targetLessonId);
    if (attempt_type) query = query.eq('attempt_type', attempt_type);

    const { data: attempts, error: attErr } = await query;
    if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });

    const allAttempts = attempts || [];
    const totalAttempts = allAttempts.length;
    const passedAttempts = allAttempts.filter((a: any) => a.score_percent >= 70).length;
    const avgScore = totalAttempts > 0 ? Math.round(allAttempts.reduce((sum: number, a: any) => sum + a.score_percent, 0) / totalAttempts) : 0;
    const avgTime = totalAttempts > 0 ? Math.round(allAttempts.reduce((sum: number, a: any) => sum + (a.time_spent_seconds || 0), 0) / totalAttempts) : 0;
    const uniqueUsers = new Set(allAttempts.map((a: any) => a.user_email)).size;

    // Group by quiz type / lesson
    const grouped: Record<string, { attempts: number; passed: number; totalScore: number; label: string }> = {};
    for (const a of allAttempts) {
      const key = a.lesson_id || a.module_id || a.exam_category || a.attempt_type || 'unknown';
      if (!grouped[key]) grouped[key] = { attempts: 0, passed: 0, totalScore: 0, label: key };
      grouped[key].attempts++;
      if (a.score_percent >= 70) grouped[key].passed++;
      grouped[key].totalScore += a.score_percent;
    }

    const breakdown = Object.entries(grouped).map(([key, g]) => ({
      key,
      label: g.label,
      attempts: g.attempts,
      passed: g.passed,
      failed: g.attempts - g.passed,
      avg_score: Math.round(g.totalScore / g.attempts),
      pass_rate: Math.round((g.passed / g.attempts) * 100),
    })).sort((a, b) => b.attempts - a.attempts);

    return NextResponse.json({
      summary: {
        total_attempts: totalAttempts,
        passed: passedAttempts,
        failed: totalAttempts - passedAttempts,
        pass_rate: totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0,
        avg_score: avgScore,
        avg_time_seconds: avgTime,
        unique_users: uniqueUsers,
      },
      breakdown,
      recent_attempts: allAttempts.slice(0, 20),
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}, { routeName: 'learn/user-progress' });
