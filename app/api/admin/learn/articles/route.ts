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

  if (slug) {
    const { data } = await supabaseAdmin.from('kb_articles').select('*').eq('slug', slug).single();
    return NextResponse.json({ article: data });
  }
  if (id) {
    const { data } = await supabaseAdmin.from('kb_articles').select('*').eq('id', id).single();
    return NextResponse.json({ article: data });
  }

  const { data } = await supabaseAdmin.from('kb_articles')
    .select('id, title, slug, category, tags, excerpt, status, created_at').order('created_at', { ascending: false });
  return NextResponse.json({ articles: data || [] });
}, { routeName: 'learn/articles' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('kb_articles').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}, { routeName: 'learn/articles' });
