'use client';
// lib/hub/calendar/AddEventForm.tsx
//
// Slice 3 of hub-widget-excellence-04-calendar. Compact inline
// "+ Add event" form for the today-schedule widget (medium+). Validates
// via the pure `buildSchedulePayload` builder, POSTs to
// /api/admin/schedule, then calls `onCreated` to refresh the widget.

import React, { useState } from 'react';
import { buildSchedulePayload, type AddEventForm as AddEventFormValues } from './schedule-payload';

export interface AddEventFormProps {
  /** Pre-fill the date field (e.g. today). 'YYYY-MM-DD'. */
  defaultDate?: string;
  /** Called after a successful create so the widget can refetch. */
  onCreated: () => void;
  onCancel: () => void;
}

const EVENT_TYPES = ['field_work', 'office', 'meeting', 'training', 'deadline', 'equipment', 'other'];

export default function AddEventForm({ defaultDate = '', onCreated, onCancel }: AddEventFormProps) {
  const [form, setForm] = useState<AddEventFormValues>({
    title: '',
    date: defaultDate,
    allDay: false,
    startTime: '09:00',
    endTime: '10:00',
    location: '',
    eventType: 'other',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof AddEventFormValues>(key: K, value: AddEventFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = buildSchedulePayload(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCreated();
    } catch {
      setError('Could not save the event. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={formStyle} aria-label="Add event">
      <input
        type="text"
        value={form.title}
        placeholder="Event title"
        aria-label="Event title"
        onChange={(e) => set('title', e.target.value)}
        style={inputStyle}
      />
      <div style={rowStyle}>
        <input
          type="date"
          value={form.date}
          aria-label="Date"
          onChange={(e) => set('date', e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => set('allDay', e.target.checked)}
          />
          All day
        </label>
      </div>
      {!form.allDay && (
        <div style={rowStyle}>
          <input
            type="time"
            value={form.startTime}
            aria-label="Start time"
            onChange={(e) => set('startTime', e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <span style={{ alignSelf: 'center' }}>–</span>
          <input
            type="time"
            value={form.endTime}
            aria-label="End time"
            onChange={(e) => set('endTime', e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      )}
      <div style={rowStyle}>
        <input
          type="text"
          value={form.location}
          placeholder="Location (optional)"
          aria-label="Location"
          onChange={(e) => set('location', e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <select
          value={form.eventType}
          aria-label="Event type"
          onChange={(e) => set('eventType', e.target.value)}
          style={inputStyle}
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace('_', ' ')}</option>
          ))}
        </select>
      </div>
      {!form.allDay && (
        // Slice 4 (doc 04) — timed events get an automatic reminder ~1h
        // before via the schedule-event-reminders cron.
        <p style={reminderHintStyle}>⏰ You&apos;ll be reminded about an hour before.</p>
      )}
      {error && <p style={errorStyle} role="alert">{error}</p>}
      <div style={actionsStyle}>
        <button type="button" onClick={onCancel} style={ghostBtnStyle}>Cancel</button>
        <button type="submit" disabled={saving} style={primaryBtnStyle}>
          {saving ? 'Saving…' : 'Add event'}
        </button>
      </div>
    </form>
  );
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  border: '1px solid var(--theme-border)',
};
const rowStyle: React.CSSProperties = { display: 'flex', gap: 6 };
const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 4,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  fontSize: '0.82rem',
};
const checkboxLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: '0.8rem',
  color: 'var(--theme-fg-secondary)',
};
const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.78rem',
  color: 'var(--theme-danger, #dc2626)',
};
const reminderHintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.72rem',
  color: 'var(--theme-fg-secondary)',
};
const actionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 6,
};
const ghostBtnStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'transparent',
  color: 'var(--theme-fg-secondary)',
  cursor: 'pointer',
  fontSize: '0.8rem',
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #fff)',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
};
