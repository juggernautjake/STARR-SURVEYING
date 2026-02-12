// app/api/admin/learn/questions/route.ts
import { auth, isAdmin, canManageContent } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const moduleId = searchParams.get('module_id');
  const lessonId = searchParams.get('lesson_id');
  const examCategory = searchParams.get('exam_category');
  const templateId = searchParams.get('template_id');
  const isDynamic = searchParams.get('is_dynamic');
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  let query = supabaseAdmin.from('question_bank').select('*').order('created_at', { ascending: false }).limit(limit);

  if (moduleId) query = query.eq('module_id', moduleId);
  if (lessonId) query = query.eq('lesson_id', lessonId);
  if (examCategory) query = query.eq('exam_category', examCategory);
  if (templateId) query = query.eq('template_id', templateId);
  if (isDynamic === 'true') query = query.eq('is_dynamic', true);
  if (isDynamic === 'false') query = query.eq('is_dynamic', false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const questions = data || [];

  // If stats=true, fetch per-question attempt analytics (admin only)
  const includeStats = searchParams.get('stats') === 'true';
  if (includeStats && isAdmin(session.user?.email || '')) {
    const questionIds = questions.map((q: any) => q.id);
    if (questionIds.length > 0) {
      const { data: answerData } = await supabaseAdmin
        .from('quiz_attempt_answers')
        .select('question_id, is_correct')
        .in('question_id', questionIds);

      // Aggregate: per question -> { attempts, correct, wrong, pass_rate }
      const statsMap: Record<string, { attempts: number; correct: number }> = {};
      for (const ans of (answerData || [])) {
        if (!statsMap[ans.question_id]) statsMap[ans.question_id] = { attempts: 0, correct: 0 };
        statsMap[ans.question_id].attempts++;
        if (ans.is_correct) statsMap[ans.question_id].correct++;
      }

      for (const q of questions) {
        const s = statsMap[q.id];
        if (s) {
          (q as any).stats = {
            attempts: s.attempts,
            correct: s.correct,
            wrong: s.attempts - s.correct,
            pass_rate: Math.round((s.correct / s.attempts) * 100),
          };
        } else {
          (q as any).stats = { attempts: 0, correct: 0, wrong: 0, pass_rate: null };
        }
      }
    }
  }

  return NextResponse.json({ questions });
}, { routeName: 'learn/questions' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !canManageContent(session.user.email)) {
    return NextResponse.json({ error: 'Content management access required' }, { status: 403 });
  }

  const body = await req.json();
  const {
    question_text,
    question_type = 'multiple_choice',
    options = [],
    correct_answer,
    explanation = '',
    difficulty = 'medium',
    module_id = null,
    lesson_id = null,
    exam_category = null,
    topic_id = null,
    study_references = [],
    tags = [],
    // New template-related fields
    template_id = null,
    is_dynamic = false,
    solution_steps = null,
    tolerance = null,
  } = body;

  if (!question_text || !correct_answer) {
    return NextResponse.json({ error: 'question_text and correct_answer are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('question_bank').insert({
    question_text,
    question_type,
    options,
    correct_answer,
    explanation,
    difficulty,
    module_id,
    lesson_id,
    exam_category,
    topic_id: topic_id || null,
    study_references: study_references || [],
    tags: tags || [],
    template_id: template_id || null,
    is_dynamic: is_dynamic || false,
    solution_steps: solution_steps || null,
    tolerance: tolerance || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data });
}, { routeName: 'learn/questions' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !canManageContent(session.user.email)) {
    return NextResponse.json({ error: 'Content management access required' }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing question id' }, { status: 400 });

  // Whitelist updatable fields to prevent unexpected column errors
  const allowedFields = [
    'question_text', 'question_type', 'options', 'correct_answer',
    'explanation', 'difficulty', 'module_id', 'lesson_id', 'exam_category',
    'topic_id', 'study_references', 'tags', 'template_id', 'is_dynamic',
    'solution_steps', 'tolerance',
  ];
  const cleanUpdates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) cleanUpdates[field] = updates[field];
  }

  const { data, error } = await supabaseAdmin
    .from('question_bank')
    .update(cleanUpdates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data });
}, { routeName: 'learn/questions' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing question id' }, { status: 400 });

  const { error } = await supabaseAdmin.from('question_bank').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'learn/questions' });
