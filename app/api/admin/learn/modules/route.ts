// app/api/admin/learn/modules/route.ts
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const { data: mod } = await supabaseAdmin.from('learning_modules').select('*').eq('id', id).single();
    const { data: lessons } = await supabaseAdmin.from('learning_lessons')
      .select('id, title, order_index, estimated_minutes, status, tags')
      .eq('module_id', id).order('order_index');
    const { data: questionCount } = await supabaseAdmin.from('question_bank')
      .select('id', { count: 'exact' }).eq('module_id', id).is('lesson_id', null);
    return NextResponse.json({
      module: mod,
      lessons: lessons || [],
      test_question_count: questionCount?.length || 0,
    });
  }

  const { data: modules } = await supabaseAdmin.from('learning_modules')
    .select('*').order('order_index');

  // Get lesson counts
  const modulesWithCounts = await Promise.all((modules || []).map(async (m: any) => {
    const { data } = await supabaseAdmin.from('learning_lessons')
      .select('id', { count: 'exact' }).eq('module_id', m.id);
    return { ...m, lesson_count: data?.length || 0 };
  }));

  return NextResponse.json({ modules: modulesWithCounts });
}, { routeName: 'learn/modules' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('learning_modules').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ module: data });
}, { routeName: 'learn/modules' });
