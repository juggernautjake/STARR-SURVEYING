// app/api/admin/messages/send/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET: Fetch messages for a conversation
export async function GET(req: Request) {
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
}

// POST: Send a message
export async function POST(req: Request) {
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

  return NextResponse.json({ message });
}

// PUT: Edit a message
export async function PUT(req: Request) {
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
}

// DELETE: Soft-delete a message
export async function DELETE(req: Request) {
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

  if (!existing || (existing.sender_email !== session.user.email && !isAdmin(session.user.email))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await supabaseAdmin
    .from('messages')
    .update({ is_deleted: true, content: '[Message deleted]' })
    .eq('id', id);

  return NextResponse.json({ success: true });
}

function isAdmin(email: string): boolean {
  const ADMIN_EMAILS = ['hankmaddux@starr-surveying.com', 'jacobmaddux@starr-surveying.com', 'info@starr-surveying.com'];
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
