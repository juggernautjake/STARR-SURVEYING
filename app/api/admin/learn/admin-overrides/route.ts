// app/api/admin/learn/admin-overrides/route.ts
// Admin-only: comprehensive student override system for access, completion, and grades
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { awardXP } from '@/lib/xp';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await req.json();
  const { action, user_email } = body;
  if (!user_email) return NextResponse.json({ error: 'user_email required' }, { status: 400 });
  const adminEmail = session.user.email;

  /* ── GET STUDENT OVERVIEW ── */
  if (action === 'get_student_overview') {
    const [
      modulesRes, lessonsRes, progressRes, completionsRes,
      assignmentsRes, quizAttemptsRes, flashcardDiscoveryRes,
      enrollmentsRes, xpRes,
    ] = await Promise.all([
      supabaseAdmin.from('learning_modules').select('id, title, order_index, difficulty, status').eq('status', 'published').order('order_index'),
      supabaseAdmin.from('learning_lessons').select('id, title, module_id, order_index, status').order('order_index'),
      supabaseAdmin.from('user_lesson_progress').select('*').eq('user_email', user_email),
      supabaseAdmin.from('module_completions').select('*').eq('user_email', user_email),
      supabaseAdmin.from('learning_assignments').select('*').eq('assigned_to', user_email).neq('status', 'cancelled'),
      supabaseAdmin.from('quiz_attempts').select('id, attempt_type, module_id, lesson_id, score_percent, correct_answers, total_questions, completed_at').eq('user_email', user_email).order('completed_at', { ascending: false }).limit(100),
      supabaseAdmin.from('user_flashcard_discovery').select('card_id').eq('user_email', user_email),
      supabaseAdmin.from('acc_course_enrollments').select('course_id').eq('user_email', user_email),
      supabaseAdmin.from('xp_transactions').select('points').eq('user_email', user_email),
    ]);

    const modules = modulesRes.data || [];
    const lessons = lessonsRes.data || [];
    const progress = progressRes.data || [];
    const completions = completionsRes.data || [];
    const assignments = assignmentsRes.data || [];
    const quizAttempts = quizAttemptsRes.data || [];
    const flashcardDiscovery = flashcardDiscoveryRes.data || [];
    const enrollments = enrollmentsRes.data || [];
    const xpTransactions = xpRes.data || [];

    const totalXP = xpTransactions.reduce((sum: number, t: any) => sum + (t.points || 0), 0);
    const progressMap = new Map(progress.map((p: any) => [p.lesson_id, p]));
    const completionMap = new Map(completions.filter((c: any) => c.is_current).map((c: any) => [c.module_id, c]));

    // Quiz stats per lesson and module
    const quizByLesson = new Map<string, { attempts: number; bestScore: number; avgScore: number; totalScore: number }>();
    const quizByModule = new Map<string, { attempts: number; bestScore: number; avgScore: number; totalScore: number }>();
    for (const qa of quizAttempts) {
      if (qa.lesson_id) {
        const e = quizByLesson.get(qa.lesson_id) || { attempts: 0, bestScore: 0, avgScore: 0, totalScore: 0 };
        e.attempts++; e.totalScore += qa.score_percent || 0;
        e.bestScore = Math.max(e.bestScore, qa.score_percent || 0);
        e.avgScore = Math.round(e.totalScore / e.attempts);
        quizByLesson.set(qa.lesson_id, e);
      }
      if (qa.module_id) {
        const e = quizByModule.get(qa.module_id) || { attempts: 0, bestScore: 0, avgScore: 0, totalScore: 0 };
        e.attempts++; e.totalScore += qa.score_percent || 0;
        e.bestScore = Math.max(e.bestScore, qa.score_percent || 0);
        e.avgScore = Math.round(e.totalScore / e.attempts);
        quizByModule.set(qa.module_id, e);
      }
    }

    const enrichedModules = modules.map((mod: any) => {
      const modLessons = lessons.filter((l: any) => l.module_id === mod.id && l.status === 'published');
      const completion = completionMap.get(mod.id);
      const modAssignments = assignments.filter((a: any) => a.module_id === mod.id);
      const quizStats = quizByModule.get(mod.id);

      const enrichedLessons = modLessons.map((lesson: any) => {
        const lp = progressMap.get(lesson.id) as any;
        const lessonQuiz = quizByLesson.get(lesson.id);
        const lessonAssignment = modAssignments.find((a: any) => a.lesson_id === lesson.id);
        return {
          id: lesson.id,
          title: lesson.title,
          order_index: lesson.order_index,
          status: lp?.status || 'not_started',
          quiz_unlocked: lp?.quiz_unlocked || false,
          started_at: lp?.started_at || null,
          completed_at: lp?.completed_at || null,
          is_assigned: !!lessonAssignment,
          quiz_stats: lessonQuiz || null,
        };
      });

      const completedLessons = enrichedLessons.filter((l: any) => l.status === 'completed').length;
      return {
        id: mod.id,
        title: mod.title,
        order_index: mod.order_index,
        difficulty: mod.difficulty,
        is_completed: !!completion,
        completion,
        is_assigned: modAssignments.some((a: any) => !a.lesson_id),
        total_lessons: enrichedLessons.length,
        completed_lessons: completedLessons,
        lessons: enrichedLessons,
        quiz_stats: quizStats || null,
      };
    });

    return NextResponse.json({
      user_email,
      total_xp: totalXP,
      modules: enrichedModules,
      flashcards_discovered: flashcardDiscovery.length,
      enrollments: enrollments.map((e: any) => e.course_id),
      quiz_attempts_count: quizAttempts.length,
      overall_avg_score: quizAttempts.length > 0
        ? Math.round(quizAttempts.reduce((s: number, a: any) => s + (a.score_percent || 0), 0) / quizAttempts.length)
        : null,
    });
  }

  /* ── UNLOCK MODULE ── */
  if (action === 'unlock_module') {
    const { module_id, unlock_all_lessons } = body;
    if (!module_id) return NextResponse.json({ error: 'module_id required' }, { status: 400 });

    // Create module-level assignment to bypass module lock
    await supabaseAdmin.from('learning_assignments').insert({
      assigned_to: user_email,
      assigned_by: adminEmail,
      module_id,
      lesson_id: null,
      unlock_next: false,
      notes: unlock_all_lessons ? 'Admin override: full module unlock' : 'Admin override: module unlock',
      status: 'in_progress',
    });

    // If unlock all lessons, create per-lesson assignments
    if (unlock_all_lessons) {
      const { data: moduleLessons } = await supabaseAdmin.from('learning_lessons')
        .select('id').eq('module_id', module_id).eq('status', 'published');
      for (const lesson of (moduleLessons || [])) {
        await supabaseAdmin.from('learning_assignments').insert({
          assigned_to: user_email,
          assigned_by: adminEmail,
          module_id,
          lesson_id: lesson.id,
          unlock_next: false,
          notes: 'Admin override: lesson unlock (module-wide)',
          status: 'in_progress',
        });
      }
    }

    await logOverride(adminEmail, 'module', module_id, 'unlock_module', user_email, { unlock_all_lessons });
    return NextResponse.json({ success: true, message: unlock_all_lessons ? 'Module and all lessons unlocked' : 'Module unlocked' });
  }

  /* ── UNLOCK LESSON ── */
  if (action === 'unlock_lesson') {
    const { module_id, lesson_id } = body;
    if (!lesson_id) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });

    await supabaseAdmin.from('learning_assignments').insert({
      assigned_to: user_email,
      assigned_by: adminEmail,
      module_id: module_id || null,
      lesson_id,
      unlock_next: false,
      notes: 'Admin override: lesson unlock',
      status: 'in_progress',
    });

    await logOverride(adminEmail, 'lesson', lesson_id, 'unlock_lesson', user_email);
    return NextResponse.json({ success: true });
  }

  /* ── FORCE QUIZ UNLOCK ── */
  if (action === 'force_quiz_unlock') {
    const { lesson_id, module_id } = body;
    if (!lesson_id) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });

    const { data: existing } = await supabaseAdmin.from('user_lesson_progress')
      .select('id').eq('user_email', user_email).eq('lesson_id', lesson_id).maybeSingle();

    if (existing) {
      await supabaseAdmin.from('user_lesson_progress')
        .update({ quiz_unlocked: true }).eq('id', (existing as any).id);
    } else {
      await supabaseAdmin.from('user_lesson_progress').insert({
        user_email, module_id: module_id || null, lesson_id,
        status: 'in_progress', started_at: new Date().toISOString(), quiz_unlocked: true,
      });
    }

    await logOverride(adminEmail, 'lesson', lesson_id, 'force_quiz_unlock', user_email);
    return NextResponse.json({ success: true });
  }

  /* ── MARK LESSON COMPLETE ── */
  if (action === 'mark_lesson_complete') {
    const { lesson_id, module_id } = body;
    if (!lesson_id) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });
    const now = new Date().toISOString();

    const { data: existing } = await supabaseAdmin.from('user_lesson_progress')
      .select('id').eq('user_email', user_email).eq('lesson_id', lesson_id).maybeSingle();

    if (existing) {
      await supabaseAdmin.from('user_lesson_progress')
        .update({ status: 'completed', completed_at: now, quiz_unlocked: true }).eq('id', (existing as any).id);
    } else {
      await supabaseAdmin.from('user_lesson_progress').insert({
        user_email, module_id: module_id || null, lesson_id,
        status: 'completed', started_at: now, completed_at: now, quiz_unlocked: true,
      });
    }
    await supabaseAdmin.from('user_progress')
      .upsert({ user_email, module_id: module_id || null, lesson_id }, { onConflict: 'user_email,lesson_id' });

    await logOverride(adminEmail, 'lesson', lesson_id, 'mark_lesson_complete', user_email);
    return NextResponse.json({ success: true });
  }

  /* ── MARK LESSON INCOMPLETE ── */
  if (action === 'mark_lesson_incomplete') {
    const { lesson_id } = body;
    if (!lesson_id) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });

    const { data: existing } = await supabaseAdmin.from('user_lesson_progress')
      .select('id').eq('user_email', user_email).eq('lesson_id', lesson_id).maybeSingle();

    if (existing) {
      await supabaseAdmin.from('user_lesson_progress')
        .update({ status: 'in_progress', completed_at: null }).eq('id', (existing as any).id);
    }
    await supabaseAdmin.from('user_progress')
      .delete().eq('user_email', user_email).eq('lesson_id', lesson_id);

    await logOverride(adminEmail, 'lesson', lesson_id, 'mark_lesson_incomplete', user_email);
    return NextResponse.json({ success: true });
  }

  /* ── MARK MODULE COMPLETE ── */
  if (action === 'mark_module_complete') {
    const { module_id } = body;
    if (!module_id) return NextResponse.json({ error: 'module_id required' }, { status: 400 });
    const now = new Date().toISOString();

    // Mark all lessons completed
    const { data: moduleLessons } = await supabaseAdmin.from('learning_lessons')
      .select('id').eq('module_id', module_id).eq('status', 'published');

    for (const lesson of (moduleLessons || [])) {
      const { data: existing } = await supabaseAdmin.from('user_lesson_progress')
        .select('id').eq('user_email', user_email).eq('lesson_id', lesson.id).maybeSingle();
      if (existing) {
        await supabaseAdmin.from('user_lesson_progress')
          .update({ status: 'completed', completed_at: now, quiz_unlocked: true }).eq('id', (existing as any).id);
      } else {
        await supabaseAdmin.from('user_lesson_progress').insert({
          user_email, module_id, lesson_id: lesson.id,
          status: 'completed', started_at: now, completed_at: now, quiz_unlocked: true,
        });
      }
      await supabaseAdmin.from('user_progress')
        .upsert({ user_email, module_id, lesson_id: lesson.id }, { onConflict: 'user_email,lesson_id' });
    }

    // Create module completion record (with XP)
    const { data: existingCompletion } = await supabaseAdmin.from('module_completions')
      .select('id').eq('user_email', user_email).eq('module_id', module_id).eq('is_current', true).maybeSingle();

    if (!existingCompletion) {
      let xpValue = 500;
      let expiryMonths = 18;
      const { data: xpConfig } = await supabaseAdmin.from('module_xp_config')
        .select('xp_value, expiry_months').eq('module_type', 'learning_module')
        .eq('module_id', module_id).eq('is_active', true).maybeSingle();
      if (xpConfig) { xpValue = (xpConfig as any).xp_value; expiryMonths = (xpConfig as any).expiry_months; }

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

      await supabaseAdmin.from('module_completions').insert({
        user_email, module_type: 'learning_module', module_id,
        xp_earned: xpValue, expires_at: expiresAt.toISOString(), is_current: true,
      });
      try { await awardXP(user_email, xpValue, 'module_complete', 'learning_module', module_id, `Admin override: module completed (+${xpValue} XP)`); } catch { /* ignore */ }
    }

    await logOverride(adminEmail, 'module', module_id, 'mark_module_complete', user_email);
    return NextResponse.json({ success: true });
  }

  /* ── MARK MODULE INCOMPLETE ── */
  if (action === 'mark_module_incomplete') {
    const { module_id } = body;
    if (!module_id) return NextResponse.json({ error: 'module_id required' }, { status: 400 });

    await supabaseAdmin.from('module_completions')
      .delete().eq('user_email', user_email).eq('module_id', module_id);

    await logOverride(adminEmail, 'module', module_id, 'mark_module_incomplete', user_email);
    return NextResponse.json({ success: true });
  }

  /* ── MANUAL GRADE ── */
  if (action === 'manual_grade') {
    const { module_id, lesson_id, exam_category, score_percent, attempt_type } = body;
    if (score_percent === undefined) return NextResponse.json({ error: 'score_percent required' }, { status: 400 });

    const score = Math.max(0, Math.min(100, Math.round(score_percent)));
    const total = 10;
    const correct = Math.round((score / 100) * total);

    const { data: attempt, error: attemptErr } = await supabaseAdmin.from('quiz_attempts')
      .insert({
        user_email,
        attempt_type: attempt_type || 'lesson_quiz',
        module_id: module_id || null,
        lesson_id: lesson_id || null,
        exam_category: exam_category || null,
        total_questions: total,
        correct_answers: correct,
        score_percent: score,
        time_spent_seconds: 0,
      }).select().single();

    if (attemptErr) return NextResponse.json({ error: attemptErr.message }, { status: 500 });

    // Auto-complete lesson if passing
    if (score >= 70 && lesson_id && module_id) {
      const now = new Date().toISOString();
      const { data: existing } = await supabaseAdmin.from('user_lesson_progress')
        .select('id, status').eq('user_email', user_email).eq('lesson_id', lesson_id).maybeSingle();
      if (existing && (existing as any).status !== 'completed') {
        await supabaseAdmin.from('user_lesson_progress')
          .update({ status: 'completed', completed_at: now, quiz_unlocked: true }).eq('id', (existing as any).id);
      } else if (!existing) {
        await supabaseAdmin.from('user_lesson_progress').insert({
          user_email, module_id, lesson_id,
          status: 'completed', started_at: now, completed_at: now, quiz_unlocked: true,
        });
      }
    }

    await logOverride(adminEmail, 'quiz', (attempt as any)?.id, 'manual_grade', user_email, { score_percent: score, module_id, lesson_id });
    return NextResponse.json({ success: true, attempt });
  }

  /* ── GRANT FLASHCARD ACCESS ── */
  if (action === 'grant_flashcard_access') {
    const { module_id } = body;
    if (!module_id) return NextResponse.json({ error: 'module_id required' }, { status: 400 });

    const { data: cards } = await supabaseAdmin.from('flashcards')
      .select('id').eq('module_id', module_id);

    if (!cards || cards.length === 0) return NextResponse.json({ error: 'No flashcards found for this module' }, { status: 400 });

    const discoveries = cards.map((c: any) => ({
      user_email,
      card_id: c.id,
      card_source: 'builtin',
      module_id,
      next_yearly_review_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    }));
    await supabaseAdmin.from('user_flashcard_discovery')
      .upsert(discoveries, { onConflict: 'user_email,card_id' });

    await logOverride(adminEmail, 'flashcard', module_id, 'grant_flashcard_access', user_email, { count: cards.length });
    return NextResponse.json({ success: true, granted_count: cards.length });
  }

  /* ── RESET LESSON PROGRESS ── */
  if (action === 'reset_lesson_progress') {
    const { lesson_id } = body;
    if (!lesson_id) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });

    await supabaseAdmin.from('user_lesson_progress')
      .delete().eq('user_email', user_email).eq('lesson_id', lesson_id);
    await supabaseAdmin.from('user_progress')
      .delete().eq('user_email', user_email).eq('lesson_id', lesson_id);

    await logOverride(adminEmail, 'lesson', lesson_id, 'reset_lesson_progress', user_email);
    return NextResponse.json({ success: true });
  }

  /* ── RESET MODULE PROGRESS ── */
  if (action === 'reset_module_progress') {
    const { module_id } = body;
    if (!module_id) return NextResponse.json({ error: 'module_id required' }, { status: 400 });

    await supabaseAdmin.from('user_lesson_progress')
      .delete().eq('user_email', user_email).eq('module_id', module_id);
    await supabaseAdmin.from('user_progress')
      .delete().eq('user_email', user_email).eq('module_id', module_id);
    await supabaseAdmin.from('module_completions')
      .delete().eq('user_email', user_email).eq('module_id', module_id);
    await supabaseAdmin.from('learning_assignments')
      .update({ status: 'cancelled' }).eq('assigned_to', user_email).eq('module_id', module_id);

    await logOverride(adminEmail, 'module', module_id, 'reset_module_progress', user_email);
    return NextResponse.json({ success: true });
  }

  /* ── AWARD XP ── */
  if (action === 'award_xp') {
    const { points, reason } = body;
    if (!points || points <= 0) return NextResponse.json({ error: 'Valid points required (> 0)' }, { status: 400 });

    await awardXP(user_email, points, 'admin_award', 'manual', null,
      reason || `Admin award: ${points} XP by ${adminEmail}`);

    await logOverride(adminEmail, 'xp', null, 'award_xp', user_email, { points, reason });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}, { routeName: 'learn/admin-overrides' });

/* ── Helper: log admin override to activity_log ── */
async function logOverride(adminEmail: string, entityType: string, entityId: string | null, overrideType: string, targetUser: string, extra?: Record<string, any>) {
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: adminEmail,
      action_type: 'admin_override',
      entity_type: entityType,
      entity_id: entityId,
      metadata: { override_type: overrideType, target_user: targetUser, ...extra },
    });
  } catch { /* ignore */ }
}
