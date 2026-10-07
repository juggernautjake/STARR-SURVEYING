'use client';
// app/admin/calls/[id]/CallScreeningPanels.tsx — the number behind a call, what the call was, and
// who was told about it.
//
// Owner, 2026-10-06: "Build out all of the UI needed to review the call info and all of that" and
// "We really need fail safes so that we are not weeding out calls from actual or potential
// customers."
//
// So every automatic decision is visible here with its reason, and every one can be undone from
// this page in one tap: "This was a real person" makes the number ring through from the next call;
// "Always ring" overrides every rule for good. Blocking is the one action that asks twice, and it
// warns when the number has had real conversations with us.
import Link from 'next/link';
import { useState } from 'react';
import type { PhoneCall } from '@/lib/receptionist/calls';
import type { RegistryEntry } from '@/lib/receptionist/registry';
import {
  SCREENING_HELP, SCREENING_LABEL, STATUS_LABEL, VERDICT_LABEL, treatmentText,
} from '@/lib/receptionist/screening-labels';

export interface OtherCall {
  id: string;
  started_at: string;
  answered_by: string | null;
  caller_verdict: string | null;
  screened_as: string | null;
  duration_seconds: number | null;
  summary: string | null;
}

const SCREEN_ORDER = ['auto', 'always_ring', 'voicemail', 'block'] as const;
type ScreenChoice = (typeof SCREEN_ORDER)[number];
const MARKS = [
  ['person', 'A real person'],
  ['robocall', 'A robocall'],
  ['silent', 'Silent / nobody there'],
  ['spam', 'Spam or sales'],
] as const;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function countsLine(n: RegistryEntry): string {
  const c = n.counts;
  if (!c) return '';
  const bits = [
    c.person ? `${c.person} real` : null,
    c.robocall ? `${c.robocall} robocall${c.robocall === 1 ? '' : 's'}` : null,
    c.silent ? `${c.silent} silent` : null,
    c.spam ? `${c.spam} spam` : null,
    c.hangup ? `${c.hangup} hung up` : null,
    c.screened ? `${c.screened} screened` : null,
    c.blocked ? `${c.blocked} blocked` : null,
  ].filter(Boolean);
  const total = n.timesCalled ?? 0;
  return `${total} ${total === 1 ? 'call' : 'calls'}${bits.length ? ` — ${bits.join(' · ')}` : ''}`;
}

export function ThisNumberPanel(props: {
  call: PhoneCall;
  number: RegistryEntry | null;
  region: string | null;
  /** Why the origin is worth a second look (toll-free, Caribbean), or null. */
  originNote?: string | null;
  otherCalls: OtherCall[];
  onChanged: () => void;
  onError: (msg: string) => void;
}): React.ReactElement {
  const { call, number, region, originNote, otherCalls, onChanged, onError } = props;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const current: ScreenChoice = (number?.screening ?? 'auto') as ScreenChoice;
  const phoneDigits = (call.from_number ?? '').replace(/\D/g, '').slice(-10);
  const isPhone = /^\d{10}$/.test(phoneDigits) && !/^[a-z]+:/i.test(call.from_number);
  const knownGood = number?.status === 'person' || number?.status === 'customer';

  async function choose(screening: ScreenChoice): Promise<void> {
    if (screening === 'block' && !confirmBlock) { setConfirmBlock(true); return; }
    setBusy(screening);
    setConfirmBlock(false);
    try {
      const r = await fetch('/api/admin/caller-registry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits, screening }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok || j.error) { onError(j.error ?? 'That did not save.'); return; }
      onChanged();
    } finally { setBusy(null); }
  }

  if (!isPhone) {
    return (
      <section className="call-panel" data-testid="call-number-panel">
        <h2 className="call-panel__title">This number</h2>
        <p className="call-panel__empty">A browser or app call — there is no phone number to screen.</p>
      </section>
    );
  }

  return (
    <section className="call-panel" data-testid="call-number-panel">
      <h2 className="call-panel__title">This number</h2>
      <div className="cnum__head">
        <div>
          <p className="cnum__name">{number?.displayName || 'No name yet'}{number?.company ? ` · ${number.company}` : ''}</p>
          <p className="cnum__meta">
            {region ?? ''}
            {number?.id ? <> · <span title={number.id}>ID {number.id.slice(0, 8)}</span></> : null}
          </p>
        </div>
        {number?.status ? (
          <span className={`pill pill--s-${number.status}`} title={number.statusReason ?? undefined}>{STATUS_LABEL[number.status]}</span>
        ) : null}
      </div>

      {originNote ? <p className="cnum__note" role="note">{originNote}</p> : null}

      {number?.links?.label ? (
        <p className="cnum__links">
          {number.links.label}
          {number.links.jobId ? <> · <Link href={`/admin/jobs/${number.links.jobId}`}>Open job</Link></> : null}
          {number.links.leadId ? <> · <Link href={`/admin/leads/${number.links.leadId}`}>Open lead</Link></> : null}
        </p>
      ) : null}

      <p className="cnum__line"><b>Right now:</b> {number ? treatmentText(number) : 'Rings normally'}{number?.statusReason ? ` — ${number.statusReason}` : ''}</p>
      {number ? <p className="cnum__line">{countsLine(number)}</p> : null}

      <div className="cnum__choices" role="group" aria-label="How the line treats this number">
        {SCREEN_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            className={`call-detail__btn${current === s ? ' call-detail__btn--primary' : ''}`}
            aria-pressed={current === s}
            disabled={busy !== null}
            data-testid={`call-screen-${s}`}
            onClick={() => void choose(s)}
          >
            {busy === s ? 'Saving…' : SCREENING_LABEL[s]}
          </button>
        ))}
      </div>
      <p className="cnum__help">{SCREENING_HELP[current]}</p>
      {confirmBlock ? (
        <div className="cnum__confirm" role="alert" data-testid="call-block-confirm">
          <p>
            Block {call.from_number}? It will be refused before anything rings, and nobody will be told.
            {knownGood ? ' This number has had real conversations with us — are you sure it is not a customer?' : ''}
          </p>
          <button type="button" className="call-detail__btn cnum__danger" onClick={() => void choose('block')}>Yes, block it</button>
          <button type="button" className="call-detail__btn" onClick={() => setConfirmBlock(false)}>Cancel</button>
        </div>
      ) : null}

      <p className="cnum__line">
        <Link href={`/admin/calls/registry?phone=${phoneDigits}`}>Edit name, company and notes →</Link>
      </p>

      {otherCalls.length ? (
        <>
          <b className="cnum__sub">Other calls from this number</b>
          <ul className="cnum__others">
            {otherCalls.slice(0, 6).map((o) => (
              <li key={o.id}>
                <Link href={`/admin/calls/${o.id}`}>{shortDate(o.started_at)}</Link>
                {' — '}
                {o.caller_verdict ? VERDICT_LABEL[o.caller_verdict] ?? o.caller_verdict : o.answered_by ?? 'in progress'}
                {o.screened_as === 'voicemail' ? ' · screened' : o.screened_as === 'blocked' ? ' · blocked' : ''}
              </li>
            ))}
          </ul>
          {otherCalls.length > 6 ? <p className="cnum__line"><Link href={`/admin/calls?search=${phoneDigits}`}>All {otherCalls.length + 1} calls →</Link></p> : null}
        </>
      ) : <p className="cnum__line">First call from this number.</p>}
    </section>
  );
}

