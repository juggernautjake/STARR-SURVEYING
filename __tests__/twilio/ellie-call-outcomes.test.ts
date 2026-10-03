// Ellie's calls, as they actually went (2026-09-29).
//
// Owner: "It seems like for every single call that she answers, there is no response and no
// transcription and no recording at all … nobody has left a message with her at all. Please see if
// there are any bugs … where we are not getting people's recorded messages or where it is hanging
// up on them."
//
// What the live table showed for 2026-09-22 → 09-29, the week she answered over SIP:
//
//   10 calls labelled "Receptionist"
//    4 never reached her — the caller hung up while Hank's phone rang (11–27 s, no recording).
//      after-dial still stamped them `ai` and dialled the agent for nobody, and because the row
//      said somebody answered, nobody was told about a missed call.
//    6 reached her — every one over 9–25 s into her leg, the caller silent or saying "hello?".
//    0 messages left, against 5 the plain answering machine took the week before.
//
// Defended here:
//   1. a caller who is gone is never labelled as the receptionist's, never dialled, never recorded;
//   2. an agent leg that fails, or ends in seconds with the caller still there, becomes a voicemail
//      prompt — never silence and never a hang-up;
//   3. a caller who hangs up on her in seconds is summarised as exactly that;
//   4. the health check reads the real week above and raises the warning the owner never got;
//   5. every TwiML document these routes return is well-formed.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { esc } from '@/lib/twilio/twiml';
import { expectOrder } from '../helpers/expect-order';

const calls = vi.hoisted(() => ({
  row: null as null | Record<string, unknown>,
  updates: [] as Array<{ sid: string; patch: Record<string, unknown> }>,
}));
vi.mock('@/lib/receptionist/calls', async (orig) => ({
  ...(await orig<typeof import('@/lib/receptionist/calls')>()),
  startCall: async () => null,
  updateCall: async (_c: unknown, sid: string, patch: Record<string, unknown>) => {
    calls.updates.push({ sid, patch });
    return calls.row ? { ...calls.row, ...patch } : null;
  },
  getCallBySid: async () => calls.row,
  isTestCall: async () => false,
  appendTurns: async () => undefined,
}));
const version = vi.hoisted(() => ({ value: 'elevenlabs' }));
vi.mock('@/lib/receptionist/version-server', () => ({
  readLiveVersion: async () => ({ version: version.value, voice: null, updatedBy: null, updatedAt: null }),
  writeLiveVersion: async () => undefined,
}));
const side = vi.hoisted(() => ({
  recordings: [] as string[],
  outcomes: [] as Array<{ sid: string; outcome: string; detail: Record<string, unknown> }>,
  notified: [] as Array<Record<string, unknown>>,
  finished: [] as Array<{ sid: string; summary: string }>,
  deferred: [] as Array<Promise<unknown>>,
}));
vi.mock('@/lib/twilio/rest', async (orig) => ({
  ...(await orig<typeof import('@/lib/twilio/rest')>()),
  twilioConfigured: () => true,
  startCallRecording: async (sid: string) => { side.recordings.push(sid); return { sid: 'RE1' }; },
}));
vi.mock('@/lib/receptionist/call-outcome', async (orig) => ({
  ...(await orig<typeof import('@/lib/receptionist/call-outcome')>()),
  recordOutcome: async (_c: unknown, sid: string, outcome: string, detail: Record<string, unknown> = {}) => { side.outcomes.push({ sid, outcome, detail }); },
}));
vi.mock('@/lib/receptionist/notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/receptionist/notify')>()),
  notifyOwners: async (o: Record<string, unknown>) => { side.notified.push(o); },
}));
vi.mock('@/lib/receptionist/finish', async (orig) => ({
  ...(await orig<typeof import('@/lib/receptionist/finish')>()),
  finishCall: async (sid: string, _from: string, _state: unknown, summary: string) => { side.finished.push({ sid, summary }); },
}));
vi.mock('@/lib/server/defer', () => ({ defer: (p: Promise<unknown>) => { side.deferred.push(p); } }));

import { POST as afterDial } from '@/app/api/twilio/receptionist/after-dial/route';
import { POST as agentEnded } from '@/app/api/twilio/receptionist/agent-ended/route';
import { FALLBACK_APOLOGY, MACHINE_LINES, machineStart } from '@/lib/receptionist/answering-machine';
import {
  callerIsGone, agentEndedEarly, callerTalked, judgeAgentHealth, AGENT_EARLY_END_SECONDS, type HealthRow,
} from '@/lib/receptionist/call-outcome';

