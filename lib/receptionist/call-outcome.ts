// lib/receptionist/call-outcome.ts — what actually happened to a call that fell past Hank.
//
// ── WHY THIS EXISTS (owner, 2026-09-29) ─────────────────────────────────────────────────────────
//
// "It seems like for every single call that she answers, there is no response and no transcription
//  and no recording at all … it just seems weird that literally nobody is talking to the
//  receptionist at all and nobody has left a message with her at all."
//
// Measured on the live table, 2026-09-22 → 09-29 (the week Ellie answered over SIP): ten calls were
// labelled "Receptionist". Four of them never reached her. The caller hung up while Hank's phone
// was still ringing (11–27 seconds in, no recording), Twilio posted the <Dial> action anyway, and
// `after-dial` stamped the row `answered_by: 'ai'` and dialled the agent for a caller who was gone.
// The Twilio error on one of them says it plainly: "Requested resource is not eligible for
// recording" — the call had already ended. Those rows read as Ellie calls with no recording and no
// transcript, and because they were marked answered, the status route never treated them as missed.
//
// The other six did reach her. Every one ended 9–25 seconds into her leg, with the caller saying
// nothing, or only "hello?", and nobody left a message. In the week before, the plain answering
// machine took five real messages. The code was not throwing any of that away — but nothing on
// the site said it was happening, and the calls page made both kinds look alike.
//
// So this module answers three questions, each in one place:
//
//   callerIsGone      Twilio says the caller's leg is over. Nothing we return will be heard.
//   agentEndedEarly   The agent's leg ended within seconds while the caller was still on the line.
//   judgeAgentHealth  Across the recent live calls, are people actually talking to her?
//
// and `recordOutcome` writes down which of those happened, with Twilio's own status codes, so the
// next investigation starts from a table instead of a one-day serverless log.
import type { SupabaseClient } from '@supabase/supabase-js';

type Client = Pick<SupabaseClient, 'from'>;

/** Twilio's final call statuses. On an action callback, `CallStatus` is the CALLER's leg. */
const FINAL_CALL_STATUSES = new Set(['completed', 'canceled', 'busy', 'failed', 'no-answer']);

/**
 * True when the caller has already hung up.
 *
 * Twilio posts a <Dial>'s action URL even when the CALLER is the one who hung up, and ignores
 * whatever TwiML comes back. `CallStatus` on that request is the parent call's status: `in-progress`
 * while the caller is still there, a final status once they are gone. An absent status is treated
 * as "still there", which is what every route assumed before this existed.
 */
export function callerIsGone(params: Record<string, string | undefined>): boolean {
  const s = (params.CallStatus ?? '').trim().toLowerCase();
  return FINAL_CALL_STATUSES.has(s);
}

/**
 * An agent leg this short, with the caller still on the line, is a failure rather than a
 * conversation: the agent could not have greeted someone, heard them, and said goodbye in the time.
 * The caller is offered the voicemail message instead of being hung up on.
 */
export const AGENT_EARLY_END_SECONDS = 15;

export function agentEndedEarly(seconds: number): boolean {
  return seconds > 0 && seconds < AGENT_EARLY_END_SECONDS;
}

export type CallOutcomeKind =
  /** The caller hung up while Hank's phone was ringing. Nobody answered. */
  | 'hung-up-while-holding'
  /** The agent's SIP leg never connected (busy, failed, no answer, 0 s). Voicemail took over. */
  | 'agent-no-connect'
  /** The agent's leg ended within seconds with the caller still there. Voicemail took over. */
  | 'agent-ended-early'
  /** The caller hung up within seconds of the agent answering. */
  | 'caller-left-agent-early'
  /** A real agent conversation that ended normally. */
  | 'agent-completed'
  /** The caller hung up while the agent's line was still ringing. */
  | 'hung-up-before-agent';

export interface OutcomeDetail {
  dialStatus?: string | null;
  dialSeconds?: number | null;
  callStatus?: string | null;
  sipResponseCode?: string | null;
  errorCode?: string | null;
  note?: string | null;
}

/**
 * Write down what happened. Never throws and never blocks the caller on it.
 *
 * Always logs one structured line (`[call-outcome] {...}`), which is searchable in Vercel's logs
 * with no schema change. Also writes the `outcome` and `outcome_detail` columns when
 * seeds/663_phone_calls_outcome.sql has been applied; until then that update fails on the missing
 * column and is logged, and nothing else on the row is affected, because it is a separate update.
 */
