// app/admin/equipment/timeline/page.tsx — §5.12.7.2 Gantt timeline (F10.6-c-ii)
//
// Read-only Gantt render of every reservation across a 14-day
// window. Consumes the F10.6-c-i aggregator at
// GET /api/admin/equipment/reservations-timeline. Drilldown
// drawer + drag-resize land in F10.6-c-iii / iv as separate
// batches.
//
// Layout:
//   - 200px label column + flexible bar area per swimlane row.
//   - Bars positioned absolute within the bar area; left% +
//     width% computed from the time window so any window size
//     renders without per-day grid math.
//   - Date-tick header above the swimlanes (one tick per day).
//   - Group-by toggle (equipment | job) + filter inputs at the
//     top.
//
// Auth: EQUIPMENT_ROLES via aggregator.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';

interface SwimlaneBar {
  reservation_id: string;
  state: string;
  reserved_from: string;
  reserved_to: string;
  is_override: boolean;
  job_id: string;
  equipment_inventory_id: string;
  equipment_name: string | null;
  holder_email: string | null;
  returned_condition: string | null;
  notes: string | null;
}

interface Swimlane {
  key: string;
  label: string;
  meta: Record<string, unknown>;
  bars: SwimlaneBar[];
}

interface TimelineResponse {
  window: { from: string; to: string };
  group_by: 'equipment' | 'job';
  filters: {
    category: string | null;
    state: string | null;
    overdue_only: boolean;
  };
  swimlanes: Swimlane[];
  summary: { swimlane_count: number; bar_count: number };
}

