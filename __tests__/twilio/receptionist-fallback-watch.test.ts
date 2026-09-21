/**
 * The check that would have caught five days of silent voicemail.
 *
 * On 2026-09-16 live calls were switched to the ElevenLabs agent. The setting was right, every
 * credential was present, the admin page said "callers get: Conversational agent (ElevenLabs)" —
 * and for five days the SIP trunk refused every INVITE in about a second, the fallback handed each
 * caller to the answering machine exactly as designed, and nothing anywhere said so.
 *
 * The fallback is correct and stays. What these tests hold is the part that was missing: something
 * that compares what we CHOSE against what actually answered.
 */

import { describe, it, expect } from 'vitest';
import {
  readAnswerMix, judgeFallback, isConversational,
  type AnswerMix,
} from '@/lib/receptionist/fallback-watch';

const mix = (over: Partial<AnswerMix> = {}): AnswerMix =>
  ({ reached: 0, byAgent: 0, byMachine: 0, lastFallbackAt: null, ...over });

describe('which versions are a conversation', () => {
  it('counts both agent transports and not the machine', () => {
    expect(isConversational('elevenlabs')).toBe(true);
    expect(isConversational('agent')).toBe(true);
    expect(isConversational('answering-machine')).toBe(false);
  });
});

describe('judgeFallback', () => {
  it('RAISES the alarm when the agent answered none of them', () => {
    // The real shape of 2026-09-16 → 09-21: five callers, five voicemails, zero agent calls.
    const v = judgeFallback('elevenlabs', mix({
      reached: 5, byAgent: 0, byMachine: 5, lastFallbackAt: '2026-09-21T17:55:16.750Z',
    }));
    expect(v.silentFallback).toBe(true);
    expect(v.statement).toMatch(/answered NONE/);
    expect(v.statement).toMatch(/sent to voicemail/i);
    // The date matters: it is what tells someone this is happening NOW and not last month.
    expect(v.statement).toContain('2026-09-21');
  });

  it('stays quiet when the agent is working', () => {
    const v = judgeFallback('agent', mix({ reached: 4, byAgent: 4, byMachine: 0 }));
    expect(v.silentFallback).toBe(false);
    expect(v.statement).toMatch(/answered all 4/);
  });

  it('does not cry wolf over a single fallback', () => {
    // A caller can hang up and an agent can end a call oddly. One machine-answered call among
    // several agent-answered ones is not a broken trunk, and an alarm that fires on it gets ignored
    // — which is how a real one gets missed.
    const v = judgeFallback('elevenlabs', mix({ reached: 4, byAgent: 3, byMachine: 1 }));
    expect(v.silentFallback).toBe(false);
    expect(v.statement).toMatch(/3 of the last 4/);
  });

  it('says nothing is proven when no call has fallen past Hank', () => {
    // Silence is not success. An empty window must not read as "the agent is working".
    const v = judgeFallback('elevenlabs', mix({ reached: 0 }));
    expect(v.silentFallback).toBe(false);
    expect(v.statement).toMatch(/nothing has tested it yet/i);
  });

  it('never alarms when the machine is the deliberate choice', () => {
    const v = judgeFallback('answering-machine', mix({ reached: 6, byAgent: 0, byMachine: 6 }));
    expect(v.silentFallback).toBe(false);
    expect(v.statement).toMatch(/set to the answering machine/i);
  });
});

describe('readAnswerMix', () => {
  /** A fake matching the narrow slice of the client the reader uses. */
  function fakeClient(rows: unknown, error: unknown = null) {
    const calls: Record<string, unknown> = {};
    return {
      client: {
        from(table: string) {
          calls.table = table;
          return {
            select(cols: string) {
              calls.cols = cols;
              return {
                eq(col: string, val: unknown) {
                  calls.eqCol = col; calls.eqVal = val;
                  return {
                    gte(c: string, v: string) {
                      calls.gteCol = c; calls.since = v;
                      return {
                        order() {
                          return { limit: async () => ({ data: rows, error }) };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      },
      calls,
    };
  }

  it('counts agent and machine calls, and ignores the ones that prove nothing', async () => {
    const { client } = fakeClient([
      { answered_by: 'voicemail', created_at: '2026-09-21T17:55:16.750Z' },
      { answered_by: 'owner', created_at: '2026-09-21T17:30:12.330Z' },   // Hank took it
      { answered_by: 'none', created_at: '2026-09-17T16:46:02.582Z' },    // nobody reached
      { answered_by: 'ai', created_at: '2026-09-15T16:24:38.529Z' },
    ]);

    const m = await readAnswerMix(client as never);
    expect(m.reached).toBe(2);
    expect(m.byAgent).toBe(1);
    expect(m.byMachine).toBe(1);
    // The newest fallback, not the oldest — rows arrive newest first.
    expect(m.lastFallbackAt).toBe('2026-09-21T17:55:16.750Z');
  });

  it('asks only for live calls, never test ones', async () => {
    // A test call carries its own version in the URL and says nothing about the live line — which
    // is exactly how a bench that sounded perfect coexisted with five real voicemails.
    const { client, calls } = fakeClient([]);
    await readAnswerMix(client as never);
    expect(calls.table).toBe('phone_calls');
    expect(calls.eqCol).toBe('is_test');
    expect(calls.eqVal).toBe(false);
  });

  it('windows the query, so an ancient failure is not reported as current', async () => {
    const { client, calls } = fakeClient([]);
    await readAnswerMix(client as never, 7, () => new Date('2026-09-21T00:00:00.000Z'));
    expect(calls.gteCol).toBe('created_at');
    expect(String(calls.since)).toBe('2026-09-14T00:00:00.000Z');
  });

  it('a failed read reports nothing rather than reporting "all well"', async () => {
    const { client } = fakeClient(null, { message: 'boom' });
    const m = await readAnswerMix(client as never);
    expect(m).toEqual({ reached: 0, byAgent: 0, byMachine: 0, lastFallbackAt: null });
    // And an empty window is explicitly NOT agreement — see the judge test above.
    expect(judgeFallback('elevenlabs', m).silentFallback).toBe(false);
  });
});
