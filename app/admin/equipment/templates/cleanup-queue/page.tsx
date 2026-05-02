// app/admin/equipment/templates/cleanup-queue/page.tsx
//
// Phase F10.6-f-ii — §5.12.7.8 templates-referencing-retired-
// gear cleanup queue page. Consumes the F10.6-f-i aggregator
// at GET /api/admin/equipment/templates/cleanup-queue.
//
// Per-template card layout: header carries the template name +
// "N of M lines stale" + archive badge + deep link to the
// template edit page. Body lists the stale items with the
// retired equipment's context (name + category + retired_at
// + retired_reason) so the EM picks a replacement directly.
//
// No inline action modals — fixes happen via the existing
// F10.2e-ii edit page (Edit row → swap to category-of-kind OR
// point at a replacement specific instrument). The template
// edit page already runs the §5.12.3 audit chain (version
// bump + equipment_template_versions snapshot) so a fix
// preserves history without this page touching the wire.
//
// Auth: useSession sign-in gate; the aggregator enforces
// EQUIPMENT_ROLES server-side.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../../hooks/usePageError';

interface StaleItem {
  template_item_id: string;
  template_item_kind: string;
  template_quantity: number;
  template_is_required: boolean;
  template_notes: string | null;
  template_sort_order: number;
  equipment_inventory_id: string;
  equipment_name: string | null;
  equipment_category: string | null;
  equipment_retired_at: string | null;
  equipment_retired_reason: string | null;
  equipment_current_status: string | null;
}

interface TemplateGroup {
  template: {
    id: string;
    name: string;
    slug: string | null;
    job_type: string | null;
    version: number;
    is_archived: boolean;
    updated_at: string;
  };
  stale_items: StaleItem[];
  stale_item_count: number;
  total_item_count: number;
}

interface CleanupQueueResponse {
  templates: TemplateGroup[];
  summary: { template_count: number; stale_item_count: number };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function CleanupQueuePage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('CleanupQueuePage');

