'use client';
// app/admin/error-log/ErrorBudgetBanner.tsx — "is this normal?", answered before the list (E1-3).
//
// The analysis asks *"is anyone looking at it, and does anything alert?"* — and the honest answer for the
// viewer below this banner was: it shows you every error, and leaves you to work out whether that is a
// lot. A raw list cannot answer the only question worth asking on arrival.
//
// So the first thing on the page is the CHANGE. Forty errors a week, steady, is a known quantity; forty
// against six is a deploy that broke something, and only one of those is worth anyone's afternoon.
import { useEffect, useState } from 'react';

interface Budget {
  windowDays: number;
  total: number;
  unresolved: number;
  loud: number;
  previousTotal: number;
  change: number;
  spiking: boolean;
  topRoutes: Array<{ route: string; count: number }>;
}

export default function ErrorBudgetBanner(): React.ReactElement | null {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [note, setNote] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/admin/errors/budget')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) { setBudget(j.budget ?? null); setNote(j.note ?? ''); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed) {
    return (
      <p role="alert" data-testid="error-budget-failed" style={{ margin: '0 0 12px' }}>
        Could not load the error budget — the list below is still accurate, but the &ldquo;is this
        normal?&rdquo; comparison is not available.
      </p>
    );
  }
  if (!budget) return null;

  return (
    <section
      data-testid="error-budget"
      data-spiking={budget.spiking ? 'true' : 'false'}
      style={{
        margin: '0 0 14px', padding: '10px 14px', borderRadius: 8,
        // `--border-light` is the token this design system actually defines; `--color-border` was only
        // ever somebody's fallback, so a bare `var(--color-border)` would have resolved to nothing and
        // rendered no border at all. Checked against `app/styles/tokens.css` rather than assumed.
        border: budget.spiking ? '1px solid var(--color-error)' : 'var(--border-light)',
        // A tint of the error token rather than a hex of it: `color-mix` keeps the wash following the
        // theme, which a literal rgba() cannot do — and an inline hex cannot be reached by a contrast
        // audit or the print stylesheet either, which is what the ratchet is about.
        background: budget.spiking ? 'color-mix(in srgb, var(--color-error) 6%, transparent)' : 'transparent',
      }}
    >
      <strong style={{ color: budget.spiking ? 'var(--color-error)' : undefined }}>
        {/* The sentence is built SERVER-SIDE, so the API and this banner cannot word the same numbers two
            different ways — the same rule the reconciliation report and the follow-up queue follow. */}
        {note}
      </strong>
      {budget.loud > 0 && (
        <div style={{ fontSize: 13, marginTop: 2 }}>
          {budget.loud} of them are high-severity.
        </div>
      )}
      {budget.topRoutes.length > 0 && (
        <div style={{ fontSize: 13, marginTop: 4, color: 'var(--color-text-muted)' }}>
          {/* Grouped by route, because ten stack traces from one broken endpoint are ONE problem and a
              list keyed on the message shows them as ten. */}
          Mostly:{' '}
          {budget.topRoutes.map((r) => `${r.route} (${r.count})`).join(', ')}
        </div>
      )}
    </section>
  );
}
