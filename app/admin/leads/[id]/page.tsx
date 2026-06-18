// app/admin/leads/[id]/page.tsx — Lead detail / response surface
//
// mobile-and-customer-query-gap Slice S1 — the deep link target for
// the Q2 notification. The list page at /admin/leads still works
// (the bell-icon also drops you there via `?focus=`), but the
// detail page gives the surveyor on a phone / tablet a single
// focused screen with all the customer-supplied detail plus the
// pipeline-actions (advance, mark contacted, convert to job)
// without bouncing through the grid.
//
// Responsive design — single column under 768px (the field-iPad
// phone use case), grid above. Pure CSS via existing
// AdminJobs.css + scoped inline styles for the new sections.
'use client';

import '../../styles/AdminJobs.css';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { usePageError } from '../../hooks/usePageError';
// lead-reply-2026-06-18 — full email composer launched from the Reply
// button in the header. The modal owns its own state + posts to the
// /api/admin/leads/{id}/reply route; this page just opens it.
import ReplyDialog from './ReplyDialog';
// LR1 of lead-reply-expansion-2026-06-18.md — reply history card that
// reads from the same /reply endpoint and renders the per-lead
// conversation log under the Notes card.
import RepliesList from './RepliesList';
// LR3 — office-side conversation notes card. Backed by the new
// public.lead_notes table (seed 320) + /api/admin/leads/[id]/notes.
import LeadNotesCard from './LeadNotesCard';

interface LeadAttachment {
  name: string;
  size: number;
  storage_path?: string;
}

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  status: string;
  notes: string | null;
  property_address: string | null;
  city: string | null;
  state: string | null;
  survey_type: string | null;
  estimated_acreage: number | null;
  quote_amount: number | null;
  assigned_to: string | null;
  follow_up_date: string | null;
  converted_job_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** lead-attachments-2026-06-18 — files the customer attached to the
   *  public intake form. Empty array when none were sent. */
  attachments?: LeadAttachment[];
}

/** Pure helper — pretty-print bytes for the attachment chip strip. */
function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Pure helper — pick a fitting emoji for a file based on its extension.
 *  Falls back to a generic paperclip when the name is missing or weird. */
function iconForAttachment(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (['pdf'].includes(ext)) return '📄';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(ext)) return '🖼️';
  if (['doc', 'docx', 'rtf', 'txt', 'md'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['dwg', 'dxf'].includes(ext)) return '📐';
  if (['kml', 'kmz', 'gpx'].includes(ext)) return '🗺️';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  return '📎';
}

