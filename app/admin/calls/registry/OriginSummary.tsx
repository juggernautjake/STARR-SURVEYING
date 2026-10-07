'use client';
// app/admin/calls/registry/OriginSummary.tsx — where the calls come from, and what they turned out to be.
//
// Owner, 2026-10-06: "We need to check area codes and determine where the calls are from, and if
// they are some kind of 1-800 number that is likely spam. This might help us understand if the
// silent calls were more likely real people or not."
//
// The first time this table was read it answered that outright: every one of the 20 silent calls
// came from four out-of-state numbers, three of which also played robocall recordings; Texas
// numbers made 29 real calls and not one silent one. It is built from the catalogue rows the page
// already loaded (counts per number, place per number), so it costs no extra request.
import { useMemo, useState } from 'react';
import type { RegistryEntry } from '@/lib/receptionist/registry';

interface Row { place: string; numbers: number; calls: number; real: number; silent: number; robocall: number; spam: number; other: number }

export function OriginSummary({ entries }: { entries: RegistryEntry[] }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const by = new Map<string, Row>();
    for (const e of entries) {
      const place = e.place || 'Unknown';
      const r = by.get(place) ?? { place, numbers: 0, calls: 0, real: 0, silent: 0, robocall: 0, spam: 0, other: 0 };
      const c = e.counts ?? { person: 0, silent: 0, robocall: 0, spam: 0, hangup: 0, screened: 0, blocked: 0 };
      r.numbers += 1;
      r.calls += e.timesCalled ?? 0;
      r.real += c.person;
      r.silent += c.silent;
      r.robocall += c.robocall;
      r.spam += c.spam;
      by.set(place, r);
    }
    const list = [...by.values()];
    for (const r of list) r.other = Math.max(0, r.calls - r.real - r.silent - r.robocall - r.spam);
    // Texas first (home), then by how much each place rang the line.
    return list.sort((a, b) => (a.place === 'Texas' ? -1 : b.place === 'Texas' ? 1 : b.calls - a.calls));
  }, [entries]);

  if (!rows.length) return null;
  const tx = rows.find((r) => r.place === 'Texas');
  const away = rows.filter((r) => r.place !== 'Texas');
  const sum = (k: keyof Row, list: Row[]) => list.reduce((s, r) => s + (r[k] as number), 0);

  return (
    <section className="creg__origin" data-testid="creg-origin">
      <button type="button" className="creg__originhead" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="creg__origintitle">Where calls come from</span>
        <span className="creg__originline">
          Texas: {tx ? `${tx.calls} calls, ${tx.real} real, ${tx.silent} silent` : 'none'} · Elsewhere:{' '}
          {sum('calls', away)} calls, {sum('real', away)} real, {sum('silent', away)} silent, {sum('robocall', away)} robocalls
        </span>
      </button>
      {open ? (
        <div className="creg__origintable" role="table" aria-label="Calls by where the number is from">
          <div className="creg__originrow creg__originrow--head" role="row">
            <span role="columnheader">From</span>
            <span role="columnheader">Numbers</span>
            <span role="columnheader">Calls</span>
            <span role="columnheader">Real</span>
            <span role="columnheader">Silent</span>
            <span role="columnheader">Robo</span>
            <span role="columnheader">Other</span>
          </div>
          {rows.map((r) => (
            <div key={r.place} className="creg__originrow" role="row">
              <span role="cell">{r.place}</span>
              <span role="cell">{r.numbers}</span>
              <span role="cell">{r.calls}</span>
              <span role="cell">{r.real}</span>
              <span role="cell" className={r.silent ? 'creg__originbad' : ''}>{r.silent}</span>
              <span role="cell" className={r.robocall ? 'creg__originbad' : ''}>{r.robocall}</span>
              <span role="cell">{r.other}</span>
            </div>
          ))}
          <p className="creg__hint">
            An area code says where a number was issued, not where the caller is — people keep their
            numbers when they move, and robocalls fake theirs. That is why origin is shown here and
            never used to screen on its own.
          </p>
        </div>
      ) : null}
    </section>
  );
}
