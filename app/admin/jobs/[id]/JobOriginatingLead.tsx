'use client';
// app/admin/jobs/[id]/JobOriginatingLead.tsx
//
// LR6 of lead-reply-expansion-2026-06-18.md — back-link card on the
// job detail page surfacing the lead the job was converted from. Reads
// from /api/admin/jobs/[id]/origin-lead. Renders compactly:
//
//   Originating inquiry · SS-260618-… · 5 replies · 3 office notes
//   View full conversation →
//
// When no originating lead exists (job created fresh, no fromLead), the
// component renders nothing so the overview tab isn't cluttered with an
// empty "no conversation" placeholder.

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface OriginLead {
  id: string;
  name: string;
  status: string;
  reference_number: string;
  reply_count: number;
  notes_count: number;
  last_replied_at: string | null;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface JobOriginatingLeadProps {
  jobId: string;
}

export default function JobOriginatingLead({ jobId }: JobOriginatingLeadProps) {
  const [lead, setLead] = useState<OriginLead | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/origin-lead`);
        if (!res.ok) {
          if (alive) setLoaded(true);
          return;
        }
        const data = (await res.json()) as { lead: OriginLead | null };
        if (alive) {
          setLead(data.lead);
          setLoaded(true);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [jobId]);

  // When no originating lead exists (or fetch failed), render nothing
  // so the overview tab doesn't carry an empty placeholder block.
  if (!loaded || !lead) return null;

  const lastReplied = fmtRelative(lead.last_replied_at);

  return (
    <section
      className="job-detail__originating-lead"
      data-testid="job-originating-lead"
      style={cardStyle}
    >
      <div style={headerRowStyle}>
        <span aria-hidden style={{ fontSize: '1.1rem' }}>💬</span>
        <span style={{ fontWeight: 700, color: '#0F172A' }}>
          Originating inquiry
        </span>
        {lead.reference_number && (
          <span style={refChipStyle}>{lead.reference_number}</span>
        )}
      </div>

      <p style={metaLineStyle} data-testid="job-originating-lead-meta">
        From <strong>{lead.name}</strong>
        {' · '}
        <span data-testid="job-originating-lead-replies">
          {lead.reply_count} {lead.reply_count === 1 ? 'reply' : 'replies'}
        </span>
        {lead.notes_count > 0 && (
          <>
            {' · '}
            <span data-testid="job-originating-lead-notes">
              {lead.notes_count} office {lead.notes_count === 1 ? 'note' : 'notes'}
            </span>
          </>
        )}
        {lastReplied && (
          <>
            {' · '}
            <span data-testid="job-originating-lead-last">
              last reply {lastReplied}
            </span>
          </>
        )}
      </p>

      <Link
        href={`/admin/leads/${encodeURIComponent(lead.id)}`}
        style={linkStyle}
        data-testid="job-originating-lead-link"
      >
        View full conversation →
      </Link>
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  border: '1px solid color-mix(in srgb, #1D3095 22%, transparent)',
  background: 'color-mix(in srgb, #1D3095 5%, white)',
  borderRadius: 10,
  padding: '0.75rem 1rem',
  marginBottom: 'var(--hub-spc-3, 12px)',
};
const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
  flexWrap: 'wrap',
};
const refChipStyle: React.CSSProperties = {
  marginLeft: 'auto',
  padding: '2px 8px',
  borderRadius: 999,
  background: 'white',
  border: '1px solid #E5E7EB',
  fontSize: '0.7rem',
  fontWeight: 600,
  color: '#475569',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: 0.4,
};
const metaLineStyle: React.CSSProperties = {
  margin: '0 0 0.55rem 0',
  color: '#475569',
  fontSize: '0.85rem',
};
const linkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 12px',
  borderRadius: 6,
  background: 'linear-gradient(135deg, #1D3095 0%, #2A41BD 100%)',
  color: 'white',
  fontSize: '0.82rem',
  fontWeight: 600,
  textDecoration: 'none',
  boxShadow: '0 4px 12px rgba(29, 48, 149, 0.18)',
};
