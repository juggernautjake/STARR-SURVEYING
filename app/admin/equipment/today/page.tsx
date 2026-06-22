// app/admin/equipment/today/page.tsx — §5.12.7.1 Today landing page (F10.6-b-ii)
//
// The Equipment Manager's daily-driver dashboard. Three vertical
// strips (going_out / out_now / returned) plus three banners
// (unstaffed_pto / low_stock_consumables / maintenance_starting_today).
// Consumes the F10.6-b-i aggregator at GET /api/admin/equipment/today.
//
// Date scrub via ?date=YYYY-MM-DD; default = today.
//
// Auth: admin / developer / tech_support / equipment_manager
// (same EQUIPMENT_ROLES as the sidebar).
//
// Inline styles mirror the rest of /admin/equipment/* so this
// page lands without touching shared CSS.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Wrench, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';

type StatusPill = 'on_time' | 'at_risk' | 'overdue';

interface ReservationBase {
  id: string;
  job_id: string;
  equipment_inventory_id: string;
  reserved_from: string;
  reserved_to: string;
  state: string;
  is_override: boolean;
  notes: string | null;
  actual_checked_out_at: string | null;
  actual_returned_at: string | null;
  checked_out_to_user: string | null;
  checked_out_condition: string | null;
  returned_condition: string | null;
  consumed_quantity: number | null;
  nag_silenced_until: string | null;
  equipment_name?: string | null;
  holder_email?: string | null;
}

interface OutNowReservation extends ReservationBase {
  status_pill: StatusPill;
}

interface UnstaffedPto {
  id: string;
  user_email: string;
  unavailable_from: string;
  unavailable_to: string;
  kind: string;
  reason: string | null;
}

interface LowStockRow {
  id: string;
  name: string | null;
  quantity_on_hand: number | null;
  low_stock_threshold: number | null;
  vendor: string | null;
}

interface MaintenanceRow {
  id: string;
  equipment_inventory_id: string | null;
  vehicle_id: string | null;
  kind: string;
  origin: string;
  state: string;
  scheduled_for: string | null;
  summary: string;
}

interface CertExpiringRow {
  id: string;
  name: string | null;
  next_calibration_due_at: string;
  days_until: number;
}

