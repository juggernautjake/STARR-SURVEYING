// app/admin/finances/page.tsx — Tax-time finances landing page (Batch QQ part-2)
//
// Schedule-C-shaped report joining approved/exported receipts with
// business mileage. Powered by the Batch QQ part-1 endpoints:
//   GET  /api/admin/finances/tax-summary?year=YYYY[&format=csv]
//   POST /api/admin/finances/mark-exported
//
// Page surfaces:
//   * Year picker + Refresh / Export CSV / Lock period actions
//   * Three status-segmented stat cards (anti-double-counting view)
//   * Schedule C breakdown table
//   * Mileage section (per-user + per-vehicle)
//   * By tax flag audit cross-check
//   * Top vendors · Receipts by submitter
//   * Prior-period traceback (only when already-exported rows present)
//
// Style mirrors /admin/mileage/page.tsx (inline-styled, no AdminCommon
// stylesheet) so the batch lands without touching shared CSS.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

import { usePageError } from '../hooks/usePageError';

interface ByStatusBucket {
  count: number;
  total_cents: number;
  deductible_cents: number;
}

interface ByCategoryRow {
  category: string;
  count: number;
  total_cents: number;
  deductible_cents: number;
  schedule_c_line: string;
}

interface ByTaxFlagRow {
  flag: string;
  count: number;
  total_cents: number;
  deductible_cents: number;
}

interface VendorRow {
  vendor_name: string;
  count: number;
  total_cents: number;
}

interface ByUserReceiptsRow {
  email: string;
  name: string | null;
  count: number;
  total_cents: number;
}

interface MileageByUserRow {
  email: string;
  miles: number;
  deduction_cents: number;
}

interface MileageByVehicleRow {
  vehicle_id: string;
  name: string;
  miles: number;
  deduction_cents: number;
}

interface ExportedPeriodRow {
  exported_period: string;
  count: number;
  total_cents: number;
}

interface TaxSummaryResponse {
  period: { year: number | null; from: string; to: string };
  irs_rate_cents_per_mile: number;
  status_filter: 'approved' | 'exported' | 'all';
  receipts: {
    total_cents: number;
    count: number;
    by_status: { approved: ByStatusBucket; exported: ByStatusBucket };
    by_category: ByCategoryRow[];
    by_tax_flag: ByTaxFlagRow[];
    top_vendors: VendorRow[];
    by_user: ByUserReceiptsRow[];
    exported_periods: ExportedPeriodRow[];
  };
  mileage: {
    total_miles: number;
    deduction_cents: number;
    by_user: MileageByUserRow[];
    by_vehicle: MileageByVehicleRow[];
  };
  totals: { deductible_cents: number; expense_cents: number };
}

