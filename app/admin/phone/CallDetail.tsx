// app/admin/phone/CallDetail.tsx — slices S2/S3/L1/L2 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// One call, opened: play it, read it, correct it, file it, ring them back.
//
// ── THE SUMMARY IS SHOWN ABOVE THE TRANSCRIPT, AND SAYS IT IS A MACHINE'S ───────────────────────
//
// The summary is what makes the queue workable — nobody reads forty transcripts. But it is written
// by a model that is sometimes wrong about names and numbers, so it is labelled as generated and the
// transcript sits directly beneath it, expanded, not behind a disclosure. A summary a person cannot
// immediately check against the source is a summary they will either over-trust or ignore.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Phone, RefreshCw, Save, Check, Loader2, AlertTriangle, UserPlus } from 'lucide-react';
import JobRefPicker from '@/app/admin/components/jobs/JobRefPicker';
import {
  type AdminCallRow, formatPhone, formatDuration, formatWhen,
  voicemailReasonLabel, URGENCY_LABEL,
} from './call-types';

interface Props {
  callId: string;
  onChanged: () => void;
  onClose: () => void;
}

interface DetailPayload {
  call: AdminCallRow;
  audioUrl: string | null;
  events: Array<{ id: string; kind: string; signature_ok: boolean | null; created_at: string }>;
  job: { id: string; job_number: string | null; title: string | null } | null;
}

