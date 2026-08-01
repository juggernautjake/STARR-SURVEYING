'use client';
// app/dnd/_ui/maps/LiveMap.tsx — everyone at the table sees the same board (M7-3).
//
// M7-3: *"Token moves, reveals and trigger effects broadcast to everyone at the table"*, with P7-4's
// folded-in note that presence, late-joiner full state and reconnect-after-sleep are first-class rather
// than polish.
//
// ── IT REFRESHES THE SERVER RENDER, IT DOES NOT MIRROR STATE ───────────────────────────────────────
//
// The world page is a server component, and everything on it — the G3 query split, the fog holes, the
// terrain costs, the token portraits — is computed there. A client-side mirror would be a second
// implementation of all of it, and the first thing to drift would be the one that decides what a player
// may see. `router.refresh()` re-runs the SAME render for this viewer, so a late joiner and a reconnect
// need no special case: their next refresh IS full state, computed by the code that owns the rules.
//
// ── THREE THINGS THAT MAKE POLLING BEHAVE ──────────────────────────────────────────────────────────
//
//  1. **Nothing polls a hidden tab.** `document.hidden` is checked every tick, so a DM with twelve tabs
//     open is not re-rendering twelve maps. This is also what fixes reconnect-after-sleep: a laptop that
//     wakes fires `visibilitychange`, and the map refreshes immediately rather than at the next tick.
//  2. **Nothing refreshes while a control is focused.** A `router.refresh()` mid-typing replaces the
//     server-rendered tree under an input and can drop a keystroke — and the DM authoring a description
//     is the one person guaranteed to be typing on this page.
//  3. **A refresh that is still in flight is not started again.** On a slow connection the interval
//     would otherwise stack requests, and a page that gets slower the worse the network is is the exact
//     opposite of what a table needs.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Fast enough that a moved token feels shared, slow enough to be free on a phone. */
const TICK_MS = 4000;

export default function LiveMap({ label = 'This map updates for everyone at the table.' }: { label?: string }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;

    const tick = () => {
      if (document.hidden || inFlight.current) return;
      // A control with focus means someone is mid-interaction. `router.refresh()` swaps the tree under
      // them; skipping a tick costs four seconds and skipping the check costs a keystroke.
      const active = document.activeElement;
      if (active && active !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
      inFlight.current = true;
      router.refresh();
      // `router.refresh()` returns void, so there is nothing to await. The flag clears on a timer that is
      // deliberately shorter than the tick: it is a guard against stacking, not a lock.
      window.setTimeout(() => { inFlight.current = false; }, TICK_MS / 2);
    };

    const id = window.setInterval(tick, TICK_MS);
    // On wake, and on coming back to the tab, refresh AT ONCE rather than waiting out the interval —
    // this is the reconnect-after-sleep case, and four seconds of a stale board is four seconds of a DM
    // describing something the party cannot see.
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [router, paused]);

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5 }}>
      <span style={{ color: paused ? 'var(--hx-muted)' : 'var(--hx-teal-1)' }} data-testid="live-map-status">
        <span aria-hidden>{paused ? '⏸' : '◉'}</span> {paused ? 'Live updates paused.' : label}
      </span>
      {/* A DM staging a scene needs the board to hold still — placing eight tokens while the page
          re-renders under you is the reason "staged privately and published" is in the plan at all. This
          is the small version of that: stop the world for a minute. */}
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        style={{
          background: 'none', border: '1px solid var(--hx-line)', color: 'var(--hx-muted)',
          cursor: 'pointer', minHeight: 44, padding: '0 10px', fontSize: 11.5,
        }}
      >
        {paused ? 'Resume live updates' : 'Pause while I set up'}
      </button>
    </div>
  );
}
