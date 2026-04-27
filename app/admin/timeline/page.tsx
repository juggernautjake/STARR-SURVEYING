// app/admin/timeline/page.tsx — Per-user daily timeline
//
// Reads from the derived `location_stops` + `location_segments`
// tables (see seeds/224). Defaults to today; changing the date or
// employee re-fetches. "Recompute" button POSTs to derive on demand
// — useful when the surveyor's pings have just landed and the
// nightly job hasn't run yet.
//
// Per-stop card shows: time window, duration, lat/lon (Maps link),
// optional category + place name, the linked job + time-entry. Each
// pair of consecutive stops is connected by a segment row showing
// distance + duration in transit.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface StopRow {
  id: string;
  job_id: string | null;
  job_time_entry_id: string | null;
  category: string | null;
  category_source: string | null;
  lat: number;
  lon: number;
  place_name: string | null;
  arrived_at: string;
  departed_at: string;
  duration_minutes: number;
  user_overridden: boolean;
}

interface SegmentRow {
  id: string;
  start_stop_id: string | null;
  end_stop_id: string | null;
  started_at: string;
  ended_at: string;
  distance_meters: number;
}

interface TimelineResponse {
  stops: StopRow[];
  segments: SegmentRow[];
  total_distance_miles: number;
  total_dwell_minutes: number;
  derived_at: string | null;
  user_email: string;
  date: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TimelinePage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();

  const [userEmail, setUserEmail] = useState<string>(
    searchParams?.get('user') ?? ''
  );
  const [date, setDate] = useState<string>(
    searchParams?.get('date') ?? todayIso()
  );
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState('');

  const fetchTimeline = useCallback(async () => {
    if (!session?.user?.email || !userEmail) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ user_email: userEmail, date });
      const res = await fetch(`/api/admin/timeline?${params.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
      }
      setData(json as TimelineResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [session, userEmail, date]);

  useEffect(() => {
    void fetchTimeline();
  }, [fetchTimeline]);

  const onDerive = useCallback(async () => {
    if (!userEmail) return;
    setDeriving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: userEmail, date }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Recompute failed (HTTP ${res.status})`);
      }
      // Refresh the read after derive completes so the page reflects
      // the freshly-written rows.
      await fetchTimeline();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Recompute failed'
      );
    } finally {
      setDeriving(false);
    }
  }, [userEmail, date, fetchTimeline]);

  // Pair stops + segments for the timeline render. Segments live
  // BETWEEN stops; we walk both arrays in time order and emit a
  // mixed list. Order is: stop[0], seg[0], stop[1], seg[1], ...
  // up to whichever runs out first.
  const timeline: Array<
    { kind: 'stop'; row: StopRow } | { kind: 'segment'; row: SegmentRow }
  > = [];
  if (data) {
    const stops = data.stops;
    const segs = data.segments;
    for (let i = 0; i < stops.length; i++) {
      timeline.push({ kind: 'stop', row: stops[i] });
      if (i < segs.length) {
        timeline.push({ kind: 'segment', row: segs[i] });
      }
    }
  }

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Daily Timeline</h1>
          <p style={styles.subtitle}>
            Per-user stops + travel segments derived from the
            background-tracking pings (`location_pings`). Stops are
            clusters where the user dwelled ≥5 minutes within ~50 m;
            segments connect consecutive stops with the cumulative
            Haversine distance along the route. Tap Recompute after
            new pings have synced.
          </p>
        </div>
      </header>

      <div style={styles.controls}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Employee</span>
          <input
            type="email"
            placeholder="user@example.com"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            style={styles.input}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={styles.input}
            max={todayIso()}
          />
        </label>
        <button
          type="button"
          style={styles.refreshBtn}
          onClick={() => void fetchTimeline()}
          disabled={loading || !userEmail}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          style={styles.deriveBtn}
          onClick={() => void onDerive()}
          disabled={deriving || !userEmail}
          title="Re-runs the stop-detection algorithm against the latest pings"
        >
          {deriving ? 'Recomputing…' : 'Recompute'}
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {data ? (
        <div style={styles.summary}>
          <span>
            <strong>{data.stops.length}</strong> stop
            {data.stops.length === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span>
            <strong>{data.total_distance_miles.toFixed(2)}</strong> mi in
            transit
          </span>
          <span>·</span>
          <span>
            <strong>{formatDuration(data.total_dwell_minutes)}</strong>{' '}
            stationary
          </span>
          <span style={styles.derivedAt}>
            Last derived: {formatTimeAgo(data.derived_at)}
          </span>
        </div>
      ) : null}

      {!userEmail ? (
        <div style={styles.empty}>
          Pick an employee to load their timeline. Tip — the per-card
          link from <Link href="/admin/team">Field Team</Link> deep-
          links into this view.
        </div>
      ) : !data || (data.stops.length === 0 && data.segments.length === 0) ? (
        <div style={styles.empty}>
          {loading
            ? 'Loading…'
            : 'No derived stops or segments for this day. Tap Recompute to derive from the latest pings, or pick a different date.'}
        </div>
      ) : (
        <ol style={styles.timelineList}>
          {timeline.map((entry) =>
            entry.kind === 'stop' ? (
              <StopCard
                key={`stop-${entry.row.id}`}
                stop={entry.row}
                userEmail={userEmail}
              />
            ) : (
              <SegmentRail key={`seg-${entry.row.id}`} segment={entry.row} />
            )
          )}
        </ol>
      )}
    </div>
  );
}

