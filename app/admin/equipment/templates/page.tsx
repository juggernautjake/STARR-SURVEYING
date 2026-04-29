// app/admin/equipment/templates/page.tsx — Templates catalogue (Phase F10.2d)
//
// Read + archive list view. The user's headline ask: dispatchers
// browse a curated set of reusable equipment bundles, pick one,
// apply it to a job. This page is the browse half; F10.2e handles
// create + edit; F10.2g handles apply (deferred to F10.3 with
// reservations).
//
// Auth: admin / developer / tech_support / equipment_manager —
// every internal role reads templates; only admin +
// equipment_manager create / archive (per §5.12.3).
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';

interface TemplateRow {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  job_type: string | null;
  default_crew_size: number | null;
  default_duration_hours: number | null;
  requires_certifications: string[];
  composes_from: string[];
  version: number;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

interface CatalogueResponse {
  items: TemplateRow[];
  total_count: number | null;
  filters_applied: {
    job_type: string | null;
    include_archived: boolean;
    q: string | null;
  };
  limit: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatLabel(raw: string | null): string {
  if (!raw) return '—';
  return raw
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function TemplatesListPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('TemplatesListPage');

  const [jobType, setJobType] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [q, setQ] = useState('');
  const [data, setData] = useState<CatalogueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (jobType.trim()) params.set('job_type', jobType.trim());
    if (includeArchived) params.set('include_archived', '1');
    if (q.trim()) params.set('q', q.trim());
    return params.toString();
  }, [jobType, includeArchived, q]);

  const fetchTemplates = useCallback(async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    const json = await safeFetch<CatalogueResponse>(
      `/api/admin/equipment/templates${queryString ? `?${queryString}` : ''}`
    );
    if (json) setData(json);
    setLoading(false);
  }, [session, safeFetch, queryString]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const archiveTemplate = useCallback(
    async (id: string, name: string) => {
      const ok = window.confirm(
        `Archive "${name}"? Archived templates are hidden from the picker by default; existing job assignments and audit history are preserved.`
      );
      if (!ok) return;
      setArchivingId(id);
      setActionMsg(null);
      const res = await fetch(`/api/admin/equipment/templates/${id}`, {
        method: 'DELETE',
      });
      setArchivingId(null);
      if (res.ok) {
        setActionMsg(`✓ Archived "${name}".`);
        void fetchTemplates();
      } else {
        const json = await res.json().catch(() => ({}));
        setActionMsg(
          `⚠ Archive failed: ${json.error ?? `HTTP ${res.status}`}`
        );
      }
    },
    [fetchTemplates]
  );

