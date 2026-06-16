// app/admin/calendar/page.tsx
//
// job-calendar Slice C1 — org-wide calendar.
//
// First slice: month view + page shell + clickable events. Week + day
// views land in C2; fullscreen + auto-refresh in C3; the per-job
// scheduler that fills this thing with rows lands in C4.
//
// Reads `schedule_events` via the existing /api/admin/schedule GET. No
// new endpoint needed; the calendar just passes a wider window than
// the SchedulePanel does.
'use client';

import '../styles/AdminLayout.css';
import '../styles/Calendar.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';
import {
  buildMonthGrid,
  groupEventsByDay,
  MONTH_NAMES,
  DAY_HEADERS,
  PHASE_COLORS,
  PHASE_LABELS,
  monthGridWindow,
  stepMonth,
} from '@/lib/calendar/month-grid';

interface ScheduleEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  job_id: string | null;
  assigned_to: string;
  color: string | null;
}

function fmtTime(iso: string, allDay: boolean): string {
  if (allDay) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago',
    });
  } catch {
    return '';
  }
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('CalendarPage');
  const isAdminUser = session?.user?.roles?.includes('admin') ?? false;

  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(today.getFullYear());
  const [monthZeroIdx, setMonthZeroIdx] = useState<number>(today.getMonth());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const cells = useMemo(() => buildMonthGrid(year, monthZeroIdx), [year, monthZeroIdx]);
  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { fromIso, toIso } = monthGridWindow(year, monthZeroIdx);
      const params = new URLSearchParams({ from: fromIso, to: toIso });
      const res = await safeFetch<{ events: ScheduleEvent[] }>(
        `/api/admin/schedule?${params}`,
      );
      setEvents(res?.events ?? []);
    } finally {
      setLoading(false);
    }
  }, [year, monthZeroIdx, safeFetch]);

  useEffect(() => {
    if (isAdminUser) void load();
  }, [isAdminUser, load]);

  const goPrevMonth = () => {
    const next = stepMonth(year, monthZeroIdx, -1);
    setYear(next.year);
    setMonthZeroIdx(next.monthZeroIdx);
  };
  const goNextMonth = () => {
    const next = stepMonth(year, monthZeroIdx, 1);
    setYear(next.year);
    setMonthZeroIdx(next.monthZeroIdx);
  };
  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonthZeroIdx(now.getMonth());
  };

  if (!session?.user) return null;
  if (!isAdminUser) {
    return (
      <div className="calendar-page" data-state="forbidden">
        <h2 className="calendar-page__title">Admin only</h2>
      </div>
    );
  }

  return (
    <div
      className="calendar-page"
      data-testid="calendar-page"
      data-view="month"
    >
      <div className="calendar-page__header">
        <h2 className="calendar-page__title" data-testid="calendar-title">
          {MONTH_NAMES[monthZeroIdx]} {year}
        </h2>
        <div className="calendar-page__nav">
          <button
            type="button"
            data-action="prev-month"
            onClick={goPrevMonth}
            aria-label="Previous month"
          >
            ←
          </button>
          <button
            type="button"
            data-action="today"
            onClick={goToday}
          >
            Today
          </button>
          <button
            type="button"
            data-action="next-month"
            onClick={goNextMonth}
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      <div className="calendar-month__weekdays" aria-hidden>
        {DAY_HEADERS.map((d) => (
          <div key={d} className="calendar-month__weekday">{d}</div>
        ))}
      </div>

      <div
        className="calendar-month__grid"
        data-testid="calendar-month-grid"
        data-loading={loading ? 'true' : undefined}
      >
        {cells.map((cell) => {
          const dayEvents = eventsByDay.get(cell.iso) ?? [];
          return (
            <div
              key={cell.iso}
              className="calendar-month__cell"
              data-iso={cell.iso}
              data-in-month={cell.inMonth ? 'true' : 'false'}
              data-today={cell.isToday ? 'true' : undefined}
            >
              <div className="calendar-month__cell-num">
                {cell.day}
                {cell.inMonth && cell.day === 1 && (
                  <span style={{ marginLeft: 4, color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                    {MONTH_NAMES[cell.date.getMonth()].slice(0, 3)}
                  </span>
                )}
              </div>
              <div className="calendar-month__events">
                {dayEvents.map((ev) => {
                  const phaseColor = PHASE_COLORS[ev.event_type] ?? ev.color ?? PHASE_COLORS.other;
                  const phaseLabel = PHASE_LABELS[ev.event_type] ?? ev.event_type;
                  const time = fmtTime(ev.start_time, ev.all_day);
                  const title = `${phaseLabel} · ${ev.title}${ev.location ? ` · ${ev.location}` : ''}`;
                  if (ev.job_id) {
                    return (
                      <Link
                        key={ev.id}
                        href={`/admin/jobs/${ev.job_id}`}
                        className="calendar-event calendar-event--has-link"
                        data-testid="calendar-event"
                        data-phase={ev.event_type}
                        style={{ ['--phase-color' as string]: phaseColor }}
                        title={title}
                      >
                        {time && <span className="calendar-event__time">{time}</span>}
                        <span className="calendar-event__title">{ev.title}</span>
                      </Link>
                    );
                  }
                  return (
                    <span
                      key={ev.id}
                      className="calendar-event"
                      data-testid="calendar-event"
                      data-phase={ev.event_type}
                      style={{ ['--phase-color' as string]: phaseColor }}
                      title={title}
                    >
                      {time && <span className="calendar-event__time">{time}</span>}
                      <span className="calendar-event__title">{ev.title}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
