'use client';
// app/admin/jobs/[id]/JobResearchPacket.tsx — the research a crew can actually reach (plan R26).
//
// Everything R13–R25 produced lived behind `/admin/research/<uuid>`, a screen a field crew has no
// reason to open and often no permission to. This puts the approved packet on the job.
//
// The four states are the point. A naive version renders three of them as an empty panel, and a crew
// that sees nothing concludes there is nothing — drives out, and repeats work somebody already did,
// or works from a draft nobody finished checking.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileText, HelpCircle, WifiOff } from 'lucide-react';
import type { FieldBrief, JobPacketState } from '@/lib/research/job-packet';
// A truck with no signal, and the rule about what a stored copy may claim (plan R26).
import {
  readCache, writeCache, resolveOffline, type OfflineVerdict,
} from '@/lib/research/packet-offline';

interface Payload {
  state: JobPacketState;
  headline: string;
  nextStep: string;
  projectIds: string[];
  brief: FieldBrief | null;
  highlights: { plan: string[]; questions: string[] };
  pdfUrl: string | null;
}

const TONE: Record<JobPacketState, string> = {
  approved: 'job-packet--ok',
  draft_only: 'job-packet--warn',
  research_only: 'job-packet--warn',
  no_research: 'job-packet--muted',
};

export default function JobResearchPacket({ jobId }: { jobId: string }) {
  const [verdict, setVerdict] = useState<OfflineVerdict<Payload> | null>(null);
  /** A packet that was fetched but could not be stored. The crew is told, because the alternative is
   *  implying offline access the device does not actually have. */
  const [cacheFailed, setCacheFailed] = useState(false);

  const load = useCallback(async () => {
    const storage = typeof window === 'undefined' ? null : window.localStorage;
    const now = Date.now();
    let live: Payload | null = null;
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/research-packet`);
      if (res.ok) live = (await res.json()) as Payload;
    } catch { /* no signal, or the server is unreachable — the cache decides what happens next */ }

    if (live !== null) {
      // Only an APPROVED packet is worth storing. A draft must never be worked from, and caching one
      // would put "do not work from this" on a device precisely where nobody can re-check it.
      if (live.state === 'approved') {
        setCacheFailed(!writeCache(jobId, live, now, storage));
      } else {
        setCacheFailed(false);
      }
    }

    setVerdict(resolveOffline<Payload>(jobId, live, readCache<Payload>(jobId, storage), now));
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  if (!verdict) return null;

  const data = verdict.payload;
  if (!data) {
    return (
      <div className="job-packet job-packet--warn">
        {verdict.statement}
      </div>
    );
  }

  return (
    <div className={`job-packet ${verdict.needsRecheck ? 'job-packet--warn' : TONE[data.state]}`}>
      <div className="job-packet__head">
        <FileText size={15} aria-hidden />
        <span className="job-packet__title">Property research</span>
      </div>

      {/* Above the headline, because it changes whether the headline can be trusted at all. */}
      {verdict.statement && (
        <p className="job-packet__offline">
          <WifiOff size={13} aria-hidden /> {verdict.statement}
        </p>
      )}
      {cacheFailed && (
        <p className="job-packet__offline">
          <WifiOff size={13} aria-hidden /> This packet could NOT be stored on this device — it will
          not be available if you lose signal.
        </p>
      )}

      <p className="job-packet__headline">{data.headline}</p>
      {data.nextStep && <p className="job-packet__next">{data.nextStep}</p>}

      {data.state === 'approved' && data.brief && (
        <>
          {/* Warnings first: they change what the crew does. */}
          {/* An older approved packet has no warnings field at all. Rendering that as "no warnings"
              tells a crew there is nothing to worry about, when the truth is that nobody looked. */}
          {data.brief.warningsUnknown && (
            <ul className="job-packet__warnings">
              <li>
                <AlertTriangle size={13} aria-hidden /> This packet was approved before cover warnings
                were recorded, so whether it has any is <strong>not known</strong>. That is not the
                same as it having none — check the full packet before relying on it.
              </li>
            </ul>
          )}
          {data.brief.warnings.length > 0 && (
            <ul className="job-packet__warnings">
              {data.brief.warnings.map((w, i) => (
                <li key={i}><AlertTriangle size={13} aria-hidden /> {w}</li>
              ))}
            </ul>
          )}

          {/* The two things read first, lifted out of a packet that may run to fifty facts. */}
          {data.highlights.questions.length > 0 && (
            <div className="job-packet__block">
              <h4 className="job-packet__block-title">
                <HelpCircle size={13} aria-hidden /> Open questions for the field
              </h4>
              <ul>{data.highlights.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}

          {data.highlights.plan.length > 0 && (
            <div className="job-packet__block">
              <h4 className="job-packet__block-title">Field plan</h4>
              <ul>{data.highlights.plan.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}

          <div className="job-packet__actions">
            {data.pdfUrl && (
              <a className="job-packet__pdf" href={data.pdfUrl} target="_blank" rel="noopener noreferrer">
                Open the full packet (PDF)
              </a>
            )}
            <span className="job-packet__count">{data.brief.itemCount} item(s)</span>
          </div>
        </>
      )}
    </div>
  );
}
