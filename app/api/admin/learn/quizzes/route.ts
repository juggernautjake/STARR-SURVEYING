// app/api/admin/learn/quizzes/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

/* ============= MATH TEMPLATE HELPERS ============= */

function parseMathVars(text: string): { name: string; min: number; max: number }[] {
  const regex = /\{\{(\w+):(\d+):(\d+)\}\}/g;
  const vars: { name: string; min: number; max: number }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    vars.push({ name: match[1], min: parseInt(match[2]), max: parseInt(match[3]) });
  }
  return vars;
}

function generateMathVars(varDefs: { name: string; min: number; max: number }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const v of varDefs) {
    result[v.name] = Math.floor(Math.random() * (v.max - v.min + 1)) + v.min;
  }
  return result;
}

function substituteMathVars(text: string, vars: Record<string, number>): string {
  return text.replace(/\{\{(\w+):\d+:\d+\}\}/g, (_match, name) => String(vars[name] ?? name));
}

function evalFormula(formula: string, vars: Record<string, number>): number {
  const scope: Record<string, unknown> = {
    ...vars,
    PI: Math.PI,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    sqrt: Math.sqrt,
    abs: Math.abs,
    pow: Math.pow,
    floor: Math.floor,
    ceil: Math.ceil,
    round: (n: number, d: number = 0) => {
      const f = Math.pow(10, d);
      return Math.round(n * f) / f;
    },
  };
  const keys = Object.keys(scope);
  const values = keys.map(k => scope[k]);
  try {
    const fn = new Function(...keys, `"use strict"; return (${formula});`);
    return fn(...values);
  } catch {
    return NaN;
  }
}

/* ============= GRADING HELPERS ============= */

function gradeFillBlank(userAnswer: string, correctAnswer: string): {
  is_correct: boolean; partial_score: number; blank_results: boolean[]; correct_answers: string[];
} {
  let userBlanks: string[];
  let correctBlanks: string[];
  try { userBlanks = JSON.parse(userAnswer); } catch { userBlanks = []; }
  try { correctBlanks = JSON.parse(correctAnswer); } catch { correctBlanks = [correctAnswer]; }

  const blank_results = correctBlanks.map((correct, i) => {
    const user = (userBlanks[i] || '').toLowerCase().trim();
    return user === correct.toLowerCase().trim();
  });
  const correctCount = blank_results.filter(Boolean).length;
  const total = correctBlanks.length;
  return {
    is_correct: correctCount === total,
    partial_score: total > 0 ? correctCount / total : 0,
    blank_results,
    correct_answers: correctBlanks,
  };
}

function gradeMultiSelect(userAnswer: string, correctAnswer: string): { is_correct: boolean; partial_score: number } {
  let userArr: string[];
  let correctArr: string[];
  try { userArr = JSON.parse(userAnswer); } catch { userArr = []; }
  try { correctArr = JSON.parse(correctAnswer); } catch { correctArr = [correctAnswer]; }

  const userSet = new Set(userArr.map(s => s.toLowerCase().trim()));
  const correctSet = new Set(correctArr.map(s => s.toLowerCase().trim()));
  const hits = [...correctSet].filter(a => userSet.has(a)).length;
  const falsePositives = [...userSet].filter(a => !correctSet.has(a)).length;
  const is_correct = hits === correctSet.size && falsePositives === 0;
  const partial_score = correctSet.size > 0 ? Math.max(0, (hits - falsePositives) / correctSet.size) : 0;
  return { is_correct, partial_score };
}

function gradeNumeric(userAnswer: string, correctAnswer: string, tolerance: number = 0.01): { is_correct: boolean } {
  const userNum = parseFloat(userAnswer);
  const correctNum = parseFloat(correctAnswer);
  if (isNaN(userNum) || isNaN(correctNum)) return { is_correct: false };
  return { is_correct: Math.abs(userNum - correctNum) <= tolerance };
}

/* ============= GET — Quiz / History ============= */

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

    const questionIds = (answers || []).map((a: { question_id: string }) => a.question_id);
    const questionsMap = new Map<string, { question_text: string; correct_answer: string; explanation: string }>();
    if (questionIds.length > 0) {
      const { data: questions } = await supabaseAdmin
        .from('question_bank')
        .select('id, question_text, correct_answer, explanation')
        .in('id', questionIds);
      (questions || []).forEach((q: { id: string; question_text: string; correct_answer: string; explanation: string }) =>
        questionsMap.set(q.id, q));
    }

    const enriched = (answers || []).map((a: { question_id: string; user_answer: string; is_correct: boolean }) => {
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
    if (userEmail && isAdmin(session.user.email)) targetEmail = userEmail;

    const { data: attempts, error } = await supabaseAdmin
      .from('quiz_attempts')
      .select('*')
      .eq('user_email', targetEmail)
      .order('completed_at', { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ attempts: attempts || [] });
  }

  // Generate a quiz
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

  const clientQuestions = selected.map((q: any) => {
    // Handle math_template: generate concrete values
    if (q.question_type === 'math_template') {
      const varDefs = parseMathVars(q.question_text);
      const vars = generateMathVars(varDefs);
      const concreteText = substituteMathVars(q.question_text, vars);
      return {
        id: q.id,
        question_text: concreteText,
        question_type: 'numeric_input' as const,
        options: [],
        difficulty: q.difficulty,
        tags: q.tags,
        _math_vars: vars,
        _original_type: 'math_template',
      };
    }

    // For fill_blank, don't shuffle options (order matters for pool display)
    if (q.question_type === 'fill_blank') {
      const opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
      return {
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: opts.sort(() => Math.random() - 0.5),
        difficulty: q.difficulty,
        tags: q.tags,
      };
    }

    // Standard question types
    const opts = q.question_type === 'short_answer' || q.question_type === 'numeric_input'
      ? []
      : (typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []))
          .sort(() => Math.random() - 0.5);

    return {
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: opts,
      difficulty: q.difficulty,
      tags: q.tags,
    };
  });

  return NextResponse.json({ questions: clientQuestions, total_available: allQuestions.length });
}

