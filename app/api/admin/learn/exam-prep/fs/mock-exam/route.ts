// app/api/admin/learn/exam-prep/fs/mock-exam/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { awardXP } from '@/lib/xp';

/* GET — Generate a mock exam (110 questions from FS-MOCK category) */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch all FS mock exam questions
  const { data: allQuestions, error } = await supabaseAdmin.from('question_bank')
    .select('id, question_text, question_type, options, difficulty, tags')
    .eq('exam_category', 'FS-MOCK');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!allQuestions || allQuestions.length === 0) {
    return NextResponse.json({ questions: [], message: 'No mock exam questions available yet.' });
  }

  // Shuffle and select up to 110 questions
  const shuffled = allQuestions.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(110, shuffled.length));

  // Strip correct answers for client
  const clientQuestions = selected.map((q: {
    id: string;
    question_text: string;
    question_type: string;
    options: string[] | string;
    difficulty: string;
    tags: string[];
  }) => {
    const opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
    return {
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.question_type === 'multiple_choice' || q.question_type === 'true_false'
        ? opts.sort(() => Math.random() - 0.5) : opts,
      difficulty: q.difficulty,
      tags: q.tags,
    };
  });

  return NextResponse.json({
    questions: clientQuestions,
    total_available: allQuestions.length,
    time_limit_seconds: 19200, // 320 minutes
  });
}, { routeName: 'learn/exam-prep/fs/mock-exam' });

