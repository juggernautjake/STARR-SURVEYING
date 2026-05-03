// app/admin/equipment/fleet-valuation/page.tsx — §5.12.7.7 (F10.9)
//
// Fleet valuation page. Asset list + per-row depreciation
// columns + bottom-line aggregate, with year selector + admin-
// only "Lock tax year" ritual.
//
// Two API consumers:
//   * GET /api/admin/equipment/depreciation-rollup?tax_year=YYYY
//     — drives the table.
//   * POST /api/admin/equipment/lock-tax-year — fires the lock
//     ritual + freezes equipment_tax_elections rows. Confirmation
//     modal first; admin-only.
//
// Auth: page itself uses sign-in gate via useSession; the
// rollup endpoint enforces EQUIPMENT_ROLES + bookkeeper; the
// lock endpoint enforces admin-only.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';

interface RollupAsset {
  asset_id: string;
  name: string | null;
  category: string | null;
  acquired_cost_cents: number;
  acquired_at: string | null;
  placed_in_service_at: string | null;
  depreciation_method: string;
  tax_year: number;
  is_locked: boolean;
  amount_cents: number;
  basis_cents: number;
  remaining_basis_cents: number;
  accumulated_through_year_cents: number;
  notes: string | null;
}

interface RollupResponse {
  tax_year: number;
  assets: RollupAsset[];
  totals: {
    amount_cents: number;
    basis_cents: number;
    remaining_basis_cents: number;
    accumulated_through_year_cents: number;
  };
}

interface LockResponse {
  tax_year: number;
  scanned: number;
  locked?: number;
  projected?: number;
  skipped: number;
  dry_run: boolean;
  pending?: Array<{
    equipment_id: string;
    depreciation_amount_cents: number;
  }>;
}

const METHOD_LABELS: Record<string, string> = {
  section_179: 'Section 179',
  straight_line: 'Straight-line',
  macrs_5yr: 'MACRS 5-yr',
  macrs_7yr: 'MACRS 7-yr',
  bonus_first_year: 'Bonus 1st-yr',
  none: 'None',
};

