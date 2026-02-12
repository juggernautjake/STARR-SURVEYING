// app/api/admin/learn/search/route.ts
import { auth, canManageContent } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const tsquery = q.split(/\s+/).filter(Boolean).map(w => w + ':*').join(' & ');

  // Include all content (incl. drafts) only for admin/teacher, otherwise published only
  const includeAll = searchParams.get('include_all') === 'true' && canManageContent(session.user?.email);
  const statusFilter = includeAll ? {} : { status: 'published' };

  // Search across modules, lessons, topics, articles, flashcards, questions, assignments
  const [modules, lessons, topics, articles, flashcards, questions, assignments] = await Promise.all([
    supabaseAdmin.from('learning_modules').select('id, title, description, tags, status')
      .textSearch('title', tsquery, { type: 'websearch' })
      .match(statusFilter).limit(5),
    supabaseAdmin.from('learning_lessons').select('id, module_id, title, tags, status')
      .textSearch('title', tsquery, { type: 'websearch' })
      .match(statusFilter).limit(8),
    supabaseAdmin.from('learning_topics').select('id, lesson_id, title, keywords')
      .textSearch('title', tsquery, { type: 'websearch' }).limit(8),
    supabaseAdmin.from('kb_articles').select('id, title, slug, category, excerpt, status')
      .textSearch('title', tsquery, { type: 'websearch' })
      .match(statusFilter).limit(5),
    supabaseAdmin.from('flashcards').select('id, term, definition, keywords, module_id, lesson_id')
      .textSearch('term', tsquery, { type: 'websearch' }).limit(5),
    supabaseAdmin.from('question_bank').select('id, question_text, question_type, difficulty, module_id, lesson_id, exam_category')
      .ilike('question_text', `%${q}%`).limit(6),
    supabaseAdmin.from('learning_assignments').select('id, module_id, lesson_id, assigned_to, status, due_date, notes')
      .or(`notes.ilike.%${q}%,assigned_to.ilike.%${q}%`).limit(5),
  ]);

  // Also do ilike fallback for partial matches
  const [modFallback, lesFallback, topFallback, artFallback, fcFallback] = await Promise.all([
    supabaseAdmin.from('learning_modules').select('id, title, description, tags, status')
      .ilike('title', `%${q}%`).match(statusFilter).limit(5),
    supabaseAdmin.from('learning_lessons').select('id, module_id, title, tags, status')
      .ilike('title', `%${q}%`).match(statusFilter).limit(8),
    supabaseAdmin.from('learning_topics').select('id, lesson_id, title, keywords')
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`).limit(8),
    supabaseAdmin.from('kb_articles').select('id, title, slug, category, excerpt, status')
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`).match(statusFilter).limit(5),
    supabaseAdmin.from('flashcards').select('id, term, definition, keywords, module_id, lesson_id')
      .or(`term.ilike.%${q}%,definition.ilike.%${q}%`).limit(5),
  ]);

  // Deduplicate by id
  const dedup = (a: any[], b: any[]) => {
    const ids = new Set(a.map((x: any) => x.id));
    return [...a, ...b.filter((x: any) => !ids.has(x.id))];
  };

  const results = {
    modules: dedup(modules.data || [], modFallback.data || []).map((m: any) => ({
      ...m, type: 'module', url: `/admin/learn/modules/${m.id}`,
    })),
    lessons: dedup(lessons.data || [], lesFallback.data || []).map((l: any) => ({
      ...l, type: 'lesson', url: `/admin/learn/modules/${l.module_id}/${l.id}`,
      builderUrl: `/admin/learn/manage/lesson-builder/${l.id}`,
    })),
    topics: dedup(topics.data || [], topFallback.data || []).map((t: any) => ({
      ...t, type: 'topic',
    })),
    articles: dedup(articles.data || [], artFallback.data || []).map((a: any) => ({
      ...a, type: 'article', url: `/admin/learn/knowledge-base/${a.slug}`,
    })),
    flashcards: dedup(flashcards.data || [], fcFallback.data || []).map((f: any) => ({
      ...f, type: 'flashcard', url: `/admin/learn/flashcards`,
    })),
    questions: (questions.data || []).map((q: any) => ({
      ...q, type: 'question', url: `/admin/learn/manage`,
    })),
    assignments: (assignments.data || []).map((a: any) => ({
      ...a, type: 'assignment', url: `/admin/learn/manage`,
    })),
  };

  // Compute total result count
  const totalCount = Object.values(results).reduce((sum, arr) => sum + (arr as any[]).length, 0);

  return NextResponse.json({ results, totalCount });
}, { routeName: 'learn/search' });
