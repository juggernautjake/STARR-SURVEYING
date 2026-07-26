'use client';
// app/dnd/_ui/builder/TakeAnyway.tsx — the escape hatch, once, for every system's picker (slot plan S6).
//
// The owner's directive has two halves, and this is the second:
//
//   > "…only the correct level by level options for each class in each system are available in the
//   > builder/editor by default, but we will have buttons that the user can click to add other feats or
//   > custom stuff … maybe we have talked with our dm and he has given us permission to use a cross-class
//   > feat that we would not normally get."
//
// Before this, a refused pick was a dead end whose only advice was "build a custom character instead" —
// which throws away rules-checking on the entire sheet in order to take one feat the DM already approved.
//
// ONE component for all three systems, deliberately. The tiers and the wording are the part most likely to
// drift apart if each picker grew its own, and "the rules bind here but not there" is exactly the confusion
// the badge exists to prevent. It takes plain `{name, reason}` rows rather than any system's feat type, so
// PF2's `PF2FeatFull`, IG's bare strings and 5e's `PickerFeat` all fit without a shared content model.
import React from 'react';
import type { UnlockOffer } from '@/lib/dnd/slots/entitlement';

const LINE = 'var(--hx-line, rgba(200,170,110,0.25))';

export interface BlockedPick {
  name: string;
  /** The rules' objection, shown so the player is choosing against a known reason rather than a grey chip. */
  reason?: string;
}

export default function TakeAnyway({
  offer, blocked, taken, onTake, onUntake, noun = 'feat',
}: {
  offer: UnlockOffer;
  /** Everything the rules currently refuse, and why. */
  blocked: BlockedPick[];
  /** Names already taken through the hatch. */
  taken: string[];
  onTake: (name: string) => void;
  onUntake: (name: string) => void;
  /** What the picker is picking, for the copy ("feat", "power", "spell"). */
  noun?: string;
}) {
  const [choice, setChoice] = React.useState('');

  // REMEMBER why each pick was refused, because the moment it is taken it stops being refused.
  //
  // Found in the browser: the dropdown offered "Ancestor's Rage — Ancestor's Rage is a level-13 feat; this
  // character is level 1", and the instant it was taken the list underneath read "Ancestor's Rage — not
  // normally available". Every picker computes `blocked` by excluding what is already selected — correctly,
  // since a taken pick is no longer on offer — so looking the reason up there finds nothing once it matters
  // most. The generic fallback is exactly the failure this whole feature exists to avoid: a badge that says
  // something changed without saying what.
  //
  // A ref, not state: this is a cache of something already rendered, so writing it must not cause a render.
  const seen = React.useRef(new Map<string, string>());
  for (const b of blocked) if (b.reason) seen.current.set(b.name, b.reason);

  // Nothing to escape: a custom character was never bound, and a list with no refusals has no dead end.
  if (!offer.offered || (blocked.length === 0 && taken.length === 0)) return null;

  const reasonOf = (name: string) => blocked.find((b) => b.name === name)?.reason ?? seen.current.get(name);

  return (
    <div style={{ display: 'grid', gap: 6, border: `1px dashed ${LINE}`, borderRadius: 8, padding: '8px 10px' }}>
      {taken.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {/* Named, not counted. A badge that says something changed without saying WHAT is the same problem
              in a nicer font — the owner asked for it to "be clear that something is not the usual". */}
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--hx-gold-2, #c8aa6e)' }}>
            Taken outside the rules — {taken.length} exception{taken.length === 1 ? '' : 's'}
          </div>
          {taken.map((name) => (
            <div key={name} style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 11.5 }}>
              <span style={{ fontWeight: 600 }}>{name}</span>
              <span style={{ opacity: 0.75 }}>{reasonOf(name) ?? 'not normally available'}</span>
              <button
                type="button" onClick={() => onUntake(name)}
                style={{ marginLeft: 'auto', fontSize: 11, padding: '1px 7px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${LINE}`, background: 'none', color: 'var(--hx-text, #f0e6d2)' }}
              >Undo</button>
            </div>
          ))}
        </div>
      )}

      {blocked.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={choice} onChange={(e) => setChoice(e.target.value)}
            aria-label={`Choose a ${noun} to take anyway`}
            style={{ flex: '1 1 180px', minWidth: 0, fontSize: 11.5, padding: '4px 7px', borderRadius: 6, border: `1px solid ${LINE}`, background: 'var(--hx-inset, rgba(1,10,19,0.45))', color: 'var(--hx-text, #f0e6d2)' }}
          >
            <option value="">Add a different {noun}…</option>
            {blocked.map((b) => (
              <option key={b.name} value={b.name}>{b.name}{b.reason ? ` — ${b.reason}` : ''}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!choice}
            onClick={() => { if (choice) { onTake(choice); setChoice(''); } }}
            style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 6, cursor: choice ? 'pointer' : 'not-allowed', opacity: choice ? 1 : 0.5, border: `1px solid var(--hx-gold-1, #8a6d3b)`, background: 'none', color: 'var(--hx-text, #f0e6d2)' }}
          >{offer.label}</button>
        </div>
      )}

      <div style={{ fontSize: 11, opacity: 0.75 }}>{offer.blurb}</div>
    </div>
  );
}
