// ExecutionTimeline.tsx — Timeline bar with color-coded event markers and scrubber
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type EventType =
  | 'phase-start'
  | 'phase-complete'
  | 'phase-failed'
  | 'api-call'
  | 'ai-call'
  | 'browser-action'
  | 'data-found'
  | 'warning'
  | 'error'
  | 'screenshot'
  | 'log'
  | 'checkpoint';

export interface TimelineEvent {
  id: string;
  timestamp: number;        // ms since run start
  type: EventType;
  label: string;
  description: string;
  file?: string;
  function?: string;
  line?: number;
  data?: unknown;
  duration?: number;
}

interface ExecutionTimelineProps {
  events: TimelineEvent[];
  currentTime: number;          // ms — current playback position
  totalDuration: number;        // ms — total run time so far
  isPlaying: boolean;
  speed: number;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onJumpForward: () => void;
  onJumpBack: () => void;
  onSpeedChange: (speed: number) => void;
  onEventClick?: (event: TimelineEvent) => void;
}

// ── Color map ────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<EventType, string> = {
  'phase-start':    '#3B82F6', // blue
  'phase-complete': '#059669', // green
  'phase-failed':   '#DC2626', // red
  'api-call':       '#7C3AED', // purple
  'ai-call':        '#EA580C', // orange
  'browser-action': '#06B6D4', // cyan
  'data-found':     '#10B981', // emerald
  'warning':        '#D97706', // amber
  'error':          '#DC2626', // red
  'screenshot':     '#EC4899', // pink
  'log':            '#9CA3AF', // gray
  'checkpoint':     '#F3F4F6', // white-ish
};

const EVENT_SHAPES: Record<EventType, string> = {
  'phase-start':    '●',
  'phase-complete': '●',
  'phase-failed':   '●',
  'api-call':       '■',
  'ai-call':        '■',
  'browser-action': '■',
  'data-found':     '·',
  'warning':        '▲',
  'error':          '●',
  'screenshot':     '●',
  'log':            '·',
  'checkpoint':     '◆',
};

const SSR_VIEWPORT_WIDTH = 1200; // fallback for server-side rendering

const SPEED_PRESETS = [0.1, 0.25, 0.5, 1, 2, 5, 10];

// ── Component ────────────────────────────────────────────────────────────────

