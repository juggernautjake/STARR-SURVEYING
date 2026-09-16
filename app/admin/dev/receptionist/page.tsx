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
    fetch('/api/admin/calls?limit=100').then((r) => r.json()).then((j: { calls?: PhoneCall[] }) => setTests((j.calls ?? []).filter((c) => c.is_test))).catch((e: Error) => reportPageError(e));
  }, [reportPageError]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 10_000); return () => clearInterval(t); }, [refresh]);

  // ── which receptionist answers LIVE calls, and which one a test call runs ──────────────────────
  const [live, setLive] = useState<{ version: ReceptionistVersion; voice: string | null; updatedBy: string | null; updatedAt: string | null; elevenLabsReady?: boolean } | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [confirmAgent, setConfirmAgent] = useState(false);
  const [testVersion, setTestVersion] = useState<TestVersion>('agent');
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
      setConfirmAgent(false);
    } catch (e) {
      reportPageError(e as Error);
    } finally {
      setLiveBusy(false);
    }
  };
  const setLiveVersion = (version: ReceptionistVersion) => saveLive({ version });

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
            <p className="rtest__status">Voice: <b>{(RECEPTIONIST_VOICES.find((v) => v.id === (live.voice ?? DEFAULT_VOICE_ID)) ?? RECEPTIONIST_VOICES[0]).name}</b></p>
            {live.updatedBy && <small className="rtest__status">Set by {live.updatedBy}{live.updatedAt ? ` · ${fmtWhen(live.updatedAt)}` : ''}</small>}
            <div className="rtest__row">
              {live.version === 'agent' ? (
                <button type="button" className="rtest__btn" onClick={() => void setLiveVersion('answering-machine')} disabled={liveBusy} data-testid="rtest-live-machine">
                  Switch live calls back to the answering machine
                </button>
              ) : confirmAgent ? (
                <>
                  <span className="rtest__status">Real customers will talk to the full AI agent. Only do this once it sounds right on test calls.</span>
                  <button type="button" className="rtest__btn rtest__btn--danger" onClick={() => void setLiveVersion('agent')} disabled={liveBusy} data-testid="rtest-live-agent-confirm">Yes, use the full agent on live calls</button>
                  <button type="button" className="rtest__btn rtest__btn--ghost" onClick={() => setConfirmAgent(false)} disabled={liveBusy}>Cancel</button>
                </>
              ) : (
                <button type="button" className="rtest__btn rtest__btn--ghost" onClick={() => setConfirmAgent(true)} disabled={liveBusy} data-testid="rtest-live-agent">
                  Put the full AI agent on live calls…
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── WHICH VERSION A TEST CALL RUNS ── */}
      <section className="rtest__card" aria-labelledby="rt-version">
        <h2 id="rt-version">Version to test</h2>
        <div className="rtest__versions" role="radiogroup" aria-labelledby="rt-version">
          {(['agent', 'answering-machine', ...(live?.elevenLabsReady ? ['elevenlabs' as const] : [])] as TestVersion[]).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={testVersion === v}
              className={`rtest__version${testVersion === v ? ' rtest__version--on' : ''}`}
              onClick={() => setTestVersion(v)}
              data-testid={`rtest-version-${v}`}
            >
              <b>{TEST_VERSION_LABELS[v].name}</b>
              <span>{TEST_VERSION_LABELS[v].blurb}</span>
              {live?.version === v && <em className="pill">Live now</em>}
            </button>
          ))}
        </div>
        <p>Browser and phone test calls below run this version. The text chat always talks to the full agent.{live && !live.elevenLabsReady ? ' The ElevenLabs agent appears here once ELEVENLABS_SIP_URI is set.' : ''}</p>

        <h3 className="rtest__subhead">Voice</h3>
        <div className="rtest__row">
          <select className="rtest__input" value={testVoice} onChange={(e) => chooseVoice(e.target.value)} aria-label="Voice to test" data-testid="rtest-voice">
            {(['ElevenLabs', 'Google', 'Amazon'] as const).map((prov) => (
              <optgroup key={prov} label={prov === 'ElevenLabs' ? 'ElevenLabs (most natural, used by the live agent)' : prov === 'Google' ? 'Google Chirp 3 HD (no extra bill)' : 'Amazon Polly generative'}>
                {RECEPTIONIST_VOICES.filter((v) => v.provider === prov).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </optgroup>
            ))}
          </select>
          {voice.sample && <a className="rtest__btn rtest__btn--ghost" href={voice.sample} target="_blank" rel="noreferrer">Hear samples ↗</a>}
          <button
            type="button"
            className="rtest__btn rtest__btn--ghost"
            onClick={() => void saveLive({ voice: testVoice })}
            disabled={liveBusy || live?.voice === testVoice}
            data-testid="rtest-voice-live"
          >
            {live?.voice === testVoice ? 'This is the live voice' : 'Use this voice on live calls'}
          </button>
        </div>
        <p>{voice.blurb}{voice.provider === 'ElevenLabs' ? ' The answering machine speaks through Twilio, which has no ElevenLabs voices, so it uses the closest Google voice.' : ''}</p>
      </section>

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
          <p>The same brain by keyboard: try a quote, a land-law question, or a full intake. Each reply shows how long the first word took, which is what a caller feels.</p>
          <div className="rtest__chat" ref={chatBox} aria-live="polite">
            {msgs.length === 0 && <div className="rtest__msg rtest__msg--assistant">Ellie: Hi, thanks for calling Starr Surveying. You can leave a message, or ask me anything. Type below to start.</div>}
            {msgs.map((m, i) => (
              <div key={i} className={`rtest__msg rtest__msg--${m.role}`}>
                {m.text || (m.role === 'assistant' ? <span className="rtest__typing" aria-label="Ellie is replying"><i /><i /><i /></span> : '')}
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
