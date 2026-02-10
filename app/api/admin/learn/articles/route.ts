// app/api/admin/learn/articles/route.ts
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const id = searchParams.get('id');
  const lessonId = searchParams.get('lesson_id');
  const moduleId = searchParams.get('module_id');

  // Single article by slug or id — include completion status
  if (slug || id) {
    let query = supabaseAdmin.from('kb_articles').select('*');
    if (slug) query = query.eq('slug', slug);
    else if (id) query = query.eq('id', id);
    const { data } = await query.maybeSingle();
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: completion } = await supabaseAdmin.from('user_article_completions')
      .select('completed_at')
      .eq('user_email', session.user.email!)
      .eq('article_id', data.id)
      .maybeSingle();

    return NextResponse.json({
      article: data,
      completed: !!completion,
      completed_at: completion?.completed_at || null,
    });
  }

  // Required articles for a lesson — with per-user completion status
  if (lessonId) {
    const { data: requirements } = await supabaseAdmin
      .from('lesson_required_articles')
      .select('article_id, order_index')
      .eq('lesson_id', lessonId)
      .order('order_index');

    if (!requirements || requirements.length === 0) {
      return NextResponse.json({ articles: [], all_completed: true });
    }

    const articleIds = requirements.map((r: any) => r.article_id);

    // Fetch articles
    const { data: articles } = await supabaseAdmin.from('kb_articles')
      .select('id, title, slug, author, subtitle, excerpt, estimated_minutes, images, status')
      .in('id', articleIds);

    // Fetch user completions
    const { data: completions } = await supabaseAdmin.from('user_article_completions')
      .select('article_id, completed_at')
      .eq('user_email', session.user.email!)
      .in('article_id', articleIds);

    const completionMap = new Map((completions || []).map((c: any) => [c.article_id, c.completed_at]));
    const articleMap = new Map((articles || []).map((a: any) => [a.id, a]));

    const result = requirements.map((r: any) => ({
      ...(articleMap.get(r.article_id) || {}),
      order_index: r.order_index,
      completed: completionMap.has(r.article_id),
      completed_at: completionMap.get(r.article_id) || null,
    }));

    return NextResponse.json({
      articles: result,
      all_completed: result.every((a: any) => a.completed),
    });
  }

  // All articles — optionally filtered by module
  let query = supabaseAdmin.from('kb_articles')
    .select('id, title, slug, category, tags, excerpt, author, subtitle, estimated_minutes, status, module_id, lesson_id, created_at')
    .order('created_at', { ascending: false });
  if (moduleId) query = query.eq('module_id', moduleId);
  const { data } = await query;
  return NextResponse.json({ articles: data || [] });
}, { routeName: 'learn/articles' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const { required_for_lesson_id, ...articleData } = body;

  const { data, error } = await supabaseAdmin.from('kb_articles').insert(articleData).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Link as required reading for a lesson if specified
  if (required_for_lesson_id && data) {
    await supabaseAdmin.from('lesson_required_articles')
      .upsert({ lesson_id: required_for_lesson_id, article_id: data.id, order_index: 0 },
        { onConflict: 'lesson_id,article_id' });
  }

  return NextResponse.json({ article: data });
}, { routeName: 'learn/articles' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('kb_articles')
    .update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}, { routeName: 'learn/articles' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabaseAdmin.from('kb_articles').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'learn/articles' });
