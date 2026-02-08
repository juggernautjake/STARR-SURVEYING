// app/admin/components/fieldbook/AudioRecorder.tsx
// Audio recording widget: requests mic permission, records up to 5 minutes,
// produces a blob URL. Parent handles saving.
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  maxDurationSeconds?: number;
}

export default function AudioRecorder({ onRecordingComplete, maxDurationSeconds = 300 }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef = useRef<number>(0);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
        onRecordingComplete(blob, duration);

        // Stop all tracks to release the mic
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        setElapsed(0);
        if (timerRef.current) clearInterval(timerRef.current);
      };

      startTimeRef.current = Date.now();
      mediaRecorder.start(250); // Collect data every 250ms
      setRecording(true);
      setPermissionDenied(false);

      // Timer
      timerRef.current = setInterval(() => {
        const secs = Math.round((Date.now() - startTimeRef.current) / 1000);
        setElapsed(secs);

        // Auto-stop at max duration
        if (secs >= maxDurationSeconds) {
          mediaRecorder.stop();
        }
      }, 500);
    } catch {
      setPermissionDenied(true);
    }
  }, [onRecordingComplete, maxDurationSeconds]);

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="fb-audio-recorder">
      {!recording ? (
        <button className="fb-audio-recorder__btn fb-audio-recorder__btn--start" onClick={startRecording} title="Record audio (5 min max)">
          🎙️ Record
        </button>
      ) : (
        <div className="fb-audio-recorder__active">
          <span className="fb-audio-recorder__pulse" />
          <span className="fb-audio-recorder__time">{formatTime(elapsed)} / {formatTime(maxDurationSeconds)}</span>
          <button className="fb-audio-recorder__btn fb-audio-recorder__btn--stop" onClick={stopRecording}>
            ⏹ Stop
          </button>
        </div>
      )}
      {permissionDenied && (
        <span className="fb-audio-recorder__error">Mic access denied. Please allow microphone access in your browser settings.</span>
      )}
    </div>
  );
}
