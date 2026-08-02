'use client';
// app/AndrewAsh/_ui/AudioPlayer.tsx — the demo reel player.
//
// The single most important interactive element on a voice actor's site. A casting director's whole
// visit can be: land, press play, decide. So it has to work on the first tap, on a phone, without a
// layout shift, and it must not make the visitor download four reels to render its own decoration.
//
// ── THE WAVEFORM IS SYNTHETIC, AND THAT IS THE CORRECT TRADE ────────────────────────────────────
//
// A real waveform requires decoding the audio, which means fetching every reel on the page at load —
// several megabytes to draw a picture the visitor has not asked to hear yet. Instead the bars are
// generated from a hash of the track title: deterministic, so the server and the client render the
// same thing (a `Math.random()` waveform hydration-mismatches on every load), stable, so a reel looks
// the same on every visit, and distinct per track, so the four reels do not look copy-pasted. It
// scrubs exactly like a real one because the scrub target is the element's width, not the audio.
//
// ── ONE PLAYER AT A TIME ────────────────────────────────────────────────────────────────────────
//
// Four reels on a page means four <audio> elements, and browsers happily play all of them at once.
// A module-level registry pauses the previous player when a new one starts, which is what every
// visitor already expects and nobody thinks about until it is missing.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Pause, Play } from 'lucide-react';

const BAR_COUNT = 56;

/** Deterministic pseudo-random bar heights from a string.
 *
 *  A 32-bit FNV-style hash advanced per bar. Cheap, stable across server and client, and the
 *  shaping (a floor of 18% plus an envelope that dips at the edges) is what stops it looking like
 *  noise and makes it read as a recorded take. */
export function waveformBars(seed: string, count = BAR_COUNT): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h |= 0;
    const unit = ((h >>> 0) % 1000) / 1000;
    // Envelope: quieter at the very start and end, fullest in the middle.
    const position = i / (count - 1);
    const envelope = 0.55 + 0.45 * Math.sin(Math.PI * position);
    bars.push(Math.round((18 + unit * 82) * envelope));
  }
  return bars;
}

export function formatTime(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds as number) || (seconds as number) < 0) return '0:00';
  const total = Math.floor(seconds as number);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Module-level, not React state: the players are siblings with no common parent that owns this.
const registry = new Set<() => void>();

interface Props {
  title: string;
  subtitle?: string | null;
  src?: string | null;
  /** Used for the time display before the audio has loaded, so the row does not resize on play. */
  durationHint?: number | null;
  downloadable?: boolean;
  traits?: string[];
}

