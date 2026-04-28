// app/admin/team/[email]/page.tsx — per-user dispatcher drilldown
//
// One-stop "what is X up to today?" view, layered on top of the
// `/admin/team` list. Reads `/api/admin/team/{email}/today` for a
// single round trip across clock-ins, pings, stops, miles, captures,
// receipts, and recent admin pings.
//
// Sections (top to bottom):
//   - Header card: name + roles + last sign-in + clock state badge
//     + quick-action buttons (send ping, open mileage / timeline /
//     today's captures).
//   - Stats bar: minutes worked · miles · stops · pings · captures ·
//     receipts.
//   - Active clock-in (when present): job + duration + clock-in
//     coords with a Maps link.
//   - Today's clock-ins table (full day's history).
//   - Captures grid (last 12 with thumbnails).
//   - Receipts list (last 12).
//   - Dispatcher pings sent today (delivered + read state).
//
// Links out to existing per-feature pages for the long tail —
// /admin/timeline for full stop/segment detail, /admin/mileage for
// the per-vehicle breakdown + CSV, /admin/field-data?user_email= for
// the full capture archive, /admin/receipts?user_email= for receipts.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface UserHeader {
  email: string;
  name: string | null;
  roles: string[];
  last_sign_in: string | null;
}

interface ClockEntry {
  id: string;
  job_id: string | null;
  job_name: string | null;
  job_number: string | null;
  entry_type: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  clock_in_lat: number | null;
  clock_in_lon: number | null;
  is_active: boolean;
}

interface CaptureRow {
  point_id: string;
  point_name: string;
  job_id: string | null;
  job_name: string | null;
  code_category: string | null;
  created_at: string;
  is_offset: boolean | null;
  is_correction: boolean | null;
  thumb_signed_url: string | null;
  media_count: number;
}

interface ReceiptRow {
  id: string;
  vendor_name: string | null;
  category: string | null;
  total_cents: number | null;
  status: string;
  created_at: string;
  job_id: string | null;
}

