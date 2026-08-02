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
import { AlertTriangle, FileText, HelpCircle } from 'lucide-react';
import type { FieldBrief, JobPacketState } from '@/lib/research/job-packet';

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
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/research-packet`);
      if (!res.ok) { setFailed(true); return; }
      setData((await res.json()) as Payload);
      setFailed(false);
    } catch { setFailed(true); }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  if (failed) {
    return (
      <div className="job-packet job-packet--warn">
        The research for this job could not be read. This is <strong>not</strong> the same as there
        being none — check again before assuming nothing was done.
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className={`job-packet ${TONE[data.state]}`}>
      <div className="job-packet__head">
        <FileText size={15} aria-hidden />
        <span className="job-packet__title">Property research</span>
      </div>

      <p className="job-packet__headline">{data.headline}</p>
      {data.nextStep && <p className="job-packet__next">{data.nextStep}</p>}

      {data.state === 'approved' && data.brief && (
        <>
          {/* Warnings first: they change what the crew does. */}
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