export default function ExecutionTimeline({
  events,
  currentTime,
  totalDuration,
  isPlaying,
  speed,
  onSeek,
  onTogglePlay,
  onStepForward,
  onStepBack,
  onJumpForward,
  onJumpBack,
  onSpeedChange,
  onEventClick,
}: ExecutionTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const maxTime = Math.max(totalDuration, 1000); // at least 1s

  // ── Scrubber drag ──────────────────────────────────────────────────────────

  const getTimeFromMouseX = useCallback((clientX: number) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * maxTime;
  }, [maxTime]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    onSeek(getTimeFromMouseX(e.clientX));
  }, [getTimeFromMouseX, onSeek]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => onSeek(getTimeFromMouseX(e.clientX));
    const handleUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, getTimeFromMouseX, onSeek]);

  // ── Keyboard — scoped to this component via onKeyDown + tabIndex ─────────
  // Using window listeners caused every visible ExecutionTimeline to fire
  // simultaneously (e.g. 10 TestCards all respond to Space/Arrow).

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        onTogglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onStepBack();
        break;
      case 'ArrowRight':
        e.preventDefault();
        onStepForward();
        break;
    }
  }, [onTogglePlay, onStepBack, onStepForward]);

  // ── Format helpers ─────────────────────────────────────────────────────────

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const frac = Math.floor((ms % 1000) / 100);
    if (m > 0) return `${m}:${sec.toString().padStart(2, '0')}.${frac}`;
    return `${sec}.${frac}s`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const scrubberPercent = maxTime > 0 ? (currentTime / maxTime) * 100 : 0;

  return (
    <div
      className="execution-timeline"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Execution timeline — press Space to pause/resume, Arrow keys to step"
    >
      {/* Time labels */}
      <div className="execution-timeline__time-labels">
        <span>{formatTime(0)}</span>
        <span>{formatTime(maxTime * 0.25)}</span>
        <span>{formatTime(maxTime * 0.5)}</span>
        <span>{formatTime(maxTime * 0.75)}</span>
        <span>{formatTime(maxTime)}</span>
      </div>

      {/* Track with markers */}
      <div
        className="execution-timeline__track"
        ref={trackRef}
        onMouseDown={handleMouseDown}
      >
        {/* Background bar */}
        <div className="execution-timeline__bar" />

        {/* Progress fill */}
        <div
          className="execution-timeline__progress"
          style={{ width: `${scrubberPercent}%` }}
        />

        {/* Event markers */}
        {events.map((evt) => {
          const left = maxTime > 0 ? (evt.timestamp / maxTime) * 100 : 0;
          const isPast = evt.timestamp <= currentTime;
          return (
            <div
              key={evt.id}
              className={`execution-timeline__marker ${isPast ? '' : 'execution-timeline__marker--future'}`}
              style={{
                left: `${left}%`,
                color: EVENT_COLORS[evt.type],
              }}
              onMouseEnter={(e) => {
                setHoveredEvent(evt);
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseLeave={() => setHoveredEvent(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(evt.timestamp);
                onEventClick?.(evt);
              }}
              title={evt.label}
            >
              {EVENT_SHAPES[evt.type]}
            </div>
          );
        })}

        {/* Scrubber handle */}
        <div
          className="execution-timeline__scrubber"
          style={{ left: `${scrubberPercent}%` }}
        />
      </div>

      {/* Tooltip */}
      {hoveredEvent && (
        <div
          className="execution-timeline__tooltip"
          style={{
            left: `${Math.min(tooltipPos.x, (typeof window !== 'undefined' ? window.innerWidth : SSR_VIEWPORT_WIDTH) - 300)}px`,
            top: `${tooltipPos.y - 80}px`,
          }}
        >
          <div className="execution-timeline__tooltip-type" style={{ color: EVENT_COLORS[hoveredEvent.type] }}>
            {EVENT_SHAPES[hoveredEvent.type]} {hoveredEvent.type.replace('-', ' ')}
          </div>
          <div className="execution-timeline__tooltip-label">{hoveredEvent.label}</div>
          <div className="execution-timeline__tooltip-time">{formatTime(hoveredEvent.timestamp)}</div>
          {hoveredEvent.description && (
            <div className="execution-timeline__tooltip-desc">{hoveredEvent.description}</div>
          )}
        </div>
      )}

      {/* Playback controls */}
      <div className="execution-timeline__controls">
        <div className="execution-timeline__playback">
          <button className="execution-timeline__btn" onClick={onJumpBack} title="Jump to previous event">
            ◀◀
          </button>
          <button className="execution-timeline__btn" onClick={onStepBack} title="Step back one event">
            ◀
          </button>
          <button
            className="execution-timeline__btn execution-timeline__btn--play"
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause' : 'Resume'}
          >
            {isPlaying ? '▌▌' : '▶'}
          </button>
          <button className="execution-timeline__btn" onClick={onStepForward} title="Step forward one event">
            ▶
          </button>
          <button className="execution-timeline__btn" onClick={onJumpForward} title="Jump to next event">
            ▶▶
          </button>
          <span className="execution-timeline__time-display">
            {formatTime(currentTime)} / {formatTime(maxTime)}
          </span>
        </div>

        <div className="execution-timeline__speed">
          <span className="execution-timeline__speed-label">Speed:</span>
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset}
              className={`execution-timeline__speed-btn ${speed === preset ? 'execution-timeline__speed-btn--active' : ''}`}
              onClick={() => onSpeedChange(preset)}
            >
              {preset}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
