'use client';

// app/admin/research/components/ScopeNotice.tsx — what coverage says about this property (Phase S3).
//
// ── WHY THIS IS SEPARATE FROM `CountyNote` ──────────────────────────────────────────────────────
//
// They look alike and answer different questions, and merging them would break the better one.
//
// `CountyNote` asks *"is this string a Texas county?"* while somebody is typing, and it deliberately
// never blocks — a form that refuses at "Bel" teaches people to fight it. That reasoning is right
// and is preserved.
//
// This asks *"can we research this property, and what will it cost?"*, which is a decision the
// operator has to make BEFORE clicking, not a spelling hint. Folding a decision into a typing hint
// would mean either the hint starts blocking or the decision stops being one.
//
// ── FOUR VERDICTS, THREE TREATMENTS ─────────────────────────────────────────────────────────────
//
//   supported     nothing to say — a green tick beside a form is noise
//   degraded      amber. Runnable, and it charges. The price is the message.
//   unavailable   red. A Texas county with no online records system.
//   out-of-scope  red. The one the owner asked for: a state we have not built.
//
// `unknown` renders nothing. A blank form is not a problem to report at somebody.
//
// ── COLOUR IS NEVER THE SIGNAL ──────────────────────────────────────────────────────────────────
//
// Each treatment carries a word — "Cannot run" / "Extra cost" — because red and amber say nothing
// to a reader who cannot tell them apart, and this is a decision about money and about whether a
// job can proceed.

import React from 'react';
import './ScopeNotice.css';
import type { ScopeResult } from '@/lib/research/scope';

export interface ScopeNoticeProps {
  scope: ScopeResult;
  /** Unique per instance — the run button's `aria-describedby` target. */
  id: string;
}

/** The heading word for each verdict. `null` means render nothing. */
export function scopeLabel(verdict: ScopeResult['verdict']): string | null {
  switch (verdict) {
    case 'out-of-scope':
    case 'unavailable':
      return 'Cannot run';
    case 'degraded':
      return 'Extra cost';
    default:
      return null;
  }
}

/** The `aria-describedby` value — `undefined` when there is no notice to point at. */
export function scopeDescribedBy(scope: ScopeResult, id: string): string | undefined {
  return scopeLabel(scope.verdict) ? id : undefined;
}

export default function ScopeNotice({ scope, id }: ScopeNoticeProps) {
  const label = scopeLabel(scope.verdict);
  if (!label) return null;

  const tone = scope.canRun ? 'warn' : 'block';

  return (
    <div
      className={`research-scope-notice research-scope-notice--${tone}`}
      id={id}
      role={scope.canRun ? 'status' : 'alert'}
    >
      <span className="research-scope-notice__label">{label}</span>
      <span className="research-scope-notice__body">
        {scope.message}
        {scope.nextStep && <> {scope.nextStep}</>}
      </span>
    </div>
  );
}