export default function CallDetail({ callId, onChanged, onClose }: Props) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/phone/calls/${callId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not load the call.');
      setData(body);
      setTranscriptDraft(body.call.transcript ?? '');
      setNotesDraft(body.call.notes ?? '');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => { void load(); }, [load]);

  // Opening a call is what "read" means — there is no separate button, because a queue where the
  // unread count only drops when somebody remembers to press something is a count nobody trusts.
  useEffect(() => {
    if (!data || data.call.reviewed_at) return;
    void fetch(`/api/admin/phone/calls/${callId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markRead: true }),
    }).then(onChanged);
  }, [data, callId, onChanged]);

  const patch = useCallback(async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(`/api/admin/phone/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'That did not save.');
      setNotice('Saved.');
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [callId, load, onChanged]);

  const rerunAi = useCallback(async (force: boolean) => {
    setBusy('ai');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/phone/calls/${callId}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'The AI could not re-read this call.');
      setNotice(
        out.status === 'queued'
          ? 'Queued — the worker will transcribe this shortly.'
          : out.status === 'skipped'
            ? 'There is no recording on this call.'
            : 'Re-read.',
      );
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [callId, load, onChanged]);

  const callBack = useCallback(async () => {
    if (!data) return;
    const number = data.call.summary_json?.callbackNumber || data.call.from_number;
    if (!number) { setError('There is no number to call back.'); return; }
    setBusy('callback');
    setError(null);
    try {
      const res = await fetch('/api/admin/phone/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: number,
          callId,
          label: data.call.summary_json?.caller ?? data.call.caller_name ?? undefined,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'The call could not be placed.');
      setNotice(`Ringing ${formatPhone(out.ringingFirst)} — answer it and we will connect you.`);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [data, callId, onChanged]);

  const createLead = useCallback(async () => {
    setBusy('lead');
    setError(null);
    try {
      const res = await fetch(`/api/admin/phone/calls/${callId}/create-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'Could not create the lead.');
      setNotice(out.created ? 'Lead created — open it to set the scope and price.' : 'This call already has a lead.');
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [callId, load, onChanged]);

  if (loading) {
    return <div className="callDetail"><p className="callDetail__muted"><Loader2 size={14} className="spin" /> Loading…</p></div>;
  }
  if (!data) {
    return (
      <div className="callDetail">
        <p className="callDetail__error">{error ?? 'That call could not be loaded.'}</p>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    );
  }

  const c = data.call;
  const s = c.summary_json;
  const other = c.direction === 'inbound' ? c.from_number : c.to_number;

  return (
    <div className="callDetail">
      <header className="callDetail__head">
        <div>
          <h2 className="callDetail__who">{s?.caller ?? c.caller_name ?? formatPhone(other)}</h2>
          <p className="callDetail__meta">
            {formatPhone(other)} · {formatWhen(c.started_at)} · {formatDuration(c.duration_seconds ?? c.recording_seconds)}
            {c.is_voicemail ? ` · ${voicemailReasonLabel(c.voicemail_reason)}` : ''}
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onClose}>Close</button>
      </header>

      {error && <p className="callDetail__error"><AlertTriangle size={14} /> {error}</p>}
      {notice && <p className="callDetail__notice"><Check size={14} /> {notice}</p>}

      <div className="callDetail__actions">
        <button type="button" className="btn btn--primary" onClick={callBack} disabled={busy === 'callback'}>
          <Phone size={14} /> {busy === 'callback' ? 'Ringing you…' : 'Call back'}
        </button>
        <button type="button" className="btn" onClick={() => rerunAi(false)} disabled={busy === 'ai'}>
          <RefreshCw size={14} /> {busy === 'ai' ? 'Working…' : 'Re-run summary'}
        </button>
        <button type="button" className="btn" onClick={() => rerunAi(true)} disabled={busy === 'ai'}>
          <RefreshCw size={14} /> Re-transcribe
        </button>
        <button type="button" className="btn" onClick={createLead} disabled={busy === 'lead'}>
          <UserPlus size={14} /> {busy === 'lead' ? 'Creating…' : 'Create a lead'}
        </button>
      </div>

      {c.recording_path ? (
        data.audioUrl ? (
          // `controls` and nothing else: a bespoke player would have to reimplement scrubbing,
          // keyboard control and the OS media keys, all of which the native element already has.
          <audio className="callDetail__audio" controls preload="metadata" src={data.audioUrl}>
            Your browser cannot play this recording.
          </audio>
        ) : (
          <p className="callDetail__muted">The recording is stored but a playback link could not be created.</p>
        )
      ) : (
        <p className="callDetail__muted">No recording — this call was answered or never left a message.</p>
      )}

      <section className="callDetail__section">
        <h3 className="callDetail__h3">
          Summary
          {/* Labelled, always. A generated summary that looks like a person's note gets trusted like one. */}
          <span className="callDetail__tag">written by AI</span>
          {s?.urgency && s.urgency !== 'routine' && (
            <span className={`callDetail__urgency callDetail__urgency--${s.urgency}`}>{URGENCY_LABEL[s.urgency]}</span>
          )}
        </h3>
        {c.summary_status === 'done' && c.summary ? (
          <>
            <p className="callDetail__summary">{c.summary}</p>
            <dl className="callDetail__facts">
              {s?.wanted && <><dt>Wanted</dt><dd>{s.wanted}</dd></>}
              {s?.callbackNumber && <><dt>Call back on</dt><dd>{formatPhone(s.callbackNumber)}</dd></>}
              {s?.nextStep && <><dt>Next step</dt><dd>{s.nextStep}</dd></>}
              {s?.referencedJob && <><dt>Mentioned</dt><dd>{s.referencedJob}</dd></>}
            </dl>
          </>
        ) : (
          <p className="callDetail__muted">
            {c.transcript_status === 'queued'
              ? 'Waiting to be transcribed.'
              : c.transcript_status === 'failed'
                ? 'The recording could not be transcribed.'
                : 'No summary yet.'}
          </p>
        )}
      </section>

      <section className="callDetail__section">
        <h3 className="callDetail__h3">Transcript</h3>
        <textarea
          className="callDetail__transcript"
          value={transcriptDraft}
          onChange={(e) => setTranscriptDraft(e.target.value)}
          rows={8}
          placeholder="No transcript yet."
          spellCheck
        />
        {transcriptDraft !== (c.transcript ?? '') && (
          <button
            type="button"
            className="btn btn--small"
            onClick={() => patch({ transcript: transcriptDraft }, 'transcript')}
            disabled={busy === 'transcript'}
          >
            <Save size={13} /> Save the correction
          </button>
        )}
      </section>

      <section className="callDetail__section">
        <h3 className="callDetail__h3">File it against a job</h3>
        <JobRefPicker
          compact
          clearLabel="Not about a job"
          // The picker holds an option object, not an id, so the linked job is rebuilt from what
          // the detail endpoint already joined rather than fetched a second time.
          value={
            data.job
              ? { id: data.job.id, name: data.job.title ?? 'Job', job_number: data.job.job_number }
              : null
          }
          onChange={(job) => patch({ job_id: job?.id ?? null }, 'job')}
        />
        {c.matched_label && !c.job_id && (
          // The machine's guess, offered rather than applied. See the schema note on why
          // matched_* is not the FK.
          <p className="callDetail__muted">
            This number looks like <strong>{c.matched_label}</strong> ({c.matched_kind}).
          </p>
        )}
      </section>

      <section className="callDetail__section">
        <h3 className="callDetail__h3">Notes</h3>
        <textarea
          className="callDetail__notes"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={3}
          placeholder="Anything worth remembering about this call."
        />
        {notesDraft !== (c.notes ?? '') && (
          <button
            type="button"
            className="btn btn--small"
            onClick={() => patch({ notes: notesDraft }, 'notes')}
            disabled={busy === 'notes'}
          >
            <Save size={13} /> Save notes
          </button>
        )}
      </section>
    </div>
  );
}
