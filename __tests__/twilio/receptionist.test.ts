// The AI receptionist: the parts that can be checked without a phone.
//
// Owner, 2026-09-11: "if someone calls my dad and he does not respond … the AI voice answers … it
// would still need to be able to record messages … if the caller is a potential customer, then it
// would need to be able to take down info and answer questions."
//
// What is defended here: (1) a forged webhook is refused and a real one accepted, (2) call state
// survives the cookie round trip and stays under the cookie size limit, (3) the brain's JSON
// envelope is parsed defensively, (4) personal calls text only the owner whose phone forwarded,
// business calls text every owner, (5) the entry route speaks the recording notice before anything
// else. The Claude call and Twilio's own speech recognition are not exercised; they are the two
// pieces that only a real phone call can prove.
import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { validTwilioSignature, twilioSignature, publicUrlOf } from '@/lib/twilio/signature';
import { encodeState, decodeState, emptyState, stateCookieHeader, readStateCookie, COOKIE_NAME } from '@/lib/receptionist/state';
import { parseEnvelope, RECORDING_NOTICE, greeting, holdNotice, whisperText } from '@/lib/receptionist/brain';
import { recipientsFor, outcomeText, notifyOwners, briefSummary, mergedFacts } from '@/lib/receptionist/notify';
import { parseByteRange, rangeResponse } from '@/lib/server/range';
import { twiml, say, gather, esc } from '@/lib/twilio/twiml';
// The routes persist to Supabase; in tests there is no database, so the call-record layer is a
// no-op. What is under test is the TwiML and the gate, not the storage.
const calls = vi.hoisted(() => ({
  row: null as null | Record<string, unknown>,
  updates: [] as Array<{ sid: string; patch: Record<string, unknown> }>,
}));
vi.mock('@/lib/receptionist/calls', async (orig) => ({
  ...(await orig<typeof import('@/lib/receptionist/calls')>()),
  startCall: async () => null,
  updateCall: async (_c: unknown, sid: string, patch: Record<string, unknown>) => { calls.updates.push({ sid, patch }); return calls.row; },
  getCallBySid: async () => calls.row,
  appendTurns: async () => undefined,
}));
import { POST as entry } from '@/app/api/twilio/receptionist/route';
import { POST as afterDial } from '@/app/api/twilio/receptionist/after-dial/route';
import { POST as screen } from '@/app/api/twilio/receptionist/screen/route';

const TOKEN = 'test-auth-token';

function signed(url: string, params: Record<string, string>): Request {
  const sig = createHmac('sha1', TOKEN).update(url + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
  const u = new URL(url);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig, 'x-forwarded-proto': u.protocol.replace(':', ''), 'x-forwarded-host': u.host },
    body: new URLSearchParams(params).toString(),
  });
}

describe('Twilio signature', () => {
  const url = 'https://www.starr-surveying.com/api/twilio/receptionist';
  const params = { From: '+12545550100', CallSid: 'CA1', To: '+18338426971' };
  it('accepts the signature Twilio would send and refuses a forged one', () => {
    const good = twilioSignature(url, params, TOKEN);
    expect(validTwilioSignature(url, params, good, TOKEN)).toBe(true);
    expect(validTwilioSignature(url, params, 'nope', TOKEN)).toBe(false);
    expect(validTwilioSignature(url + '?x=1', params, good, TOKEN)).toBe(false);
    expect(validTwilioSignature(url, { ...params, Body: 'changed' }, good, TOKEN)).toBe(false);
  });
  it('refuses everything when there is no auth token or no header', () => {
    expect(validTwilioSignature(url, params, 'anything', undefined)).toBe(false);
    expect(validTwilioSignature(url, params, null, TOKEN)).toBe(false);
  });
  it('rebuilds the public URL from proxy headers', () => {
    const r = new Request('http://internal:3000/api/twilio/sms?a=1', { headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'www.starr-surveying.com' } });
    expect(publicUrlOf(r)).toBe('https://www.starr-surveying.com/api/twilio/sms?a=1');
  });
});

