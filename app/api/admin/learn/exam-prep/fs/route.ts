// app/api/admin/learn/exam-prep/fs/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { awardXP } from '@/lib/xp';

interface FSModule {
  id: string;
  module_number: number;
  title: string;
  description: string;
  week_range: string;
  exam_weight_percent: number;
  key_topics: string[];
  key_formulas: { name: string; formula: string }[];
  content_sections: { type: string; title: string; content: string }[];
  prerequisite_module: number | null;
  passing_score: number;
  question_count: number;
  icon: string;
}

interface FSProgress {
  module_id: string;
  status: string;
  quiz_best_score: number;
  quiz_attempts_count: number;
  started_at: string | null;
  completed_at: string | null;
}

/* GET — Fetch FS modules, progress, stats */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userEmail = session.user.email;
  const { searchParams } = new URL(req.url);
  const moduleId = searchParams.get('module_id');

  // Single module detail
  if (moduleId) {
    const { data: mod } = await supabaseAdmin.from('fs_study_modules')
      .select('*').eq('id', moduleId).single();
    if (!mod) return NextResponse.json({ error: 'Module not found' }, { status: 404 });

    const { data: progress } = await supabaseAdmin.from('fs_module_progress')
      .select('*').eq('user_email', userEmail).eq('module_id', moduleId).maybeSingle();

    // Get question count for this module
    const { data: questions } = await supabaseAdmin.from('question_bank')
      .select('id', { count: 'exact' }).eq('module_id', moduleId).eq('exam_category', 'FS');

    // Get quiz attempts for this module
    const { data: attempts } = await supabaseAdmin.from('quiz_attempts')
      .select('*').eq('user_email', userEmail).eq('module_id', moduleId)
      .order('completed_at', { ascending: false }).limit(10);

    // Get weak areas
    const { data: weakAreas } = await supabaseAdmin.from('fs_weak_areas')
      .select('*').eq('user_email', userEmail).eq('module_number', mod.module_number);

    return NextResponse.json({
      module: mod,
      progress: progress || { status: mod.module_number === 1 ? 'available' : 'locked', quiz_best_score: 0, quiz_attempts_count: 0 },
      question_count: questions?.length || 0,
      recent_attempts: attempts || [],
      weak_areas: weakAreas || [],
    });
  }

  // All modules with progress
  const { data: modules } = await supabaseAdmin.from('fs_study_modules')
    .select('id, module_number, title, description, week_range, exam_weight_percent, key_topics, icon, prerequisite_module, passing_score, question_count')
    .order('module_number');

  const { data: progressData } = await supabaseAdmin.from('fs_module_progress')
    .select('*').eq('user_email', userEmail);

  const { data: mockAttempts } = await supabaseAdmin.from('fs_mock_exam_attempts')
    .select('*').eq('user_email', userEmail)
    .order('completed_at', { ascending: false }).limit(5);

  // Get quiz attempts for FS exams
  const { data: quizAttempts } = await supabaseAdmin.from('quiz_attempts')
    .select('*').eq('user_email', userEmail).eq('exam_category', 'FS')
    .order('completed_at', { ascending: false }).limit(20);

  const progressMap = new Map<string, FSProgress>();
  (progressData || []).forEach((p: FSProgress) => progressMap.set(p.module_id, p));

  const moduleList = (modules || []) as FSModule[];

  // Build modules with progress
  const modulesWithProgress = moduleList.map((mod: FSModule) => {
    const progress = progressMap.get(mod.id);
    let status = 'locked';
    if (progress) {
      status = progress.status;
    } else if (mod.module_number === 1) {
      status = 'available'; // First module always available
    }

    return {
      id: mod.id,
      module_number: mod.module_number,
      title: mod.title,
      description: mod.description,
      week_range: mod.week_range,
      exam_weight_percent: mod.exam_weight_percent,
      key_topics: mod.key_topics,
      icon: mod.icon,
      prerequisite_module: mod.prerequisite_module,
      passing_score: mod.passing_score,
      question_count: mod.question_count,
      status,
      quiz_best_score: progress?.quiz_best_score || 0,
      quiz_attempts_count: progress?.quiz_attempts_count || 0,
      completed_at: progress?.completed_at || null,
    };
  });

  // Calculate overall stats
  const completedModules = modulesWithProgress.filter(m => m.status === 'completed').length;
  const totalModules = modulesWithProgress.length;
  const avgScore = modulesWithProgress.reduce((sum, m) => sum + m.quiz_best_score, 0) / Math.max(totalModules, 1);

  // Calculate readiness score (weighted by exam weight)
  let readinessScore = 0;
  let totalWeight = 0;
  for (const mod of modulesWithProgress) {
    if (mod.status === 'completed') {
      readinessScore += (mod.quiz_best_score / 100) * mod.exam_weight_percent;
    }
    totalWeight += mod.exam_weight_percent;
  }
  const readinessPercent = totalWeight > 0 ? Math.round((readinessScore / totalWeight) * 100) : 0;

  return NextResponse.json({
    modules: modulesWithProgress,
    stats: {
      total_modules: totalModules,
      completed_modules: completedModules,
      overall_readiness: readinessPercent,
      average_score: Math.round(avgScore),
      total_quiz_attempts: quizAttempts?.length || 0,
      mock_exams_taken: mockAttempts?.length || 0,
      best_mock_score: mockAttempts && mockAttempts.length > 0
        ? Math.max(...mockAttempts.map((a: { score_percent: number }) => a.score_percent))
        : 0,
    },
    mock_attempts: mockAttempts || [],
    recent_quiz_attempts: quizAttempts || [],
  });
}, { routeName: 'learn/exam-prep/fs' });

