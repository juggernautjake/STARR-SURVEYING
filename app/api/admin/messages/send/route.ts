// app/api/admin/messages/send/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notifyMany } from '@/lib/notifications';

/** Cheap email → display name fall back, mirroring the messenger client's
 *  `displayName` helper. Pure helper kept inline so the route doesn't grow
 *  a dependency just for this. */
function displayNameForEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || email;
}

// GET: Fetch messages for a conversation
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversation_id');
  const before = searchParams.get('before'); // cursor for pagination
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  if (!conversationId) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 });

  // Verify user is a participant
  const { data: participant } = await supabaseAdmin
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_email', session.user.email)
    .is('left_at', null)
    .single();

  if (!participant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 });

  let query = supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get read receipts for these messages
  const messageIds = (data || []).map((m: { id: string }) => m.id);
  const { data: receipts } = await supabaseAdmin
    .from('message_read_receipts')
    .select('*')
    .in('message_id', messageIds.length > 0 ? messageIds : ['__none__']);

  // Get reactions
  const { data: reactions } = await supabaseAdmin
    .from('message_reactions')
    .select('*')
    .in('message_id', messageIds.length > 0 ? messageIds : ['__none__']);

  const receiptMap: Record<string, unknown[]> = {};
  (receipts || []).forEach((r: { message_id: string }) => {
    if (!receiptMap[r.message_id]) receiptMap[r.message_id] = [];
    receiptMap[r.message_id].push(r);
  });

  const reactionMap: Record<string, unknown[]> = {};
  (reactions || []).forEach((r: { message_id: string }) => {
    if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
    reactionMap[r.message_id].push(r);
  });

  const messages = (data || []).map((m: { id: string; [key: string]: unknown }) => ({
    ...m,
    read_receipts: receiptMap[m.id] || [],
    reactions: reactionMap[m.id] || [],
  }));

  return NextResponse.json({ messages: messages.reverse() }); // Return in chronological order
}, { routeName: 'messages/send' });

// POST: Send a message
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    conversation_id,
    content,
    message_type = 'text',
    reply_to_id = null,
    attachments = [],
  } = body;

  if (!conversation_id || !content) {
    return NextResponse.json({ error: 'conversation_id and content are required' }, { status: 400 });
  }

  // Verify user is a participant
  const { data: participant } = await supabaseAdmin
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversation_id)
    .eq('user_email', session.user.email)
    .is('left_at', null)
    .single();

  if (!participant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 });

  // Insert message
  const { data: message, error } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id,
      sender_email: session.user.email,
      content,
      message_type,
      reply_to_id,
      attachments,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update conversation's last_message_at and preview
  const preview = content.substring(0, 100) + (content.length > 100 ? '...' : '');
  await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: message.created_at, last_message_preview: preview })
    .eq('id', conversation_id);

  // Auto-mark as read by sender
  await supabaseAdmin
    .from('message_read_receipts')
    .upsert({
      message_id: message.id,
      user_email: session.user.email,
      read_at: new Date().toISOString(),
    }, { onConflict: 'message_id,user_email' });

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'message_sent',
      entity_type: 'message',
      entity_id: message.id,
      metadata: { conversation_id, message_type },
    });
  } catch { /* ignore */ }

  // messenger-notify-fix-2026-06-18 — notify every OTHER participant
  // so the recipient sees a notification in the bell + the toast
  // poller (matches the user's "users are notified whenever they
  // receive them" spec). Wrapped in try/catch + best-effort: a
  // notification failure must NEVER block the message send.
  try {
    const { data: recipients } = await supabaseAdmin
      .from('conversation_participants')
      .select('user_email')
      .eq('conversation_id', conversation_id)
      .is('left_at', null)
      .neq('user_email', session.user.email);

    const recipientEmails = (recipients ?? [])
      .map((r: { user_email: string }) => r.user_email)
      .filter((e: string) => typeof e === 'string' && e.length > 0);

    if (recipientEmails.length > 0) {
      // Pull the conversation title for the notification context so
      // group chats read as "[Crew chat] Alice: Hey" instead of just
      // "Alice: Hey".
      const { data: conv } = await supabaseAdmin
        .from('conversations')
        .select('title, type')
        .eq('id', conversation_id)
        .single();

      const senderName = displayNameForEmail(session.user.email);
      const groupSuffix = conv?.type === 'group' && conv?.title
        ? ` (${conv.title})`
        : '';
      const previewBody = content.length > 140
        ? `${content.slice(0, 139)}…`
        : content;

      await notifyMany(recipientEmails, {
        type: 'message',
        title: `💬 ${senderName}${groupSuffix}`,
        body: previewBody,
        icon: '💬',
        link: `/admin/messages?conversation=${encodeURIComponent(conversation_id)}`,
        source_type: 'direct_message',
        source_id: message.id,
        thread_id: conversation_id,
        escalation_level: 'normal',
      });
    }
  } catch { /* notification failure never blocks the send */ }

  return NextResponse.json({ message });
}, { routeName: 'messages/send' });

// PUT: Edit a message
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, content } = body;
  if (!id || !content) return NextResponse.json({ error: 'id and content required' }, { status: 400 });

  // Verify sender owns the message
  const { data: existing } = await supabaseAdmin
    .from('messages')
    .select('sender_email')
    .eq('id', id)
    .single();

  if (!existing || existing.sender_email !== session.user.email) {
    return NextResponse.json({ error: 'Can only edit your own messages' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .update({ content, is_edited: true, edited_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
}, { routeName: 'messages/send' });

// DELETE: Soft-delete a message
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing message id' }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from('messages')
    .select('sender_email')
    .eq('id', id)
    .single();

  if (!existing || (existing.sender_email !== session.user.email && !isAdmin(session.user.roles))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await supabaseAdmin
    .from('messages')
    .update({ is_deleted: true, content: '[Message deleted]' })
    .eq('id', id);

  return NextResponse.json({ success: true });
}, { routeName: 'messages/send' });