function formatCategory(raw: string): string {
  return raw
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function dollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function currentYear(): number {
  return new Date().getFullYear();
}

export default function FinancesPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('FinancesPage');

  const [year, setYear] = useState<number>(currentYear());
  const [data, setData] = useState<TaxSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [locking, setLocking] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [periodLabel, setPeriodLabel] = useState<string>(String(year));

  const fetchSummary = useCallback(async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    const json = await safeFetch<TaxSummaryResponse>(
      `/api/admin/finances/tax-summary?year=${year}`
    );
    if (json) setData(json);
    setLoading(false);
  }, [session, safeFetch, year]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  // Keep period label in sync when the user picks a different year —
  // unless they've manually edited it (we treat any non-default value
  // as user-set and don't clobber it).
  useEffect(() => {
    setPeriodLabel((prev) =>
      /^\d{4}$/.test(prev) ? String(year) : prev
    );
  }, [year]);

  const exportCsv = useCallback(() => {
    setExporting(true);
    setActionMsg(null);
    // Browser-native download — the endpoint sets the right
    // Content-Disposition. Anchor click is more reliable than
    // window.open across browsers.
    try {
      const url = `/api/admin/finances/tax-summary?year=${year}&format=csv`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax_summary_${year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setExporting(false);
    }
  }, [year]);

  const lockPeriod = useCallback(async () => {
    if (!data) return;
    const lockable = data.receipts.by_status.approved.count;
    if (lockable === 0) return;
    const label = periodLabel.trim() || String(year);
    const ok = window.confirm(
      `Lock ${lockable} approved receipt${lockable === 1 ? '' : 's'} into period "${label}"?\n\n` +
        `These rows will flip to status='exported' and stop appearing as "ready to lock" on this page. ` +
        `Re-running this action for the same period is a no-op.`
    );
    if (!ok) return;
    setLocking(true);
    setActionMsg(null);
    type LockResult = {
      locked: number;
      already_exported: number;
      pending_or_rejected: number;
      soft_deleted: number;
      period_label: string;
      exported_at: string;
    };
    const result = await safeFetch<LockResult>(
      `/api/admin/finances/mark-exported`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, period_label: label }),
      }
    );
    setLocking(false);
    if (result) {
      setActionMsg(
        `✓ Locked ${result.locked} receipt${result.locked === 1 ? '' : 's'} into period "${result.period_label}". ` +
          `${result.already_exported} were already filed; ${result.pending_or_rejected} pending/rejected; ` +
          `${result.soft_deleted} soft-deleted.`
      );
      void fetchSummary();
    } else {
      setActionMsg(
        '⚠ Lock failed — see error log. Period left unchanged.'
      );
    }
  }, [data, periodLabel, year, safeFetch, fetchSummary]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Finances — tax-time summary</h1>
        <p style={styles.subtitle}>
          Schedule-C-shaped report joining approved + exported receipts
          with business mileage. Pick a tax year, review the
          breakdown, then export the CSV for your CPA. Use{' '}
          <strong>Lock period</strong> to mark this year's approved
          receipts as filed so they aren't double-counted next year.
        </p>
      </header>

      <div style={styles.controls}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Tax year</span>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            style={styles.input}
          >
            {/* Five-year backward window + current; configurable later */}
            {Array.from({ length: 6 }, (_, i) => currentYear() - i).map(
              (y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              )
            )}
          </select>
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Period label</span>
          <input
            type="text"
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder={String(year)}
            style={styles.input}
            maxLength={64}
          />
        </label>
        <button
          type="button"
          style={styles.refreshBtn}
          onClick={() => void fetchSummary()}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          style={styles.exportBtn}
          onClick={() => exportCsv()}
          disabled={exporting || loading || !data || data.receipts.count === 0}
          title={
            !data || data.receipts.count === 0
              ? 'No receipts in this period to export'
              : 'Download a tax-prep-friendly CSV (Schedule C lines, mileage, totals)'
          }
        >
          {exporting ? 'Exporting…' : '⬇ Export CSV'}
        </button>
        <button
          type="button"
          style={styles.lockBtn}
          onClick={() => void lockPeriod()}
          disabled={
            locking ||
            loading ||
            !data ||
            data.receipts.by_status.approved.count === 0
          }
          title={
            !data
              ? 'Loading…'
              : data.receipts.by_status.approved.count === 0
                ? 'Nothing new to lock — every approved receipt in this window is already filed.'
                : `Lock ${data.receipts.by_status.approved.count} approved receipt(s) into "${periodLabel.trim() || String(year)}"`
          }
        >
          {locking
            ? 'Locking…'
            : `🔒 Lock ${data?.receipts.by_status.approved.count ?? 0} into period`}
        </button>
      </div>

      {actionMsg ? (
        <div
          style={
            actionMsg.startsWith('✓') ? styles.actionMsgOk : styles.actionMsgWarn
          }
        >
          {actionMsg}
        </div>
      ) : null}

      {loading && !data ? (
        <div style={styles.empty}>Loading…</div>
      ) : !data ? (
        <div style={styles.empty}>
          No data — the tax-summary endpoint returned nothing for {year}.
        </div>
      ) : (
        <>
          <section style={styles.statGrid}>
            <article
              style={{
                ...styles.statCard,
                ...styles.statCardNew,
              }}
            >
              <div style={styles.statBadgeNew}>Ready to lock</div>
              <span style={styles.statValue}>
                {data.receipts.by_status.approved.count}
              </span>
              <span style={styles.statSub}>new approved receipts</span>
              <div style={styles.statFooter}>
                <span>
                  {dollars(data.receipts.by_status.approved.total_cents)}{' '}
                  gross
                </span>
                <span>
                  {dollars(
                    data.receipts.by_status.approved.deductible_cents
                  )}{' '}
                  deductible
                </span>
              </div>
            </article>

            <article
              style={{
                ...styles.statCard,
                ...styles.statCardFiled,
              }}
            >
              <div style={styles.statBadgeFiled}>Already filed</div>
              <span style={styles.statValue}>
                {data.receipts.by_status.exported.count}
              </span>
              <span style={styles.statSub}>
                receipts locked into a prior period
              </span>
              <div style={styles.statFooter}>
                <span>
                  {dollars(data.receipts.by_status.exported.total_cents)}{' '}
                  gross
                </span>
                <span>
                  {dollars(
                    data.receipts.by_status.exported.deductible_cents
                  )}{' '}
                  deductible
                </span>
              </div>
            </article>

            <article style={styles.statCard}>
              <div style={styles.statBadgeTotal}>Period totals</div>
              <span style={styles.statValue}>
                {dollars(data.totals.deductible_cents)}
              </span>
              <span style={styles.statSub}>
                total deductible (receipts + mileage)
              </span>
              <div style={styles.statFooter}>
                <span>
                  {dollars(data.totals.expense_cents)} gross expense
                </span>
                <span>
                  {data.mileage.total_miles.toFixed(0)} mi @{' '}
                  {(data.irs_rate_cents_per_mile / 100).toFixed(2)}
                </span>
              </div>
            </article>
          </section>

          <section style={styles.section}>
            <header style={styles.sectionHeader}>
              <h2 style={styles.h2}>Schedule C breakdown</h2>
              <p style={styles.sectionSub}>
                Receipts grouped by IRS Schedule C line. Bookkeeper /
                CPA can re-classify in QuickBooks before filing.
              </p>
            </header>
            {data.receipts.by_category.length === 0 ? (
              <div style={styles.empty}>
                No receipts in this period yet.
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Schedule C line</th>
                    <th style={styles.th}>Category</th>
                    <th style={styles.thRight}>Count</th>
                    <th style={styles.thRight}>Gross</th>
                    <th style={styles.thRight}>Deductible</th>
                  </tr>
                </thead>
                <tbody>
                  {data.receipts.by_category.map((c) => (
                    <tr key={c.category}>
                      <td style={styles.td}>{c.schedule_c_line}</td>
                      <td style={styles.td}>{formatCategory(c.category)}</td>
                      <td style={styles.tdRight}>{c.count}</td>
                      <td style={styles.tdRight}>
                        {dollars(c.total_cents)}
                      </td>
                      <td style={styles.tdRight}>
                        <strong>{dollars(c.deductible_cents)}</strong>
                      </td>
                    </tr>
                  ))}
                  <tr style={styles.totalsRow}>
                    <td style={styles.td}>—</td>
                    <td style={styles.td}>
                      <strong>All categories</strong>
                    </td>
                    <td style={styles.tdRight}>
                      <strong>{data.receipts.count}</strong>
                    </td>
                    <td style={styles.tdRight}>
                      <strong>{dollars(data.receipts.total_cents)}</strong>
                    </td>
                    <td style={styles.tdRight}>
                      <strong>
                        {dollars(
                          data.receipts.by_category.reduce(
                            (s, c) => s + c.deductible_cents,
                            0
                          )
                        )}
                      </strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          {/* Mileage — the other deductible half. Two stacked sub-tables
              so the bookkeeper can verify per-user totals add up before
              the per-vehicle breakdown drives the IRS-grade allocation. */}
          <section style={styles.section}>
            <header style={styles.sectionHeader}>
              <h2 style={styles.h2}>Mileage</h2>
              <p style={styles.sectionSub}>
                Business miles aggregated from `location_segments`,
                deducted at the IRS standard rate of{' '}
                {(data.irs_rate_cents_per_mile / 100).toFixed(2)}/mi.
                Driver miles only — passenger time excluded.
              </p>
            </header>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Surveyor</th>
                  <th style={styles.thRight}>Miles</th>
                  <th style={styles.thRight}>Deduction</th>
                </tr>
              </thead>
              <tbody>
                {data.mileage.by_user.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={styles.tdEmpty}>
                      No business miles in this period.
                    </td>
                  </tr>
                ) : (
                  data.mileage.by_user.map((u) => (
                    <tr key={`mileage-user-${u.email}`}>
                      <td style={styles.td}>{u.email}</td>
                      <td style={styles.tdRight}>{u.miles.toFixed(1)}</td>
                      <td style={styles.tdRight}>
                        {dollars(u.deduction_cents)}
                      </td>
                    </tr>
                  ))
                )}
                <tr style={styles.totalsRow}>
                  <td style={styles.td}>
                    <strong>All surveyors</strong>
                  </td>
                  <td style={styles.tdRight}>
                    <strong>{data.mileage.total_miles.toFixed(1)}</strong>
                  </td>
                  <td style={styles.tdRight}>
                    <strong>{dollars(data.mileage.deduction_cents)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
            {data.mileage.by_vehicle.length > 0 ? (
              <>
                <div style={styles.subHeader}>By vehicle</div>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Vehicle</th>
                      <th style={styles.thRight}>Miles</th>
                      <th style={styles.thRight}>Deduction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mileage.by_vehicle.map((v) => (
                      <tr key={`mileage-vehicle-${v.vehicle_id}`}>
                        <td style={styles.td}>{v.name}</td>
                        <td style={styles.tdRight}>{v.miles.toFixed(1)}</td>
                        <td style={styles.tdRight}>
                          {dollars(v.deduction_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </section>

          {/* Audit cross-check — by tax flag. If the column total here
              differs from the Schedule C deductible total, something
              upstream has miscategorised. */}
          <section style={styles.section}>
            <header style={styles.sectionHeader}>
              <h2 style={styles.h2}>By tax flag (audit cross-check)</h2>
              <p style={styles.sectionSub}>
                Should sum to the same deductible total as the Schedule C
                breakdown above. A mismatch indicates a category /
                tax_deductible_flag misalignment worth investigating.
              </p>
            </header>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Flag</th>
                  <th style={styles.thRight}>Count</th>
                  <th style={styles.thRight}>Gross</th>
                  <th style={styles.thRight}>Deductible</th>
                </tr>
              </thead>
              <tbody>
                {data.receipts.by_tax_flag.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={styles.tdEmpty}>
                      No flagged receipts in this period.
                    </td>
                  </tr>
                ) : (
                  data.receipts.by_tax_flag.map((f) => (
                    <tr key={`flag-${f.flag}`}>
                      <td style={styles.td}>{formatCategory(f.flag)}</td>
                      <td style={styles.tdRight}>{f.count}</td>
                      <td style={styles.tdRight}>
                        {dollars(f.total_cents)}
                      </td>
                      <td style={styles.tdRight}>
                        {dollars(f.deductible_cents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {/* Top vendors — useful for spotting patterns
              ("Why do we spend $X/yr at Buc-ee's?") without
              cross-referencing the per-row receipts page. */}
          <section style={styles.section}>
            <header style={styles.sectionHeader}>
              <h2 style={styles.h2}>Top vendors</h2>
              <p style={styles.sectionSub}>
                Top 10 by spend. Consolidates fuel + supplies +
                meals into one ranked view.
              </p>
            </header>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Vendor</th>
                  <th style={styles.thRight}>Receipts</th>
                  <th style={styles.thRight}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.receipts.top_vendors.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={styles.tdEmpty}>
                      No vendor data in this period.
                    </td>
                  </tr>
                ) : (
                  data.receipts.top_vendors.map((v) => (
                    <tr key={`vendor-${v.vendor_name}`}>
                      <td style={styles.td}>{v.vendor_name}</td>
                      <td style={styles.tdRight}>{v.count}</td>
                      <td style={styles.tdRight}>
                        {dollars(v.total_cents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {/* Per-submitter receipts — useful for reimbursement
              reconciliation if the firm runs a reimbursement loop
              for crew-paid receipts. */}
          <section style={styles.section}>
            <header style={styles.sectionHeader}>
              <h2 style={styles.h2}>Receipts by submitter</h2>
              <p style={styles.sectionSub}>
                Per-surveyor totals — feeds reimbursement reconciliation
                when crew members pay out of pocket.
              </p>
            </header>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Submitter</th>
                  <th style={styles.thRight}>Receipts</th>
                  <th style={styles.thRight}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.receipts.by_user.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={styles.tdEmpty}>
                      No submitter data in this period.
                    </td>
                  </tr>
                ) : (
                  data.receipts.by_user.map((u) => (
                    <tr key={`submitter-${u.email}`}>
                      <td style={styles.td}>
                        {u.name ? `${u.name} (${u.email})` : u.email}
                      </td>
                      <td style={styles.tdRight}>{u.count}</td>
                      <td style={styles.tdRight}>
                        {dollars(u.total_cents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {/* Prior-export traceback — only renders when the period
              window pulls in already-exported rows. Lets the
              bookkeeper spot mis-tags ("why is a 2024-Q1 receipt
              showing in this 2025 export?") without leaving the
              page. */}
          {data.receipts.exported_periods.length > 0 ? (
            <section style={styles.section}>
              <header style={styles.sectionHeader}>
                <h2 style={styles.h2}>Prior-period traceback</h2>
                <p style={styles.sectionSub}>
                  Receipts in this window that were already locked into
                  a prior tax period — confirms which CPA submission
                  they went on. Should be empty if the period hasn't
                  been locked yet.
                </p>
              </header>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Filed under period</th>
                    <th style={styles.thRight}>Count</th>
                    <th style={styles.thRight}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.receipts.exported_periods.map((ep) => (
                    <tr key={`period-${ep.exported_period}`}>
                      <td style={styles.td}>{ep.exported_period}</td>
                      <td style={styles.tdRight}>{ep.count}</td>
                      <td style={styles.tdRight}>
                        {dollars(ep.total_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      )}

      <p style={styles.note}>
        ▸ Activation gate: <code>seeds/232</code> must be applied to
        live Supabase before Lock works. ▸ IRS rate is env-overridable
        via <code>IRS_MILEAGE_CENTS_PER_MILE</code>.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 1100, margin: '0 auto' },
  header: { marginBottom: 16 },
  h1: { fontSize: 22, fontWeight: 600, margin: '0 0 4px' },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    margin: 0,
    maxWidth: 720,
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
  refreshBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
  },
  exportBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  lockBtn: {
    background: '#15803D',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
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
  },
  // Status-segmented stat cards — visually distinct so the bookkeeper
  // sees the anti-double-counting story at a glance.
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 16,
    background: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  statCardNew: {
    background: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  statCardFiled: {
    background: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  statBadgeNew: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: 700,
    color: '#15803D',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    background: '#DCFCE7',
    padding: '2px 8px',
    borderRadius: 999,
  },
  statBadgeFiled: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: 700,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    background: '#E5E7EB',
    padding: '2px 8px',
    borderRadius: 999,
  },
  statBadgeTotal: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: 700,
    color: '#1D3095',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    background: '#E0E7FF',
    padding: '2px 8px',
    borderRadius: 999,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.1,
  },
  statSub: {
    fontSize: 13,
    color: '#6B7280',
  },
  statFooter: {
    marginTop: 4,
    paddingTop: 8,
    borderTop: '1px dashed #E5E7EB',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    fontSize: 12,
    color: '#374151',
  },
  // Section blocks — Schedule C table and (later) mileage / vendors.
  section: {
    marginBottom: 24,
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: '12px 16px',
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  h2: {
    fontSize: 14,
    fontWeight: 600,
    margin: '0 0 4px',
  },
  sectionSub: {
    fontSize: 12,
    color: '#6B7280',
    margin: 0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '8px 16px',
    color: '#6B7280',
    fontWeight: 500,
    borderBottom: '1px solid #F3F4F6',
  },
  thRight: {
    textAlign: 'right',
    padding: '8px 16px',
    color: '#6B7280',
    fontWeight: 500,
    borderBottom: '1px solid #F3F4F6',
  },
  td: {
    padding: '8px 16px',
    borderBottom: '1px solid #F3F4F6',
  },
  tdRight: {
    padding: '8px 16px',
    borderBottom: '1px solid #F3F4F6',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  totalsRow: {
    background: '#F7F8FA',
  },
  tdEmpty: {
    padding: '12px 16px',
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  subHeader: {
    padding: '8px 16px',
    background: '#FAFBFC',
    borderTop: '1px solid #E2E5EB',
    borderBottom: '1px solid #F3F4F6',
    fontSize: 12,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 24,
    fontStyle: 'italic',
  },
};
