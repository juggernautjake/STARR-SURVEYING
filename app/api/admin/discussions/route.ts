// app/api/admin/discussions/route.ts — Admin discussion thread API
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET — List discussion threads (with optional filters)
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');            // open, in_progress, resolved, closed
  const escalation = searchParams.get('escalation');    // low, medium, high, critical
  const threadType = searchParams.get('thread_type');
  const threadId = searchParams.get('id');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  // Single thread detail
  if (threadId) {
    const { data: thread, error } = await supabaseAdmin
      .from('admin_discussion_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch messages for this thread's conversation
    let messages: unknown[] = [];
    if (thread?.conversation_id) {
      const { data: msgs } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', thread.conversation_id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });
      messages = msgs || [];
    }

    return NextResponse.json({ thread, messages });
  }

  // List threads with filters
  let query = supabaseAdmin
    .from('admin_discussion_threads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (escalation) query = query.eq('escalation_level', escalation);
  if (threadType) query = query.eq('thread_type', threadType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ threads: data || [] });
}, { routeName: 'discussions' });

// POST — Create a new discussion thread
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const {
    title,
    description,
    thread_type,
    escalation_level,
    page_path,
    page_title,
    content_type,
    content_id,
    initial_message,
  } = await req.json();

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  // Create a conversation for this discussion thread
  const { data: conv, error: convErr } = await supabaseAdmin
    .from('conversations')
    .insert({
      title: `[Discussion] ${title.trim()}`,
      type: 'admin_discussion',
      created_by: session.user.email,
    })
    .select()
    .single();

  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });

  // Add creator as conversation owner
  await supabaseAdmin.from('conversation_participants').insert({
    conversation_id: conv.id,
    user_email: session.user.email,
    role: 'owner',
  });

  // Create the discussion thread
  const { data: thread, error: threadErr } = await supabaseAdmin
    .from('admin_discussion_threads')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      thread_type: thread_type || 'general',
      escalation_level: escalation_level || 'low',
      page_path: page_path || null,
      page_title: page_title || null,
      content_type: content_type || null,
      content_id: content_id || null,
      conversation_id: conv.id,
      created_by: session.user.email,
    })
    .select()
    .single();

  if (threadErr) return NextResponse.json({ error: threadErr.message }, { status: 500 });

  // Post the initial message if provided
  if (initial_message?.trim()) {
    await supabaseAdmin.from('messages').insert({
      conversation_id: conv.id,
      sender_email: session.user.email,
      content: initial_message.trim(),
      message_type: 'text',
    });
  }

  // Notify other admins
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
  const otherAdmins = adminEmails.filter(e => e !== session.user!.email);

  if (otherAdmins.length > 0) {
    const escalationIcons: Record<string, string> = {
      low: 'ℹ️', medium: '⚠️', high: '🔴', critical: '🚨',
    };
    const icon = escalationIcons[escalation_level || 'low'] || 'ℹ️';

    const notifications = otherAdmins.map(email => ({
      user_email: email,
      type: 'message',
      title: `${icon} New Discussion: ${title.trim()}`,
      body: description?.trim()?.slice(0, 200) || initial_message?.trim()?.slice(0, 200) || null,
      icon,
      link: `/admin/discussions/${thread.id}`,
      source_type: 'discussion_thread',
      source_id: thread.id,
      escalation_level: escalation_level || 'low',
      thread_id: thread.id,
    }));

    await supabaseAdmin.from('notifications').insert(notifications);

    // Add other admins as conversation participants
    const participants = otherAdmins.map(email => ({
      conversation_id: conv.id,
      user_email: email,
      role: 'member',
    }));
    await supabaseAdmin.from('conversation_participants').insert(participants);
  }

  return NextResponse.json({ thread });
}, { routeName: 'discussions' });

// PUT — Update thread status, escalation, or post a reply message
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { id, action, ...payload } = await req.json();
  if (!id) return NextResponse.json({ error: 'Thread ID required' }, { status: 400 });

  // Post a reply message
  if (action === 'reply') {
    const { data: thread } = await supabaseAdmin
      .from('admin_discussion_threads')
      .select('conversation_id, title')
      .eq('id', id)
      .single();

    if (!thread?.conversation_id) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

    const { data: msg, error: msgErr } = await supabaseAdmin.from('messages').insert({
      conversation_id: thread.conversation_id,
      sender_email: session.user.email,
      content: payload.content?.trim(),
      message_type: 'text',
    }).select().single();

    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

    // Notify other participants
    const { data: participants } = await supabaseAdmin
      .from('conversation_participants')
      .select('user_email')
      .eq('conversation_id', thread.conversation_id)
      .is('left_at', null);

    const others = (participants || [])
      .map((p: { user_email: string }) => p.user_email)
      .filter((e: string) => e !== session.user!.email);

    if (others.length > 0) {
      const notifs = others.map((email: string) => ({
        user_email: email,
        type: 'message',
        title: `Reply in: ${thread.title}`,
        body: payload.content?.trim()?.slice(0, 200),
        icon: '💬',
        link: `/admin/discussions/${id}`,
        source_type: 'discussion_thread',
        source_id: id,
      }));
      await supabaseAdmin.from('notifications').insert(notifs);
    }

    return NextResponse.json({ message: msg });
  }

  // Update thread fields (status, escalation, etc.)
  const updates: Record<string, unknown> = {};
  if (payload.status) {
    updates.status = payload.status;
    if (payload.status === 'resolved' || payload.status === 'closed') {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = session.user.email;
    }
  }
  if (payload.escalation_level) updates.escalation_level = payload.escalation_level;
  if (payload.resolution_notes) updates.resolution_notes = payload.resolution_notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('admin_discussion_threads')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ thread: updated });
}, { routeName: 'discussions' });
