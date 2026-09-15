// The answering machine, and the switch that decides which receptionist answers live calls.
//
// Owner, 2026-09-15: "I want there to be two versions … one that works simply like an answering machine
// where it answers and asks the caller to leave a message with their name and number and that we will get
// back to them as soon as possible. Then they can leave their message and it will be recorded, and then the
// AI agent will ask if there is anything else, and if not it will tell them to have a good day and goodbye.
// … make it so that the version of the agent that is responding to live calls is the simple recording
// agent, and then make it so that I can do private test calls with the more complex version."
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyAnythingElse, afterAnythingElse, afterRecording, machineStart, MACHINE_LINES, MACHINE_MAX_MESSAGES, MACHINE_MAX_ASKS,
} from '@/lib/receptionist/answering-machine';
import { parseVersion, liveVersionFrom, DEFAULT_LIVE_VERSION } from '@/lib/receptionist/version';
import { esc } from '@/lib/twilio/twiml';

const calls = vi.hoisted(() => ({
  row: null as null | Record<string, unknown>,
  updates: [] as Array<{ sid: string; patch: Record<string, unknown> }>,
  turns: [] as Array<{ role: string; text: string }>,
}));
vi.mock('@/lib/receptionist/calls', async (orig) => ({
  ...(await orig<typeof import('@/lib/receptionist/calls')>()),
  startCall: async () => null,
  updateCall: async (_c: unknown, sid: string, patch: Record<string, unknown>) => { calls.updates.push({ sid, patch }); return calls.row; },
  getCallBySid: async () => calls.row,
  appendTurns: async (_c: unknown, _sid: string, turns: Array<{ role: string; text: string }>) => { calls.turns.push(...turns); },
}));
const version = vi.hoisted(() => ({ read: async () => ({ version: 'answering-machine', updatedBy: null, updatedAt: null }) as { version: string; updatedBy: null; updatedAt: null } }));
vi.mock('@/lib/receptionist/version-server', () => ({ readLiveVersion: () => version.read(), writeLiveVersion: async () => undefined }));
vi.mock('@/lib/server/defer', () => ({ defer: () => undefined }));

import { POST as afterDial } from '@/app/api/twilio/receptionist/after-dial/route';
import { POST as machine } from '@/app/api/twilio/receptionist/machine/route';
import { POST as testEntry } from '@/app/api/twilio/receptionist/test-entry/route';

const TOKEN = 'test-auth-token';
const BASE = 'https://www.starr-surveying.com';
function signed(url: string, params: Record<string, string>): Request {
  const sig = createHmac('sha1', TOKEN).update(url + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
  const u = new URL(url);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig, 'x-forwarded-proto': u.protocol.replace(':', ''), 'x-forwarded-host': u.host },
    body: new URLSearchParams(params).toString(),
  });
}
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  calls.row = null;
  calls.updates.length = 0;
  calls.turns.length = 0;
  version.read = async () => ({ version: 'answering-machine', updatedBy: null, updatedAt: null });
});

// ── the words ───────────────────────────────────────────────────────────────────────────────────
describe('what the answering machine says', () => {
  it('asks for a message with a name and number, and promises a call back as soon as possible', () => {
    expect(MACHINE_LINES.greeting).toMatch(/leave a message with your name and phone number after the tone/);
    expect(MACHINE_LINES.greeting).toMatch(/get back to you as soon as possible/);
    expect(MACHINE_LINES.anythingElse).toBe('Thank you. Is there anything else?');
    expect(MACHINE_LINES.goodbye).toMatch(/Have a good day\. Goodbye\.$/);
  });

  it('opens with the greeting, then records with a beep, transcribed as message 1', () => {
    const xml = machineStart();
    expect(xml).toContain(esc(MACHINE_LINES.greeting));
    expect(xml).toContain('<Record action="/api/twilio/receptionist/machine?step=recorded&amp;n=0&amp;ask=0"');
    expect(xml).toContain('playBeep="true"');
    expect(xml).toContain('transcribeCallback="/api/twilio/receptionist/voicemail?part=1"');
    expect(xml.indexOf('<Say')).toBeLessThan(xml.indexOf('<Record'));
  });
});