interface DispatcherPingRow {
  id: string;
  source_type: string | null;
  title: string;
  body: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

interface PingRowLite {
  id: string;
  lat: number;
  lon: number;
  accuracy_m: number | null;
  battery_pct: number | null;
  is_charging: boolean | null;
  captured_at: string;
}

interface TodayPayload {
  date: string;
  is_clocked_in: boolean;
  active_entry: ClockEntry | null;
  entries: ClockEntry[];
  total_minutes: number;
  last_ping: PingRowLite | null;
  pings: PingRowLite[];
  ping_count: number;
  stop_count: number;
  miles: number;
  captures: CaptureRow[];
  capture_count: number;
  receipts: ReceiptRow[];
  receipt_count: number;
  dispatcher_pings: DispatcherPingRow[];
}

interface Response {
  user: UserHeader;
  today: TodayPayload;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLongTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never';
  const min = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / 60 / 24)}d ago`;
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatMoney(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

export default function TeamMemberDrilldownPage() {
  const { data: session } = useSession();
  const params = useParams();
  // Path param arrives URL-encoded; useParams returns it decoded but
  // upper-cased emails should normalise to lowercase for the API.
  const emailParam =
    typeof params?.email === 'string' ? params.email : null;
  const email = useMemo(
    () => (emailParam ? emailParam.toLowerCase().trim() : null),
    [emailParam]
  );

  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pinging, setPinging] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!session?.user?.email || !email) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/team/${encodeURIComponent(email)}/today`
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
      }
      setData(json as Response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [session, email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const onPing = useCallback(
    async (kind: 'log_hours' | 'submit_week') => {
      if (!email) return;
      setPinging(kind);
      try {
        const res = await fetch('/api/admin/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_user_email: email,
            source_type: kind,
            title:
              kind === 'log_hours'
                ? 'Time to log your hours'
                : 'Submit your week',
            body:
              kind === 'log_hours'
                ? 'A reminder from dispatch — please log your time.'
                : 'A reminder from dispatch — please submit this week.',
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error ?? `Ping failed (HTTP ${res.status})`);
        }
        // Re-fetch so the dispatcher-pings list reflects the new row.
        void fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ping failed');
      } finally {
        setPinging(null);
      }
    },
    [email, fetchData]
  );

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }
  if (loading && !data) {
    return <div style={styles.empty}>Loading…</div>;
  }
  if (error && !data) {
    return (
      <div style={styles.wrap}>
        <Link href="/admin/team" style={styles.back}>
          ‹ Back to team
        </Link>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }
  if (!data || !email) return null;

  const { user, today } = data;
  const lastSeenMaps =
    today.last_ping != null
      ? `https://www.google.com/maps?q=${today.last_ping.lat},${today.last_ping.lon}`
      : null;

  return (
    <div style={styles.wrap}>
      <Link href="/admin/team" style={styles.back}>
        ‹ Back to team
      </Link>

      <header style={styles.header}>
        <div style={{ flex: 1 }}>
          <h1 style={styles.h1}>{user.name ?? user.email}</h1>
          <p style={styles.subtitle}>
            {user.email}
            {user.roles.length > 0 ? (
              <>
                {' · '}
                {user.roles.map((r) => (
                  <span key={r} style={styles.rolePill}>
                    {r}
                  </span>
                ))}
              </>
            ) : null}
            {' · last sign-in '}
            {formatTimeAgo(user.last_sign_in)}
          </p>
          <div style={styles.flagRow}>
            <span
              style={today.is_clocked_in ? styles.flagOk : styles.flagNeutral}
            >
              {today.is_clocked_in
                ? `🟢 Clocked in${
                    today.active_entry?.duration_minutes != null
                      ? ` · ${formatDuration(today.active_entry.duration_minutes)}`
                      : ''
                  }`
                : '⚪ Off the clock'}
            </span>
            {today.last_ping ? (
              <span style={styles.flagNeutral}>
                Last seen {formatTimeAgo(today.last_ping.captured_at)}
                {today.last_ping.battery_pct != null
                  ? ` · ${today.last_ping.is_charging ? '⚡' : '🔋'}${today.last_ping.battery_pct}%`
                  : ''}
              </span>
            ) : null}
          </div>
        </div>
        <div style={styles.actionsCol}>
          <button
            type="button"
            disabled={!!pinging}
            onClick={() => onPing('log_hours')}
            style={styles.primaryBtn}
          >
            {pinging === 'log_hours' ? 'Sending…' : '⏱ Ping: log hours'}
          </button>
          <button
            type="button"
            disabled={!!pinging}
            onClick={() => onPing('submit_week')}
            style={styles.secondaryBtn}
          >
            {pinging === 'submit_week' ? 'Sending…' : '✓ Ping: submit week'}
          </button>
          <div style={styles.linkRow}>
            <Link
              href={`/admin/timeline?user=${encodeURIComponent(email)}`}
              style={styles.linkBtn}
            >
              🗺️ Timeline
            </Link>
            <Link
              href={`/admin/mileage?user_email=${encodeURIComponent(email)}`}
              style={styles.linkBtn}
            >
              🚗 Mileage
            </Link>
            <Link
              href={`/admin/field-data?user_email=${encodeURIComponent(email)}`}
              style={styles.linkBtn}
            >
              📷 All captures
            </Link>
          </div>
        </div>
      </header>

      <div style={styles.statsBar}>
        <Stat
          label="Worked"
          value={
            today.total_minutes > 0 ? formatDuration(today.total_minutes) : '0m'
          }
        />
        <Stat label="Miles" value={today.miles.toFixed(1)} />
        <Stat label="Stops" value={today.stop_count} />
        <Stat label="Pings" value={today.ping_count} />
        <Stat label="Captures" value={today.capture_count} />
        <Stat label="Receipts" value={today.receipt_count} />
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {today.active_entry ? (
        <section style={styles.section}>
          <h2 style={styles.h2}>On the clock</h2>
          <div style={styles.activeCard}>
            <div>
              <div style={styles.activeJob}>
                {today.active_entry.job_number
                  ? `${today.active_entry.job_number} · `
                  : ''}
                {today.active_entry.job_name ?? 'Unassigned job'}
              </div>
              <div style={styles.activeMeta}>
                {today.active_entry.entry_type ?? 'on_site'} · started{' '}
                {formatTimestamp(today.active_entry.started_at)} · open{' '}
                {today.active_entry.duration_minutes != null
                  ? formatDuration(today.active_entry.duration_minutes)
                  : '—'}
              </div>
            </div>
            <div style={styles.activeRight}>
              {today.active_entry.clock_in_lat != null &&
              today.active_entry.clock_in_lon != null ? (
                <a
                  href={`https://www.google.com/maps?q=${today.active_entry.clock_in_lat},${today.active_entry.clock_in_lon}`}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.linkBtn}
                >
                  Clock-in spot
                </a>
              ) : null}
              {lastSeenMaps ? (
                <a
                  href={lastSeenMaps}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.linkBtn}
                >
                  Last seen
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section style={styles.section}>
        <h2 style={styles.h2}>
          Today’s clock-ins
          {today.entries.length > 0 ? ` (${today.entries.length})` : ''}
        </h2>
        {today.entries.length === 0 ? (
          <div style={styles.empty}>No time entries today.</div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Started</th>
                  <th style={styles.th}>Ended</th>
                  <th style={styles.th}>Duration</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Job</th>
                </tr>
              </thead>
              <tbody>
                {today.entries.map((e) => (
                  <tr
                    key={e.id}
                    style={e.is_active ? styles.trActive : undefined}
                  >
                    <td style={styles.td}>{formatTimestamp(e.started_at)}</td>
                    <td style={styles.td}>
                      {e.ended_at ? formatTimestamp(e.ended_at) : '— open'}
                    </td>
                    <td style={styles.td}>
                      {e.duration_minutes != null
                        ? formatDuration(e.duration_minutes)
                        : '—'}
                    </td>
                    <td style={styles.td}>{e.entry_type ?? 'on_site'}</td>
                    <td style={styles.td}>
                      {e.job_id ? (
                        <Link
                          href={`/admin/jobs/${e.job_id}`}
                          style={styles.tableLink}
                        >
                          {e.job_number ? `${e.job_number} · ` : ''}
                          {e.job_name ?? 'Unnamed'}
                        </Link>
                      ) : (
                        <span style={{ color: '#9CA3AF' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>
          Captures
          {today.capture_count > 0 ? ` (${today.capture_count})` : ''}
        </h2>
        {today.captures.length === 0 ? (
          <div style={styles.empty}>
            No points captured today. Field-side captures appear here within
            seconds of regaining reception.
          </div>
        ) : (
          <>
            <div style={styles.captureGrid}>
              {today.captures.map((c) => (
                <Link
                  key={c.point_id}
                  href={`/admin/field-data/${c.point_id}`}
                  style={styles.captureCard}
                >
                  <div style={styles.captureThumbWrap}>
                    {c.thumb_signed_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={c.thumb_signed_url}
                        alt={c.point_name}
                        style={styles.captureThumb}
                      />
                    ) : (
                      <div style={styles.captureThumbPlaceholder}>📍</div>
                    )}
                    {c.media_count > 1 ? (
                      <span style={styles.captureBadge}>
                        +{c.media_count - 1}
                      </span>
                    ) : null}
                  </div>
                  <div style={styles.captureBody}>
                    <div style={styles.captureName}>{c.point_name}</div>
                    <div style={styles.captureMeta}>
                      {c.code_category ? `${c.code_category} · ` : ''}
                      {formatTimestamp(c.created_at)}
                    </div>
                    {c.job_name ? (
                      <div style={styles.captureJob}>{c.job_name}</div>
                    ) : null}
                    {c.is_offset || c.is_correction ? (
                      <div style={styles.captureFlag}>
                        {c.is_offset ? 'offset' : ''}
                        {c.is_offset && c.is_correction ? ' · ' : ''}
                        {c.is_correction ? 'correction' : ''}
                      </div>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
            {today.capture_count > today.captures.length ? (
              <Link
                href={`/admin/field-data?user_email=${encodeURIComponent(email)}`}
                style={styles.seeAll}
              >
                See all {today.capture_count} →
              </Link>
            ) : null}
          </>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>
          Receipts
          {today.receipt_count > 0 ? ` (${today.receipt_count})` : ''}
        </h2>
        {today.receipts.length === 0 ? (
          <div style={styles.empty}>No receipts logged today.</div>
        ) : (
          <>
            <div style={styles.list}>
              {today.receipts.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/receipts/${r.id}`}
                  style={styles.listItem}
                >
                  <div>
                    <div style={styles.listTitle}>
                      {r.vendor_name ?? 'Vendor pending'}
                    </div>
                    <div style={styles.listSub}>
                      {r.category ?? 'uncategorised'} ·{' '}
                      {formatTimestamp(r.created_at)} · {r.status}
                    </div>
                  </div>
                  <div style={styles.listRight}>
                    {formatMoney(r.total_cents)}
                  </div>
                </Link>
              ))}
            </div>
            {today.receipt_count > today.receipts.length ? (
              <Link
                href={`/admin/receipts?user_email=${encodeURIComponent(email)}`}
                style={styles.seeAll}
              >
                See all {today.receipt_count} →
              </Link>
            ) : null}
          </>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>
          Dispatcher pings
          {today.dispatcher_pings.length > 0
            ? ` (${today.dispatcher_pings.length})`
            : ''}
        </h2>
        {today.dispatcher_pings.length === 0 ? (
          <div style={styles.empty}>No reminders sent today.</div>
        ) : (
          <div style={styles.list}>
            {today.dispatcher_pings.map((p) => (
              <div key={p.id} style={styles.listItem}>
                <div>
                  <div style={styles.listTitle}>{p.title}</div>
                  <div style={styles.listSub}>
                    {p.source_type ?? 'manual'} ·{' '}
                    {formatLongTimestamp(p.created_at)} ·{' '}
                    {p.delivered_at ? '✓ delivered' : '⏳ undelivered'}
                    {p.read_at ? ' · ✓ read' : ' · — unread'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '24px',
    maxWidth: 1100,
    margin: '0 auto',
  },
  back: {
    display: 'inline-block',
    fontSize: 13,
    color: '#1D3095',
    marginBottom: 16,
    textDecoration: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 24,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  h1: {
    fontSize: 24,
    fontWeight: 600,
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    margin: '0 0 8px',
  },
  rolePill: {
    display: 'inline-block',
    background: '#EEF2FF',
    color: '#1D3095',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    marginRight: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  flagRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  flagOk: {
    display: 'inline-block',
    background: '#D1FAE5',
    color: '#047857',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  },
  flagNeutral: {
    display: 'inline-block',
    background: '#F3F4F6',
    color: '#374151',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
  },
  actionsCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 220,
  },
  primaryBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  secondaryBtn: {
    background: '#FFFFFF',
    color: '#1D3095',
    border: '1px solid #1D3095',
    borderRadius: 8,
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  linkRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  linkBtn: {
    fontSize: 12,
    color: '#1D3095',
    textDecoration: 'none',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    padding: '6px 10px',
    background: '#FFFFFF',
  },
  statsBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: 8,
    background: '#F7F8FA',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: 24,
  },
  h2: {
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 12px',
  },
  activeCard: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    padding: 16,
    background: '#ECFDF5',
    border: '1px solid #34D399',
    borderRadius: 12,
    flexWrap: 'wrap',
  },
  activeJob: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 4,
  },
  activeMeta: {
    fontSize: 13,
    color: '#374151',
  },
  activeRight: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  tableWrap: {
    overflow: 'auto',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    background: '#FFFFFF',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
    fontWeight: 600,
    color: '#374151',
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #F3F4F6',
    color: '#0B0E14',
  },
  trActive: {
    background: '#ECFDF5',
  },
  tableLink: {
    color: '#1D3095',
    textDecoration: 'none',
  },
  captureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 12,
  },
  captureCard: {
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#FFFFFF',
    textDecoration: 'none',
    color: 'inherit',
    display: 'flex',
    flexDirection: 'column',
  },
  captureThumbWrap: {
    width: '100%',
    aspectRatio: '4 / 3',
    position: 'relative',
    background: '#F7F8FA',
  },
  captureThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  captureThumbPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    color: '#9CA3AF',
  },
  captureBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    background: 'rgba(0,0,0,0.7)',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
  },
  captureBody: {
    padding: 10,
  },
  captureName: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 2,
  },
  captureMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  captureJob: {
    fontSize: 12,
    color: '#374151',
    marginTop: 2,
  },
  captureFlag: {
    fontSize: 11,
    fontWeight: 600,
    color: '#92400E',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 10,
    textDecoration: 'none',
    color: 'inherit',
    gap: 12,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0B0E14',
  },
  listSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  listRight: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0B0E14',
  },
  seeAll: {
    display: 'inline-block',
    marginTop: 12,
    fontSize: 13,
    color: '#1D3095',
    textDecoration: 'none',
  },
  empty: {
    padding: 24,
    textAlign: 'center',
    color: '#6B7280',
    background: '#F7F8FA',
    borderRadius: 12,
    fontSize: 13,
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
};
