// The real-time path (ConversationRelay) and the test bench, checked without a phone.
//
// Owner, 2026-09-11: "speed up the response time for the agent to take in the information from the
// user and respond back", and "build a developer page where we can test this system … it should not
// report the test calls as if they are actual customer calls."
//
// Defended here: (1) the spoken-format stream is split into words-now and envelope-later, with a
// marker that survives being cut across chunks; (2) the relay URL token cannot be forged or reused
// past its expiry; (3) after-dial hands the call to the relay only when configured, with the test
// flag as a <Parameter>; (4) relay-ended wraps up, records, or falls back to <Gather>; (5) relay-turn
// refuses anything without the shared secret; (6) the test entry flags the row and never rings the
// owner; (7) the Voice SDK token is a well-formed Twilio JWT.
import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { spokenSplitter, CONTROL_OPEN, CONTROL_CLOSE, greeting } from '@/lib/receptionist/brain';
import { relayConfig, relayToken, validRelayToken, relaySocketUrl, relayTwiml, parseHandoff, RELAY_RS } from '@/lib/receptionist/relay';
import { voiceAccessToken, voiceIdentityFor } from '@/lib/twilio/access-token';
import { esc } from '@/lib/twilio/twiml';

const calls = vi.hoisted(() => ({
  row: null as null | Record<string, unknown>,
  updates: [] as Array<{ sid: string; patch: Record<string, unknown> }>,
  starts: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/receptionist/calls', async (orig) => ({
  ...(await orig<typeof import('@/lib/receptionist/calls')>()),
  startCall: async (_c: unknown, args: Record<string, unknown>) => { calls.starts.push(args); return calls.row; },
  updateCall: async (_c: unknown, sid: string, patch: Record<string, unknown>) => { calls.updates.push({ sid, patch }); return calls.row; },
  getCallBySid: async () => calls.row,
  appendTurns: async () => undefined,
}));
vi.mock('@/lib/twilio/rest', async (orig) => ({
  ...(await orig<typeof import('@/lib/twilio/rest')>()),
  startCallRecording: async () => ({ sid: 'RE1' }),
  twilioConfigured: () => true,
}));
const finish = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@/lib/receptionist/finish', async (orig) => ({
  ...(await orig<typeof import('@/lib/receptionist/finish')>()),
  finishCall: async (...a: unknown[]) => { finish.calls.push(a); },
}));
// 2026-09-15: live calls get the answering machine unless the full agent is switched on; the relay is
// the full agent's transport, so these tests switch it on.
vi.mock('@/lib/receptionist/version-server', () => ({
  readLiveVersion: async () => ({ version: 'agent', updatedBy: null, updatedAt: null }),
  writeLiveVersion: async () => undefined,
}));
import { POST as afterDial } from '@/app/api/twilio/receptionist/after-dial/route';
import { POST as relayEnded } from '@/app/api/twilio/receptionist/relay-ended/route';
import { POST as relayTurn } from '@/app/api/twilio/receptionist/relay-turn/route';
import { POST as testEntry } from '@/app/api/twilio/receptionist/test-entry/route';

const TOKEN = 'test-auth-token';
const SECRET = 'relay-secret-relay-secret-relay-secret';

function signed(url: string, params: Record<string, string>): Request {
  const sig = createHmac('sha1', TOKEN).update(url + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
  const u = new URL(url);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig, 'x-forwarded-proto': u.protocol.replace(':', ''), 'x-forwarded-host': u.host },
    body: new URLSearchParams(params).toString(),
  });
}
function relayEnv(on: boolean) {
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  if (on) { process.env.RECEPTIONIST_RELAY_URL = 'wss://worker.example.test/relay'; process.env.RECEPTIONIST_RELAY_SECRET = SECRET; }
  else { delete process.env.RECEPTIONIST_RELAY_URL; delete process.env.RECEPTIONIST_RELAY_SECRET; }
}

describe('spoken-format stream splitting', () => {
  it('hands the words over as they arrive and the envelope at the end', () => {
    const words: string[] = [];
    const s = spokenSplitter((t) => words.push(t));
    for (const d of ['Sure, ', 'go ahead. ', "I'm listening.", '\n', CONTROL_OPEN, '{"next":"continue","facts":{"kind":"customer"},"readyToSave":false}', CONTROL_CLOSE]) s.push(d);
    const env = s.finish();
    expect(words.join('')).toBe("Sure, go ahead. I'm listening.\n");
    expect(env?.next).toBe('continue');
    expect(env?.facts.kind).toBe('customer');
  });
  it('catches the marker even when it is split across two deltas, and never speaks it', () => {
    const words: string[] = [];
    const s = spokenSplitter((t) => words.push(t));
    for (const d of ['Goodbye now.', '\n<', '<<{"next":"done","facts":{}', ',"summary":"bye"}>', '>>']) s.push(d);
    const env = s.finish();
    expect(words.join('')).toBe('Goodbye now.\n');
    expect(words.join('')).not.toContain('<');
    expect(env?.next).toBe('done');
    expect(env?.summary).toBe('bye');
  });
  it('treats a reply with no envelope as plain speech to keep listening', () => {
    const words: string[] = [];
    const s = spokenSplitter((t) => words.push(t));
    s.push('Just words here.');
    expect(s.finish()).toBeNull();
    expect(words.join('')).toBe('Just words here.');
  });
});

