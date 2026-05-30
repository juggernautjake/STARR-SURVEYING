// app/api/admin/learn/recommended/route.ts
//
// hub-widget-excellence-13 — minimal "recommended lessons" endpoint
// backing the recommended-lessons hub widget (which fetched this
// previously-missing route + always rendered empty). Recommends the
// next not-yet-completed lessons, in order, joined with the module name.
//
// GET /api/admin/learn/recommended?limit=10
//   → { lessons: RecommendedLesson[] }

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { pickRecommended, type RecommendableLesson } from '@/lib/learn/recommended';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(20, Number(searchParams.get('limit')) || 10));

  // The lessons (ordered) + what the caller has already completed.
  const [lessonsRes, progressRes] = await Promise.all([
    supabaseAdmin
      .from('learning_lessons')
      .select('id, title, module_id')
      .order('order_index', { ascending: true })
      .limit(200),
    supabaseAdmin
      .from('user_progress')
      .select('lesson_id')
      .eq('user_email', session.user.email),
  ]);
  if (lessonsRes.error) return NextResponse.json({ error: lessonsRes.error.message }, { status: 500 });

  const completed = new Set<string>(
    ((progressRes.data ?? []) as Array<{ lesson_id: string | null }>)
      .map((p) => p.lesson_id)
      .filter((v): v is string => !!v),
  );
  const lessons = (lessonsRes.data ?? []) as RecommendableLesson[];

  // Join module titles for the (recommended) lessons.
  const moduleIds = [...new Set(lessons.map((l) => l.module_id).filter((v): v is string => !!v))];
  const moduleTitleById = new Map<string, string>();
  if (moduleIds.length > 0) {
    const { data: mods } = await supabaseAdmin
      .from('learning_modules').select('id, title').in('id', moduleIds);
    for (const m of (mods ?? []) as Array<{ id: string; title: string | null }>) {
      moduleTitleById.set(m.id, m.title ?? '');
    }
  }

  return NextResponse.json({ lessons: pickRecommended(lessons, completed, limit, moduleTitleById) });
}, { routeName: 'admin/learn/recommended' });
