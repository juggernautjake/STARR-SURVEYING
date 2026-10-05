'use client';
// app/admin/hours/_tabs/HistoryTab.tsx — everything that ever happened to anybody's hours.
//
// Owner, 2026-10-05: "We need to keep an audit trail of deletions and modifications and approvals
// and rejections for hours always … We need to know who posts their hours, and then who reviews
// them and makes the decisions for them." And: "We also need to be able to retrieve the hours if
// deleted too."
//
// Reads /api/admin/time-logs/history, which is fed by a database trigger (seeds/664) — so this
// screen shows every write, including ones that did not come through the app. A deleted entry keeps
// its whole row, and an admin can put it back exactly as it was with one click.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { isAdminRoles, type UserRole } from '@/lib/auth-roles';

interface HistoryEvent {
  id: string;
  time_log_id: string;
  employee_email: string;
  actor_email: string | null;
  action: string;
  log_date: string | null;
  hours_before: number | string | null;
  hours_after: number | string | null;
  status_before: string | null;
  status_after: string | null;
  before_row: Record<string, unknown> | null;
  after_row: Record<string, unknown> | null;
  restored_at?: string | null;
  restored_by?: string | null;
  note?: string | null;
  total_pay?: number | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  entered_by_office: 'Entered by office',
  resubmitted: 'Resubmitted',
  edited: 'Edited',
  approved: 'Approved',
  rejected: 'Rejected',
  adjusted: 'Adjusted',
  disputed: 'Disputed',
  paid: 'Marked paid',
  unpaid: 'Marked unpaid',
  modified: 'Changed',
  deleted: 'Deleted',
  replaced: 'Replaced by a resubmission',
  restored: 'Restored',
  pay_decided: 'Pay decided',
};

const ACTION_COLOR: Record<string, string> = {
  approved: '#059669', adjusted: '#0891B2', paid: '#059669', restored: '#059669',
  rejected: '#DC2626', deleted: '#DC2626', disputed: '#7C3AED',
  submitted: '#1D3095', resubmitted: '#1D3095', entered_by_office: '#1D3095',
};

const FILTERS: Array<{ key: string; label: string; actions?: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'posted', label: 'Posted', actions: 'submitted,resubmitted,entered_by_office' },
  { key: 'decisions', label: 'Reviews & decisions', actions: 'approved,rejected,adjusted,disputed,pay_decided,paid,unpaid' },
  { key: 'changes', label: 'Edits', actions: 'edited,modified,replaced' },
  { key: 'deleted', label: 'Deleted', actions: 'deleted,replaced' },
];

/** Fields worth naming when a row changed. Everything else is bookkeeping. */
const WATCHED: Array<[string, string]> = [
  ['hours', 'hours'], ['adjusted_hours', 'adjusted hours'], ['log_date', 'date'], ['description', 'description'],
  ['notes', 'notes'], ['lunch_minutes', 'lunch'], ['job_name', 'job'], ['work_type', 'activity'],
  ['rejection_reason', 'rejection reason'], ['adjustment_note', 'adjustment note'], ['total_pay', 'pay'],
];

function changedFields(e: HistoryEvent): string[] {
  if (!e.before_row || !e.after_row) return [];
  const out: string[] = [];
  for (const [key, label] of WATCHED) {
    const a = e.before_row[key];
    const b = e.after_row[key];
    if (String(a ?? '') !== String(b ?? '')) out.push(`${label}: ${a ?? '—'} → ${b ?? '—'}`);
  }
  return out;
}

const fmtHours = (h: number | string | null | undefined) => (h === null || h === undefined ? null : `${Number(h)}h`);

