'use client';
// app/admin/availability/AvailabilityClient.tsx — one day, three resources, one answer (§2.4).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Users, Package, Truck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { DayResourceRow, DaySummary } from '@/lib/scheduling/day-availability';

interface DayResponse extends DaySummary {
  date: string;
  timezone: string;
  window: { from: string; to: string };
  degraded: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD by whole days without going through a Date's local timezone — which would
 *  move the date by one either side of midnight for half the world. */
function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function ResourceColumn({
  title,
  icon,
  rows,
  free,
  total,
  emptyText,
  showBlocked,
}: {
  title: string;
  icon: React.ReactNode;
  rows: DayResourceRow[];
  free: number;
  total: number;
  emptyText: string;
  showBlocked: boolean;
}) {
  const shown = showBlocked ? rows : rows.filter((r) => r.free);
  return (
    <section className="avail__col">
      <header className="avail__col-head">
        <h2 className="avail__col-title">{icon} {title}</h2>
        <span className="avail__col-count">
          {total === 0 ? '—' : `${free} of ${total} free`}
        </span>
      </header>
      {total === 0 ? (
        <p className="avail__empty">{emptyText}</p>
      ) : shown.length === 0 ? (
        <p className="avail__empty">Nothing here is free that day.</p>
      ) : (
        <ul className="avail__list">
          {shown.map((r) => (
            <li key={r.id} className={`avail__row${r.free ? '' : ' avail__row--blocked'}`}>
              <span className="avail__row-head">
                {r.free ? <CheckCircle2 size={13} aria-hidden /> : <AlertTriangle size={13} aria-hidden />}
                {r.href ? <Link href={r.href}>{r.label}</Link> : r.label}
                {r.sublabel ? <em>{r.sublabel}</em> : null}
              </span>
              {/* The reason, verbatim from the engine that made the decision. Rewriting it here
                  would produce a second vocabulary for the same refusal — and the reserve button
                  will quote the engine's. */}
              {r.blockers.map((b) => <span key={b} className="avail__why">{b}</span>)}
              {r.warnings.map((w) => <span key={w} className="avail__warn">{w}</span>)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AvailabilityClient() {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DayResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'failed' | 'forbidden'>('loading');
  const [showBlocked, setShowBlocked] = useState(true);

  const load = useCallback(async (d: string) => {
    setState('loading');
    try {
      const res = await fetch(`/api/admin/availability?date=${encodeURIComponent(d)}`);
      if (res.status === 403) { setState('forbidden'); return; }
      if (!res.ok) { setState('failed'); return; }
      setData((await res.json()) as DayResponse);
      setState('ok');
    } catch { setState('failed'); }
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  return (
    <div className="avail">
      <header className="avail__head">
        <div>
          <h1 className="avail__title"><CalendarClock size={19} aria-hidden /> Availability</h1>
          <p className="avail__sub">
            Who and what can go out on one day — crew, equipment and vehicles together. The reasons
            come from the same checks the booking screens enforce, so nothing shown free here is
            refused when you go to reserve it.
          </p>
        </div>
        <div className="avail__datebar">
          <button type="button" onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="Previous day">‹</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} aria-label="Date" />
          <button type="button" onClick={() => setDate((d) => shiftDate(d, 1))} aria-label="Next day">›</button>
          <button type="button" className="avail__today" onClick={() => setDate(today())}>Today</button>
        </div>
      </header>

      <label className="avail__toggle">
        <input type="checkbox" checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)} />
        {/* On by default. "Jacob has the cert but is on Job #422" is the second thing a dispatcher
            needs, and a page that hides it teaches them to go and check elsewhere anyway. */}
        Show what is committed, and why
      </label>

      {state === 'loading' ? (
        <p className="avail__note">Checking the day…</p>
      ) : state === 'forbidden' ? (
        <p className="avail__note avail__note--bad">
          Dispatch availability is limited to admins, tech support and equipment managers.
        </p>
      ) : state === 'failed' ? (
        <p className="avail__note avail__note--bad">
          The day could not be read. This is not “everything is free”.
        </p>
      ) : data ? (
        <>
          {data.degraded.length > 0 ? (
            <p className="avail__note avail__note--bad">
              <AlertTriangle size={13} aria-hidden /> {data.degraded.join(' ')} The columns below are
              incomplete — treat a missing name as unknown, not as available.
            </p>
          ) : null}
          <p className="avail__window">
            {new Date(`${data.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}midnight to midnight, {data.timezone.replace('_', ' ')}
          </p>
          <div className="avail__cols">
            <ResourceColumn
              title="Crew" icon={<Users size={15} aria-hidden />} rows={data.crew}
              free={data.counts.crewFree} total={data.counts.crewTotal} showBlocked={showBlocked}
              emptyText="No people are registered yet."
            />
            <ResourceColumn
              title="Equipment" icon={<Package size={15} aria-hidden />} rows={data.equipment}
              free={data.counts.equipmentFree} total={data.counts.equipmentTotal} showBlocked={showBlocked}
              emptyText="No equipment is in the inventory yet."
            />
            <ResourceColumn
              title="Vehicles" icon={<Truck size={15} aria-hidden />} rows={data.vehicles}
              free={data.counts.vehiclesFree} total={data.counts.vehiclesTotal} showBlocked={showBlocked}
              emptyText="No vehicles are in the fleet yet."
            />
          </div>
          {/* Said out loud rather than left for a dispatcher to discover the hard way. Nothing in
              the schema records "Hank has Truck 3 on Thursday", so this column can only rule a
              vehicle out, never confirm somebody else is not already taking it. */}
          <p className="avail__caveat">
            Vehicles are checked against the fleet list and their registration, inspection and
            insurance dates. Day-by-day vehicle booking does not exist yet, so a truck shown as free
            is one that <em>can</em> go out — not one nobody else has claimed.
          </p>
          <p className="avail__links">
            Planning across days instead? <Link href="/admin/calendar">Job calendar</Link>{' · '}
            <Link href="/admin/personnel/crew-calendar">Crew calendar</Link>{' · '}
            <Link href="/admin/equipment/timeline">Equipment timeline</Link>{' · '}
            <Link href="/admin/time-off">Time off</Link>
          </p>
        </>
      ) : null}
    </div>
  );
}