/* ============= POST — Grade Quiz ============= */

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
    .select('id, question_type, correct_answer, explanation, options')
    .in('id', questionIds);

  if (error || !questions) {
    return NextResponse.json({ error: 'Failed to grade quiz' }, { status: 500 });
  }

  const qMap = new Map<string, any>(questions.map((q: any) => [q.id, q]));
  let totalScore = 0;
  const graded = answers.map((a: any) => {
    const q = qMap.get(a.question_id);
    if (!q) {
      return {
        question_id: a.question_id,
        user_answer: a.user_answer,
        is_correct: false,
        correct_answer: '',
        explanation: '',
      };
    }

    const qType = q.question_type as string;

    // Fill in the blank - partial grading
    if (qType === 'fill_blank') {
      const result = gradeFillBlank(a.user_answer, q.correct_answer);
      totalScore += result.partial_score;
      return {
        question_id: a.question_id,
        user_answer: a.user_answer,
        is_correct: result.is_correct,
        correct_answer: q.correct_answer,
        explanation: q.explanation || '',
        partial_score: result.partial_score,
        blank_results: result.blank_results,
        correct_answers: result.correct_answers,
      };
    }

    // Multi select
    if (qType === 'multi_select') {
      const result = gradeMultiSelect(a.user_answer, q.correct_answer);
      totalScore += result.is_correct ? 1 : 0;
      return {
        question_id: a.question_id,
        user_answer: a.user_answer,
        is_correct: result.is_correct,
        correct_answer: q.correct_answer,
        explanation: q.explanation || '',
        partial_score: result.partial_score,
      };
    }

    // Numeric input
    if (qType === 'numeric_input') {
      const tolerance = 0.01;
      const result = gradeNumeric(a.user_answer, q.correct_answer, tolerance);
      totalScore += result.is_correct ? 1 : 0;
      return {
        question_id: a.question_id,
        user_answer: a.user_answer,
        is_correct: result.is_correct,
        correct_answer: q.correct_answer,
        explanation: q.explanation || '',
      };
    }

    // Math template - evaluate formula with submitted vars
    if (qType === 'math_template') {
      const mathVars = a.math_vars || {};
      let formulaStr = q.correct_answer || '';
      if (formulaStr.startsWith('formula:')) formulaStr = formulaStr.slice(8);
      const expected = evalFormula(formulaStr, mathVars);
      const tolerance = 0.5;
      const userNum = parseFloat(a.user_answer);
      const isCorrect = !isNaN(expected) && !isNaN(userNum) && Math.abs(userNum - expected) <= tolerance;
      totalScore += isCorrect ? 1 : 0;
      return {
        question_id: a.question_id,
        user_answer: a.user_answer,
        is_correct: isCorrect,
        correct_answer: String(isNaN(expected) ? 'Error computing' : expected),
        explanation: q.explanation || '',
      };
    }

    // Standard: multiple_choice, true_false, short_answer
    const isCorrect = a.user_answer?.toLowerCase().trim() === q.correct_answer?.toLowerCase().trim();
    totalScore += isCorrect ? 1 : 0;
    return {
      question_id: a.question_id,
      user_answer: a.user_answer,
      is_correct: isCorrect,
      correct_answer: q.correct_answer,
      explanation: q.explanation || '',
    };
  });

  const scorePercent = answers.length > 0 ? Math.round((totalScore / answers.length) * 100) : 0;
  const correctCount = graded.filter((g: any) => g.is_correct).length;

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
      correct_answers: correctCount,
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

    try {
      await supabaseAdmin.from('activity_log').insert({
        user_email: session.user.email,
        action_type: 'quiz_completed',
        entity_type: type || 'quiz',
        entity_id: attempt.id,
        metadata: { score_percent: scorePercent, correct: correctCount, total: answers.length },
      });
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    attempt_id: attempt?.id,
    total_questions: answers.length,
    correct_answers: correctCount,
    score_percent: scorePercent,
    results: graded,
    passed: scorePercent >= 70,
    partial_total: totalScore,
  });
}
