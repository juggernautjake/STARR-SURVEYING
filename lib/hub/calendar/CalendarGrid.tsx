// lib/hub/calendar/CalendarGrid.tsx
//
// Slice 2 of hub-widget-excellence-04-calendar. Read-only month grid
// for the today-schedule widget at large/xlarge sizes. Pure
// presentational (no hooks / no fetch) so it SSR-renders + tests
// cleanly; the widget feeds it the month's events. Events render as
// colored chips (from the API `color` field), today is highlighted, and
// out-of-month days are dimmed.

import React from 'react';
import { monthGrid, eventsForDay, type CalendarEvent } from './calendar-math';

export interface CalendarGridEvent extends CalendarEvent {
  id: string;
  title: string;
  color?: string | null;
}

export interface CalendarGridProps {
  /** Focus month (1-12) + year. */
  year: number;
  month: number;
  events: readonly CalendarGridEvent[];
  /** 'YYYY-MM-DD' for the cell to highlight as today. */
  todayIso?: string;
  /** How many event chips to show before collapsing to "+N". */
  maxChipsPerDay?: number;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FALLBACK_CHIP = 'var(--theme-accent, #3b82f6)';

export default function CalendarGrid({
  year,
  month,
  events,
  todayIso,
  maxChipsPerDay = 2,
}: CalendarGridProps) {
  const weeks = monthGrid(year, month);

  return (
    <div role="grid" aria-label="Month calendar" style={gridStyle}>
      <div role="row" style={weekdayRowStyle}>
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} role="columnheader" style={weekdayCellStyle}>
            {label}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div role="row" key={week[0].iso} style={weekRowStyle}>
          {week.map((day) => {
            const dayEvents = eventsForDay(events, day.iso);
            const isToday = !!todayIso && day.iso === todayIso;
            const shown = dayEvents.slice(0, maxChipsPerDay);
            const overflow = dayEvents.length - shown.length;
            return (
              <div
                role="gridcell"
                key={day.iso}
                data-iso={day.iso}
                data-in-month={day.inMonth ? 'true' : 'false'}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${day.iso}${dayEvents.length ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'event' : 'events'}` : ', no events'}`}
                style={cellStyle(day.inMonth, isToday)}
              >
                <span style={dayNumberStyle(day.inMonth, isToday)}>{day.day}</span>
                <div style={chipsWrapStyle}>
                  {shown.map((e) => (
                    <span
                      key={e.id}
                      title={e.title}
                      data-event={e.id}
                      style={chipStyle(e.color)}
                    >
                      {e.title}
                    </span>
                  ))}
                  {overflow > 0 && <span style={moreStyle}>+{overflow}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: 2,
  fontSize: 'var(--hub-font-xs, 0.75rem)',
};

const weekdayRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 2,
};

const weekdayCellStyle: React.CSSProperties = {
  textAlign: 'center',
  fontWeight: 600,
  color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  fontSize: '0.66rem',
};

const weekRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 2,
  flex: 1,
  minHeight: 0,
};

function cellStyle(inMonth: boolean, isToday: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 3,
    borderRadius: 4,
    overflow: 'hidden',
    background: isToday
      ? 'color-mix(in srgb, var(--theme-accent, #3b82f6) 14%, var(--theme-bg-surface))'
      : 'var(--theme-bg-elevated)',
    border: isToday
      ? '1px solid var(--theme-accent, #3b82f6)'
      : '1px solid transparent',
    opacity: inMonth ? 1 : 0.45,
  };
}

function dayNumberStyle(inMonth: boolean, isToday: boolean): React.CSSProperties {
  return {
    fontWeight: isToday ? 700 : 500,
    color: inMonth ? 'var(--theme-fg-primary)' : 'var(--theme-fg-secondary)',
    lineHeight: 1,
  };
}

const chipsWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
};

function chipStyle(color?: string | null): React.CSSProperties {
  const bg = color && color.trim() ? color : FALLBACK_CHIP;
  return {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    borderRadius: 3,
    padding: '0 3px',
    fontSize: '0.66rem',
    lineHeight: 1.4,
    color: '#fff',
    background: bg,
  };
}

const moreStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  color: 'var(--theme-fg-secondary)',
  fontWeight: 600,
};
