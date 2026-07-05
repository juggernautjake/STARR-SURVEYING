// app/admin/components/learn/MessageAudioPlayer.tsx
//
// Per-reply voice player for the AI tutor: play / pause, restart, skip ±10s, and
// a scrubber that shows position and lets you seek anywhere in the response.
// Uses the premium ElevenLabs MP3 (a real <audio> element supports seeking); if
// no premium provider is configured it degrades to a basic browser-voice
// play/stop (which can't be scrubbed). Audio is fetched lazily on first play and
// cached, so replays and seeks are instant.
'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Rewind, FastForward } from 'lucide-react';
import { speakableText, scriptToSpeech } from '@/lib/learn/speakable';

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function MessageAudioPlayer({
  text, script, active, onActivate, figureGroup,
}: {
  text: string;
  script?: string;      // purpose-built teaching narration; preferred over `text` when present
  active: boolean;      // is this the currently-playing message (others pause)
  onActivate: () => void; // called when this player starts (stops other audio)
  figureGroup?: number; // number half of figure labels (1 → "figure 1A"); matches the on-screen badge
}) {
  // What the voice actually says: the teaching script if we have one, else the
  // normalized display reply.
  const spoken = () => (script && script.trim() ? scriptToSpeech(script, { figureGroup }) : speakableText(text, { figureGroup }));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'browser' | 'error'>('idle');
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  // Pause when another message's player (or the global read-aloud) takes over.
  useEffect(() => {
    if (active) return;
    audioRef.current?.pause();
    setPlaying(false);
  }, [active]);

  // Clean up the blob + audio on unmount (e.g., when the chat closes).
  useEffect(() => () => {
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function ensureAudio(): Promise<HTMLAudioElement | null> {
    if (audioRef.current) return audioRef.current;
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/learn/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spoken() }),
      });
      if (!res.ok) { setStatus('browser'); return null; } // 503 → no premium provider
      const url = URL.createObjectURL(await res.blob());
      urlRef.current = url;
      const a = new Audio(url);
      const setD = () => setDur(Number.isFinite(a.duration) ? a.duration : 0);
      a.addEventListener('loadedmetadata', setD);
      a.addEventListener('durationchange', setD);
      a.addEventListener('timeupdate', () => setCur(a.currentTime));
      a.addEventListener('play', () => setPlaying(true));
      a.addEventListener('pause', () => setPlaying(false));
      a.addEventListener('ended', () => { setPlaying(false); a.currentTime = 0; setCur(0); });
      audioRef.current = a;
      setStatus('ready');
      return a;
    } catch { setStatus('error'); return null; }
  }

  async function togglePlay() {
    const a = await ensureAudio();
    if (!a) { toggleBrowser(); return; }
    if (a.paused) { onActivate(); await a.play().catch(() => {}); }
    else a.pause();
  }
  function restart() {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0; setCur(0); onActivate(); a.play().catch(() => {});
  }
  function seekTo(t: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t; setCur(t);
  }
  function skip(delta: number) {
    const a = audioRef.current;
    if (!a) return;
    seekTo(Math.max(0, Math.min(a.duration || 0, a.currentTime + delta)));
  }

  // Browser-voice fallback (no seeking possible — just play/stop).
  function toggleBrowser() {
    const ss = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!ss) { setStatus('error'); return; }
    if (playing) { ss.cancel(); setPlaying(false); return; }
    onActivate();
    ss.cancel();
    const u = new SpeechSynthesisUtterance(spoken());
    u.lang = 'en-US';
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    ss.speak(u);
    setPlaying(true);
  }

  if (status === 'error') return <div className="msg-audio msg-audio--err">Voice unavailable</div>;

  if (status === 'browser') {
    return (
      <div className="msg-audio">
        <button className="msg-audio__btn msg-audio__btn--primary" onClick={toggleBrowser}
          title={playing ? 'Stop' : 'Play (basic voice)'}>
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <span className="msg-audio__hint">basic voice — add a voice key for scrubbing</span>
      </div>
    );
  }

  const ready = status === 'ready';
  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <div className="msg-audio">
      <button className="msg-audio__btn msg-audio__btn--primary" onClick={togglePlay} disabled={status === 'loading'}
        title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'}>
        {status === 'loading' ? <span className="msg-audio__spin" /> : playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button className="msg-audio__btn" onClick={restart} disabled={!ready} title="Restart" aria-label="Restart"><RotateCcw size={12} /></button>
      <button className="msg-audio__btn" onClick={() => skip(-10)} disabled={!ready} title="Back 10s" aria-label="Back 10 seconds"><Rewind size={12} /></button>
      <input className="msg-audio__bar" type="range" min={0} max={dur || 0} step={0.1} value={cur}
        onChange={(e) => seekTo(Number(e.target.value))} disabled={!ready} aria-label="Seek"
        style={{ ['--pct' as string]: `${pct}%` } as React.CSSProperties} />
      <button className="msg-audio__btn" onClick={() => skip(10)} disabled={!ready} title="Forward 10s" aria-label="Forward 10 seconds"><FastForward size={12} /></button>
      <span className="msg-audio__time">{fmt(cur)} / {fmt(dur)}</span>
    </div>
  );
}
