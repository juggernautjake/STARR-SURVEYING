// app/api/admin/messages/mentions/route.ts
//
// hub-widget-excellence-14 — minimal mentions endpoint backing the
// mentions-inbox hub widget (which fetched this previously-missing route
// + always rendered empty). There's no structured mentions store, so we
// scan recent messages in the caller's conversations for their @-handle
// (lib/messages/mentions.detectMentions).
//
// GET /api/admin/messages/mentions → { mentions: Mention[] }

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { detectMentions, type MentionMessage } from '@/lib/messages/mentions';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const email = session.user.email;

  // The caller's conversations.
  const { data: parts } = await supabaseAdmin
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_email', email)
    .is('left_at', null);
  const convIds = [...new Set(
    ((parts ?? []) as Array<{ conversation_id: string | null }>).map((p) => p.conversation_id).filter((v): v is string => !!v),
  )];
  if (convIds.length === 0) return NextResponse.json({ mentions: [] });

  // Recent messages in those conversations from OTHER people.
  const { data: messages, error } = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id, sender_email, content, created_at')
    .in('conversation_id', convIds)
    .neq('sender_email', email)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Conversation titles for enrichment.
  const { data: convs } = await supabaseAdmin
    .from('conversations').select('id, title').in('id', convIds);
  const titleByConversation = new Map<string, string>();
  for (const c of (convs ?? []) as Array<{ id: string; title: string | null }>) {
    if (c.title) titleByConversation.set(c.id, c.title);
  }

  const mentions = detectMentions((messages ?? []) as MentionMessage[], email, titleByConversation);
  return NextResponse.json({ mentions });
}, { routeName: 'admin/messages/mentions' });
