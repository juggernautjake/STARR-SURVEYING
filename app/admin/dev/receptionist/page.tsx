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
import '../../styles/AdminCalls.css';
import '../../styles/AdminReceptionistTest.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePageError } from '../../hooks/usePageError';
import type { PhoneCall } from '@/lib/receptionist/calls';
import type { CallState } from '@/lib/receptionist/state';

const RS = '';

type Msg = { role: 'caller' | 'assistant'; text: string; firstWordMs?: number | null; totalMs?: number };
type Device = { connect(opts: { params: Record<string, string> }): Promise<Call>; destroy(): void; on(ev: string, fn: (...a: unknown[]) => void): void };
type Call = { disconnect(): void; on(ev: string, fn: (...a: unknown[]) => void): void; parameters?: { CallSid?: string } };

const LABEL: Record<string, string> = { idle: 'Ready', 'getting token': 'Getting a token…', connecting: 'Connecting…', ended: 'Call ended', error: 'Could not connect' };
function fmtPhone(s: string): string {
  const d = (s ?? '').replace(/D/g, '');
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
      const call = await device.connect({ params: {} });
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
    const r = await fetch('/api/admin/receptionist-test/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: phone }) });
    const j = (await r.json()) as { callSid?: string; error?: string; to?: string };
    if (!r.ok || !j.callSid) { setPhoneStatus(`Failed: ${j.error ?? r.status}`); return; }
    setPhoneStatus(`Ringing ${j.to}. Answer it and talk to Ellie. The call appears below when it ends.`);
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
        <p>Talk to Ellie exactly as a customer would, without ringing Hank. Test calls are marked <span className="pill pill--test">Test</span> on the Calls page: they get the recording, transcript and AI analysis, but they never text or notify anyone and never create a lead.</p>
      </div>

      <div className="rtest__grid">
        <section className="rtest__card" aria-labelledby="rt-browser">
          <h2 id="rt-browser">Call from this browser</h2>
          <p>Uses your microphone and speakers. Same voice, same relay, same timing as the business line.</p>
          <div className="rtest__row">
            {browserStatus === 'in call' || browserStatus === 'connecting' ? (
              <button type="button" className="rtest__btn rtest__btn--danger" onClick={hangUp}>Hang up</button>
            ) : (
              <button type="button" className="rtest__btn" onClick={startBrowserCall} disabled={browserStatus === 'getting token'}>Start call</button>
            )}
            <span className={`rtest__status ${browserStatus === 'in call' ? 'rtest__status--live' : ''}`}>
              {browserStatus === 'in call' ? `In call · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : LABEL[browserStatus] ?? browserStatus}
            </span>
          </div>
          {browserErr && <div className="rtest__status rtest__status--err">{browserErr}</div>}
        </section>

        <section className="rtest__card" aria-labelledby="rt-phone">
          <h2 id="rt-phone">Call my phone</h2>
          <p>Twilio rings the number below from the business line and Ellie answers when you pick up.</p>
          <div className="rtest__row">
            <input id="rtest-phone" className="rtest__input" type="tel" inputMode="tel" placeholder="(254) 555-0100" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone number to call" />
            <button type="button" className="rtest__btn" onClick={callMyPhone} disabled={phone.replace(/\D/g, '').length < 10}>Call me</button>
          </div>
          {phoneStatus && <div className="rtest__status">{phoneStatus}</div>}
        </section>

        <section className="rtest__card" aria-labelledby="rt-chat" style={{ gridColumn: '1 / -1' }}>
          <h2 id="rt-chat">Text chat</h2>
          <p>The same brain by keyboard: try a quote, a land-law question, or a full intake. Each reply shows how long the first word took, which is what a caller feels.</p>
          <div className="rtest__chat" ref={chatBox} aria-live="polite">
            {msgs.length === 0 && <div className="rtest__msg rtest__msg--assistant">Ellie: Hi, thanks for calling Starr Surveying. You can leave a message, or ask me anything. Type below to start.</div>}
            {msgs.map((m, i) => (
              <div key={i} className={`rtest__msg rtest__msg--${m.role}`}>
                {m.text || '…'}
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
        What test mode changes: no texts, no bell notifications, no lead in the queue. Everything else, including the voice, the relay, quoting through the website calculator, the land-law answers and the recording, is the production path.
      </div>
    </div>
  );
}
