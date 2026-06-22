// app/api/admin/messages/conversations/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: List conversations for the current user (or all for admin)
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const archived = searchParams.get('archived') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  // Single conversation by ID
  if (id) {
    // Verify user is a participant
    const { data: participant } = await supabaseAdmin
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', id)
      .eq('user_email', session.user.email)
      .is('left_at', null)
      .single();

    if (!participant && !isAdmin(session.user.roles)) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();

    const { data: participants } = await supabaseAdmin
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', id)
      .is('left_at', null);

    return NextResponse.json({ conversation, participants: participants || [] });
  }

  // List user's conversations
  const { data: participantRows } = await supabaseAdmin
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_email', session.user.email)
    .is('left_at', null);

  const convIds = (participantRows || []).map((r: { conversation_id: string }) => r.conversation_id);
  if (convIds.length === 0) return NextResponse.json({ conversations: [] });

  let query = supabaseAdmin
    .from('conversations')
    .select('*')
    .in('id', convIds)
    .eq('is_archived', archived)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach participant list to each conversation
  const { data: allParticipants } = await supabaseAdmin
    .from('conversation_participants')
    .select('*')
    .in('conversation_id', convIds)
    .is('left_at', null);

  // messages-widget-richer-rows-2026-06-21 — enrich participants with a
  // display_name from registered_users so the widget can render
  // "Sent to John Harding" instead of "john.harding@…". Falls back to a
  // humanized email when the user isn't in registered_users (external
  // contacts, deleted accounts, etc.).
  const participantEmails = Array.from(
    new Set((allParticipants ?? []).map((p: { user_email: string }) => p.user_email)),
  );
  const { data: registered } = participantEmails.length > 0
    ? await supabaseAdmin
        .from('registered_users')
        .select('email, name')
        .in('email', participantEmails)
    : { data: [] as Array<{ email: string; name: string | null }> };
  const nameByEmail = new Map<string, string>();
  for (const r of (registered ?? []) as Array<{ email: string; name: string | null }>) {
    if (r.name && r.name.trim().length > 0) nameByEmail.set(r.email, r.name);
  }

  const participantMap: Record<string, Array<Record<string, unknown>>> = {};
  (allParticipants || []).forEach((p: { conversation_id: string; user_email: string }) => {
    if (!participantMap[p.conversation_id]) participantMap[p.conversation_id] = [];
    participantMap[p.conversation_id]!.push({
      ...p,
      display_name: nameByEmail.get(p.user_email) ?? humanizeFromEmail(p.user_email),
    });
  });

  // messages-widget-richer-rows-2026-06-21 — fetch the most-recent
  // message per conversation so the widget can derive sent / seen /
  // waiting state from the viewer's perspective.
  const { data: lastMessages } = await supabaseAdmin
    .from('messages')
    .select('conversation_id, sender_email, created_at')
    .in('conversation_id', convIds)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  const lastSenderByConv = new Map<string, string>();
  for (const m of (lastMessages ?? []) as Array<{ conversation_id: string; sender_email: string }>) {
    if (!lastSenderByConv.has(m.conversation_id)) lastSenderByConv.set(m.conversation_id, m.sender_email);
  }

  const conversations = (data || []).map((c: { id: string; [key: string]: unknown }) => ({
    ...c,
    participants: participantMap[c.id] || [],
    last_sender_email: lastSenderByConv.get(c.id) ?? null,
  }));

  return NextResponse.json({
    conversations,
    viewer_email: session.user.email,
  });
}, { routeName: 'messages/conversations' });

/** Pure. Coerce an email address into a Title-Case display name when
 *  registered_users doesn't have one yet. `john.harding@firm.com` →
 *  "John Harding". Falls back to the whole email when the local part
 *  doesn't look name-shaped. */
function humanizeFromEmail(email: string): string {
  const local = email.split('@')[0];
  if (!local) return email;
  const tokens = local.split(/[._-]+/).filter(Boolean);
  if (tokens.length === 0) return email;
  return tokens
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join(' ');
}

// POST: Create a new conversation
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { title, type = 'direct', participant_emails = [], metadata = {} } = body;

  if (!participant_emails.length) {
    return NextResponse.json({ error: 'At least one participant required' }, { status: 400 });
  }

  // For direct messages, check if conversation already exists
  if (type === 'direct' && participant_emails.length === 1) {
    const otherEmail = participant_emails[0];
    const { data: existing } = await supabaseAdmin
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_email', session.user.email)
      .is('left_at', null);

    const { data: otherExisting } = await supabaseAdmin
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_email', otherEmail)
      .is('left_at', null);

    const myConvIds = new Set((existing || []).map((r: { conversation_id: string }) => r.conversation_id));
    const sharedConvId = (otherExisting || []).find((r: { conversation_id: string }) => myConvIds.has(r.conversation_id));

    if (sharedConvId) {
      // Verify it's a direct conversation
      const { data: conv } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('id', sharedConvId.conversation_id)
        .eq('type', 'direct')
        .single();

      if (conv) return NextResponse.json({ conversation: conv, existing: true });
    }
  }

  // Create conversation
  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .insert({
      title: title || null,
      type,
      created_by: session.user.email,
      metadata,
    })
    .select()
    .single();

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 });

  // Add participants (including the creator)
  const allEmails: string[] = [...new Set<string>([session.user.email as string, ...participant_emails as string[]])];
  const participantInserts = allEmails.map((email: string) => ({
    conversation_id: conversation.id,
    user_email: email,
    role: email === session.user.email ? 'owner' : 'member',
  }));

  const { error: partError } = await supabaseAdmin
    .from('conversation_participants')
    .insert(participantInserts);

  if (partError) return NextResponse.json({ error: partError.message }, { status: 500 });

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'conversation_created',
      entity_type: 'conversation',
      entity_id: conversation.id,
      metadata: { type, participant_count: allEmails.length },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ conversation, existing: false });
}, { routeName: 'messages/conversations' });

// PUT: Update conversation (title, archive, etc.)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing conversation id' }, { status: 400 });

  // Verify user is a participant
  const { data: participant } = await supabaseAdmin
    .from('conversation_participants')
    .select('role')
    .eq('conversation_id', id)
    .eq('user_email', session.user.email)
    .is('left_at', null)
    .single();

  if (!participant && !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: data });
}, { routeName: 'messages/conversations' });