export default function AudioPlayer({
  title,
  subtitle,
  src,
  durationHint,
  downloadable = false,
  traits = [],
}: Props): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(durationHint ?? null);
  const [failed, setFailed] = useState(false);

  const bars = useMemo(() => waveformBars(title || 'untitled'), [title]);
  const hasAudio = Boolean(src) && !failed;

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  useEffect(() => {
    registry.add(pause);
    return () => {
      registry.delete(pause);
    };
  }, [pause]);

  const toggle = useCallback(async () => {
    const el = audioRef.current;
    if (!el || !hasAudio) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    // Stop everyone else first, including this player's own stale registration.
    registry.forEach((stop) => {
      if (stop !== pause) stop();
    });
    try {
      setLoading(true);
      await el.play();
      setPlaying(true);
    } catch {
      // A rejected play() is almost always an autoplay-policy refusal or a missing file. Neither is
      // worth an alert; the button simply does not latch, and a broken src flips to the "unavailable"
      // state via the error handler below.
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  }, [hasAudio, pause, playing]);

  const scrubTo = useCallback(
    (clientX: number) => {
      const el = audioRef.current;
      const wave = waveRef.current;
      if (!el || !wave || !duration) return;
      const rect = wave.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      el.currentTime = ratio * duration;
      setCurrent(el.currentTime);
    },
    [duration],
  );

  const progress = duration && duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
  const playedBars = Math.round(progress * bars.length);

  return (
    <div className={`vaPlayer${playing ? ' vaPlayerActive' : ''}`}>
      <button
        type="button"
        className="vaPlayBtn"
        onClick={toggle}
        disabled={!hasAudio}
        aria-label={hasAudio ? (playing ? `Pause ${title}` : `Play ${title}`) : `${title} — not yet available`}
      >
        {loading ? (
          // `vaSpin` lives in voice.css, not in a styled-jsx block: styled-jsx scopes its keyframe
          // names, and the element being animated here is rendered by lucide-react — outside this
          // component's scope — so a scoped name would resolve to nothing and the spinner would
          // silently sit still.
          <Loader2 size={20} aria-hidden="true" className="vaSpin" />
        ) : playing ? (
          <Pause size={20} aria-hidden="true" />
        ) : (
          // Nudged right by a pixel: a triangle centred on its bounding box looks left-of-centre
          // inside a circle.
          <Play size={20} aria-hidden="true" style={{ marginLeft: 2 }} />
        )}
      </button>

      <div className="vaPlayerMain">
        <p className="vaPlayerTitle">{title}</p>
        {(subtitle || traits.length > 0) && (
          <p className="vaPlayerMeta">
            {subtitle}
            {subtitle && traits.length > 0 ? ' · ' : ''}
            {traits.join(' · ')}
          </p>
        )}

        {/* The scrubber is a slider for assistive technology and a click target for everyone else.
            role + aria-valuenow rather than an <input type=range> because a range input cannot be
            styled into a waveform in Safari without hiding it entirely. */}
        <div
          ref={waveRef}
          className={`vaWave${hasAudio ? '' : ' vaWaveDisabled'}`}
          onClick={(e) => hasAudio && scrubTo(e.clientX)}
          role={hasAudio ? 'slider' : undefined}
          tabIndex={hasAudio ? 0 : undefined}
          aria-label={hasAudio ? `Seek within ${title}` : undefined}
          aria-valuemin={hasAudio ? 0 : undefined}
          aria-valuemax={hasAudio ? Math.round(duration ?? 0) : undefined}
          aria-valuenow={hasAudio ? Math.round(current) : undefined}
          aria-valuetext={hasAudio ? `${formatTime(current)} of ${formatTime(duration)}` : undefined}
          onKeyDown={(e) => {
            const el = audioRef.current;
            if (!el || !hasAudio) return;
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              el.currentTime = Math.min(el.duration || 0, el.currentTime + 5);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              el.currentTime = Math.max(0, el.currentTime - 5);
            } else if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              void toggle();
            }
          }}
        >
          {bars.map((height, i) => (
            <span
              key={i}
              className={`vaWaveBar${i < playedBars ? ' vaWaveBarPlayed' : ''}`}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>

      {hasAudio ? (
        <span className="vaPlayerTime">
          {formatTime(current)} / {formatTime(duration)}
        </span>
      ) : (
        <span className="vaPlayerSoon">{failed ? 'Unavailable' : 'Coming soon'}</span>
      )}

      {hasAudio && downloadable && src && (
        <a
          href={src}
          download
          className="vaBtnGhost vaBtn vaBtnSm"
          aria-label={`Download ${title}`}
          style={{ flex: 'none' }}
        >
          <Download size={15} aria-hidden="true" />
        </a>
      )}

      {src && (
        <audio
          ref={audioRef}
          src={src}
          // Metadata only. `preload="auto"` on a page with four reels downloads all four before the
          // visitor has decided to listen to any.
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = (e.currentTarget as HTMLAudioElement).duration;
            if (Number.isFinite(d)) setDuration(d);
          }}
          onTimeUpdate={(e) => setCurrent((e.currentTarget as HTMLAudioElement).currentTime)}
          onEnded={() => {
            setPlaying(false);
            setCurrent(0);
          }}
          onError={() => {
            setFailed(true);
            setPlaying(false);
          }}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        />
      )}
    </div>
  );
}