// ── "is there anything else?" ──────────────────────────────────────────────────────────────────
describe('the answer to "is there anything else?"', () => {
  it.each(['No', 'no thank you', 'Nope, thanks, bye.', "No, that's it.", "That's all", "I'm good, thank you", 'nothing else', 'Bye', 'no sir', '', '   '])(
    '%j means no', (heard) => expect(classifyAnythingElse(heard)).toBe('no'));
  it.each(['Yes', 'yeah', 'Yes, one more thing', 'Actually yes', 'Can I leave another message?', 'hold on', 'uh huh'])(
    '%j means record another message', (heard) => expect(classifyAnythingElse(heard)).toBe('yes'));
  it.each(['No, but my address is 12 Main Street', 'Also my email is bob at gmail dot com', 'please call after five', 'Yes my number is two five four'])(
    '%j is something to pass along, not a yes or no', (heard) => expect(classifyAnythingElse(heard)).toBe('more'));

  it('no (or silence) → have a good day, goodbye, hang up', () => {
    const o = afterAnythingElse('no thanks', 1, 1);
    expect(o.kind).toBe('goodbye');
    expect(o.twiml).toContain(esc(MACHINE_LINES.goodbye));
    expect(o.twiml.trim().endsWith('<Hangup/></Response>')).toBe(true);
    expect(afterAnythingElse('', 1, 1).kind).toBe('goodbye');
  });

  it('yes → "go ahead after the tone" and another recording, transcribed as the next part', () => {
    const o = afterAnythingElse('yes', 1, 1);
    expect(o.kind).toBe('record');
    expect(o.twiml).toContain(esc(MACHINE_LINES.goAhead));
    expect(o.twiml).toContain('step=recorded&amp;n=1&amp;ask=1');
    expect(o.twiml).toContain('voicemail?part=2');
  });

  it('something said out loud → noted, and asked again', () => {
    const o = afterAnythingElse('my address is 12 Main Street', 1, 1);
    expect(o.kind).toBe('noted');
    expect(o.twiml).toContain(esc(MACHINE_LINES.noted));
    expect(o.twiml).toContain('step=else&amp;n=1&amp;ask=2');
  });

  it('it cannot loop forever: message and question limits end the call politely', () => {
    expect(afterAnythingElse('yes', MACHINE_MAX_MESSAGES, 1)).toMatchObject({ kind: 'goodbye', line: MACHINE_LINES.enough });
    expect(afterAnythingElse('something else to say', 1, MACHINE_MAX_ASKS)).toMatchObject({ kind: 'goodbye' });
  });

  it('after a recording: asks anything else; after an empty one, offers to take the message', () => {
    expect(afterRecording(1, true, 0)).toContain(esc(MACHINE_LINES.anythingElse));
    expect(afterRecording(0, false, 0)).toContain(esc(MACHINE_LINES.noMessageHeard));
    expect(afterRecording(1, true, 0)).toContain('action="/api/twilio/receptionist/machine?step=else&amp;n=1&amp;ask=1"');
  });
});