/* POST — Update module progress (start, complete) */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userEmail = session.user.email;
  const body = await req.json();
  const { action, module_id, quiz_score, weak_topics } = body;

  if (action === 'start_module') {
    // Mark module as in_progress
    const { data, error } = await supabaseAdmin.from('fs_module_progress')
      .upsert({
        user_email: userEmail,
        module_id,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      }, { onConflict: 'user_email,module_id' })
      .select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ progress: data });
  }

  if (action === 'complete_quiz') {
    if (!module_id || quiz_score === undefined) {
      return NextResponse.json({ error: 'module_id and quiz_score required' }, { status: 400 });
    }

    // Get module info
    const { data: mod } = await supabaseAdmin.from('fs_study_modules')
      .select('module_number, passing_score').eq('id', module_id).single();
    if (!mod) return NextResponse.json({ error: 'Module not found' }, { status: 404 });

    // Get current progress
    const { data: current } = await supabaseAdmin.from('fs_module_progress')
      .select('*').eq('user_email', userEmail).eq('module_id', module_id).maybeSingle();

    const passed = quiz_score >= (mod.passing_score || 70);
    const newBestScore = Math.max(quiz_score, current?.quiz_best_score || 0);
    const newAttempts = (current?.quiz_attempts_count || 0) + 1;

    // Update current module progress
    const newStatus = passed ? 'completed' : 'in_progress';
    await supabaseAdmin.from('fs_module_progress')
      .upsert({
        user_email: userEmail,
        module_id,
        status: newStatus,
        quiz_best_score: newBestScore,
        quiz_attempts_count: newAttempts,
        started_at: current?.started_at || new Date().toISOString(),
        completed_at: passed ? new Date().toISOString() : null,
      }, { onConflict: 'user_email,module_id' });

    // If passed, unlock the next module
    if (passed) {
      const nextModuleNumber = mod.module_number + 1;
      const { data: nextMod } = await supabaseAdmin.from('fs_study_modules')
        .select('id').eq('module_number', nextModuleNumber).maybeSingle();

      if (nextMod) {
        // Only unlock if not already started/completed
        const { data: nextProgress } = await supabaseAdmin.from('fs_module_progress')
          .select('status').eq('user_email', userEmail).eq('module_id', nextMod.id).maybeSingle();

        if (!nextProgress || nextProgress.status === 'locked') {
          await supabaseAdmin.from('fs_module_progress')
            .upsert({
              user_email: userEmail,
              module_id: nextMod.id,
              status: 'available',
            }, { onConflict: 'user_email,module_id' });
        }
      }
    }

    // Update weak areas based on missed topics
    if (weak_topics && Array.isArray(weak_topics)) {
      for (const topic of weak_topics) {
        await supabaseAdmin.from('fs_weak_areas')
          .upsert({
            user_email: userEmail,
            module_number: mod.module_number,
            topic: topic.topic,
            weakness_score: topic.score,
            questions_attempted: topic.attempted,
            questions_correct: topic.correct,
            last_assessed_at: new Date().toISOString(),
          }, { onConflict: 'user_email,module_number,topic' });
      }
    }

    // Award XP for passing FS module (only first completion)
    let xpAwarded = 0;
    if (passed) {
      try {
        const { data: existingCompletion } = await supabaseAdmin.from('module_completions')
          .select('id').eq('user_email', userEmail)
          .eq('module_id', module_id).eq('is_current', true).maybeSingle();

        if (!existingCompletion) {
          // Look up XP config for this FS module
          let xpValue = 500;
          let expiryMonths = 24;
          const { data: specificConfig } = await supabaseAdmin.from('module_xp_config')
            .select('xp_value, expiry_months').eq('module_type', 'fs_module')
            .eq('module_id', module_id).eq('is_active', true).maybeSingle();

          if (specificConfig) {
            xpValue = specificConfig.xp_value;
            expiryMonths = specificConfig.expiry_months;
          } else {
            const { data: defaultConfig } = await supabaseAdmin.from('module_xp_config')
              .select('xp_value, expiry_months').eq('module_type', 'fs_module')
              .is('module_id', null).eq('is_active', true).maybeSingle();
            if (defaultConfig) {
              xpValue = defaultConfig.xp_value;
              expiryMonths = defaultConfig.expiry_months;
            }
          }

          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

          await awardXP(
            userEmail, xpValue, 'module_complete', 'fs_module', module_id,
            `FS Module ${mod.module_number} completed with ${quiz_score}% (+${xpValue} XP)`
          );

          await supabaseAdmin.from('module_completions').insert({
            user_email: userEmail,
            module_type: 'fs_module',
            module_id,
            xp_earned: xpValue,
            expires_at: expiresAt.toISOString(),
            is_current: true,
          });

          xpAwarded = xpValue;

          // Check if ALL 8 FS modules are now completed
          const { data: allProgress } = await supabaseAdmin.from('fs_module_progress')
            .select('status').eq('user_email', userEmail);
          const completedCount = (allProgress || []).filter((p: { status: string }) => p.status === 'completed').length;

          if (completedCount >= 8) {
            // Award "FS Scholar" badge (all modules complete)
            try {
              const { data: scholarBadge } = await supabaseAdmin.from('badges')
                .select('id, xp_reward').eq('badge_key', 'fs_all_modules').maybeSingle();
              if (scholarBadge) {
                const { data: alreadyEarned } = await supabaseAdmin.from('user_badges')
                  .select('id').eq('user_email', userEmail).eq('badge_id', scholarBadge.id).maybeSingle();
                if (!alreadyEarned) {
                  await supabaseAdmin.from('user_badges').insert({
                    user_email: userEmail, badge_id: scholarBadge.id,
                  });
                  if (scholarBadge.xp_reward > 0) {
                    await awardXP(userEmail, scholarBadge.xp_reward, 'badge_earned', 'badge', scholarBadge.id,
                      `Badge earned: FS Scholar (+${scholarBadge.xp_reward} XP)`);
                  }
                }
              }
            } catch { /* ignore badge errors */ }
          }
        }
      } catch { /* XP awards are supplementary */ }
    }

    return NextResponse.json({
      passed,
      score: quiz_score,
      best_score: newBestScore,
      attempts: newAttempts,
      status: newStatus,
      next_module_unlocked: passed,
      xp_awarded: xpAwarded,
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}, { routeName: 'learn/exam-prep/fs' });
