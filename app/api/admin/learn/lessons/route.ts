// app/api/admin/learn/lessons/route.ts
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userIsAdmin = isAdmin(session.user.email);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const moduleId = searchParams.get('module_id');

  if (id) {
    const { data: lesson } = await supabaseAdmin.from('learning_lessons').select('*').eq('id', id).single();
    // Non-admin users cannot access draft lessons
    if (!userIsAdmin && lesson?.status === 'draft') {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }
    const { data: topics } = await supabaseAdmin.from('learning_topics')
      .select('*').eq('lesson_id', id).order('order_index');
    const { data: questionCount } = await supabaseAdmin.from('question_bank')
      .select('id', { count: 'exact' }).eq('lesson_id', id);
    return NextResponse.json({
      lesson,
      topics: topics || [],
      quiz_question_count: questionCount?.length || 0,
    });
  }

  if (moduleId) {
    let query = supabaseAdmin.from('learning_lessons')
      .select('*').eq('module_id', moduleId);
    if (!userIsAdmin) query = query.eq('status', 'published');
    const { data } = await query.order('order_index');
    return NextResponse.json({ lessons: data || [] });
  }

  // Support fetching all lessons (for manage page)
  const all = searchParams.get('all');
  if (all) {
    let query = supabaseAdmin.from('learning_lessons').select('*');
    if (!userIsAdmin) query = query.eq('status', 'published');
    const { data } = await query.order('order_index');
    return NextResponse.json({ lessons: data || [] });
  }

  return NextResponse.json({ error: 'Provide id, module_id, or all=true' }, { status: 400 });
}, { routeName: 'learn/lessons' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing lesson id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('learning_lessons')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lesson: data });
}, { routeName: 'learn/lessons' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('learning_lessons').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lesson: data });
}, { routeName: 'learn/lessons' });