// ── the version switch ──────────────────────────────────────────────────────────────────────────
describe('which receptionist answers live calls', () => {
  it('is the answering machine unless the setting clearly says agent', () => {
    expect(DEFAULT_LIVE_VERSION).toBe('answering-machine');
    expect(liveVersionFrom(null)).toBe('answering-machine');
    expect(liveVersionFrom({})).toBe('answering-machine');
    expect(liveVersionFrom({ live_version: 'banana' })).toBe('answering-machine');
    expect(liveVersionFrom('agent')).toBe('answering-machine');
    expect(liveVersionFrom({ live_version: 'agent' })).toBe('agent');
    expect(parseVersion('machine')).toBe('answering-machine');
    expect(parseVersion('nope')).toBeNull();
  });

  it('a live call Hank did not answer gets the answering machine — no AI greeting, no relay, no Gather loop', async () => {
    const xml = await (await afterDial(signed(`${BASE}/api/twilio/receptionist/after-dial`, { From: '+12545550100', CallSid: 'CA1', DialCallStatus: 'no-answer' }))).text();
    expect(xml).toContain(esc(MACHINE_LINES.greeting));
    expect(xml).toContain('<Record action="/api/twilio/receptionist/machine?step=recorded');
    expect(xml).not.toContain('<Connect');
    expect(xml).not.toContain('receptionist/turn');
    // answered_by stays unset until the caller leaves something, so a hang-up still counts as missed
    expect(calls.updates.find((u) => u.patch.answered_by === 'ai')).toBeUndefined();
  });

  it('with the full agent switched on, the same call gets the agent', async () => {
    version.read = async () => ({ version: 'agent', updatedBy: null, updatedAt: null });
    const xml = await (await afterDial(signed(`${BASE}/api/twilio/receptionist/after-dial`, { From: '+12545550100', CallSid: 'CA1', DialCallStatus: 'no-answer' }))).text();
    expect(xml).not.toContain(esc(MACHINE_LINES.greeting));
    expect(xml).toMatch(/receptionist\/turn|<Connect/);
  });

  it('a private test call runs the full agent by default, and the answering machine when asked', async () => {
    const agent = await (await testEntry(signed(`${BASE}/api/twilio/receptionist/test-entry?version=agent`, { CallSid: 'CAT', Direction: 'outbound-api', To: '+12545550100', From: '+18335550000' }))).text();
    expect(agent).not.toContain(esc(MACHINE_LINES.greeting));
    const byDefault = await (await testEntry(signed(`${BASE}/api/twilio/receptionist/test-entry`, { CallSid: 'CAT', Direction: 'outbound-api', To: '+12545550100', From: '+18335550000' }))).text();
    expect(byDefault).not.toContain(esc(MACHINE_LINES.greeting));
    const mach = await (await testEntry(signed(`${BASE}/api/twilio/receptionist/test-entry?version=answering-machine`, { CallSid: 'CAT', Direction: 'outbound-api', To: '+12545550100', From: '+18335550000' }))).text();
    expect(mach).toContain(esc(MACHINE_LINES.greeting));
    // the browser passes it as a Voice SDK parameter instead of in the URL
    const browser = await (await testEntry(signed(`${BASE}/api/twilio/receptionist/test-entry`, { CallSid: 'CAB', From: 'client:jacob', To: '', version: 'answering-machine' }))).text();
    expect(browser).toContain(esc(MACHINE_LINES.greeting));
    // live calls' switch is not consulted for tests
    expect(calls.updates.every((u) => u.patch.is_test !== false)).toBe(true);
  });
});

// ── the steps route ─────────────────────────────────────────────────────────────────────────────
describe('/api/twilio/receptionist/machine', () => {
  it('refuses a forged request', async () => {
    const req = new Request(`${BASE}/api/twilio/receptionist/machine?step=else&n=0&ask=1`, { method: 'POST', headers: { 'x-twilio-signature': 'forged' }, body: 'CallSid=CA1' });
    expect((await machine(req)).status).toBe(403);
  });

  it('a recording ended → the call is marked as a voicemail with its recording, and the caller is asked "anything else?"', async () => {
    const url = `${BASE}/api/twilio/receptionist/machine?step=recorded&n=0&ask=0`;
    const xml = await (await machine(signed(url, { CallSid: 'CA1', From: '+12545550100', RecordingUrl: 'https://api.twilio.com/rec/RE1', RecordingSid: 'RE1', RecordingDuration: '14' }))).text();
    expect(xml).toContain(esc(MACHINE_LINES.anythingElse));
    expect(xml).toContain('step=else&amp;n=1&amp;ask=1');
    expect(calls.updates).toContainEqual({ sid: 'CA1', patch: expect.objectContaining({ answered_by: 'voicemail', recording_sid: 'RE1', recording_source: 'voicemail' }) });
    expect(calls.turns.map((t) => t.text)).toEqual([MACHINE_LINES.greeting, '(Recorded message 1, 14 seconds.)']);
  });

  it('a second message does not replace the first recording on the call row', async () => {
    const url = `${BASE}/api/twilio/receptionist/machine?step=recorded&n=1&ask=1`;
    await machine(signed(url, { CallSid: 'CA1', From: '+12545550100', RecordingUrl: 'https://api.twilio.com/rec/RE2', RecordingSid: 'RE2', RecordingDuration: '6' }));
    const patch = calls.updates.find((u) => u.patch.answered_by === 'voicemail')?.patch ?? {};
    expect(patch).not.toHaveProperty('recording_sid');
  });

  it('"no" → goodbye and hang up; what the caller said is written to the transcript', async () => {
    const url = `${BASE}/api/twilio/receptionist/machine?step=else&n=1&ask=1`;
    const xml = await (await machine(signed(url, { CallSid: 'CA1', From: '+12545550100', SpeechResult: 'No thank you' }))).text();
    expect(xml).toContain(esc(MACHINE_LINES.goodbye));
    expect(xml).toContain('<Hangup/>');
    expect(calls.turns).toEqual([{ role: 'caller', text: 'No thank you' }, { role: 'assistant', text: MACHINE_LINES.goodbye }]);
  });
});