export default function HistoryTab() {
  const { data: session } = useSession();
  const admin = isAdminRoles((session?.user?.roles ?? []) as UserRole[]);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [employee, setEmployee] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [restoring, setRestoring] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [staff, setStaff] = useState<Array<{ email: string; name: string | null }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '500' });
      const f = FILTERS.find((x) => x.key === filter);
      if (f?.actions) params.set('action', f.actions);
      if (employee) params.set('email', employee);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/admin/time-logs/history?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setEvents(body.events ?? []);
      setNames(body.names ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the history.');
    } finally {
      setLoading(false);
    }
  }, [filter, employee, from, to]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!admin) return;
    fetch('/api/admin/employees/options')
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((b) => setStaff(b.employees ?? []))
      .catch(() => {});
  }, [admin]);

  const who = useCallback((email: string | null) => {
    if (!email) return 'Outside the app';
    return names[email.toLowerCase()] ?? email;
  }, [names]);

  const restore = async (e: HistoryEvent) => {
    const h = fmtHours(e.hours_before) ?? 'this entry';
    const warn = e.action === 'replaced'
      ? `\n\nThis entry was replaced by a resubmission. Restoring it may count the same day twice — check the employee's day after.`
      : '';
    if (!window.confirm(`Restore ${h} for ${who(e.employee_email)} on ${e.log_date}? It comes back exactly as it was (same status, notes and pay).${warn}`)) return;
    setRestoring(e.id);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/time-logs/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: e.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setNotice(`Restored ${h} for ${who(e.employee_email)} on ${e.log_date}.`);
      await load();
    } catch (err) {
      setNotice(`Could not restore: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setRestoring(null);
    }
  };

  // Grouped by day of the event, newest first, so "what happened on Saturday" reads top to bottom.
  const byDay = useMemo(() => {
    const m = new Map<string, HistoryEvent[]>();
    for (const e of events) {
      const day = new Date(e.created_at).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(e);
    }
    return [...m.entries()];
  }, [events]);

  return (
    <div className="tl-page">
      <p style={{ marginTop: 0, color: 'var(--theme-fg-secondary, #374151)', fontSize: '0.9rem' }}>
        {admin
          ? 'Every change to anybody’s hours: who posted them, who reviewed them, every edit and note, and every deletion. A deleted entry can be restored exactly as it was.'
          : 'Every change to your hours: when you posted them, who reviewed them, and what was decided.'}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', marginBottom: 12 }}>
        <div role="group" aria-label="Show" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`tl-btn tl-btn--sm${filter === f.key ? ' tl-btn--primary' : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {admin && (
          <label style={{ fontSize: '0.85rem' }}>
            Employee{' '}
            <select value={employee} onChange={(e) => setEmployee(e.target.value)}>
              <option value="">Everyone</option>
              {staff.map((s) => <option key={s.email} value={s.email}>{s.name || s.email}</option>)}
            </select>
          </label>
        )}
        <label style={{ fontSize: '0.85rem' }}>Day worked from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={{ fontSize: '0.85rem' }}>to <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      {notice && <div className="tl-pay-error" role="status" style={{ marginBottom: 12 }}>{notice}</div>}
      {error && <div className="tl-pay-error" role="alert">{error}</div>}
      {loading && <div className="tl-loading">Loading history…</div>}
      {!loading && !error && events.length === 0 && (
        <p className="tl-empty">
          Nothing recorded for this filter yet. History starts on 5 Oct 2026 — earlier changes were not tracked.
        </p>
      )}

      {!loading && byDay.map(([day, list]) => (
        <section key={day} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--theme-fg-muted, #6B7280)', margin: '0 0 6px' }}>{day}</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {list.map((e) => {
              const color = ACTION_COLOR[e.action] ?? 'var(--theme-fg-secondary, #374151)';
              const changes = changedFields(e);
              const canRestore = admin && (e.action === 'deleted' || e.action === 'replaced') && !e.restored_at && e.before_row;
              const hoursText = e.action === 'pay_decided'
                ? `${fmtHours(e.hours_after) ?? ''}${e.total_pay != null ? ` · $${Number(e.total_pay).toFixed(2)}` : ''}`
                : e.hours_before != null && e.hours_after != null && Number(e.hours_before) !== Number(e.hours_after)
                  ? `${fmtHours(e.hours_before)} → ${fmtHours(e.hours_after)}`
                  : fmtHours(e.hours_after ?? e.hours_before) ?? '';
              const reason = (e.after_row?.rejection_reason ?? e.after_row?.adjustment_note ?? e.note) as string | null | undefined;
              return (
                <li
                  key={e.id}
                  style={{
                    border: '1px solid var(--theme-border, #E5E7EB)',
                    borderLeft: `4px solid ${color}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    background: 'var(--theme-bg-surface, #fff)',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'baseline' }}>
                    <strong style={{ color }}>{ACTION_LABEL[e.action] ?? e.action}</strong>
                    <span>
                      <strong>{who(e.actor_email)}</strong>
                      {e.actor_email && e.actor_email.toLowerCase() !== e.employee_email.toLowerCase() && (
                        <> · for <strong>{who(e.employee_email)}</strong></>
                      )}
                    </span>
                    {e.log_date && <span>day worked {e.log_date}</span>}
                    {hoursText && <span>{hoursText}</span>}
                    {e.status_after && e.status_before !== e.status_after && <span>status: {e.status_before ?? 'new'} → {e.status_after}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--theme-fg-muted, #6B7280)' }}>
                      {new Date(e.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  {reason && <div style={{ fontSize: '0.85rem', marginTop: 2 }}>“{reason}”</div>}
                  {changes.length > 0 && (
                    <div style={{ fontSize: '0.82rem', marginTop: 2, color: 'var(--theme-fg-secondary, #374151)' }}>{changes.join(' · ')}</div>
                  )}
                  {(e.action === 'deleted' || e.action === 'replaced') && e.before_row && (
                    <div style={{ fontSize: '0.82rem', marginTop: 2, color: 'var(--theme-fg-secondary, #374151)' }}>
                      Was: {String(e.before_row.description ?? '')}
                      {e.before_row.notes ? ` — ${String(e.before_row.notes)}` : ''}
                      {e.before_row.lunch_minutes != null ? ` · lunch ${String(e.before_row.lunch_minutes)} min` : ''}
                    </div>
                  )}
                  {e.restored_at && (
                    <div style={{ fontSize: '0.82rem', marginTop: 2, color: 'var(--theme-success)' }}>
                      Restored by {who(e.restored_by ?? null)} on {new Date(e.restored_at).toLocaleString()}
                    </div>
                  )}
                  {canRestore && (
                    <button
                      type="button"
                      className="tl-btn tl-btn--sm tl-btn--primary"
                      style={{ marginTop: 6 }}
                      disabled={restoring === e.id}
                      onClick={() => void restore(e)}
                    >
                      {restoring === e.id ? 'Restoring…' : 'Restore these hours'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
