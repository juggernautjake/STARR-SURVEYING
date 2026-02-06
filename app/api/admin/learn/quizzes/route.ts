// app/api/admin/learn/quizzes/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET — Generate a quiz OR fetch quiz history
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const history = searchParams.get('history');
  const attemptId = searchParams.get('attempt_id');

  // Fetch detailed answers for a specific attempt
  if (attemptId) {
    const { data: answers, error } = await supabaseAdmin
      .from('quiz_attempt_answers')
      .select('question_id, user_answer, is_correct')
      .eq('attempt_id', attemptId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with question text, correct answer, and explanation
    const questionIds = (answers || []).map((a: any) => a.question_id);
    let questionsMap = new Map<string, any>();
    if (questionIds.length > 0) {
      const { data: questions } = await supabaseAdmin
        .from('question_bank')
        .select('id, question_text, correct_answer, explanation')
        .in('id', questionIds);
      (questions || []).forEach((q: any) => questionsMap.set(q.id, q));
    }

    const enriched = (answers || []).map((a: any) => {
      const q = questionsMap.get(a.question_id);
      return {
        question_id: a.question_id,
        question_text: q?.question_text || 'Question not found',
        user_answer: a.user_answer,
        correct_answer: q?.correct_answer || '',
        is_correct: a.is_correct,
        explanation: q?.explanation || '',
      };
    });

    return NextResponse.json({ answers: enriched });
  }

  // Fetch quiz history
  if (history) {
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const userEmail = searchParams.get('user_email');

    let targetEmail = session.user.email;
    // Admins can view other users' history
    if (userEmail && isAdmin(session.user.email)) {
      targetEmail = userEmail;
    }

    const { data: attempts, error } = await supabaseAdmin
      .from('quiz_attempts')
      .select('*')
      .eq('user_email', targetEmail)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ attempts: attempts || [] });
  }

  // Generate a quiz (existing logic)
  const type = searchParams.get('type');
  const lessonId = searchParams.get('lesson_id');
  const moduleId = searchParams.get('module_id');
  const examCategory = searchParams.get('exam_category');
  const count = Math.min(parseInt(searchParams.get('count') || '5'), 20);

  let query = supabaseAdmin.from('question_bank').select('*');

  if (type === 'lesson_quiz' && lessonId) {
    query = query.eq('lesson_id', lessonId);
  } else if (type === 'module_test' && moduleId) {
    query = query.eq('module_id', moduleId);
  } else if (type === 'exam_prep' && examCategory) {
    query = query.eq('exam_category', examCategory);
  } else {
    return NextResponse.json({ error: 'Invalid quiz parameters' }, { status: 400 });
  }

  const { data: allQuestions, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!allQuestions || allQuestions.length === 0) {
    return NextResponse.json({ questions: [], message: 'No questions available.' });
  }

  const shuffled = allQuestions.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  const clientQuestions = selected.map((q: any) => ({
    id: q.id,
    question_text: q.question_text,
    question_type: q.question_type,
    options: q.question_type === 'short_answer' ? [] :
      (typeof q.options === 'string' ? JSON.parse(q.options) : q.options)
        .sort(() => Math.random() - 0.5),
    difficulty: q.difficulty,
    tags: q.tags,
  }));

  return NextResponse.json({ questions: clientQuestions, total_available: allQuestions.length });
}

// POST — Submit quiz answers and record attempt
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { type, lesson_id, module_id, exam_category, answers, time_spent_seconds } = body;

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'No answers provided' }, { status: 400 });
  }

  const questionIds = answers.map((a: any) => a.question_id);
  const { data: questions, error } = await supabaseAdmin
    .from('question_bank')
    .select('id, correct_answer, explanation')
    .in('id', questionIds);

  if (error || !questions) {
    return NextResponse.json({ error: 'Failed to grade quiz' }, { status: 500 });
  }

  const answerMap = new Map<string, any>(questions.map((q: any) => [q.id, q]));
  let correct = 0;
  const graded = answers.map((a: any) => {
    const q = answerMap.get(a.question_id);
    const isCorrect = q ? a.user_answer?.toLowerCase().trim() === q.correct_answer?.toLowerCase().trim() : false;
    if (isCorrect) correct++;
    return {
      question_id: a.question_id,
      user_answer: a.user_answer,
      is_correct: isCorrect,
      correct_answer: q?.correct_answer,
      explanation: q?.explanation,
    };
  });

  const scorePercent = answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0;

  const { data: attempt, error: attemptErr } = await supabaseAdmin
    .from('quiz_attempts')
    .insert({
      user_email: session.user.email,
      attempt_type: type || 'lesson_quiz',
      module_id: module_id || null,
      lesson_id: lesson_id || null,
      exam_category: exam_category || null,
      total_questions: answers.length,
      correct_answers: correct,
      score_percent: scorePercent,
      time_spent_seconds: time_spent_seconds || 0,
    })
    .select()
    .single();

  if (attemptErr) {
    return NextResponse.json({ error: attemptErr.message }, { status: 500 });
  }

  if (attempt) {
    await supabaseAdmin.from('quiz_attempt_answers').insert(
      graded.map((g: any) => ({
        attempt_id: attempt.id,
        question_id: g.question_id,
        user_answer: g.user_answer,
        is_correct: g.is_correct,
      }))
    );

    // Log activity
    try {
      await supabaseAdmin.from('activity_log').insert({
        user_email: session.user.email,
        action_type: 'quiz_completed',
        entity_type: type || 'quiz',
        entity_id: attempt.id,
        metadata: { score_percent: scorePercent, correct, total: answers.length },
      });
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    attempt_id: attempt?.id,
    total_questions: answers.length,
    correct_answers: correct,
    score_percent: scorePercent,
    results: graded,
    passed: scorePercent >= 70,
  });
}