const DEFAULT_DAYS = 14;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function plusDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function dayTicks(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const start = new Date(fromIso);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(toIso);
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString());
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function EquipmentTimelinePage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('EquipmentTimelinePage');

  const [from, setFrom] = useState<string>(() => startOfTodayIso());
  const [to, setTo] = useState<string>(() =>
    plusDaysIso(startOfTodayIso(), DEFAULT_DAYS)
  );
  const [groupBy, setGroupBy] = useState<'equipment' | 'job'>('equipment');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);

  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // F10.6-c-iii — drilldown drawer state. Stores the bar the
  // EM clicked + which swimlane context it came from (used by
  // the drawer's "Other reservations on this lane" cross-link).
  const [drilldown, setDrilldown] = useState<{
    bar: SwimlaneBar;
    laneLabel: string;
  } | null>(null);

  // F10.6-c-iv — drag-resize state for `held` bars. Tracks the
  // bar being resized + the bar-area DOM rect captured at
  // mousedown so the mousemove math stays correct even if the
  // user scrolls. currentToMs is the live preview; on mouseup
  // it commits via POST /extend-reservation. extendError
  // surfaces typed conflict messages from the route.
  const [drag, setDrag] = useState<{
    reservationId: string;
    rectLeft: number;
    rectWidth: number;
    originalToMs: number;
    currentToMs: number;
  } | null>(null);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [extending, setExtending] = useState(false);

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      from,
      to,
      group_by: groupBy,
    });
    if (stateFilter) params.set('state', stateFilter);
    if (categoryFilter.trim()) params.set('category', categoryFilter.trim());
    if (overdueOnly) params.set('overdue_only', '1');
    const res = await safeFetch<TimelineResponse>(
      `/api/admin/equipment/reservations-timeline?${params.toString()}`
    );
    setLoading(false);
    if (res) setData(res);
  }, [from, to, groupBy, stateFilter, categoryFilter, overdueOnly, safeFetch]);

  useEffect(() => {
    void fetchTimeline();
  }, [fetchTimeline]);

  // ── F10.6-c-iv drag listeners ───────────────────────────────
  // Window-level mousemove + mouseup so the cursor can leave
  // the bar mid-drag without breaking the gesture. Only active
  // while `drag` is non-null.
  useEffect(() => {
    if (!drag || !data) return;
    const windowFromMs = Date.parse(data.window.from);
    const windowToMs = Date.parse(data.window.to);
    const span = Math.max(1, windowToMs - windowFromMs);

    function onMove(e: MouseEvent) {
      if (!drag) return;
      const xPx = Math.max(
        drag.rectLeft,
        Math.min(drag.rectLeft + drag.rectWidth, e.clientX)
      );
      const ratio = (xPx - drag.rectLeft) / drag.rectWidth;
      const newMs = windowFromMs + ratio * span;
      setDrag((d) => (d ? { ...d, currentToMs: newMs } : d));
    }
    async function onUp() {
      const snapshot = drag;
      if (!snapshot) return;
      // Reset drag UI immediately so the bar doesn't visually
      // hang while the network call lands.
      setDrag(null);

      // Snap to nearest 15 minutes for usability — sub-minute
      // precision isn't useful at the EM level.
      const SNAP_MS = 15 * 60 * 1000;
      const snapped =
        Math.round(snapshot.currentToMs / SNAP_MS) * SNAP_MS;
      // No-op when the user dragged < SNAP_MS away from the
      // original (avoids accidental "I just clicked the handle"
      // network calls).
      if (Math.abs(snapped - snapshot.originalToMs) < SNAP_MS) {
        return;
      }
      // Refuse a backward drag at the wire level — the
      // /extend-reservation endpoint rejects it with 400, but
      // catching here saves the round-trip + gives a cleaner
      // error message.
      if (snapped <= snapshot.originalToMs) {
        setExtendError(
          'Drag right to extend; left-drag (shrink) is a cancel-and-' +
            're-reserve operation, not an extend.'
        );
        return;
      }

      setExtending(true);
      setExtendError(null);
      const newIso = new Date(snapped).toISOString();
      const res = await safeFetch<{
        reservation: { reserved_to: string };
        previous_reserved_to?: string;
      }>('/api/admin/equipment/extend-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: snapshot.reservationId,
          new_reserved_to: newIso,
          source: 'manual',
        }),
      });
      setExtending(false);
      if (res?.reservation) {
        // Refetch so the Gantt picks up the new reserved_to +
        // any sibling impacts (e.g., next_available_at on the
        // catalogue side).
        void fetchTimeline();
      } else {
        setExtendError(
          'Extend failed — refetch the timeline. Common cause: ' +
            'overlap with another active reservation.'
        );
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, data, fetchTimeline, safeFetch]);

  const ticks = useMemo(() => {
    if (!data) return [];
    return dayTicks(data.window.from, data.window.to);
  }, [data]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  const windowFromMs = data ? Date.parse(data.window.from) : 0;
  const windowToMs = data ? Date.parse(data.window.to) : 0;
  const windowSpanMs = Math.max(1, windowToMs - windowFromMs);

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Reservations timeline</h1>
          <p style={styles.subtitle}>
            §5.12.7.2 — every reservation across the window. Drag a
            <code style={styles.code}>held</code> bar to extend in
            F10.6-c-iv.
          </p>
        </div>
        <div style={styles.headerControls}>
          <input
            type="date"
            value={isoDay(new Date(from))}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!Number.isNaN(d.getTime())) setFrom(d.toISOString());
            }}
            style={styles.dateInput}
          />
          <span style={styles.muted}>→</span>
          <input
            type="date"
            value={isoDay(new Date(to))}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!Number.isNaN(d.getTime())) setTo(d.toISOString());
            }}
            style={styles.dateInput}
          />
          <button
            type="button"
            onClick={() => {
              const start = startOfTodayIso();
              setFrom(start);
              setTo(plusDaysIso(start, DEFAULT_DAYS));
            }}
            style={styles.todayBtn}
          >
            Reset to 14d
          </button>
        </div>
      </header>

      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Group by</span>
          <button
            type="button"
            style={
              groupBy === 'equipment' ? styles.toggleActive : styles.toggleIdle
            }
            onClick={() => setGroupBy('equipment')}
          >
            Equipment
          </button>
          <button
            type="button"
            style={
              groupBy === 'job' ? styles.toggleActive : styles.toggleIdle
            }
            onClick={() => setGroupBy('job')}
          >
            Job
          </button>
        </div>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>State</span>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={styles.select}
          >
            <option value="">all</option>
            <option value="held">held</option>
            <option value="checked_out">checked_out</option>
            <option value="returned">returned</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Category</span>
          <input
            type="text"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            placeholder="e.g. total_station_kit"
            style={styles.textInput}
          />
        </div>
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          <span>Overdue only</span>
        </label>
      </div>

      {!data ? (
        <div style={styles.empty}>
          {loading ? 'Loading…' : 'Failed to load — check the error log.'}
        </div>
      ) : data.swimlanes.length === 0 ? (
        <div style={styles.empty}>
          No reservations in the window. Try widening the window or
          clearing filters.
        </div>
      ) : (
        <>
          <div style={styles.summaryRow}>
            <span style={styles.summaryStrong}>
              {data.summary.swimlane_count}
            </span>
            <span> swimlane{data.summary.swimlane_count === 1 ? '' : 's'} ·</span>
            <span style={styles.summaryStrong}>
              {data.summary.bar_count}
            </span>
            <span> bar{data.summary.bar_count === 1 ? '' : 's'}</span>
          </div>

          <div style={styles.gantt}>
            <div style={styles.tickRow}>
              <div style={styles.tickLabelGutter} />
              <div style={styles.tickArea}>
                {ticks.map((iso, i) => {
                  const tickMs = Date.parse(iso);
                  const left =
                    ((tickMs - windowFromMs) / windowSpanMs) * 100;
                  return (
                    <div
                      key={iso}
                      style={{
                        ...styles.tick,
                        left: `${clamp(left, 0, 100)}%`,
                        opacity: i === 0 ? 1 : 0.6,
                      }}
                    >
                      <span style={styles.tickLabel}>
                        {new Date(iso).toLocaleDateString([], {
                          month: 'numeric',
                          day: 'numeric',
                        })}
                      </span>
                      <div style={styles.tickStem} />
                    </div>
                  );
                })}
              </div>
            </div>

            {data.swimlanes.map((lane) => (
              <div key={lane.key} style={styles.swimlaneRow}>
                <div style={styles.laneLabel} title={lane.key}>
                  {lane.label}
                </div>
                <div style={styles.barArea}>
                  {ticks.map((iso) => {
                    const tickMs = Date.parse(iso);
                    const left =
                      ((tickMs - windowFromMs) / windowSpanMs) * 100;
                    return (
                      <div
                        key={`grid-${iso}`}
                        style={{
                          ...styles.gridLine,
                          left: `${clamp(left, 0, 100)}%`,
                        }}
                      />
                    );
                  })}
                  {lane.bars.map((bar) => {
                    const fromMs = Math.max(
                      Date.parse(bar.reserved_from),
                      windowFromMs
                    );
                    // While dragging the bar, show its currentToMs
                    // (clamped to window) instead of reserved_to so
                    // the visual previews the new end live.
                    const liveToMs =
                      drag && drag.reservationId === bar.reservation_id
                        ? drag.currentToMs
                        : Date.parse(bar.reserved_to);
                    const toMs = Math.min(liveToMs, windowToMs);
                    if (toMs <= fromMs) return null;
                    const left = ((fromMs - windowFromMs) / windowSpanMs) * 100;
                    const width = ((toMs - fromMs) / windowSpanMs) * 100;
                    const stateStyle =
                      BAR_STATE_STYLES[bar.state] ?? BAR_STATE_STYLES.default;
                    const isStrikethrough = bar.state === 'cancelled';
                    const isHeld = bar.state === 'held';
                    const isDraggingThis =
                      drag && drag.reservationId === bar.reservation_id;
                    return (
                      <button
                        type="button"
                        key={bar.reservation_id}
                        title={
                          `${bar.equipment_name ?? bar.equipment_inventory_id} — ` +
                          `${bar.state}. Click for full details.`
                        }
                        onClick={() => {
                          // Suppress click when a drag just ended
                          // — the up-handler clears `drag`, but a
                          // tiny mouse jiggle can fire onClick
                          // anyway. Cheap guard: ignore clicks
                          // while extending.
                          if (extending) return;
                          setDrilldown({ bar, laneLabel: lane.label });
                        }}
                        style={{
                          ...styles.bar,
                          ...stateStyle,
                          left: `${clamp(left, 0, 100)}%`,
                          width: `${clamp(width, 0, 100)}%`,
                          textDecoration: isStrikethrough
                            ? 'line-through'
                            : 'none',
                          outline: bar.is_override
                            ? '2px solid #F59E0B'
                            : isDraggingThis
                            ? '2px solid #1D3095'
                            : 'none',
                        }}
                      >
                        <span style={styles.barLabel}>
                          {groupBy === 'equipment'
                            ? `Job ${bar.job_id.slice(0, 6)}`
                            : bar.equipment_name ??
                              bar.equipment_inventory_id.slice(0, 8)}
                        </span>
                        {isHeld ? (
                          <span
                            style={styles.dragHandle}
                            title="Drag right to extend the held window"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const target = e.currentTarget
                                .parentElement as HTMLElement | null;
                              const area = target?.parentElement as
                                | HTMLElement
                                | null;
                              if (!area) return;
                              const rect = area.getBoundingClientRect();
                              setExtendError(null);
                              setDrag({
                                reservationId: bar.reservation_id,
                                rectLeft: rect.left,
                                rectWidth: rect.width,
                                originalToMs: Date.parse(bar.reserved_to),
                                currentToMs: Date.parse(bar.reserved_to),
                              });
                            }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {drilldown ? (
        <DrilldownDrawer
          bar={drilldown.bar}
          laneLabel={drilldown.laneLabel}
          onClose={() => setDrilldown(null)}
        />
      ) : null}

      {extending ? (
        <div style={styles.extendingToast}>Extending reservation…</div>
      ) : extendError ? (
        <div style={styles.extendErrorToast}>
          ⚠ {extendError}
          <button
            type="button"
            onClick={() => setExtendError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#7F1D1D',
              fontSize: 11,
              marginLeft: 8,
              cursor: 'pointer',
            }}
          >
            dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// F10.6-c-iii — drilldown drawer
// ────────────────────────────────────────────────────────────

function DrilldownDrawer({
  bar,
  laneLabel,
  onClose,
}: {
  bar: SwimlaneBar;
  laneLabel: string;
  onClose: () => void;
}) {
  return (
    <div style={drawerStyles.backdrop} onClick={onClose}>
      <aside
        style={drawerStyles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reservation drilldown"
      >
        <header style={drawerStyles.header}>
          <div>
            <h2 style={drawerStyles.title}>
              {bar.equipment_name ?? bar.equipment_inventory_id}
            </h2>
            <p style={drawerStyles.subtitle}>
              <span style={stateBadgeStyle(bar.state)}>{bar.state}</span>
              {bar.is_override ? (
                <span style={drawerStyles.overrideBadge}>OVERRIDE</span>
              ) : null}
              <span style={drawerStyles.subtitleSpan}>
                {' '}· lane: {laneLabel}
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
          <DrawerRow label="Reservation">
            <code style={drawerStyles.code}>
              {bar.reservation_id.slice(0, 8)}
            </code>
          </DrawerRow>
          <DrawerRow label="Job">
            <Link
              href={`/admin/jobs/${bar.job_id}`}
              style={drawerStyles.link}
            >
              {bar.job_id}
            </Link>
          </DrawerRow>
          <DrawerRow label="Equipment">
            <Link
              href={`/admin/equipment/${bar.equipment_inventory_id}`}
              style={drawerStyles.link}
            >
              {bar.equipment_name ?? bar.equipment_inventory_id}
            </Link>
          </DrawerRow>
          <DrawerRow label="Window">
            {new Date(bar.reserved_from).toLocaleString()}
            <br />→ {new Date(bar.reserved_to).toLocaleString()}
          </DrawerRow>
          <DrawerRow label="Holder">
            {bar.holder_email ?? <span style={drawerStyles.muted}>—</span>}
          </DrawerRow>
          {bar.returned_condition ? (
            <DrawerRow label="Returned condition">
              {bar.returned_condition}
            </DrawerRow>
          ) : null}
          <DrawerRow label="Notes">
            {bar.notes ?? <span style={drawerStyles.muted}>—</span>}
          </DrawerRow>
        </div>

        <footer style={drawerStyles.footer}>
          <Link
            href={`/admin/equipment/${bar.equipment_inventory_id}`}
            style={drawerStyles.secondaryBtn}
          >
            Open equipment
          </Link>
          <Link
            href={`/admin/jobs/${bar.job_id}`}
            style={drawerStyles.primaryBtn}
          >
            Open job →
          </Link>
        </footer>
      </aside>
    </div>
  );
}

function DrawerRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={drawerStyles.row}>
      <div style={drawerStyles.rowLabel}>{label}</div>
      <div style={drawerStyles.rowValue}>{children}</div>
    </div>
  );
}

function stateBadgeStyle(state: string): React.CSSProperties {
  const base = BAR_STATE_STYLES[state] ?? BAR_STATE_STYLES.default;
  return {
    ...base,
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    border: 'none',
  };
}

const BAR_STATE_STYLES: Record<string, React.CSSProperties> = {
  held: { background: '#DBEAFE', color: '#1E3A8A', border: '1px solid #93C5FD' },
  checked_out: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: '1px solid #1D3095',
  },
  returned: {
    background: '#E5E7EB',
    color: '#374151',
    border: '1px solid #D1D5DB',
  },
  cancelled: {
    background: '#FFFFFF',
    color: '#9CA3AF',
    border: '1px dashed #D1D5DB',
  },
  default: {
    background: '#F3F4F6',
    color: '#374151',
    border: '1px solid #E5E7EB',
  },
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
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 12,
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
    marginLeft: 4,
    marginRight: 4,
  },
  headerControls: { display: 'flex', gap: 8, alignItems: 'center' },
  dateInput: {
    padding: '6px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  todayBtn: {
    padding: '6px 12px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    background: '#FFFFFF',
    fontSize: 13,
    cursor: 'pointer',
  },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
    padding: '12px 16px',
    background: '#F9FAFB',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    marginBottom: 16,
  },
  filterGroup: { display: 'flex', alignItems: 'center', gap: 6 },
  filterLabel: { fontSize: 12, color: '#6B7280', fontWeight: 500 },
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
  select: {
    padding: '4px 8px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    background: '#FFFFFF',
  },
  textInput: {
    padding: '4px 8px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    width: 200,
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#374151',
    cursor: 'pointer',
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 13,
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
  },
  muted: { color: '#6B7280', fontSize: 13 },
  summaryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
    fontSize: 13,
    color: '#6B7280',
  },
  summaryStrong: { color: '#111827', fontWeight: 600 },
  gantt: {
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tickRow: {
    display: 'flex',
    borderBottom: '1px solid #E2E5EB',
    background: '#F9FAFB',
    height: 36,
  },
  tickLabelGutter: { width: 200, flexShrink: 0 },
  tickArea: { position: 'relative', flex: 1 },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tickLabel: {
    fontSize: 10,
    color: '#6B7280',
    whiteSpace: 'nowrap',
    paddingBottom: 2,
  },
  tickStem: { width: 1, height: 6, background: '#D1D5DB' },
  swimlaneRow: {
    display: 'flex',
    borderBottom: '1px solid #F1F2F4',
    minHeight: 32,
    alignItems: 'stretch',
  },
  laneLabel: {
    width: 200,
    flexShrink: 0,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
    borderRight: '1px solid #F1F2F4',
    background: '#FAFBFC',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  barArea: { position: 'relative', flex: 1, minHeight: 32 },
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    background: '#F1F2F4',
  },
  bar: {
    position: 'absolute',
    top: 4,
    height: 24,
    borderRadius: 4,
    padding: '0 6px',
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
    fontSize: 11,
    cursor: 'pointer',
    minWidth: 4,
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  barLabel: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dragHandle: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 6,
    cursor: 'ew-resize',
    borderRadius: '0 4px 4px 0',
    background:
      'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(0,0,0,0.16) 100%)',
  },
  extendErrorToast: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    padding: '10px 14px',
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#7F1D1D',
    borderRadius: 8,
    fontSize: 13,
    maxWidth: 360,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
    zIndex: 900,
  },
  extendingToast: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    padding: '10px 14px',
    background: '#1D3095',
    color: '#FFFFFF',
    borderRadius: 8,
    fontSize: 13,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
    zIndex: 900,
  },
};

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
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  subtitleSpan: { color: '#6B7280' },
  overrideBadge: {
    background: '#FEF3C7',
    color: '#78350F',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
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
    overflowY: 'auto',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: 12,
    fontSize: 13,
    alignItems: 'baseline',
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  rowValue: { color: '#111827', wordBreak: 'break-word' },
  link: { color: '#1D3095', textDecoration: 'none' },
  muted: { color: '#9CA3AF' },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '12px 20px',
    borderTop: '1px solid #E2E5EB',
    background: '#FAFBFC',
  },
  secondaryBtn: {
    padding: '8px 14px',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    background: '#FFFFFF',
    color: '#374151',
    fontSize: 13,
    textDecoration: 'none',
  },
  primaryBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 8,
    background: '#1D3095',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
  },
};
