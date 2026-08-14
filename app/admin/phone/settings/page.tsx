// app/admin/phone/settings/page.tsx — slice I1 of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Owner, 2026-08-14: *"I want to be able to set the hours for calling."*
//
// ── THE SCREEN SHOWS WHETHER IT IS OPEN RIGHT NOW ───────────────────────────────────────────────
//
// Above the form, before anything else. Time-zone and boundary bugs in this rule are silent — the
// only symptom is a caller reaching voicemail at a time somebody believed the office was open, and
// nobody is watching when that happens. A live "open / closed, and here is the local time we think
// it is" readout turns an invisible failure into an obvious one the moment the page is opened.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Save, Loader2, AlertTriangle, Check, Phone, Plus, X } from 'lucide-react';
import Link from 'next/link';
import '../phone.css';
import './settings.css';

interface HoursWindow { open: string; close: string }

interface PhoneHours {
  timeZone: string;
  days: HoursWindow[][];
  holidays: string[];
  forwardTo: string[];
  ringSeconds: number;
  greeting: string;
  afterHoursGreeting: string;
  enabled: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function PhoneSettingsPage() {
  const [hours, setHours] = useState<PhoneHours | null>(null);
  const [health, setHealth] = useState<{ ready?: { canReceive: boolean; canPlace: boolean; missing: string[]; warnings: string[] }; config?: Record<string, unknown>; hours?: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        fetch('/api/admin/phone/settings').then((r) => r.json()),
        fetch('/api/admin/phone/health').then((r) => r.json()),
      ]);
      if (s.error) throw new Error(s.error);
      setHours(s.hours);
      setHealth(h);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (!hours) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/phone/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'That did not save.');
      setHours(out.hours);
      // Warnings are surfaced rather than swallowed: the API drops time ranges it cannot read, and
      // a day quietly emptying itself with no explanation is worse than a refusal.
      setNotice(
        out.warnings?.length
          ? `Saved, with changes: ${out.warnings.join(' ')}`
          : `Saved. The office is ${out.openNow ? 'open' : 'closed'} right now.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [hours, load]);

  const setDay = (dayIndex: number, windows: HoursWindow[]) => {
    setHours((h) => (h ? { ...h, days: h.days.map((d, i) => (i === dayIndex ? windows : d)) } : h));
  };

  if (loading) {
    return <div className="phonePage"><p className="phonePage__muted"><Loader2 size={14} className="spin" /> Loading…</p></div>;
  }
  if (!hours) {
    return <div className="phonePage"><p className="phonePage__error">{error ?? 'Settings could not be loaded.'}</p></div>;
  }

  const ready = health?.ready;
  const cfg = (health?.config ?? {}) as Record<string, string | null>;
  const live = (health?.hours ?? {}) as Record<string, unknown>;

  return (
    <div className="phonePage">
      <header className="phonePage__head">
        <div>
          <h1 className="phonePage__title"><Clock size={20} /> Phone hours &amp; forwarding</h1>
          <p className="phonePage__sub">
            Calls inside these hours ring the numbers below. Everything else goes to voicemail.
          </p>
        </div>
        <Link href="/admin/phone" className="btn btn--ghost">Back to calls</Link>
      </header>

      {/* The live readout — see the header comment. */}
      <div className={`phoneStatus ${live.openNow ? 'is-open' : 'is-closed'}`}>
        <strong>{live.openNow ? 'Open now' : 'Closed now'}</strong>
        <span>
          It is {String(live.localTime ?? '—')} on {String(live.localDate ?? '—')} in {String(live.timeZone ?? hours.timeZone)}.
          {!live.openNow && live.closedReason ? ` (${String(live.closedReason).replace(/_/g, ' ')})` : ''}
        </span>
        {/* If this clock disagrees with the clock on the wall, the time zone is wrong — and that is
            otherwise completely invisible. */}
      </div>

      {ready && (!ready.canReceive || !ready.canPlace) && (
        <p className="phonePage__error">
          <AlertTriangle size={14} />{' '}
          {!ready.canReceive
            ? 'This deployment cannot receive calls yet.'
            : 'This deployment can receive calls but cannot place them.'}
          {ready.missing.length > 0 && ` Missing: ${ready.missing.join(', ')}.`}
        </p>
      )}
      {ready?.warnings?.map((w) => (
        <p key={w} className="phoneWarn"><AlertTriangle size={13} /> {w}</p>
      ))}

      {cfg.voiceWebhookUrl && (
        <div className="phoneHint">
          <p>Point the Twilio number at these:</p>
          <code>{cfg.voiceWebhookUrl}</code>
          <code>{cfg.statusWebhookUrl}</code>
        </div>
      )}

      {error && <p className="phonePage__error"><AlertTriangle size={14} /> {error}</p>}
      {notice && <p className="callDetail__notice"><Check size={14} /> {notice}</p>}

      <section className="phoneCard">
        <label className="phoneToggle">
          <input
            type="checkbox"
            checked={hours.enabled}
            onChange={(e) => setHours({ ...hours, enabled: e.target.checked })}
          />
          <span>Ring the office during the hours below</span>
        </label>
        <p className="phonePage__muted">
          Turn this off to send every call straight to voicemail — for a closure, or a day nobody is in.
        </p>
      </section>

      <section className="phoneCard">
        <h2 className="phoneCard__h2">Opening hours</h2>
        {DAY_NAMES.map((name, i) => {
          const windows = hours.days[i] ?? [];
          return (
            <div key={name} className="phoneDay">
              <span className="phoneDay__name">{name}</span>
              <div className="phoneDay__windows">
                {windows.length === 0 && <span className="phonePage__muted">Closed</span>}
                {windows.map((w, wi) => (
                  <span key={wi} className="phoneDay__window">
                    <input
                      type="time"
                      value={w.open}
                      aria-label={`${name} opening time`}
                      onChange={(e) => setDay(i, windows.map((x, xi) => (xi === wi ? { ...x, open: e.target.value } : x)))}
                    />
                    <span aria-hidden>–</span>
                    <input
                      type="time"
                      value={w.close}
                      aria-label={`${name} closing time`}
                      onChange={(e) => setDay(i, windows.map((x, xi) => (xi === wi ? { ...x, close: e.target.value } : x)))}
                    />
                    <button
                      type="button"
                      className="btn btn--small btn--ghost"
                      aria-label={`Remove this ${name} range`}
                      onClick={() => setDay(i, windows.filter((_, xi) => xi !== wi))}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => setDay(i, [...windows, { open: '08:00', close: '17:00' }])}
                >
                  <Plus size={13} /> {windows.length === 0 ? 'Open this day' : 'Another range'}
                </button>
              </div>
            </div>
          );
        })}
        <p className="phonePage__muted">
          A call at exactly the closing time goes to voicemail — 08:00–17:00 means the last call
          answered is at 16:59.
        </p>
      </section>

      <section className="phoneCard">
        <h2 className="phoneCard__h2"><Phone size={15} /> Numbers to ring</h2>
        <p className="phonePage__muted">
          Rung in order during opening hours. These are also the only numbers “Call back” will ring
          you on.
        </p>
        {hours.forwardTo.map((n, i) => (
          <div key={i} className="phoneRowInput">
            <input
              type="tel"
              value={n}
              placeholder="(512) 555-0143"
              aria-label={`Number ${i + 1}`}
              onChange={(e) => setHours({ ...hours, forwardTo: hours.forwardTo.map((x, xi) => (xi === i ? e.target.value : x)) })}
            />
            <button
              type="button"
              className="btn btn--small btn--ghost"
              aria-label={`Remove number ${i + 1}`}
              onClick={() => setHours({ ...hours, forwardTo: hours.forwardTo.filter((_, xi) => xi !== i) })}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn--small"
          onClick={() => setHours({ ...hours, forwardTo: [...hours.forwardTo, ''] })}
        >
          <Plus size={13} /> Add a number
        </button>

        <label className="phoneField">
          <span>Ring for</span>
          <input
            type="number"
            min={5}
            max={120}
            value={hours.ringSeconds}
            onChange={(e) => setHours({ ...hours, ringSeconds: Number(e.target.value) })}
          />
          <span>seconds before voicemail</span>
        </label>
      </section>

      <section className="phoneCard">
        <h2 className="phoneCard__h2">What callers hear</h2>
        <label className="phoneField phoneField--stack">
          <span>During opening hours</span>
          <textarea
            rows={2}
            value={hours.greeting}
            onChange={(e) => setHours({ ...hours, greeting: e.target.value })}
          />
        </label>
        <label className="phoneField phoneField--stack">
          <span>When closed, or nobody answers</span>
          <textarea
            rows={3}
            value={hours.afterHoursGreeting}
            onChange={(e) => setHours({ ...hours, afterHoursGreeting: e.target.value })}
          />
        </label>
        <p className="phonePage__muted">
          Every caller is told the call may be recorded before either of these plays.
        </p>
      </section>

      <section className="phoneCard">
        <h2 className="phoneCard__h2">Time zone</h2>
        <input
          type="text"
          className="phoneWide"
          value={hours.timeZone}
          aria-label="Time zone"
          onChange={(e) => setHours({ ...hours, timeZone: e.target.value })}
        />
        <p className="phonePage__muted">
          An IANA name such as America/Chicago. Daylight saving is handled for you.
        </p>
      </section>

      <div className="phoneSave">
        <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save
        </button>
      </div>
    </div>
  );
}
