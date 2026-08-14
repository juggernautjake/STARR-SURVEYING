// app/admin/jobs/[id]/BriefingRecorder.tsx — slice B2 of
// docs/planning/completed/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// Owner, 2026-08-13: *"I also want my dad to be able to take screen recordings and talk at the same
// time so that he can go over everything with the given job and post the video so I can watch it on
// my own time."*
//
// ── THE MIC AND THE SCREEN ARE TWO DIFFERENT STREAMS (D3) ───────────────────────────────────────
//
// `getDisplayMedia({ audio: true })` gives you *system* audio — what the computer is playing. It
// does NOT give you the voice. Ask for it and stop there and you get a recording that looks
// completely fine and has no narration on it, which is the exact bug this feature cannot afford,
// because it is discovered after the forty minutes of talking.
//
// Both are wanted — he may play a call recording or a video while narrating over it — so the two
// tracks are mixed through an `AudioContext` and the recorder is handed ONE audio track. Mixing is
// not optional plumbing: `MediaRecorder` records the first audio track and ignores the rest, so
// simply adding both to the stream also loses the voice, more subtly.
//
// ── STOPPING THE SHARE IS A WAY OF STOPPING THE RECORDING ───────────────────────────────────────
//
// Every browser puts its own "Stop sharing" bar on screen during a capture, and it is the control
// people actually reach for. If we do not listen for it, the share ends, the recorder keeps running
// against a dead track, and the file that results is a black rectangle. The `ended` listener below
// is what makes that button mean what it looks like it means.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Video, Square, Pause, Play, Trash2, MonitorPlay, Mic, MicOff, AlertTriangle } from 'lucide-react';
import {
  pickRecorderMimeType, readRecorderSupport, formatDuration, formatBytes,
  projectRecordingSize, recordingFileName,
} from '@/lib/jobs/recorder';
import { BUCKET_LIMIT_BYTES, BRIEFING_BUCKETS } from '@/lib/jobs/briefings';

export interface RecordedTake {
  blob: Blob;
  fileName: string;
  mimeType: string;
  durationSeconds: number;
}

interface Props {
  /** Names the file, so the job folder does not fill with `Screen Recording.webm`. */
  jobNumber?: string | null;
  /** Called when the author keeps a take. The parent uploads it (B3). */
  onKeep: (take: RecordedTake) => void;
  disabled?: boolean;
}

const VIDEO_LIMIT = BUCKET_LIMIT_BYTES[BRIEFING_BUCKETS.video]!;
/** Project the size out to an hour. A job walkthrough runs long; projecting to five minutes would
 *  always look safe and never warn anybody. */
const PROJECT_TO_SECONDS = 3600;
/** One chunk a second. Small enough that the size counter moves visibly, large enough that a long
 *  recording does not accumulate thousands of array entries. */
const CHUNK_MS = 1000;

type Phase = 'idle' | 'recording' | 'paused' | 'review';

