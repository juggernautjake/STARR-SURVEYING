// app/api/admin/learn/search/route.ts
import { auth } from '@/lib/auth';
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

  // Search across modules, lessons, topics, articles, flashcards
  const [modules, lessons, topics, articles, flashcards] = await Promise.all([
    supabaseAdmin.from('learning_modules').select('id, title, description, tags')
      .textSearch('title', tsquery, { type: 'websearch' }).eq('status', 'published').limit(5),
    supabaseAdmin.from('learning_lessons').select('id, module_id, title, tags')
      .textSearch('title', tsquery, { type: 'websearch' }).eq('status', 'published').limit(8),
    supabaseAdmin.from('learning_topics').select('id, lesson_id, title, keywords')
      .textSearch('title', tsquery, { type: 'websearch' }).limit(8),
    supabaseAdmin.from('kb_articles').select('id, title, slug, category, excerpt')
      .textSearch('title', tsquery, { type: 'websearch' }).eq('status', 'published').limit(5),
    supabaseAdmin.from('flashcards').select('id, term, definition, keywords')
      .textSearch('term', tsquery, { type: 'websearch' }).limit(5),
  ]);

  // Also do ilike fallback for partial matches
  const [modFallback, lesFallback, topFallback, artFallback, fcFallback] = await Promise.all([
    supabaseAdmin.from('learning_modules').select('id, title, description, tags')
      .ilike('title', `%${q}%`).eq('status', 'published').limit(5),
    supabaseAdmin.from('learning_lessons').select('id, module_id, title, tags')
      .ilike('title', `%${q}%`).eq('status', 'published').limit(8),
    supabaseAdmin.from('learning_topics').select('id, lesson_id, title, keywords')
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`).limit(8),
    supabaseAdmin.from('kb_articles').select('id, title, slug, category, excerpt')
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`).eq('status', 'published').limit(5),
    supabaseAdmin.from('flashcards').select('id, term, definition, keywords')
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
  };

  return NextResponse.json({ results });
}, { routeName: 'learn/search' });
