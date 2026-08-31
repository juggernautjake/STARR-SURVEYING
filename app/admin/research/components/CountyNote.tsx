'use client';

// app/admin/research/components/CountyNote.tsx — the county checker's message, once (Phase C3).
//
// ── WHY THIS IS A COMPONENT AND NOT COPIED JSX ──────────────────────────────────────────────────
//
// C2 gave the New Research Project modal an inline-validation treatment for the county field. C3
// owes the batch form the same thing — and the batch form has N rows, so copying the block would
// have meant the check existing in two places at once and then in twelve.
//
// That is precisely how this portal came to read as ninety separately authored screens: every
// screen that needed a shape reinvented it. `SectionHeader` alone exists five separate times under
// app/admin (CAD ×3, finances, SurveyPlanPanel), each subtly different. The check is the same
// question in both places, so it is one component.
//
// ── THE `id` IS NOT DECORATION ──────────────────────────────────────────────────────────────────
//
// The input points `aria-describedby` at this note. Duplicate ids would make every row's input
// describe the FIRST row's note, and a screen-reader user filling in row four would hear a warning
// about row one — confidently, and wrongly. The caller must pass a unique id per instance, which is
// why it is required rather than defaulted.

import React from 'react';
import './CountyNote.css';
import type { CountyCheck } from '@/lib/research/county-input';

export interface CountyNoteProps {
  check: CountyCheck;
  /** Unique per instance — the input's `aria-describedby` target. See above. */
  id: string;
  /** What the operator actually typed, for the "will be saved as" comparison. */
  typed: string;
  /** Clicking a suggestion fills the field. Omit to render suggestions as plain text. */
  onPick?: (county: string) => void;
}

/** Whether the field should be marked invalid. Kept here so callers cannot disagree about it. */
export function isCountyInvalid(check: CountyCheck): boolean {
  return check.kind === 'unknown' || check.kind === 'is-state';
}

/** The `aria-describedby` value — `undefined` when there is no note to point at. */
export function countyDescribedBy(check: CountyCheck, id: string): string | undefined {
  return check.kind === 'ok' || check.kind === 'empty' ? undefined : id;
}

/**
 * County is the routing key, not a label — it picks the clerk portal, and a value that matches
 * nothing routes nowhere. Warn, never block: this fires on a string somebody is halfway through
 * typing, and a form that refuses at "Bel" teaches people to fight it.
 */
export default function CountyNote({ check, id, typed, onPick }: CountyNoteProps) {
  if (check.kind === 'is-state') {
    return (
      <div className="research-county-note research-county-note--warn" id={id} role="alert">
        {check.message}
      </div>
    );
  }

  if (check.kind === 'unknown') {
    return (
      <div className="research-county-note research-county-note--warn" id={id} role="alert">
        {check.message}
        {check.suggestions.length > 0 && (
          <>
            {' '}Did you mean{' '}
            {check.suggestions.map((s, i) => (
              <span key={s}>
                {i > 0 && (i === check.suggestions.length - 1 ? ' or ' : ', ')}
                {onPick ? (
                  <button
                    type="button"
                    className="research-county-note__suggest"
                    onClick={() => onPick(s)}
                  >
                    {s}
                  </button>
                ) : (
                  <strong>{s}</strong>
                )}
              </span>
            ))}
            ?
          </>
        )}
      </div>
    );
  }

  // "Bell county" typed, "Bell" stored. Saying so beats silently changing what somebody wrote.
  if (check.kind === 'ok' && check.canonical !== typed.trim()) {
    return (
      <div className="research-county-note" id={id}>
        Will be saved as <strong>{check.canonical}</strong>.
      </div>
    );
  }

  return null;
}
