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
import { parseEnvelope, RECORDING_NOTICE, greeting } from '@/lib/receptionist/brain';
import { recipientsFor, outcomeText, notifyOwners } from '@/lib/receptionist/notify';
import { twiml, say, gather, esc } from '@/lib/twilio/twiml';
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
    const t = outcomeText({ from: '+12545550100', facts: { kind: 'customer', name: 'Jane', address: '1 Main St', service: 'Boundary survey', leadId: 'L1' }, summary: 'wants a boundary survey next week' });
    expect(t).toContain('Customer call from Jane (+12545550100)');
    expect(t).toContain('Property: 1 Main St');
    expect(t).toContain('/admin/leads/L1');
  });
  it('never throws when a text fails, and still emails', async () => {
    const send = vi.fn<(i: { to: string; body: string }) => Promise<boolean>>().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(true);
    const email = vi.fn(async () => true);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await notifyOwners({ from: '+1', facts: { kind: 'customer' }, summary: 's' }, { send, email, env });
    expect(r).toEqual({ texted: 1, emailed: true });
    spy.mockRestore();
  });
});

describe('entry route', () => {
  it('refuses an unsigned request', async () => {
    const r = new Request('https://www.starr-surveying.com/api/twilio/receptionist', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'From=%2B1' });
    const res = await entry(r);
    expect(res.status).toBe(403);
  });
  it('rings the owner first, with the whisper on his leg and the after-dial handoff', async () => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    process.env.RECEPTIONIST_OWNER_PHONE = '+19365550001';
    const res = await entry(signed('https://www.starr-surveying.com/api/twilio/receptionist', { From: '+12545550100', To: '+18335550000', CallSid: 'CA1' }));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<Dial timeout="25" action="/api/twilio/receptionist/after-dial" method="POST" callerId="+18335550000">');
    expect(xml).toContain('<Number url="/api/twilio/receptionist/screen" method="POST">+19365550001</Number>');
    expect(xml).not.toContain('<Gather input="speech"');
  });
  it('the whisper asks for a key and hangs up the leg if none is pressed; a key bridges silently', async () => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    const url = 'https://www.starr-surveying.com/api/twilio/receptionist/screen';
    const a = await (await screen(signed(url, { From: '+12545550100', CallSid: 'CA1' }))).text();
    expect(a).toContain('<Gather numDigits="1"');
    expect(a).toContain('Press any key to accept');
    expect(a.trim().endsWith('<Hangup/></Response>')).toBe(true);
    const b = await (await screen(signed(url, { From: '+12545550100', CallSid: 'CA1', Digits: '1' }))).text();
    expect(b).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });
  it('after an unanswered dial: recording notice first, then greeting, then listen, with the call cookie', async () => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    const url = 'https://www.starr-surveying.com/api/twilio/receptionist/after-dial';
    const res = await afterDial(signed(url, { From: '+12545550100', CallSid: 'CA1', DialCallStatus: 'no-answer' }));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml.indexOf(esc(RECORDING_NOTICE))).toBeGreaterThan(0);
    expect(xml.indexOf(esc(RECORDING_NOTICE))).toBeLessThan(xml.indexOf('<Gather'));
    expect(xml).toContain('action="/api/twilio/receptionist/turn"');
    expect(res.headers.get('set-cookie')).toContain(COOKIE_NAME);
  });
  it('after a completed conversation with the owner: just hang up, no AI', async () => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    const url = 'https://www.starr-surveying.com/api/twilio/receptionist/after-dial';
    const xml = await (await afterDial(signed(url, { From: '+12545550100', CallSid: 'CA1', DialCallStatus: 'completed' }))).text();
    expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  });
  it('TwiML escapes what callers say', () => {
    expect(twiml(say('Tom & Jerry <3'), gather('/x'))).toContain('Tom &amp; Jerry &lt;3');
  });
});
