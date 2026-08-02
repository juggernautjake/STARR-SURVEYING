'use client';
// app/admin/field-data/LiveFieldFeed.tsx — what has come in from the field, both ways (§3d, 8p).
//
// This page already listed phone captures. What it could not show — because nothing rendered them
// anywhere — was points arriving from a data collector: `instrument_points` had a full ingestion
// path (items 8n/8o) and no UI at all. Two capture paths, one of them invisible.
//
// So this strip sits above the gallery and answers the question the gallery cannot: *what has
// arrived, from anywhere, in the last few minutes.* Ordered by arrival, never by shot time — a batch
// of this morning's work uploaded at six would otherwise appear below points captured after it.
//
// ── IT POLLS, BECAUSE THE HONEST MECHANISM IS A POLL ────────────────────────────────────────────
//
// §3d found that Trimble Connect has no webhooks and no vendor emits an event on Store. The phone
// path is genuinely instant into the database, but this page still has to ask. Fifteen seconds is a
// deliberate figure: fast enough that "a point shows up shortly after" is true from the office, slow
// enough that leaving the tab open all afternoon is four requests a minute against two indexed
// queries. Polling stops when the tab is hidden — a laptop left open on a truck seat should not spend
// the day asking.
//
// The cursor comes from the server, never from `new Date()` here: a browser an hour behind would
// call an hour of history "new" on every poll.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Radio, Smartphone, Satellite, AlertTriangle } from 'lucide-react';
import type { FieldFeedItem, FeedFreshness } from '@/lib/field-live/feed';

const POLL_MS = 15_000;

interface FeedResponse {
  items: FieldFeedItem[];
  freshness: FeedFreshness;
  promise: string;
  newSince: number;
  cursor: string | null;
  degraded: string[];
}

function whenText(iso: string, now: number): string {
  const secs = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.round(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/** The lag sentence. Written out rather than shown as a raw number because "2h" next to a timestamp
 *  invites the reader to assume the timestamp IS the shot time — the exact confusion the two clocks
 *  exist to prevent. */
function lagText(item: FieldFeedItem): string | null {
  if (item.lagSeconds === null) return 'shot time not recorded by this format';
  if (item.lagSeconds < 0) return 'the capturing device’s clock is ahead of ours';
  if (item.lagSeconds < 90) return null; // Arrived essentially as it was shot; saying so is noise.
  if (item.lagSeconds < 3600) return `shot ${Math.round(item.lagSeconds / 60)} min before it reached us`;
  return `shot ${Math.round(item.lagSeconds / 3600)} h before it reached us`;
}

export default function LiveFieldFeed({ jobId }: { jobId?: string }) {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [now, setNow] = useState(() => Date.now());
  const cursorRef = useRef<string | null>(null);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (jobId) params.set('jobId', jobId);
    if (cursorRef.current) params.set('since', cursorRef.current);
    try {
      const res = await fetch(`/api/admin/field-live?${params.toString()}`);
      if (!res.ok) { setState('failed'); return; }
      const d = (await res.json()) as FeedResponse;
      setData(d);
      cursorRef.current = d.cursor;
      setState('ok');
    } catch {
      setState('failed');
    }
  }, [jobId]);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => { setNow(Date.now()); void load(); }, POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => { if (document.hidden) stop(); else { void load(); start(); } };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [load]);

  const items = data?.items ?? [];

  return (
    <section className="field-live">
      <header className="field-live__head">
        <h2 className="field-live__title">
          <Radio size={15} aria-hidden /> Live field feed
          {data && data.newSince > 0 ? (
            <span className="field-live__new">{data.newSince} new</span>
          ) : null}
        </h2>
        <button type="button" className="field-live__toggle" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </header>

      {open ? (
        <>
          {/* The promise sentence comes from the server, where §3d's "do not promise instant, any
              brand" lives. Composing it here from parts is how a UI eventually claims 'live' about a
              path that syncs. */}
          {data ? <p className="field-live__promise">{data.promise}</p> : null}

          {data?.degraded?.length ? (
            <p className="field-live__degraded">
              <AlertTriangle size={13} aria-hidden /> {data.degraded.join(' ')} What you see below is
              incomplete.
            </p>
          ) : null}

          {state === 'loading' ? (
            <p className="field-live__note">Checking what has arrived…</p>
          ) : state === 'failed' ? (
            <p className="field-live__note field-live__note--bad">
              The feed could not be read. This is not “nothing has come in”.
            </p>
          ) : items.length === 0 ? (
            <p className="field-live__note">
              Nothing has arrived yet. A point captured on a crew phone shows up here within seconds;
              a collector’s points arrive when its job syncs or somebody imports its file.
            </p>
          ) : (
            <ul className="field-live__list">
              {items.slice(0, 12).map((it) => {
                const lag = lagText(it);
                return (
                  <li key={`${it.source}:${it.id}`} className={`field-live__row field-live__row--${it.source}`}>
                    <span className="field-live__icon" title={it.source === 'phone' ? 'Captured on a phone' : 'From a data collector'}>
                      {it.source === 'phone' ? <Smartphone size={14} aria-hidden /> : <Satellite size={14} aria-hidden />}
                    </span>
                    <span className="field-live__name">
                      {it.source === 'phone' ? (
                        <Link href={`/admin/field-data/${it.id}`}>{it.name}</Link>
                      ) : (
                        it.name
                      )}
                      {it.code ? <em> {it.code}</em> : null}
                    </span>
                    <span className="field-live__where">{it.jobLabel ?? 'No job'}</span>
                    {/* Precision, always. A ±4 m phone fix and a survey-grade shot side by side with
                        nothing to tell them apart is how somebody drafts from the wrong one. */}
                    <span className="field-live__precision">
                      {it.coords.kind === 'latlon'
                        ? `phone GPS${it.coords.accuracyM != null ? ` ±${Math.round(it.coords.accuracyM)} m` : ''}`
                        : `${it.coords.northing.toFixed(2)} N, ${it.coords.easting.toFixed(2)} E (${it.coords.unit})`}
                    </span>
                    <span className="field-live__when">
                      {whenText(it.receivedAt, now)}
                      {lag ? <em> · {lag}</em> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