describe('call state cookie', () => {
  it('round-trips turns and facts', () => {
    const s = emptyState();
    s.turns.push({ role: 'caller', text: 'I need a boundary survey' }, { role: 'assistant', text: 'Sure, what is the address?' });
    s.facts = { kind: 'customer', name: 'Jane', phone: '+12545550100' };
    const back = decodeState(encodeState(s));
    expect(back.turns).toEqual(s.turns);
    expect(back.facts).toEqual(s.facts);
  });
  it('stays under the cookie limit on a long call by dropping the oldest turns, never the facts', () => {
    const s = emptyState();
    s.facts = { kind: 'customer', name: 'Someone With A Long Name', address: '1234 Some Very Long Road Name, Belton, TX 76513' };
    for (let i = 0; i < 60; i++) s.turns.push({ role: i % 2 ? 'assistant' : 'caller', text: `turn ${i} ` + 'lorem ipsum dolor sit amet '.repeat(6) });
    const enc = encodeState(s);
    expect(enc.length).toBeLessThanOrEqual(3500);
    const back = decodeState(enc);
    expect(back.facts).toEqual(s.facts);
    expect(back.turns.length).toBeGreaterThan(0);
    expect(back.turns.at(-1)).toEqual(s.turns.at(-1));
  });
  it('treats a missing or corrupt cookie as a fresh call', () => {
    expect(decodeState(undefined).turns).toEqual([]);
    expect(decodeState('not-base64-zlib').turns).toEqual([]);
    const r = new Request('https://x/', { headers: { cookie: `other=1; ${COOKIE_NAME}=${encodeState({ ...emptyState(), silence: 1 })}` } });
    expect(readStateCookie(r).silence).toBe(1);
    expect(stateCookieHeader(emptyState())).toMatch(/HttpOnly; Secure; SameSite=None/);
  });
});

describe('brain envelope', () => {
  it('parses a well-formed reply and defaults the rest', () => {
    const r = parseEnvelope('Sure: {"say":"What is the address?","next":"continue","facts":{"kind":"customer","name":"Jane"},"readyToSave":false}');
    expect(r?.say).toBe('What is the address?');
    expect(r?.next).toBe('continue');
    expect(r?.facts.name).toBe('Jane');
    expect(parseEnvelope('{"say":"bye","next":"weird"}')?.next).toBe('continue');
    expect(parseEnvelope('no json here')).toBeNull();
    expect(parseEnvelope('{"next":"done"}')).toBeNull();
  });
  it('speaks the recording notice text and a greeting that names the owner', () => {
    expect(RECORDING_NOTICE).toMatch(/recorded/i);
    expect(greeting()).toMatch(/Starr Surveying/);
  });
});

