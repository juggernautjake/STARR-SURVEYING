// app/admin/personnel/crew-calendar/page.tsx — §5.12.7.6 (F10.6-e-ii)
//
// Week-grid heatmap of crew capacity. Rows = internal users,
// columns = days. Cells colored by the F10.6-e-i aggregator's
// state cascade. Drilldown drawer + drag-create land in
// F10.6-e-iii / -iv as separate batches.
//
// Auth: EQUIPMENT_ROLES via aggregator.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';

type CellState =
  | 'open'
  | 'proposed'
  | 'confirmed'
  | 'split_shift'
  | 'unavailable'
  | 'unconfirmed_overdue';

interface CalendarCell {
  state: CellState;
  assignment_count: number;
  unavailability_count: number;
  primary_assignment_id: string | null;
  primary_unavailability_id: string | null;
}

interface CalendarUser {
  user_email: string;
  user_name: string | null;
  cells: Record<string, CalendarCell>;
}

interface CalendarResponse {
  window: { from: string; to: string };
  days: string[];
  users: CalendarUser[];
  summary: {
    user_count: number;
    day_count: number;
    by_state: Record<CellState, number>;
  };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonday(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  const dow = out.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  out.setUTCDate(out.getUTCDate() + offset);
  return out;
}

function plusDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CrewCalendarPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('CrewCalendarPage');

