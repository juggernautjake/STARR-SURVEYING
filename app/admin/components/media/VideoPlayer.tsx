'use client';
// app/admin/components/media/VideoPlayer.tsx — the one video player, for every viewer.
//
// Owner, 2026-11-09: "I need the video player to stay open and keep its place in the video until
// the user clicks the x button on the modal. Also, we need better video controls like changing the
// speed of the videos and stuff."
//
// The browser's own controls stay (the scrub bar, volume, fullscreen). Under them, a bar of what
// those don't give you in one click:
//
//   −10 s · −1 frame · play/pause · +1 frame · +10 s · time · speed (0.25×–3×) · loop · picture-in-picture
//
// Keys (ignored while typing in a field): Space or K play/pause · J / L ∓10 s · ← / → ∓5 s ·
// , / . one frame (pauses) · < / > slower / faster.
//
// KEEPING ITS PLACE: the position is saved (lib/viewers/video-memory.ts) as it plays, on pause and
// when the page is hidden, and picked up again when the same video opens — so a viewer that is
// redrawn for any reason comes back where it was. The source is held for the life of the file: a
// re-signed URL for the SAME file (a reload of the folder) no longer swaps the src and starts the
// video over; the new one is only used if the old one stops working.

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, RotateCw, StepBack, StepForward, Repeat, PictureInPicture2 } from 'lucide-react';
import {
  SPEEDS, SKIP_SECONDS, NUDGE_SECONDS, FRAME_SECONDS,
  stepSpeed, formatClock, resumePoint, clampTime,
  savePosition, loadPosition, saveSpeed, loadSpeed,
} from '@/lib/viewers/video-memory';
import './VideoPlayer.css';

export interface VideoPlayerHandle {
  /** Jump to a time (seconds). Used by a transcript to go to a word. */
  seekTo(seconds: number): void;
  currentTime(): number;
}

export interface VideoPlayerProps {
  src: string;
  /** What the video's place is remembered under (lib/viewers/video-memory videoKey). */
  storageKey: string;
  poster?: string;
  autoPlay?: boolean;
  /** Keyboard shortcuts on (default). Off when something else on screen owns the keys. */
  keyboard?: boolean;
  className?: string;
  onTimeUpdate?: (seconds: number) => void;
}

