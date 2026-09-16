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
import { rememberCaller } from './registry';
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
  // ── THE CALL ID MEMORY (owner, 2026-09-16) ──────────────────────────────────────────────────
  // "Build out the whole infrastructure for the call id rememberance log that attaches call info
  // and names and stuff to a number." Every finished real call is counted against its number here,
  // and anything learned that is safe to learn — a name where none was known, an email, what they
  // rang about — is written to ./registry.ts. An overheard name lands as `observed`, so the next
  // call may RECOGNISE it but not greet with it; only a person typing it on the admin page makes
  // it certain. Test calls teach it nothing, which is the whole reason it asked a stranger whether
  // he was Jacob before this existed.
  if (call && !call.is_test) {
    await rememberCaller(supabaseAdmin, {
      phone: from || call.from_number,
      name: call.caller_name ?? state.facts.name ?? null,
      email: call.caller_email ?? state.facts.email ?? null,
      about: aboutFrom(call, state, summary),
      at: call.started_at ?? undefined,
      isTest: false,
    });
  }

  // Test calls are reviewed on /admin/calls like any other; they just never ring anyone's phone.
  if (call && !call.notified_at && !call.is_test) {
    await notifyOwners({ from, facts: state.facts, summary: call.analysis?.summary || summary, callId: call.id, answeredBy: 'ai', call });
    await updateCall(supabaseAdmin, callSid, { notified_at: new Date().toISOString() });
  }
}

/** What the next call's greeting should know they rang about last time: the property and the survey
 *  if we got them, otherwise the first clause of the summary. Kept short — it is read aloud. */
function aboutFrom(call: { service?: string | null; property_address?: string | null } | null, state: Pick<CallState, 'facts'>, summary: string): string | null {
  const service = (call?.service ?? state.facts.service ?? '').replace(/_/g, ' ').trim();
  const address = (call?.property_address ?? state.facts.address ?? '').trim();
  if (service || address) return [service, address && `at ${address}`].filter(Boolean).join(' ');
  return summary.trim().split(/(?<=\.)\s/)[0]?.slice(0, 200) || null;
}

/** The fallback summary when the brain never wrote one: what the caller said, trimmed. */
export function summaryFromTurns(state: Pick<CallState, 'turns'>): string {
  return state.turns.filter((t) => t.role === 'caller').map((t) => t.text).join(' ').slice(0, 300);
}
