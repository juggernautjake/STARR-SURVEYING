// app/api/admin/learn/flashcards/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET — List flashcards (built-in + user's own)
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source'); // 'builtin', 'user', or null for both
  const category = searchParams.get('category');
  const moduleId = searchParams.get('module_id');

  let builtIn: any[] = [];
  let userCards: any[] = [];

  if (!source || source === 'builtin') {
    let q = supabaseAdmin.from('flashcards').select('*');
    if (category) q = q.eq('category', category);
    if (moduleId) q = q.eq('module_id', moduleId);
    const { data } = await q.order('created_at', { ascending: true });
    builtIn = (data || []).map(c => ({ ...c, source: 'builtin' }));
  }

  if (!source || source === 'user') {
    let q = supabaseAdmin.from('user_flashcards').select('*').eq('user_email', session.user.email);
    if (moduleId) q = q.eq('module_id', moduleId);
    const { data } = await q.order('created_at', { ascending: false });
    userCards = (data || []).map(c => ({ ...c, source: 'user' }));
  }

  return NextResponse.json({ cards: [...builtIn, ...userCards] });
}

// POST — Create a user flashcard
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { term, definition, hint_1, hint_2, hint_3, keywords, tags, module_id, lesson_id } = body;

  if (!term?.trim() || !definition?.trim()) {
    return NextResponse.json({ error: 'Term and definition are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('user_flashcards').insert({
    user_email: session.user.email,
    term: term.trim(),
    definition: definition.trim(),
    hint_1: hint_1?.trim() || null,
    hint_2: hint_2?.trim() || null,
    hint_3: hint_3?.trim() || null,
    keywords: keywords || [],
    tags: tags || [],
    module_id: module_id || null,
    lesson_id: lesson_id || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: { ...data, source: 'user' } });
}

// PUT — Update a user flashcard
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Card ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('user_flashcards')
    .update(updates).eq('id', id).eq('user_email', session.user.email).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}

// DELETE — Delete a user flashcard
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Card ID required' }, { status: 400 });

  const { error } = await supabaseAdmin.from('user_flashcards')
    .delete().eq('id', id).eq('user_email', session.user.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
