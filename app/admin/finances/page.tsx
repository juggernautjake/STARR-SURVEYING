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

interface TaxSummaryResponse {
  period: { year: number | null; from: string; to: string };
  irs_rate_cents_per_mile: number;
  status_filter: 'approved' | 'exported' | 'all';
  receipts: {
    total_cents: number;
    count: number;
    by_status: { approved: ByStatusBucket; exported: ByStatusBucket };
  };
  mileage: {
    total_miles: number;
    deduction_cents: number;
  };
  totals: { deductible_cents: number; expense_cents: number };
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
        <section style={styles.summaryRow}>
          <div>
            <span style={styles.summaryLabel}>Receipts</span>
            <span style={styles.summaryValue}>{data.receipts.count}</span>
            <span style={styles.summarySub}>
              {dollars(data.receipts.total_cents)} gross
            </span>
          </div>
          <div>
            <span style={styles.summaryLabel}>Mileage</span>
            <span style={styles.summaryValue}>
              {data.mileage.total_miles.toFixed(1)} mi
            </span>
            <span style={styles.summarySub}>
              {dollars(data.mileage.deduction_cents)} @{' '}
              {(data.irs_rate_cents_per_mile / 100).toFixed(2)}/mi
            </span>
          </div>
          <div>
            <span style={styles.summaryLabel}>Total deductible</span>
            <span style={styles.summaryValue}>
              {dollars(data.totals.deductible_cents)}
            </span>
            <span style={styles.summarySub}>
              {data.receipts.by_status.approved.count} new ·{' '}
              {data.receipts.by_status.exported.count} already filed
            </span>
          </div>
        </section>
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
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
    padding: '16px',
    background: '#F7F8FA',
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    display: 'block',
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 2,
  },
  summarySub: { display: 'block', fontSize: 12, color: '#6B7280' },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 24,
    fontStyle: 'italic',
  },
};
