'use client';
// app/admin/cad/components/SealHashBanner.tsx
//
// Phase 7 §8.3 — seal hash-mismatch banner. Renders a sticky
// warning strip above the canvas whenever the active document
// carries a seal AND `verifyDrawingSeal` reports a hash drift
// (i.e. the document changed since the RPLS sealed it).
//
// Dismissable for the session; the next mutation re-runs the
// verifier so a freshly-edited document re-trips the banner
// even after dismiss. The "Re-seal…" CTA opens the RPLS
// review-mode panel so the surveyor can re-run Apply Seal
// after addressing the change.
//
// Verification is async (Web Crypto digest). We debounce the
// call by 250 ms so a burst of edits doesn't trigger a hash
// computation per keystroke.

import { useEffect, useState } from 'react';

import { useDrawingStore } from '@/lib/cad/store';
import { verifyDrawingSeal } from '@/lib/cad/delivery';

interface Props {
  onOpenReviewMode?: () => void;
}

interface DriftInfo {
  expected: string;
  actual:   string;
}

export default function SealHashBanner({ onOpenReviewMode }: Props) {
  const document = useDrawingStore((s) => s.document);
  const [drift, setDrift] = useState<DriftInfo | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      void (async () => {
        const result = await verifyDrawingSeal(document);
        if (cancelled) return;
        if (!result || result.ok) {
          setDrift(null);
          return;
        }
        setDrift({ expected: result.expected, actual: result.actual });
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [document]);

  // Reset the dismiss latch whenever a new actual hash lands —
  // the document has changed again, so we want the banner back.
  useEffect(() => {
    if (drift && dismissedFor && dismissedFor !== drift.actual) {
      setDismissedFor(null);
    }
  }, [drift, dismissedFor]);

  if (!drift) return null;
  if (dismissedFor === drift.actual) return null;

  return (
    <div role="status" style={styles.banner}>
      <span style={styles.icon}>⚠️</span>
      <div style={styles.body}>
        <strong style={styles.title}>
          Drawing changed since the RPLS sealed it.
        </strong>
        <span style={styles.detail}>
          Recorded hash <code>{drift.expected.slice(0, 12)}…</code> doesn&apos;t
          match current <code>{drift.actual.slice(0, 12)}…</code>. Re-seal
          before delivering.
        </span>
      </div>
      <div style={styles.actions}>
        {onOpenReviewMode ? (
          <button
            type="button"
            onClick={onOpenReviewMode}
            style={styles.btnReseal}
          >
            Open RPLS review mode
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setDismissedFor(drift.actual)}
          style={styles.btnDismiss}
          title="Dismiss for this hash; next edit re-trips the banner."
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 14px',
    background: '#FEF3C7',
    borderBottom: '1px solid #F59E0B',
    color: '#78350F',
    fontSize: 12,
  },
  icon: { fontSize: 16, lineHeight: 1 },
  body: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  title: { color: '#7C2D12' },
  detail: { fontSize: 11, color: '#92400E' },
  actions: { display: 'flex', gap: 6 },
  btnReseal: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDismiss: {
    background: 'transparent',
    border: '1px solid #B45309',
    color: '#7C2D12',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
};