const TOKEN = 'test-auth-token';
const BASE = 'https://www.starr-surveying.com';
const SIP = 'sip:+18338426971@sip.rtc.elevenlabs.io:5060';

function signed(url: string, params: Record<string, string>): Request {
  const sig = createHmac('sha1', TOKEN).update(url + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
  const u = new URL(url);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig, 'x-forwarded-proto': u.protocol.replace(':', ''), 'x-forwarded-host': u.host },
    body: new URLSearchParams(params).toString(),
  });
}

/** Well-formed enough for Twilio: one XML declaration, a single <Response>, every tag closed in order. */
function wellFormedTwiml(xml: string): boolean {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><Response')) return false;
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z]+)((?:\s+[A-Za-z]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  for (let m = tag.exec(body); m; m = tag.exec(body)) {
    if (/[<>]/.test(body.slice(last, m.index))) return false; // a stray bracket in text
    last = tag.lastIndex;
    const [, close, name, , selfClose] = m;
    if (selfClose) continue;
    if (close) { if (stack.pop() !== name) return false; } else stack.push(name);
  }
  return stack.length === 0 && !/[<>]/.test(body.slice(last));
}

beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  process.env.ELEVENLABS_SIP_URI = SIP;
  version.value = 'elevenlabs';
  calls.row = { id: 'row-1', call_sid: 'CA1', answered_by: null, notified_at: null, is_test: false, from_number: '+12545550100' };
  calls.updates.length = 0;
  side.recordings.length = 0;
  side.outcomes.length = 0;
  side.notified.length = 0;
  side.finished.length = 0;
  side.deferred.length = 0;
});

const afterDialUrl = `${BASE}/api/twilio/receptionist/after-dial`;
const agentEndedUrl = `${BASE}/api/twilio/receptionist/agent-ended`;

describe('the pure rules', () => {
  it('a final CallStatus means the caller is gone; in-progress or absent means they are still there', () => {
    for (const s of ['completed', 'canceled', 'busy', 'failed', 'no-answer', 'COMPLETED']) expect(callerIsGone({ CallStatus: s })).toBe(true);
    for (const s of ['in-progress', 'ringing', '', undefined]) expect(callerIsGone({ CallStatus: s })).toBe(false);
  });

  it('an agent leg under the threshold is a failure, a longer one is a conversation', () => {
    expect(agentEndedEarly(0)).toBe(false); // never connected is its own case
    expect(agentEndedEarly(9)).toBe(true); // the production pattern
    expect(agentEndedEarly(AGENT_EARLY_END_SECONDS)).toBe(false);
    expect(agentEndedEarly(120)).toBe(false);
  });

  it('"hello?" is not talking to her; a sentence is', () => {
    expect(callerTalked([{ role: 'caller', text: 'Hello?' }, { role: 'assistant', text: 'Starr Surveying, this is Ellie.' }, { role: 'caller', text: 'Hello? Hello' }])).toBe(false);
    expect(callerTalked([{ role: 'caller', text: '(No message recorded.)' }])).toBe(false);
    expect(callerTalked([{ role: 'caller', text: 'I need a survey for a fence line.' }])).toBe(true);
    expect(callerTalked(null)).toBe(false);
  });

  it('the fallback greeting can open with the apology, and stays well-formed', () => {
    const xml = machineStart(null, FALLBACK_APOLOGY);
    expect(wellFormedTwiml(xml)).toBe(true);
    expectOrder(xml, esc(FALLBACK_APOLOGY), esc(MACHINE_LINES.greeting), 'the apology comes before the greeting');
    expect(xml).toContain('<Record ');
    expect(machineStart(null)).not.toContain(esc(FALLBACK_APOLOGY));
  });
});