  const restoreTemplate = useCallback(
    async (id: string, name: string) => {
      setArchivingId(id);
      setActionMsg(null);
      const res = await fetch(`/api/admin/equipment/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: false }),
      });
      setArchivingId(null);
      if (res.ok) {
        setActionMsg(`✓ Restored "${name}".`);
        void fetchTemplates();
      } else {
        const json = await res.json().catch(() => ({}));
        setActionMsg(
          `⚠ Restore failed: ${json.error ?? `HTTP ${res.status}`}`
        );
      }
    },
    [fetchTemplates]
  );

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }
  const items = data?.items ?? [];

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Equipment templates</h1>
        <p style={styles.subtitle}>
          Reusable bundles dispatchers apply to jobs in one tap —{' '}
          &quot;4-corner residential boundary, total station kit&quot; or
          &quot;OSHA road-work add-on&quot;. Pick a row to edit, or create
          a new template.
        </p>
      </header>

      <div style={styles.controls}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Job type</span>
          <input
            type="text"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            placeholder="boundary / topo / stakeout"
            style={styles.input}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Search</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="name · description"
            style={{ ...styles.input, minWidth: 220 }}
          />
        </label>
        <label style={styles.checkboxField}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          <span>Include archived</span>
        </label>
        <button
          type="button"
          style={styles.refreshBtn}
          onClick={() => void fetchTemplates()}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <Link href="/admin/equipment/templates/new" style={styles.addBtn}>
          + New template
        </Link>
      </div>

      {actionMsg ? (
        <div
          style={
            actionMsg.startsWith('✓')
              ? styles.actionMsgOk
              : styles.actionMsgWarn
          }
        >
          {actionMsg}
        </div>
      ) : null}

      {data ? (
        <div style={styles.summary}>
          Showing <strong>{items.length}</strong>
          {data.total_count != null && data.total_count !== items.length
            ? ` of ${data.total_count}`
            : ''}{' '}
          template{items.length === 1 ? '' : 's'}
          {includeArchived ? ' (archived included)' : ''}
        </div>
      ) : null}

      {loading && !data ? (
        <div style={styles.empty}>Loading templates…</div>
      ) : items.length === 0 ? (
        <div style={styles.empty}>
          No templates match these filters. Click{' '}
          <strong>+ New template</strong> to create one — or apply{' '}
          <code>seeds/237</code> if this is a fresh database.
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Job type</th>
              <th style={styles.thRight}>Items</th>
              <th style={styles.thRight}>Crew</th>
              <th style={styles.thRight}>Hours</th>
              <th style={styles.th}>Composes</th>
              <th style={styles.th}>Version</th>
              <th style={styles.th}>Last edited</th>
              <th style={styles.th}>Status</th>
              <th style={styles.thRight}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const composesCount = row.composes_from?.length ?? 0;
              const isArchived = row.is_archived;
              return (
                <tr
                  key={row.id}
                  style={isArchived ? styles.archivedRow : undefined}
                >
                  <td style={styles.td}>
                    <Link
                      href={`/admin/equipment/templates/${row.id}`}
                      style={styles.link}
                    >
                      <strong>{row.name}</strong>
                    </Link>
                    {row.description ? (
                      <div style={styles.descLine}>{row.description}</div>
                    ) : null}
                    {row.requires_certifications?.length > 0 ? (
                      <div style={styles.certRow}>
                        {row.requires_certifications.map((c) => (
                          <span key={c} style={styles.certBadge}>
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td style={styles.td}>
                    {row.job_type ? (
                      <span style={styles.jobTypeBadge}>
                        {formatLabel(row.job_type)}
                      </span>
                    ) : (
                      <span style={styles.muted}>—</span>
                    )}
                  </td>
                  <td style={styles.tdRight}>{row.item_count ?? 0}</td>
                  <td style={styles.tdRight}>
                    {row.default_crew_size ?? (
                      <span style={styles.muted}>—</span>
                    )}
                  </td>
                  <td style={styles.tdRight}>
                    {row.default_duration_hours ?? (
                      <span style={styles.muted}>—</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {composesCount > 0 ? (
                      <span title="Stacks on top of other templates per §5.12.3 composition">
                        ⊕ {composesCount}
                      </span>
                    ) : (
                      <span style={styles.muted}>—</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <code style={styles.code}>v{row.version}</code>
                  </td>
                  <td style={styles.td}>{formatDate(row.updated_at)}</td>
                  <td style={styles.td}>
                    {isArchived ? (
                      <span style={styles.archivedBadge}>Archived</span>
                    ) : (
                      <span style={styles.activeBadge}>Active</span>
                    )}
                  </td>
                  <td style={styles.tdRight}>
                    <div style={styles.rowActionBar}>
                      <Link
                        href={`/admin/equipment/templates/${row.id}`}
                        style={styles.rowActionBtn}
                      >
                        Edit
                      </Link>
                      {isArchived ? (
                        <button
                          type="button"
                          style={styles.rowActionBtnRestore}
                          onClick={() =>
                            void restoreTemplate(row.id, row.name)
                          }
                          disabled={archivingId === row.id}
                        >
                          {archivingId === row.id ? '…' : 'Restore'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={styles.rowActionBtnArchive}
                          onClick={() =>
                            void archiveTemplate(row.id, row.name)
                          }
                          disabled={archivingId === row.id}
                        >
                          {archivingId === row.id ? '…' : 'Archive'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p style={styles.note}>
        ▸ Activation gate: <code>seeds/237</code> must be applied to live
        Supabase before templates can be created. Sidebar entry lands in
        Phase F10.6 alongside the rest of the Equipment dashboard group.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 1400, margin: '0 auto' },
  header: { marginBottom: 16 },
  h1: { fontSize: 22, fontWeight: 600, margin: '0 0 4px' },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    margin: 0,
    maxWidth: 760,
    lineHeight: 1.5,
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 16,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    fontSize: 13,
    minWidth: 160,
  },
  checkboxField: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    paddingBottom: 8,
  },
  refreshBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
  },
  addBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
    display: 'inline-block',
  },
  summary: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  actionMsgOk: {
    background: '#F0FDF4',
    border: '1px solid #86EFAC',
    color: '#15803D',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  actionMsgWarn: {
    background: '#FEF3C7',
    border: '1px solid #FCD34D',
    color: '#92400E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
    background: '#F7F8FA',
    borderRadius: 12,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    color: '#6B7280',
    fontWeight: 500,
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  thRight: {
    textAlign: 'right',
    padding: '10px 14px',
    color: '#6B7280',
    fontWeight: 500,
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  td: {
    padding: '10px 14px',
    borderBottom: '1px solid #F3F4F6',
    verticalAlign: 'top',
  },
  tdRight: {
    padding: '10px 14px',
    borderBottom: '1px solid #F3F4F6',
    textAlign: 'right',
    verticalAlign: 'top',
    fontVariantNumeric: 'tabular-nums',
  },
  archivedRow: { background: '#FAFAFA', color: '#9CA3AF' },
  link: { color: '#1D3095', textDecoration: 'none' },
  descLine: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    maxWidth: 360,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  certRow: { display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  certBadge: {
    fontSize: 10,
    padding: '1px 6px',
    background: '#FEF3C7',
    color: '#92400E',
    borderRadius: 4,
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  jobTypeBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    background: '#E0E7FF',
    color: '#4338CA',
    fontSize: 11,
    fontWeight: 600,
  },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#F7F8FA',
    padding: '1px 6px',
    borderRadius: 4,
  },
  muted: { color: '#9CA3AF' },
  activeBadge: {
    fontSize: 10,
    padding: '2px 6px',
    background: '#DCFCE7',
    color: '#15803D',
    borderRadius: 999,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  archivedBadge: {
    fontSize: 10,
    padding: '2px 6px',
    background: '#F3F4F6',
    color: '#6B7280',
    borderRadius: 999,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowActionBar: {
    display: 'inline-flex',
    gap: 6,
    justifyContent: 'flex-end',
  },
  rowActionBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#1D3095',
    fontWeight: 500,
    textDecoration: 'none',
    display: 'inline-block',
  },
  rowActionBtnArchive: {
    background: 'transparent',
    border: '1px solid #FCA5A5',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: 500,
  },
  rowActionBtnRestore: {
    background: 'transparent',
    border: '1px solid #86EFAC',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#15803D',
    fontWeight: 500,
  },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 24,
    fontStyle: 'italic',
  },
};