  const [from, setFrom] = useState<string>(() => isoDay(startOfMonday(new Date())));
  const [to, setTo] = useState<string>(() =>
    isoDay(plusDays(startOfMonday(new Date()), 6))
  );
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    const res = await safeFetch<CalendarResponse>(
      `/api/admin/personnel/crew-calendar?from=${from}&to=${to}`
    );
    setLoading(false);
    if (res) setData(res);
  }, [from, to, safeFetch]);

  useEffect(() => {
    void fetchCalendar();
  }, [fetchCalendar]);

  const shiftWeek = useCallback((deltaDays: number) => {
    const newFrom = isoDay(plusDays(new Date(`${from}T00:00:00.000Z`), deltaDays));
    const newTo = isoDay(plusDays(new Date(`${to}T00:00:00.000Z`), deltaDays));
    setFrom(newFrom);
    setTo(newTo);
  }, [from, to]);

  const resetThisWeek = useCallback(() => {
    const monday = startOfMonday(new Date());
    setFrom(isoDay(monday));
    setTo(isoDay(plusDays(monday, 6)));
  }, []);

  const dayHeaders = useMemo(() => {
    if (!data) return [];
    return data.days.map((iso, i) => ({
      iso,
      label: DAY_NAMES[i % 7],
      date: new Date(`${iso}T12:00:00.000Z`).toLocaleDateString([], {
        month: 'numeric',
        day: 'numeric',
      }),
    }));
  }, [data]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Crew calendar</h1>
          <p style={styles.subtitle}>
            §5.12.7.6 — capacity-at-a-glance week heatmap. Cells
            shade by state per the §5.12.4 cascade.
          </p>
        </div>
        <div style={styles.headerControls}>
          <button
            type="button"
            onClick={() => shiftWeek(-7)}
            style={styles.navBtn}
          >
            ← Prev week
          </button>
          <button
            type="button"
            onClick={resetThisWeek}
            style={styles.navBtn}
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => shiftWeek(7)}
            style={styles.navBtn}
          >
            Next week →
          </button>
          <button
            type="button"
            onClick={() => void fetchCalendar()}
            style={styles.refreshBtn}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {data ? (
        <>
          <div style={styles.summaryBar}>
            <span style={styles.summaryStrong}>
              {data.summary.user_count}
            </span>
            <span style={styles.muted}>users · {data.summary.day_count} days</span>
            <span style={styles.divider}>·</span>
            <StateLegend by_state={data.summary.by_state} />
          </div>

          {data.users.length === 0 ? (
            <div style={styles.empty}>
              No internal users in scope. Confirm
              <code style={styles.code}>registered_users</code> has
              non-guest roles set.
            </div>
          ) : (
            <div style={styles.gridWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.thUser}>User</th>
                    {dayHeaders.map((h) => (
                      <th key={h.iso} style={styles.thDay}>
                        <div style={styles.dayHeader}>
                          <span>{h.label}</span>
                          <span style={styles.dayDate}>{h.date}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.user_email}>
                      <td style={styles.tdUser} title={u.user_email}>
                        <strong>{u.user_name ?? u.user_email}</strong>
                        <div style={styles.userEmail}>{u.user_email}</div>
                      </td>
                      {dayHeaders.map((h) => {
                        const cell = u.cells[h.iso];
                        return (
                          <td
                            key={h.iso}
                            style={cellStyleFor(cell.state)}
                            title={`${u.user_email} · ${h.iso} · ${cell.state}`}
                          >
                            <CellLabel cell={cell} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p style={styles.note}>
            ▸ Click a cell to drill into the assignment / PTO row
            (F10.6-e-iii). Drag-create new unavailability/assignment
            lands as F10.6-e-iv.
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

function StateLegend({
  by_state,
}: {
  by_state: Record<CellState, number>;
}) {
  const entries: Array<[CellState, string]> = [
    ['confirmed', 'Confirmed'],
    ['proposed', 'Proposed'],
    ['split_shift', 'Split shift'],
    ['unconfirmed_overdue', 'Overdue'],
    ['unavailable', 'PTO/sick'],
    ['open', 'Open'],
  ];
  return (
    <div style={styles.legend}>
      {entries.map(([state, label]) => (
        <span key={state} style={styles.legendItem}>
          <span style={legendSwatchStyle(state)} />
          {label}
          <span style={styles.legendCount}>· {by_state[state] ?? 0}</span>
        </span>
      ))}
    </div>
  );
}

function CellLabel({ cell }: { cell: CalendarCell }) {
  if (cell.state === 'unavailable') return <span style={styles.cellTag}>PTO</span>;
  if (cell.state === 'split_shift') {
    return <span style={styles.cellTag}>{cell.assignment_count}×</span>;
  }
  if (cell.state === 'unconfirmed_overdue') return <span style={styles.cellTag}>!</span>;
  if (cell.state === 'confirmed') return <span style={styles.cellTag}>✓</span>;
  if (cell.state === 'proposed') return <span style={styles.cellTag}>~</span>;
  return null;
}

function cellStyleFor(state: CellState): React.CSSProperties {
  return {
    ...styles.cell,
    ...CELL_STATE_STYLES[state],
  };
}

function legendSwatchStyle(state: CellState): React.CSSProperties {
  return {
    display: 'inline-block',
    width: 12,
    height: 12,
    borderRadius: 3,
    marginRight: 4,
    verticalAlign: 'middle',
    ...CELL_STATE_STYLES[state],
  };
}

const CELL_STATE_STYLES: Record<CellState, React.CSSProperties> = {
  open: { background: '#FFFFFF' },
  proposed: { background: '#DCFCE7', color: '#166534' },
  confirmed: { background: '#15803D', color: '#FFFFFF' },
  split_shift: { background: '#FEF3C7', color: '#78350F' },
  unavailable: { background: '#E5E7EB', color: '#374151' },
  unconfirmed_overdue: { background: '#FEE2E2', color: '#7F1D1D' },
};

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
  subtitle: { fontSize: 13, color: '#6B7280', margin: 0 },
  headerControls: { display: 'flex', gap: 8, alignItems: 'center' },
  navBtn: {
    padding: '6px 12px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    background: '#FFFFFF',
    fontSize: 13,
    cursor: 'pointer',
  },
  refreshBtn: {
    padding: '6px 12px',
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
    gap: 8,
    padding: '12px 16px',
    background: '#F9FAFB',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  summaryStrong: { color: '#111827', fontWeight: 600 },
  muted: { color: '#6B7280' },
  divider: { color: '#D1D5DB', margin: '0 4px' },
  legend: { display: 'flex', gap: 12, flexWrap: 'wrap' as const, fontSize: 12 },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 4 },
  legendCount: { color: '#9CA3AF', marginLeft: 2 },
  gridWrap: {
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  },
  thUser: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    position: 'sticky' as const,
    left: 0,
    minWidth: 200,
  },
  thDay: {
    textAlign: 'center' as const,
    padding: '8px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    minWidth: 80,
  },
  dayHeader: { display: 'flex', flexDirection: 'column', gap: 2 },
  dayDate: { color: '#9CA3AF', fontWeight: 400, fontSize: 10 },
  tdUser: {
    padding: '8px 12px',
    borderBottom: '1px solid #F1F2F4',
    background: '#FFFFFF',
    position: 'sticky' as const,
    left: 0,
    fontSize: 13,
    minWidth: 200,
  },
  userEmail: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  cell: {
    textAlign: 'center' as const,
    borderBottom: '1px solid #F1F2F4',
    borderLeft: '1px solid #F1F2F4',
    height: 40,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  cellTag: { padding: '2px 6px' },
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
    fontSize: 12,
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
    margin: '0 4px',
  },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 16,
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
};
