'use client';
// app/dnd/_ui/ConditionText.tsx — rules prose with every condition explained in place.
//
// OWNER, 2026-07-30: *"whenever there is a condition mentioned … it is bold and in a slightly different
// colour so that the user can hover over it and a tooltip will give him the information about that
// condition."*
//
// The matching lives in `lib/dnd/conditions/annotate.ts` — pure, system-scoped and tested. This is the
// loop that renders its segments, and it is deliberately thin: the bugs in a feature like this are
// "Blinded fired inside Blindedness" and "the tooltip explained 5e's Frightened on a Pathfinder sheet",
// both of which are assertable without a DOM.
//
// WHY `Tip` RATHER THAN `title`. A native tooltip needs a second of steady hover, is mouse-only, and never
// fires on touch — so at the table, on the tablet this is actually read on, the explanation would simply
// not exist. `Tip` is reachable by hover, keyboard focus and tap, and dismissable with Escape. That
// reasoning is already written down in `Tip.tsx`; this is the surface that most needs it, because a
// condition name is a word in a sentence rather than a marker someone is hunting for.
import { Fragment } from 'react';
import Tip from './Tip';
import { annotateConditions, conditionTooltip, isMatch } from '@/lib/dnd/conditions/annotate';

export default function ConditionText({
  text,
  system,
}: {
  text: string;
  /** The system whose conditions apply. A wrong one explains the wrong rule, so callers pass the
   *  creature's or character's own system rather than a default. */
  system: string | null | undefined;
}) {
  const segments = annotateConditions(text, system);

  // Nothing matched: render the string itself, not a wrapper full of fragments. Most prose has no
  // condition in it, and this component is called once per stat-block entry on a page with dozens.
  if (!segments.some(isMatch)) return <>{text}</>;

  return (
    <>
      {segments.map((s, i) =>
        isMatch(s) ? (
          <Tip
            key={i}
            bare
            tip={conditionTooltip(s)}
            label={`What ${s.text} means`}
            // The condition word IS the trigger — bold and tinted, per the ask. A dotted underline says
            // "there is more here" to a reader who is not moving a mouse, which colour alone does not:
            // colour is invisible to a chunk of readers and absent from a printed sheet.
            glyph={
              <strong
                style={{
                  color: 'var(--hx-teal-1, #6ee0cf)',
                  textDecoration: 'underline dotted',
                  textUnderlineOffset: 3,
                  cursor: 'help',
                }}
              >
                {s.text}
              </strong>
            }
          />
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}
