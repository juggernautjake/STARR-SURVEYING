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
import { importAgentConversations } from '@/lib/receptionist/import-conversations';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));

  const { imported, updated, skipped, errors } = await importAgentConversations(limit);
  return NextResponse.json({ imported, updated, skipped, errors });
}, { routeName: 'admin/receptionist-test/import' });
