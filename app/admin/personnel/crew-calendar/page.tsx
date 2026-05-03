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
import Link from 'next/link';
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

interface AssignmentDetail {
  id: string;
  job_id: string;
  user_email: string;
  user_name: string | null;
  slot_role: string | null;
  role: string | null;
  assigned_from: string;
  assigned_to: string;
  state: string;
  is_crew_lead: boolean;
  is_override: boolean;
  override_reason: string | null;
  decline_reason: string | null;
  confirmed_at: string | null;
  declined_at: string | null;
  created_at: string;
  notes: string | null;
}

interface UnavailabilityDetail {
  id: string;
  user_email: string;
  unavailable_from: string;
  unavailable_to: string;
  kind: string;
  reason: string | null;
  is_paid: boolean;
  approved_by: string | null;
  approved_at: string | null;
}

interface CellDetail {
  user: { email: string; name: string | null };
  day: string;
  assignments: AssignmentDetail[];
  unavailability: UnavailabilityDetail[];
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

  // F10.6-e-iii — drilldown drawer state. Stores the cell the
  // EM clicked + the fetched detail payload from
  // /crew-calendar/cell.
  const [drilldown, setDrilldown] = useState<{
    user: CalendarUser;
    day: string;
    cell: CalendarCell;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<CellDetail | null>(null);

  // F10.6-e-iv-β — drag-create selection state. Active during a
  // mouse-down → mouse-up gesture across cells in the same row.
  // dragAnchor stays where mouse-down landed; dragEnd updates on
  // mouse-enter into other cells of the same user. mouse-up
  // commits to the unavailability modal when the gesture spans
  // multiple cells (single-cell mouse-up falls through to the
  // existing onClick → openCell path).
  const [dragAnchor, setDragAnchor] = useState<{
    userEmail: string;
    dayIso: string;
  } | null>(null);
  const [dragEnd, setDragEnd] = useState<{
    userEmail: string;
    dayIso: string;
  } | null>(null);
  const [createModal, setCreateModal] = useState<{
    userEmail: string;
    fromIso: string;
    toIso: string;
  } | null>(null);

  const openCell = useCallback(
    async (user: CalendarUser, day: string, cell: CalendarCell) => {
      // Skip drilldown for fully-empty 'open' cells — there's
      // nothing to show. Drag-create lands as F10.6-e-iv.
      if (
        cell.state === 'open' &&
        cell.assignment_count === 0 &&
        cell.unavailability_count === 0
      ) {
        return;
      }
      setDrilldown({ user, day, cell });
      setDetail(null);
      setDetailLoading(true);
      const res = await safeFetch<CellDetail>(
        `/api/admin/personnel/crew-calendar/cell?user_email=${encodeURIComponent(
          user.user_email
        )}&day=${day}`
      );
      setDetailLoading(false);
      if (res) setDetail(res);
    },
    [safeFetch]
  );

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

  // F10.6-e-iv-β — global mouse-up listener so a drag that ends
  // outside the grid (mouse released over the header / page
  // chrome) still clears + commits the selection. Effects on the
  // cells themselves only see the mouse-up when it lands on a
  // cell.
  useEffect(() => {
    if (!dragAnchor) return;
    function handleUp() {
      if (
        dragAnchor &&
        dragEnd &&
        dragAnchor.userEmail === dragEnd.userEmail &&
        dragAnchor.dayIso !== dragEnd.dayIso
      ) {
        const fromIso =
          dragAnchor.dayIso < dragEnd.dayIso
            ? dragAnchor.dayIso
            : dragEnd.dayIso;
        const toIso =
          dragAnchor.dayIso < dragEnd.dayIso
            ? dragEnd.dayIso
            : dragAnchor.dayIso;
        setCreateModal({
          userEmail: dragAnchor.userEmail,
          fromIso,
          toIso,
        });
      }
      setDragAnchor(null);
      setDragEnd(null);
    }
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, [dragAnchor, dragEnd]);

  // Helper for the cell render: is this (user, day) inside the
  // active drag selection? Cells outside the active row never
  // light up — we deliberately gate the row swap so the EM can't
  // accidentally PTO-ify two people with one drag.
  const isInDragSelection = useCallback(
    (userEmail: string, dayIso: string): boolean => {
      if (!dragAnchor || !dragEnd) return false;
      if (dragAnchor.userEmail !== userEmail) return false;
      const lo =
        dragAnchor.dayIso < dragEnd.dayIso
          ? dragAnchor.dayIso
          : dragEnd.dayIso;
      const hi =
        dragAnchor.dayIso < dragEnd.dayIso
          ? dragEnd.dayIso
          : dragAnchor.dayIso;
      return dayIso >= lo && dayIso <= hi;
    },
    [dragAnchor, dragEnd]
  );

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
                        const inDrag = isInDragSelection(
                          u.user_email,
                          h.iso
                        );
                        return (
                          <td
                            key={h.iso}
                            style={cellStyleFor(cell.state, inDrag)}
                            title={`${u.user_email} · ${h.iso} · ${cell.state}`}
                            onClick={() => {
                              // Suppress click after a multi-cell
                              // drag — the global mouseup handler
                              // will have opened the create modal.
                              if (createModal) return;
                              void openCell(u, h.iso, cell);
                            }}
                            onMouseDown={(e) => {
                              // Left button only.
                              if (e.button !== 0) return;
                              setDragAnchor({
                                userEmail: u.user_email,
                                dayIso: h.iso,
                              });
                              setDragEnd({
                                userEmail: u.user_email,
                                dayIso: h.iso,
                              });
                            }}
                            onMouseEnter={() => {
                              if (
                                dragAnchor &&
                                dragAnchor.userEmail === u.user_email
                              ) {
                                setDragEnd({
                                  userEmail: u.user_email,
                                  dayIso: h.iso,
                                });
                              }
                            }}
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
            ▸ Click a cell to drill into the assignment / PTO rows.
            Drag across multiple cells in the same row to create a
            new unavailability window.
          </p>
        </>
      ) : loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : (
        <div style={styles.empty}>
          Failed to load. Check the error log; refresh.
        </div>
      )}

      {drilldown ? (
        <CellDrawer
          drilldown={drilldown}
          detail={detail}
          loading={detailLoading}
          onClose={() => {
            setDrilldown(null);
            setDetail(null);
          }}
        />
      ) : null}

      {createModal ? (
        <CreateUnavailabilityModal
          userEmail={createModal.userEmail}
          fromIso={createModal.fromIso}
          toIso={createModal.toIso}
          onClose={() => setCreateModal(null)}
          onCreated={() => {
            setCreateModal(null);
            void fetchCalendar();
          }}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// F10.6-e-iii — cell drilldown drawer
// ────────────────────────────────────────────────────────────

function CellDrawer({
  drilldown,
  detail,
  loading,
  onClose,
}: {
  drilldown: { user: CalendarUser; day: string; cell: CalendarCell };
  detail: CellDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const { user, day, cell } = drilldown;
  return (
    <div style={drawerStyles.backdrop} onClick={onClose}>
      <aside
        style={drawerStyles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header style={drawerStyles.header}>
          <div>
            <h2 style={drawerStyles.title}>
              {user.user_name ?? user.user_email}
            </h2>
            <p style={drawerStyles.subtitle}>
              <span style={cellStateBadgeStyle(cell.state)}>
                {cell.state}
              </span>
              <span style={drawerStyles.muted}>
                {' · '}
                {new Date(`${day}T12:00:00.000Z`).toLocaleDateString([], {
                  weekday: 'short',
                  month: 'numeric',
                  day: 'numeric',
                })}
              </span>
            </p>
          </div>
          <button
            type="button"
            style={drawerStyles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div style={drawerStyles.body}>
          {loading ? (
            <div style={drawerStyles.loading}>Loading…</div>
          ) : !detail ? (
            <div style={drawerStyles.loading}>No detail loaded.</div>
          ) : (
            <>
              {detail.unavailability.length > 0 ? (
                <section style={drawerStyles.section}>
                  <h3 style={drawerStyles.sectionTitle}>
                    Unavailability ({detail.unavailability.length})
                  </h3>
                  {detail.unavailability.map((u) => (
                    <div key={u.id} style={drawerStyles.card}>
                      <div style={drawerStyles.row}>
                        <span style={drawerStyles.rowLabel}>Kind</span>
                        <span style={drawerStyles.rowValue}>{u.kind}</span>
                      </div>
                      <div style={drawerStyles.row}>
                        <span style={drawerStyles.rowLabel}>Window</span>
                        <span style={drawerStyles.rowValue}>
                          {new Date(u.unavailable_from).toLocaleString()}
                          <br />→ {new Date(u.unavailable_to).toLocaleString()}
                        </span>
                      </div>
                      {u.reason ? (
                        <div style={drawerStyles.row}>
                          <span style={drawerStyles.rowLabel}>Reason</span>
                          <span style={drawerStyles.rowValue}>
                            {u.reason}
                          </span>
                        </div>
                      ) : null}
                      <div style={drawerStyles.row}>
                        <span style={drawerStyles.rowLabel}>Paid</span>
                        <span style={drawerStyles.rowValue}>
                          {u.is_paid ? 'yes' : 'no'}
                        </span>
                      </div>
                      {u.approved_by ? (
                        <div style={drawerStyles.row}>
                          <span style={drawerStyles.rowLabel}>Approved by</span>
                          <span style={drawerStyles.rowValue}>
                            {u.approved_by}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : null}

              {detail.assignments.length > 0 ? (
                <section style={drawerStyles.section}>
                  <h3 style={drawerStyles.sectionTitle}>
                    Assignments ({detail.assignments.length})
                  </h3>
                  {detail.assignments.map((a) => (
                    <div key={a.id} style={drawerStyles.card}>
                      <div style={drawerStyles.row}>
                        <span style={drawerStyles.rowLabel}>Job</span>
                        <span style={drawerStyles.rowValue}>
                          <Link
                            href={`/admin/jobs/${a.job_id}`}
                            style={drawerStyles.link}
                          >
                            {a.job_id}
                          </Link>
                        </span>
                      </div>
                      <div style={drawerStyles.row}>
                        <span style={drawerStyles.rowLabel}>Slot role</span>
                        <span style={drawerStyles.rowValue}>
                          {a.slot_role ?? a.role ?? '—'}
                          {a.is_crew_lead ? (
                            <span style={drawerStyles.leadBadge}>
                              CREW LEAD
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div style={drawerStyles.row}>
                        <span style={drawerStyles.rowLabel}>State</span>
                        <span style={drawerStyles.rowValue}>
                          <span style={assignmentStateBadgeStyle(a.state)}>
                            {a.state}
                          </span>
                          {a.is_override ? (
                            <span style={drawerStyles.overrideBadge}>
                              OVERRIDE
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div style={drawerStyles.row}>
                        <span style={drawerStyles.rowLabel}>Window</span>
                        <span style={drawerStyles.rowValue}>
                          {new Date(a.assigned_from).toLocaleString()}
                          <br />→ {new Date(a.assigned_to).toLocaleString()}
                        </span>
                      </div>
                      {a.confirmed_at ? (
                        <div style={drawerStyles.row}>
                          <span style={drawerStyles.rowLabel}>Confirmed</span>
                          <span style={drawerStyles.rowValue}>
                            {new Date(a.confirmed_at).toLocaleString()}
                          </span>
                        </div>
                      ) : null}
                      {a.declined_at ? (
                        <div style={drawerStyles.row}>
                          <span style={drawerStyles.rowLabel}>Declined</span>
                          <span style={drawerStyles.rowValue}>
                            {new Date(a.declined_at).toLocaleString()}
                            {a.decline_reason ? ` — ${a.decline_reason}` : ''}
                          </span>
                        </div>
                      ) : null}
                      {a.override_reason ? (
                        <div style={drawerStyles.row}>
                          <span style={drawerStyles.rowLabel}>Override</span>
                          <span style={drawerStyles.rowValue}>
                            {a.override_reason}
                          </span>
                        </div>
                      ) : null}
                      {a.notes ? (
                        <div style={drawerStyles.row}>
                          <span style={drawerStyles.rowLabel}>Notes</span>
                          <span style={drawerStyles.rowValue}>{a.notes}</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : null}

              {detail.assignments.length === 0 &&
              detail.unavailability.length === 0 ? (
                <div style={drawerStyles.loading}>
                  No rows on this day. (Aggregator says state ={' '}
                  <code>{cell.state}</code>.)
                </div>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function cellStateBadgeStyle(state: CellState): React.CSSProperties {
  return {
    ...CELL_STATE_STYLES[state],
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  };
}

function assignmentStateBadgeStyle(state: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    confirmed: { background: '#15803D', color: '#FFFFFF' },
    proposed: { background: '#DCFCE7', color: '#166534' },
    declined: { background: '#FEE2E2', color: '#7F1D1D' },
    cancelled: {
      background: '#FFFFFF',
      color: '#9CA3AF',
      border: '1px dashed #D1D5DB',
    },
  };
  return {
    ...(map[state] ?? { background: '#F3F4F6', color: '#374151' }),
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  };
}

const drawerStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.4)',
    display: 'flex',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  panel: {
    width: '100%',
    maxWidth: 480,
    height: '100%',
    background: '#FFFFFF',
    boxShadow: '-12px 0 32px rgba(0, 0, 0, 0.18)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: '16px 20px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 18, fontWeight: 600, margin: '0 0 4px' },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    margin: 0,
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  muted: { color: '#6B7280' },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    color: '#6B7280',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  loading: {
    padding: 24,
    textAlign: 'center' as const,
    color: '#6B7280',
    fontSize: 13,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    margin: 0,
  },
  card: {
    background: '#F9FAFB',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '90px 1fr',
    gap: 10,
    fontSize: 12,
    alignItems: 'baseline',
  },
  rowLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  rowValue: { color: '#111827', wordBreak: 'break-word' as const },
  link: { color: '#1D3095', textDecoration: 'none' },
  leadBadge: {
    background: '#DBEAFE',
    color: '#1E3A8A',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    marginLeft: 6,
  },
  overrideBadge: {
    background: '#FEF3C7',
    color: '#78350F',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    marginLeft: 6,
  },
};

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

function cellStyleFor(
  state: CellState,
  inDrag = false
): React.CSSProperties {
  return {
    ...styles.cell,
    ...CELL_STATE_STYLES[state],
    ...(inDrag
      ? {
          outline: '2px solid #1D3095',
          outlineOffset: -2,
          background: '#DBEAFE',
          color: '#1E3A8A',
        }
      : {}),
  };
}

// ────────────────────────────────────────────────────────────
// F10.6-e-iv-β — drag-create unavailability modal
// ────────────────────────────────────────────────────────────
//
// Triggered when the EM drags across multiple cells in the same
// row. Pre-populates user_email + the day range from the drag
// gesture; the EM picks a kind, optionally adds reason / is_paid,
// then POSTs to /api/admin/personnel/unavailability. The cron
// from F10.6-e-i refreshes the calendar on next fetch — we just
// trigger a refetch via the parent on success.
//
// Half-open semantics for the timestamps: from = midnight of the
// first selected day, to = midnight of the day AFTER the last
// selected day so a single-day PTO covers 00:00–24:00 exactly
// like the §5.12.5 reservation window pattern.

const UNAVAIL_KINDS: Array<{ value: string; label: string }> = [
  { value: 'pto', label: 'PTO (paid time off)' },
  { value: 'sick', label: 'Sick day' },
  { value: 'training', label: 'Training' },
  { value: 'doctor', label: 'Doctor appointment' },
  { value: 'other', label: 'Other' },
];

function CreateUnavailabilityModal({
  userEmail,
  fromIso,
  toIso,
  onClose,
  onCreated,
}: {
  userEmail: string;
  fromIso: string;
  toIso: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<string>('pto');
  const [reason, setReason] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PTO defaults to paid; sick/training/other default to unpaid.
  // Updates whenever the user changes the kind so the checkbox
  // reflects the conventional case.
  function handleKindChange(next: string) {
    setKind(next);
    setIsPaid(next === 'pto');
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      // Half-open window: [fromIso 00:00, dayAfter(toIso) 00:00)
      const startMs = Date.parse(`${fromIso}T00:00:00.000Z`);
      const lastDay = new Date(`${toIso}T00:00:00.000Z`);
      lastDay.setUTCDate(lastDay.getUTCDate() + 1);
      const endMs = lastDay.getTime();
      const res = await fetch('/api/admin/personnel/unavailability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: userEmail,
          unavailable_from: new Date(startMs).toISOString(),
          unavailable_to: new Date(endMs).toISOString(),
          kind,
          reason: reason.trim() || undefined,
          is_paid: isPaid,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `request failed: ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const dayCount =
    Math.round(
      (Date.parse(`${toIso}T00:00:00.000Z`) -
        Date.parse(`${fromIso}T00:00:00.000Z`)) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  return (
    <div style={createStyles.backdrop} onClick={onClose}>
      <div
        style={createStyles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header style={createStyles.header}>
          <h2 style={createStyles.title}>Mark unavailable</h2>
          <button
            type="button"
            onClick={onClose}
            style={createStyles.close}
            aria-label="Close"
            disabled={submitting}
          >
            ✕
          </button>
        </header>
        <div style={createStyles.body}>
          <p style={createStyles.copy}>
            Creating a <code style={createStyles.code}>
              personnel_unavailability
            </code>{' '}
            row for <strong>{userEmail}</strong> from{' '}
            <strong>{fromIso}</strong> to <strong>{toIso}</strong>{' '}
            ({dayCount} {dayCount === 1 ? 'day' : 'days'}). The crew
            calendar refreshes on save and the §5.12.7.1 Today banner
            picks up any rows that start today.
          </p>

          <label style={createStyles.field}>
            <span style={createStyles.label}>Kind *</span>
            <select
              value={kind}
              onChange={(e) => handleKindChange(e.target.value)}
              style={createStyles.input}
              disabled={submitting}
              autoFocus
            >
              {UNAVAIL_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>

          <label style={createStyles.field}>
            <span style={createStyles.label}>Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Short note — surfaces in the cell drilldown."
              style={{ ...createStyles.input, minHeight: 60 }}
              disabled={submitting}
            />
          </label>

          <label style={createStyles.checkboxRow}>
            <input
              type="checkbox"
              checked={isPaid}
              onChange={(e) => setIsPaid(e.target.checked)}
              disabled={submitting}
            />
            <span>
              <strong>Paid</strong>{' '}
              <span style={createStyles.hint}>
                · Drives the §5.13 payroll feed&apos;s &ldquo;count
                this day toward base hours&rdquo; flag.
              </span>
            </span>
          </label>

          {error ? <div style={createStyles.error}>⚠ {error}</div> : null}
        </div>
        <footer style={createStyles.footer}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={createStyles.cancelBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            style={createStyles.saveBtn}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}

const createStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.5)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 60,
    zIndex: 1000,
  },
  modal: {
    background: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 520,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 16, fontWeight: 600, margin: 0 },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    color: '#6B7280',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  body: {
    padding: 20,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },
  copy: { margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
    margin: '0 2px',
  },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#374151' },
  input: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 13,
  },
  hint: { fontSize: 11, color: '#6B7280', fontStyle: 'italic' as const },
  error: {
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
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
  saveBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
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
};

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
    userSelect: 'none' as const,
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
