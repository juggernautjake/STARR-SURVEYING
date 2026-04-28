// app/admin/finances/page.tsx — Tax-time finances landing page (Batch QQ part-2)
//
// Step 1 of 4 — scaffold only. Auth-gates, year picker, fetches the
// /api/admin/finances/tax-summary endpoint (Batch QQ part-1, shipped),
// renders raw count + total. Subsequent steps add:
//   step 2: status-segmented stat cards + Schedule C breakdown table
//   step 3: mileage section + by-tax-flag + top vendors + grand totals
//   step 4: Lock period + Export CSV buttons + final polish
//
// Style mirrors /admin/mileage/page.tsx (inline-styled, no AdminCommon
// stylesheet) so the entire batch lands without touching shared CSS.
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

interface TaxSummaryResponse {
  period: { year: number | null; from: string; to: string };
  irs_rate_cents_per_mile: number;
  status_filter: 'approved' | 'exported' | 'all';
  receipts: {
    total_cents: number;
    count: number;
    by_status: { approved: ByStatusBucket; exported: ByStatusBucket };
    by_category: ByCategoryRow[];
  };
  mileage: {
    total_miles: number;
    deduction_cents: number;
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

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Finances — tax-time summary</h1>
        <p style={styles.subtitle}>
          Schedule-C-shaped report joining approved + exported receipts
          with business mileage. Use the year picker below to switch
          tax periods. Export CSV + Lock-as-exported buttons land in
          the next sub-batch.
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
        <button
          type="button"
          style={styles.refreshBtn}
          onClick={() => void fetchSummary()}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

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
        </>
      )}

      <p style={styles.note}>
        ▸ Activation gate: <code>seeds/232</code> must be applied to
        live Supabase before this page renders real data. Without it
        the endpoint short-circuits.
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
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 24,
    fontStyle: 'italic',
  },
};
