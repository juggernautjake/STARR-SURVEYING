// app/api/admin/learn/exam-prep/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const examType = searchParams.get('exam_type'); // 'SIT' or 'RPLS'

  // Get categories
  let catQuery = supabaseAdmin.from('exam_prep_categories').select('*').order('order_index');
  if (examType) catQuery = catQuery.eq('exam_type', examType);
  const { data: categories } = await catQuery;

  // Get question counts per exam type
  const { data: sitCount } = await supabaseAdmin.from('question_bank')
    .select('id', { count: 'exact' }).eq('exam_category', 'SIT');
  const { data: rplsCount } = await supabaseAdmin.from('question_bank')
    .select('id', { count: 'exact' }).eq('exam_category', 'RPLS');

  // Get user's past attempts
  const { data: attempts } = await supabaseAdmin.from('quiz_attempts')
    .select('*').eq('user_email', session.user.email).eq('attempt_type', 'exam_prep')
    .order('created_at', { ascending: false }).limit(20);

  return NextResponse.json({
    categories: categories || [],
    question_counts: {
      SIT: sitCount?.length || 0,
      RPLS: rplsCount?.length || 0,
    },
    recent_attempts: attempts || [],
  });
}
