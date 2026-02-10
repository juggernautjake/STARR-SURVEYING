// Article Completion API — Mark an article as read (scroll-verified)
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { article_id } = await req.json();
  if (!article_id) return NextResponse.json({ error: 'article_id required' }, { status: 400 });

  // Verify article exists
  const { data: article } = await supabaseAdmin.from('kb_articles')
    .select('id, title').eq('id', article_id).maybeSingle();
  if (!article) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  // Upsert completion record
  const { error } = await supabaseAdmin.from('user_article_completions')
    .upsert(
      { user_email: session.user.email, article_id, completed_at: new Date().toISOString() },
      { onConflict: 'user_email,article_id' }
    );
  if (error) throw error;

  return NextResponse.json({ success: true, article_title: article.title });
}, { routeName: 'learn/articles/complete' });
