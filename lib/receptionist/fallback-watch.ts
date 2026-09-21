// lib/receptionist/fallback-watch.ts — is the receptionist we CHOSE the one that actually answers?
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// On 2026-09-16 live calls were switched to the ElevenLabs agent. The setting took, the admin page
// said "When Hank doesn't pick up, callers get: Conversational agent (ElevenLabs)", and every
// ElevenLabs credential was present in production. For the next five days every caller Hank missed
// got the answering machine.
//
// Nothing was broken in the sense of throwing. Twilio dialled the agent's SIP trunk, the trunk
// refused the INVITE in about a second, and `agent-ended` did exactly what it was written to do —
// handed the caller to the answering machine so nobody is dropped because a third party is down.
// That fallback is correct and should stay. What was missing is that NOTHING SAID IT HAPPENED. The
// only trace was one console line in a serverless log, and a screen that kept reporting the setting.
//
// Five real callers — Tony Salazar, Hunter Sinclair, Lance Robertson and two more — left voicemails
// believing they had reached the firm's receptionist, and the firm believed they had.
//
// ── WHAT THIS MEASURES ──────────────────────────────────────────────────────────────────────────
//
// The setting is an intention. `phone_calls.answered_by` is the outcome. This compares them over
// the recent past and says, in a sentence, when they disagree. It reads only calls that reached the
// receptionist at all: a call Hank answered proves nothing either way, and a test call is not
// evidence about the live line.

import type { ReceptionistVersion } from './version';

/** A Supabase-ish client. Kept structural so a test can hand in a fake. */
export interface CallReader {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        gte(col: string, val: string): {
          order(col: string, opts: { ascending: boolean }): {
            limit(n: number): Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  };
}

export interface AnswerMix {
  /** Calls that fell past Hank and reached a receptionist, in the window. */
  reached: number;
  /** Of those, how many a conversational agent actually handled. */
  byAgent: number;
  /** Of those, how many the answering machine took. */
  byMachine: number;
  /** The most recent machine-answered call, when the setting says an agent should have taken it. */
  lastFallbackAt: string | null;
}

export interface FallbackVerdict extends AnswerMix {
  /** True when the configured receptionist is NOT the one answering. */
  silentFallback: boolean;
  /** One sentence for a person, always present. */
  statement: string;
}

/** The versions that mean "a conversation", as opposed to recording a message. */
export function isConversational(v: ReceptionistVersion): boolean {
  return v === 'elevenlabs' || v === 'agent';
}

/**
 * Count how the last `days` of live calls were actually answered.
 *
 * Returns zeroes rather than throwing: this runs on an admin page and a failed count must not take
 * the page down — but it must also never report "all well" from a failed read, which is why the
 * verdict below treats an empty window as "nothing to say" rather than as agreement.
 */
export async function readAnswerMix(
  client: CallReader,
  days = 7,
  now: () => Date = () => new Date(),
): Promise<AnswerMix> {
  const since = new Date(now().getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const empty: AnswerMix = { reached: 0, byAgent: 0, byMachine: 0, lastFallbackAt: null };

  try {
    const { data, error } = await client
      .from('phone_calls')
      .select('answered_by, created_at')
      .eq('is_test', false)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !Array.isArray(data)) return empty;

    const rows = data as Array<{ answered_by: string | null; created_at: string | null }>;
    const mix = { ...empty };
    for (const r of rows) {
      // 'owner' means Hank took it and 'none' means nobody was reached — neither is evidence about
      // which receptionist is wired up.
      if (r.answered_by === 'ai') { mix.reached += 1; mix.byAgent += 1; }
      else if (r.answered_by === 'voicemail') {
        mix.reached += 1;
        mix.byMachine += 1;
        if (!mix.lastFallbackAt) mix.lastFallbackAt = r.created_at ?? null;
      }
    }
    return mix;
  } catch {
    return empty;
  }
}

/**
 * Compare the intention against the outcome.
 *
 * Deliberately conservative about crying wolf: a single machine-answered call is not proof of a
 * broken trunk (a caller can hang up, an agent can end a call oddly), so the alarm needs EVERY
 * reached call in the window to have gone to the machine. One agent-answered call in the window is
 * enough to show the path works.
 */
export function judgeFallback(configured: ReceptionistVersion, mix: AnswerMix): FallbackVerdict {
  if (!isConversational(configured)) {
    return {
      ...mix,
      silentFallback: false,
      statement: mix.reached === 0
        ? 'Live calls are set to the answering machine. No calls have fallen past Hank recently.'
        : `Live calls are set to the answering machine, and the machine took ${mix.byMachine} of ${mix.reached}.`,
    };
  }

  if (mix.reached === 0) {
    return {
      ...mix,
      silentFallback: false,
      statement:
        'Live calls are set to the conversational agent. No caller has fallen past Hank recently, ' +
        'so nothing has tested it yet.',
    };
  }

  if (mix.byAgent === 0) {
    return {
      ...mix,
      silentFallback: true,
      statement:
        `Live calls are set to the conversational agent, but the agent has answered NONE of the ` +
        `last ${mix.reached} call(s) that fell past Hank — the answering machine took all of them` +
        (mix.lastFallbackAt ? `, most recently ${mix.lastFallbackAt}` : '') +
        '. The agent leg is failing and callers are being sent to voicemail instead.',
    };
  }

  if (mix.byMachine > 0) {
    return {
      ...mix,
      silentFallback: false,
      statement:
        `The conversational agent answered ${mix.byAgent} of the last ${mix.reached} call(s); ` +
        `${mix.byMachine} fell back to the answering machine.`,
    };
  }

  return {
    ...mix,
    silentFallback: false,
    statement: `The conversational agent answered all ${mix.reached} of the recent call(s) that fell past Hank.`,
  };
}