describe('who gets told', () => {
  const env = { LEAD_SMS_RECIPIENTS: '+12545550001,+12545550002', RECEPTIONIST_PERSONAL_RECIPIENT: '+12545550002' };
  it('business calls go to every owner; personal calls only to the forwarded owner', () => {
    expect(recipientsFor({ kind: 'customer' }, env)).toEqual(['+12545550001', '+12545550002']);
    expect(recipientsFor({ kind: 'unknown' }, env)).toEqual(['+12545550001', '+12545550002']);
    expect(recipientsFor({ kind: 'personal' }, env)).toEqual(['+12545550002']);
  });
  it('the text names the caller, the need, and the lead link', () => {
    const t = outcomeText({ from: '+12545550100', facts: { kind: 'customer', name: 'Jane', address: '1 Main St', service: 'Boundary survey', leadId: 'L1' }, summary: 'wants a fence line marked before the contractor starts next week', answeredBy: 'ai' });
    const lines = t.split('\n');
    expect(lines[0]).toBe('Starr Surveying: Customer call, handled by Ellie');
    expect(lines[1]).toBe('Jane · (254) 555-0100');
    expect(t).toContain('Property: 1 Main St');
    expect(t).toContain('Needs: Boundary survey');
    expect(lines[lines.length - 1]).toBe('Listen: https://www.starr-surveying.com/admin/leads/L1');
  });
  it('a voicemail with no collected facts still names the caller from the analysis, with ID and acres', () => {
    const call = {
      analysis: { summary: 'Bob Jones left a message asking for a boundary survey on his 5 acre place before a fence goes up. He asked for a call back.', caller_type: 'customer' as const, intent: '', urgency: 'normal' as const, sentiment: 'neutral' as const, action_items: [], follow_up: '',
        contact: { name: 'Bob Jones', phone: '+12545550199', email: 'bob@example.com', address: '400 FM 93, Temple', property_id: '123456', acres: 5, service: 'boundary survey' } },
    };
    const t = outcomeText({ from: '+12545550100', facts: {}, summary: call.analysis.summary, callId: 'C1', answeredBy: 'voicemail', call, transcript: 'hi this is bob jones …' });
    const lines = t.split('\n');
    expect(lines[0]).toBe('Starr Surveying: New voicemail');
    expect(lines[1]).toBe('Bob Jones · (254) 555-0199 (called from (254) 555-0100)');
    expect(lines[2]).toBe('bob@example.com');
    expect(t).toContain('Property: 400 FM 93, Temple · ID 123456 · 5 ac');
    expect(t).not.toContain('Needs:'); // the summary already says boundary survey
    expect(t).not.toContain('"hi this is bob'); // summarised, so the raw words stay off the phone
    expect(lines[lines.length - 1]).toBe('Listen: https://www.starr-surveying.com/admin/calls/C1');
    expect(t.length).toBeLessThan(400);
  });
  it('facts the receptionist collected beat the row, which beats the analysis', () => {
    const f = mergedFacts({ facts: { name: 'Spelled Name' }, call: { caller_name: 'Row Name', callback_number: '+12545550001', analysis: { summary: '', caller_type: 'customer', intent: '', urgency: 'normal', sentiment: 'neutral', action_items: [], follow_up: '', contact: { name: 'Guessed', phone: null, email: 'x@y.com', address: null, property_id: null, acres: 2.5, service: null } } } });
    expect(f).toEqual({ name: 'Spelled Name', phone: '+12545550001', email: 'x@y.com', acres: 2.5 });
  });
  it('a missed call reads as one', () => {
    const t = outcomeText({ from: '+12545550100', facts: {}, summary: 'Hung up after 4 seconds, before anyone answered.', callId: 'C2', answeredBy: 'none' });
    expect(t.split('\n')).toEqual(['Starr Surveying: Missed call', '(254) 555-0100', 'Hung up after 4 seconds, before anyone answered.', 'Listen: https://www.starr-surveying.com/admin/calls/C2']);
  });
  it('briefSummary keeps whole sentences, at most two', () => {
    expect(briefSummary('One. Two. Three.')).toBe('One. Two.');
    expect(briefSummary('  Just one without a period ')).toBe('Just one without a period');
    expect(briefSummary('A'.repeat(50) + ' ' + 'B'.repeat(50), 60)).toBe('A'.repeat(50) + '…');
  });
  it('never throws when a text fails, and still emails', async () => {
    const send = vi.fn<(i: { to: string; body: string }) => Promise<boolean>>().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(true);
    const email = vi.fn(async () => true);
    const inApp = vi.fn(async () => 2);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await notifyOwners({ from: '+1', facts: { kind: 'customer' }, summary: 's' }, { send, email, inApp, env });
    expect(r).toEqual({ texted: 1, emailed: true, belled: 2 });
    expect(inApp).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe('recording byte ranges', () => {
  it('parses open, closed, and suffix ranges against the file size', () => {
    expect(parseByteRange(null, 100)).toBeNull();
    expect(parseByteRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=0-10,20-30', 100)).toBeNull();
  });
  it('answers with a length, and 206 with a content-range for a slice', async () => {
    const bytes = new Uint8Array(100).map((_, i) => i);
    const whole = rangeResponse(bytes, null, { 'content-type': 'audio/mpeg' });
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-length')).toBe('100');
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    const part = rangeResponse(bytes, 'bytes=10-19', { 'content-type': 'audio/mpeg' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 10-19/100');
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]));
    expect(rangeResponse(bytes, 'bytes=500-', {}).status).toBe(416);
  });
});

describe('entry route', () => {
  it('refuses an unsigned request', async () => {
    const r = new Request('https://www.starr-surveying.com/api/twilio/receptionist', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'From=%2B1' });
    const res = await entry(r);
    expect(res.status).toBe(403);
  });
  it('tells the caller the line is recorded, then rings the owner for 15 s with the whisper on his leg', async () => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    process.env.RECEPTIONIST_OWNER_PHONE = '+19365550001';
    const res = await entry(signed('https://www.starr-surveying.com/api/twilio/receptionist', { From: '+12545550100', To: '+18335550000', CallSid: 'CA1' }));
    expect(res.status).toBe(200);
    const xml = await res.text();
    // Owner, 2026-09-11: "The caller should also hear that the call may be recorded" — before the ring.
    expect(holdNotice()).toContain(RECORDING_NOTICE);
    expect(xml.indexOf(esc(holdNotice()))).toBeGreaterThan(0);
    expect(xml.indexOf(esc(holdNotice()))).toBeLessThan(xml.indexOf('<Dial'));
    expect(xml).toMatch(/<Dial timeout="15" action="\/api\/twilio\/receptionist\/after-dial" method="POST" callerId="\+18335550000" record="record-from-answer-dual" recordingStatusCallback="\/api\/twilio\/recording"[^>]*>/);
    expect(xml).toContain('<Number url="/api/twilio/receptionist/screen?parent=CA1" method="POST">+19365550001</Number>');
    expect(xml).not.toContain('<Gather input="speech"');
  });
  it('the whisper names the business but no number, hangs up the leg if no key is pressed, and a key marks the parent call accepted', async () => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    const url = 'https://www.starr-surveying.com/api/twilio/receptionist/screen?parent=CA1';
    // On this leg Twilio's From is OUR callerId. The first live test read it out as the caller. Never again.
    const a = await (await screen(signed(url, { From: '+18335550000', CallSid: 'CA1-child', ParentCallSid: 'CA1' }))).text();
    expect(a).toContain('<Gather numDigits="1"');
    expect(a).toContain(esc(whisperText()));
    expect(whisperText()).toMatch(/Starr Surveying call/);
    expect(a).not.toMatch(/\d \d \d/);
    expect(a.trim().endsWith('<Hangup/></Response>')).toBe(true);
    calls.updates.length = 0;
    const b = await (await screen(signed(url, { From: '+18335550000', CallSid: 'CA1-child', ParentCallSid: 'CA1', Digits: '1' }))).text();
    expect(b).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(calls.updates).toEqual([{ sid: 'CA1', patch: { status: 'in-progress', answered_by: 'owner' } }]);
  });
  it('after an unanswered dial: greeting, then listen, with the call cookie (the notice was already spoken before the ring)', async () => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    calls.row = null;
    const url = 'https://www.starr-surveying.com/api/twilio/receptionist/after-dial';
    const res = await afterDial(signed(url, { From: '+12545550100', CallSid: 'CA1', DialCallStatus: 'no-answer' }));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain(esc(greeting()));
    expect(xml).toContain('action="/api/twilio/receptionist/turn"');
    expect(res.headers.get('set-cookie')).toContain(COOKIE_NAME);
  });
  it('the voicemail trap: "completed" with no key pressed is NOT the owner, so the AI answers', async () => {
    // Second live test, 2026-09-11: the owner let it ring, his carrier voicemail answered the whisper,
    // the leg hung up, Twilio said DialCallStatus=completed, and the caller was hung up on.
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    calls.row = { answered_by: null, recording_sid: null };
    const url = 'https://www.starr-surveying.com/api/twilio/receptionist/after-dial';
    const xml = await (await afterDial(signed(url, { From: '+12545550100', CallSid: 'CA1', DialCallStatus: 'completed', DialCallDuration: '16' }))).text();
    expect(xml).toContain('<Gather input="speech"');
    expect(xml).toContain(esc(greeting()));
    expect(xml).not.toContain('<Hangup/>');
  });
  it('after a conversation the owner accepted with a key: just hang up, no AI', async () => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    calls.row = { id: 'row1', answered_by: 'owner', recording_sid: null };
    const url = 'https://www.starr-surveying.com/api/twilio/receptionist/after-dial';
    const xml = await (await afterDial(signed(url, { From: '+12545550100', CallSid: 'CA1', DialCallStatus: 'completed', DialCallDuration: '90' }))).text();
    expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
    calls.row = null;
  });
  it('TwiML escapes what callers say', () => {
    expect(twiml(say('Tom & Jerry <3'), gather('/x'))).toContain('Tom &amp; Jerry &lt;3');
  });
});

describe('status callback', () => {
  // Twilio's debugger logged "Got HTTP 500 response to /api/twilio/status" on the first live calls,
  // 2026-09-11. Cause: `new Response('', { status: 204 })` throws in Node's fetch. A 204 has no body.
  it('answers 204 without throwing, for a non-final status and for an unknown call', async () => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    const { POST: status } = await import('@/app/api/twilio/status/route');
    const url = 'https://www.starr-surveying.com/api/twilio/status';
    calls.row = null;
    expect((await status(signed(url, { CallSid: 'CA1', CallStatus: 'ringing' }))).status).toBe(204);
    expect((await status(signed(url, { CallSid: 'CA1', CallStatus: 'completed', CallDuration: '39' }))).status).toBe(204);
  });
});
