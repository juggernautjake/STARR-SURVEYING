// app/api/admin/learn/questions/route.ts
import { auth, isAdmin } from '@/lib/auth';
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
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  let query = supabaseAdmin.from('question_bank').select('*').order('created_at', { ascending: false }).limit(limit);

  if (moduleId) query = query.eq('module_id', moduleId);
  if (lessonId) query = query.eq('lesson_id', lessonId);
  if (examCategory) query = query.eq('exam_category', examCategory);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data || [] });
}, { routeName: 'learn/questions' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
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
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data });
}, { routeName: 'learn/questions' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing question id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('question_bank')
    .update(updates)
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
