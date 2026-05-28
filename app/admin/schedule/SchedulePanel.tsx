'use client';
// app/admin/schedule/SchedulePanel.tsx
//
// Extracted body of /admin/schedule for reuse in the Hub at
// /admin/me?tab=schedule (admin-nav redesign Phase 2 slice 2b/4).

import '../styles/AdminSchedule.css';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';

type ViewMode = 'week' | 'month';

interface ScheduleEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string;
  notes: string;
  job_id: string | null;
  assigned_to: string;
  color: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const EVENT_TYPES = [
  { key: 'field_work', label: 'Field Work', color: '#059669' },
  { key: 'office', label: 'Office Work', color: 'var(--color-brand-navy)' },
  { key: 'meeting', label: 'Meeting', color: '#7C3AED' },
  { key: 'training', label: 'Training', color: '#D97706' },
  { key: 'time_off', label: 'Time Off', color: 'var(--color-error)' },
  { key: 'deadline', label: 'Deadline', color: '#991B1B' },
  { key: 'equipment', label: 'Equipment Maint.', color: '#0891B2' },
  { key: 'other', label: 'Other', color: 'var(--color-text-tertiary)' },
];

function getWeekDates(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function getMonthDates(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const dates: Date[] = [];
  for (let i = -startOffset; i < 42 - startOffset; i++) {
    const d = new Date(year, month, 1 + i);
    dates.push(d);
  }
  return dates;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export default function SchedulePanel() {
  const { data: session } = useSession();
  const { safeFetch, safeAction } = usePageError('SchedulePanel');
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEventForm, setShowEventForm] = useState(false);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [saving, setSaving] = useState(false);

  // Admin form state
  const [formData, setFormData] = useState({
    title: '', event_type: 'field_work', start_date: '', start_time: '08:00',
    end_date: '', end_time: '17:00', all_day: false, location: '', notes: '',
  });

  const userRoles = session?.user?.roles || ['employee'];
  const isAdmin = userRoles.includes('admin');

  // Load events covering the visible window (month view spans up to 42 days).
  const load = useCallback(async () => {
    const ref = currentDate;
    const from = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    const to = new Date(ref.getFullYear(), ref.getMonth() + 2, 0, 23, 59, 59);
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    const res = await safeFetch<{ events: ScheduleEvent[] }>(`/api/admin/schedule?${params}`);
    setEvents(res?.events ?? []);
  }, [currentDate, safeFetch]);

  useEffect(() => { if (session?.user) void load(); }, [session?.user, load]);

  async function createEvent(force = false) {
    if (!formData.title.trim() || !formData.start_date || saving) return;
    const endDate = formData.end_date || formData.start_date;
    const startIso = formData.all_day
      ? new Date(`${formData.start_date}T00:00`).toISOString()
      : new Date(`${formData.start_date}T${formData.start_time}`).toISOString();
    const endIso = formData.all_day
      ? new Date(`${endDate}T23:59`).toISOString()
      : new Date(`${endDate}T${formData.end_time}`).toISOString();
    setSaving(true);
    try {
      const url = force ? '/api/admin/schedule?force=1' : '/api/admin/schedule';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title, event_type: formData.event_type,
          start_time: startIso, end_time: endIso, all_day: formData.all_day,
          location: formData.location, notes: formData.notes,
        }),
      });
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { conflicts?: Array<{ title: string; start_time: string; end_time: string }> };
        const list = (body.conflicts ?? []).map(c =>
          `• ${c.title} (${new Date(c.start_time).toLocaleString()} → ${new Date(c.end_time).toLocaleString()})`
        ).join('\n');
        const ok = window.confirm(`This event overlaps with ${body.conflicts?.length ?? 0} existing event(s):\n\n${list}\n\nCreate anyway?`);
        if (ok) { void createEvent(true); return; }
        return;
      }
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`;
        // Surface non-conflict errors via the page error path.
        await safeAction('creating event', async () => { throw new Error(msg); });
        return;
      }
      setFormData({ title: '', event_type: 'field_work', start_date: '', start_time: '08:00', end_date: '', end_time: '17:00', all_day: false, location: '', notes: '' });
      setShowEventForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(id: string) {
    if (!window.confirm('Delete this event?')) return;
    await safeAction('deleting event', async () => {
      const res = await fetch(`/api/admin/schedule?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
    });
    await load();
  }

  function navigatePrev() {
    const d = new Date(currentDate);
    if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  }

  function navigateNext() {
    const d = new Date(currentDate);
    if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  }

  function navigateToday() {
    setCurrentDate(new Date());
  }

  if (!session?.user) return null;

  const weekDates = getWeekDates(currentDate);
  const monthDates = getMonthDates(currentDate);
  const currentMonth = currentDate.getMonth();

  return (
    <>
      {/* Calendar controls */}
      <div className="sched__controls">
        <div className="sched__controls-left">
          <button className="sched__nav-btn" onClick={navigatePrev}>&larr;</button>
          <button className="sched__today-btn" onClick={navigateToday}>Today</button>
          <button className="sched__nav-btn" onClick={navigateNext}>&rarr;</button>
          <h2 className="sched__month-label">
            {viewMode === 'week'
              ? `${MONTH_NAMES[weekDates[0].getMonth()]} ${weekDates[0].getDate()} – ${weekDates[6].getDate()}, ${weekDates[6].getFullYear()}`
              : `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
          </h2>
        </div>
        <div className="sched__controls-right">
          <div className="sched__view-toggle">
            <button className={`sched__view-btn ${viewMode === 'week' ? 'sched__view-btn--active' : ''}`} onClick={() => setViewMode('week')}>Week</button>
            <button className={`sched__view-btn ${viewMode === 'month' ? 'sched__view-btn--active' : ''}`} onClick={() => setViewMode('month')}>Month</button>
          </div>
          {isAdmin && (
            <button className="sched__add-btn" onClick={() => setShowEventForm(!showEventForm)}>
              {showEventForm ? 'Cancel' : '+ Add Event'}
            </button>
          )}
        </div>
      </div>

      {/* Event legend */}
      <div className="sched__legend">
        {EVENT_TYPES.map(et => (
          <span key={et.key} className="sched__legend-item">
            <span className="sched__legend-dot" style={{ background: et.color }} />
            {et.label}
          </span>
        ))}
      </div>

      {/* Create event form */}
      {showEventForm && isAdmin && (
        <div className="sched__event-form">
          <h3 className="sched__form-title">Add Schedule Event</h3>
          <div className="sched__form-grid">
            <div className="sched__form-field sched__form-field--full">
              <label>Event Title <span style={{ color: 'var(--color-error)' }}>*</span></label>
              <input type="text" value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g., Boundary survey — Johnson Property" />
            </div>
            <div className="sched__form-field">
              <label>Type</label>
              <select value={formData.event_type} onChange={e => setFormData(p => ({ ...p, event_type: e.target.value }))}>
                {EVENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="sched__form-field">
              <label>Location</label>
              <input type="text" value={formData.location} onChange={e => setFormData(p => ({ ...p, location: e.target.value }))}
                placeholder="e.g., 123 Elm St, Georgetown TX" />
            </div>
            <div className="sched__form-field">
              <label>Start Date</label>
              <input type="date" value={formData.start_date} onChange={e => setFormData(p => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div className="sched__form-field">
              <label>Start Time</label>
              <input type="time" value={formData.start_time} onChange={e => setFormData(p => ({ ...p, start_time: e.target.value }))}
                disabled={formData.all_day} />
            </div>
            <div className="sched__form-field">
              <label>End Date</label>
              <input type="date" value={formData.end_date} onChange={e => setFormData(p => ({ ...p, end_date: e.target.value }))} />
            </div>
            <div className="sched__form-field">
              <label>End Time</label>
              <input type="time" value={formData.end_time} onChange={e => setFormData(p => ({ ...p, end_time: e.target.value }))}
                disabled={formData.all_day} />
            </div>
            <div className="sched__form-field">
              <label className="sched__checkbox">
                <input type="checkbox" checked={formData.all_day} onChange={e => setFormData(p => ({ ...p, all_day: e.target.checked }))} />
                All Day Event
              </label>
            </div>
            <div className="sched__form-field sched__form-field--full">
              <label>Notes</label>
              <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                placeholder="Additional details..." rows={2} />
            </div>
          </div>
          <div className="sched__form-actions">
            <button className="sched__btn sched__btn--secondary" onClick={() => setShowEventForm(false)} disabled={saving}>Cancel</button>
            <button className="sched__btn sched__btn--primary" onClick={() => void createEvent()} disabled={saving || !formData.title.trim() || !formData.start_date}>
              {saving ? 'Creating…' : 'Create Event'}
            </button>
          </div>
        </div>
      )}

      {/* Week view */}
      {viewMode === 'week' && (
        <div className="sched__week">
          <div className="sched__week-header">
            {weekDates.map((d, i) => (
              <div key={i} className={`sched__week-day-header ${isToday(d) ? 'sched__week-day-header--today' : ''}`}>
                <span className="sched__week-day-name">{DAY_NAMES[d.getDay()]}</span>
                <span className="sched__week-day-num">{d.getDate()}</span>
              </div>
            ))}
          </div>
          <div className="sched__week-body">
            {weekDates.map((d, i) => {
              const dayEvents = events.filter(e => isSameDay(new Date(e.start_time), d));
              return (
                <div key={i} className={`sched__week-day ${isToday(d) ? 'sched__week-day--today' : ''}`}>
                  {dayEvents.length === 0 && (
                    <div className="sched__week-empty">No events</div>
                  )}
                  {dayEvents.map(e => (
                    <div key={e.id} className="sched__event-card" style={{ borderLeftColor: e.color, position: 'relative' }}>
                      <span className="sched__event-title">{e.title}</span>
                      <span className="sched__event-time">
                        {e.all_day ? 'All day' : `${new Date(e.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </span>
                      {isAdmin && (
                        <button
                          className="sched__event-delete"
                          title="Delete event"
                          style={{ position: 'absolute', top: 2, right: 4, border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1 }}
                          onClick={() => void deleteEvent(e.id)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Month view */}
      {viewMode === 'month' && (
        <div className="sched__month">
          <div className="sched__month-header">
            {DAY_NAMES.map(d => <div key={d} className="sched__month-day-name">{d}</div>)}
          </div>
          <div className="sched__month-grid">
            {monthDates.map((d, i) => {
              const isCurrentMonth = d.getMonth() === currentMonth;
              const dayEvents = events.filter(e => isSameDay(new Date(e.start_time), d));
              return (
                <div key={i} className={`sched__month-cell ${!isCurrentMonth ? 'sched__month-cell--outside' : ''} ${isToday(d) ? 'sched__month-cell--today' : ''}`}>
                  <span className="sched__month-cell-num">{d.getDate()}</span>
                  {dayEvents.slice(0, 3).map(e => (
                    <div key={e.id} className="sched__month-event" style={{ background: `${e.color}20`, color: e.color, borderLeft: `2px solid ${e.color}` }}>
                      {e.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="sched__month-more">+{dayEvents.length - 3} more</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </>
  );
}
