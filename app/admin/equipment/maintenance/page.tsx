// app/admin/equipment/maintenance/page.tsx — §5.12.7.4 (F10.7-f)
//
// Maintenance calendar page. Consumes the F10.7-e aggregator
// at GET /api/admin/maintenance/calendar. Three regions:
//
//   * Month grid (7 columns; rows = weeks of the chosen month)
//     — each day cell shows the date + up to 3 event chips +
//     overflow indicator. Click a chip → F10.7-g detail page.
//   * Upcoming sidebar — next-30-days events sorted ASC.
//   * Next-due table — schedule-driven rollup beneath the
//     calendar; rows in the lead window highlight amber, past
//     due highlight red.
//
// Auth: useSession sign-in gate; the aggregator enforces
// EQUIPMENT_ROLES server-side.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';

interface CalEvent {
  id: string;
  equipment_inventory_id: string | null;
  vehicle_id: string | null;
  kind: string;
  origin: string;
  state: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  expected_back_at: string | null;
  vendor_name: string | null;
  summary: string;
  equipment_name: string | null;
}

interface DayBucket {
  date: string;
  events: CalEvent[];
}

interface NextDueRow {
  schedule_id: string;
  equipment_id: string;
  equipment_name: string | null;
  kind: string;
  frequency_months: number;
  lead_time_days: number;
  last_completed_at: string | null;
  next_due_at: string;
  days_until_due: number;
  in_lead_window: boolean;
}

interface CalendarResponse {
  month: { from: string; to: string };
  days: DayBucket[];
  upcoming: CalEvent[];
  next_due_per_equipment: NextDueRow[];
  summary: {
    month_event_count: number;
    open_count: number;
    by_state: Record<string, number>;
    upcoming_count: number;
    schedules_count: number;
    pairs_count: number;
    due_in_lead_window: number;
  };
  filters: {
    month: string;
    equipment_id: string | null;
    kind: string | null;
  };
}

const ALLOWED_KINDS = [
  'calibration',
  'repair',
  'firmware_update',
  'inspection',
  'cleaning',
  'scheduled_service',
  'damage_triage',
  'recall',
  'software_license',
];

function todayMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function leadingPadCount(firstDayIso: string): number {
  const d = new Date(`${firstDayIso}T00:00:00.000Z`);
  return d.getUTCDay(); // 0 = Sun, 6 = Sat
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00.000Z`).toLocaleDateString([], {
    day: 'numeric',
  });
}

export default function MaintenanceCalendarPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('MaintenanceCalendarPage');

  const [month, setMonth] = useState<string>(todayMonth());
  const [equipmentFilter, setEquipmentFilter] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (equipmentFilter.trim()) params.set('equipment_id', equipmentFilter.trim());
    if (kindFilter) params.set('kind', kindFilter);
    const res = await safeFetch<CalendarResponse>(
      `/api/admin/maintenance/calendar?${params.toString()}`
    );
    setLoading(false);
    if (res) setData(res);
  }, [month, equipmentFilter, kindFilter, safeFetch]);

  useEffect(() => {
    void fetchCalendar();
  }, [fetchCalendar]);

  const monthLabel = useMemo(() => {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) return month;
    const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1));
    return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }, [month]);

  const padCount = useMemo(() => {
    if (!data || data.days.length === 0) return 0;
    return leadingPadCount(data.days[0].date);
  }, [data]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Maintenance · {monthLabel}</h1>
          <p style={styles.subtitle}>
            §5.12.7.4 — month grid of scheduled / open work + the
            schedule-driven next-due lookahead. Click any chip for
            the full event drilldown.
          </p>
        </div>
        <div style={styles.headerControls}>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            style={styles.navBtn}
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => setMonth(todayMonth())}
            style={styles.navBtn}
          >
            This month
          </button>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            style={styles.navBtn}
          >
            Next →
          </button>
          <button
            type="button"
            onClick={() => void fetchCalendar()}
            disabled={loading}
            style={styles.refreshBtn}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Equipment</span>
          <input
            type="text"
            placeholder="UUID (optional)"
            value={equipmentFilter}
            onChange={(e) => setEquipmentFilter(e.target.value)}
            style={styles.textInput}
          />
        </div>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Kind</span>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            style={styles.select}
          >
            <option value="">all</option>
            {ALLOWED_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data ? (
        <>
          <div style={styles.summaryBar}>
            <span style={styles.summaryStrong}>
              {data.summary.month_event_count}
            </span>
            <span style={styles.muted}>this month ·</span>
            <span style={styles.summaryStrong}>
              {data.summary.open_count}
            </span>
            <span style={styles.muted}>open ·</span>
            <span style={styles.summaryStrong}>
              {data.summary.upcoming_count}
            </span>
            <span style={styles.muted}>upcoming (30d) ·</span>
            <span
              style={
                data.summary.due_in_lead_window > 0
                  ? styles.summaryAmber
                  : styles.summaryStrong
              }
            >
              {data.summary.due_in_lead_window}
            </span>
            <span style={styles.muted}>schedules in lead window</span>
          </div>

          <div style={styles.layout}>
            <section style={styles.calendarRegion}>
              <div style={styles.dowRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} style={styles.dowCell}>
                    {d}
                  </div>
                ))}
              </div>
              <div style={styles.monthGrid}>
                {Array.from({ length: padCount }).map((_, i) => (
                  <div key={`pad-${i}`} style={styles.padCell} />
                ))}
                {data.days.map((bucket) => (
                  <div key={bucket.date} style={styles.dayCell}>
                    <div style={styles.dayCellHeader}>
                      <span style={styles.dayNumber}>
                        {dayLabel(bucket.date)}
                      </span>
                      {bucket.events.length > 0 ? (
                        <span style={styles.dayCount}>
                          {bucket.events.length}
                        </span>
                      ) : null}
                    </div>
                    <div style={styles.eventList}>
                      {bucket.events.slice(0, 3).map((e) => (
                        <Link
                          key={e.id}
                          href={`/admin/equipment/maintenance/${e.id}`}
                          style={chipStyle(e.state)}
                          title={`${e.kind} · ${e.summary}`}
                        >
                          <span style={styles.chipLabel}>
                            {e.equipment_name ?? e.kind}
                          </span>
                        </Link>
                      ))}
                      {bucket.events.length > 3 ? (
                        <span style={styles.overflowChip}>
                          +{bucket.events.length - 3} more
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside style={styles.sidebar}>
              <h2 style={styles.h2}>Upcoming (30d)</h2>
              {data.upcoming.length === 0 ? (
                <div style={styles.sidebarEmpty}>
                  No open work in the next 30 days.
                </div>
              ) : (
                <ul style={styles.upcomingList}>
                  {data.upcoming.map((e) => (
                    <li key={e.id} style={styles.upcomingItem}>
                      <Link
                        href={`/admin/equipment/maintenance/${e.id}`}
                        style={styles.upcomingLink}
                      >
                        <div style={styles.upcomingTitle}>
                          {e.equipment_name ?? e.kind}
                        </div>
                        <div style={styles.upcomingMeta}>
                          {e.scheduled_for
                            ? new Date(e.scheduled_for).toLocaleDateString()
                            : '—'}
                          {' · '}
                          <span style={chipStyle(e.state)}>{e.state}</span>
                        </div>
                        <div style={styles.upcomingSummary}>{e.summary}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>

          <section style={styles.nextDueSection}>
            <h2 style={styles.h2}>
              Next due per equipment{' '}
              <span style={styles.h2Hint}>
                (from {data.summary.schedules_count} schedules across{' '}
                {data.summary.pairs_count} pairs)
              </span>
            </h2>
            {data.next_due_per_equipment.length === 0 ? (
              <div style={styles.empty}>
                No active schedules. Add one in the §5.12.8
                schedule editor.
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Equipment</th>
                    <th style={styles.th}>Kind</th>
                    <th style={styles.thRight}>Frequency</th>
                    <th style={styles.thRight}>Last completed</th>
                    <th style={styles.thRight}>Next due</th>
                    <th style={styles.thRight}>Days until</th>
                  </tr>
                </thead>
                <tbody>
                  {data.next_due_per_equipment.map((r) => (
                    <tr
                      key={`${r.schedule_id}:${r.equipment_id}`}
                      style={dueRowStyle(r.days_until_due, r.in_lead_window)}
                    >
                      <td style={styles.td}>
                        <Link
                          href={`/admin/equipment/${r.equipment_id}`}
                          style={styles.link}
                        >
                          {r.equipment_name ??
                            r.equipment_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td style={styles.td}>{r.kind}</td>
                      <td style={styles.tdRight}>
                        {r.frequency_months}mo
                      </td>
                      <td style={styles.tdRight}>
                        {r.last_completed_at
                          ? new Date(r.last_completed_at).toLocaleDateString()
                          : <span style={styles.muted}>never</span>}
                      </td>
                      <td style={styles.tdRight}>
                        {new Date(r.next_due_at).toLocaleDateString()}
                      </td>
                      <td style={styles.tdRight}>
                        {r.days_until_due}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
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

function chipStyle(state: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    scheduled: { background: '#DBEAFE', color: '#1E3A8A' },
    in_progress: { background: '#1D3095', color: '#FFFFFF' },
    awaiting_parts: { background: '#FEF3C7', color: '#78350F' },
    awaiting_vendor: { background: '#FEF3C7', color: '#78350F' },
    complete: { background: '#DCFCE7', color: '#166534' },
    failed_qa: { background: '#FEE2E2', color: '#7F1D1D' },
    cancelled: {
      background: '#FFFFFF',
      color: '#9CA3AF',
      border: '1px dashed #D1D5DB',
    },
  };
  return {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    textDecoration: 'none',
    maxWidth: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    ...(map[state] ?? { background: '#F3F4F6', color: '#374151' }),
  };
}

function dueRowStyle(daysUntilDue: number, inLeadWindow: boolean): React.CSSProperties {
  if (daysUntilDue < 0) {
    return { background: '#FEE2E2' };
  }
  if (inLeadWindow) {
    return { background: '#FFFBEB' };
  }
  return {};
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
  h2: {
    fontSize: 14,
    fontWeight: 600,
    margin: '0 0 8px',
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
  },
  h2Hint: { fontSize: 11, color: '#9CA3AF', fontWeight: 400 },
  subtitle: { fontSize: 13, color: '#6B7280', margin: 0, maxWidth: 720 },
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
  textInput: {
    padding: '4px 8px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    width: 280,
  },
  select: {
    padding: '4px 8px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    background: '#FFFFFF',
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
  summaryAmber: { color: '#B45309', fontWeight: 600 },
  muted: { color: '#9CA3AF' },
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 280px',
    gap: 16,
    marginBottom: 16,
  },
  calendarRegion: {
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 12,
  },
  dowRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4,
    marginBottom: 4,
  },
  dowCell: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    padding: '4px 0',
    textAlign: 'center' as const,
  },
  monthGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4,
  },
  padCell: {
    background: '#FAFBFC',
    borderRadius: 6,
    minHeight: 110,
  },
  dayCell: {
    background: '#FFFFFF',
    border: '1px solid #F1F2F4',
    borderRadius: 6,
    padding: 6,
    minHeight: 110,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  dayCellHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
  },
  dayNumber: { color: '#374151', fontWeight: 500 },
  dayCount: {
    background: '#F3F4F6',
    color: '#6B7280',
    padding: '0 6px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 600,
  },
  eventList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    overflow: 'hidden',
  },
  chipLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  overflowChip: {
    fontSize: 10,
    color: '#6B7280',
    padding: '2px 6px',
  },
  sidebar: {
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 12,
  },
  sidebarEmpty: {
    padding: 12,
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic' as const,
  },
  upcomingList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  upcomingItem: {
    borderBottom: '1px solid #F1F2F4',
    paddingBottom: 8,
  },
  upcomingLink: {
    display: 'block',
    color: 'inherit',
    textDecoration: 'none',
  },
  upcomingTitle: {
    fontWeight: 600,
    fontSize: 13,
    color: '#111827',
  },
  upcomingMeta: {
    fontSize: 11,
    color: '#6B7280',
    margin: '2px 0',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  upcomingSummary: {
    fontSize: 11,
    color: '#374151',
  },
  nextDueSection: {
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 16,
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
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
    padding: '8px 12px',
    background: '#F9FAFB',
    borderBottom: '1px solid #E2E5EB',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  td: { padding: '8px 12px', borderBottom: '1px solid #F1F2F4' },
  tdRight: {
    padding: '8px 12px',
    borderBottom: '1px solid #F1F2F4',
    textAlign: 'right' as const,
  },
  link: { color: '#1D3095', textDecoration: 'none', fontWeight: 500 },
  empty: {
    padding: 32,
    textAlign: 'center' as const,
    color: '#6B7280',
    fontSize: 13,
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
  },
};
