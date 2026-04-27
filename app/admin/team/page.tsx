// app/admin/team/page.tsx — Field team status + dispatcher Ping
//
// Per the user's resilience requirement: "The admin/dispatcher needs
// to be able to notify the user that they need to log their hours."
//
// This page shows every approved employee with:
//   - Are they currently clocked in? For how long?
//   - Last GPS reported on clock-in (lat/lon, links to maps)
//   - Last "log hours" reminder sent — delivered ✓ + read ✓ flags
//   - A Ping button per user → POST /api/admin/notifications
//     with kind='log_hours' (which the mobile NotificationBanner
//     auto-routes to /(tabs)/time on tap)
//
// Refresh: every 60 seconds we re-fetch /api/admin/team so an admin
// who pings + waits sees the user's clock-in status update without
// hard reload.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

interface ActiveEntry {
  id: string;
  job_id: string | null;
  entry_type: string | null;
  started_at: string | null;
  clocked_in_minutes: number | null;
  clock_in_lat: number | null;
  clock_in_lon: number | null;
}

interface LastPing {
  id: string;
  title: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

interface LastLocation {
  lat: number;
  lon: number;
  accuracy_m: number | null;
  battery_pct: number | null;
  is_charging: boolean | null;
  source: string;
  captured_at: string;
  /** Minutes between captured_at and the API request — server-side
   *  computed so client clock skew doesn't drift the staleness
   *  indicator. */
  staleness_minutes: number;
}

interface TeamMember {
  email: string;
  name: string | null;
  roles: string[];
  last_sign_in: string | null;
  active_entry: ActiveEntry | null;
  last_log_hours_ping: LastPing | null;
  last_location: LastLocation | null;
}

const REFRESH_MS = 60_000;

function formatMinutes(mins: number | null): string {
  if (mins == null) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function staleness(member: TeamMember): 'stale' | 'forgotten' | 'fine' {
  const e = member.active_entry;
  if (!e || e.clocked_in_minutes == null) return 'fine';
  // 16 hours matches the mobile-side stale-clock-in threshold; 8 h
  // is "long shift" worth a check-in nudge.
  if (e.clocked_in_minutes >= 16 * 60) return 'forgotten';
  if (e.clocked_in_minutes >= 8 * 60) return 'stale';
  return 'fine';
}

export default function TeamPage() {
  const { data: session } = useSession();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'clocked_in' | 'idle' | 'stale'>(
    'all'
  );
  const [pinging, setPinging] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<string>('');
  const [pingError, setPingError] = useState<boolean>(false);
  // Track the toast-clear timeout so we can cancel it on unmount or
  // when a new ping replaces the previous toast (otherwise an old
  // setTimeout could clear the new toast prematurely).
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount — clear pending timers so we don't setState
  // on an unmounted component (React 18 warns about this).
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/team');
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? 'Failed to load team');
      }
      const data = await res.json();
      setMembers(data.team ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTeam();
    const t = setInterval(() => void fetchTeam(), REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchTeam]);

  const filtered = members.filter((m) => {
    switch (filter) {
      case 'clocked_in':
        return !!m.active_entry;
      case 'idle':
        return !m.active_entry;
      case 'stale': {
        const s = staleness(m);
        return s === 'stale' || s === 'forgotten';
      }
      default:
        return true;
    }
  });

