'use client';
// app/dnd/_ui/SessionRsvp.tsx — "are you coming?" (P3-5).
//
// Sits on the campaign hub's next-session banner, because that is where the question is actually asked: a
// player who has just read *when* the session is, is exactly the person who can answer whether they will be
// there. Putting this inside the session console instead would mean only the DM ever saw it.
//
// Everyone answers for themselves — the route takes no user id, so the control cannot RSVP on anyone else's
// behalf and needs no permission logic beyond membership.
import { useCallback, useEffect, useState } from 'react';
import styles from './hextech.module.css';
import { RSVP_LABELS, RSVP_STATUSES, summarizeRsvps, type RsvpStatus, type RsvpTally } from '@/lib/dnd/rsvp';

export default function SessionRsvp({ sessionId }: { sessionId: string }) {
  const [mine, setMine] = useState<RsvpStatus | null>(null);
  const [tally, setTally] = useState<RsvpTally | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dnd/sessions/${sessionId}/rsvp`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setMine(j.mine ?? null);
        setTally(j.tally ?? null);
      })
      // Silent: the banner is still useful without the tally, and an error box on a scheduling line is noise.
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const answer = useCallback(async (status: RsvpStatus) => {
    if (busy) return;
    setBusy(true);
    // Pressing your current answer again CLEARS it — back to undecided, which is deliberately not the same
    // as answering "no". Without this there would be no way to un-answer.
    const next = mine === status ? null : status;
    try {
      const r = await fetch(`/api/dnd/sessions/${sessionId}/rsvp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setMine(j.mine ?? null); setTally(j.tally ?? null); }
    } catch { /* leave the previous answer showing rather than blanking it on a network blip */ }
    finally { setBusy(false); }
  }, [busy, mine, sessionId]);

  if (!loaded) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
      {RSVP_STATUSES.map((s) => {
        const active = mine === s;
        return (
          <button
            key={s} type="button" disabled={busy}
            // These are SIBLINGS of the banner's navigation button, not children of it — nesting them would
            // be invalid HTML and a click on "Going" would also navigate. `preventDefault` is kept only to
            // stop any enclosing form from submitting.
            onClick={(e) => { e.preventDefault(); void answer(s); }}
            title={active ? 'Press again to clear your answer' : RSVP_LABELS[s]}
            className={styles.hexBtn}
            style={{
              fontSize: 11.5, padding: '3px 10px',
              borderColor: active ? 'var(--hx-teal-1)' : 'var(--hx-line)',
              color: active ? 'var(--hx-teal-1)' : 'var(--hx-muted)',
              background: active ? 'rgba(var(--hx-teal-1-rgb),0.12)' : 'transparent',
            }}
          >
            {RSVP_LABELS[s]}
          </button>
        );
      })}
      {tally && <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>{summarizeRsvps(tally)}</span>}
    </div>
  );
}
