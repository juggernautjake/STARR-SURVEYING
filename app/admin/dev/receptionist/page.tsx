'use client';
// /admin/dev/receptionist — test the phone receptionist without calling Hank.
//
// Owner, 2026-09-11: "build a developer page where we can test this system using the website and not
// actually calling my dad's number, but it should work the same way … same response time … all of
// the calls should be captured and able to be reviewed and transcribed."
//
// Three ways in, all flagged as tests (no owner alerts, no lead; everything else identical):
//   1. Call from this browser  — Twilio's Voice SDK dials the receptionist over WebRTC.
//   2. Call my phone           — Twilio rings the number you type; you answer and talk to Ellie.
//   3. Text chat               — the same brain and streaming reply, typed. Shows time to first word.
// Every session is a row on /admin/calls with its recording (phone/browser), transcript and analysis.
//
// TWO VERSIONS (owner, 2026-09-15): "make it so that the version of the agent that is responding to
// live calls is the simple recording agent, and then make it so that I can do private test calls with
// the more complex version so that I can hone it in." The top card says which version answers LIVE
// calls and switches it; each test call picks the version it runs (the full agent by default).
import '../../styles/AdminCalls.css';
import '../../styles/AdminReceptionistTest.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePageError } from '../../hooks/usePageError';
import type { PhoneCall } from '@/lib/receptionist/calls';
import type { CallState } from '@/lib/receptionist/state';
import { VERSION_LABELS, TEST_VERSION_LABELS, type ReceptionistVersion, type TestVersion } from '@/lib/receptionist/version';
import { RECEPTIONIST_VOICES, DEFAULT_VOICE_ID } from '@/lib/receptionist/voices';
import { AGENT_VOICES, AGENT_VOICE_GROUPS, type AgentVoice } from '@/lib/receptionist/agent-voices';
import { AGENT_MODELS, type AgentModel } from '@/lib/receptionist/agent-models';
// The agent's name and the firm's, from the modules that own them — both are environment-
// overridable, and a hard-coded "Ellie" here would be a second copy that drifts.
import { ASSISTANT_NAME } from '@/lib/receptionist/knowledge';
import { TEST_SCRIPTS, testScript } from '@/lib/receptionist/test-scripts';
import { BUSINESS_NAME } from '@/lib/seo/business';

const RS = '';

type Msg = { role: 'caller' | 'assistant'; text: string; firstWordMs?: number | null; totalMs?: number };
type Device = { connect(opts: { params: Record<string, string> }): Promise<Call>; destroy(): void; on(ev: string, fn: (...a: unknown[]) => void): void };
type Call = { disconnect(): void; on(ev: string, fn: (...a: unknown[]) => void): void; parameters?: { CallSid?: string } };