export default function BriefingRecorder({ jobNumber, onKeep, disabled }: Props) {
  const [support, setSupport] = useState<{ supported: boolean; reason: string } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [wantMic, setWantMic] = useState(true);
  const [wantSystemAudio, setWantSystemAudio] = useState(true);
  /** Set when the mic was asked for and refused. The recording still happens — losing the screen
   *  capture because a microphone is unplugged would be worse — but it is said out loud, because a
   *  silent video discovered on playback is the failure this whole component is arranged around. */
  const [micFailed, setMicFailed] = useState<string | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [take, setTake] = useState<RecordedTake | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Refs, not state: these are torn down from a cleanup that must see the CURRENT values, and a
  // stale closure over a MediaStream leaks a live screen capture — the browser keeps showing "this
  // page is sharing your screen" for a recording that ended.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livePreviewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => { setSupport(readRecorderSupport()); }, []);

  /** Release everything. Safe to call twice — it is called on stop AND on unmount, and a half-torn
   *  recorder is worse than a redundant teardown. */
  const teardown = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    for (const s of [displayStreamRef.current, micStreamRef.current, mixedStreamRef.current]) {
      s?.getTracks().forEach((t) => { try { t.stop(); } catch { /* already stopped */ } });
    }
    displayStreamRef.current = null;
    micStreamRef.current = null;
    mixedStreamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => { /* already closed */ });
      audioCtxRef.current = null;
    }
    if (livePreviewRef.current) livePreviewRef.current.srcObject = null;
  }, []);

  useEffect(() => () => {
    teardown();
    // The object URL outlives the component otherwise, holding a 120 MB blob in memory for the rest
    // of the session.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [teardown, previewUrl]);

  const start = async () => {
    setError(null);
    setMicFailed(null);
    chunksRef.current = [];
    setBytes(0);
    setElapsed(0);
    accumulatedRef.current = 0;

    try {
      // Ask for the screen FIRST. It is the request that shows a picker the user can cancel, and
      // asking for the microphone first means a cancelled screen-share has already lit the mic
      // indicator for a recording that never starts.
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        // System audio. Chrome and Edge honour it for a tab or the whole screen; Firefox ignores it.
        // Either way it is not the voice — see the header.
        audio: wantSystemAudio,
      });
      displayStreamRef.current = display;

      let mic: MediaStream | null = null;
      if (wantMic) {
        try {
          mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          micStreamRef.current = mic;
        } catch (e) {
          // Deliberately not fatal, and deliberately loud. See `micFailed`.
          setMicFailed(
            e instanceof Error && e.name === 'NotAllowedError'
              ? 'The microphone was blocked, so this recording will have no voice on it. Allow the mic in the address bar and start again if you meant to narrate.'
              : 'No microphone was available, so this recording will have no voice on it.',
          );
        }
      }

      const mimeType = pickRecorderMimeType((t) => MediaRecorder.isTypeSupported(t));
      if (!mimeType) {
        teardown();
        setError('This browser cannot encode video in any format we can play back. Try Chrome, Edge or Firefox.');
        return;
      }

      // ── the mix (D3) ──
      const videoTrack = display.getVideoTracks()[0];
      if (!videoTrack) {
        teardown();
        setError('No screen was captured. Pick a screen, window or tab when the browser asks.');
        return;
      }
      const systemAudio = display.getAudioTracks();
      const micAudio = mic?.getAudioTracks() ?? [];
      const mixed = new MediaStream([videoTrack]);

      if (systemAudio.length > 0 && micAudio.length > 0) {
        // Two sources, one track. A `MediaStreamDestination` is a node whose output is a track, so
        // both go into a gain-free graph and one comes out. This is the case the naive version gets
        // wrong: adding both tracks to the stream records only the first.
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        ctx.createMediaStreamSource(new MediaStream(systemAudio)).connect(dest);
        ctx.createMediaStreamSource(new MediaStream(micAudio)).connect(dest);
        dest.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));
      } else {
        // Only one source — no graph needed, and not building one avoids an AudioContext that some
        // browsers start suspended and never resume without a gesture.
        [...systemAudio, ...micAudio].forEach((t) => mixed.addTrack(t));
      }
      mixedStreamRef.current = mixed;

      // The browser's own "Stop sharing" bar. Without this the share ends and the recorder keeps
      // writing a black rectangle.
      videoTrack.addEventListener('ended', () => { stop(); });

      const rec = new MediaRecorder(mixed, { mimeType, videoBitsPerSecond: 2_500_000 });
      recorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
          setBytes((b) => b + ev.data.size);
        }
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const seconds = Math.round(accumulatedRef.current / 1000);
        chunksRef.current = [];
        teardown();
        if (blob.size === 0) {
          setError('Nothing was recorded. If the screen share was cancelled, start again and pick a screen.');
          setPhase('idle');
          return;
        }
        const t: RecordedTake = {
          blob,
          fileName: recordingFileName(jobNumber, new Date(), mimeType),
          mimeType,
          durationSeconds: seconds,
        };
        setTake(t);
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase('review');
      };
      rec.onerror = () => {
        setError('The recording stopped unexpectedly. Whatever was captured up to that point is kept.');
      };

      rec.start(CHUNK_MS);
      startedAtRef.current = Date.now();
      setPhase('recording');
      if (livePreviewRef.current) livePreviewRef.current.srcObject = mixed;

      tickRef.current = setInterval(() => {
        setElapsed(Math.round((accumulatedRef.current + (Date.now() - startedAtRef.current)) / 1000));
      }, 500);
    } catch (e) {
      teardown();
      // A cancelled picker is not an error worth shouting about — it is somebody changing their mind.
      if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
        setPhase('idle');
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setPhase('idle');
    }
  };

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    // Bank the elapsed time before stopping: `onstop` reads it, and if the recorder was paused the
    // clock has already been banked once, so re-adding the wall time would double-count.
    if (rec.state === 'recording') accumulatedRef.current += Date.now() - startedAtRef.current;
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    try { rec.stop(); } catch { /* already stopping */ }
    recorderRef.current = null;
  }, []);

  const pause = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording') return;
    rec.pause();
    accumulatedRef.current += Date.now() - startedAtRef.current;
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    setPhase('paused');
  };

  const resume = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'paused') return;
    rec.resume();
    startedAtRef.current = Date.now();
    setPhase('recording');
    tickRef.current = setInterval(() => {
      setElapsed(Math.round((accumulatedRef.current + (Date.now() - startedAtRef.current)) / 1000));
    }, 500);
  };

  const discard = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setTake(null);
    setBytes(0);
    setElapsed(0);
    setPhase('idle');
  };

  const keep = () => {
    if (!take) return;
    onKeep(take);
    // The parent owns the blob now; releasing the preview URL here would break its own playback if
    // it renders one, so only the local view is reset.
    setPreviewUrl(null);
    setTake(null);
    setBytes(0);
    setElapsed(0);
    setPhase('idle');
  };

  if (support && !support.supported) {
    return (
      <div style={bandStyle} role="note">
        <MonitorPlay size={15} style={{ verticalAlign: '-3px', marginRight: '0.4rem' }} />
        {support.reason}
      </div>
    );
  }

  const projection = projectRecordingSize({
    bytesSoFar: bytes,
    elapsedSeconds: elapsed,
    projectToSeconds: PROJECT_TO_SECONDS,
    limitBytes: VIDEO_LIMIT,
  });

  return (
    <div style={wrapStyle}>
      {error && <p className="admin-error" role="alert" style={{ marginTop: 0 }}>{error}</p>}

      {phase === 'idle' && (
        <>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
            <label style={checkRow}>
              <input type="checkbox" checked={wantMic} onChange={(e) => setWantMic(e.target.checked)} />
              {wantMic ? <Mic size={13} /> : <MicOff size={13} />}
              Record my voice
            </label>
            <label style={checkRow}>
              <input type="checkbox" checked={wantSystemAudio} onChange={(e) => setWantSystemAudio(e.target.checked)} />
              Also record what the computer is playing
            </label>
          </div>
          <button type="button" style={recordBtn} disabled={disabled} onClick={() => void start()}>
            <Video size={14} />Record my screen
          </button>
          <p style={hintStyle}>
            You will be asked which screen, window or tab to share. Talk over it as you go — the
            browser’s own “Stop sharing” button finishes the recording, and you can watch it back
            before deciding to keep it.
          </p>
        </>
      )}

      {(phase === 'recording' || phase === 'paused') && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
            <span style={dotStyle(phase === 'recording')} aria-hidden />
            <strong style={{ fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(elapsed)}
            </strong>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              {phase === 'paused' ? 'Paused' : 'Recording'} · {formatBytes(bytes)}
              {projection.projectedBytes !== null && (
                <> · about {formatBytes(projection.projectedBytes)} if you talk for an hour</>
              )}
            </span>
          </div>

          {/* The number is on screen while he decides, which is the whole reason a forty-minute
              recording surprises nobody. */}
          {projection.willExceedLimit && (
            <div role="alert" style={{ ...bandStyle, borderLeftColor: 'var(--color-warning)', marginTop: '0.6rem' }}>
              <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />
              At this rate this will pass the {formatBytes(VIDEO_LIMIT)} limit. Stop and post what you
              have, then record a second part — a briefing can hold as many as you like.
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
            {phase === 'recording' ? (
              <button type="button" style={ghostBtn} onClick={pause}><Pause size={13} />Pause</button>
            ) : (
              <button type="button" style={ghostBtn} onClick={resume}><Play size={13} />Resume</button>
            )}
            <button type="button" style={stopBtn} onClick={stop}><Square size={13} />Stop</button>
          </div>

          {micFailed && (
            <div role="alert" style={{ ...bandStyle, borderLeftColor: 'var(--color-warning)', marginTop: '0.6rem' }}>
              <MicOff size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />{micFailed}
            </div>
          )}

          {/* Muted deliberately: an unmuted live preview of a capture that includes system audio
              feeds the speakers back into the microphone and howls. */}
          <video ref={livePreviewRef} autoPlay muted playsInline style={previewStyle} />
        </>
      )}

      {phase === 'review' && take && (
        <>
          <p style={{ ...hintStyle, marginTop: 0 }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>Watch it back before you keep it.</strong>{' '}
            {formatDuration(take.durationSeconds)} · {formatBytes(take.blob.size)}
            {take.blob.size > VIDEO_LIMIT && (
              <> — over the {formatBytes(VIDEO_LIMIT)} limit, so this one cannot be uploaded. Record it in shorter parts.</>
            )}
          </p>
          {previewUrl && <video src={previewUrl} controls style={previewStyle} />}
          {micFailed && (
            <div role="alert" style={{ ...bandStyle, borderLeftColor: 'var(--color-warning)', marginTop: '0.6rem' }}>
              <MicOff size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />{micFailed}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
            <button type="button" style={recordBtn} disabled={take.blob.size > VIDEO_LIMIT} onClick={keep}>
              Keep this recording
            </button>
            <button type="button" style={ghostBtn} onClick={discard}><Trash2 size={13} />Discard and re-record</button>
          </div>
        </>
      )}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 8,
  padding: '0.85rem 0.95rem', background: 'var(--color-surface)',
};
const previewStyle: React.CSSProperties = {
  display: 'block', width: '100%', maxHeight: 340, marginTop: '0.7rem',
  borderRadius: 6, background: '#000',
};
const hintStyle: React.CSSProperties = {
  fontSize: '0.8rem', color: 'var(--color-text-tertiary)', lineHeight: 1.5, marginTop: '0.6rem',
};
const checkRow: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
  fontSize: '0.83rem', color: 'var(--color-text-secondary)', cursor: 'pointer',
};
const bandStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderLeft: '4px solid var(--color-info)',
  borderRadius: 6, padding: '0.55rem 0.7rem', fontSize: '0.83rem', lineHeight: 1.45,
  color: 'var(--color-text-secondary)',
};
const recordBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
  border: '1px solid var(--color-brand-navy)', background: 'var(--color-brand-navy)',
  color: 'var(--color-text-on-brand)', borderRadius: 6, padding: '0.45rem 0.95rem',
  fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
};
const stopBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  border: '1px solid var(--color-danger)', background: 'var(--color-danger-surface)',
  color: 'var(--color-danger-text)', borderRadius: 6, padding: '0.35rem 0.8rem',
  fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text-primary)', borderRadius: 6, padding: '0.35rem 0.75rem',
  fontSize: '0.82rem', cursor: 'pointer',
};
function dotStyle(live: boolean): React.CSSProperties {
  return {
    width: 10, height: 10, borderRadius: 999, display: 'inline-block',
    background: live ? 'var(--color-danger)' : 'var(--color-text-tertiary)',
  };
}
