'use client';
// app/admin/people/PeopleDirectory.tsx — one directory, four filters (platform audit §2.3 / item 7).
//
// §2.3: *"That's ten routes describing one noun … the list pages become FILTERS on one directory,
// not separate pages."* The filters here are exactly the pages they replace:
//
//   Everyone   — was nothing; there was no page that showed the firm's people in one list
//   Staff      — was /admin/employees
//   In the field — was /admin/team (its entire content is one column here)
//   Contacts   — was /admin/contacts and /admin/messages/contacts
//
// The old pages still exist and still work. This is the front door, not a demolition: /admin/users
// still owns changing somebody's roles, /admin/employees/manage still owns editing their record, and
// this directory links to them rather than reimplementing them badly. What it removes is the need to
// know WHICH of the ten to open in order to find a person.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, UserRound, Circle } from 'lucide-react';
import type { PersonRow } from '@/app/api/admin/people/route';

const FILTERS = [
  { id: 'all', label: 'Everyone' },
  { id: 'staff', label: 'Staff' },
  { id: 'field', label: 'On the clock' },
  { id: 'contacts', label: 'Contacts' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export default function PeopleDirectory() {
  const [filter, setFilter] = useState<FilterId>('all');
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<PersonRow[]>([]);
  // Four states, not three. "Loading" and "there is nobody" look identical on screen and mean
  // opposite things — the mistake §1.1b, the compliance all-clear and the receivables page each
  // shipped, and the one this repo now refuses to make again.
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'failed'>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/admin/people?filter=${filter}&q=${encodeURIComponent(q)}`);
      if (!res.ok) { setStatus('failed'); return; }
      const data: { people?: PersonRow[] } = await res.json();
      setPeople(data.people ?? []);
      setStatus((data.people ?? []).length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('failed');
    }
  }, [filter, q]);

  // Debounced on the query so typing a name is not one request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="people">
      <header className="people__head">
        <h1 className="people__title">People</h1>
        <p className="people__sub">
          Everyone the firm deals with — staff and contacts — in one list.
        </p>
      </header>

      <div className="people__controls">
        <div className="people__search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email or job title…"
            aria-label="Search people"
          />
        </div>
        <div className="people__filters" role="group" aria-label="Filter people">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`people__filter${filter === f.id ? ' people__filter--on' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' ? (
        <p className="people__note">Loading…</p>
      ) : status === 'failed' ? (
        <p className="people__note people__note--bad">
          The directory could not be loaded. This is not the same as “nobody is here” — try again.
        </p>
      ) : status === 'empty' ? (
        <p className="people__note">
          {q ? `Nobody matches “${q}”.` : 'Nobody in this list yet.'}
        </p>
      ) : (
        <ul className="people__list">
          {people.map((p) => (
            <li key={`${p.kind}:${p.key}`}>
              {/* Staff get the one profile (§2.3's recommendation); a contact's record lives in the
                  CRM, which is a different object with different fields and its own page. */}
              <Link
                href={p.kind === 'staff' ? `/admin/people/${encodeURIComponent(p.key)}` : `/admin/contacts/${p.key}`}
                className="people__row"
              >
                <span className="people__avatar" aria-hidden>
                  {p.avatarUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.avatarUrl} alt="" />
                    : <UserRound size={18} />}
                </span>
                <span className="people__who">
                  <span className="people__name">
                    {p.name}
                    {p.onTheClock ? (
                      <span className="people__clock" title="Clocked in right now">
                        <Circle size={8} fill="currentColor" aria-hidden /> on the clock
                      </span>
                    ) : null}
                    {!p.active ? <span className="people__inactive">inactive</span> : null}
                  </span>
                  {p.subtitle ? <span className="people__meta">{p.subtitle}</span> : null}
                </span>
                <span className="people__contact">
                  {p.email ? <span>{p.email}</span> : null}
                  {p.phone ? <span>{p.phone}</span> : null}
                </span>
                <span className={`people__kind people__kind--${p.kind}`}>
                  {p.kind === 'staff' ? 'Staff' : 'Contact'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
