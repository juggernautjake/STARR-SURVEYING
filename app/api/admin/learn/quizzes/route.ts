// app/api/admin/learn/quizzes/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET — Generate a quiz (random questions from bank)
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type'); // 'lesson_quiz', 'module_test', 'exam_prep'
  const lessonId = searchParams.get('lesson_id');
  const moduleId = searchParams.get('module_id');
  const examCategory = searchParams.get('exam_category');
  const count = Math.min(parseInt(searchParams.get('count') || '5'), 20);

  let query = supabaseAdmin.from('question_bank').select('*');

  if (type === 'lesson_quiz' && lessonId) {
    query = query.eq('lesson_id', lessonId);
  } else if (type === 'module_test' && moduleId) {
    // Module test: questions for this module (with or without lesson_id)
    query = query.eq('module_id', moduleId);
  } else if (type === 'exam_prep' && examCategory) {
    query = query.eq('exam_category', examCategory);
  } else {
    return NextResponse.json({ error: 'Invalid quiz parameters' }, { status: 400 });
  }

  const { data: allQuestions, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!allQuestions || allQuestions.length === 0) {
    return NextResponse.json({ questions: [], message: 'No questions available for this section yet.' });
  }

  // Shuffle and pick random subset
  const shuffled = allQuestions.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  // Don't send correct_answer to client
  const clientQuestions = selected.map(q => ({
    id: q.id,
    question_text: q.question_text,
    question_type: q.question_type,
    options: q.question_type === 'short_answer' ? [] :
      (typeof q.options === 'string' ? JSON.parse(q.options) : q.options)
        .sort(() => Math.random() - 0.5), // Shuffle options too
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
  // answers: [{ question_id, user_answer }]

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'No answers provided' }, { status: 400 });
  }

  // Fetch correct answers for grading
  const questionIds = answers.map((a: any) => a.question_id);
  const { data: questions, error } = await supabaseAdmin
    .from('question_bank')
    .select('id, correct_answer, explanation')
    .in('id', questionIds);

  if (error || !questions) {
    return NextResponse.json({ error: 'Failed to grade quiz' }, { status: 500 });
  }

  const answerMap = new Map(questions.map(q => [q.id, q]));
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

  // Save attempt
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

  // Save individual answers
  if (attempt) {
    await supabaseAdmin.from('quiz_attempt_answers').insert(
      graded.map((g: any) => ({
        attempt_id: attempt.id,
        question_id: g.question_id,
        user_answer: g.user_answer,
        is_correct: g.is_correct,
      }))
    );
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
