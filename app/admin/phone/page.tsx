// app/admin/phone/page.tsx — slice S1 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// The call log. Opens on what has not been dealt with, not on everything.
//
// ── WHY THE DEFAULT TAB IS "UNFILED" ────────────────────────────────────────────────────────────
//
// A phone log showing every call ever is a report; a list of calls not yet attached to a job is a
// worklist, and it gets to zero. The whole value of this screen is that the pile shrinks — so the
// pile is what it opens on.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, Voicemail, Search, Loader2, Settings } from 'lucide-react';
import Link from 'next/link';

import CallDetail from './CallDetail';
import {
  type AdminCallRow, formatPhone, formatDuration, formatWhen, voicemailReasonLabel, URGENCY_LABEL,
} from './call-types';
import './phone.css';

type View = 'unfiled' | 'unread' | 'voicemail' | 'all';

const VIEWS: Array<{ key: View; label: string; hint: string }> = [
  { key: 'unfiled', label: 'Not filed', hint: 'Calls not yet attached to a job' },
  { key: 'unread', label: 'Unread', hint: 'Nobody has opened these yet' },
  { key: 'voicemail', label: 'Voicemail', hint: 'Messages left on the machine' },
  { key: 'all', label: 'Everything', hint: 'Every call, newest first' },
];

export default function PhonePage() {
  const [view, setView] = useState<View>('unfiled');
  const [calls, setCalls] = useState<AdminCallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (view !== 'all') params.set('view', view);
      if (appliedSearch.trim()) {
        // A search box that only matched transcripts would miss the commonest query of all — a
        // phone number — so the number filter and the text filter are the same box, chosen by
        // whether what was typed looks like a number.
        const digits = appliedSearch.replace(/\D/g, '');
        if (digits.length >= 7) params.set('number', appliedSearch);
        else params.set('q', appliedSearch);
      }
      const res = await fetch(`/api/admin/phone/calls?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not load calls.');
      setCalls(body.calls ?? []);
      setTotal(body.total ?? 0);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [view, appliedSearch]);

  useEffect(() => { void load(); }, [load]);

  const empty = useMemo(() => {
    switch (view) {
      case 'unfiled': return 'Every call has been filed against a job. Nothing to do here.';
      case 'unread': return 'Everything has been read.';
      case 'voicemail': return 'No voicemails.';
      default: return 'No calls yet. Once the Twilio number points at this app, they will appear here.';
    }
  }, [view]);

  return (
    <div className="phonePage">
      <header className="phonePage__head">
        <div>
          <h1 className="phonePage__title"><Phone size={20} /> Calls</h1>
          <p className="phonePage__sub">Recorded, transcribed and summarised. {total} in this view.</p>
        </div>
        <Link href="/admin/phone/settings" className="btn btn--ghost">
          <Settings size={14} /> Hours &amp; forwarding
        </Link>
      </header>

      <div className="phonePage__tabs" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            title={v.hint}
            className={`phonePage__tab ${view === v.key ? 'is-active' : ''}`}
            onClick={() => { setView(v.key); setOpenId(null); }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <form
        className="phonePage__search"
        onSubmit={(e) => { e.preventDefault(); setAppliedSearch(search); }}
      >
        <Search size={15} aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="A phone number, a name, or something that was said"
          aria-label="Search calls"
        />
        {appliedSearch && (
          <button type="button" className="btn btn--small" onClick={() => { setSearch(''); setAppliedSearch(''); }}>
            Clear
          </button>
        )}
      </form>

      {error && <p className="phonePage__error">{error}</p>}

      <div className="phonePage__body">
        <ol className="phonePage__list">
          {loading && calls.length === 0 && (
            <li className="phonePage__muted"><Loader2 size={14} className="spin" /> Loading…</li>
          )}
          {!loading && calls.length === 0 && <li className="phonePage__muted">{empty}</li>}

          {calls.map((c) => {
            const other = c.direction === 'inbound' ? c.from_number : c.to_number;
            const who = c.summary_json?.caller ?? c.caller_name ?? formatPhone(other);
            const line = c.summary_json?.wanted ?? c.summary ?? null;
            const urgency = c.summary_json?.urgency;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`callRow ${openId === c.id ? 'is-open' : ''} ${c.reviewed_at ? '' : 'is-unread'}`}
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}
                  aria-expanded={openId === c.id}
                >
                  <span className="callRow__icon" aria-hidden>
                    {c.is_voicemail ? <Voicemail size={16} />
                      : c.direction === 'inbound' ? <PhoneIncoming size={16} />
                        : <PhoneOutgoing size={16} />}
                  </span>
                  <span className="callRow__main">
                    <span className="callRow__who">
                      {who}
                      {!c.reviewed_at && <span className="callRow__dot" aria-label="Unread" />}
                      {urgency && urgency !== 'routine' && (
                        <span className={`callRow__urgency callRow__urgency--${urgency}`}>{URGENCY_LABEL[urgency]}</span>
                      )}
                    </span>
                    <span className="callRow__line">
                      {line ?? (c.is_voicemail ? voicemailReasonLabel(c.voicemail_reason) : 'No summary')}
                    </span>
                  </span>
                  <span className="callRow__side">
                    <span className="callRow__when">{formatWhen(c.started_at)}</span>
                    <span className="callRow__dur">{formatDuration(c.duration_seconds ?? c.recording_seconds)}</span>
                    {c.job_id && <span className="callRow__filed">Filed</span>}
                  </span>
                </button>

                {openId === c.id && (
                  <CallDetail
                    callId={c.id}
                    onChanged={() => void load()}
                    onClose={() => setOpenId(null)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
