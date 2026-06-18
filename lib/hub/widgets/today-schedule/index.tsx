'use client';
// lib/hub/widgets/today-schedule/index.tsx
//
// Today's Schedule widget. Reads `/api/admin/schedule?from=…&to=…`
// for the active day and renders the events in time order.
//
// Slice 111 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { bucketToView, datePart, type CalendarView } from '@/lib/hub/calendar/calendar-math';
import CalendarGrid from '@/lib/hub/calendar/CalendarGrid';
import AddEventForm from '@/lib/hub/calendar/AddEventForm';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetError from '@/lib/hub/components/WidgetError';

export type TodayScheduleTimeRange = 'all-day' | 'morning' | 'afternoon' | 'evening';
/** Slice 5 (doc 04) — let the surveyor pin a presentation instead of
 *  letting size decide. `auto` follows the size bucket. */
export type TodayScheduleView = 'auto' | 'agenda' | 'grid';

export interface TodayScheduleContent extends Record<string, unknown> {
  /** When true, all-day events render first; off hides them. */
  showAllDay: boolean;
  /** Limits the displayed window. `all-day` shows every event. */
  timeRange: TodayScheduleTimeRange;
  /** Presentation override; `auto` lets the widget size decide. */
  defaultView: TodayScheduleView;
  /** When non-empty, only these event_types are shown (others hidden). */
  eventTypes: string[];
}

const DEFAULTS: TodayScheduleContent = {
  showAllDay: true,
  timeRange: 'all-day',
  defaultView: 'auto',
  eventTypes: [],
};

/** All event types the widget knows how to tint (for the editor's
 *  filter + the legend). */
export const SCHEDULE_EVENT_TYPES = [
  'field_work', 'office', 'meeting', 'training', 'time_off', 'deadline', 'equipment', 'other',
] as const;

interface ScheduleEvent {
  id: string;
  title: string;
  event_type?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  all_day?: boolean | null;
  location?: string | null;
  color?: string | null;
}

const TYPE_TINTS: Record<string, 'accent' | 'success' | 'warning' | 'info' | 'danger'> = {
  field_work: 'success',
  office:     'accent',
  meeting:    'accent',
  training:   'warning',
  time_off:   'danger',
  deadline:   'danger',
  equipment:  'info',
  other:      'info',
};

