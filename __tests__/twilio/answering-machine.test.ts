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

// ── the ElevenLabs agent, on test calls only (owner, 2026-09-15) ────────────────────────────────
describe('handing a test call to the ElevenLabs agent', () => {
  it('is offered only when the SIP number is configured, and never to live callers', async () => {
    const { elevenLabsSipUri, elevenLabsConfigured, elevenLabsDial } = await import('@/lib/receptionist/elevenlabs');
    expect(elevenLabsSipUri({})).toBeNull();
    expect(elevenLabsSipUri({ ELEVENLABS_SIP_URI: 'not a uri' })).toBeNull();
    expect(elevenLabsConfigured({ ELEVENLABS_SIP_URI: 'sip:+18338426971@sip.rtc.elevenlabs.io:5060' })).toBe(true);
    const xml = elevenLabsDial('sip:+18338426971@sip.rtc.elevenlabs.io:5060', { callerId: '+12545550100', action: '/x', recordingCallback: 'https://s/api/twilio/recording' });
    expect(xml).toContain('<Sip>sip:+18338426971@sip.rtc.elevenlabs.io:5060</Sip>');
    expect(xml, 'the call must still be recorded like every other path').toContain('record="record-from-answer-dual"');
    // Owner, 2026-09-16: "Let's please make the conversational agent the active live version for
    // calls for now so we can test it in the real world." The live switch refused `elevenlabs` until
    // then; it takes it now, and the answering machine is still what an absent or broken setting gets.
    const { parseVersion, parseTestVersion, liveVersionFrom, DEFAULT_LIVE_VERSION } = await import('@/lib/receptionist/version');
    expect(parseVersion('elevenlabs')).toBe('elevenlabs');
    expect(parseTestVersion('elevenlabs')).toBe('elevenlabs');
    expect(liveVersionFrom({ live_version: 'elevenlabs' })).toBe('elevenlabs');
    expect(liveVersionFrom(null), 'no setting is still the safe one').toBe(DEFAULT_LIVE_VERSION);
    expect(liveVersionFrom({ live_version: 'something else' })).toBe('answering-machine');
  });

  // ── THE AGENT ON A REAL CALL (owner, 2026-09-16) ──────────────────────────────────────────────
  it('a live call dials the agent over SIP, recorded, and wraps up at agent-ended', () => {
    const src = read('app/api/twilio/receptionist/after-dial/route.ts');
    expect(src, 'the live switch reaches the agent').toContain("live.version === 'elevenlabs'");
    expect(src, 'dialed over the SIP trunk').toContain('elevenLabsDial(sip');
    expect(src, 'its own wrap-up, not the relay fallback').toContain("action: '/api/twilio/receptionist/agent-ended'");
    expect(src, 'recorded like every other path').toContain('recordingCallback');
    // A deployment with no trunk configured must answer, not drop the call.
    expect(src).toContain("live.version === 'elevenlabs' && !sip");
    expect(src).toContain('machineStart(live.voice)');
  });

  it('a dial that never connects falls back to the answering machine instead of silence', () => {
    const src = read('app/api/twilio/receptionist/agent-ended/route.ts');
    for (const status of ['busy', 'failed', 'no-answer', 'canceled']) expect(src).toContain(`'${status}'`);
    expect(src).toContain('machineStart(live.voice)');
    // a completed leg is wrapped up once, through the one function that notifies
    expect(src).toContain('finishCall(callSid, from, { facts: {}, turns: [] }');
    expect(src).toContain("answered_by: 'ai'");
    expect(src).toContain('hangup()');
  });

  it('an agent call is transcribed, analysed, and mailed out like every other call', () => {
    const rec = read('app/api/twilio/recording/route.ts');
    // Voice Intelligence used to be asked only for calls Hank answered; the agent's calls have no
    // turns of their own, so the recording is the only transcript they will ever have.
    expect(rec).toContain("call.answered_by === 'ai' && (call.transcript?.length ?? 0) === 0");
    const tr = read('app/api/twilio/transcript/route.ts');
    expect(tr, 'the agent is not Hank on the calls page').toContain("answeredByAi ? 'assistant' : 'owner'");
    expect(tr, 'and the owners are told who took it').toContain("answeredBy: answeredByAi ? 'ai' : 'owner'");
    expect(tr, 'test calls still tell nobody').toContain('if (!call.is_test)');
  });

  it('the agent speaks from OUR knowledge modules, not a pasted copy', async () => {
    const { agentPrompt, agentFirstMessage, AGENT_KEYWORDS } = await import('@/lib/receptionist/agent-prompt');
    const p = agentPrompt();
    expect(p.length).toBeGreaterThan(4000);
    expect(p).toContain('Starr Surveying');
    expect(p, 'never commits the firm').toMatch(/Never commit the firm/);
    expect(agentFirstMessage()).toMatch(/automated assistant, and this call is recorded/);
    expect(AGENT_KEYWORDS).toContain('Bell County');
    // and the script builds it from the module rather than holding its own copy
    const script = read('scripts/elevenlabs-agent.mjs');
    expect(script).toContain("from './lib/receptionist/agent-prompt'");
    expect(script).toContain('eleven_v3_conversational');
    expect(script).toContain('retention_days');
  });

  // ── What the owner asked for after hearing the first real calls (2026-09-16) ──────────────────
  // Every one of these is a sentence he said, turned into something that fails the build if it
  // stops being true. They test the prompt the agent is actually given, not our intentions.

  it('carries no price anywhere: not a figure, not a range, not a rush percentage', async () => {
    const { agentPrompt, agentKnowledgeDocs } = await import('@/lib/receptionist/agent-prompt');
    // "I think it was giving out the same quote for all requests." It was reading the website's
    // typical ranges out of its own prompt. Nothing with a dollar sign reaches it now.
    const everything = [agentPrompt(), ...agentKnowledgeDocs().map((d) => d.text)].join(' ');
    expect(everything, 'a dollar figure').not.toMatch(/\$\s?\d/);
    expect(everything, 'a spelled-out range').not.toMatch(/\d{3,4} to \$?\d{3,4}/);
    expect(everything, 'the rush percentage').not.toMatch(/25 percent|twenty-five percent/i);
    // "an hour or two on site" is field time, not money; a rate always has a currency on it
    expect(everything, 'the hourly rate').not.toMatch(/(dollars|\$\d+)\s*(an|per)\s*hour|billed at/i);
    expect(everything, 'the calculator').not.toMatch(/calculator/i);
  });

  it('sends every price question to Hank, and says so twice over', async () => {
    const { agentPrompt } = await import('@/lib/receptionist/agent-prompt');
    const p = agentPrompt();
    expect(p).toMatch(/PRICES: YOU DO NOT GIVE THEM/);
    expect(p, 'only Hank quotes').toMatch(/Hank is the only one who gives quotes/);
    expect(p, 'and he does it on the callback').toMatch(/when he calls you back/);
    expect(p, 'no ballparks either').toMatch(/ballpark/);
  });

  it('does not know who is calling and never pretends to', async () => {
    const { agentPrompt } = await import('@/lib/receptionist/agent-prompt');
    const p = agentPrompt();
    // "It should not assume the caller is a previous caller … the agent asked if the caller was Jacob."
    expect(p).toMatch(/═══ WHO IS CALLING ═══/);
    expect(p).toMatch(/no memory of previous conversations/);
    expect(p).toMatch(/Do not guess a name/);
    expect(p).toMatch(/Never assume the caller is the person whose number it is/);
    // Everything it knows arrives as data at the start of the call, looked up from the number and
    // carrying its own orders (lib/receptionist/agent-init.ts), never as something it remembers.
    expect(p).toContain('{{caller_history}}');
    expect(p).toMatch(/about a PHONE, not a person/);
  });

  it('offers a message on every call and asks what else it can do afterwards', async () => {
    const { agentPrompt } = await import('@/lib/receptionist/agent-prompt');
    const p = agentPrompt();
    // "Please make sure it give the caller to leave a message for Hank if they would like. After
    //  they leave a message, it can ask them if it can help them with anything else."
    expect(p).toMatch(/TAKING A MESSAGE/);
    expect(p).toMatch(/I can take a message for Hank if you'd like/);
    expect(p).toMatch(/Do not interrupt a message/);
    expect(p).toMatch(/anything else I can help you with/);
  });

  it('reads numbers, emails, names and addresses back before trusting them', async () => {
    const { agentPrompt } = await import('@/lib/receptionist/agent-prompt');
    const p = agentPrompt();
    // "It needs to be good at parsing numbers and emails and names and property addresses."
    expect(p).toMatch(/GETTING THE DETAILS RIGHT/);
    expect(p).toMatch(/spell your last name/);
    expect(p).toMatch(/letter by letter/);
    expect(p).toMatch(/digit by digit/);
    expect(p).toMatch(/read all ten back in groups/);
    expect(p).toMatch(/lowercase/);
  });

  it('stops talking the moment the caller does not', async () => {
    const { agentPrompt } = await import('@/lib/receptionist/agent-prompt');
    const p = agentPrompt();
    // "The agent was just really bad with interruptions and stuff."
    expect(p).toMatch(/THE MOMENT THE CALLER STARTS SPEAKING, STOP/);
    expect(p).toMatch(/do not repeat the part they talked over/);
    expect(p).toMatch(/Never stack two questions/);
  });

  it('asks any question once, and lets a struggling caller off the hook', async () => {
    const { agentPrompt } = await import('@/lib/receptionist/agent-prompt');
    const p = agentPrompt();
    // Owner, 2026-09-16: "If the caller is struggling to answer a question … it should reassure them
    // and tell them that Hank can get that info from them later when he calls … If they say to just
    // hold on while they look it up, then that is fine and the agent should just wait a bit longer."
    expect(p).toMatch(/ASK ANY QUESTION ONCE/);
    expect(p).toMatch(/WHEN THEY CANNOT COME UP WITH IT/);
    expect(p).toMatch(/THEY ARE LOOKING IT UP/);
    expect(p).toMatch(/no rush, take your time/);
    expect(p).toMatch(/Hank can get that from you when he calls/);
    expect(p).toMatch(/Never ask a third time/);
  });

  it('asks a returning caller whether it is the old property or a new request', async () => {
    const { agentPrompt } = await import('@/lib/receptionist/agent-prompt');
    const { knownCallerLine } = await import('@/lib/receptionist/known-caller');
    // Owner, 2026-09-16: "If the customer is found to be a pre-existing caller, then the agent should
    // ask if they are calling about a previous property or a new request."
    const ask = /calling about the property you spoke to us about before, or is this a new request/;
    expect(agentPrompt()).toMatch(ask);
    expect(knownCallerLine({
      name: 'Jane Doe', email: null, source: 'call', lastSeen: '2026-08-02T15:00:00Z', lastAbout: null,
      timesCalled: 1, enquiries: [{ when: '2026-08-02T15:00:00Z', service: 'boundary', address: '1 Main St', name: 'Jane Doe' }],
    })!).toMatch(ask);
  });

  it('has no land-law material left to clutter the call with', async () => {
    const { agentPrompt, agentKnowledgeDocs } = await import('@/lib/receptionist/agent-prompt');
    // "It doesn't need to know all of the legal stuff and clutter down the conversation."
    const everything = [agentPrompt(), ...agentKnowledgeDocs().map((d) => `${d.name} ${d.text}`)].join(' ');
    expect(everything, 'statute citations').not.toMatch(/Property Code|Civil Practice|statutes dot capitol/i);
    expect(everything, 'the adverse-possession briefing').not.toMatch(/adverse possession/i);
    expect(agentPrompt(), 'legal questions go to Hank').toMatch(/Never give legal advice/);
  });

  it('is fully briefed on the work the firm actually does', async () => {
    const { agentKnowledgeDocs } = await import('@/lib/receptionist/agent-prompt');
    const docs = agentKnowledgeDocs();
    const services = docs.find((d) => /every service/i.test(d.name))!;
    expect(services, 'a service brief').toBeTruthy();
    for (const s of ['BOUNDARY SURVEY', 'ELEVATION CERTIFICATE', 'CONSTRUCTION STAKING', 'TOPOGRAPHIC SURVEY']) {
      expect(services.text).toContain(s);
    }
    expect(docs.some((d) => /how a job runs/i.test(d.name)), 'the process and the service area').toBe(true);
    expect(docs.some((d) => /questions callers ask/i.test(d.name)), 'the FAQ').toBe(true);
  });
});

// ── talking to an agent from the browser, and filing what was said ─────────────────────────────
describe('the test bench talks to an agent directly', () => {
  it('two agents: the trained receptionist and a general-conversation one', async () => {
    const { agentIdFor, agentsConfigured, toCallTurns } = await import('@/lib/receptionist/elevenlabs-agents');
    expect(agentIdFor('starr', { ELEVENLABS_AGENT_ID: 'agent_abc' })).toBe('agent_abc');
    expect(agentIdFor('generic', { ELEVENLABS_AGENT_ID_GENERIC: 'agent_xyz' })).toBe('agent_xyz');
    expect(agentIdFor('starr', { ELEVENLABS_AGENT_ID: 'not-an-agent' })).toBeNull();
    expect(agentsConfigured({})).toBe(false);
    // ElevenLabs says user/agent; the call record says caller/assistant
    expect(toCallTurns({ conversation_id: 'c', agent_id: 'a', transcript: [
      { role: 'agent', message: 'Starr Surveying, this is Ellie.' },
      { role: 'user', message: 'Hi, I need a survey.' },
      { role: 'user', message: '  ' },
    ] })).toEqual([
      { role: 'assistant', text: 'Starr Surveying, this is Ellie.' },
      { role: 'caller', text: 'Hi, I need a survey.' },
    ]);
  });

  it('the token is admin-only and short-lived; the import files test rows only', () => {
    const talk = read('app/api/admin/receptionist-test/talk/route.ts');
    expect(talk).toContain('isAdmin(session.user.roles)');
    expect(talk).toContain('conversationToken(kind)');
    const imp = read('app/api/admin/receptionist-test/import/route.ts');
    expect(imp).toContain('isAdmin(session.user.roles)');
    // 2026-09-16: the import moved to a module the cron shares, so the row shape is asserted where
    // it now lives. The route keeps the admin gate, and that is what is checked of it here.
    expect(imp).toContain('importAgentConversations');
    const lib = read('lib/receptionist/import-conversations.ts');
    expect(lib).toContain('isTest: true');
    expect(lib).toContain('`EL-${full.conversation_id}`');
  });

  it('the page has a start button, a live transcript and a way to file it', () => {
    const page = read('app/admin/dev/receptionist/page.tsx');
    expect(page).toContain('data-testid="rtest-talk-start"');
    expect(page).toContain('data-testid="rtest-talk-transcript"');
    expect(page).toContain('data-testid="rtest-talk-file"');
    expect(page).toContain('data-testid={`rtest-talk-${a.id}`}');
    expect(page, 'a general-conversation agent as well as the trained one').toContain("id: 'generic' as const");
    expect(page).toContain("import('@elevenlabs/client')");
    expect(page, 'the microphone is asked for on the click').toContain('navigator.mediaDevices.getUserMedia');
  });
});

// ── auditioning and switching the agent's voice (owner, 2026-09-16) ────────────────────────────
describe('voices on the test bench', () => {
  it('the shortlist is real ElevenLabs voice ids, grouped, with the current one marked', async () => {
    const { AGENT_VOICES, AGENT_VOICE_GROUPS, agentVoiceById } = await import('@/lib/receptionist/agent-voices');
    expect(AGENT_VOICES.length).toBeGreaterThanOrEqual(10);
    for (const v of AGENT_VOICES) {
      expect(v.id, v.name).toMatch(/^[A-Za-z0-9]{20}$/);
      expect(v.blurb.length, v.name).toBeGreaterThan(20);
      expect(AGENT_VOICE_GROUPS).toContain(v.group);
    }
    // the voice the agent was created with is in the list, so it can be shown as current
    expect(agentVoiceById('EXAVITQu4vr4xnSDxMaL')?.name).toBe('Sarah');
    expect(agentVoiceById('not-a-voice')).toBeNull();
    expect(new Set(AGENT_VOICES.map((v) => v.id)).size, 'no duplicate ids').toBe(AGENT_VOICES.length);
  });

  it('the sample speaks the receptionist\'s real opening line, through the speech key', () => {
    const route = read('app/api/admin/receptionist-test/voice-sample/route.ts');
    expect(route).toContain('agentFirstMessage()');
    expect(route).toContain('ELEVENLABS_API_KEY');
    expect(route, 'cached so a second audition is free').toContain('cache.set(voice.id, audio)');
    expect(route).toContain("isAdmin(session.user.roles)");
  });

  it('switching writes the voice to the agent at ElevenLabs, per agent or both', () => {
    const route = read('app/api/admin/receptionist-test/voices/route.ts');
    expect(route).toContain("conversation_config: { tts: { voice_id: voice.id } }");
    expect(route).toContain("body.agent === 'starr' ? ['starr'] : body.agent === 'generic' ? ['generic'] : ['starr', 'generic']");
    expect(route).toContain('isAdmin(session.user.roles)');
    const page = read('app/admin/dev/receptionist/page.tsx');
    expect(page).toContain('data-testid="rtest-voices"');
    expect(page).toContain('rtest-voice-play-');
    expect(page).toContain("assignVoice(v, 'both')");
  });
});