  const [data, setData] = useState<CleanupQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const res = await safeFetch<CleanupQueueResponse>(
      '/api/admin/equipment/templates/cleanup-queue'
    );
    setLoading(false);
    if (res) setData(res);
  }, [safeFetch]);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Templates · cleanup queue</h1>
          <p style={styles.subtitle}>
            §5.12.7.8 — templates pinning specific instruments
            that have since been retired or discontinued. Click
            through to the template edit page to swap each stale
            line to category-of-kind or pick a replacement
            instrument.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchQueue()}
          disabled={loading}
          style={styles.refreshBtn}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      {data ? (
        data.templates.length === 0 ? (
          <div style={styles.empty}>
            <strong>✓ Nothing to clean up.</strong>
            <p style={styles.cleanCopy}>
              Every template item that pins a specific instrument
              points at a unit still in active service. New
              retirements (F10.1e-i) and discontinue actions
              (F10.6-d-iii-γ) re-populate this list as they
              happen.
            </p>
          </div>
        ) : (
          <>
            <div style={styles.summaryBar}>
              <span style={styles.summaryStrong}>
                {data.summary.template_count}
              </span>
              <span style={styles.muted}>
                template{data.summary.template_count === 1 ? '' : 's'} ·
              </span>
              <span style={styles.summaryStrong}>
                {data.summary.stale_item_count}
              </span>
              <span style={styles.muted}>
                stale line{data.summary.stale_item_count === 1 ? '' : 's'}
              </span>
            </div>

            {data.templates.map((g) => (
              <section
                key={g.template.id}
                style={
                  g.template.is_archived
                    ? styles.cardArchived
                    : styles.card
                }
              >
                <header style={styles.cardHeader}>
                  <div>
                    <h2 style={styles.cardTitle}>
                      {g.template.name}
                      {g.template.is_archived ? (
                        <span style={styles.archivedBadge}>archived</span>
                      ) : null}
                    </h2>
                    <p style={styles.cardSubtitle}>
                      {g.template.job_type ? (
                        <>
                          job_type:{' '}
                          <code style={styles.code}>
                            {g.template.job_type}
                          </code>{' '}
                          ·{' '}
                        </>
                      ) : null}
                      v{g.template.version} ·{' '}
                      <span style={styles.staleCount}>
                        {g.stale_item_count} of {g.total_item_count} lines
                        stale
                      </span>
                    </p>
                  </div>
                  <Link
                    href={`/admin/equipment/templates/${g.template.id}`}
                    style={styles.editBtn}
                  >
                    Edit template →
                  </Link>
                </header>

                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.thRight}>#</th>
                      <th style={styles.th}>Retired instrument</th>
                      <th style={styles.th}>Category</th>
                      <th style={styles.th}>Retired</th>
                      <th style={styles.th}>Reason</th>
                      <th style={styles.thRight}>Qty</th>
                      <th style={styles.th}>Required?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.stale_items.map((item) => (
                      <tr key={item.template_item_id}>
                        <td style={styles.tdRight}>
                          {item.template_sort_order}
                        </td>
                        <td style={styles.td}>
                          <Link
                            href={`/admin/equipment/${item.equipment_inventory_id}`}
                            style={styles.link}
                          >
                            {item.equipment_name ??
                              item.equipment_inventory_id.slice(0, 8)}
                          </Link>
                        </td>
                        <td style={styles.td}>
                          {item.equipment_category ?? (
                            <span style={styles.muted}>—</span>
                          )}
                        </td>
                        <td style={styles.td}>
                          {formatDate(item.equipment_retired_at)}
                        </td>
                        <td style={styles.td}>
                          {item.equipment_retired_reason ?? (
                            <span style={styles.muted}>—</span>
                          )}
                        </td>
                        <td style={styles.tdRight}>
                          {item.template_quantity}
                        </td>
                        <td style={styles.td}>
                          {item.template_is_required ? (
                            <span style={styles.requiredBadge}>required</span>
                          ) : (
                            <span style={styles.optionalBadge}>optional</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}

            <p style={styles.note}>
              ▸ Suggested swap pattern: open the template, click
              Edit on each stale row, switch resolution from
              specific-unit to <code style={styles.code}>category</code>{' '}
              of kind so the apply-flow auto-resolves at
              dispatch time. Hard pin of a replacement instrument
              works too but inherits the same retire-risk later.
            </p>
          </>
        )
      ) : loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : (
        <div style={styles.empty}>
          Failed to load. Check the error log; refresh.
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 1200, margin: '0 auto' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  h1: { fontSize: 22, fontWeight: 600, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#6B7280', margin: 0, maxWidth: 720 },
  refreshBtn: {
    padding: '8px 14px',
    border: 'none',
    borderRadius: 6,
    background: '#1D3095',
    color: '#FFFFFF',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 500,
  },
  summaryBar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: 6,
    padding: '12px 16px',
    background: '#F9FAFB',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  summaryStrong: { color: '#111827', fontWeight: 600 },
  muted: { color: '#9CA3AF' },
  card: {
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardArchived: {
    background: '#FAFBFC',
    border: '1px dashed #D1D5DB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    opacity: 0.85,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 4px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  cardSubtitle: { fontSize: 12, color: '#6B7280', margin: 0 },
  staleCount: { color: '#B91C1C', fontWeight: 600 },
  archivedBadge: {
    background: '#F3F4F6',
    color: '#6B7280',
    padding: '1px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  editBtn: {
    padding: '6px 12px',
    border: '1px solid #1D3095',
    background: '#FFFFFF',
    color: '#1D3095',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  thRight: {
    textAlign: 'right' as const,
    padding: '8px 10px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  td: { padding: '8px 10px', borderBottom: '1px solid #F1F2F4' },
  tdRight: {
    padding: '8px 10px',
    borderBottom: '1px solid #F1F2F4',
    textAlign: 'right' as const,
  },
  link: { color: '#1D3095', textDecoration: 'none', fontWeight: 500 },
  requiredBadge: {
    background: '#FEE2E2',
    color: '#7F1D1D',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
  },
  optionalBadge: {
    background: '#F3F4F6',
    color: '#6B7280',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
  },
  empty: {
    padding: 32,
    textAlign: 'center' as const,
    color: '#6B7280',
    fontSize: 13,
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
  },
  cleanCopy: {
    fontSize: 12,
    color: '#9CA3AF',
    margin: '8px 0 0',
    fontStyle: 'italic' as const,
  },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
  },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 16,
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
};