const LABEL: Record<string, string> = { idle: 'Ready', 'getting token': 'Getting a token…', connecting: 'Connecting…', ended: 'Call ended', error: 'Could not connect' };
function fmtPhone(s: string): string {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : s;
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ReceptionistTestPage(): React.ReactElement {
  const { reportPageError } = usePageError('ReceptionistTestPage');

  // ── recent test calls ─────────────────────────────────────────────────────────────────────────
  const [tests, setTests] = useState<PhoneCall[]>([]);
  const refresh = useCallback(() => {
    // `scope=test` — not a client-side filter. When the calls API gained a scope on 2026-09-21 its
    // default became `live`, so this panel was asking for a hundred LIVE calls and filtering them
    // for test ones: always empty, with no error anywhere. Ask for the log you actually want.
    fetch('/api/admin/calls?limit=100&scope=test')
      .then((r) => r.json())
      .then((j: { calls?: PhoneCall[] }) => setTests(j.calls ?? []))
      .catch((e: Error) => reportPageError(e));
  }, [reportPageError]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 10_000); return () => clearInterval(t); }, [refresh]);

  // ── which speech model the ElevenLabs agent talks with (owner, 2026-09-21) ───────────────
  //
  // Read from ElevenLabs rather than remembered here, because the agent is the only thing that
  // knows: a deploy, a script run, or somebody else's browser can all have changed it.
  const [agentModel, setAgentModel] = useState<string | null>(null);
  const [modelBusy, setModelBusy] = useState<string | null>(null);
  const [modelNote, setModelNote] = useState<string | null>(null);

  const loadModel = useCallback(() => {
    fetch('/api/admin/receptionist-test/model')
      .then((r) => r.json())
      .then((j: { current?: { starr?: string | null } }) => setAgentModel(j.current?.starr ?? null))
      .catch(() => { /* the picker shows nothing selected; the switch still works */ });
  }, []);
  useEffect(() => { loadModel(); }, [loadModel]);

  const chooseModel = useCallback(async (m: AgentModel) => {
    setModelBusy(m.id);
    setModelNote(null);
    try {
      const r = await fetch('/api/admin/receptionist-test/model', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelId: m.id, agent: 'both' }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setAgentModel(m.id);
      setModelNote(`Now speaking with ${m.name}. It takes effect on the next conversation.`);
    } catch (e) {
      setModelNote((e as Error).message);
    } finally {
      setModelBusy(null);
    }
  }, []);

  // ── which receptionist answers LIVE calls, and which one a test call runs ──────────────────────
  const [live, setLive] = useState<{ version: ReceptionistVersion; voice: string | null; updatedBy: string | null; updatedAt: string | null; elevenLabsReady?: boolean; fallback?: { silentFallback: boolean; statement: string } } | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  // Which version the owner is about to put in front of real callers, while they confirm it.
  const [confirmAgent, setConfirmAgent] = useState<ReceptionistVersion | null>(null);
  const [testVersion, setTestVersion] = useState<TestVersion>('agent');

  /**
   * Whether the version being tested speaks through ElevenLabs.
   *
   * This is what decides which voice list step 2 shows. The two lists are not interchangeable:
   * `AGENT_VOICES` are ElevenLabs agent voices, `RECEPTIONIST_VOICES` are Twilio <Say> voices, and
   * showing the wrong one was the single most confusing thing on this page — you could pick Riley
   * for the answering machine, which cannot speak in Riley.
   */
  const usesElevenLabsVoice = testVersion === 'elevenlabs';

  // The voice a test call is spoken in. Remembered, so auditioning one voice after another is quick.
  const [testVoice, setTestVoice] = useState<string>(DEFAULT_VOICE_ID);
  useEffect(() => { try { const v = localStorage.getItem('rtest-voice'); if (v) setTestVoice(v); } catch { /* private mode */ } }, []);
  const chooseVoice = (id: string) => { setTestVoice(id); try { localStorage.setItem('rtest-voice', id); } catch { /* ignore */ } };
  const voice = RECEPTIONIST_VOICES.find((v) => v.id === testVoice) ?? RECEPTIONIST_VOICES[0];
  useEffect(() => {
    fetch('/api/admin/receptionist-test/version').then((r) => r.json()).then((j) => {
      if (!j?.version) return;
      setLive(j);
      // Test calls default to the conversational agent being honed — the ElevenLabs one where it is
      // configured (owner, 2026-09-15: "only testing the fully functional and conversational AI voice
      // agent … keep just the simpler answering machine style recording for live calls").
      if (j.elevenLabsReady) setTestVersion((cur) => (cur === 'agent' ? 'elevenlabs' : cur));
    }).catch((e: Error) => reportPageError(e));
  }, [reportPageError]);
  const saveLive = async (patch: { version?: ReceptionistVersion; voice?: string | null }) => {
    setLiveBusy(true);
    try {
      const r = await fetch('/api/admin/receptionist-test/version', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setLive(j);
      setConfirmAgent(null);
    } catch (e) {
      reportPageError(e as Error);
    } finally {
      setLiveBusy(false);
    }
  };
  const setLiveVersion = (version: ReceptionistVersion) => saveLive({ version });

  // ── the agent's voice: hear it, then switch to it (owner, 2026-09-16) ─────────────────────────
  const [agentVoices, setAgentVoices] = useState<{ starr: string | null; generic: string | null }>({ starr: null, generic: null });
  const [playing, setPlaying] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const sampleRef = useRef<HTMLAudioElement | null>(null);
  const loadAgentVoices = useCallback(() => {
    fetch('/api/admin/receptionist-test/voices')
      .then((r) => r.json())
      .then((j: { current?: { starr: string | null; generic: string | null } }) => { if (j.current) setAgentVoices(j.current); })
      .catch(() => { /* the card still renders; switching will report the error */ });
  }, []);
  useEffect(() => { loadAgentVoices(); }, [loadAgentVoices]);

  const playSample = (voice: AgentVoice) => {
    sampleRef.current?.pause();
    if (playing === voice.id) { setPlaying(null); return; }
    const audio = new Audio(`/api/admin/receptionist-test/voice-sample?voice=${encodeURIComponent(voice.id)}`);
    sampleRef.current = audio;
    setPlaying(voice.id);
    audio.onended = () => setPlaying(null);
    audio.onerror = () => { setPlaying(null); setVoiceNote(`Could not play the ${voice.name} sample.`); };
    void audio.play().catch(() => { setPlaying(null); setVoiceNote('The browser blocked playback — click the page once and try again.'); });
  };
  const assignVoice = async (voice: AgentVoice, agent: 'starr' | 'generic' | 'both') => {
    setVoiceBusy(voice.id);
    setVoiceNote(null);
    try {
      const r = await fetch('/api/admin/receptionist-test/voices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voiceId: voice.id, agent }) });
      const j = (await r.json()) as { error?: string; agents?: string[] };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setVoiceNote(`${voice.name} is now the voice for ${(j.agents ?? []).map((a) => (a === 'starr' ? 'the Starr receptionist' : 'general conversation')).join(' and ')}. Start a conversation to hear it.`);
      loadAgentVoices();
    } catch (e) {
      setVoiceNote((e as Error).message);
    } finally {
      setVoiceBusy(null);
    }
  };
  useEffect(() => () => sampleRef.current?.pause(), []);

  // ── talk to an agent right now, in this browser (owner, 2026-09-15) ───────────────────────────
  // "There should be a button to click to just start a conversation." WebRTC straight to ElevenLabs:
  // no phone, no Twilio, nobody rung. The transcript builds live here and is filed on /admin/calls.
  type TalkAgent = 'starr' | 'generic';
  const [talkAgent, setTalkAgent] = useState<TalkAgent>('starr');
  const [talkState, setTalkState] = useState<'idle' | 'connecting' | 'live' | 'ended' | 'error'>('idle');
  const [talkError, setTalkError] = useState<string | null>(null);
  const [talkTurns, setTalkTurns] = useState<Array<{ role: 'caller' | 'assistant'; text: string }>>([]);
  const [talkSpeaking, setTalkSpeaking] = useState<'agent' | 'you' | null>(null);
  const [talkSeconds, setTalkSeconds] = useState(0);
  const [filing, setFiling] = useState<string | null>(null);
  /** The ElevenLabs id of the conversation currently held, so it can be filed by name. */
  const [talkConvId, setTalkConvId] = useState<string | null>(null);
  /** conversationId -> the call row it became. Keyed so the button reflects THIS call. */
  const [filed, setFiled] = useState<Record<string, string | null>>({});
  const convRef = useRef<{ endSession: () => Promise<void> } | null>(null);
  const talkBox = useRef<HTMLDivElement>(null);
  useEffect(() => { talkBox.current?.scrollTo({ top: talkBox.current.scrollHeight }); }, [talkTurns]);
  useEffect(() => {
    if (talkState !== 'live') return;
    const t = setInterval(() => setTalkSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [talkState]);

  const startTalking = async () => {
    setTalkError(null);
    setTalkTurns([]);
    setTalkSeconds(0);
    setTalkConvId(null);
    setFiling(null);
    setTalkState('connecting');
    try {
      const r = await fetch('/api/admin/receptionist-test/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: talkAgent }) });
      const j = (await r.json()) as { token?: string; error?: string };
      if (!r.ok || !j.token) throw new Error(j.error ?? `HTTP ${r.status}`);
      // The microphone is asked for here, by the browser, on this click — never in the background.
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { Conversation } = await import('@elevenlabs/client');
      const conversation = await Conversation.startSession({
        conversationToken: j.token,
        connectionType: 'webrtc',
        // The conversation id is the whole reason filing can be per-call. Without it the bench
        // could only sweep "the last ten conversations of both agents" and had nothing to mark a
        // button against.
        onConnect: (info?: { conversationId?: string }) => {
          setTalkState('live');
          if (info?.conversationId) setTalkConvId(info.conversationId);
        },
        onDisconnect: () => { setTalkState('ended'); convRef.current = null; },
        onError: (message: string) => { setTalkError(String(message)); setTalkState('error'); },
        onModeChange: ({ mode }: { mode: string }) => setTalkSpeaking(mode === 'speaking' ? 'agent' : 'you'),
        onMessage: ({ message, source }: { message: string; source: string }) => {
          if (!message) return;
          setTalkTurns((cur) => [...cur, { role: source === 'ai' ? 'assistant' : 'caller', text: message }]);
        },
      });
      const conv = conversation as unknown as { endSession: () => Promise<void>; getId?: () => string };
      convRef.current = conv;
      // Some SDK versions hand the id back here rather than to onConnect. Either will do; taking
      // both means the button never silently falls back to the sweep.
      try { const id = conv.getId?.(); if (id) setTalkConvId(id); } catch { /* not available */ }
    } catch (e) {
      setTalkError((e as Error).message);
      setTalkState('error');
    }
  };
  const stopTalking = async () => {
    try { await convRef.current?.endSession(); } catch { /* already gone */ }
    convRef.current = null;
    setTalkState('ended');
    setTalkSpeaking(null);
  };
  const fileTranscripts = async () => {
    setFiling('Filing this conversation…');
    try {
      // Name the conversation when we have it, so exactly one row is written and we learn which.
      // Without an id we fall back to the old sweep rather than filing nothing — a conversation
      // that reached the bench should always be fileable.
      const body = talkConvId
        ? { conversationId: talkConvId, agent: talkAgent }
        : { limit: 10 };
      const r = await fetch('/api/admin/receptionist-test/import', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = (await r.json()) as {
        imported?: number; updated?: number; skipped?: boolean; callId?: string | null; error?: string;
      };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);

      if (talkConvId) {
        if (j.skipped) { setFiling('Nothing to file — ElevenLabs has no transcript for that conversation yet. Try again in a moment.'); return; }
        // Remembered against the conversation id, so the button reflects THIS call rather than
        // "something was filed at some point".
        setFiled((cur) => ({ ...cur, [talkConvId]: j.callId ?? null }));
        setFiling(j.imported ? 'Filed on the Calls page.' : 'Already filed — updated with the latest transcript.');
      } else {
        setFiling(`Filed: ${j.imported ?? 0} new, ${j.updated ?? 0} updated. They are on the Calls page, under Test calls.`);
      }
      refresh();
    } catch (e) {
      setFiling((e as Error).message);
    }
  };

  // ── 1. browser call ───────────────────────────────────────────────────────────────────────────
  const [browserStatus, setBrowserStatus] = useState<string>('idle');
  const [browserErr, setBrowserErr] = useState<string | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (browserStatus !== 'in call') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [browserStatus]);

  const startBrowserCall = async () => {
    setBrowserErr(null);
    setBrowserStatus('getting token');
    try {
      const j = (await (await fetch('/api/admin/receptionist-test/token')).json()) as { token?: string; error?: string };
      if (!j.token) throw new Error(j.error || 'No token');
      const { Device } = await import('@twilio/voice-sdk');
      const device = new Device(j.token, { logLevel: 1 }) as unknown as Device;
      deviceRef.current = device;
      setBrowserStatus('connecting');
      const call = await device.connect({ params: { version: testVersion, voice: testVoice } });
      callRef.current = call;
      setSeconds(0);
      call.on('accept', () => setBrowserStatus('in call'));
      call.on('disconnect', () => { setBrowserStatus('ended'); callRef.current = null; device.destroy(); deviceRef.current = null; setTimeout(refresh, 2500); });
      call.on('error', (e: unknown) => { setBrowserErr(String((e as Error)?.message ?? e)); setBrowserStatus('error'); });
    } catch (e) {
      setBrowserErr((e as Error).message);
      setBrowserStatus('error');
    }
  };
  const hangUp = () => { callRef.current?.disconnect(); deviceRef.current?.destroy(); setBrowserStatus('ended'); };

  // ── 2. call my phone ──────────────────────────────────────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [phoneStatus, setPhoneStatus] = useState<string | null>(null);
  useEffect(() => { try { setPhone(localStorage.getItem('rtest-phone') ?? ''); } catch { /* private mode */ } }, []);
  const callMyPhone = async () => {
    setPhoneStatus('placing call…');
    try { localStorage.setItem('rtest-phone', phone); } catch { /* ignore */ }
    const r = await fetch('/api/admin/receptionist-test/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: phone, version: testVersion, voice: testVoice }) });
    const j = (await r.json()) as { callSid?: string; error?: string; to?: string };
    if (!r.ok || !j.callSid) { setPhoneStatus(`Failed: ${j.error ?? r.status}`); return; }
    setPhoneStatus(`Ringing ${j.to}. Answer it to test the ${TEST_VERSION_LABELS[testVersion].name.toLowerCase()}. The call appears below when it ends.`);
    setTimeout(refresh, 8000);
  };

  // ── 3. text chat ──────────────────────────────────────────────────────────────────────────────
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');

  // ── THE REHEARSAL SCRIPTS, ATTACHED TO THE CHAT (2026-09-21) ────────────────────────────────
  //
  // They used to live in the intake bench. That is gone, and the scripts are the most-used thing
  // on this page — six of the transcripts the owner has worked through came out of them — so they
  // move to the nearest equivalent rather than going with it. One click loads the next caller line
  // into the box below; you read it or send it.
  const [scriptId, setScriptId] = useState('');
  const [scriptAt, setScriptAt] = useState(0);
  const script = scriptId ? testScript(scriptId) : undefined;
  const scriptTurn = script?.turns[scriptAt];

  const loadNextScriptLine = useCallback(() => {
    const turn = script?.turns[scriptAt];
    if (!turn) return;
    setScriptAt((n) => n + 1);
    // A silence turn has nothing to type. Saying so is more useful than loading an empty box,
    // because "say nothing for ten seconds" is a thing the tester has to DO.
    setDraft(turn.says ?? '');
  }, [script, scriptAt]);
  const [busy, setBusy] = useState(false);
  const [chatSid, setChatSid] = useState<string | null>(null);
  const [chatDone, setChatDone] = useState(false);
  const stateRef = useRef<CallState>({ turns: [], facts: {}, silence: 0, started: Date.now(), test: true });
  const chatBox = useRef<HTMLDivElement>(null);
  useEffect(() => { chatBox.current?.scrollTo({ top: chatBox.current.scrollHeight }); }, [msgs]);

  const sendChat = async () => {
    const heard = draft.trim();
    if (!heard || busy) return;
    setDraft('');
    setBusy(true);
    const state = stateRef.current;
    setMsgs((m) => [...m, { role: 'caller', text: heard }, { role: 'assistant', text: '' }]);
    const t0 = Date.now();
    let firstWord: number | null = null;
    try {
      const r = await fetch('/api/admin/receptionist-test/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ callSid: chatSid, heard, state }) });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let words = '';
      let control: string | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        if (control !== null) { control += chunk; continue; }
        const at = chunk.indexOf(RS);
        const w = at >= 0 ? chunk.slice(0, at) : chunk;
        if (w) {
          if (firstWord === null) firstWord = Date.now() - t0;
          words += w;
          const snapshot = words;
          setMsgs((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], text: snapshot, firstWordMs: firstWord }; return c; });
        }
        if (at >= 0) control = chunk.slice(at + 1);
      }
      const env = JSON.parse(control || '{}') as { callSid?: string; say?: string; next?: string; facts?: CallState['facts']; firstWordMs?: number | null; totalMs?: number; error?: string };
      if (env.callSid) setChatSid(env.callSid);
      const say = env.say || words;
      stateRef.current = { ...state, facts: { ...state.facts, ...(env.facts ?? {}) }, turns: [...state.turns, { role: 'caller', text: heard }, { role: 'assistant', text: say }] };
      setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', text: say, firstWordMs: env.firstWordMs ?? firstWord, totalMs: env.totalMs ?? Date.now() - t0 }; return c; });
      if (env.next === 'done' || env.next === 'voicemail') { setChatDone(true); setTimeout(refresh, 4000); }
      if (env.error) reportPageError(env.error);
    } catch (e) {
      reportPageError(e as Error);
      setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', text: '(no reply: request failed)' }; return c; });
    } finally {
      setBusy(false);
    }
  };
  const endChat = async () => {
    if (chatSid && !chatDone) await fetch('/api/admin/receptionist-test/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ callSid: chatSid, end: true, state: stateRef.current }) });
    setMsgs([]); setChatSid(null); setChatDone(false);
    stateRef.current = { turns: [], facts: {}, silence: 0, started: Date.now(), test: true };
    setTimeout(refresh, 3000);
  };
  const facts = stateRef.current.facts;

  return (
    <div className="rtest">
      <div className="rtest__head">
        <h1>Receptionist test bench</h1>
        <p>Talk to the receptionist exactly as a customer would, without ringing Hank. Test calls are private: they are marked <span className="pill pill--test">Test</span> on the Calls page, get the recording, transcript and AI analysis, and never text or notify anyone or create a lead.</p>
      </div>

      {/* ── LIVE CALLS ── */}
      <section className={`rtest__card rtest__live rtest__live--${live?.version ?? 'loading'}`} aria-labelledby="rt-live" data-testid="rtest-live">
        <h2 id="rt-live">Live calls to the business line</h2>
        {!live ? <p>Checking which version is answering…</p> : (
          <>
            <p className="rtest__live-now">
              When Hank doesn&apos;t pick up, callers get: <b data-testid="rtest-live-version">{VERSION_LABELS[live.version].name}</b>
            </p>
            <p>{VERSION_LABELS[live.version].blurb}</p>

            {/* ── WHAT ACTUALLY ANSWERED ────────────────────────────────────────────────────────
                The line above is the SETTING. For five days from 2026-09-16 it said callers were
                reaching the conversational agent while every one of them left a voicemail: the SIP
                trunk refused each INVITE and the fallback did its job silently. A screen that
                reports an intention and never checks the outcome is how that lasted five days. */}
            {live.fallback?.silentFallback ? (
              <p className="rtest__live-fallback" role="alert" data-testid="rtest-live-fallback">
                <b>Callers are NOT reaching this receptionist.</b> {live.fallback.statement}
              </p>
            ) : live.fallback?.statement ? (
              <p className="rtest__status" data-testid="rtest-live-answered">{live.fallback.statement}</p>
            ) : null}

            <p className="rtest__status">Voice: <b>{(RECEPTIONIST_VOICES.find((v) => v.id === (live.voice ?? DEFAULT_VOICE_ID)) ?? RECEPTIONIST_VOICES[0]).name}</b></p>
            {live.updatedBy && <small className="rtest__status">Set by {live.updatedBy}{live.updatedAt ? ` · ${fmtWhen(live.updatedAt)}` : ''}</small>}
            <div className="rtest__row">
              {live.version !== 'answering-machine' ? (
                <button type="button" className="rtest__btn" onClick={() => void setLiveVersion('answering-machine')} disabled={liveBusy} data-testid="rtest-live-machine">
                  Switch live calls back to the answering machine
                </button>
              ) : null}
              {confirmAgent ? (
                <>
                  <span className="rtest__status">Real customers will talk to {VERSION_LABELS[confirmAgent].name.toLowerCase()}. Only do this once it sounds right on test calls.</span>
                  <button type="button" className="rtest__btn rtest__btn--danger" onClick={() => void setLiveVersion(confirmAgent)} disabled={liveBusy} data-testid="rtest-live-agent-confirm">
                    Yes, put it on live calls
                  </button>
                  <button type="button" className="rtest__btn rtest__btn--ghost" onClick={() => setConfirmAgent(null)} disabled={liveBusy}>Cancel</button>
                </>
              ) : (
                <>
                  {live.version !== 'elevenlabs' && live.elevenLabsReady !== false && (
                    <button type="button" className="rtest__btn rtest__btn--ghost" onClick={() => setConfirmAgent('elevenlabs')} disabled={liveBusy} data-testid="rtest-live-elevenlabs">
                      Put the conversational agent on live calls…
                    </button>
                  )}
                  {live.version !== 'agent' && (
                    <button type="button" className="rtest__btn rtest__btn--ghost" onClick={() => setConfirmAgent('agent')} disabled={liveBusy} data-testid="rtest-live-agent">
                      Use the relay agent instead…
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── TALK TO AN AGENT, RIGHT NOW ── */}
      {/* ── WHICH VERSION A TEST CALL RUNS ── */}
      {/* ══ SET UP YOUR TEST ═══════════════════════════════════════════════════════════════════
          Owner, 2026-09-21: the page "looks terrible and is hard to understand and use."

          The worst of it was two different things both called "voice", in two different cards, with
          different lists: the ElevenLabs AGENT voice (Riley, Sarah…) and the Twilio <Say> voice used
          by the answering machine and the relay. Which one mattered depended on a version control
          in a third card, below both of them.

          So: one card, three numbered steps, left to right, and step 2 shows the voices of whatever
          engine step 1 chose. You cannot pick a voice the thing you are testing will not speak in. */}
      <section className="rtest__setup" aria-labelledby="rt-setup" data-testid="rtest-setup">
        <h2 id="rt-setup" className="rtest__setup-title">Set up your test</h2>

        <div className="rtest__setup-grid">
          {/* ── 1 · WHICH RECEPTIONIST ────────────────────────────────────────────────────── */}
          <div className="rtest__step">
            <h3 className="rtest__step-head"><span className="rtest__step-n">1</span> Which receptionist</h3>
            <div className="rtest__choices" role="radiogroup" aria-label="Which receptionist to test">
              {(['elevenlabs', 'agent', 'answering-machine'] as TestVersion[])
                .filter((v) => v !== 'elevenlabs' || live?.elevenLabsReady !== false)
                .map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={testVersion === v}
                    className={`rtest__choice${testVersion === v ? ' rtest__choice--on' : ''}`}
                    onClick={() => setTestVersion(v)}
                    data-testid={`rtest-version-${v}`}
                  >
                    <span className="rtest__choice-name">
                      {TEST_VERSION_LABELS[v].name}
                      {live?.version === v && <em className="rtest__tag rtest__tag--live">Live now</em>}
                    </span>
                    <span className="rtest__choice-blurb">{TEST_VERSION_LABELS[v].blurb}</span>
                  </button>
                ))}
            </div>
            <p className="rtest__hint">
              {testVersion === 'elevenlabs'
                ? 'Runs on a phone call, a browser call, or “Talk now” below.'
                : 'Runs on a phone call or a browser call below. “Talk now” always goes straight to ElevenLabs.'}
            </p>
          </div>

          {/* ── 2 · VOICE ─────────────────────────────────────────────────────────────────── */}
          <div className="rtest__step">
            <h3 className="rtest__step-head"><span className="rtest__step-n">2</span> Voice</h3>

            {usesElevenLabsVoice ? (
              <>
                <div className="rtest__voicelist" data-testid="rtest-voices">
                  {AGENT_VOICE_GROUPS.map((group) => {
                    const inGroup = AGENT_VOICES.filter((v) => v.group === group);
                    if (inGroup.length === 0) return null;
                    return (
                      <div key={group}>
                        <p className="rtest__grouphead">{group}</p>
                        {inGroup.map((v) => {
                          const on = agentVoices.starr === v.id;
                          return (
                            <div key={v.id} className={`rtest__voicerow${on ? ' rtest__voicerow--on' : ''}`} data-testid={`rtest-voice-${v.id}`}>
                              <button
                                type="button"
                                className="rtest__play"
                                onClick={() => playSample(v)}
                                aria-label={playing === v.id ? `Stop the ${v.name} sample` : `Play the ${v.name} sample`}
                                data-testid={`rtest-voice-play-${v.id}`}
                              >
                                {playing === v.id ? '■' : '▶'}
                              </button>
                              <button
                                type="button"
                                className="rtest__voicepick"
                                aria-pressed={on}
                                disabled={voiceBusy === v.id}
                                onClick={() => void assignVoice(v, 'both')}
                                title={v.blurb}
                              >
                                <span className="rtest__voicename">{v.name}</span>
                                {on && <span className="rtest__tag rtest__tag--on">In use</span>}
                                {!on && v.recommended && <span className="rtest__tag">Worth trying</span>}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {voiceNote && <p className="rtest__note" aria-live="polite">{voiceNote}</p>}
                <p className="rtest__hint">Press ▶ to hear the receptionist&rsquo;s real opening line. Picking one changes it on the next conversation — no deploy.</p>
              </>
            ) : (
              <>
                <select
                  className="rtest__select"
                  value={testVoice}
                  onChange={(e) => chooseVoice(e.target.value)}
                  aria-label="Voice to test"
                  data-testid="rtest-voice"
                >
                  {(['ElevenLabs', 'Google', 'Amazon'] as const).map((prov) => (
                    <optgroup key={prov} label={prov === 'ElevenLabs' ? 'ElevenLabs' : prov === 'Google' ? 'Google Chirp 3 HD' : 'Amazon Polly generative'}>
                      {RECEPTIONIST_VOICES.filter((v) => v.provider === prov).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <p className="rtest__hint">{voice.blurb}</p>
                <div className="rtest__rowbtns">
                  {voice.sample && <a className="rtest__btn rtest__btn--ghost" href={voice.sample} target="_blank" rel="noreferrer">Hear samples ↗</a>}
                  <button
                    type="button"
                    className="rtest__btn rtest__btn--ghost"
                    onClick={() => void saveLive({ voice: testVoice })}
                    disabled={liveBusy || live?.voice === testVoice}
                    data-testid="rtest-voice-live"
                  >
                    {live?.voice === testVoice ? 'This is the live voice' : 'Use on live calls'}
                  </button>
                </div>
                <p className="rtest__hint">
                  This version speaks through Twilio, which has no ElevenLabs voices — so an ElevenLabs
                  choice here falls back to the closest Google voice.
                </p>
              </>
            )}
          </div>

          {/* ── 3 · SPEECH MODEL ──────────────────────────────────────────────────────────── */}
          <div className="rtest__step">
            <h3 className="rtest__step-head"><span className="rtest__step-n">3</span> Speech model</h3>
            {usesElevenLabsVoice ? (
              <>
                <div className="rtest__choices" role="radiogroup" aria-label="Speech model">
                  {AGENT_MODELS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={agentModel === m.id}
                      className={`rtest__choice${agentModel === m.id ? ' rtest__choice--on' : ''}`}
                      disabled={modelBusy !== null}
                      onClick={() => void chooseModel(m)}
                      data-testid={`rtest-model-${m.id}`}
                    >
                      <span className="rtest__choice-name">
                        {m.name}
                        <em className="rtest__tag">{m.latency}</em>
                      </span>
                      <span className="rtest__choice-blurb">{m.blurb}</span>
                      <span className="rtest__choice-cost">Costs you: {m.tradeoff}</span>
                    </button>
                  ))}
                </div>
                {modelNote && <p className="rtest__note" aria-live="polite">{modelNote}</p>}
              </>
            ) : (
              <p className="rtest__hint">
                Only the ElevenLabs agent has a speech model. The answering machine and the relay
                version speak through Twilio, which uses the voice picked in step 2 and nothing else.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className={`rtest__card ${talkState === 'live' ? 'rtest__card--live' : ''}`} aria-labelledby="rt-talk" data-testid="rtest-talk">
        <h2 id="rt-talk">Talk to an agent now</h2>
        <p>Straight from this browser over the internet — no phone call, nobody rung, no Twilio minutes. Everything said is transcribed here and can be filed on the Calls page.</p>
        <div className="rtest__versions" role="radiogroup" aria-label="Which agent to talk to">
          {([
            { id: 'starr' as const, name: 'Starr Surveying receptionist', blurb: 'Ellie: the real thing — the firm\u2019s services, taking a message for Hank, and the rules: no prices, no promises, no guessing who is calling.' },
            { id: 'generic' as const, name: 'General conversation', blurb: 'The same voice and turn-taking with no business behind it. For judging how natural the conversation feels about anything at all.' },
          ]).map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={talkAgent === a.id}
              className={`rtest__version${talkAgent === a.id ? ' rtest__version--on' : ''}`}
              onClick={() => setTalkAgent(a.id)}
              disabled={talkState === 'live' || talkState === 'connecting'}
              data-testid={`rtest-talk-${a.id}`}
            >
              <b>{a.name}</b>
              <span>{a.blurb}</span>
            </button>
          ))}
        </div>
        <div className="rtest__row">
          {talkState === 'live' || talkState === 'connecting' ? (
            <button type="button" className="rtest__btn rtest__btn--danger" onClick={() => void stopTalking()} data-testid="rtest-talk-stop">End conversation</button>
          ) : (
            <button type="button" className="rtest__btn" onClick={() => void startTalking()} data-testid="rtest-talk-start">Start conversation</button>
          )}
          <span className={`rtest__status ${talkState === 'live' ? 'rtest__status--live' : ''}`} aria-live="polite">
            {talkState === 'live' && <span className="rtest__dot" aria-hidden="true" />}
            {talkState === 'live'
              ? `Live · ${Math.floor(talkSeconds / 60)}:${String(talkSeconds % 60).padStart(2, '0')}${talkSpeaking === 'agent' ? ' · speaking' : talkSpeaking === 'you' ? ' · listening' : ''}`
              : talkState === 'connecting' ? 'Connecting — allow the microphone…'
              : talkState === 'ended' ? 'Conversation ended'
              : talkState === 'error' ? 'Could not connect' : 'Ready'}
          </span>
          {/* Once this conversation is filed the button is GONE, replaced by a link to the row it
              became. Leaving a "File it" button sitting there after filing invites a second press
              and gives no way to see what happened — the owner asked for exactly this. */}
          {talkTurns.length > 0 && talkState !== 'live' && (
            talkConvId && talkConvId in filed ? (
              filed[talkConvId] ? (
                <Link href={`/admin/calls/${filed[talkConvId]}`} className="rtest__btn rtest__btn--ghost" data-testid="rtest-talk-filed">
                  ✓ Filed — open it on the Calls page
                </Link>
              ) : (
                <Link href="/admin/calls?scope=test" className="rtest__btn rtest__btn--ghost" data-testid="rtest-talk-filed">
                  ✓ Filed — see it under Test calls
                </Link>
              )
            ) : (
              <button type="button" className="rtest__btn rtest__btn--ghost" onClick={() => void fileTranscripts()} data-testid="rtest-talk-file">
                File it on the Calls page
              </button>
            )
          )}
        </div>
        {talkError && <div className="rtest__status rtest__status--err">{talkError}</div>}
        {filing && <div className="rtest__status" aria-live="polite">{filing}</div>}
        {talkTurns.length > 0 && (
          <div className="rtest__chat" ref={talkBox} aria-live="polite" data-testid="rtest-talk-transcript">
            {talkTurns.map((t, i) => (
              <div key={i} className={`rtest__msg rtest__msg--${t.role === 'assistant' ? 'assistant' : 'caller'}`}>
                {/* Who said it, named. Two tinted bubbles read fine while you are watching them
                    arrive and not at all afterwards — and this transcript is the thing you scroll
                    back through to work out what went wrong on a call. */}
                <span className="rtest__who">{t.role === 'assistant' ? `${ASSISTANT_NAME}:` : 'Caller:'}</span>
                {t.text}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── VOICES: hear one, then put it on an agent ── */}
      {/* The two call buttons, side by side — they are the same kind of thing. */}
      <div className="rtest__grid">
        <section className={`rtest__card ${browserStatus === 'in call' ? 'rtest__card--live' : ''}`} aria-labelledby="rt-browser">
          <h2 id="rt-browser">Call from this browser</h2>
          <p>Uses your microphone and speakers. Same voice and timing as the business line. Testing: <b>{TEST_VERSION_LABELS[testVersion].name}</b>.</p>
          <div className="rtest__row">
            {browserStatus === 'in call' || browserStatus === 'connecting' ? (
              <button type="button" className="rtest__btn rtest__btn--danger" onClick={hangUp}>Hang up</button>
            ) : (
              <button type="button" className="rtest__btn" onClick={startBrowserCall} disabled={browserStatus === 'getting token'}>Start call</button>
            )}
            <span className={`rtest__status ${browserStatus === 'in call' ? 'rtest__status--live' : ''}`} aria-live="polite">
              {browserStatus === 'in call' ? <span className="rtest__dot" aria-hidden="true" /> : null}
              {browserStatus === 'connecting' || browserStatus === 'getting token' ? <span className="rtest__dot rtest__dot--ring" aria-hidden="true" /> : null}
              {browserStatus === 'in call' ? `In call · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : LABEL[browserStatus] ?? browserStatus}
            </span>
          </div>
          {browserErr && <div className="rtest__status rtest__status--err">{browserErr}</div>}
        </section>

        <section className="rtest__card" aria-labelledby="rt-phone">
          <h2 id="rt-phone">Call my phone</h2>
          <p>Twilio rings the number below from the business line and the <b>{TEST_VERSION_LABELS[testVersion].name.toLowerCase()}</b> answers when you pick up.</p>
          <div className="rtest__row">
            <input id="rtest-phone" className="rtest__input" type="tel" inputMode="tel" placeholder="(254) 555-0100" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone number to call" />
            <button type="button" className="rtest__btn" onClick={callMyPhone} disabled={phone.replace(/\D/g, '').length < 10}>Call me</button>
          </div>
          {phoneStatus && <div className="rtest__status" aria-live="polite">{phoneStatus.startsWith('Ringing') ? <span className="rtest__phone-icon" aria-hidden="true">📞</span> : null}{phoneStatus}</div>}
        </section>

        <section className="rtest__card" aria-labelledby="rt-chat" style={{ gridColumn: '1 / -1' }}>
          <h2 id="rt-chat">Text chat (full AI agent)</h2>
          <p>The same brain by keyboard: push it for a price, leave a message, or run a full intake. Each reply shows how long the first word took, which is what a caller feels.</p>
          <div className="rtest__scriptbar">
            <label className="rtest__scriptpick" htmlFor="rtest-script">
              <span className="rtest__scriptlabel">Rehearsal script</span>
              <select
                id="rtest-script"
                value={scriptId}
                onChange={(e) => { setScriptId(e.target.value); setScriptAt(0); setDraft(''); }}
                data-testid="rtest-script"
              >
                <option value="">— free typing —</option>
                {TEST_SCRIPTS.map((sc, i) => (
                  <option key={sc.id} value={sc.id}>
                    {String(i + 1).padStart(2, '0')} · {sc.title} ({sc.minutes}m, {sc.difficulty})
                  </option>
                ))}
              </select>
            </label>
            {script && (
              <>
                <button
                  type="button"
                  className="rtest__btn rtest__btn--ghost"
                  onClick={loadNextScriptLine}
                  disabled={scriptAt >= script.turns.length}
                  data-testid="rtest-script-next"
                >
                  {scriptAt >= script.turns.length ? 'Script finished' : `Load line ${scriptAt + 1} of ${script.turns.length}`}
                </button>
                <span className="rtest__hint">{script.tests}</span>
              </>
            )}
          </div>
          {scriptTurn?.silenceSeconds ? (
            <p className="rtest__note">Next: say nothing for {scriptTurn.silenceSeconds} seconds.</p>
          ) : null}
          {scriptTurn?.watchFor ? <p className="rtest__note">Watch for: {scriptTurn.watchFor}</p> : null}
          <div className="rtest__chat" ref={chatBox} aria-live="polite">
            {msgs.length === 0 && (
              <div className="rtest__msg rtest__msg--assistant">
                <span className="rtest__who">{ASSISTANT_NAME}:</span>
                Hi, thanks for calling {BUSINESS_NAME}. You can leave a message, or ask me anything. Type below to start.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`rtest__msg rtest__msg--${m.role}`}>
                <span className="rtest__who">{m.role === 'assistant' ? `${ASSISTANT_NAME}:` : 'You:'}</span>
                {m.text || (m.role === 'assistant' ? <span className="rtest__typing" aria-label={`${ASSISTANT_NAME} is replying`}><i /><i /><i /></span> : '')}
                {m.role === 'assistant' && m.totalMs != null && <small>first word {m.firstWordMs ?? '?'} ms · full reply {m.totalMs} ms</small>}
              </div>
            ))}
          </div>
          <div className="rtest__row">
            <input id="rtest-draft" className="rtest__input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void sendChat(); }} placeholder={chatDone ? 'Ellie ended the call. Start a new one below.' : 'Say something to Ellie…'} disabled={busy || chatDone} aria-label="Message to the receptionist" />
            <button type="button" className="rtest__btn" onClick={sendChat} disabled={busy || chatDone || !draft.trim()}>Send</button>
            <button type="button" className="rtest__btn rtest__btn--ghost" onClick={endChat} disabled={busy || msgs.length === 0}>{chatDone ? 'New chat' : 'End & wrap up'}</button>
          </div>
          {Object.keys(facts).length > 0 && (
            <div className="rtest__facts">
              <b>What Ellie has written down so far</b>
              {Object.entries(facts).filter(([, v]) => v).map(([k, v]) => <span key={k}>{k}: {String(v)}</span>)}
            </div>
          )}
        </section>
      </div>

      <section className="rtest__card" aria-labelledby="rt-recent">
        <h2 id="rt-recent">Recent test calls</h2>
        <p>Click one for the recording, transcript and analysis. Real calls stay on the <Link href="/admin/calls">Calls page</Link>.</p>
        <div className="rtest__list">
          {tests.length === 0 && <span className="rtest__status">No test calls yet.</span>}
          {tests.slice(0, 25).map((c) => (
            <Link key={c.id} href={`/admin/calls/${c.id}`} className="rtest__item">
              <span>
                {c.call_sid.startsWith('TEST-') ? 'Text chat' : c.from_number.startsWith('client:') ? 'Browser call' : `Phone call to ${fmtPhone(c.from_number)}`}
                {c.summary ? <> · {c.summary.slice(0, 90)}{c.summary.length > 90 ? '…' : ''}</> : null}
                <small> · {fmtWhen(c.started_at)}{c.duration_seconds ? ` · ${c.duration_seconds}s` : ''}</small>
              </span>
              <span className="rtest__row">
                {c.recording_sid && <span className="pill">Audio</span>}
                {c.analysis && <span className="pill pill--ai">Analyzed</span>}
                <span className={`pill pill--${c.status === 'completed' ? 'customer' : 'unknown'}`}>{c.status}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="rtest__note">
        <b>A test call reaches nobody.</b> No text, no email, no bell on the website, and no lead in the queue — the check sits at the one door every alert goes through, so it cannot be missed. Hank&apos;s phone never rings either. What a test call DOES do is the production path: the same voice and timing, the recording, the transcript and the AI analysis, all on its own page under Recent test calls.
      </div>
    </div>
  );
}