function TodayScheduleWidget({ size, content }: WidgetProps<TodayScheduleContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  // Slice 2/5 (doc 04) — agenda (tiny/small), agenda-wide (medium), or a
  // read-only month grid (large/xlarge), unless the surveyor pinned a
  // view. The grid needs the whole month's events, so the fetch window
  // follows the resolved view.
  const view = resolveScheduleView(settings.defaultView, bucket);

  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>("Couldn't load your schedule.");
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  // Slice 3 (doc 04) — inline "+ Add event" at medium+ sizes.
  const [adding, setAdding] = useState(false);

  const fetchEvents = useCallback(async () => {
    setStatus('loading');
    try {
      const { from, to } = scheduleWindow(view, settings.timeRange);
      const res = await fetch(`/api/admin/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      // Slice widget-empty-vs-error-2026-06-17 — user feedback:
      //   "if there is simply nothing scheduled, it should just
      //    say 'nothing is scheduled', not 'couldn't load this
      //    widget'. That makes it seem like there was an error.
      //    We need to know the difference between an error in
      //    fetching information and there just not being any data."
      //
      // Auth failures (401/403) are NOT data errors — they mean the
      // user isn't allowed to see schedules. Treat them as empty so
      // the widget reads as "you have nothing here" rather than
      // "something broke". Real server errors (5xx) and network
      // failures still fall through to the error path with a
      // message that names the cause.
      if (res.status === 401 || res.status === 403) {
        setEvents([]);
        setStatus('empty');
        return;
      }
      if (!res.ok) {
        setEvents([]);
        setErrorMessage(`Schedule service returned HTTP ${res.status}. Retry in a moment.`);
        setStatus('error');
        return;
      }
      const data: { events?: ScheduleEvent[] } = await res.json();
      let list = data.events ?? [];
      if (!settings.showAllDay) list = list.filter((e) => !e.all_day);
      list = filterEventsByType(list, settings.eventTypes);
      list = sortByStart(list);
      setEvents(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch (err) {
      // Network failure (offline, DNS, CORS, etc.) or JSON parse
      // error. Distinct from a 2xx with no rows so the user knows
      // it's worth retrying.
      setEvents([]);
      const reason = err instanceof Error ? err.message : 'unknown error';
      setErrorMessage(`Couldn't reach the schedule service (${reason}). Check your connection.`);
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.showAllDay, settings.timeRange, settings.eventTypes.join('|'), view]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const visible = useMemo(
    () => events.slice(0, capForBucket(bucket)),
    [events, bucket],
  );

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'error')   return <WidgetError message={errorMessage} onRetry={fetchEvents} />;

  const today = datePart(new Date().toISOString());
  // The "+ Add event" affordance only shows where there's room (medium+).
  const canAdd = view === 'agenda-wide' || view === 'grid';
  const addBar = canAdd ? (
    adding ? (
      <AddEventForm
        defaultDate={today}
        onCancel={() => setAdding(false)}
        onCreated={() => { setAdding(false); fetchEvents(); }}
      />
    ) : (
      <button type="button" onClick={() => setAdding(true)} style={addButtonStyle}>
        + Add event
      </button>
    )
  ) : null;

  // Grid view (large/xlarge) renders the month even when empty — an
  // empty month grid is still a useful at-a-glance calendar.
  if (view === 'grid') {
    const [gy, gm] = today.split('-').map(Number);
    return (
      <div style={gridWrapStyle}>
        {addBar}
        <div style={{ flex: 1, minHeight: 0 }}>
          <CalendarGrid
            year={gy}
            month={gm}
            events={events as (ScheduleEvent & { id: string; title: string })[]}
            todayIso={today}
          />
        </div>
      </div>
    );
  }

  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyWrapStyle}>
          <span style={tinyCountStyle}>0</span>
          <span style={tinyLabelStyle}>today</span>
        </div>
      );
    }
    return (
      <div style={listWrapStyle}>
        {addBar}
        <WidgetEmpty
          icon="🗓"
          title="Nothing scheduled today"
          description="Enjoy the empty calendar — or add an event below."
        />
      </div>
    );
  }

  // Slice 211 — tiny renders just the event count.
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle}>
        <span style={tinyCountStyle}>{events.length}</span>
        <span style={tinyLabelStyle}>{events.length === 1 ? 'event today' : 'events today'}</span>
      </div>
    );
  }

  return (
    <div style={listWrapStyle}>
      {addBar}
      <ul role="list" style={listStyle}>
        {visible.map((e) => (
          <li key={e.id} style={rowStyle}>
            <TypeStripe type={e.event_type} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
              <span style={titleStyle}>{e.title}</span>
              <span style={mutedStyle}>
                {formatTime(e)}
                {e.location ? ` · ${e.location}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TypeStripe({ type }: { type?: string | null }) {
  const tint = TYPE_TINTS[type ?? 'other'] ?? 'info';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 4,
        alignSelf: 'stretch',
        borderRadius: 2,
        background: `var(--theme-${tint})`,
      }}
    />
  );
}

function TodayScheduleSettings({ value, onChange }: WidgetSettingsFormProps<TodayScheduleContent>) {
  const settings = { ...DEFAULTS, ...value };
  const eventTypes = settings.eventTypes ?? [];

  function toggleType(t: string) {
    const next = eventTypes.includes(t)
      ? eventTypes.filter((x) => x !== t)
      : [...eventTypes, t];
    onChange({ ...settings, eventTypes: next });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Default view</span>
        <select
          value={settings.defaultView}
          onChange={(e) => onChange({ ...settings, defaultView: e.target.value as TodayScheduleView })}
        >
          <option value="auto">Auto (follows widget size)</option>
          <option value="agenda">Agenda list</option>
          <option value="grid">Month grid (when it fits)</option>
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={settings.showAllDay}
          onChange={(e) => onChange({ ...settings, showAllDay: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Show all-day events</span>
      </label>
      <label>
        <span style={labelStyle}>Time range (agenda)</span>
        <select
          value={settings.timeRange}
          onChange={(e) => onChange({ ...settings, timeRange: e.target.value as TodayScheduleTimeRange })}
        >
          <option value="all-day">All day</option>
          <option value="morning">Morning (6am–noon)</option>
          <option value="afternoon">Afternoon (noon–6pm)</option>
          <option value="evening">Evening (6pm–midnight)</option>
        </select>
      </label>
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={labelStyle}>Event types to show</legend>
        <p style={{ margin: '0 0 6px', fontSize: '0.74rem', color: 'var(--theme-fg-secondary)' }}>
          None selected shows every type.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SCHEDULE_EVENT_TYPES.map((t) => {
            const on = eventTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                aria-pressed={on}
                style={{
                  padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
                  fontSize: '0.74rem', fontWeight: 600,
                  border: `1px solid var(--theme-${TYPE_TINTS[t] ?? 'info'})`,
                  background: on ? `var(--theme-${TYPE_TINTS[t] ?? 'info'})` : 'transparent',
                  color: on ? 'var(--theme-accent-fg, #fff)' : 'var(--theme-fg-secondary)',
                }}
              >
                {t.replace('_', ' ')}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

defineWidget<TodayScheduleContent>({
  id: 'today-schedule',
  label: "Today's Schedule",
  description: 'Your events for today in time order.',
  category: 'personal',
  iconName: 'Calendar',
  defaultSize: { w: 4, h: 3 },
  // Slice 211 — minSize lowered to 1×1 with the tiny event-count mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: TodayScheduleWidget,
  SettingsForm: TodayScheduleSettings,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

/** Resolve the presentation: an explicit override wins, except the grid
 *  can't fit at tiny/small where it falls back to the agenda. `auto`
 *  follows the size bucket. Pure + exported. */
export function resolveScheduleView(
  defaultView: TodayScheduleView,
  bucket: SizeBucket,
): CalendarView {
  if (defaultView === 'agenda') return 'agenda';
  if (defaultView === 'grid') {
    return bucket === 'tiny' || bucket === 'small' ? 'agenda' : 'grid';
  }
  return bucketToView(bucket);
}

/** Keep only events whose `event_type` is in `types`. An empty list
 *  means "show everything". Pure + exported. */
export function filterEventsByType<T extends { event_type?: string | null }>(
  events: T[],
  types: string[],
): T[] {
  if (!types || types.length === 0) return events;
  const set = new Set(types);
  return events.filter((e) => set.has(e.event_type ?? 'other'));
}

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 2;
    case 'small':  return 4;
    case 'medium': return 6;
    case 'large':  return 12;
    case 'xlarge': return 24;
  }
}

/**
 * The schedule fetch window for the current view: the day (agenda),
 * today + the next two days (agenda-wide), or the whole focus month
 * (grid). Exported for testing.
 */
export function scheduleWindow(
  view: CalendarView,
  range: TodayScheduleTimeRange,
  now: Date = new Date(),
): { from: string; to: string } {
  if (view === 'grid') return monthWindow(now);
  if (view === 'agenda-wide') return daysWindow(now, 3);
  return todayWindow(range, now);
}

/** The whole UTC month containing `now` (first day 00:00 → next month
 *  first day 00:00), padded a week each side so leading/trailing grid
 *  days from adjacent months show their events too. */
export function monthWindow(now: Date = new Date()): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1) - 7 * 86_400_000);
  const to = new Date(Date.UTC(y, m + 1, 1) + 7 * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** `n` whole days starting at the local midnight of `now`. */
export function daysWindow(now: Date = new Date(), n = 3): { from: string; to: string } {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setDate(end.getDate() + n);
  return { from: day.toISOString(), to: end.toISOString() };
}

export function todayWindow(range: TodayScheduleTimeRange, now: Date = new Date()): { from: string; to: string } {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const start = new Date(day);
  const end = new Date(day);
  end.setDate(end.getDate() + 1);

  if (range === 'morning') {
    start.setHours(6, 0, 0, 0);
    end.setTime(day.getTime());
    end.setHours(12, 0, 0, 0);
  } else if (range === 'afternoon') {
    start.setHours(12, 0, 0, 0);
    end.setTime(day.getTime());
    end.setHours(18, 0, 0, 0);
  } else if (range === 'evening') {
    start.setHours(18, 0, 0, 0);
    end.setTime(day.getTime());
    end.setHours(24, 0, 0, 0);
  }

  return { from: start.toISOString(), to: end.toISOString() };
}

export function sortByStart(events: ScheduleEvent[]): ScheduleEvent[] {
  return [...events].sort((a, b) => {
    if (a.all_day && !b.all_day) return -1;
    if (!a.all_day && b.all_day) return 1;
    return Date.parse(a.start_time ?? '0') - Date.parse(b.start_time ?? '0');
  });
}

function formatTime(e: ScheduleEvent): string {
  if (e.all_day) return 'All day';
  if (!e.start_time) return '';
  const s = new Date(e.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (e.end_time) {
    const f = new Date(e.end_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${s} – ${f}`;
  }
  return s;
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hub-spc-2, 8px)',
};

// Slice 3 (doc 04) — wrappers + the "+ Add event" toggle.
const listWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hub-spc-2, 8px)',
  height: '100%',
};

const gridWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  height: '100%',
};

const addButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px dashed var(--theme-border)',
  background: 'transparent',
  color: 'var(--theme-accent, #3b82f6)',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
  color: 'var(--theme-fg-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const mutedStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};

// Slice 211 — tiny-bucket counter.
const tinyWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 2,
};
const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
  fontWeight: 700,
  lineHeight: 1,
  color: 'var(--theme-fg-primary)',
};
const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  textAlign: 'center',
};
