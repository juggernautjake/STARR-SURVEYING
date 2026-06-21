'use client';
// app/admin/time-off/page.tsx
//
// Time-off requests — employees create pending requests; admins approve or
// deny them. Approved requests become real time_off events on the schedule
// (status='approved'); pending/denied ones are hidden from the calendar by
// the GET /api/admin/schedule status filter.
//
// Backed by app/api/admin/time-off/route.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePageError } from '../hooks/usePageError';
import { ptoHoursForRequest } from '@/lib/schedule/pto-hours';

interface TimeOffRequest {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  notes: string | null;
  assigned_to: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
}

const STATUS_COLOR: Record<TimeOffRequest['status'], string> = {
  pending:  '#D97706',
  approved: '#059669',
  denied:   '#DC2626',
};

function fmtRange(r: TimeOffRequest): string {
  const s = new Date(r.start_time);
  const e = new Date(r.end_time);
  if (r.all_day) {
    return s.toLocaleDateString() === e.toLocaleDateString()
      ? `${s.toLocaleDateString()} (all day)`
      : `${s.toLocaleDateString()} → ${e.toLocaleDateString()}`;
  }
  return `${s.toLocaleString()} → ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function TimeOffPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('TimeOffPage');
  const isAdmin = (session?.user?.roles ?? []).includes('admin');

  const [mine, setMine] = useState<TimeOffRequest[]>([]);
  const [queue, setQueue] = useState<TimeOffRequest[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ start_date: '', end_date: '', all_day: true, start_time: '08:00', end_time: '17:00', notes: '' });

  const loadAll = useCallback(async () => {
    const mineRes = await safeFetch<{ requests: TimeOffRequest[] }>('/api/admin/time-off');
    setMine(mineRes?.requests ?? []);
    const ptoRes = await safeFetch<{ balance: { balance_hours: number | string } | null }>('/api/admin/pto');
    setBalance(ptoRes?.balance ? Number(ptoRes.balance.balance_hours) : null);
    if (isAdmin) {
      const queueRes = await safeFetch<{ requests: TimeOffRequest[] }>('/api/admin/time-off?queue=1');
      setQueue(queueRes?.requests ?? []);
    }
  }, [safeFetch, isAdmin]);

  // Live preview of how many PTO hours the open form would deduct.
  // Matches the server's calc in /api/admin/time-off PATCH (Slice 33).
  const requestedHours = useMemo(() => {
    if (!form.start_date || !form.end_date) return 0;
    const startIso = form.all_day
      ? `${form.start_date}T00:00`
      : `${form.start_date}T${form.start_time}`;
    const endIso = form.all_day
      ? `${form.end_date}T23:59`
      : `${form.end_date}T${form.end_time}`;
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
    return ptoHoursForRequest({ startTime: start, endTime: end, allDay: form.all_day });
  }, [form.start_date, form.end_date, form.start_time, form.end_time, form.all_day]);

  const overBalance = balance !== null && requestedHours > balance;
  useEffect(() => { if (session?.user) void loadAll(); }, [session?.user, loadAll]);

  async function submit() {
    if (!form.start_date || !form.end_date || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`;
        setError(msg);
        return;
      }
      setShowForm(false);
      setForm({ start_date: '', end_date: '', all_day: true, start_time: '08:00', end_time: '17:00', notes: '' });
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function decide(id: string, status: 'approved' | 'denied') {
    const res = await fetch('/api/admin/time-off', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`;
      setError(msg);
      return;
    }
    await loadAll();
  }

  if (!session?.user) return null;

  return (
    <div style={{ maxWidth: 980, padding: '1.5rem' }}>
      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.6rem', margin: '0 0 0.25rem' }}>Time Off</h1>
        <p style={{ color: '#4B5563', margin: 0 }}>
          Request days off — they appear on the team schedule once approved.
        </p>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          style={{ padding: '0.5rem 0.9rem', background: 'var(--color-brand-navy)', color: '#FFF', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          {showForm ? 'Cancel' : '+ Request time off'}
        </button>
        {balance !== null && (
          <span style={{ padding: '0.35rem 0.7rem', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 999, fontSize: '0.8rem', color: '#374151' }}>
            PTO balance: <strong style={{ color: balance > 0 ? 'var(--color-brand-navy)' : 'var(--color-error)' }}>{balance.toFixed(1)} h</strong>
          </span>
        )}
      </div>

      {showForm && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '0.75rem' }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Start date *</span>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>End date *</span>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
            </label>
            <label style={{ ...fieldStyle, flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
              <input type="checkbox" checked={form.all_day} onChange={e => setForm(f => ({ ...f, all_day: e.target.checked }))} />
              <span style={{ fontSize: '0.85rem' }}>All day</span>
            </label>
            {!form.all_day && (
              <>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Start time</span>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={inputStyle} />
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>End time</span>
                  <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} />
                </label>
              </>
            )}
            <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Reason / notes</span>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </label>
          </div>
          {requestedHours > 0 && (
            <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.8rem', background: overBalance ? '#FEF2F2' : '#F3F4F6', border: `1px solid ${overBalance ? 'var(--color-error)' : '#E5E7EB'}`, color: overBalance ? 'var(--color-error)' : '#374151' }}>
              Requesting <strong>{requestedHours.toFixed(1)} h</strong>
              {balance !== null && (overBalance
                ? <> · exceeds your {balance.toFixed(1)} h balance by {(requestedHours - balance).toFixed(1)} h. You can still submit; an admin will decide.</>
                : <> · {(balance - requestedHours).toFixed(1)} h would remain after approval.</>
              )}
            </div>
          )}
          <div style={{ marginTop: '0.75rem' }}>
            <button type="button" disabled={saving || !form.start_date || !form.end_date} onClick={() => void submit()}
              style={{ padding: '0.45rem 0.9rem', background: 'var(--color-brand-navy)', color: '#FFF', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
              {saving ? 'Submitting…' : 'Submit request'}
            </button>
            {error && <span style={{ marginLeft: '0.75rem', color: 'var(--color-error)', fontSize: '0.85rem' }}>{error}</span>}
          </div>
        </div>
      )}

      <section style={{ marginTop: '2rem' }}>
        <h2 style={sectionTitle}>My requests</h2>
        {mine.length === 0 ? (
          <p style={emptyStyle}>You haven&apos;t submitted any requests yet.</p>
        ) : (
          <RequestTable rows={mine} mine />
        )}
      </section>

      {isAdmin && (
        <section style={{ marginTop: '2rem' }}>
          <h2 style={sectionTitle}>Pending approvals</h2>
          {queue.length === 0 ? (
            <p style={emptyStyle}>No pending requests. <Link href="/admin/schedule" style={{ color: 'var(--color-brand-navy)' }}>View schedule →</Link></p>
          ) : (
            <RequestTable rows={queue} onApprove={(id) => void decide(id, 'approved')} onDeny={(id) => void decide(id, 'denied')} />
          )}
        </section>
      )}
    </div>
  );
}

function RequestTable({
  rows, mine, onApprove, onDeny,
}: {
  rows: TimeOffRequest[];
  mine?: boolean;
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 8 }}>
      <thead style={{ background: '#F9FAFB' }}>
        <tr>
          {!mine && <th style={th}>Employee</th>}
          <th style={th}>When</th>
          <th style={th}>Notes</th>
          <th style={th}>Status</th>
          {!mine && <th style={th}>Action</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ borderTop: '1px solid #F3F4F6' }}>
            {!mine && <td style={td}>{r.assigned_to}</td>}
            <td style={td}>{fmtRange(r)}</td>
            <td style={td}>{r.notes || '—'}</td>
            <td style={td}>
              <span style={{ color: STATUS_COLOR[r.status], fontWeight: 600 }}>
                {r.status.toUpperCase()}
              </span>
            </td>
            {!mine && (
              <td style={td}>
                {r.status === 'pending' ? (
                  <>
                    <button type="button" onClick={() => onApprove?.(r.id)} style={btnApprove}>Approve</button>
                    <button type="button" onClick={() => onDeny?.(r.id)} style={btnDeny}>Deny</button>
                  </>
                ) : '—'}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.25rem' };
const labelStyle: React.CSSProperties = { fontSize: '0.75rem', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 };
// F3 (pattern #3): pin every control to the 36px baseline + border-box so
// native date/time pickers (taller intrinsic calendar chrome) line up with
// text inputs in the form grid instead of overhanging them.
const inputStyle: React.CSSProperties = { height: 36, boxSizing: 'border-box', padding: '0 0.6rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '0.85rem', lineHeight: '1.2' };
const sectionTitle: React.CSSProperties = { fontSize: '1.05rem', fontWeight: 600, margin: '0 0 0.5rem' };
const emptyStyle: React.CSSProperties = { padding: '1rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, color: '#6B7280', fontSize: '0.85rem' };
const th: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600, color: '#4B5563' };
const td: React.CSSProperties = { padding: '0.5rem 0.75rem', verticalAlign: 'top' };
const btnApprove: React.CSSProperties = { marginRight: 8, padding: '0.3rem 0.6rem', background: '#059669', color: '#FFF', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 };
const btnDeny: React.CSSProperties = { padding: '0.3rem 0.6rem', background: '#FFF', color: 'var(--color-error)', border: '1px solid var(--color-error)', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 };