describe('relay URL token', () => {
  it('validates only its own call, secret and time', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const t = relayToken('CA1', exp, SECRET);
    expect(validRelayToken('CA1', exp, t, SECRET)).toBe(true);
    expect(validRelayToken('CA2', exp, t, SECRET)).toBe(false);
    expect(validRelayToken('CA1', exp, t, 'other-secret')).toBe(false);
    expect(validRelayToken('CA1', exp, t, SECRET, (exp + 1) * 1000)).toBe(false);
    expect(validRelayToken('CA1', exp, '', SECRET)).toBe(false);
  });
  it('is carried in the socket URL the TwiML points Twilio at', () => {
    const cfg = relayConfig({ RECEPTIONIST_RELAY_URL: 'wss://worker.example.test/relay', RECEPTIONIST_RELAY_SECRET: SECRET })!;
    const u = new URL(relaySocketUrl(cfg, 'CA1'));
    expect(u.searchParams.get('call')).toBe('CA1');
    expect(validRelayToken('CA1', Number(u.searchParams.get('exp')), u.searchParams.get('t') ?? '', SECRET)).toBe(true);
  });
  it('is off unless both the URL and a real secret are set', () => {
    expect(relayConfig({})).toBeNull();
    expect(relayConfig({ RECEPTIONIST_RELAY_URL: 'https://not-wss', RECEPTIONIST_RELAY_SECRET: SECRET })).toBeNull();
    expect(relayConfig({ RECEPTIONIST_RELAY_URL: 'wss://x/relay', RECEPTIONIST_RELAY_SECRET: 'short' })).toBeNull();
    expect(relayConfig({ RECEPTIONIST_RELAY_URL: 'wss://x/relay', RECEPTIONIST_RELAY_SECRET: SECRET, RECEPTIONIST_RELAY_TTS: 'Google' })?.voice).toBe('en-US-Chirp3-HD-Aoede');
  });
});

describe('relay TwiML', () => {
  it('streams both ways, is interruptible, speaks the greeting up front, and flags a test', () => {
    const cfg = relayConfig({ RECEPTIONIST_RELAY_URL: 'wss://worker.example.test/relay', RECEPTIONIST_RELAY_SECRET: SECRET })!;
    const xml = relayTwiml(cfg, 'CA1', '+12545550100', { test: true });
    expect(xml).toContain('<Connect action="/api/twilio/receptionist/relay-ended" method="POST"><ConversationRelay ');
    expect(xml).toContain(`welcomeGreeting="${esc(greeting())}"`);
    expect(xml).toContain('interruptible="speech"');
    expect(xml).toContain('ttsProvider="ElevenLabs"');
    expect(xml).toContain('transcriptionProvider="Deepgram" speechModel="nova-3-general"');
    expect(xml).toContain('<Parameter name="from" value="+12545550100"/>');
    expect(xml).toContain('<Parameter name="test" value="1"/>');
    expect(relayTwiml(cfg, 'CA1', '+1')).not.toContain('name="test"');
  });
  it('the greeting tells the caller they can simply leave a message', () => {
    expect(greeting()).toMatch(/leave him a message/i);
    expect(greeting()).toMatch(/Hank/);
  });
  // ── THE RELAY IS NO LONGER A LIVE PATH (owner, 2026-09-21) ────────────────────────────────
  //
  // "There seems to be a version of twilio that does not use elevenlabs. I don't wanna use that
  //  version. I either want the voicemail or the natural sounding conversational voice model that
  //  elevenlabs provides."
  //
  // This asserted the opposite: that an unanswered call goes to ConversationRelay, or to a <Gather>
  // loop when the relay is unconfigured. Both were the same receptionist over a different pipe, and
  // offering a TRANSPORT as a peer of "voicemail" and "conversational" is what made the test bench
  // unreadable. There is one fallback now and it is the voicemail message.
  //
  // The relay's own modules still build valid TwiML — the tests above still cover that — they are
  // simply not reachable from a live call any more.
  it('after-dial never hands a live call to the relay or to <Gather>', async () => {
    calls.row = { answered_by: null, recording_sid: null };
    const url = 'https://www.starr-surveying.com/api/twilio/receptionist/after-dial';
    for (const configured of [true, false]) {
      relayEnv(configured);
      const xml = await (await afterDial(signed(url, { From: '+12545550100', CallSid: 'CA1', DialCallStatus: 'no-answer' }))).text();
      expect(xml, `relay configured=${configured}`).not.toContain('<ConversationRelay');
      expect(xml, `relay configured=${configured}`).not.toContain('<Gather input="speech"');
      // The voicemail message is what a caller gets whenever the conversational agent cannot answer.
      expect(xml, `relay configured=${configured}`).toContain('<Record');
    }
  });
});

