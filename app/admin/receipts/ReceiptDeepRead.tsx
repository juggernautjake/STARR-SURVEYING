'use client';
// app/admin/receipts/ReceiptDeepRead.tsx — the thorough read, and what it disagreed with.
//
// Owner, 2026-08-18: *"For any discrepancies, then we can have warnings and stuff to let the
// reviewer know that there is a discrepancy."*
//
// ── THE DISAGREEMENTS ARE THE POINT OF THIS PANEL ───────────────────────────────────────────────
//
// The deep reader reads the same receipt nine ways. Everything it agrees with itself about is
// already in the fields above and needs no special treatment. What belongs here is the residue — the
// places where two independent looks at the same paper produced different answers, which is the one
// signal a single confident reading can never give you.
//
// So a clean receipt shows one line and stops. A banner that is always present stops being read.

import { useCallback, useState } from 'react';
import { AlertTriangle, Check, FileSearch, Loader2, MapPin, ScrollText } from 'lucide-react';
import { summariseDiscrepancies } from '@/lib/receipts/deep-merge';

export interface Discrepancy {
  code: string;
  field?: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  readings?: { source: string; value: string }[];
}

export interface DeepReadPayload {
  summary: string | null;
  discrepancies: Discrepancy[];
  transcript: string[];
  vendorCheck?: { status: string; detail: string } | null;
  bandCount?: number;
  totalMs?: number;
  costCents?: number;
}

export function ReceiptDeepRead({
  receiptId,
  initial,
  onDone,
}: {
  receiptId: string;
  /** What a previous run stored on the row, so the panel is populated before anybody presses
   *  anything — the evidence outlives the request that produced it. */
  initial?: DeepReadPayload | null;
  onDone?: () => void;
}) {
  const [data, setData] = useState<DeepReadPayload | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/receipts/${receiptId}/deep-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j?.error ?? `The deep read failed (HTTP ${res.status}).`);
        return;
      }
      setData(j.result ?? null);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The deep read could not be started.');
    } finally {
      setBusy(false);
    }
  }, [receiptId, onDone]);

  const high = data?.discrepancies.filter((d) => d.severity === 'high') ?? [];
  const rest = data?.discrepancies.filter((d) => d.severity !== 'high') ?? [];

  // Derived here rather than trusted from the caller. A run that came back over the wire carries its
  // own summary; one rehydrated from the row does not, because only the discrepancies are stored —
  // and a panel that showed the banner after a fresh run but not after a reload would look broken
  // for no reason a user could name. One function, one wording, both paths.
  const summary = data ? data.summary ?? summariseDiscrepancies(data.discrepancies) : null;

  return (
    <div className="rcv__section">
      <h4 className="rcv__sectionTitle">Thorough read</h4>

      {!data && (
        <p className="rdr__blurb">
          Crops away the background, splits the receipt into strips, reads each one enlarged, checks
          the address against the real world and weighs it all up. Takes about two minutes.
        </p>
      )}

      <button type="button" className="rdr__run" onClick={() => void run()} disabled={busy}>
        {busy ? <Loader2 size={14} className="rdr__spin" /> : <FileSearch size={14} />}
        {busy ? 'Reading it properly — about two minutes…' : data ? 'Read it again' : 'Read this receipt properly'}
      </button>

      {busy && (
        // Said plainly, because a two-minute wait with no explanation reads as a hang. Naming the
        // stages also sets the expectation that this is doing more than the fast read did.
        <p className="rdr__progress">
          Finding the paper → cropping → splitting into strips → reading each strip enlarged →
          re-reading the totals and the card line → checking the address → weighing it all up.
        </p>
      )}

      {error && <p role="alert" className="rdr__error">{error}</p>}

      {data && (
        <>
          {summary
            ? (
              <p className={`rdr__summary ${high.length ? 'rdr__summary--high' : ''}`}>
                <AlertTriangle size={14} aria-hidden /> {summary}
              </p>
            )
            : (
              <p className="rdr__summary rdr__summary--clean">
                <Check size={14} aria-hidden /> Every pass agreed, and the arithmetic checks out.
              </p>
            )}

          {[...high, ...rest].map((d, i) => (
            <div key={`${d.code}-${i}`} className={`rdr__item rdr__item--${d.severity}`}>
              <p className="rdr__itemMsg">{d.message}</p>
              {d.readings && d.readings.length > 0 && (
                <ul className="rdr__readings">
                  {d.readings.map((r) => (
                    <li key={r.source}>
                      <span className="rdr__src">{r.source}</span>
                      <span className="rdr__val">{r.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {data.vendorCheck && (
            <p className={`rdr__vendor rdr__vendor--${data.vendorCheck.status}`}>
              <MapPin size={13} aria-hidden /> {data.vendorCheck.detail}
            </p>
          )}

          {data.transcript?.length > 0 && (
            <div className="rdr__transcriptWrap">
              <button
                type="button"
                className="rdr__toggle"
                onClick={() => setShowTranscript((v) => !v)}
                aria-expanded={showTranscript}
              >
                <ScrollText size={13} aria-hidden />
                {showTranscript ? 'Hide' : 'Show'} what it actually read ({data.transcript.length} lines)
              </button>
              {/* The evidence. With this on screen, "why does it think that?" is answerable by
                  looking rather than by re-running anything. */}
              {showTranscript && (
                <pre className="rdr__transcript">{data.transcript.join('\n')}</pre>
              )}
            </div>
          )}

          {(data.bandCount || data.totalMs) && (
            <p className="rdr__meta">
              {data.bandCount ? `${data.bandCount} strips` : null}
              {data.totalMs ? ` · ${(data.totalMs / 1000).toFixed(0)}s` : null}
              {typeof data.costCents === 'number' ? ` · ${(data.costCents / 100).toFixed(2)}` : null}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default ReceiptDeepRead;