  const sendPing = useCallback(
    async (
      email: string,
      kind: 'log_hours' | 'submit_week' | 'admin_direct'
    ) => {
      // Cancel any pending toast-clear so the new toast gets its full
      // visibility window even if the previous one hadn't expired.
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }

      setPinging(email);
      setPingResult('');
      setPingError(false);
      let nextResult = '';
      let isError = false;
      try {
        const res = await fetch('/api/admin/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_user_email: email,
            kind,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error ?? `Failed to send ping (HTTP ${res.status})`);
        }
        nextResult = json?.deduped
          ? `Already pinged ${email} recently — refreshed the existing reminder.`
          : `Pinged ${email}`;
        // Refresh so the "last reminded" column updates.
        await fetchTeam();
      } catch (err) {
        nextResult =
          err instanceof Error ? err.message : 'Failed to send ping';
        isError = true;
      } finally {
        setPingResult(nextResult);
        setPingError(isError);
        setPinging(null);
        // Auto-clear the toast after 4 s; track the timer so unmount
        // cleanup can cancel it.
        toastTimerRef.current = setTimeout(() => {
          setPingResult('');
          setPingError(false);
          toastTimerRef.current = null;
        }, 4000);
      }
    },
    [fetchTeam]
  );

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Field Team</h1>
          <p style={styles.subtitle}>
            Live clock-in status. Click <strong>Ping</strong> to remind a
            user to log their hours — the message lands on their phone
            via Starr Field instantly when online, or as soon as they
            regain reception.
          </p>
        </div>
        <button
          type="button"
          style={styles.refreshBtn}
          onClick={() => void fetchTeam()}
        >
          Refresh
        </button>
      </header>

      <nav style={styles.tabs}>
        {(['all', 'clocked_in', 'idle', 'stale'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            style={{
              ...styles.tab,
              ...(filter === id ? styles.tabActive : null),
            }}
          >
            {id === 'all'
              ? 'All'
              : id === 'clocked_in'
              ? 'Clocked in'
              : id === 'idle'
              ? 'Not clocked in'
              : 'Stale (>8h)'}
          </button>
        ))}
      </nav>

      {error ? <div style={styles.error}>{error}</div> : null}
      {pingResult ? (
        <div
          style={pingError ? styles.toastError : styles.toast}
          role={pingError ? 'alert' : 'status'}
          aria-live="polite"
        >
          {pingResult}
        </div>
      ) : null}

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>No team members in this filter.</div>
      ) : (
        <div style={styles.grid}>
          {filtered.map((m) => (
            <TeamCard
              key={m.email}
              member={m}
              pinging={pinging === m.email}
              onPing={(kind) => void sendPing(m.email, kind)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TeamCardProps {
  member: TeamMember;
  pinging: boolean;
  onPing: (kind: 'log_hours' | 'submit_week' | 'admin_direct') => void;
}

function TeamCard({ member, pinging, onPing }: TeamCardProps) {
  const e = member.active_entry;
  const ping = member.last_log_hours_ping;
  const lastLoc = member.last_location;
  const stale = staleness(member);
  const lat = e?.clock_in_lat;
  const lon = e?.clock_in_lon;
  const mapsHref =
    lat != null && lon != null
      ? `https://www.google.com/maps?q=${lat},${lon}`
      : null;
  const lastSeenHref = lastLoc
    ? `https://www.google.com/maps?q=${lastLoc.lat},${lastLoc.lon}`
    : null;

  return (
    <article
      style={{
        ...styles.card,
        borderColor:
          stale === 'forgotten'
            ? '#DC2626'
            : stale === 'stale'
            ? '#D97706'
            : '#E2E5EB',
      }}
    >
      <header style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardName}>{member.name ?? member.email}</h2>
          <p style={styles.cardEmail}>{member.email}</p>
        </div>
        <span
          style={{
            ...styles.statusBadge,
            background: e ? '#10B981' : '#9CA3AF',
          }}
        >
          {e ? 'On the clock' : 'Off the clock'}
        </span>
      </header>

      <dl style={styles.dl}>
        <div style={styles.dlRow}>
          <dt style={styles.dt}>Clocked in for</dt>
          <dd style={styles.dd}>
            {e
              ? formatMinutes(e.clocked_in_minutes)
              : 'Not currently clocked in'}
          </dd>
        </div>
        {e?.entry_type ? (
          <div style={styles.dlRow}>
            <dt style={styles.dt}>Entry type</dt>
            <dd style={styles.dd}>{e.entry_type}</dd>
          </div>
        ) : null}
        {e?.started_at ? (
          <div style={styles.dlRow}>
            <dt style={styles.dt}>Started</dt>
            <dd style={styles.dd}>
              {new Date(e.started_at).toLocaleString()}
            </dd>
          </div>
        ) : null}
        {mapsHref ? (
          <div style={styles.dlRow}>
            <dt style={styles.dt}>Clock-in GPS</dt>
            <dd style={styles.dd}>
              <a href={mapsHref} target="_blank" rel="noreferrer">
                {lat?.toFixed(5)}, {lon?.toFixed(5)}
              </a>
            </dd>
          </div>
        ) : null}
        {lastLoc && lastSeenHref ? (
          <div style={styles.dlRow}>
            <dt style={styles.dt}>Last seen</dt>
            <dd style={styles.dd}>
              <a href={lastSeenHref} target="_blank" rel="noreferrer">
                {formatMinutes(lastLoc.staleness_minutes)} ago
              </a>
              {lastLoc.battery_pct != null ? (
                <>
                  {' · '}
                  <span
                    style={{
                      color:
                        lastLoc.battery_pct <= 20
                          ? '#B42318'
                          : lastLoc.battery_pct <= 40
                          ? '#D97706'
                          : '#067647',
                    }}
                    title={
                      lastLoc.is_charging
                        ? 'Battery charging'
                        : 'Battery (not charging)'
                    }
                  >
                    {lastLoc.is_charging ? '⚡' : '🔋'}
                    {lastLoc.battery_pct}%
                  </span>
                </>
              ) : null}
            </dd>
          </div>
        ) : null}
        <div style={styles.dlRow}>
          <dt style={styles.dt}>Last sign-in</dt>
          <dd style={styles.dd}>{formatTimeAgo(member.last_sign_in)}</dd>
        </div>
        <div style={styles.dlRow}>
          <dt style={styles.dt}>Last reminder</dt>
          <dd style={styles.dd}>
            {ping ? (
              <>
                <strong>{formatTimeAgo(ping.created_at)}</strong>
                {' — '}
                {ping.delivered_at ? '✓ delivered' : '⏳ undelivered'}
                {ping.read_at ? ' · ✓ read' : ' · — unread'}
              </>
            ) : (
              <span style={{ color: '#6B7280' }}>none in last 24 h</span>
            )}
          </dd>
        </div>
      </dl>

      <div style={styles.actions}>
        <button
          type="button"
          disabled={pinging}
          onClick={() => onPing('log_hours')}
          style={{
            ...styles.pingBtn,
            opacity: pinging ? 0.6 : 1,
          }}
        >
          {pinging ? 'Sending…' : '⏱ Ping: log hours'}
        </button>
        <button
          type="button"
          disabled={pinging}
          onClick={() => onPing('submit_week')}
          style={styles.pingBtnSecondary}
        >
          ✓ Submit week
        </button>
        <a
          href={`/admin/team/${encodeURIComponent(member.email)}`}
          style={{ ...styles.linkBtn, fontWeight: 600 }}
        >
          📋 Open profile
        </a>
        <a
          href={`/admin/mileage?user_email=${encodeURIComponent(member.email)}`}
          style={styles.linkBtn}
        >
          🚗 Mileage
        </a>
        <a
          href={`/admin/timeline?user=${encodeURIComponent(member.email)}`}
          style={styles.linkBtn}
        >
          🗺️ Timeline
        </a>
      </div>
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '24px',
    maxWidth: 1100,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
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
  refreshBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 13,
  },
  tabs: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  tab: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 999,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#6B7280',
  },
  tabActive: {
    background: '#1D3095',
    borderColor: '#1D3095',
    color: '#FFFFFF',
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
  toast: {
    background: '#ECFDF5',
    border: '1px solid #067647',
    color: '#067647',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  toastError: {
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 16,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  cardName: {
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 2px',
  },
  cardEmail: {
    fontSize: 12,
    color: '#6B7280',
    margin: 0,
  },
  statusBadge: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
  },
  dl: {
    margin: 0,
    marginBottom: 12,
    fontSize: 13,
  },
  dlRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    padding: '4px 0',
    borderBottom: '1px dashed #F3F4F6',
  },
  dt: {
    color: '#6B7280',
    margin: 0,
  },
  dd: {
    margin: 0,
    fontWeight: 500,
    textAlign: 'right',
  },
  actions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  pingBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  pingBtnSecondary: {
    background: 'transparent',
    color: '#1D3095',
    border: '1px solid #1D3095',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  linkBtn: {
    background: 'transparent',
    color: '#0B0E14',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
};
