'use client';
// /admin/calls/[id] — one call: listen, read, act.
import '../../styles/AdminCalls.css';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import type { PhoneCall } from '@/lib/receptionist/calls';

function fmtPhone(e164: string | null): string {
  const d = (e164 ?? '').replace(/\D/g, '');
  return d.length === 11 ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : e164 ?? '';
}
const HOW: Record<string, string> = { owner: 'Hank answered', ai: 'Receptionist handled it', voicemail: 'Left a voicemail', none: 'Missed' };
const WHO: Record<string, string> = { caller: 'Caller', assistant: 'Ellie', owner: 'Hank' };

export default function CallPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { reportPageError } = usePageError('CallDetailPage');
  const [call, setCall] = useState<PhoneCall | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/calls/${id}`);
    const j = (await r.json()) as { call?: PhoneCall; error?: string };
    if (j.error) reportPageError(j.error);
    setCall(j.call ?? null);
  }, [id, reportPageError]);

  useEffect(() => { void load(); }, [load]);

  async function createLead(thenProject: boolean): Promise<void> {
    setBusy(thenProject ? 'project' : 'lead');
    try {
      const r = await fetch(`/api/admin/calls/${id}/lead`, { method: 'POST' });
      const j = (await r.json()) as { leadId?: string; error?: string };
      if (j.error || !j.leadId) { reportPageError(j.error ?? 'Could not create the lead'); return; }
      if (thenProject) router.push(`/admin/jobs/new?fromLead=${encodeURIComponent(j.leadId)}`);
      else router.push(`/admin/leads/${j.leadId}`);
    } finally { setBusy(null); }
  }

  if (!call) return <p className="call-panel__empty">Loading…</p>;
  const a = call.analysis;
  const started = new Date(call.started_at);

  return (
    <div className="call-detail">
      <div className="call-detail__header">
        <div>
          <Link href="/admin/calls" className="call-detail__back">← All calls</Link>
          <h1 className="call-detail__title">{call.caller_name || fmtPhone(call.from_number)}</h1>
          <div className="call-card__meta">
            {call.kind ? <span className={`pill pill--${call.kind}`}>{call.kind}</span> : null}
            {call.answered_by ? <span className={`pill pill--${call.answered_by}`}>{HOW[call.answered_by] ?? call.answered_by}</span> : null}
            {a?.urgency === 'high' ? <span className="pill pill--high">urgent</span> : null}
            {a?.sentiment === 'frustrated' ? <span className="pill pill--high">frustrated</span> : null}
          </div>
          <dl className="call-detail__facts">
            <dt>When</dt><dd>{started.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{call.duration_seconds ? ` · ${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s` : ''}</dd>
            <dt>From</dt><dd><a href={`tel:${call.from_number}`}>{fmtPhone(call.from_number)}</a></dd>
            {call.callback_number && call.callback_number !== call.from_number ? <><dt>Callback</dt><dd><a href={`tel:${call.callback_number}`}>{fmtPhone(call.callback_number)}</a></dd></> : null}
            {call.property_address ? <><dt>Property</dt><dd>{call.property_address}</dd></> : null}
            {call.service ? <><dt>Needs</dt><dd>{call.service}</dd></> : null}
            {call.details ? <><dt>Notes</dt><dd>{call.details}</dd></> : null}
          </dl>
        </div>
        <div className="call-detail__actions">
          {call.lead_id ? (
            <>
              <Link href={`/admin/leads/${call.lead_id}`} className="call-detail__btn">Open lead</Link>
              <Link href={`/admin/jobs/new?fromLead=${encodeURIComponent(call.lead_id)}`} className="call-detail__btn call-detail__btn--primary">Create project from this call</Link>
            </>
          ) : (
            <>
              <button type="button" className="call-detail__btn" disabled={busy !== null} onClick={() => void createLead(false)}>{busy === 'lead' ? 'Creating…' : 'Create lead'}</button>
              <button type="button" className="call-detail__btn call-detail__btn--primary" disabled={busy !== null} onClick={() => void createLead(true)}>{busy === 'project' ? 'Creating…' : 'Create project from this call'}</button>
            </>
          )}
        </div>
      </div>

      <div>
        <section className="call-panel">
          <h2 className="call-panel__title">Recording</h2>
          {call.recording_url ? (
            <audio controls preload="none" src={`/api/admin/calls/${call.id}/recording`} />
          ) : (
            <p className="call-panel__empty">{call.status === 'completed' ? 'No recording was captured for this call.' : 'The recording arrives a minute or so after the call ends.'}</p>
          )}
        </section>
        <section className="call-panel">
          <h2 className="call-panel__title">Transcript</h2>
          {call.transcript?.length ? (
            <div className="transcript">
              {call.transcript.map((t, i) => (
                <div key={i} className={`transcript__turn transcript__turn--${t.role}`}>
                  <span className="transcript__who">{WHO[t.role] ?? t.role}</span>
                  <span>{t.text}</span>
                </div>
              ))}
            </div>
          ) : call.voicemail_text ? (
            <div className="transcript"><div className="transcript__turn transcript__turn--caller"><span className="transcript__who">Voicemail</span><span>{call.voicemail_text}</span></div></div>
          ) : (
            <p className="call-panel__empty">
              {call.answered_by === 'owner'
                ? (call.transcript_status === 'completed' ? 'No words were recognized.' : call.transcript_sid ? 'Transcription in progress.' : 'Calls Hank answers are transcribed once Voice Intelligence is enabled on the Twilio account (VOICE_INTELLIGENCE_SERVICE_SID).')
                : 'No transcript for this call.'}
            </p>
          )}
        </section>
      </div>

      <div>
        <section className="call-panel">
          <h2 className="call-panel__title">AI analysis</h2>
          {a ? (
            <>
              <p className="analysis__summary">{a.summary}</p>
              <div className="analysis__grid">
                <div className="analysis__stat"><b>Caller</b>{a.caller_type.replace('_', ' ')}</div>
                <div className="analysis__stat"><b>Urgency</b>{a.urgency}</div>
                <div className="analysis__stat"><b>Mood</b>{a.sentiment}</div>
              </div>
              {a.intent ? <p style={{ margin: '0 0 .6rem', fontSize: '.92rem' }}><b>Intent:</b> {a.intent}</p> : null}
              {a.action_items?.length ? (<><b style={{ fontSize: '.8rem' }}>Action items</b><ul className="analysis__list">{a.action_items.map((x, i) => <li key={i}>{x}</li>)}</ul></>) : null}
              {a.follow_up ? <p style={{ margin: '0 0 .6rem', fontSize: '.92rem' }}><b>Follow up:</b> {a.follow_up}</p> : null}
              {a.questions_asked?.length ? (<><b style={{ fontSize: '.8rem' }}>They asked</b><ul className="analysis__list">{a.questions_asked.map((x, i) => <li key={i}>{x}</li>)}</ul></>) : null}
              {a.suggested_project ? (
                <div className="analysis__stat">
                  <b>Suggested project</b>
                  {a.suggested_project.name}
                  {a.suggested_project.service ? <div style={{ fontSize: '.85rem', opacity: .8 }}>{a.suggested_project.service}{a.suggested_project.address ? ` · ${a.suggested_project.address}` : ''}</div> : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="call-panel__empty">{call.status === 'completed' ? 'No analysis for this call (nothing to analyze, or AI is not configured).' : 'The analysis runs when the call ends.'}</p>
          )}
        </section>
        {call.lead_id ? null : (
          <section className="call-panel">
            <h2 className="call-panel__title">Next step</h2>
            <p className="call-panel__empty">Create a lead to track this caller, or go straight to a project: the new-job form opens prefilled from the lead.</p>
          </section>
        )}
      </div>
    </div>
  );
}
