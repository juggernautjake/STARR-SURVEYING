// app/api/admin/receptionist-test/import/route.ts — file ElevenLabs conversations on /admin/calls.
//
//   POST  → pulls the recent conversations of both agents and writes one call row each
//
// "I want it to still transcribe everything." A browser conversation never touches Twilio, so it has
// no call row of its own; ElevenLabs keeps the recording and the transcript, and this copies them
// where every other call is reviewed. Rows are flagged is_test — nobody is notified, ever — and are
// keyed by the ElevenLabs conversation id, so importing twice updates rather than duplicates.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { startCall, updateCall } from '@/lib/receptionist/calls';
import { agentIdFor, getConversation, listConversations, toCallTurns, type AgentKind } from '@/lib/receptionist/elevenlabs-agents';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));

  let imported = 0;
  let updated = 0;
  for (const kind of ['starr', 'generic'] as AgentKind[]) {
    const agentId = agentIdFor(kind);
    if (!agentId) continue;
    for (const summary of await listConversations(agentId, limit)) {
      const full = (await getConversation(summary.conversation_id)) ?? summary;
      const turns = toCallTurns(full);
      if (turns.length === 0) continue;
      const callSid = `EL-${full.conversation_id}`;
      const started = full.start_time_unix_secs ? new Date(full.start_time_unix_secs * 1000).toISOString() : new Date().toISOString();
      const existing = await startCall(supabaseAdmin, { callSid, from: `browser:${kind}`, to: kind === 'starr' ? 'Starr receptionist agent' : 'General conversation agent', isTest: true });
      const before = (existing?.transcript ?? []).length;
      await updateCall(supabaseAdmin, callSid, {
        transcript: turns,
        status: 'completed',
        answered_by: 'ai',
        is_test: true,
        started_at: started,
        ended_at: new Date((full.start_time_unix_secs ?? Date.now() / 1000) * 1000 + (full.call_duration_secs ?? 0) * 1000).toISOString(),
        duration_seconds: full.call_duration_secs ?? null,
        summary: full.analysis?.transcript_summary ?? null,
        // The audio lives with ElevenLabs; the call page links out rather than copying it.
        recording_url: `https://elevenlabs.io/app/conversational-ai/history/${full.conversation_id}`,
        recording_source: 'elevenlabs',
      });
      if (before === 0) imported += 1; else updated += 1;
    }
  }
  return NextResponse.json({ imported, updated });
}, { routeName: 'admin/receptionist-test/import' });
