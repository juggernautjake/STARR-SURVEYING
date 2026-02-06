// app/api/admin/messages/read/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// POST: Mark messages as read
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { message_ids, conversation_id } = body;

  if (conversation_id) {
    // Mark all messages in a conversation as read
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversation_id)
      .neq('sender_email', session.user.email);

    const ids = (messages || []).map((m: { id: string }) => m.id);
    if (ids.length > 0) {
      const upserts = ids.map((id: string) => ({
        message_id: id,
        user_email: session.user.email,
        read_at: new Date().toISOString(),
      }));

      await supabaseAdmin
        .from('message_read_receipts')
        .upsert(upserts, { onConflict: 'message_id,user_email' });
    }

    // Update participant's last_read_at
    await supabaseAdmin
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversation_id)
      .eq('user_email', session.user.email);

    return NextResponse.json({ marked: ids.length });
  }

  if (message_ids && Array.isArray(message_ids) && message_ids.length > 0) {
    const upserts = message_ids.map((id: string) => ({
      message_id: id,
      user_email: session.user.email,
      read_at: new Date().toISOString(),
    }));

    await supabaseAdmin
      .from('message_read_receipts')
      .upsert(upserts, { onConflict: 'message_id,user_email' });

    return NextResponse.json({ marked: message_ids.length });
  }

  return NextResponse.json({ error: 'Provide message_ids or conversation_id' }, { status: 400 });
}

// GET: Get unread count for the current user
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get user's conversations
  const { data: participantRows } = await supabaseAdmin
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('user_email', session.user.email)
    .is('left_at', null);

  if (!participantRows || participantRows.length === 0) {
    return NextResponse.json({ unread_count: 0, unread_by_conversation: {} });
  }

  let totalUnread = 0;
  const unreadByConversation: Record<string, number> = {};

  for (const p of participantRows) {
    const { count } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', p.conversation_id)
      .neq('sender_email', session.user.email)
      .gt('created_at', p.last_read_at || '1970-01-01')
      .eq('is_deleted', false);

    const unread = count || 0;
    if (unread > 0) {
      unreadByConversation[p.conversation_id] = unread;
      totalUnread += unread;
    }
  }

  return NextResponse.json({ unread_count: totalUnread, unread_by_conversation: unreadByConversation });
}