export function VerdictPanel(props: { call: PhoneCall; onChanged: () => void; onError: (msg: string) => void }): React.ReactElement {
  const { call, onChanged, onError } = props;
  const [busy, setBusy] = useState<string | null>(null);
  const v = call.caller_verdict ?? null;

  async function mark(verdict: string): Promise<void> {
    setBusy(verdict);
    try {
      const r = await fetch(`/api/admin/calls/${call.id}/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok || j.error) { onError(j.error ?? 'That did not save.'); return; }
      onChanged();
    } finally { setBusy(null); }
  }

  if (call.is_test) return <></>;
  return (
    <section className="call-panel" data-testid="call-verdict-panel">
      <h2 className="call-panel__title">What was this call?</h2>
      <p className="cnum__line">
        {v ? <span className={`pill pill--v-${v}`}>{VERDICT_LABEL[v] ?? v}</span> : <span className="pill">Not judged yet</span>}
        {' '}{call.verdict_reason ?? (v ? '' : 'It is judged once the transcript or voicemail arrives.')}
      </p>
      {call.screen_reason && call.screened_as && call.screened_as !== 'rang' ? (
        <p className="cnum__line"><b>{call.screened_as === 'blocked' ? 'Blocked' : 'Screened to voicemail'}:</b> {call.screen_reason}</p>
      ) : null}
      <p className="cnum__help">Wrong? Say what it really was. A real person makes this number ring through from the next call on; your answer is never overwritten by the automatic rules.</p>
      <div className="cnum__choices" role="group" aria-label="What this call really was">
        {MARKS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`call-detail__btn${v === key ? ' call-detail__btn--primary' : ''}`}
            aria-pressed={v === key}
            disabled={busy !== null}
            data-testid={`call-mark-${key}`}
            onClick={() => void mark(key)}
          >
            {busy === key ? 'Saving…' : label}
          </button>
        ))}
      </div>
    </section>
  );
}

const CHANNEL: Record<string, string> = { bell: 'App notification', email: 'Email', text: 'Text message' };

export function NoticesPanel({ call }: { call: PhoneCall }): React.ReactElement {
  if (call.is_test) return <></>;
  const log = Array.isArray(call.notify_log) ? call.notify_log : [];
  return (
    <section className="call-panel" data-testid="call-notices-panel">
      <h2 className="call-panel__title">Who was told</h2>
      <ul className="cnum__others">
        <li>
          <b>App notification:</b>{' '}
          {call.belled_at ? `sent ${shortDate(call.belled_at)}, one per admin` : 'none'}
        </li>
        <li>
          <b>Email:</b>{' '}
          {call.emailed_at
            ? (log.some((l) => l.channel === 'email' && l.ok)
              ? `sent ${shortDate(call.emailed_at)}`
              : log.some((l) => l.channel === 'email')
                ? 'not sent — nothing worth telling (see below)'
                : `dealt with ${shortDate(call.emailed_at)} (before this record was kept)`)
            : 'not sent yet — it waits for the summary, at most about 20 minutes'}
        </li>
      </ul>
      {log.length ? (
        <ul className="cnum__log">
          {log.map((l, i) => (
            <li key={i}>{shortDate(l.at)} · {CHANNEL[l.channel] ?? l.channel}{l.detail ? ` — ${l.detail}` : ''}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
