'use client';
// lib/hub/calendar/AddEventForm.tsx
//
// Slice 3 of hub-widget-excellence-04-calendar. Compact inline
// "+ Add event" form for the today-schedule widget (medium+). Validates
// via the pure `buildSchedulePayload` builder, POSTs to
// /api/admin/schedule, then calls `onCreated` to refresh the widget.

import React, { useState } from 'react';
import {
  buildSchedulePayload,
  type AddEventForm as AddEventFormValues,
  type EventVisibility,
} from './schedule-payload';
// Slice S3 — share the canonical reminder lead-time choices with
// the cron so the UI never surfaces an option the server doesn't
// recognise.
import { REMINDER_LEAD_CHOICES } from '@/lib/notifications/event-reminder';

/** Slice S3 — short, human-friendly label for a reminder lead.
 *  Matches the cadence the cron emits ("5 min", "1 hour", "1 day"). */
function formatReminderLead(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const h = minutes / 60;
    return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  const d = minutes / 1440;
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

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
    // Slice S2 — default to 'private' so a user who never opens
    // the new selector still ships the safest visibility.
    visibility: 'private',
    viewerEmailsRaw: '',
    // Slice S3 — default to the legacy [60] (1-hour) lead so a
    // user who never opens the reminder picker still gets the
    // single hourly nudge they're used to.
    reminderMinutesBefore: [60],
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
      {/* Slice S2 — visibility selector. Defaults to 'private'; the
          three options match the user spec ("specific users / all
          users / keep it private"). The viewer-emails picker only
          shows when 'specific_users' is selected. */}
      <div style={visibilityRowStyle}>
        <label style={visibilityLabelStyle}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--theme-fg-secondary)' }}>
            Who can see this?
          </span>
          <select
            value={form.visibility ?? 'private'}
            aria-label="Visibility"
            onChange={(e) => set('visibility', e.target.value as EventVisibility)}
            style={inputStyle}
          >
            <option value="private">Private — just me</option>
            <option value="specific_users">Specific users</option>
            <option value="all_users">Everyone on the team</option>
          </select>
        </label>
        {form.visibility === 'specific_users' && (
          <textarea
            value={form.viewerEmailsRaw ?? ''}
            placeholder="alice@starr.com, bob@starr.com…"
            aria-label="Viewer emails"
            onChange={(e) => set('viewerEmailsRaw', e.target.value)}
            style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }}
          />
        )}
      </div>

      {/* Slice S3 — reminder lead-time picker. Replaces the
          old "you'll be reminded about an hour before" hint with
          a multi-select so the user can pick any combination of
          the canonical choices. An empty selection means "no
          reminders for this event". All-day events still skip the
          per-lead picker (the cron only fires on timed events). */}
      {!form.allDay && (
        <fieldset style={reminderFieldsetStyle} aria-label="Remind me before this event">
          <legend style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--theme-fg-secondary)' }}>
            Remind me
          </legend>
          <div style={reminderChipRowStyle} data-testid="reminder-lead-picker">
            {REMINDER_LEAD_CHOICES.map((m) => {
              const checked = (form.reminderMinutesBefore ?? []).includes(m);
              return (
                <label
                  key={m}
                  style={{
                    ...reminderChipStyle,
                    background: checked ? 'var(--theme-accent, #3b82f6)' : 'transparent',
                    color: checked ? 'var(--theme-accent-fg, #fff)' : 'var(--theme-fg-secondary)',
                    borderColor: checked ? 'var(--theme-accent, #3b82f6)' : 'var(--theme-border)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={`${formatReminderLead(m)} before`}
                    onChange={() => {
                      const cur = new Set(form.reminderMinutesBefore ?? []);
                      if (cur.has(m)) cur.delete(m); else cur.add(m);
                      set('reminderMinutesBefore', Array.from(cur).sort((a, b) => a - b));
                    }}
                    style={{ display: 'none' }}
                  />
                  {formatReminderLead(m)} before
                </label>
              );
            })}
          </div>
          {(form.reminderMinutesBefore ?? []).length === 0 && (
            <p style={reminderHintStyle}>No reminders for this event.</p>
          )}
        </fieldset>
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
const visibilityRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const visibilityLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const reminderFieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--theme-border)',
  borderRadius: 6,
  padding: 6,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const reminderChipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};
const reminderChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 9px',
  borderRadius: 999,
  border: '1px solid var(--theme-border)',
  cursor: 'pointer',
  fontSize: '0.74rem',
  fontWeight: 600,
  userSelect: 'none',
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
