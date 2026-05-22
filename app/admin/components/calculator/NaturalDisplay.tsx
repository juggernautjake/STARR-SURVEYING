// app/admin/components/calculator/NaturalDisplay.tsx
//
// Casio-style "natural display" renderer for the fx-991ES PLUS family.
// C-12 of EXAM_CALCULATORS.md.
//
// Takes a linear expression string (the calculator's entry buffer in
// engine notation, e.g. `sqrt(3^2+4^2)`) and produces a React tree that
// stacks the expression visually: superscript exponents, vinculum-marked
// square roots, and stacked fractions for the `frac{num}{den}` construct
// the Casio engine emits.
//
// Implementation is intentionally a heuristic renderer, not a full parser
// — it handles the three most-common natural-display patterns. Edge
// cases not covered fall back to inline text so the user can still see
// their input even if the visual stacking degrades.

'use client';

import { Fragment, type ReactNode } from 'react';

interface NaturalDisplayProps {
  /** Linear expression, e.g. `sqrt(3^2+4^2)` or `frac{1}{2}+pi`. */
  expression: string;
  /** Result string (already-formatted by the engine). */
  result?: string;
  /** Status badges across the top — DEG/RAD, FIX, etc. */
  statusBadges?: string[];
  onCopyResult?: () => void;
}

export function NaturalDisplay({ expression, result, statusBadges, onCopyResult }: NaturalDisplayProps) {
  return (
    <div className="calc-natural" role="region" aria-label="Calculator display">
      <div className="calc-natural__status">
        {(statusBadges ?? []).map(b => (
          <span key={b} className="calc-natural__badge">{b}</span>
        ))}
      </div>
      <div className="calc-natural__entry">
        {renderExpression(expression || ' ')}
      </div>
      <div className="calc-natural__result-row">
        <span className="calc-natural__result">{result || '0'}</span>
        {onCopyResult && (
          <button
            type="button"
            className="calc-natural__copy"
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

// ── Renderer ────────────────────────────────────────────────────────────────
// Strategy: scan left-to-right; on hitting a recognized prefix
// ("sqrt(", "frac{", or `^` after a previous token), consume the matching
// region and emit the stacked-visual element. Anything else is plain text.

function renderExpression(src: string): ReactNode {
  const nodes: ReactNode[] = [];
  let i = 0;
  let plain = '';

  function flushPlain() {
    if (plain) { nodes.push(<Fragment key={`p${i}`}>{plain}</Fragment>); plain = ''; }
  }

  while (i < src.length) {
    // sqrt(...) with matched paren depth
    if (src.startsWith('sqrt(', i)) {
      flushPlain();
      const close = findMatching(src, i + 4, '(', ')');
      if (close > 0) {
        const inner = src.slice(i + 5, close);
        nodes.push(
          <span key={`sq${i}`} className="calc-natural__sqrt">
            <span className="calc-natural__sqrt-sign" aria-hidden="true">√</span>
            <span className="calc-natural__sqrt-body">{renderExpression(inner)}</span>
          </span>
        );
        i = close + 1;
        continue;
      }
    }

    // frac{num}{den} — engine emits this when a fraction is on the buffer
    if (src.startsWith('frac{', i)) {
      flushPlain();
      const numEnd = findMatching(src, i + 4, '{', '}');
      if (numEnd > 0 && src[numEnd + 1] === '{') {
        const denEnd = findMatching(src, numEnd + 1, '{', '}');
        if (denEnd > 0) {
          const num = src.slice(i + 5, numEnd);
          const den = src.slice(numEnd + 2, denEnd);
          nodes.push(
            <span key={`fr${i}`} className="calc-natural__frac">
              <span className="calc-natural__frac-num">{renderExpression(num)}</span>
              <span className="calc-natural__frac-den">{renderExpression(den)}</span>
            </span>
          );
          i = denEnd + 1;
          continue;
        }
      }
    }

    // `^...` superscript exponent. Consume one expression term: either
    // a parenthesized group or a run of digits / single letter.
    if (src[i] === '^' && nodes.length + plain.length > 0) {
      flushPlain();
      let j = i + 1;
      let exp: string;
      if (src[j] === '(') {
        const close = findMatching(src, j, '(', ')');
        if (close > 0) {
          exp = src.slice(j + 1, close);
          j = close + 1;
        } else { exp = src.slice(j); j = src.length; }
      } else {
        const start = j;
        while (j < src.length && /[0-9a-zA-Z.]/.test(src[j])) j++;
        exp = src.slice(start, j);
        if (!exp) { plain += src[i]; i++; continue; }
      }
      nodes.push(<sup key={`sup${i}`} className="calc-natural__sup">{renderExpression(exp)}</sup>);
      i = j;
      continue;
    }

    // Default: append to the plain run.
    plain += src[i];
    i++;
  }
  flushPlain();
  return <>{nodes}</>;
}

/** Given the index of an opening bracket, return the index of the matching
 *  closer at the same depth, or -1 if unmatched. */
function findMatching(src: string, openIdx: number, open: string, close: string): number {
  if (src[openIdx] !== open) return -1;
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