// ── the wiring ──────────────────────────────────────────────────────────────────────────────────
describe('wired where it matters', () => {
  it('a later message is added to the voicemail text, not written over it', () => {
    const vm = read('app/api/twilio/receptionist/voicemail/route.ts');
    expect(vm).toContain("searchParams.get('part')");
    expect(vm).toContain('`Message ${part}: ${transcript}`');
  });

  it('the new webhook is in the route-auth audit', () => {
    expect(read('scripts/audit-route-auth.mjs')).toContain("'app/api/twilio/receptionist/machine/route.ts'");
  });

  it('the test bench shows and switches the live version, and picks the version per test call', () => {
    const page = read('app/admin/dev/receptionist/page.tsx');
    expect(page).toContain("fetch('/api/admin/receptionist-test/version'");
    expect(page).toContain('data-testid="rtest-live-agent-confirm"');
    expect(page).toContain('device.connect({ params: { version: testVersion, voice: testVoice } })');
    expect(page).toContain('JSON.stringify({ to: phone, version: testVersion, voice: testVoice })');
    const api = read('app/api/admin/receptionist-test/version/route.ts');
    expect(api).toContain('isAdmin(session.user.roles)');
    expect(read('app/api/admin/receptionist-test/call/route.ts')).toContain('test-entry?version=${version}');
  });
});

