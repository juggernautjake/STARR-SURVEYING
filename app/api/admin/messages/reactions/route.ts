// app/api/admin/messages/reactions/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// POST: Add a reaction to a message
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { message_id, emoji } = body;
  if (!message_id || !emoji) return NextResponse.json({ error: 'message_id and emoji required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('message_reactions')
    .upsert({
      message_id,
      user_email: session.user.email,
      emoji,
    }, { onConflict: 'message_id,user_email,emoji' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reaction: data });
}, { routeName: 'messages/reactions' });

// DELETE: Remove a reaction
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get('message_id');
  const emoji = searchParams.get('emoji');

  if (!messageId || !emoji) return NextResponse.json({ error: 'message_id and emoji required' }, { status: 400 });

  await supabaseAdmin
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_email', session.user.email)
    .eq('emoji', emoji);

  return NextResponse.json({ success: true });
}, { routeName: 'messages/reactions' });
