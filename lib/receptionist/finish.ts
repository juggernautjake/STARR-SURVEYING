// lib/receptionist/finish.ts — close the call record, once, however the call ended.
//
// Reached from three places: the <Gather> turn route when the brain says "done", the relay-ended
// action when ConversationRelay hands the call back, and the relay's "closed" event when the caller
// hangs up mid-sentence. Any two of those can fire for one call, so the function is idempotent:
// facts and summary are written every time (later is better informed), the analysis runs once, and
// the owners are told once.
import { supabaseAdmin } from '@/lib/supabase';
import { analyzeCall, contactColumns } from './analysis';
import { factsToColumns, getCallBySid, updateCall } from './calls';
import { notifyOwners } from './notify';
import type { CallState } from './state';

export async function finishCall(callSid: string, from: string, state: Pick<CallState, 'facts' | 'turns'> & { started?: number }, summary: string): Promise<void> {
  const cols = factsToColumns(state.facts);
  const existing = await getCallBySid(supabaseAdmin, callSid);
  const started = state.started ? Math.round((Date.now() - state.started) / 1000) : existing?.duration_seconds ?? null;
  let call = await updateCall(supabaseAdmin, callSid, { ...cols, summary: existing?.summary && !summary ? existing.summary : summary || existing?.summary || null, status: 'completed', ended_at: existing?.ended_at ?? new Date().toISOString(), duration_seconds: started });
  if (call && !call.analysis) {
    const analysis = await analyzeCall(call);
    if (analysis) call = (await updateCall(supabaseAdmin, callSid, { ...contactColumns(call, analysis), analysis, summary: analysis.summary || summary })) ?? call;
  }
  // Test calls are reviewed on /admin/calls like any other; they just never ring anyone's phone.
  if (call && !call.notified_at && !call.is_test) {
    await notifyOwners({ from, facts: state.facts, summary: call.analysis?.summary || summary, callId: call.id, answeredBy: 'ai', call });
    await updateCall(supabaseAdmin, callSid, { notified_at: new Date().toISOString() });
  }
}

/** The fallback summary when the brain never wrote one: what the caller said, trimmed. */
export function summaryFromTurns(state: Pick<CallState, 'turns'>): string {
  return state.turns.filter((t) => t.role === 'caller').map((t) => t.text).join(' ').slice(0, 300);
}
