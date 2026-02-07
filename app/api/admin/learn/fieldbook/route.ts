// app/api/admin/learn/fieldbook/route.ts — Floating fieldbook panel API
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET — Recent fieldbook entries for the floating panel
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  const { data, error } = await supabaseAdmin.from('fieldbook_notes')
    .select('id, content, context_label, page_url, created_at')
    .eq('user_email', session.user.email)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map to the format the floating panel expects
  const entries = (data || []).map((n: { id: string; content: string; context_label: string | null; page_url: string | null; created_at: string }) => ({
    id: n.id,
    content: n.content,
    context_label: n.context_label || 'General',
    context_path: n.page_url || '',
    created_at: n.created_at,
  }));

  return NextResponse.json({ entries });
}, { routeName: 'learn/fieldbook' });

// POST — Quick-save a note from the floating panel
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { content, context_type, context_label, context_path } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('fieldbook_notes').insert({
    user_email: session.user.email,
    title: `Note — ${context_label || 'Quick Note'}`,
    content: content.trim(),
    context_type: context_type || 'general',
    context_label: context_label || 'General',
    page_url: context_path || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}, { routeName: 'learn/fieldbook' });
