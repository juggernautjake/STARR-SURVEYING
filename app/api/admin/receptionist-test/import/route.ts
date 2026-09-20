// app/api/admin/receptionist-test/import/route.ts — file ElevenLabs conversations on /admin/calls.
//
//   POST  → pulls the recent conversations of both agents and writes one call row each
//
// "I want it to still transcribe everything." A browser conversation never touches Twilio, so it has
// no call row of its own; ElevenLabs keeps the recording and the transcript, and this copies them
// where every other call is reviewed. Rows are flagged is_test — nobody is notified, ever — and are
// keyed by the ElevenLabs conversation id, so importing twice updates rather than duplicates.
//
// 2026-09-16: the import itself moved to `lib/receptionist/import-conversations.ts`, shared with
// `/api/cron/receptionist-transcripts`, which now runs it every fifteen minutes so a conversation
// is filed whether or not anyone presses this button. This route is the admin gate, nothing else.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { importAgentConversations, fileOneConversation } from '@/lib/receptionist/import-conversations';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { limit?: number; conversationId?: string; agent?: string };

  // ONE conversation, when the caller names it.
  //
  // The bench used to post `{ limit: 10 }` after every browser call, which swept up the last ten
  // conversations of both agents. It worked, and it could never say what it had done: "3 new, 7
  // updated" tells you nothing about the call you just had, and leaves no id to mark the button
  // against. Filing one thing at a time is what makes "this one is filed" sayable.
  const conversationId = (body.conversationId ?? '').trim();
  if (conversationId) {
    const filed = await fileOneConversation(conversationId, body.agent === 'generic' ? 'generic' : 'starr');
    return NextResponse.json({
      conversationId: filed.conversationId,
      callId: filed.callId,
      created: filed.created,
      skipped: filed.skipped,
      imported: filed.created ? 1 : 0,
      updated: !filed.created && !filed.skipped ? 1 : 0,
      errors: [],
    });
  }

  // The sweep, still here for the cron and for filing a call the browser lost the id of.
  const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));
  const { imported, updated, skipped, errors } = await importAgentConversations(limit);
  return NextResponse.json({ imported, updated, skipped, errors });
}, { routeName: 'admin/receptionist-test/import' });