function formatCents(cents: number): string {
  if (cents === 0) return '$0';
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function FleetValuationPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('FleetValuationPage');

  const currentYear = useMemo(() => new Date().getUTCFullYear(), []);
  const [taxYear, setTaxYear] = useState<number>(currentYear);
  const [data, setData] = useState<RollupResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Lock-ritual state.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<LockResponse | null>(null);
  const [locking, setLocking] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const userRoles =
    (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
  const isAdmin = userRoles.includes('admin') || userRoles.includes('developer');

  const fetchRollup = useCallback(async () => {
    setLoading(true);
    const res = await safeFetch<RollupResponse>(
      `/api/admin/equipment/depreciation-rollup?tax_year=${taxYear}`
    );
    setLoading(false);
    if (res) setData(res);
  }, [taxYear, safeFetch]);

  useEffect(() => {
    void fetchRollup();
  }, [fetchRollup]);

  async function openLockConfirm() {
    setActionMsg(null);
    setLocking(true);
    const res = await safeFetch<LockResponse>(
      '/api/admin/equipment/lock-tax-year',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tax_year: taxYear, dry_run: true }),
      }
    );
    setLocking(false);
    if (res) {
      setPreview(res);
      setConfirmOpen(true);
    }
  }

  async function commitLock() {
    setLocking(true);
    setActionMsg(null);
    const res = await safeFetch<LockResponse>(
      '/api/admin/equipment/lock-tax-year',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tax_year: taxYear, dry_run: false }),
      }
    );
    setLocking(false);
    setConfirmOpen(false);
    if (res?.locked !== undefined) {
      setActionMsg(
        `✓ Locked ${res.locked} asset${res.locked === 1 ? '' : 's'} for ${res.tax_year}.`
      );
      void fetchRollup();
    }
  }

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Fleet valuation</h1>
          <p style={styles.subtitle}>
            §5.12.7.7 — per-asset depreciation rollup. Locked years
            read from <code style={styles.code}>equipment_tax_elections</code>;
            unlocked years compute live via §179 / MACRS / straight-line.
          </p>
        </div>
        <div style={styles.controls}>
          <label style={styles.controlLabel}>
            Tax year
            <input
              type="number"
              min={2000}
              max={currentYear}
              step={1}
              value={taxYear}
              onChange={(e) =>
                setTaxYear(Number.parseInt(e.target.value, 10))
              }
              style={styles.yearInput}
            />
          </label>
          <button
            type="button"
            onClick={() => void fetchRollup()}
            style={styles.refreshBtn}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => void openLockConfirm()}
              style={styles.lockBtn}
              disabled={locking || !data}
            >
              {locking ? 'Working…' : `Lock ${taxYear}`}
            </button>
          ) : null}
        </div>
      </header>

      {actionMsg ? (
        <div style={styles.actionMsg}>{actionMsg}</div>
      ) : null}

      {!data ? (
        <div style={styles.empty}>
          {loading
            ? 'Loading rollup…'
            : 'No rollup data — refresh to retry.'}
        </div>
      ) : data.assets.length === 0 ? (
        <div style={styles.empty}>
          No active depreciable assets in {taxYear}. Promote a
          receipt or wait for the §5.12.10 acquisition path to
          populate this table.
        </div>
      ) : (
        <>
          <div style={styles.summaryBar}>
            <SummaryStat
              label="Active assets"
              value={data.assets.length.toString()}
            />
            <SummaryStat
              label={`${taxYear} depreciation`}
              value={formatCents(data.totals.amount_cents)}
              accent
            />
            <SummaryStat
              label="Accumulated"
              value={formatCents(data.totals.accumulated_through_year_cents)}
            />
            <SummaryStat
              label="Remaining basis"
              value={formatCents(data.totals.remaining_basis_cents)}
            />
            <SummaryStat
              label="Original basis"
              value={formatCents(data.totals.basis_cents)}
              muted
            />
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Asset</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Method</th>
                  <th style={styles.th}>Placed in svc</th>
                  <th style={styles.thRight}>Cost</th>
                  <th style={styles.thRight}>{taxYear} amt</th>
                  <th style={styles.thRight}>Accum.</th>
                  <th style={styles.thRight}>Remaining</th>
                  <th style={styles.th}>State</th>
                </tr>
              </thead>
              <tbody>
                {data.assets.map((a) => (
                  <tr
                    key={a.asset_id}
                    style={a.is_locked ? styles.rowLocked : undefined}
                  >
                    <td style={styles.td}>
                      <Link
                        href={`/admin/equipment/${a.asset_id}`}
                        style={styles.link}
                      >
                        {a.name ?? a.asset_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td style={styles.td}>
                      {a.category ?? <span style={styles.muted}>—</span>}
                    </td>
                    <td style={styles.td}>
                      <span style={styles.methodChip}>
                        {METHOD_LABELS[a.depreciation_method] ??
                          a.depreciation_method}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {a.placed_in_service_at?.slice(0, 10) ?? (
                        <span style={styles.muted}>—</span>
                      )}
                    </td>
                    <td style={styles.tdRight}>
                      {formatCents(a.acquired_cost_cents)}
                    </td>
                    <td style={styles.tdRight}>
                      <strong>{formatCents(a.amount_cents)}</strong>
                    </td>
                    <td style={styles.tdRight}>
                      {formatCents(a.accumulated_through_year_cents)}
                    </td>
                    <td style={styles.tdRight}>
                      {formatCents(a.remaining_basis_cents)}
                    </td>
                    <td style={styles.td}>
                      {a.is_locked ? (
                        <span style={styles.chipLocked}>locked</span>
                      ) : (
                        <span style={styles.chipLive}>live</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={styles.tdFoot} colSpan={4}>
                    Total ({data.assets.length} assets)
                  </td>
                  <td style={styles.tdFootRight}>
                    {formatCents(data.totals.basis_cents)}
                  </td>
                  <td style={styles.tdFootRight}>
                    {formatCents(data.totals.amount_cents)}
                  </td>
                  <td style={styles.tdFootRight}>
                    {formatCents(
                      data.totals.accumulated_through_year_cents
                    )}
                  </td>
                  <td style={styles.tdFootRight}>
                    {formatCents(data.totals.remaining_basis_cents)}
                  </td>
                  <td style={styles.tdFoot}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {confirmOpen && preview ? (
        <LockConfirmModal
          preview={preview}
          locking={locking}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void commitLock()}
        />
      ) : null}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div style={styles.summaryStat}>
      <div
        style={{
          ...styles.summaryValue,
          ...(accent ? styles.summaryValueAccent : {}),
          ...(muted ? styles.summaryValueMuted : {}),
        }}
      >
        {value}
      </div>
      <div style={styles.summaryLabel}>{label}</div>
    </div>
  );
}

function LockConfirmModal({
  preview,
  locking,
  onCancel,
  onConfirm,
}: {
  preview: LockResponse;
  locking: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const totalProjected = (preview.pending ?? []).reduce(
    (sum, p) => sum + p.depreciation_amount_cents,
    0
  );
  return (
    <div style={modalStyles.backdrop} onClick={onCancel}>
      <div
        style={modalStyles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header style={modalStyles.header}>
          <h2 style={modalStyles.title}>
            Lock {preview.tax_year} depreciation?
          </h2>
        </header>
        <div style={modalStyles.body}>
          <p style={modalStyles.copy}>
            About to freeze{' '}
            <strong>{preview.projected ?? 0} asset row(s)</strong>
            {' '}for tax year{' '}
            <strong>{preview.tax_year}</strong>, totalling{' '}
            <strong>{formatCents(totalProjected)}</strong> in
            depreciation. Skipped:{' '}
            <strong>{preview.skipped}</strong>{' '}
            {preview.skipped === 1 ? 'asset' : 'assets'} (missing
            placed_in_service_at, post-end-of-schedule, etc.).
          </p>
          <p style={modalStyles.copy}>
            Once locked, the rows in{' '}
            <code style={styles.code}>equipment_tax_elections</code>{' '}
            are treated as immutable so the Schedule C numbers
            stay reproducible audit-side. Each asset&apos;s{' '}
            <code style={styles.code}>tax_year_locked_through</code>{' '}
            also bumps to {preview.tax_year}.
          </p>
        </div>
        <footer style={modalStyles.footer}>
          <button
            type="button"
            onClick={onCancel}
            disabled={locking}
            style={modalStyles.cancelBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={locking}
            style={modalStyles.confirmBtn}
          >
            {locking ? 'Locking…' : `Lock ${preview.tax_year}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: 24, maxWidth: 1280, margin: '0 auto' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  h1: { fontSize: 24, fontWeight: 600, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#6B7280', margin: 0, maxWidth: 720 },
  controls: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
  },
  controlLabel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  yearInput: {
    padding: '6px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    width: 100,
    fontFamily: 'inherit',
  },
  refreshBtn: {
    padding: '8px 14px',
    border: '1px solid #1D3095',
    background: '#FFFFFF',
    color: '#1D3095',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  lockBtn: {
    padding: '8px 14px',
    border: 'none',
    background: '#7F1D1D',
    color: '#FFFFFF',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  actionMsg: {
    background: '#DCFCE7',
    border: '1px solid #86EFAC',
    color: '#166534',
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
  },
  summaryBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 8,
    marginBottom: 16,
    padding: 16,
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
  },
  summaryStat: {
    padding: 8,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 700,
    color: '#111827',
    fontVariant: 'tabular-nums' as const,
    marginBottom: 4,
  },
  summaryValueAccent: { color: '#1D3095' },
  summaryValueMuted: { color: '#6B7280' },
  summaryLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  tableWrap: {
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
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
  thRight: {
    textAlign: 'right' as const,
    padding: '10px 12px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  td: { padding: '10px 12px', borderBottom: '1px solid #F1F2F4' },
  tdRight: {
    padding: '10px 12px',
    borderBottom: '1px solid #F1F2F4',
    textAlign: 'right' as const,
    fontVariant: 'tabular-nums' as const,
  },
  tdFoot: {
    padding: '12px',
    fontWeight: 700,
    background: '#F9FAFB',
    borderTop: '2px solid #E2E5EB',
  },
  tdFootRight: {
    padding: '12px',
    fontWeight: 700,
    background: '#F9FAFB',
    borderTop: '2px solid #E2E5EB',
    textAlign: 'right' as const,
    fontVariant: 'tabular-nums' as const,
  },
  rowLocked: {
    background: '#FAFBFC',
  },
  link: { color: '#1D3095', textDecoration: 'none', fontWeight: 500 },
  muted: { color: '#9CA3AF' },
  methodChip: {
    display: 'inline-block',
    padding: '2px 8px',
    background: '#EEF2FF',
    color: '#3730A3',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
  },
  chipLocked: {
    display: 'inline-block',
    padding: '2px 8px',
    background: '#FEE2E2',
    color: '#7F1D1D',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  chipLive: {
    display: 'inline-block',
    padding: '2px 8px',
    background: '#FEF3C7',
    color: '#78350F',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
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
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
    margin: '0 2px',
  },
};

const modalStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.5)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 80,
    zIndex: 1000,
  },
  modal: {
    background: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 540,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
  },
  header: {
    padding: '14px 20px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 16, fontWeight: 600, margin: 0 },
  body: {
    padding: 20,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  copy: {
    margin: 0,
    fontSize: 13,
    color: '#374151',
    lineHeight: 1.5,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '12px 20px',
    borderTop: '1px solid #E2E5EB',
    background: '#FAFBFC',
    borderRadius: '0 0 12px 12px',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
  },
  confirmBtn: {
    background: '#7F1D1D',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
};
