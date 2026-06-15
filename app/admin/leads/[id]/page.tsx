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

  return (
    <div className="jobs-page" data-testid="lead-detail-page">
      <div className="jobs-page__header">
        <div className="jobs-page__header-left">
          <button
            className="jobs-page__btn"
            data-action="back-to-list"
            onClick={() => router.push('/admin/leads')}
            style={{ marginRight: '0.75rem' }}
          >
            ← Leads
          </button>
          <h2 className="jobs-page__title" data-testid="lead-name">
            {lead.name}
          </h2>
          <span
            className="job-card__stage"
            data-testid="lead-status"
            style={{ background: statusOption?.color, marginLeft: '0.75rem' }}
          >
            {statusOption?.label ?? lead.status}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {lead.status === 'new' && (
            <button
              className="jobs-page__btn jobs-page__btn--primary"
              data-action="mark-contacted"
              onClick={() => void changeStatus('contacted')}
              title="Mark as contacted + dismiss the new-query notification"
            >
              ✓ Mark contacted
            </button>
          )}
          <select
            className="job-form__select"
            data-testid="status-select"
            value={lead.status}
            onChange={(e) => void changeStatus(e.target.value)}
            style={{ minWidth: '8rem' }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Responsive grid — collapses to a single column under 768px
          via the .lead-detail__grid utility below. Sections sized
          for one-thumb scroll on a phone, two-column read on a
          tablet/desktop. */}
      <div
        className="lead-detail__grid"
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          marginTop: '1rem',
        }}
      >
        <section className="job-form" data-section="contact">
          <h3 className="job-form__section-title">Contact</h3>
          <DetailRow label="Name" value={lead.name} />
          <DetailRow
            label="Email"
            value={
              lead.email ? (
                <a href={`mailto:${lead.email}`} className="jobs-page__link">
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
                <a href={`tel:${lead.phone}`} className="jobs-page__link">
                  {lead.phone}
                </a>
              ) : (
                '—'
              )
            }
          />
          <DetailRow label="Company" value={lead.company ?? '—'} />
          <DetailRow label="Source" value={lead.source} />
        </section>

        <section className="job-form" data-section="property">
          <h3 className="job-form__section-title">Property</h3>
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
          />
        </section>

        <section className="job-form" data-section="pipeline">
          <h3 className="job-form__section-title">Pipeline</h3>
          <DetailRow label="Status" value={statusOption?.label ?? lead.status} />
          <DetailRow label="Quote amount" value={fmtCurrency(lead.quote_amount)} />
          <DetailRow label="Assigned to" value={lead.assigned_to ?? '—'} />
          <DetailRow label="Follow up by" value={fmtDate(lead.follow_up_date)} />
          <DetailRow
            label="Converted to job"
            value={
              lead.converted_job_id ? (
                <a
                  href={`/admin/jobs?focus=${encodeURIComponent(lead.converted_job_id)}`}
                  className="jobs-page__link"
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
          className="job-form"
          data-section="notes"
          style={{ gridColumn: '1 / -1' }}
        >
          <h3 className="job-form__section-title">Notes from customer</h3>
          {lead.notes ? (
            <pre
              data-testid="lead-notes"
              style={{
                whiteSpace: 'pre-wrap',
                margin: 0,
                padding: '0.75rem',
                background: 'var(--color-bg-subtle)',
                borderRadius: '0.4rem',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                lineHeight: 1.5,
              }}
            >
              {lead.notes}
            </pre>
          ) : (
            <p style={{ color: 'var(--color-text-secondary, #6b7280)' }}>
              No notes provided.
            </p>
          )}
        </section>

        <section
          className="job-form"
          data-section="audit"
          style={{ gridColumn: '1 / -1' }}
        >
          <h3 className="job-form__section-title">Audit</h3>
          <DetailRow label="Created" value={fmtDate(lead.created_at)} />
          <DetailRow label="Last updated" value={fmtDate(lead.updated_at)} />
          <DetailRow label="Created by" value={lead.created_by ?? '—'} />
        </section>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      className="lead-detail__row"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '0.4rem 0',
        borderBottom: '1px solid #E5E7EB',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          color: 'var(--color-text-secondary, #6b7280)',
          fontSize: '0.8rem',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span style={{ textAlign: 'right', fontSize: '0.9rem' }}>{value}</span>
    </div>
  );
}
