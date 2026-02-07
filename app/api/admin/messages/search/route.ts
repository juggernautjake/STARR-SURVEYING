// app/api/admin/messages/search/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: Search messages across user's conversations
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const conversationId = searchParams.get('conversation_id');
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  if (!query) return NextResponse.json({ error: 'Search query (q) required' }, { status: 400 });

  // Get user's conversation IDs
  const { data: participantRows } = await supabaseAdmin
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_email', session.user.email)
    .is('left_at', null);

  const convIds = (participantRows || []).map((r: { conversation_id: string }) => r.conversation_id);
  if (convIds.length === 0) return NextResponse.json({ results: [] });

  let searchQuery = supabaseAdmin
    .from('messages')
    .select('*')
    .eq('is_deleted', false)
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (conversationId) {
    // Search within a specific conversation
    if (!convIds.includes(conversationId)) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }
    searchQuery = searchQuery.eq('conversation_id', conversationId);
  } else {
    // Search across all user's conversations
    searchQuery = searchQuery.in('conversation_id', convIds);
  }

  const { data, error } = await searchQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ results: data || [] });
}, { routeName: 'messages/search' });