// ── a test call reaches nobody (owner, 2026-09-15) ──────────────────────────────────────────────
// "For test calls, it should all be closed so I can test the voice and the responses… they should
//  still record and transcribe the conversation, but they should not act like normal calls."
describe('a test call tells nobody', () => {
  it('notifyOwners refuses a test row outright — no text, no email, no bell', async () => {
    const { notifyOwners } = await import('@/lib/receptionist/notify');
    const sent: string[] = [];
    const out = await notifyOwners(
      { from: '+12545550100', facts: { kind: 'customer', name: 'Test' }, summary: 'a test', call: { is_test: true }, answeredBy: 'ai' },
      { send: async ({ to }) => { sent.push(to); return true; }, email: async () => { sent.push('email'); return true; }, inApp: async () => { sent.push('bell'); return 1; } },
    );
    expect(out).toEqual({ texted: 0, emailed: false, belled: 0 });
    expect(sent).toEqual([]);
    // …and the same when only the caller knows it is a test
    expect(await notifyOwners({ from: '+1', facts: {}, summary: 's', test: true }, { send: async () => { sent.push('x'); return true; }, email: async () => true, inApp: async () => 1 })).toEqual({ texted: 0, emailed: false, belled: 0 });
    expect(sent).toEqual([]);
  });

  it('a real call still notifies, so the gate is the test flag and not a silenced notifier', async () => {
    const { notifyOwners } = await import('@/lib/receptionist/notify');
    const sent: string[] = [];
    const out = await notifyOwners(
      { from: '+12545550100', facts: { kind: 'customer', name: 'Real' }, summary: 'a real call', call: { is_test: false }, answeredBy: 'ai' },
      { send: async ({ to }) => { sent.push(to); return true; }, email: async () => true, inApp: async () => 1, env: { LEAD_SMS_RECIPIENTS: '+12545550111' } },
    );
    expect(out.belled).toBe(1);
    expect(sent).toContain('+12545550111');
  });

  it('every notifying path is guarded: the transcript webhook, and leads on both agent transports', () => {
    const src = (f: string) => read(f);
    expect(src('app/api/twilio/transcript/route.ts')).toContain('if (!call.is_test)');
    expect(src('app/api/twilio/receptionist/turn/route.ts')).toContain('!(await isTestCall(supabaseAdmin, callSid))');
    expect(src('app/api/twilio/receptionist/relay-turn/route.ts')).toContain('await isTestCall(supabaseAdmin, callSid)');
    // the row is the authority — a cookie or relay payload can lose the flag
    expect(src('lib/receptionist/calls.ts')).toContain('export async function isTestCall(');
  });

  it('but a test call is still recorded, transcribed and analysed', () => {
    expect(read('app/api/twilio/receptionist/test-entry/route.ts')).toContain('startCallRecording(callSid');
    // the voicemail route marks a test call notified rather than skipping the transcript work
    expect(read('app/api/twilio/receptionist/voicemail/route.ts')).toContain('const analysis = await analyzeCall(call)');
    expect(read('app/api/twilio/transcript/route.ts')).toContain('const analysis = await analyzeCall(updated)');
  });
});

// ── voices ──────────────────────────────────────────────────────────────────────────────────────
describe('choosing the voice', () => {
  it('every voice can speak on both paths: the relay and <Say>', async () => {
    const { RECEPTIONIST_VOICES, resolveVoice, sayVoiceFor } = await import('@/lib/receptionist/voices');
    expect(RECEPTIONIST_VOICES.length).toBeGreaterThanOrEqual(8);
    for (const v of RECEPTIONIST_VOICES) {
      expect(v.relayVoice, v.id).toBeTruthy();
      expect(v.sayVoice, v.id).toMatch(/^(Google|Polly)\./);
      if (v.provider === 'ElevenLabs') expect(v.relayVoice).toMatch(/-flash_v2_5-/);
    }
    expect(resolveVoice('nonsense').id).toBe('rachel');
    expect(sayVoiceFor('leda', {})).toBe('Google.en-US-Chirp3-HD-Leda');
  });

  it('a test call speaks in the chosen voice, and the machine keeps it across its steps', async () => {
    const xml = await (await testEntry(signed(`${BASE}/api/twilio/receptionist/test-entry?version=answering-machine&voice=leda`, { CallSid: 'CAV', Direction: 'outbound-api', To: '+12545550100', From: '+18335550000' }))).text();
    expect(xml).toContain('voice="Google.en-US-Chirp3-HD-Leda"');
    expect(xml).toContain('&amp;v=leda');
    const step = await (await machine(signed(`${BASE}/api/twilio/receptionist/machine?step=recorded&n=0&ask=0&v=leda`, { CallSid: 'CAV', From: '+12545550100', RecordingUrl: 'https://x/RE1', RecordingSid: 'RE1', RecordingDuration: '9' }))).text();
    expect(step).toContain('voice="Google.en-US-Chirp3-HD-Leda"');
    expect(step).toContain('&amp;v=leda');
  });

  it('the live voice comes from the settings, and the test bench can set it', () => {
    expect(read('lib/receptionist/version.ts')).toContain('export function liveVoiceFrom(');
    expect(read('app/api/twilio/receptionist/after-dial/route.ts')).toContain('machineStart(live.voice)');
    const page = read('app/admin/dev/receptionist/page.tsx');
    expect(page).toContain('data-testid="rtest-voice"');
    expect(page).toContain("saveLive({ voice: testVoice })");
    expect(page).toContain('device.connect({ params: { version: testVersion, voice: testVoice } })');
  });
});