interface TodayResponse {
  date: string;
  now: string;
  strips: {
    going_out: ReservationBase[];
    out_now: OutNowReservation[];
    returned: ReservationBase[];
  };
  banners: {
    unstaffed_pto: UnstaffedPto[];
    low_stock_consumables: LowStockRow[];
    maintenance_starting_today: MaintenanceRow[];
    cert_expiring: CertExpiringRow[];
  };
  counts: {
    going_out: number;
    out_now: number;
    returned: number;
    overdue: number;
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function EquipmentTodayPage() {
  const { data: session } = useSession();
  const { safeFetch } = usePageError('EquipmentTodayPage');

  const [date, setDate] = useState<string>(todayIso());
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [returnedExpanded, setReturnedExpanded] = useState(false);

  const fetchToday = useCallback(async () => {
    setLoading(true);
    const res = await safeFetch<TodayResponse>(
      `/api/admin/equipment/today?date=${date}`
    );
    setLoading(false);
    if (res) setData(res);
  }, [date, safeFetch]);

  useEffect(() => {
    void fetchToday();
  }, [fetchToday]);

  const isToday = useMemo(() => date === todayIso(), [date]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>
            Equipment — {isToday ? 'Today' : date}
          </h1>
          <p style={styles.subtitle}>
            The dispatcher dashboard for any given day — what&rsquo;s
            scheduled to roll out, what&rsquo;s currently out in the
            field, and what&rsquo;s been checked back in. Use this
            to plan crews, spot conflicts, and make sure nothing
            slips through.
          </p>
        </div>
        <div style={styles.headerControls}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={styles.dateInput}
          />
          <button
            type="button"
            onClick={() => setDate(todayIso())}
            style={styles.todayBtn}
            disabled={isToday}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => void fetchToday()}
            style={styles.refreshBtn}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {data ? (
        <>
          <BannerStack banners={data.banners} />

          <section style={styles.strip}>
            <header style={styles.stripHeader}>
              <h2 style={styles.h2}>
                Going out today
                <span style={styles.count}>· {data.counts.going_out}</span>
              </h2>
              <span style={styles.muted}>
                Held reservations starting today.
              </span>
            </header>
            {data.strips.going_out.length === 0 ? (
              <div style={styles.empty}>Nothing scheduled to go out.</div>
            ) : (
              <ul style={styles.list}>
                {data.strips.going_out.map((r) => (
                  <li key={r.id} style={styles.row}>
                    <div style={styles.rowMain}>
                      <strong>
                        {r.equipment_name ?? r.equipment_inventory_id.slice(0, 8)}
                      </strong>
                      <span style={styles.muted}>
                        {' '}· job{' '}
                        <Link
                          href={`/admin/jobs/${r.job_id}`}
                          style={styles.link}
                        >
                          {r.job_id.slice(0, 8)}
                        </Link>
                      </span>
                      {r.is_override ? (
                        <span style={styles.overrideBadge}>OVERRIDE</span>
                      ) : null}
                    </div>
                    <div style={styles.rowMeta}>
                      <span>Window: {formatTime(r.reserved_from)} →{' '}
                        {formatTime(r.reserved_to)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={styles.strip}>
            <header style={styles.stripHeader}>
              <h2 style={styles.h2}>
                Out right now
                <span style={styles.count}>· {data.counts.out_now}</span>
                {data.counts.overdue > 0 ? (
                  <span style={styles.overduePill}>
                    {data.counts.overdue} overdue
                  </span>
                ) : null}
              </h2>
              <span style={styles.muted}>
                Sorted by due-back time. Pill at the right.
              </span>
            </header>
            {data.strips.out_now.length === 0 ? (
              <div style={styles.empty}>
                Nothing checked out right now.
              </div>
            ) : (
              <ul style={styles.list}>
                {data.strips.out_now.map((r) => (
                  <li key={r.id} style={styles.row}>
                    <div style={styles.rowMain}>
                      <strong>
                        {r.equipment_name ?? r.equipment_inventory_id.slice(0, 8)}
                      </strong>
                      <span style={styles.muted}>
                        {' '}· {r.holder_email ?? 'unknown holder'} · job{' '}
                        <Link
                          href={`/admin/jobs/${r.job_id}`}
                          style={styles.link}
                        >
                          {r.job_id.slice(0, 8)}
                        </Link>
                      </span>
                    </div>
                    <div style={styles.rowMeta}>
                      <span>Due back: {new Date(r.reserved_to).toLocaleString()}</span>
                      <PillBadge pill={r.status_pill} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={styles.strip}>
            <header
              style={styles.stripHeader}
              onClick={() => setReturnedExpanded((v) => !v)}
              role="button"
            >
              <h2 style={styles.h2}>
                Already returned today
                <span style={styles.count}>· {data.counts.returned}</span>
                <span style={styles.toggle}>
                  {returnedExpanded ? '▾' : '▸'}
                </span>
              </h2>
              <span style={styles.muted}>
                Daily reconcile artefact. {data.counts.going_out} went out ·{' '}
                {data.counts.returned} returned ·{' '}
                {data.counts.out_now} still out.
              </span>
            </header>
            {!returnedExpanded ? null : data.strips.returned.length === 0 ? (
              <div style={styles.empty}>Nothing returned yet today.</div>
            ) : (
              <ul style={styles.list}>
                {data.strips.returned.map((r) => (
                  <li key={r.id} style={styles.row}>
                    <div style={styles.rowMain}>
                      <strong>
                        {r.equipment_name ?? r.equipment_inventory_id.slice(0, 8)}
                      </strong>
                      <span style={styles.muted}>
                        {' '}· {r.holder_email ?? 'unknown holder'} · job{' '}
                        <Link
                          href={`/admin/jobs/${r.job_id}`}
                          style={styles.link}
                        >
                          {r.job_id.slice(0, 8)}
                        </Link>
                      </span>
                      <ConditionBadge condition={r.returned_condition} />
                    </div>
                    <div style={styles.rowMeta}>
                      <span>Returned: {formatTime(r.actual_returned_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
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

function PillBadge({ pill }: { pill: StatusPill }) {
  const style =
    pill === 'overdue'
      ? styles.pillOverdue
      : pill === 'at_risk'
      ? styles.pillAtRisk
      : styles.pillOnTime;
  const label =
    pill === 'overdue' ? 'Overdue' : pill === 'at_risk' ? 'At risk' : 'On time';
  return <span style={style}>{label}</span>;
}

function ConditionBadge({ condition }: { condition: string | null }) {
  if (!condition) return null;
  const map: Record<string, { label: string; style: React.CSSProperties }> = {
    good: { label: 'good', style: styles.condGood },
    fair: { label: 'fair', style: styles.condFair },
    damaged: { label: 'damaged', style: styles.condDamaged },
    lost: { label: 'lost', style: styles.condLost },
  };
  const entry = map[condition];
  if (!entry) return null;
  return <span style={entry.style}>{entry.label}</span>;
}

function BannerStack({
  banners,
}: {
  banners: TodayResponse['banners'];
}) {
  const items: JSX.Element[] = [];
  if (banners.unstaffed_pto.length > 0) {
    items.push(
      <div key="pto" style={styles.bannerRed}>
        <strong><AlertTriangle size={14} style={{ verticalAlign: "text-bottom", marginRight: "0.15rem" }} /> {banners.unstaffed_pto.length} PTO/sick today</strong> ·{' '}
        {banners.unstaffed_pto
          .slice(0, 3)
          .map((p) => `${p.user_email} (${p.kind})`)
          .join(', ')}
        {banners.unstaffed_pto.length > 3
          ? ` · +${banners.unstaffed_pto.length - 3} more`
          : ''}
      </div>
    );
  }
  if (banners.low_stock_consumables.length > 0) {
    items.push(
      <div key="lowstock" style={styles.bannerAmber}>
        <strong>
          <AlertTriangle size={14} style={{ verticalAlign: "text-bottom", marginRight: "0.15rem" }} /> {banners.low_stock_consumables.length} consumable
          {banners.low_stock_consumables.length === 1 ? '' : 's'} low + reserved
          today
        </strong>
        {' · '}
        {banners.low_stock_consumables
          .slice(0, 3)
          .map(
            (c) =>
              `${c.name ?? c.id.slice(0, 8)} (${c.quantity_on_hand}/${c.low_stock_threshold})`
          )
          .join(', ')}
      </div>
    );
  }
  if (banners.maintenance_starting_today.length > 0) {
    items.push(
      <div key="maint" style={styles.bannerBlue}>
        <strong>
          <Wrench size={14} style={{ verticalAlign: "text-bottom", marginRight: "0.15rem" }} /> {banners.maintenance_starting_today.length} maintenance window
          {banners.maintenance_starting_today.length === 1 ? '' : 's'} today
        </strong>
        {' · '}
        {banners.maintenance_starting_today
          .slice(0, 3)
          .map((m) => m.summary)
          .join(' · ')}
      </div>
    );
  }
  if (banners.cert_expiring.length > 0) {
    // F10.7-i-i — split into "overdue" (red) and "upcoming" (blue)
    // so a lapsed NIST cert can&apos;t hide behind a long upcoming
    // list. Surveys with an expired cert are technically illegal
    // — the EM needs to see this immediately.
    const overdue = banners.cert_expiring.filter((c) => c.days_until < 0);
    const upcoming = banners.cert_expiring.filter((c) => c.days_until >= 0);
    if (overdue.length > 0) {
      items.push(
        <div key="cert-overdue" style={styles.bannerRed}>
          <strong>
            <AlertTriangle size={14} style={{ verticalAlign: "text-bottom", marginRight: "0.15rem" }} /> {overdue.length} calibration cert
            {overdue.length === 1 ? '' : 's'} overdue
          </strong>
          {' · '}
          {overdue
            .slice(0, 3)
            .map(
              (c) =>
                `${c.name ?? c.id.slice(0, 8)} (${Math.abs(c.days_until)}d ago)`
            )
            .join(', ')}
          {overdue.length > 3 ? ` · +${overdue.length - 3} more` : ''}
        </div>
      );
    }
    if (upcoming.length > 0) {
      items.push(
        <div key="cert-upcoming" style={styles.bannerBlue}>
          <strong>
            <FlaskConical size={14} style={{ verticalAlign: "text-bottom", marginRight: "0.15rem" }} /> {upcoming.length} calibration cert
            {upcoming.length === 1 ? '' : 's'} expiring within 60d
          </strong>
          {' · '}
          {upcoming
            .slice(0, 3)
            .map(
              (c) =>
                `${c.name ?? c.id.slice(0, 8)} (in ${c.days_until}d)`
            )
            .join(', ')}
          {upcoming.length > 3 ? ` · +${upcoming.length - 3} more` : ''}
        </div>
      );
    }
  }
  if (items.length === 0) return null;
  return <div style={styles.bannerStack}>{items}</div>;
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 1100, margin: '0 auto' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  h1: { fontSize: 22, fontWeight: 600, margin: '0 0 4px' },
  h2: {
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: { fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 },
  // equipment-today-row-alignment-2026-06-21 — user reported the
  // date input + Today + Refresh buttons floated at different
  // vertical positions. Root cause: the controls had only `padding:
  // 6px …` and no explicit height, so the native `<input
  // type="date">` rendered taller (its built-in calendar icon adds
  // intrinsic height) than the bare text buttons. Pin every control
  // in the row to height: 32 + box-sizing: border-box so the row
  // shares one baseline regardless of native widget chrome.
  headerControls: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
  },
  dateInput: {
    height: 32,
    boxSizing: 'border-box',
    padding: '0 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    background: 'var(--color-bg-card, #FFFFFF)',
  },
  todayBtn: {
    height: 32,
    boxSizing: 'border-box',
    padding: '0 12px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    background: 'var(--color-bg-card)',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  refreshBtn: {
    height: 32,
    boxSizing: 'border-box',
    padding: '0 12px',
    border: 'none',
    borderRadius: 6,
    background: 'var(--color-brand-navy)',
    color: 'var(--color-text-on-brand)',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  bannerStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 16,
  },
  bannerRed: {
    padding: '10px 14px',
    background: 'var(--color-error-bg)',
    border: '1px solid #FCA5A5',
    color: '#7F1D1D',
    borderRadius: 8,
    fontSize: 13,
  },
  bannerAmber: {
    padding: '10px 14px',
    background: 'var(--color-warning-bg)',
    border: '1px solid #FCD34D',
    color: '#78350F',
    borderRadius: 8,
    fontSize: 13,
  },
  bannerBlue: {
    padding: '10px 14px',
    background: 'var(--color-info-bg)',
    border: '1px solid #93C5FD',
    color: '#1E3A8A',
    borderRadius: 8,
    fontSize: 13,
  },
  strip: {
    background: 'var(--color-bg-card)',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  stripHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 8,
    cursor: 'pointer',
  },
  toggle: { marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-tertiary)' },
  count: {
    fontSize: 12,
    color: 'var(--color-text-tertiary)',
    fontWeight: 400,
    letterSpacing: '0.04em',
  },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    padding: '10px 0',
    borderBottom: '1px solid #F1F2F4',
    fontSize: 13,
  },
  rowMain: { display: 'flex', alignItems: 'center', gap: 6, flex: 1 },
  rowMeta: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    fontSize: 12,
    color: 'var(--color-text-tertiary)',
  },
  link: { color: 'var(--color-brand-navy)', textDecoration: 'none' },
  muted: { color: 'var(--color-text-tertiary)' },
  empty: {
    padding: 16,
    textAlign: 'center',
    color: 'var(--color-text-tertiary)',
    fontSize: 13,
  },
  pillOnTime: {
    background: '#DCFCE7',
    color: '#166534',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
  },
  pillAtRisk: {
    background: '#FEF3C7',
    color: '#78350F',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
  },
  pillOverdue: {
    background: '#FEE2E2',
    color: '#7F1D1D',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
  },
  overduePill: {
    background: '#FEE2E2',
    color: '#7F1D1D',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    marginLeft: 4,
  },
  overrideBadge: {
    background: '#FEF3C7',
    color: '#78350F',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  condGood: {
    background: '#DCFCE7',
    color: '#166534',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 11,
  },
  condFair: {
    background: '#FEF3C7',
    color: '#78350F',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 11,
  },
  condDamaged: {
    background: '#FEE2E2',
    color: '#7F1D1D',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 11,
  },
  condLost: {
    background: '#F3E8FF',
    color: '#581C87',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 11,
  },
};