const STATUS_OPTIONS = [
  { key: 'new', label: 'New', color: '#3B82F6' },
  { key: 'contacted', label: 'Contacted', color: '#8B5CF6' },
  { key: 'quoted', label: 'Quoted', color: '#F59E0B' },
  { key: 'accepted', label: 'Accepted', color: '#059669' },
  { key: 'declined', label: 'Declined', color: 'var(--color-error)' },
  { key: 'lost', label: 'Lost', color: '#6B7280' },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtCurrency(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: session } = useSession();
  const { safeFetch, safeAction } = usePageError('LeadDetailPage');
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  // lead-reply-2026-06-18 — Reply modal open / closed.
  const [replyOpen, setReplyOpen] = useState(false);
  // LR1 — bumping this forces the RepliesList component to refetch
  // (used by onSent to surface a fresh row immediately).
  const [repliesRefreshKey, setRepliesRefreshKey] = useState(0);
  const isAdminUser = session?.user?.roles?.includes('admin') ?? false;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await safeFetch<{ lead: Lead }>(
        `/api/admin/leads/${encodeURIComponent(id)}`,
      );
      setLead(res?.lead ?? null);
    } finally {
      setLoading(false);
    }
  }, [id, safeFetch]);

  useEffect(() => {
    if (isAdminUser) void load();
  }, [isAdminUser, load]);

  async function changeStatus(next: string) {
    if (!lead) return;
    await safeAction('updating lead', async () => {
      const res = await fetch('/api/admin/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, status: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Server ${res.status}`);
      }
    });
    await load();
  }

  if (!session?.user) return null;
  if (!isAdminUser) {
    return (
      <div className="jobs-page">
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon">🔒</span>
          <h3>Admin only</h3>
          <p>This page is restricted to admin users.</p>
        </div>
      </div>
    );
  }

  if (loading && !lead) {
    return (
      <div className="jobs-page">
        <div className="jobs-page__empty" data-state="loading">
          <span className="jobs-page__empty-icon">⏳</span>
          <h3>Loading lead…</h3>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="jobs-page">
        <div className="jobs-page__empty" data-state="not-found">
          <span className="jobs-page__empty-icon">🤷</span>
          <h3>Lead not found</h3>
          <p>It may have been deleted. Go back to the list to see what&apos;s left.</p>
          <button
            className="jobs-page__btn"
            onClick={() => router.push('/admin/leads')}
          >
            ← Back to leads
          </button>
        </div>
      </div>
    );
  }

  const statusOption = STATUS_OPTIONS.find((s) => s.key === lead.status);

  const attachments = lead.attachments ?? [];

  return (
    <div className="jobs-page lead-detail" data-testid="lead-detail-page">
      <div className="lead-detail__header">
        <div className="lead-detail__header-left">
          <button
            type="button"
            className="lead-detail__back"
            data-action="back-to-list"
            onClick={() => router.push('/admin/leads')}
          >
            ← Leads
          </button>
          <h2 className="lead-detail__title" data-testid="lead-name">
            {lead.name}
          </h2>
          <span
            className="lead-detail__status-pill"
            data-testid="lead-status"
            style={{
              background: `color-mix(in srgb, ${statusOption?.color ?? '#6B7280'} 14%, white)`,
              color: statusOption?.color ?? '#374151',
              border: `1px solid color-mix(in srgb, ${statusOption?.color ?? '#6B7280'} 40%, transparent)`,
            }}
          >
            {statusOption?.label ?? lead.status}
          </span>
        </div>
        <div className="lead-detail__actions">
          {/* lead-reply-2026-06-18 — primary reply button. Opens the
              composer modal that posts to /api/admin/leads/{id}/reply.
              Disabled when the lead has no email on file so we can't
              accidentally send to nowhere. */}
          <button
            type="button"
            className="lead-detail__btn lead-detail__btn--primary"
            data-action="reply"
            data-testid="reply-button"
            onClick={() => setReplyOpen(true)}
            disabled={!lead.email}
            title={
              lead.email
                ? `Reply to ${lead.email}`
                : 'This lead has no email on file'
            }
          >
            ✉️ Reply
          </button>
          {lead.status === 'new' && (
            <button
              type="button"
              className="lead-detail__btn"
              data-action="mark-contacted"
              onClick={() => void changeStatus('contacted')}
              title="Mark as contacted + dismiss the new-query notification"
            >
              ✓ Mark contacted
            </button>
          )}
          {!lead.converted_job_id && (
            <button
              type="button"
              className="lead-detail__btn"
              data-action="convert-to-job"
              onClick={() =>
                router.push(`/admin/jobs/new?fromLead=${encodeURIComponent(lead.id)}`)
              }
              title="Open the new-job form with this lead's details prefilled"
            >
              → Convert to job
            </button>
          )}
          {/* lead-status-affordance-2026-06-18 — the select used to
              float beside the action buttons with no label, so it
              wasn't obvious it controlled the lead's status. Wrap it
              in a labeled group + size the select to its longest
              option ("Contacted" + chevron) so it doesn't stretch
              awkwardly wide next to the buttons. */}
          <label
            className="lead-detail__status-group"
            data-testid="status-select-group"
          >
            <span className="lead-detail__status-label">Current status:</span>
            <select
              className="lead-detail__select"
              data-testid="status-select"
              value={lead.status}
              onChange={(e) => void changeStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Responsive card grid — collapses to a single column under
          720px. Each card is now styled inline with rounded corners,
          a soft shadow, and a header divider so the page feels like
          a polished record instead of a stack of bordered boxes. */}
      <div className="lead-detail__grid">
        <section className="lead-detail__card" data-section="contact">
          <h3 className="lead-detail__card-title">
            <span aria-hidden>👤</span> Contact
          </h3>
          <DetailRow label="Name" value={lead.name} />
          <DetailRow
            label="Email"
            value={
              lead.email ? (
                <a href={`mailto:${lead.email}`} className="lead-detail__link">
                  {lead.email}
                </a>
              ) : (
                '—'
              )
            }
          />
          <DetailRow
            label="Phone"
            value={
              lead.phone ? (
                <a href={`tel:${lead.phone}`} className="lead-detail__link">
                  {lead.phone}
                </a>
              ) : (
                '—'
              )
            }
          />
          <DetailRow label="Company" value={lead.company ?? '—'} />
          <DetailRow label="Source" value={lead.source} isLast />
        </section>

        <section className="lead-detail__card" data-section="property">
          <h3 className="lead-detail__card-title">
            <span aria-hidden>📍</span> Property
          </h3>
          <DetailRow label="Address" value={lead.property_address ?? '—'} />
          <DetailRow label="City" value={lead.city ?? '—'} />
          <DetailRow label="State" value={lead.state ?? '—'} />
          <DetailRow label="Survey type" value={lead.survey_type ?? '—'} />
          <DetailRow
            label="Estimated acreage"
            value={
              typeof lead.estimated_acreage === 'number'
                ? `${lead.estimated_acreage} acres`
                : '—'
            }
            isLast
          />
        </section>

        <section className="lead-detail__card" data-section="pipeline">
          <h3 className="lead-detail__card-title">
            <span aria-hidden>📊</span> Pipeline
          </h3>
          <DetailRow label="Status" value={statusOption?.label ?? lead.status} />
          <DetailRow label="Quote amount" value={fmtCurrency(lead.quote_amount)} />
          <DetailRow label="Assigned to" value={lead.assigned_to ?? '—'} />
          <DetailRow label="Follow up by" value={fmtDate(lead.follow_up_date)} />
          <DetailRow
            label="Converted to job"
            isLast
            value={
              lead.converted_job_id ? (
                <a
                  href={`/admin/jobs?focus=${encodeURIComponent(lead.converted_job_id)}`}
                  className="lead-detail__link"
                >
                  View job →
                </a>
              ) : (
                '— (not yet)'
              )
            }
          />
        </section>

        <section
          className="lead-detail__card lead-detail__card--wide"
          data-section="notes"
        >
          <h3 className="lead-detail__card-title">
            <span aria-hidden>📝</span> Notes from customer
          </h3>
          {lead.notes ? (
            <div className="lead-detail__notes" data-testid="lead-notes">
              {lead.notes}
            </div>
          ) : (
            <p className="lead-detail__empty">No notes provided.</p>
          )}
        </section>

        {/* LR3 of lead-reply-expansion-2026-06-18.md — office-side
            conversation notes. Lives between the customer's original
            message and the outbound reply history so the page reads
            top-to-bottom as a single thread. */}
        <LeadNotesCard leadId={lead.id} />

        {/* LR1 of lead-reply-expansion-2026-06-18.md — outbound reply
            history. Reads from /api/admin/leads/[id]/reply (shipped in
            edfdc2c) and refreshes whenever the ReplyDialog fires
            onSent (via the refreshKey bump). */}
        <RepliesList leadId={lead.id} refreshKey={repliesRefreshKey} />

        {/* lead-attachments-2026-06-18 — render whatever files the
            customer sent via the public form. Each chip is a button-
            shaped row with the icon, filename, and size; clicking it
            opens the storage path when one exists, otherwise the chip
            is informational (the bytes were sent in the email). */}
        <section
          className="lead-detail__card lead-detail__card--wide"
          data-section="attachments"
          data-testid="lead-attachments"
        >
          <h3 className="lead-detail__card-title">
            <span aria-hidden>📎</span> Attachments
            <span className="lead-detail__counter">{attachments.length}</span>
          </h3>
          {attachments.length === 0 ? (
            <p className="lead-detail__empty">
              The customer didn&apos;t attach any files.
            </p>
          ) : (
            <ul className="lead-detail__attachments">
              {attachments.map((a, i) => {
                const inner = (
                  <>
                    <span className="lead-detail__attachment-icon" aria-hidden>
                      {iconForAttachment(a.name)}
                    </span>
                    <span className="lead-detail__attachment-meta">
                      <span className="lead-detail__attachment-name" title={a.name}>
                        {a.name}
                      </span>
                      <span className="lead-detail__attachment-size">
                        {fmtBytes(a.size)}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={`${a.name}-${i}`}>
                    {a.storage_path ? (
                      <a
                        href={a.storage_path}
                        className="lead-detail__attachment"
                        download={a.name}
                      >
                        {inner}
                      </a>
                    ) : (
                      <div
                        className="lead-detail__attachment lead-detail__attachment--info"
                        title="The bytes for this file were emailed to the office inbox; only the metadata is on the lead record."
                      >
                        {inner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          className="lead-detail__card lead-detail__card--wide"
          data-section="audit"
        >
          <h3 className="lead-detail__card-title">
            <span aria-hidden>🗂</span> Audit
          </h3>
          <DetailRow label="Created" value={fmtDate(lead.created_at)} />
          <DetailRow label="Last updated" value={fmtDate(lead.updated_at)} />
          <DetailRow label="Created by" value={lead.created_by ?? '—'} isLast />
        </section>
      </div>

      <style jsx>{`
        .lead-detail {
          padding: 1.25rem 1rem 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }
        .lead-detail__header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1.25rem;
        }
        .lead-detail__header-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          min-width: 0;
        }
        .lead-detail__back {
          background: transparent;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 6px 12px;
          color: #374151;
          font-size: 0.85rem;
          cursor: pointer;
          transition: background 0.15s;
        }
        .lead-detail__back:hover {
          background: #F3F4F6;
        }
        .lead-detail__title {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          color: #0F172A;
          overflow-wrap: anywhere;
        }
        .lead-detail__status-pill {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .lead-detail__actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .lead-detail__btn {
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid #E5E7EB;
          background: white;
          color: #1F2937;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .lead-detail__btn:hover {
          background: #F3F4F6;
          border-color: #D1D5DB;
        }
        .lead-detail__btn--primary {
          background: linear-gradient(135deg, #1D3095 0%, #2A41BD 100%);
          color: white;
          border-color: transparent;
          box-shadow: 0 4px 12px rgba(29, 48, 149, 0.25);
        }
        .lead-detail__btn--primary:hover {
          background: linear-gradient(135deg, #16266F 0%, #1D3095 100%);
        }
        /* lead-status-affordance-2026-06-18 — labeled group around the
           status select. The label sits inline with the dropdown on
           wider screens and stacks above it under 480px so the chip
           still reads clearly on a phone. */
        .lead-detail__status-group {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 4px 10px 4px 12px;
          background: #F8FAFC;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          cursor: pointer;
        }
        .lead-detail__status-label {
          font-size: 0.78rem;
          font-weight: 600;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .lead-detail__select {
          /* Width sized to the longest option label ("Contacted")
             plus the chevron — was previously stretching to ~8rem
             which looked awkward next to the action buttons. */
          padding: 6px 8px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: white;
          color: #1F2937;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          width: auto;
          min-width: 0;
        }
        .lead-detail__select:hover,
        .lead-detail__select:focus {
          border-color: #1D3095;
          outline: none;
        }
        @media (max-width: 480px) {
          .lead-detail__status-group {
            width: 100%;
            justify-content: space-between;
          }
        }

        .lead-detail__grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        }
        .lead-detail__card {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 2px 4px rgba(15, 23, 42, 0.04);
          min-width: 0;
        }
        .lead-detail__card--wide {
          grid-column: 1 / -1;
        }
        .lead-detail__card-title {
          margin: 0 0 0.75rem 0;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #F1F5F9;
          font-size: 0.95rem;
          font-weight: 700;
          color: #0F172A;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .lead-detail__counter {
          margin-left: auto;
          background: #F1F5F9;
          color: #475569;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .lead-detail__link {
          color: #1D3095;
          text-decoration: none;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .lead-detail__link:hover {
          text-decoration: underline;
        }
        .lead-detail__notes {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          margin: 0;
          padding: 0.85rem 1rem;
          background: #F8FAFC;
          border-radius: 8px;
          border: 1px solid #F1F5F9;
          font-size: 0.875rem;
          line-height: 1.6;
          color: #1F2937;
        }
        .lead-detail__empty {
          margin: 0;
          color: #6B7280;
          font-size: 0.875rem;
          font-style: italic;
        }
        .lead-detail__attachments {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 0.5rem;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        }
        .lead-detail__attachment {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.6rem 0.8rem;
          border-radius: 10px;
          background: #F8FAFC;
          border: 1px solid #E5E7EB;
          color: #1F2937;
          text-decoration: none;
          transition: all 0.15s ease;
          min-width: 0;
        }
        a.lead-detail__attachment:hover {
          background: #EFF4FF;
          border-color: #BFDBFE;
          color: #1D3095;
          transform: translateY(-1px);
        }
        .lead-detail__attachment--info {
          cursor: default;
        }
        .lead-detail__attachment-icon {
          font-size: 1.4rem;
          line-height: 1;
        }
        .lead-detail__attachment-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .lead-detail__attachment-name {
          font-size: 0.85rem;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lead-detail__attachment-size {
          font-size: 0.72rem;
          color: #6B7280;
        }
      `}</style>

      {/* lead-reply-2026-06-18 — mount the composer when the surveyor
          clicks Reply. Stays unmounted (no fetches, no event handlers)
          until then. `onSent` reloads the lead so the new reply
          history shows up immediately (history rendering ships in a
          follow-up slice; for now the row just lands in the DB so the
          office has the audit trail). */}
      {replyOpen && lead && lead.email && (
        <ReplyDialog
          leadId={lead.id}
          leadName={lead.name}
          defaultTo={lead.email}
          defaultSubject={`Re: Your Starr Surveying request${lead.notes ? ` [${(lead.notes.match(/Ref:\s*(\S+)/) || [])[1] ?? ''}]` : ''}`}
          onClose={() => setReplyOpen(false)}
          onSent={() => {
            // LR1 — bump the refresh key so the RepliesList refetches
            // and the freshly-sent reply appears at the top of the
            // history immediately. `load()` also re-pulls the lead
            // row so the attachments column reflects any signed-URL
            // updates from the reply pipeline.
            setRepliesRefreshKey((k) => k + 1);
            void load();
          }}
        />
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  isLast,
}: {
  label: string;
  value: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      className="lead-detail__row"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(90px, 32%) 1fr',
        alignItems: 'baseline',
        padding: '0.55rem 0',
        borderBottom: isLast ? 'none' : '1px solid #F1F5F9',
        gap: '0.75rem',
      }}
    >
      <span
        style={{
          color: '#6B7280',
          fontSize: '0.78rem',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          textAlign: 'right',
          fontSize: '0.9rem',
          color: '#1F2937',
          minWidth: 0,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  );
}
