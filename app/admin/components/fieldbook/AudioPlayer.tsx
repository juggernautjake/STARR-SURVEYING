// app/admin/components/fieldbook/AudioPlayer.tsx
// Custom audio player with play/pause, seek, volume, mute, download
'use client';

import { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
  src: string;
  name: string;
  duration?: number; // seconds
  onRemove?: () => void;
}

export default function AudioPlayer({ src, name, duration, onRemove }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function handleTimeUpdate() { setCurrentTime(audio!.currentTime); }
    function handleLoadedMeta() { if (audio!.duration && isFinite(audio!.duration)) setTotalDuration(audio!.duration); }
    function handleEnded() { setPlaying(false); setCurrentTime(0); }

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMeta);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMeta);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
    if (v > 0 && muted) setMuted(false);
  }

  function toggleMute() {
    const newMuted = !muted;
    setMuted(newMuted);
    if (audioRef.current) audioRef.current.muted = newMuted;
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = src;
    a.download = name || 'recording.webm';
    a.click();
  }

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="fb-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button className="fb-audio-player__play" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
        {playing ? '⏸' : '▶'}
      </button>

      <div className="fb-audio-player__track">
        <div className="fb-audio-player__name">{name}</div>
        <div className="fb-audio-player__seek-wrap">
          <input
            type="range"
            className="fb-audio-player__seek"
            min={0}
            max={totalDuration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            style={{ backgroundSize: `${progress}% 100%` }}
          />
          <span className="fb-audio-player__times">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>
      </div>

      <div className="fb-audio-player__controls">
        <button className="fb-audio-player__mute" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
          {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
        </button>
        <input
          type="range"
          className="fb-audio-player__volume"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={handleVolume}
          title="Volume"
        />
        <button className="fb-audio-player__download" onClick={handleDownload} title="Download">
          ⬇
        </button>
        {onRemove && (
          <button className="fb-audio-player__remove" onClick={onRemove} title="Remove">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