export async function recordOutcome(client: Client, callSid: string, outcome: CallOutcomeKind, detail: OutcomeDetail = {}): Promise<void> {
  const clean = Object.fromEntries(Object.entries(detail).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  console.log(`[call-outcome] ${JSON.stringify({ callSid, outcome, ...clean })}`);
  if (!callSid) return;
  try {
    const { error } = await client.from('phone_calls').update({ outcome, outcome_detail: clean }).eq('call_sid', callSid);
    if (error) console.warn(`[call-outcome] could not store the outcome on the row (apply seeds/663_phone_calls_outcome.sql): ${error.message}`);
  } catch (err) {
    console.warn('[call-outcome] could not store the outcome on the row:', err);
  }
}

// ── Is anybody actually talking to her? ─────────────────────────────────────────────────────────

/** The columns the health check reads. All of them exist on every deployment. */
export const HEALTH_COLUMNS = 'answered_by, duration_seconds, recording_duration, transcript, voicemail_text, started_at';

export interface HealthRow {
  answered_by: string | null;
  duration_seconds: number | null;
  recording_duration: number | null;
  transcript: Array<{ role: string; text: string }> | null;
  voicemail_text: string | null;
  started_at: string | null;
}

export interface AgentHealth {
  /** Calls labelled as the receptionist's in the window. */
  labelled: number;
  /** Of those, calls with no recording at all: the caller hung up before she answered. */
  neverReached: number;
  /** Calls that did reach her. */
  reached: number;
  /** Of those, calls where the caller said something beyond a greeting. */
  talked: number;
  /** Of those reached, calls where the caller said nothing, or only "hello". */
  silent: number;
  /** Answering-machine calls in the window where a message was actually left. */
  messagesLeft: number;
  /** True when the pattern is bad enough that someone should look. */
  warn: boolean;
  /** One sentence for a person, always present. */
  statement: string;
}

/** Words a caller says when they cannot hear anybody yet, or are about to hang up. */
const NOT_A_CONVERSATION = /^(?:h?ello|hi|hey|yes|yeah|yep|um+|uh+|hm+|okay|ok|what|who is this|anyone there|is anyone there)$/;

/** Did the caller say anything that counts as talking to her? */
export function callerTalked(transcript: HealthRow['transcript']): boolean {
  const said = (transcript ?? [])
    .filter((t) => t.role === 'caller' && t.text && !t.text.startsWith('('))
    .map((t) => t.text.toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return said.some((s) => !NOT_A_CONVERSATION.test(s) && s.split(' ').length >= 3);
}

/** The minimum calls in the window before the warning will speak. One odd call is not a pattern. */
export const HEALTH_MIN_CALLS = 3;

export function judgeAgentHealth(rows: HealthRow[]): AgentHealth {
  let labelled = 0; let neverReached = 0; let reached = 0; let talked = 0; let messagesLeft = 0;
  for (const r of rows) {
    if (r.answered_by === 'voicemail' && (r.voicemail_text ?? '').trim()) messagesLeft += 1;
    if (r.answered_by !== 'ai') continue;
    labelled += 1;
    if (!r.recording_duration) { neverReached += 1; continue; }
    reached += 1;
    if (callerTalked(r.transcript)) talked += 1;
  }
  const silent = reached - talked;
  const base = { labelled, neverReached, reached, talked, silent, messagesLeft };

  if (labelled === 0) {
    return { ...base, warn: false, statement: 'No calls have been labelled as the receptionist\'s recently.' };
  }
  // Warn when most of the calls that reached her had nobody talking, or when many "receptionist"
  // calls never reached her at all. Both are what the owner saw as "nobody talks to her".
  const mostlySilent = reached >= HEALTH_MIN_CALLS && talked * 2 < reached;
  const mostlyUnreached = labelled >= HEALTH_MIN_CALLS && neverReached * 2 >= labelled;
  const warn = mostlySilent || mostlyUnreached;

  const parts = [
    `Of ${labelled} recent call(s) labelled as the receptionist's, ${reached} reached her`,
    neverReached ? ` and ${neverReached} hung up while Hank's phone was still ringing` : '',
    '. ',
    reached ? `On ${silent} of the ${reached} she answered, the caller said nothing or only "hello" before hanging up.` : '',
  ];
  let statement = parts.join('');
  if (warn) {
    statement += ' Callers are not staying on the line with the conversational receptionist.' +
      ' Consider switching live calls to the voicemail message on the receptionist test page until this is fixed.';
  }
  return { ...base, warn, statement: statement.trim() };
}

/** Read the last `days` of live calls and judge them. Never throws: a failed read says so. */
export async function readAgentHealth(client: Client, days = 7, now: () => Date = () => new Date()): Promise<AgentHealth | null> {
  const since = new Date(now().getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await client
      .from('phone_calls')
      .select(HEALTH_COLUMNS)
      .eq('is_test', false)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(300);
    if (error || !Array.isArray(data)) return null;
    return judgeAgentHealth(data as unknown as HealthRow[]);
  } catch {
    return null;
  }
}