describe('relay-ended (the <Connect> action)', () => {
  const url = 'https://www.starr-surveying.com/api/twilio/receptionist/relay-ended';
  it('done: wraps up and hangs up', async () => {
    relayEnv(true); finish.calls.length = 0;
    const handoff = JSON.stringify({ next: 'done', summary: 'wants a boundary survey', state: { facts: { kind: 'customer', name: 'Jane' }, turns: [] } });
    const xml = await (await relayEnded(signed(url, { CallSid: 'CA1', From: '+12545550100', HandoffData: handoff, SessionStatus: 'ended' }))).text();
    expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
    expect(finish.calls.length).toBe(1);
    expect((finish.calls[0] as unknown[])[3]).toBe('wants a boundary survey');
  });
  it('voicemail: records, with the facts carried in the cookie', async () => {
    relayEnv(true);
    const handoff = JSON.stringify({ next: 'voicemail', state: { facts: { name: 'Jane' }, turns: [] } });
    const res = await relayEnded(signed(url, { CallSid: 'CA1', From: '+12545550100', HandoffData: handoff }));
    const xml = await res.text();
    expect(xml).toContain('<Record action="/api/twilio/receptionist/voicemail"');
    expect(res.headers.get('set-cookie')).toContain('starr_rcpt=');
  });
  it('failed before any handoff: falls back to the <Gather> receptionist', async () => {
    relayEnv(true);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const xml = await (await relayEnded(signed(url, { CallSid: 'CA1', From: '+12545550100', SessionStatus: 'failed', ErrorCode: '64102' }))).text();
    expect(xml).toContain('<Gather input="speech"');
    expect(xml).toContain(esc(greeting()));
    spy.mockRestore();
  });
  it('parses handoff data defensively', () => {
    expect(parseHandoff(undefined)).toBeNull();
    expect(parseHandoff('not json')).toBeNull();
    expect(parseHandoff('{"next":"weird"}')).toBeNull();
    expect(parseHandoff('{"next":"done","test":true}')?.test).toBe(true);
  });
});