const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { src, storageKey, poster, autoPlay = false, keyboard = true, className, onTimeUpdate },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // The source for THIS file, held while it is open (see the header).
  // Callers mount one player per file (`key={file id}`), so the key never changes under a live player.
  const [playSrc, setPlaySrc] = useState(src);
  const keyRef = useRef(storageKey);
  const latestSrc = useRef(src);
  latestSrc.current = src;

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [loop, setLoop] = useState(false);
  const [pipOk, setPipOk] = useState(false);
  useEffect(() => {
    setSpeedState(loadSpeed());
    setPipOk(typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && Boolean(document.pictureInPictureEnabled));
  }, []);

  // Saving waits until the video has loaded and been put back where it was — before that its time is
  // 0, and saving it would wipe the place it is about to return to. The last time seen is kept apart
  // from the element because React detaches the element before the unmount cleanup runs.
  const readyRef = useRef(false);
  const lastTimeRef = useRef<number | null>(null);
  const save = useCallback(() => {
    if (!readyRef.current) return;
    const t = videoRef.current?.currentTime ?? lastTimeRef.current;
    if (t !== null && t !== undefined && Number.isFinite(t)) { lastTimeRef.current = t; savePosition(keyRef.current, t); }
  }, []);

  // ── speed: applied on every load too, because loading resets playbackRate to the default ──
  const applySpeed = useCallback((s: number) => {
    const v = videoRef.current;
    if (v) { v.defaultPlaybackRate = s; v.playbackRate = s; }
  }, []);
  const setSpeed = useCallback((s: number) => { setSpeedState(s); saveSpeed(s); applySpeed(s); }, [applySpeed]);
  useEffect(() => { applySpeed(speed); }, [speed, applySpeed]);

  // ── pick up where it was ──
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    applySpeed(speed);
    // A reload of a source that was already playing (onError below) returns to where it got to.
    const at = resumePoint(lastTimeRef.current ?? loadPosition(keyRef.current), v.duration);
    if (at > 0) v.currentTime = at;
    lastTimeRef.current = at;
    readyRef.current = true;
  };

  // ── save as it plays (about once a second), on pause, when hidden, and on the way out ──
  const lastSaved = useRef(0);
  const onTime = () => {
    const v = videoRef.current;
    if (!v) return;
    setTime(v.currentTime);
    if (readyRef.current) lastTimeRef.current = v.currentTime;
    onTimeUpdate?.(v.currentTime);
    const now = Date.now();
    if (now - lastSaved.current > 1000) { lastSaved.current = now; save(); }
  };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [save]);

  // A signed URL can run out (two hours). If this one stops working and a newer one has arrived for
  // the same file, switch to it; onLoadedMetadata puts the video back where it was.
  const onError = () => {
    if (latestSrc.current && latestSrc.current !== playSrc) { save(); readyRef.current = false; setPlaySrc(latestSrc.current); }
  };

  // ── the controls ──
  const seekBy = useCallback((dt: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = clampTime(v.currentTime + dt, v.duration);
    save();
  }, [save]);
  const frame = useCallback((dir: 1 | -1) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = clampTime(v.currentTime + dir * FRAME_SECONDS, v.duration);
  }, []);
  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) void v.play().catch(() => { /* the browser refused (no user gesture); the button still shows Play */ });
    else v.pause();
  }, []);
  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch { /* not allowed here; nothing to undo */ }
  };

  useImperativeHandle(ref, () => ({
    seekTo: (s: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = clampTime(s, v.duration);
      save();
    },
    currentTime: () => videoRef.current?.currentTime ?? 0,
  }), [save]);

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          // Space on a focused button presses that button, and on the video itself the browser
          // already toggles it — handling it again would undo it.
          if (e.key === ' ' && (tag === 'BUTTON' || tag === 'VIDEO')) return;
          e.preventDefault(); toggle(); break;
        case 'j': case 'J': e.preventDefault(); seekBy(-SKIP_SECONDS); break;
        case 'l': case 'L': e.preventDefault(); seekBy(SKIP_SECONDS); break;
        case 'ArrowLeft': e.preventDefault(); seekBy(-NUDGE_SECONDS); break;
        case 'ArrowRight': e.preventDefault(); seekBy(NUDGE_SECONDS); break;
        case ',': e.preventDefault(); frame(-1); break;
        case '.': e.preventDefault(); frame(1); break;
        case '<': e.preventDefault(); setSpeed(stepSpeed(speed, -1)); break;
        case '>': e.preventDefault(); setSpeed(stepSpeed(speed, 1)); break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, toggle, seekBy, frame, setSpeed, speed]);

  return (
    <div className={`vp${className ? ` ${className}` : ''}`}>
      <video
        ref={videoRef}
        className="vp__video"
        src={playSrc}
        poster={poster}
        // `metadata`, not `auto` (owner, 2026-09-19): a 400 MB drone clip must not start downloading
        // in full the moment it is opened.
        preload="metadata"
        controls
        playsInline
        autoPlay={autoPlay}
        loop={loop}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={() => setDuration(videoRef.current?.duration ?? 0)}
        onTimeUpdate={onTime}
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); save(); }}
        onSeeked={save}
        onRateChange={() => { const r = videoRef.current?.playbackRate; if (r && r !== speed && (SPEEDS as readonly number[]).includes(r)) { setSpeedState(r); saveSpeed(r); } }}
        onError={onError}
      />
      <div className="vp__bar" role="toolbar" aria-label="Video controls">
        <button type="button" className="vp__btn" onClick={() => seekBy(-SKIP_SECONDS)} title="Back 10 seconds (J)" aria-label="Back 10 seconds">
          <RotateCcw size={16} aria-hidden="true" /><span className="vp__btn-n">10</span>
        </button>
        <button type="button" className="vp__btn" onClick={() => frame(-1)} title="Back one frame (,)" aria-label="Back one frame">
          <StepBack size={16} aria-hidden="true" />
        </button>
        <button type="button" className="vp__btn vp__btn--play" onClick={toggle} title={playing ? 'Pause (Space)' : 'Play (Space)'} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="vp__btn" onClick={() => frame(1)} title="Forward one frame (.)" aria-label="Forward one frame">
          <StepForward size={16} aria-hidden="true" />
        </button>
        <button type="button" className="vp__btn" onClick={() => seekBy(SKIP_SECONDS)} title="Forward 10 seconds (L)" aria-label="Forward 10 seconds">
          <RotateCw size={16} aria-hidden="true" /><span className="vp__btn-n">10</span>
        </button>
        <span className="vp__time" aria-live="off">{formatClock(time)} / {formatClock(duration)}</span>
        <label className="vp__speed" title="Playback speed (< slower, > faster)">
          <span className="vp__speed-label">Speed</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <button type="button" className={`vp__btn${loop ? ' vp__btn--on' : ''}`} onClick={() => setLoop((l) => !l)} aria-pressed={loop} title="Loop" aria-label="Loop">
          <Repeat size={16} aria-hidden="true" />
        </button>
        {pipOk ? (
          <button type="button" className="vp__btn" onClick={() => void togglePip()} title="Picture in picture: keep watching in a small window over other programs" aria-label="Picture in picture">
            <PictureInPicture2 size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
});

export default VideoPlayer;
