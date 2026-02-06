// app/api/admin/learn/progress/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get('lesson_id');
  const moduleId = searchParams.get('module_id');

  if (lessonId) {
    const { data } = await supabaseAdmin.from('user_progress')
      .select('*').eq('user_email', session.user.email).eq('lesson_id', lessonId).maybeSingle();
    return NextResponse.json({ completed: !!data, progress: data });
  }

  if (moduleId) {
    const { data } = await supabaseAdmin.from('user_progress')
      .select('*').eq('user_email', session.user.email).eq('module_id', moduleId);
    return NextResponse.json({ completedLessons: data || [] });
  }

  // All progress
  const { data } = await supabaseAdmin.from('user_progress')
    .select('*').eq('user_email', session.user.email);
  return NextResponse.json({ progress: data || [] });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { module_id, lesson_id } = await req.json();
  const { data, error } = await supabaseAdmin.from('user_progress')
    .upsert({ user_email: session.user.email, module_id, lesson_id }, { onConflict: 'user_email,lesson_id' })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ progress: data });
}
