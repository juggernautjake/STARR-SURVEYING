// app/admin/components/calculator/Display.tsx
//
// Generic multi-line LCD display container for calculator emulators.
// MathPrint-style: entry on top, result on bottom, both right-aligned.
// Visual-only for C-6 — values are placeholder strings.

'use client';

interface DisplayProps {
  /** The entry buffer (what the user has typed; left side of "=").  */
  entry?: string;
  /** The last evaluated result (right side of "="). */
  result?: string;
  /** Status badges: mode flags (DEG/RAD/GRAD), 2nd, FIX, etc. */
  statusBadges?: string[];
  /** Optional click handler — bound to the modal's "copy display" action. */
  onCopyResult?: () => void;
}

export function Display({ entry, result, statusBadges, onCopyResult }: DisplayProps) {
  return (
    <div className="calc-display" role="region" aria-label="Calculator display">
      <div className="calc-display__status">
        {(statusBadges ?? []).map(badge => (
          <span key={badge} className="calc-display__badge">{badge}</span>
        ))}
      </div>
      <div className="calc-display__entry" aria-label="Entry">
        {entry || ' '}
      </div>
      <div className="calc-display__result-row">
        <span className="calc-display__result" aria-label="Result">
          {result || '0'}
        </span>
        {onCopyResult && (
          <button
            type="button"
            className="calc-display__copy"
            onClick={onCopyResult}
            title="Copy display value"
            aria-label="Copy display value"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
