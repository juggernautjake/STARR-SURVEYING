// app/api/admin/messages/conversations/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET: List conversations for the current user (or all for admin)
export async function GET(req: Request) {
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

    if (!participant && !isAdmin(session.user.email)) {
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

  const participantMap: Record<string, unknown[]> = {};
  (allParticipants || []).forEach((p: { conversation_id: string }) => {
    if (!participantMap[p.conversation_id]) participantMap[p.conversation_id] = [];
    participantMap[p.conversation_id].push(p);
  });

  const conversations = (data || []).map((c: { id: string; [key: string]: unknown }) => ({
    ...c,
    participants: participantMap[c.id] || [],
  }));

  return NextResponse.json({ conversations });
}

// POST: Create a new conversation
export async function POST(req: Request) {
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
}

// PUT: Update conversation (title, archive, etc.)
export async function PUT(req: Request) {
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

  if (!participant && !isAdmin(session.user.email)) {
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
}
