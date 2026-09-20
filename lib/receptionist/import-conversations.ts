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

export interface FiledConversation {
  /** The ElevenLabs conversation this came from. */
  conversationId: string;
  /** The call row's id, so the caller can link straight to it. Null when nothing was written. */
  callId: string | null;
  /** True when this is the first time it has been filed. */
  created: boolean;
  /** True when there was nothing to file — a conversation with no turns in it. */
  skipped: boolean;
}

/**
 * File ONE conversation, and say which call row it became.
 *
 * Owner, 2026-09-21: "Please make sure we can file each test conversation … and that once it is
 * filed for a specific call the 'File it on the Calls page' button is changed or removed."
 *
 * The button used to post `{ limit: 10 }` and sweep up the last ten conversations of BOTH agents,
 * which is why it could never report what it had done: "Filed: 3 new, 7 updated" says nothing about
 * the call you just had, and there was no id to change the button against. Filing one thing at a
 * time is what makes "this one is filed" a statement that can be made at all.
 *
 * Idempotent, like the sweep: the row is keyed `EL-<conversation_id>`, so filing twice updates.
 */
export async function fileOneConversation(conversationId: string, kind: AgentKind = 'starr'): Promise<FiledConversation> {
  const full = await getConversation(conversationId);
  if (!full) return { conversationId, callId: null, created: false, skipped: true };

  const turns = toCallTurns(full);
  if (turns.length === 0) return { conversationId, callId: null, created: false, skipped: true };

  const callSid = `EL-${full.conversation_id}`;
  const started = full.start_time_unix_secs ? new Date(full.start_time_unix_secs * 1000).toISOString() : new Date().toISOString();
  const existing = await startCall(supabaseAdmin, {
    callSid,
    from: `browser:${kind}`,
    to: kind === 'starr' ? 'Starr receptionist agent' : 'General conversation agent',
    isTest: true,
  });
  const created = (existing?.transcript ?? []).length === 0;
  const row = await updateCall(supabaseAdmin, callSid, {
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

  return { conversationId, callId: row?.id ?? existing?.id ?? null, created, skipped: false };
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
        const one = await fileOneConversation(summary.conversation_id, kind);
        if (one.skipped) result.skipped += 1;
        else if (one.created) result.imported += 1;
        else result.updated += 1;
      } catch (e) {
        result.errors.push(`${summary.conversation_id}: ${(e as Error).message}`);
      }
    }
  }
  return result;
}
