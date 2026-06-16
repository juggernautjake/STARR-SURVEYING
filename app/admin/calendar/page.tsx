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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
} from '@/lib/calendar/month-grid';
import {
  buildDayCell,
  buildWeekCells,
  eventGridPosition,
  HOUR_ROWS,
  parseView,
  stepFocus,
  viewHeaderLabel,
  weekWindow,
  type CalendarView,
} from '@/lib/calendar/week-grid';

// Slice C3 — module-scope so the effect's dependency array stays
// honest. 5 minutes is a tradeoff between freshness and request load.
const AUTO_REFRESH_MS = 5 * 60 * 1000;

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
  const router = useRouter();
  const searchParams = useSearchParams();

  // Slice C2 — view persists in ?view= so a wall-TV deep link remembers
  // the desired view + the bookmark-the-week use case keeps working.
  const view: CalendarView = parseView(searchParams?.get('view') ?? null);
  const [focus, setFocus] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  // Slice G1 — per-phase visibility filter. Stored as a Set of
  // event_type values that are currently HIDDEN; click a legend chip
  // to toggle. Local state on purpose; the wall-TV use case doesn't
  // need URL persistence (and a hidden phase is the rare path).
  const [hiddenPhases, setHiddenPhases] = useState<Set<string>>(() => new Set());
  // Slice P4 — keyboard cheat sheet modal. Discoverable via the
  // `?` button in the nav row OR the `?` key. Closes on Esc, click
  // outside, or `?` again.
  const [showCheatSheet, setShowCheatSheet] = useState<boolean>(false);
  // Slice P6 — distinct flag for the wall-TV refresh pulse. Only
  // flips true around an AUTO-refresh fetch (not the initial mount
  // or a view-change refetch). Drives a small corner dot that
  // glows for ~1s so a viewer can see the calendar is alive.
  const [refreshing, setRefreshing] = useState<boolean>(false);
  // Slice M2 — touch swipe gesture. swipeDx tracks the current
  // horizontal drag delta (in px). Positive = dragging right
  // (toward "back in time"); negative = left (forward). Drives the
  // edge ghost indicators that fade in when the user is mid-drag.
  const [swipeDx, setSwipeDx] = useState<number>(0);

  // Slice C3 — fullscreen / big-screen mode. The page calls
  // requestFullscreen() on its root; the browser hides everything
  // outside that root, including the admin sidebar + topbar. State is
  // driven by the browser's `fullscreenchange` event so an Esc keypress
  // out of fullscreen flips the React state back without us polling.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);


  const year = focus.getFullYear();
  const monthZeroIdx = focus.getMonth();

  const monthCells = useMemo(
    () => buildMonthGrid(year, monthZeroIdx),
    [year, monthZeroIdx],
  );
  const weekCells = useMemo(() => buildWeekCells(focus), [focus]);
  const dayCell = useMemo(() => buildDayCell(focus), [focus]);
  const visibleEvents = useMemo(
    () => (hiddenPhases.size === 0 ? events : events.filter((e) => !hiddenPhases.has(e.event_type))),
    [events, hiddenPhases],
  );
  const eventsByDay = useMemo(() => groupEventsByDay(visibleEvents), [visibleEvents]);
  // Slice P3 — derived empty states. Two distinct conditions need
  // distinct copy: (1) the fetched window genuinely has no events,
  // (2) the window had events but the legend hid all of them. A
  // blank grid square reads as "broken" otherwise; the banner makes
  // the empty intentional.
  const noFetchedEvents = !loading && events.length === 0;
  const allEventsHidden = !loading && events.length > 0 && visibleEvents.length === 0;
  const emptyKind: 'no-events' | 'all-hidden' | null = noFetchedEvents
    ? 'no-events'
    : allEventsHidden
    ? 'all-hidden'
    : null;
  const emptyMessage = useMemo(() => {
    if (emptyKind === 'all-hidden') {
      return 'All phases hidden by the legend filters. Tap a chip above to show events.';
    }
    if (emptyKind === 'no-events') {
      const viewWord = view === 'month' ? 'month' : view === 'week' ? 'week' : 'day';
      return `No scheduled phases this ${viewWord}.`;
    }
    return '';
  }, [emptyKind, view]);

  const togglePhase = useCallback((phase: string) => {
    setHiddenPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }, []);

  const setView = useCallback(
    (next: CalendarView) => {
      const url = new URL(window.location.href);
      if (next === 'month') url.searchParams.delete('view');
      else url.searchParams.set('view', next);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    },
    [router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { fromIso, toIso } =
        view === 'month'
          ? monthGridWindow(year, monthZeroIdx)
          : weekWindow(focus, view);
      const params = new URLSearchParams({ from: fromIso, to: toIso });
      const res = await safeFetch<{ events: ScheduleEvent[] }>(
        `/api/admin/schedule?${params}`,
      );
      setEvents(res?.events ?? []);
    } finally {
      setLoading(false);
    }
  }, [view, year, monthZeroIdx, focus, safeFetch]);

  useEffect(() => {
    if (isAdminUser) void load();
  }, [isAdminUser, load]);

  const goPrev = useCallback(() => setFocus((f) => stepFocus(f, view, -1)), [view]);
  const goNext = useCallback(() => setFocus((f) => stepFocus(f, view, 1)), [view]);
  const goToday = useCallback(() => setFocus(new Date()), []);

  // Slice C3 — track browser fullscreen state. The browser fires
  // `fullscreenchange` on enter / exit (incl. Esc); we just mirror it
  // into React so the data-display-mode attribute + auto-refresh stay
  // in lockstep with reality.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else if (rootRef.current?.requestFullscreen) {
      await rootRef.current.requestFullscreen().catch(() => {});
    }
  }, []);

  // Slice C3 — keyboard shortcuts. Active any time the calendar is
  // mounted (not just when fullscreen) so a desktop power user gets
  // the same bindings.
  //   ← / →   prev / next
  //   t       today
  //   f       toggle fullscreen
  //   m/w/d   month / week / day view
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Don't hijack typing inside an input / select.
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowLeft':  goPrev(); e.preventDefault(); break;
        case 'ArrowRight': goNext(); e.preventDefault(); break;
        case 't': case 'T': goToday(); e.preventDefault(); break;
        case 'f': case 'F': void toggleFullscreen(); e.preventDefault(); break;
        case 'm': case 'M': setView('month'); e.preventDefault(); break;
        case 'w': case 'W': setView('week'); e.preventDefault(); break;
        case 'd': case 'D': setView('day'); e.preventDefault(); break;
        case '?': setShowCheatSheet((v) => !v); e.preventDefault(); break;
        case 'Escape':
          if (showCheatSheet) { setShowCheatSheet(false); e.preventDefault(); }
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, goToday, toggleFullscreen, setView, showCheatSheet]);

  // Slice C3 — auto-refresh while fullscreen. Reuses the `load`
  // callback that already exists; it picks up the active focus + view.
  useEffect(() => {
    if (!isFullscreen) return;
    const id = setInterval(() => {
      if (!isAdminUser) return;
      // Slice P6 — flip the refresh flag so the corner dot pulses,
      // then drop it after a beat so the CSS animation has time to
      // run. Wall-TV trust signal: the calendar is alive.
      setRefreshing(true);
      void load().finally(() => {
        setTimeout(() => setRefreshing(false), 1200);
      });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [isFullscreen, isAdminUser, load]);

  // Slice M2 — touch swipe gesture. Pointer-event based so it works
  // for touch + pen but explicitly skips mouse so the desktop
  // experience is unchanged. Threshold: ≥50 px horizontal, <300 ms
  // duration, |dy| < |dx| so vertical scrolling isn't hijacked.
  // Right swipe → goPrev; left swipe → goNext.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let start: { x: number; y: number; t: number } | null = null;
    const SWIPE_THRESHOLD_PX = 50;
    const SWIPE_MAX_MS = 300;
    const GHOST_REVEAL_PX = 20;

    const isInteractive = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      // [data-swipe-skip] = the week view's horizontally scrolling
      // body (Slice M3). Other entries are nested interactives.
      return !!target.closest(
        'button, a, input, select, textarea, [role="dialog"], [data-swipe-skip="true"]',
      );
    };

    const onDown = (e: PointerEvent) => {
      // Mouse stays out — text selection + the existing drag UX
      // already work on desktop.
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      // Don't kick off a swipe when the user is tapping an event
      // pill or a button — those already handle their own clicks.
      if (isInteractive(e.target)) return;
      start = { x: e.clientX, y: e.clientY, t: Date.now() };
    };
    const onMove = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      // Only render the ghost preview once the motion is clearly
      // horizontal — protects the vertical scroll from feeling
      // sticky.
      if (Math.abs(dx) > GHOST_REVEAL_PX && Math.abs(dx) > Math.abs(dy)) {
        setSwipeDx(dx);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = Date.now() - start.t;
      start = null;
      setSwipeDx(0);
      if (
        Math.abs(dx) >= SWIPE_THRESHOLD_PX &&
        Math.abs(dx) > Math.abs(dy) &&
        dt < SWIPE_MAX_MS
      ) {
        if (dx < 0) goNext();
        else goPrev();
      }
    };
    const onCancel = () => {
      start = null;
      setSwipeDx(0);
    };

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onCancel);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onCancel);
    };
  }, [goPrev, goNext]);

  // Year picker — ±5 years around focus, expanded if the focus is
  // outside that window. Declared above the early returns so every
  // render path calls the same hook count (rules-of-hooks).
  const focusYear = focus.getFullYear();
  const yearOptions = useMemo(() => {
    const out: number[] = [];
    const min = Math.min(focusYear - 5, focusYear);
    const max = Math.max(focusYear + 5, focusYear);
    for (let y = min; y <= max; y++) out.push(y);
    return out;
  }, [focusYear]);

  if (!session?.user) return null;
  if (!isAdminUser) {
    return (
      <div className="calendar-page" data-state="forbidden">
        <h2 className="calendar-page__title">Admin only</h2>
      </div>
    );
  }

  const navLabel = view === 'month' ? 'month' : view === 'week' ? 'week' : 'day';

  const handleMonthPick = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = Number(e.target.value);
    setFocus(new Date(focus.getFullYear(), m, Math.min(focus.getDate(), 28)));
  };
  const handleYearPick = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = Number(e.target.value);
    setFocus(new Date(y, focus.getMonth(), Math.min(focus.getDate(), 28)));
  };

  return (
    <div
      ref={rootRef}
      className="calendar-page"
      data-testid="calendar-page"
      data-view={view}
      data-fetching={loading ? 'true' : undefined}
      data-refreshing={refreshing ? 'true' : undefined}
      data-display-mode={isFullscreen ? 'big-screen' : undefined}
    >
      {/* Slice P6 — wall-TV refresh indicator. Hidden by default;
          CSS keys it to data-display-mode='big-screen' AND
          data-refreshing='true' so it only appears in fullscreen
          and only around an auto-refresh fetch. */}
      <span
        className="calendar-page__refresh-dot"
        data-testid="calendar-refresh-dot"
        aria-hidden
      />

      {/* Slice M2 — edge ghost indicators for the swipe gesture.
          Opacity ramps with the drag delta so the user gets visual
          confirmation that the gesture is registering before they
          commit. Position: fixed so they ride above the grid; the
          CSS keeps them invisible on desktop. */}
      <span
        className="calendar-page__swipe-ghost calendar-page__swipe-ghost--left"
        data-testid="calendar-swipe-ghost-left"
        style={{ opacity: swipeDx > 20 ? Math.min(1, swipeDx / 100) : 0 }}
        aria-hidden
      >
        ◀
      </span>
      <span
        className="calendar-page__swipe-ghost calendar-page__swipe-ghost--right"
        data-testid="calendar-swipe-ghost-right"
        style={{ opacity: swipeDx < -20 ? Math.min(1, -swipeDx / 100) : 0 }}
        aria-hidden
      >
        ▶
      </span>

      <div className="calendar-page__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <h2 className="calendar-page__title" data-testid="calendar-title">
            {viewHeaderLabel(focus, view)}
          </h2>
          {/* Slice P2 — loading chip. opacity flips via the page
              root's data-fetching attribute; aria-live='polite' so
              screen readers hear "Loading" without interrupting. */}
          <span
            className="calendar-page__loading-chip"
            data-testid="calendar-loading-chip"
            role="status"
            aria-live="polite"
          >
            {loading ? 'Loading…' : ''}
          </span>
        </div>
        <div className="calendar-page__nav">
          <div
            className="calendar-page__view-switcher"
            role="group"
            aria-label="Calendar view"
          >
            {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
              <button
                key={v}
                type="button"
                data-action={`view-${v}`}
                data-current={view === v ? 'true' : undefined}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <select
            data-testid="month-picker"
            aria-label="Jump to month"
            value={focus.getMonth()}
            onChange={handleMonthPick}
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx}>{name}</option>
            ))}
          </select>
          <select
            data-testid="year-picker"
            aria-label="Jump to year"
            value={focusYear}
            onChange={handleYearPick}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            data-action={`prev-${navLabel}`}
            onClick={goPrev}
            aria-label={`Previous ${navLabel}`}
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
            data-action={`next-${navLabel}`}
            onClick={goNext}
            aria-label={`Next ${navLabel}`}
          >
            →
          </button>
          <button
            type="button"
            data-action="toggle-fullscreen"
            data-current={isFullscreen ? 'true' : undefined}
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title="Fullscreen (F)"
          >
            {isFullscreen ? '⤡' : '⛶'}
          </button>
          <button
            type="button"
            data-action="print-calendar"
            onClick={() => {
              if (typeof window !== 'undefined') window.print();
            }}
            aria-label="Print calendar"
            title="Print this view"
          >
            🖨
          </button>
          <button
            type="button"
            data-action="toggle-cheat-sheet"
            data-current={showCheatSheet ? 'true' : undefined}
            onClick={() => setShowCheatSheet((v) => !v)}
            aria-label="Keyboard shortcuts"
            aria-haspopup="dialog"
            aria-expanded={showCheatSheet}
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
        </div>
      </div>

      <div
        className="calendar-page__legend"
        role="group"
        aria-label="Phase visibility"
        data-testid="calendar-legend"
      >
        {(['research', 'field_work', 'drawing_deliverables'] as const).map((phase) => {
          const hidden = hiddenPhases.has(phase);
          return (
            <button
              key={phase}
              type="button"
              className="calendar-page__legend-chip"
              data-phase={phase}
              data-action={`toggle-phase-${phase}`}
              data-hidden={hidden ? 'true' : undefined}
              onClick={() => togglePhase(phase)}
              title={hidden ? `Show ${PHASE_LABELS[phase]}` : `Hide ${PHASE_LABELS[phase]}`}
            >
              <span
                className="calendar-page__legend-swatch"
                style={{ background: PHASE_COLORS[phase] }}
                aria-hidden
              />
              <span>{PHASE_LABELS[phase]}</span>
            </button>
          );
        })}
      </div>

      {emptyKind && (
        <div
          className="calendar-page__empty"
          data-testid="calendar-empty-state"
          data-empty-kind={emptyKind}
          role="status"
          aria-live="polite"
        >
          <span className="calendar-page__empty-icon" aria-hidden>
            {emptyKind === 'all-hidden' ? '🙈' : '📅'}
          </span>
          <span className="calendar-page__empty-message">{emptyMessage}</span>
          {emptyKind === 'no-events' && (
            <Link
              href="/admin/jobs"
              className="calendar-page__empty-cta"
              data-action="open-jobs-from-empty"
            >
              Open a job → Schedule →
            </Link>
          )}
        </div>
      )}

      {view === 'month' && renderMonth()}
      {view === 'week' && renderWeek()}
      {view === 'day' && renderDay()}

      {showCheatSheet && (
        <div
          className="calendar-page__cheat-sheet-backdrop"
          data-testid="calendar-cheat-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={(e) => {
            // Click-outside: only close when the click target IS the
            // backdrop, not a descendant of the inner panel.
            if (e.target === e.currentTarget) setShowCheatSheet(false);
          }}
        >
          <div className="calendar-page__cheat-sheet">
            <div className="calendar-page__cheat-sheet-header">
              <h3>Keyboard shortcuts</h3>
              <button
                type="button"
                data-action="close-cheat-sheet"
                onClick={() => setShowCheatSheet(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <dl className="calendar-page__cheat-sheet-list">
              <dt><kbd>←</kbd> / <kbd>→</kbd></dt>
              <dd>Previous / next {navLabel}</dd>
              <dt><kbd>T</kbd></dt>
              <dd>Jump to today</dd>
              <dt><kbd>M</kbd> / <kbd>W</kbd> / <kbd>D</kbd></dt>
              <dd>Switch to month / week / day view</dd>
              <dt><kbd>F</kbd></dt>
              <dd>Toggle fullscreen / big-screen mode</dd>
              <dt><kbd>?</kbd></dt>
              <dd>Open or close this sheet</dd>
              <dt><kbd>Esc</kbd></dt>
              <dd>Close this sheet (or exit fullscreen)</dd>
            </dl>
            <p className="calendar-page__cheat-sheet-foot">
              Shortcuts are ignored while typing in a text field.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  function renderMonth() {
    return (
      <>
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
          {monthCells.map((cell) => {
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
      </>
    );
  }

  function renderWeek() {
    return (
      <div
        className="calendar-week"
        data-testid="calendar-week-grid"
        data-loading={loading ? 'true' : undefined}
        // Slice M3 — on phone this container scrolls horizontally
        // between days; the M2 swipe gesture must NOT also fire from
        // inside it, or every horizontal scroll would also advance
        // the week. data-swipe-skip="true" tells the M2 handler to
        // ignore touches that begin here.
        data-swipe-skip="true"
      >
        <div className="calendar-week__header">
          <div className="calendar-week__hour-gutter" aria-hidden />
          {weekCells.map((cell) => (
            <div
              key={cell.iso}
              className="calendar-week__day-header"
              data-today={cell.isToday ? 'true' : undefined}
            >
              <span>{cell.weekday}</span>
              <strong>{cell.day}</strong>
            </div>
          ))}
        </div>
        <div className="calendar-week__all-day">
          <div className="calendar-week__hour-gutter" aria-hidden>All day</div>
          {weekCells.map((cell) => {
            const dayEvents = (eventsByDay.get(cell.iso) ?? []).filter((e) => e.all_day);
            return (
              <div
                key={cell.iso}
                className="calendar-week__all-day-cell"
                data-iso={cell.iso}
              >
                {dayEvents.map((ev) => renderEventPill(ev))}
              </div>
            );
          })}
        </div>
        <div className="calendar-week__body">
          <div className="calendar-week__hour-gutter">
            {HOUR_ROWS.map((h) => (
              <div key={h.hour} className="calendar-week__hour-label">{h.label}</div>
            ))}
          </div>
          {weekCells.map((cell) => {
            const timedEvents = (eventsByDay.get(cell.iso) ?? []).filter((e) => !e.all_day);
            return (
              <div
                key={cell.iso}
                className="calendar-week__day-col"
                data-iso={cell.iso}
                data-today={cell.isToday ? 'true' : undefined}
              >
                {HOUR_ROWS.map((h) => (
                  <div key={h.hour} className="calendar-week__hour-cell" />
                ))}
                {timedEvents.map((ev) => {
                  const pos = eventGridPosition(ev.start_time, ev.end_time);
                  return renderTimedEvent(ev, pos);
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderDay() {
    const dayEvents = eventsByDay.get(dayCell.iso) ?? [];
    const allDay = dayEvents.filter((e) => e.all_day);
    const timed = dayEvents.filter((e) => !e.all_day);
    return (
      <div
        className="calendar-day"
        data-testid="calendar-day-grid"
        data-loading={loading ? 'true' : undefined}
      >
        {/* Slice M4 — sticky day header for phone scrolling. The page
            header has the full label, but as soon as the user scrolls
            down through the hour grid, they lose that context. The
            sticky weekday + date keeps them oriented. */}
        <div
          className="calendar-day__day-header"
          data-testid="calendar-day-header"
          data-today={dayCell.isToday ? 'true' : undefined}
        >
          <span className="calendar-day__day-header-weekday">{dayCell.weekday}</span>
          <strong className="calendar-day__day-header-date">{dayCell.day}</strong>
          {dayCell.isToday && (
            <span className="calendar-day__day-header-today-tag" aria-label="Today">
              Today
            </span>
          )}
        </div>
        <div className="calendar-day__all-day">
          <div className="calendar-week__hour-gutter" aria-hidden>All day</div>
          <div className="calendar-week__all-day-cell">
            {allDay.length === 0 ? (
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                No all-day events.
              </span>
            ) : (
              allDay.map((ev) => renderEventPill(ev))
            )}
          </div>
        </div>
        <div className="calendar-day__body">
          <div className="calendar-week__hour-gutter">
            {HOUR_ROWS.map((h) => (
              <div key={h.hour} className="calendar-week__hour-label">{h.label}</div>
            ))}
          </div>
          <div
            className="calendar-week__day-col"
            data-iso={dayCell.iso}
            data-today={dayCell.isToday ? 'true' : undefined}
          >
            {HOUR_ROWS.map((h) => (
              <div key={h.hour} className="calendar-week__hour-cell" />
            ))}
            {timed.map((ev) => renderTimedEvent(ev, eventGridPosition(ev.start_time, ev.end_time)))}
          </div>
        </div>
      </div>
    );
  }

  function renderEventPill(ev: ScheduleEvent) {
    const phaseColor = PHASE_COLORS[ev.event_type] ?? ev.color ?? PHASE_COLORS.other;
    const phaseLabel = PHASE_LABELS[ev.event_type] ?? ev.event_type;
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
        <span className="calendar-event__title">{ev.title}</span>
      </span>
    );
  }

  function renderTimedEvent(ev: ScheduleEvent, pos: { topPct: number; heightPct: number }) {
    const phaseColor = PHASE_COLORS[ev.event_type] ?? ev.color ?? PHASE_COLORS.other;
    const phaseLabel = PHASE_LABELS[ev.event_type] ?? ev.event_type;
    const title = `${phaseLabel} · ${ev.title}${ev.location ? ` · ${ev.location}` : ''}`;
    const positioned = {
      position: 'absolute' as const,
      top: `${pos.topPct}%`,
      height: `${pos.heightPct}%`,
      left: 2,
      right: 2,
      ['--phase-color' as string]: phaseColor,
    };
    if (ev.job_id) {
      return (
        <Link
          key={ev.id}
          href={`/admin/jobs/${ev.job_id}`}
          className="calendar-event calendar-event--timed calendar-event--has-link"
          data-testid="calendar-event"
          data-phase={ev.event_type}
          style={positioned}
          title={title}
        >
          <span className="calendar-event__title">{ev.title}</span>
        </Link>
      );
    }
    return (
      <span
        key={ev.id}
        className="calendar-event calendar-event--timed"
        data-testid="calendar-event"
        data-phase={ev.event_type}
        style={positioned}
        title={title}
      >
        <span className="calendar-event__title">{ev.title}</span>
      </span>
    );
  }
}
