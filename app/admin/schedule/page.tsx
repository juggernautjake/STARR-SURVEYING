// app/admin/schedule/page.tsx — My Schedule / Calendar
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import UnderConstruction from '../components/messaging/UnderConstruction';

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
  { key: 'office', label: 'Office Work', color: '#1D3095' },
  { key: 'meeting', label: 'Meeting', color: '#7C3AED' },
  { key: 'training', label: 'Training', color: '#D97706' },
  { key: 'time_off', label: 'Time Off', color: '#EF4444' },
  { key: 'deadline', label: 'Deadline', color: '#991B1B' },
  { key: 'equipment', label: 'Equipment Maint.', color: '#0891B2' },
  { key: 'other', label: 'Other', color: '#6B7280' },
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

export default function SchedulePage() {
  const { data: session } = useSession();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEventForm, setShowEventForm] = useState(false);
  const [events] = useState<ScheduleEvent[]>([]);

  // Admin form state
  const [formData, setFormData] = useState({
    title: '', event_type: 'field_work', start_date: '', start_time: '08:00',
    end_date: '', end_time: '17:00', all_day: false, location: '', notes: '',
  });

  const userRole = session?.user?.role || 'employee';
  const isAdmin = userRole === 'admin';

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
      <UnderConstruction
        feature="My Schedule"
        description="View your work schedule, field assignments, meetings, deadlines, and time-off requests on a calendar."
      />

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
              <label>Event Title <span style={{ color: '#EF4444' }}>*</span></label>
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
            <button className="sched__btn sched__btn--secondary" onClick={() => setShowEventForm(false)}>Cancel</button>
            <button className="sched__btn sched__btn--primary" disabled={!formData.title.trim()}>Create Event</button>
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
                    <div key={e.id} className="sched__event-card" style={{ borderLeftColor: e.color }}>
                      <span className="sched__event-title">{e.title}</span>
                      <span className="sched__event-time">
                        {e.all_day ? 'All day' : `${new Date(e.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </span>
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

      {/* Development Guide */}
      <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#1F2937' }}>My Schedule — Development Guide</h3>
        <div style={{ fontSize: '0.82rem', color: '#6B7280', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 0.75rem' }}><strong>Current Capabilities:</strong></p>
          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem' }}>
            <li>Week and month calendar views with navigation (prev/next/today)</li>
            <li>Event type legend with color coding (field work, office, meeting, training, time-off, deadline, equipment, other)</li>
            <li>Admin create event form with title, type, dates, times, all-day toggle, location, notes</li>
            <li>Today highlighting in both week and month views</li>
            <li>Outside-month day dimming in month view</li>
          </ul>
          <p style={{ margin: '0 0 0.5rem' }}><strong>Database:</strong> Needs a <code>schedule_events</code> table — see continuation prompt for schema.</p>
        </div>
        <pre style={{ background: '#1F2937', color: '#E5E7EB', padding: '1rem', borderRadius: '6px', fontSize: '0.75rem', overflow: 'auto', marginTop: '0.75rem' }}>{`CONTINUATION PROMPT:
Build the schedule system at /admin/schedule/page.tsx.

CURRENT STATE: Week/month calendar views, event legend, admin create form (UI only, not connected).

DATABASE SCHEMA NEEDED:
CREATE TABLE schedule_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  event_type TEXT DEFAULT 'other',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT false,
  location TEXT,
  notes TEXT,
  job_id UUID REFERENCES jobs(id),
  assigned_to TEXT NOT NULL,
  assigned_by TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

API ROUTE NEEDED: /api/admin/schedule (GET list by date range, POST create, PUT update, DELETE)

NEXT STEPS:
1. Create schedule_events table and API route
2. Wire create form to POST /api/admin/schedule
3. Load events via GET with date range query params
4. Add event click to show detail popup
5. Add drag-to-create: click and drag on calendar to create event
6. Add drag-to-move: drag existing events to reschedule
7. Add recurring events (daily, weekly, biweekly, monthly)
8. Add time-off requests: employees request, admins approve
9. Add auto-scheduling: link to assignments and auto-populate
10. Add sync with Google Calendar via API
11. Add day view with hourly grid
12. Add conflict detection (warn if double-booked)
13. Add print/export schedule to PDF
14. Notifications for upcoming events (15min, 1hr, 1day before)`}</pre>
      </div>
    </>
  );
}
