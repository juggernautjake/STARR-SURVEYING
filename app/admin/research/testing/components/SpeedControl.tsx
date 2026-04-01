// SpeedControl.tsx — Standalone playback speed control component
'use client';

interface SpeedControlProps {
  speed: number;
  isPlaying: boolean;
  onSpeedChange: (speed: number) => void;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onJumpForward: () => void;
  onJumpBack: () => void;
  currentTime?: number;
  totalDuration?: number;
  compact?: boolean;
}

const SPEED_PRESETS = [0.1, 0.25, 0.5, 1, 2, 5, 10];

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const frac = Math.floor((ms % 1000) / 100);
  if (m > 0) return `${m}:${sec.toString().padStart(2, '0')}.${frac}`;
  return `${sec}.${frac}s`;
}

export default function SpeedControl({
  speed,
  isPlaying,
  onSpeedChange,
  onTogglePlay,
  onStepForward,
  onStepBack,
  onJumpForward,
  onJumpBack,
  currentTime,
  totalDuration,
  compact = false,
}: SpeedControlProps) {
  return (
    <div className={`speed-control ${compact ? 'speed-control--compact' : ''}`}>
      <div className="speed-control__playback">
        <button className="speed-control__btn" onClick={onJumpBack} title="Jump to previous event">
          ◀◀
        </button>
        <button className="speed-control__btn" onClick={onStepBack} title="Step back">
          ◀
        </button>
        <button
          className="speed-control__btn speed-control__btn--play"
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '▌▌' : '▶'}
        </button>
        <button className="speed-control__btn" onClick={onStepForward} title="Step forward">
          ▶
        </button>
        <button className="speed-control__btn" onClick={onJumpForward} title="Jump to next event">
          ▶▶
        </button>
        {currentTime !== undefined && totalDuration !== undefined && (
          <span className="speed-control__time">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        )}
      </div>

      <div className="speed-control__presets">
        <span className="speed-control__label">Speed:</span>
        {SPEED_PRESETS.map((preset) => (
          <button
            key={preset}
            className={`speed-control__preset ${speed === preset ? 'speed-control__preset--active' : ''}`}
            onClick={() => onSpeedChange(preset)}
          >
            {preset}x
          </button>
        ))}
      </div>
    </div>
  );
}
