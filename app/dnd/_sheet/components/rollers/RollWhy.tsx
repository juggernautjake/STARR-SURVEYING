'use client';
// RollWhy — "why is this number what it is?" (RO-11).
//
// OWNER, 2026-07-28: *"Make sure to have tool tips or something that come along with the dice roller to
// explain exactly why certain things are added and where certain bonuses/buffs/penalties/debuffs are coming
// from. We should be able to see the fully explained breakdown of a given roll with any system and any
// template if we want."*
//
// ONE COMPONENT, MOUNTED BY ALL FOUR ROLLERS, because the alternative is four explanations that drift. The
// Sigil Stack, Roll Board and Impact each already rendered `boosts`/`penalties` in their own idiom — and
// **Dice Core, the DEFAULT template, rendered none of it at all**. So the promise "any system and any
// template" was already false on the template most people use.
//
// WHAT IT SHOWS, in the order a player asks it:
//   1. the arithmetic (`breakdown`) — what was rolled and added,
//   2. the named sources (`boosts` / `penalties`) — WHERE each adjustment came from,
//   3. the context (`tag`) — the DC and degree of success, when the system supplies one.
//
// It renders NOTHING when there is nothing to explain, so a plain d6 off the dice pad does not grow an
// empty "sources" box.
import { useState } from 'react';
import './rollWhy.css';

export interface RollWhyEntry {
  breakdown?: string;
  boosts?: string[];
  penalties?: string[];
  tag?: string;
}

export default function RollWhy({ entry, open: openProp }: {
  entry: RollWhyEntry | null | undefined;
  /** Force it open — used by rollers that already give the breakdown a permanent home. */
  open?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!entry) return null;

  const boosts = entry.boosts ?? [];
  const penalties = entry.penalties ?? [];
  const hasSources = boosts.length > 0 || penalties.length > 0;
  // The breakdown alone is not worth a disclosure — every roller already prints it. This earns its place
  // only when there are NAMED sources or a system tag to reveal.
  if (!hasSources && !entry.tag) return null;

  const shown = openProp || open;

  return (
    <div className="rw">
      {!openProp && (
        <button
          type="button"
          className="rw-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={shown}
          // The accessible name says what it does; the visible glyph keeps the roller uncluttered.
          aria-label={shown ? 'Hide why this roll came out this way' : 'Explain why this roll came out this way'}
          title="Where did this number come from?"
        >
          <span aria-hidden>{shown ? '▾' : '▸'}</span> why?
        </button>
      )}

      {shown && (
        <div className="rw-body">
          {entry.breakdown && <div className="rw-line rw-math">{entry.breakdown}</div>}

          {boosts.map((b, i) => (
            // ▲ / ▼ rather than colour alone — the same reason the tray uses them: a red/green-only
            // distinction is invisible to a meaningful share of players.
            <div key={`b${i}`} className="rw-line rw-boost"><span aria-hidden>▲</span> {b}</div>
          ))}
          {penalties.map((p, i) => (
            <div key={`p${i}`} className="rw-line rw-penalty"><span aria-hidden>▼</span> {p}</div>
          ))}

          {entry.tag && <div className="rw-line rw-tag">{entry.tag}</div>}
        </div>
      )}
    </div>
  );
}