describe('relay-turn (relay → app)', () => {
  const url = 'https://www.starr-surveying.com/api/twilio/receptionist/relay-turn';
  it('refuses a request without the shared secret, or with the wrong one', async () => {
    relayEnv(true);
    const body = JSON.stringify({ event: 'turn', callSid: 'CA1', from: '+1', heard: 'hi', state: { turns: [], facts: {}, silence: 0, started: 1 } });
    expect((await relayTurn(new Request(url, { method: 'POST', body, headers: { 'content-type': 'application/json' } }))).status).toBe(403);
    expect((await relayTurn(new Request(url, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-relay-secret': 'nope' } }))).status).toBe(403);
    relayEnv(false);
    expect((await relayTurn(new Request(url, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-relay-secret': SECRET } }))).status).toBe(403);
  });
  it('accepts the secret and acknowledges an interrupt', async () => {
    relayEnv(true);
    const res = await relayTurn(new Request(url, { method: 'POST', body: JSON.stringify({ event: 'interrupt', callSid: 'CA1', said: 'Sure, go' }), headers: { 'content-type': 'application/json', 'x-relay-secret': SECRET } }));
    expect(res.status).toBe(200);
  });
  it('the record separator is a control character that never appears in speech', () => {
    expect(RELAY_RS).toBe('');
  });
});

describe('test entry (the developer page)', () => {
  // ── TWO BRANCHES, THE SAME TWO A LIVE CALL HAS (owner, 2026-09-22) ────────────────────────────
  //
  // These pinned the relay and the <Gather> loop, which this route kept for a day after `after-dial`
  // lost them. That is the one thing a test bench must never be: a path production does not have.
  // It passes, and it is about something else.
  //
  // "The start call option just is the voicemail receptionist message." The browser-call card that
  // produced that report is deleted; what survives is "Call my phone", and it reaches the agent.
  const url = 'https://www.starr-surveying.com/api/twilio/receptionist/test-entry';

  it('flags the row as a test, names the tester, starts recording, and dials the agent', async () => {
    calls.starts.length = 0; calls.updates.length = 0;
    process.env.ELEVENLABS_SIP_URI = 'sip:+18338426971@sip.rtc.elevenlabs.io:5060';
    try {
      const xml = await (await testEntry(signed(url, { CallSid: 'CAtest', From: '+18338426971', To: '+12545550100', Direction: 'outbound-api' }))).text();
      expect(calls.starts[0]).toMatchObject({ callSid: 'CAtest', from: '+12545550100', isTest: true });
      expect(calls.updates.some((u) => u.patch.is_test === true && u.patch.answered_by === 'ai')).toBe(true);
      expect(xml).toContain('<Sip>');
      expect(xml, 'the notice is spoken before the agent picks up').toContain('recorded');
      // The retired third version must not be reachable from the bench either.
      expect(xml).not.toContain('<ConversationRelay');
      expect(xml).not.toContain('<Gather input="speech"');
    } finally {
      delete process.env.ELEVENLABS_SIP_URI;
    }
  });

  // ── THE DEFAULT IS THE THING THE BENCH EXISTS TO TEST ────────────────────────────────────────
  //
  // With no version named, this route used to fall through to `'agent'` — a value
  // `parseTestVersion` can no longer return and nothing can choose — and so matched neither branch
  // and dropped out of the bottom into the relay. A request whose version parameter did not survive
  // the trip got a receptionist nobody had asked for.
  it('with no version named, asks for the conversational receptionist', async () => {
    calls.starts.length = 0;
    process.env.ELEVENLABS_SIP_URI = 'sip:+18338426971@sip.rtc.elevenlabs.io:5060';
    try {
      const xml = await (await testEntry(signed(url, { CallSid: 'CAtest3', From: 'client:jacob_example.test', To: '', Direction: 'inbound' }))).text();
      expect(xml).toContain('<Sip>');
    } finally {
      delete process.env.ELEVENLABS_SIP_URI;
    }
  });

  it('a browser caller is named by its client identity', async () => {
    calls.starts.length = 0;
    await testEntry(signed(url, { CallSid: 'CAtest2', From: 'client:jacob_example.test', To: '', Direction: 'inbound' }));
    expect(calls.starts[0]).toMatchObject({ from: 'client:jacob_example.test', isTest: true });
  });

  it('falls back to the voicemail message when no trunk is configured, exactly as a live call does', async () => {
    delete process.env.ELEVENLABS_SIP_URI;
    const xml = await (await testEntry(signed(url, { CallSid: 'CAtest4', From: '+18338426971', To: '+12545550100', Direction: 'outbound-api' }))).text();
    expect(xml).toContain('<Record');
    expect(xml).not.toContain('<Gather input="speech"');
    expect(xml).not.toContain('<ConversationRelay');
  });

  it('runs the voicemail message when it is the one asked for', async () => {
    process.env.ELEVENLABS_SIP_URI = 'sip:+18338426971@sip.rtc.elevenlabs.io:5060';
    try {
      const xml = await (await testEntry(signed(`${url}?version=answering-machine`, { CallSid: 'CAtest5', From: '+18338426971', To: '+12545550100', Direction: 'outbound-api' }))).text();
      expect(xml).toContain('<Record');
      expect(xml).not.toContain('<Sip>');
    } finally {
      delete process.env.ELEVENLABS_SIP_URI;
    }
  });
});

describe('Voice SDK access token', () => {
  it('is a Twilio-shaped JWT for the TwiML App, signed with the API key secret', () => {
    const env = { TWILIO_ACCOUNT_SID: 'AC' + '1'.repeat(32), TWILIO_API_KEY_SID: 'SK' + '2'.repeat(32), TWILIO_API_KEY_SECRET: 'sekret', TWILIO_TWIML_APP_SID: 'AP' + '3'.repeat(32) };
    const tok = voiceAccessToken('jacob_example.test', 600, env, 1_700_000_000_000);
    const [h, p, s] = tok.split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(header).toEqual({ typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' });
    expect(payload.iss).toBe(env.TWILIO_API_KEY_SID);
    expect(payload.sub).toBe(env.TWILIO_ACCOUNT_SID);
    expect(payload.exp - payload.iat).toBe(600);
    expect(payload.grants.voice.outgoing.application_sid).toBe(env.TWILIO_TWIML_APP_SID);
    expect(payload.grants.identity).toBe('jacob_example.test');
    const expected = createHmac('sha256', 'sekret').update(`${h}.${p}`).digest('base64url');
    expect(s).toBe(expected);
    expect(voiceIdentityFor('Jacob Maddux <jacob@example.test>')).toBe('jacob_maddux__jacob@example.test_');
  });
});

describe('round three: what the third live call taught', () => {
  it('drops a leaked "What I will say:" label before the words reach the voice', () => {
    const words: string[] = [];
    const s = spokenSplitter((t) => words.push(t));
    for (const d of ['What I will', ' say: Thanks, Frankie. ', 'For a sale, most lenders want a boundary and improvements survey.', '\n', CONTROL_OPEN, '{"next":"continue","facts":{}}', CONTROL_CLOSE]) s.push(d);
    s.finish();
    expect(words.join('')).toBe('Thanks, Frankie. For a sale, most lenders want a boundary and improvements survey.\n');
  });
  it('a short reply with no label still comes through whole', () => {
    const words: string[] = [];
    const s = spokenSplitter((t) => words.push(t));
    s.push('Okay.');
    s.finish();
    expect(words.join('')).toBe('Okay.');
  });
  // Owner, 2026-09-16: "It should not assume the caller is a previous caller … Another call the agent
  // asked if the caller was Jacob, which is me." The greeting names nobody now: caller ID says which
  // phone is calling, never who is holding it.
  it('greets nobody by name, however well we think we know the number', () => {
    expect(greeting()).toMatch(/^Hi, thanks for calling Starr Surveying\. This is Ellie\./);
    expect(greeting()).not.toContain('Is this');
    expect(greeting()).toMatch(/leave him a message/);
  });
  it('recognises a number however it is written, and says what is on file', async () => {
    const { digitsOf, knownCallerLine } = await import('@/lib/receptionist/known-caller');
    expect(digitsOf('+12543151123')).toBe('2543151123');
    expect(digitsOf('(254) 315-1123')).toBe('2543151123');
    expect(digitsOf('254.315.1123')).toBe('2543151123');
    const line = knownCallerLine({
      name: 'Jane Doe', nameCertain: false, relationship: 'customer', notes: null,
      email: 'jane@example.test', source: 'lead', lastSeen: '2026-08-02T15:00:00Z',
      lastAbout: 'boundary survey at 1 Main St', timesCalled: 2,
      enquiries: [{ when: '2026-08-02T15:00:00Z', service: 'boundary', address: '1 Main St', name: 'Jane Doe' }],
    })!;
    // It is told the history — and told, in the same breath, not to act on it until the caller does.
    expect(line).toContain('Jane Doe');
    expect(line).toContain('1 Main St');
    expect(line).toContain('2 times before');
    expect(line).toMatch(/DO NOT say that name first/);
    expect(line).toMatch(/have you called us before\?/);
    expect(line).toMatch(/NEVER MIX JOBS/);
    expect(line).toMatch(/new call is a new job/);
    expect(knownCallerLine(null)).toBeNull();
  });
  it('the script asks for an email and spells it back, allows one estimate, and knows the time-limit rule', async () => {
    const { systemPrompt } = await import('@/lib/receptionist/brain');
    const p = systemPrompt('spoken');
    expect(p).toMatch(/letter by letter/);
    // Owner, 2026-09-12: "should ask how to spell a name, especially a last name, if it is not sure."
    expect(p).toMatch(/spell your last name/);
    // Owner, 2026-09-16: "I don't want to offer quotes anymore at all with the AI agent."
    expect(p).toMatch(/only \$\{?Hank\}? gives official quotes|only Hank gives official quotes/);
    expect(p).not.toMatch(/ONE ESTIMATE PER CALL/);
    expect(p).toMatch(/TIME LIMIT REACHED/);
    expect(p).toContain('"email": "..."');
    // Owner, 2026-09-12: "check and see if the caller has a property id … if they are wanting a quote for a property."
    expect(p).toMatch(/property ID/);
    expect(p).toContain('"propertyId": "..."');
  });
  it("keeps every email lowercase and closes the gaps the transcriber leaves (owner, 2026-09-12)", async () => {
    const { parseEnvelope } = await import("@/lib/receptionist/brain");
    const r = parseEnvelope("{\"say\":\"ok\",\"next\":\"continue\",\"facts\":{\"email\":\" Jacob.Maddux At Gmail dot COM \"}}");
    expect(r?.facts.email).toBe("jacob.maddux@gmail.com");
    expect(parseEnvelope("{\"say\":\"ok\",\"facts\":{\"email\":\"not an address\"}}")?.facts.email).toBeUndefined();
  });
});