/* POST — Grade and save mock exam */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { answers, time_spent_seconds } = body;

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'No answers provided' }, { status: 400 });
  }

  // Fetch correct answers
  const questionIds = answers.map((a: { question_id: string }) => a.question_id);
  const { data: questions, error } = await supabaseAdmin.from('question_bank')
    .select('id, question_type, correct_answer, explanation, tags')
    .in('id', questionIds);

  if (error || !questions) {
    return NextResponse.json({ error: 'Failed to grade exam' }, { status: 500 });
  }

  const qMap = new Map<string, {
    id: string;
    question_type: string;
    correct_answer: string;
    explanation: string;
    tags: string[];
  }>(questions.map((q: {
    id: string;
    question_type: string;
    correct_answer: string;
    explanation: string;
    tags: string[];
  }) => [q.id, q]));

  // Grade each answer and track by category
  const categoryScores: Record<string, { correct: number; total: number }> = {};
  const graded = answers.map((a: { question_id: string; user_answer: string }) => {
    const q = qMap.get(a.question_id);
    if (!q) return { question_id: a.question_id, user_answer: a.user_answer, is_correct: false, correct_answer: '', explanation: '' };

    // Determine category from tags
    const tags = q.tags || [];
    let category = 'general';
    for (const tag of tags) {
      if (tag.startsWith('fs-mock-')) {
        category = tag.replace('fs-mock-', '');
        break;
      }
    }

    if (!categoryScores[category]) categoryScores[category] = { correct: 0, total: 0 };
    categoryScores[category].total++;

    const isCorrect = a.user_answer?.toLowerCase().trim() === q.correct_answer?.toLowerCase().trim();
    if (isCorrect) categoryScores[category].correct++;

    return {
      question_id: a.question_id,
      user_answer: a.user_answer,
      is_correct: isCorrect,
      correct_answer: q.correct_answer,
      explanation: q.explanation || '',
      category,
    };
  });

  const correctCount = graded.filter((g: { is_correct: boolean }) => g.is_correct).length;
  const scorePercent = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0;
  const passed = scorePercent >= 70;

  // Build category score percentages
  const categoryResults: Record<string, { correct: number; total: number; percent: number }> = {};
  for (const [cat, scores] of Object.entries(categoryScores)) {
    categoryResults[cat] = {
      ...scores,
      percent: scores.total > 0 ? Math.round((scores.correct / scores.total) * 100) : 0,
    };
  }

  // Save mock exam attempt
  const { data: attempt } = await supabaseAdmin.from('fs_mock_exam_attempts')
    .insert({
      user_email: session.user.email,
      total_questions: answers.length,
      correct_answers: correctCount,
      score_percent: scorePercent,
      time_spent_seconds: time_spent_seconds || 0,
      time_limit_seconds: 19200,
      category_scores: categoryResults,
      passed,
    })
    .select().single();

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'mock_exam_completed',
      entity_type: 'fs_mock_exam',
      entity_id: attempt?.id || 'unknown',
      metadata: { score_percent: scorePercent, correct: correctCount, total: answers.length, passed },
    });
  } catch { /* ignore */ }

  // Award XP and badges for passing mock exam
  let xpAwarded = 0;
  let badgesAwarded: string[] = [];
  if (passed) {
    try {
      // Award mock exam pass XP (one-time)
      await awardXP(
        session.user.email, 1000, 'mock_exam_pass', 'fs_mock_exam', attempt?.id || 'mock',
        `FS Mock Exam passed with ${scorePercent}% (+1000 XP)`
      );
      xpAwarded = 1000;

      // Check if all 8 modules are completed too → award FS Ready badge
      const { data: allProgress } = await supabaseAdmin.from('fs_module_progress')
        .select('status').eq('user_email', session.user.email);
      const completedModuleCount = (allProgress || []).filter((p: { status: string }) => p.status === 'completed').length;

      if (completedModuleCount >= 8) {
        // Award "FS Exam Ready" badge (all modules + mock passed)
        const { data: fsReadyBadge } = await supabaseAdmin.from('badges')
          .select('id, xp_reward, name').eq('badge_key', 'fs_ready').maybeSingle();
        if (fsReadyBadge) {
          const { data: alreadyEarned } = await supabaseAdmin.from('user_badges')
            .select('id').eq('user_email', session.user.email).eq('badge_id', fsReadyBadge.id).maybeSingle();
          if (!alreadyEarned) {
            await supabaseAdmin.from('user_badges').insert({
              user_email: session.user.email, badge_id: fsReadyBadge.id,
            });
            if (fsReadyBadge.xp_reward > 0) {
              await awardXP(session.user.email, fsReadyBadge.xp_reward, 'badge_earned', 'badge', fsReadyBadge.id,
                `Badge earned: FS Exam Ready (+${fsReadyBadge.xp_reward} XP)`);
              xpAwarded += fsReadyBadge.xp_reward;
            }
            badgesAwarded.push('fs_ready');

            // Notify user
            await supabaseAdmin.from('notifications').insert({
              user_email: session.user.email,
              type: 'badge_earned',
              title: 'FS Exam Ready!',
              message: `Congratulations! You've completed all 8 FS prep modules and passed the mock exam. You are now FS Exam Ready! The company will cover your FS exam fee.`,
              is_read: false,
            }).catch(() => {});
          }
        }
      }

      // Check for perfect score badge (90%+)
      if (scorePercent >= 90) {
        const { data: aceBadge } = await supabaseAdmin.from('badges')
          .select('id, xp_reward').eq('badge_key', 'fs_perfect_mock').maybeSingle();
        if (aceBadge) {
          const { data: alreadyEarned } = await supabaseAdmin.from('user_badges')
            .select('id').eq('user_email', session.user.email).eq('badge_id', aceBadge.id).maybeSingle();
          if (!alreadyEarned) {
            await supabaseAdmin.from('user_badges').insert({
              user_email: session.user.email, badge_id: aceBadge.id,
            });
            if (aceBadge.xp_reward > 0) {
              await awardXP(session.user.email, aceBadge.xp_reward, 'badge_earned', 'badge', aceBadge.id,
                `Badge earned: FS Ace (+${aceBadge.xp_reward} XP)`);
              xpAwarded += aceBadge.xp_reward;
            }
            badgesAwarded.push('fs_perfect_mock');
          }
        }
      }
    } catch { /* XP/badge awards are supplementary */ }
  }

  return NextResponse.json({
    attempt_id: attempt?.id,
    total_questions: answers.length,
    correct_answers: correctCount,
    score_percent: scorePercent,
    passed,
    results: graded,
    category_scores: categoryResults,
    time_spent_seconds: time_spent_seconds || 0,
    xp_awarded: xpAwarded,
    badges_awarded: badgesAwarded,
  });
}, { routeName: 'learn/exam-prep/fs/mock-exam' });
