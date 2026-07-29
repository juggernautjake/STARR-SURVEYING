'use client';
// RequestsNavLink — the header's link to the requests board, with an unreviewed count (P4-2, audit D-3).
//
// `/dnd/suggestions` was linked from exactly one place: a "View all suggestions →" anchor inside the
// `SuggestionBox` footer control. So the board that collects every player's requests was reachable only by
// someone already looking at the box that submits them.
//
// THE BADGE IS OWNER-ONLY, and that decision lives on the SERVER (`?count=1` returns 0 to everyone else).
// A player shown "12" on a board they cannot action is being handed a number they can do nothing with; the
// owner is the only person for whom it is a to-do list. Doing it server-side rather than by hiding the
// badge here means a non-owner never receives the count at all.
import { useEffect, useState } from 'react';

export default function RequestsNavLink({ className, onNavigate }: {
  className?: string;
  onNavigate?: () => void;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dnd/suggestions?count=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && typeof j?.count === 'number') setCount(j.count); })
      // Silent. The header must render even when the board's table does not exist — this is navigation, and
      // a nav item that errors is worse than one with no badge.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <a href="/dnd/suggestions" className={className} onClick={onNavigate}>
      Requests
      {count > 0 && (
        <span
          // The count is decoration for anyone scanning; the accessible name carries the meaning, so a
          // screen reader hears "Requests, 3 unreviewed" rather than "Requests 3".
          aria-label={`${count} unreviewed`}
          style={{
            marginLeft: 6, padding: '0 6px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            // `--hx-navy-0`, not an invented `--hx-void`: the token guard caught me referencing a name
            // that does not exist anywhere in the palette. A `var()` with a fallback fails SILENTLY — the
            // badge would have rendered in the fallback colour forever and looked deliberate, which is
            // exactly why that test sweeps for undefined tokens rather than trusting the fallback.
            background: 'var(--hx-gold-2, #c8aa6e)', color: 'var(--hx-navy-0, #010a13)',
          }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </a>
  );
}