describe('after-dial: a caller who hung up while Hank\'s phone rang', () => {
  it('is not labelled the receptionist\'s, not dialled to the agent, and not recorded', async () => {
    const res = await afterDial(signed(afterDialUrl, { CallSid: 'CA1', From: '+12545550100', DialCallStatus: 'no-answer', CallStatus: 'completed' }));
    const xml = await res.text();
    expect(xml).not.toContain('<Sip');
    expect(xml).not.toContain('<Record');
    expect(xml).toContain('<Hangup/>');
    expect(wellFormedTwiml(xml)).toBe(true);
    expect(calls.updates.some((u) => u.patch.answered_by === 'ai'), 'the row must stay empty so the status callback reports it as missed').toBe(false);
    expect(side.recordings, 'no recording on a finished call ("not eligible for recording")').toEqual([]);
    expect(side.outcomes).toEqual([expect.objectContaining({ sid: 'CA1', outcome: 'hung-up-while-holding' })]);
  });

  it('a caller still holding is dialled to the agent, and the <Dial> alone records that leg', async () => {
    const xml = await (await afterDial(signed(afterDialUrl, { CallSid: 'CA1', From: '+12545550100', DialCallStatus: 'no-answer', CallStatus: 'in-progress' }))).text();
    expect(xml).toContain('<Sip>');
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(wellFormedTwiml(xml)).toBe(true);
    expect(side.recordings, 'one recording of the agent leg, not two racing for the row').toEqual([]);
  });

  it('the voicemail message records the whole leg, and the recording is started before the TwiML goes back', async () => {
    version.value = 'answering-machine';
    const xml = await (await afterDial(signed(afterDialUrl, { CallSid: 'CA1', From: '+12545550100', DialCallStatus: 'no-answer', CallStatus: 'in-progress' }))).text();
    expect(xml).toContain(esc(MACHINE_LINES.greeting));
    expect(wellFormedTwiml(xml)).toBe(true);
    expect(side.recordings).toEqual(['CA1']);
  });

  it('Hank answering is unchanged', async () => {
    calls.row = { ...calls.row, answered_by: 'owner' };
    const xml = await (await afterDial(signed(afterDialUrl, { CallSid: 'CA1', From: '+12545550100', DialCallStatus: 'completed', DialCallDuration: '120', CallStatus: 'completed' }))).text();
    expect(xml).toContain('<Hangup/>');
    expect(calls.updates.some((u) => u.patch.answered_by === 'owner')).toBe(true);
    expect(side.outcomes).toEqual([]);
  });
});

describe('agent-ended: every way the agent leg can end', () => {
  const end = async (p: Record<string, string>) => (await agentEnded(signed(agentEndedUrl, { CallSid: 'CA1', From: '+12545550100', ...p }))).text();

  it('ended in seconds with the caller still on the line → apology, then the voicemail message', async () => {
    const xml = await end({ DialCallStatus: 'completed', DialCallDuration: '9', CallStatus: 'in-progress' });
    expect(xml).toContain(esc(FALLBACK_APOLOGY));
    expect(xml).toContain(esc(MACHINE_LINES.greeting));
    expect(xml).toContain('<Record ');
    expect(xml).not.toContain('<Hangup/>');
    expect(wellFormedTwiml(xml)).toBe(true);
    expect(side.outcomes[0]).toMatchObject({ outcome: 'agent-ended-early', detail: expect.objectContaining({ dialSeconds: 9 }) });
    expect(side.recordings, 'the message is recorded').toEqual(['CA1']);
    expect(calls.updates.at(-1)?.patch.answered_by, 'left empty until they leave something').toBeNull();
  });

  it('never connected with the caller still there → the voicemail message, no apology needed', async () => {
    const xml = await end({ DialCallStatus: 'failed', DialCallDuration: '0', CallStatus: 'in-progress', DialSipResponseCode: '503' });
    expect(xml).toContain(esc(MACHINE_LINES.greeting));
    expect(xml).not.toContain(esc(FALLBACK_APOLOGY));
    expect(wellFormedTwiml(xml)).toBe(true);
    expect(side.outcomes[0]).toMatchObject({ outcome: 'agent-no-connect', detail: expect.objectContaining({ sipResponseCode: '503' }) });
  });

  it('the caller hung up before she answered → closed as missed and the owners told, even if the status callback already ran', async () => {
    calls.row = { ...calls.row, answered_by: 'ai', status: 'completed' }; // what after-dial + an early status callback leave
    const xml = await end({ DialCallStatus: 'no-answer', DialCallDuration: '0', CallStatus: 'completed' });
    expect(xml).toContain('<Hangup/>');
    expect(calls.updates.some((u) => u.patch.answered_by === 'none')).toBe(true);
    await Promise.all(side.deferred);
    expect(side.notified).toEqual([expect.objectContaining({ answeredBy: 'none' })]);
    expect(side.outcomes[0].outcome).toBe('hung-up-before-agent');
  });

  it('the caller hung up on her within seconds → summarised as that, not as a conversation', async () => {
    const xml = await end({ DialCallStatus: 'completed', DialCallDuration: '9', CallStatus: 'completed' });
    expect(xml).toContain('<Hangup/>');
    expect(calls.updates.some((u) => u.patch.answered_by === 'ai'), 'she did answer: the recording is transcribed as hers').toBe(true);
    expect(side.outcomes[0].outcome).toBe('caller-left-agent-early');
    expect(side.finished[0].summary).toMatch(/^Hung up 9 seconds after the receptionist answered/);
  });

  it('a real conversation ends the way it always did', async () => {
    const xml = await end({ DialCallStatus: 'completed', DialCallDuration: '140', CallStatus: 'in-progress' });
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('<Record');
    expect(side.outcomes[0].outcome).toBe('agent-completed');
    expect(side.finished[0].summary).toMatch(/took a call, 140 seconds/);
  });
});

