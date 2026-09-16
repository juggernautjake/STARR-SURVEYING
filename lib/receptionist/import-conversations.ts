// lib/receptionist/import-conversations.ts — filing what the agents said, on a schedule.
//
// Owner, 2026-09-16: "can you save the transcripts". They were only saved when somebody pressed
// **File the conversation** on /admin/dev/receptionist, which means every conversation nobody
// remembered to file existed only inside ElevenLabs' history page. This is that same import,
// lifted out of the admin route so the cron (`/api/cron/receptionist-transcripts`) and the button
// run the SAME code — two copies of an upsert is two chances for the row shape to drift, and a
// drifted `call_sid` would file the second copy as a NEW call rather than updating the first.
//
// What it writes is unchanged from the button's version: one `phone_calls` row per conversation,
// keyed `EL-<conversation_id>` so a re-import updates rather than duplicates, flagged `is_test` so
// nobody is ever notified about it, with the transcript, the summary, the duration, and a link out
// to the audio (which stays with ElevenLabs).
//
// Never throws. A cron that 500s is retried and alerted on, and "ElevenLabs was briefly unhappy"
// is neither retryable nor news — the failures come back in `errors` for the log line instead.
import { supabaseAdmin } from '@/lib/supabase';
import { startCall, updateCall } from '@/lib/receptionist/calls';
import { agentIdFor, elevenLabsKey, getConversation, listConversations, toCallTurns, type AgentKind } from '@/lib/receptionist/elevenlabs-agents';

export interface ImportResult {
  /** Conversations filed for the first time (the row had no transcript before). */
  imported: number;
  /** Conversations already filed, re-read in case ElevenLabs finished its summary since. */
  updated: number;
  /** Conversations with nothing said in them — a click that never became a call. */
  skipped: number;
  errors: string[];
}

/**
 * Pull the recent conversations of both agents and file one call row each.
 *
 * A deployment with no ElevenLabs key, or no agent ids, returns all zeros rather than failing:
 * there is nothing to import, which is not an error.
 */
export async function importAgentConversations(limit = 30): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  if (!elevenLabsKey()) return result;

  for (const kind of ['starr', 'generic'] as AgentKind[]) {
    const agentId = agentIdFor(kind);
    if (!agentId) continue;

    let conversations;
    try {
      conversations = await listConversations(agentId, limit);
    } catch (e) {
      result.errors.push(`${kind}: ${(e as Error).message}`);
      continue;
    }

    for (const summary of conversations) {
      try {
        const full = (await getConversation(summary.conversation_id)) ?? summary;
        const turns = toCallTurns(full);
        if (turns.length === 0) { result.skipped += 1; continue; }
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
        if (before === 0) result.imported += 1; else result.updated += 1;
      } catch (e) {
        result.errors.push(`${summary.conversation_id}: ${(e as Error).message}`);
      }
    }
  }
  return result;
}
