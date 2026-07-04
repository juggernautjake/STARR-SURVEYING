// app/api/admin/learn/tutor-conversations/route.ts
//
// Saved AI-tutor conversations (per user), so students can reopen + review them.
//   GET                    → list the user's conversations (newest first, no bodies)
//   GET   ?id=<uuid>       → one full conversation (with messages)
//   POST  { id?, title, topic, module_id, module_title, messages } → upsert → { id }
//   DELETE ?id=<uuid>      → delete one
//
// Auth: any signed-in user; every row is scoped to session.user.email.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const TABLE = 'learn_tutor_conversations';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const { data, error } = await supabaseAdmin
      .from(TABLE).select('*').eq('id', id).eq('user_email', email).single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ conversation: data });
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('id, title, topic, module_title, updated_at, messages')
    .eq('user_email', email)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const conversations = (data || []).map((c: { id: string; title: string; topic: string | null; module_title: string | null; updated_at: string; messages: unknown }) => ({
    id: c.id, title: c.title, topic: c.topic, module_title: c.module_title, updated_at: c.updated_at,
    message_count: Array.isArray(c.messages) ? c.messages.length : 0,
  }));
  return NextResponse.json({ conversations });
}, { routeName: 'admin/learn/tutor-conversations#get' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    id?: string; title?: string; topic?: string; module_id?: string; module_title?: string;
    messages?: Array<{ role: string; content: string }>;
  } | null;
  if (!body) return NextResponse.json({ error: 'Bad body' }, { status: 400 });

  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 400) : [];
  const title = (body.title || body.topic || 'Conversation').slice(0, 160);
  const row = {
    user_email: email,
    title,
    topic: body.topic ? String(body.topic).slice(0, 2000) : null,
    module_id: body.module_id || null,
    module_title: body.module_title || null,
    messages,
    updated_at: new Date().toISOString(),
  };

  if (body.id) {
    // Update only if it belongs to this user.
    const { data, error } = await supabaseAdmin
      .from(TABLE).update(row).eq('id', body.id).eq('user_email', email).select('id').single();
    if (error || !data) return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 });
    return NextResponse.json({ id: data.id });
  }

  const { data, error } = await supabaseAdmin.from(TABLE).insert(row).select('id').single();
  if (error || !data) return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 });
  return NextResponse.json({ id: data.id });
}, { routeName: 'admin/learn/tutor-conversations#post' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabaseAdmin.from(TABLE).delete().eq('id', id).eq('user_email', email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}, { routeName: 'admin/learn/tutor-conversations#delete' });
