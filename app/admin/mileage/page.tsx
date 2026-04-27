// app/admin/mileage/page.tsx — Mileage report (per-user, per-day)
//
// Per plan §5.10.4 + F6 plan checklist: "auto-generate IRS-format
// mileage log" from the location_pings stream we land via the
// background tracker (lib/locationTracker.ts).
//
// Default range: last 7 days. Adjustable via date inputs. Filter by
// user_email or leave blank to see every employee. CSV export hits
// the same endpoint with format=csv so the bookkeeper gets a file
// they can drop into QuickBooks or a tax filing.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

interface VehicleSubtotal {
  vehicle_id: string | null;
  vehicle_name: string | null;
  is_driver: boolean | null;
  miles: number;
  meters: number;
  ping_count: number;
  segment_count: number;
}

interface MileageDayRow {
  user_email: string;
  date: string;
  miles: number;
  meters: number;
  ping_count: number;
  segment_count: number;
  dropped_jump_count: number;
  first_ping_at: string;
  last_ping_at: string;
  by_vehicle: VehicleSubtotal[];
}

interface MileageResponse {
  days: MileageDayRow[];
  total_miles: number;
  range: { from: string; to: string };
  user_email: string | null;
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6); // 7-day window inclusive
  return {
    from: isoDate(weekAgo),
    to: isoDate(today),
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MileagePage() {
  const { data: session } = useSession();

  const [{ from, to }, setRange] = useState<{ from: string; to: string }>(
    defaultRange()
  );
  const [userEmail, setUserEmail] = useState('');
  const [data, setData] = useState<MileageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const fetchMileage = useCallback(async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from, to });
      if (userEmail) params.set('user_email', userEmail);
      const res = await fetch(`/api/admin/mileage?${params.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
      }
      setData(json as MileageResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [session, from, to, userEmail]);

  useEffect(() => {
    void fetchMileage();
  }, [fetchMileage]);

  // Group rows by user for the per-employee subtotal display.
  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { user_email: string; days: MileageDayRow[]; subtotal: number }
    >();
    for (const d of data.days) {
      let g = map.get(d.user_email);
      if (!g) {
        g = { user_email: d.user_email, days: [], subtotal: 0 };
        map.set(d.user_email, g);
      }
      g.days.push(d);
      g.subtotal = Math.round((g.subtotal + d.miles) * 100) / 100;
    }
    return [...map.values()];
  }, [data]);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    setError('');
    try {
      const params = new URLSearchParams({ from, to, format: 'csv' });
      if (userEmail) params.set('user_email', userEmail);
      const res = await fetch(`/api/admin/mileage?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      // Trigger a browser download — same pattern the existing receipts
      // CSV export uses on /admin/receipts.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        userEmail
          ? `mileage_${userEmail}_${from}_to_${to}.csv`
          : `mileage_${from}_to_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [from, to, userEmail]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Mileage</h1>
          <p style={styles.subtitle}>
            Per-user, per-day total miles aggregated from the
            background-tracking ping stream. Pings only happen while
            clocked in, so totals are business miles by construction.
            Use the CSV export for IRS-grade tax docs and QuickBooks
            import.
          </p>
        </div>
      </header>

      <div style={styles.controls}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            style={styles.input}
            max={to}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            style={styles.input}
            min={from}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Employee</span>
          <input
            type="email"
            placeholder="all employees"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            style={styles.input}
          />
        </label>
        <button
          type="button"
          style={styles.refreshBtn}
          onClick={() => void fetchMileage()}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          style={styles.exportBtn}
          onClick={() => void exportCsv()}
          disabled={exporting || loading || !data || data.days.length === 0}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {data ? (
        <div style={styles.summaryRow}>
          <span style={styles.summaryLabel}>Total miles</span>
          <span style={styles.summaryValue}>
            {data.total_miles.toFixed(2)}
          </span>
          <span style={styles.summarySub}>
            across {grouped.length} employee
            {grouped.length === 1 ? '' : 's'} ·{' '}
            {data.days.length} day{data.days.length === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}

      {loading && !data ? (
        <div style={styles.empty}>Loading…</div>
      ) : !data || data.days.length === 0 ? (
        <div style={styles.empty}>
          No mileage in this range. The background tracker writes pings
          only while users are clocked in.
        </div>
      ) : (
        grouped.map((g) => (
          <section key={g.user_email} style={styles.userBlock}>
            <header style={styles.userHeader}>
              <h2 style={styles.userEmail}>{g.user_email}</h2>
              <span style={styles.userSubtotal}>
                {g.subtotal.toFixed(2)} mi
              </span>
            </header>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.thRight}>Miles</th>
                  <th style={styles.thRight}>Pings</th>
                  <th style={styles.th}>First fix</th>
                  <th style={styles.th}>Last fix</th>
                  <th style={styles.thRight}>Glitched jumps</th>
                </tr>
              </thead>
              <tbody>
                {g.days.flatMap((d) => {
                  const dayRow = (
                    <tr key={`${d.user_email}-${d.date}`}>
                      <td style={styles.td}>{d.date}</td>
                      <td style={styles.tdRight}>
                        <strong>{d.miles.toFixed(2)}</strong>
                      </td>
                      <td style={styles.tdRight}>{d.ping_count}</td>
                      <td style={styles.td}>
                        {formatTime(d.first_ping_at)}
                      </td>
                      <td style={styles.td}>
                        {formatTime(d.last_ping_at)}
                      </td>
                      <td
                        style={{
                          ...styles.tdRight,
                          color:
                            d.dropped_jump_count > 0
                              ? '#D97706'
                              : '#9CA3AF',
                        }}
                        title={
                          d.dropped_jump_count > 0
                            ? 'Implausible single-ping jumps (>200 km between fixes) excluded from the total'
                            : undefined
                        }
                      >
                        {d.dropped_jump_count}
                      </td>
                    </tr>
                  );
                  // Sub-rows: one per vehicle. Skip when there's
                  // only one entry AND it has no vehicle (the
                  // breakdown adds nothing in that case).
                  const vehicleRows =
                    d.by_vehicle.length === 0 ||
                    (d.by_vehicle.length === 1 &&
                      d.by_vehicle[0].vehicle_id === null)
                      ? []
                      : d.by_vehicle.map((v, i) => (
                          <tr
                            key={`${d.user_email}-${d.date}-v${i}`}
                            style={{ background: '#FAFBFC' }}
                          >
                            <td
                              style={{
                                ...styles.td,
                                paddingLeft: 36,
                                color: '#6B7280',
                                fontSize: 12,
                              }}
                            >
                              ↳{' '}
                              {v.vehicle_name ?? 'No vehicle'}
                              {v.is_driver === true ? (
                                <span
                                  style={{
                                    marginLeft: 6,
                                    background: '#EEF2FF',
                                    color: '#1D3095',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.4,
                                  }}
                                  title="IRS-deductible driver miles"
                                >
                                  driver
                                </span>
                              ) : v.is_driver === false ? (
                                <span
                                  style={{
                                    marginLeft: 6,
                                    background: '#F3F4F6',
                                    color: '#6B7280',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.4,
                                  }}
                                  title="Passenger — no IRS attribution"
                                >
                                  passenger
                                </span>
                              ) : null}
                            </td>
                            <td
                              style={{
                                ...styles.tdRight,
                                fontSize: 12,
                                color: '#4B5563',
                              }}
                            >
                              {v.miles.toFixed(2)}
                            </td>
                            <td
                              style={{
                                ...styles.tdRight,
                                fontSize: 12,
                                color: '#9CA3AF',
                              }}
                            >
                              {v.ping_count}
                            </td>
                            <td style={styles.td} />
                            <td style={styles.td} />
                            <td style={styles.tdRight} />
                          </tr>
                        ));
                  return [dayRow, ...vehicleRows];
                })}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '24px',
    maxWidth: 1100,
    margin: '0 auto',
  },
  header: {
    marginBottom: 16,
  },
  h1: {
    fontSize: 22,
    fontWeight: 600,
    margin: '0 0 4px',
  },
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
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
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
  error: {
    background: '#FEF2F2',
    border: '1px solid #B42318',
    color: '#B42318',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
  },
  summaryRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    padding: '12px 16px',
    background: '#F7F8FA',
    borderRadius: 8,
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 600,
  },
  summarySub: {
    fontSize: 13,
    color: '#6B7280',
  },
  userBlock: {
    marginBottom: 24,
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  userHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '12px 16px',
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  userEmail: {
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
  },
  userSubtotal: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1D3095',
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
  },
};