// ── The real week, anonymised ─────────────────────────────────────────────────────────────────
// Durations, recording lengths and the SHAPE of each transcript as they were on the live table for
// 2026-09-22 → 09-29 (caller words replaced by placeholders of the same kind). Hank's calls are
// included because the health check must ignore them.
const greet = { role: 'assistant', text: 'Starr Surveying. This is Ellie. I\'m an automated assistant, and this call is recorded. How can I help you today?' };
const hello = { role: 'caller', text: 'Hello?' };
const REAL_WEEK: HealthRow[] = [
  { answered_by: 'ai', duration_seconds: 40, recording_duration: 9, transcript: [greet], voicemail_text: null, started_at: '2026-09-22T14:00:00Z' },
  { answered_by: 'ai', duration_seconds: 37, recording_duration: 9, transcript: [hello, greet, { role: 'caller', text: 'Hello, hi?' }], voicemail_text: null, started_at: '2026-09-22T15:53:00Z' },
  { answered_by: 'ai', duration_seconds: 37, recording_duration: 9, transcript: [hello, { role: 'caller', text: 'Hello? Hi.' }, greet], voicemail_text: null, started_at: '2026-09-22T18:13:00Z' },
  { answered_by: 'ai', duration_seconds: 51, recording_duration: 20, transcript: [greet, { role: 'caller', text: 'I was calling about a survey on my land' }, { role: 'assistant', text: 'Can I get your name?' }], voicemail_text: null, started_at: '2026-09-23T15:14:00Z' },
  { answered_by: 'ai', duration_seconds: 40, recording_duration: 10, transcript: [greet], voicemail_text: null, started_at: '2026-09-24T21:39:00Z' },
  { answered_by: 'ai', duration_seconds: 24, recording_duration: null, transcript: [], voicemail_text: null, started_at: '2026-09-25T21:00:00Z' },
  { answered_by: 'ai', duration_seconds: 11, recording_duration: null, transcript: [], voicemail_text: null, started_at: '2026-09-26T20:44:00Z' },
  { answered_by: 'ai', duration_seconds: 27, recording_duration: null, transcript: [], voicemail_text: null, started_at: '2026-09-28T13:55:00Z' },
  { answered_by: 'ai', duration_seconds: 26, recording_duration: null, transcript: [], voicemail_text: null, started_at: '2026-09-28T15:30:00Z' },
  { answered_by: 'ai', duration_seconds: 60, recording_duration: 25, transcript: [greet, { role: 'assistant', text: 'Are you still there? I\'m here when you\'re ready.' }], voicemail_text: null, started_at: '2026-09-29T14:05:00Z' },
  { answered_by: 'owner', duration_seconds: 414, recording_duration: 385, transcript: [{ role: 'caller', text: 'a long conversation with Hank' }], voicemail_text: null, started_at: '2026-09-28T19:44:00Z' },
  { answered_by: 'voicemail', duration_seconds: 62, recording_duration: 42, transcript: [], voicemail_text: 'a message left on the machine', started_at: '2026-09-23T15:29:00Z' },
];

describe('the health check, on the week the owner asked about', () => {
  it('raises the warning: most calls never reached her, and nearly everyone who did said nothing', () => {
    const h = judgeAgentHealth(REAL_WEEK);
    expect(h).toMatchObject({ labelled: 10, neverReached: 4, reached: 6, talked: 1, silent: 5, messagesLeft: 1, warn: true });
    expect(h.statement).toContain('hung up while Hank\'s phone was still ringing');
    expect(h.statement).toContain('voicemail message');
  });

  it('stays quiet about a healthy week, and about a week with too few calls to judge', () => {
    const talking = (s: number): HealthRow => ({ answered_by: 'ai', duration_seconds: 90, recording_duration: s, transcript: [greet, { role: 'caller', text: 'I need a boundary survey for a lot in Belton' }], voicemail_text: null, started_at: null });
    expect(judgeAgentHealth([talking(60), talking(80), talking(120), REAL_WEEK[0]]).warn).toBe(false);
    expect(judgeAgentHealth([REAL_WEEK[0], REAL_WEEK[1]]).warn).toBe(false);
    expect(judgeAgentHealth([]).statement).toMatch(/No calls/);
  });
});