function StopCard({
  stop,
  userEmail,
}: {
  stop: StopRow;
  userEmail: string;
}) {
  const mapsHref = `https://www.google.com/maps?q=${stop.lat},${stop.lon}`;
  return (
    <li style={styles.stopCard}>
      <div style={styles.stopMarker}>📍</div>
      <div style={styles.stopBody}>
        <div style={styles.stopHeader}>
          <span style={styles.stopTime}>
            {formatTime(stop.arrived_at)} → {formatTime(stop.departed_at)}
          </span>
          <span style={styles.stopDuration}>
            {formatDuration(stop.duration_minutes)}
          </span>
        </div>
        <div style={styles.stopMeta}>
          {stop.place_name ? (
            <span style={styles.stopPlace}>{stop.place_name}</span>
          ) : (
            <a href={mapsHref} target="_blank" rel="noreferrer">
              {stop.lat.toFixed(5)}, {stop.lon.toFixed(5)}
            </a>
          )}
          {stop.category ? (
            <span style={styles.stopCategory}>
              {stop.category}
              {stop.category_source ? (
                <span style={styles.stopSource}>
                  {' '}
                  ({stop.category_source})
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <div style={styles.stopActions}>
          {stop.job_id ? (
            <Link
              href={`/admin/jobs/${stop.job_id}`}
              style={styles.stopAction}
            >
              View job →
            </Link>
          ) : null}
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            style={styles.stopAction}
          >
            Open in Maps →
          </a>
          <Link
            href={`/admin/field-data?user_email=${encodeURIComponent(userEmail)}`}
            style={styles.stopAction}
          >
            Field data →
          </Link>
        </div>
      </div>
    </li>
  );
}

function SegmentRail({ segment }: { segment: SegmentRow }) {
  const meters = segment.distance_meters ?? 0;
  const miles = meters / 1609.344;
  const minutes =
    (new Date(segment.ended_at).getTime() -
      new Date(segment.started_at).getTime()) /
    60_000;
  return (
    <li style={styles.segmentRail}>
      <div style={styles.segmentLine} />
      <div style={styles.segmentLabel}>
        🚗 <strong>{miles.toFixed(2)} mi</strong> over{' '}
        {formatDuration(minutes)}
      </div>
    </li>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '24px',
    maxWidth: 900,
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
    minWidth: 200,
  },
  refreshBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
  },
  deriveBtn: {
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
  summary: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: '12px 16px',
    background: '#F7F8FA',
    borderRadius: 8,
    marginBottom: 24,
    fontSize: 14,
    color: '#0B0E14',
  },
  derivedAt: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#6B7280',
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
    background: '#F7F8FA',
    borderRadius: 8,
  },
  timelineList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  stopCard: {
    display: 'flex',
    gap: 12,
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    background: '#FFFFFF',
  },
  stopMarker: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  stopBody: {
    flex: 1,
  },
  stopHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  stopTime: {
    fontSize: 14,
    fontWeight: 600,
  },
  stopDuration: {
    fontSize: 13,
    color: '#1D3095',
    fontWeight: 600,
  },
  stopMeta: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    flexWrap: 'wrap',
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 6,
  },
  stopPlace: {
    fontWeight: 500,
  },
  stopCategory: {
    background: '#EEF2FF',
    color: '#1D3095',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stopSource: {
    fontWeight: 400,
    opacity: 0.7,
  },
  stopActions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    fontSize: 12,
  },
  stopAction: {
    color: '#1D3095',
    textDecoration: 'none',
  },
  segmentRail: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '4px 0 4px 24px',
    fontSize: 12,
    color: '#6B7280',
  },
  segmentLine: {
    width: 2,
    height: 28,
    background: '#E2E5EB',
    marginLeft: 14,
  },
  segmentLabel: {
    fontSize: 13,
  },
};
