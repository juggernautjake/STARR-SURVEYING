// app/admin/equipment/overrides/page.tsx
//
// Phase F10.6-g-ii — §5.12.7.7 override audit panel. Closes
// F10.6. Read-only table consuming the F10.6-g-i aggregator at
// GET /api/admin/equipment/overrides. Surfaces every
// is_override=true row across both equipment_reservations
// (F10.3-e) and job_team (F10.4-c) so admins review the
// "nothing-is-silent" trail in one place.
//
// Auth: useSession sign-in gate; the aggregator enforces
// EQUIPMENT_ROLES server-side.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';

type OverrideKind = 'equipment' | 'personnel';
type FilterMode = 'both' | 'equipment' | 'personnel';

interface UnifiedOverride {
  kind: OverrideKind;
  override_id: string;
  created_at: string;
  actor_email: string | null;
  target_label: string;
  target_id: string;
  job_id: string;
  state: string;
  reason: string | null;
  notes: string | null;
  window_from: string | null;
  window_to: string | null;
}

interface OverridesResponse {
  overrides: UnifiedOverride[];
  summary: {
    total: number;
    equipment: number;
    personnel: number;
    since: string;
    type: string;
    truncated: boolean;
  };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

function defaultSinceIso(): string {
  const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export default function OverridesAuditPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('OverridesAuditPage');

  const [since, setSince] = useState<string>(defaultSinceIso());
  const [type, setType] = useState<FilterMode>('both');
  const [data, setData] = useState<OverridesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverrides = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ since, type });
    const res = await safeFetch<OverridesResponse>(
      `/api/admin/equipment/overrides?${params.toString()}`
    );
    setLoading(false);
    if (res) setData(res);
  }, [since, type, safeFetch]);

  useEffect(() => {
    void fetchOverrides();
  }, [fetchOverrides]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Override audit</h1>
          <p style={styles.subtitle}>
            §5.12.7.7 — every soft-override across reservations and
            personnel assignments. The "nothing is silent" trail
            from F10.3-e + F10.4-c.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchOverrides()}
          disabled={loading}
          style={styles.refreshBtn}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Since</span>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            style={styles.dateInput}
          />
          <button
            type="button"
            style={styles.linkBtn}
            onClick={() => setSince(defaultSinceIso())}
          >
            last 30d
          </button>
        </div>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Type</span>
          <KindToggle label="Both" mode="both" current={type} onClick={setType} />
          <KindToggle
            label="Equipment"
            mode="equipment"
            current={type}
            onClick={setType}
          />
          <KindToggle
            label="Personnel"
            mode="personnel"
            current={type}
            onClick={setType}
          />
        </div>
      </div>

      {data ? (
        <>
          <div style={styles.summaryBar}>
            <span style={styles.summaryStrong}>
              {data.summary.total}
            </span>
            <span style={styles.muted}>
              override{data.summary.total === 1 ? '' : 's'} ·
            </span>
            <span style={styles.muted}>
              {data.summary.equipment} equipment · {data.summary.personnel}{' '}
              personnel
            </span>
            {data.summary.truncated ? (
              <span style={styles.truncatedPill}>truncated at limit</span>
            ) : null}
          </div>

          {data.overrides.length === 0 ? (
            <div style={styles.empty}>
              <strong>✓ Clean window.</strong>
              <p style={styles.cleanCopy}>
                No soft-overrides in the selected range. Widen the
                <code style={styles.code}>since</code> date if you
                want a longer audit horizon.
              </p>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Kind</th>
                  <th style={styles.th}>When</th>
                  <th style={styles.th}>Actor</th>
                  <th style={styles.th}>Target</th>
                  <th style={styles.th}>Job</th>
                  <th style={styles.th}>State</th>
                  <th style={styles.th}>Reason</th>
                  <th style={styles.th}>Window</th>
                </tr>
              </thead>
              <tbody>
                {data.overrides.map((o) => (
                  <tr key={`${o.kind}:${o.override_id}`}>
                    <td style={styles.td}>
                      <KindBadge kind={o.kind} />
                    </td>
                    <td style={styles.tdMuted}>
                      {formatDateTime(o.created_at)}
                    </td>
                    <td style={styles.td}>
                      {o.actor_email ?? (
                        <span
                          style={styles.muted}
                          title="job_team has no historical actor column; F10.4-c logs are the audit anchor for now"
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {o.kind === 'equipment' ? (
                        <Link
                          href={`/admin/equipment/${o.target_id}`}
                          style={styles.link}
                        >
                          {o.target_label}
                        </Link>
                      ) : (
                        <span>{o.target_label}</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <Link
                        href={`/admin/jobs/${o.job_id}`}
                        style={styles.link}
                      >
                        {o.job_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td style={styles.td}>
                      <StateBadge state={o.state} />
                    </td>
                    <td style={styles.td}>
                      {o.reason ?? <span style={styles.muted}>—</span>}
                      {o.notes && o.notes !== o.reason ? (
                        <div style={styles.notesLine}>{o.notes}</div>
                      ) : null}
                    </td>
                    <td style={styles.tdMuted}>
                      {o.window_from
                        ? `${formatDateTime(o.window_from)} →\n${formatDateTime(
                            o.window_to
                          )}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p style={styles.note}>
            ▸ Equipment-side actor resolves via
            <code style={styles.code}>
              reserved_by → registered_users.email
            </code>
            . Personnel-side actor is null for now —
            <code style={styles.code}>job_team</code> has no
            historical
            <code style={styles.code}>created_by</code> column;
            F10.4-c application logs are the audit anchor until a
            future migration adds the column.
          </p>
        </>
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

function KindToggle({
  label,
  mode,
  current,
  onClick,
}: {
  label: string;
  mode: FilterMode;
  current: FilterMode;
  onClick: (m: FilterMode) => void;
}) {
  const active = current === mode;
  return (
    <button
      type="button"
      style={active ? styles.toggleActive : styles.toggleIdle}
      onClick={() => onClick(mode)}
    >
      {label}
    </button>
  );
}

function KindBadge({ kind }: { kind: OverrideKind }) {
  const style =
    kind === 'equipment'
      ? { ...styles.kindBadge, ...styles.kindEquipment }
      : { ...styles.kindBadge, ...styles.kindPersonnel };
  return <span style={style}>{kind}</span>;
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, React.CSSProperties> = {
    held: { background: '#DBEAFE', color: '#1E3A8A' },
    checked_out: { background: '#1D3095', color: '#FFFFFF' },
    returned: { background: '#E5E7EB', color: '#374151' },
    cancelled: { background: '#F3F4F6', color: '#9CA3AF' },
    proposed: { background: '#DCFCE7', color: '#166534' },
    confirmed: { background: '#15803D', color: '#FFFFFF' },
    declined: { background: '#FEE2E2', color: '#7F1D1D' },
    unknown: { background: '#F3F4F6', color: '#6B7280' },
  };
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em',
        ...(map[state] ?? map.unknown),
      }}
    >
      {state}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 1300, margin: '0 auto' },
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
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: 16,
    padding: '12px 16px',
    background: '#F9FAFB',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    marginBottom: 12,
  },
  filterGroup: { display: 'flex', alignItems: 'center', gap: 6 },
  filterLabel: { fontSize: 12, color: '#6B7280', fontWeight: 500 },
  dateInput: {
    padding: '4px 8px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
  },
  linkBtn: {
    padding: '0 4px',
    background: 'transparent',
    border: 'none',
    color: '#1D3095',
    fontSize: 11,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  toggleActive: {
    padding: '4px 10px',
    border: '1px solid #1D3095',
    background: '#1D3095',
    color: '#FFFFFF',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  toggleIdle: {
    padding: '4px 10px',
    border: '1px solid #E2E5EB',
    background: '#FFFFFF',
    color: '#374151',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
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
  truncatedPill: {
    background: '#FEF3C7',
    color: '#78350F',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    marginLeft: 8,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
    fontSize: 13,
  },
  th: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #F1F2F4',
    verticalAlign: 'top' as const,
  },
  tdMuted: {
    padding: '10px 12px',
    borderBottom: '1px solid #F1F2F4',
    fontSize: 12,
    color: '#6B7280',
    whiteSpace: 'pre-line' as const,
    verticalAlign: 'top' as const,
  },
  link: { color: '#1D3095', textDecoration: 'none', fontWeight: 500 },
  notesLine: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    fontStyle: 'italic' as const,
  },
  kindBadge: {
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  kindEquipment: { background: '#FEF3C7', color: '#78350F' },
  kindPersonnel: { background: '#DBEAFE', color: '#1E3A8A' },
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
    margin: '0 2px',
  },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 16,
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
};
