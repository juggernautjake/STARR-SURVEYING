'use client';
// /admin/calls — every call to the business line, newest first.
import '../styles/AdminCalls.css';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePageError } from '../hooks/usePageError';
import type { PhoneCall } from '@/lib/receptionist/calls';

type Filter = 'all' | 'customer' | 'ai' | 'owner' | 'voicemail' | 'none' | 'test';

function when(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}
function fmtPhone(e164: string): string {
  const d = (e164 ?? '').replace(/\D/g, '');
  return d.length === 11 ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : e164;
}
function dur(s: number | null): string {
  if (!s) return '';
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}
const HOW: Record<string, string> = { owner: 'Hank answered', ai: 'Receptionist', voicemail: 'Voicemail', none: 'Missed' };

export default function CallsPage(): React.ReactElement {
  const [calls, setCalls] = useState<PhoneCall[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const { reportPageError } = usePageError('CallsPage');

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/calls?limit=200')
      .then((r) => r.json())
      .then((j: { calls?: PhoneCall[]; error?: string }) => { if (!alive) return; if (j.error) reportPageError(j.error); setCalls(j.calls ?? []); })
      .catch((e: Error) => reportPageError(e));
    return () => { alive = false; };
  }, [reportPageError]);

  const shown = useMemo(() => {
    if (!calls) return [];
    // Test calls from /admin/dev/receptionist live under their own filter so the log reads as customers.
    if (filter === 'test') return calls.filter((c) => c.is_test);
    const real = calls.filter((c) => !c.is_test);
    if (filter === 'all') return real;
    if (filter === 'customer') return real.filter((c) => c.kind === 'customer' || c.analysis?.caller_type === 'customer' || c.analysis?.caller_type === 'existing_client');
    return real.filter((c) => c.answered_by === filter);
  }, [calls, filter]);

  const filters: Array<[Filter, string]> = [['all', 'All'], ['customer', 'Customers'], ['ai', 'Receptionist'], ['owner', 'Hank answered'], ['voicemail', 'Voicemail'], ['none', 'Missed'], ['test', 'Test calls']];

  return (
    <div className="calls-page">
      <div className="calls-page__head">
        <div>
          <h1 className="calls-page__title">Calls</h1>
          <p className="calls-page__sub">Every call to the business line. Click one to listen, read the transcript, and turn it into a lead or project.</p>
        </div>
        <div className="calls-page__filters" role="group" aria-label="Filter calls">
          {filters.map(([f, label]) => (
            <button key={f} type="button" className="calls-page__filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
      </div>

      {calls === null ? (
        <p className="call-panel__empty">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__title">No calls yet</div>
          <div className="admin-empty__desc">Calls to the business line show up here as they happen, with the recording and transcript once the call ends.</div>
        </div>
      ) : (
        <div className="calls-list">
          {shown.map((c) => {
            const w = when(c.started_at);
            const attention = (c.analysis?.urgency === 'high') || (c.answered_by === 'none');
            return (
              <Link key={c.id} href={`/admin/calls/${c.id}`} className={`call-card${attention ? ' call-card--attention' : ''}`}>
                <div className="call-card__when">{w.day}<br />{w.time}</div>
                <div>
                  <p className="call-card__title">{c.caller_name || fmtPhone(c.from_number)}{c.caller_name ? <span style={{ opacity: .6, fontWeight: 400 }}> · {fmtPhone(c.from_number)}</span> : null}</p>
                  <p className="call-card__summary">{c.analysis?.summary || c.summary || (c.transcript?.length ? c.transcript[0]?.text : 'No transcript yet.')}</p>
                  <div className="call-card__meta">
                    {c.is_test ? <span className="pill pill--test">Test</span> : null}
                    {c.kind ? <span className={`pill pill--${c.kind}`}>{c.kind}</span> : null}
                    {c.answered_by ? <span className={`pill pill--${c.answered_by}`}>{HOW[c.answered_by] ?? c.answered_by}</span> : null}
                    {c.analysis?.urgency === 'high' ? <span className="pill pill--high">urgent</span> : null}
                    {c.lead_id ? <span className="pill">lead</span> : null}
                    {c.recording_url ? <span className="pill">recording</span> : null}
                  </div>
                </div>
                <div className="call-card__side">
                  <span>{dur(c.duration_seconds)}</span>
                  {c.service ? <span>{c.service}</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
