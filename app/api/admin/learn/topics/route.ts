import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get('lessonId');

  if (!lessonId) return NextResponse.json({ error: 'Provide lessonId' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('learning_topics')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('order_index', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topics: data || [] });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { data, error } = await supabaseAdmin
    .from('learning_topics')
    .insert({
      lesson_id: body.lesson_id,
      title: body.title,
      content: body.content || '',
      order_index: body.order_index || 1,
      tags: body.tags || [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topic: data });
}
