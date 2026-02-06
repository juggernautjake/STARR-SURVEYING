// app/api/admin/learn/notes/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET — List user's fieldbook notes
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await supabaseAdmin.from('fieldbook_notes')
      .select('*').eq('id', id).eq('user_email', session.user.email).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ note: data });
  }

  const { data, error } = await supabaseAdmin.from('fieldbook_notes')
    .select('*').eq('user_email', session.user.email)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data || [] });
}

// POST — Create a note
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    title, content, page_context, page_url,
    module_id, lesson_id, topic_id, article_id,
    context_type, context_label, tags
  } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('fieldbook_notes').insert({
    user_email: session.user.email,
    title: title?.trim() || 'Untitled Note',
    content: content.trim(),
    page_context: page_context || null,
    page_url: page_url || null,
    module_id: module_id || null,
    lesson_id: lesson_id || null,
    topic_id: topic_id || null,
    article_id: article_id || null,
    context_type: context_type || null,
    context_label: context_label || null,
    tags: tags || [],
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

// PUT — Update a note
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Note ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('fieldbook_notes')
    .update(updates).eq('id', id).eq('user_email', session.user.email).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

// DELETE — Delete a note
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Note ID required' }, { status: 400 });

  const { error } = await supabaseAdmin.from('fieldbook_notes')
    .delete().eq('id', id).eq('user_email', session.user.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
